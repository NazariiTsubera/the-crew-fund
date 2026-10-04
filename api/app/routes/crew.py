"""The crew endpoints: creating agents, reading them, talking to them. Not judged; free to
use Gemini (app.routes.judged must not, tests/test_import_boundary.py)."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import ValidationError

from app import crew_repository
from app.models import (
    Agent,
    AgentSummary,
    Capital,
    ChatRequest,
    CreateAgentFromStrategyRequest,
    CreateAgentRequest,
    Fund,
    LogEntry,
    SpeechRequest,
    StrategyChatRequest,
    WhatIfCompile,
    WhatIfCompileRequest,
    WhatIfRequest,
)
from app.services import agents, vault
from crew.gemini import LLM, LLMError, default_llm
from crew.recipe import Recipe, explain
from crew.speech import SpeechError, synthesize
from crew.strategy_chat import StrategyChatResponse, build_strategy_chat

router = APIRouter()


@router.post("/agents/strategy-chat/speech")
def strategy_chat_speech(req: SpeechRequest):
    try:
        audio = synthesize(req.text)
    except SpeechError as exc:
        raise HTTPException(503, str(exc)) from exc
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


def get_llm() -> Callable[[], LLM]:
    # A factory, so a missing key surfaces as an error event inside the stream.
    return default_llm


def _sse(events: Iterator[tuple[str, dict]]) -> Iterator[str]:
    for event, data in events:
        yield f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/agents/strategy-chat", response_model=StrategyChatResponse)
def strategy_chat_endpoint(
    req: StrategyChatRequest,
    llm: Annotated[Callable[[], LLM], Depends(get_llm)],
):
    try:
        result = build_strategy_chat(
            message=req.message,
            history=req.history,
            current=req.strategy.model_dump() if req.strategy is not None else None,
            llm=llm(),
        )
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


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
    variant = _recipe(req.whatif.model_dump()) if req.whatif else None
    draft = _recipe(req.draft.model_dump()) if req.draft else None
    try:
        return agents.chat(agent_id, req.message, llm, variant, draft)
    except agents.AgentNotFound as exc:
        raise HTTPException(404, f"no agent {exc}") from exc


def _recipe(raw: dict) -> Recipe:
    try:
        return Recipe.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(422, f"invalid recipe: {explain(exc)}") from exc


@router.post("/agents/{agent_id}/recompile")
def recompile(agent_id: str, req: WhatIfRequest):
    """Server-sent events: backtesting, redteam, then done {agent} or error. The agent keeps its
    identity and chat; its recipe, record, verdict and capital are recomputed."""
    recipe = _recipe(req.recipe.model_dump())
    if crew_repository.store().get_agent(agent_id) is None:
        raise HTTPException(404, f"no agent {agent_id}")
    return StreamingResponse(
        _sse(agents.recompile(agent_id, recipe)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/agents/{agent_id}/whatif")
def whatif(agent_id: str, req: WhatIfRequest) -> dict:
    """{recipe, kpis, curve, yearly_returns, redteam}: an edited recipe through the same
    backtest and red team as every agent. Nothing is stored."""
    try:
        return agents.whatif(agent_id, _recipe(req.recipe.model_dump()))
    except agents.AgentNotFound as exc:
        raise HTTPException(404, f"no agent {exc}") from exc


@router.post("/agents/{agent_id}/whatif/compile", response_model=WhatIfCompile)
def whatif_compile(
    agent_id: str,
    req: WhatIfCompileRequest,
    llm: Annotated[Callable[[], LLM], Depends(get_llm)],
) -> dict:
    """{reply, recipe, changed}: the AI edits the what-if draft in words. Runs nothing."""
    draft = _recipe(req.recipe.model_dump())
    try:
        return agents.whatif_compile(agent_id, req.message, draft, llm)
    except agents.AgentNotFound as exc:
        raise HTTPException(404, f"no agent {exc}") from exc
    except LLMError as exc:
        raise HTTPException(503, f"the AI is unavailable ({exc})") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/agents/{agent_id}/chat")
def chat_history(agent_id: str) -> list[dict]:
    try:
        return agents.chat_history(agent_id)
    except agents.AgentNotFound as exc:
        raise HTTPException(404, f"no agent {exc}") from exc


@router.post("/agents/from-strategy")
def create_agent_from_strategy(req: CreateAgentFromStrategyRequest):
    try:
        recipe = Recipe.model_validate(req.strategy.model_dump())
    except Exception as exc:
        raise HTTPException(400, f"invalid strategy: {exc}") from exc

    return StreamingResponse(
        _sse(
            agents.create_from_recipe(
                prompt=req.prompt,
                recipe=recipe,
                name=req.name,
                persona=req.persona,
                strategy_line=req.strategy_line,
                pitch=req.pitch,
            )
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
