/** Native DTO fields are emitted only after shared semantic and scope validation. */
/** Device directories omit `sessionIds`; Sessions name their project instead. */
export interface ProductProject { projectId: string; title: string; sessionIds?: string[] }
/** Device directories add list state; `updatedAt` is epoch milliseconds and 0 when unknown. Legacy publications omit the optional fields. */
export interface ProductSession { sessionId: string; projectId: string | null; title: string; updatedAt?: number; running?: boolean; pinned?: boolean; archived?: boolean; blank?: boolean }
export interface ProductMessage { id: string; role: string; text: string }
/** Current choices supplied by the desktop for a new Session. */
export interface ProductCreationPreset { id: string; name: string; isDefault: boolean }
export interface ProductCreationModel { provider: string; model: string; label: string; efforts: string[] }
export interface ProductModelSelection { provider: string; model: string; reasoningEffort?: string }
export class ProductCreationOptions {
  presets: ProductCreationPreset[] = []
  models: ProductCreationModel[] = []
  defaultModel: ProductModelSelection = { provider: '', model: '' }
}
/** Saved range label; only an explicit selection and fresh confirmation can activate its original grant. */
export interface ProductSavedScope { key: string; desktopId: string; profileId: string; sessions: string[] }
/** Explicit comparison fields contain only public fingerprints and the local selected grant scope. */
export class ProductPairingPreview { deviceBinding: boolean = false; renewal: boolean = false; grantEpoch: number = 0; pairId: string = ''; desktopFingerprint: string = ''; phoneFingerprint: string = ''; desktopId: string = ''; profileId: string = ''; sessions: string[] = []; operations: string[] = []; audience: string = ''; identityAlias: string = ''; expiresAt: number = 0; grantTtlMs: number = 0 }
/** Initial state has no connected claim, selected scope or executable rich publication. */
export class ProductView {
  connectionGeneration: number = 0
  pairing: string = 'unpaired'
  connection: string = 'disabled'
  error: string = ''
  connectionDiagnostic: string = ''
  startupDiagnostic: string = ''
  startupStorage: string = ''
  storageRecovery: string = ''
  storageRecoveryAudit: string = ''
  projects: ProductProject[] = []
  sessions: ProductSession[] = []
  /** True only when the connected desktop accepts list management. */
  manageable: boolean = false
  selected: string = ''
  task: string = 'idle'
  readOnly: boolean = true
  messages: ProductMessage[] = []
  liveText: string = ''
  richJson: string = ''
}
