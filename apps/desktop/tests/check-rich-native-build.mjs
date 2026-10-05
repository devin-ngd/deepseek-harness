/** Bundle the native fixture without invoking its entry or starting Electron. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../package.json', import.meta.url));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const { build } = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm/node_modules')] }));
const builds = [];
for (const [entry, filename, format] of [
  ['apps/desktop/tests/fixtures/rich-native-runner.ts', 'rich-native-runner.mjs', 'esm'],
  ['apps/desktop/tests/fixtures/rich-owner-preload.ts', 'rich-owner-preload.cjs', 'cjs'],
  ['apps/desktop/src/preload-rich.ts', 'preload-rich.cjs', 'cjs'],
]) {
  await build({ entryPoints: [join(root, entry)], outfile: join(output, filename), bundle: true, platform: 'node',
    format, target: 'es2024', external: ['electron'], logLevel: 'warning' });
  builds.push(filename);
}
await writeFile(join(output, 'static-build.json'), JSON.stringify({ builds, nativeLaunches: 0, executedBundles: false }, null, 2));
console.log(JSON.stringify({ builds, nativeLaunches: 0, executedBundles: false }));
