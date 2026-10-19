/** Read-only diagnostic for the actual PhoneCore generation check; it adds no guest or native UI method. */
import type { NativeProvider, PhoneCore } from './phone-core.ts'
import type { NativeReplayObserver } from './native-replay-policy.ts'
import type { JsonValue, Branded } from './upstream.ts'
import { object, string } from './domain.ts'
import { TransportError } from './wire.ts'
import type { WireInstance } from './wire.ts'
import { canonical, id } from './protocol.ts'
import { bytesToHex, sha256 } from './upstream-domain.ts'

/** @param provider - actual private native byte provider, or an explicit offline substitute in tests. @param report - diagnostic private-port sink; failures are retained without changing product reads. @returns provider observer which attempts only a stale rich snapshot read after a real service generation changes. */
export const observeNativeGeneration: NativeReplayObserver = (provider: NativeProvider, report: (value: JsonValue) => void) => {
  let core: PhoneCore | undefined, instance: WireInstance | null = null, lastMount: Branded<'rich-inline-mount'> | null = null, retired = false
  let diagnosticFailures = 0
  const observe = (make: () => JsonValue): void => {
    try { report(make()) }
    catch (error) {
      void error; diagnosticFailures++
      try { report({ probe: 'observation-failed', code: 'native-observer-failed' }) }
      catch (sinkError) { void sinkError } // The sticky count remains when the diagnostic port is unavailable.
    }
  }
  const forwarded = new Map<Branded<'rich-inline-mount'>, number>()
  const wrapped: NativeProvider = {
    async request(command, signal) {
      const mountId = command.payload.mountId
      if (typeof mountId === 'string') { const key = id<'rich-inline-mount'>(mountId); forwarded.set(key, (forwarded.get(key) ?? 0)+1) }
      const value = await provider.request(command,signal)
      if (command.operation === 'rich.mount') lastMount = id<'rich-inline-mount'>(string(object(value).mountId,128))
      return value
    },
    async *follow(command,resume,signal) {
      for await (const item of provider.follow(command,resume,signal)) {
        observe(() => ({ probe: 'follow-decoded', commandId: command.commandId, instance: item.instance, relayCursor: item.relayCursor, kind: item.kind, payloadSha256: bytesToHex(sha256(new TextEncoder().encode(canonical(item.payload)))) }))
        const previous = instance, stale = item.kind === 'reset' && previous !== null && previous !== item.instance ? lastMount : null
        instance = item.instance
        yield item
        if (core && core.model.resume.instance === item.instance && core.model.resume.relayCursor === item.relayCursor) {
          const view = core.model.view
          observe(() => ({ probe: 'follow-admitted', commandId: command.commandId, instance: item.instance, relayCursor: item.relayCursor, domainCursor: view.cursor, connection: view.connection, readOnly: view.readOnly, liveTextBytes: new TextEncoder().encode(view.liveText).byteLength, liveTextSha256: bytesToHex(sha256(new TextEncoder().encode(view.liveText))) }))
        }
        if (!retired && stale !== null && core) {
          const before = forwarded.get(stale) ?? 0
          let refused = false
          try { await core.request('rich.snapshot',{mountId:stale}) }
          catch (error) { if (!(error instanceof TransportError) || error.code !== 'stale-mount') throw error; refused = true }
          const sent = (forwarded.get(stale) ?? 0)-before
          observe(() => ({probe:'old-mount-generation',passed:refused&&sent===0,forwarded:sent,previousInstance:previous,instance:item.instance}))
          if (!refused || sent !== 0) throw new TransportError('native-generation-probe-failed')
        }
      }
    },
    async close() { retired = true; core = undefined; await provider.close(); forwarded.clear() },
  }
  return {provider:wrapped,get diagnosticFailures() {return diagnosticFailures},observeCore(value) {core=value},observeCommand(value) {observe(() => ({probe:'command-generation',...value,clockSource:'ArkWeb monotonic epoch',unit:'epoch-ms'}))}}
}
