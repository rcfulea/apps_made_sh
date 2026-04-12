"""
Browser session management for Octopus Energy.

Logs in via headless Chromium and holds a persistent browser context
so the poller can navigate pages and interact with the UI.
"""

import logging
from playwright.sync_api import sync_playwright, BrowserContext, Page

logger = logging.getLogger(__name__)

LOGIN_URL = "https://octopus.energy/login/"
DASHBOARD_URL = "https://octopus.energy/dashboard/"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)


class BrowserSession:
    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self._playwright = None
        self._browser = None
        self.context: BrowserContext = None
        self.page: Page = None

    def start(self):
        """Launch browser and log in."""
        logger.info("Launching headless browser...")
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)
        self.context = self._browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1280, "height": 900},
        )
        self.page = self.context.new_page()
        self._login()

    def _login(self):
        logger.info("Logging into Octopus Energy...")
        self.page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60_000)
        # Wait explicitly for the form to be ready before filling
        self.page.wait_for_selector('input[type="email"]', timeout=60_000)
        self.page.fill('input[type="email"]', self.email)
        self.page.fill('input[type="password"]', self.password)
        self.page.click('button[type="submit"]')
        self.page.wait_for_url(f"{DASHBOARD_URL}**", timeout=60_000)
        logger.info(f"Logged in. Current URL: {self.page.url}")

    def relogin(self):
        """Re-authenticate if the session has expired."""
        logger.info("Re-logging in...")
        self._login()

    def stop(self):
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
