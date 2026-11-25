/** Desktop WLAN candidate rules: configured preference, physical-name auto-selection, virtual exclusion and dual-online stability. */
import { it, expect } from 'vitest'
import { readDesktopEndpoints } from './desktop-lan-endpoints.ts'

type InterfaceSnapshot = Parameters<typeof readDesktopEndpoints>[2]

const snapshot = (rows: Record<string, string[]>): InterfaceSnapshot => {
  const interfaces: InterfaceSnapshot = {}
  for (const [name, addresses] of Object.entries(rows))
    interfaces[name] = addresses.map(address => ({ family: 'IPv4', address, internal: false, netmask: '255.255.255.0', mac: '', cidr: address + '/24' }))
  return interfaces
}

const names = (wlanInterface?: string) => ({ wlanInterface, tailnetInterface: 'Tailscale', tailnetPeerAddress: '100.64.7.21' })

it('a configured WLAN interface stays the preferred candidate while another physical adapter is online', () => {
  const online = snapshot({ WLAN: ['192.168.60.10'], 以太网: ['192.168.61.20'] })
  expect(readDesktopEndpoints(names('WLAN'), 17847, online)).toEqual({ wlan: '192.168.60.10', tailnet: null, port: 17847 })
})

it('disconnecting the preferred WLAN falls back to the remaining physical adapter', () => {
  const wifi = readDesktopEndpoints(names('WLAN'), 17847, snapshot({ WLAN: ['192.168.60.10'], 以太网: ['192.168.61.20'] }))
  expect(wifi.wlan).toBe('192.168.60.10')
  const wired = readDesktopEndpoints(names('WLAN'), 17847, snapshot({ '以太网 3': ['192.168.61.20'] }))
  expect(wired.wlan).toBe('192.168.61.20')
})

it('auto-selection publishes the only physical adapter when no preferred name is configured', () => {
  expect(readDesktopEndpoints(names(), 17847, snapshot({ 以太网: ['192.168.61.20'] })).wlan).toBe('192.168.61.20')
  expect(readDesktopEndpoints(names(), 17847, snapshot({ 'Ethernet 2': ['10.1.2.3'] })).wlan).toBe('10.1.2.3')
  expect(readDesktopEndpoints(names(), 17847, snapshot({ 'Wi-Fi': ['192.168.60.11'] })).wlan).toBe('192.168.60.11')
  expect(readDesktopEndpoints(names(), 17847, snapshot({ eth0: ['10.0.0.5'] })).wlan).toBe('10.0.0.5')
  expect(readDesktopEndpoints(names(), 17847, snapshot({ en0: ['192.168.1.7'] })).wlan).toBe('192.168.1.7')
})

it('prefers wired when both links are online without a configured preference', () => {
  const online = snapshot({ WLAN: ['192.168.60.10'], Ethernet: ['192.168.61.20'] })
  expect(readDesktopEndpoints(names(), 17847, online).wlan).toBe('192.168.61.20')
})

it('virtual, tunnel, Bluetooth and loopback adapters never supply the WLAN candidate', () => {
  const rows: Record<string, string[]> = {
    'vEthernet (Default Switch)': ['192.168.61.20'],
    'VMware Network Adapter VMnet1': ['192.168.62.21'],
    'VMware Network Adapter VMnet8': ['192.168.63.22'],
    'Tailscale': ['100.64.7.20'],
    'Loopback Pseudo-Interface 1': ['127.0.0.9'],
    '蓝牙': ['192.168.61.30'],
    'WireGuard Tunnel': ['10.9.0.1'],
    'docker0': ['172.17.0.1'],
  }
  expect(readDesktopEndpoints(names(), 17847, snapshot(rows)).wlan).toBeNull()
  expect(readDesktopEndpoints(names(), 17847, snapshot({ ...rows, 以太网: ['192.168.61.20'] })).wlan).toBe('192.168.61.20')
})

it('only one unique private IPv4 address per adapter qualifies', () => {
  expect(readDesktopEndpoints(names(), 17847, snapshot({ 以太网: ['169.254.100.7'] })).wlan).toBeNull()
  expect(readDesktopEndpoints(names('WLAN'), 17847, snapshot({ WLAN: ['127.0.0.1'] })).wlan).toBeNull()
  expect(readDesktopEndpoints(names(), 17847, snapshot({ 以太网: ['192.168.61.20', '192.168.62.21'] })).wlan).toBeNull()
})

it('keeps the paired Tailnet independent and switches back to the preferred Wi-Fi after reconnect', () => {
  const vpn = { Tailscale: ['100.64.7.20'], Mihomo: ['10.0.0.1'], 'cfw-tap': ['10.7.0.1'] }
  const select = (links: Record<string, string[]>) => readDesktopEndpoints(names('WLAN'), 17847, snapshot({ ...vpn, ...links }))
  expect(select({})).toEqual({ wlan: null, tailnet: '100.64.7.20', port: 17847 })
  expect(select({ '以太网 3': ['10.0.30.93'] }).wlan).toBe('10.0.30.93')
  expect(select({ WLAN: ['192.168.60.10'] }).wlan).toBe('192.168.60.10')
})
