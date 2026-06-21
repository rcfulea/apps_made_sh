"""Test mode: simulates a completed print without MQTT or FTP."""
import io
import json
import logging
import os
import zipfile
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

TEST_STATE = {
    "gcode_state": "FINISH",
    "prior_gcode_state": "RUNNING",
    "subtask_name": "test_benchy",
    "start_time": (datetime.now(timezone.utc) - timedelta(hours=1, minutes=23)).isoformat(),
    "total_layer_num": 80,
    "layer_num": 80,
    "mc_percent": 100,
    "print_type": "local",
    "nozzle_temper": 220,
    "bed_temper": 65,
    "chamber_temper": 35,
    "nozzle_diameter": 0.4,
    "nozzle_type": "brass",
    "spd_lvl": 2,
    "spd_mag": 100,
    "cooling_fan_speed": 15,
    "heatbreak_fan_speed": 7,
    "big_fan1_speed": 0,
    "print_error": 0,
    "wifi_signal": -55,
    "hw_ver": "01.08.02.00",
    "ams": {
        "ams": [
            {
                "id": "0",
                "humidity": "3",
                "temp": "24.5",
                "tray": [
                    {
                        "id": "0",
                        "tray_type": "PLA",
                        "tray_color": "FF5500FF",
                        "tray_uuid": "0000000000000000",
                        "tag_uid": "0000000000000000",
                        "tray_info_idx": "GFL00",
                        "tray_sub_brands": "Bambu PLA Basic",
                        "nozzle_temp_min": 190,
                        "nozzle_temp_max": 240,
                        "remain": 80,
                        "tray_weight": 1000,
                        "drying_temp": 55,
                        "drying_time": 8,
                        "bed_temp": 35,
                    }
                ],
            }
        ]
    },
}


def _make_dummy_3mf() -> bytes:
    """Create minimal valid 3MF (ZIP) with a placeholder thumbnail."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        # Minimal 1x1 white PNG (89 bytes)
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00"
            b"\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18"
            b"\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        z.writestr("Metadata/plate_1.png", png_bytes)
        z.writestr("3D/3dmodel.model", "<model/>")
    return buf.getvalue()


def run_test_pipeline(cfg: dict, archive_fn):
    """Run full archive pipeline with synthetic data, skipping FTPS."""
    import archiver

    state = dict(TEST_STATE)
    three_mf_data = _make_dummy_3mf()

    # Patch archiver to skip real FTP
    original_connect = archiver._connect_ftps
    original_find = archiver._find_3mf
    original_download = archiver._download_3mf

    def fake_connect(ip, code):
        return None

    def fake_find(ftp, subtask_name):
        return "test_benchy.gcode.3mf"

    def fake_download(ftp, remote_name):
        return three_mf_data

    archiver._connect_ftps = fake_connect
    archiver._find_3mf = fake_find
    archiver._download_3mf = fake_download

    try:
        folder = archive_fn(state, cfg)
        logger.info("Test pipeline complete: %s", folder)
        return folder
    finally:
        archiver._connect_ftps = original_connect
        archiver._find_3mf = original_find
        archiver._download_3mf = original_download
