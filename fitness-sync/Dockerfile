# fitness-sync: Garmin+Hevy sync, SQLite, FastAPI API + web UI. Auth via tokenstore
# seeded once (--mode init) for Garmin; HTTP Basic (AUTH_USER/AUTH_PASSWORD) for the app.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV GARMIN_DAYS=30
ENV SYNC_INTERVAL_HOURS=6
ENV PORT=8000

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# copy runtime code
COPY app /app/app
COPY garmin/garmin_sync.py /app/garmin/garmin_sync.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
RUN mkdir -p /app/garmin /app/hevy/inbox /app/data

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
