#!/usr/bin/env node
/**
 * Storage-level compatibility probe for the T15 package rename.
 *
 * It does not start a model or a DSH host. It loads the exact 0.12.3 npm
 * package and the exact 0.13.0 tarball, seeds one memory + one journal row +
 * one pending drop through the old package's public storage modules, then
 * reads them back through the new package's modules in a separate process.
 *
 * Usage:
 *   node t15-data-probe.mjs seed   --pkg <dir> --data-dir <dir>
 *   node t15-data-probe.mjs verify --pkg <dir> --data-dir <dir>
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const mode = process.argv[2]
const args = process.argv.slice(3)
const flag = name => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const pkg = flag('pkg')
const dataDir = flag('data-dir')
if (!['seed', 'verify'].includes(mode) || pkg === undefined || dataDir === undefined) {
  console.error('usage: t15-data-probe.mjs <seed|verify> --pkg <dir> --data-dir <dir>')
  process.exit(2)
}

const core = join(pkg, 'lib', 'core')
const { openStores, SCHEMA_VERSION } = require(join(core, 'stores.js'))
const { openMemoryWriter } = require(join(core, 'memory-write.js'))
const { ensureOwnCorpusStore } = require(join(core, 'corpus-store.js'))

const sessionId = 'session-t15-data-probe'
const identity = 'dir:t15-data-probe'
const stamp = 'T15_DATA_SURVIVAL_4097'
const logger = { info: () => {}, warn: () => {} }

const corpus = ensureOwnCorpusStore(join(dataDir, 'memories.db'))
const stores = openStores(dataDir)
const writer = openMemoryWriter({ dbPath: join(dataDir, 'memories.db'), logger })
try {
  if (mode === 'seed') {
    const now = Date.now()
    stores.appendJournal({
      at: now,
      level: 'info',
      kind: 'memory-recall',
      summary: 'T15 data probe seed',
      data: { marker: stamp },
      sessionId,
    })
    stores.queueDrop(sessionId, 1, now)
    stores.setMeta('t15_data_probe', stamp)
    const written = writer.writeMemory({
      identity,
      category: 'CONFIG_VALUES',
      content: stamp,
      importance: 7,
      sessionId,
      sourceType: 'agent',
    })
    console.log(JSON.stringify({
      mode,
      packageVersion: require(join(pkg, 'package.json')).version,
      schemaVersion: SCHEMA_VERSION,
      corpus,
      memory: written,
      journal: stores.listJournal({ sessionId, limit: 5 }),
      pendingDrop: stores.dropState(sessionId, 1),
      journalBounds: stores.journalBounds(),
      stats: writer.stats(identity),
    }, null, 2))
  } else {
    const memories = writer.listMemories(identity, { limit: 10 })
    console.log(JSON.stringify({
      mode,
      packageVersion: require(join(pkg, 'package.json')).version,
      schemaVersion: stores.getMeta('schema_version'),
      corpus,
      probeMarker: stores.getMeta('t15_data_probe'),
      journal: stores.listJournal({ sessionId, limit: 5 }),
      pendingDrop: stores.dropState(sessionId, 1),
      journalBounds: stores.journalBounds(),
      memories: memories.map(row => ({ id: row.id, category: row.category, content: row.content, importance: row.importance })),
      stats: writer.stats(identity),
    }, null, 2))
  }
} finally {
  writer.close()
  stores.close()
}
