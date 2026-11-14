// Test-only command driver: call the REAL DSH command registry.
// Headless DSH sends a task as a user message and does not dispatch plugin
// slash commands itself, so the acceptance gate mounts this plugin in an
// isolated profile. It records the real definition lookup and settled result;
// it never fabricates a handler outcome.
import { appendFileSync } from 'node:fs'

export const name = 'dsh-acceptance-flush-driver'
export const inject = ['commands']

export function apply(ctx) {
  const target = process.env.MC_T4_SESSION_ID
  const outFile = process.env.MC_T4_FLUSH_EVIDENCE
  if (!target || !outFile) {
    throw new Error('MC_T4_SESSION_ID and MC_T4_FLUSH_EVIDENCE are required')
  }
  let executed = false
  ctx.inject(['commands'], scope => {
    scope.on('agent/created', async ({ agent }) => {
      if (executed || agent.session.id !== target) return
      executed = true
      const definition = scope.commands.find(agent, 'ctx-flush')
      const record = {
        processId: process.pid,
        sessionId: agent.session.id,
        target,
        definition: definition === undefined ? null : {
          name: definition.name,
          description: definition.description,
        },
      }
      if (definition === undefined) {
        appendFileSync(outFile, `${JSON.stringify({ ...record, error: 'ctx-flush definition not found' })}\n`, 'utf8')
        return
      }
      try {
        const execution = await scope.commands.execute(
          agent,
          '/ctx-flush',
          [],
          new AbortController().signal,
        )
        appendFileSync(outFile, `${JSON.stringify({
          ...record,
          execution: execution === undefined ? null : {
            commandId: execution.commandId,
            kind: execution.result.kind,
            text: execution.result.text ?? null,
          },
        })}\n`, 'utf8')
      } catch (error) {
        appendFileSync(outFile, `${JSON.stringify({ ...record, error: String(error) })}\n`, 'utf8')
      }
    })
  })
}
