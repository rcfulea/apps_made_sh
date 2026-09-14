#!/bin/sh
# Single process: uvicorn serves the API + web UI; the Garmin/Hevy sync loop runs as a
# background thread inside that same process (see app/sync/loop.py), started from
# FastAPI's lifespan hook. Replaces the old shell polling loop that shelled out to two
# scripts every cycle.
set -eu
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"
mkdir -p data garmin hevy/inbox

: "${PORT:=8000}"
echo "[fitness-sync] starting uvicorn on :${PORT}. sync every ${SYNC_INTERVAL_HOURS:-6}h. token=${GARMIN_TOKENSTORE:-unset}"
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
