/** Static/guard evidence, explicitly excluding ArkTS compilation and ArkWeb/device qualification. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { richFixture } from '../.build/fixtures.js'
import { canonicalRichJson } from '../.build/upstream-validate.js'

test('native fixture declares no device permissions or executable guest bridge', async () => {
  const module = JSON.parse(await readFile('harmony/entry/src/main/module.json5', 'utf8'))
  assert.deepEqual(module.module.requestPermissions, [])
  assert.equal(module.module.abilities[0].startWindowIcon, '$media:app_icon')
  assert.equal(module.module.abilities[0].startWindowBackground, '$color:start_window_background')
  const preview = await readFile('harmony/entry/src/main/ets/components/RichPreview.ets', 'utf8')
  assert.match(preview, /javaScriptAccess\(false\)/)
  assert.match(preview, /fileAccess\(false\)/)
  assert.doesNotMatch(preview, /registerJavaScriptProxy|javaScriptProxy|runJavaScript|dshDesktop|INTERNET/)
  const badge = await readFile('harmony/entry/src/main/ets/components/ConnectionBadge.ets', 'utf8')
  assert.match(badge, /mode: ConnectionMode = ConnectionMode\.Fixture/)
  assert.match(badge, /status: ConnectionStatus = ConnectionStatus\.Disabled/)
  assert.match(badge, /app\.string\.replay_connected/)
  const page = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
  assert.doesNotMatch(page, /setTimeout|demoResult/)
  assert.match(page, /phase5Sessions\[this.selected\]\.views\[this.scenario\]/)
  assert.match(page, /DisabledMobileProvider/)
  const generated = await readFile('harmony/entry/src/main/ets/generated/NativePresentation.ets', 'utf8')
  assert.match(generated, /Generated from SemanticPhone/)
  assert.doesNotMatch(generated, /constructor\(public /)
  assert.match(generated, /this\.messages = messages/)
  const provider = await readFile('harmony/entry/src/main/ets/provider/MobileProvider.ets', 'utf8')
  assert.doesNotMatch(provider, /registerJavaScriptProxy|runJavaScript|Bearer|Authorization/)
})

test('unconfirmed toolchain blocks metadata preparation before creating build files', async () => {
  const platform = JSON.parse(await readFile('harmony/platform.json', 'utf8'))
  await mkdir('.build', { recursive: true })
  const nativeRoot = await mkdtemp(resolve('.build/native-guard-'))
  await writeFile(join(nativeRoot, 'platform.json'), JSON.stringify({ ...platform, installedToolchainConfirmed: false }) + '\n')
  const child = spawnSync(process.execPath, ['scripts/prepare-native.mjs', nativeRoot], {
    encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' }, timeout: 5000,
  })
  assert.equal(child.status, 1)
  assert.match(child.stderr, /Native build disabled/)
  await assert.rejects(access(join(nativeRoot, 'build-profile.json5')), error => error.code === 'ENOENT')
  await assert.rejects(access(join(nativeRoot, 'oh-package.json5')), error => error.code === 'ENOENT')
})

test('generated HAP resources preserve canonical rich content hash and original upstream source hashes', async () => {
  const manifest = richFixture('mock-session-a').manifest
  const expected = createHash('sha256').update(canonicalRichJson({ html: manifest.html, css: manifest.css, js: manifest.js,
    stateSchemaVersion: manifest.stateSchemaVersion })).digest('hex')
  assert.equal(manifest.contentHash, expected)
  const asset = JSON.parse(await readFile('harmony/entry/src/main/resources/rawfile/asset-source-manifest.json', 'utf8'))
  assert.equal(asset.contentHash, expected)
  assert.equal(asset.arktsCompile, false)
  assert.equal(asset.arkwebDeviceValidated, false)
  for (const [path, hash] of Object.entries(asset.upstreamHashes)) {
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash, path)
  }
  const guest = await readFile('harmony/entry/src/main/resources/rawfile/guest-sdk.js', 'utf8')
  assert.match(guest, /lumina-rich\/1/)
  assert.doesNotMatch(guest, /dshDesktop|electron|Authorization|Bearer/)
})

test('native long-history fixture shares the bounded window and cache state while provider reads remain disabled', async () => {
  const fixtures = JSON.parse(await readFile('harmony/entry/src/main/resources/rawfile/phase6-native-fixtures.json', 'utf8'))
  assert.equal(fixtures.mode, 'synthetic-only'); assert.equal(fixtures.maxRows, 20)
  const long = fixtures.sessions.find(row => row.sessionId === 'phase6-long-cache')
  assert.equal(long.views[0].messages.length, 100); assert.equal(long.views[1].readOnly, true)
  assert.equal(long.views[1].connection, 'disconnected'); assert.ok(long.views[1].notices.includes('offline-cache'))
  const generated = await readFile('harmony/entry/src/main/ets/generated/NativePresentation.ets', 'utf8')
  assert.match(generated, /shared MessageWindow\(20\)/); assert.ok(!generated.includes('native-history-79'))
  assert.ok(generated.includes('native-history-80')); assert.ok(generated.includes('native-history-99'))
  const page = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8'), provider = await readFile('harmony/entry/src/main/ets/provider/MobileProvider.ets', 'utf8')
  assert.match(page, /List\(/); assert.match(page, /message\.id/); assert.match(page, /app\.string\.offline_cache/)
  assert.match(provider, /async read\(packetJson: string\)/); assert.doesNotMatch(provider, /fetch|http\.createHttp|createWebSocket|openSync|readSync/)
})
