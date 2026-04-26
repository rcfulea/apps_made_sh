"""
Browser session management for Octopus Energy.

Uses a saved session file (Playwright storage state) to skip login entirely,
avoiding the FunCaptcha that appears on headless browser logins.

To create/refresh the session file, run tools/save_session.py on a machine
with a display (or via X11 forwarding), log in manually, and copy the
resulting session.json to SESSION_FILE path on the server.
"""

import os
import logging
from playwright.sync_api import sync_playwright, BrowserContext, Page

logger = logging.getLogger(__name__)

DASHBOARD_URL = "https://octopus.energy/dashboard/"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)


class SessionExpired(Exception):
    """Saved session is no longer valid — manual re-login required."""


class BrowserSession:
    def __init__(self, session_file: str):
        self.session_file = session_file
        self._playwright = None
        self._browser = None
        self.context: BrowserContext = None
        self.page: Page = None

    def start(self):
        logger.info("Launching headless browser...")
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)

        if not os.path.exists(self.session_file):
            raise SessionExpired(f"Session file not found: {self.session_file}")

        self.context = self._browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1280, "height": 900},
            storage_state=self.session_file,
        )
        self.page = self.context.new_page()
        self._verify_session()

    def _verify_session(self):
        logger.info("Verifying session...")
        self.page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=60_000)
        self.page.wait_for_timeout(3000)

        if "/login" in self.page.url or "auth.octopus.energy" in self.page.url:
            log_dir = os.environ.get("LOG_DIR", "./logs")
            self.page.screenshot(path=os.path.join(log_dir, "session_expired.png"))
            raise SessionExpired(f"Session expired — redirected to {self.page.url}")

        logger.info(f"Session valid. URL: {self.page.url}")

    def relogin(self):
        """Re-verify session is still valid (no password re-entry possible)."""
        logger.info("Re-verifying session...")
        self._verify_session()

    def stop(self):
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
