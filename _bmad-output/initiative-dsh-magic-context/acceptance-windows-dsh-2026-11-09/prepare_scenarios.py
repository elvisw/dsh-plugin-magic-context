"""Generate documented profile overlays and synthetic historian input."""

from __future__ import annotations

import json
from pathlib import Path
import shutil

from prepare_experiment import POINTER, REPORT_DIR


def main() -> None:
    root = Path(json.loads(POINTER.read_text(encoding="utf-8"))["root"])
    overlays = root / "overlays"
    overlays.mkdir(exist_ok=True)
    driver = root / "dsh-home" / "profiles" / "headless" / "acceptance-test-driver.mjs"
    shutil.copyfile(REPORT_DIR / "test-driver.mjs", driver)
    common = {
        "dataDir": (root / "plugin-data").as_posix(),
        "registerCompactionEngine": False,
        "historianEnabled": False,
        "policy": {"executeThreshold": 0},
        "maintenance": {"enabled": False},
        "memory": {"embedBackfill": False, "vectorBackfill": False,
                   "global": {"machine": {"enabled": False},
                              "user": {"render": False, "collect": False, "review": False}}},
    }
    base_rows = [
        {"id": "magic-context-dsh", "name": "dsh-plugin-magic-context", "config": common},
        {"id": "session-title-llm", "name": "@deepseek-ai/dsh-session-title-first-prompt-llm", "disabled": True},
        {"insert": [{"id": "acceptance-observer", "name": (REPORT_DIR / "observer.mjs").as_uri(),
                     "config": {"outDir": (root / "evidence" / "session-observer").as_posix()}}]},
    ]
    (overlays / "base-control.yml").write_text(json.dumps(base_rows, indent=2), encoding="utf-8")
    fixture_original = root / "workspace" / "fixture.txt"
    if not fixture_original.exists():
        shutil.copyfile(REPORT_DIR / "fixtures" / "fixture-before.txt", fixture_original)
    for label, takeover, disable_host in [("conflict", True, False), ("takeover", True, True), ("fallback", False, False)]:
        config = {**common, "registerCompactionEngine": takeover}
        rows = [{"id": "magic-context-dsh", "name": "dsh-plugin-magic-context", "config": config},
                {"id": "compaction-basic", "name": "@deepseek-ai/dsh-compaction-basic", "disabled": disable_host}]
        (overlays / f"{label}.yml").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    historian_config = {
        **common, "historianEnabled": True,
        "policy": {"executeThreshold": 0, "historianProtectedNodes": 1,
                   "historianMinNodes": 1, "historianTimeoutMs": 45000},
    }
    historian_rows = [
        {"id": "magic-context-dsh", "name": "dsh-plugin-magic-context", "config": historian_config},
        {"id": "tool-result-pruner", "name": "@deepseek-ai/dsh-compaction-tool-result-pruner", "disabled": True},
        {"id": "llm-deepseek", "name": "@deepseek-ai/dsh-llm-deepseek-api-key",
         "config": {"models": [{"id": "deepseek-flash", "contextWindow": 32768, "maxTokens": 8192}],
                    "maxTokens": 4096, "reasoningEffort": "off"}},
        {"insert": [{"id": "acceptance-test-driver", "name": driver.as_uri()}]},
    ]
    (overlays / "historian.yml").write_text(json.dumps(historian_rows, indent=2), encoding="utf-8")
    lines = ["SYNTHETIC HISTORIAN LOAD. No real user data."]
    lines += [f"row={index:04d} " + "synthetic context continuity sample " * 3 for index in range(230)]
    lines += ["END_HISTORIAN_SYNTHETIC_LOAD_51a6c26a"]
    fixture = root / "workspace" / "historian-fixture.txt"
    fixture.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"overlays": str(overlays), "historian_fixture_bytes": fixture.stat().st_size,
                      "catalog_window_override": 32768, "historian_model": "real DeepSeek API"}, indent=2))


if __name__ == "__main__":
    main()
