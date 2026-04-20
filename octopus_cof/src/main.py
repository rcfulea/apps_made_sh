import os
import time
import logging
from datetime import datetime

from dotenv import load_dotenv
from auth import BrowserSession
from octopus import OctopusClient, RenderFailure
from notify import TelegramNotifier

load_dotenv()

LOG_DIR = os.environ.get("LOG_DIR", "./logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(LOG_DIR, "voucher.log")),
    ],
)
logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", 60))
RELOGIN_INTERVAL = 4 * 60 * 60
WINDOW_START = int(os.environ.get("WINDOW_START_HOUR", 4))
WINDOW_END = int(os.environ.get("WINDOW_END_HOUR", 9))
# Restart browser after this many consecutive render failures
RENDER_FAIL_THRESHOLD = 5


def seconds_until_window():
    """Seconds until next WINDOW_START. 0 if currently inside window."""
    now = datetime.now()
    hour = now.hour
    if WINDOW_START <= hour < WINDOW_END:
        return 0
    # Next window start
    if hour < WINDOW_START:
        target = now.replace(hour=WINDOW_START, minute=0, second=0, microsecond=0)
    else:
        from datetime import timedelta
        target = (now + timedelta(days=1)).replace(hour=WINDOW_START, minute=0, second=0, microsecond=0)
    return (target - now).total_seconds()


def start_session(email, password):
    session = BrowserSession(email=email, password=password)
    session.start()
    return session


def restart_browser(session, email, password, account_number):
    logger.info("Restarting browser session...")
    try:
        session.stop()
    except Exception:
        pass
    time.sleep(30)
    new_session = start_session(email, password)
    new_client = OctopusClient(account_number=account_number, session=new_session)
    return new_session, new_client


def main():
    email = os.environ["OCTOPUS_EMAIL"]
    password = os.environ["OCTOPUS_PASSWORD"]
    account_number = os.environ["OCTOPUS_ACCOUNT_NUMBER"]

    notifier = TelegramNotifier(
        bot_token=os.environ["TELEGRAM_BOT_TOKEN"],
        chat_id=os.environ["TELEGRAM_CHAT_ID"],
    )

    # Wait for active window before doing anything
    wait = seconds_until_window()
    if wait > 0:
        logger.info(f"Outside active window ({WINDOW_START}:00–{WINDOW_END}:00). Sleeping {wait:.0f}s...")
        time.sleep(wait)

    logger.info("Starting Octopus voucher tracker...")
    session = start_session(email, password)
    client = OctopusClient(account_number=account_number, session=session)
    target = os.environ.get("OFFER_TARGET", "").strip() or None
    target_label = target or "any available"
    notifier.send(f"Octopus voucher tracker started. Target: {target_label}. Window: {WINDOW_START}:00–{WINDOW_END}:00.")
    last_login = time.time()
    consecutive_render_failures = 0

    while True:
        # Exit if outside active window
        if seconds_until_window() > 0:
            logger.info(f"Window closed ({WINDOW_END}:00 reached). Shutting down.")
            notifier.send(f"Voucher window closed ({WINDOW_END}:00). Restarting tomorrow at {WINDOW_START}:00.")
            try:
                session.stop()
            except Exception:
                pass
            return

        try:
            if time.time() - last_login > RELOGIN_INTERVAL:
                logger.info("Periodic re-login...")
                session.relogin()
                last_login = time.time()

            result, screenshot_path = client.check_and_claim(target)
            consecutive_render_failures = 0  # page loaded fine

            if result is not None:
                logger.info("CLAIMED! Sending notification...")
                notifier.send("Drink voucher claimed! QR code incoming...")
                if screenshot_path:
                    notifier.send_photo(screenshot_path, caption="Your voucher QR code")
                else:
                    notifier.send(f"{result[:300]}\n\nCheck the Octopus app for your code.")
                logger.info("Success — sleeping until window closes.")
                # Sleep out the rest of the window
                wait = seconds_until_window()
                if wait == 0:
                    time.sleep(POLL_INTERVAL)
                return

            else:
                logger.info("Not available yet. Sleeping...")

        except RenderFailure as e:
            consecutive_render_failures += 1
            logger.warning(f"Render failure ({consecutive_render_failures}/{RENDER_FAIL_THRESHOLD}): {e}")

            if consecutive_render_failures >= RENDER_FAIL_THRESHOLD:
                logger.warning("Too many render failures — restarting browser.")
                notifier.send(f"Page failed to render {RENDER_FAIL_THRESHOLD}x in a row. Restarting browser.")
                try:
                    session, client = restart_browser(session, email, password, account_number)
                    last_login = time.time()
                    consecutive_render_failures = 0
                    logger.info("Browser restarted after render failures.")
                except Exception as re:
                    logger.error(f"Browser restart failed: {re}", exc_info=True)
                    notifier.send(f"Browser restart failed: {str(re).splitlines()[0][:150]}")

        except Exception as e:
            short_err = str(e).splitlines()[0][:200]
            logger.error(f"Error: {e}", exc_info=True)
            notifier.send(f"Poller error: {short_err}\nWill retry after recovery.")
            consecutive_render_failures = 0

            try:
                session, client = restart_browser(session, email, password, account_number)
                last_login = time.time()
                logger.info("Browser session recovered successfully.")
            except Exception as re:
                short_re = str(re).splitlines()[0][:200]
                logger.error(f"Recovery failed: {re}", exc_info=True)
                notifier.send(f"Recovery failed: {short_re}\nWill retry in {POLL_INTERVAL}s.")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
