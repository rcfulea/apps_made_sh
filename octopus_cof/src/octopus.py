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

# When no OFFER_TARGET set, only claim cards matching one of these substrings
# (offer-group/925 mixes drink + non-drink offers)
DRINK_KEYWORDS = set(OFFER_ALIASES.values())


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
        else:
            logger.info(f"No target set — will claim first drink offer matching: {DRINK_KEYWORDS}")
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

            if filter_text:
                if filter_text not in card_text.lower():
                    continue
            else:
                if not any(kw in card_text.lower() for kw in DRINK_KEYWORDS):
                    logger.info(f"Card {i} skipped — not a drink offer")
                    continue

            # "Reveal offer" is an <a> tag, not a <button>
            btn = None
            for b in card.query_selector_all("button, a"):
                b_text = b.inner_text().strip().lower()
                if b_text == CLAIMABLE_BUTTON:
                    btn = b
                    break

            if btn is not None:
                logger.info(f"Card {i} AVAILABLE — clicking '{btn.inner_text().strip()}'...")
                btn.click()
                page.wait_for_load_state("domcontentloaded", timeout=15_000)
                page.wait_for_timeout(1000)

                # Detail page has an "Activate offer" button — click it to get the QR code
                activate = page.query_selector("button:has-text('Activate offer')")
                if activate:
                    logger.info("Clicking 'Activate offer'...")
                    activate.click()
                    page.wait_for_load_state("domcontentloaded", timeout=15_000)
                    page.wait_for_timeout(1000)

                try:
                    page.wait_for_selector("text=Present your QR code", timeout=15_000)
                    logger.info("QR page loaded. URL: " + page.url)
                except Exception:
                    logger.warning("QR page text not found — screenshotting whatever is shown")

                result_text = page.inner_text("body")
                log_dir = os.environ.get("LOG_DIR", "./logs")
                screenshot_path = os.path.join(log_dir, "claim_result.png")
                page.screenshot(path=screenshot_path, full_page=True)
                logger.info(f"Post-claim page text (first 300): {result_text[:300]}")
                return result_text[:500], screenshot_path

        logger.info("No claimable offers found this cycle.")
        return None, None
