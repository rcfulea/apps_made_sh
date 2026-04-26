"""
Run this script on a machine with a display to log in manually and save
the browser session to a file. Copy the output session.json to the server
at the path set by SESSION_FILE in .env (default: /app/session.json).

Usage:
    python tools/save_session.py [output_path]

Default output: ./session.json
"""

import sys
import os
from playwright.sync_api import sync_playwright

OUTPUT = sys.argv[1] if len(sys.argv) > 1 else "session.json"
LOGIN_URL = "https://octopus.energy/login/"
DASHBOARD_URL = "https://octopus.energy/dashboard/"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)

print(f"Opening browser — log in manually, including any CAPTCHA.")
print(f"Session will be saved to: {OUTPUT}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1280, "height": 900},
    )
    page = context.new_page()
    page.goto(LOGIN_URL)

    print("Waiting for dashboard URL after login...")
    page.wait_for_url(f"{DASHBOARD_URL}**", timeout=300_000)

    context.storage_state(path=OUTPUT)
    print(f"Session saved to {OUTPUT}")
    browser.close()
