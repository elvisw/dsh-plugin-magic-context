# Reproduce T27

Documentation change. No product build, no host, no credentials, no network access needed
except the external links the link check requests once.

## 1. Confirm what the ticket is about

```sh
git show d2e9190^:README.md | grep -n "force band"
```

The pre-rewrite README named the 85% force band. `README.md` at `HEAD` before this change does
not — that is the gap.

## 2. Lint before

```sh
node _bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/evidence/readme-lint.mjs .
```

Expect `82` checks and 4 failures: `glossary-covers-terms`, `zh-terms-present`,
`en-terms-present`, `fact-force-band-documented`. Saved as `evidence/lint-before.json`.

## 3. Apply the change

Both READMEs, `docs/glossary.md`, `docs/configuration.md` — see the commit.

## 4. Lint after

```sh
node _bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/evidence/readme-lint.mjs .
```

Expect `82` checks, 0 failures. Saved as `evidence/lint-after.json`.

## 5. Mutation controls

The point is that the new check can fail. Edit `README.md` in place, run the lint, restore:

```sh
# a. remove the term
sed -i 's/force band/threshold line/g' README.md
node .../evidence/readme-lint.mjs .        # fact-force-band-documented -> en
git checkout -- README.md

# b. change the number
sed -i 's/85% by default/90% by default/g' README.md
node .../evidence/readme-lint.mjs .        # fact-force-band-documented -> en
git checkout -- README.md
```

`evidence/lint-mutation-controls.json` records both runs and `restoredByteIdentical: true`.

## 6. Link check

```sh
node _bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/evidence/link-check.mjs .
```

Expect `failed: 0` for 100 unique targets. Repository paths are resolved offline through
`git ls-files`; only the 11 distinct external URLs are requested.

## 7. Confirm the T26 evidence was not touched

```sh
node -e "const j=require('./_bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/evidence/t26-originals.json');console.log(j.allUnchanged)"
```

Expect `true`. The T26 `sha256-manifest.json` pins those two scripts, so T27 runs copies.

## 8. What this does not reproduce

- No `npm test`, typecheck, build, pack or host gate: no product file changed.
- No npm publication: `0.18.2` is a separate release step outside this ticket.
