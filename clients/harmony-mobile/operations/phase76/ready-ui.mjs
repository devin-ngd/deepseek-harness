/** Review the fresh owned layout before recording readiness or clicking Connect. */
import assert from 'node:assert/strict'
/** @param nodes - fresh attributes from the verified original bundle only. @param strings - pinned localized strings. @returns the sole visible enabled Connect control when paired and disconnected, with no failure status. */
export function reviewConnectReadyUi(nodes, strings) {
  const rows = nodes.filter(node => node.visible === 'true' && node.id === 'product-connect')
  assert.equal(rows.length, 1); assert.equal(rows[0].enabled, 'true'); assert.equal(rows[0].type, 'Button')
  for (const key of ['product_paired', 'product_disconnected']) assert.equal(nodes.filter(node => node.visible === 'true' && node.text === strings.get(key)).length, 1)
  assert.equal(nodes.some(node => node.visible === 'true' && node.text === strings.get('product_operation_failed')), false)
  return rows[0]
}
