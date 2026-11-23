import type { ShellProcess } from '@deepseek-ai/dsh-shell'
import { describe, expect, it } from 'vitest'
import { processOutcome as bashOutcome } from '../packages/shell/tool-bash/src/background.ts'
import { processOutcome as pwshOutcome } from '../packages/shell/tool-pwsh/src/background.ts'

const empty = { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }

function process(overrides: Partial<ShellProcess>): ShellProcess {
  return {
    status: 'completed', exitCode: 0, signal: null, done: Promise.resolve(),
    observed: { stdout: empty, stderr: empty },
    readOutput: () => ({ delta: '', lossy: false }),
    kill: () => false,
    ...overrides,
  }
}

describe('background shell outcome parity', () => {
  it.each([
    ['provider failure', { status: 'killed', failure: 'provider' }, 'failed'],
    ['sandbox runner failure', { sandbox: { mode: 'read-only', denied: false, runnerFailed: true } }, 'failed'],
    ['cancellation', { status: 'killed' }, 'killed'],
    ['nonzero command exit', { exitCode: 2 }, 'completed'],
  ] as const)('reports %s consistently', (_name, overrides, expected) => {
    const handle = process(overrides)
    expect(bashOutcome(handle).status).toBe(expected)
    expect(pwshOutcome(handle)).toEqual(bashOutcome(handle))
  })
})
