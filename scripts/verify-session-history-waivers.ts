/** Prevent new suppressed synchronous Session-history reads. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { isLocalGeneratedArtifact } from './local-generated-artifacts.ts'

const root = resolve(import.meta.dirname, '..')
const baselineFile = 'scripts/session-history-waivers.baseline.json'
const names = new Set(['eventAt', 'snapshotEvents', 'ownEvents'])
type Baseline = Record<string, Record<string, number>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A suppressed call to a deprecated synchronous history reader. */
export interface HistoryWaiver {
  /** Repository-relative source path. */
  file: string
  /** One-based call line. */
  line: number
  /** Hash of the call's syntax tokens. */
  fingerprint: string
}

function fingerprint(node: ts.Node, source: ts.SourceFile): string {
  const tokens: string[] = []
  const visit = (child: ts.Node): void => {
    if (ts.isJSDoc(child)) return
    if (ts.isToken(child)) tokens.push(child.getText(source))
    else child.getChildren(source).forEach(visit)
  }
  visit(node)
  return createHash('sha256').update(JSON.stringify(tokens)).digest('hex')
}

/**
 * Find history-reader calls suppressed by line or block deprecation directives.
 * @param file - Repository-relative path used for diagnostics.
 * @param text - Source file contents.
 * @returns Suppressed calls in source order, with formatting-independent fingerprints.
 */
export function findHistoryWaivers(file: string, text: string): HistoryWaiver[] {
  const normalized = file.replaceAll('\\', '/')
  const source = ts.createSourceFile(normalized, text, ts.ScriptTarget.Latest, true)
  const lines = text.split(/\r?\n/u)
  const disabled = new Set<number>()
  let block = false
  for (const [index, line] of lines.entries()) {
    const directive = /^\s*(?:\/\/|\/\*)\s*oxlint-(disable-next-line|disable-line|disable|enable)\b([^\r\n]*)/u.exec(line)
      ?? /(?:\/\/|\/\*)\s*oxlint-(disable-line)\b([^\r\n]*)/u.exec(line)
    if (directive !== null) {
      const rules = (directive[2] ?? '').split('--', 1)[0]?.replace(/\*\/$/u, '').trim() ?? ''
      if (rules === '' || /(?:^|[\s,])(?:typescript\/)?no-deprecated(?:$|[\s,])/u.test(rules)) {
        if (directive[1] === 'disable-next-line') disabled.add(index + 1)
        else if (directive[1] === 'disable-line') disabled.add(index)
        else if (directive[1] === 'disable') block = true
        else block = false
      }
    }
    if (block) disabled.add(index)
  }
  const calls: HistoryWaiver[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = ts.isPropertyAccessExpression(node) ? node.name.text
        : ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)
          ? node.argumentExpression.text : undefined
      const position = ts.isPropertyAccessExpression(node) ? node.name.getStart(source) : node.argumentExpression.getStart(source)
      const line = source.getLineAndCharacterOfPosition(position).line
      if (name !== undefined && names.has(name) && disabled.has(line)) {
        const subject = ts.isCallExpression(node.parent) && node.parent.expression === node ? node.parent : node
        calls.push({ file: normalized, line: line + 1, fingerprint: fingerprint(subject, source) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return calls
}

function productionSource(file: string): boolean {
  return /^(?:packages|apps|scripts)\//u.test(file) && /\.[cm]?[jt]sx?$/u.test(file)
    && !/(?:^|\/)(?:tests?|__tests__)\//u.test(file) && !/\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(file)
    && !isLocalGeneratedArtifact(file)
}

/**
 * Discover suppressed legacy reads in tracked and nonignored new production source.
 * @param repoRoot - Repository root containing the Git index.
 * @returns All current suppressed legacy reads.
 */
export function scanHistoryWaivers(repoRoot: string): HistoryWaiver[] {
  const files = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  }).split('\0').filter(productionSource))
  return [...files].sort().flatMap((file) => {
    const path = resolve(repoRoot, file)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (stat?.isSymbolicLink()) throw new Error(`verify-session-history-waivers: unsupported source symlink: ${file}`)
    return stat?.isFile() === true ? findHistoryWaivers(file, readFileSync(path, 'utf8')) : []
  })
}

/**
 * Count exact legacy calls without a file-wide allowance.
 * @param calls - Suppressed calls found in production source.
 * @returns Stable per-file and per-fingerprint counts.
 */
export function countHistoryWaivers(calls: readonly HistoryWaiver[]): Baseline {
  const counts: Baseline = {}
  for (const call of calls) {
    const file = counts[call.file] ??= {}
    file[call.fingerprint] = (file[call.fingerprint] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
    .map(([file, entries]) => [file, Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)))]))
}

/**
 * Reject new waivers and optionally remove retired entries.
 * @param repoRoot - Repository root containing source and the baseline.
 * @param prune - Remove stale entries only if no new call is present.
 * @returns Number of suppressed calls still present.
 */
export function verifyHistoryWaivers(repoRoot: string, prune = false): number {
  const parsed: unknown = JSON.parse(readFileSync(resolve(repoRoot, baselineFile), 'utf8'))
  if (!isRecord(parsed)) throw new Error('invalid history waiver baseline')
  const baseline: Baseline = {}
  for (const [file, entries] of Object.entries(parsed)) {
    if (!productionSource(file) || file.split('/').includes('..') || !isRecord(entries) || Object.keys(entries).length === 0) {
      throw new Error(`invalid history waiver baseline: ${file}`)
    }
    const counts: Record<string, number> = {}
    for (const [hash, count] of Object.entries(entries)) {
      if (!/^[a-f0-9]{64}$/u.test(hash) || typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) {
        throw new Error(`invalid history waiver baseline: ${file}:${hash}`)
      }
      counts[hash] = count
    }
    baseline[file] = counts
  }
  const calls = scanHistoryWaivers(repoRoot)
  const remaining = structuredClone(baseline)
  const added: HistoryWaiver[] = []
  for (const call of calls) {
    const file = remaining[call.file]
    const allowance = file?.[call.fingerprint] ?? 0
    if (file !== undefined && allowance > 0) file[call.fingerprint] = allowance - 1
    else added.push(call)
  }
  if (added.length > 0) throw new Error('verify-session-history-waivers: new suppressed synchronous history reads are forbidden:\n'
    + added.map(call => `  ${call.file}:${String(call.line)}`).join('\n'))
  const stale = Object.entries(remaining).flatMap(([file, entries]) => Object.entries(entries)
    .filter(([, count]) => count > 0).map(([hash]) => `  ${file} (${hash})`))
  if (stale.length > 0) {
    if (!prune) throw new Error('verify-session-history-waivers: remove retired entries with --prune:\n' + stale.join('\n'))
    writeFileSync(resolve(repoRoot, baselineFile), `${JSON.stringify(countHistoryWaivers(calls), null, 2)}\n`)
  }
  return calls.length
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) {
  try {
    const args = process.argv.slice(2)
    if (args.length > 1 || (args.length === 1 && args[0] !== '--prune')) throw new Error('Usage: verify-session-history-waivers [--prune]')
    console.log(`verify-session-history-waivers: ${String(verifyHistoryWaivers(root, args[0] === '--prune'))} existing calls remain.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
