# Agent Note: Projection predecessor rows serve through a unit migrate hook; undecidable cold list metadata gets a bounded Agent-free recompute

Status: implemented

English | [中文](2026-10-29-projection-migrate-hook-and-cold-blank-recompute.zh.md)

## Problem

Bumping a projection unit's `stateVersion` discards every persisted cache row from the older version: `viewCheckpoint` serves only rows whose `ver` matches the live unit, so a semantic bump makes the whole existing fleet's rows unreadable on the zero-I/O listing path. When `sessionListMetadata` moved from version 1 (blank = no `turn/start`) to version 2 (blank = neither `turn/start` nor `command/run`, so a Session whose only activity is a submitted slash command stays discoverable), every cold Session with a version-1 row lost its cached blankness and listed as unknown-and-visible; previously hidden empty drafts reappeared as untitled rows.

The two version-1 states are not symmetric. A version-1 `blank: false` row proves a turn started, which decides version-2 blankness as well. A version-1 `blank: true` row predates command awareness and cannot say whether a `command/run` exists. Serving every old row would hide command-only Sessions; discarding every old row shows empty drafts. Neither bulk answer is correct, and the [projection-cache listing-identity note](2026-09-19-projection-cache-listing-identity-and-cached-rows.md) had rejected reopening an unbounded body probe on the listing path.

## Decision

`ProjectionDefinition` gains an optional `migrate(state, version)` hook. `viewCheckpoint` — the zero-I/O read behind `cachedSnapshot` — offers a version-mismatched row to the unit's hook after the stored state still passes the current `stateSchema`; a returned state serves its view, and `undefined` leaves the key absent for a fuller read path to refold. Fold seeding (`restoreFloor`/`restore`) never consults the hook: a migrated value is a serving decision, not a fold origin. The hook also sees rows a newer unit left behind (a downgrade), so it must answer only the versions it understands.

`sessionListMetadata` registers `migrate` as: version 1 with `blank: false` serves unchanged; anything else is undecidable. A still-undecided cold row — a still-blank version-1 row or a missing cache record — is answered by `recomputeColdMetadata` in `packages/api/session-controller/src/list.ts`: a read-only `open(id, 'read')` and a prefix read of at most `SESSION_COLD_RECOMPUTE_EVENT_LIMIT` events (plus one to recognize an oversize log), without materializing a Session or activating an Agent. A log that fits the bound folds completely through `coldSnapshot`, which refreshes the stored record, so later listings serve it from the cache again; an oversize prefix answers non-blank only when a turn or command is visible inside it. Subagent-origin rows (never blank-gated), migration-required logs (folding could misread old-format events), unreadable logs, and oversize-undecided logs keep blankness unknown and stay visible — the recompute never hides on partial evidence.

The listing's synchronous fast path is preserved: a cache-hitting cold row returns its summary without crossing a microtask boundary; only a miss returns a Promise (`list-scheduling.host.spec.ts` pins the slice contract).

## Alternatives considered

**Serve version-1 rows wholesale.** `blank: false` is sound, but `blank: true` hides command-only Sessions — exactly the regression version 2 exists to fix. Rejected.

**Discard old rows and cold-fold every miss.** An unbounded full-log read per miss on the foreground listing path is the pattern the [listing-identity note](2026-09-19-projection-cache-listing-identity-and-cached-rows.md) rejected, and a large conversation would pay it on every list until a write-back landed. Rejected; the bounded prefix plus write-back on complete small logs keeps the upgrade cost one-time and proportional.

**Write back migrated single rows.** Salvaging `blank: false` needs no write (it serves forever at zero I/O), and the cache exposes only whole-record replacement; a partial-row write face would exist for one call site. Rejected.

**A Config knob for the recompute bound.** The bound is a safety limit in the same class as `SESSION_SEARCH_RESULT_LIMIT`, not a deployment choice. Rejected.

## Consequences

Bought:

- Empty drafts with legacy version-1 caches stay hidden after the upgrade; command-only and started Sessions stay visible; no Session is duplicated or wrongly reused by New Session.
- The recompute is bounded per row, Agent-free, self-eliminating (each decided row refreshes its cache record), and failure-safe: every indecision falls toward visible.
- Other projection units gain a sanctioned salvage path for future semantic bumps.

Paid:

- A cold row whose cache cannot decide pays one read-only open plus a prefix read per list until its record is rewritten; the residual population is small (legacy blank drafts) and the pathological oversize-undecided case pays the bounded prefix per list.
- `viewCheckpoint` now parses mismatched rows it previously skipped unseen; a malformed old state still leaves the key absent.

## Testing

- `session-projection/tests/registry.spec.ts`: `viewCheckpoint` serves a hook-decided predecessor row, keeps undecidable, unknown-version, and malformed rows absent, and never consults the hook for a current row.
- `session-projection-cache/tests/cache.spec.ts`: a seeded on-disk record serves its migrated value through `cachedSnapshot`, and an undecidable record serves nothing.
- `api/session-controller/tests/session-cold.host.spec.ts`: a configuration-only persisted draft lists `blank: true` after one bounded recompute with a `coldSnapshot` write-back and no Session or Agent materialization; a command-only legacy Session stays visible; oversize logs read exactly the bounded prefix and are never folded or hidden; unreadable and migration-required logs stay visible without a fold; subagent children are never opened for blankness; the production unit's `migrate` serves a started version-1 row and leaves a still-blank one absent; an in-flight recompute read propagates cancellation to a `gateway/cancelled` list result without producing a row.
- `api/session-controller/tests/list-scheduling.host.spec.ts`: cheap cached rows remain synchronous within one work slice.

## Related

- [Projection-cache listing identity and cached rows](2026-09-19-projection-cache-listing-identity-and-cached-rows.md) — the read/fold identity split and the cached/sequenced client store this change builds on; its rejection of a bounded body probe is narrowed here to a bounded, Agent-free, fail-visible prefix read for metadata-undecidable rows only.
