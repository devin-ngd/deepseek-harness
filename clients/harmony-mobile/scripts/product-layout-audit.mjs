/** Audit native page containment with the installed official ETS parser; this does not render or measure ArkUI. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** @returns The ETS parser from the explicitly recorded official SDK, without executing a build or device command. */
export async function productLayoutParser() {
  const platform = JSON.parse(await readFile('harmony/platform.json', 'utf8'))
  assert.equal(platform.installedToolchainConfirmed, true)
  const require = createRequire(import.meta.url)
  return require(join(platform.installedIdeDirectory, 'sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript/lib/typescript.js'))
}

// ForEach stays a call so its item callbacks parse as UI builders, matching the official parser configuration.
const productPageComponents = ['Stack', 'Scroll', 'Column', 'Row', 'Flex', 'Text', 'TextInput', 'TextArea', 'Checkbox', 'Button', 'List', 'ListItem', 'SymbolGlyph', 'LoadingProgress', 'Circle', 'ProductRichSurface', 'TaskState', 'MessageView']
/** ETS parser options for the page: its components plus the official `@Extend`, `@Styles` and build-method settings the parser requires for those declarations. */
export const productParseOptions = { ets: {
  components: productPageComponents,
  extend: { decorator: ['Extend', 'AnimatableExtend'], components: productPageComponents.map(name => ({ name, type: name + 'Attribute', instance: name + 'Instance' })) },
  styles: { decorator: 'Styles', component: { name: 'Common', type: 'T', instance: 'CommonInstance' }, property: 'stateStyles' },
  render: { method: ['build', 'pageTransition'], decorator: ['LocalBuilder', 'Builder'] },
  syntaxComponents: { paramsUICallback: ['ForEach', 'LazyForEach'], attrUICallback: [{ name: 'Repeat', attributes: ['each', 'template'] }] },
} }
function parse(ts, source) {
  const file = ts.createSourceFile('Index.ets', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS, productParseOptions)
  assert.equal(file.parseDiagnostics.length, 0, 'ETS source must parse')
  const page = file.statements.find(node => ts.isStructDeclaration(node) && node.name.text === 'Index')
  assert.ok(page, 'Index component is required')
  const build = page.members.find(node => node.name?.getText(file) === 'build')
  assert.ok(build?.body, 'Index.build must have a body')
  return { file, page, build }
}
function component(ts, expression, file) {
  const attributes = new Map()
  while (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    attributes.set(expression.expression.name.text, expression.arguments.map(argument => argument.getText(file)))
    expression = expression.expression.expression
  }
  assert.ok(ts.isEtsComponentExpression(expression), 'UI expression must contain an ETS component')
  return { node: expression, name: expression.expression.getText(file), attributes }
}
function walk(ts, node, visitor) { visitor(node); ts.forEachChild(node, child => walk(ts, child, visitor)) }
function attributes(ts, node, file) {
  let outer = node
  while (ts.isPropertyAccessExpression(outer.parent) || ts.isCallExpression(outer.parent)) outer = outer.parent
  return component(ts, outer, file).attributes
}
function ancestors(ts, node) {
  const values = []
  for (let parent = node.parent; parent; parent = parent.parent) if (ts.isEtsComponentExpression(parent)) values.push(parent.expression.text)
  return values
}
function within(node, owner) { for (let parent = node.parent; parent; parent = parent.parent) if (parent === owner) return true; return false }
/** A Button without a label argument whose only child is one SymbolGlyph. */
function iconOnly(ts, node, file) {
  const label = node.arguments[0]
  if (label !== undefined && !ts.isObjectLiteralExpression(label)) return false
  const children = node.body?.statements ?? []
  return children.length === 1 && ts.isExpressionStatement(children[0]) && component(ts, children[0].expression, file).name === 'SymbolGlyph'
}

/** @param ts - Installed official ETS parser. @param source - Inert native page source. @returns Stable button ids, label resources, guards and action callbacks for compatibility comparison. */
export function productButtonActions(ts, source) {
  const { file, build } = parse(ts, source), printer = ts.createPrinter(), result = []
  walk(ts, build.body, node => {
    if (!ts.isEtsComponentExpression(node) || node.expression.text !== 'Button') return
    const label = node.arguments[0], modifiers = attributes(ts, node, file), id = modifiers.get('id')?.[0]
    const resource = label !== undefined && ts.isCallExpression(label) && label.expression.getText(file) === '$r' ? label.arguments[0].text : null
    if (resource === null && id === undefined) return
    result.push({ id: id === undefined ? null : /^'[^']*'$/.test(id) ? id.slice(1, -1) : id, resource, enabled: modifiers.get('enabled')?.[0] ?? null, onClick: modifiers.get('onClick')?.[0] ?? null })
  })
  // Reparse each expression to remove source indentation without changing its tokens.
  for (const row of result) for (const name of ['enabled', 'onClick']) if (row[name] !== null) {
    const value = ts.createSourceFile('action.ts', '(' + row[name] + ')', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    row[name] = printer.printNode(ts.EmitHint.Expression, value.statements[0].expression, value)
  }
  const key = row => (row.id ?? '') + '|' + (row.resource ?? '')
  return result.sort((left, right) => key(left).localeCompare(key(right)))
}

/** @param ts - Installed official ETS parser. @param source - Native page source to check. @returns Header, error banner, history, footer, keyboard and wrapping facts; throws when history can displace the header, error banner or conversation controls. */
export function auditProductLayout(ts, source) {
  const { file, page, build } = parse(ts, source)
  assert.equal(build.body.statements.length, 1, 'The native page must have one root')
  const root = component(ts, build.body.statements[0].expression, file)
  assert.equal(root.name, 'Column', 'The page root must reserve space for fixed conversation controls')
  assert.deepEqual(root.attributes.get('height'), ["'100%'"], 'The page must fill the resized viewport')
  assert.deepEqual(root.attributes.get('width'), ["'100%'"])
  assert.equal(root.node.body.statements.length, 3, 'The page must contain a fixed header, history and conditional conversation controls')
  const [headerStatement, viewportStatement, condition] = root.node.body.statements
  assert.ok(ts.isExpressionStatement(headerStatement) && ts.isExpressionStatement(viewportStatement), 'The header and history must always render')
  const header = component(ts, headerStatement.expression, file)
  assert.equal(header.name, 'Column', 'The page header must stay above history')
  assert.deepEqual(header.attributes.get('id'), ["'product-header'"])
  assert.equal(header.attributes.has('height') || header.attributes.has('layoutWeight'), false, 'The page header must retain intrinsic height')
  const viewport = component(ts, viewportStatement.expression, file)
  assert.equal(viewport.name, 'Stack', 'History and its overlay controls must share one viewport')
  assert.deepEqual(viewport.attributes.get('layoutWeight'), ['1'], 'History must use only the remaining viewport height')
  assert.equal(viewport.attributes.has('height'), false, 'History must leave room for conversation controls')
  const scroll = component(ts, viewport.node.body.statements[0].expression, file)
  assert.equal(scroll.name, 'Scroll', 'Page content must retain one history viewport')
  assert.deepEqual(scroll.attributes.get('scrollable'), ['ScrollDirection.Vertical'])
  assert.deepEqual(scroll.attributes.get('height'), ["'100%'"], 'History must fill exactly its remaining viewport')
  assert.equal(scroll.attributes.has('layoutWeight'), false, 'History must fill exactly its remaining viewport')
  assert.deepEqual(scroll.attributes.get('align'), ['Alignment.Top'], 'Short history must start below the header instead of being centred')
  const content = component(ts, scroll.node.body.statements[0].expression, file)
  assert.equal(content.name, 'Column')
  assert.equal(content.attributes.has('height'), false, 'Scroll content must retain intrinsic height')
  assert.ok(ts.isIfStatement(condition) && condition.expression.getText(file) === "this.page === 'conversation'", 'Conversation controls must be scoped to the conversation page')
  const footer = component(ts, condition.thenStatement.statements[0].expression, file)
  assert.equal(footer.name, 'Column', 'Conversation controls must share one fixed footer')
  assert.deepEqual(footer.attributes.get('id'), ["'product-conversation-controls'"])
  assert.deepEqual(footer.attributes.get('width'), ["'100%'"])
  assert.equal(footer.attributes.has('height') || footer.attributes.has('layoutWeight'), false, 'Conversation controls must retain intrinsic height')
  let resize = false
  const appear = page.members.find(node => node.name?.getText(file) === 'aboutToAppear')
  walk(ts, appear.body, node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'setKeyboardAvoidMode' && node.arguments[0]?.getText(file) === 'KeyboardAvoidMode.RESIZE') resize = true
  })
  assert.equal(resize, true, 'The keyboard must resize the page viewport')
  let scrollCount = 0, composer = false, taskActions = false, send = false, history = false, errorBanner = false, wrappedGroups = 0, iconButtons = 0
  walk(ts, build.body, node => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'ForEach' && node.arguments[0]?.getText(file) === 'this.view.messages') { assert.ok(within(node, scroll.node), 'History must remain scrollable'); history = true }
    if (!ts.isEtsComponentExpression(node)) return
    const name = node.expression.text, modifiers = attributes(ts, node, file), parents = ancestors(ts, node)
    if (name === 'Scroll') scrollCount++
    assert.ok(!['List', 'ListItem'].includes(name), 'The transcript must use the page scroll rather than another native viewport')
    if (name === 'Column' && node !== root.node) assert.equal(modifiers.has('height'), false, 'Native section height must follow content')
    if (name === 'Button' && iconOnly(ts, node, file)) {
      assert.ok(modifiers.has('accessibilityText'), 'Icon-only buttons need an accessible name')
      assert.ok(modifiers.has('width') && modifiers.has('height'), 'Icon-only buttons need a fixed touch target')
      iconButtons++
    } else if (name === 'Button') assert.equal(parents.includes('Row'), false, 'Button groups must wrap on narrow screens')
    if (name === 'Flex') { assert.match(node.arguments[0].getText(file), /wrap:\s*FlexWrap\.Wrap/); assert.deepEqual(modifiers.get('width'), ["'100%'"], 'Wrapping groups need a bounded page width'); wrappedGroups++ }
    const id = modifiers.get('id')?.[0]
    if (id === "'product-error'") {
      assert.equal(parents.includes('Scroll'), false, 'The error banner must stay visible outside history scrolling')
      assert.ok(within(node, header.node), 'The error banner must stay in the fixed header')
      errorBanner = true
    }
    if (["'product-composer'", "'product-task-actions'", "'product-send'"].includes(id)) {
      assert.equal(parents.includes('Scroll'), false, 'Conversation controls must stay outside history scrolling')
      assert.ok(within(node, footer.node), 'Conversation controls must stay inside the fixed footer')
      if (id === "'product-composer'") { assert.equal(name, 'TextArea', 'The composer must accept multiple lines'); composer = true }
      else if (id === "'product-send'") { assert.equal(name, 'Button'); send = true }
      else { assert.equal(name, 'Flex'); taskActions = true }
    }
  })
  assert.equal(scrollCount, 1, 'Native sections must not reserve independent scroll heights')
  assert.ok(history && composer && send && taskActions && errorBanner, 'History, error banner, composer, send and task actions must remain present')
  return { nativeScrollOwners: scrollCount, pageHeight: '100%', headerHeight: 'intrinsic', viewportHeight: 'remaining', contentHeight: 'intrinsic', keyboardAvoidance: 'RESIZE', wrappedButtonGroups: wrappedGroups, iconButtons, errorBannerInHeader: errorBanner, composerOutsideScroll: composer, sendOutsideScroll: send, taskActionsOutsideScroll: taskActions }
}
