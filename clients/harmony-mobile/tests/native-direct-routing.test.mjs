/** Product native route selection through isolated NetworkKit and HUKS substitutes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { hasDeviceMeshRoute, isIpv4InSubnet } from '../src/device-lan-address.ts'
import { lanDiscoveryMessage, lanDiscoveryScope } from '../src/device-lan-discovery.ts'
import { NativePairedConnectionOwner, NativePairedPolicy, NativeReverseLan, connection, network, resetProductSdk, selectNativePublishedEndpoint, socket, state } from '../.build/product-native.js'

const config = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
const desktop = '192.168.1.105', tailnet = '100.91.44.10', port = 17847
const { BEARER_WIFI, BEARER_VPN } = connection.NetBearType
const link = (address, prefixLength) => ({ address: { address, family: 1 }, prefixLength })
const route = (address, prefixLength, isExcludedRoute = false) => ({ destination: link(address, prefixLength), isExcludedRoute })
const wifi = (address, prefixLength) => ({ bearer: BEARER_WIFI, linkAddresses: [link(address, prefixLength)], routes: [] })
const vpn = (address, routes) => ({ bearer: BEARER_VPN, linkAddresses: [link(address, 32)], routes })
const mesh = vpn('100.99.9.8', [route('100.64.0.0', 10)])
const proxy = vpn('172.17.1.1', [route('0.0.0.0', 0)])

for (const scenario of [
  { wifi: true, mesh: true, forward: true, reverse: true, result: 'lan', attempts: ['discovery', 'forward'] },
  { wifi: true, mesh: false, forward: false, reverse: true, result: 'lan-reverse', attempts: ['discovery', 'forward', 'reverse'] },
  { wifi: true, mesh: true, forward: false, reverse: false, result: 'tailnet', attempts: ['discovery', 'forward', 'reverse', 'tailnet'] },
  { wifi: false, mesh: true, forward: false, reverse: true, result: 'tailnet', attempts: ['tailnet'] },
]) {
  test('published routes choose ' + scenario.result + ' after ' + scenario.attempts.join(', '), async () => {
    const attempts = []
    const result = await selectNativePublishedEndpoint({
      wifi: scenario.wifi, mesh: scenario.mesh, discoveryPort: port, onWifiSubnet: () => true,
      discover: async () => { attempts.push('discovery'); return undefined },
      lookup: async () => ({ wlan: desktop, tailnet, port }),
      reverse: async () => { attempts.push('reverse'); return scenario.reverse },
      meshCanReach: async address => address === tailnet,
      dial: async address => {
        if (address === tailnet) { attempts.push('tailnet'); return true }
        assert.equal(address, desktop)
        attempts.push('forward')
        return scenario.forward
      },
    })
    assert.equal(result, scenario.result)
    assert.deepEqual(attempts, scenario.attempts)
  })
}

for (const wifi of [true, false]) {
  test('one connection survives a transient Tailnet dial on ' + (wifi ? 'off-subnet Wi-Fi' : 'cellular'), async () => {
    const attempts = []
    const path = await selectNativePublishedEndpoint({
      wifi, mesh: true, discoveryPort: port, onWifiSubnet: () => false,
      discover: async () => undefined,
      lookup: async () => ({ wlan: desktop, tailnet, port }),
      reverse: async () => { assert.fail('unexpected reverse connection') },
      meshCanReach: async address => address === tailnet,
      dial: async address => { attempts.push(address); return attempts.length === 2 },
    })
    assert.equal(path, 'tailnet')
    assert.deepEqual(attempts, [tailnet, tailnet])
  })
}

test('cancelled native reverse attempt waits for listener release before returning', async t => {
  const publication = Promise.withResolvers(), closing = Promise.withResolvers(), released = Promise.withResolvers()
  const lifetime = new AbortController()
  t.mock.method(socket, 'constructTCPSocketServerInstance', () => ({
    on() {},
    async listen(address) { assert.deepEqual(address, { address: '10.0.35.148', port, family: 1 }) },
    async close() { closing.resolve(); await released.promise },
  }))
  const owner = new NativeReverseLan({ address: '10.0.35.148', port, nonce: 'A'.repeat(43) }, 8192, 32768, 65536)
  const opening = owner.open(lifetime.signal, 3000, async (_offer, signal) => {
    await new Promise(resolve => {
      signal.addEventListener('abort', resolve, { once: true })
      publication.resolve()
    })
  })
  try {
    await publication.promise
    lifetime.abort()
    await closing.promise
    let returned = false
    void opening.then(() => { returned = true })
    await Promise.resolve()
    assert.equal(returned, false)
    released.resolve()
    assert.equal(await opening, undefined)
  } finally {
    lifetime.abort()
    released.resolve()
    await owner.close()
  }
})

test('same SSID does not make addresses from different IPv4 prefixes local', () => {
  assert.equal(isIpv4InSubnet(desktop, '10.0.34.8', 22), false)
  assert.equal(isIpv4InSubnet(desktop, '192.168.1.80', 24), true)
  assert.equal(isIpv4InSubnet(desktop, '192.168.1.80', 33), false)
  assert.equal(hasDeviceMeshRoute(tailnet, ['100.99.9.8'], [
    { address: '100.64.0.0', prefixLength: 10, excluded: false },
    { address: tailnet, prefixLength: 32, excluded: true },
  ]), false)
})

for (const [name, links, broadcast, target, discovered] of [
  ['cellular without a Mesh route', [], undefined, undefined],
  ['different WLAN subnet and unrelated VPN', [wifi('10.0.34.8', 22), proxy], '10.0.35.255', undefined],
  ['matching WLAN with Mesh also available', [wifi('192.168.1.80', 24), mesh], '192.168.1.255', desktop],
  ['a fresh reply replaces a stale WLAN hint and rejects an off-subnet reply', [wifi('192.168.1.80', 24), mesh], '192.168.1.255', '192.168.1.106', true],
  ['different WLAN subnet with a Mesh route', [wifi('10.0.34.8', 22), mesh], '10.0.35.255', tailnet],
  ['cellular with a Mesh route', [mesh], undefined, tailnet],
]) {
  test(name, async t => {
    resetProductSdk()
    const broadcasts = [], dials = [], selected = []
    let receive
    t.mock.method(connection, 'getAllNets', async () => links.map((_, netId) => ({
      netId,
      bindSocket: async () => assert.equal(links[netId].bearer, BEARER_WIFI),
    })))
    t.mock.method(connection, 'getNetCapabilities', async ({ netId }) => ({ bearerTypes: [links[netId].bearer] }))
    t.mock.method(connection, 'getConnectionProperties', async ({ netId }) => links[netId])
    t.mock.method(socket, 'constructUDPSocketInstance', () => ({
      bind: async options => assert.equal(options.address, links.find(link => link.bearer === BEARER_WIFI).linkAddresses[0].address.address),
      setExtraOptions: async options => assert.equal(options.broadcast, true),
      on: (event, callback) => { if (event === 'message') receive = callback },
      send: async ({ data, address }) => {
        broadcasts.push(address.address)
        if (!discovered) throw new Error('fixture discovery not delivered')
        const digest = async value => createHash('sha256').update(value).digest('base64url')
        const reply = await lanDiscoveryMessage(lanDiscoveryScope('fixture-route', 'desktop'), data.split(' ')[2], 'r', digest)
        const message = new TextEncoder().encode(reply).buffer
        receive({ message, remoteInfo: { family: 'IPv4', address: '10.0.34.8', port } })
        receive({ message, remoteInfo: { family: 'IPv4', address: target, port } })
      },
      close: async () => {},
    }))
    network.factory = () => ({
      on() {},
      connect: async url => { dials.push(url); return true },
      close: async () => true,
    })
    const authority = {}
    state.aliases.add('fixture-original')
    const owner = new NativePairedConnectionOwner(authority,
      new NativePairedPolicy('relay.example', 'fixture-route', 'fixture-original', 2, 26, 65536, config.maxTotalSendBytes, config.relay))
    try {
      const ports = await owner.acquireLanPortsNative(authority, 'desktop', desktop, port, tailnet, undefined, true, address => selected.push(address))
      const opening = ports.lan.open(new AbortController().signal)
      if (target === undefined) {
        await assert.rejects(opening, error => error.diagnostic?.category === 'mesh-required')
        assert.deepEqual(dials, [])
        assert.deepEqual(selected, [])
      } else {
        await opening
        assert.deepEqual(dials, ['ws://' + target + ':' + port + '/harmony/lan/v1'])
        assert.deepEqual(selected, [target])
      }
      assert.deepEqual(broadcasts, broadcast === undefined ? [] : [broadcast])
    } finally {
      await owner.closeNative(authority)
    }
  })
}
