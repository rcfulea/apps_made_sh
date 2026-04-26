"""
Browser session management for Octopus Energy.

Logs in via headless Chromium and holds a persistent browser context
so the poller can navigate pages and interact with the UI.

Octopus auth now uses a separate OIDC provider at auth.octopus.energy,
so login involves a redirect chain before landing on the dashboard.
"""

import os
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

        # Wait for email input — it appears on both octopus.energy/login and
        # auth.octopus.energy/login (OIDC redirect). 15s covers the redirect.
        try:
            self.page.wait_for_selector('input[type="email"]', timeout=15_000)
        except Exception:
            # No login form — already authenticated, wait for dashboard
            if DASHBOARD_URL not in self.page.url:
                self.page.wait_for_url(f"{DASHBOARD_URL}**", timeout=30_000)
            logger.info(f"Already logged in. Current URL: {self.page.url}")
            return

        logger.info(f"Login form at: {self.page.url}")
        self.page.fill('input[type="email"]', self.email)
        self.page.fill('input[type="password"]', self.password)

        # Submit — try type=submit first, fall back to any visible submit button
        submitted = False
        for selector in ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Log in")']:
            btn = self.page.query_selector(selector)
            if btn:
                logger.info(f"Submitting via selector: {selector}")
                btn.click()
                submitted = True
                break
        if not submitted:
            logger.info("No submit button found — pressing Enter")
            self.page.keyboard.press("Enter")

        # Screenshot immediately after submit to catch bot challenges / extra steps
        self.page.wait_for_timeout(3000)
        log_dir = os.environ.get("LOG_DIR", "./logs")
        self.page.screenshot(path=os.path.join(log_dir, "login_post_submit.png"))
        logger.info(f"Post-submit URL: {self.page.url}")

        # OAuth redirect chain (auth.octopus.energy → octopus.energy/oauth-callback
        # → dashboard) can take a while — 120s to be safe
        try:
            self.page.wait_for_url(f"{DASHBOARD_URL}**", timeout=120_000)
        except Exception:
            self.page.screenshot(path=os.path.join(log_dir, "login_timeout.png"))
            logger.error(f"Login timeout. Final URL: {self.page.url}")
            raise
        logger.info(f"Logged in. Current URL: {self.page.url}")

    def relogin(self):
        logger.info("Re-logging in...")
        self._login()

    def stop(self):
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
