import httpx
import logging

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"

    def send(self, message: str) -> bool:
        try:
            resp = httpx.post(
                f"{self.base_url}/sendMessage",
                json={"chat_id": self.chat_id, "text": message, "parse_mode": "HTML"},
                timeout=10,
            )
            resp.raise_for_status()
            logger.info(f"Telegram notification sent: {message[:60]}")
            return True
        except Exception as e:
            logger.error(f"Failed to send Telegram notification: {e}")
            return False

    def send_photo(self, image_path: str, caption: str = "") -> bool:
        try:
            with open(image_path, "rb") as f:
                resp = httpx.post(
                    f"{self.base_url}/sendPhoto",
                    data={"chat_id": self.chat_id, "caption": caption},
                    files={"photo": f},
                    timeout=30,
                )
            resp.raise_for_status()
            logger.info(f"Telegram photo sent: {image_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to send Telegram photo: {e}")
            return False
