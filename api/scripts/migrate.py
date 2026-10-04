"""Create or update the Tiger Data schema. Idempotent: safe to run on every deploy.

cd api && DATABASE_URL=postgres://... uv run python -m scripts.migrate
"""

import os
import sys

from crew.env import load_api_env
from crew.store import PgStore


def main() -> int:
    load_api_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set; the JSON store needs no migration.")
        return 0
    PgStore(url).migrate()
    print("schema up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
