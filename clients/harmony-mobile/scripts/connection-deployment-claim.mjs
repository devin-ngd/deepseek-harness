/** Fixed-path exclusive claims for deployment actions that must never be replayed. Claims are permanent evidence. */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Claim schema; a differently shaped claim is never assumed compatible. */
export const CLAIM_SCHEMA = 'harmony-connection-deployment-claim/1'
/** Actions that consume a fixed claim before any external effect. */
export const CLAIMABLE_ACTIONS = Object.freeze(['sign', 'install', 'launch', 'input-alias', 'existing-identity'])

/**
 * @param {string} label - Attempt label.
 * @param {string} action - One-shot action.
 * @returns {string} Fixed claim file name for that attempt and action.
 */
export function claimFileName(label, action) {
  if (!CLAIMABLE_ACTIONS.includes(action)) throw new Error('claim action is not one-shot: ' + action)
  if (!/^connection-deployment-[A-Za-z0-9_-]+$/.test(label)) throw new Error('claim label is outside the owned prefix')
  return label + '-' + action + '.claim'
}

/**
 * Create the fixed claim with exclusive creation. The first process wins; a later process receives `claim-exists`
 * before it can touch the signer, HDC or the device. Existing claims are never removed, so crash recovery is read-only.
 * @param {object} options - Claim inputs.
 * @param {string} options.directory - Evidence directory that owns the claims.
 * @param {string} options.label - Attempt label.
 * @param {string} options.action - One-shot action.
 * @param {string} [options.at] - Claim time recorded for diagnosis.
 * @param {number} [options.pid] - Process that created the claim.
 * @returns {Promise<string>} Created claim path.
 */
export async function claimAction({ directory, label, action, at = new Date().toISOString(), pid = process.pid }) {
  if (typeof directory !== 'string' || directory.length === 0) throw new Error('claim directory is unavailable')
  const path = join(directory, claimFileName(label, action))
  await mkdir(directory, { recursive: true })
  const record = { schema: CLAIM_SCHEMA, label, action, at, pid }
  try {
    await writeFile(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
  } catch (error) {
    if (error.code === 'EEXIST') throw withCode(new Error('the ' + action + ' claim already exists; it was started earlier or its process stopped, so inspect retained evidence instead of repeating it'), 'claim-exists')
    throw error
  }
  return path
}

/**
 * @param {string} directory - Evidence directory that owns the claims.
 * @param {string} label - Attempt label.
 * @returns {Promise<Set<string>>} Actions whose claim file exists. Read-only.
 */
export async function claimedActions(directory, label) {
  const names = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  const prefix = label + '-', suffix = '.claim'
  const actions = new Set()
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue
    actions.add(name.slice(prefix.length, name.length - suffix.length))
  }
  return actions
}

/** @param {Error} error - Failure. @param {string} code - Machine category. @returns {Error} The same error with a code. */
function withCode(error, code) { return Object.assign(error, { code }) }
