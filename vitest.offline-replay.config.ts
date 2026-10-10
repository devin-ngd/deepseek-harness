/** Pure and in-memory offline guard tests; never load application or snapshot runners. */
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin } from './vitest.shared.ts'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.base.json'] }), standardDecoratorPlugin()],
  test: {
    environment: 'node',
    pool: 'threads',
    setupFiles: ['./scripts/offline-replay-no-io.ts'],
    include: [
      'packages/llm/llm/tests/offline-replay.spec.ts',
      'packages/sdk/server/tests/offline-replay.spec.ts',
      'packages/test-support/llm-replay/tests/offline.spec.ts',
      'packages/test-support/session-snapshot/tests/offline.spec.ts',
      'packages/experimental/rich-inline/tests/fork.spec.ts',
    ],
    testTimeout: 15000,
  },
})
