/** Actual in-process Connection/Gateway carrier backed only by private memory credentials; no HTTP server is installed. */
import type { Context } from '@deepseek-ai/cordis'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'

/** @param ctx - isolated replay Context. @returns after the standard pure shared-Fetch/RPC handlers activate, without a listener or external credential source. */
export async function apply(ctx: Context): Promise<void> {
  if (process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('offline shared connection fixture required')
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(Connection)
}
