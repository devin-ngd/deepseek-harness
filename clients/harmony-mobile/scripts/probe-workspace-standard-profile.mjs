/** Boot the standard-installed private web profile with finite replay and a read-only module probe. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, rename, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
const input = process.argv[2], browserCase = new Map([['--desktop-rail', 'rail'], ['--desktop-brick', 'brick'], ['--desktop-brick-graph', 'brick-graph']]).get(process.argv[3])
assert.equal(process.argv.length, browserCase === undefined ? 3 : 4); assert.match(input, /^evidence\/workspace-plugin-install-\d+\.json$/)
const install = JSON.parse(await readFile(input, 'utf8')); assert.equal(install.passed, true)
if (browserCase !== undefined) assert.ok(install.thirdParty?.name === (browserCase === 'rail' ? 'dsh-chat-index-rail' : 'dsh-theme-brick') && install.thirdParty.originalRegistryArchive)
assert.equal(install.archives?.length, (install.thirdParty ? 4 : 3) + (install.archiveBoundaryUpdate === undefined ? 0 : 1)
  + (install.archiveBoundaryUpdate?.compactSettings === undefined ? 0 : 1))
const copied = JSON.parse(await readFile('evidence/workspace-installed-runtime.json', 'utf8')); assert.equal(install.copiedRuntime, copied.runtime)
const world = await mkdtemp(join(install.world, 'boot-')), source = 'integration/workspace-standard-install-probe.ts', guard = 'integration/workspace-outbound-guard.mjs', sha = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceSha256 = Object.fromEntries(await Promise.all([source, guard, 'scripts/probe-workspace-standard-profile.mjs'].map(async path => [path, sha(await readFile(path))])))
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), yaml = require('js-yaml')
const fixture = join(world, 'package'); await mkdir(fixture)
const entry = join(fixture, 'index.mjs')
const build = await esbuild.build({ entryPoints: [resolve(source)], outfile: entry, bundle: true, platform: 'node', format: 'esm', target: 'node24', external: ['@deepseek-ai/*'], metafile: true,
  plugins: [{ name: 'replay-only', setup(build) { build.onResolve({ filter: /^@deepseek-ai\/dsh-llm-replay$/ }, () => ({ path: join(root, 'packages/test-support/llm-replay/src/index.ts') })) } }] })
const peers = { '@deepseek-ai/dsh': copied.release.version }
for (const output of Object.values(build.metafile.outputs)) for (const item of output.imports) {
  if (!item.external || !item.path.startsWith('@deepseek-ai/')) continue
  const name = item.path.split('/').slice(0, 2).join('/'), metadata = JSON.parse(await readFile(join(copied.runtime, 'node_modules', name, 'package.json'), 'utf8'))
  peers[name] = metadata.version
}
const probeName = '@local/dsh-standard-install-probe'
await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: probeName, version: '0.0.0-test', type: 'module', main: 'index.mjs', peerDependencies: peers, dsh: { bundle: { patch: 'cordis.patch.yml' } } }, null, 2) + '\n')
await writeFile(join(fixture, 'cordis.patch.yml'), yaml.dump([{ insert: [{ id: 'standard-install-probe', name: probeName }] }]))
const probeArchive = join(world, 'probe.tgz')
await promisify(execFile)(join(process.env.SystemRoot, 'System32/tar.exe'), ['-czf', probeArchive, '-C', world, 'package'], { windowsHide: true, timeout: 30000 })
const overlay = join(world, 'probe.overlay.yml')
await writeFile(overlay, yaml.dump([
  ...(browserCase === 'brick-graph' ? [] : [{ id: 'hmr', disabled: true }, { id: 'client-hmr', disabled: true }]),
  ...['llm-deepseek', 'agent-instructions', 'session-title-llm', 'session-telemetry-otel', 'open-in-app', 'ui-open-in-app'].map(id => ({ id, disabled: true })),
  { id: 'session-log-deepseek', config: { enabled: false } }, { id: 'ui-plugin-manager', config: { registryProbeEnabled: false } },
  { id: 'agent-preset-registry', config: { default: 'standard' } }, { id: 'tools', config: { mode: 'native' } },
  { id: 'session-persistence-jsonl', config: { root: join(world, 'sessions'), compression: 'none' } },
  { id: 'session-query-sqlite', config: { path: ':memory:', openAt: 'never' } }, { id: 'storage-json', config: { root: join(world, 'state') } },
  { id: 'workspace-controller', config: { documentsDirectory: join(world, 'Documents') } },
  { id: 'skill-filesystem', config: { dshHome: install.privateHome, agentsHome: join(world, 'agents'), bundledSkillDir: join(world, 'skills'), watch: false } },
  { id: 'webserver', config: { host: '127.0.0.1', port: 0 } }, { id: 'web-runtime', config: { openBrowser: false, printUrl: false, surfaceContext: false } },
  { id: 'credentials', config: { dshHome: install.privateHome } },
]))
const outboundLog = join(world, 'outbound.jsonl')
let thirdPartyPin
if (install.thirdParty) {
  const installed = join(install.privateHome, 'profiles/web/node_modules', ...install.thirdParty.name.split('/'))
  if (install.thirdParty.originalRegistryArchive) {
    const allowed = new Map([['dsh-tab-complete', 'dbba8f8ce3f6e426d2c1418589ba810d2ae3ffd63622eefe3ae8a5605562ba36'],
      ['dsh-chat-index-rail', '8b7c9a0c46e26c4ee5b382a55053aedb2346967f34834292ce234711242b7fe4'],
      ['dsh-theme-brick', 'b225d8b3a1864d750f11e53fc76bdef0e5d379c15b43cdfb59668645df6c294c']])
    assert.ok(allowed.has(install.thirdParty.name))
    const archive = install.archives.find(item => item.name === install.thirdParty.name)
    assert.equal(sha(await readFile(archive.archive)), allowed.get(install.thirdParty.name))
    for (const file of archive.inventory) assert.equal(sha(await readFile(join(installed, file.path))), file.sha256, file.path)
  }
  if (install.thirdParty.installedCopyEvidence !== undefined) {
    assert.equal(install.thirdParty.name, '@michengai/dsh-archive-manager')
    const evidence = 'evidence/workspace-archive-manager-installed-bytes-20261107.json'
    assert.equal(install.thirdParty.installedCopyEvidence, evidence)
    const bytes = await readFile(evidence)
    assert.equal(sha(bytes), 'eb404fbb61d692e5b0fd79da20574c2c6e91484e64c1728b6bd6eb534682dc50')
    const receipt = JSON.parse(bytes), archive = install.archives.find(item => item.name === receipt.name)
    assert.deepEqual(archive.inventory, receipt.files)
    for (const file of receipt.files) assert.equal(sha(await readFile(join(installed, file.path))), file.sha256, file.path)
  }
  const patch = yaml.load(await readFile(join(installed, 'cordis.patch.yml'), 'utf8')), inserted = patch.flatMap(item => item.insert ?? []).find(item => item.name === install.thirdParty.name)
  assert.ok(inserted?.id, 'The installed third-party package must declare its own bundle entry')
  thirdPartyPin = JSON.stringify({ name: install.thirdParty.name, entryId: inserted.id, clientEntry: 'lib/client.js' })
}
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
if (install.archiveBoundaryUpdate !== undefined) {
  const update = install.archiveBoundaryUpdate
  assert.ok(update.rollbackFrozenOffline && update.restoreFrozenOffline && update.workspacePlainDependency)
  const profile = join(install.privateHome, 'profiles/web')
  const entries = [
    { name: '@deepseek-ai/dsh-experimental-harmony-mobile', path: 'lib/device.js', archiveSha256: update.candidateHarmonySha256 },
    { name: '@deepseek-ai/dsh-api-workspace-controller', path: 'lib/index.js', archiveSha256: update.workspaceCandidateArchiveSha256, sha256: update.workspaceCandidateEntrySha256 },
  ]
  if (update.compactSettings !== undefined) {
    assert.equal(update.compactSettings.plainDependency, true)
    entries.push({ name: '@deepseek-ai/dsh-client-ui-settings-general', path: 'lib/client.js',
      archiveSha256: update.compactSettings.archiveSha256, sha256: update.compactSettings.candidateEntrySha256 })
  }
  const pins = []
  for (const { name, path, archiveSha256, sha256 } of entries) {
    const archive = install.archives.find(item => item.name === name)
    assert.equal(archive.sha256, archiveSha256)
    assert.equal(sha(await readFile(archive.archive)), archive.sha256)
    for (const file of archive.inventory) assert.equal(sha(await readFile(join(profile, 'node_modules', name, file.path))), file.sha256, file.path)
    const entry = archive.inventory.find(file => file.path === path)
    if (sha256 !== undefined) assert.equal(entry.sha256, sha256)
    pins.push({ name, path, sha256: entry.sha256 })
  }
  env.DSH_HARMONY_STANDARD_ARCHIVE_DELIVERY = JSON.stringify(pins)
}
if (thirdPartyPin) env.DSH_HARMONY_STANDARD_THIRD_PARTY = thirdPartyPin
if (browserCase !== undefined) env.DSH_HARMONY_STANDARD_BROWSER = browserCase
Object.assign(env, { DSH_HARMONY_OUTBOUND_LOG: outboundLog, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: install.privateHome, DSH_AGENTS_HOME: join(world, 'agents'), DSH_TELEMETRY_DISABLED: '1',
  DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', COREPACK_ENABLE_NETWORK: '0', npm_config_offline: 'true', npm_config_ignore_scripts: 'true',
  npm_config_userconfig: install.privateNpmConfig, npm_config_globalconfig: install.globalNpmConfig, npm_config_registry: install.registry,
  PNPM_HOME: join(install.world, 'pnpm-home'), USERPROFILE: install.privateHome,
  DSH_HARMONY_STANDARD_WORLD: world, DSH_HARMONY_STANDARD_RUNTIME: copied.runtime, TEMP: world, TMP: world })
const args = ['--expose-internals', '--import', pathToFileURL(resolve(guard)).href, join(copied.runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--patch', overlay]
const { execa } = await import(pathToFileURL(createRequire(resolve('../../packages/boot/plugin-manager/package.json')).resolve('execa')).href)
const installArgs = ['--expose-internals', join(copied.runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'plugin', '--profile', 'web', 'add', probeArchive, '--offline', '--ignore-scripts', '--registry=' + install.registry, '--store-dir=' + join(install.world, 'pnpm-store')]
const installer = execa(install.exe, installArgs, { cwd: world, env, extendEnv: false, reject: false, stdin: 'ignore', windowsHide: true, timeout: 60000, killDescendants: true })
const installed = await installer
await writeFile(join(world, 'probe-install.stdout.log'), installed.stdout); await writeFile(join(world, 'probe-install.stderr.log'), installed.stderr)
await writeFile(join(world, 'probe-install.json'), JSON.stringify({ args: installArgs, code: installed.exitCode, timedOut: installed.timedOut }, null, 2) + '\n')
assert.equal(installed.exitCode, 0, 'The declared-peer test probe must install through the standard CLI: ' + installed.stderr)
const child = execa(install.exe, args, { cwd: world, env, extendEnv: false, reject: false, stdin: 'ignore', windowsHide: true, timeout: browserCase === undefined ? 90000 : 140000, killDescendants: true })
await writeFile(join(world, 'process.json'), JSON.stringify({ pid: child.pid, exe: install.exe, args }, null, 2) + '\n', { flag: 'wx' })
if (browserCase !== undefined) {
  let browserResult
  try { browserResult = await observePublishedBrowser(world, child, browserCase) }
  catch (error) { browserResult = { status: 'fixture-error', error: String(error).slice(0, 1200) } }
  const temporary = join(world, 'published-browser-result.next.json')
  await writeFile(temporary, JSON.stringify(browserResult, null, 2) + '\n', { flag: 'wx' })
  await rename(temporary, join(world, 'published-browser-result.json'))
}
const result = await child; await writeFile(join(world, 'stdout.log'), result.stdout); await writeFile(join(world, 'stderr.log'), result.stderr)
let observed; try { observed = JSON.parse(await readFile(join(world, 'probe.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
let outbound = []; try { outbound = (await readFile(outboundLog, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)) } catch (error) { if (error.code !== 'ENOENT') throw error }
for (const [path, expected] of Object.entries(sourceSha256)) assert.equal(sha(await readFile(path)), expected, path)
const report = { at: new Date().toISOString(), install: input, world, code: result.exitCode, signal: result.signal, timedOut: result.timedOut,
  passed: result.exitCode === 0 && !result.timedOut && observed?.passed === true && (install.archiveBoundaryUpdate === undefined || observed?.archiveDelivery?.scopedArchiveVerified === true)
    && (install.archiveBoundaryUpdate?.compactSettings === undefined || observed?.archiveDelivery?.compactSettingsClientActive === true) && (browserCase === undefined || observed?.desktopBrowser?.status === 'rendered'
    || browserCase === 'rail' && observed?.desktopBrowser?.status === 'slot-incompatible'), observed, outboundRefused: outbound, sourceSha256, args, profile: 'web', home: install.privateHome,
  replacementNodeModules: false, userProfileUsed: false, realModels: 0 }
const evidence = 'evidence/workspace-standard-profile-' + Date.now() + '.json'; await writeFile(evidence, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ evidence, ...report })); process.exitCode = report.passed ? 0 : 1

async function observePublishedBrowser(world, child, browserCase) {
  const readyPath = join(world, 'published-browser.ready'), input = join(world, 'published-browser.json')
  const deadline = Date.now() + 45000
  let ready = false, childExited = false
  void child.then(() => { childExited = true })
  while (Date.now() < deadline && !childExited) {
    try { await readFile(readyPath); ready = true; break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await delay(250)
  }
  assert.ok(ready, 'Isolated desktop browser target was not published')
  const { origin, url, title, sessionId } = JSON.parse(await readFile(input, 'utf8'))
  await unlink(input)
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/); assert.equal(new URL(url).origin, origin)
  if (browserCase === 'rail') assert.match(sessionId, /^session-[a-f0-9-]+$/)
  const { chromium } = createRequire(resolve('../../apps/web/package.json'))('playwright')
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromiumSandbox: true, headless: true,
    env: Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])) })
  try {
    const context = await browser.newContext({ viewport: { width: 1160, height: 900 }, locale: 'zh-CN', colorScheme: 'light', serviceWorkers: 'block', acceptDownloads: false })
    const blocked = [], errors = []
    await context.route('**/*', route => {
      const target = new URL(route.request().url())
      if (target.origin === origin) return route.continue()
      blocked.push(target.origin); return route.abort()
    })
    await context.routeWebSocket('**/*', socket => {
      if (new URL(socket.url()).origin === origin.replace('http:', 'ws:')) return socket.connectToServer()
      blocked.push(new URL(socket.url()).origin); return socket.close()
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(String(error.stack ?? error).slice(0, 4500)))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 4500)) })
    await page.goto(url, { timeout: 12000 })
    if (browserCase !== 'rail') {
      try { return { ...await exerciseBrickSettings(page, browserCase === 'brick-graph' ? world : undefined), blocked, errors } }
      catch (error) { return { status: 'fixture-error', error: String(error).slice(0, 1200), blocked, errors,
        dialogs: (await page.getByRole('dialog').allTextContents()).map(value => value.slice(0, 180)) } }
    }
    const row = page.getByRole('treeitem').filter({ has: page.getByText(title, { exact: true }) })
    await row.waitFor({ timeout: 16000 })
    // The disposable profile may still display credential onboarding over the sidebar.
    await row.dispatchEvent('click')
    const rail = page.locator('.dyn-idx-rail button').first()
    try {
      await rail.waitFor({ timeout: 12000 })
      assert.match(await rail.getAttribute('aria-label'), /Synthetic rail/)
      await rail.click({ timeout: 5000 })
      return { status: 'rendered', compatible: true, blocked, errors }
    } catch (error) {
      const legacySelector = errors.some(message => message.includes("slot entry crashed in 'conversation.session.header.utilities'") && message.includes("reading 'nodes'"))
      if (!legacySelector) return { status: 'fixture-error', error: String(error).slice(0, 1200), blocked, errors }
      const session = page.locator(`[data-conversation-session="${sessionId}"]`)
      const questionVisible = await session.getByText('Synthetic rail question', { exact: true }).isVisible()
      return { status: 'slot-incompatible', compatible: false, questionVisible, railButtons: await page.locator('.dyn-idx-rail button').count(), blocked, errors }
    }
  } finally { await browser.close() }
}

async function exerciseBrickSettings(page, graphWorld) {
  const open = async () => {
    const account = page.getByRole('button', { name: '账号菜单', exact: true })
    await account.waitFor({ timeout: 12000 })
    const preview = page.getByRole('dialog', { name: '预览版说明', exact: true })
    await preview.waitFor({ timeout: 2500 }).catch(error => { if (error.name !== 'TimeoutError') throw error })
    if (await preview.isVisible()) {
      await preview.getByRole('button', { name: '继续', exact: true }).click({ timeout: 4000 })
      await preview.waitFor({ state: 'hidden', timeout: 5000 })
    }
    const signIn = page.getByRole('dialog', { name: '开始使用', exact: true })
    if (await signIn.isVisible()) await signIn.getByRole('button', { name: '关闭', exact: true }).click({ timeout: 4000 })
    await account.click({ timeout: 8000 })
    await page.getByRole('menuitem', { name: '设置', exact: true }).click({ timeout: 8000 })
    const toggle = page.getByRole('switch', { name: 'Brick 主题开关', exact: true })
    await toggle.waitFor({ timeout: 8000 })
    return toggle
  }
  const baseToken = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim().toUpperCase())
  const toggle = await open()
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  const enabled = await baseToken(); assert.equal(enabled, '#FAF8F3')
  await toggle.click({ timeout: 5000 })
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  const disabled = await baseToken(); assert.ok(disabled.length > 0); assert.notEqual(disabled, enabled)
  await page.reload({ timeout: 12000 })
  const reopened = await open()
  assert.equal(await reopened.getAttribute('aria-checked'), 'false'); assert.equal(await baseToken(), disabled)
  await reopened.click({ timeout: 5000 })
  assert.equal(await reopened.getAttribute('aria-checked'), 'true'); assert.equal(await baseToken(), enabled)
  let graph
  if (graphWorld !== undefined) {
    const documentStartedAt = await page.evaluate(() => performance.timeOrigin)
    await writeFile(join(graphWorld, 'brick-disable.request'), '', { flag: 'wx' })
    await reopened.waitFor({ state: 'detached', timeout: 15000 })
    const colorAfterDisable = await baseToken()
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentStartedAt)
    await writeFile(join(graphWorld, 'brick-enable.request'), '', { flag: 'wx' })
    await reopened.waitFor({ state: 'visible', timeout: 15000 })
    assert.equal(await reopened.getAttribute('aria-checked'), 'true')
    assert.equal(await baseToken(), enabled)
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentStartedAt)
    graph = { sameDocument: true, settingsRowRemoved: true, settingsRowRestored: true, colorAfterDisable,
      themeLayerRemoved: colorAfterDisable === disabled }
  }
  return { status: 'rendered', compatible: true, enabled, disabled, reloadRetained: true, ...(graph === undefined ? {} : { graph }) }
}
