---
id: 10
type: story
title: "0.12.2 combined host regression"
parent: initiative-dsh-magic-context
after: [9]
refined: true
hitl: false
risk: high
---

# 0.12.2 combined host regression

## Summary

Run one regression window on the **published** `@elvisw/dsh-plugin-magic-context@0.12.2`
artifact, in a fresh isolated DSH profile with a real model, and prove the
previously separate host gates still hold in the same build:

- T2 result-return expand,
- T3 post-Historian `message` retrieval,
- T4 manual `/ctx-flush`,
- T8 empty-embedding-space vector bootstrap (the final session had memories but no embeddings),
- T9 historian reasoning-effort config.

The point is combined-build coexistence, not a new feature. Each earlier host
gate ran on a different local build; `0.12.0` only got a package-identity
smoke. This ticket supplies the single-build evidence.

## Requirements

1. **Published artifact only**
   - Resolve `@elvisw/dsh-plugin-magic-context@0.12.2` from the public npm
     registry; record `dist.shasum`, integrity, `gitHead`, provenance and the
     registry tarball URL.
   - Assert `dist-tags.latest` is `0.12.2` and `gitHead` is the release commit.
   - Install that registry artifact into a **fresh** isolated DSH profile via a
     registry specifier (`dsh plugin add @elvisw/dsh-plugin-magic-context@0.12.2`).
     Do not install a local tarball, a working-tree build, a copied profile or a
     daily profile.
   - Record the installed `package.json`, the profile dependency specifier,
     `lib/index.js` hash, loader row id (`magic-context-dsh`), settings
     namespace and data dir.
   - A separate config-only overlay sets `historian.reasoningEffort` to a
     non-empty value the route advertises (or `low` if the catalog does not
     expose ids); `--dump-config` must show that value. The real historian
     publish chain may run with effort omitted; record the omission rather than
     forcing an unsupported value through the provider.

2. **Recovery chain**
   - A real read tool result is tagged, `ctx_reduce` is queued and landed, and
     the surface shows `[dropped §N§]`.
   - `ctx_expand tag:<actual tag>` returns a new tool result whose payload is
     byte-equal to the original after stripping the new outer `§N§` marker
     **and its one trailing space**; the original payload's own `§N§ ` prefix
     is preserved.
   - The old placeholder is not rewritten; the old tag is durably spent
     (`already dropped`, `pending_drops` still landed and no new pending row).
   - The new expanded result can itself be reduced and expanded in a separate
     pre-publish recovery host.
   - The original callId still has exactly one `tool/call` and no second
     `tool/result` attributable to the expand; verify this before the
     Historian publish and again in the post-publish windows.

3. **Historian chain**
   - Run the chain in this order: seed/reduce → wait until the real Historian
     publishes a compartment covering the placeholder → settle all in-flight
     Historian work (no unlanded draft) → take pre-expand snapshot → host E1
     `ctx_expand tag:<old tag>` → take post snapshot → host E2
     `ctx_expand message:<original tool/result seq>` with its own pre/post
     snapshots.
   - E1 and E2 are separate hosts/windows; do not put both locators in one
     request window and do not run E1 before publish.
   - Both locators return the original content. The published compartment row
     is unchanged across E1 and E2 (the T3 column set), the old tag stays
     spent, and no second `tool/call` for the original callId appears.
   - The message seq is the DSH log event seq of the original `tool/result`,
     including a shadowed event; it is not the `[compacted §C§]` node.

4. **Manual flush chain**
   - Queue a normal `ctx_reduce` (not an expand/requeue) and call the real
     `commands.execute(agent, '/ctx-flush', [], signal)` through the named
     test-only driver, because headless DSH does not dispatch plugin slash
     commands.
   - Assert `commands.find` is defined, the execution is `success`, the
     receipt has real counts, and `command/run` + `command/done` exist.
   - The next request contains the placeholder even though the pressure/TTL
     band would defer; `flush_requested` is cleared and `pending_drops` is
     landed.
   - The command and the flush lane start no Historian, recomp, summary model
     call, extra reclaim, compartment publish or baseline rebuild. The resumed
     host's own agent turn still makes its normal model call; count it
     separately and do not attribute it to the command.

5. **Vector and memory smoke**
   - On the fresh profile, write a synthetic memory while
     `memory_embeddings` is empty (`memories` itself is not empty).
   - Let the maintenance lane run until the vector journal contains, in
     order, `gate-closed` with `bootstrapModelId`, `backfill-bootstrap`,
     `backfill` and `parity-pass`; `memory_embeddings` has at least one row.
     Do not require the rows to be adjacent if a maintenance tick is interleaved.
   - A subsequent `ctx_memory search` for that synthetic memory returns
     `match=hybrid` with a recorded score; a permanent FTS-only result fails
     this sub-chain.
   - If the embedding model must be downloaded, record the download as part of
     the run and do not treat a network failure as a code failure; an
     environmental failure blocks the ticket, not just a sub-chain.

6. **Combined-build interaction checks**
   - All chains above run from the same registry artifact and the same
     plugin version, even if they use separate sessions/processes.
   - The flush run must not consume or mutate the historian/recovery session's
     tags; take `pending_drops`, `tags`, `compartments` and surface snapshots
     for the other session before and after the flush, keyed by `session_id`.
   - Recompute and compare the installed `lib/index.js` and the relevant
     `lib/dsh/*.js` hashes before and after every host chain; a change means a
     different build and fails the combined claim.
   - The T9 `reasoningEffort` config must not break the T3 historian publish;
     the config-only check proves the dump, while the historian run records
     whether the effort was omitted or sent.
   - No regression in the T2 new-result semantics after T9's route changes.

7. **Isolation and evidence**
   - Fresh experiment root and fresh DSH profile; assert every overlay's
     `dataDir`/`outDir` points into that root, with both `\` and `/` path
     forms, and that no previous experiment root is referenced.
   - Daily DSH profile, sessions and plugin DB must not be touched; record the
     redirected environment and the boot `dbPath` from `activity.log`.
   - Copy driver JSON, **compact** observer extracts (the specific events
     needed for each claim), DB probes, journal extracts, config dumps and
     SHA-256 manifests into
     `acceptance-windows-dsh-2026-11-15-combined-0.12.2/evidence/`.
     Keep the full raw observer files in the isolated root and record their
     paths and hashes in the report; do not commit tens of megabytes.
   - Scan evidence for credentials (`sk-`, `DEEPSEEK_API_KEY`, `Bearer `) before
     committing.

8. **Report and independent audit**
   - Write `acceptance-report.md` with an explicit "what this proves" and "what
     this does not prove" section.
   - Disclose the test-only command driver, any accelerated Historian settings
     (`historianMinBudgetTokens`, `ttlMs`, `forceThreshold`,
     `registerCompactionEngine`, maintenance toggles) and any attempt that was
     discarded.
   - Before the ticket is marked done, an independent read-only reviewer must
     audit the report and evidence against the raw artifacts. Implementer
     self-review does not count.

## Acceptance

- The registry `0.12.2` artifact is installed by specifier in a fresh isolated
  profile and passes the recovery, Historian, flush, vector/memory and
  config-dump checks above.
- Every claim has a file pointer and a raw evidence artifact; no unit test is
  presented as host evidence.
- The report states the combined-build scope, the exact model route, and every
  uncovered boundary.
- If any chain cannot be exercised on the real host, the whole ticket is
  `blocked` with the reason; a partially exercised combined build is not a
  pass, and a unit test must not be substituted.

## Boundaries

- No code changes, schema changes, version bump or npm publish. A proven
  regression becomes a follow-up defect/ticket, not a drive-by fix here.
- No re-run of the full T0 baseline, the upstream parity matrix, P4
  (`/ctx-flush` feedback) or V1.1 (`start`/`end`/`verbose`).
- A forced provider `OUTPUT_TOKEN_LIMIT` via a test adapter is supplemental
  evidence only; it does not prove the real provider route retries. The real
  provider retry remains covered by T9's `LlmRuntime` integration test.
- The T3 `message` seq is the DSH log event seq of the original `tool/result`,
  not an upstream Magic Context message ordinal and not the `[compacted §C§]`
  node.
- Headless DSH does not dispatch plugin slash commands; the flush chain uses
  the disclosed test-only `driver-flush` plugin exactly as T4 did.

## References

- T2 report: `../acceptance-windows-dsh-2026-11-14-t2-host/acceptance-report.md`
- T3 report: `../acceptance-windows-dsh-2026-11-14-t3-host/acceptance-report.md`
- T4 report: `../acceptance-windows-dsh-2026-11-14-t4-host/acceptance-report.md`
- T8 report: `../acceptance-windows-dsh-2026-11-14-vector-bootstrap/acceptance-report.md`
- T9 code/tests: `src/dsh/historian.ts`, `src/dsh/config.ts`,
  `tests/historian-terminal.spec.ts`, `tests/config-schema.spec.ts`
- Package release evidence:
  `../acceptance-windows-dsh-2026-11-14-package-identity/acceptance-report.md`
