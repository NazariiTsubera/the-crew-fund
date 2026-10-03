"""The crew's store (Tiger Data, or the JSON fallback) and the cached panel, opened once.

The second repository next to app/repository.py (ADR 0001): everything the API reads about
agents and the fund comes through here.
"""

from functools import lru_cache

from crew.panel import Panel, load_panel
from crew.store import Store, open_store


@lru_cache(maxsize=1)
def store() -> Store:
    return open_store()


@lru_cache(maxsize=1)
def panel() -> Panel:
    """The panel cache built by scripts/cache_panel.py (CREW_CACHE_DIR, default api/cache)."""
    return load_panel()
