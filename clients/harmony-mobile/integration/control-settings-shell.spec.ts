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
  fixture = await installShellDeviceFixture(scaffold.ctx, world)
  cleanup.push(() => fixture.close())
  console.log('shell-check: synthetic device commands ready')
  const browser = await launchTestChromium()
  cleanup.push(() => browser.close())
  page = await newEnglishPage(browser)
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

it('keeps the composer clear and exposes phone controls through Plugins settings with visible confirmation', async () => {
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
  assert.deepEqual(fixture.events, [])
  await page.screenshot({ path: join(world, 'settings-chat.png'), fullPage: true })
  await openPhoneSettings()
  assert.equal(await settings.getByTestId('harmony-controls').count(), 1)
  assert.deepEqual(fixture.events, [])
  await action('status').click()
  await expect.poll(state).toBe('bound')
  await action('route-start').click()
  await settings.waitFor({ state: 'hidden' })
  const question = page.locator('[data-rich-question]')
  await question.waitFor()
  await question.getByLabel('Deny', { exact: true }).check()
  await question.getByRole('button', { name: 'Submit answer', exact: true }).click()
  await question.waitFor({ state: 'hidden' })
  await openPhoneSettings()
  await panel.getByText('The command did not complete. Check public status first.', { exact: true }).waitFor()
  assert.equal(await action('route-start').isDisabled(), true)
  await action('stop').click()
  await expect.poll(state).toBe('stopped')
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
  await writeFile(join(world, 'observed.json'), JSON.stringify({ observed: [{ check: 'plugin-settings-controls', qualified: true, verification: await fixture.verify() }] }, null, 2) + '\n')
})
