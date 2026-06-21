import ftplib
import io
import json
import logging
import os
import shutil
import socket
import ssl
import tempfile
import zipfile
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

RESULT_MAP = {
    "FINISH": "success",
    "FAILED": "failed",
    "CANCELLED": "cancelled",
}


def _safe_folder_name(base: str, archive_path: str) -> str:
    path = os.path.join(archive_path, base)
    if not os.path.exists(path):
        return path
    counter = 2
    while True:
        candidate = os.path.join(archive_path, f"{base}_{counter}")
        if not os.path.exists(candidate):
            return candidate
        counter += 1


def _parse_wifi_signal(raw) -> int | None:
    if raw is None:
        return None
    try:
        return int(str(raw).replace("dBm", "").strip())
    except ValueError:
        return raw


def _build_metadata(state: dict, result: str, end_time: datetime, folder_name: str, printer_serial: str) -> dict:
    start_iso = state.get("start_time")
    end_iso = end_time.isoformat()
    duration = None
    if start_iso:
        try:
            start_dt = datetime.fromisoformat(start_iso)
            duration = int((end_time - start_dt).total_seconds())
        except Exception:
            pass

    ams_list = state.get("ams", {})
    ams_humidity = []
    filament_used = []
    if isinstance(ams_list, dict):
        for unit in ams_list.get("ams", []):
            ams_humidity.append({
                "ams_id": unit.get("id"),
                "humidity": unit.get("humidity"),
                "temp": unit.get("temp"),
            })
            for tray in unit.get("tray", []):
                if not tray.get("tray_type"):
                    continue  # skip empty/missing slots
                filament_used.append({
                    "ams_id": unit.get("id"),
                    "tray_id": tray.get("id"),
                    "tray_type": tray.get("tray_type"),
                    "tray_color": tray.get("tray_color"),
                    "tray_uuid": tray.get("tray_uuid"),
                    "tag_uid": tray.get("tag_uid"),
                    "tray_info_idx": tray.get("tray_info_idx"),
                    "tray_id_name": tray.get("tray_id_name"),
                    "tray_sub_brands": tray.get("tray_sub_brands"),
                    "tray_diameter": tray.get("tray_diameter"),
                    "nozzle_temp_min": tray.get("nozzle_temp_min"),
                    "nozzle_temp_max": tray.get("nozzle_temp_max"),
                    "remain": tray.get("remain"),
                    "tray_weight": tray.get("tray_weight"),
                    "drying_temp": tray.get("drying_temp"),
                    "drying_time": tray.get("drying_time"),
                    "bed_temp": tray.get("bed_temp"),
                })

    return {
        "print_name": state.get("subtask_name"),
        "result": result,
        "start_time": start_iso,
        "end_time": end_iso,
        "duration_seconds": duration,
        "total_layers": state.get("total_layer_num"),
        "layers_completed": state.get("layer_num"),
        "progress_percent": state.get("mc_percent"),
        "print_type": state.get("print_type"),
        "nozzle_temp": state.get("nozzle_temper"),
        "bed_temp": state.get("bed_temper"),
        "chamber_temp": state.get("chamber_temper"),
        "nozzle_diameter": state.get("nozzle_diameter"),
        "nozzle_type": state.get("nozzle_type"),
        "speed_level": state.get("spd_lvl"),
        "speed_percent": state.get("spd_mag"),
        "fan_cooling": state.get("cooling_fan_speed"),
        "fan_heatbreak": state.get("heatbreak_fan_speed"),
        "fan_chamber": state.get("big_fan1_speed"),
        "print_error": state.get("print_error"),
        "wifi_signal": _parse_wifi_signal(state.get("wifi_signal")),
        "ams_humidity": ams_humidity,
        "filament_used": filament_used,
        "archive_timestamp": datetime.now(timezone.utc).isoformat(),
        "printer_serial": printer_serial,
        "firmware_version": (
            state.get("hw_ver")
            or state.get("mc_ver")
            or (state.get("upgrade_state") or {}).get("ota_new_version_number")
            or (state.get("upgrade_state") or {}).get("new_ver_list", [{}])[0].get("sw_ver") if state.get("upgrade_state") else None
        ),
    }


class _ImplicitFTP_TLS(ftplib.FTP_TLS):
    """Implicit FTPS (port 990) with SSL session reuse on data channel."""

    def connect(self, host="", port=0, timeout=-999, source_address=None):
        if host:
            self.host = host
        if port:
            self.port = port
        if timeout != -999:
            self.timeout = timeout
        self.sock = socket.create_connection((self.host, self.port), self.timeout, source_address)
        self.sock = self.context.wrap_socket(self.sock, server_hostname=self.host)
        self.af = self.sock.family
        self.file = self.sock.makefile("r", encoding=self.encoding)
        self.welcome = self.getresp()
        return self.welcome

    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        conn = self.context.wrap_socket(conn, server_hostname=self.host,
                                        session=self.sock.session)
        return conn, size


def _connect_ftps(ip: str, access_code: str) -> _ImplicitFTP_TLS:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ftp = _ImplicitFTP_TLS(context=ctx)
    ftp.connect(ip, 990, timeout=30)
    ftp.login("bblp", access_code)
    ftp.prot_p()
    return ftp


def _find_3mf(ftp: ftplib.FTP_TLS, subtask_name: str) -> str | None:
    lines = []
    ftp.retrlines("LIST /", lines.append)

    candidates = []
    for line in lines:
        parts = line.split()
        if len(parts) < 9:
            continue
        fname = " ".join(parts[8:])
        if not fname.endswith(".3mf"):
            continue
        candidates.append(fname)

    if not candidates:
        logger.warning("FTP: no .3mf files in /")
        return None

    if subtask_name:
        for name in candidates:
            if subtask_name in name or name.startswith(subtask_name):
                logger.info("FTP: matched %s", name)
                return name

    # fall back: last in LIST output (most recently written on FAT filesystems)
    logger.warning("FTP: no name match for %r, falling back to last file: %s", subtask_name, candidates[-1])
    return candidates[-1]


def _download_3mf(ftp: ftplib.FTP_TLS, remote_name: str) -> bytes:
    buf = io.BytesIO()
    ftp.retrbinary(f"RETR /{remote_name}", buf.write)
    return buf.getvalue()


def _extract_thumbnail(data: bytes, dest_path: str):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            candidates = [n for n in z.namelist() if n.lower().endswith(".png") and "thumbnail" in n.lower() or "plate_" in n.lower()]
            if not candidates:
                candidates = [n for n in z.namelist() if n.lower().endswith(".png")]
            if not candidates:
                logger.info("3MF has no PNG thumbnail, skipping")
                return
            thumb_name = next((n for n in candidates if "plate_1" in n), candidates[0])
            with z.open(thumb_name) as src, open(dest_path, "wb") as dst:
                dst.write(src.read())
            logger.info("Thumbnail extracted from %s", thumb_name)
    except Exception:
        logger.exception("Failed to extract thumbnail")


def run_archive_pipeline(state: dict, cfg: dict):
    printer = cfg["printer"]
    archive_path = cfg["archive"]["path"]
    gcode_state = state.get("gcode_state", "FINISH")
    result = RESULT_MAP.get(gcode_state, "unknown")
    end_time = datetime.now(timezone.utc)

    print_name = state.get("subtask_name") or "unnamed"
    safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in print_name)
    folder_base = f"{end_time.strftime('%Y-%m-%d_%H%M%S')}_{safe_name}_{result}"
    folder_path = _safe_folder_name(folder_base, archive_path)
    os.makedirs(folder_path, exist_ok=True)
    logger.info("Archive folder: %s", folder_path)

    # Download 3MF via FTPS
    three_mf_data = None
    three_mf_filename = None
    ftp = None
    try:
        ftp = _connect_ftps(printer["ip"], printer["access_code"])
        remote_name = _find_3mf(ftp, state.get("subtask_name"))
        if remote_name:
            three_mf_data = _download_3mf(ftp, remote_name)
            three_mf_filename = remote_name
            logger.info("Downloaded %s (%d bytes)", remote_name, len(three_mf_data))
        else:
            logger.warning("No matching 3MF found on printer, skipping download")
        if ftp is not None:
            try:
                ftp.quit()
            except Exception:
                pass
    except Exception:
        logger.exception("FTPS error during archive pipeline")

    if three_mf_data and three_mf_filename:
        dest_3mf = os.path.join(folder_path, three_mf_filename)
        with open(dest_3mf, "wb") as f:
            f.write(three_mf_data)
        _extract_thumbnail(three_mf_data, os.path.join(folder_path, "thumbnail.png"))

    metadata = _build_metadata(state, result, end_time, folder_path, printer["serial"])
    with open(os.path.join(folder_path, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    logger.info("Archive complete: %s", folder_path)
    return folder_path
