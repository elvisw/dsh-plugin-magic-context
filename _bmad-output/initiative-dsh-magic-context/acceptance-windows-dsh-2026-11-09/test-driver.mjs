// Test-only synchronization tool; it never reads or mutates session history.
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'acceptance-test-driver';
export const inject = ['tools'];

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'acceptance_wait',
    description: 'Acceptance-test synchronization: wait up to 20 seconds for an asynchronous historian, then return. Does not change history.',
    parameters: { seconds: { type: 'integer', required: true } },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: `Waited ${value.seconds} seconds.` }],
    },
    async execute(args) {
      const seconds = Math.max(0, Math.min(20, args.seconds));
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      return { seconds };
    },
  }));
}
