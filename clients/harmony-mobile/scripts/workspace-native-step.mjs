/** Task-owned native UITest steps; each action is selected from the isolated application's current layout. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const active = JSON.parse(await readFile('evidence/workspace-emulator-active.json', 'utf8'))
const bundle = 'local.dsh.mobile.workspacecheck'
assert.equal(active.app, bundle)
const project = JSON.parse(await readFile('evidence/workspace-native-review-project.json', 'utf8'))
const platform = JSON.parse(await readFile(join(project.target, 'platform.json'), 'utf8'))
const executable = join(platform.installedIdeDirectory, 'sdk/default/openharmony/toolchains/hdc.exe')
const directory = join(active.world, 'native-steps'); await mkdir(directory, { recursive: true })
const stamp = Date.now(), commands = []
function hdc(args) {
  const result = spawnSync(executable, ['-p', '-s', '127.0.0.1:8710', '-t', '127.0.0.1:5555', ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, HDC_SERVER_PORT: '8710' } })
  commands.push({ args, code: result.status, signal: result.signal, error: result.error?.message })
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined)
  assert.doesNotMatch(result.stdout + result.stderr, /\[Fail\]|\[Error\]/i)
}
function rows(node, result = []) { if (node.attributes) result.push(node.attributes); for (const child of node.children ?? []) rows(child, result); return result }
function bounds(node) { const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(node.bounds); assert.ok(match); return match.slice(1).map(Number) }
function visible(node) { const [left, top, right, bottom] = bounds(node); return node.visible === 'true' && node.enabled !== 'false' && left >= 0 && top >= 0 && right > left && bottom > top }
async function snapshot(suffix) {
  const remote = '/data/local/tmp/dsh-workspace-step-' + stamp + '-' + suffix + '.json', path = join(directory, stamp + '-' + suffix + '.json')
  hdc(['shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote]); hdc(['file', 'recv', remote, path])
  const result = rows(JSON.parse(await readFile(path, 'utf8')))
  assert.ok(result.some(row => row.bundleName === bundle)); assert.ok(result.every(row => !row.bundleName || row.bundleName === bundle))
  return result
}
const before = await snapshot('before'), [action = 'snapshot', target, value] = process.argv.slice(2)
function unique(test) { const matches = before.filter(row => visible(row) && test(row)); assert.equal(matches.length, 1, 'Exactly one visible owned target is required'); return matches[0] }
function click(node) { const [left, top, right, bottom] = bounds(node); hdc(['shell', 'uitest', 'uiInput', 'click', String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))]) }
if (action === 'click') click(unique(row => row.text === target && (value === undefined || row.type === value)))
else if (action === 'click-id') click(unique(row => row.id === target))
else if (action === 'input') {
  click(unique(row => row.type === 'textField' && row.hint === target))
  assert.ok(value !== undefined)
  hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017']); hdc(['shell', 'uitest', 'uiInput', 'text', value])
} else if (action === 'scroll') {
  assert.ok(target === 'older' || target === 'newer')
  const [left, top, right, bottom] = bounds(unique(row => row.type === 'Web')), x = String(Math.floor(left + (right - left) * .72))
  const from = String(Math.floor(top + (bottom - top) * (target === 'older' ? .25 : .75))), to = String(Math.floor(top + (bottom - top) * (target === 'older' ? .75 : .25)))
  hdc(['shell', 'uitest', 'uiInput', 'swipe', x, from, x, to, '2400'])
} else assert.equal(action, 'snapshot')
const after = action === 'snapshot' ? before : await snapshot('after')
await appendFile(join(directory, 'actions.jsonl'), JSON.stringify({ stamp, action, target, value, commands }) + '\n')
console.log(JSON.stringify({ directory, rows: after.filter(row => visible(row) && (row.text || row.hint)).map(({ type, id, text, hint, bounds }) => ({ type, id, text: text?.slice(0, 600), hint, bounds })) }, null, 2))
