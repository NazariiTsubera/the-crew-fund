"""Where the crew's results live: agents, runs, curves, holdings, the log and chats.

One `Store` contract, two backends. `PgStore` is Tiger Data (Postgres + TimescaleDB, with
`curves` and `log` as hypertables when the extension is there). `JsonStore` is one JSON file for
tests and offline demos. `open_store()` picks Postgres when DATABASE_URL answers, else the file,
so a dead database never takes the War Room down.

Rows cross the boundary as plain dicts with ISO strings: dates "YYYY-MM-DD", months "YYYY-MM",
log/chat timestamps "YYYY-MM-DD HH:MM".
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Protocol

log = logging.getLogger(__name__)

DEFAULT_JSON_PATH = Path(__file__).parent.parent / "cache" / "store.json"


class Store(Protocol):
    def migrate(self) -> None: ...
    def put_agent(self, agent: dict) -> None: ...
    def get_agent(self, agent_id: str) -> dict | None: ...
    def list_agents(self) -> list[dict]: ...
    def delete_agent(self, agent_id: str) -> None: ...
    def put_run(self, agent_id: str, run: dict) -> None: ...
    def latest_run(self, agent_id: str) -> dict | None: ...
    def put_curve(self, series: str, points: list[dict]) -> None: ...
    def curve(self, series: str) -> list[dict]: ...
    def put_holdings(self, owner: str, rows: list[dict]) -> None: ...
    def holdings(self, owner: str, month: str | None = None) -> list[dict]: ...
    def replace_log(
        self, entries: list[dict], agent_id: str | None = None, types: list[str] | None = None
    ) -> None: ...
    def log(
        self,
        agent_id: str | None = None,
        month: str | None = None,
        types: list[str] | None = None,
        limit: int | None = None,
    ) -> list[dict]: ...
    def add_chat(self, agent_id: str, message: dict) -> None: ...
    def chats(self, agent_id: str) -> list[dict]: ...


def open_store() -> Store:
    url = os.environ.get("DATABASE_URL")
    if url:
        try:
            store = PgStore(url)
            store.migrate()
            return store
        except Exception as e:  # any connect or migrate failure: serve from the file instead
            log.warning("DATABASE_URL unreachable (%s); using the JSON store", e)
    return JsonStore(Path(os.environ.get("CREW_STORE_PATH") or DEFAULT_JSON_PATH))


def _sort_holdings(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda h: (h["month"], -h["weight"], h["ticker"]))


def _log_matches(e: dict, agent_id, month, types) -> bool:
    return (
        (agent_id is None or e.get("agent_id") == agent_id)
        and (month is None or e["ts"].startswith(month))
        and (types is None or e["type"] in types)
    )


class JsonStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._doc: dict | None = None
        self._mtime: float | None = None

    def _empty(self) -> dict:
        return {"agents": [], "runs": [], "curves": {}, "holdings": {}, "log": [], "chats": {}}

    def _read(self) -> dict:
        # Re-read when another process (the seed script) wrote the file since we last looked.
        mtime = self.path.stat().st_mtime if self.path.exists() else None
        if self._doc is None or mtime != self._mtime:
            self._doc = json.loads(self.path.read_text()) if mtime is not None else self._empty()
            self._mtime = mtime
        return self._doc

    def _write(self, doc: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(doc, f)
        os.replace(tmp, self.path)
        self._doc, self._mtime = doc, self.path.stat().st_mtime

    def migrate(self) -> None:
        if not self.path.exists():
            self._write(self._empty())

    def put_agent(self, agent: dict) -> None:
        doc = self._read()
        for i, a in enumerate(doc["agents"]):
            if a["id"] == agent["id"]:
                doc["agents"][i] = agent
                break
        else:
            doc["agents"].append(agent)
        self._write(doc)

    def get_agent(self, agent_id: str) -> dict | None:
        return next((a for a in self._read()["agents"] if a["id"] == agent_id), None)

    def list_agents(self) -> list[dict]:
        return list(self._read()["agents"])

    def delete_agent(self, agent_id: str) -> None:
        doc = self._read()
        doc["agents"] = [a for a in doc["agents"] if a["id"] != agent_id]
        doc["runs"] = [r for r in doc["runs"] if r["agent_id"] != agent_id]
        doc["curves"].pop(agent_id, None)
        doc["holdings"].pop(agent_id, None)
        doc["log"] = [e for e in doc["log"] if e.get("agent_id") != agent_id]
        doc["chats"].pop(agent_id, None)
        self._write(doc)

    def put_run(self, agent_id: str, run: dict) -> None:
        doc = self._read()
        doc["runs"].append({"agent_id": agent_id, "doc": run})
        self._write(doc)

    def latest_run(self, agent_id: str) -> dict | None:
        runs = [r["doc"] for r in self._read()["runs"] if r["agent_id"] == agent_id]
        return runs[-1] if runs else None

    def put_curve(self, series: str, points: list[dict]) -> None:
        doc = self._read()
        doc["curves"][series] = sorted(
            ({"date": p["date"], "value": p["value"]} for p in points), key=lambda p: p["date"]
        )
        self._write(doc)

    def curve(self, series: str) -> list[dict]:
        return list(self._read()["curves"].get(series, []))

    def put_holdings(self, owner: str, rows: list[dict]) -> None:
        doc = self._read()
        doc["holdings"][owner] = _sort_holdings([dict(r) for r in rows])
        self._write(doc)

    def holdings(self, owner: str, month: str | None = None) -> list[dict]:
        rows = self._read()["holdings"].get(owner, [])
        return [h for h in rows if month is None or h["month"] == month]

    def replace_log(
        self, entries: list[dict], agent_id: str | None = None, types: list[str] | None = None
    ) -> None:
        doc = self._read()
        doc["log"] = [e for e in doc["log"] if not _log_matches(e, agent_id, None, types)]
        doc["log"].extend(dict(e) for e in entries)
        self._write(doc)

    def log(
        self,
        agent_id: str | None = None,
        month: str | None = None,
        types: list[str] | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        rows = [e for e in self._read()["log"] if _log_matches(e, agent_id, month, types)]
        rows = sorted(rows, key=lambda e: e["ts"], reverse=True)
        return rows[:limit] if limit is not None else rows

    def add_chat(self, agent_id: str, message: dict) -> None:
        doc = self._read()
        doc["chats"].setdefault(agent_id, []).append(dict(message))
        self._write(doc)

    def chats(self, agent_id: str) -> list[dict]:
        return list(self._read()["chats"].get(agent_id, []))


SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
    seq bigserial, id text PRIMARY KEY, doc jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
    id bigserial PRIMARY KEY, agent_id text NOT NULL, doc jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS runs_agent ON runs (agent_id, id);
CREATE TABLE IF NOT EXISTS curves (
    series text NOT NULL, date date NOT NULL, value double precision NOT NULL,
    PRIMARY KEY (series, date));
CREATE TABLE IF NOT EXISTS holdings (
    owner text NOT NULL, month text NOT NULL, ticker text NOT NULL,
    weight double precision NOT NULL, doc jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS holdings_owner ON holdings (owner, month);
CREATE TABLE IF NOT EXISTS log (
    ts timestamp NOT NULL, agent_id text, type text NOT NULL, text text NOT NULL,
    seq bigserial);
CREATE INDEX IF NOT EXISTS log_agent ON log (agent_id, ts DESC);
CREATE TABLE IF NOT EXISTS chats (
    seq bigserial, agent_id text NOT NULL, ts timestamp NOT NULL, doc jsonb NOT NULL);
"""

HYPERTABLES = [("curves", "date"), ("log", "ts")]


class PgStore:
    def __init__(self, url: str):
        import psycopg

        self._psycopg = psycopg
        self.url = url
        self._conn = psycopg.connect(url, autocommit=True, connect_timeout=3)

    def _x(self, sql: str, params=()) -> list[tuple]:
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall() if cur.description else []

    def _json(self, value):
        from psycopg.types.json import Jsonb

        return Jsonb(value)

    def migrate(self) -> None:
        with self._conn.transaction():
            self._x(SCHEMA)
            has_timescale = self._x(
                "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'"
            )
            if has_timescale:
                self._x("CREATE EXTENSION IF NOT EXISTS timescaledb")
                for table, column in HYPERTABLES:
                    self._x(
                        f"SELECT create_hypertable('{table}'::regclass, '{column}'::name, "
                        "if_not_exists => TRUE, migrate_data => TRUE)"
                    )

    def reset(self) -> None:
        """Empty every table. Tests only."""
        self._x("TRUNCATE agents, runs, curves, holdings, log, chats")

    def put_agent(self, agent: dict) -> None:
        self._x(
            "INSERT INTO agents (id, doc) VALUES (%s, %s) "
            "ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc",
            (agent["id"], self._json(agent)),
        )

    def get_agent(self, agent_id: str) -> dict | None:
        rows = self._x("SELECT doc FROM agents WHERE id = %s", (agent_id,))
        return rows[0][0] if rows else None

    def list_agents(self) -> list[dict]:
        return [r[0] for r in self._x("SELECT doc FROM agents ORDER BY seq")]

    def delete_agent(self, agent_id: str) -> None:
        with self._conn.transaction():
            for sql in (
                "DELETE FROM agents WHERE id = %s",
                "DELETE FROM runs WHERE agent_id = %s",
                "DELETE FROM curves WHERE series = %s",
                "DELETE FROM holdings WHERE owner = %s",
                "DELETE FROM log WHERE agent_id = %s",
                "DELETE FROM chats WHERE agent_id = %s",
            ):
                self._x(sql, (agent_id,))

    def put_run(self, agent_id: str, run: dict) -> None:
        self._x("INSERT INTO runs (agent_id, doc) VALUES (%s, %s)", (agent_id, self._json(run)))

    def latest_run(self, agent_id: str) -> dict | None:
        rows = self._x(
            "SELECT doc FROM runs WHERE agent_id = %s ORDER BY id DESC LIMIT 1", (agent_id,)
        )
        return rows[0][0] if rows else None

    def put_curve(self, series: str, points: list[dict]) -> None:
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("DELETE FROM curves WHERE series = %s", (series,))
            cur.executemany(
                "INSERT INTO curves (series, date, value) VALUES (%s, %s, %s)",
                [(series, p["date"], p["value"]) for p in points],
            )

    def curve(self, series: str) -> list[dict]:
        rows = self._x(
            "SELECT to_char(date, 'YYYY-MM-DD'), value FROM curves WHERE series = %s ORDER BY date",
            (series,),
        )
        return [{"date": d, "value": v} for d, v in rows]

    def put_holdings(self, owner: str, rows: list[dict]) -> None:
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("DELETE FROM holdings WHERE owner = %s", (owner,))
            cur.executemany(
                "INSERT INTO holdings (owner, month, ticker, weight, doc) "
                "VALUES (%s, %s, %s, %s, %s)",
                [(owner, r["month"], r["ticker"], r["weight"], self._json(r)) for r in rows],
            )

    def holdings(self, owner: str, month: str | None = None) -> list[dict]:
        sql = "SELECT doc FROM holdings WHERE owner = %s"
        params: tuple = (owner,)
        if month is not None:
            sql += " AND month = %s"
            params += (month,)
        rows = self._x(sql + " ORDER BY month, weight DESC, ticker", params)
        return [r[0] for r in rows]

    def replace_log(
        self, entries: list[dict], agent_id: str | None = None, types: list[str] | None = None
    ) -> None:
        where, params = self._log_where(agent_id, None, types)
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("DELETE FROM log" + where, params)
            cur.executemany(
                "INSERT INTO log (ts, agent_id, type, text) VALUES (%s, %s, %s, %s)",
                [(e["ts"], e.get("agent_id"), e["type"], e["text"]) for e in entries],
            )

    @staticmethod
    def _log_where(agent_id, month, types) -> tuple[str, tuple]:
        clauses, params = [], ()
        if agent_id is not None:
            clauses.append("agent_id = %s")
            params += (agent_id,)
        if month is not None:
            clauses.append("to_char(ts, 'YYYY-MM') = %s")
            params += (month,)
        if types is not None:
            clauses.append("type = ANY(%s)")
            params += (list(types),)
        return (" WHERE " + " AND ".join(clauses) if clauses else ""), params

    def log(
        self,
        agent_id: str | None = None,
        month: str | None = None,
        types: list[str] | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        where, params = self._log_where(agent_id, month, types)
        sql = (
            "SELECT to_char(ts, 'YYYY-MM-DD HH24:MI'), agent_id, type, text FROM log"
            + where
            + " ORDER BY ts DESC, seq DESC"
        )
        if limit is not None:
            sql += " LIMIT %s"
            params += (limit,)
        return [
            {"ts": ts, "agent_id": a, "type": t, "text": x} for ts, a, t, x in self._x(sql, params)
        ]

    def add_chat(self, agent_id: str, message: dict) -> None:
        self._x(
            "INSERT INTO chats (agent_id, ts, doc) VALUES (%s, %s, %s)",
            (agent_id, message["ts"], self._json(message)),
        )

    def chats(self, agent_id: str) -> list[dict]:
        rows = self._x("SELECT doc FROM chats WHERE agent_id = %s ORDER BY seq", (agent_id,))
        return [r[0] for r in rows]
