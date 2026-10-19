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

const nativeComponents = ['Scroll', 'Column', 'Row', 'Flex', 'Text', 'TextInput', 'TextArea', 'Checkbox', 'Button', 'ForEach', 'List', 'ListItem', 'ProductRichSurface', 'TaskState']
function parse(ts, source) {
  const file = ts.createSourceFile('Index.ets', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.ETS, { ets: { components: nativeComponents } })
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

/** @param ts - Installed official ETS parser. @param source - Inert native page source. @returns Stable button guards and action callbacks for compatibility comparison. */
export function productButtonActions(ts, source) {
  const { file, build } = parse(ts, source), printer = ts.createPrinter(), result = []
  walk(ts, build.body, node => {
    if (!ts.isEtsComponentExpression(node) || node.expression.text !== 'Button') return
    const label = node.arguments[0]
    if (!ts.isCallExpression(label) || label.expression.getText(file) !== '$r') return
    const modifiers = attributes(ts, node, file)
    result.push({ resource: label.arguments[0].text, enabled: modifiers.get('enabled')?.[0] ?? null, onClick: modifiers.get('onClick')?.[0] ?? null })
  })
  // Reparse each expression to remove source indentation without changing its tokens.
  for (const row of result) for (const name of ['enabled', 'onClick']) if (row[name] !== null) {
    const value = ts.createSourceFile('action.ts', '(' + row[name] + ')', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    row[name] = printer.printNode(ts.EmitHint.Expression, value.statements[0].expression, value)
  }
  return result.sort((left, right) => left.resource.localeCompare(right.resource))
}

/** @param ts - Installed official ETS parser. @param source - Native page source to check. @returns Scroll, keyboard and wrapping facts; throws when controls can escape the root scroll. */
export function auditProductLayout(ts, source) {
  const { file, page, build } = parse(ts, source)
  assert.equal(build.body.statements.length, 1, 'All native controls must share the root scroll')
  const root = component(ts, build.body.statements[0].expression, file)
  assert.equal(root.name, 'Scroll', 'The page root must scroll')
  assert.deepEqual(root.attributes.get('height'), ["'100%'"], 'Only the scroll viewport fills the page height')
  assert.deepEqual(root.attributes.get('scrollable'), ['ScrollDirection.Vertical'])
  const content = component(ts, root.node.body.statements[0].expression, file)
  assert.equal(content.name, 'Column')
  assert.equal(content.attributes.has('height'), false, 'Scroll content must retain intrinsic height')
  let resize = false
  const appear = page.members.find(node => node.name?.getText(file) === 'aboutToAppear')
  walk(ts, appear.body, node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'setKeyboardAvoidMode' && node.arguments[0]?.getText(file) === 'KeyboardAvoidMode.RESIZE') resize = true
  })
  assert.equal(resize, true, 'The keyboard must resize the scroll viewport')
  let scrollCount = 0, composer = false, taskActions = false, wrappedGroups = 0
  walk(ts, build.body, node => {
    if (!ts.isEtsComponentExpression(node)) return
    const name = node.expression.text, modifiers = attributes(ts, node, file), parents = ancestors(ts, node)
    if (name === 'Scroll') scrollCount++
    assert.ok(!['List', 'ListItem'].includes(name), 'The transcript must use the page scroll rather than another native viewport')
    if (name === 'Column') assert.equal(modifiers.has('height'), false, 'Native section height must follow content')
    if (name === 'Button') assert.equal(parents.includes('Row'), false, 'Button groups must wrap on narrow screens')
    if (name === 'Flex') { assert.match(node.arguments[0].getText(file), /wrap:\s*FlexWrap\.Wrap/); assert.deepEqual(modifiers.get('width'), ["'100%'"], 'Wrapping groups need a bounded page width'); wrappedGroups++ }
    if (modifiers.get('id')?.[0] === "'product-composer'") { assert.equal(parents.filter(value => value === 'Scroll').length, 1); composer = true }
    if (modifiers.get('id')?.[0] === "'product-task-actions'") { assert.equal(name, 'Flex'); assert.equal(parents.filter(value => value === 'Scroll').length, 1); taskActions = true }
  })
  assert.equal(scrollCount, 1, 'Native sections must not reserve independent scroll heights')
  assert.ok(composer && taskActions, 'Composer and actions must remain in the page scroll')
  return { nativeScrollOwners: scrollCount, viewportHeight: '100%', contentHeight: 'intrinsic', keyboardAvoidance: 'RESIZE', wrappedButtonGroups: wrappedGroups, composerInRootScroll: composer, taskActionsInRootScroll: taskActions }
}
