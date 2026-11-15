"""Recompute the combined-build evidence from raw artifacts (read-only)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sqlite3

REPORT_DIR = Path(__file__).resolve().parent
ROOT = Path(json.loads((REPORT_DIR / "experiment-root.json").read_text(encoding="utf-8"))["root"])
EVIDENCE = ROOT / "evidence"
DB = ROOT / "plugin-data" / "dsh-magic-context.db"
MEMORY_DB = ROOT / "plugin-data" / "memories.db"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def strip_outer(text: str) -> tuple[int | None, str | None]:
    match = re.match(r"^§(\d+)§ ", text)
    if match is None:
        return None, None
    return int(match.group(1)), text[match.end():]


def state() -> dict:
    return json.loads((EVIDENCE / "combined-state.json").read_text(encoding="utf-8"))


def observer_events(session_id: str) -> list[dict]:
    path = EVIDENCE / "session-observer" / f"{session_id}.jsonl"
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    if not rows:
        return []
    return rows[-1].get("events", [])


def observer_last(session_id: str) -> dict:
    path = EVIDENCE / "session-observer" / f"{session_id}.jsonl"
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return rows[-1] if rows else {}


def find_text_event(session_id: str, predicate) -> dict | None:
    for event in observer_events(session_id):
        if predicate(event):
            return event
    return None


def event_text(event: dict) -> str:
    data = event.get("data") or {}
    content = (data.get("message") or {}).get("content") or data.get("content") or []
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def db_state(session_id: str) -> dict:
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    try:
        compartments = [dict(row) for row in connection.execute(
            "SELECT compartment_id, tier_p1, tier_p2, tier_p3, tier_p4, facts, events, importance, "
            "covered_start_seq, covered_end_seq, covered_seqs, covered_tokens, baseline_epoch, "
            "landed_event_seq, landed_reason, superseded "
            "FROM compartments WHERE session_id = ? ORDER BY compartment_id, landed_event_seq",
            (session_id,),
        )]
        journal = {}
        for kind in ("historian", "compartment-published", "pass", "drop-landed", "emergency-reclaim"):
            rows = [dict(row) for row in connection.execute(
                "SELECT id, at, kind, summary, data FROM journal WHERE session_id = ? AND kind = ? ORDER BY id",
                (session_id, kind),
            )]
            journal[kind] = {"count": len(rows), "maxId": rows[-1]["id"] if rows else None, "rows": rows}
        tags = [dict(row) for row in connection.execute(
            "SELECT tag_number, target_kind, target_id FROM tags WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
        pending = [dict(row) for row in connection.execute(
            "SELECT tag_number, queued_at, landed_event_seq, flush_requested "
            "FROM pending_drops WHERE session_id = ? ORDER BY tag_number",
            (session_id,),
        )]
    finally:
        connection.close()
    return {
        "compartments": compartments,
        "journal": journal,
        "tags": tags,
        "pendingDrops": pending,
        "compartmentSha256": sha256_bytes(json.dumps(compartments, sort_keys=True, ensure_ascii=False).encode("utf-8")),
    }


def memory_state() -> dict:
    if not MEMORY_DB.exists():
        return {"memories": 0, "memory_embeddings": 0, "spaces": []}
    connection = sqlite3.connect(MEMORY_DB)
    try:
        memories = connection.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
        embeddings = connection.execute("SELECT COUNT(*) FROM memory_embeddings").fetchone()[0]
        spaces = [
            {"model_id": row[0], "rows": row[1]}
            for row in connection.execute("SELECT model_id, COUNT(*) FROM memory_embeddings GROUP BY model_id ORDER BY model_id")
        ]
    finally:
        connection.close()
    return {"memories": memories, "memory_embeddings": embeddings, "spaces": spaces}


def installed_hashes() -> dict[str, str]:
    installed = ROOT / "dsh-home" / "profiles" / "headless" / "node_modules" / "@elvisw" / "dsh-plugin-magic-context"
    paths = [
        "lib/index.js",
        "lib/dsh/historian.js",
        "lib/dsh/drop-landing.js",
        "lib/dsh/memory-lane.js",
        "lib/dsh/tool-bridge.js",
        "lib/dsh/flush-command.js",
    ]
    return {path: sha256_bytes((installed / path).read_bytes()) for path in paths}


def npm_view_value(preflight: dict) -> dict:
    text = preflight.get("npm_view", "")
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        return {}
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return {}


def main() -> None:
    preflight = json.loads((EVIDENCE / "preflight.json").read_text(encoding="utf-8"))
    current = state()
    analysis = {}

    tarball = Path(preflight["tarball"])
    npm = npm_view_value(preflight)
    analysis["artifact"] = {
        "package": preflight["package"],
        "version": preflight["version"],
        "specifier": preflight["specifier"],
        "profileSpecifier": preflight["profile_specifier"],
        "tarball": str(tarball),
        "tarballSha256": sha256_bytes(tarball.read_bytes()),
        "preflightTarballSha256": preflight.get("tarball_sha256"),
        "tarballSha1": hashlib.sha1(tarball.read_bytes()).hexdigest(),
        "registryShasum": npm.get("dist.shasum"),
        "registryGitHead": npm.get("gitHead"),
        "repoHead": preflight.get("git_head"),
        "latest": (npm.get("dist-tags") or {}).get("latest"),
        "provenance": bool((npm.get("dist.attestations") or {}).get("provenance")),
        "installedHashes": installed_hashes(),
        "preflightInstalledHashes": preflight.get("installed_hashes"),
    }
    analysis["artifact"]["hashStable"] = analysis["artifact"]["installedHashes"] == analysis["artifact"]["preflightInstalledHashes"]
    analysis["artifact"]["sha256MatchesPreflight"] = analysis["artifact"]["tarballSha256"] == analysis["artifact"]["preflightTarballSha256"]
    analysis["artifact"]["shasumMatches"] = analysis["artifact"]["tarballSha1"] == analysis["artifact"]["registryShasum"]
    analysis["artifact"]["gitHeadMatches"] = analysis["artifact"]["registryGitHead"] == analysis["artifact"]["repoHead"]

    recovery = current.get("recovery", {})
    rrecord = recovery.get("record", {})
    results = rrecord.get("tool_results", [])
    recovery_data = {"calls": [entry.get("tool") for entry in rrecord.get("tool_calls", [])]}
    if len(results) >= 5:
        read_text = results[0].get("result", "")
        expand_old = results[2].get("result", "")
        expand_new = results[4].get("result", "")
        tag_old, payload_old = strip_outer(expand_old)
        tag_new, payload_new = strip_outer(expand_new)
        recovery_data.update({
            "readTag": (strip_outer(read_text)[0]),
            "expandOldTag": tag_old,
            "expandNewTag": tag_new,
            "oldPayloadMatchesRead": payload_old == read_text,
            "newPayloadMatchesOldExpand": payload_new == expand_old,
            "readSha256": sha256_bytes(read_text.encode("utf-8")),
            "expandOldPayloadSha256": sha256_bytes((payload_old or "").encode("utf-8")),
            "finalText": rrecord.get("final_text"),
        })
    recovery_data["placeholderEvents"] = [
        event_text(event) for event in observer_events(rrecord.get("session_id", ""))
        if event_text(event) == f"[dropped §{(recovery.get('identity') or {}).get('tag')}§]"
    ]
    recovery_data["dbTags"] = (recovery.get("check") or {}).get("db", {}).get("tags")
    recovery_data["pendingDrops"] = (recovery.get("check") or {}).get("db", {}).get("pendingDrops")
    recovery_data["finalOk"] = "RECOVERY_OK" in (rrecord.get("final_text") or "")
    old_reduce = recovery.get("oldTagReduce") or {}
    old_result = (old_reduce.get("tool_results") or [{}])[0].get("result") if old_reduce else None
    recovery_data["oldTagReduce"] = {
        "finalText": old_reduce.get("final_text"),
        "result": old_result,
        "alreadyDropped": "already dropped" in (old_result or ""),
        "pendingDropsAfter": db_state(rrecord.get("session_id", ""))["pendingDrops"] if rrecord.get("session_id") else [],
    }
    analysis["recovery"] = recovery_data

    hist = current.get("historian", {})
    identity = hist.get("identity") or {}
    hist_data = {
        "sessionId": hist.get("sessionId"),
        "tag": identity.get("tag"),
        "originalSeq": identity.get("originalSeq"),
        "placeholderSeq": identity.get("placeholderSeq"),
        "originalText": identity.get("originalText"),
        "originalSha256": identity.get("originalSha256"),
        "target": hist.get("target"),
        "precondition": hist.get("precondition"),
        "e1": hist.get("e1"),
        "e2": hist.get("e2"),
    }
    for label in ("e1", "e2"):
        row = hist.get(label) or {}
        result = row.get("result") or {}
        text = result.get("resultText", "")
        outer, payload = strip_outer(text)
        hist_data[f"{label}OuterTag"] = outer
        hist_data[f"{label}PayloadMatchesOriginal"] = payload == identity.get("originalText")
        hist_data[f"{label}PayloadSha256"] = sha256_bytes((payload or "").encode("utf-8"))
        hist_data[f"{label}ResultSeq"] = result.get("resultSeq")
        hist_data[f"{label}Window"] = row.get("window")
        calls = (row.get("record") or {}).get("tool_calls") or []
        hist_data[f"{label}Inputs"] = [call.get("input") for call in calls]
        hist_data[f"{label}OnlyExpectedLocator"] = (
            len(calls) == 1
            and (label == "e1" and "tag" in (calls[0].get("input") or {})
                 and "message" not in (calls[0].get("input") or {})
                 or label == "e2" and "message" in (calls[0].get("input") or {})
                 and "tag" not in (calls[0].get("input") or {})
                 and "tags" not in (calls[0].get("input") or {}))
        )
    hist_header = (hist.get("e1") or {}).get("window", {}).get("pre", {}).get("journal", {}).get("historian", {}).get("rows", [])
    hist_data["historianStart"] = hist_header[0] if hist_header else None
    hist_data["compartmentHashStable"] = all(
        (hist.get(label) or {}).get("window", {}).get("ok") is True for label in ("e1", "e2")
    )
    hist_data["currentDb"] = db_state(hist.get("sessionId", "")) if hist.get("sessionId") else {}
    orig_call = identity.get("callId")
    hist_data["originalCallCounts"] = {
        "toolCalls": sum(1 for event in observer_events(hist.get("sessionId", ""))
                         if event.get("type") == "tool/call" and (event.get("data") or {}).get("callId") == orig_call),
        "toolResults": sum(1 for event in observer_events(hist.get("sessionId", ""))
                           if event.get("type") == "tool/result"
                           and (event.get("data") or {}).get("message", {}).get("toolCallId") == orig_call),
    }
    hist_surface = observer_last(hist.get("sessionId", ""))
    hist_data["surfaceAfterE2"] = {
        "processId": hist_surface.get("processId"),
        "trigger": hist_surface.get("trigger"),
        "surface": hist_surface.get("surface"),
        "surfaceSha256": sha256_bytes(json.dumps(hist_surface.get("surface") or [], ensure_ascii=False).encode("utf-8")),
        "snapshotCount": sum(1 for _ in (EVIDENCE / "session-observer" / f"{hist.get('sessionId')}.jsonl").open(encoding="utf-8")),
    }
    analysis["historian"] = hist_data

    flush = current.get("flush", {})
    flush_db = db_state(flush.get("sessionId", "")) if flush.get("sessionId") else {}
    flush_placeholder = find_text_event(
        flush.get("sessionId", ""),
        lambda event: event.get("type") == "tool/result" and event_text(event).startswith("[dropped §"),
    )
    flush_data = {
        "sessionId": flush.get("sessionId"),
        "executions": flush.get("executions"),
        "commandEvents": flush.get("commandEvents"),
        "db": flush_db,
        "placeholderSeen": flush.get("placeholderSeen"),
        "placeholderEvent": flush_placeholder,
        "placeholderSeq": (flush_placeholder or {}).get("seq"),
        "historianAtE2Post": (hist.get("e2") or {}).get("window", {}).get("post", {}).get("journal", {}).get("historian", {}).get("count"),
    }
    if hist.get("sessionId"):
        hist_current = db_state(hist["sessionId"])
        e2_post = (hist.get("e2") or {}).get("window", {}).get("post") or {}
        flush_data["historianCrossSession"] = {
            "sameCompartments": hist_current["compartmentSha256"] == e2_post.get("compartmentSha256"),
            "sameTags": hist_current["tags"] == e2_post.get("tags"),
            "samePending": hist_current["pendingDrops"] == e2_post.get("pendingDrops"),
            "currentDb": hist_current,
        }
    analysis["flush"] = flush_data

    vector = current.get("vector", {})
    vector_db = vector.get("db", {})
    journal = vector_db.get("vector_journal", [])
    outcomes = [((row.get("data") or {}).get("outcome")) for row in journal]
    vector_text = json.dumps(vector.get("record", {}), ensure_ascii=False)
    analysis["vector"] = {
        "sessionId": (vector.get("record") or {}).get("session_id"),
        "memories": vector_db.get("memories"),
        "memoryEmbeddings": vector_db.get("memory_embeddings"),
        "spaces": vector_db.get("spaces"),
        "journal": journal,
        "outcomes": outcomes,
        "hybridMatch": "match=hybrid" in vector_text or '"match": "hybrid"' in vector_text,
        "memoryAfter": memory_state(),
    }

    activity_path = ROOT / "plugin-data" / "activity.log"
    activity_text = activity_path.read_text(encoding="utf-8", errors="replace") if activity_path.exists() else ""
    boot_paths = []
    for line in activity_text.splitlines():
        start = line.find("{")
        if start < 0:
            continue
        try:
            payload = json.loads(line[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and payload.get("dbPath"):
            boot_paths.append(payload["dbPath"])
    overlay_text = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in sorted((ROOT / "overlays").glob("*.yml")))
    old_roots = (
        "dsh-mc-acceptance-0112-j4ydat07",
        "dsh-mc-t2-20261114-010407",
        "dsh-mc-t3-20261114-161041",
        "dsh-mc-t4-20261114-174313",
        "dsh-mc-vector-20261114",
    )
    analysis["isolation"] = {
        "root": str(ROOT),
        "overlays": preflight.get("overlays"),
        "activityLog": str(activity_path),
        "bootDbPaths": sorted(set(boot_paths)),
        "allBootPathsInRoot": all(path.startswith(str(ROOT)) for path in boot_paths) if boot_paths else False,
        "oldRootReferencesInOverlays": [old for old in old_roots if old in overlay_text],
        "oldRootReferencesInActivity": [old for old in old_roots if old in activity_text],
        "outsideRootBootPaths": [path for path in sorted(set(boot_paths)) if not path.startswith(str(ROOT))],
    }

    final_sessions = {
        rrecord.get("session_id"),
        hist.get("sessionId"),
        flush.get("sessionId"),
        (vector.get("record") or {}).get("session_id"),
    }
    discarded = {}
    for path in sorted((EVIDENCE / "session-observer").glob("session-*.jsonl")):
        session_id = path.stem
        if session_id in final_sessions:
            continue
        snap = observer_last(session_id)
        events = snap.get("events") or []
        prompt = next((
            event_text(event) for event in events
            if event.get("type") == "user/message" and "isolated 0.12.2" in event_text(event)
        ), "")
        discarded[session_id] = {
            "snapshots": sum(1 for _ in path.open(encoding="utf-8")),
            "lastProcessId": snap.get("processId"),
            "prompt": prompt[:220],
            "tags": db_state(session_id)["tags"],
            "pendingDrops": db_state(session_id)["pendingDrops"],
        }
    analysis["discardedSessions"] = discarded

    evidence_files = []
    for path in sorted(EVIDENCE.rglob("*")):
        if path.is_file():
            evidence_files.append({"path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size, "sha256": sha256_bytes(path.read_bytes())})
    analysis["evidence"] = evidence_files
    (EVIDENCE / "combined-analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "artifact": {key: analysis["artifact"][key] for key in ("version", "profileSpecifier", "shasumMatches", "gitHeadMatches", "hashStable")},
        "recovery": {key: recovery_data.get(key) for key in ("finalOk", "oldPayloadMatchesRead", "newPayloadMatchesOldExpand")},
        "historian": {key: hist_data.get(key) for key in ("compartmentHashStable", "e1PayloadMatchesOriginal", "e2PayloadMatchesOriginal", "originalCallCounts")},
        "flush": {"executions": len(flush.get("executions") or []), "pending": flush_db.get("pendingDrops"), "crossSession": flush_data.get("historianCrossSession", {}).get("sameCompartments")},
        "vector": {"embeddings": vector_db.get("memory_embeddings"), "outcomes": outcomes, "hybridMatch": analysis["vector"]["hybridMatch"]},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
