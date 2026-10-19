/** Real full-screen and floating-window observations constrain every generated touch point. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollGesture } from '../scripts/phase61-scroll-gesture.mjs'
for (const [name, bounds, rect] of [['full-screen', '[0,131][1320,2754]', [0,131,1320,2754]], ['floating', '[842,169][1238,817]', [842,169,1238,817]]]) {
  test(name + ' gestures stay inside the owned viewport in both directions and sizes', () => {
    const [left, top, right, bottom] = rect
    for (const direction of ['up', 'down']) for (const small of [false, true]) { const point = scrollGesture(bounds, direction, small); assert.ok(point.x > left && point.x < right); assert.ok(point.startY > top && point.startY < bottom); assert.ok(point.endY > top && point.endY < bottom); assert.equal(point.startY < point.endY, direction === 'up') }
  })
}
test('short framing moves less than normal scrolling', () => {
  const small = scrollGesture('[0,131][1320,2754]', 'up', true), normal = scrollGesture('[0,131][1320,2754]', 'up')
  assert.ok(Math.abs(small.endY - small.startY) < Math.abs(normal.endY - normal.startY))
})
test('invalid, negative, collapsed or tiny viewports and unknown directions are refused', () => {
  for (const bounds of ['', '[-1,0][300,900]', '[0,0][0,900]', '[0,0][300,20]']) assert.throws(() => scrollGesture(bounds, 'up'))
  assert.throws(() => scrollGesture('[0,0][300,900]', 'sideways'))
})

test('nested input fields do not capture the outer scroll gesture', () => {
  for (const [root, input, left, right] of [['[0,131][1320,2754]', '[54,1363][1266,1667]', 54, 1266], ['[842,169][1238,817]', '[859,580][1222,672]', 859, 1222]]) {
    const point = scrollGesture(root, 'down', true, [input]); assert.ok(point.x < left || point.x > right)
  }
  assert.throws(() => scrollGesture('[0,0][300,900]', 'down', true, ['[0,0][300,900]']), /outer scroll lane unavailable/)
})
