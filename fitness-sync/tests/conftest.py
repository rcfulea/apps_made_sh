import os, sys

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from app import db  # noqa: E402


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    """Points app.db at an isolated per-test SQLite file — never touches the real
    data/fitness.db. Every module that did `from . import db` shares this same module
    object, so patching db.DB_PATH here is visible to rollup.py/analytics.py too."""
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    db.init_db()
    return db
