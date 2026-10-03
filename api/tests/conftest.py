from pathlib import Path

import pytest

from tests import svroot


@pytest.fixture(scope="session")
def sv_root(tmp_path_factory) -> Path:
    return svroot.build(tmp_path_factory.mktemp("svroot"))


@pytest.fixture(autouse=True)
def _dataset(sv_root, tmp_path, monkeypatch):
    """Every test reads the synthetic root and starts with an empty JSON store; the app's
    cached Dataset and Store are rebuilt per test."""
    from app import crew_repository, repository

    monkeypatch.setenv("SV_DATA_ROOT", str(sv_root))
    monkeypatch.delenv("SV_DATA_TOKEN", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("CREW_STORE_PATH", str(tmp_path / "store.json"))
    caches = (repository.dataset, repository.universe, crew_repository.store)
    for c in caches:
        c.cache_clear()
    yield
    for c in caches:
        c.cache_clear()
