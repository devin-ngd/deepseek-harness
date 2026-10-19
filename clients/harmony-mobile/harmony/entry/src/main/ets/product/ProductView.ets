/** Native DTO fields are emitted only after shared semantic and scope validation. */
export interface ProductProject { projectId: string; title: string; sessionIds: string[] }
export interface ProductSession { sessionId: string; projectId: string | null; title: string }
export interface ProductMessage { id: string; role: string; text: string }
/** Saved range label; only an explicit selection and fresh confirmation can activate its original grant. */
export interface ProductSavedScope { key: string; desktopId: string; profileId: string; sessions: string[] }
/** Explicit comparison fields contain only public fingerprints and the local selected grant scope. */
export class ProductPairingPreview { renewal: boolean = false; grantEpoch: number = 0; pairId: string = ''; desktopFingerprint: string = ''; phoneFingerprint: string = ''; desktopId: string = ''; profileId: string = ''; sessions: string[] = []; operations: string[] = []; audience: string = ''; identityAlias: string = ''; expiresAt: number = 0; grantTtlMs: number = 0 }
/** Initial state has no connected claim, selected scope or executable rich publication. */
export class ProductView {
  pairing: string = 'unpaired'
  connection: string = 'disabled'
  error: string = ''
  projects: ProductProject[] = []
  sessions: ProductSession[] = []
  selected: string = ''
  task: string = 'idle'
  readOnly: boolean = true
  messages: ProductMessage[] = []
  liveText: string = ''
  richJson: string = ''
}
