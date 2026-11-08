/** Native-only access to one selected desktop connection; no implementation or authority is exposed to Web documents. */
export interface NativeWorkspaceProduct {
  /** @returns the current admitted native connection generation. */
  workspaceGeneration(): number
  /** @returns public virtual origin and connection generation as JSON; no credentials or tickets. */
  workspaceContext(): Promise<string>
  /** @param requestId - native correlation. @param generation - selected connection. @returns validated fresh resource inventory JSON after Host admission. */
  workspacePrepare(requestId: string, generation: number): Promise<string>
  /** @param requestId - native correlation. @param raw - bounded workspace operation JSON. @param generation - selected connection. @returns original standard result JSON, with no mutation replay. */
  workspaceRequest(requestId: string, raw: string, generation: number): Promise<string>
  /** @param requestId - native correlation. @param url - selected virtual resource. @param generation - selected connection. @param maxBytes - decoded response budget. @param maxChunkBytes - transfer budget. @returns status, headers and platform base64url bytes as JSON. */
  workspaceResource(requestId: string, url: string, generation: number, maxBytes: number, maxChunkBytes: number): Promise<string>
  /** @param requestId - exact admitted operation to retire; accepted desktop mutations are preserved. */
  cancelWorkspaceRequest(requestId: string): void
}
