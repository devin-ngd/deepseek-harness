/** Human slash-command entry in the existing Host; disabled loading performs no identity, grant or transport IO. */
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-user-questions'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { id, type SessionId } from '../../src/protocol.ts'
import { createPairing, DesktopIdentitySigner, type DesktopFirstUsePolicy } from './product.ts'
import type { DesktopFirstUse } from './first-use.ts'
import * as Product from './product.ts'
import { WindowsCurrentUserProtection } from './windows-protection.ts'
import { DesktopIdentityError } from './identity.ts'
import { validateDesktopWssPolicy } from '../../integration/desktop-wss.ts'
import { validatePairedRelayPolicy } from '../../src/paired-relay.ts'
import { validateRecoveryPolicy } from '../../src/connection-supervisor.ts'
const positive = z.number().int().positive().max(0x7fffffff)
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
const settings = z.object({ enabled: z.literal(true), desktopId: identifier, deviceId: identifier,
  identityAlias: z.string().regex(/^[a-z][a-z0-9-]{0,126}$/), identityProtectionTimeoutMs: positive,
  audience: z.string().max(253).regex(/^[a-z0-9.-]+$/), grantTtlMs: positive.max(1800000), publicTrustMaxBytes: positive,
  enrollmentTtlMs: positive.max(600000), maxIssues: positive, sweepIntervalMs: positive, journalMode: z.enum(['create', 'reopen']),
  recovery: z.object({ maxAttempts: positive, retryDelayMs: positive }).strict(),
  auth: z.object({ maxGrantTtlMs: positive.max(1800000), maxConnectionTtlMs: positive.max(1800000), challengeTtlMs: positive, maxDevices: z.literal(1), maxChallengeIssues: positive, maxSessions: z.literal(1), maxProofBytes: positive }).strict(),
  relay: z.object({ maxProofs: positive, maxQueuedBytes: positive, maxChallengeTtlMs: positive, maxRoomTtlMs: positive, handshakeMs: positive, e2e: z.object({ maxFrameBytes: positive, maxPlaintextBytes: positive, maxFrames: positive }).strict() }).strict(),
  wss: z.object({ host: z.string(), handshakeMs: positive, maxFrameBytes: positive, maxBufferedBytes: positive, maxControlFrames: positive }).strict(),
}).strict()
/** Explicit enabled settings for the Host-owned pairing command; all deployment limits are configured. */
export type PairingOptions = z.infer<typeof settings>
/** Default-disabled Cordis command entry. */
export const name = '@deepseek-ai/dsh-experimental-harmony-mobile/pairing'
const required = ['commands', 'userQuestions', 'connection', 'agents', 'sessionController', 'sessionPersistence', 'credentials', 'authorization', 'remoteAccess', 'profileContext', 'typert', 'typertGateway', 'richInline', 'workspaceRegistry', 'storageDomain'] as const
interface Pending { readonly sessionId: SessionId; readonly owner: DesktopFirstUse; readonly context: Context; readonly dispose: () => Promise<void>; readonly signer: DesktopIdentitySigner; activated: boolean; confirmed?: { readonly input: string; readonly result: string } }
/** Human command state and original authorization owner; no model/tool or phone RPC invokes these methods. */
class PairingCommand {
  private readonly authority = {}
  private readonly lifetime = new AbortController()
  private pending: Pending | undefined
  private stopProduct: (() => Promise<void>) | undefined
  private closed = false
  private busy = false
  constructor(private readonly ctx: Context, private readonly options: PairingOptions) {}
  private async approve(invocation: CommandInvocation, detail: string): Promise<boolean> {
    const answer = await this.ctx.userQuestions.ask({ agent: invocation.agent, signal: invocation.signal, questions: [{ id: 'harmony-pair', header: 'Harmony pairing', question: detail, options: [{ label: 'Deny' }, { label: 'Allow' }] }] })
    invocation.signal.throwIfAborted()
    return !this.closed && answer.answers.length === 1 && answer.answers[0]?.id === 'harmony-pair' && answer.answers[0].selected.length === 1 && answer.answers[0].selected[0] === 'Allow' && answer.answers[0].custom === undefined
  }
  /** @param invocation - original human command invocation. @returns content-free failure or public pairing material in the original command UI; never a model message. */
  async run(invocation: CommandInvocation): Promise<CommandResult> {
    invocation = { ...invocation, signal: AbortSignal.any([invocation.signal, this.lifetime.signal]) }
    const peer = this.ctx.invocation?.peer
    if (this.closed || this.busy || peer !== undefined && peer !== this.ctx.connection.browserPeer) return { kind: 'error', text: 'Pairing requires the local desktop command UI.' }
    const profile = this.ctx.get('profileContext')
    if (profile === undefined || this.ctx.agents.get(invocation.agent.id) !== invocation.agent || !this.ctx.agents.roots().includes(invocation.agent)) return { kind: 'error', text: 'Select a live root conversation in this desktop profile.' }
    const input = invocation.rawInput.trim(), split = input.search(/\s/), verb = split < 0 ? input : input.slice(0, split), raw = split < 0 ? '' : input.slice(split).trim()
    if (new TextEncoder().encode(raw).length > this.options.publicTrustMaxBytes) return { kind: 'error', text: 'Public pairing input exceeds the configured capacity.' }
    const sessionId = invocation.agent.session.id
    if (this.pending !== undefined && this.pending.sessionId !== sessionId) return { kind: 'error', text: 'Return to the selected pairing conversation; another Session cannot complete or reuse it.' }
    this.busy = true
    try {
      invocation.signal.throwIfAborted()
      if (verb === '' || verb === 'status') return { kind: 'success', text: JSON.stringify({ profileId: profile.name, sessionId, state: this.pending === undefined ? 'not-started' : this.pending.activated ? 'transport-started' : this.pending.confirmed === undefined ? 'offered' : 'confirmed', publicResult: this.pending?.confirmed?.result, steps: ['identity-create (only if absent)', 'start <phone public identity JSON>', 'confirm <signed phone reply JSON>', 'connect (after phone and relay are ready)', 'stop'] }) }
      const protection = new WindowsCurrentUserProtection({ timeoutMs: this.options.identityProtectionTimeoutMs })
      if (verb === 'identity-create') {
        if (this.pending !== undefined || raw !== '' || !await this.approve(invocation, 'Create one protected desktop identity in this profile: ' + this.options.identityAlias + '?')) return { kind: 'error', text: 'Identity creation was not approved.' }
        return { kind: 'success', text: JSON.stringify(await DesktopIdentitySigner.initialize(this.ctx, this.authority, this.authority, this.options.identityAlias, true, protection)) }
      }
      if (verb === 'start') {
        if (this.pending !== undefined) return { kind: 'error', text: 'Pairing is already pending; finish it or stop it first.' }
        const publicIdentity: unknown = JSON.parse(raw)
        if (!await this.approve(invocation, 'Use the existing desktop identity to sign a pairing offer for profile ' + profile.name + ', Session ' + sessionId + ', for at most ' + this.options.grantTtlMs + 'ms?')) return { kind: 'error', text: 'Pairing was not approved.' }
        const signer = await DesktopIdentitySigner.open(this.ctx, this.authority, this.authority, this.options.identityAlias, protection)
        try {
          invocation.signal.throwIfAborted()
          const policy: Omit<DesktopFirstUsePolicy, 'desktopId' | 'profileId' | 'sessionId'> = { ...this.options, deviceId: id<'mobile-device'>(this.options.deviceId), pairId: randomUUID() }
          let selected: { owner: DesktopFirstUse; context: Context } | undefined
          const fork = this.ctx.plugin({ name: 'harmony-local-pairing-owner', inject: [...required], apply: async (inner: Context) => { selected = { context: inner, owner: await createPairing(inner, this.authority, { enabled: true, desktopId: this.options.desktopId, profileId: profile.name, sessionId }, policy, signer) } } })
          await fork
          if (selected === undefined) throw new Error('pairing owner did not mount')
          const { owner, context } = selected
          this.pending = { sessionId, owner, context, dispose: () => fork.dispose(), signer, activated: false }
          invocation.signal.throwIfAborted()
          return { kind: 'success', text: JSON.stringify(await owner.issue(this.authority, publicIdentity)) }
        } catch (error) { if (this.pending?.signer === signer) await this.clear(); else signer.close(); throw error }
      }
      const pending = this.pending
      if (pending === undefined) return { kind: 'error', text: 'Run start in the selected conversation first.' }
      if (verb === 'confirm') {
        const response: unknown = JSON.parse(raw)
        if (pending.confirmed !== undefined) return pending.confirmed.input === JSON.stringify(response) ? { kind: 'success', text: pending.confirmed.result } : { kind: 'error', text: 'This pairing is already confirmed; a changed response cannot replace it.' }
        const result = await pending.owner.confirm(this.authority, response, { notify: () => {}, prompt: async question => await this.approve(invocation, question.message) ? 'allow' : 'deny' })
        pending.confirmed = { input: JSON.stringify(response), result: JSON.stringify({ phone: result.publicDocument, relayPair: result.relayPair, next: 'Import the public phone record and prepare the approved relay, then run /harmony-pair connect.' }) }
        return { kind: 'success', text: pending.confirmed.result }
      }
      if (verb === 'connect') {
        if (raw !== '' || pending.confirmed === undefined || pending.activated || !await this.approve(invocation, 'The phone and approved relay are ready. Start the bounded outbound connection for this Session now?')) return { kind: 'error', text: 'Connection was not approved or is already active.' }
        invocation.signal.throwIfAborted(); pending.owner.install(this.authority)
        const plugin = pending.context.plugin(Product, pending.owner.productOptions(this.authority, this.options.journalMode)); await plugin
        this.stopProduct = () => plugin.dispose(); pending.activated = true
        return { kind: 'success', text: 'Desktop pairing transport started for the selected Session; task completion and phone authentication are separate.' }
      }
      if (verb === 'stop' && raw === '') { await pending.owner.revoke(this.authority); await this.clear(); return { kind: 'success', text: 'Desktop grant revoked; relay public revocation remains separately owned.' } }
      return { kind: 'error', text: 'Use status, identity-create, start, confirm, connect or stop.' }
    } catch (error) {
      if (error instanceof DesktopIdentityError) return { kind: 'error', text: 'Desktop identity refused: ' + error.code + '. Keep existing records; create a new protected identity only after an explicit local decision.' }
      if (error instanceof SyntaxError || error instanceof z.ZodError) return { kind: 'error', text: 'Invalid public pairing JSON. Copy the complete original phone identity or signed reply.' }
      return { kind: 'error', text: 'Pairing did not complete. Existing grants and records were retained; inspect the local authorization state before retrying.' }
    }
    finally { this.busy = false }
  }
  private async clear(): Promise<void> { await this.stopProduct?.(); this.stopProduct = undefined; const pending = this.pending; this.pending = undefined; try { await pending?.dispose() } finally { pending?.signer.close() } }
  /** @returns after owned commands/transport close; accepted work and durable grant records are retained. */
  async close(): Promise<void> { this.closed = true; this.lifetime.abort(); await this.clear() }
}
/** @param ctx - existing desktop Host context. @param request - default-disabled local deployment settings. @returns after registering the discoverable human command; activation requires separate human interactions. */
export async function apply(ctx: Context, request: unknown = { enabled: false }): Promise<void> {
  if (z.object({ enabled: z.literal(false).optional() }).strict().safeParse(request).success) return
  const options = settings.parse(request)
  validateDesktopWssPolicy(options.wss); validatePairedRelayPolicy(options.relay); validateRecoveryPolicy(options.recovery)
  if (options.audience !== options.wss.host || options.grantTtlMs > options.auth.maxGrantTtlMs) throw new Error('harmony pairing policy denied')
  for (const service of required) if (ctx.get(service) === undefined) throw new Error('harmony pairing requires service: ' + service)
  if (ctx.get('harmonyAuthenticatedDevices') !== undefined) throw new Error('existing Harmony device owner must be closed before enabling pairing commands')
  await ctx.inject([...required], inner => {
    const command = new PairingCommand(inner, options)
    inner.effect(() => () => command.close())
    inner.effect(() => inner.commands.register({ name: 'harmony-pair', description: 'Pair a phone with this conversation on the current desktop', input: { hint: 'status | identity-create | start <public JSON> | confirm <public JSON> | connect | stop' }, recordInput: false, handler: invocation => command.run(invocation) }))
  })
}
