/** Same-egress connection admission must accommodate the actual four-channel plan without changing authorization. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { assertInitialProxyCapacity } from '../scripts/relay-proxy-capacity.mjs'
const plan = { upgrades: 4, connections: 4 }
test('the preserved burst-two proposal rejects a four-upgrade same-egress start', () => { assert.throws(() => assertInitialProxyCapacity({ burst: 2, maxConnections: 4 }, plan), /burst-insufficient/) })
test('one additional excess request admits the initial plan without raising the concurrent connection cap', () => { assert.doesNotThrow(() => assertInitialProxyCapacity({ burst: 3, maxConnections: 4 }, plan)); assert.throws(() => assertInitialProxyCapacity({ burst: 3, maxConnections: 3 }, plan), /connections-insufficient/) })
test('invalid capacity inputs fail before a proposal is built', () => { assert.throws(() => assertInitialProxyCapacity({ burst: -1, maxConnections: 4 }, plan), /invalid/); assert.throws(() => assertInitialProxyCapacity({ burst: 3, maxConnections: 4 }, { upgrades: 0, connections: 4 }), /invalid/) })
