import { projectionTsconfig } from './projection-source.mjs'
/** Generate native presentation from one semantic model; bundle trusted TS runtime without credential configuration. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { MessageWindow } from '../.build/phone-library.js'
import { spawnSync } from 'node:child_process'

const source = JSON.parse(await readFile('source.json', 'utf8')), root = resolve(source.dshRoot)
const require = createRequire(resolve(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [resolve(root, 'node_modules/.pnpm')] }))
const entries = (await readFile('evidence/phase3-session.v4.jsonl', 'utf8')).trim().split('\n').map(JSON.parse), header = entries.shift(); delete header.type
const owner = { desktopId: 'phase5-desktop', deviceId: 'fixture-phone', sessionId: header.id }, limits = { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }
const model = new SemanticPhone(owner, limits, 256)
const make = rows => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', kind: 'reset', ...owner, instance: 'native-fixture', relayCursor: 0, payload: { type: 'snapshot', header, cursor: rows.at(-1)?.seq ?? -1, records: rows.map(event => ({ type: 'event', event })), hasMore: false, projections: { asOfSeq: rows.at(-1)?.seq ?? -1, values: {} }, assistantStream: { revision: 0 } } })
const running = entries.slice(0, 11); model.accept(make(running)); const connected = model.view
model.disconnect(); const disconnected = model.view
const blocked = new SemanticPhone(owner, limits, 256), pending = [...running, { type: 'turn/end', seq: 11, time: 1, data: { turn: 1, reason: { kind: 'blocked' } } }]
blocked.accept(make(pending))
const views = [connected, disconnected, blocked.view]
const empty = new SemanticPhone({ ...owner, sessionId: 'phase5-empty' }, limits, 256)
empty.accept({ ...make([]), sessionId: 'phase5-empty', payload: { ...make([]).payload, header: { ...header, id: 'phase5-empty' } } })
const emptyConnected = empty.view; empty.disconnect()
const sessions = [{ sessionId: owner.sessionId, title: '表单与任务回放', project: '合成项目', views }, { sessionId: 'phase5-empty', title: '空会话', project: '合成项目', views: [emptyConnected, empty.view, empty.view] }]
const longOwner = { ...owner, sessionId: 'phase6-long-cache' }, longModel = new SemanticPhone(longOwner, limits, 256)
const longEvents = Array.from({ length: 100 }, (_, seq) => ({ type: 'user/message', seq, time: seq, surfaceOp: 'append', data: { id: 'native-history-' + seq, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '合成历史消息 ' + seq }, ...(seq === 99 ? [{ type: 'image', attachment: { attachmentId: 'native-unavailable-image', mediaType: 'image/png', bytes: 64, width: 24, height: 16 } }] : [])] } }))
longModel.accept({ ...make(longEvents), sessionId: longOwner.sessionId, payload: { ...make(longEvents).payload, header: { ...header, id: longOwner.sessionId } } })
const longConnected = longModel.view, offline = new SemanticPhone(longOwner, limits, 256); offline.restore(longModel.cache())
sessions.push({ sessionId: longOwner.sessionId, title: '100 条历史与离线恢复', project: '合成项目', views: [longConnected, offline.view, offline.view] })
await writeFile('harmony/entry/src/main/resources/rawfile/mobile-presentation-fixtures.json', JSON.stringify({ schema: 'mobile-view/1', mode: 'fixture-only', views }, null, 2) + '\n')
const rows = view => new MessageWindow(20).update(view.messages.filter(message => message.role !== 'context')).rows.map(message => { const image = message.parts.find(part => part.kind === 'image'); return `new NativeMessage(${JSON.stringify(message.id)}, ${JSON.stringify(message.role)}, ${JSON.stringify(message.parts.filter(part => part.kind === 'text').map(part => part.text).join('\n'))}, ${message.rich.length > 0}, ${image !== undefined}, ${image?.width ?? 0}, ${image?.height ?? 0})` }).join(', ')
const viewCode = view => `new NativeView(${JSON.stringify(view.desktopId)}, ${JSON.stringify(view.task)}, ${JSON.stringify(view.connection)}, ${JSON.stringify(view.error ?? '')}, ${view.readOnly}, [${rows(view)}], ${view.hasMore}, ${view.messages.filter(message => message.role !== 'context').length}, ${view.notices.includes('offline-cache')})`
// ArkTS fields are declared separately from constructor parameters.
const dataClass = (name, fields) => `export class ${name} {\n${fields.map(([key, type]) => `  ${key}: ${type}`).join('\n')}\n  constructor(${fields.map(([key, type]) => `${key}: ${type}`).join(', ')}) {\n${fields.map(([key]) => `    this.${key} = ${key}`).join('\n')}\n  }\n}\n`
const classes = dataClass('NativeMessage', [['id', 'string'], ['role', 'string'], ['text', 'string'], ['hasRich', 'boolean'], ['hasImage', 'boolean'], ['imageWidth', 'number'], ['imageHeight', 'number']]) +
  dataClass('NativeView', [['desktopId', 'string'], ['task', 'string'], ['connection', 'string'], ['error', 'string'], ['readOnly', 'boolean'], ['messages', 'NativeMessage[]'], ['hasMore', 'boolean'], ['totalMessages', 'number'], ['offline', 'boolean']]) +
  dataClass('NativeSession', [['sessionId', 'string'], ['title', 'string'], ['project', 'string'], ['views', 'NativeView[]']])
await writeFile('harmony/entry/src/main/ets/generated/NativePresentation.ets', '/** Generated from SemanticPhone and shared MessageWindow(20); no independent ArkTS reducer. */\n' + classes + 'export const phase5Sessions: NativeSession[] = [\n' + sessions.map(session => `  new NativeSession(${JSON.stringify(session.sessionId)}, ${JSON.stringify(session.title)}, ${JSON.stringify(session.project)}, [${session.views.map(viewCode).join(', ')}]),`).join('\n') + '\n]\n')
await writeFile('harmony/entry/src/main/resources/rawfile/phase6-native-fixtures.json', JSON.stringify({ schema: 'mobile-native-fixture/1', mode: 'synthetic-only', maxRows: 20, sessions }, null, 2) + '\n')
const resource = 'harmony/entry/src/main/resources/base/element/string.json', labels = JSON.parse(await readFile(resource, 'utf8'))
const additions = { owner_prefix: '执行归属：', project_label: '合成项目 · 项目与会话选择', desktop_continues: '连接已断开；电脑任务可能继续。重新连接后核对状态。', task_running: '电脑正在执行', task_idle: '尚无任务', task_failed: '电脑任务失败', cancel_requested: '已请求取消；等待电脑确认', outcome_unknown: '结果未知；先查询原请求，不重复发送', role_user: '我的消息', role_assistant: '电脑回复', image_reference: '图片附件引用；原生下载尚未启用', history_readonly: '继承历史只读；不能提交该富块', demo_connected: '回放状态', demo_disconnected: '断开状态', demo_confirmation: '待确认' }
for (const [name, value] of Object.entries(additions)) { const old = labels.string.find(item => item.name === name); if (old) old.value = value; else labels.string.push({ name, value }) }
for (const [name, value] of Object.entries({ load_older: '读取更早消息', offline_cache: '离线缓存，只读；重新连接后核对远端状态', image_unavailable: '图片暂不可用，尺寸信息已保留' })) { const old = labels.string.find(item => item.name === name); if (old) old.value = value; else labels.string.push({ name, value }) }
await writeFile(resource, JSON.stringify(labels, null, 2) + '\n')
await esbuild.build({ entryPoints: [resolve('src/rich-renderer.ts')], outfile: resolve('.build/mobile-renderer.bundle.js'), absWorkingDir: root, tsconfig: await projectionTsconfig(resolve('.'), root), bundle: true, format: 'esm', platform: 'browser', target: 'es2022' })
await esbuild.build({ entryPoints: [resolve('src/native-runtime.ts')], outfile: resolve('harmony/entry/src/main/resources/rawfile/trusted-phone-core.js'), absWorkingDir: root, tsconfig: await projectionTsconfig(resolve('.'), root), bundle: true, format: 'esm', platform: 'browser', target: 'es2022' })
const nativeResources = spawnSync(process.execPath, ['scripts/native-runtime-assets.mjs'], { stdio: 'inherit', windowsHide: true })
if (nativeResources.status !== 0) throw new Error('Offline native asset generation failed')
console.log('PASS: shared fixtures, disabled production ESM and explicit offline ESM generated; generation does not qualify ArkTS/ArkWeb')
