# Document status matrix — T14

Legend: `current` = describes behavior this fork still ships; `historical` = preserved
research/audit snapshot, not a current guarantee; `superseded` = whole document replaced
(none here — the config UI contract is historical with a scoped superseded part).

| Document | Status | Evidence baseline | Last verified | Replacement | Rationale |
| --- | --- | --- | --- | --- | --- |
| `docs/dsh-plugin-settings-ui-contract.md` | current | 2026-11-15, DSH 0.2.2-rc.1 | 2026-11-15 | — | Shipped T13 contract; `src/client/index.js:2686` registers `settings.section`; T13 report in `acceptance-windows-dsh-2026-11-15-t13-settings/`. |
| `docs/dsh-plugin-operations-runbook-2026-10-10.md` | current | 2026-10-10 runbook, rechecked 2026-11-16 | 2026-11-16 | — | Commands exist: `scripts/dsh-doctor.mjs`, `scripts/mc-acceptance.mjs`, `scripts/mc-report.mjs`, `scripts/domain-checks.mjs`; store paths match `src/core/stores.ts:371,726`. |
| `docs/dsh-plugin-upgrade-followup.md` | current | procedure current; §1 baseline v0.49.30 (2026-11-14 caveat) | 2026-11-16 | — | The re-alignment procedure is live, but §1 is explicitly historical and not v0.49.55 parity; header and heading state both. |
| `docs/independent-package-release.md` | current | 0.13.0 release guide, 2026-11-16 | 2026-11-16 | — | Matches `package.json:2-3` (`@elvisw/dsh-magic-context@0.13.0`) and the migration helper `tools/migrate-profile-package-name.mjs`. |
| `docs/dsh-plugin-memory-write-contract.md` | historical | 2026-10 storage snapshot; v95/v94 inheritance | 2026-11-16 | — | Mixed snapshot; its own note says `memories.db` is current and §8 authority is retired. |
| `docs/dsh-plugin-memory-promotion-contract.md` | historical | 2026-10 upstream MC promotion research | 2026-11-16 | — | Research on upstream promotion/dreamer behavior, not a current fork guarantee. |
| `docs/dsh-plugin-memory-acceptance.md` | historical | 2026-10 acceptance evidence (v6/v94) | 2026-11-16 | — | Evidence snapshot; old `context.db` path retained as provenance, current script uses `memories.db` (`scripts/mc-acceptance.mjs:49-53`). |
| `docs/dsh-plugin-config-ui-contract.md` | historical | 2026-10, DSH 0.2.0-rc.2 | 2026-11-16 | `docs/dsh-plugin-settings-ui-contract.md` | Body says "no client half" (`:46`, gap table `:299`) and has the old recipe (`:410`); client registrations now exist at `src/client/index.js:2686-2703`. Body unchanged. |
| `docs/dsh-plugin-ui-telemetry-contract.md` | historical | 2026-10, DSH 0.2.0-rc.2 | 2026-11-16 | — | Host-seam analysis still useful, but its "no client half"/"no dsh.client" claims are stale; not a current guarantee. |
| `docs/dsh-plugin-hooks-coverage-2026-10-08.md` | historical | 2026-10-08, upstream 148-module inventory | 2026-11-16 | — | Coverage audit at that date; not a current guarantee. |
| `docs/dsh-port-feasibility-2026-10-06.md` | historical | 2026-10-06, DSH master `5badb15`, MC v0.45.0 | 2026-11-16 | — | Feasibility study written before the current repository layout. |
| `docs/dsh-plugin-platform-takeover-and-global-domains-2026-10-09.md` | historical | 2026-10-09 design draft v2 | 2026-11-16 | — | Design draft, not shipped behavior. |
| `docs/dsh-plugin-dreamer-vector-decision-2026-10-08.md` | historical | 2026-10-08 decision record | 2026-11-16 | — | Dated decision record; PARITY carries the current ledger. |
| `docs/memory-mechanisms-inventory-2026-10-09.md` | historical | v0.4.3 / commit `70418d40c`, 2026-10-09 | 2026-11-16 | — | Inventory of an older build. |
| `docs/upstream-source-analysis-2026-10-09.md` | historical | upstream v0.46.1, 2026-10-09 | 2026-11-16 | — | Source study at v0.46.1. |
| `docs/global-domain-source-finding-2026-10-10.md` | historical | 2026-10-10 source finding | 2026-11-16 | — | Dated measurement of the candidate source. |
| `docs/memory-architecture-challenge-2026-10-10.md` | historical | 2026-10-10 evaluation | 2026-11-16 | — | Dated architecture challenge. |
| `docs/dsh-plugin-test-design-audit-2026-10-07.md` | historical | 2026-10-07 test audit | 2026-11-16 | — | Audit snapshot; current test baseline is `npm test`. |
| `docs/dsh-surface-write-audit-2026-10-09.md` | historical | 2026-10-09 surface audit | 2026-11-16 | — | Incident analysis at that date. |
| `docs/local-embedding-runtime-audit-2026-10-15.md` | historical | 2026-10-15 ONNX telemetry check | 2026-11-16 | — | Dated runtime audit. |
| `docs/reports/dreamer-token-usage.md` | historical | 2026-09-14..28, commit `0cae05d8` | 2026-11-16 | — | Fixed-window token study. |
| `docs/reports/memory-solutions-comparison.md` | historical | 2026-09-29 research snapshot | 2026-11-16 | — | Research comparison at that date. |
| `docs/research-handoff-ctx-flush-2026-11-11.md` | historical | 2026-11-11, 0.11.1 baseline | 2026-11-16 | — | #15 shipped in 0.12.0; the handoff is retained as provenance. |
| `docs/upstream-followup-2026-10-30.md` | historical | 2026-10-30, v0.46.0→v0.49.30 | 2026-11-16 | — | Upstream analysis, not v0.49.55 parity. |
| `docs/domain-naming-work-global-2026-10-25.md` | historical | 2026-10-25 naming decision | 2026-11-16 | — | Dated domain-naming decision. |

## Unindexed-doc decisions

There are no unindexed `.md` docs after this ticket: all 25 files under `docs/` are linked
from both README indexes. The five previously unindexed files are placed as follows:

- `docs/independent-package-release.md` — current section (verified release guide).
- `docs/dsh-plugin-settings-ui-contract.md` — current section (T13 contract).
- `docs/research-handoff-ctx-flush-2026-11-11.md` — historical upstream handoffs.
- `docs/upstream-followup-2026-10-30.md` — historical upstream handoffs.
- `docs/domain-naming-work-global-2026-10-25.md` — historical design decisions.
