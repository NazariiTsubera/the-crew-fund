"""Masks the data-server token. The SDK puts it in remote URLs (?key=...), and polars echoes
those URLs in its errors, so any error text we return or print goes through redact()."""

import re

_TOKEN = re.compile(r"(key=)[^&\s\]\)'\"]+")


def redact(text: str) -> str:
    return _TOKEN.sub(r"\1***", text)
