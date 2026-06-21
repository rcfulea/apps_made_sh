import json
import logging
import os
from datetime import datetime

from flask import Flask, abort, jsonify, render_template, request, send_file

logger = logging.getLogger(__name__)


def _load_prints(archive_path: str) -> list[dict]:
    prints = []
    if not os.path.isdir(archive_path):
        return prints
    for entry in sorted(os.scandir(archive_path), key=lambda e: e.name, reverse=True):
        if not entry.is_dir():
            continue
        meta_path = os.path.join(entry.path, "metadata.json")
        if not os.path.exists(meta_path):
            continue
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            meta["_folder"] = entry.name
            meta["_has_thumbnail"] = os.path.exists(os.path.join(entry.path, "thumbnail.png"))
            three_mf = [n for n in os.listdir(entry.path) if n.endswith(".3mf")]
            meta["_three_mf"] = three_mf[0] if three_mf else None
            prints.append(meta)
        except Exception:
            logger.exception("Failed to load metadata from %s", entry.path)
    return prints


def create_app(cfg: dict, archive_pipeline_fn=None):
    app = Flask(__name__, template_folder="templates")
    archive_path = cfg["archive"]["path"]

    @app.route("/")
    def index():
        prints = _load_prints(archive_path)

        result_filter = request.args.get("result", "")
        filament_filter = request.args.get("filament", "").lower()
        search = request.args.get("search", "").lower()
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        sort = request.args.get("sort", "date")

        if result_filter:
            prints = [p for p in prints if p.get("result") == result_filter]
        if filament_filter:
            prints = [
                p for p in prints
                if any(
                    filament_filter in (t.get("tray_type") or "").lower()
                    for t in p.get("filament_used", [])
                )
            ]
        if search:
            prints = [p for p in prints if search in (p.get("print_name") or "").lower()]
        if date_from:
            prints = [p for p in prints if (p.get("end_time") or "") >= date_from]
        if date_to:
            prints = [p for p in prints if (p.get("end_time") or "") <= date_to + "Z"]

        if sort == "duration":
            prints.sort(key=lambda p: p.get("duration_seconds") or 0, reverse=True)
        elif sort == "result":
            prints.sort(key=lambda p: p.get("result") or "")
        else:
            prints.sort(key=lambda p: p.get("end_time") or "", reverse=True)

        all_filaments = sorted({
            t.get("tray_type") for p in _load_prints(archive_path)
            for t in p.get("filament_used", [])
            if t.get("tray_type")
        })

        return render_template(
            "index.html",
            prints=prints,
            result_filter=result_filter,
            filament_filter=filament_filter,
            search=search,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
            all_filaments=all_filaments,
        )

    @app.route("/print/<folder_name>")
    def print_detail(folder_name: str):
        folder_path = os.path.join(archive_path, folder_name)
        meta_path = os.path.join(folder_path, "metadata.json")
        if not os.path.exists(meta_path):
            abort(404)
        with open(meta_path) as f:
            meta = json.load(f)
        meta["_folder"] = folder_name
        meta["_has_thumbnail"] = os.path.exists(os.path.join(folder_path, "thumbnail.png"))
        three_mf = [n for n in os.listdir(folder_path) if n.endswith(".3mf")]
        meta["_three_mf"] = three_mf[0] if three_mf else None
        return render_template("detail.html", p=meta)

    @app.route("/thumbnail/<folder_name>")
    def thumbnail(folder_name: str):
        path = os.path.join(archive_path, folder_name, "thumbnail.png")
        if not os.path.exists(path):
            abort(404)
        return send_file(path, mimetype="image/png")

    @app.route("/download/<folder_name>/<filename>")
    def download(folder_name: str, filename: str):
        if not filename.endswith(".3mf"):
            abort(400)
        path = os.path.join(archive_path, folder_name, filename)
        if not os.path.exists(path):
            abort(404)
        return send_file(path, as_attachment=True)

    @app.route("/api/test")
    def api_test():
        if archive_pipeline_fn is None:
            return jsonify({"error": "pipeline not configured"}), 500
        try:
            folder = archive_pipeline_fn()
            return jsonify({"status": "ok", "folder": folder})
        except Exception as e:
            logger.exception("Test pipeline failed")
            return jsonify({"status": "error", "error": str(e)}), 500

    return app
