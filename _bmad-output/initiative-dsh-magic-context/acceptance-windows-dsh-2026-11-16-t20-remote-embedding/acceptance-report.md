# T20 acceptance — remote embedding provider (isolated Web host)

Status: implementation evidence, 2026-11-16. This is a **local simulation**
gate: the embedding endpoint is a fake OpenAI-compatible server. A separate
real SiliconFlow provider smoke is recorded in §3; it does not exercise the
DSH settings/rebuild flow.

## 1. Identity

| Item | Value |
|---|---|
| Plugin | `@elvisw/dsh-magic-context@0.15.0` |
| Host | DSH `0.2.2-rc.1`, Web profile `t20` |
| Node | `24.21.0` |
| Isolated root | `C:\Users\elvis\AppData\Local\Temp\opencode\dsh-mc-t20-20261117-002740` |
| Tarball | `b40b824885a0a6cf5e1fe7628fa9ad2ecae7a89d03624d7de5a12d2add09f762` (4,047,745 B / 68 files) |
| Fake provider | `http://127.0.0.1:11130/v1`, 16-dim `fixture-embed-a` |

The profile was bootstrapped from the `web` template into a fresh
`DSH_HOME`/`HOME`/`XDG_*` tree; the daily profile was not touched.

## 2. User-visible flow (Playwright, 10 steps, 0 console errors)

1. Settings → Magic Context shows the **向量检索** section while the configured
   remote provider is `remote-unprobed` (`未探测`, dimensions `—`, coverage
   unknown).
2. **加载模型** returns `fixture-embed-a` and `fixture-embed-b`; the model list
   is not compiled into the client.
3. **测试连接** probes the fake `/embeddings` endpoint and reports 16d. The
   config still has `dimensions: 0`; the 16 is a probe-cache result, not a
   hardcoded model width.
4. Before **开始重建向量**, the fake server saw exactly one `/embeddings`
   request with one input (the explicit probe) and no automatic query/backfill
   request. The remote config was pre-seeded by the prepare script rather than
   saved in this browser run, so this proves the gate is quiet before Start,
   not that a UI Save itself is request-free.
5. **开始重建向量** arms the target and runs one bounded pass. With
   `memory.vectorBackfillLimit: 2` and three searchable rows (two active, one
   permanent), the panel shows `迁移中` and `2/3` coverage.
6. **暂停** shows `已暂停` with the two landed rows still searchable.
7. **继续** completes the third row and shows `已就绪` / `3/3`.
8. **回滚到本地** calls the state-only `disarm`, stages
   `embedding.provider = local`, and the normal Save commits it. After reload
   the provider is `local`, the panel shows `已回滚到本地`, and the local
   lane reports `0/2` active rows: the two remote rows are not counted as a
   local space. The local lane remains active-only.
9. The gate profile used `apiKeyEnv: ''`, so no secret could enter the
   browser, config, journal or gate evidence. The separate real probe read the
   key only from `SILICONFLOW_API_KEY`.
10. The page produced no console or page errors.

Screenshots: `evidence/screenshots/01-initial-remote-unprobed.png` through
`05-rollback-local.png`.

## 3. Unit and static gates

- `npm test`: **80 files / 966 tests passed** (`evidence/unit-test.txt`).
- `npm run typecheck`: passed (`evidence/typecheck.txt`).
- `npm run check:i18n`: `ALL PASS` (`evidence/i18n.txt`).
- `npm run build`: passed (`evidence/build.txt`).
- Real SiliconFlow smoke (outside the fake-host gate): `GET
  /v1/models?sub_type=embedding` returned 8 models including `BAAI/bge-m3`;
  `POST /v1/embeddings` for `BAAI/bge-m3` returned **1024** dimensions in
  121 ms (`evidence/real-siliconflow-probe.json`). The key value was read only
  from `SILICONFLOW_API_KEY` and is not in the evidence.

The new tests cover: local vs namespaced remote identity; key presence rather
than key value; model-list auth; probe and
`dimensions-unsupported`; index-aware response mapping; model substitution;
width guard (including a probed width when the override is zero); 5xx retry;
empty/non-JSON rejection; input-too-long row isolation; metadata/userinfo/query
SSRF guards; route origin/content-type guards; target coverage over active +
permanent; explicit target planning; armed/paused/complete/disarm state; and
`/ctx-status` embedding line.

## 4. Evidence inventory

- `evidence/prepare.json`, `prepare-run.txt`, `bootstrap-web-template.txt`,
  `add-local-tarball.txt`, `dump-overlay.txt`
- `evidence/seed-corpus.json`
- `evidence/real-siliconflow-probe.json`
- `evidence/fake-server.json`, `fake-server-state.json`,
  `embedding-requests.jsonl`
- `evidence/ui-gate.json`
- `evidence/server-redacted.json`, `server-log.txt`
- `evidence/unit-test.txt`, `typecheck.txt`, `i18n.txt`, `build.txt`
- `evidence/host-version.json`, `host-version.txt`
- `evidence/screenshots/*.png`

`server-redacted.json` and `server-log.txt` are redacted copies; the live
server process owns `server.log` under the temp root and is not committed.

## 5. Boundaries

- The embedding provider is a **local fake**, not a real vendor. No quality,
  latency or cost claim is made.
- The real SiliconFlow probe is a provider-level smoke only (models + one short
  embedding). The T20 UI/rebuild gate remains the fake-server run; no real
  vendor vector was written into an isolated DSH profile.
- The browser gate covers the settings path and the rebuild state machine. The
  query-time FTS fallback after a remote error is a code path with a unit-test
  seam, but this run does not execute an agent `ctx_memory search`; that
  integration remains unverified here.
- The `ctx-status` line is covered by a command-surface unit test, not by a
  slash-command browser run.
- Project-tier guard: the plugin declares `embedding` in its own user-level
  config, but the current DSH config surface used here does not expose a
  project/tier marker, so a source-aware rejection of a project-provided
  `endpoint`/`apiKeyEnv` is **not implemented**. If the host starts merging
  project config into the same object, this needs a host-level source check.
- No package/release/tag/publish, daily-profile or dsh-go change was made.
