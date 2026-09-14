#!/usr/bin/env python3
"""Hevy CSV import — ported from tracker.py's parse_hevy(). Free-plan Hevy has no API,
so the user drops weekly exports into hevy/inbox/*.csv by hand; this scans that dir and
upserts each set into hevy_sets. Re-importing the same file is a no-op: insert_hevy_set()
uses INSERT OR IGNORE against the same (date,title,exercise,set_index,set_type,weight_kg,
reps) key tracker.py used as its in-memory dedup dict key.
"""
import os, csv, re, glob, calendar, datetime

from .. import db

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HEVY_DIR = os.path.join(HERE, "hevy", "inbox")

ABB = {m: i + 1 for i, m in enumerate(calendar.month_abbr[1:])}


def _read_headered(path):
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


def parse_hevy(path):
    """Per-set rows from one Hevy export CSV. Same regex/field mapping as tracker.py."""
    hdr, rows = _read_headered(path)
    if not hdr:
        return []
    out = []
    for r in rows:
        m = re.match(r"(\d{1,2}) (\w{3}) (\d{4}),\s*([0-9:]+)", r.get("start_time", ""))
        if not m:
            continue
        d = datetime.date(int(m[3]), ABB[m[2].capitalize()], int(m[1]))
        reps = int(_num(r.get("reps")))
        weight = float(_num(r.get("weight_kg")))
        dur = int(_num(r.get("duration_seconds")))
        out.append(dict(date=d, ex=r.get("exercise_title", "").strip(),
                        reps=reps, weight=weight, load=weight * reps, dur=dur,
                        title=r.get("title", ""), sidx=r.get("set_index", ""),
                        settype=r.get("set_type", "")))
    return out


def import_dir(hevy_dir=None):
    """Scan hevy/inbox/*.csv, upsert every set into hevy_sets. Returns
    (files_scanned, sets_seen, sets_inserted)."""
    hevy_dir = hevy_dir or HEVY_DIR
    files = sorted(glob.glob(os.path.join(hevy_dir, "*.csv")))
    seen = 0
    new_count = 0
    for fp in files:
        for r in parse_hevy(fp):
            seen += 1
            _id, inserted = db.insert_hevy_set(
                date=r["date"].isoformat(), title=r["title"], exercise=r["ex"],
                set_index=r["sidx"], set_type=r["settype"], weight_kg=r["weight"],
                reps=r["reps"], duration_seconds=r["dur"], load_kg=r["load"],
                source="hevy_csv", imported_from=os.path.basename(fp))
            if inserted:
                new_count += 1
    return len(files), seen, new_count


if __name__ == "__main__":
    db.init_db()
    files, seen, inserted = import_dir()
    print(f"[hevy] scanned {files} file(s), {seen} set-row(s) parsed, {inserted} new row(s) inserted.")
