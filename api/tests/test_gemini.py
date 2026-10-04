"""The Gemini client: one retry on rate limits and server errors, and a short, redacted reason
on every failure, so a fallback answer can say why it is one."""

from types import SimpleNamespace

import pytest
from google.genai import errors

from crew.gemini import GeminiClient, LLMError, reason


def quota():
    return errors.ClientError(429, {"error": {"message": "quota ?key=SECRET", "status": "X"}})


def server():
    return errors.ServerError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}})


def bad_request():
    return errors.ClientError(400, {"error": {"message": "bad schema", "status": "INVALID"}})


class FakeModels:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def generate_content(self, **_):
        self.calls += 1
        out = self.outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return SimpleNamespace(text=out)


def client(*outcomes):
    models = FakeModels(*outcomes)
    sleeps = []
    c = GeminiClient(api_key="k", client=SimpleNamespace(models=models), sleep=sleeps.append)
    return c, models, sleeps


def test_retries_once_after_a_rate_limit():
    c, models, sleeps = client(quota(), '{"ok": 1}')
    assert c.generate_json("s", "p", {}) == {"ok": 1}
    assert models.calls == 2
    assert len(sleeps) == 1


def test_retries_once_after_a_server_error():
    c, models, _ = client(server(), '{"ok": 1}')
    assert c.generate_json("s", "p", {}) == {"ok": 1}
    assert models.calls == 2


def test_gives_up_after_the_retry_with_the_reason():
    c, models, _ = client(quota(), quota())
    with pytest.raises(LLMError) as e:
        c.generate_json("s", "p", {})
    assert models.calls == 2
    assert e.value.reason == "rate limited (429)"
    assert "SECRET" not in str(e.value)


def test_does_not_retry_a_bad_request():
    c, models, _ = client(bad_request())
    with pytest.raises(LLMError) as e:
        c.generate_json("s", "p", {})
    assert models.calls == 1
    assert e.value.reason == "Gemini error 400"


def test_malformed_json_is_its_own_reason():
    c, _, _ = client("not json")
    with pytest.raises(LLMError) as e:
        c.generate_json("s", "p", {})
    assert e.value.reason == "malformed JSON"


def test_reason_of_a_plain_error_is_its_message():
    assert reason(LLMError("no Gemini client")) == "no Gemini client"
