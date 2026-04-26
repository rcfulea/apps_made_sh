"""
Extracts the Octopus Energy session from your logged-in Firefox profile
and saves it as a Playwright-compatible session.json.

Requirements:
- Be logged into octopus.energy in Firefox before running this.
- Close Firefox before running (or cookies.sqlite may be locked).

Usage:
    python tools/save_session.py [output_path]

Default output: ./session.json
Then copy session.json to the server next to docker-compose.yml.
"""

import sys
import os
import json
import shutil
import sqlite3
import tempfile
import configparser
from pathlib import Path

OUTPUT = sys.argv[1] if len(sys.argv) > 1 else "session.json"
DOMAINS = ("octopus.energy", ".octopus.energy", "auth.octopus.energy", ".auth.octopus.energy")

SAMESITE_MAP = {0: "None", 1: "Lax", 2: "Strict"}


def find_firefox_profile():
    candidates = [
        Path.home() / ".mozilla" / "firefox" / "profiles.ini",
        Path.home() / ".config" / "mozilla" / "firefox" / "profiles.ini",
        Path.home() / ".var" / "app" / "org.mozilla.firefox" / ".mozilla" / "firefox" / "profiles.ini",
    ]
    profiles_ini = next((p for p in candidates if p.exists()), None)
    if not profiles_ini:
        raise FileNotFoundError(f"Firefox profiles.ini not found. Tried: {[str(p) for p in candidates]}")

    config = configparser.ConfigParser()
    config.read(profiles_ini)

    # Prefer Default=1 profile
    for section in config.sections():
        if config.get(section, "Default", fallback=None) == "1":
            path = config.get(section, "Path")
            is_relative = config.get(section, "IsRelative", fallback="1") == "1"
            base = profiles_ini.parent
            return base / path if is_relative else Path(path)

    # Fall back to first Profile section
    for section in config.sections():
        if section.startswith("Profile"):
            path = config.get(section, "Path", fallback=None)
            if path:
                is_relative = config.get(section, "IsRelative", fallback="1") == "1"
                base = profiles_ini.parent
                return base / path if is_relative else Path(path)

    raise RuntimeError("No Firefox profile found")


def extract_cookies(profile_dir):
    cookies_db = profile_dir / "cookies.sqlite"
    if not cookies_db.exists():
        raise FileNotFoundError(f"cookies.sqlite not found in {profile_dir}")

    # Copy to temp file — Firefox may have a WAL lock on the original
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as tmp:
        tmp_path = tmp.name
    shutil.copy2(cookies_db, tmp_path)

    try:
        conn = sqlite3.connect(tmp_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("""
            SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
            FROM moz_cookies
            WHERE host LIKE '%octopus.energy'
        """)
        rows = cur.fetchall()
        conn.close()
    finally:
        os.unlink(tmp_path)

    cookies = []
    for row in rows:
        cookies.append({
            "name": row["name"],
            "value": row["value"],
            "domain": row["host"],
            "path": row["path"],
            "expires": row["expiry"],
            "httpOnly": bool(row["isHttpOnly"]),
            "secure": bool(row["isSecure"]),
            "sameSite": SAMESITE_MAP.get(row["sameSite"], "Lax"),
        })
    return cookies


profile = find_firefox_profile()
print(f"Using Firefox profile: {profile}")

cookies = extract_cookies(profile)
print(f"Found {len(cookies)} cookies for octopus.energy")

if not cookies:
    print("ERROR: No cookies found. Make sure you are logged into octopus.energy in Firefox.")
    sys.exit(1)

state = {"cookies": cookies, "origins": []}
with open(OUTPUT, "w") as f:
    json.dump(state, f, indent=2)

print(f"Session saved to {OUTPUT}")
print("Copy this file to the server next to docker-compose.yml as session.json")
