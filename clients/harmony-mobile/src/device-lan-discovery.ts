/** Pair-scoped IPv4 discovery. UDP selects an address and the encrypted channel authenticates the peer. */
const prefix = 'dsh-lan/1'
const noncePattern = /^[A-Za-z0-9_-]{22}$/
const requestPattern = /^dsh-lan\/1 q ([A-Za-z0-9_-]{22}) [A-Za-z0-9_-]{43}$/
export const DEVICE_LAN_DISCOVERY_BYTES = prefix.length + 3 + 22 + 1 + 43

/** @param pairId - saved phone's pairing identifier. @param desktopPublicSpki - original desktop identity. @returns a scope specific to both endpoints. */
export function lanDiscoveryScope(pairId: string, desktopPublicSpki: string): string {
  return pairId + ':' + desktopPublicSpki
}

/** @param message - exact UDP datagram as ASCII. @returns the nonce of a discovery query, or undefined for any other datagram. */
export function lanDiscoveryNonce(message: string): string | undefined {
  return requestPattern.exec(message)?.[1]
}

/** @param scope - saved phone and desktop identity scope. @param nonce - freshly generated 16-byte base64url value. @param kind - probe or reply. @param digest - platform SHA-256 with base64url encoding. @returns one fixed-size datagram scoped to the saved pairing and nonce. */
export async function lanDiscoveryMessage(scope: string, nonce: string, kind: 'q' | 'r', digest: (value: string) => Promise<string>): Promise<string> {
  if (!noncePattern.test(nonce)) throw new Error('LAN discovery nonce denied')
  return prefix + ' ' + kind + ' ' + nonce + ' ' + await digest(prefix + ':' + kind + ':' + nonce + ':' + scope)
}
