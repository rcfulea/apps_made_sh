import os
import time
import logging
from datetime import datetime

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
# Re-login every 4 hours to avoid session expiry
RELOGIN_INTERVAL = 4 * 60 * 60


def main():
    session = BrowserSession(
        email=os.environ["OCTOPUS_EMAIL"],
        password=os.environ["OCTOPUS_PASSWORD"],
    )
    client = OctopusClient(
        account_number=os.environ["OCTOPUS_ACCOUNT_NUMBER"],
        session=session,
    )
    notifier = TelegramNotifier(
        bot_token=os.environ["TELEGRAM_BOT_TOKEN"],
        chat_id=os.environ["TELEGRAM_CHAT_ID"],
    )

    logger.info("Starting Octopus voucher tracker...")
    session.start()
    notifier.send("Octopus voucher tracker started. Watching for Caffe Nero vouchers every 5 min.")
    last_login = time.time()

    while True:
        try:
            # Periodic re-login
            if time.time() - last_login > RELOGIN_INTERVAL:
                logger.info("Periodic re-login...")
                session.relogin()
                last_login = time.time()

            result = client.check_and_claim("hot or cold drink")

            if result is not None:
                logger.info("CLAIMED! Sending notification...")
                notifier.send(
                    f"Caffe Nero voucher claimed!\n\n"
                    f"Page result:\n{result[:400]}\n\n"
                    f"Check the Octopus app for your code."
                )
                # Back off for 2 hours after a successful claim
                logger.info("Success — sleeping 2 hours.")
                time.sleep(7200)
            else:
                logger.info("Not available yet. Sleeping...")

        except Exception as e:
            logger.error(f"Error: {e}", exc_info=True)
            notifier.send(f"Poller error: {e}\nWill retry in {POLL_INTERVAL}s.")
            # Try to recover the browser session
            try:
                session.stop()
                session.start()
                last_login = time.time()
            except Exception as re:
                logger.error(f"Recovery failed: {re}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
