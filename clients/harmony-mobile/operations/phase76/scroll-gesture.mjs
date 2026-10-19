/** Derive gestures inside the currently observed app viewport, including floating windows. */
import assert from 'node:assert/strict'
/** @param {string} bounds Serialized bounds of the visible owned Scroll. @param {'up'|'down'} direction Scroll direction. @param {boolean} small Whether to use a short framing gesture. @param {string[]} avoidBounds Visible interactive child bounds whose horizontal spans must be avoided. @returns {{x:number,startY:number,endY:number}} Points strictly inside the observed viewport. */
export function scrollGesture(bounds, direction, small = false, avoidBounds = []) {
  assert.ok(direction === 'up' || direction === 'down', 'known scroll direction required')
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(bounds); assert.ok(match, 'visible viewport bounds required')
  const [left, top, right, bottom] = match.slice(1).map(Number); assert.ok([left, top, right, bottom].every(Number.isSafeInteger) && right - left >= 32 && bottom - top >= 32, 'usable viewport required')
  const blocked = avoidBounds.map(value => { const parts = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(value); assert.ok(parts, 'interactive bounds required'); return parts.slice(1).map(Number) }).filter(parts => parts[3] > top && parts[1] < bottom && parts[2] > parts[0])
  const free = value => blocked.every(parts => value < parts[0] || value > parts[2])
  const candidates = [Math.floor((left + right) / 2), Math.floor(left + (right - left) * 0.02), Math.floor(right - (right - left) * 0.02)], x = candidates.find(free); assert.ok(x !== undefined, 'outer scroll lane unavailable')
  const middle = (top + bottom) / 2, distance = (bottom - top) * (small ? 0.06 : 0.2), startY = Math.floor(middle + (direction === 'up' ? -distance : distance)), endY = Math.floor(middle + (direction === 'up' ? distance : -distance))
  assert.ok(x > left && x < right && startY > top && startY < bottom && endY > top && endY < bottom && startY !== endY, 'gesture must stay inside owned viewport')
  return { x, startY, endY }
}
