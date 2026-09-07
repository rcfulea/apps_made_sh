#!/bin/sh
# Supervises one synced loop; restart on crash via compose restart: unless-stopped.
set -eu
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"
: "${SYNC_INTERVAL_HOURS:=24}"
sleep_s=$((SYNC_INTERVAL_HOURS * 3600))
trap 'echo "[fitness-sync] stopping at $(date -u +%FT%TZ)"; exit 0' TERM INT

echo "[fitness-sync] starting. sync every ${SYNC_INTERVAL_HOURS}h. token=${GARMIN_TOKENSTORE:-unset}"

# tokenstore is a DIRECTORY on this box (tokens.txt/garmin_tokens.json); -f would miss it, so use -e
has_token() {
  { [ -e "${GARMIN_TOKENSTORE}" ] && [ -n "${GARMIN_TOKENSTORE}" ]; } || \
    { [ -n "${GARMIN_EMAIL:-}" ] && [ -n "${GARMIN_PASSWORD:-}" ]; }
}

while true; do
  echo "[fitness-sync] $(date -u +%FT%TZ) -- Garmin pull + rollup"
  if has_token; then
    python3 garmin/garmin-sync.py --mode pull   || echo "[fitness-sync] Garmin pull skipped (auth/err) -- continuing"
    python3 garmin/garmin-sync.py --mode watch  || echo "[fitness-sync] Garmin watch pull skipped (auth/err) -- continuing"
  else
    echo "[fitness-sync] no tokenstore + no creds -- Garmin pull skipped. Run init once (see README)."
  fi
  python3 tracker.py || echo "[fitness-sync] tracker failed -- continuing"
  echo "[fitness-sync] sleeping ${SYNC_INTERVAL_HOURS}h"
  sleep "${sleep_s}"
done
