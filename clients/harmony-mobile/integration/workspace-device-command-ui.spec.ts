/** Real Harmony commands through the standard composer; only synthetic identity records and loopback Web transport are used. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import RichInline from '@deepseek-ai/dsh-experimental-rich-inline'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { launchWebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { launchTestChromium, newEnglishPage } from '../../../apps/web/tests/support.ts'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import * as DeviceCommand from '../desktop-plugin/src/device-binding-command.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import { desktopKey } from './phase39-fixture.ts'

it('loads the valid chunk policy and executes actual device status commands only after standard UI claim', async () => {
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD; assert.ok(world)
  const cleanups: Array<() => void | Promise<void>> = []
  onTestFinished(async () => {
    const errors: unknown[] = []
    for (const close of cleanups.reverse()) { try { await close() } catch (error) { errors.push(error) } }
    if (errors.length > 0) throw new AggregateError(errors, 'device command UI cleanup failed')
  })
  const scaffold = await launchWebScaffold({}); cleanups.push(() => scaffold.close())
  const ctx = scaffold.ctx, originalProfileName = ctx.profileContext.name
  const rich = ctx.plugin(RichInline, { activePresets: [], maxAutoRepairAttempts: 0, maxFormatRepairAttempts: 0 })
  cleanups.push(() => rich.dispose()); await rich
  let ownerContext: Context | undefined
  const owner = ctx.isolate('credentials').isolate('profileContext').plugin({ name: 'command-ui-fixture-scope', apply: inner => { ownerContext = inner } })
  cleanups.push(() => owner.dispose()); await owner
  assert.ok(ownerContext)
  const child = ownerContext
  child.provide('profileContext', { ...ctx.profileContext, name: 'desktop', dir: world, cwd: world, home: world })
  await child.plugin(MemoryCredentials)
  const credentials = child.get('credentials'); assert.ok(credentials)
  expect(credentials).not.toBe(ctx.credentials)
  expect(ctx.profileContext.name).toBe(originalProfileName)
  const protection = new FixedIdentityProtection(), alias = 'command-ui-fixture-desktop'
  let unprotected = 0
  const unprotect = vi.spyOn(WindowsCurrentUserProtection.prototype, 'unprotect').mockImplementation((bytes, binding) => {
    unprotected++; return protection.unprotect(bytes, binding)
  })
  const protect = vi.spyOn(WindowsCurrentUserProtection.prototype, 'protect').mockImplementation(async () => { throw new Error('fixture identity must already exist') })
  cleanups.push(() => { unprotect.mockRestore(); protect.mockRestore() })
  const key = credentialKey('harmony-desktop-identity', alias)
  await credentials.modifyRecord(key, async () => fixedProtectedIdentity(alias, desktopKey, protection))
  const originalIdentity = await credentials.readRecord(key)
  const budget = join(world, 'device-command-ui-four-responses.json')
  await writeFile(budget, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
  const replay = installLlmReplay(ctx, { file: budget, overrideFile: budget, offline: true,
    providers: [{ id: 'command-ui-replay', models: [{ id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }] }] })
  cleanups.push(() => replay.dispose())
  let modelCalls = 0
  const stopCalls = ctx.on('llm-replay/request', () => { modelCalls++ }); cleanups.push(() => { stopCalls() })
  const lifetime = new AbortController(); cleanups.push(() => lifetime.abort())
  const browser = await launchTestChromium(); cleanups.push(() => browser.close())
  const page = await newEnglishPage(browser), pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  try {
    await page.goto(scaffold.authenticatedUrl)
    const directory = join(scaffold.workspaceCwd, 'actual-device-command'); await mkdir(directory)
    await page.getByRole('textbox', { name: 'Choose workspace' }).click()
    const dialog = page.getByRole('dialog', { name: 'Select Workspace Directory' })
    await dialog.getByRole('button', { name: 'Edit path' }).click()
    const path = dialog.getByRole('textbox', { name: 'Edit path' })
    await path.press('ControlOrMeta+A'); await path.pressSequentially(directory); await path.press('Enter')
    await dialog.getByRole('button', { name: 'Open', exact: true }).click()
    await expect.poll(async () => (await ctx.sessionController.list({}, lifetime.signal)).items.length).toBe(1)
    const sessionId = (await ctx.sessionController.list({}, lifetime.signal)).items[0]!.sessionId
    const selected = await ctx.sessionController.readModelSelection({ sessionId })
    expect(await ctx.sessionController.compareAndSelectModel({ sessionId, expectedSelectionRevision: selected.selectionRevision,
      selection: { provider: 'command-ui-replay', model: 'main' } })).toMatchObject({ applied: true })
    const composer = page.locator('[data-composer-input][contenteditable="true"]')
    await expect.poll(() => composer.count()).toBe(1)
    const chip = composer.locator('[data-composer-command="harmony-device"][contenteditable="false"]')
    const clear = async () => { await composer.press('ControlOrMeta+A'); await composer.press('Backspace'); await composer.press('Escape') }
    const defaults: DeviceCommand.DeviceCommandOptions = JSON.parse(await readFile(new URL('../desktop-plugin/device.enabled.example.json', import.meta.url), 'utf8'))
    const options: DeviceCommand.DeviceCommandOptions = { ...defaults, enabled: true, connectionMode: 'window', desktopId: 'command-ui-desktop',
      deviceId: 'command-ui-phone', identityAlias: alias, phoneIdentityAlias: 'command-ui-fixture-phone',
      relay: { ...defaults.relay, e2e: { ...defaults.relay.e2e, maxPlaintextBytes: 1048576 } },
      workspace: { ttlMs: 60000, channel: { maxRequestBytes: 1048576, maxResponseBytes: 16777216 },
        wire: { maxChunkBytes: 524288, maxBufferedBytes: 33554432, maxBodyBytes: 16777216, maxBodies: 64, maxStreams: 32, maxRequestBytes: 1048576 } } }
    assert.ok(options.workspace)
    await expect(DeviceCommand.apply(child, { ...options, workspace: { ...options.workspace, wire: { ...options.workspace.wire, maxChunkBytes: 1048576 } } }))
      .rejects.toThrow('workspace messages exceed device envelope capacity')
    await composer.pressSequentially('/harmony-device status')
    expect(await chip.count()).toBe(0); expect(unprotected).toBe(0)
    await clear()
    const plugin = child.plugin(DeviceCommand, options); cleanups.push(() => plugin.dispose()); await plugin
    const prepare = async (verb: string) => {
      await composer.pressSequentially('/harmony-device')
      await page.getByRole('option', { name: /^harmony-device /i }).click()
      await composer.pressSequentially(verb)
      await expect.poll(() => chip.count()).toBe(1)
      expect((await composer.textContent())?.replaceAll('\u00a0', ' ').trim()).toBe('/harmony-device ' + verb)
    }
    const results: Array<{ verb: string; state: string }> = []
    for (const [index, verb] of ['status', 'workspace-status', 'workspace-stop'].entries()) {
      await prepare(verb)
      if (index === 0) {
        await writeFile(join(world, 'actual-device-command-claimed.html'), await composer.innerHTML())
        await page.screenshot({ path: join(world, 'actual-device-command-claimed.png') })
      }
      await composer.press('Enter')
      await expect.poll(async () => (await ctx.sessionQuery.readSession(sessionId)).events.filter(event => event.type === 'command/done').length).toBe(index + 1)
      const done = (await ctx.sessionQuery.readSession(sessionId)).events.filter(event => event.type === 'command/done').at(-1)
      assert.ok(done?.data.text); expect(done.data.kind).toBe('success')
      const result = z.object({ state: z.string(), publicResult: z.object({ enabled: z.boolean(), expiresAt: z.number().nullable() }).optional() }).parse(JSON.parse(done.data.text))
      expect(result.state).toBe(index === 0 ? 'not-bound' : 'workspace-disabled')
      if (index > 0) expect(result.publicResult).toEqual({ enabled: false, expiresAt: null })
      results.push({ verb, state: result.state }); await expect.poll(() => composer.textContent()).toBe('')
    }
    expect(unprotected).toBe(1); expect(protect).not.toHaveBeenCalled()
    expect(await credentials.readRecord(key)).toEqual(originalIdentity)
    await prepare('status'); await plugin.dispose()
    await expect.poll(() => chip.count()).toBe(1); await composer.press('Enter')
    await expect.poll(async () => (await page.locator('body').innerText()).includes('unknown or malformed command: /harmony-device status')).toBe(true)
    await clear()
    const events = (await ctx.sessionQuery.readSession(sessionId)).events
    expect(events.filter(event => event.type === 'turn/start')).toEqual([])
    expect(events.filter(event => event.type === 'command/run')).toHaveLength(3)
    expect(events.filter(event => event.type === 'command/done')).toHaveLength(3)
    expect(modelCalls).toBe(0); ctx.llm.assertZeroRealCalls(); expect(pageErrors).toEqual([])
    await writeFile(join(world, 'observed.json'), JSON.stringify({ actualDeviceCommand: true, standardComposer: true, invalidChunkPolicyRejected: true,
      maxChunkBytes: 524288, maxPlaintextBytes: options.relay.e2e.maxPlaintextBytes, results, commands: 3, removedClaimRejected: true,
      memoryCredentials: true, syntheticIdentityUnprotected: unprotected, identityUnchanged: true, dpapi: false, deviceBinding: false,
      relay: false, physicalPhone: false, dailyProfile: false, modelCalls, realModels: 0, sessionId }) + '\n')
  } catch (error) {
    if (!page.isClosed()) {
      await page.screenshot({ path: join(world, 'device-command-ui-failure.png') })
      await writeFile(join(world, 'device-command-ui-failure.txt'), await page.locator('body').innerText())
    }
    throw error
  }
})
