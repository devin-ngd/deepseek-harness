/** Test-owned finite wire faults; Session storage and unary operations are never modified. */
import type { CommandId } from '../src/link-protocol.ts'
import type { WireItem } from '../src/wire.ts'
import { TransportError } from '../src/wire.ts'
import { object, integer } from '../src/domain.ts'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { createHash } from 'node:crypto'
import { canonical } from '../src/protocol.ts'

/** Injection occurs only after an authorized real snapshot has been obtained. */
export type NativeFollowFault = 'transport-reset' | 'reset-snapshot' | 'invalid-json' | 'truncated-json' | 'unknown-required' | 'cursor-gap' | 'cursor-conflict'
/** One armed fault applies to the next follow; these controls exist only in synthetic service owners. */
export class NativeFollowFaults {
  private armed: NativeFollowFault | undefined
  private readonly consumed: NativeFollowFault[] = []
  private readonly written: NativeFollowFault[] = []
  private readonly discarded: NativeFollowFault[] = []
  private checkpoint: string | null = null
  private checkpointFrame: { commandId: CommandId; instance: string; relayCursor: number; domainCursor: number; bytes: number; payloadSha256: string; textSha256: string } | null = null
  /** @param maxFaults - explicit total injection cap for the owned test lifetime. */
  constructor(readonly maxFaults: number) { integer(maxFaults, 1) }
  /** @param fault - finite fixture selector; concurrent arming and exhausted budgets refuse. */
  arm(fault: NativeFollowFault): void {
    if (this.armed !== undefined || this.consumed.length + this.discarded.length >= this.maxFaults) throw new TransportError('fixture-fault-busy')
    this.armed = fault
  }
  /** @returns the one-shot selector; consumed means reserved, even if command admission subsequently fails. */
  take(): NativeFollowFault | undefined { const value = this.armed; this.armed = undefined; if (value !== undefined) this.consumed.push(value); return value }
  /** @param fault - reserved fault whose bytes the carrier accepted; this does not establish phone reception or semantic admission. */
  recordWrite(fault: NativeFollowFault): void { this.written.push(fault) }
  /** Discard an unconsumed injection before isolating another case; consumed accounting and the total cap are retained. */
  disarm(): void { if (this.armed !== undefined) this.discarded.push(this.armed); this.armed = undefined }
  /** @returns detached injection accounting, without any device/model access. */
  get report() { return { armed: this.armed ?? null, consumed: [...this.consumed], written: [...this.written], discarded: [...this.discarded], checkpoint: this.checkpoint, checkpointFrame: this.checkpointFrame === null ? null : { ...this.checkpointFrame } } }
  /** @param fault - taken fixture. @param streamId - actual request identity. @param reset - authorized real reset snapshot. @returns bounded synthetic bytes and whether to reset the socket; no durable event is appended. */
  bytes(fault: NativeFollowFault, streamId: CommandId, reset: WireItem): { readonly text: string; readonly resetSocket: boolean } {
    if (reset.kind !== 'reset') throw new TransportError('fixture-reset-required')
    const wrap = (item: WireItem) => JSON.stringify({ type: 'item', streamId, value: item })+'\n'
    const initial = wrap(reset), end = JSON.stringify({ type: 'end', streamId })+'\n'
    if (fault === 'transport-reset') return { text: initial, resetSocket: true }
    if (fault === 'reset-snapshot') {
      const payload=object(reset.payload),cursor=integer(payload.cursor,-1),revision=payload.assistantStream===undefined?0:integer(object(payload.assistantStream).revision)
      this.checkpoint='DSH read checkpoint '+streamId
      const checkpoint:WireItem={...reset,payload:{...payload,assistantStream:{revision,activeAttempt:{attemptId:'synthetic-read-checkpoint',startedAfterSeq:cursor,turn:1,step:1,nextIndex:1,stream:[{type:'text-delta',index:0,text:this.checkpoint}]}}}}
      const text = wrap(checkpoint)+end
      this.checkpointFrame = { commandId: streamId, instance: checkpoint.instance, relayCursor: checkpoint.relayCursor, domainCursor: cursor, bytes: Buffer.byteLength(text), payloadSha256: createHash('sha256').update(canonical(checkpoint.payload)).digest('hex'), textSha256: createHash('sha256').update(this.checkpoint).digest('hex') }
      return { text, resetSocket: false }
    }
    if (fault === 'invalid-json') return { text: initial+'{invalid-json}\n', resetSocket: false }
    if (fault === 'truncated-json') return { text: initial+'{"type":', resetSocket: false }
    const cursor = integer(object(reset.payload).cursor, -1), seq = cursor+1
    const event = { type: 'acceptance/unknown-required', seq, time: 1791774000000, data: { synthetic: true } }
    const next: WireItem = { ...reset, kind: 'event', relayCursor: reset.relayCursor+1, payload: { type: 'event', event } }
    if (fault === 'unknown-required') return { text: initial+wrap(next)+end, resetSocket: false }
    const ignorable = { ...next, payload: { type: 'event', event: { ...event, ignorable: true } } } satisfies WireItem
    if (fault === 'cursor-gap') return { text: initial+wrap({ ...ignorable, relayCursor: next.relayCursor+1 })+end, resetSocket: false }
    if (fault === 'cursor-conflict') return { text: initial+wrap(ignorable)+wrap({ ...ignorable, payload: { type: 'event', event: { ...event, ignorable: true, time: event.time+1 } } })+end, resetSocket: false }
    return assertNever(fault)
  }
}
