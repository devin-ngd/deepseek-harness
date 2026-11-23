import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countHistoryWaivers, findHistoryWaivers, scanHistoryWaivers, verifyHistoryWaivers } from './verify-session-history-waivers.ts'

const source = 'packages/example/src/index.ts'
const baseline = 'scripts/session-history-waivers.baseline.json'
const waiver = '// oxlint-disable-next-line typescript/no-deprecated -- existing read\nsession.snapshotEvents()\n'

function write(root: string, file: string, text: string): void {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

describe('suppressed Session history reads', () => {
  it.each([
    ['next line', '// oxlint-disable-next-line typescript/no-deprecated\nsession.eventAt(seq)'],
    ['combined rules', '// oxlint-disable-next-line typescript/no-non-null-assertion, typescript/no-deprecated\nsession.eventAt(seq)!'],
    ['same line', 'session.snapshotEvents() // oxlint-disable-line typescript/no-deprecated'],
    ['block', '/* oxlint-disable typescript/no-deprecated */\nsession.ownEvents()\n/* oxlint-enable typescript/no-deprecated */'],
    ['all rules', '/* oxlint-disable */\nsession.snapshotEvents()\n/* oxlint-enable */'],
    ['computed name', '// oxlint-disable-next-line typescript/no-deprecated\nsession["eventAt"](seq)'],
    ['template member', '// oxlint-disable-next-line typescript/no-deprecated\nsession[`eventAt`](seq)'],
    ['multiline member', 'session\n// oxlint-disable-next-line typescript/no-deprecated\n.snapshotEvents()'],
    ['method reference', '// oxlint-disable-next-line typescript/no-deprecated\nconst read = session.snapshotEvents'],
  ])('detects %s', (_label, text) => {
    expect(findHistoryWaivers(source, text)).toHaveLength(1)
  })

  it('does not treat unwaived calls, unrelated directives or text as waived reads', () => {
    expect(findHistoryWaivers(source, [
      'session.snapshotEvents()',
      '// oxlint-disable-next-line no-console',
      'session.eventAt(seq)',
      '// oxlint-disable-next-line typescript/no-deprecated',
      'other.oldMethod()',
      'const text = "session.ownEvents()"',
      'const example = "// oxlint-disable-next-line typescript/no-deprecated"',
      'session.snapshotEvents()',
    ].join('\n'))).toEqual([])
  })

  it('keeps the fingerprint through formatting but distinguishes changed calls', () => {
    const original = findHistoryWaivers(source, waiver)[0]
    const formatted = findHistoryWaivers(source, '// oxlint-disable-next-line typescript/no-deprecated\nsession.snapshotEvents( /* none */ )\n')[0]
    const changed = findHistoryWaivers(source, waiver.replace('snapshotEvents()', 'snapshotEvents(offset)'))[0]
    expect(formatted?.fingerprint).toBe(original?.fingerprint)
    expect(changed?.fingerprint).not.toBe(original?.fingerprint)
  })

  it('rejects added or copied waivers and prunes only retired entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-history-waivers-'))
    try {
      execFileSync('git', ['init', '--quiet', root])
      write(root, source, waiver)
      write(root, 'packages/example/tests/history.spec.ts', waiver)
      write(root, baseline, `${JSON.stringify(countHistoryWaivers(scanHistoryWaivers(root)))}\n`)
      expect(verifyHistoryWaivers(root)).toBe(1)
      write(root, source, waiver + waiver)
      expect(() => verifyHistoryWaivers(root, true)).toThrow('new suppressed synchronous history reads')
      write(root, source, 'export {}\n')
      expect(() => verifyHistoryWaivers(root)).toThrow('remove retired entries')
      expect(verifyHistoryWaivers(root, true)).toBe(0)
      expect(JSON.parse(readFileSync(join(root, baseline), 'utf8'))).toEqual({})
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  })
})
