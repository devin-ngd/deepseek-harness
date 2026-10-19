/** HAP-owned fixed-replay bootstrap for the separately approved emulator test application. */
import type { NativeDocumentConfig } from './native-document.ts'
import { NativeAppHost } from './native-app-host.ts'
import { nativeBootstrapPolicy } from './native-policy.ts'
import { NativePortHttpBytePort } from './native-port-http.ts'
import { ByteNetworkPhone } from './network-phone.ts'
import { object } from './domain.ts'
import { jsonPayload, TransportError } from './wire.ts'
import { id } from './protocol.ts'
import type { NativeProvider, PhoneCore, CommandGeneration } from './phone-core.ts'
import type { JsonValue } from './upstream.ts'

/** HAP-selected test observer; no wire field or generated guest can select it. */
export type NativeReplayObserver = (provider: NativeProvider, report: (value: JsonValue) => void) => { readonly provider: NativeProvider; readonly diagnosticFailures?: number; observeCore(core: PhoneCore): void; observeCommand?(value: CommandGeneration): void }

/** @param raw - private native bootstrap packet from the verified HAP. @returns the exact synthetic Session and native byte provider; arbitrary destinations and extra fields refuse before IO. */
export function nativeReplayBootstrap(raw: string, observe?: NativeReplayObserver): NativeDocumentConfig {
  if (new TextEncoder().encode(raw).byteLength > 16384) throw new TransportError('native-replay-config-invalid')
  const envelope = object(jsonPayload(JSON.parse(raw))), replay = object(envelope.replay)
  if (Object.keys(envelope).length !== 3 || envelope.protocol !== 'dsh-native-replay-bootstrap/1'
    || Object.keys(replay).length !== 4 || replay.desktopId !== 'phase11-desktop' || replay.deviceId !== 'phase11-phone' || replay.sessionId !== 'phase11-session' || replay.baseUrl !== 'http://127.0.0.1:18081/') throw new TransportError('native-replay-config-invalid')
  const policy = nativeBootstrapPolicy(JSON.stringify({ protocol: 'dsh-native-bootstrap/1', policy: envelope.policy }))
  const baseUrl = replay.baseUrl
  const owner = {desktopId: id<'mobile-desktop'>(replay.desktopId), deviceId: id<'mobile-device'>(replay.deviceId), sessionId: id<'SessionId'>(replay.sessionId)}
  return { policy, create: (io, frame, publish) => new NativeAppHost(io, policy, publish, frame, [owner.sessionId], () => {
    const provider = new ByteNetworkPhone({enabled:true,mode:'loopback-fixed-replay',baseUrl,maxFrameBytes:policy.domain.maxBytes,maxReadChunkBytes:policy.chunkBytes,requestTimeoutMs:policy.port.timeoutMs,maxInFlight:policy.read.maxInFlight},new NativePortHttpBytePort(io,{baseUrl,maxChunkBytes:policy.chunkBytes}))
    if (!observe) return { provider,owner,mode:'fixed-replay',metrics:()=>({tasks:0,actions:0,mounts:0}) }
    const observed = observe(provider, value => io.publish(jsonPayload({protocol:'dsh-native-host/1',kind:'ui.reply',generation:policy.port.generation,id:'native-acceptance-report',ok:true,value})))
    return { ...observed,get diagnosticFailures() { return observed.diagnosticFailures ?? 0 },owner,mode:'fixed-replay',metrics:()=>({tasks:0,actions:0,mounts:0}) }
  }) }
}
