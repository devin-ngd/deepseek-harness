/** Test-only Loader composition of normal profile services; model responses are injected by each test. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
/** @param world - fresh test-owned service storage. @param configuration - explicit service configuration without model responses. @returns canonical DSH services; no model provider is installed here. */
export async function loadProfileServices(world: string, configuration: string) {
  if (process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1' && process.env.DSH_HARMONY_SENTINEL_ONLY !== '1') throw new Error('isolated test dispatch guard required')

  const { Context } = await import('@deepseek-ai/cordis')
  const { default: Loader } = await import('@deepseek-ai/cordis-plugin-loader')
  const { default: Include } = await import('@deepseek-ai/cordis-plugin-include')
  const ctx = new Context()
  try {
    ctx.baseUrl = pathToFileURL(world).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    Object.assign(ctx.loader.builtins, {
      llm: (await import('@deepseek-ai/dsh-llm')).default,
      extensions: (await import('@deepseek-ai/dsh-deepseek-llm-api-extensions')).default,
      sessions: (await import('@deepseek-ai/dsh-session')).default,
      projections: (await import('@deepseek-ai/dsh-session-projection')).default,
      agents: (await import('@deepseek-ai/dsh-agent')).default,
      systemPrompt: (await import('@deepseek-ai/dsh-system-prompt')).default,
      tools: (await import('@deepseek-ai/dsh-tools')).default,
      agentLoop: (await import('@deepseek-ai/dsh-agent-loop')).default,
      storage: (await import('@deepseek-ai/dsh-storage')).default,
      storageJson: await import('@deepseek-ai/dsh-storage-json'),
      storageDomain: await import('@deepseek-ai/dsh-storage-domain'),
      persistence: await import('@deepseek-ai/dsh-session-persistence-jsonl'),
      query: (await import('@deepseek-ai/dsh-session-query')).default,
      workspaces: (await import('@deepseek-ai/dsh-workspace')).default,
      fs: (await import('@deepseek-ai/dsh-fs-local')).default,
      cwd: (await import('@deepseek-ai/dsh-working-directory')).default,
      typert: (await import('@deepseek-ai/dsh-typert-registry')).default,
      remoteAccess: (await import('@deepseek-ai/dsh-api-remote-access')).default,
      commands: (await import('@deepseek-ai/dsh-commands')).default,
      disabledCarrier: await import('./disabled-carrier.ts'),
      attachments: (await import('@deepseek-ai/dsh-attachment-local')).default,
      uploads: (await import('@deepseek-ai/dsh-client-file-upload')).default,
      defaultModel: (await import('@deepseek-ai/dsh-agent-default-model')).default,
      sessionController: (await import('@deepseek-ai/dsh-api-session-controller')).default,
      richInline: (await import('@deepseek-ai/dsh-experimental-rich-inline')).default,
    })
    let yml = configuration
    for (const [key, directory] of [['storage', 'state'], ['sessions', 'sessions'], ['home', 'home']] as const) {
      const path = join(world, directory).replaceAll('\\', '/')
      await mkdir(path, { recursive: true }); yml = yml.replaceAll('{{' + key + '}}', path)
    }
    const configPath = join(world, 'cordis.yml'); await writeFile(configPath, yml)
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    for (const key of ['llm', 'sessionController', 'richInline', 'agentLoop', 'sessionPersistence', 'workspaceRegistry'] as const) {
      if (ctx.get(key) === undefined) throw new Error('Required profile service did not activate: ' + key)
    }
    return ctx
  } catch (error) { await ctx.fiber.dispose(); throw error }

}
