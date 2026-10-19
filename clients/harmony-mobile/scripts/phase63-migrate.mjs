/** Extract browser-safe interpreters from the exact alpha.4 Host sources in an isolated clone. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const project = resolve(import.meta.dirname, '..'), checkout = 'D:/Temp/dsh-harmony-alpha4-source-20261016', rich = join(checkout, 'packages/experimental/rich-inline/src')
const backup = 'D:/Temp/dsh-harmony-alpha4-phase63-preimages'
await mkdir(backup, { recursive: true })
const records = []
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function replace(path, transform) {
  const before = await readFile(path, 'utf8'), after = transform(before)
  if (before === after) throw new Error('Expected migration: ' + path)
  await writeFile(join(backup, records.length + '.txt'), before, { flag: 'wx' })
  records.push({ path, before: hash(before), after: hash(after) }); await writeFile(path, after)
}
const source = await readFile(join(rich, 'host/source.ts'), 'utf8'), tool = await readFile(join(rich, 'host/tool-source.ts'), 'utf8')
const start = source.indexOf('/** Immutable source selection;'), stop = source.indexOf('\n/**', source.indexOf('export const richSourceProjection'))
if (start < 0 || stop < start) throw new Error('Current source projection declarations missing')
let pure = source.slice(start, stop)
pure = pure.replace(/function hash\(source: string\): string \{[^\n]+\}\n/, '')
pure = pure.replace('const decisionSchema =', 'export const richSourceDecisionSchema =').replaceAll('decisionSchema.parse(', 'richSourceDecisionSchema.parse(')
pure = pure.replace('function reference(message: AssistantMessage, partIndex: number, start: number, sourceHash: string): RichSourceRef {', 'export function richSourceReference(message: AssistantMessage, partIndex: number, start: number, sourceHash: string, hash: RichSourceDigest): RichSourceRef {')
pure = pure.replace('function selected(event: SessionEvent | undefined, target: RichSourceTarget): AuthoredContent {', 'export function selectRichSource(event: SessionEvent | undefined, target: RichSourceTarget, hash: RichSourceDigest): AuthoredContent {')
pure = pure.replace('reference(event.data.message, target.partIndex, target.start, target.sourceHash)', 'richSourceReference(event.data.message, target.partIndex, target.start, target.sourceHash, hash)').replace('selected(original, target)', 'selectRichSource(original, target, hash)')
pure = pure.replace("export const richSourceProjection: SessionMessageProjection<'rich-inline/source-offload'> = {", "/** @param hash - synchronous UTF-8 SHA-256. @returns validated interpreter; originals remain immutable. */\nexport function createRichSourceProjection(hash: RichSourceDigest): SessionMessageProjection<'rich-inline/source-offload'> { return {") + '\n}\n'
const sourceHeader = `/** Pure alpha.4 authored-source selection and projection; digest implementations supply no Host access. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'
import type { AssistantMessage, Message } from '@deepseek-ai/dsh-llm'
import { authoredBlockId, authoredContent, authoredFences } from './authored.ts'
import type { AuthoredContent } from './authored.ts'
import type { RichBlockId } from './types.ts'
/** SHA-256 of UTF-8 source, returned as lowercase hexadecimal. */
export type RichSourceDigest = (source: string) => string
`
await writeFile(join(rich, 'shared/source-projection.ts'), sourceHeader + pure, { flag: 'wx' })
await replace(join(rich, 'host/source.ts'), text => {
  const imports = `import { createRichSourceProjection, richSourceDecisionSchema as decisionSchema, richSourceReference, selectRichSource } from '../shared/source-projection.ts'
import type { RichSourceRef, RichSourceTarget } from '../shared/source-projection.ts'
export type { RichSourceRef, RichSourceTarget } from '../shared/source-projection.ts'
function hash(source: string): string { return createHash('sha256').update(source).digest('hex') }
function reference(message: AssistantMessage, partIndex: number, start: number, sourceHash: string): RichSourceRef { return richSourceReference(message, partIndex, start, sourceHash, hash) }
function selected(event: SessionEvent | undefined, target: RichSourceTarget): AuthoredContent { return selectRichSource(event, target, hash) }
/** Host interpreter uses the same validated selection as browser readers. */
export const richSourceProjection = createRichSourceProjection(hash)
`
  return (text.slice(0, start) + imports + text.slice(stop)).replace("import { z } from 'zod'\n", '').replace("import { brandString } from '@deepseek-ai/dsh-brand'\n", '').replace("import type { Branded } from '@deepseek-ai/dsh-brand'\n", '').replace("import { SessionSeq } from '@deepseek-ai/dsh-session'\n", '').replace("import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'\n", '').replace('AssistantMessage, Message', 'AssistantMessage')
})
const toolStart = tool.indexOf('const index ='), toolStop = tool.indexOf('\n/**', tool.indexOf('export const richToolSourceProjection'))
if (toolStart < 0 || toolStop < toolStart) throw new Error('Current tool projection declarations missing')
let pureTool = tool.slice(toolStart, toolStop)
pureTool = pureTool.replace(/function hash\(text: string\): string \{[^\n]+\}\n/, '').replace('const decisionSchema =', 'export const richToolDecisionSchema =').replaceAll('decisionSchema.parse(', 'richToolDecisionSchema.parse(')
pureTool = pureTool.replace("function reference(target: Omit<RichToolSourceTarget, 'sourceRef'>): RichSourceRef {", "export function richToolSourceReference(target: Omit<RichToolSourceTarget, 'sourceRef'>, hash: RichSourceDigest): RichSourceRef {")
pureTool = pureTool.replace('function selected(events: readonly SessionEvent[], target: RichToolSourceTarget) {', 'export function selectRichToolSource(events: readonly SessionEvent[], target: RichToolSourceTarget, hash: RichSourceDigest) {').replace('reference(identity)', 'richToolSourceReference(identity, hash)').replace('selected(context.events.filter(item => item.seq < event.seq), target)', 'selectRichToolSource(context.events.filter(item => item.seq < event.seq), target, hash)')
pureTool = pureTool.replace("export const richToolSourceProjection: SessionMessageProjection<'rich-inline/tool-offload'> = {", "/** @param hash - synchronous UTF-8 SHA-256. @returns interpreter requiring the original successful tool settlement. */\nexport function createRichToolSourceProjection(hash: RichSourceDigest): SessionMessageProjection<'rich-inline/tool-offload'> { return {") + '\n}\n'
const toolHeader = `/** Pure alpha.4 tool-source selection and projection; no Node or host bridge imports. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { RichBlockId } from './types.ts'
import type { RichSourceRef, RichSourceDigest } from './source-projection.ts'
`
await writeFile(join(rich, 'shared/tool-source-projection.ts'), toolHeader + pureTool, { flag: 'wx' })
await replace(join(rich, 'host/tool-source.ts'), text => {
  const imports = `import { createRichToolSourceProjection, richToolSourceReference, selectRichToolSource } from '../shared/tool-source-projection.ts'
import type { RichToolSourceTarget } from '../shared/tool-source-projection.ts'
export type { RichToolSourceTarget } from '../shared/tool-source-projection.ts'
function hash(text: string): string { return createHash('sha256').update(text).digest('hex') }
function reference(target: Omit<RichToolSourceTarget, 'sourceRef'>): RichSourceRef { return richToolSourceReference(target, hash) }
function selected(events: readonly SessionEvent[], target: RichToolSourceTarget) { return selectRichToolSource(events, target, hash) }
/** Host interpreter shares settlement checks and projection with browser readers. */
export const richToolSourceProjection = createRichToolSourceProjection(hash)
`
  return (text.slice(0, toolStart) + imports + text.slice(toolStop)).replace("import { z } from 'zod'\n", '').replace("import { brandString } from '@deepseek-ai/dsh-brand'\n", '').replace("import { SessionSeq } from '@deepseek-ai/dsh-session'\n", '').replace("import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'\n", '').replace("import type { Message } from '@deepseek-ai/dsh-llm'\n", '').replace("import type { RichBlockId } from '../shared/types.ts'\n", '')
})
await writeFile(join(rich, 'shared/message-projections.ts'), `/** Browser-safe source interpreters shared with the Host; callers retain immutable audit events. */
export { createRichSourceProjection } from './source-projection.ts'
export { createRichToolSourceProjection } from './tool-source-projection.ts'
export type { RichSourceDigest, RichSourceRef, RichSourceTarget } from './source-projection.ts'
export type { RichToolSourceTarget } from './tool-source-projection.ts'
import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session/types'
import { richSourceDecisionSchema } from './source-projection.ts'
import { richToolDecisionSchema } from './tool-source-projection.ts'
/** @param events - retained immutable audit window. @returns earliest required source record, or null without an offload; malformed decisions throw. */
export function richProjectionHistoryStart(events: readonly SessionEvent[]): SessionSeq | null {
  let first: SessionSeq | null = null
  for (const event of events) {
    const targets = event.type === 'rich-inline/source-offload' ? richSourceDecisionSchema.parse(event.data).targets : event.type === 'rich-inline/tool-offload' ? richToolDecisionSchema.parse(event.data).targets : []
    for (const target of targets) if (first === null || target.seq < first) first = target.seq
  }
  return first
}
`, { flag: 'wx' })
await replace(join(checkout, 'packages/typert/registry/src/service.ts'), text => text.replace('const entry: ProviderEntry<TypertLookupProvider> = { provider, owner }', `const entry: ProviderEntry<TypertLookupProvider> = {
      provider: { ...provider, resolve: id => provider.resolve(id as Wire) }, owner,
    }`).replace("return this.registerProvider(ctx, this.hosts, 'host-context', key, adapter)", "const erased: TypertHostContextAdapter = { ...adapter, resolve: id => adapter.resolve(id as Wire) }\n    return this.registerProvider(ctx, this.hosts, 'host-context', key, erased)"))
await writeFile(join(backup, 'migration.json'), JSON.stringify({ at: new Date().toISOString(), checkout, baseCommit: 'b23972eb7145ab0bb923c45dc28ffcd9f6556412', extractedFrom: { source: hash(source), tool: hash(tool) }, records }, null, 2) + '\n', { flag: 'wx' })
for (const path of ['projection-source.json', 'scripts/projection-source.mjs']) {
  const target = join(project, path); await copyFile(target, join(backup, path.replaceAll('/', '_')), constants.COPYFILE_EXCL)
}
const spec = JSON.parse(await readFile(join(project, 'projection-source.json'), 'utf8'))
await writeFile(join(project, 'projection-source.json'), JSON.stringify({ ...spec, checkout, baseCommit: 'b23972eb7145ab0bb923c45dc28ffcd9f6556412', qualification: 'alpha4-source-extraction-under-test', registryEntry: 'packages/typert/registry/src/index.ts' }, null, 2) + '\n')
console.log(JSON.stringify({ checkout, backup, extractedCurrentAlpha4: true, oldSourceCopied: false }))
