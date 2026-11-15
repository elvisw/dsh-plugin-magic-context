import json
import re
from pathlib import Path

root = Path(r'_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-16-v0140-release')
patterns = {
    'openai-style key': re.compile(r'sk-[A-Za-z0-9]{20,}'),
    'bearer value': re.compile(r'Bearer\s+[A-Za-z0-9._~+/=-]{20,}'),
    'assigned key value': re.compile(r'(?i)(api[_-]?key|secret|password)\s*[:=]\s*["\']?[A-Za-z0-9._~+/=-]{20,}'),
    'token query value': re.compile(r'[?&]token=[A-Za-z0-9._~+/=-]{20,}'),
}
hits = []
scanned = 0
for path in sorted(root.rglob('*')):
    if not path.is_file() or path.suffix.lower() in {'.png', '.tgz', '.pyc'}:
        continue
    scanned += 1
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    for name, pattern in patterns.items():
        for match in pattern.finditer(text):
            hits.append(f'{path.relative_to(root)}: {name}: {match.group(0)[:80]}')
out = [
    'command: python scan_release_secrets.py',
    f'files scanned: {scanned}',
    'patterns: openai-style key, bearer value, assigned key value, token query value',
    f'hits: {len(hits)}',
    *hits,
]
(root / 'evidence' / 'secret-scan.txt').write_text('\n'.join(out) + '\n', encoding='utf-8')
print('\n'.join(out))
