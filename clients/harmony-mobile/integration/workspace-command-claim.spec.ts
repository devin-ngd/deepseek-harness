/** Real standard composer command claims with a local registry fixture; no device, credential or model request is used. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { launchTestChromium, newEnglishPage } from '../../../apps/web/tests/support.ts'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'

it('requires a command chip before submission and keeps an unloaded claimed command out of the model sink', async () => {
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD; assert.ok(world)
  const scaffold = await launchWebScaffold({})
  onTestFinished(() => scaffold.close())
  const ctx = scaffold.ctx, file = join(world, 'unused-four-response-budget.json')
  await writeFile(file, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
  const replay = installLlmReplay(ctx, { file, overrideFile: file, offline: true,
    providers: [{ id: 'command-claim-replay', models: [{ id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }] }] })
  onTestFinished(() => replay.dispose())
  let modelCalls = 0
  const stopCalls = ctx.on('llm-replay/request', () => { modelCalls++ })
  onTestFinished(() => { stopCalls() })
  const lifetime = new AbortController(); onTestFinished(() => lifetime.abort())
  const browser = await launchTestChromium(); onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
  await page.goto(scaffold.authenticatedUrl)
  const directory = join(scaffold.workspaceCwd, 'command-claim'); await mkdir(directory)
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
    selection: { provider: 'command-claim-replay', model: 'main' } })).toMatchObject({ applied: true })
  const composer = page.locator('[data-composer-input][contenteditable="true"]').last()
  await composer.waitFor()
  const chip = composer.locator('[data-composer-command="harmony-device"][contenteditable="false"]')
  const claimed = async () => await chip.count() === 1
    && (await composer.textContent())?.replaceAll('\u00a0', ' ').trim() === '/harmony-device status'
  await composer.pressSequentially('/harmony-device status')
  expect(await claimed()).toBe(false)
  expect(await chip.count()).toBe(0)
  await composer.press('ControlOrMeta+A'); await composer.press('Backspace'); await composer.press('Escape')
  const executed: string[] = []
  const stopCommand = ctx.effect(() => ctx.commands.register({ name: 'harmony-device', description: 'Command claim fixture', input: { hint: 'status' }, recordInput: false,
    handler: invocation => { executed.push(invocation.rawInput.trim()); return { kind: 'success', text: 'COMMAND_CLAIM_FIXTURE_STATUS' } } }))
  onTestFinished(stopCommand)
  const prepare = async () => {
    await composer.pressSequentially('/harmony-device')
    await page.getByRole('option', { name: /^harmony-device /i }).click()
    await composer.pressSequentially('status')
    expect(await claimed()).toBe(true)
  }
  await prepare()
  await writeFile(join(world, 'command-claimed.html'), await composer.innerHTML())
  await page.screenshot({ path: join(world, 'command-claimed.png') })
  await composer.press('Enter')
  await expect.poll(() => executed).toEqual(['status'])
  await expect.poll(() => composer.textContent()).toBe('')
  await prepare()
  stopCommand()
  expect(await claimed()).toBe(true)
  await composer.press('Enter')
  await expect.poll(async () => (await page.locator('body').innerText()).includes('unknown or malformed command: /harmony-device status')).toBe(true)
  expect(executed).toEqual(['status'])
  expect(await claimed()).toBe(true)
  await composer.press('ControlOrMeta+A'); await composer.press('Backspace'); await composer.press('Escape')
  const history = await ctx.sessionQuery.readSession(sessionId)
  expect(history.events.filter(event => event.type === 'turn/start')).toEqual([])
  expect(history.events.filter(event => event.type === 'command/run')).toHaveLength(1)
  expect(history.events.filter(event => event.type === 'command/done')).toHaveLength(1)
  expect(modelCalls).toBe(0); ctx.llm.assertZeroRealCalls()
  expect(errors).toEqual([])
  await writeFile(join(world, 'observed.json'), JSON.stringify({ realComposer: true, publicClaimMarker: 'data-composer-command',
    absentCommandNotSubmitted: true, claimedCommandExecutedOnce: true, removedClaimFailedAsCommand: true,
    commandRuns: 1, modelCalls: 0, realModels: 0, devices: false, credentials: false, sessionId }) + '\n')
  } catch (error) {
    if (!page.isClosed()) {
      await page.screenshot({ path: join(world, 'command-claim-failure.png') })
      await writeFile(join(world, 'command-claim-failure.txt'), await page.locator('body').innerText())
    }
    throw error
  }
})
