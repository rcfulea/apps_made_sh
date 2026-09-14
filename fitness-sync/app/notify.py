"""Outbound push via ntfy (ntfy.sh or self-hosted) — a lightweight extension of the
sync loop rather than a new service, fitting the no-cloud philosophy: set NTFY_URL to
a topic URL and the loop pings it on a new PR, a readiness dip, or a broken meal
streak (see app/sync/loop.py). Silently a no-op if NTFY_URL is unset — never required.
"""
import os, urllib.request

NTFY_URL = os.environ.get("NTFY_URL", "").strip()


def send(title, message, priority="default", tags=None):
    if not NTFY_URL:
        return False
    headers = {"Title": title, "Priority": priority}
    if tags:
        headers["Tags"] = ",".join(tags)
    req = urllib.request.Request(NTFY_URL, data=message.encode("utf-8"),
                                  headers=headers, method="POST")
    try:
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False
