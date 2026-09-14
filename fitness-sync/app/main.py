"""FastAPI app: serves the JSON API (/api/*, for the web UI and the local LLM alike)
and the server-rendered web UI (Jinja2+htmx). One process — the Garmin/Hevy sync loop
that used to be entrypoint.sh's shell polling loop now runs as a background thread
started from the lifespan hook below.
"""
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from . import db
from .auth import require_auth
from .sync import loop
from .routers import (body_metrics, watch_metrics, workouts, daily_log, notes, rollup, sync,
                       measurements, analytics, backup, readiness, training)
from .pages import routes as pages

HERE = os.path.dirname(os.path.abspath(__file__))


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    loop.start_background()
    yield


app = FastAPI(title="fitness-sync", lifespan=lifespan, dependencies=[Depends(require_auth)])

app.mount("/static", StaticFiles(directory=os.path.join(HERE, "static")), name="static")

for r in (body_metrics.router, watch_metrics.router, workouts.router,
          daily_log.router, notes.router, rollup.router, sync.router, measurements.router,
          analytics.router, backup.router, readiness.router, training.router):
    app.include_router(r)

app.include_router(pages.router)
