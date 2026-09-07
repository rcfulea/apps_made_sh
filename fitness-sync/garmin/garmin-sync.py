#!/usr/bin/env python3
"""
garmin-sync.py — pull the FULL Garmin body-composition record into garmin/weight.csv.

Modes
   --mode init   One-time bootstrap: logs in (prompts MFA via input) and saves a tokenstore
                 to GARMIN_TOKENSTORE. Run ONCE, on a machine where MFA can be answered.
   --mode pull   Scheduled/container run: restores from tokenstore, pulls the last GARMIN_DAYS
                 days, upserts weight.csv. No interaction. Safe to run daily.
   --mode mock   Writes a 14-day demo series so the pipeline can be tested with no network/creds.

Env
  GARMIN_EMAIL / GARMIN_PASSWORD    (used by --mode init)
  GARMIN_TOKENSTORE                tokenstore path (default: <dir of this file>/tokens.txt)
  GARMIN_DAYS                      lookback window in days for --mode pull (default 30)

Design notes
  * The Garmin body-composition record holds ~12 fields (weight, body fat %, body water %,
    visceral fat, bone mass, muscle mass, basal/active metabolism, metabolic age, physique
    rating, visceral-fat rating, BMI). The extractor grabs every field Garmin returns; the
    *writer* only emits a column that actually has data, and adds a column the moment a field
    starts being reported. So `visceral_fat` stays out while Garmin doesn't send it, and
    `bmi / body_water_pct / bone_mass_kg` appear automatically when they do — no edit required.
  * The data-call layer of garminconnect has NO 429/backoff handling: a single rate-limit
    aborts the whole pull. `_call` adds a small retry+backoff so a transient throttle becomes
    a wait-and-continue instead of a dead pull. (This is a reliability fix, not a cost fix —
    the LLM side runs locally and is free.)
  * Consumers read weight.csv by COLUMN NAME (see tracker.py load_weight, csv dict reader), so
    the header is allowed to grow/shrink safely.

Known Garmin Connect wire facts (observed 2026-08, garminconnect 0.3.2):
   * weight / mass fields are in GRAMS (e.g. 68349.0 g == 68.35 kg); percentages and ratings
     are raw numbers. Human weights 30-300 kg -> expect 30000..300000 g.
   * per-day comp lives in body_composition(...).dateWeightList[] (top-level fields,
     calendarDate string); some records nest the same fields under 'latestWeight'/'totalAverage'.
   * weigh_ins(...).dailyWeightSummaries[] nests the same fields too.
   * 'date' may be an epoch-millisecond timestamp or a calendarDate/summaryDate string.
"""
import os, sys, csv, datetime, collections, time, functools

HERE           = os.path.dirname(os.path.abspath(__file__))
WEIGH_CSV       = os.path.join(HERE, "weight.csv")
METRICS_CSV     = os.path.join(HERE, "metrics.csv")   # watch/recovery + activity, weekly-keyed
TOKENSTORE      = os.environ.get("GARMIN_TOKENSTORE", os.path.join(HERE, "tokens.txt"))
DAYS            = int(os.environ.get("GARMIN_DAYS", "30"))

# Canonical column order. Every DATA_FIELD is pulled; a column is WRITTEN only if it has
# >=1 populated value across the data being written, so empty fields (e.g. visceral_fat when
# Garmin omits it) stay off the sheet and new fields show up the day they arrive.
DATA_FIELDS = (
    "weight_kg", "body_fat_pct", "body_water_pct", "muscle_mass_kg", "bone_mass_kg",
    "visceral_fat", "visceral_fat_rating", "basal_met", "active_met",
    "metabolic_age", "physique_rating", "bmi",
)
KEYS = ("date", *DATA_FIELDS, "source")

# Garmin JSON key spellings per field. get_any() tries them in order, nested + top-level,
# and unit-normalises mass fields (>100 => grams -> kg). Robust on purpose: a wrong guess
# just stays empty (and the column gets dropped) rather than breaking the pull.
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
# mass fields: value >100 means it came in grams -> convert to kg
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
                # Only back off on things that may clear (throttle / transport / 4xx).
                if i < attempts - 1:
                    delay = base_delay * (2 ** i)
                    sys.stderr.write(f"[garmin] {method.__name__} {kind} (#{i + 1}); "
                                     f"retry in {delay:.0f}s...\n")
                    time.sleep(delay)
            # fallthrough
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
    as '' so the writer can decide column presence globally."""
    if not isinstance(rec, dict):
        return None

    def get(field):
        """Nested-first (latestWeight/totalAverage), then top-level — raw float or None."""
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

    # Date resolution: several possible keys, nested or top-level.
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
        # Without a date we can't upsert safely; skip unless we at least have a weight.
        w = get_any(FIELD_KEYS["weight_kg"], lambda v: v)
        if w is None:
            return None
        dt = datetime.date.today()

    out = {"date": dt, "source": "garmin_api"}
    for field, keys in FIELD_KEYS.items():
        if field in GRA_FIELDS:
            val = get_any(keys, lambda v: v / 1000.0 if v > 100 else v)   # grams -> kg
            out[field] = round(val, 2) if val is not None else ""
        else:
            rounder = lambda v, f=field: (round(v, 1)
                                          if f in ("body_fat_pct", "body_water_pct",
                                                   "visceral_fat", "visceral_fat_rating",
                                                   "metabolic_age", "bmi") else
                                          (round(v, 1) if f in ("muscle_mass_kg", "bone_mass_kg") else v))
            val = get_any(keys, lambda v: v)
            out[field] = rounder(val) if val is not None else ""
    return out


def pull_garmin(g):
    today = datetime.date.today()
    start = today - datetime.timedelta(days=DAYS)

    # Hardened calls: transient throttle -> back off and continue, never a dead pull.
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
    """Merge per-date, newest non-empty value wins per field."""
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


# ---------------------------------------------------------------- upsert weight.csv
def read_weight_named():
    """Read weight.csv mapping by HEADER NAME (forward- and backward-compatible)."""
    out = collections.OrderedDict()
    if not os.path.exists(WEIGH_CSV):
        return out
    with open(WEIGH_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))

    # Find header row (the one containing 'date' as first cell).
    hdr_i = None
    for i, raw in enumerate(rows):
        cells = [c.strip() for c in raw]
        if cells and cells[0].lower() == "date":
            hdr_i = i
            cols = {c.strip(): j for j, c in enumerate(cells) if c.strip()}
            break
    if hdr_i is None:
        return out

    for raw in rows[hdr_i + 1:]:
        if not any(c.strip() for c in raw):
            continue
        first = raw[0].strip()
        if first.startswith("#"):
            continue
        try:
            d = datetime.date.fromisoformat(first)
        except ValueError:
            continue
        rec = {"date": d, "source": "garmin_api"}
        for k, j in cols.items():
            if k == "date":
                continue
            rec[k] = raw[j].strip() if j < len(raw) else ""
        out[d] = rec
    return out


def _fmt(v):
    if v in (None, "", 0, 0.0):
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v) if v not in (None, "") else ""


def upsert(new_readings):
    by_date = read_weight_named()
    for r in new_readings:
        d = r["date"]
        merged = by_date.get(d, dict(date=d, source="garmin_api"))
        for k in DATA_FIELDS:
            v = r.get(k)
            if v not in (None, "", 0, 0.0):
                merged[k] = v
        merged["date"] = d
        merged.setdefault("source", "garmin_api")
        by_date[d] = merged

    # Active columns = DATA_FIELDS that have at least one populated value anywhere.
    active = [k for k in DATA_FIELDS if any(str(by_date[d].get(k, "")) not in ("", "0", "0.0")
                                            for d in by_date)]
    cols = ["date"] + active + ["source"]

    with open(WEIGH_CSV, "w", newline="", encoding="utf-8") as f:
        f.write(f"# Garmin-owned body-composition record. garmin-sync.py upserts by date "
                f"(latest reading wins). Do not edit by hand.\n")
        f.write("# source = one of: scale, user, garmin_api\n")
        f.write("# Columns are auto-managed: a field appears only when Garmin reports it, "
                "and drops when it stops. Present now: " + ", ".join(active) + "\n")
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for d in sorted(by_date):
            r = by_date[d]
            row = {"date": d.isoformat(),
                   "source": r.get("source", "garmin_api")}
            for k in active:
                row[k] = _fmt(r.get(k))
            w.writerow(row)
    return len(by_date), active


# ---------------------------------------------------------------- watch / recovery metrics
# These come from the WATCH. The headline recovery stack (sleep stages, HRV, training
# readiness) returns EMPTY on the current device — so we pull them but auto-drop them unless
# the device starts reporting. Signals that ARE populated on this watch:
#   weekly_steps       -> weekly total/avg steps + distance   (get_weekly_steps, range)
#   weekly_stress      -> weekly avg stress                    (get_weekly_stress, range)
#   resting_hr         -> daily resting HR                     (get_rhr_day.allMetrics)
#   active_kcal        -> daily active + total kilocalories    (get_user_summary)
#   body_battery       -> daily body-battery last value        (get_body_battery, range)
#   respiration        -> daily avg waking respiration         (get_respiration_data)
# metrics.csv is WEEK-keyed (ISO week) — it feeds the recovery block in tracker.py's rollout.
METRIC_KEYS = ("resting_hr", "steps_total", "steps_avg", "distance_m", "stress_avg",
               "active_kcal", "total_kcal", "body_battery", "respiration_avg")


def _iso_week(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _mean(vals):
    vals = [v for v in vals if isinstance(v, (int, float))]
    return sum(vals) / len(vals) if vals else None


def _extract_rhr(rec):
    """resting HR lives in allMetrics[].metricsMap['WELLNESS_RESTING_HEART_RATE'][].value."""
    am = rec.get("allMetrics")
    if isinstance(am, dict):
        mm = am.get("metricsMap", {})
        series = mm.get("WELLNESS_RESTING_HEART_RATE") or []
        for s in series:
            if isinstance(s, dict) and isinstance(s.get("value"), (int, float)):
                return float(s["value"])
    return None


def pull_metrics(g):
    """Produce a list of per-ISO-week rows for the watch/recovery signals.
    One pass over the most recent window; weekly endpoints cover 8 weeks, per-day endpoints
    fill the same weeks. Throttle-safe via _call. Returns [] safely on any endpoint error."""
    today = datetime.date.today()
    start = today - datetime.timedelta(days=56)       # 8 ISO weeks for the weekly endpoints
    weeks_out = collections.defaultdict(lambda: {"week": None})

    # --- weekly steps + weekly stress (range endpoints, ~2 calls for 8 weeks each) ---
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

    # --- body battery range: last value per day -> current week mean ---
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

    # --- per-day endpoints: resting HR, daily activity, respiration (14 days, ~42 calls) ---
    for n in range(13, -1, -1):
        d = today - datetime.timedelta(days=n)
        wk_iso = _iso_week(d)
        # resting HR (daily)
        try:
            rec = _call(g.get_rhr_day, attempts=2, base_delay=3.0)(d.isoformat()) or {}
            hr = _extract_rhr(rec)
            if hr:
                weeks_out[wk_iso].setdefault("_rhr_days", []).append(hr)
        except Exception as e:
            sys.stderr.write(f"[metrics] rhr {d} err {type(e).__name__}\n")
        time.sleep(0.8)
        # daily activity: active + total kcal (steps/distance come ONLY from the weekly
        # endpoint, so the per-week step metrics stay in consistent weekly-total units)
        try:
           u = _call(g.get_user_summary, attempts=2, base_delay=3.0)(d.isoformat()) or {}
           for jk, src in (("active_kcal", "activeKilocalories"),
                            ("total_kcal", "totalKilocalories")):
               if isinstance(u.get(src), (int, float)):
                   weeks_out[wk_iso].setdefault(f"_day_{jk}", []).append(float(u[src]))
        except Exception as e:
            sys.stderr.write(f"[metrics] user_summary {d} err {type(e).__name__}\n")
        time.sleep(0.8)
        # respiration: avg waking (fall back to avg sleep if none)
        try:
            r = _call(g.get_respiration_data, attempts=2, base_delay=3.0)(d.isoformat()) or {}
            avg = r.get("avgWakingRespirationValue") or r.get("avgSleepRespirationValue")
            if isinstance(avg, (int, float)):
                weeks_out[wk_iso].setdefault("_res_days", []).append(float(avg))
        except Exception as e:
            sys.stderr.write(f"[metrics] respiration {d} err {type(e).__name__}\n")
        time.sleep(0.8)

    # collapse per-day lists -> weekly averages, strip temp keys
    rows = []
    for wk_iso, w in weeks_out.items():
        for dk, key in (("_rhr_days", "resting_hr"), ("_bb_days", "body_battery")):
            lst = w.pop(dk, None)
            if lst:
                w[key] = round(_mean(lst), 1)
        for jk in ("steps_total", "active_kcal", "total_kcal"):
            lst = w.pop(f"_day_{jk}", None)
            if lst:
                w[jk] = round(_mean(lst), 1)
        lst = w.pop("_res_days", None)
        if lst:
            w["respiration_avg"] = round(_mean(lst), 1)
        w["week"] = wk_iso
        rows.append(w)
    return rows


def load_metrics():
    """Read metrics.csv mapping by header NAME (forward/backward compatible)."""
    out = collections.OrderedDict()
    if not os.path.exists(METRICS_CSV):
        return out
    with open(METRICS_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    hdr_i = None
    for i, raw in enumerate(rows):
        cells = [c.strip() for c in raw]
        if cells and cells[0].lower() == "week":
            hdr_i = i
            cols = {c.strip(): j for j, c in enumerate(cells) if c.strip()}
            break
    if hdr_i is None:
        return out
    for raw in rows[hdr_i + 1:]:
        if not any(c.strip() for c in raw):
            continue
        first = raw[0].strip()
        if first.startswith("#"):
            continue
        rec = {"week": first}
        for k, j in cols.items():
            if k == "week":
                continue
            rec[k] = raw[j].strip() if j < len(raw) else ""
        out[first] = rec
    return out


def upsert_metrics(new_rows):
    by_wk = load_metrics()
    for r in new_rows:
        wk = r["week"]
        merged = by_wk.get(wk, {"week": wk})
        for k in METRIC_KEYS:
            v = r.get(k)
            if v not in (None, "", 0, 0.0):
                merged[k] = v
        by_wk[wk] = merged

    active = [k for k in METRIC_KEYS if any(str(by_wk[w].get(k, "")) not in ("", "0", "0.0")
                                            for w in by_wk)]
    cols = ["week"] + active
    with open(METRICS_CSV, "w", newline="", encoding="utf-8") as f:
        f.write("# Watch/recovery + activity, ISO-week-keyed. garmin-sync.py --mode watch upserts "
                "(latest wins). Do not edit by hand.\n")
        f.write("# Columns auto-managed: a signal appears when the watch reports it, drops when it "
                "stops (e.g. sleep/HRV are empty on this device and stay off the sheet).\n")
        f.write("# Present now: " + ", ".join(active) + "\n")
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for wk in sorted(by_wk):
            r = by_wk[wk]
            row = {"week": wk}
            for k in active:
                row[k] = _fmt(r.get(k))
            w.writerow(row)
    return len(by_wk), active


def mode_watch():
    if not _tokenstore_present(TOKENSTORE) and not (os.environ.get("GARMIN_EMAIL") and os.environ.get("GARMIN_PASSWORD")):
        sys.stderr.write(f"[metrics] no tokenstore at {TOKENSTORE} and no creds set. "
                          "Run 'python3 garmin-sync.py --mode init' once on a TTY first.\n")
        return 2
    g = login()
    rows = pull_metrics(g)
    n, active = upsert_metrics(rows)
    if not rows:
        sys.stderr.write("[metrics] no watch data returned this run; metrics.csv not rewritten.\n")
        return 3
    sys.stderr.write(f"[metrics] synced {len(rows)} week(s); metrics.csv now holds {n} week(s). "
                     f"Active columns: {', '.join(active) if active else '(none populated)'}\n")
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
                         "Run 'python3 garmin-sync.py --mode init' once on a TTY first.\n")
        return 2
    g = login()
    readings = pull_garmin(g)
    if not readings:
        sys.stderr.write(f"[garmin] 0 readings for last {DAYS} days — check the account/scale "
                         "sync or Garmin rate-limit. weight.csv not rewritten.\n")
        return 3
    n, active = upsert(readings)
    written = active or DATA_FIELDS[:1]
    sys.stderr.write(f"[garmin] synced {len(readings)} new day(s); weight.csv now holds {n} "
                     f"day(s). Active columns: {', '.join(written)}\n")
    return 0


def mode_mock():
    """14-day demo with a FULL field set (weight, fat, water, muscle, bone, bmi, basal met)
    but deliberately NO visceral_fat, to prove the adaptive writer drops the empty column and
    includes the new ones. No network, no creds."""
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
            visceral_fat="",            # simulate Garmin not sending it
            basal_met=round(1700 + i, 0),
            bmi=round(21.4 + (i % 3) * 0.1, 1)))
    n, active = upsert(demo)
    sys.stderr.write(f"[garmin] MOCK wrote {len(demo)} demo day(s) -> {n} row(s). "
                     f"Active columns: {', '.join(active)}\n")
    return 0


if __name__ == "__main__":
    mode = "pull"
    if "--mode" in sys.argv:
        i = sys.argv.index("--mode")
        mode = sys.argv[i + 1] if i + 1 < len(sys.argv) else "pull"
    sys.exit({"init": mode_init, "pull": mode_pull, "mock": mode_mock, "watch": mode_watch}[mode]())
