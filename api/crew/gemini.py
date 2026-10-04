"""The one place that talks to a language model. Everything else gets an `LLM`: the real chain,
or a fake in tests. Judged endpoints never import this (tests/test_import_boundary.py).

The chain tries OpenAI first when OPENAI_KEY (or OPENAI_API_KEY) is set, then Gemini when
GEMINI_API_KEY is set; each answer records which provider wrote it.
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from dotenv import load_dotenv

from app.redact import redact

# Load api/.env (only that file) regardless of where uvicorn starts; variables already set win.
# A bare load_dotenv() searches upward and would pick up the repo root's .env, which holds the
# production DATABASE_URL.
API_DIR = Path(__file__).resolve().parents[1]


def load_api_env() -> None:
    load_dotenv(API_DIR / ".env")


load_api_env()

DEFAULT_MODEL = "gemini-3.8-flash"
# The free tier allows 20 requests a day per model, each model counted apart; when one model's
# day is used up the client moves down this list. GEMINI_MODELS (comma-separated) overrides it.
FALLBACK_MODELS = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
]
RETRY_CODES = {429, 500, 502, 503, 504}
CALL_TIMEOUT_MS = 15_000
BUDGET_S = 25.0  # a chat answer falls back to the agent's file rather than wait longer
RETRY_DELAY = 1.5  # seconds; long enough for a per-minute quota bucket to start refilling
DAILY_QUOTA = "PerDay"

log = logging.getLogger(__name__)
# Models whose daily quota ran out in this process. A client is built per request, so this
# outlives any one of them; a restart forgets it, which costs one wasted call per model.
_EXHAUSTED: set[str] = set()


def default_models() -> list[str]:
    if os.environ.get("GEMINI_MODELS"):
        return [m.strip() for m in os.environ["GEMINI_MODELS"].split(",") if m.strip()]
    first = os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL
    return [first, *(m for m in FALLBACK_MODELS if m != first)]


def _out_for_the_day(e: Exception) -> bool:
    return getattr(e, "code", None) == 429 and DAILY_QUOTA in str(getattr(e, "details", ""))


class LLMError(RuntimeError):
    """Gemini failed, timed out or returned something that is not JSON. `reason` is a short,
    redacted label the UI may show; the message carries the detail for the logs."""

    def __init__(self, message: str, reason: str | None = None):
        super().__init__(redact(message))
        self.reason = reason or redact(message)[:80]


def reason(error: Exception) -> str:
    return getattr(error, "reason", None) or redact(str(error))[:80]


def _classify(e: Exception) -> tuple[str, bool]:
    """(reason, worth a retry)."""
    from google.genai import errors

    if isinstance(e, errors.APIError):
        if e.code == 429:
            return "rate limited (429)", True
        return f"Gemini error {e.code}", e.code in RETRY_CODES
    if isinstance(e, json.JSONDecodeError):
        return "malformed JSON", False
    if "timeout" in type(e).__name__.lower() or "timed out" in str(e).lower():
        return "timeout", True
    return type(e).__name__, False


class LLM(Protocol):
    def generate_json(self, system: str, prompt: str, schema: dict) -> dict: ...


class GeminiClient:
    provider = "gemini"

    def __init__(
        self,
        api_key: str | None = None,
        models: list[str] | None = None,
        client=None,
        sleep: Callable[[float], None] = time.sleep,
        exhausted: set[str] | None = None,
        clock: Callable[[], float] = time.monotonic,
    ):
        if client is None:
            from google import genai

            key = api_key or os.environ.get("GEMINI_API_KEY")
            if not key:
                raise LLMError("GEMINI_API_KEY is not set", "no Gemini key")
            from google.genai import types

            # Without a timeout a call on an overloaded model can hang a chat indefinitely.
            client = genai.Client(
                api_key=key, http_options=types.HttpOptions(timeout=CALL_TIMEOUT_MS)
            )
        self._client = client
        self._sleep = sleep
        self._clock = clock
        self._exhausted = _EXHAUSTED if exhausted is None else exhausted
        self.models = models or default_models()

    @property
    def model(self) -> str:
        return next((m for m in self.models if m not in self._exhausted), self.models[-1])

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_json_schema=schema,
            temperature=0.4,
        )
        last: LLMError | None = None
        started = self._clock()
        chain = [m for m in self.models if m not in self._exhausted]
        for n, model in enumerate(chain):
            for attempt in (1, 2):
                if self._clock() - started > BUDGET_S:
                    raise LLMError(
                        f"no answer within {BUDGET_S:.0f} s ({last})", "timeout"
                    ) from last
                try:
                    response = self._client.models.generate_content(
                        model=model, contents=prompt, config=config
                    )
                    return json.loads(response.text)
                except Exception as e:  # network, quota, safety block, malformed JSON
                    why, retry = _classify(e)
                    log.warning(
                        "gemini %s attempt %d failed: %s · %s",
                        model,
                        attempt,
                        why,
                        redact(str(e))[:300],
                    )
                    last = LLMError(str(e), why)
                    last.__cause__ = e
                    if _out_for_the_day(e):
                        self._exhausted.add(model)
                        break  # no point retrying today; try the next model
                    if not retry:
                        raise last from e
                    if getattr(e, "code", None) != 429 and n + 1 < len(chain):
                        break  # a busy or slow model: another one is likely free right now
                    if attempt == 1:
                        self._sleep(RETRY_DELAY)
        raise last or LLMError("every Gemini model is out of quota today", "rate limited (429)")


DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"  # newest cheap tier; ~3 s for a chat answer


class OpenAIClient:
    provider = "openai"

    def __init__(self, api_key: str | None = None, model: str | None = None, client=None):
        if client is None:
            import openai

            key = api_key or os.environ.get("OPENAI_KEY") or os.environ.get("OPENAI_API_KEY")
            if not key:
                raise LLMError("OPENAI_KEY is not set", "no OpenAI key")
            client = openai.OpenAI(api_key=key, timeout=CALL_TIMEOUT_MS / 1000, max_retries=1)
        self._client = client
        self.model = model or os.environ.get("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        # JSON mode with the schema in the prompt: our schemas use optional fields and nested
        # objects that strict structured outputs refuse.
        instructions = (
            f"{system}\n\nReply with one JSON object that follows this JSON schema exactly:\n"
            f"{json.dumps(schema)}"
        )
        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content or "")
        except Exception as e:
            code = getattr(e, "status_code", None)
            if isinstance(e, json.JSONDecodeError):
                why = "malformed JSON"
            elif code == 429:
                why = "rate limited (429)"
            elif code:
                why = f"OpenAI error {code}"
            else:
                why = type(e).__name__
            log.warning("openai %s failed: %s · %s", self.model, why, redact(str(e))[:300])
            raise LLMError(str(e), why) from e


class ChainLLM:
    """Providers in priority order; the first that answers wins. `provider` names it."""

    def __init__(self, providers: list):
        self.providers = providers
        self.provider: str | None = None

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        last: LLMError | None = None
        for p in self.providers:
            try:
                out = p.generate_json(system, prompt, schema)
                self.provider = p.provider
                return out
            except LLMError as e:
                last = e
        raise last or LLMError("no AI provider is configured", "no AI key")


def default_llm() -> LLM:
    providers: list = []
    if os.environ.get("OPENAI_KEY") or os.environ.get("OPENAI_API_KEY"):
        providers.append(OpenAIClient())
    if os.environ.get("GEMINI_API_KEY"):
        providers.append(GeminiClient())
    if not providers:
        raise LLMError("neither OPENAI_KEY nor GEMINI_API_KEY is set", "no AI key")
    return ChainLLM(providers)
