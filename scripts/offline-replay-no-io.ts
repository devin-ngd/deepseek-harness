/** Fail the limited mock tier on any network, listener, or application subprocess attempt. */
import { afterAll, expect, vi } from 'vitest'

const attempts = vi.hoisted(() => ({ network: 0, subprocess: 0 }))
const forbiddenNetwork = (): never => {
  attempts.network++
  throw new Error('offline mock tests forbid network and listeners')
}
vi.stubGlobal('fetch', forbiddenNetwork)
vi.mock('node:http', async (importOriginal: <T>() => Promise<T>) => ({
  ...await importOriginal<typeof import('node:http')>(),
  request: forbiddenNetwork,
  get: forbiddenNetwork,
  createServer: forbiddenNetwork,
}))
vi.mock('node:https', async (importOriginal: <T>() => Promise<T>) => ({
  ...await importOriginal<typeof import('node:https')>(),
  request: forbiddenNetwork,
  get: forbiddenNetwork,
  createServer: forbiddenNetwork,
}))
vi.mock('node:net', async (importOriginal: <T>() => Promise<T>) => ({
  ...await importOriginal<typeof import('node:net')>(),
  connect: forbiddenNetwork,
  createConnection: forbiddenNetwork,
  createServer: forbiddenNetwork,
}))
vi.mock('node:tls', async (importOriginal: <T>() => Promise<T>) => ({
  ...await importOriginal<typeof import('node:tls')>(),
  connect: forbiddenNetwork,
  createServer: forbiddenNetwork,
}))
vi.mock('node:child_process', async (importOriginal: <T>() => Promise<T>) => {
  const forbiddenSubprocess = (): never => {
    attempts.subprocess++
    throw new Error('offline mock tests forbid application subprocesses')
  }
  return {
    ...await importOriginal<typeof import('node:child_process')>(),
    spawn: forbiddenSubprocess,
    spawnSync: forbiddenSubprocess,
    exec: forbiddenSubprocess,
    execSync: forbiddenSubprocess,
    execFile: forbiddenSubprocess,
    execFileSync: forbiddenSubprocess,
    fork: forbiddenSubprocess,
  }
})
afterAll(() => {
  expect(attempts, 'zero network/listener and application-process attempts').toEqual({ network: 0, subprocess: 0 })
})
