/** Foreground Wi-Fi listener and one admitted reverse TCP connection. */
import { socket } from '@kit.NetworkKit'
import { ReverseTcpPort, NativePort, NativeSignal, NativeReverseOffer, NativeReverseController, admitReverseTcp, reverseAttemptController } from '../paired/PairedCore'

/** One attempt owns its listener, pending peer, deadlines and send queue until the connection owner closes it. */
export class NativeReverseLan {
  private readonly attempt: NativeReverseController = reverseAttemptController()
  private server: socket.TCPSocketServer | undefined
  private listening: Promise<void> | undefined
  private listenerClose: Promise<void> | undefined
  private peer: socket.TCPSocketConnection | undefined
  private port: ReverseTcpPort | undefined
  private peerClose: Promise<void> | undefined
  private admission: Promise<void> | undefined
  private closing: Promise<void> | undefined
  private queued: number = 0
  private totalSent: number = 0
  private writes: Promise<void> = Promise.resolve()
  private retired: boolean = false
  private accepting: boolean = true
  private readonly offer: NativeReverseOffer
  private readonly maxFrame: number
  private readonly maxQueued: number
  private readonly maxTotalSend: number

  constructor(offer: NativeReverseOffer, maxFrame: number, maxQueued: number, maxTotalSend: number) {
    this.offer = offer
    this.maxFrame = maxFrame
    this.maxQueued = maxQueued
    this.maxTotalSend = maxTotalSend
  }

  /** Open the Wi-Fi listener before publishing. Failure retires the attempt before the caller can try Tailnet. */
  async open(signal: NativeSignal, waitMs: number, publish: (offer: NativeReverseOffer, signal: NativeSignal) => Promise<void>): Promise<NativePort | undefined> {
    const abort = (): void => this.attempt.abort()
    const timer = setTimeout(abort, waitMs)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted || this.retired) abort()
    const local = this.attempt.signal
    let finish: (value: NativePort | undefined) => void = () => {}
    const incoming = new Promise<NativePort | undefined>(resolve => { finish = resolve })
    const expire = (): void => finish(undefined)
    local.addEventListener('abort', expire, { once: true })
    let selected: NativePort | undefined
    try {
      if (local.aborted) return undefined
      const server = socket.constructTCPSocketServerInstance()
      this.server = server
      server.on('error', abort)
      server.on('connect', (peer: socket.TCPSocketConnection): void => {
        if (!this.accepting || local.aborted || this.port !== undefined) {
          void peer.close().catch((): void => { console.warn('DSH_REVERSE_PEER_CLOSE_FAILED') })
          return
        }
        this.admission = this.accept(peer, local, finish)
        void this.admission.catch(abort)
      })
      this.listening = server.listen({ address: this.offer.address, port: this.offer.port, family: 1 })
      await this.listening
      if (local.aborted) return undefined
      await publish(this.offer, local)
      selected = await incoming
      if (local.aborted || this.retired) selected = undefined
    } catch (error) { void error; console.info('DSH_CONNECTION_PATH=phone-reverse-unavailable') }
    finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      local.removeEventListener('abort', expire)
      this.accepting = false
      if (selected === undefined) await this.close()
      else {
        try { await this.closeListener() }
        catch (error) { await this.close(); throw (error as Error) }
      }
    }
    return selected
  }

  private async accept(peer: socket.TCPSocketConnection, signal: NativeSignal, finish: (value: NativePort | undefined) => void): Promise<void> {
    this.peer = peer
    const port = new ReverseTcpPort(this.maxFrame, this.maxQueued,
      (bytes: Uint8Array): void => this.write(peer, bytes), (): number => this.queued,
      (): void => { void this.closePeer().catch((): void => { console.warn('DSH_REVERSE_PEER_CLOSE_FAILED') }) })
    this.port = port
    peer.on('close', (): void => { if (this.peer === peer) this.peer = undefined; port.terminate() })
    peer.on('error', (): void => port.terminate())
    peer.on('message', (frame: socket.SocketMessageInfo): void => port.receive(new Uint8Array(frame.message)))
    if (await admitReverseTcp(port, this.offer.nonce, 'phone', signal) && !signal.aborted && this.peer === peer) {
      this.accepting = false
      finish(port)
      return
    }
    port.terminate()
    await this.peerClose
    if (this.port === port) {
      this.port = undefined
      this.peerClose = undefined
    }
  }

  private write(peer: socket.TCPSocketConnection, bytes: Uint8Array): void {
    if (this.peer !== peer || this.totalSent + bytes.length > this.maxTotalSend) throw new Error('native reverse send denied')
    this.queued += bytes.length
    this.totalSent += bytes.length
    this.writes = this.writes.then(async (): Promise<void> => {
      if (this.peer === peer) await peer.send({ data: bytes.buffer as ArrayBuffer })
    }).catch((): void => this.port?.terminate()).finally((): void => { this.queued -= bytes.length })
  }

  private closePeer(): Promise<void> {
    if (this.peerClose !== undefined) return this.peerClose
    const peer = this.peer
    if (peer === undefined) return Promise.resolve()
    this.peerClose = peer.close().catch((error: Error): void => {
      if (this.peer === peer) throw error
    }).finally((): void => { if (this.peer === peer) this.peer = undefined })
    return this.peerClose
  }

  private closeListener(): Promise<void> {
    if (this.listenerClose !== undefined) return this.listenerClose
    this.listenerClose = (async (): Promise<void> => {
      try { await this.listening } catch (error) { void error; return }
      await this.server?.close()
    })()
    return this.listenerClose
  }

  /** Cancel pending publication and wait for release of the listener and TCP peer. */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.retired = true
    this.accepting = false
    this.attempt.abort()
    this.port?.terminate()
    this.closing = (async (): Promise<void> => {
      const result = await Promise.allSettled([this.admission, this.closePeer(), this.closeListener(), this.writes])
      if (result.some(value => value.status === 'rejected')) throw new Error('native reverse LAN cleanup failed')
    })()
    return this.closing
  }
}
