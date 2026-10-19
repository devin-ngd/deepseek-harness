/** Generated from default-disabled product.config.json; no actual device API or real trust is inferred. */
import { NativeProductConfiguration } from './NativeProductOwner'
export const productConfiguration: NativeProductConfiguration = {
  "enabled": false,
  "approvedHost": "",
  "identityAlias": "",
  "deviceApiVerified": 0,
  "maxCryptoBytes": 2097152,
  "maxTotalSendBytes": 16777216,
  "publicTrustMaxBytes": 32768,
  "relay": {
    "maxProofs": 64,
    "maxQueuedBytes": 4194304,
    "maxChallengeTtlMs": 15000,
    "maxRoomTtlMs": 60000,
    "handshakeMs": 10000,
    "e2e": {
      "maxFrameBytes": 2097152,
      "maxPlaintextBytes": 1048576,
      "maxFrames": 4096
    }
  },
  "corePolicyJson": "{\"enabled\":false,\"trustMaxBytes\":32768,\"transport\":{\"maxPending\":8,\"maxQueuedFrames\":256,\"maxPacketBytes\":2097152,\"timeoutMs\":10000,\"recovery\":{\"maxAttempts\":8,\"retryDelayMs\":500}},\"domain\":{\"maxBytes\":1048576,\"maxEvents\":512,\"maxBlocks\":256,\"maxText\":262144,\"maxRichBlocks\":8},\"duplicateCap\":512,\"core\":{\"ttlMs\":30000,\"maxMounts\":4,\"maxIntents\":128,\"follow\":{\"mode\":\"bounded\",\"maxSegments\":32,\"maxFailures\":8,\"retryDelayMs\":500}},\"commandPrefix\":\"native-product\"}"
}
