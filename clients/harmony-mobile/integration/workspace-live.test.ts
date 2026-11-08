/** Exercise a Windows read handle that denies replacement while immutable progress snapshots advance. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { WorkspaceLivePublisher } from './workspace-live.ts'

test('publishes progress while a Windows reader denies replacement of the previous snapshot', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const directory = await mkdtemp(resolve('.build/workspace-live-')), publisher = new WorkspaceLivePublisher(directory)
  await publisher.publish(0, [])
  const target = join(directory, 'live-000001.json'), original = await readFile(target, 'utf8')
  const env: NodeJS.ProcessEnv = { DSH_WORKSPACE_LIVE_TARGET: target }
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT']) if (process.env[key] !== undefined) env[key] = process.env[key]
  const command = '$stream = [IO.File]::Open($env:DSH_WORKSPACE_LIVE_TARGET, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite); try { [Console]::Out.WriteLine("WORKSPACE_READER_OPEN"); [Console]::Out.Flush(); [Console]::In.ReadLine() | Out-Null } finally { $stream.Dispose() }'
  const reader = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', stderr = '', notify: (() => void) | undefined
  const stopped = new Promise<void>((accept, reject) => { reader.once('error', reject); reader.once('close', () => accept()) })
  void stopped.catch((error: Error) => { void error /* Awaited by the registered teardown below. */ })
  reader.stdout.on('data', bytes => { output += String(bytes); if (output.includes('WORKSPACE_READER_OPEN')) notify?.() })
  reader.stderr.on('data', bytes => { stderr += String(bytes) })
  try {
    await new Promise<void>((accept, reject) => {
      const deadline = setTimeout(() => reject(new Error('Reader did not open the snapshot: ' + stderr)), 10000)
      notify = () => { clearTimeout(deadline); accept() }
      if (output.includes('WORKSPACE_READER_OPEN')) notify()
      void stopped.then(() => { clearTimeout(deadline); reject(new Error('Reader exited before the lock check: ' + stderr)) }, error => { clearTimeout(deadline); reject(error) })
    })
    const replacement = join(directory, 'live.next.json'); await writeFile(replacement, '{"replacement":true}\n')
    await assert.rejects(rename(replacement, target), (error: NodeJS.ErrnoException) => error.code === 'EPERM')
    await publisher.publish(1, [])
    await publisher.publish(1, [])
    await publisher.publish(1, ['synthetic failure'])
    assert.deepEqual((await readdir(directory)).filter(name => /^live-\d{6}\.json$/.test(name)).sort(), ['live-000001.json', 'live-000002.json', 'live-000003.json'])
    assert.equal(await readFile(target, 'utf8'), original)
    const latest = JSON.parse(await readFile(join(directory, 'live-000003.json'), 'utf8')) as { responses: number; errors: string[] }
    assert.equal(latest.responses, 1); assert.deepEqual(latest.errors, ['synthetic failure'])
    t.diagnostic('Windows replacement rejected; immutable snapshots advanced under the same reader: ' + directory)
  } finally { if (reader.exitCode === null && reader.signalCode === null) reader.kill(); await stopped }
})
