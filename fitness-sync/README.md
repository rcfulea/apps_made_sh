# fitness-sync — body + training tracker, API + web UI

Free-plan setup. **Garmin is automatic; Hevy is a 2-tap weekly drop; meals are a
daily fill (or use the web UI).** SQLite is the single source of truth; a FastAPI
backend serves both a web dashboard and a plain REST API your local LLM can read,
analyze, and write back to (new readings, corrections, and its own notes).

## What runs where

| source | who fills it | how | automated? |
|---|---|---|---|
| `body_metrics` (weight, body comp) | the container | `garmin/garmin_sync.py --mode pull` → Garmin Connect (tokenstore) | ✅ every 6h |
| `watch_metrics` (recovery signals) | the container | `garmin_sync.py --mode watch` → resting HR, active/total kcal, stress, body battery, respiration, steps, SpO2, floors, VO2max, fitness age, HRV (once you start logging HRV reports) | ✅ every 6h |
| `hevy_sets` | **you** | Hevy app → Profile → Export Data → upload the CSV on `/workouts` (or drop it into `hevy/inbox/` and click "Re-scan") | ⚠️ manual, ~weekly |
| `daily_log` (meal plan) | **you** | web UI (`/meal-plan` — tap-to-check Breakfast/Lunch/Dinner/Snack) or `PUT /api/meal-plan/{date}` | ⚠️ manual, daily |
| `body_measurements` | **you** | web UI (`/measurements`) or `PUT /api/measurements/{date}` — tape-measure only, Garmin never reports these | ⚠️ manual, occasional |
| `notes` | you or your LLM | web UI (`/notes`) or `POST /api/notes` (`author: "user"` or `"llm"`) | as needed |

All of it lives in one SQLite file, `data/fitness.db`. Nothing is CSV-based anymore —
see "Migrating from the old CSV layout" below if you're coming from a pre-2026-09
checkout of this repo.

## The token lives here, not in the repo

Garmin auth is a **tokenstore**: `garmin/tokens.txt/garmin_tokens.json` — a
directory on this box (a plain file on others; the entrypoint uses `-e`, not
`-f`, so both work). It is **gitignored and dockerignored**. The container never
sees your password after the one-time `--mode init`; it only ever reloads the
opaque token.

## Auth

The web UI and the API share one HTTP Basic credential (`AUTH_USER`/`AUTH_PASSWORD`
in `.env`) — this is a single-person app, not a multi-user system. **Both are
required**: the app returns 503 on every request if they're unset. Your local LLM
needs to send the same credential (`curl -u user:pass ...`, or your HTTP client's
basic-auth option) on every call.

## 3-step start (on your Docker / podman host)

> `docker` and `podman` both speak the compose v2 format; use whichever is on the host.

1. **Config + one-time auth** (auth handles MFA once, then silent):
    ```bash
    cp .env.example .env          # fill AUTH_USER / AUTH_PASSWORD — required
    # first run only, on THIS host, to populate the tokenstore:
    podman run --rm -it --net host -v "$PWD":/app fitness-sync:latest \
        python3 garmin/garmin_sync.py --mode init      # or: docker run --rm -it --net host ...
    ```
   That logs in with MFA once and writes the token to `garmin/tokens.txt/`.
2. **Start the service:**
    ```bash
    podman compose up -d          # or: docker compose up -d
    podman logs -f fitness-sync
    ```
3. **Open the web UI** at `http://<host>:8000/` (basic-auth prompt uses the
   `AUTH_USER`/`AUTH_PASSWORD` from step 1). Weigh yourself, log meals, drop Hevy
   exports into `hevy/inbox/` — or do all three from the UI.

## Web UI

| page | what it's for |
|---|---|
| `/` | dashboard — weight/muscle-group charts, quick meal-check + quick weight-log for today, pinned latest LLM note, sync status |
| `/meal-plan` | tap-to-check Breakfast/Lunch/Dinner/Snack for today, weekly adherence %, protein-vs-goal, 14-day streak grid, note |
| `/body-metrics` | view Garmin scale readings (weight, body fat/water %, muscle, bone, BMI), add a manual reading or correct a day — rarely-populated fields (visceral fat, met rates, etc.) tucked behind a disclosure |
| `/measurements` | manual tape-measure entries (neck, shoulders, chest, waist, hips; bicep/forearm/thigh/calf each split left+right) — Garmin never reports these; shows delta since your last measurement + a trend chart |
| `/health` | Readiness score + trend charts (resting HR, sleep score, VO2max) up top; the full 16-column weekly table is collapsed behind a disclosure — use `/analytics` for anything deeper |
| `/workouts` | Hevy import status, upload/re-scan, browse/add sets filtered by exercise and date range, PR badges, plateau callout, last-session hint while adding a set |
| `/notes` | your notes + LLM-authored insights (badged), edit-in-place |

Nav: `Meal Plan` and `Analytics` (the daily-use pages) stay flat; everything else sits
under **More**.

Has a web manifest + icons, so on a phone you can "Add to Home Screen" and open it like
an app — useful since `/meal-plan` is meant to be a daily habit, not a bookmark.

## API — for the web UI and your local LLM alike

Full interactive docs (and the schema an LLM needs to call this correctly) live at
`/docs` once the container is running. Everything is JSON over `/api/*`:

```
GET/PUT/DELETE  /api/body-metrics[/{date}]        Garmin scale + body comp
GET/PUT         /api/watch-metrics[/{week}]        watch recovery signals
GET/POST/PUT/DELETE /api/workouts[/{id}]            Hevy sets; POST /api/workouts/import re-scans hevy/inbox/
GET/PUT         /api/meal-plan[/{date}]              4 meal checkboxes + protein/note
GET/PUT/DELETE  /api/measurements[/{date}]            manual tape-measure entries
GET/POST/PUT/DELETE /api/notes[/{id}]                LLM- and user-authored insights
GET             /api/rollup/weeks[/{week}]           the old rollout.csv view, computed live
GET             /api/trend/weight                    daily weight + 7-day MA (chart source)
GET             /api/trend/muscle-groups             per-group weekly tonnage (chart source)
GET             /api/summary                         one-shot latest snapshot — good LLM starting context
GET             /api/sync/status   POST /api/sync/run
GET             /api/export                              full JSON snapshot of every table
POST            /api/backup                               on-demand DB backup (also runs once/day automatically)
GET             /api/readiness[/latest]                   composite 0-100 readiness score (Oura-style: recent
                                                           value vs trailing baseline, averaged across HRV/RHR/
                                                           sleep/stress/body-battery) — null until enough history
GET             /api/training/summary                     per-exercise PR/plateau/close-to-PR status
GET             /api/training/last-session?exercise=       last session's top set for one exercise
```

**Readiness score**: computed on the fly from `watch_metrics`, never stored — needs
`>=2` prior weeks per signal to have a baseline, `>=2` signals available to produce a
score, otherwise it's `null` rather than a fabricated number.

**Progressive overload** (`/workouts`, `app/training.py`): every set is checked against
its exercise's all-time-best weight and estimated-1RM (Epley formula) to flag a PR;
`sessions_logged` capped at no improvement in 5 sessions flags a plateau; a top set
within 95% of the all-time best-1RM (but not itself a PR) gets a "close to a PR" nudge.

**Adaptive protein target** (`/meal-plan`): auto-scales to `weight_7d_MA_kg × 1.8`
(recalibrating as your trend weight moves, MacroFactor's spirit) unless you set a
manual override; clear the override field to fall back to auto.

**Push notifications**: set `NTFY_URL` (see `.env.example`) to a ntfy.sh/self-hosted
topic and the sync loop pings it on a new PR, a readiness dip (score `<35` or a
`>=15`-point week-over-week drop), or a broken meal streak (a day under 4/4 checks
right after 3 full days). Entirely optional — unset means silent, nothing requires it.

Example — a local LLM checking in and leaving a note:
```bash
curl -u "$AUTH_USER:$AUTH_PASSWORD" http://<host>:8000/api/summary
curl -u "$AUTH_USER:$AUTH_PASSWORD" "http://<host>:8000/api/trend/weight?from=2026-08-01"
curl -u "$AUTH_USER:$AUTH_PASSWORD" -X POST http://<host>:8000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"author":"llm","title":"Week check-in","body":"Weight 7d MA flat, chest volume down — consider adding a set.","related_week":"2026-W38"}'
```

For a fuller agent setup (read everything, interpret trends, recommend program/meal-plan
changes, write findings back as notes) see `docs/hermes_system_prompt.md` — a ready-to-paste
system prompt for a tool-calling local model (written for Ollama + a Hermes model, but the
endpoint list applies to any agent that can make HTTP calls).

`PUT` endpoints are **merge-upsert**: only the fields you send overwrite; fields you
omit keep their existing value (see `app/db.py`'s `_merge_upsert`) — this is the same
"newest non-empty value wins" behavior the old CSV writer had, now per-field and
transactional instead of whole-file.

## Deploy two ways (same descriptors as before, updated for the web service)

- **generic bind-mount host** — `docker-compose.yml`: `docker compose up -d` (or
  `podman compose up -d`). Whole repo tree bind-mounted at `/app`; `data/fitness.db`
  persists there alongside the old CSV paths.
- **Portainer / swarm, no host bind mount** — `docker-stack.yml`: everything (DB,
  tokenstore, Hevy inbox) lives in the named volume `fitness-sync-data` instead, for
  hosts (like an LXC) with no filesystem to share. Paste the file into a Portainer
  stack, set `AUTH_USER`/`AUTH_PASSWORD` (and optionally `HOST_PORT`) under the
  stack's **Environment variables** — never hardcode the password into the file
  itself, since it's committed to the repo. `docker stack deploy -c docker-stack.yml
  fitness-sync` works the same way from the CLI.

Both need `ports` open now (default container port `8000`) since this is a live
service, not a background-only container.

## Migrating from the old CSV layout

If you have an older checkout with real data in `garmin/weight.csv`,
`garmin/metrics.csv`, `body.csv`, or `hevy/inbox/*.csv`, run once:
```bash
python3 migrate_csv_to_sqlite.py
```
It upserts every row into `data/fitness.db` and **never touches or deletes the
CSVs** — safe to re-run, and the CSVs stay as a rollback copy. Verify with a quick
row-count sanity check (`wc -l garmin/weight.csv` vs. the printed `body_metrics: N
row(s)`, etc.).

## Discovering new Garmin fields

`explore_garmin.py` logs into your real account (reuses the tokenstore) and probes
~40 garminconnect endpoints read-only, writing nothing to the DB — useful whenever
Garmin adds something new or you want to check what's actually populated for your
device before wiring it into the schema. `python3 explore_garmin.py`; full raw output
goes to `garmin_explore_output.json` (gitignored).

## Testing without Garmin

`python3 garmin/garmin_sync.py --mode mock` writes 14 demo days into `body_metrics`
so you can exercise the pipeline end-to-end with no account — then check
`/api/rollup/weeks` or the dashboard. Harmless to run; a real `--mode pull` later
just upserts over the demo rows by date.

## Known limits

- **Hevy on free = no API.** The container can't pull it. That's why Hevy stays a
   manual drop, *not* a container browser-login (two chained third-party logins =
   maintenance you'd forget in a month). Revisit only if the manual step keeps
   breaking for >1 week.
- **Garmin API is unofficial and does rate-limit.** Confirmed 429s on login for this
   account during development — the tokenstore refresh is stable day-to-day, but a
   fresh login can get throttled. `--mode watch`'s per-day backfill loop (`GARMIN_METRICS_DAYS`,
   default 7) now costs 2 calls/day (down from 3, after folding resting HR/kcal/SpO2/
   respiration/floors into one `get_user_summary` call — see `garmin/garmin_sync.py`);
   don't raise the window casually. If the pull stops, check `GET /api/sync/status`
   for the last error, or `podman exec -it fitness-sync python3 garmin/garmin_sync.py
   --mode pull` to see it live; re-run `--mode init` once if the tokenstore itself is
   stale.
- **Single shared credential, no per-user accounts.** This is a one-person app. If
   you ever expose it beyond your LAN, put a reverse proxy with real auth/TLS in
   front rather than relying on HTTP Basic alone.

## What's secret, what's not

| gitignored / dockerignored | why |
|---|---|
| `garmin/tokens.txt/` | live Garmin OAuth token |
| `.env` | per-host config (`AUTH_USER`/`AUTH_PASSWORD`, Garmin creds for `--mode init`) |
| `data/fitness.db` | all personal health/training data — the single source of truth |
| `data/backups/` | daily `VACUUM INTO` snapshots (last 14 kept), auto-created by the sync loop |
| `hevy/inbox/*.csv` | your raw Hevy exports (imported into the DB, then just sit here) |
| `*.bak`, `garmin/.bak/`, `_probe_*.py` | regenerable scratch |

The repo ships **code + templates only**. A fresh clone on a new host needs:
`cp .env.example .env` (fill `AUTH_USER`/`AUTH_PASSWORD`) + one `--mode init` for the
Garmin tokenstore. `data/fitness.db` is created automatically on first run.
