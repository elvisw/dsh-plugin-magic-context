# Current-claim spot checks

- Settings UI contract: `src/client/index.js:2686` registers `settings.section`; `:2693` registers `plugins.item`; `:2700` registers `plugins.row.config`; T13 evidence is the 2026-11-15 isolated Web gate.
- Package identity: `package.json:2` is `@elvisw/dsh-magic-context`; `:3` is `0.13.0`; `tools/migrate-profile-package-name.mjs` exists.
- Operations runbook: `scripts/dsh-doctor.mjs`, `scripts/mc-acceptance.mjs`, `scripts/mc-report.mjs`, and `scripts/domain-checks.mjs` exist; `src/core/stores.ts:371` is the data directory and `:726` is the adapter DB name.
- Upgrade follow-up: its header says `not v0.49.55 parity`; heading §1 is labeled a historical v0.49.30 baseline; `PARITY.md:6-20` records the three-layer baseline.

These are spot checks, not a full verification of every historical body.
