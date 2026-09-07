#!/usr/bin/env python3
"""
Body + Hevy weekly rollup.

Three data sources, joined by ISO week:
  hevy/inbox/*.csv   -> YOU drop here weekly (free-plan manual export, 2 taps in the app).
                       Per-set rows; volume (weight_kg * reps) summed per muscle-group.
  garmin/weight.csv  -> garmin-sync.py writes this: date, weight_kg, body_fat_pct, ...
                       The 7-DAY MOVING AVERAGE of weight_kg is the body signal (never read daily).
  body.csv           -> YOU fill daily: mini_meals_hit (protocol check), protein_g (rough), note.

Output:
  rollout.csv -> one row per ISO week with per-group volume (tonnes), the weight 7-day MA at
                week end, running minutes, and the meal protocol check. This is the
                "did weight AND load both move?" view.

Run:  python3 tracker.py            (reads hevy/ + garmin/weight.csv + body.csv, writes rollout.csv)
"""
import csv, re, datetime, calendar, collections, os, glob, sys

HERE       = os.path.dirname(os.path.abspath(__file__))
HEVY_DIR   = os.path.join(HERE, "hevy", "inbox")
BODY_CSV   = os.path.join(HERE, "body.csv")
WEIGHT_CSV = os.path.join(os.path.join(HERE, "garmin"), "weight.csv")
METRICS_CSV = os.path.join(os.path.join(HERE, "garmin"), "metrics.csv")
ROLLOUT    = os.path.join(HERE, "rollout.csv")

# watch/recovery signals that go into the recovery block of the rollout (read from metrics.csv
# by name; absent ones simply render as "—" so a signal that isn't reported never breaks a row)
RECOVERY = ["resting_hr", "steps_avg", "distance_m", "stress_avg", "active_kcal",
            "total_kcal", "body_battery", "respiration_avg"]

ABB = {m: i+1 for i, m in enumerate(calendar.month_abbr[1:])}

# ---------------------------------------------------------------- muscle-group map
def groups(ex):
    e = ex.lower()
    if ex == "Running" or e == "running":
        return {"Cardio"}
    out = set()
    if "deadlift" in e or "squat" in e or "lunge" in e or "calf" in e or "leg" in e: out.add("Lower Body")
    if any(k in e for k in ["floor press","chest press","fly","chest","press"]): out.add("chest")
    if "overhead" in e or "shoulder press" in e: out.add("front_delts")
    if "front raise" in e: out.add("front_delts")
    if "lateral" in e or "side raise" in e: out.add("side_delts")
    if "rear delt" in e or "reverse fly" in e: out.add("rear_delts")
    if any(k in e for k in ["row","pullover"]): out.add("back")
    if "tricep" in e or "extension" in e: out.add("triceps")
    if "curl" in e: out.add("biceps")
    if "shrug" in e: out.add("traps")
    if any(k in e for k in ["plank","russian twist","dead bug","renegade"]): out.add("core")
    return out

PRIMARY = ["Chest","Front Delts","Side Delts","Rear Delts","Back","Triceps","Biceps","Traps","Core","Lower Body"]
KEY = {"Chest":["chest"],"Front Delts":["front_delts"],"Side Delts":["side_delts"],
       "Rear Delts":["rear_delts"],"Back":["back"],"Triceps":["triceps"],"Biceps":["biceps"],
       "Traps":["traps"],"Core":["core"],"Lower Body":["Lower Body"]}
MAIN_LIFTS = ["Floor Press (Dumbbell)","Shoulder Press (Dumbbell)","Bent Over Row (Dumbbell)",
              "Dumbbell Row","Deadlift (Dumbbell)","Front Raise (Dumbbell)","Decline Chest Fly (Dumbbell)",
              "Triceps Kickback (Dumbbell)","Bicep Curl (Dumbbell)","Concentration Curl"]

# ---------------------------------------------------------------- csv reader
def _read_headered(path):
    """Return (headers, list-of-dict-rows). Skips blank lines and '#'-comment lines.
    First non-comment row is treated as the header."""
    if not os.path.exists(path):
        return [], []
    hdr = None
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for raw in csv.reader(f):
            if not any(c.strip() for c in raw):
                continue
            first = raw[0].strip()
            if first.startswith("#"):
                continue
            if hdr is None:
                hdr = [h.strip() for h in raw]
                continue
            rec = {}
            for i, key in enumerate(hdr):
                rec[key] = raw[i].strip() if i < len(raw) else ""
            rows.append(rec)
    return hdr, rows

def _num(s):
    s = (s or "").strip()
    if s == "" or s == "—":
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0

# ---------------------------------------------------------------- hevy
def parse_hevy(path):
    hdr, rows = _read_headered(path)
    if not hdr:
        return []
    out = []
    for r in rows:
        m = re.match(r"(\d{1,2}) (\w{3}) (\d{4}),\s*([0-9:]+)", r.get("start_time",""))
        if not m:
            continue
        d = datetime.date(int(m[3]), ABB[m[2].capitalize()], int(m[1]))
        reps = int(_num(r.get("reps")))
        weight = float(_num(r.get("weight_kg")))
        dur = int(_num(r.get("duration_seconds")))
        out.append(dict(date=d, ex=r.get("exercise_title","").strip(),
                        reps=reps, weight=weight, load=weight*reps, dur=dur,
                        title=r.get("title",""), sidx=r.get("set_index",""),
                        settype=r.get("set_type","")))
    return out

def wkey(d):
    y, w, _ = d.isocalendar(); return f"{y}-W{w:02d}"

# ---------------------------------------------------------------- body-side join
def load_weight(path):
    """garmin/weight.csv -> {date -> {weight_kg, comp...}}"""
    _, rows = _read_headered(path)
    out = collections.OrderedDict()
    for r in rows:
        ms = re.match(r"(\d{4})-(\d{2})-(\d{2})", r.get("date",""))
        if not ms:
            continue
        d = datetime.date(int(ms[1]), int(ms[2]), int(ms[3]))
        out[d] = dict(weight_kg=_num(r.get("weight_kg")),
                       body_fat_pct=_num(r.get("body_fat_pct")),
                       muscle_mass=_num(r.get("muscle_mass_kg")),
                       visceral_fat=_num(r.get("visceral_fat")))
    return dict(sorted(out.items(), key=lambda kv: kv[0]))

def load_meals(path):
    """body.csv -> {date -> {meals_hit(bool), protein_g(float), note}}"""
    _, rows = _read_headered(path)
    out = {}
    for r in rows:
        ms = re.match(r"(\d{4})-(\d{2})-(\d{2})", r.get("date",""))
        if not ms:
            continue
        d = datetime.date(int(ms[1]), int(ms[2]), int(ms[3]))
        mh = r.get("mini_meals_hit","").strip().lower()
        out[d] = dict(meals_hit = mh not in ("", "0", "no", "n", "false", "false"),
                       protein_g = _num(r.get("protein_g")),
                       note = r.get("note", ""))
    return out

def load_metrics():
    """garmin/metrics.csv -> {ISO-week string -> signal dict}. Read by header NAME so
    the watch file can grow/shrink its columns without breaking the tracker. Missing file
    or absent signal => an empty cell — never an error."""
    out = {}
    if not os.path.exists(METRICS_CSV):
        return out
    with open(METRICS_CSV, newline="", encoding="utf-8") as f:
        rows = []
        hdr = None
        for raw in csv.reader(f):
            if not any(c.strip() for c in raw):
                continue
            first = raw[0].strip()
            if first.startswith("#"):
                continue
            if hdr is None:
                hdr = [h.strip() for h in raw]
                continue
            rec = {}
            for i, key in enumerate(hdr):
                rec[key] = raw[i].strip() if i < len(raw) else ""
            if re.match(r"(\d{4})-W(\d{2})", rec.get("week", "")):
                out[rec["week"]] = rec
    return out

def seven_day_moving_avg(weight_by_date, at):
    """7-day trailing mean over weight series, forward-filled to date `at` (nearest date on/before)."""
    series = [(d, v["weight_kg"]) for d, v in weight_by_date.items() if v.get("weight_kg")]
    if not series:
        return 0.0
    for i in range(len(series)-1, -1, -1):
        if series[i][0] <= at:
            window = [series[j][1] for j in range(max(0, i-6), i+1)]
            return sum(window)/len(window)
    return 0.0

# ---------------------------------------------------------------- rollup
def build_rollout():
    files = sorted(glob.glob(os.path.join(HEVY_DIR, "*.csv")))
    dedup = {}
    for fp in files:
        for r in parse_hevy(fp):
            k = (r["date"], r["title"], r["ex"], r["sidx"], r["settype"], r["weight"], r["reps"])
            dedup[k] = r                       # incl sidx so real sets survive; re-dropped files collapse
    rows = list(dedup.values())

    byweek = collections.defaultdict(lambda: collections.defaultdict(float))
    lift_wk = collections.defaultdict(lambda: [0.0, 0])
    cardio  = collections.defaultdict(int)
    hevy_dates = set()
    for r in rows:
        wk = wkey(r["date"]); hevy_dates.add(r["date"])
        for g in groups(r["ex"]):
            if g == "Cardio":
                cardio[wk] += r["dur"]
            else:
                byweek[wk][g] += r["load"]
        lw = lift_wk[wk + "|" + r["ex"]]; lw[0] = max(lw[0], r["weight"]); lw[1] += 1

    weight_by_date = load_weight(WEIGHT_CSV)
    meals_by_date   = load_meals(BODY_CSV)
    metrics_by_week = load_metrics()
    weight_dates = set(weight_by_date); meal_dates = set(meals_by_date)

    all_dates = hevy_dates | weight_dates | meal_dates
    all_wks   = {w for w in ( {wkey(d) for d in all_dates} )} | set(metrics_by_week.keys())
    weeks = sorted(all_wks)

    out_rows = []
    for wk in weeks:
        wk_hevy = [d for d in hevy_dates if wkey(d) == wk]
        wk_all  = [d for d in all_dates if wkey(d) == wk]
        wk_end  = max(wk_all, default=None)
        wk_meal_rows = [meals_by_date[d] for d in (meal_dates & set(wk_all))]
        rec = {"week": wk,
               "from": (min(wk_hevy).isoformat() if wk_hevy else (min(wk_all).isoformat() if wk_all else "—")),
                "to":    max(wk_hevy).isoformat() if wk_hevy else (max(wk_all).isoformat() if wk_all else "—"),
                "sessions": len({r["date"] for r in rows if wkey(r["date"]) == wk})}
        for label in PRIMARY:
            tot = sum(byweek[wk][k] for k in KEY[label])
            rec[label] = round(tot/1000, 3) if tot else 0.0
        for ex in MAIN_LIFTS:
            lw = lift_wk.get(wk + "|" + ex)
            rec["lift_" + re.sub(r"[^A-Za-z]", "_", ex)] = f"{lw[0]:.0f}/{lw[1]}" if lw and lw[1] else "—"
        rec["running_min"] = round(cardio.get(wk, 0)/60) or 0
        rec["weight_7d_MA_kg"] = round(seven_day_moving_avg(weight_by_date, wk_end), 2) if wk_end else 0.0
        rec["meals_logged_days"] = len(wk_meal_rows)
        rec["mini_meals_target_met"] = sum(1 for m in wk_meal_rows if m.get("meals_hit"))
        prots = [m["protein_g"] for m in wk_meal_rows if m.get("protein_g")]
        rec["protein_avg_g"] = round(sum(prots)/len(prots), 0) if prots else 0
         # recovery block — watch signals for this ISO week; "" -> renders as "—", never an error
        m = metrics_by_week.get(wk, {})
        for sig in RECOVERY:
            v = m.get(sig, "")
            rec["rv_" + sig] = v if str(v).strip() not in ("", "0") else "—"
        out_rows.append(rec)
    write_rollout(out_rows)
    return out_rows, weeks

# field order for rollout (stable, human-readable). Order: lift loads -> body -> recovery
FIELDNAMES = (["week","from","to","sessions"] + PRIMARY +
              ["weight_7d_MA_kg","body_fat_pct_avg","running_min","meals_logged_days",
               "mini_meals_target_met","protein_avg_g"] +
             [ "rv_" + s for s in RECOVERY] +
              ["lift_" + re.sub(r"[^A-Za-z]", "_", ex) for ex in MAIN_LIFTS])
RECOVERY_LABEL = {s: s.replace("_", " ") for s in RECOVERY}

def _body_fat_avg(weight_by_date, wk):
    """Avg body-fat % logged in this week (from garmin/weight.csv). 0 if none."""
    vals = [v["body_fat_pct"] for d, v in weight_by_date.items()
            if wkey(d) == wk and v.get("body_fat_pct")]
    return round(sum(vals)/len(vals), 1) if vals else 0

def write_rollout(rows_in):
    rows = []
    wbd = load_weight(WEIGHT_CSV)
    for rec in rows_in:
        wk = rec["week"]
        rec["body_fat_pct_avg"] = _body_fat_avg(wbd, wk)
        rows.append(rec)
    with open(ROLLOUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else None
    if path:
        # allow parsing a single export into a quick preview
        print("Parsing", path, "->")
        for r in parse_hevy(path):
            print("  ", r["date"], r["ex"], r["weight"], "x", r["reps"], "load=%.0f" % r["load"])
    print("Rollout written ->", ROLLOUT)
    out_rows, weeks = build_rollout()
    print(f"weeks covered: {', '.join(w[3:] for w in weeks)}  ({len(weeks)} total)\n")
    hdr = ["Week","S","W7dMA"] + PRIMARY + ["run"]
    print("{:<7}{:>3}{:>8}".format(hdr[0], hdr[1], hdr[2]) +
          "".join(f"{p:>8}" for p in PRIMARY) + f"{'run':>6}")
    for r in out_rows:
        print("{:<7}{:>3}{:>8}".format(r["week"][3:], str(r["sessions"]),
              f'{r["weight_7d_MA_kg"]:.1f}') +
                "".join(f"{r[p]:>8.1f}" if r[p] else f'{"—":>8}' for p in PRIMARY) +
              f"{str(r['running_min'])+'m':>6}")
     # recovery block — watch signals for each week (only print when any signal present)
    rv_cols = ["rv_" + s for s in RECOVERY]
    if any(any(str(r.get(c, "—")) != "—" for c in rv_cols) for r in out_rows):
        labels = [RECOVERY_LABEL[s][:6] for s in RECOVERY]
        print("\n-- recovery (weekly watch signals) --")
        print("{:<10}".format("Week") + "".join(f"{lb:>8}" for lb in labels))
        for r in out_rows:
            if any(str(r.get("rv_"+s, "—")) != "—" for s in RECOVERY):
                vals = [r.get("rv_"+s, "—") for s in RECOVERY]
                print("{:<10}".format(r["week"][3:]) +
                    "".join(f"{str(v)[:7].center(8)}" for v in vals))

