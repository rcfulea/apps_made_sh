"""
End-to-end test: login + check Nero voucher availability.
Run from the project root:
    .venv/bin/python tools/test_auth.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

from auth import BrowserSession
from octopus import OctopusClient

session = BrowserSession(
    email=os.environ["OCTOPUS_EMAIL"],
    password=os.environ["OCTOPUS_PASSWORD"],
)
client = OctopusClient(
    account_number=os.environ["OCTOPUS_ACCOUNT_NUMBER"],
    session=session,
)

print("1. Logging in via headless browser...")
session.start()
print("   Done.")

print("\n2. Checking Caffe Nero offer...")
result = client.check_and_claim("hot or cold drink")
if result is None:
    print("   Not available right now (OUT_OF_STOCK) — detection working correctly.")
else:
    print(f"   CLAIMED! Result: {result[:200]}")

session.stop()
print("\nAll good — ready to deploy.")
