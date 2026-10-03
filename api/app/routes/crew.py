"""The crew endpoints: creating agents, reading them, talking to them. Not judged; free to
use Gemini (app.routes.judged must not, tests/test_import_boundary.py)."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.models import Agent, AgentSummary, Capital, ChatRequest, CreateAgentRequest, Fund, LogEntry
from app.services import agents, vault
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


@router.post("/agents/{agent_id}/chat")
def chat(
    agent_id: str, req: ChatRequest, llm: Annotated[Callable[[], LLM], Depends(get_llm)]
) -> dict:
    """{text, evidence, source, ts}: the agent's answer and the stored facts it cites."""
    try:
        return agents.chat(agent_id, req.message, llm)
    except agents.AgentNotFound as e:
        raise HTTPException(404, f"no agent {e}") from e


@router.get("/agents/{agent_id}/chat")
def chat_history(agent_id: str) -> list[dict]:
    try:
        return agents.chat_history(agent_id)
    except agents.AgentNotFound as e:
        raise HTTPException(404, f"no agent {e}") from e


def _found(fn, *args):
    try:
        return fn(*args)
    except vault.NotFound as e:
        raise HTTPException(404, str(e)) from e


@router.get("/vault", response_model=Fund)
def get_vault():
    """Everything the War Room's first screen shows."""
    return _found(vault.fund)


@router.get("/agents", response_model=list[AgentSummary])
def list_agents():
    return vault.agents()


@router.get("/agents/{agent_id}", response_model=Agent)
def get_agent(agent_id: str):
    return _found(vault.agent, agent_id)


@router.get("/agents/{agent_id}/log", response_model=list[LogEntry])
def agent_log(
    agent_id: str,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    type: str | None = None,  # noqa: A002 - the contract's name
):
    return _found(vault.agent_log, agent_id, month, type)


@router.get("/log", response_model=list[LogEntry])
def fund_log(limit: Annotated[int, Query(ge=1, le=500)] = 100, type: str | None = None):  # noqa: A002
    """Fund-wide log, newest first: the Live floor's replay tape."""
    return vault.fund_log(limit, type)


@router.get("/capital", response_model=Capital)
def capital(start: Annotated[str | None, Query(alias="from", pattern=r"^\d{4}-\d{2}$")] = None):
    """Monthly capital share per agent, for the "Who runs the money" scrubber."""
    return _found(vault.capital, start)
