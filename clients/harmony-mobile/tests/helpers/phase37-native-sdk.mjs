/** Phase37 substitute preserves the phase35 SDK's fixed fixture source. Each export returns caller-owned bytes that the actual adapter may clear. */
import { huks as fixedHuks } from './phase35-native-sdk.mjs'
export * from './phase35-native-sdk.mjs'
export const huks = { ...fixedHuks, async exportKeyItem(alias) { const exported = await fixedHuks.exportKeyItem(alias); return { outData: Uint8Array.from(exported.outData) } } }
