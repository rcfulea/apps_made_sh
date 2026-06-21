import json
import logging
import ssl
import time
import uuid
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)

# gcode_state values that mean "printing"
RUNNING_STATES = {"RUNNING", "PREPARE"}
TERMINAL_STATES = {"FINISH", "FAILED", "CANCELLED"}


class PrintState:
    def __init__(self):
        self.fields = {}
        self.gcode_state = None
        self.prior_gcode_state = None
        self.start_time = None

    def update(self, payload: dict):
        print_data = payload.get("print", {})
        if not print_data:
            return

        new_state = print_data.get("gcode_state")
        if new_state and new_state != self.gcode_state:
            self.prior_gcode_state = self.gcode_state
            self.gcode_state = new_state
            if new_state in RUNNING_STATES and self.prior_gcode_state not in RUNNING_STATES:
                self.start_time = datetime.now(timezone.utc)
                logger.info("Print started, recording start_time")

        self.fields.update(print_data)

    def is_complete(self) -> bool:
        return (
            self.gcode_state in TERMINAL_STATES
            and self.prior_gcode_state in RUNNING_STATES
        )

    def snapshot(self) -> dict:
        return {
            "gcode_state": self.gcode_state,
            "prior_gcode_state": self.prior_gcode_state,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            **self.fields,
        }

    def reset(self):
        self.__init__()


class MQTTListener:
    def __init__(self, cfg: dict, on_complete):
        self.cfg = cfg
        self.on_complete = on_complete
        self.state = PrintState()
        self._stop = threading.Event()
        self._client = None

    def _build_client(self) -> mqtt.Client:
        printer = self.cfg["printer"]
        client_id = f"bambu-archiver-{uuid.uuid4()}"
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)

        tls_ctx = ssl.create_default_context()
        tls_ctx.check_hostname = False
        tls_ctx.verify_mode = ssl.CERT_NONE
        client.tls_set_context(tls_ctx)

        client.username_pw_set("bblp", printer["access_code"])
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        client.on_disconnect = self._on_disconnect
        return client

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        serial = self.cfg["printer"]["serial"]
        topic = f"device/{serial}/report"
        if reason_code == 0:
            client.subscribe(topic)
            logger.info("MQTT connected, subscribed to %s", topic)
        else:
            logger.error("MQTT connect failed: reason_code=%s", reason_code)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        logger.warning("MQTT disconnected: reason_code=%s", reason_code)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
        except Exception:
            return

        self.state.update(payload)

        if self.state.is_complete():
            snapshot = self.state.snapshot()
            gcode_state = self.state.gcode_state
            logger.info("Print complete: gcode_state=%s", gcode_state)
            self.state.reset()
            threading.Thread(
                target=self._trigger_pipeline,
                args=(snapshot,),
                daemon=True,
            ).start()

    def _trigger_pipeline(self, snapshot: dict):
        delay = self.cfg.get("mqtt", {}).get("post_completion_delay_seconds", 10)
        logger.info("Waiting %ds before archive pipeline", delay)
        time.sleep(delay)
        try:
            self.on_complete(snapshot)
        except Exception:
            logger.exception("Unhandled error in archive pipeline")

    def run(self):
        printer = self.cfg["printer"]
        reconnect_delay = self.cfg.get("mqtt", {}).get("reconnect_delay_seconds", 10)

        while not self._stop.is_set():
            try:
                self._client = self._build_client()
                self._client.connect(printer["ip"], 8883, keepalive=60)
                self._client.loop_forever()
            except Exception:
                logger.exception("MQTT connection error")
            if not self._stop.is_set():
                logger.info("Reconnecting in %ds", reconnect_delay)
                time.sleep(reconnect_delay)

    def stop(self):
        self._stop.set()
        if self._client:
            self._client.disconnect()
