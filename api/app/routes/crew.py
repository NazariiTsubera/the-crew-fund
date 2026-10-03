"""The crew endpoints: creating agents, reading them, talking to them. Not judged; free to
use Gemini (app.routes.judged must not, tests/test_import_boundary.py)."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.models import CreateAgentRequest
from app.services import agents
from crew.gemini import LLM, default_llm

router = APIRouter()


def get_llm() -> Callable[[], LLM]:
    # A factory, so a missing key surfaces as an error event inside the stream.
    return default_llm


def _sse(events: Iterator[tuple[str, dict]]) -> Iterator[str]:
    for event, data in events:
        yield f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/agents")
def create_agent(req: CreateAgentRequest, llm: Annotated[Callable[[], LLM], Depends(get_llm)]):
    """Server-sent events: compiling, backtesting, redteam, then done {agent} or error."""
    return StreamingResponse(
        _sse(agents.create(req.prompt, llm)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
