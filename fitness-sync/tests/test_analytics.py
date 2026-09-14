import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import analytics  # noqa: E402


def test_get_series_daily_source(tmp_db):
    tmp_db.upsert_body_metric("2026-01-01", weight_kg=80.0)
    tmp_db.upsert_body_metric("2026-01-02", weight_kg=79.5)
    out = analytics.get_series(["weight_kg"])
    assert out["weight_kg"]["label"] == "Weight"
    assert out["weight_kg"]["unit"] == "kg"
    assert [p["value"] for p in out["weight_kg"]["points"]] == [80.0, 79.5]


def test_get_series_weekly_source_placed_on_monday(tmp_db):
    tmp_db.upsert_watch_metric("2026-W02", sleep_score=88.0)
    out = analytics.get_series(["sleep_score"])
    points = out["sleep_score"]["points"]
    assert len(points) == 1
    assert points[0]["value"] == 88.0
    assert points[0]["date"] == "2026-01-05"  # Monday of ISO week 2026-W02


def test_get_series_ignores_unknown_metric_key(tmp_db):
    out = analytics.get_series(["not_a_real_metric", "weight_kg"])
    assert "not_a_real_metric" not in out
    assert "weight_kg" in out


def test_get_series_respects_date_range(tmp_db):
    tmp_db.upsert_body_metric("2026-01-01", weight_kg=80.0)
    tmp_db.upsert_body_metric("2026-02-01", weight_kg=79.0)
    out = analytics.get_series(["weight_kg"], from_date="2026-01-15")
    assert [p["date"] for p in out["weight_kg"]["points"]] == ["2026-02-01"]


def test_categories_groups_by_registry_order():
    cats = analytics.categories()
    assert "Body composition" in cats
    assert "Measurements" in cats
    assert "Watch & recovery" in cats
    assert ("weight_kg", "Weight", "kg") in cats["Body composition"]
