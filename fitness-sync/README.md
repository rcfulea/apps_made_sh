# fitness-sync — body + training tracker

Free-plan setup. **Garmin is automatic; Hevy is a 2-tap weekly drop; meals are a
daily fill.** The rollup answers one question each week: *did weight AND load
both go up?*

## What runs where

| source | who fills it | how | automated? |
|---|---|---|---|
| `garmin/weight.csv` | the container | `garmin-sync.py --mode pull` → Garmin Connect (tokenstore) | ✅ every 6h |
| `garmin/metrics.csv` | the container | `garmin-sync.py --mode watch` → watch recovery signals | ✅ every 6h |
| `hevy/inbox/*.csv` | **you** | Hevy app → Profile → Export Data → drop the CSV here | ⚠️ manual, ~weekly |
| `body.csv` | **you** | one line per morning: `date, mini_meals_hit, protein_g, note` | ⚠️ manual, daily |
| `rollout.csv` | the container | `tracker.py` joins the three above into one row per week | ✅ every run |

Files are *owned* per source so nothing overwrites anything: Garmin owns
`garmin/`, you own `hevy/inbox/` + `body.csv`, and the rollup only *adds*.

## The token lives here, not in the repo

Garmin auth is a **tokenstore**: `garmin/tokens.txt/garmin_tokens.json` — a
directory on this box (a plain file on others; the entrypoint uses `-e`, not
`-f`, so both work). It is **gitignored and dockerignored**. The container never
sees your password after the one-time `--mode init`; it only ever reloads the
opaque token.

## 3-step start (on your Docker / podman host)

> `docker` and `podman` both speak the compose v2 format; use whichever is on the host.
> This box has podman, not a docker daemon — both paths are equivalent.

1. **Config + one-time auth** (auth handles MFA once, then silent):
    ```bash
    cp .env.example .env          # no creds needed to RUN — leave EMAIL/PASSWORD blank
    # first run only, on THIS host, to populate the tokenstore:
    podman run --rm -it --net host -v "$PWD":/app fitness-sync:latest \
        python3 garmin/garmin-sync.py --mode init      # or: docker run --rm -it --net host ...
    ```
   That logs in with MFA once and writes the token to `garmin/tokens.txt/`.
2. **Start the service:**
    ```bash
    podman compose up -d          # or: docker compose up -d
    podman logs -f fitness-sync
    ```
3. **You**: weigh yourself → add one row to `body.csv` daily; export Hevy → drop
   in `hevy/inbox/` once a week. Open `rollout.csv` for the weekly view.

## Deploy two ways (same descriptor)

`docker-compose.yml` is **one file that is also the stack**:
- **single host** — `docker compose up -d` (or `podman compose up -d`).
- **swarm / `docker stack deploy`** — build a tag first, then deploy with the
  commented `deploy:` block in `docker-compose.yml` uncommented:
    ```bash
    podman build -t fitness-sync:latest .
    docker stack deploy -c docker-compose.yml fitness-sync
    ```
   Swarm ignores `restart:` — use the `deploy.restart_policy` block instead.

Because the service binds the *whole dir* to `/app`, **the same tree is your
deploy unit.** To move hosts: clone the repo, `cp .env.example .env`, point the
tokenstore at the host's own `garmin/tokens.txt/` (run `--mode init`), and
`compose up -d`. No per-host rebuild of the mount needed.

## Rollout columns

`week, from, to, sessions | <10 muscle-group volumes in tonnes> | weight_7d_MA_kg,
body_fat_pct_avg, running_min, meals_logged_days, mini_meals_target_met,
protein_avg_g | <10 main-lift weights/sets>`

`weight_7d_MA_kg` is the number to watch — never a single day's reading.

## Testing without Garmin

`python3 garmin/garmin-sync.py --mode mock` writes 14 demo days into
`garmin/weight.csv` so you can watch the pipeline end-to-end with no account,
then `python3 tracker.py`. Harmless to run — delete the demo rows or let the real
pull overwrite them.

## Known limits
- **Hevy on free = no API.** The container can't pull it. That's why Hevy stays a
   manual drop, *not* a container browser-login (two chained third-party logins =
   maintenance you'd forget in a month). Revisit only if the manual stop keeps
   breaking for >1 week.
- **Garmin API is unofficial.** The tokenstore refresh is stable but Garmin can
   change endpoints or occasionally 429 a back-to-back login — the 6h spacing keeps
   that rare. If the pull stops, `podman exec -it fitness-sync /bin/sh -c
  'python3 garmin/garmin-sync.py --mode pull'` shows why; re-run `--mode init` once.

## What's secret, what's not

| gitignored / dockerignored | why |
|---|---|
| `garmin/tokens.txt/` | live Garmin OAuth token |
| `.env` | per-host config / optional creds |
| `body.csv`, `garmin/weight.csv`, `garmin/metrics.csv`, `rollout.csv`, `hevy/inbox/*.csv` | personal health/training data |
| `*.bak`, `garmin/.bak/`, `_probe_*.py` | regenerable scratch |

The repo ships **code + templates only**. A fresh clone on a new host needs only:
`cp .env.example .env` + one `--mode init` for the tokenstore.
