/** Explicit manual emulator acceptance fixture; never part of the automatic offline regression inventory. */
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import {standardDecoratorPlugin,vitestExecArgv} from '../.build/upstream-vitest-shared.js'
const root=fileURLToPath(new URL('../../../',import.meta.url))
export default defineConfig({root,cacheDir:fileURLToPath(new URL('../.build/native-network-vite/',import.meta.url)),plugins:[tsconfigPaths({projects:[root+'tsconfig.base.json']}),standardDecoratorPlugin()],test:{name:'approved-native-emulator-replay',environment:'node',pool:'forks',execArgv:vitestExecArgv,include:['clients/harmony-mobile/native-network-tests/*.spec.ts'],maxWorkers:1,fileParallelism:false,testTimeout:2100000,hookTimeout:20000,teardownTimeout:20000}})
