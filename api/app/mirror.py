"""A local mirror of the organizers' remote day-files, used by the repository.

Against the data server the SDK reads every partition file over HTTP on every query, so a
one-year backtest touches ~250 files and runs past the scorer's 30-second timeout. Here each file
in the query window is downloaded once into the mirror and read from disk afterwards. Days older
than a few days never change and are kept forever; recent days are re-fetched every few hours.
Anything that goes wrong (no disk, no write access, a failed download) falls back to the SDK's
own remote scan, so the mirror can only make queries faster, never wrong.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import polars as pl
from statevector.dataset import _file_in_window

log = logging.getLogger(__name__)

SETTLED_AFTER = timedelta(days=3)
RECENT_TTL_SECONDS = 6 * 3600
# Their server drops connections under heavy parallel load; 8 at a time with retries holds up.
WORKERS = 8
RETRY_DELAYS = (1.0, 2.0, 4.0)
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _is_settled(rel: str) -> bool:
    stem = Path(rel).stem
    if _DAY.match(stem):
        return date.fromisoformat(stem) < date.today() - SETTLED_AFTER
    if re.fullmatch(r"\d{4}", stem):
        return int(stem) < date.today().year
    return False


def _fresh(path: Path, rel: str) -> bool:
    if not path.exists():
        return False
    return _is_settled(rel) or time.time() - path.stat().st_mtime < RECENT_TTL_SECONDS


def _fetch(ds, rel: str) -> bytes:
    headers = {"Authorization": f"Bearer {ds.token}"} if ds.token else {}
    request = urllib.request.Request(ds._url(rel), headers=headers)
    with urllib.request.urlopen(request, timeout=60) as r:
        return r.read()


def _download(ds, rel: str, path: Path) -> bool:
    """Fetch one file into the mirror, retrying dropped connections; False if it never came."""
    for attempt, delay in enumerate((0.0, *RETRY_DELAYS)):
        time.sleep(delay)
        try:
            _write(path, _fetch(ds, rel))
            return True
        except Exception as e:
            if attempt == len(RETRY_DELAYS):
                log.warning("could not mirror %s (%s); reading it remotely", rel, e)
    return False


def _write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".part")
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
        # mkstemp makes the file private to its writer; the seed runs as root and the API as
        # another user, and both must read the mirror.
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def mirrored_scan(ds, name: str, start: str | None, end: str | None, mirror: Path) -> pl.LazyFrame:
    """The SDK's `_scan(name, start, end)`, served from the local mirror when remote."""
    if ds.base is None:
        return ds._scan(name, start, end)
    try:
        files = [
            rel
            for rel in ds._index["panels"][name]["files"]
            if _file_in_window(
                rel, str(start)[:10] if start else None, str(end)[:10] if end else None
            )
        ]
        local = {rel: Path(mirror) / rel for rel in files}
        missing = [rel for rel, path in local.items() if not _fresh(path, rel)]
        failed: set[str] = set()
        if missing:
            with ThreadPoolExecutor(WORKERS) as pool:
                ok = pool.map(lambda rel: _download(ds, rel, local[rel]), missing)
                failed = {rel for rel, done in zip(missing, ok, strict=True) if not done}
        if not local:
            return ds._scan(name, start, end)
        scans = []
        for rel, path in local.items():
            # A file that would not download is read remotely; the rest stay local.
            lf = pl.scan_parquet(ds._url(rel) if rel in failed else path)
            if lf.collect_schema().get("volume") not in (None, pl.Float64):
                lf = lf.with_columns(pl.col("volume").cast(pl.Float64))
            scans.append(lf)
        return pl.concat(scans, how="diagonal_relaxed")
    except Exception as e:  # any mirror failure: the SDK's own remote scan still answers
        log.warning("day-file mirror unavailable for %s (%s); scanning remotely", name, e)
        return ds._scan(name, start, end)
