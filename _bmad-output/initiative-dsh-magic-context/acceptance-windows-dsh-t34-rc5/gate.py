"""One final real Web gate. No model self-report is used for conformance."""
from __future__ import annotations

import hashlib
import json
from compression import zstd
from pathlib import Path
import re
import secrets
import sqlite3
import sys

from prepare import save
from preflight import browser, check_root, web_host

TAG = re.compile(r"^§(\d+)§ ")


def one(rows, label):
    selected = list(rows)
    assert len(selected) == 1, f"{label}: expected one, found {len(selected)}"
    return selected[0]


def read_db(path, query, params=()):
    assert path.is_file()
    with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        return [dict(row) for row in db.execute(query, params)]


def events_from_observer(profile, pid, tool):
    for path in (profile / "observer").glob("session-*.jsonl"):
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
        matching = [row for row in rows if row["processId"] == pid]
        if matching and any(e["type"] == "tool/call" and e["data"]["name"] == tool for e in matching[-1]["events"]):
            yield matching[-1]


def body(event):
    data = event["data"]
    message = data.get("message")
    content = message.get("content") if isinstance(message, dict) else data.get("content")
    if not isinstance(content, list):
        return ""
    return "".join(block.get("text", "") for block in content
                   if isinstance(block, dict) and block.get("type") == "text")


def call_id(event):
    if event["type"] == "tool/call":
        return event["data"]["callId"]
    return event["data"]["message"]["toolCallId"]


def seq(event):
    return int(event["seq"])


def tool_pair(events, name, after=0):
    call = one((event for event in events if event["type"] == "tool/call"
                and event["data"]["name"] == name and seq(event) > after), f"{name} invocation")
    result = one((event for event in events if event["type"] == "tool/result"
                   and call_id(event) == call_id(call) and seq(event) > seq(call)), f"{name} result")
    return call, result


def journal(profile, sid):
    rows = read_db(profile / "plugin-data/dsh-magic-context.db",
                   "SELECT id, kind, summary, data FROM journal WHERE session_id=? ORDER BY id", (sid,))
    return [{**row, "data": json.loads(row["data"] or "{}")} for row in rows]


def persisted_events(profile, original, placeholder, restored):
    # Search the host's own JSONL, not the observer's output. All target events
    # must match both the real host sequence and the synthetic tool payload.
    wanted = {seq(event): event for event in (original, placeholder, restored)}
    candidates = []
    for path in (profile / "dsh-home/sessions").rglob("*.jsonl*"):
        assert path.resolve().is_relative_to(profile.resolve())
        if not path.is_file() or not path.name.endswith((".jsonl", ".jsonl.zstd")):
            continue
        text = (zstd.decompress(path.read_bytes()).decode("utf-8") if path.suffix == ".zstd"
                else path.read_text(encoding="utf-8"))
        found = {}
        for line in text.splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            for event in (row, row.get("event"), row.get("data")):
                if not isinstance(event, dict) or event.get("type") != "tool/result":
                    continue
                index = seq(event)
                if index in wanted and call_id(event) == call_id(wanted[index]) and body(event) == body(wanted[index]):
                    found[index] = True
        if found.keys() == wanted.keys():
            candidates.append(path.relative_to(profile).as_posix())
    return one(candidates, "native DSH JSONL holding original, placeholder and expand")


def evidence_event(event):
    report = {"seq": seq(event), "callId": call_id(event), "type": event["type"]}
    if event["type"] == "tool/call":
        report["name"] = event["data"]["name"]
    else:
        report["textSha256"] = hashlib.sha256(body(event).encode()).hexdigest()
    return report


def confirm_lifecycle(profile, pid, fixture, project, content):
    snap = one(events_from_observer(profile, pid, "ctx_expand"), "candidate lifecycle session")
    events = snap["events"]
    expand_call, expand_result = tool_pair(events, "ctx_expand")
    original = one((e for e in events if e["type"] == "tool/result" and seq(e) < seq(expand_call)
                    and fixture in body(e)), "original fixture")
    original_id = call_id(original)
    tag = int(TAG.match(body(original))[1])
    read_call = one((e for e in events if e["type"] == "tool/call" and call_id(e) == original_id), "original call id")
    # Count invocations of the observed Read tool, not just uses of the original callId:
    # a replay could otherwise allocate a new callId.
    one((e for e in events if e["type"] == "tool/call" and e["data"]["name"] == read_call["data"]["name"]), "fixture tool invoked exactly once")
    reduce_call, reduce_result = tool_pair(events, "ctx_reduce", after=seq(original))
    assert "Queued 1 tag for reclaim." in body(reduce_result)
    placeholder = one((e for e in events if e["type"] == "tool/result" and call_id(e) == original_id
                       and body(e) == f"[dropped §{tag}§]"), "placeholder")
    assert seq(original) < seq(reduce_call) < seq(reduce_result) < seq(placeholder) < seq(expand_call)
    # The expand result keeps the stored payload verbatim (its old tag included);
    # only the post-execute outer tag is new.
    assert TAG.sub("", body(expand_result), count=1) == body(original), "restored payload differs"
    assert call_id(expand_result) != original_id
    assert seq(placeholder) in map(int, snap["surface"]) and seq(original) not in map(int, snap["surface"])
    native_path = persisted_events(profile, original, placeholder, expand_result)
    write_call, write_result = tool_pair(events, "ctx_memory", after=seq(expand_result))
    memory = one(read_db(profile / "plugin-data/memories.db",
                         "SELECT id, project_path, category, status, source_session_id, retrieval_count FROM memories WHERE project_path=? AND content=?",
                         (project, content)), "persisted new project memory")
    assert memory["category"] == "PROJECT_RULES" and memory["status"] == "active"
    assert memory["source_session_id"] == snap["sessionId"]
    assert re.search(rf"\b(?:id=|#|memory )\s*{memory['id']}\b", body(write_result), re.I), "write receipt does not identify row"
    rows = journal(profile, snap["sessionId"])
    queued = one((r for r in rows if r["data"].get("tool") == "ctx_reduce" and r["data"].get("queued") == [tag]), "queued journal")
    landed = one((r for r in rows if r["kind"] == "drop-landed"), "landed journal")
    restored = one((r for r in rows if r["data"].get("tool") == "ctx_expand" and r["data"].get("restored") == [tag]), "expand journal")
    write = one((r for r in rows if r["data"].get("action") == "write" and r["data"].get("identity") == project
                 and r["data"].get("ok") is True), "write journal")
    return {
        "pid": pid, "sessionId": snap["sessionId"], "tag": tag, "nativeEventLog": native_path,
        "readCount": 1, "fixtureCall": evidence_event(read_call), "original": evidence_event(original),
        "queue": evidence_event(reduce_result), "placeholder": {**evidence_event(placeholder), "text": body(placeholder)},
        "expandCall": evidence_event(expand_call), "expandResult": evidence_event(expand_result),
        "samePayloadWithoutTagPrefix": True, "placeholderStillOnSurface": True,
        "writeCall": evidence_event(write_call), "writeResult": evidence_event(write_result),
        "memoryWriteJournal": write["id"], "queueJournal": queued["id"], "landedJournal": landed["id"],
        "restoreJournal": restored["id"], "memoryBeforeRestart": memory,
    }


def confirm_search(profile, pid, first, query, content):
    snap = one(events_from_observer(profile, pid, "ctx_memory"), "new-process search session")
    old = first["memoryBeforeRestart"]
    assert pid != first["pid"] and snap["sessionId"] != first["sessionId"]
    assert not any(e["type"] == "user/message" and content in body(e) for e in snap["events"])
    call, result = tool_pair(snap["events"], "ctx_memory")
    assert re.search(rf"\bid={old['id']}\b", body(result)) and content in body(result), "search receipt does not identify the persisted memory"
    row = one((r for r in journal(profile, snap["sessionId"]) if r["data"].get("action") == "search"
               and r["data"].get("explicitProject") == old["project_path"]
               and r["data"].get("identity") == old["project_path"]
               and r["data"].get("query") == query and r["data"].get("hits") == 1
               and r["data"].get("ok") is True), "search journal")
    current = one(read_db(profile / "plugin-data/memories.db",
                          "SELECT id, project_path, source_session_id, retrieval_count FROM memories WHERE id=? AND content=?",
                          (old["id"], content)), "unchanged corpus identity after restart")
    assert current["project_path"] == old["project_path"] and current["source_session_id"] == first["sessionId"]
    assert current["retrieval_count"] == (old["retrieval_count"] or 0) + 1
    return {"pid": pid, "sessionId": snap["sessionId"], "searchCall": evidence_event(call),
            "searchResult": evidence_event(result), "searchJournal": row["id"], "memoryAfterRestart": current}


def main():
    root = check_root(Path(sys.argv[1]))
    evidence = root / "evidence"
    profile = root / "candidate"
    settings = json.loads((evidence / "web-settings.json").read_text(encoding="utf-8"))
    assert any(step["name"] == "plugin-settings-rendered" for step in settings["steps"])
    assert json.loads((evidence / "non-model-preflight.json").read_text(encoding="utf-8"))["passed"] is True
    started = evidence / "final-gate-started.json"
    if started.is_file():
        # Resume after a failed Web step: keep the same synthetic identities.
        case = json.loads(started.read_text(encoding="utf-8"))
    else:
        fixture_marker = f"fixture_nonce={secrets.token_hex(10)}"
        project = f"dir:{secrets.token_hex(20)}"
        query = f"t34persistence{secrets.token_hex(6)}"
        content = f"Project T34 synthetic convention: store the {query} marker on the amber test shelf."
        case = {"project": project, "query": query, "content": content, "fixtureMarker": fixture_marker}
        with started.open("x", encoding="utf-8") as out:
            json.dump(case, out)
    fixture_marker, project, query, content = (case["fixtureMarker"], case["project"], case["query"], case["content"])
    # The Web app opens its default workspace under the isolated user home, not the process cwd.
    workspace = profile / "user-home/Documents/deepseek-harness/default-workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "fixture.txt").write_text(f"T34 synthetic fixture.\n{fixture_marker}\n", encoding="utf-8")
    (profile / "workspace/fixture.txt").write_text(f"T34 synthetic fixture.\n{fixture_marker}\n", encoding="utf-8")
    prompts = {
        "fixtureMarker": fixture_marker,
        "seed": "Use the read file tool once on fixture.txt in your current workspace (relative path). "
                "Do not use any other tool. When the tool returns, reply exactly T34-SEED-DONE.",
        "reduce": 'Call ctx_reduce exactly once with drop="{TAG}" to queue the fixture result for reclaim. '
                  "Do not call any other tool. Then reply exactly T34-QUEUE-DONE.",
        "trigger": "This message triggers the already queued flush. Do not use tools. Reply exactly T34-LAND-DONE.",
        "restore": 'Call ctx_expand exactly once with tag="{TAG}". After it returns, call ctx_memory once with '
                   f'action="write", project="{project}", category="PROJECT_RULES", content="{content}". '
                   "Do not use other tools. Then reply exactly T34-WRITE-DONE.",
    }
    if "--restart-only" in sys.argv:
        # The lifecycle Web workflow already completed; only the fresh-process
        # search remains. Re-derive it from the persisted evidence, never re-run it.
        first = json.loads((evidence / "lifecycle.json").read_text(encoding="utf-8"))
    else:
        with web_host(root, "candidate", "candidate-lifecycle", model=True) as (url, pid, _):
            browser(root, url, "lifecycle", prompts)
        first = confirm_lifecycle(profile, pid, fixture_marker, project, content)
        save(evidence / "lifecycle.json", first)
    with web_host(root, "candidate", "candidate-restart", model=True) as (url, pid, _):
        browser(root, url, "restart-search", {
            "search": f'Use ctx_memory once with action="search", project="{project}", query="{query}", limit=1. '
                      "Do not use any other tool. Then reply exactly T34-SEARCH-DONE.",
        })
    save(evidence / "restart-search.json", confirm_search(profile, pid, first, query, content))


if __name__ == "__main__":
    main()
