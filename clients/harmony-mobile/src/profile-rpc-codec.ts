/** Shared strict JSON parameter codec for inactive and production profile wrappers; creates no registration or transport. */
import type { TypertCodec, TypertSchema } from '@deepseek-ai/dsh-typert-protocol'
import { fields } from './link-protocol.ts'
/** Fixed profile wrapper revision, independent of the existing command and rich protocols. */
export const PROFILE_RPC_CODEC = 'dsh-mobile-profile-rpc/1'
/** Admitted JSON parameter; the original packet is parsed by the existing command owner. */
export interface ProfileRpcArgument { readonly version: typeof PROFILE_RPC_CODEC; readonly packet: string }
/** Expected boundary rejection without user content. */
export class ProfileCodecError extends Error {
  /** @param code - invalid fields/bytes or unsupported revision. @param options - diagnostic cause. */
  constructor(readonly code: 'codec-version' | 'codec-invalid', options?: ErrorOptions) { super(code, options); this.name = 'ProfileCodecError' }
}
/** Framework descriptor and typed schema have one parser. */
export interface ProfileRpcCodec { readonly schema: TypertSchema<ProfileRpcArgument>; readonly descriptor: TypertCodec }
/** @param maxEnvelopeBytes - explicit positive argument limit. @returns strict codec; unknown revisions reject before any service owner. */
export function profileRpcCodec(maxEnvelopeBytes: number): ProfileRpcCodec {
  if (!Number.isSafeInteger(maxEnvelopeBytes) || maxEnvelopeBytes < 1) throw new ProfileCodecError('codec-invalid')
  const schema: TypertSchema<ProfileRpcArgument> = { parse: candidate => {
    try {
      const encoded = JSON.stringify(candidate)
      if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > maxEnvelopeBytes) throw new ProfileCodecError('codec-invalid')
      const value = fields(candidate, ['version', 'packet'])
      if (value.version !== PROFILE_RPC_CODEC) throw new ProfileCodecError('codec-version')
      if (typeof value.packet !== 'string') throw new ProfileCodecError('codec-invalid')
      return { version: PROFILE_RPC_CODEC, packet: value.packet }
    } catch (error) { if (error instanceof ProfileCodecError) throw error; throw new ProfileCodecError('codec-invalid', { cause: error }) }
  } }
  return { schema, descriptor: { mode: 'strict', typeSymbol: 'ProfileRpcArgument', create: () => schema } }
}
