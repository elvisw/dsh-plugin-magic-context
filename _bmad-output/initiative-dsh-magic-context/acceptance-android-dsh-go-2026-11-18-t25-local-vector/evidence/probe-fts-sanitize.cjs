const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec("CREATE VIRTUAL TABLE t USING fts5(content, category, content='', tokenize='porter unicode61')");

// Verbatim copies of the two functions the adapter applies, from src/core/memory-search.ts
function sanitizeFtsQuery(query) {
  const tokens = query.replaceAll('\0', ' ').split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
}
function relaxedFtsQuery(query) {
  const tokens = [...new Set(query.match(/[\p{L}\p{N}_]+/gu) ?? [])]
    .filter((t) => t.length > 2 || /\d/.test(t))
    .slice(0, 16);
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

const stored = [
  'T25 fixture delta: 上传失败最多重试三次之后放弃',
];
const ins = db.prepare('INSERT INTO t(content, category) VALUES (?, ?)');
ins.run(stored[0], 'CONSTRAINTS');

function hits(raw) {
  for (const [label, q] of [['sanitize', sanitizeFtsQuery(raw)], ['relaxed', relaxedFtsQuery(raw)]]) {
    if (!q) { console.log(`  ${label}: empty query`); continue; }
    let n = 'ERR';
    try { n = db.prepare('SELECT COUNT(*) AS n FROM t WHERE t MATCH ?').get(q).n; } catch (e) { n = 'ERR ' + e.message.slice(0, 40); }
    console.log(`  ${label}: ${JSON.stringify(q)} -> ${n}`);
  }
}

for (const q of ['上传失败', '重试次数上限是多少', '放弃', '最多重试', 'upload retry']) {
  console.log(JSON.stringify(q));
  hits(q);
}
