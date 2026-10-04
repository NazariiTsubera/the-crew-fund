"""The War Room's mock fixtures must be exactly what the API serves: each one validates against
the Pydantic response models, and every key it carries survives the round trip, so a field the
API does not serve (or a renamed one) fails CI."""

import json
import re
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from app import models
from crew.features import FEATURES, MARKET_WIDE

MOCK = Path(__file__).parent.parent.parent / "web" / "src" / "lib" / "mock"


def load(rel: str):
    return json.loads((MOCK / rel).read_text())


def extra_keys(data, served, path="") -> list[str]:
    """Keys present in the fixture but not in what the model serializes."""
    if isinstance(data, dict) and isinstance(served, dict):
        out = [f"{path}.{k}" for k in data if k not in served]
        for k in data.keys() & served.keys():
            out += extra_keys(data[k], served[k], f"{path}.{k}")
        return out
    if isinstance(data, list) and isinstance(served, list):
        return [e for d, s in zip(data, served, strict=False) for e in extra_keys(d, s, path)]
    return []


def check(adapter: TypeAdapter, data):
    served = json.loads(adapter.dump_json(adapter.validate_python(data)))
    assert extra_keys(data, served) == []


def test_the_vault_fixture_is_a_fund():
    check(TypeAdapter(models.Fund), load("vault.json"))


@pytest.mark.parametrize("path", sorted(p.name for p in (MOCK / "agents").glob("*.json")))
def test_each_agent_fixture_is_an_agent(path):
    data = load(f"agents/{path}")

    check(TypeAdapter(models.Agent), data)
    assert f"{data['id']}.json" == path


def test_the_log_fixture_is_log_entries():
    check(TypeAdapter(list[models.LogEntry]), load("log.json"))


def test_the_capital_fixture_is_capital():
    check(TypeAdapter(models.Capital), load("capital.json"))


def test_an_extra_field_would_fail():
    agent = {**load("agents/accountant.json"), "surprise": 1}

    with pytest.raises(AssertionError):
        check(TypeAdapter(models.Agent), agent)


def _ts_glossary() -> tuple[dict[str, str], list[str]]:
    """The web's copy of the feature glossary, read from features.ts."""
    src = (MOCK.parent / "features.ts").read_text()
    body = src.split("export const FEATURES", 1)[1].split("};", 1)[0]
    meanings = dict(re.findall(r'^\s+(\w+):\s*"([^"]*)",?$', body, re.M))
    wide = src.split("export const MARKET_WIDE", 1)[1].split("= [", 1)[1].split("]", 1)[0]
    return meanings, re.findall(r'"(\w+)"', wide)


def test_the_web_feature_glossary_is_the_compilers():
    meanings, wide = _ts_glossary()

    assert meanings == FEATURES
    assert wide == MARKET_WIDE
    assert set(MARKET_WIDE) <= set(FEATURES)
