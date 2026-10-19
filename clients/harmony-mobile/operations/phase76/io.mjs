/** Bounded regular-file IO and fixed argv execution for the reviewed operator. */
import { lstat, readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises'
import { dirname, resolve, parse, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { deny, hash } from './common.mjs'
/** @param path - explicitly selected path. @returns after rejecting every existing symlink ancestor. */
export async function noLinks(path) {
  let current = resolve(path)
  while (current !== parse(current).root) {
    try { if ((await lstat(current)).isSymbolicLink()) deny('symlink-denied') } catch (error) { if (error.code !== 'ENOENT') throw error }
    current = dirname(current)
  }
}
/** @param path - selected public file. @param limit - explicit byte ceiling. @returns bounded bytes from a regular file. */
export async function bytes(path, limit) {
  const data = await regularBytes(path, limit)
  if (data.length === 0) deny('public-file-empty')
  return data
}
async function regularBytes(path, limit) {
  await noLinks(path); const stat = await lstat(path)
  if (!stat.isFile() || stat.size > limit) deny('public-file-denied')
  const data = await readFile(path); if (data.length > limit) deny('public-file-capacity'); return data
}
/** @param path - one manifest-selected file. @param expected - pinned byte length and SHA-256. @param limit - explicit capacity. @returns after verifying all bytes; only this manifest operation admits an expected empty file. */
export async function verifyPinnedFile(path, expected, limit) {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes < 0 || !/^[a-f0-9]{64}$/.test(expected.sha256)) deny('invalid-file-manifest')
  const data = await regularBytes(path, limit)
  if (data.length !== expected.bytes || hash(data) !== expected.sha256) deny('manifest-file-mismatch')
}
/** @param path - selected public JSON. @param limit - explicit byte ceiling. @returns parsed public data. */
export async function json(path, limit = 65536) { return JSON.parse((await bytes(path, limit)).toString('utf8')) }
/** @param path - exact candidate path. @returns true only for an existing path, including a dangling symlink. */
export async function exists(path) { try { await lstat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
/** @param path - exact new path. @returns after refusing any prior operation state. */
export async function absent(path) { if (await exists(path)) deny('path-already-exists') }
/** @param path - new record. @param value - public evidence. @returns after exclusive write; ambiguous writes are retained. */
export async function record(path, value) { await noLinks(path); await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) }
/** @param path - one owned configuration. @param before - exact expected bytes. @param after - replacement bytes. @returns after checked same-directory replacement; external modifications stop the operation. */
export async function replace(path, before, after) {
  await noLinks(path); if (hash(await bytes(path, 65536)) !== hash(before)) deny('configuration-changed')
  const next = path + '.phase76-next'; await writeFile(next, after, { flag: 'wx', mode: 0o600 })
  if (hash(await bytes(path, 65536)) !== hash(before)) deny('configuration-changed')
  await rename(next, path); if (hash(await bytes(path, 65536)) !== hash(after)) deny('configuration-write-unknown')
}
/** @param command - fixed executable. @param args - separated argv. @param options - explicit spawn options. @returns bounded output after success, without projecting child diagnostics. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1048576, windowsHide: true, ...options })
  if (result.status !== 0 || result.error || result.signal) { const error = new Error('phase76 child failed or outcome unknown'); error.code = 'child-outcome-unknown'; error.exitCode = result.status; error.signal = result.signal; throw error }
  return result.stdout
}
/** @param directory - selected bounded tree. @param name - exact target filename. @returns matching regular-file paths, refusing symlinks and excessive traversal. */
export async function findFiles(directory, name) {
  const found = []; let count = 0
  async function visit(dir) { await noLinks(dir); for (const row of await readdir(dir, { withFileTypes: true })) { if (++count > 20000 || row.isSymbolicLink()) deny('tree-denied'); const path = join(dir, row.name); if (row.isDirectory()) await visit(path); else if (row.name === name) found.push(path) } }
  await visit(directory); return found
}
/** @param path - exclusive operation directory. @returns after creating only that directory. */
export async function newDirectory(path) { await noLinks(path); await mkdir(path, { mode: 0o700 }) }
