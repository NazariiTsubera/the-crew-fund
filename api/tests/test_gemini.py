"""The Gemini client: one retry on rate limits and server errors, and a short, redacted reason
on every failure, so a fallback answer can say why it is one."""

from types import SimpleNamespace

import pytest
from google.genai import errors

from crew.gemini import GeminiClient, LLMError, default_models, reason


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
    c = GeminiClient(
        models=["m"], client=SimpleNamespace(models=models), sleep=sleeps.append, exhausted=set()
    )
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


def daily_quota():
    return errors.ClientError(
        429,
        {
            "error": {
                "message": "quota",
                "status": "RESOURCE_EXHAUSTED",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [
                            {"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}
                        ],
                    }
                ],
            }
        },
    )


class ModelAware(FakeModels):
    def generate_content(self, model, **_):
        self.calls += 1
        self.models = [*getattr(self, "models", []), model]
        out = self.outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return SimpleNamespace(text=out)


def test_moves_to_the_next_model_when_one_is_out_of_daily_quota():
    models = ModelAware(daily_quota(), '{"ok": 1}', '{"ok": 2}')
    c = GeminiClient(
        models=["a", "b"], client=SimpleNamespace(models=models), sleep=print, exhausted=set()
    )
    assert c.generate_json("s", "p", {}) == {"ok": 1}
    assert c.generate_json("s", "p", {}) == {"ok": 2}
    # The exhausted model is skipped from then on, without a wasted call.
    assert models.models == ["a", "b", "b"]


def test_every_model_out_of_quota_is_a_rate_limit():
    models = ModelAware(daily_quota(), daily_quota())
    c = GeminiClient(
        models=["a", "b"], client=SimpleNamespace(models=models), sleep=print, exhausted=set()
    )
    with pytest.raises(LLMError) as e:
        c.generate_json("s", "p", {})
    assert e.value.reason == "rate limited (429)"
    assert models.calls == 2


def test_the_default_chain_starts_from_gemini_model(monkeypatch):
    monkeypatch.delenv("GEMINI_MODELS", raising=False)
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.6-flash")
    chain = default_models()
    assert chain[0] == "gemini-3.6-flash" and chain.count("gemini-3.6-flash") == 1


def test_only_api_env_is_loaded_never_the_repo_root_one(monkeypatch, tmp_path):
    import os

    from crew.gemini import load_api_env

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text("DATABASE_URL=postgres://prod\n")
    load_api_env()
    assert "DATABASE_URL" not in os.environ


def test_a_busy_model_moves_on_to_the_next_without_waiting():
    models = ModelAware(server(), '{"ok": 1}')
    sleeps = []
    c = GeminiClient(
        models=["a", "b"],
        client=SimpleNamespace(models=models),
        sleep=sleeps.append,
        exhausted=set(),
    )
    assert c.generate_json("s", "p", {}) == {"ok": 1}
    assert models.models == ["a", "b"]
    assert sleeps == []


def test_stops_when_the_time_budget_is_spent():
    # Each call takes 10 s on this clock; a chat cannot wait for every model in the chain.
    now = [0.0]

    class Slow(ModelAware):
        def generate_content(self, model, **kw):
            now[0] += 10
            return super().generate_content(model=model, **kw)

    models = Slow(*[server() for _ in range(6)])
    c = GeminiClient(
        models=list("abcdef"),
        client=SimpleNamespace(models=models),
        sleep=print,
        exhausted=set(),
        clock=lambda: now[0],
    )
    with pytest.raises(LLMError) as e:
        c.generate_json("s", "p", {})
    assert models.calls <= 3
    assert e.value.reason == "timeout"


class FakeCompletions:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        out = self.outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        msg = SimpleNamespace(content=out)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


def openai_client(*outcomes):
    from crew.gemini import OpenAIClient

    completions = FakeCompletions(*outcomes)
    fake = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return OpenAIClient(client=fake, model="m"), completions


def test_openai_answers_in_json_with_the_schema_in_the_prompt():
    c, completions = openai_client('{"text": "hi"}')

    assert c.generate_json("sys", "p", {"type": "object", "required": ["text"]}) == {"text": "hi"}
    call = completions.calls[0]
    assert call["response_format"] == {"type": "json_object"}
    assert '"required": ["text"]' in call["messages"][0]["content"]


def test_openai_failures_carry_a_reason():
    c, _ = openai_client(RuntimeError("boom"))
    with pytest.raises(LLMError):
        c.generate_json("s", "p", {})
    c, _ = openai_client("not json")
    with pytest.raises(LLMError) as e:
        c.generate_json("s", "p", {})
    assert e.value.reason == "malformed JSON"


class Named:
    def __init__(self, provider, *outcomes):
        self.provider = provider
        self.outcomes = list(outcomes)

    def generate_json(self, system, prompt, schema):
        out = self.outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return out


def test_the_chain_falls_back_to_the_next_provider_and_says_which_answered():
    from crew.gemini import ChainLLM

    chain = ChainLLM([Named("openai", LLMError("down", "timeout")), Named("gemini", {"ok": 1})])

    assert chain.generate_json("s", "p", {}) == {"ok": 1}
    assert chain.provider == "gemini"


def test_the_chain_raises_the_last_reason_when_all_fail():
    from crew.gemini import ChainLLM

    chain = ChainLLM(
        [
            Named("openai", LLMError("a", "timeout")),
            Named("gemini", LLMError("b", "rate limited (429)")),
        ]
    )
    with pytest.raises(LLMError) as e:
        chain.generate_json("s", "p", {})
    assert e.value.reason == "rate limited (429)"


def test_openai_comes_first_when_its_key_is_set(monkeypatch):
    from crew import gemini

    monkeypatch.setenv("OPENAI_KEY", "sk-test")
    monkeypatch.setenv("GEMINI_API_KEY", "g-test")
    llm = gemini.default_llm()
    assert [p.provider for p in llm.providers] == ["openai", "gemini"]

    monkeypatch.delenv("OPENAI_KEY")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert [p.provider for p in gemini.default_llm().providers] == ["gemini"]
