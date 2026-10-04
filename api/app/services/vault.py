"""The War Room's read side: the fund, its agents, the log and the capital history, shaped for
the web data contract (app/models.py). Every number comes from the store."""

from __future__ import annotations

from app import crew_repository


class NotFound(LookupError):
    pass


def _month_ends(curve: list[dict]) -> list[float]:
    last: dict[str, float] = {}
    for p in curve:
        last[p["date"][:7]] = p["value"]
    return [last[m] for m in sorted(last)]


def _summary(agent: dict) -> dict:
    return {**agent, "spark": _month_ends(crew_repository.store().curve(agent["id"]))}


def _latest_book(owner: str) -> tuple[str | None, list[dict]]:
    rows = crew_repository.store().holdings(owner)
    if not rows:
        return None, []
    month = max(h["month"] for h in rows)
    return month, sorted((h for h in rows if h["month"] == month), key=lambda h: -h["weight"])


def fund() -> dict:
    store = crew_repository.store()
    summary = store.latest_run("fund")
    if summary is None:
        raise NotFound("the fund has not been seeded; run scripts/seed_agents.py")
    # Only the book of the as-of month: a fund in cash holds nothing, not an older book.
    holdings = sorted(store.holdings("fund", month=summary["as_of"]), key=lambda h: -h["weight"])
    return {
        "as_of": summary["as_of"],
        "holdout_cutoff": summary["holdout_cutoff"],
        "kpis": summary["kpis"],
        "spx_kpis": summary["spx_kpis"],
        "invested_fraction": summary["invested"].get(summary["as_of"], 0.0),
        "curve": store.curve("fund"),
        "benchmark": store.curve("spx"),
        "agents": [_summary(a) for a in store.list_agents()],
        "holdings": holdings,
        "latest_memo": summary.get("latest_memo"),
    }


def agents() -> list[dict]:
    return [_summary(a) for a in crew_repository.store().list_agents()]


def agent(agent_id: str) -> dict:
    store = crew_repository.store()
    found = store.get_agent(agent_id)
    if found is None:
        raise NotFound(agent_id)
    month, book = _latest_book(agent_id)
    return {
        **_summary(found),
        "curve": store.curve(agent_id),
        "benchmark": store.curve("spx"),
        "holdings_month": month,
        "holdings": book,
    }


def agent_log(agent_id: str, month: str | None, type_: str | None) -> list[dict]:
    store = crew_repository.store()
    if store.get_agent(agent_id) is None:
        raise NotFound(agent_id)
    return store.log(agent_id=agent_id, month=month, types=[type_] if type_ else None)


def holdings_history() -> dict:
    """The fund's book for every month (the Holdings page's chart and table), oldest first."""
    by_month: dict[str, list[dict]] = {}
    for h in crew_repository.store().holdings("fund"):
        by_month.setdefault(h["month"], []).append(h)
    return {
        "months": [
            {"month": m, "holdings": sorted(rows, key=lambda h: -h["weight"])}
            for m, rows in sorted(by_month.items())
        ]
    }


def fund_log(limit: int, type_: str | None, since: str | None = None) -> list[dict]:
    types = [type_] if type_ else None
    if since is None:
        return crew_repository.store().log(types=types, limit=limit)
    rows = [e for e in crew_repository.store().log(types=types) if e["ts"] >= since]
    return sorted(rows, key=lambda e: e["ts"])[:limit][::-1]


def capital(start: str | None) -> dict:
    summary = crew_repository.store().latest_run("fund")
    if summary is None:
        raise NotFound("the fund has not been seeded")
    return {
        "months": [
            {"month": m, "shares": shares, "invested": summary["invested"].get(m, 0.0)}
            for m, shares in sorted(summary["shares"].items())
            if start is None or m >= start
        ]
    }
