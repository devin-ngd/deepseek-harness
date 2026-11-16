# Agent Note: Per-code unbounded retries in normal retry policy

Status: implemented

English | [中文](2026-11-16-retry-unbounded-codes.zh.md)

## Problem

The default normal retry policy gives every transient failure five retries over roughly fifteen seconds, then the turn ends with the failure. A real network outage lasts minutes, so interactive sessions on flaky links kept dying with `TRANSPORT` errors and waited for manual continuation. The existing always mode is not a usable answer: it retries every failure code forever, including terminal ones such as `QUOTA` that must surface.

## Decision

Normal mode gains an optional `unboundedCodes` list. Listed codes must already be eligible (`retryableCodes`); matching failures skip the `maxRetries` gate and keep retrying on the same capped backoff until success, cancellation, or disposal. An over-cap provider `Retry-After` for an unbounded code falls back to the capped local backoff instead of delegating, the same as always mode. The resolved policy carries the list only when configured non-empty, and the durable `policyKey` appends it only then, so existing configurations keep byte-identical keys and pinned fixtures stay valid.

The default policy is unchanged. Patience is a per-route deployment choice, set in each provider's `retryPolicy`.

## Alternatives considered

Scoping always mode with a code allowlist was rejected: it drops bounded recovery for every unlisted code, so a single `EMPTY_RESPONSE` hiccup would end the turn where today it retries. Raising the default budget stays bounded and still interrupts on longer outages. Turn-level automatic continuation was rejected for this fix: the per-request retry keeps the turn open, which is the behavior the failing sessions needed.

## Consequences

A route configured with `unboundedCodes: ['TRANSPORT']` never ends a turn on connection failures; each attempt is durable and visible with a countdown, and the user stops it explicitly. Retries past the declared cap render with an `∞` bound in the chat view, derived from the event itself. `TIMEOUT` stays bounded by default in the shipped posture because a deterministic mid-generation timeout can bill input tokens on every attempt.
