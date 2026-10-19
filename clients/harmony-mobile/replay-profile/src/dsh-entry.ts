/** Guarded source dsh entry: one profile, replay only, no plugin/install commands or general argv escape. */
import { runCli } from '../../../../apps/cli/src/bin.ts'
if (process.argv.slice(2).join('\0') !== '--profile\0harmony-mobile-replay' || process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1' || !['fixed-four-v1', 'paired-four-v1', 'restart-four-v1'].includes(process.env.DSH_HARMONY_OFFLINE_PROFILE ?? '') || !process.env.DSH_HOME || !process.env.DSH_AGENTS_HOME) throw new Error('Use the isolated fixed replay launcher')
await runCli()
