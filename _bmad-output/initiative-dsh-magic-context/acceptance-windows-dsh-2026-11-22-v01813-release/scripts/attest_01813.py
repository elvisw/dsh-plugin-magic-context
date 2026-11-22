"""Record the npm provenance attestations for 0.18.13."""
import json
import pathlib
import urllib.request

OUT = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context/_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-22-v01813-release/evidence")
url = "https://registry.npmjs.org/-/npm/v1/attestations/@elvisw/dsh-magic-context@0.18.13"
with urllib.request.urlopen(url, timeout=60) as response:
    data = json.loads(response.read())
rows = []
for attestation in data.get("attestations", []):
    payload = attestation.get("bundle", {}).get("dsseEnvelope", {}).get("payload", "")
    rows.append({"predicateType": attestation.get("predicateType"), "payloadLength": len(payload)})
report = {"attestationCount": len(rows), "predicateTypes": rows}
(OUT / "provenance.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(report, indent=2))
