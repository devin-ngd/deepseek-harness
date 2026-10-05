/** Build and run the owner-local security fixture; no model, network install, or user browser profile. */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const require = createRequire(new URL('../package.json', import.meta.url));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = resolve(process.argv[2] ?? join(root, '.rich-native-test'));
await mkdir(output, { recursive: true });
await mkdir(join(output, 'profile'), { recursive: true });
const esbuildPath = require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm/node_modules')] });
const { build } = require(esbuildPath);
const electron = require('electron');
for (const [entry, filename, format] of [
  ['apps/desktop/tests/fixtures/rich-native-runner.ts', 'rich-native-runner.mjs', 'esm'],
  ['apps/desktop/tests/fixtures/rich-owner-preload.ts', 'rich-owner-preload.cjs', 'cjs'],
  ['apps/desktop/src/preload-rich.ts', 'preload-rich.cjs', 'cjs'],
]) {
  await build({ entryPoints: [join(root, entry)], outfile: join(output, filename), bundle: true, platform: 'node',
    format, target: 'es2024', external: ['electron'], logLevel: 'warning' });
}
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^ELECTRON_RUN_AS_NODE$/i.test(key)));
environment.ELECTRON_ENABLE_LOGGING = '1';
environment.ELECTRON_ENABLE_STACK_DUMPING = '1';
const child = spawn(electron, [`--user-data-dir=${join(output, 'profile')}`, '--enable-logging=stderr',
  join(output, 'rich-native-runner.mjs'), `--rich-native-output=${output}`], {
  cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', data => { stdout = (stdout + data).slice(-65536); process.stdout.write(data); });
child.stderr.on('data', data => { stderr = (stderr + data).slice(-65536); process.stderr.write(data); });
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30000);
const exitCode = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', code => resolveExit(code)); });
clearTimeout(timer);
try { console.log(await readFile(join(output, 'native-results.json'), 'utf8')); }
catch (error) { console.error('No native result artifact:', error.message); }
console.log(JSON.stringify({ exitCode, timedOut, output }));
await writeFile(join(output, 'native-launch-status.json'), JSON.stringify({ exitCode, timedOut, stdout, stderr,
  complete: exitCode === 0 && !timedOut, statement: 'Only native-results.json with all checks passing establishes this fixture result.' }, null, 2));
process.exitCode = timedOut || exitCode !== 0 ? 1 : 0;
