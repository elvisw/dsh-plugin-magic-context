// T25 Phase 5d: which seeded rows does the FTS lane actually match?
//
// The corpus on the phone was deleted when the test profile was restored, so the
// lane labels cannot be re-derived from it. They can still be derived from the
// fixture text: the FTS lane is deterministic given (content, query, tokenizer),
// and all three are recorded. This runs the SAME SQLite FTS5 module with the
// SAME tokenizer string and the SAME query-building functions the product uses,
// on the SAME content the seed wrote.
//
// Run on the PC (node:sqlite is the bundled SQLite, same FTS5 build family as
// the phone's Node 24.22.1).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Copied verbatim from src/core/memory-search.ts:118-134.
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

// The exact rows the seed wrote (phone-seed.json ids 1..3; previews in
// phone-after-backfill.json match these).
const ROWS = [
  { id: 1, category: 'ARCHITECTURE', content: 't25 fixture alpha: the deploy pipeline retries a failed upload three times before giving up' },
  { id: 2, category: 'CONSTRAINTS', content: 't25 fixture beta: the upload retry budget must never exceed three attempts in the pipeline' },
  { id: 3, category: 'CONFIG_VALUES', content: 't25 fixture gamma: the deploy pipeline timeout is set to thirty seconds' },
];
const QUERY = 'upload retry pipeline';

const out = { at: new Date().toISOString(), query: QUERY, tokenizer: 'porter unicode61', rows: [], fts: {} };

const db = new DatabaseSync(':memory:');
db.exec(`CREATE VIRTUAL TABLE memories_fts USING fts5(
  content, category, tokenize='porter unicode61');`);
const insert = db.prepare('INSERT INTO memories_fts(rowid, content, category) VALUES (?, ?, ?)');
for (const row of ROWS) insert.run(row.id, row.content, row.category);

// Sanitized (strict AND) first, then relaxed OR only if strict found nothing —
// src/core/memory-search.ts:318-333.
const attempts = [];
let matchedIds = [];
for (const [label, build] of [['sanitize', sanitizeFtsQuery], ['relaxed', relaxedFtsQuery]]) {
  const match = build(QUERY);
  const ids = db.prepare('SELECT rowid AS id FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rowid')
    .all(match).map((row) => row.id);
  attempts.push({ label, match, ids });
  if (label === 'sanitize') {
    matchedIds = ids;
    if (ids.length > 0) break; // strict hit short-circuits the fallback
  } else {
    matchedIds = ids;
  }
}
out.fts.attempts = attempts;
out.fts.usedIds = matchedIds;

const ftsSet = new Set(matchedIds);
  for (const row of ROWS) {
  const ftsHit = ftsSet.has(row.id);
  // The vector half is an INPUT, not a computation: all three rows had a stored
  // vector (phone-after-backfill.json: three rows, 1536 bytes each, one
  // embedding-provider: model id). Only the FTS half is re-derived here.
  const vectorPresent = true;
  out.rows.push({
    id: row.id,
    category: row.category,
    content: row.content,
    ftsHit,
    vectorPresent,
    vectorPresentSource: 'evidence/phone-after-backfill.json',
    // src/core/memory-search.ts:421-430. A row with neither lane is not
    // returned at all, so it is labelled 'absent' rather than 'fts'.
    derivedLabel: ftsHit && vectorPresent ? 'hybrid'
      : vectorPresent ? 'semantic'
        : ftsHit ? 'fts' : 'absent',
  });
}

out.summary = {
  hybrid: out.rows.filter((row) => row.derivedLabel === 'hybrid').map((row) => row.id),
  semantic: out.rows.filter((row) => row.derivedLabel === 'semantic').map((row) => row.id),
  fts: out.rows.filter((row) => row.derivedLabel === 'fts').map((row) => row.id),
};
db.close();

out.status = 'derived';
fs.writeFileSync(path.join(__dirname, 'out-fts-rows.txt'),
  JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.summary) + '\n' + JSON.stringify(out.fts.attempts, null, 2));
