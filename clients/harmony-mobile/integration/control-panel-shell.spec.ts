/** The immutable Harmony client inside the shipped Web shell and real authenticated Remote transport. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { launchTestChromium, newEnglishPage } from '../../../apps/web/tests/support.ts'
import { installShellDeviceFixture } from './control-panel-shell-fixture.ts'

const world = process.env.DSH_HARMONY_SHELL_WORLD!, stage = process.env.DSH_HARMONY_SHELL_STAGE!, overlay = process.env.DSH_HARMONY_SHELL_OVERLAY!
if (world === undefined || stage === undefined || overlay === undefined || process.env.DSH_SNAPSHOT !== 'replay') throw new Error('Isolated offline shell world required')
let scaffold: WebScaffold, browser: Browser, page: Page, tripwire: ReturnType<typeof watchConsole>
let fixture: Awaited<ReturnType<typeof installShellDeviceFixture>>
const observed: object[] = []
const traffic: { path: string; status?: number; failure?: string }[] = []
const sockets: { path: string; sent: number; received: number; closed: boolean }[] = []
let firstSession: string
let releaseInitialWorkspace: () => void, noteInitialWorkspace: () => void
const initialWorkspaceGate = new Promise<void>(resolve => { releaseInitialWorkspace = resolve })
const initialWorkspaceSeen = new Promise<void>(resolve => { noteInitialWorkspace = resolve })
const panel = () => page.locator('[data-testid="harmony-controls"]')
const action = (name: string) => panel().locator(`[data-harmony-action="${name}"]`)
const question = () => page.locator('[data-rich-question]')
const selectedSession = () => page.locator('[data-conversation-session]').getAttribute('data-conversation-session')

async function openPanel(): Promise<void> {
  await panel().waitFor()
  if (await panel().getAttribute('open') === null) await panel().locator('summary').click()
}

async function expectState(state: string): Promise<void> {
  await expect.poll(async () => {
    const output = panel().getByRole('textbox', { name: 'Filtered public result', exact: true })
    return await output.count() === 0 ? undefined : JSON.parse(await output.inputValue()).state
  }, { timeout: 10000 }).toBe(state)
}

async function answer(label: 'Deny' | 'Allow'): Promise<void> {
  const option = question().getByLabel(label, { exact: true })
  await option.check()
  assert.equal(await option.isChecked(), true)
  await question().getByRole('button', { name: 'Submit answer', exact: true }).click()
  await question().waitFor({ state: 'hidden' })
  await openPanel()
}

beforeAll(async () => {
  console.log('shell-check: booting shipped Web composition')
  scaffold = await launchWebScaffold({ firstUse: true, extraInstallAnchors: [join(stage, 'package.json')], extraOverlayPath: [overlay], profile: { hmr: false, bundles: ['@deepseek-ai/dsh-experimental-harmony-mobile'], packages: [] } })
  console.log('shell-check: Web composition ready')
  assert.equal(scaffold.ctx.profileContext.name, 'desktop')
  assert.ok(scaffold.ctx.get('richInline'), 'Rich-inline prerequisite must activate before the device fixture')
  fixture = await installShellDeviceFixture(scaffold.ctx, world)
  const initial = await scaffold.hostFetch('/'); assert.equal(initial.status, 200)
  console.log('shell-check: authenticated HTTP entry ready')
  browser = await launchTestChromium(); page = await newEnglishPage(browser)
  console.log('shell-check: Chromium page created')
  tripwire = watchConsole(page)
  page.on('response', response => traffic.push({ path: new URL(response.url()).pathname, status: response.status() }))
  page.on('requestfailed', request => traffic.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText ?? 'request-failed' }))
  page.on('websocket', socket => {
    const url = new URL(socket.url())
    assert.equal(url.host, new URL(scaffold.baseUrl).host)
    const row = { path: url.pathname, sent: 0, received: 0, closed: false }
    sockets.push(row)
    socket.on('framesent', () => { row.sent++ }); socket.on('framereceived', () => { row.received++ }); socket.on('close', () => { row.closed = true })
  })
  await page.route('**/*', route => new URL(route.request().url()).origin === scaffold.baseUrl ? route.continue() : route.abort())
  await page.route(url => url.pathname === '/api/workspace/initializeDefault', async route => {
    noteInitialWorkspace(); await initialWorkspaceGate; await route.fallback()
  })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'commit' })
  console.log('shell-check: browser navigation committed')
  await page.waitForSelector('[class*="frame"]', { timeout: 30000 })
  console.log('shell-check: real shell frame visible')
}, 120000)

afterEach(async context => {
  console.log('shell-check: ' + context.task.name + ': ' + context.task.result?.state)
  await writeFile(join(world, 'progress.json'), JSON.stringify({ test: context.task.name, state: context.task.result?.state, commands: fixture.events, pageErrors: tripwire.pageErrors }, null, 2) + '\n')
})

afterAll(async () => {
  releaseInitialWorkspace()
  const failures: unknown[] = []
  if (page !== undefined) {
    try { await writeFile(join(world, 'observed.json'), JSON.stringify({ observed, traffic, sockets, commands: fixture.events, pageErrors: tripwire.pageErrors, warnings: tripwire.warnings }, null, 2) + '\n') } catch (error) { failures.push(error) }
    try { await page.screenshot({ path: join(world, 'shell-final.png'), fullPage: true, timeout: 5000 }) } catch (error) { failures.push(error) }
  }
  try { await browser?.close() } catch (error) { failures.push(error) }
  try { await fixture?.close() } catch (error) { failures.push(error) }
  try { await scaffold?.close() } catch (error) { failures.push(error) }
  await writeFile(join(world, 'cleanup.json'), JSON.stringify({ completed: failures.length === 0, browserCloseAwaited: browser !== undefined, browserDisconnected: browser === undefined || !browser.isConnected(), deviceFixtureCloseAwaited: fixture !== undefined, scaffoldCloseAwaited: scaffold !== undefined, sockets, failures: failures.map(error => error instanceof Error ? error.message : String(error)) }, null, 2) + '\n')
  if (failures.length) throw new AggregateError(failures, 'Shell fixture cleanup failed')
})

it('keeps the no-workspace homepage inert and mounts the panel in a retained blank Session', async () => {
  await initialWorkspaceSeen
  assert.equal(await panel().count(), 0)
  assert.equal(fixture.events.length, 0)
  await page.screenshot({ path: join(world, 'shell-no-workspace.png'), fullPage: true })
  releaseInitialWorkspace()
  await panel().waitFor({ timeout: 15000 })
  await openPanel()
  firstSession = (await selectedSession())!
  assert.ok(firstSession)
  assert.equal(fixture.events.length, 0)
  assert.equal(await action('route-start').isDisabled(), true)
  assert.equal(await action('status').isEnabled(), true)
  observed.push({ check: 'blank-homepage', url: new URL(page.url()).pathname, session: firstSession, mountCommands: fixture.events.length })
  await page.screenshot({ path: join(world, 'shell-blank-session.png'), fullPage: true })
  expect(tripwire.pageErrors).toEqual([])
})

it('uses the real question composer to deny a route and requires local stop before another mutation', async () => {
  await action('status').click(); await expectState('bound')
  assert.equal(fixture.events.at(-1)?.sessionId, firstSession)
  const before = fixture.events.length
  await action('route-start').click(); await question().waitFor()
  assert.match(await question().innerText(), /Prepare one new original-key relay window/)
  assert.equal(fixture.events.length, before + 1)
  assert.equal(fixture.events.at(-1)?.type, 'command/run')
  await page.screenshot({ path: join(world, 'shell-confirmation.png'), fullPage: true })
  await answer('Deny')
  await panel().getByText('The command did not complete. Check public status first.', { exact: true }).waitFor()
  assert.equal(await action('route-start').isDisabled(), true)
  assert.equal(fixture.events.at(-1)?.kind, 'error')
  await action('stop').click(); await expectState('stopped')
  assert.equal(await action('route-start').isEnabled(), true)
  observed.push({ check: 'confirmation-denied', session: firstSession, mutationLockedUntilStop: true })
})

it('offers a local synthetic route only after explicit Allow and preserves the binding on stop', async () => {
  await action('route-start').click(); await question().waitFor()
  await answer('Allow'); await expectState('route-offered')
  const output = JSON.parse(await panel().getByRole('textbox', { name: 'Filtered public result', exact: true }).inputValue())
  assert.equal(output.publicResult.schema, 'harmony-device-route-offer/1')
  assert.equal(output.sessionId, firstSession)
  assert.equal(await action('connect').isDisabled(), true)
  await page.screenshot({ path: join(world, 'shell-route-offered.png'), fullPage: true })
  await action('stop').click(); await expectState('stopped')
  observed.push({ check: 'confirmation-allowed', session: firstSession, state: output.state, verification: await fixture.verify() })
})

it('keeps a pending confirmation and its result in the original saved Session across A to B to A switches', async () => {
  const seed = await readFile(join(process.env.DSH_HARMONY_SOURCE_ROOT!, 'snapshots/web/fresh-round-trip/session.v4.jsonl'), 'utf8')
  const firstSession = await seedSession(scaffold, seed, 'harmony-shell-saved-a', 'standard')
  const secondSession = await seedSession(scaffold, seed, 'harmony-shell-saved-b', 'standard')
  const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd, 'Offline saved Sessions')
  await workspace.attachSession(firstSession); await workspace.attachSession(secondSession)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const group = page.locator('[data-row-key^="workspace:"]').filter({ hasText: 'Offline saved Sessions' })
  await group.waitFor()
  if (await group.getAttribute('aria-expanded') === 'false') await group.click()
  await page.locator(`[data-row-key="session:${firstSession}"]`).click()
  await expect.poll(selectedSession).toBe(firstSession); await openPanel()
  await action('status').click(); await expectState('bound')
  await action('route-start').click(); await question().waitFor()
  const pendingId = fixture.events.at(-1)!.commandId
  const questionKey = await question().getAttribute('data-rich-question')
  await question().getByLabel('Allow', { exact: true }).check()
  await page.locator(`[data-row-key="session:${secondSession}"]`).click()
  await expect.poll(selectedSession).toBe(secondSession)
  await question().waitFor({ state: 'hidden' })
  await openPanel()
  assert.equal(await panel().getByRole('textbox', { name: 'Filtered public result', exact: true }).count(), 0)
  const before = fixture.events.length
  await action('status').click()
  await panel().getByText('The command did not complete. Check public status first.', { exact: true }).waitFor()
  assert.equal(fixture.events.length, before + 2)
  assert.equal(fixture.events.at(-1)?.sessionId, secondSession)
  assert.equal(fixture.events.at(-1)?.kind, 'error')
  assert.equal(fixture.events.filter(row => row.commandId === pendingId).length, 1)
  await page.screenshot({ path: join(world, 'shell-second-session.png'), fullPage: true })
  await page.locator(`[data-row-key="session:${firstSession}"]`).click()
  await expect.poll(selectedSession).toBe(firstSession)
  await question().waitFor()
  assert.equal(await question().getAttribute('data-rich-question'), questionKey)
  assert.equal(await question().getByLabel('Allow', { exact: true }).isChecked(), true)
  assert.equal(await action('status').isDisabled(), true)
  assert.equal(fixture.events.filter(row => row.commandId === pendingId).length, 1)
  await answer('Allow'); await expectState('route-offered')
  assert.deepEqual(fixture.events.filter(row => row.commandId === pendingId).map(row => [row.sessionId, row.type]), [[firstSession, 'command/run'], [firstSession, 'command/done']])
  await page.locator(`[data-row-key="session:${secondSession}"]`).click()
  await expect.poll(selectedSession).toBe(secondSession); await openPanel()
  assert.equal(await panel().getByRole('textbox', { name: 'Filtered public result', exact: true }).count(), 0)
  await action('status').click(); await expectState('bound')
  assert.equal(await page.locator('[data-conversation-session]').getByText(/"sessionId":"harmony-shell-saved-a","state":"route-offered"/).count(), 0)
  const beforeReturn = fixture.events.length
  await page.locator(`[data-row-key="session:${firstSession}"]`).click()
  await expect.poll(selectedSession).toBe(firstSession); await openPanel()
  await page.locator('[data-conversation-session]').getByText(/"sessionId":"harmony-shell-saved-a","state":"route-offered"/).waitFor()
  const boundRecord = page.locator('[data-conversation-session]').getByText('{"profileId":"desktop","sessionId":"harmony-shell-saved-a","state":"bound"}', { exact: true })
  expect(JSON.parse(await boundRecord.innerText())).toMatchInlineSnapshot(`
    {
      "profileId": "desktop",
      "sessionId": "harmony-shell-saved-a",
      "state": "bound",
    }
  `)
  assert.equal(fixture.events.length, beforeReturn)
  assert.equal(await panel().getByRole('textbox', { name: 'Filtered public result', exact: true }).count(), 0)
  await action('stop').click(); await expectState('stopped')
  const verification = await fixture.verify()
  expect(tripwire.pageErrors).toEqual([])
  assert.equal(traffic.filter(row => row.status !== undefined && row.status >= 400 || row.failure !== undefined && !(row.path === '/plugins/events' && row.failure === 'net::ERR_ABORTED')).length, 0)
  observed.push({ check: 'session-switch', firstSession, secondSession, pendingId, pendingDraftRestored: true, concurrentCommandRejected: true, resultRemainsInOriginalSession: true, settledPanelScopeRecreatedWithoutAutomaticCommand: true, verification })
})

it('dismisses the actual confirmation without granting a route and unlocks changes only after local stop', async () => {
  await action('route-start').click(); await question().waitFor()
  await question().getByRole('button', { name: 'Return to conversation', exact: true }).click()
  await question().waitFor({ state: 'hidden' }); await openPanel()
  await panel().getByText('The command did not complete. Check public status first.', { exact: true }).waitFor()
  assert.equal(await action('route-start').isDisabled(), true)
  assert.equal(fixture.events.at(-1)?.kind, 'error')
  await action('stop').click(); await expectState('stopped')
  assert.equal(await action('route-start').isEnabled(), true)
  observed.push({ check: 'confirmation-dismissed', noRouteGranted: true, verification: await fixture.verify() })
})

it('retains the sidebar entry and pending confirmation of a command-only Session across navigation', async () => {
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  await expect.poll(selectedSession).not.toBe('harmony-shell-saved-a')
  const blank = (await selectedSession())!
  await openPanel(); await action('status').click(); await expectState('bound')
  await action('route-start').click(); await question().waitFor()
  const pendingId = fixture.events.at(-1)!.commandId
  await page.getByRole('button', { name: 'New session', exact: true }).last().click()
  await expect.poll(selectedSession).not.toBe(blank)
  await question().waitFor({ state: 'hidden' })
  const originalRow = page.locator(`[data-row-key="session:${blank}"]`)
  await originalRow.waitFor()
  assert.equal(fixture.events.filter(row => row.commandId === pendingId).length, 1)
  await originalRow.click(); await expect.poll(selectedSession).toBe(blank)
  await question().waitFor()
  await expect.poll(() => originalRow.getAttribute('aria-selected')).toBe('true')
  expect({ role: await originalRow.getAttribute('role'), selected: await originalRow.getAttribute('aria-selected'), visible: await originalRow.isVisible(), waitingForAnswer: await question().isVisible() }).toMatchInlineSnapshot(`
    {
      "role": "treeitem",
      "selected": "true",
      "visible": true,
      "waitingForAnswer": true,
    }
  `)
  assert.equal(await action('status').isDisabled(), true)
  assert.equal(fixture.events.filter(row => row.commandId === pendingId).length, 1)
  await page.screenshot({ path: join(world, 'shell-blank-session-returned.png'), fullPage: true })
  await answer('Deny')
  await panel().getByText('The command did not complete. Check public status first.', { exact: true }).waitFor()
  await action('stop').click(); await expectState('stopped')
  observed.push({ check: 'blank-session-switch-entry', qualified: true, blank, pendingId, noDuplicateRequest: true, verification: await fixture.verify() })
})
