---
ticket: 10
title: "0.12.2 combined host regression — plan"
status: done
---

# 0.12.2 combined host regression — plan

## Objective

Produce one evidence bundle proving the **published** `@elvisw/dsh-plugin-magic-context@0.12.2`
artifact still passes the T2/T3/T4/T8/T9 host-level chains when they share
the same build.

This is acceptance, not implementation. No product code changes are planned.

## Preconditions already met

- `0.12.2` is published by GitHub OIDC:
  - run `43615677907`, commit `1d1dc4f`;
  - `npm view` resolves `0.12.2`, `latest = 0.12.2`, provenance present,
    `gitHead = 1d1dc4fe2bc7d7cf9083b0cc50cf76298d5bf118`,
    shasum `2cf0581b3dc5de03143bc88a995d422bbc459c12`.
- Tag `v0.12.2` points to the release commit.
- T2/T3/T4/T8 harnesses and reports exist; T9 has unit/integration coverage.

## Phase 1 — artifact and isolated profile

1. Download the **registry** tarball via `npm pack @elvisw/dsh-plugin-magic-context@0.12.2`
   into a new temp pack directory. Record:
   - tarball SHA-256 and SHA-1;
   - `npm view` JSON (version, integrity, shasum, gitHead, provenance);
   - unpacked `package.json`, `lib/index.js` hash, `lib/dsh/historian.js`,
     `lib/dsh/drop-landing.js`, `lib/dsh/memory-lane.js`.
2. Create a new experiment root under
   `%TEMP%\opencode\dsh-mc-combined-0.12.2-<timestamp>` with fresh
   `dsh-home`, `workspace`, `plugin-data`, `overlays`, `evidence`, `downloads`.
3. Install from the registry specifier through the real
   `dsh plugin add @elvisw/dsh-plugin-magic-context@0.12.2` path. If that path
   cannot fetch the registry package, the ticket is `blocked`; do not fall back
   to a local tarball. Assert:
   - installed package version is `0.12.2` and the profile dependency
     specifier is the registry specifier, not `file:`;
   - loader row id is `magic-context-dsh`;
   - a config-only overlay sets `historian.reasoningEffort` to a non-empty
     value and `--dump-config` shows it;
   - installed `lib` hashes match the unpacked registry artifact.
4. Generate overlays from scratch in the new root; replace both `\` and `/`
   path forms and assert no previous experiment root appears. Use the T3
   historian acceleration only in the test profile; record every value.

## Phase 2 — host chains

Use one installed profile; separate sessions/processes where a prior gate
requires it.

### 2a. Recovery and Historian (T3 shape, corrected order)

1. Seed a read fixture and queue a normal `ctx_reduce`; record the actual tag,
   original `tool/result` seq and placeholder seq from the driver/observer.
2. Pre-publish recovery host: `ctx_expand tag:<actual tag>`; assert new result,
   original payload hash, placeholder unchanged, old tag spent, new result can
   reduce/expand, and no second `tool/call` for the original callId.
3. Let a real Historian publish a compartment covering the placeholder; record
   publish seq and compartment id. Wait for the publishing pass and all
   in-flight Historian work to settle (bounded retry; missing pass row is
   `blocked`).
4. Pre-expand snapshot.
5. Host E1: `ctx_expand tag:<old tag>`; assert original payload, placeholder
   unchanged, old tag spent, no second original `tool/call`.
6. Post-E1 snapshot.
7. Host E2: `ctx_expand message:<original seq>` with its own pre/post
   snapshots; assert the same payload and unchanged compartment row.
8. Record the Historian journal start row's `reasoningEffort` if configured
   (omitted is valid and must be recorded as omitted).

### 2b. Manual flush (reuse T4 harness shape)

1. Fresh session; queue a normal `ctx_reduce` (not expand/requeue).
2. Run the test-only `driver-flush.mjs` inside the profile; call the real
   `commands.execute(agent, '/ctx-flush', [], signal)`.
3. Assert `commands.find`, `execution.result.kind === 'success'`, real
   receipt counts, `command/run` + `command/done`.
4. Next request must contain the placeholder; DB shows
   `pending_drops.landed_event_seq` set and `flush_requested = 0`.
5. Journal shows no Historian/recomp/compartment publish attributable to the
   command or flush lane; no extra `emergency-reclaim` with `dropped > 0`. The
   resumed agent turn's own model call is recorded separately.
6. Snapshot the historian/recovery session's `pending_drops`, `tags`,
   `compartments` and surface before and after the flush; they must be
   unchanged. Do not run the T4 force-band variant; normal defer is enough for
   the combined claim.

### 2c. Vector/memory smoke (reuse T8 harness shape)

1. Fresh session/profile state with empty `memory_embeddings`.
2. Write a synthetic memory; wait for maintenance.
3. Assert the vector journal contains, in order, `gate-closed` (with
   `bootstrapModelId`) → `backfill-bootstrap` → `backfill` → `parity-pass`;
   do not require adjacency if another tick interleaves. `memory_embeddings`
   has ≥1 row.
4. `ctx_memory search` for that memory returns `match=hybrid`; record the
   score. A permanent FTS-only result fails this sub-chain.
5. If the embed model download fails, block the whole ticket rather than
   recording a partial pass.

## Phase 3 — harness, analysis and report

1. Write **new** `prepare_combined_host.py` and `run_combined_scenarios.py`.
   Do not wrap or copy the old T3/T4/T8 prepare scripts: they install local
   0.11.2/0.12.1 tarballs, copy old profiles, use the unscoped loader name and
   read old experiment roots.
   The new prepare script must:
   - create a fresh profile and install the registry specifier;
   - create `acceptance-test-driver.mjs` and `observer.mjs` in that profile
     (do not rely on a copied file);
   - generate scoped overlays with `@elvisw/dsh-plugin-magic-context` and
     assert `dataDir`/`outDir` are inside the new root in both path forms;
   - record the profile dependency specifier, installed hashes and the
     config-only `reasoningEffort` dump.
2. Copy only redacted evidence into
   `acceptance-windows-dsh-2026-11-15-combined-0.12.2/evidence/`:
   driver JSON, compact observer extracts, DB probes, journal extracts, config
   dumps, package hashes, run summary. Keep full observer files in the isolated
   root and record their paths and hashes.
3. Write `acceptance-report.md` with:
   - artifact identity and install proof;
   - per-chain result table with file pointers;
   - combined-build interaction checks;
   - what this proves / does not prove;
   - test-only drivers and acceleration parameters;
   - discarded attempts and isolation statement.
4. Run `git diff --check` and a secret scan over evidence.

## Scope cuts (keep the same-build claim)

- No T4 force-band variant; normal defer is the required flush case.
- No T2 `tags` multi-tag/failure matrix beyond the single-tag recovery plus the
  new-result reduce/expand lifecycle.
- One vector write, one maintenance wait, one search.

## Build-identity check between chains

Before and after every host chain, recompute the installed
`lib/index.js` and the relevant `lib/dsh/*.js` hashes. A mismatch means the
profile changed build and invalidates the combined claim.

## Phase 4 — independent audit and close

1. Start a read-only independent audit (not the implementer) over report plus
   raw evidence. It must verify artifact identity, per-session scoping, the
   recovery hashes, compartment stability, flush marker/landing, vector
   journal order, and that no daily profile was touched.
2. Fix report/evidence gaps; re-audit until PASS (caveats acceptable only if
   explicitly disclosed).
3. Mark ticket 10 built, commit evidence/report, mark done, push.

## Verification commands (expected)

```powershell
npm view @elvisw/dsh-plugin-magic-context@0.12.2 version dist-tags dist.attestations gitHead dist.shasum --prefer-online --json
npm pack @elvisw/dsh-plugin-magic-context@0.12.2 --pack-destination <dir>
npm run typecheck
npm test
npm run check:i18n
```

Host runs are driven by the new scripts; no product test command substitutes
for them.

## Risks

- Registry propagation: wait and re-resolve before installing. If the
  registry specifier cannot be installed, stop and mark the ticket blocked; a
  local tarball or copied profile invalidates the artifact-identity claim.
- Headless DSH does not dispatch slash commands: keep the T4 test-only
  driver and disclose it.
- Historian acceleration can change publish timing: record values and use
  bounded retries; a missing pass row is `blocked`, not a pass.
- Real model cost: keep the run to the minimum sessions; reuse the T3/T4/T8
  prompt shapes rather than adding new conversational turns.
- The reasoning-effort value may be unsupported by the live route: prove the
  dump in a config-only overlay, and let the real historian run record whether
  the effort was omitted or sent. A provider rejection is a blocked chain, not
  a silent blank.
