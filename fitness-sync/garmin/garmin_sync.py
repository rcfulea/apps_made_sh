#!/usr/bin/env python3
"""garmin_sync.py — pull Garmin body-composition + watch/recovery signals into SQLite
(app/db.py: body_metrics, watch_metrics tables). Uses cyberjunky/python-garminconnect
(pinned garminconnect==0.3.2, see requirements.txt).

Modes
   --mode init   One-time bootstrap: logs in (prompts MFA via input) and saves a tokenstore
                 to GARMIN_TOKENSTORE. Run ONCE, on a machine where MFA can be answered.
   --mode pull   Scheduled/in-process run: restores from tokenstore, pulls the last GARMIN_DAYS
                 days, upserts body_metrics. No interaction. Safe to run repeatedly.
   --mode watch  Pulls watch/recovery signals (resting HR, steps, stress, body battery,
                 respiration, kcal), upserts watch_metrics (ISO-week keyed).
   --mode mock   Writes a 14-day demo series into body_metrics so the pipeline can be
                 tested with no network/creds.

Env
  GARMIN_EMAIL / GARMIN_PASSWORD    (used by --mode init)
  GARMIN_TOKENSTORE                tokenstore path (default: <dir of this file>/tokens.txt)
  GARMIN_DAYS                      lookback window in days for --mode pull (default 30)
  DB_PATH                          sqlite db path (see app/db.py; default <repo>/data/fitness.db)

Design notes
  * The Garmin body-composition record holds ~12 fields (weight, body fat %, body water %,
    visceral fat, bone mass, muscle mass, basal/active metabolism, metabolic age, physique
    rating, visceral-fat rating, BMI). extract_reading() grabs every field Garmin returns;
    fields Garmin doesn't report for a given day simply stay NULL in body_metrics (the old
    CSV writer's "adaptive column" trick is superseded by ordinary nullable DB columns).
  * The data-call layer of garminconnect has NO 429/backoff handling: a single rate-limit
    aborts the whole pull. `_call` adds a small retry+backoff so a transient throttle becomes
    a wait-and-continue instead of a dead pull.

Known Garmin Connect wire facts (observed 2026-08, garminconnect 0.3.2):
   * weight / mass fields are in GRAMS (e.g. 68349.0 g == 68.35 kg); percentages and ratings
     are raw numbers. Human weights 30-300 kg -> expect 30000..300000 g.
   * per-day comp lives in body_composition(...).dateWeightList[] (top-level fields,
     calendarDate string); some records nest the same fields under 'latestWeight'/'totalAverage'.
   * weigh_ins(...).dailyWeightSummaries[] nests the same fields too.
   * 'date' may be an epoch-millisecond timestamp or a calendarDate/summaryDate string.
"""
import os, sys, datetime, collections, time, functools

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
sys.path.insert(0, REPO_ROOT)
from app import db  # noqa: E402

TOKENSTORE = os.environ.get("GARMIN_TOKENSTORE", os.path.join(HERE, "tokens.txt"))
DAYS = int(os.environ.get("GARMIN_DAYS", "30"))

DATA_FIELDS = (
    "weight_kg", "body_fat_pct", "body_water_pct", "muscle_mass_kg", "bone_mass_kg",
    "visceral_fat", "visceral_fat_rating", "basal_met", "active_met",
    "metabolic_age", "physique_rating", "bmi",
)

FIELD_KEYS = {
    "weight_kg":          ("weight",),
    "body_fat_pct":       ("bodyFat", "bodyFatPercent", "fatPercent"),
    "body_water_pct":     ("bodyWaterPercent", "bodyWater", "hydrationPercent",
                           "percentHydration", "waterPercent", "hydration"),
    "muscle_mass_kg":     ("muscleMass", "muscleMassKg", "skeletalMuscleMass", "skeletalMuscleMassKg"),
    "bone_mass_kg":       ("boneMass", "boneMassKg"),
    "visceral_fat":       ("visceralFat", "visceralFatMass"),
    "visceral_fat_rating":("visceralFatRating", "vfRating"),
    "basal_met":          ("basalMet", "basalMetabolism", "bmr"),
    "active_met":         ("activeMet", "activeMetabolism", "met", "bmrActive"),
    "metabolic_age":      ("metabolicAge", "metabolicAgeScore", "metAbolismAge"),
    "physique_rating":    ("physiqueRating", "physique"),
    "bmi":                ("bmi", "bmiKg", "bodyMassIndex"),
}
GRA_FIELDS = {"weight_kg", "muscle_mass_kg", "bone_mass_kg"}


# ---------------------------------------------------------------- auth / client
def login():
    import garminconnect
    g = garminconnect.Garmin(os.environ.get("GARMIN_EMAIL"), os.environ.get("GARMIN_PASSWORD"),
                             prompt_mfa=input)
    g.login(tokenstore=TOKENSTORE)       # 0.3.2 loads/refreshes/dumps the tokenstore
    return g


def _call(method, attempts=3, base_delay=6.0):
    """Retry-with-backoff decorator for Garmin data calls. The library has zero 429 handling
    (a rate limit raises and kills the pull); this turns a transient throttle into a wait.
    Sleeps between attempts; final attempt's exception propagates."""
    @functools.wraps(method)
    def _wrap(*args, **kwargs):
        last = None
        for i in range(attempts):
            try:
                return method(*args, **kwargs)
            except Exception as e:
                last = e
                kind = type(e).__name__
                if i < attempts - 1:
                    delay = base_delay * (2 ** i)
                    sys.stderr.write(f"[garmin] {method.__name__} {kind} (#{i + 1}); "
                                     f"retry in {delay:.0f}s...\n")
                    time.sleep(delay)
        sys.stderr.write(f"[garmin] {method.__name__} gave up after {attempts} tries "
                         f"(last {type(last).__name__ if last else 'None'})\n")
        raise last
    return _wrap


# ---------------------------------------------------------------- parsing
def _coerce_float(v):
    try:
        f = float(v)
        return f if f else None
    except (TypeError, ValueError):
        return None


def _ms_to_date(v):
    """Accept epoch-milliseconds (13-digit) or ISO-ish strings; return a date or None."""
    if v is None:
        return None
    if isinstance(v, (int, float)) or (isinstance(v, str) and str(v).strip().isdigit()):
        ms = int(v)
        if 1_577_836_800_000 < ms < 4_102_444_800_000:       # ~2020 .. ~2100
            try:
                return datetime.datetime.fromtimestamp(ms / 1000.0).date()
            except (OSError, ValueError):
                return None
        return None
    val = str(v).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.datetime.strptime(val[:19] if len(val) > 10 else val, fmt).date()
        except ValueError:
            continue
    return None


def _collect_records(payload, key="dateWeightList"):
    """Return a flat list of per-day record dicts from any Garmin weigh/body payload.
    Handles .dateWeightList (body-composition) and .dailyWeightSummaries (weigh-ins)."""
    out = []
    if not isinstance(payload, dict):
        return out
    out += list(payload.get(key, []) or [])
    out += list(payload.get("dailyWeightSummaries", []) or [])
    return out


def extract_reading(rec):
    """Normalise one Garmin record to the full DATA_FIELDS dict. Empty/None fields are kept
    as None so the DB layer's merge-upsert can decide column presence per-write."""
    if not isinstance(rec, dict):
        return None

    def get(field):
        for nk in ("latestWeight", "totalAverage"):
            nested = rec.get(nk)
            if isinstance(nested, dict) and nested.get(field) not in (None, "", 0):
                return _coerce_float(nested[field])
        return _coerce_float(rec.get(field))

    def get_any(keys, normalize):
        for k in keys:
            v = get(k)
            if v not in (None, "", 0):
                return normalize(v)
        return None

    dt = None
    for ck in ("calendarDate", "summaryDate", "cdate", "date", "time", "dailyDate"):
        dt = _ms_to_date(rec.get(ck))
        if dt is None:
            for nk in ("latestWeight", "totalAverage"):
                nv = rec.get(nk)
                if isinstance(nv, dict):
                    dt = _ms_to_date(nv.get(ck))
                    if dt:
                        break
        if dt:
            break

    if dt is None:
        w = get_any(FIELD_KEYS["weight_kg"], lambda v: v)
        if w is None:
            return None
        dt = datetime.date.today()

    out = {"date": dt, "source": "garmin_api"}
    for field, keys in FIELD_KEYS.items():
        if field in GRA_FIELDS:
            val = get_any(keys, lambda v: v / 1000.0 if v > 100 else v)   # grams -> kg
            out[field] = round(val, 2) if val is not None else None
        else:
            rounder = lambda v, f=field: (round(v, 1)
                                          if f in ("body_fat_pct", "body_water_pct",
                                                   "visceral_fat", "visceral_fat_rating",
                                                   "metabolic_age", "bmi") else
                                          (round(v, 1) if f in ("muscle_mass_kg", "bone_mass_kg") else v))
            val = get_any(keys, lambda v: v)
            out[field] = rounder(val) if val is not None else None
    return out


def pull_garmin(g):
    today = datetime.date.today()
    start = today - datetime.timedelta(days=DAYS)

    body = _call(g.get_body_composition, attempts=3, base_delay=6.0)(
        start.isoformat(), enddate=today.isoformat())
    weigh = _call(g.get_weigh_ins, attempts=3, base_delay=6.0)(
        start.isoformat(), today.isoformat())

    out = []
    for label, payload in (("body-composition", body), ("weigh-ins", weigh)):
        recs = _collect_records(payload or {})
        sys.stderr.write(f"[garmin] {label}: {len(recs)} per-day record(s)\n" if recs
            else f"[garmin] {label}: 0 records — keys={list((payload or {}).keys())[:8]}\n")
        for r in recs:
            rd = extract_reading(r)
            if rd and rd.get("date"):
                out.append(rd)

    return _merge_by_date(out)


def _merge_by_date(rows):
    """Merge per-date, newest non-empty value wins per field (pre-DB pass so a single
    upsert call per date is enough)."""
    by = collections.OrderedDict()
    for r in sorted(rows, key=lambda x: x["date"]):
        d = r["date"]
        merged = by.get(d, dict(date=d, source="garmin_api"))
        for k in DATA_FIELDS:
            v = r.get(k)
            if v not in (None, "", 0, 0.0):
                merged[k] = v
        by[d] = merged
    return list(by.values())


def store_readings(readings):
    """Upsert each reading into body_metrics. Returns count stored."""
    for r in readings:
        fields = {k: r.get(k) for k in DATA_FIELDS}
        db.upsert_body_metric(r["date"].isoformat(), source=r.get("source", "garmin_api"), **fields)
    return len(readings)


# ---------------------------------------------------------------- watch / recovery metrics
# These come from the WATCH. get_user_summary(date) turns out to be a single call that
# already bundles resting HR, active/total kcal, SpO2 avg/lowest, respiration avg, and
# floors climbed — so one call/day covers all of those (confirmed 2026-09 against a
# real account via explore_garmin.py; previously this was 3 separate per-day calls).
# HRV (get_hrv_data) returns empty until the watch's HRV status report is actually run,
# but the extraction is tolerant (stays NULL, never errors) so it activates the moment
# you start logging it — no code change needed then.
#   weekly_steps       -> weekly total/avg steps + distance   (get_weekly_steps, range)
#   weekly_stress      -> weekly avg stress                    (get_weekly_stress, range)
#   body_battery       -> daily body-battery last value        (get_body_battery, range)
#   user_summary       -> resting HR, kcal, SpO2, respiration, floors (get_user_summary, per day)
#   hrv                -> last-night/weekly HRV avg (ms)        (get_hrv_data, per day)
#   sleep              -> sleep score (0-100) + duration (hr)   (get_sleep_data, per day) —
#                          confirmed populated on this device for a COMPLETED night; querying
#                          "today" mid-day is legitimately empty (last night not synced yet),
#                          not a bug — the backfill window naturally covers prior nights.
#   vo2max/fitness_age -> single current-value calls, not a daily series (get_max_metrics,
#                          get_fitnessage_data) — stored on the CURRENT week only.
# watch_metrics is WEEK-keyed (ISO week) — feeds the recovery block in the rollup.
# GARMIN_METRICS_DAYS controls the per-day-loop backfill window (default 7); the loop
# used to run 14 days x 3 calls = 42 calls/cycle, which contributed to 429s on this
# account — now 7 days x 3 calls (user_summary + hrv + sleep) = 21, plus ~5 range/single
# calls. Still ~45% fewer than before, and covers far more signals per call. Drop
# GARMIN_METRICS_DAYS further (e.g. 3-4) if 429s keep showing up in /api/sync/status.
# Derived from db.WATCH_FIELDS (the actual table columns) rather than hand-duplicated —
# a hand-copied list here once silently dropped bmr_kcal/sleep_score/sleep_duration_hr
# after they were added to the schema but not to this tuple. Single source of truth now.
METRIC_KEYS = db.WATCH_FIELDS
METRICS_DAYS = int(os.environ.get("GARMIN_METRICS_DAYS", "7"))


def _iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _mean(vals):
    vals = [v for v in vals if isinstance(v, (int, float))]
    return sum(vals) / len(vals) if vals else None


def _extract_hrv(rec):
    """HRV summary shape per Garmin Connect's (undocumented, community-observed) HRV
    endpoint: {"hrvSummary": {"lastNightAvg":.., "weeklyAvg":.., ...}}. Empty/absent on
    this account until the watch's HRV status report is actually run — tolerant lookup
    so it just stays None until then, same as the rest of this module's field lookups."""
    if not isinstance(rec, dict):
        return None, None
    summary = rec.get("hrvSummary") or rec.get("hrvSummaries") or {}
    if isinstance(summary, list):
        summary = summary[0] if summary else {}
    if not isinstance(summary, dict):
        return None, None
    last_night = summary.get("lastNightAvg")
    weekly = summary.get("weeklyAvg")
    return (float(last_night) if isinstance(last_night, (int, float)) else None,
            float(weekly) if isinstance(weekly, (int, float)) else None)


def _extract_sleep(rec):
    """Confirmed 2026-09 against a real night on this device: dailySleepDTO.sleepScores
    .overall.value is the 0-100 sleep score; sleepTimeSeconds is total sleep duration.
    Querying "today" mid-day returns an empty DTO (last night hasn't finished syncing
    yet) — this is normal, not a bug; the per-day backfill loop naturally picks up
    completed nights from prior days."""
    if not isinstance(rec, dict):
        return None, None
    dto = rec.get("dailySleepDTO") or {}
    if not isinstance(dto, dict):
        return None, None
    overall = (dto.get("sleepScores") or {}).get("overall") or {}
    score = overall.get("value")
    dur_s = dto.get("sleepTimeSeconds")
    return (float(score) if isinstance(score, (int, float)) else None,
            round(dur_s / 3600.0, 2) if isinstance(dur_s, (int, float)) else None)


def pull_metrics(g):
    """Produce a list of per-ISO-week rows for the watch/recovery signals.
    One pass over the most recent window; weekly endpoints cover 8 weeks, per-day endpoints
    fill the same weeks. Throttle-safe via _call. Returns [] safely on any endpoint error."""
    today = datetime.date.today()
    weeks_out = collections.defaultdict(lambda: {"week": None})

    time.sleep(1.0)
    try:
        for item in (g.get_weekly_steps(today.isoformat(), weeks=8) or []):
            if not isinstance(item, dict):
                continue
            wk = item.get("calendarDate")
            if not wk:
                continue
            wk_iso = f"{wk[:4]}-W{int(wk[5:7]) if wk[5:7].isdigit() else 0:02d}"
            v = item.get("values") or {}
            if v.get("totalSteps") is not None:
                weeks_out[wk_iso]["steps_total"] = float(v["totalSteps"])
            if v.get("averageSteps") is not None:
                weeks_out[wk_iso]["steps_avg"] = float(v["averageSteps"])
            if v.get("averageDistance") is not None:
                weeks_out[wk_iso]["distance_m"] = float(v["averageDistance"])
    except Exception as e:
        sys.stderr.write(f"[metrics] weekly_steps err {type(e).__name__}\n")

    time.sleep(1.0)
    try:
        for item in (g.get_weekly_stress(today.isoformat(), weeks=8) or []):
            if not isinstance(item, dict):
                continue
            wk = item.get("calendarDate"); val = item.get("value")
            if not wk or val is None:
                continue
            wk_iso = f"{wk[:4]}-W{int(wk[5:7]) if wk[5:7].isdigit() else 0:02d}"
            weeks_out[wk_iso]["stress_avg"] = float(val)
    except Exception as e:
        sys.stderr.write(f"[metrics] weekly_stress err {type(e).__name__}\n")

    time.sleep(1.0)
    try:
        bb = g.get_body_battery((today - datetime.timedelta(days=7)).isoformat(), today.isoformat()) or []
        for row in bb:
            vals = row.get("bodyBatteryValuesArray") or []
            last = None
            for el in vals:
                if isinstance(el, (list, tuple)) and len(el) >= 2 and isinstance(el[1], (int, float)):
                    last = float(el[1])
            if last is not None:
                weeks_out[_iso_week(today)].setdefault("_bb_days", []).append(last)
    except Exception as e:
        sys.stderr.write(f"[metrics] body_battery err {type(e).__name__}\n")

    time.sleep(1.0)

    # get_user_summary bundles resting HR, kcal, SpO2, respiration and floors in ONE
    # call/day (confirmed via explore_garmin.py against a real account 2026-09) — this
    # replaces what used to be 3 separate per-day calls.
    DAY_FIELD_MAP = (
        ("_rhr_days", "resting_hr", "restingHeartRate"),
        ("_day_active_kcal", "active_kcal", "activeKilocalories"),
        ("_day_total_kcal", "total_kcal", "totalKilocalories"),
        ("_day_bmr_kcal", "bmr_kcal", "bmrKilocalories"),
        ("_res_days", "respiration_avg", "avgWakingRespirationValue"),
        ("_spo2_avg_days", "spo2_avg", "averageSpo2"),
        ("_spo2_low_days", "spo2_lowest", "lowestSpo2"),
        ("_floors_days", "floors_climbed", "floorsAscended"),
    )
    for n in range(METRICS_DAYS - 1, -1, -1):
        d = today - datetime.timedelta(days=n)
        wk_iso = _iso_week(d)
        try:
            u = _call(g.get_user_summary, attempts=2, base_delay=3.0)(d.isoformat()) or {}
            for bucket, _key, src in DAY_FIELD_MAP:
                v = u.get(src)
                if isinstance(v, (int, float)):
                    weeks_out[wk_iso].setdefault(bucket, []).append(float(v))
        except Exception as e:
            sys.stderr.write(f"[metrics] user_summary {d} err {type(e).__name__}\n")
        time.sleep(0.8)
        try:
            hrv_rec = _call(g.get_hrv_data, attempts=2, base_delay=3.0)(d.isoformat()) or {}
            last_night, weekly = _extract_hrv(hrv_rec)
            if last_night is not None:
                weeks_out[wk_iso].setdefault("_hrv_last_night_days", []).append(last_night)
            if weekly is not None:
                weeks_out[wk_iso]["hrv_weekly_avg"] = weekly  # already a weekly figure, not averaged
        except Exception as e:
            sys.stderr.write(f"[metrics] hrv {d} err {type(e).__name__}\n")
        time.sleep(0.8)
        try:
            sleep_rec = _call(g.get_sleep_data, attempts=2, base_delay=3.0)(d.isoformat()) or {}
            score, dur_hr = _extract_sleep(sleep_rec)
            if score is not None:
                weeks_out[wk_iso].setdefault("_sleep_score_days", []).append(score)
            if dur_hr is not None:
                weeks_out[wk_iso].setdefault("_sleep_duration_days", []).append(dur_hr)
        except Exception as e:
            sys.stderr.write(f"[metrics] sleep {d} err {type(e).__name__}\n")
        time.sleep(0.8)

    # vo2max / fitness_age are current-value snapshots, not a daily series — one call
    # each, stored on the CURRENT week only.
    current_wk = _iso_week(today)
    try:
        mm = _call(g.get_max_metrics, attempts=2, base_delay=3.0)(today.isoformat()) or []
        if isinstance(mm, list) and mm:
            generic = (mm[0] or {}).get("generic") or {}
            v = generic.get("vo2MaxValue")
            if isinstance(v, (int, float)):
                weeks_out[current_wk]["vo2max"] = float(v)
    except Exception as e:
        sys.stderr.write(f"[metrics] max_metrics err {type(e).__name__}\n")
    time.sleep(0.8)
    try:
        fa = _call(g.get_fitnessage_data, attempts=2, base_delay=3.0)(today.isoformat()) or {}
        v = fa.get("fitnessAge")
        if isinstance(v, (int, float)):
            weeks_out[current_wk]["fitness_age"] = round(float(v), 1)
    except Exception as e:
        sys.stderr.write(f"[metrics] fitnessage err {type(e).__name__}\n")

    rows = []
    for wk_iso, w in weeks_out.items():
        for dk, key, _src in DAY_FIELD_MAP:
            lst = w.pop(dk, None)
            if lst:
                w[key] = round(_mean(lst), 1)
        lst = w.pop("_bb_days", None)
        if lst:
            w["body_battery"] = round(_mean(lst), 1)
        lst = w.pop("_hrv_last_night_days", None)
        if lst:
            w["hrv_last_night"] = round(_mean(lst), 1)
        lst = w.pop("_sleep_score_days", None)
        if lst:
            w["sleep_score"] = round(_mean(lst), 1)
        lst = w.pop("_sleep_duration_days", None)
        if lst:
            w["sleep_duration_hr"] = round(_mean(lst), 2)
        w["week"] = wk_iso
        rows.append(w)
    return rows


def store_metrics(rows):
    for r in rows:
        fields = {k: r.get(k) for k in METRIC_KEYS}
        db.upsert_watch_metric(r["week"], **fields)
    return len(rows)


def mode_watch():
    if not _tokenstore_present(TOKENSTORE) and not (os.environ.get("GARMIN_EMAIL") and os.environ.get("GARMIN_PASSWORD")):
        sys.stderr.write(f"[metrics] no tokenstore at {TOKENSTORE} and no creds set. "
                          "Run 'python3 garmin_sync.py --mode init' once on a TTY first.\n")
        return 2
    g = login()
    rows = pull_metrics(g)
    if not rows:
        sys.stderr.write("[metrics] no watch data returned this run; watch_metrics not updated.\n")
        return 3
    n = store_metrics(rows)
    sys.stderr.write(f"[metrics] synced {n} week(s) into watch_metrics.\n")
    return 0


# ---------------------------------------------------------------- modes
def _tokenstore_present(path):
    if not os.path.exists(path):
        return False
    if os.path.isdir(path):
        return any(os.path.getsize(os.path.join(path, fn)) > 0 for fn in os.listdir(path))
    return os.path.getsize(path) > 0


def mode_init():
    g = login()
    if not _tokenstore_present(TOKENSTORE):
        sys.stderr.write("[garmin] init FAILED — no token on disk after login "
                         "(MFA gate or network error). Try again near a browser.\n")
        return 4
    sys.stderr.write(f"[garmin] init OK — tokenstore saved to {TOKENSTORE} "
                     f"({'dir' if os.path.isdir(TOKENSTORE) else 'file'}).\n")
    return 0


def mode_pull():
    if not _tokenstore_present(TOKENSTORE) and not (os.environ.get("GARMIN_EMAIL") and os.environ.get("GARMIN_PASSWORD")):
        sys.stderr.write(f"[garmin] no tokenstore at {TOKENSTORE} and no creds set. "
                         "Run 'python3 garmin_sync.py --mode init' once on a TTY first.\n")
        return 2
    g = login()
    readings = pull_garmin(g)
    if not readings:
        sys.stderr.write(f"[garmin] 0 readings for last {DAYS} days — check the account/scale "
                         "sync or Garmin rate-limit. body_metrics not updated.\n")
        return 3
    n = store_readings(readings)
    sys.stderr.write(f"[garmin] synced {n} day(s) into body_metrics.\n")
    return 0


def mode_mock():
    """14-day demo into body_metrics. No network, no creds."""
    today = datetime.date.today()
    demo, w = [], 83.0
    for i in range(13, -1, -1):
        d = today - datetime.timedelta(days=i)
        demo.append(dict(date=d, source="garmin_api",
            weight_kg=round(w + (i % 3) * 0.15, 2),
            body_fat_pct=round(18.5 - i * 0.03, 2),
            body_water_pct=round(55.5 + i * 0.02, 1),
            muscle_mass_kg=round(34.2 + i * 0.01, 1),
            bone_mass_kg=round(3.1 + i * 0.002, 2),
            basal_met=round(1700 + i, 0),
            bmi=round(21.4 + (i % 3) * 0.1, 1)))
    n = store_readings(demo)
    sys.stderr.write(f"[garmin] MOCK wrote {n} demo day(s) into body_metrics.\n")
    return 0


if __name__ == "__main__":
    db.init_db()
    mode = "pull"
    if "--mode" in sys.argv:
        i = sys.argv.index("--mode")
        mode = sys.argv[i + 1] if i + 1 < len(sys.argv) else "pull"
    sys.exit({"init": mode_init, "pull": mode_pull, "mock": mode_mock, "watch": mode_watch}[mode]())
