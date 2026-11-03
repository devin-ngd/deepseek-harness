/** Generated from default-disabled product.config.json; no actual device API or real trust is inferred. */
import { NativeProductConfiguration } from './NativeProductOwner'
export const productConfiguration: NativeProductConfiguration = {
  "enabled": false,
  "approvedHost": "",
  "identityAlias": "",
  "deviceApiVerified": 0,
  "maxCryptoBytes": 5242880,
  "maxTotalSendBytes": 67108864,
  "publicTrustMaxBytes": 524288,
  "relay": {
    "maxProofs": 64,
    "maxQueuedBytes": 16777216,
    "maxChallengeTtlMs": 15000,
    "maxRoomTtlMs": 600000,
    "handshakeMs": 10000,
    "e2e": {
      "maxFrameBytes": 8388608,
      "maxPlaintextBytes": 5242880,
      "maxFrames": 4096
    }
  },
  "corePolicyJson": "{\"enabled\":false,\"trustMaxBytes\":524288,\"transport\":{\"maxPending\":8,\"maxQueuedFrames\":256,\"maxPacketBytes\":5242880,\"timeoutMs\":10000,\"recovery\":{\"maxAttempts\":8,\"retryDelayMs\":500}},\"domain\":{\"maxBytes\":4194304,\"maxEvents\":512,\"maxBlocks\":256,\"maxText\":262144,\"maxRichBlocks\":8},\"duplicateCap\":512,\"core\":{\"ttlMs\":30000,\"maxMounts\":4,\"maxIntents\":128,\"follow\":{\"mode\":\"continuous\",\"maxFailures\":8,\"retryDelayMs\":500}},\"commandPrefix\":\"native-product\"}"
}
