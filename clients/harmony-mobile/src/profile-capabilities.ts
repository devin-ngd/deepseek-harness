/** Offline negotiation of an explicitly advertised narrow profile API; metadata never grants device authority. */
import type { Branded } from './upstream.ts'
import type { DesktopId } from './protocol.ts'
import { id } from './protocol.ts'
import { fields, text } from './link-protocol.ts'
import { isRichJson } from './upstream.ts'

/** Identity of the selected profile, without its filesystem location. */
export type MobileProfileId = Branded<'mobile-profile'>
/** One profile/plugin lifetime; reload invalidates prior tickets and bindings. */
export type ProfileGeneration = Branded<'mobile-profile-generation'>
/** Capabilities of the narrow ports, independently of package release numbers. */
export const PROFILE_CAPABILITIES = ['session.prompt', 'session.cancel', 'session.follow', 'session.receipt',
  'rich.inline', 'approval.list', 'approval.respond'] as const
/** Closed capability names admitted by this consumer. */
export type ProfileCapability = typeof PROFILE_CAPABILITIES[number]
/** Explicit revisions of independently changing mobile and guest protocols. */
export interface ProfileProtocols { readonly command: string; readonly wire: string; readonly richGuest: string }
/** Host-owned advertisement; revisions describe the adapter ports, not an installed DSH compatibility claim. */
export interface ProfileAdvertisement {
  readonly schema: 'dsh-mobile-profile-capabilities/1'
  readonly desktopId: DesktopId
  readonly profileId: MobileProfileId
  readonly generation: ProfileGeneration
  readonly protocols: ProfileProtocols
  readonly capabilities: Readonly<Partial<Record<ProfileCapability, string>>>
}
/** Consumer-selected revision; optional mismatches remain disabled. */
export interface CapabilityRequirement { readonly revision: string; readonly required: boolean }
/** Every requested revision is explicit; unrequested capabilities are never enabled. */
export interface ProfileRequirements {
  readonly protocols: ProfileProtocols
  readonly capabilities: Readonly<Partial<Record<ProfileCapability, CapabilityRequirement>>>
}
/** Expected failures name the affected operation without payloads, accounts or credentials. */
export type ProfileFailure = 'metadata-missing' | 'metadata-invalid' | 'protocol-mismatch' | 'capability-missing'
  | 'capability-version' | 'capability-not-requested' | 'capability-dependency' | 'operator-not-device'
  | 'scope-denied' | 'generation-changed' | 'grant-revoked' | 'grant-expired' | 'mount-unowned'
  | 'native-confirmation-required' | 'approval-stale' | 'mount-cleanup-failed' | 'binding-closed'
/** Structured local failure; service failures keep their original identity and uncertainty. */
export class ProfileBindingError extends Error {
  /** @param code - stable rejection category. @param subject - protocol/capability or operation affected. @param options - local diagnostic cause; never serialized to a guest. */
  constructor(readonly code: ProfileFailure, readonly subject: string, options?: ErrorOptions) {
    super(code + ': ' + subject, options); this.name = 'ProfileBindingError'
  }
}
/** Resolution explains why each optional or unrequested capability is unavailable. */
export type CapabilityResolution = { readonly enabled: true; readonly revision: string }
  | { readonly enabled: false; readonly reason: 'capability-missing' | 'capability-version' | 'capability-not-requested' | 'capability-dependency' }

function capabilityName(value: string): value is ProfileCapability { return PROFILE_CAPABILITIES.some(name => name === value) }

/**
 * Parse a bounded JSON advertisement. Unknown advertised capabilities are ignored; known invalid revisions reject the metadata.
 * @param candidate - JSON received from an unactivated fixture or future authenticated host.
 * @returns detached known metadata; malformed input rejects before any service call.
 */
export function parseProfileAdvertisement(candidate: unknown): ProfileAdvertisement {
  try {
    const row = fields(candidate, ['schema', 'desktopId', 'profileId', 'generation', 'protocols', 'capabilities'])
    if (row.schema !== 'dsh-mobile-profile-capabilities/1') throw new ProfileBindingError('metadata-invalid', 'schema')
    const protocols = fields(row.protocols, ['command', 'wire', 'richGuest'])
    const source = row.capabilities
    if (!isRichJson(source) || source === null || typeof source !== 'object' || Array.isArray(source)) throw new ProfileBindingError('metadata-invalid', 'capabilities')
    const capabilities: Partial<Record<ProfileCapability, string>> = {}
    for (const [name, revision] of Object.entries(source)) if (capabilityName(name)) capabilities[name] = text(revision)
    return { schema: 'dsh-mobile-profile-capabilities/1', desktopId: id<'mobile-desktop'>(text(row.desktopId)),
      profileId: id<'mobile-profile'>(text(row.profileId)), generation: id<'mobile-profile-generation'>(text(row.generation)),
      protocols: { command: text(protocols.command), wire: text(protocols.wire), richGuest: text(protocols.richGuest) }, capabilities }
  } catch (error) {
    if (error instanceof ProfileBindingError) throw error
    throw new ProfileBindingError('metadata-invalid', 'advertisement', { cause: error })
  }
}

/** Resolved revisions are immutable data, without an authorization token or implicit defaults. */
export interface ProfilePlan {
  readonly desktopId: DesktopId
  readonly profileId: MobileProfileId
  readonly generation: ProfileGeneration
  /** @param capability - requested operation group. @returns detached resolution; a disabled group carries its rejection reason. */
  resolution(capability: ProfileCapability): CapabilityResolution
  /** @param capability - operation group about to execute. Throws a structured rejection if unavailable. */
  require(capability: ProfileCapability): void
}

/**
 * Match exact protocol and port revisions; no package-version inference, downgrade or fallback is supported.
 * @param advertisement - parsed host metadata, or null when the host has no narrow adapter.
 * @param requirements - explicit consumer protocol revisions and required/optional capabilities.
 * @returns detached resolved plan; required mismatches fail before a binding can call services.
 */
export function resolveProfileCapabilities(advertisement: ProfileAdvertisement | null, requirements: ProfileRequirements): ProfilePlan {
  if (advertisement === null) throw new ProfileBindingError('metadata-missing', 'profile')
  for (const key of ['command', 'wire', 'richGuest'] as const) if (advertisement.protocols[key] !== requirements.protocols[key]) throw new ProfileBindingError('protocol-mismatch', key)
  const resolutions = new Map<ProfileCapability, CapabilityResolution>()
  for (const capability of PROFILE_CAPABILITIES) {
    const expected = requirements.capabilities[capability], actual = advertisement.capabilities[capability]
    const result: CapabilityResolution = expected === undefined ? { enabled: false, reason: 'capability-not-requested' }
      : actual === undefined ? { enabled: false, reason: 'capability-missing' }
      : actual !== expected.revision ? { enabled: false, reason: 'capability-version' }
      : { enabled: true, revision: actual }
    if (!result.enabled && expected?.required) throw new ProfileBindingError(result.reason, capability)
    resolutions.set(capability, result)
  }
  if (resolutions.get('approval.respond')?.enabled && !resolutions.get('approval.list')?.enabled) {
    if (requirements.capabilities['approval.respond']?.required) throw new ProfileBindingError('capability-dependency', 'approval.respond')
    resolutions.set('approval.respond', { enabled: false, reason: 'capability-dependency' })
  }
  const resolution = (capability: ProfileCapability): CapabilityResolution => {
    const value = resolutions.get(capability)
    if (value === undefined) throw new Error('Incomplete profile capability resolution')
    return { ...value }
  }
  return { desktopId: advertisement.desktopId, profileId: advertisement.profileId, generation: advertisement.generation,
    resolution, require: capability => { const value = resolution(capability); if (!value.enabled) throw new ProfileBindingError(value.reason, capability) } }
}
