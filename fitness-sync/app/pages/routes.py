"""Server-rendered web UI (Jinja2 + htmx). Separate from /api/* — these routes call
db.py/rollup.py directly (in-process, no HTTP round-trip to the API) and return HTML,
so /api/* stays pure JSON for the LLM and for the dashboard's chart fetches.
"""
import os, re, datetime

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from .. import db, rollup as rollup_mod, analytics as analytics_mod, readiness as readiness_mod, training as training_mod
from ..sync import hevy_import, loop

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
templates = Jinja2Templates(directory=os.path.join(HERE, "templates"))

router = APIRouter(include_in_schema=False)


def _today():
    return datetime.date.today().isoformat()


# range switcher for the dashboard charts: days of daily history (weight chart) and
# weeks of weekly history (muscle-group chart) to show. "all" = no slicing.
RANGE_DAYS = {"week": 7, "month": 30, "year": 365, "all": None}
RANGE_WEEKS = {"week": 1, "month": 5, "year": 52, "all": None}


# ---------------------------------------------------------------- dashboard
@router.get("/", response_class=HTMLResponse)
def dashboard(request: Request, range: str = "month"):
    if range not in RANGE_DAYS:
        range = "month"
    weeks = rollup_mod.build_weekly_rollup()
    latest_week = weeks[-1] if weeks else None
    body_rows = db.list_body_metrics()
    latest_body = body_rows[-1] if body_rows else None
    all_notes = db.list_notes()
    latest_llm_note = next((n for n in all_notes if n["author"] == "llm"), None)
    other_notes = [n for n in all_notes if n is not latest_llm_note][:4]
    today_row = db.get_daily_log_one(_today()) or {}

    series = sorted((datetime.date.fromisoformat(r["date"]), r["weight_kg"])
                     for r in body_rows if r.get("weight_kg"))
    days = RANGE_DAYS[range]
    if days:
        cutoff = datetime.date.today() - datetime.timedelta(days=days)
        series_view = [(d, w) for d, w in series if d >= cutoff]
    else:
        series_view = series
    weight_labels = [d.isoformat() for d, _ in series_view]
    weight_values = [w for _, w in series_view]
    weight_ma = [round(rollup_mod.seven_day_moving_avg(series, d), 2) for d, _ in series_view]

    wk_count = RANGE_WEEKS[range]
    mg_weeks = weeks[-wk_count:] if wk_count else weeks
    mg_labels = [w["week"] for w in mg_weeks]
    mg_datasets = {g: [w[g] for w in mg_weeks] for g in rollup_mod.PRIMARY}

    return templates.TemplateResponse("dashboard.html", {
        "request": request, "range": range, "latest_week": latest_week, "latest_body": latest_body,
        "latest_llm_note": latest_llm_note, "other_notes": other_notes, "sync_status": loop.STATUS,
        "today": _today(), "today_row": today_row, "meal_labels": MEAL_LABELS,
        "readiness": readiness_mod.latest_readiness(),
        "weight_labels": weight_labels, "weight_values": weight_values, "weight_ma": weight_ma,
        "mg_labels": mg_labels, "mg_datasets": mg_datasets,
    })


@router.post("/dashboard/meal-toggle", response_class=HTMLResponse)
def dashboard_meal_toggle(request: Request, meal: str = Form(...)):
    if meal in db.MEAL_FIELDS:
        db.toggle_meal(_today(), meal)
    today_row = db.get_daily_log_one(_today()) or {}
    return templates.TemplateResponse("partials/dashboard_meal_quick.html", {
        "request": request, "today_row": today_row, "meal_labels": MEAL_LABELS})


@router.post("/dashboard/weight-quick", response_class=HTMLResponse)
def dashboard_weight_quick(request: Request, weight_kg: str = Form(...)):
    row = db.upsert_body_metric(_today(), weight_kg=float(weight_kg), source="user")
    return templates.TemplateResponse("partials/dashboard_weight_quick.html", {
        "request": request, "latest_body": row})


# ---------------------------------------------------------------- meal plan (daily_log)
MEAL_LABELS = {"meal_breakfast": "Breakfast", "meal_lunch": "Lunch",
               "meal_dinner": "Dinner", "meal_snack": "Snack"}


def _streak_grid(days=14):
    """Last N days x 4 meal checkboxes, including days with no row at all (blank) —
    the at-a-glance weekly/daily follow-up view."""
    today = datetime.date.today()
    by_date = {r["date"]: r for r in db.list_daily_log(
        from_date=(today - datetime.timedelta(days=days - 1)).isoformat())}
    grid = []
    for n in range(days - 1, -1, -1):
        d = (today - datetime.timedelta(days=n)).isoformat()
        row = by_date.get(d, {})
        grid.append({"date": d, **{f: bool(row.get(f)) for f in db.MEAL_FIELDS}})
    return grid


def _week_adherence():
    """Meals checked / meals possible for the ISO week containing today (Mon-Sun) —
    the "quickly check... daily/weekly" follow-up view, front and center rather than
    buried in the rollup JSON."""
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    rows = db.list_daily_log(from_date=monday.isoformat(),
                              to_date=(monday + datetime.timedelta(days=6)).isoformat())
    checked = sum(1 for r in rows for f in db.MEAL_FIELDS if r.get(f))
    possible = 7 * len(db.MEAL_FIELDS)
    return {"checked": checked, "possible": possible,
            "pct": round(checked / possible * 100) if possible else 0}


def _protein_goal():
    """Manual override (app_settings.protein_goal_g) if set, else an auto-scaled
    suggestion (1.8g/kg x current weight 7d MA — MacroFactor's spirit: recalibrate off
    trend weight, not a fixed number) if we have enough weight data, else nothing."""
    manual = db.get_setting("protein_goal_g")
    if manual:
        try:
            return {"value": int(float(manual)), "source": "manual"}
        except ValueError:
            pass
    ma = rollup_mod.current_weight_7d_ma()
    if ma:
        return {"value": round(ma * 1.8), "source": "auto"}
    return None


def _meal_plan_context(request):
    today = _today()
    today_row = db.get_daily_log_one(today) or {}
    return {"request": request, "today": today, "today_row": today_row,
            "labels": MEAL_LABELS, "grid": _streak_grid(), "week": _week_adherence(),
            "protein_goal": _protein_goal(),
            "rows": list(reversed(db.list_daily_log()))[:30]}


@router.get("/meal-plan", response_class=HTMLResponse)
def meal_plan_page(request: Request):
    return templates.TemplateResponse("meal_plan.html", _meal_plan_context(request))


@router.post("/meal-plan/toggle", response_class=HTMLResponse)
def meal_plan_toggle(request: Request, meal: str = Form(...), date: str = Form(None)):
    if meal in db.MEAL_FIELDS:
        db.toggle_meal(date or _today(), meal)
    return templates.TemplateResponse("partials/meal_plan_today.html", _meal_plan_context(request))


@router.post("/meal-plan/save", response_class=HTMLResponse)
def meal_plan_save(request: Request, date: str = Form(...),
                    protein_g: str = Form(None), note: str = Form("")):
    db.upsert_daily_log(date, protein_g=float(protein_g) if protein_g else None, note=note or None)
    return templates.TemplateResponse("partials/meal_plan_table.html", _meal_plan_context(request))


@router.post("/meal-plan/goal", response_class=HTMLResponse)
def meal_plan_goal(request: Request, protein_goal_g: str = Form(...)):
    if protein_goal_g.strip():
        db.set_setting("protein_goal_g", protein_goal_g)
    else:
        db.delete_setting("protein_goal_g")
    return templates.TemplateResponse("partials/meal_plan_today.html", _meal_plan_context(request))


# ---------------------------------------------------------------- body metrics (Garmin readings)
BODY_FIELD_LABELS = {
    "weight_kg": "Weight (kg)", "body_fat_pct": "Body fat %", "body_water_pct": "Body water %",
    "muscle_mass_kg": "Muscle mass (kg)", "bone_mass_kg": "Bone mass (kg)", "bmi": "BMI",
}
BODY_FIELD_LABELS_ADVANCED = {
    "visceral_fat": "Visceral fat", "visceral_fat_rating": "Visceral fat rating",
    "basal_met": "Basal metabolism", "active_met": "Active metabolism",
    "metabolic_age": "Metabolic age", "physique_rating": "Physique rating",
}


@router.get("/body-metrics", response_class=HTMLResponse)
def body_metrics_page(request: Request):
    rows = list(reversed(db.list_body_metrics()))[:60]
    return templates.TemplateResponse("body_metrics.html", {
        "request": request, "rows": rows, "today": _today(),
        "labels": BODY_FIELD_LABELS, "labels_advanced": BODY_FIELD_LABELS_ADVANCED})


@router.post("/body-metrics/save", response_class=HTMLResponse)
async def body_metrics_save(request: Request):
    """Parses form fields generically off db.BODY_FIELDS — see measurements_save for
    why (a hand-listed parameter per field is exactly what dropped bmr_kcal earlier)."""
    form = await request.form()

    def f(v):
        return float(v) if v not in (None, "") else None
    fields = {k: f(form.get(k)) for k in db.BODY_FIELDS}
    db.upsert_body_metric(form.get("date"), source=form.get("source") or "user", **fields)
    rows = list(reversed(db.list_body_metrics()))[:60]
    return templates.TemplateResponse("partials/body_metrics_table.html", {"request": request, "rows": rows})


# ---------------------------------------------------------------- analytics (multi-metric overlay)
DEFAULT_METRICS = "weight_kg,sleep_score"


@router.get("/analytics", response_class=HTMLResponse)
def analytics_page(request: Request, metrics: str = DEFAULT_METRICS, range: str = "month"):
    if range not in RANGE_DAYS:
        range = "month"
    selected = [m for m in metrics.split(",") if m.strip()]
    from_date = None
    if RANGE_DAYS[range]:
        from_date = (datetime.date.today() - datetime.timedelta(days=RANGE_DAYS[range])).isoformat()

    series = analytics_mod.get_series(selected, from_date=from_date)

    all_dates = sorted({p["date"] for s in series.values() for p in s["points"]})
    palette = ['#8888ff', '#ff9f66', '#66c2a5', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3']
    chart_series = []
    for i, (key, s) in enumerate(series.items()):
        by_date = {p["date"]: p["value"] for p in s["points"]}
        vals = [by_date.get(d) for d in all_dates]
        present = [v for v in vals if v is not None]
        lo, hi = (min(present), max(present)) if present else (0, 1)
        norm = [None if v is None else (50.0 if hi == lo else round((v - lo) / (hi - lo) * 100, 1))
                for v in vals]
        chart_series.append({"key": key, "label": s["label"], "unit": s["unit"],
                              "raw": vals, "norm": norm, "color": palette[i % len(palette)]})

    def toggle_url(key):
        new_sel = [m for m in selected if m != key] if key in selected else selected + [key]
        return f"/analytics?range={range}&metrics=" + ",".join(new_sel)

    return templates.TemplateResponse("analytics.html", {
        "request": request, "range": range, "selected": selected,
        "categories": analytics_mod.categories(), "toggle_url": toggle_url,
        "chart_labels": all_dates, "chart_series": chart_series,
    })


# ---------------------------------------------------------------- measurements (manual, tape)
def _measurement_deltas(rows):
    """{field: (latest_value, delta_vs_previous_entry)} — the QoL bit: see at a glance
    whether waist/etc moved since you last measured, not just the raw number."""
    if len(rows) < 1:
        return {}
    latest = rows[-1]
    prev = rows[-2] if len(rows) > 1 else None
    out = {}
    for f in db.MEASUREMENT_FIELDS:
        v = latest.get(f)
        if v is None:
            continue
        d = round(v - prev[f], 1) if prev and prev.get(f) is not None else None
        out[f] = (v, d)
    return out


@router.get("/measurements", response_class=HTMLResponse)
def measurements_page(request: Request):
    rows = db.list_measurements()
    deltas = _measurement_deltas(rows)
    return templates.TemplateResponse("measurements.html", {
        "request": request, "rows": list(reversed(rows))[:40], "today": _today(),
        "deltas": deltas, "labels": MEASUREMENT_LABELS,
        "chart_labels": [r["date"] for r in rows[-20:]],
        "chart_datasets": {f: [r.get(f) for r in rows[-20:]] for f in db.MEASUREMENT_FIELDS},
    })


@router.delete("/measurements/{date}", response_class=HTMLResponse)
def measurements_delete(request: Request, date: str):
    db.delete_measurement(date)
    rows = db.list_measurements()
    deltas = _measurement_deltas(rows)
    return templates.TemplateResponse("partials/measurements_table.html", {
        "request": request, "rows": list(reversed(rows))[:40], "deltas": deltas,
        "labels": MEASUREMENT_LABELS})


@router.post("/measurements/save", response_class=HTMLResponse)
async def measurements_save(request: Request):
    """Parses form fields generically off db.MEASUREMENT_FIELDS rather than a
    hand-listed parameter per field — a hand-copied field list is exactly what
    silently dropped bmr_kcal/sleep_score earlier this session; deriving from the
    single source of truth means adding/renaming a measurement field never needs a
    matching edit here."""
    form = await request.form()

    def f(v):
        return float(v) if v not in (None, "") else None
    fields = {k: f(form.get(k)) for k in db.MEASUREMENT_FIELDS}
    db.upsert_measurement(form.get("date"), note=form.get("note") or None, **fields)
    rows = db.list_measurements()
    deltas = _measurement_deltas(rows)
    return templates.TemplateResponse("partials/measurements_table.html", {
        "request": request, "rows": list(reversed(rows))[:40], "deltas": deltas,
        "labels": MEASUREMENT_LABELS})


MEASUREMENT_LABELS = {
    "neck_cm": "Neck", "shoulders_cm": "Shoulders", "chest_cm": "Chest",
    "waist_cm": "Waist", "hips_cm": "Hips",
    "bicep_left_cm": "Bicep (L)", "bicep_right_cm": "Bicep (R)",
    "forearm_left_cm": "Forearm (L)", "forearm_right_cm": "Forearm (R)",
    "thigh_left_cm": "Thigh (L)", "thigh_right_cm": "Thigh (R)",
    "calf_left_cm": "Calf (L)", "calf_right_cm": "Calf (R)",
}


# ---------------------------------------------------------------- health (watch_metrics)
HEALTH_TREND_METRICS = [("readiness_score", "Readiness", ""), ("resting_hr", "Resting HR", "bpm"),
                         ("sleep_score", "Sleep score", ""), ("vo2max", "VO2max", "")]


@router.get("/health", response_class=HTMLResponse)
def health_page(request: Request):
    rows = list(reversed(db.list_watch_metrics()))[:16]
    latest = rows[0] if rows else {}
    latest_readiness = readiness_mod.latest_readiness()

    series = analytics_mod.get_series([k for k, _, _ in HEALTH_TREND_METRICS])
    charts = []
    for key, label, unit in HEALTH_TREND_METRICS:
        pts = series.get(key, {}).get("points", [])[-12:]
        charts.append({"key": key, "label": label, "unit": unit,
                        "labels": [p["date"] for p in pts], "values": [p["value"] for p in pts]})

    return templates.TemplateResponse("health.html", {
        "request": request, "rows": rows, "latest": latest, "charts": charts,
        "readiness": latest_readiness})


# ---------------------------------------------------------------- workouts (hevy_sets)
def _flagged_rows(exercise=None, from_date=None, to_date=None):
    """PR flags need the FULL history to be correct, so flag everything first, then
    filter the already-flagged rows for display — filtering db.list_hevy_sets() first
    would make early sets look like PRs just because later ones aren't in view."""
    flagged = training_mod.sets_with_pr_flags()
    return [r for r in flagged
            if (not exercise or r["exercise"] == exercise)
            and (not from_date or r["date"] >= from_date)
            and (not to_date or r["date"] <= to_date)]


@router.get("/workouts", response_class=HTMLResponse)
def workouts_page(request: Request, exercise: str = "", from_: str = "", to: str = ""):
    all_rows = db.list_hevy_sets()
    exercises = sorted({r["exercise"] for r in all_rows})
    filtered = _flagged_rows(exercise or None, from_ or None, to or None)
    rows = list(reversed(filtered))[:200]
    plateaus = [s for s in training_mod.exercise_summary() if s["plateau"]]
    return templates.TemplateResponse("workouts.html", {
        "request": request, "rows": rows, "today": _today(), "exercises": exercises,
        "filter": {"exercise": exercise, "from_": from_, "to": to},
        "total_matching": len(filtered), "plateaus": plateaus,
        "last_import": loop.STATUS.get("last_hevy_import")})


@router.get("/workouts/last-session", response_class=HTMLResponse)
def workouts_last_session(request: Request, exercise: str = ""):
    hint = training_mod.last_session_for(exercise) if exercise else None
    return templates.TemplateResponse("partials/last_session_hint.html", {
        "request": request, "hint": hint, "exercise": exercise})


@router.post("/workouts/upload", response_class=HTMLResponse)
async def workouts_upload(request: Request, file: UploadFile = File(...)):
    if file.filename and file.filename.lower().endswith(".csv"):
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(file.filename))
        stamped = f"{datetime.datetime.now(datetime.timezone.utc):%Y%m%dT%H%M%S}_{safe_name}"
        os.makedirs(hevy_import.HEVY_DIR, exist_ok=True)
        with open(os.path.join(hevy_import.HEVY_DIR, stamped), "wb") as f:
            f.write(await file.read())
        files, seen, inserted = hevy_import.import_dir()
        loop.STATUS["last_hevy_import"] = {"files": files, "seen": seen, "inserted": inserted}
    all_rows = _flagged_rows()
    rows = list(reversed(all_rows))[:200]
    return templates.TemplateResponse("partials/workouts_table.html",
                                       {"request": request, "rows": rows, "total_matching": len(all_rows),
                                        "last_import": loop.STATUS.get("last_hevy_import")})


@router.post("/workouts/rescan", response_class=HTMLResponse)
def workouts_rescan(request: Request):
    files, seen, inserted = hevy_import.import_dir()
    loop.STATUS["last_hevy_import"] = {"files": files, "seen": seen, "inserted": inserted}
    all_rows = _flagged_rows()
    rows = list(reversed(all_rows))[:200]
    return templates.TemplateResponse("partials/workouts_table.html",
                                       {"request": request, "rows": rows, "total_matching": len(all_rows),
                                        "last_import": loop.STATUS["last_hevy_import"]})


@router.post("/workouts/save", response_class=HTMLResponse)
def workouts_save(request: Request, date: str = Form(...), exercise: str = Form(...),
                   weight_kg: str = Form("0"), reps: str = Form("0")):
    w, r = float(weight_kg or 0), int(reps or 0)
    db.insert_hevy_set(date=date, title="manual", exercise=exercise, set_index="",
                        set_type="normal", weight_kg=w, reps=r, duration_seconds=0,
                        load_kg=w * r, source="user", imported_from=None)
    all_rows = _flagged_rows()
    rows = list(reversed(all_rows))[:200]
    return templates.TemplateResponse("partials/workouts_table.html",
                                       {"request": request, "rows": rows, "total_matching": len(all_rows),
                                        "last_import": loop.STATUS.get("last_hevy_import")})


# ---------------------------------------------------------------- notes
@router.get("/notes", response_class=HTMLResponse)
def notes_page(request: Request):
    rows = db.list_notes()
    return templates.TemplateResponse("notes.html", {"request": request, "rows": rows})


@router.post("/notes/save", response_class=HTMLResponse)
def notes_save(request: Request, title: str = Form(""), body: str = Form(...),
                related_date: str = Form(None), tags: str = Form("")):
    db.insert_note(author="user", body=body, title=title or None,
                    related_date=related_date or None, tags=tags or None)
    rows = db.list_notes()
    return templates.TemplateResponse("partials/notes_list.html", {"request": request, "rows": rows})


@router.get("/notes/{note_id}/view", response_class=HTMLResponse)
def notes_view_item(request: Request, note_id: int):
    n = db.get_note(note_id)
    return templates.TemplateResponse("partials/note_item.html", {"request": request, "n": n})


@router.get("/notes/{note_id}/edit", response_class=HTMLResponse)
def notes_edit_item(request: Request, note_id: int):
    n = db.get_note(note_id)
    return templates.TemplateResponse("partials/note_edit_item.html", {"request": request, "n": n})


@router.post("/notes/{note_id}/save", response_class=HTMLResponse)
def notes_edit_save(request: Request, note_id: int, title: str = Form(""), body: str = Form(...),
                     related_date: str = Form(None), tags: str = Form("")):
    n = db.update_note(note_id, title=title or None, body=body,
                        related_date=related_date or None, tags=tags or None)
    return templates.TemplateResponse("partials/note_item.html", {"request": request, "n": n})
