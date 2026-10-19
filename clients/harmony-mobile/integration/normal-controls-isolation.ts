/** Qualify the proposed original-provider group with installed public services and disposable synthetic records. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Group from '@deepseek-ai/cordis-plugin-group'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import Authorization, { type AuthorizationFlow } from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'

const world = process.env.DSH_HARMONY_INTEGRATION_WORLD
if (world === undefined || process.env.DSH_HARMONY_SENTINEL_ONLY !== '1') throw new Error('Disposable synthetic world required')
const file = join(world, 'credentials.yaml'), key = credentialKey('harmony-test', 'original-provider')
await writeFile(file, 'version: 1\nrecords:\n  harmony-test/original-provider:\n    kind: grant\n    payload:\n      sentinel: original-only\n')
const ctx = new Context()
ctx.baseUrl = pathToFileURL(world).href + '/'
let observed = false
let stage = 'loader'
try {
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(Authorization)
  const rootCredentials = ctx.credentials
  const flow: AuthorizationFlow = { key, label: 'Synthetic isolation probe', methods: [{ id: 'probe', label: 'Probe' }], async run(): Promise<void> {} }
  ctx.authorization.registerFlow(flow)
  ctx.loader.builtins.originalCredentials = CredentialsLocal
  ctx.loader.builtins.originalAuthorization = Authorization
  ctx.loader.builtins.originalProbe = {
    inject: ['credentials', 'authorization'],
    async apply(inner: Context): Promise<void> {
      stage = 'isolated-file-read'
      assert.deepEqual(await inner.credentials.readRecord(key), { kind: 'grant', payload: { sentinel: 'original-only' } })
      stage = 'root-file-exclusion'
      assert.equal(await rootCredentials.readRecord(key), undefined)
      stage = 'independent-authorization-registry'
      inner.authorization.registerFlow(flow)
      observed = true
    },
  }
  stage = 'group-create'
  await ctx.loader.create({ name: 'cordis:group', group: true, isolate: { credentials: true, authorization: true }, config: [
    { id: 'original-credentials', name: 'cordis:originalCredentials', config: { path: file, dshHome: world, watch: false } },
    { id: 'original-authorization', name: 'cordis:originalAuthorization' },
    { id: 'probe', name: 'cordis:originalProbe' },
  ] })
  await ctx.loader.await()
  assert.equal(observed, true)
  assert.equal(await ctx.credentials.readRecord(key), undefined)
  console.log(JSON.stringify({ passed: true, isolatedServices: ['credentials', 'authorization'], rootProviderRetained: true, exactFileProviderRead: true, protectedIdentityUsed: false, realProfilesRead: false, grants: 0, modelCalls: 0 }))
} catch (error) { console.error(JSON.stringify({ stage, category: error instanceof Error ? error.name : 'unknown' })); throw error }
finally { await ctx.fiber.dispose() }
