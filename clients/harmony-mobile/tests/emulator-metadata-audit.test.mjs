/** Metadata audits preserve license state and reject executable probes even with closed stdin. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, lstat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { auditEmulatorMetadata, parseEmulatorLicense } from '../scripts/emulator-metadata-audit.mjs'

const software = 'HarmonyOS_Software_Service_Agreement', sdk = 'HarmonyOS_SDK_Agreement'
const contents = value => `${software}:${value}\r\n${sdk}:${value}\r\n`
async function fixture(t, value = 'agree') {
  const world = await mkdtemp('D:/Temp/dsh-harmony-emulator-audit-test-')
  t.after(async () => {
    assert.ok(resolve(world).startsWith(resolve('D:/Temp') + '\\dsh-harmony-emulator-audit-test-'))
    assert.equal((await lstat(world)).isSymbolicLink(), false)
    await rm(world, { recursive: true })
  })
  const installed = join(world, 'installed'), license = join(world, 'explicit-license')
  await mkdir(join(installed, 'agreement'), { recursive: true })
  await writeFile(join(installed, 'sdk-pkg.json'), '{"version":"26.0.0.402"}\n')
  await writeFile(join(installed, 'emulator.json'), '[{"deviceType":"phone","api":26},{"deviceType":"tablet","api":"26.0.0"},{"deviceType":"phone_all","api":"26.0.0"}]\n')
  for (const name of ['HarmonyOS_SDK_Agreement.txt', 'HarmonyOS_Software_Service_Agreement.txt']) await writeFile(join(installed, 'agreement', name), 'Synthetic public agreement fixture.\n')
  await writeFile(join(installed, 'Emulator.exe'), 'This file must never be executed.\n')
  await writeFile(license, contents(value))
  return { world, installed, license, request: { installedDirectory: installed, licenseFile: license } }
}

test('accepted configuration remains byte-identical without any emulator command', async t => {
  const f = await fixture(t), before = await stat(f.license), bytes = await readFile(f.license)
  const result = await auditEmulatorMetadata(f.request)
  assert.equal(result.license.fields[software], 'agree')
  assert.equal(result.license.fields[sdk], 'agree')
  assert.deepEqual(result.phoneProfileApis, [26])
  assert.deepEqual(result.commands, [])
  assert.equal(result.emulatorExecutableInvocations, 0)
  assert.deepEqual(await readFile(f.license), bytes)
  assert.equal((await stat(f.license)).mtimeMs, before.mtimeMs)
})

test('disagree is reported without accepting or repairing the file', async t => {
  const f = await fixture(t, 'disagree'), before = await stat(f.license)
  const result = await auditEmulatorMetadata(f.request)
  assert.equal(result.license.fields[software], 'disagree')
  assert.equal(result.licenseFlagsWritten, false)
  assert.equal(result.acceptedNewAgreement, false)
  assert.equal(await readFile(f.license, 'utf8'), contents('disagree'))
  assert.equal((await stat(f.license)).mtimeMs, before.mtimeMs)
})

test('missing, duplicated and unsupported license values are never inferred as acceptance', () => {
  for (const text of ['', `${software}:agree\n`, contents('agree') + `${software}:agree\n`]) assert.throws(() => parseEmulatorLicense(text), error => error.code === 'license-field-count')
  assert.throws(() => parseEmulatorLicense(contents('yes')), error => error.code === 'license-field-value')
})

test('relative paths cannot silently select another user profile', async () => {
  await assert.rejects(auditEmulatorMetadata({ installedDirectory: 'relative', licenseFile: 'relative' }), error => error.code === 'absolute-path-required')
})

test('unavailable explicit license is unconfirmed rather than defaulted', async t => {
  const f = await fixture(t)
  await assert.rejects(auditEmulatorMetadata({ ...f.request, licenseFile: join(f.world, 'absent') }), error => error.code === 'license-unavailable')
})

test('unavailable public agreement stops the audit without changing the license', async t => {
  const f = await fixture(t), before = await readFile(f.license)
  await rm(join(f.installed, 'agreement/HarmonyOS_SDK_Agreement.txt'))
  await assert.rejects(auditEmulatorMetadata(f.request), error => error.code === 'agreement-unavailable')
  assert.deepEqual(await readFile(f.license), before)
})

test('invalid legacy phone API fails instead of being reported as a numeric API', async t => {
  const f = await fixture(t)
  await writeFile(join(f.installed, 'emulator.json'), '[{"deviceType":"phone","api":"26.0.0"}]\n')
  await assert.rejects(auditEmulatorMetadata(f.request), error => error.code === 'metadata-unavailable' && error.cause instanceof Error)
})

test('actual CLI completes with all subprocess APIs denied, closed stdin and a redirected LOCALAPPDATA', async t => {
  const f = await fixture(t), output = join(f.world, 'evidence'), guard = join(f.world, 'deny-processes.mjs')
  await mkdir(output)
  await writeFile(join(output, 'phase9-emulator-audit.json'), 'Historical evidence must remain unchanged.\n')
  await writeFile(guard, `import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[name]=()=>{throw Error('Subprocess invocation forbidden during read-only audit')};syncBuiltinESMExports();\n`)
  const before = await stat(f.license)
  const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, resolve('scripts/audit-native-emulator.mjs'), '--license-file', f.license, '--installed-directory', f.installed, '--output-directory', output], { env: { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: join(f.world, 'different-profile') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = '', timedOut = false
  child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 5000)
  const code = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done) }).finally(() => clearTimeout(timer))
  assert.equal(timedOut, false); assert.equal(code, 0, stderr)
  const result = JSON.parse(stdout)
  assert.equal(result.emulatorExecutableInvocations, 0)
  assert.equal(result.historicalEvidenceReplaced, false)
  assert.equal(await readFile(join(output, 'phase9-emulator-audit.json'), 'utf8'), 'Historical evidence must remain unchanged.\n')
  assert.equal(await readFile(f.license, 'utf8'), contents('agree'))
  assert.equal((await stat(f.license)).mtimeMs, before.mtimeMs)
})
