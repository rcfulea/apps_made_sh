"""
Octopus Energy Octoplus offer checker and claimer.

Uses browser UI automation (Playwright) to navigate the offer page,
detect when the Caffe Nero voucher becomes available, and click Claim.

The API endpoint (octoplusOfferGroups) requires an OIDC token that is
only issued via the web OIDC flow, so UI automation is the reliable path.
"""

import os
import logging
from typing import Optional
from auth import BrowserSession

logger = logging.getLogger(__name__)

# Direct URL to the "Pick one free drink" offer group (id 925)
OFFER_GROUP_URL = "https://octopus.energy/dashboard/new/accounts/{account_number}/octoplus/partner/offer-group/925"

# Text shown on the button when the offer IS available to claim
# (confirmed: when unavailable it says "More codes tomorrow" and is disabled)
UNAVAILABLE_TEXT = "more codes tomorrow"


class OctopusClient:
    def __init__(self, account_number: str, session: BrowserSession):
        self.account_number = account_number
        self.session = session
        self._offer_url = OFFER_GROUP_URL.format(account_number=account_number)

    def check_and_claim(self, target_name: str = "hot or cold drink") -> Optional[str]:
        """
        Navigate to the offer group page, find the target offer, and claim it
        if available. Returns a description of the outcome, or None if unavailable.

        target_name: substring to match against the offer's h3 text (case-insensitive)
        """
        page = self.session.page
        logger.info(f"Navigating to offer group page...")
        page.goto(self._offer_url, wait_until="domcontentloaded", timeout=60_000)

        # Verify we actually landed on the right page (not a login redirect)
        if "/login" in page.url or "/accounts" not in page.url:
            logger.warning(f"Unexpected redirect to {page.url} — session may have expired")
            return None

        # Wait for offer buttons to appear; if they don't, page failed to render
        try:
            page.wait_for_selector('[data-testid="offer-card"]', timeout=20_000)
        except Exception:
            logger.warning("Offer cards did not appear within 20s — page may not have rendered")
            return None

        page.wait_for_timeout(1000)

        # Log all offer card texts to help diagnose what's visible on the page
        offer_cards = page.query_selector_all('[data-testid="offer-card"]')
        if offer_cards:
            for i, card in enumerate(offer_cards):
                logger.info(f"Offer card {i}: {card.inner_text().strip()[:200]}")
        else:
            logger.warning("No [data-testid='offer-card'] elements found")

        # Find the specific offer by matching visible text near its button
        # The page structure: h3 + disabled/enabled button in the same container
        page_text = page.inner_text("body").lower()

        if target_name.lower() not in page_text:
            logger.warning(f"Offer '{target_name}' not found on page")
            return None

        # Find all buttons on the page (exclude nav)
        buttons = page.query_selector_all("button")
        for btn in buttons:
            btn_text = btn.inner_text().strip().lower()
            if btn_text == "" or "menu" in btn_text or "skip" in btn_text:
                continue

            is_disabled = btn.get_attribute("disabled") is not None

            if is_disabled and UNAVAILABLE_TEXT in btn_text:
                # Check which offer this button belongs to — look at nearby h3
                # The button is inside a container that also has the offer name h3
                container_text = ""
                try:
                    # Walk up to find the containing card element
                    container = btn.evaluate_handle(
                        "el => el.closest('[data-testid=\"offer-card\"]') || el.parentElement.parentElement.parentElement"
                    ).as_element()
                    if container:
                        container_text = container.inner_text().lower()
                except Exception:
                    pass

                if target_name.lower() in container_text:
                    logger.info(f"Offer '{target_name}' found but UNAVAILABLE ({btn.inner_text().strip()})")
                    return None

            elif not is_disabled:
                # This button is clickable — check if it's for our target offer
                container_text = ""
                try:
                    container = btn.evaluate_handle(
                        "el => el.closest('[data-testid=\"offer-card\"]') || el.parentElement.parentElement.parentElement"
                    ).as_element()
                    if container:
                        container_text = container.inner_text().lower()
                except Exception:
                    pass

                if target_name.lower() in container_text:
                    logger.info(f"Offer '{target_name}' IS AVAILABLE! Clicking claim...")
                    btn.click()
                    page.wait_for_timeout(3000)

                    # Capture the result — look for a code, success message, or URL change
                    result_text = page.inner_text("body")
                    log_dir = os.environ.get("LOG_DIR", "./logs")
                    page.screenshot(path=os.path.join(log_dir, "claim_result.png"))
                    logger.info(f"Post-claim page text (first 300): {result_text[:300]}")
                    return result_text[:500]

        logger.info(f"No actionable button found for '{target_name}'")
        return None
