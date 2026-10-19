/** Only the generated HAP index can select resources; size and SHA-256 are checked before executable HTML is created. */
import { common } from '@kit.AbilityKit'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { util } from '@kit.ArkTS'
import { nativeAssets } from '../generated/NativeAssetIndex'
import { NativeFailure } from './NativeFailure'

export class NativeAssets {
  private context: common.UIAbilityContext
  constructor(context: common.UIAbilityContext) { this.context = context }
  /** @param name - one fixed native-selected HAP resource. @returns verified UTF-8 text; unknown paths fail before IO. */
  read(name: string): string {
    const entry = nativeAssets.find(item => item.name === name)
    if (entry === undefined) throw new NativeFailure('resource-denied')
    const manager = this.context.resourceManager
    const descriptor = manager.getRawFdSync(name)
    try { if (descriptor.length !== entry.bytes) throw new NativeFailure('resource-size-invalid') }
    finally { manager.closeRawFdSync(name) }
    const bytes = manager.getRawFileContentSync(name)
    if (bytes.byteLength !== entry.bytes) throw new NativeFailure('resource-size-invalid')
    if (!canIUse('SystemCapability.Security.CryptoFramework.MessageDigest')) throw new NativeFailure('resource-digest-unavailable')
    const md = cryptoFramework.createMd('SHA256'); md.updateSync({ data: bytes })
    const digest = md.digestSync().data
    let hash = ''
    for (const byte of digest) hash += byte.toString(16).padStart(2, '0')
    if (hash !== entry.sha256) throw new NativeFailure('resource-hash-invalid')
    return util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(bytes)
  }
}
