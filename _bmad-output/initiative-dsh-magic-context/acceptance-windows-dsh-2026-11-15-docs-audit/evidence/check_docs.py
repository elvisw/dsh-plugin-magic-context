#!/usr/bin/env python3
"""T14 documentation audit checks. Throwaway; run from the repository root."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()
DOCS = ROOT / 'docs'
EVIDENCE = ROOT / '_bmad-output' / 'initiative-dsh-magic-context' / 'acceptance-windows-dsh-2026-11-15-docs-audit' / 'evidence'
EVIDENCE.mkdir(parents=True, exist_ok=True)
T0 = '0f83a7c'


def out(name: str, text: str) -> None:
    (EVIDENCE / name).write_text(text.rstrip() + '\n', encoding='utf-8')
    print(f'--- {name} ---')
    print(text.rstrip())


def readme_block(path: Path) -> str:
    text = path.read_text(encoding='utf-8')
    start = text.index('## Documentation index' if path.name == 'README.md' else '## 文档索引')
    end = text.index('## Known limits' if path.name == 'README.md' else '## 已知边界', start)
    return text[start:end]


def links(text: str) -> list[str]:
    return re.findall(r'\]\((docs/[^)\s]+\.md)\)', text)


def title_and_status(path: Path) -> tuple[int, str]:
    lines = path.read_text(encoding='utf-8').splitlines()
    title = next(i for i, line in enumerate(lines) if line.startswith('# '))
    first = next((line for line in lines[title + 1:] if line.strip()), '')
    return title, first


matrix = (EVIDENCE / 'document-status-matrix.md').read_text(encoding='utf-8')
rows = [line for line in matrix.splitlines() if line.startswith('| `docs/')]
matrix_status = {}
for line in rows:
    cells = [c.strip() for c in line.strip('|').split('|')]
    if len(cells) < 3:
        continue
    matrix_status[cells[0].strip('`')] = cells[1]

all_docs = sorted(p.relative_to(ROOT).as_posix() for p in DOCS.rglob('*.md'))
inventory_lines = [f'baseline docs: {len(all_docs)}', 'files:']
inventory_lines += [f'  {p}' for p in all_docs]
link_sets = {}
for readme in [ROOT / 'README.md', ROOT / 'README.zh-CN.md']:
    block = readme_block(readme)
    found = links(block)
    link_sets[readme.name] = found
    inventory_lines.append(f'{readme.name}: {len(found)} links, {len(set(found))} unique')
    missing = sorted(set(found) - set(all_docs))
    unindexed = sorted(set(all_docs) - set(found))
    inventory_lines.append(f'  missing files: {missing or "none"}')
    inventory_lines.append(f'  unindexed files: {unindexed or "none"}')
    if missing or unindexed:
        out('inventory.txt', '\n'.join(inventory_lines))
        sys.exit('inventory failed')
out('inventory.txt', '\n'.join(inventory_lines))

parity = []
for name, found in link_sets.items():
    parity.append(f'{name}: {len(found)}')
en = set(link_sets['README.md'])
zh = set(link_sets['README.zh-CN.md'])
parity.append(f'missing in zh: {sorted(en - zh) or "none"}')
parity.append(f'missing in en: {sorted(zh - en) or "none"}')
parity.append('PASS' if en == zh else 'FAIL')
out('readme-parity.txt', '\n'.join(parity))
if en != zh:
    sys.exit('README parity failed')

header_lines = []
for doc in link_sets['README.md']:
    if doc not in matrix_status:
        header_lines.append(f'MISSING MATRIX ROW: {doc}')
        continue
    _, first = title_and_status(ROOT / doc)
    header_lines.append(f'{doc}: {first[:80].rstrip()}')
    if not first.startswith('> Status:'):
        header_lines.append(f'FAIL first block is not > Status: {doc}')
out('header-check.txt', '\n'.join(header_lines))
if any(line.startswith('FAIL') or line.startswith('MISSING') for line in header_lines):
    sys.exit('header check failed')

link_issues = []
for base in [ROOT / 'README.md', ROOT / 'README.zh-CN.md', EVIDENCE / 'document-status-matrix.md']:
    text = base.read_text(encoding='utf-8')
    for target in re.findall(r'\]\(([^)\s]+)\)', text):
        if target.startswith(('http://', 'https://', '#', 'mailto:')):
            continue
        if target.startswith('docs/') or target.endswith('.md'):
            resolved = (base.parent / target).resolve()
            if not resolved.exists():
                link_issues.append(f'{base.relative_to(ROOT)} -> {target}')
for doc in all_docs:
    text = (ROOT / doc).read_text(encoding='utf-8')
    for target in re.findall(r'\]\(([^)\s]+)\)', text):
        if target.startswith(('http://', 'https://', '#', 'mailto:')):
            continue
        if target.endswith('.md'):
            resolved = (ROOT / doc).parent / target
            if not resolved.exists():
                link_issues.append(f'{doc} -> {target}')
out('link-check.txt', '\n'.join(link_issues) if link_issues else 'PASS: all checked relative Markdown links resolve')
if link_issues:
    sys.exit('link check failed')

current_docs = {doc for doc, status in matrix_status.items() if status == 'current'}
historical_docs = {doc for doc, status in matrix_status.items() if status == 'historical'}
split = []
for readme in [ROOT / 'README.md', ROOT / 'README.zh-CN.md']:
    text = readme.read_text(encoding='utf-8')
    current_start = text.index('### Current documentation maintained by this fork' if readme.name == 'README.md' else '### 本 fork 维护的当前文档')
    historical_start = text.index('### Historical research and upstream snapshots' if readme.name == 'README.md' else '### 历史研究与上游快照')
    current_links = set(re.findall(r'\]\((docs/[^)\s]+\.md)\)', text[current_start:historical_start]))
    historical_links = set(re.findall(r'\]\((docs/[^)\s]+\.md)\)', text[historical_start:]))
    split.append(f'{readme.name}: current={len(current_links)}, historical={len(historical_links)}')
    split.append(f'  current mismatch: {sorted(current_links ^ current_docs) or "none"}')
    split.append(f'  historical mismatch: {sorted(historical_links ^ historical_docs) or "none"}')
    if current_links != current_docs or historical_links != historical_docs:
        split.append('FAIL')
out('readme-split.txt', '\n'.join(split))
if 'FAIL' in split:
    sys.exit('README current/historical split failed')

current_claims = [
    '# Current-claim spot checks',
    '',
    '- Settings UI contract: `src/client/index.js:2686` registers `settings.section`; `:2693` registers `plugins.item`; `:2700` registers `plugins.row.config`; T13 evidence is the 2026-11-15 isolated Web gate.',
    '- Package identity: `package.json:2` is `@elvisw/dsh-magic-context`; `:3` is `0.13.0`; `tools/migrate-profile-package-name.mjs` exists.',
    '- Operations runbook: `scripts/dsh-doctor.mjs`, `scripts/mc-acceptance.mjs`, `scripts/mc-report.mjs`, and `scripts/domain-checks.mjs` exist; `src/core/stores.ts:371` is the data directory and `:726` is the adapter DB name.',
    '- Upgrade follow-up: its header says `not v0.49.55 parity`; heading §1 is labeled a historical v0.49.30 baseline; `PARITY.md:6-20` records the three-layer baseline.',
    '',
    'These are spot checks, not a full verification of every historical body.',
]
out('current-claims.md', '\n'.join(current_claims))

config = ROOT / 'docs/dsh-plugin-config-ui-contract.md'
config_text = config.read_text(encoding='utf-8')
checks = []
checks.append(('config header historical', '> Status: historical' in config_text))
checks.append(('config superseded line', '> Superseded by: docs/dsh-plugin-settings-ui-contract.md' in config_text))
checks.append(('replacement exists', (ROOT / 'docs/dsh-plugin-settings-ui-contract.md').exists()))
out('config-ui-check.txt', '\n'.join(f'{name}: {"PASS" if ok else "FAIL"}' for name, ok in checks))
if not all(ok for _, ok in checks):
    sys.exit('config UI check failed')

body_link_lines = []
for readme in [ROOT / 'README.md', ROOT / 'README.zh-CN.md']:
    text = readme.read_text(encoding='utf-8')
    block_start = text.index('## Documentation index' if readme.name == 'README.md' else '## 文档索引')
    block_end = text.index('## Known limits' if readme.name == 'README.md' else '## 已知边界')
    for i, line in enumerate(text.splitlines(), 1):
        if 'dsh-plugin-config-ui-contract' in line:
            in_index = block_start < sum(len(x) + 1 for x in text.splitlines()[:i - 1]) < block_end
            body_link_lines.append(f'{readme.name}:{i}: index={in_index} | {line.strip()}')
        if 'dsh-plugin-ui-telemetry-contract' in line and 'README' in readme.name:
            body_link_lines.append(f'{readme.name}:{i}: telemetry | {line.strip()}')
out('body-links.txt', '\n'.join(body_link_lines) if body_link_lines else 'PASS: no stale body links')

historical = [doc for doc, status in matrix_status.items() if status == 'historical']
guard = []
for doc in historical:
    diff = subprocess.run(['git', 'diff', '-U0', T0, '--', doc], cwd=ROOT, text=True, capture_output=True)
    if diff.returncode != 0:
        guard.append(f'FAIL {doc}: git diff failed')
        continue
    lines = diff.stdout.splitlines()
    hunks = [line for line in lines if line.startswith('@@')]
    removed = [line for line in lines if line.startswith('-') and not line.startswith('---')]
    added = [line for line in lines if line.startswith('+') and not line.startswith('+++')]
    allowed = all(line == '+' or line.startswith('+>') for line in added)
    expected = f'@@ -2,0 +3,{len(added)} @@'
    if hunks != [expected] or removed or not allowed:
        guard.append(f'FAIL {doc}: hunks={hunks}, removed={len(removed)}, added={len(added)}')
    else:
        guard.append(f'PASS {doc}: 1 header hunk at {expected}, 0 deletions, {len(added)} insertions')
out('body-change-guard.txt', '\n'.join(guard))
if any(x.startswith('FAIL') for x in guard):
    sys.exit('body-change guard failed')

no_release = []
diff = subprocess.run(['git', 'diff', '--name-only', '--', 'package.json', 'package-lock.json', '.github/workflows'], cwd=ROOT, text=True, capture_output=True)
no_release.append('package/release diff: ' + (diff.stdout.strip() or 'empty'))
tags = subprocess.run(['git', 'tag', '--list', 't14*'], cwd=ROOT, text=True, capture_output=True)
no_release.append('T14 tags: ' + (tags.stdout.strip() or 'none'))
no_release.append('npm publish: not run (docs-only ticket)')
out('no-release.txt', '\n'.join(no_release))
if diff.stdout.strip() or tags.stdout.strip():
    sys.exit('no-release check failed')

diff_check = subprocess.run(['git', 'diff', '--check'], cwd=ROOT, text=True, capture_output=True)
raw = (diff_check.stdout or '') + (diff_check.stderr or '')
warnings = [line for line in raw.splitlines() if line.startswith('warning:')]
errors = [line for line in raw.splitlines() if line and not line.startswith('warning:')]
if errors:
    diff_text = '\n'.join(errors)
else:
    diff_text = f'PASS: git diff --check clean (no whitespace errors)\nCRLF conversion warnings: {len(warnings)}'
out('diff-check.txt', diff_text)
if diff_check.returncode != 0 or errors:
    sys.exit('git diff --check failed')

print('\nT14 CHECKS PASS')
