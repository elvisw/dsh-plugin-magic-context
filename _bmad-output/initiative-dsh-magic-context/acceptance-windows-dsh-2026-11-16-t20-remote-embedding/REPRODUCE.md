# Reproduce — T20 remote embedding Web gate

This reproduces the **local fake-server** host gate. It does not use a real
embedding vendor and does not require `SILICONFLOW_API_KEY`.

## 0. Prerequisites

- Node 24.21.0 at `C:\Users\elvis\AppData\Local\Author Software\nvm\installs\v24.21.0\node.exe`
- DSH CLI at `C:\Users\elvis\AppData\Local\Temp\opencode\mc-t0-2026-11-13\tools\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js`
- `DEEPSEEK_API_KEY` only for the host LLM adapter; settings and the fake
  embedding endpoint do not call a model.
- Playwright at `C:\Users\elvis\node_modules\.deno\playwright@1.63.0`.

The scripts use fixed local paths and create fresh temp roots. They never touch
the daily DSH profile.

## 1. Build and pack

From the repository root:

```powershell
npm run build
New-Item -ItemType Directory -Force "$env:TEMP\opencode\t20-pack" | Out-Null
npm pack --pack-destination "$env:TEMP\opencode\t20-pack"
```

Expected tarball: `elvisw-dsh-magic-context-0.15.0.tgz`. The recorded run used
SHA-256 `b40b824885a0a6cf5e1fe7628fa9ad2ecae7a89d03624d7de5a12d2add09f762`,
4,047,745 bytes, 68 files. A new pack with source changes will have a different
hash; do not reuse the old value as a claim.

## 2. Start the fake provider and isolated host

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-t20-remote-embedding/run_t20_host.py
```

`run_t20_host.py`:

1. allocates a free port for `fake_embedding_server.py`;
2. runs `prepare_t20_host.py --fake-port <port>`, which bootstraps a fresh
   `t20` profile from `web`, installs the local tarball, writes the profile
   patch (isolated `dataDir`, memory on, `vectorBackfill: false`,
   `vectorBackfillLimit: 2`, remote provider pointing at the fake);
3. starts the real DSH Web host with an isolated `DSH_HOME`/`HOME`/`XDG_*`;
4. writes `evidence/server.json` and a redacted `server-redacted.json`.

The live server URL contains a one-time token. It is written to
`evidence/server.json` only under the temp root; the committed
`server-redacted.json` replaces it with `<redacted>`.

## 3. Seed the isolated corpus

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-t20-remote-embedding/seed_t20_corpus.py
```

It waits for `<root>/plugin-data/memories.db`, then inserts three rows:
two `active` and one `permanent`. This forces a partial first pass with
`vectorBackfillLimit: 2`. `run_t20_host.py` invokes the same script
automatically after the host creates the database; run it manually only when
driving the host independently.

## 4. Drive the Web settings page

```powershell
node _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-t20-remote-embedding/t20_ui_gate.cjs
```

Expected observations (recorded in `evidence/ui-gate.json`):

- `initial`: provider `openai-compatible`, section present, start/probe buttons
  present, status `未探测`.
- `models-loaded`: options `["", "fixture-embed-a", "fixture-embed-b"]`.
- `probed`: status `未开始重建`, `16d`, `0/3`.
- `before-start-requests`: exactly one `embeddings` request with one input
  (the explicit probe), `automatic: 0`.
- `started`: `迁移中`, `2/3`.
- `paused`: `已暂停`, `2/3`.
- `resumed`: `已就绪`, `3/3`.
- `rollback-staged`: provider select `local`.
- `rollback-after-save`: provider `local`, status `已回滚到本地`, `0/2` active
  local rows (remote rows are not counted as a local space).
- `errors: []`.

## 5. Collect, scan and manifest

```powershell
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-t20-remote-embedding/collect_t20_evidence.py
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-t20-remote-embedding/scan_t20_secrets.py
python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-t20-remote-embedding/write_manifest.py
```

The recorded run scanned 24 tracked evidence files (`hits: 0`) and wrote a
35-entry `sha256-manifest.json`. The gitignored `experiment-root.json` pointer
is intentionally excluded; the acceptance directory itself is committed.

The scan covers `sk-`, `?token=`, and configured key names. `token=` appears
only as a redaction literal in the scan script / its output if present; no live
token is committed.

## 6. Stop the host

The run prints the host and fake-server PIDs. Stop both; do not leave the
isolated Web server running:

```powershell
Stop-Process -Id <host pid> -Force
Stop-Process -Id <fake pid> -Force
```
