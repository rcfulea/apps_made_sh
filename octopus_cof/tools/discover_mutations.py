"""
Run this once to discover available GraphQL mutations on the Octopus API.
Usage:
    cd tools
    OCTOPUS_TOKEN="JWT eyJ..." python discover_mutations.py

This will print all mutation names containing "claim", "redeem", or "octoplus".
"""

import httpx
import os
import sys

API_URL = "https://api.octopus.energy/v1/graphql/"

INTROSPECTION_QUERY = """
{
  __schema {
    mutationType {
      fields {
        name
        args {
          name
          type {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                fields {
                  name
                  type {
                    name
                    kind
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""

token = os.environ.get("OCTOPUS_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else None)
if not token:
    print("Usage: OCTOPUS_TOKEN='JWT eyJ...' python discover_mutations.py")
    sys.exit(1)

resp = httpx.post(
    API_URL,
    json={"query": INTROSPECTION_QUERY},
    headers={"Authorization": token, "Content-Type": "application/json"},
    timeout=15,
)
resp.raise_for_status()
data = resp.json()

if "errors" in data:
    print("GraphQL errors:", data["errors"])
    sys.exit(1)

mutations = data["data"]["__schema"]["mutationType"]["fields"]
keywords = {"claim", "redeem", "octoplus", "reward", "voucher"}

print(f"\nFound {len(mutations)} total mutations. Filtering for relevant ones:\n")
for m in mutations:
    if any(kw in m["name"].lower() for kw in keywords):
        args = [
            f"{a['name']}: {a['type'].get('name') or a['type'].get('ofType', {}).get('name', '?')}"
            for a in m["args"]
        ]
        print(f"  {m['name']}({', '.join(args)})")

print("\nDone. Paste the relevant mutation name back to complete the claim_offer() implementation.")
