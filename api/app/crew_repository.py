"""The crew's store (Tiger Data, or the JSON fallback), opened once for the API.

The second repository next to app/repository.py (ADR 0001): everything the API reads about
agents and the fund comes through here.
"""

from functools import lru_cache

from crew.store import Store, open_store


@lru_cache(maxsize=1)
def store() -> Store:
    return open_store()
