/** Require replay dispatch and upload switches before SDK test construction. */
import type { OfflineSnapshotPlan } from './offline.ts'

/** Explicit replay route and finite response budget. */
export type OfflineSnapshotDeclaration = Pick<OfflineSnapshotPlan, 'provider' | 'model' | 'expectedCalls'>

/** Required test-only switches for both model dispatch and known network plugins. */
export interface OfflineSnapshotMarkers {
  /** Require the SDK's replay-only initialization. */
  sdkReplay: boolean
  /** Require counted replay and skip request-extension acceptance callbacks. */
  replayOffline: boolean
  /** Disable Session-log uploads. */
  uploadDisabled: boolean
  /** Set DSH_SNAPSHOT_REPLAY_ONLY=1 before creating any runtime. */
  dispatchBlocked: boolean
}

/** Raw test-entry inputs; missing fields are refusals rather than ordinary SDK routing. */
export interface OfflineSnapshotEntry {
  /** Scenario identity used by the test runner. */
  composition: string
  /** Explicit replay or refresh selection; live record is unsupported. */
  mode: string | undefined
  /** Scenario-owned finite declaration; absence refuses entry. */
  plan: OfflineSnapshotDeclaration | undefined
  /** All offline switches must be present and true. */
  markers: Partial<OfflineSnapshotMarkers> | undefined
}

/**
 * Require explicit replay switches and a finite route before loading the SDK.
 * @param entry - explicit mode, composition, finite plan and offline switches.
 * @returns the finite declaration after every startup requirement passes.
 * @throws when the mode, route, budget or a required switch is absent or invalid.
 */
export function requireOfflineSnapshotEntry(entry: OfflineSnapshotEntry): OfflineSnapshotDeclaration {
  if (entry.mode !== 'replay' && entry.mode !== 'refresh') throw new Error('offline snapshot entry requires explicit replay or refresh mode')
  const markers = entry.markers
  if (markers?.sdkReplay !== true || markers.replayOffline !== true || markers.uploadDisabled !== true
    || markers.dispatchBlocked !== true) {
    throw new Error('offline snapshot entry requires every offline marker')
  }
  const plan = entry.plan
  if (plan === undefined || !plan.provider.trim() || !plan.model.trim()
    || !Number.isSafeInteger(plan.expectedCalls) || plan.expectedCalls < 1) {
    throw new Error('offline snapshot entry requires a finite replay plan')
  }
  return plan
}

/**
 * Keep fixture imports and SDK construction inside the validated offline entry.
 * @param entry - raw test-entry inputs; no default SDK route is selected.
 * @param start - deferred loading/construction callback, never called on refusal.
 * @returns the callback result after all entry requirements pass.
 */
export function startOfflineSnapshotEntry<T>(entry: OfflineSnapshotEntry,
  start: (declaration: OfflineSnapshotDeclaration) => T): T {
  return start(requireOfflineSnapshotEntry(entry))
}
