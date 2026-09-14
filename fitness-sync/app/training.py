"""Progressive-overload helpers over hevy_sets — PR detection (Hevy's core mechanic),
a "close to a PR" nudge, last-session lookup, and plateau detection (a gap even Hevy
itself doesn't cover per the research behind this feature). All computed on the fly,
nothing stored — same philosophy as rollup.py/readiness.py.
"""
from . import db

PLATEAU_SESSIONS = 5  # no weight improvement across this many sessions -> flagged
CLOSE_TO_PR_PCT = 0.95


def _epley_1rm(weight, reps):
    """Epley formula — the standard estimated-1RM used by Hevy/Strong-style apps."""
    if not weight or not reps:
        return 0.0
    return weight * (1 + reps / 30.0)


def sets_with_pr_flags(exercise=None):
    """Every hevy_sets row (optionally filtered to one exercise), annotated with
    is_weight_pr / is_1rm_pr / est_1rm — is it the best weight/estimated-1RM for that
    exercise as of that date, in chronological order. Global PR status still needs the
    full unfiltered history, so filter AFTER calling this if you need one exercise."""
    rows = sorted(db.list_hevy_sets(), key=lambda r: (r["date"], r["id"]))
    best_weight, best_1rm = {}, {}
    out = []
    for r in rows:
        ex = r["exercise"]
        w = r.get("weight_kg") or 0.0
        rm = _epley_1rm(w, r.get("reps") or 0)
        r = dict(r)
        r["est_1rm"] = round(rm, 1)
        r["is_weight_pr"] = w > 0 and w > best_weight.get(ex, 0.0)
        r["is_1rm_pr"] = rm > 0 and rm > best_1rm.get(ex, 0.0)
        best_weight[ex] = max(best_weight.get(ex, 0.0), w)
        best_1rm[ex] = max(best_1rm.get(ex, 0.0), rm)
        out.append(r)
    if exercise:
        out = [r for r in out if r["exercise"] == exercise]
    return out


def exercise_summary():
    """Per-exercise: all-time best weight/1RM, last session's top set, and
    close-to-PR / plateau signals. One row per exercise, most-recently-trained first."""
    flagged = sets_with_pr_flags()
    by_ex = {}
    for r in flagged:
        by_ex.setdefault(r["exercise"], []).append(r)

    out = []
    for ex, sets in by_ex.items():
        best_weight = max((r["weight_kg"] or 0) for r in sets)
        best_1rm = max(r["est_1rm"] for r in sets)
        session_dates = sorted({r["date"] for r in sets})
        session_best = [max((r["weight_kg"] or 0) for r in sets if r["date"] == d) for d in session_dates]

        last_date = session_dates[-1]
        last_session_sets = [r for r in sets if r["date"] == last_date]
        last_top = max(last_session_sets, key=lambda r: r["est_1rm"])

        plateau = (len(session_best) > PLATEAU_SESSIONS and
                   max(session_best[-PLATEAU_SESSIONS:]) <= session_best[-PLATEAU_SESSIONS - 1])
        close_to_pr = bool(best_1rm and last_top["est_1rm"] >= best_1rm * CLOSE_TO_PR_PCT
                            and not last_top["is_1rm_pr"])

        out.append({
            "exercise": ex, "best_weight_kg": round(best_weight, 1), "best_1rm": round(best_1rm, 1),
            "last_date": last_date, "last_top_weight_kg": last_top["weight_kg"],
            "last_top_reps": last_top["reps"], "sessions_logged": len(session_dates),
            "plateau": plateau, "close_to_pr": close_to_pr,
            "last_top_is_pr": bool(last_top["is_weight_pr"] or last_top["is_1rm_pr"]),
        })
    return sorted(out, key=lambda r: r["last_date"], reverse=True)


def last_session_for(exercise):
    rows = [r for r in exercise_summary() if r["exercise"] == exercise]
    return rows[0] if rows else None
