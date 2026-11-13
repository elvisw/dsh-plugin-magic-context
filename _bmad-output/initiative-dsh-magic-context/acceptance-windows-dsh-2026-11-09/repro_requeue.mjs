// Minimal storage-level reproduction for the independently observed host bug.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const { root } = JSON.parse(readFileSync(join(directory, 'experiment-root.json'), 'utf8'));
const { openStores } = await import(pathToFileURL(join(root, 'plugin/package/lib/core/stores.js')).href);
const store = openStores(join(root, 'unit-requeue'));
const sessionId = `requeue-regression-${Date.now()}`;
try {
  store.queueDrop(sessionId, 1, 1);
  assert.deepEqual(store.listPendingDrops(sessionId), [1]);
  store.markDropLanded(sessionId, 1, 10);
  store.markDropLanded(sessionId, 1, 20); // ctx_expand records its restore event here.
  store.queueDrop(sessionId, 1, 2);
  const pending = store.listPendingDrops(sessionId);
  console.log(JSON.stringify({ version: '0.11.1', expected_pending: [1], actual_pending: pending }));
  assert.deepEqual(pending, [1], 'A restored item must become pending when queued again.');
} finally {
  store.close();
}
