/** Explicit next approved native owner; neither default tests nor the offline rehearsal discovers it. */
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import {standardDecoratorPlugin,vitestExecArgv} from '../.build/upstream-vitest-shared.js'
import {projectionAliases} from '../scripts/projection-source.mjs'
const root=fileURLToPath(new URL('../../../',import.meta.url)),client=fileURLToPath(new URL('../',import.meta.url))
export default defineConfig({root,cacheDir:client+'.build/native-phase17-vite',resolve:{alias:await projectionAliases(client,root)},plugins:[tsconfigPaths({projects:[root+'tsconfig.base.json']}),standardDecoratorPlugin()],test:{name:'approved-phase17-native',environment:'node',pool:'forks',execArgv:vitestExecArgv,include:['clients/harmony-mobile/native-network-tests/phase17.spec.ts'],maxWorkers:1,fileParallelism:false,testTimeout:2400000,hookTimeout:20000,teardownTimeout:20000}})
