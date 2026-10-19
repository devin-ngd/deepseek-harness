/** Sealed operator entry. No live operation runs without a separately recorded human approval and a local TTY decision. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { spawn } from 'node:child_process'
import { PLAN, hash, reviewDesktop, reviewPhoneState, reviewPrevious, reviewApprovalRecord } from './policy.mjs'
import { json, bytes, record, absent, newDirectory, run, verifyPinnedFile } from './io.mjs'
import { desktopState, checkDesktopClosure, prepareField, startInputs, collectExchange, relayReady, restoreField, fieldLaunchArguments } from './local.mjs'
import { stagePairInput } from './payload.mjs'
import { cleanupField } from './cleanup.mjs'
const directory = dirname(fileURLToPath(import.meta.url)), location = await json(join(directory, 'location.json'))
/** @returns after checking every sealed operator file and both unchanged native deliverables; performs no private/phone/remote IO. */
export async function verifyPackage() {
  for (const row of await json(join(directory, 'files.sha256.json'), 1048576)) await verifyPinnedFile(join(directory, row.file), row, 33554432)
  assert.equal(hash(await bytes(PLAN.native.hap, 33554432)), PLAN.native.sha256)
  assert.equal(hash(await bytes(PLAN.native.zip, 33554432)), PLAN.native.zipSha256)
  await checkDesktopClosure(location)
  return { verified: true, planSha256: hash(await bytes(join(directory, 'plan.json'), 65536)), manifestSha256: hash(await bytes(join(directory, 'files.sha256.json'), 1048576)), liveOperations: 0 }
}
async function approval(command, path) {
  assert.ok(path); assert.equal(process.platform, 'win32'); assert.ok(process.stdin.isTTY && process.stdout.isTTY)
  const approved = await json(path), verified = await verifyPackage()
  reviewApprovalRecord(approved, verified.planSha256, verified.manifestSha256)
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  try { assert.equal(await terminal.question('Requires the verified human approval above. Type EXECUTE PHASE75 ' + command + ': '), 'EXECUTE PHASE75 ' + command) } finally { terminal.close() }
  return approved
}
async function relay(mode, publicPair) {
  const executable = 'C:/Program Files/OpenSSH/ssh.exe', packageSource = await bytes(join(directory, 'relay-runner.mjs'), 4194304)
  const planHash = hash(await bytes(join(directory, 'plan.json'), 65536)), prefix = 'DSH_PHASE75_LIVE=' + planHash + ' /usr/bin/node '
  const remoteRunner = Buffer.concat([packageSource, Buffer.from('\nif (process.argv[1] && import.meta.url === "file://" + process.argv[1]) await relayMain(process.argv[2])\n')])
  let command, input, payload
  if (mode === 'probe' || mode === 'prepare') {
    payload = { files: await json(join(directory, 'relay-files.json')), template: await json(join(directory, 'config.template.json')), limits: await json(join(directory, 'limits.json')), nginx: (await bytes(join(directory, 'nginx.during.conf'), 65536)).toString('base64'), runner: remoteRunner.toString('base64') }
    input = Buffer.concat([packageSource, Buffer.from('\nawait relayMain(' + JSON.stringify(mode) + ',' + JSON.stringify(payload) + ')\n')]); command = prefix + '--input-type=module -'
  } else if (mode === 'stage-pair') {
    command = prefix + '--input-type=module -'
    input = stagePairInput(publicPair, Date.now())
  } else command = prefix + PLAN.relay.run + '/operator.mjs ' + mode
  if (!['probe', 'prepare'].includes(mode)) command = 'test "$(sha256sum ' + PLAN.relay.run + '/operator.mjs | cut -d " " -f1)" = ' + hash(remoteRunner) + ' && ' + command
  const args = [...(mode === 'initialize' ? ['-tt'] : []), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', PLAN.relay.sshAlias, command]
  const output = run(executable, args, mode === 'initialize' ? { stdio: 'inherit', timeout: 60000 } : { input, timeout: 60000 })
  const result = mode === 'initialize' ? { mode, completed: true, observedAt: Date.now() } : JSON.parse(output.trim().split(/\r?\n/).at(-1))
  await record(join(PLAN.local.run, 'relay-' + mode + '-' + Date.now() + '.json'), result); return result
}
/** @param argv - closed command, approval record, selected public inputs. @returns operation result; approval files record human decisions but do not create them. */
export async function main(argv) {
  const [command, approvalPath, ...args] = argv
  if (command === 'verify') { assert.equal(argv.length, 1); return verifyPackage() }
  assert.ok(['init-run', 'record-phone-read', 'desktop-inspect', 'desktop-final', 'relay-probe', 'relay-prepare', 'prepare-field', 'start-field', 'collect', 'relay-stage', 'relay-initialize', 'relay-activate', 'relay-restore', 'restore-field', 'sign', 'verify-sign', 'install', 'launch', 'launch-existing', 'native-ui'].includes(command))
  const approved = await approval(command, approvalPath), p = PLAN.local
  if (command === 'init-run') { await newDirectory(p.run); await record(join(p.run, 'operation.json'), { at: Date.now(), pairId: PLAN.pairId, planSha256: approved.planSha256, sourceHumanMessageId: approved.sourceHumanMessageId }); return { initialized: true } }
  const operation = await json(join(p.run, 'operation.json')); assert.equal(operation.planSha256, approved.planSha256)
  if (command === 'native-ui') { assert.ok(args.length === 1 || args.length === 2); if (['input-pair','compare-pair','confirm-pair','connect'].includes(args[0])) await relayReady(location); const { nativeUI } = await import('./device.mjs'); return nativeUI(args[0], args[1], directory, approved) }
  if (command === 'record-phone-read') {
    assert.equal(args.length, 2); const raw = (await bytes(args[0], 32768)).toString('utf8'), observed = await json(args[1])
    reviewPhoneState(observed, Date.now()); assert.equal(observed.documentSha256, hash(raw)); await reviewPrevious(raw, await desktopState(location), Date.now(), (await bytes(PLAN.local.retainedPublicPath, 32768)).toString('utf8'))
    const path = join(p.run, 'phone-read-' + Date.now() + '.json'); await record(path, { ...observed, documentPath: resolve(args[0]) }); return { reviewed: true, receipt: path }
  }
  if (command === 'desktop-inspect') { const state = await desktopState(location); reviewDesktop(state, PLAN.epochs.before, Date.now()); await record(join(p.run, 'desktop-' + Date.now() + '.json'), state); return { observedAt: state.observedAt, epoch: PLAN.epochs.before, active: 0 } }
  if (command === 'desktop-final') { const state = await desktopState(location), epoch = state.grants[0]?.epoch; assert.ok(epoch === PLAN.epochs.before || epoch === PLAN.epochs.after); reviewDesktop(state, epoch, Date.now()); await record(join(p.run, 'desktop-final-' + Date.now() + '.json'), state); return { observedAt: state.observedAt, epoch, active: 0, resourcesClosedNotInferred: true } }
  if (command === 'relay-probe' || command === 'relay-prepare') return relay(command.slice(6))
  if (command === 'prepare-field') return prepareField(location, args)
  if (command === 'start-field') {
    assert.equal(args.length, 0); const checked = await startInputs(location), startedAt = Date.now()
    await record(join(p.run, 'start-attempt.json'), { at: startedAt, ...checked, outcome: 'unknown', onceOnly: true })
    const child = spawn(process.execPath, fieldLaunchArguments(checked.app), { windowsHide: true, stdio: 'inherit' })
    await record(join(p.run, 'process.json'), { at: startedAt, pid: child.pid ?? null, ownedInvocationOnly: true })
    const exit = await new Promise(accept => { child.once('error', error => accept({ code: null, signal: null, error: error.code })); child.once('close', (code, signal) => accept({ code, signal, error: null })) })
    await record(join(p.run, 'exit.json'), { startedAt, finishedAt: Date.now(), ...exit })
    const { cleanup, relayCleanup } = await cleanupField(() => restoreField(location), () => relay('restore'))
    const result = { ...exit, cleanup, relayCleanup }; await record(join(p.run, 'final-cleanup.json'), result)
    if (exit.code !== 0 || !cleanup.originalPublicConfigRestored || !relayCleanup.restored) process.exitCode = 1; return result
  }
  if (command === 'collect') { assert.equal(args.length, 1); return collectExchange(args[0]) }
  if (command === 'relay-stage') return relay('stage-pair', await relayReady(location))
  if (['relay-initialize', 'relay-activate'].includes(command)) await relayReady(location)
  if (['relay-initialize', 'relay-activate', 'relay-restore'].includes(command)) return relay(command.slice(6))
  if (command === 'restore-field') return restoreField(location)
  const { nativeOperation } = await import('./native.mjs'); return nativeOperation(command, directory, location, args)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(JSON.stringify({ refusedOrUnknown: true, code: error.code ?? 'review-failed', exitCode: error.exitCode ?? null, signal: error.signal ?? null, automaticRetryAllowed: false }) + '\n'); process.exitCode = 1 })
