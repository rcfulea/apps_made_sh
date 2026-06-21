import argparse
import logging
import os
import sys
import threading

from config import load_config
from archiver import run_archive_pipeline
from web import create_app


def setup_logging(level: str):
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


def main():
    parser = argparse.ArgumentParser(description="Bambu Print Archiver")
    parser.add_argument("--config", default="/app/config.yaml")
    parser.add_argument("--test", action="store_true", help="Run test pipeline and start web UI")
    args = parser.parse_args()

    test_mode = args.test or os.environ.get("TEST_MODE", "").lower() in ("1", "true", "yes")

    cfg = load_config(args.config)
    if os.environ.get("ARCHIVE_PATH"):
        cfg["archive"]["path"] = os.environ["ARCHIVE_PATH"]
    setup_logging(cfg.get("logging", {}).get("level", "INFO"))
    logger = logging.getLogger(__name__)

    os.makedirs(cfg["archive"]["path"], exist_ok=True)

    def run_test_pipeline_wrapped():
        from test_mode import run_test_pipeline
        return run_test_pipeline(cfg, run_archive_pipeline)

    app = create_app(cfg, archive_pipeline_fn=run_test_pipeline_wrapped)
    port = cfg.get("web", {}).get("port", 8080)

    if test_mode:
        logger.info("TEST MODE: running simulated pipeline")
        try:
            folder = run_test_pipeline_wrapped()
            logger.info("Test pipeline done: %s", folder)
        except Exception:
            logger.exception("Test pipeline failed")

        logger.info("Starting web UI on port %d", port)
        app.run(host="0.0.0.0", port=port, debug=False)
        return

    # Normal mode: MQTT listener in background thread, Flask in main thread
    from mqtt_listener import MQTTListener

    def on_print_complete(state: dict):
        try:
            run_archive_pipeline(state, cfg)
        except Exception:
            logger.exception("Archive pipeline unhandled error")

    listener = MQTTListener(cfg, on_complete=on_print_complete)
    mqtt_thread = threading.Thread(target=listener.run, daemon=True, name="mqtt-listener")
    mqtt_thread.start()
    logger.info("MQTT listener started")

    logger.info("Starting web UI on port %d", port)
    try:
        app.run(host="0.0.0.0", port=port, debug=False)
    except KeyboardInterrupt:
        logger.info("Shutting down")
        listener.stop()


if __name__ == "__main__":
    main()
