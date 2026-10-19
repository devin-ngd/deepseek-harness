/** The sole pair-upload serialization path rejects non-public or stale fields before any SSH process can start. */
import { PLAN, reviewPair } from './policy.mjs'
/** @param candidate - untrusted durable exchange pair. @param now - real local clock. @returns a fixed remote import and exactly six validated public fields; no session, room receipt or access credential is serialized. */
export function stagePairInput(candidate, now) { const pair = reviewPair(candidate, now); return 'import { relayMain } from "' + PLAN.relay.run + '/operator.mjs"; await relayMain("stage-pair",' + JSON.stringify(pair) + ')\n' }
