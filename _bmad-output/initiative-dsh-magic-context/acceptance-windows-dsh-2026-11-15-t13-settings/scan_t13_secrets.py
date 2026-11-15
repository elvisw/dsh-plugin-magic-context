"""Scan the committed T13 evidence for credential-shaped strings.

Run from the repository root:
  python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings/scan_t13_secrets.py
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATTERNS = {
    'openai-style key': re.compile(r'sk-[A-Za-z0-9]{20,}'),
    'bearer value': re.compile(r'Bearer\s+[A-Za-z0-9._~+/=-]{8,}'),
    'assigned key value': re.compile(r'(?:DEEPSEEK_API_KEY|COMMANDCODE_API_KEY)\s*=\s*[^\s"\']+'),
    'token query value': re.compile(r'[?&]token=[A-Za-z0-9._~+/=-]{8,}'),
}
SKIP = {'secret-scan.txt', 'sha256-manifest.json'}


def main() -> int:
    scanned = 0
    hits = []
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or path.name in SKIP:
            continue
        scanned += 1
        text = path.read_text(encoding='utf-8', errors='replace')
        for label, pattern in PATTERNS.items():
            for match in pattern.finditer(text):
                hits.append(f'{path.relative_to(ROOT)}: {label}: {match.group(0)[:60]}')
    lines = [
        'command: python _bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-t13-settings/scan_t13_secrets.py',
        f'files scanned: {scanned}',
        'patterns: ' + ', '.join(PATTERNS),
        'hits: ' + str(len(hits)),
    ]
    lines.extend(hits)
    output = '\n'.join(lines) + '\n'
    (ROOT / 'evidence' / 'secret-scan.txt').write_text(output, encoding='utf-8')
    print(output)
    return 1 if hits else 0


if __name__ == '__main__':
    raise SystemExit(main())
