/** Phone controls in the shipped Settings shell, with synthetic identity and no relay connection. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { launchWebScaffold, watchConsole } from '../../../apps/web/tests/scaffold.ts'
import { launchTestChromium, newEnglishPage, openSettings } from '../../../apps/web/tests/support.ts'
import { installShellDeviceFixture } from './control-panel-shell-fixture.ts'

const world = process.env.DSH_HARMONY_SHELL_WORLD!
const hostFixture = process.env.DSH_HARMONY_SHELL_DEVICE_ENTRY
const cleanup: (() => Promise<void>)[] = []
let page: Page
let fixture: Awaited<ReturnType<typeof installShellDeviceFixture>>
let tripwire: ReturnType<typeof watchConsole>

beforeAll(async () => {
  const stage = process.env.DSH_HARMONY_SHELL_STAGE!
  const overlay = process.env.DSH_HARMONY_SHELL_OVERLAY!
  assert.ok(world && stage && overlay)
  assert.equal(process.env.DSH_SNAPSHOT, 'replay')
  console.log('shell-check: starting source-settings Web composition')
  const scaffold = await launchWebScaffold({ firstUse: true, extraInstallAnchors: [join(stage, 'package.json')], extraOverlayPath: [overlay], profile: { hmr: false, bundles: ['@deepseek-ai/dsh-experimental-harmony-mobile'], packages: [] } })
  cleanup.push(() => scaffold.close())
  console.log('shell-check: Web composition ready')
  fixture = await installShellDeviceFixture(scaffold.ctx, world, hostFixture, hostFixture === undefined)
  cleanup.push(() => fixture.close())
  console.log('shell-check: synthetic device commands ready')
  const browser = await launchTestChromium()
  cleanup.push(() => browser.close())
  page = await newEnglishPage(browser)
  if (hostFixture === undefined) await page.clock.install()
  tripwire = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl)
  console.log('shell-check: browser entered Web shell')
  await page.locator('[data-conversation-session]').waitFor()
  console.log('shell-check: retained conversation ready')
})

afterAll(async () => {
  const failures: unknown[] = []
  for (const close of cleanup.reverse()) {
    try { await close() } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'Settings shell cleanup failed')
})

it(hostFixture === undefined
  ? 'keeps the composer clear and exposes phone controls through Plugins settings with visible confirmation'
  : 'reconnects a saved pairing and cancels pending workspace confirmation through the sealed settings controls', async () => {
  const panel = page.getByTestId('harmony-controls')
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  const openPhoneSettings = async (): Promise<void> => {
    await openSettings(page, 'en')
    await settings.getByRole('button', { name: 'Built-in plugins', exact: true }).click()
    await settings.getByRole('tab', { name: 'Phone connection', exact: true }).click()
    await panel.waitFor()
  }
  const action = (name: string) => panel.locator(`[data-harmony-action="${name}"]`)
  const state = async (): Promise<string | undefined> => {
    const output = panel.getByRole('textbox', { name: 'Filtered public result', exact: true })
    return await output.count() === 0 ? undefined : JSON.parse(await output.inputValue()).state
  }
  assert.equal(await panel.count(), 0)
  assert.equal(fixture.events.length, 0)
  await page.screenshot({ path: join(world, 'settings-chat.png'), fullPage: true })
  await openPhoneSettings()
  assert.equal(await settings.getByTestId('harmony-controls').count(), 1)
  assert.equal(fixture.events.length, 0)
  if (hostFixture !== undefined) {
    await expect.poll(fixture.connections).toEqual({ mounts: 1, releases: 0 })
    await action('status').click()
    await expect.poll(state).toBe('transport-started')
    await action('stop').click()
    await expect.poll(state).toBe('stopped')
    assert.equal(await action('connect').isDisabled(), true)
    await action('status').click()
    await expect.poll(state).toBe('bound')
    assert.equal(await action('connect').isEnabled(), true)
    await action('connect').click()
    await settings.waitFor({ state: 'hidden' })
    await expect.poll(fixture.connections).toEqual({ mounts: 2, releases: 1 })
    await openPhoneSettings()
    await expect.poll(state).toBe('transport-started')
    await action('workspace-status').click()
    await expect.poll(state).toBe('workspace-disabled')
    const question = page.locator('[data-rich-question]')
    await action('workspace-allow').click()
    await settings.waitFor({ state: 'hidden' })
    await question.waitFor()
    const sessionId = fixture.events.at(-1)?.sessionId
    assert.ok(sessionId)
    expect((await fixture.stopWorkspace(sessionId))?.result.kind).toBe('success')
    await question.waitFor({ state: 'hidden' })
    await openPhoneSettings()
    await action('workspace-status').click()
    await expect.poll(state).toBe('workspace-disabled')
    assert.equal(await action('workspace-allow').isDisabled(), true)
    await action('workspace-stop').click()
    await expect.poll(() => action('workspace-allow').isEnabled()).toBe(true)
    await action('workspace-allow').click()
    await question.waitFor()
    await question.getByRole('button', { name: 'Allow', exact: true }).click()
    await question.waitFor({ state: 'hidden' })
    await openPhoneSettings()
    await expect.poll(state).toBe('workspace-enabled')
    await action('workspace-stop').click()
    await expect.poll(state).toBe('workspace-disabled')
    expect(fixture.connections()).toEqual({ mounts: 2, releases: 1 })
    assert.deepEqual(tripwire.pageErrors, [])
    await writeFile(join(world, 'observed.json'), JSON.stringify({ observed: [{ check: 'sealed-recovery', qualified: true,
      savedPairingReconnected: true, pendingQuestionClosed: true, freshApprovalWorked: true, workspaceStopKeptNativeConnection: true,
      verification: await fixture.verify() }] }, null, 2) + '\n')
    return
  }
  await action('status').click()
  await expect.poll(state).toBe('bound')
  await action('route-start').click()
  await settings.waitFor({ state: 'hidden' })
  const question = page.locator('[data-rich-question]')
  await question.waitFor()
  await question.getByRole('button', { name: 'Deny', exact: true }).click()
  await question.waitFor({ state: 'hidden' })
  await openPhoneSettings()
  await panel.getByText('The command did not complete. Check public status first.', { exact: true }).waitFor()
  assert.equal(await action('route-start').isDisabled(), true)
  await action('stop').click()
  await expect.poll(state).toBe('stopped')
  await action('workspace-status').click()
  await expect.poll(state).toBe('workspace-disabled')
  await action('workspace-allow').click()
  await settings.waitFor({ state: 'hidden' })
  await question.waitFor()
  await question.getByRole('button', { name: 'Allow', exact: true }).click()
  await question.waitFor({ state: 'hidden' })
  await openPhoneSettings()
  await expect.poll(state).toBe('workspace-enabled')
  const raw = await panel.getByRole('textbox', { name: 'Filtered public result', exact: true }).inputValue()
  const receipt = JSON.parse(raw)
  const expiresAt: number = receipt.publicResult.expiresAt
  assert.ok(Number.isSafeInteger(expiresAt))
  assert.equal(await panel.locator('time').getAttribute('datetime'), new Date(expiresAt).toISOString())
  const expired = panel.getByText('The reported deadline has passed. Check workspace grant status.', { exact: false })
  assert.equal(await expired.count(), 0)
  const commandsBeforeExpiry = fixture.events.length
  const advance = expiresAt - await page.evaluate(() => Date.now()) + 1
  assert.ok(advance > 0 && advance <= 61000)
  await page.clock.fastForward(advance)
  await expired.waitFor({ state: 'visible' })
  assert.equal(fixture.events.length, commandsBeforeExpiry)
  assert.equal(await state(), 'workspace-enabled')
  assert.equal(await action('workspace-allow').isDisabled(), true)
  assert.equal((await fixture.stopWorkspace(receipt.sessionId))?.result.kind, 'success')
  await action('workspace-status').click()
  await expect.poll(state).toBe('workspace-disabled')
  assert.equal(await panel.locator('time').count(), 0)
  assert.equal(await action('workspace-allow').isEnabled(), true)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await action('status').isVisible(), true)
    await page.screenshot({ path: join(world, `settings-${width}.png`), fullPage: true })
  }
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })
  assert.equal(await panel.count(), 0)
  assert.deepEqual(tripwire.pageErrors, [])
  await writeFile(join(world, 'observed.json'), JSON.stringify({ observed: [{ check: 'plugin-settings-controls', qualified: true,
    deadlineFromHostReceipt: true, expiryDidNotDispatch: true, reapprovalAfterFreshStatus: true, verification: await fixture.verify() }] }, null, 2) + '\n')
})
