"""Single-user HTTP Basic auth gate, applied globally (web UI + API + LLM callers all
need the same credential — this is a single-person app, not a multi-user system).
Credentials come from env (see .env.example): AUTH_USER / AUTH_PASSWORD.
"""
import os, secrets
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic()

AUTH_USER = os.environ.get("AUTH_USER", "")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "")


def require_auth(credentials: HTTPBasicCredentials = Depends(security)):
    if not AUTH_USER or not AUTH_PASSWORD:
        # Misconfigured host (no creds set) — fail closed, not open.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AUTH_USER/AUTH_PASSWORD not set on the server — see .env.example.",
        )
    user_ok = secrets.compare_digest(credentials.username, AUTH_USER)
    pass_ok = secrets.compare_digest(credentials.password, AUTH_PASSWORD)
    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username
