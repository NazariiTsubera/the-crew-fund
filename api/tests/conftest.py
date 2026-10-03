from pathlib import Path

import pytest

from tests import svroot


@pytest.fixture(scope="session")
def sv_root(tmp_path_factory) -> Path:
    return svroot.build(tmp_path_factory.mktemp("svroot"))


@pytest.fixture(autouse=True)
def _dataset(sv_root, monkeypatch):
    """Every test reads the synthetic root; the app's cached Dataset is rebuilt per test."""
    from app import repository

    monkeypatch.setenv("SV_DATA_ROOT", str(sv_root))
    monkeypatch.delenv("SV_DATA_TOKEN", raising=False)
    repository.dataset.cache_clear()
    repository.universe.cache_clear()
    yield
    repository.dataset.cache_clear()
    repository.universe.cache_clear()
