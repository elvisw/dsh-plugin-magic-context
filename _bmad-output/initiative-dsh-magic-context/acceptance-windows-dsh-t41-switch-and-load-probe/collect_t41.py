"""Collect T41 gate evidence and the T40 regression run."""
import hashlib
import json
import pathlib
import re

REPO = pathlib.Path(r"C:/Users/elvis/Documents/dev/plugin/dsh-plugin-magic-context")
REPORT = REPO / "_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t41-switch-and-load-probe"
T40_REPORT = REPO / "_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-t40-decoupled-embedding-actions"
evidence = REPORT / "evidence"
evidence.mkdir(parents=True, exist_ok=True)

root = pathlib.Path(json.loads((REPORT / "experiment-root.json").read_text(encoding="utf-8"))["root"])
for name in ["prepare.json", "ui-gate.json", "gate-run.txt", "server-log.txt", "host-env.json"]:
    source = root / "evidence" / name
    if not source.exists():
        print("missing", name)
        continue
    text = source.read_text(encoding="utf-8", errors="replace")
    if name == "server-log.txt":
        text = re.sub(r"(\?token=)[^\s&\"']+", r"\1<redacted>", text)
    (evidence / name).write_text(text, encoding="utf-8", newline="\n")
    print("copied", name)

t40_root = pathlib.Path(json.loads((T40_REPORT / "experiment-root.json").read_text(encoding="utf-8"))["root"])
gate = json.loads((t40_root / "evidence" / "ui-gate.json").read_text(encoding="utf-8"))
(evidence / "t40-regression.json").write_text(json.dumps({
    "note": "T40 gate re-run against the T41 candidate bytes (same tarball as this ticket)",
    "steps": len(gate["steps"]),
    "failures": gate["failures"],
    "errors": gate["errors"],
}, indent=2) + "\n", encoding="utf-8", newline="\n")
print("t40 regression", len(gate["steps"]), len(gate["failures"]), len(gate["errors"]))

prepare = json.loads((evidence / "prepare.json").read_text(encoding="utf-8"))
tarball = pathlib.Path(prepare["tarball"])


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


provenance = {
    "source": {
        "src/client/index.js": sha(REPO / "src/client/index.js"),
        "lib/client.js": sha(REPO / "lib/client.js"),
        "tests/client-pure.spec.ts": sha(REPO / "tests/client-pure.spec.ts"),
    },
    "candidate": {
        "path": tarball.name,
        "sha256": prepare["tarball_sha256"],
        "bytes": prepare["tarball_bytes"],
        "members": prepare["tarball_files"],
    },
    "host": {"dshVersion": prepare["dsh_version"]},
}
(evidence / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(provenance, indent=2))
