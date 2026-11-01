import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { prepareProjectionInputs } from '../scripts/projection-inputs.mjs'

const rich = 'packages/experimental/rich-inline/src'
async function fixture() {
  const world = await mkdtemp(new URL('../.build/projection-test-', import.meta.url)), root = join(world, 'current'), retained = join(world, 'retained')
  for (const directory of [root, retained]) {
    await mkdir(join(directory, rich, 'shared'), { recursive: true })
    await mkdir(join(directory, rich, 'client'), { recursive: true })
    for (const file of ['message-projections.ts', 'source-projection.ts', 'tool-source-projection.ts', 'types.ts', 'validate.ts', 'authored.ts', 'limits.ts', 'usage.ts']) await writeFile(join(directory, rich, 'shared', file), file + '\n')
    await writeFile(join(directory, rich, 'client/guest-sdk.ts'), directory === root ? 'current SDK\n' : 'retained SDK\n')
  }
  return { world, root, retained, spec: { checkout: retained, entry: rich + '/shared/message-projections.ts' } }
}
test('generated interpreters reuse current shared bytes while retaining both original trees', async () => {
  const f = await fixture(), prepared = await prepareProjectionInputs(f.world, f.root, f.spec)
  assert.equal(await readFile(join(prepared.directory, 'client/guest-sdk.ts'), 'utf8'), 'current SDK\n')
  assert.equal(await readFile(join(f.retained, rich, 'client/guest-sdk.ts'), 'utf8'), 'retained SDK\n')
  assert.deepEqual(await prepareProjectionInputs(f.world, f.root, f.spec), prepared)
  assert.equal(JSON.parse(await readFile(prepared.manifest, 'utf8')).files.length, 9)
})
test('a changed interpreter dependency still refuses before generating a mixed snapshot', async () => {
  const f = await fixture()
  await writeFile(join(f.root, rich, 'shared/types.ts'), 'incompatible types\n')
  await assert.rejects(prepareProjectionInputs(f.world, f.root, f.spec), /Retained projection dependency differs/)
})
test('a modified generated file is rejected without overwriting it', async () => {
  const f = await fixture(), prepared = await prepareProjectionInputs(f.world, f.root, f.spec), file = join(prepared.directory, 'client/guest-sdk.ts')
  await writeFile(file, 'unexpected modification\n')
  await assert.rejects(prepareProjectionInputs(f.world, f.root, f.spec), /Generated projection input changed/)
  assert.equal(await readFile(file, 'utf8'), 'unexpected modification\n')
})
test('independent processes publish the same complete snapshot', async t => {
  const f = await fixture(), children = [], completions = []
  t.after(async () => { for (const child of children) if (child.exitCode === null) child.kill(); await Promise.allSettled(completions) })
  const source = 'import {prepareProjectionInputs} from ' + JSON.stringify(new URL('../scripts/projection-inputs.mjs', import.meta.url).href) + ';const result=await prepareProjectionInputs(...JSON.parse(process.argv[1]));console.log(result.manifest)'
  const run = () => {
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, JSON.stringify([f.world, f.root, f.spec])], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child)
    let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes })
    const completion = new Promise((accept, reject) => { child.once('error', reject); child.once('close', code => { try { assert.equal(code, 0, log); accept(log.trim()) } catch (error) { reject(error) } }) }); completions.push(completion); return completion
  }
  const paths = await Promise.all([run(), run()]); assert.equal(paths[0], paths[1]); assert.equal(JSON.parse(await readFile(paths[0], 'utf8')).files.length, 9)
})
