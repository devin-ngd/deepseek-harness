import { defineConfig } from 'tsdown'

/** Keep the public interpreter registry shared with plugin registrations. */
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: ['@deepseek-ai/dsh-session-format-catalog/message-projections'],
})
