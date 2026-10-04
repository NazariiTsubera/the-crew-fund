"""The one place that talks to Gemini. Everything else gets an `LLM`: the real client, or a
fake in tests. Judged endpoints never import this (tests/test_import_boundary.py).
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

# Load the API .env regardless of the directory uvicorn is launched from.
API_DIR = Path(__file__).resolve().parents[1]
load_dotenv(API_DIR / ".env")
load_dotenv()  # Environment variables always take precedence.

DEFAULT_MODEL = "gemini-3.8-flash"


RETRY_CODES = {429, 500, 502, 503, 504}
RETRY_DELAY = 1.5  # seconds; long enough for a per-minute quota bucket to start refilling

log = logging.getLogger(__name__)


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
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        client=None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        if client is None:
            from google import genai

            key = api_key or os.environ.get("GEMINI_API_KEY")
            if not key:
                raise LLMError("GEMINI_API_KEY is not set", "no Gemini key")
            client = genai.Client(api_key=key)
        self._client = client
        self._sleep = sleep
        self.model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_json_schema=schema,
            temperature=0.4,
        )
        for attempt in (1, 2):
            try:
                response = self._client.models.generate_content(
                    model=self.model, contents=prompt, config=config
                )
                return json.loads(response.text)
            except Exception as e:  # network, quota, safety block, malformed JSON
                why, retry = _classify(e)
                log.warning(
                    "gemini %s attempt %d failed: %s · %s",
                    self.model,
                    attempt,
                    why,
                    redact(str(e))[:300],
                )
                if not retry or attempt == 2:
                    raise LLMError(str(e), why) from e
                self._sleep(RETRY_DELAY)
        raise AssertionError("unreachable")


def default_llm() -> LLM:
    return GeminiClient()
