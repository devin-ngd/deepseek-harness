/** Exercise the data adapter with an inert WebSocket and the normal WSS dial entry. */
import { expect, it, vi } from 'vitest'
import { dialApprovedWss, type WssDialPlan } from './wss-client.ts'
import { RELAY_MAX_MESSAGE_FRAGMENTS } from './relay-protocol.ts'

const { Socket, sockets } = vi.hoisted(() => {
  class Socket {
    static readonly OPEN = 1
    readonly readyState = Socket.OPEN
    bufferedAmount = 0
    readonly on = vi.fn()
    readonly send = vi.fn<(bytes: Uint8Array, options: { binary: boolean; fin: boolean }, callback: (error?: Error) => void) => void>()
    readonly terminate = vi.fn()
    constructor() { sockets.push(this) }
  }
  const sockets: Socket[] = []
  return { Socket, sockets }
})
vi.mock('ws', () => ({ default: Socket }))

function open(limits: Pick<WssDialPlan, 'maxFrameBytes' | 'maxBufferedBytes'>) {
  const port = dialApprovedWss({ url: 'wss://relay.example.test/harmony/relay/v1', expectedHost: 'relay.example.test',
    room: 'phase36-test-room', role: 'desktop', token: 'a'.repeat(64), handshakeTimeoutMs: 1000, ...limits })
  return { port, socket: sockets.pop()! }
}

it.each([[20, 1], [932353, 15], [8 * 1024 * 1024 + 1, RELAY_MAX_MESSAGE_FRAGMENTS]])('queues one complete encrypted message of %i bytes in %i fragments', (size, count) => {
  const { port, socket } = open({ maxFrameBytes: size, maxBufferedBytes: size })
  const data = Buffer.alloc(size, 0x7c)
  port.send(data)
  const fragments = socket.send.mock.calls
  expect(fragments).toHaveLength(count)
  expect(fragments.map(([, options]) => options)).toEqual(fragments.map((_, index) => ({ binary: true, fin: index === fragments.length - 1 })))
  expect(Buffer.concat(fragments.map(([bytes]) => bytes)).equals(data)).toBe(true)
  if (size === 932353) expect(fragments.map(([bytes]) => bytes.length)).toEqual([...Array<number>(14).fill(65536), 14849])
  expect(socket.terminate).not.toHaveBeenCalled()
})

it.each([[0, 0], [0, 1025], [1, 1024]])('denies a send of %i buffered and %i message bytes before queuing fragments', (buffered, size) => {
  const { port, socket } = open({ maxFrameBytes: 1024, maxBufferedBytes: 1024 })
  socket.bufferedAmount = buffered
  expect(() => port.send(Buffer.alloc(size))).toThrow('WSS send denied')
  expect(socket.send).not.toHaveBeenCalled()
  expect(socket.terminate).toHaveBeenCalledOnce()
})

it('terminates when a continuation cannot be queued', () => {
  const { port, socket } = open({ maxFrameBytes: 262144, maxBufferedBytes: 262144 })
  socket.send.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('fixture continuation failure') })
  expect(() => port.send(Buffer.alloc(200000))).toThrow('fixture continuation failure')
  expect(socket.send).toHaveBeenCalledTimes(2)
  expect(socket.terminate).toHaveBeenCalledOnce()
})
