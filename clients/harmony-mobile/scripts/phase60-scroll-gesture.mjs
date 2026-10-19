/** Derive gestures inside the currently observed app viewport, including floating windows. */
import assert from 'node:assert/strict'
/** @param {string} bounds Serialized bounds of the visible owned Scroll. @param {'up'|'down'} direction Scroll direction. @param {boolean} small Whether to use a short framing gesture. @returns {{x:number,startY:number,endY:number}} Points strictly inside the observed viewport. */
export function scrollGesture(bounds, direction, small = false) {
  assert.ok(direction === 'up' || direction === 'down', 'known scroll direction required')
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(bounds); assert.ok(match, 'visible viewport bounds required')
  const [left, top, right, bottom] = match.slice(1).map(Number); assert.ok([left, top, right, bottom].every(Number.isSafeInteger) && right - left >= 32 && bottom - top >= 32, 'usable viewport required')
  const x = Math.floor((left + right) / 2), middle = (top + bottom) / 2, distance = (bottom - top) * (small ? 0.06 : 0.2), startY = Math.floor(middle + (direction === 'up' ? -distance : distance)), endY = Math.floor(middle + (direction === 'up' ? distance : -distance))
  assert.ok(x > left && x < right && startY > top && startY < bottom && endY > top && endY < bottom && startY !== endY, 'gesture must stay inside owned viewport')
  return { x, startY, endY }
}
