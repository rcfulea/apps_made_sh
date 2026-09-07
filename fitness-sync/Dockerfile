# fitness-sync: Garmin pull + rollup. Auth via tokenstore seeded once (--mode init).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV GARMIN_DAYS=30
ENV SYNC_INTERVAL_HOURS=24

WORKDIR /app

# garminconnect pinned to the validated version
RUN pip install --no-cache-dir garminconnect==0.3.2

# copy runtime scripts (+ the entryoint ENTRYPOINT, previously missing -> crash on start)
COPY tracker.py /app/tracker.py
COPY garmin/garmin-sync.py /app/garmin/garmin-sync.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
RUN mkdir -p /app/garmin /app/hevy/inbox

ENTRYPOINT ["/app/entrypoint.sh"]
