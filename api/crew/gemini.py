"""The one place that talks to Gemini. Everything else gets an `LLM`: the real client, or a
fake in tests. Judged endpoints never import this (tests/test_import_boundary.py).
"""

from __future__ import annotations

import json
import os
from typing import Protocol

DEFAULT_MODEL = "gemini-2.5-flash"


class LLMError(RuntimeError):
    """Gemini failed, timed out or returned something that is not JSON."""


class LLM(Protocol):
    def generate_json(self, system: str, prompt: str, schema: dict) -> dict: ...


class GeminiClient:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        from google import genai

        key = api_key or os.environ.get("GEMINI_API_KEY")
        if not key:
            raise LLMError("GEMINI_API_KEY is not set")
        self._client = genai.Client(api_key=key)
        self.model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        from google.genai import types

        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    response_json_schema=schema,
                    temperature=0.4,
                ),
            )
            return json.loads(response.text)
        except Exception as e:  # network, quota, safety block, malformed JSON: all the same here
            raise LLMError(str(e)) from e


def default_llm() -> LLM:
    return GeminiClient()
