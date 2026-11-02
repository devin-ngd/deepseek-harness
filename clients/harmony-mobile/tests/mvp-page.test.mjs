/** Evaluate the actual ETS page guards and methods; this does not substitute for ArkUI/device rendering. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { productLayoutParser, productButtonActions, productParseOptions } from '../scripts/product-layout-audit.mjs'

const ts = await productLayoutParser(), source = await readFile('harmony/entry/src/main/ets/pages/Index.ets', 'utf8')
const file = ts.createSourceFile('Index.ets', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS, productParseOptions)
assert.equal(file.parseDiagnostics.length, 0)
const page = file.statements.find(node => ts.isStructDeclaration(node) && node.name.text === 'Index')
const names = ['rows', 'selectedTitle', 'openSession', 'receiveView', 'refreshConnectionControls', 'connectable', 'connecting', 'taskActive', 'receiptVisible', 'errorVisible', 'dismissError', 'errorMessage', 'showPage', 'followLatest', 'trackScroll', 'dismissKeyboard', 'canSend', 'composerHint', 'projectTitle', 'manageable', 'sessionTitle', 'running', 'listed', 'inFilter', 'counted', 'groups', 'projectChoices', 'projectCount', 'rowKey', 'toggleGroup', 'emptyLabel', 'age', 'selectedRow', 'selectedArchived', 'rowMenu', 'selectedMenu', 'manageSession', 'createSession']
const methods = names.map(name => page.members.find(node => node.name?.getText(file) === name).getText(file)).join('\n')
const groupClass = file.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'SessionGroup').getText(file)
// `$r`, `Edge`, `ScrollState` and `SymbolGlyphModifier` are ArkUI globals; the stubs return resource names and tags so guards and mappings run under Node.
const javascript = ts.transpileModule('const $r = (name: string) => name; const Edge = { Bottom: \'bottom\' }; const ScrollState = { Idle: 0, Scroll: 1, Fling: 2 }; class SymbolGlyphModifier { constructor(readonly icon: string) {} }\n' + groupClass + '\nexport class Page {' + methods + '}', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { Page } = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'))
const actions = productButtonActions(ts, source), byId = id => { const row = actions.find(item => item.id === id); assert.ok(row, id); return row }
const strings = new Map(JSON.parse(await readFile('harmony/entry/src/main/resources/base/element/string.json', 'utf8')).string.map(row => [row.name, row.value]))
test('product page uses real-message labels without the offline demo wording', () => {
  for (const match of source.matchAll(/app\.string\.([a-zA-Z_0-9]+)/g)) {
    assert.equal(typeof strings.get(match[1]), 'string', match[1])
    assert.doesNotMatch(strings.get(match[1]), /演示|mock-desktop/, match[1])
  }
})
function fixture() {
  const value = new Page(), scrolls = [], focus = { cleared: 0, atEnd: true }, toasts = [], intents = []
  Object.assign(value, { page: page.members.find(node => node.name?.getText(file) === 'page').initializer.text, showSetup: false, showDiagnostics: false, busy: false, failed: false, listMode: 'recent', listFilter: 'active', query: '', collapsed: [], created: [], newSheet: false, networkApproved: false, connectionEnabled: true, connectionHost: 'relay.invalid', scopeEntry: false, routeSummary: '', routeReply: '', logCheckState: '', revokePending: false, identityPending: false, drafts: new Map(), draft: '', lastRequest: '', stickToBottom: true, dismissedError: '', rich: { setMount() {} },
    scroller: { scrollTo(position) { scrolls.push(['top', position.yOffset]) }, scrollEdge(edge) { scrolls.push(['edge', edge]) }, isAtEnd: () => focus.atEnd },
    getUIContext: () => ({ getFocusController: () => ({ clearFocus() { focus.cleared++ } }), getPromptAction: () => ({ showToast(options) { toasts.push(options.message) } }) }),
    run: operation => operation(),
    view: { pairing: 'paired', connection: 'disconnected', task: 'idle', selected: '', error: '', sessions: [], projects: [], messages: [], liveText: '', richJson: '', readOnly: false, connectionGeneration: 1, storageRecovery: '' },
    product: { deviceBindingMode: () => true, connectionEnabled: () => true, connectionHost: () => 'relay.invalid', select: async () => {}, manage: async raw => { const intent = JSON.parse(raw); intents.push(intent); return intent.sessionId ?? 'created-1' } },
  })
  return { value, scrolls, focus, toasts, intents }
}
function directory(value) {
  Object.assign(value.view, { connection: 'connected', manageable: true, projects: [{ projectId: 'p1', title: 'Harness' }, { projectId: 'p2', title: 'Plugins' }], sessions: [
    { sessionId: 'old', projectId: 'p1', title: 'Old', updatedAt: 1000 },
    { sessionId: 'pinned', projectId: 'p2', title: 'Pinned', updatedAt: 500, pinned: true },
    { sessionId: 'new', projectId: null, title: 'New', updatedAt: 3000, running: true },
    { sessionId: 'blank', projectId: 'p1', title: 'blank', updatedAt: 4000, blank: true },
    { sessionId: 'gone', projectId: 'p1', title: 'Gone', updatedAt: 5000, archived: true },
  ] })
  return () => value.rows().map(row => row.sessionId)
}
function visibleIds(value) {
  const ids = []
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'id' && ts.isStringLiteral(node.arguments[0])) {
      let visible = true
      const guards = []
      for (let parent = node.parent; parent; parent = parent.parent) if (ts.isIfStatement(parent)) guards.unshift(parent.expression)
      for (const guard of guards) visible &&= Boolean(Function('return (' + guard.getText(file) + ')').call(value))
      if (visible) ids.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(page.members.find(node => node.name?.getText(file) === 'build'))
  return ids
}
test('native launch opens sessions with one connect tap for the paired host and no technical forms', () => {
  const { value } = fixture(), ids = visibleIds(value)
  assert.equal(value.page, 'sessions'); assert.ok(ids.includes('product-home-connect')); assert.equal(ids.includes('product-home-setup'), false)
  assert.equal(Function('return ' + byId('product-home-connect').enabled).call(value), true)
  for (const id of ['product-route-offer', 'product-log-selfcheck', 'product-startup-storage', 'product-composer']) assert.equal(ids.includes(id), false, id)
  value.connectionEnabled = false
  assert.equal(visibleIds(value).includes('product-home-connect'), false); assert.ok(visibleIds(value).includes('product-home-setup'))
})
test('device screen keeps connect and stop available while setup and diagnostics require explicit expansion', () => {
  const { value } = fixture(); value.page = 'device'
  assert.ok(visibleIds(value).includes('product-connect')); assert.ok(visibleIds(value).includes('product-route-stop'))
  assert.equal(visibleIds(value).includes('product-route-offer'), false); assert.equal(visibleIds(value).includes('product-log-selfcheck'), false)
  value.showSetup = true; assert.ok(visibleIds(value).includes('product-route-offer'))
  value.showDiagnostics = true; assert.ok(visibleIds(value).includes('product-log-selfcheck'))
})
test('opening a real session enters conversation only after successful selection', async () => {
  const { value, scrolls } = fixture(); value.product.select = async () => { throw Error('offline') }
  await assert.rejects(value.openSession('a'), /offline/); assert.equal(value.page, 'sessions')
  value.product.select = async id => { value.view.selected = id }; value.view.sessions = [{ sessionId: 'a', title: '真实会话' }]
  await value.openSession('a'); assert.equal(value.page, 'conversation'); assert.equal(value.selectedTitle(), '真实会话')
  assert.deepEqual(scrolls, [['top', 0]]); assert.equal(value.stickToBottom, true)
  assert.ok(visibleIds(value).includes('product-composer')); assert.equal(visibleIds(value).includes('product-route-offer'), false)
})
test('returning to the list and switching sessions preserves each unsent draft', () => {
  const { value } = fixture(); value.page = 'conversation'; value.view.selected = 'a'; value.draft = 'A draft'
  Function('return ' + byId('product-chat-back').onClick).call(value)(); assert.equal(value.page, 'sessions'); assert.equal(value.draft, 'A draft')
  value.receiveView({ ...value.view, selected: 'b' }); value.draft = 'B draft'
  value.receiveView({ ...value.view, selected: 'a' }); assert.equal(value.draft, 'A draft'); assert.equal(value.drafts.get('b'), 'B draft')
})
test('offline or read-only conversation cannot submit or stop a task', () => {
  const { value } = fixture(); value.view.selected = 'a'; value.draft = 'message'
  for (const id of ['product-send', 'product-cancel']) {
    const enabled = Function('return ' + byId(id).enabled)
    assert.equal(enabled.call(value), false)
    value.view.connection = 'connected'; value.view.readOnly = true; assert.equal(enabled.call(value), false)
    value.view.readOnly = false; assert.equal(enabled.call(value), true); value.view.connection = 'disconnected'
  }
  value.view.connection = 'connected'; value.draft = ' \n '
  assert.equal(Function('return ' + byId('product-send').enabled).call(value), false)
})
test('the conversation follows new output until the reader scrolls away, then offers a jump to the latest', () => {
  const { value, scrolls } = fixture(); value.showPage('conversation')
  value.followLatest(); assert.deepEqual(scrolls.at(-1), ['edge', 'bottom']); assert.equal(visibleIds(value).includes('product-jump-latest'), false)
  value.stickToBottom = false; const count = scrolls.length
  value.followLatest(); assert.equal(scrolls.length, count); assert.ok(visibleIds(value).includes('product-jump-latest'))
  Function('Edge', 'return ' + byId('product-jump-latest').onClick).call(value, { Bottom: 'bottom' })(); assert.equal(value.stickToBottom, true); assert.deepEqual(scrolls.at(-1), ['edge', 'bottom'])
  value.showPage('sessions'); value.followLatest(); assert.equal(value.stickToBottom, false); assert.deepEqual(scrolls.at(-1), ['top', 0])
})
test('programmatic scrolling never stops following; a finger drag away from the end stops it and closes the keyboard', () => {
  const { value, focus } = fixture(); value.showPage('conversation')
  for (const state of [0, 2]) { focus.atEnd = false; value.trackScroll(state); assert.equal(value.stickToBottom, true, String(state)) }
  assert.equal(focus.cleared, 0)
  value.trackScroll(1); assert.equal(value.stickToBottom, false); assert.equal(focus.cleared, 1)
  focus.atEnd = true; value.trackScroll(2); assert.equal(value.stickToBottom, true)
  value.showPage('sessions'); value.stickToBottom = false; value.trackScroll(1); assert.equal(value.stickToBottom, false); assert.equal(focus.cleared, 1)
})
test('task actions appear only for an active task or a pending receipt, and stop only while active', () => {
  const { value } = fixture(); value.page = 'conversation'
  assert.equal(visibleIds(value).includes('product-task-actions'), false)
  for (const task of ['accepted', 'running', 'cancel_requested', 'pending_confirmation']) { value.view.task = task; assert.ok(visibleIds(value).includes('product-cancel'), task) }
  value.view.task = 'completed'; assert.ok(visibleIds(value).includes('product-task-actions')); assert.equal(visibleIds(value).includes('product-cancel'), false)
  value.view.task = 'idle'; value.failed = true; value.lastRequest = 'request-1'; assert.ok(visibleIds(value).includes('product-task-actions'))
})
test('known failures name their cause, and a dismissed error returns only when the error changes', () => {
  const { value } = fixture()
  for (const [code, resource] of [['', 'product_operation_failed'], ['connection-unavailable', 'error_connection_unavailable'], ['connection-expiry', 'error_connection_expiry'], ['selection-cleanup-failed', 'error_cleanup_failed'], ['device-catalog-unavailable', 'error_catalog_unavailable'], ['public-trust-expired', 'product_successor_notice'], ['device-binding-locally-revoked', 'error_binding_unavailable'], ['unknown-new-code', 'error_generic']]) {
    value.view.error = code; assert.equal(value.errorMessage(), 'app.string.' + resource, code); assert.equal(typeof strings.get(resource), 'string', resource)
  }
  value.receiveView({ ...value.view, error: 'connection-unavailable' }); assert.equal(value.errorVisible(), true); assert.ok(visibleIds(value).includes('product-error-dismiss'))
  Function('return ' + byId('product-error-dismiss').onClick).call(value)(); assert.equal(value.errorVisible(), false)
  value.receiveView({ ...value.view }); assert.equal(value.errorVisible(), false)
  value.receiveView({ ...value.view, error: 'connection-expiry' }); assert.equal(value.errorVisible(), true)
  value.dismissError(); value.receiveView({ ...value.view, error: '' }); assert.equal(value.dismissedError, '')
  value.receiveView({ ...value.view, error: 'connection-expiry' }); assert.equal(value.errorVisible(), true)
})
test('the list hides blank Sessions, puts pinned first then the most recent, and filters running and archived', () => {
  const { value } = fixture(), ids = directory(value)
  assert.deepEqual(ids(), ['pinned', 'new', 'old'])
  value.listFilter = 'running'; assert.deepEqual(ids(), ['new']); assert.equal(value.counted('running'), 1)
  value.listFilter = 'archived'; assert.deepEqual(ids(), ['gone'])
  value.listFilter = 'active'; value.view.selected = 'blank'; assert.deepEqual(ids(), ['pinned', 'blank', 'new', 'old'])
  value.view.selected = 'old'; value.view.task = 'running'; value.listFilter = 'running'; assert.deepEqual(ids(), ['new', 'old'])
  assert.equal(value.emptyLabel(), 'app.string.no_running')
})
test('search matches Session and project titles; project mode orders sections by activity with unassigned Sessions last', () => {
  const { value } = fixture(), ids = directory(value)
  value.query = 'HARN'; assert.deepEqual(ids(), ['old'])
  value.query = 'pinn'; assert.deepEqual(ids(), ['pinned'])
  value.query = 'none'; assert.deepEqual(ids(), []); assert.equal(value.emptyLabel(), 'app.string.no_matches')
  value.query = ''
  assert.deepEqual(value.groups().map(group => [group.key, group.title, group.rows.map(row => row.sessionId)]), [['p1', 'Harness', ['old']], ['p2', 'Plugins', ['pinned']], ['', '', ['new']]])
  value.toggleGroup('p1'); assert.deepEqual(value.collapsed, ['p1']); value.toggleGroup('p1'); assert.deepEqual(value.collapsed, [])
  assert.deepEqual(value.projectChoices().map(row => row.projectId), ['p1', 'p2']); assert.equal(value.projectCount('p1'), 1)
})
test('a desktop without list management keeps its order and shows no management controls', () => {
  const { value } = fixture()
  Object.assign(value.view, { connection: 'connected', projects: [], sessions: [{ sessionId: 'b', projectId: null, title: 'B' }, { sessionId: 'a', projectId: null, title: 'A' }] })
  assert.deepEqual(value.rows().map(row => row.sessionId), ['b', 'a']); assert.equal(value.manageable(), false)
  const hidden = ['product-new-session', 'product-filter-active', 'product-filter-running', 'product-filter-archived', 'product-list-recent', 'product-list-projects']
  for (const id of hidden) assert.equal(visibleIds(value).includes(id), false, id)
  assert.ok(visibleIds(value).includes('product-session-search'))
  directory(value); for (const id of hidden) assert.ok(visibleIds(value).includes(id), id)
  value.view.connection = 'disconnected'; for (const id of hidden) assert.equal(visibleIds(value).includes(id), false, id)
  value.page = 'conversation'; value.view.connection = 'connected'; value.view.selected = 'old'; assert.ok(visibleIds(value).includes('product-chat-more'))
  value.view.manageable = false; assert.equal(visibleIds(value).includes('product-chat-more'), false)
})
test('row actions pin, unpin and archive; an archived conversation is read-only until unarchived', async () => {
  const { value, toasts, intents } = fixture(); directory(value)
  const pinned = value.rowMenu(value.view.sessions[1]), plain = value.rowMenu(value.view.sessions[0])
  assert.deepEqual(pinned.map(item => item.value), ['app.string.session_unpin', 'app.string.session_archive'])
  await pinned[0].action(); await plain[0].action(); await plain[1].action()
  assert.deepEqual(intents, [{ action: 'unpin', sessionId: 'pinned' }, { action: 'pin', sessionId: 'old' }, { action: 'archive', sessionId: 'old' }]); assert.deepEqual(toasts, ['app.string.session_archived_notice'])
  value.page = 'conversation'; value.view.selected = 'gone'; value.draft = 'message'
  assert.equal(Function('return ' + byId('product-send').enabled).call(value), false); assert.equal(value.composerHint(), 'app.string.composer_archived')
  assert.deepEqual(value.selectedMenu().map(item => item.value), ['app.string.session_pin', 'app.string.session_unarchive'])
  assert.ok(visibleIds(value).includes('product-unarchive'))
  await Function('return ' + byId('product-unarchive').onClick).call(value)()
  assert.deepEqual(intents.at(-1), { action: 'unarchive', sessionId: 'gone' }); assert.equal(toasts.at(-1), 'app.string.session_unarchived_notice')
  value.view.sessions[4].archived = false; assert.equal(Function('return ' + byId('product-send').enabled).call(value), true)
})
test('creating a Session opens the new blank Session and keeps it listed', async () => {
  const { value, intents } = fixture(); directory(value)
  value.product.manage = async raw => { intents.push(JSON.parse(raw)); value.view.sessions = [{ sessionId: 'n1', projectId: 'p1', title: 'n1', blank: true }]; return 'n1' }
  value.product.select = async id => { value.view.selected = id }
  value.newSheet = true; value.listFilter = 'archived'; value.query = 'x'
  await value.createSession('p1')
  assert.deepEqual(intents, [{ action: 'create', projectId: 'p1' }]); assert.equal(value.page, 'conversation'); assert.equal(value.newSheet, false)
  assert.equal(value.selectedTitle(), 'app.string.session_untitled'); assert.equal(value.listFilter, 'active'); assert.equal(value.query, '')
  value.view.selected = ''; assert.deepEqual(value.rows().map(row => row.sessionId), ['n1'])
  await value.createSession(null); assert.deepEqual(intents.at(-1), { action: 'create', projectId: null })
})
test('list rows show relative activity time', () => {
  const { value } = fixture(), now = Date.now()
  assert.equal(value.age(now - 10000), 'app.string.age_now'); assert.equal(value.age(now - 5 * 60000), 'app.string.age_minutes')
  assert.equal(value.age(now - 3 * 3600000), 'app.string.age_hours'); assert.equal(value.age(now - 3 * 86400000), 'app.string.age_days')
  assert.match(value.age(now - 30 * 86400000), /^app\.string\.age_(full_)?date$/)
})
