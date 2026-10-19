/** Generate HAP-local fixture resources and a browser-only interactive lab from upstream source. */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { richFixture } from '../.build/fixtures.js'
import { richThemeCss } from '../.build/upstream-theme.js'
import { canonicalRichJson } from '../.build/upstream-validate.js'
import { guestSdk } from '../.build/upstream-guest-sdk.js'
import { MockDesktop } from '../.build/mock.js'

const root = resolve('harmony/entry/src/main')
const raw = resolve(root, 'resources/rawfile')
const generated = resolve(root, 'ets/generated')
await mkdir(raw, { recursive: true }); await mkdir(generated, { recursive: true })
const snapshot = richFixture('mock-session-a'), manifest = snapshot.manifest
const hash = createHash('sha256').update(canonicalRichJson({ html: manifest.html, css: manifest.css, js: manifest.js, stateSchemaVersion: manifest.stateSchemaVersion })).digest('hex')
if (hash !== manifest.contentHash) throw new Error('Fixture source changed: update its canonical contentHash before generating assets')
const css = richThemeCss({ theme: 'dark', accent: 'auto' })
const preview = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; object-src 'none'"><style>${css}\n${manifest.css}</style></head><body>${manifest.html}</body></html>\n`
await writeFile(resolve(raw, 'rich-preview.html'), preview)
await writeFile(resolve(raw, 'fixture-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n')
await writeFile(resolve(raw, 'guest-sdk.js'), guestSdk('fixture-mount-replaced-by-renderer', 1) + '\n')
const desktop = new MockDesktop('mock')
await writeFile(resolve(generated, 'DemoFixture.ets'), `/** Generated fixed presentation data; run node scripts/assets.mjs. */\nexport class DemoRow {\n  constructor(public sessionId: string, public title: string) {}\n}\nexport const demoRows: DemoRow[] = [\n${desktop.sessions.map(row => `  new DemoRow(${JSON.stringify(row.sessionId)}, ${JSON.stringify(row.title)}),`).join('\n')}\n]\nexport const demoResult: string = ${JSON.stringify('固定演示已完成。执行归属：mock-desktop。')}\n`)
await mkdir(resolve(root, 'resources/base/media'), { recursive: true })
await copyFile(resolve('harmony/AppScope/resources/base/media/app_icon.svg'), resolve(root, 'resources/base/media/app_icon.svg'))
const hashes = JSON.parse(await readFile('.build/source-hashes.json', 'utf8'))
await writeFile(resolve(raw, 'asset-source-manifest.json'), JSON.stringify({ mode: 'fixed-fixture-only',
  typescriptCheck: true, arktsCompile: false, arkwebDeviceValidated: false,
  contentHash: hash, upstreamHashes: hashes }, null, 2) + '\n')

// This page belongs to browser tests. ArkUI only opens rich-preview.html with scripts disabled.
const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>DSH 富消息浏览器实验</title><style>body{margin:0;padding:12px;background:#121317;color:#e3e5ea;font:16px system-ui;box-sizing:border-box}iframe{border:1px solid #61687a;border-radius:12px;width:100%;height:560px;box-sizing:border-box}button{min-height:44px;font:inherit;margin-bottom:12px}#status{min-height:28px;overflow-wrap:anywhere}</style></head><body><h1>离线浏览器实验</h1><p>仅合成数据 · 不连接真实桌面或模型 · 不是 ArkWeb 验收</p><button id="reopen">重新打开历史</button><div id="status" aria-live="polite">待提交</div><iframe id="rich" title="固定富表单" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe><script type="module">
import { MockDesktop } from './mock.js';
import { GuestGate } from './bridge.js';
import { guestSdk } from './upstream-guest-sdk.js';
const desktop = new MockDesktop('mock');
const frame = document.querySelector('#rich'), status = document.querySelector('#status');
let mount, gate, hostSeq = 0, generation = 0;
const lab = { get admittedActions(){return desktop.admittedActions}, denials: [], packets: [], get snapshot(){return desktop.snapshotFor(desktop.sessions[0].sessionId)} };
Object.defineProperty(window, 'lab', {value:lab});
const send = (type,payload) => frame.contentWindow.postMessage({protocol:'lumina-rich/1',mountId:mount.mountId,renderRevision:1,seq:++hostSeq,packetId:'host-'+hostSeq,type,payload}, '*');
const open = () => {
  if (gate) gate.close();
  generation++; hostSeq = 0; mount = desktop.mount(desktop.sessions[0].sessionId);
  const m = mount.snapshot.manifest, nonce = 'offline-fixture-nonce';
  const shim = '(() => { const listeners=new Set(); Object.defineProperty(window,"richGuest",{value:Object.freeze({send:packet=>parent.postMessage(packet,"*"),subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback)}})}); window.addEventListener("message",event=>{if(event.source===parent)for(const listener of listeners)listener(event.data)}); })();';
  const code = shim + String.fromCharCode(10) + guestSdk(mount.mountId,1) + String.fromCharCode(10) + m.js;
  const csp = "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; img-src data:; media-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'; object-src 'none'";
  const doc = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><style>'+${JSON.stringify(css)}+m.css+'</style></head><body><div data-rich-content-root>'+m.html+'</div><script nonce="'+nonce+'">'+code+'<'+ '/script></body></html>';
  gate = new GuestGate(desktop,{source:frame.contentWindow,mountId:mount.mountId,renderRevision:1,packetBytes:131072,maxPackets:128});
  frame.srcdoc = doc;
};
window.addEventListener('message',event => {
  if (event.source !== frame.contentWindow) return;
  const packet = event.data;
  if (!packet || packet.mountId !== mount.mountId) return;
  lab.packets.push({type:packet.type,code:packet.type==='input.error'?packet.payload?.code:undefined});
  try {
    const result = gate.receive(JSON.stringify(packet), event.source);
    if (packet.type === 'ready') send('init',{snapshot:desktop.snapshotFor(desktop.sessions[0].sessionId)});
    if (['draft.save','action.invoke','action.status'].includes(packet.type)) {
      send('result',{requestId:packet.packetId,...(packet.type==='action.status'?{result}:{receipt:result})});
      send('snapshot',{snapshot:desktop.snapshotFor(desktop.sessions[0].sessionId)});
    }
    if (packet.type === 'action.invoke' && result.accepted) {
      status.textContent = '已接收演示动作';
      const current = generation, actionId = result.actionId;
      setTimeout(() => {
        if (current !== generation) return;
        desktop.completeAction(mount.mountId,actionId);
        send('snapshot',{snapshot:desktop.snapshotFor(desktop.sessions[0].sessionId)});
        status.textContent = '演示动作已完成';
      }, 50);
    }
  } catch (error) { lab.denials.push(error.code || 'fixture-failure'); status.textContent = '已拒绝演示报文'; }
});
document.querySelector('#reopen').onclick = open;
open();
</script></body></html>\n`
await writeFile('.build/browser.html', page)
console.log('PASS: canonical source hash; offline HAP resources, shared guest SDK and browser fixture generated (ArkTS uncompiled)')
