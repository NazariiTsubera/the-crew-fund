"""Reads api/.env for the command-line scripts. The server gets it from uvicorn's --env-file
(and the deploy from docker compose's env_file); tests read nothing, so a developer's .env (which
may hold a production DATABASE_URL) never leaks into a test run."""

from pathlib import Path

from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parents[1]


def load_api_env() -> None:
    """Load api/.env and only that file; variables already set win. A bare load_dotenv() would
    search upward and could pick up the repo root's .env, the server's production copy."""
    load_dotenv(API_DIR / ".env")
