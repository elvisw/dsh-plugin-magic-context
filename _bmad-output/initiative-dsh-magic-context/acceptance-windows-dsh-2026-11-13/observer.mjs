// Read-only instrumentation: record the real host event log and live surface.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'dsh-acceptance-observer';

export function apply(ctx, config) {
  mkdirSync(config.outDir, { recursive: true });
  ctx.inject(['compaction'], scope => {
    appendFileSync(join(config.outDir, 'engine-owners.jsonl'), `${JSON.stringify({
      processId: process.pid,
      time: new Date().toISOString(),
      constructor: scope.compaction.constructor.name,
    })}\n`, 'utf8');
  });
  const secrets = Object.entries(process.env)
    .filter(([key, value]) => /KEY|TOKEN|PASSWORD|SECRET/i.test(key) && value?.length >= 8)
    .map(([, value]) => value);
  ctx.on('session/event', (session, event) => {
    if (!['user/message', 'assistant/message', 'tool/result', 'compaction/end'].includes(event.type)) return;
    let text = JSON.stringify({
      processId: process.pid,
      sessionId: session.id,
      trigger: { type: event.type, seq: event.seq },
      surface: [...session.surface.nodes],
      events: session.snapshotEvents(),
    });
    for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
    const safeId = session.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    appendFileSync(join(config.outDir, `${safeId}.jsonl`), `${text}\n`, 'utf8');
  });
}
