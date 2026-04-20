"""
Octopus Energy Octoplus offer checker and claimer.

Uses browser UI automation (Playwright) to navigate offer-group/925 (drink
vouchers) and click any available "Reveal offer" button found on the page.

The API endpoint (octoplusOfferGroups) requires an OIDC token that is
only issued via the web OIDC flow, so UI automation is the reliable path.
"""

import os
import logging
from typing import Optional, Tuple
from auth import BrowserSession

logger = logging.getLogger(__name__)

OFFER_GROUP_URL = "https://octopus.energy/dashboard/new/accounts/{account_number}/octoplus/partner/offer-group/925"

CLAIMABLE_BUTTON = "reveal offer"

# Friendly name → substring that appears in the card's DOM text
# (brand logos are images, not text, so we match on the offer description)
OFFER_ALIASES = {
    "nero": "hot or cold drink",
    "caffe nero": "hot or cold drink",
    "greggs": "regular hot drink",
}


class RenderFailure(Exception):
    """Page loaded but offer cards never appeared — likely session/server issue."""


class OctopusClient:
    def __init__(self, account_number: str, session: BrowserSession):
        self.account_number = account_number
        self.session = session
        self._offer_url = OFFER_GROUP_URL.format(account_number=account_number)

    def check_and_claim(self, target: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
        """
        Navigate to the offer group page and claim an available offer.
        If target is set, only claim a card whose text contains that substring
        (or resolve via OFFER_ALIASES). If unset, claim first available.
        Returns (result_text, screenshot_path) or (None, None) if nothing claimable.
        Raises RenderFailure if the page fails to render offer cards.
        """
        filter_text = None
        if target:
            filter_text = OFFER_ALIASES.get(target.lower(), target.lower())
            logger.info(f"Targeting offer matching: '{filter_text}'")
        page = self.session.page
        logger.info("Navigating to offer group page...")
        page.goto(self._offer_url, wait_until="domcontentloaded", timeout=60_000)

        if "/login" in page.url or "/accounts" not in page.url:
            raise RenderFailure(f"Unexpected redirect to {page.url}")

        try:
            page.wait_for_selector('[data-testid="offer-card"]', timeout=20_000)
        except Exception:
            raise RenderFailure("Offer cards did not appear within 20s")

        page.wait_for_timeout(1000)

        offer_cards = page.query_selector_all('[data-testid="offer-card"]')
        if not offer_cards:
            raise RenderFailure("No offer cards found after selector wait")

        for i, card in enumerate(offer_cards):
            card_text = card.inner_text().strip()
            logger.info(f"Offer card {i}: {card_text[:200]}")

            btn = card.query_selector("button")
            if not btn:
                continue

            btn_text = btn.inner_text().strip().lower()
            is_disabled = btn.get_attribute("disabled") is not None

            if filter_text and filter_text not in card_text.lower():
                continue

            if btn_text == CLAIMABLE_BUTTON and not is_disabled:
                logger.info(f"Card {i} AVAILABLE — clicking '{btn.inner_text().strip()}'...")
                btn.click()

                # Wait for QR code page ("Present your QR code to the Barista")
                # There's a loading screen first so give it up to 15s
                try:
                    page.wait_for_selector("text=Present your QR code", timeout=15_000)
                except Exception:
                    logger.warning("QR page text not found — screenshotting whatever is shown")

                result_text = page.inner_text("body")
                log_dir = os.environ.get("LOG_DIR", "./logs")
                screenshot_path = os.path.join(log_dir, "claim_result.png")
                page.screenshot(path=screenshot_path)
                logger.info(f"Post-claim page text (first 300): {result_text[:300]}")
                return result_text[:500], screenshot_path

        logger.info("No claimable offers found this cycle.")
        return None, None
