/** Required deployment-selected metadata for mandatory-update policy requests. */
export interface DesktopPolicyEnvironment {
  origin: string
  allowedPageOrigins: string[]
  allowedAuthOrigins?: string[]
  authentication: 'anonymous' | 'feishu-test'
  [key: string]: unknown
}

/**
 * Resolve policy settings before artifact preparation or signing.
 * @param environment File-owned release settings; only the selected origin is required.
 * @param options Whether this is an explicitly unsigned local build.
 * @returns Policy metadata, or none for an opted-out unsigned build.
 */
export function resolveDesktopPolicyEnvironment(
  environment: NodeJS.ProcessEnv,
  options?: { unsigned?: boolean },
): DesktopPolicyEnvironment | undefined
