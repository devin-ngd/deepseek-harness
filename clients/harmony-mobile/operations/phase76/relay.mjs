/** Linux operator for an existing relay binary; only the dedicated phase76 configuration/state is new. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { posix } from 'node:path'
import { PLAN, hash, deny, dropIn, reviewDrop, relayConfig, reviewPair, requireUnusedPair } from './relay-policy.mjs'
import { bytes, json, exists, absent, noLinks, record, run, verifyPinnedFile } from './io.mjs'
import { activateMaintenance, restoreMaintenance } from './maintenance.mjs'
import { verifyPublicState, acknowledgePublicState } from './public-state-check.mjs'
const r = PLAN.relay
const sudo = (args, options) => run('/usr/bin/sudo', ['-n', ...args], options)
const service = (mode, property) => run('/usr/bin/systemctl', [mode, ...(property ? ['--value', '-p', property] : []), r.service]).trim()
async function retainedPublicState() { const values = []; for (const path of r.retainedPublicState) values.push({ path, sha256: hash(await bytes(path, 8388608)) }); await verifyPublicState(bytes, r.retainedPublicState[0]); return values }
async function originalFiles() {
  for (const [file, expected] of [[r.root + '/server.mjs', r.originalServerSha256], [r.root + '/config.enabled.json', r.originalConfigSha256], [r.code + '/state/public.jsonl', r.oldJournalSha256], [r.code + '/state/public.jsonl.head', r.oldHeadSha256], [r.root + '/field-20261015-phase54-lEUAMM/public-state/replay-v1.jsonl', r.originalJournalSha256], [r.root + '/field-20261015-phase54-lEUAMM/public-state/replay-v1.jsonl.head', r.originalHeadSha256]]) assert.equal(hash(await bytes(file, 8388608)), expected)
  const config = await json(r.root + '/config.enabled.json'); assert.equal(config.broker.enabled, false)
  assert.equal((config.broker.pairs ?? []).length, 0); for (const path of r.priorDrops) await absent(path)
  const current = await retainedPublicState(); if (await exists(r.run + '/prepared.json')) assert.deepEqual(current, (await json(r.run + '/prepared.json')).retainedPublicState)
}
async function codeFiles(rows) {
  assert.equal(rows.length, 40)
  for (const row of rows) {
    assert.ok(row.file.startsWith('relay/')); const name = row.file.slice(6)
    assert.equal(posix.normalize(name), name); assert.ok(!name.startsWith('/') && !name.startsWith('../'))
    await verifyPinnedFile(r.code + '/' + name, row, 16777216)
  }
  assert.equal(hash(await bytes(r.code + '/server.mjs', 16777216)), r.codeServerSha256)
}
async function originalService() {
  assert.equal(service('is-active'), 'active'); assert.equal(service('show', 'DropInPaths'), '')
  assert.equal(service('show', 'ReadWritePaths'), ''); assert.equal(service('show', 'ProtectSystem'), 'strict'); assert.equal(service('show', 'ProtectHome'), 'read-only')
  const command = service('show', 'ExecStart'); assert.ok(command.includes('argv[]=/usr/bin/node ' + r.root + '/server.mjs --config ' + r.root + '/config.enabled.json ;'))
  const sockets = run('/usr/bin/ss', ['-Hnt', 'sport = :17846']).trim().split('\n').filter(line => line && !line.startsWith('TIME-WAIT'))
  assert.equal(sockets.length, 0)
}
async function unusedPair() {
  const paths = [r.code + '/state/public.jsonl', r.retainedPublicState[0]], entries = [], ids = []
  for (const path of paths) entries.push(...(await bytes(path, 8388608)).toString('utf8').trim().split('\n').map(line => JSON.parse(line)))
  function visit(value) { if (value === null || typeof value !== 'object') return; if (typeof value.pairId === 'string') ids.push(value.pairId); for (const child of Object.values(value)) visit(child) }
  entries.forEach(visit); requireUnusedPair(ids)
}
async function prepared() {
  const marker = await json(r.run + '/prepared.json'); assert.equal(marker.pairId, PLAN.pairId); assert.equal(marker.planSha256, process.env.DSH_PHASE76_LIVE)
  await absent(r.run + '/preparation-failed.json'); await noLinks(r.run); return marker
}
function adapter() {
  return {
    exists, read: path => readFile(path),
    activationAttempted: () => exists(r.run + '/activation-attempt.json'),
    preflight: async () => {
      await prepared(); await originalFiles(); await originalService(); await unusedPair(); await codeFiles(await json(r.run + '/relay-files.json'))
      await absent(r.drop); await absent(r.run + '/activation-attempt.json'); await absent(r.journal + '.lock')
      await verifyPublicState(bytes, r.journal)
      assert.equal((await json(r.run + '/initialize-result.json')).completed, true)
      const pair = reviewPair(await json(r.run + '/relay-pair.json'), Date.now()), expected = relayConfig(await json(r.run + '/config.template.json'), pair)
      assert.deepEqual(await json(r.config), expected); reviewDrop((await bytes(r.run + '/override.conf', 8192)).toString('utf8'))
      assert.equal(hash(await bytes(r.nginx, 65536)), r.originalNginxSha256)
    },
    markAttempt: () => record(r.run + '/activation-attempt.json', { at: Date.now(), pairId: PLAN.pairId, outcome: 'unknown' }),
    installDrop: async text => { assert.equal(text, dropIn()); await absent(r.drop); sudo(['/usr/bin/install', '-m', '0644', r.run + '/override.conf', r.drop]) },
    moveDrop: async () => { await absent(r.run + '/rollback/completed.override.conf'); sudo(['/usr/bin/mv', '--', r.drop, r.run + '/rollback/completed.override.conf']) },
    installNginx: async () => { assert.equal(hash(await bytes(r.nginx, 65536)), r.originalNginxSha256); sudo(['/usr/bin/install', '-m', '0644', r.run + '/nginx.during.conf', r.nginx]) },
    restoreNginx: async () => { sudo(['/usr/bin/install', '-m', '0644', r.run + '/rollback/nginx.before.conf', r.nginx]) },
    command: async mode => {
      if (mode === 'nginx-test') sudo(['/usr/sbin/nginx', '-t'])
      else if (mode === 'nginx-reload') sudo(['/usr/bin/systemctl', 'reload', 'nginx'])
      else if (mode === 'daemon-reload') sudo(['/usr/bin/systemctl', mode])
      else { assert.ok(['stop', 'start'].includes(mode)); sudo(['/usr/bin/systemctl', mode, r.service]) }
    },
    verifyCandidate: async () => {
      assert.equal(service('is-active'), 'active'); assert.equal(service('show', 'ReadWritePaths'), r.state)
      assert.equal(service('show', 'ProtectSystem'), 'strict'); assert.equal(service('show', 'ProtectHome'), 'read-only')
      assert.ok(service('show', 'ExecStart').includes('argv[]=/usr/bin/node ' + r.code + '/server.mjs --config ' + r.config + ' ;'))
      reviewDrop((await bytes(r.drop, 8192)).toString('utf8'))
    },
    verifyOriginal: async () => { await absent(r.drop); await originalFiles(); await originalService(); assert.equal(hash(await bytes(r.nginx, 65536)), r.originalNginxSha256) }
  }
}
/** @param mode - closed maintenance step. @param payload - public package inputs, or the verified new public pair. @returns content-limited evidence; never opens desktop credentials or phone IO. */
export async function relayMain(mode, payload) {
  assert.equal(process.platform, 'linux'); assert.equal(process.env.DSH_PHASE76_LIVE?.length, 64)
  assert.ok(['probe', 'prepare', 'stage-pair', 'initialize', 'activate', 'restore'].includes(mode)); await noLinks(r.run)
  let result
  if (mode === 'probe' || mode === 'prepare') {
    await originalFiles(); await originalService(); await unusedPair(); await absent(r.drop)
    assert.equal(hash(await bytes(r.nginx, 65536)), r.originalNginxSha256)
    const present = await exists(r.run)
    if (mode === 'prepare') {
      assert.equal(present, false); await codeFiles(payload.files)
      assert.deepEqual(payload.template, await json(r.code + '/public-tools/config.first-use.proposal.json'))
      assert.deepEqual(payload.limits, await json(r.code + '/public-tools/relay-endpoint-timers.json'))
      const nginx = Buffer.from(payload.nginx, 'base64'); assert.equal(hash(nginx), r.candidateNginxSha256)
      await mkdir(r.run, { mode: 0o700 })
      try {
        await mkdir(r.state, { mode: 0o700 }); await mkdir(r.run + '/rollback', { mode: 0o700 })
        await writeFile(r.run + '/rollback/nginx.before.conf', await bytes(r.nginx, 65536), { flag: 'wx', mode: 0o600 })
        await writeFile(r.run + '/rollback/unit.before.txt', service('cat') + '\n', { flag: 'wx', mode: 0o600 })
        for (const [file, data] of [['operator.mjs', Buffer.from(payload.runner, 'base64')], ['nginx.during.conf', nginx], ['override.conf', dropIn()]]) await writeFile(r.run + '/' + file, data, { flag: 'wx', mode: 0o600 })
        await record(r.run + '/relay-files.json', payload.files); await record(r.run + '/config.template.json', payload.template); await record(r.run + '/limits.json', payload.limits)
        await record(r.run + '/prepared.json', { observedAt: Date.now(), planSha256: process.env.DSH_PHASE76_LIVE, pairId: PLAN.pairId, codeReused: r.code, retainedPublicState: await retainedPublicState() })
      } catch (error) { await record(r.run + '/preparation-failed.json', { at: Date.now(), code: error.code ?? 'prepare-unknown', serviceChanged: false }); throw error }
    } else if (present) { await prepared(); await codeFiles(await json(r.run + '/relay-files.json')); await absent(r.run + '/relay-pair.json') }
    else await codeFiles(payload.files)
    result = { observedAt: Date.now(), pairUnused: true, phase76Prepared: mode === 'prepare' || present, originalServiceVerified: true, oldHistoryUnchanged: true, retainedPublicStatePinned: mode === 'prepare' || present }
  } else if (mode === 'restore') {
    await prepared(); result = await restoreMaintenance(adapter())
    await record(r.run + '/restore-' + Date.now() + '.json', { observedAt: Date.now(), ...result })
    if (!result.restored) deny('restore-outcome-unknown')
  } else {
    await prepared(); await originalFiles(); await codeFiles(await json(r.run + '/relay-files.json')); await unusedPair()
    if (mode === 'stage-pair') {
      const pair = reviewPair(payload, Date.now()); await absent(r.run + '/relay-pair.json'); await absent(r.config)
      await record(r.run + '/relay-pair.json', pair)
      const args = [r.code + '/public-tools/prepare-public-config.mjs', '--config', r.run + '/config.template.json', '--pair', r.run + '/relay-pair.json', '--state', r.journal, '--output', r.config, '--limits', r.run + '/limits.json']
      run('/usr/bin/node', args); assert.deepEqual(await json(r.config), relayConfig(await json(r.run + '/config.template.json'), pair)); result = { staged: true, serviceChanged: false }
    } else if (mode === 'initialize') {
      assert.ok(process.stdin.isTTY && process.stdout.isTTY); await absent(r.run + '/initialize-attempt.json')
      for (const file of [r.journal, r.journal + '.head', r.journal + '.lock']) await absent(file)
      reviewPair(await json(r.run + '/relay-pair.json'), Date.now()); await record(r.run + '/initialize-attempt.json', { at: Date.now(), outcome: 'unknown' })
      run('/usr/bin/node', [r.code + '/public-tools/initialize-public-trust.mjs', '--config', r.config, '--pair', r.run + '/relay-pair.json', '--limits', r.run + '/limits.json'], { stdio: 'inherit', timeout: 60000 })
      await absent(r.journal + '.lock')
      result = await acknowledgePublicState({ read: bytes, record }, r.journal, r.run + '/initialize-result.json', Date.now())
    } else {
      result = await activateMaintenance(adapter()); await record(r.run + '/activation-result.json', { observedAt: Date.now(), ...result })
      if (!result.activated) deny(result.cleanup.restored ? 'activation-failed-restored' : 'activation-and-cleanup-unknown')
    }
  }
  process.stdout.write(JSON.stringify({ mode, ...result }) + '\n'); return result
}
