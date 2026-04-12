import os
import time
import logging

from dotenv import load_dotenv
from auth import BrowserSession
from octopus import OctopusClient
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

POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", 300))
RELOGIN_INTERVAL = 4 * 60 * 60  # re-login every 4 hours


def start_session(email, password):
    """Create and start a fresh browser session, retrying once if it fails."""
    session = BrowserSession(email=email, password=password)
    session.start()
    return session


def main():
    email = os.environ["OCTOPUS_EMAIL"]
    password = os.environ["OCTOPUS_PASSWORD"]

    notifier = TelegramNotifier(
        bot_token=os.environ["TELEGRAM_BOT_TOKEN"],
        chat_id=os.environ["TELEGRAM_CHAT_ID"],
    )

    logger.info("Starting Octopus voucher tracker...")
    session = start_session(email, password)
    client = OctopusClient(
        account_number=os.environ["OCTOPUS_ACCOUNT_NUMBER"],
        session=session,
    )
    notifier.send("Octopus voucher tracker started. Watching for Caffe Nero vouchers every 5 min.")
    last_login = time.time()

    while True:
        try:
            # Periodic re-login to keep session fresh
            if time.time() - last_login > RELOGIN_INTERVAL:
                logger.info("Periodic re-login...")
                session.relogin()
                last_login = time.time()

            result = client.check_and_claim("hot or cold drink")

            if result is not None:
                logger.info("CLAIMED! Sending notification...")
                notifier.send(
                    "Caffe Nero voucher claimed!\n\n"
                    f"{result[:300]}\n\n"
                    "Check the Octopus app for your code."
                )
                logger.info("Success — sleeping 2 hours.")
                time.sleep(7200)
            else:
                logger.info("Not available yet. Sleeping...")

        except Exception as e:
            # Truncate error to first line only — full trace is in the log file
            short_err = str(e).splitlines()[0][:200]
            logger.error(f"Error: {e}", exc_info=True)
            notifier.send(f"Poller error: {short_err}\nWill retry after recovery.")

            # Full browser restart on any error
            logger.info("Restarting browser session...")
            try:
                session.stop()
            except Exception:
                pass

            # Back off before retrying to avoid hammering the site
            time.sleep(60)

            try:
                session = start_session(email, password)
                client = OctopusClient(
                    account_number=os.environ["OCTOPUS_ACCOUNT_NUMBER"],
                    session=session,
                )
                last_login = time.time()
                logger.info("Browser session recovered successfully.")
            except Exception as re:
                short_re = str(re).splitlines()[0][:200]
                logger.error(f"Recovery failed: {re}", exc_info=True)
                notifier.send(f"Recovery failed: {short_re}\nWill retry in {POLL_INTERVAL}s.")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
