/** Fixed controls against isolated ports and the actual browser factory; no live identity or network. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
const root='D:/workspace/agents/deepseek-harness',require=createRequire(root+'/package.json')
const reactRequire=createRequire(root+'/packages/client/ui-conversation/package.json')
const {ControlModel}=await import(pathToFileURL(process.env.DSH_HARMONY_PANEL_MODEL).href)
const sid='panel-session'
const binding={schema:'harmony-device-binding/1',bindingId:'original-binding',desktopId:'original-desktop',profileId:'desktop',deviceId:'original-phone',identityAlias:'original-phone',desktopPublicSpki:'cHVibGlj',phonePublicSpki:'cHVibGljMg',desktopCredentialId:'p256-sha256-'+'a'.repeat(64),credentialId:'p256-sha256-'+'b'.repeat(64),audience:'relay.example',scope:{kind:'all-visible-sessions',profileId:'desktop'},operations:['session.sync'],epoch:1,createdAt:1,revoked:false,signature:'publicSignature'}
const offer={schema:'harmony-device-route-offer/1',binding,routeId:'current-route',routeEpoch:1,nonce:'a'.repeat(43),issuedAt:100,expiresAt:200,signature:'publicSignature'}
const route={schema:'harmony-device-route/1',offer,signature:'phoneSignature'}
const success=(state,publicResult,sessionId=sid)=>({kind:'success',text:JSON.stringify({profileId:'desktop',sessionId,state,...publicResult?{publicResult}:{}})})
function fixture(respond=async()=>success('bound')){const calls=[];let current=true;const model=new ControlModel({sessionId:sid,isCurrent:()=>current,execute:async line=>{calls.push(line);return respond(line)}});return{model,calls,stale:()=>{current=false}}}
async function ready(respond){const f=fixture(respond);await f.model.run('status');return f}
test('construction is inert and only fixed commands enter the original command API',async()=>{const f=fixture();assert.deepEqual(f.calls,[]);assert.equal(await f.model.run('revoke'),false);assert.equal(await f.model.run('connect'),false);await f.model.run('status');assert.deepEqual(f.calls,['/harmony-device status']);assert.equal(f.model.source.getSnapshot().publicState,'bound')})

test('workspace permission controls preserve connection state and require an explicit local allow request',async()=>{
 const f=fixture(async line=>line.endsWith('workspace-status')||line.endsWith('workspace-stop')?success('workspace-disabled',{enabled:false,expiresAt:null}):line.endsWith('workspace-allow')?success('workspace-enabled',{enabled:true,expiresAt:Date.now()+60000}):success('bound'))
 await f.model.run('status');assert.equal(await f.model.run('workspace-allow'),false)
 await f.model.run('workspace-status');assert.equal(f.model.source.getSnapshot().publicState,'bound')
 assert.equal(await f.model.run('workspace-allow'),true);assert.equal(f.model.source.getSnapshot().workspaceState,'workspace-enabled')
 assert.equal(f.model.source.getSnapshot().allowed.includes('route-start'),true)
 assert.equal(await f.model.run('workspace-stop'),true);assert.equal(f.model.source.getSnapshot().publicState,'bound')
 assert.deepEqual(f.calls,['/harmony-device status','/harmony-device workspace-status','/harmony-device workspace-allow','/harmony-device workspace-stop'])
})
test('an elapsed workspace receipt asks for a fresh Host status without making a command request', async t => {
 t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 })
 let deadline = 2000
 const f = fixture(async () => deadline === null ? success('workspace-disabled', { enabled: false, expiresAt: null })
  : success('workspace-enabled', { enabled: true, expiresAt: deadline }))
 t.after(() => f.model.dispose())
 await f.model.run('workspace-status')
 assert.equal(f.model.source.getSnapshot().workspaceExpiresAt, 2000)
 deadline = 3000
 await f.model.run('workspace-status')
 t.mock.timers.tick(1000)
 assert.equal(f.model.source.getSnapshot().workspaceState, 'workspace-enabled')
 t.mock.timers.tick(1000)
 const expired = f.model.source.getSnapshot()
 assert.equal(expired.workspaceState, 'workspace-expired')
 assert.equal(expired.workspaceExpiresAt, 3000)
 assert.equal(JSON.parse(expired.publicText).state, 'workspace-enabled')
 assert.equal(await f.model.run('workspace-allow'), false)
 assert.equal(f.calls.length, 2)
 deadline = null
 await f.model.run('workspace-status')
 assert.equal(f.model.source.getSnapshot().workspaceExpiresAt, null)
 assert.equal(f.model.source.getSnapshot().allowed.includes('workspace-allow'), true)
 deadline = 4000
 await f.model.run('workspace-status')
 f.model.dispose()
 t.mock.timers.tick(1000)
 assert.equal(f.model.source.getSnapshot().phase, 'disposed')
 assert.equal(f.model.source.getSnapshot().workspaceState, null)
})
test('workspace uncertainty clears only when an explicit stop confirms the grant is closed', async () => {
 const closed = success('workspace-disabled', { enabled: false, expiresAt: null })
 const enabled = success('workspace-enabled', { enabled: true, expiresAt: 5000 })
 let stop = { kind: 'error', text: 'unconfirmed' }, approval = { kind: 'error', text: 'cancelled' }
 const f = await ready(async line => {
  if (line.endsWith('workspace-status')) return closed
  if (line.endsWith('workspace-allow')) return approval
  if (line.endsWith('workspace-stop')) return stop
  return success('transport-started')
 })
 await f.model.run('workspace-status')
 assert.equal(await f.model.run('workspace-allow'), false)
 await f.model.run('workspace-status')
 assert.equal(f.model.source.getSnapshot().allowed.includes('workspace-allow'), false)
 await f.model.run('workspace-stop')
 assert.equal(f.model.source.getSnapshot().uncertain, true)
 stop = success('workspace-disabled', { enabled: false, expiresAt: 5000 })
 await f.model.run('workspace-stop')
 assert.equal(f.model.source.getSnapshot().uncertain, true)
 stop = closed
 await f.model.run('workspace-stop')
 assert.equal(f.model.source.getSnapshot().uncertain, false)
 assert.equal(f.model.source.getSnapshot().publicState, 'transport-started')
 assert.equal(f.model.source.getSnapshot().firstFailure, 'rejected')
 approval = enabled
 assert.equal(await f.model.run('workspace-allow'), true)
 assert.equal(f.calls.filter(line => line.endsWith('workspace-allow')).length, 2)
})
test('stopping only the workspace grant preserves connection uncertainty', async () => {
 const f = await ready(async line => {
  if (line.endsWith('connect')) throw new Error('connection outcome unknown')
  if (line.endsWith('workspace-stop')) return success('workspace-disabled', { enabled: false, expiresAt: null })
  return success('route-ready', route)
 })
 assert.equal(await f.model.run('connect'), false)
 assert.equal(await f.model.run('workspace-stop'), true)
 assert.equal(f.model.source.getSnapshot().uncertain, true)
 assert.equal(f.model.source.getSnapshot().allowed.includes('connect'), false)
})
test('busy locks duplicate clicks before dispatch and snapshot identity remains stable between changes',async()=>{let settle;const f=fixture(()=>new Promise(resolve=>{settle=resolve}));const original=f.model.source.getSnapshot();assert.equal(original,f.model.source.getSnapshot());const request=f.model.run('status');assert.equal(f.model.source.getSnapshot().phase,'pending');assert.deepEqual(f.model.source.getSnapshot().allowed,[]);assert.equal(await f.model.run('status'),false);assert.equal(f.calls.length,1);settle(success('bound'));assert.equal(await request,true)})
test('normal confirmation cancellation is not replaced or automatically retried',async()=>{const f=await ready(async line=>line.endsWith('status')?success('bound'):({kind:'error',text:'cancelled private-token-secret'}));assert.equal(await f.model.run('route-start'),false);assert.equal(f.calls.length,2);assert.equal(f.model.source.getSnapshot().firstFailure,'rejected');assert.equal(f.model.source.getSnapshot().uncertain,true);assert.equal(await f.model.run('route-start'),false);assert.equal(f.calls.length,2);assert.equal(JSON.stringify(f.model.source.getSnapshot()).includes('private-token-secret'),false)})
test('public reply must match this exact offer; unknown or secret fields never dispatch',async()=>{const f=await ready(async line=>line.endsWith('status')?success('bound'):line.endsWith('route-start')?success('route-offered',offer):success('route-ready',route));await f.model.run('route-start');for(const input of ['bad-json',JSON.stringify({...route,token:'secret'}),JSON.stringify({...route,offer:{...offer,routeId:'foreign-route'}}),'x'.repeat(16385)])assert.equal(await f.model.run('route-confirm',input),false);assert.equal(f.calls.length,2);assert.equal(await f.model.run('route-confirm',JSON.stringify(route)),true);assert.equal(f.calls.at(-1),'/harmony-device route-confirm '+JSON.stringify(route));assert.equal(await f.model.run('route-confirm',JSON.stringify(route)),false)})
test('connect and reconnect remain distinct explicit requests and do not change the reply payload',async()=>{const f=await ready(async line=>line.endsWith('status')?success('route-ready',route):success('transport-started'));await f.model.run('connect');assert.equal(await f.model.run('connect'),false);assert.equal(f.model.source.getSnapshot().allowed.includes('reconnect'),true);await f.model.run('reconnect');assert.deepEqual(f.calls,['/harmony-device status','/harmony-device connect','/harmony-device reconnect'])})
test('request uncertainty locks mutations even after status; cleanup failure cannot replace first cause',async()=>{let stopFails=true;const f=await ready(async line=>{if(line.endsWith('connect'))throw Error('secret-token');if(line.endsWith('stop'))return stopFails?{kind:'error',text:'secret cleanup'}:success('stopped');return success('route-ready',route)});await f.model.run('connect');assert.equal(f.model.source.getSnapshot().uncertain,true);await f.model.run('status');assert.equal(await f.model.run('connect'),false);await f.model.run('stop');assert.equal(f.model.source.getSnapshot().firstFailure,'unknown');assert.equal(JSON.stringify(f.model.source.getSnapshot()).includes('secret'),false);stopFails=false;await f.model.run('stop');assert.equal(f.model.source.getSnapshot().uncertain,false);assert.equal(f.model.source.getSnapshot().firstFailure,'unknown')})
test('foreign profile, foreign Session, unknown fields and oversized output cannot appear',async()=>{for(const value of [{profileId:'other',sessionId:sid,state:'bound'},{profileId:'desktop',sessionId:'unrelated-private-session',state:'bound'},{profileId:'desktop',sessionId:sid,state:'bound',token:'secret'}]){const f=fixture(async()=>({kind:'success',text:JSON.stringify(value)}));assert.equal(await f.model.run('status'),false);assert.equal(f.model.source.getSnapshot().publicText,'');assert.equal(f.model.source.getSnapshot().notice,'unavailable')}const f=fixture(async()=>({kind:'success',text:'secret'.repeat(10000)}));await f.model.run('status');assert.equal(f.model.source.getSnapshot().publicText,'')})
test('ended Session cannot dispatch and an in-flight late reply cannot reach a replacement',async()=>{const f=fixture();f.stale();await f.model.run('status');assert.deepEqual(f.calls,[]);assert.equal(f.model.source.getSnapshot().phase,'disposed');let settle;const g=fixture(()=>new Promise(resolve=>{settle=resolve}));const request=g.model.run('status');g.model.dispose();settle(success('bound'));await request;assert.equal(g.model.source.getSnapshot().publicText,'');assert.equal(g.model.source.getSnapshot().phase,'disposed')})

let factory
runInNewContext(await readFile(process.env.DSH_HARMONY_FEEDBACK_FACTORY,'utf8'),{window:{__ModuleLoader__:{load:value=>{factory=value}}},TextEncoder,TextDecoder,AbortController,URL,console,setTimeout,clearTimeout})
const Plugin=factory.factory(name=>{if(name==='zod')return require(name);if(name==='@deepseek-ai/dsh-client-ui-primitives')return{closeTopModal:()=>{}};if(['react','react/jsx-runtime'].includes(name))return reactRequire(name);throw Error('Unexpected client import '+name)})
const {Context}=await import(pathToFileURL(root+'/vendor/cordis/lib/index.js').href)
async function browserFixture(respond=async(id)=>({ok:true,value:{commandId:'cmd-test',result:success('bound',undefined,id)}})){
 const ctx=new Context(),dictionaries=new Map(),rows=new Map(),scopes=new Map(),sessions=new Map(),scopeDisposers=[],calls=[]
 const actx={effect:fn=>{const dispose=fn();scopeDisposers.push(dispose);return dispose},get:()=>undefined};scopes.set(sid,actx);sessions.set(actx,{sessionId:sid})
 ctx.reflect.provide('sessions',{scope:id=>scopes.get(id),sessionOf:scope=>sessions.get(scope)})
 ctx.reflect.provide('commandUi',{})
 ctx.reflect.provide('locale',{register:(name,value)=>{dictionaries.set(name,value);return()=>dictionaries.delete(name)},bind:name=>key=>dictionaries.get(name).zh[key]})
 ctx.reflect.provide('slots',{inject:(name,callback)=>ctx.effect(callback),register:(entry,component)=>{const key=entry.id??entry.name;rows.set(key,{entry,component});return()=>rows.delete(key)}})
 const commandsRemote={execute:async(...args)=>{calls.push(args);return respond(...args)}};ctx.reflect.provide('remote',{commands:commandsRemote});ctx.reflect.provide('remote.commands',commandsRemote)
 const plugin=ctx.plugin(Plugin);await plugin
 const settings=rows.get('harmony-phone'),panel=rows.get('harmony.controls'),face=panel.entry.inject(sid)
 const render=(lang='zh')=>reactRequire('react-dom/server').renderToStaticMarkup(reactRequire('react').createElement(panel.component,{useControl:()=>face.hooks.control.getSnapshot(),run:face.run,t:key=>dictionaries.get('harmony-controls')[lang][key]}))
 const renderSettings=(selected=true)=>reactRequire('react-dom/server').renderToStaticMarkup(reactRequire('react').createElement(settings.component,{SessionProvider:({children,empty})=>selected?children:empty(),renderSlot:()=>selected?reactRequire('react').createElement(panel.component,{useControl:()=>face.hooks.control.getSnapshot(),run:face.run,t:key=>dictionaries.get('harmony-controls').zh[key]}):null,t:key=>dictionaries.get('harmony-controls').zh[key]}))
 return{ctx,plugin,rows,scopes,calls,settings,panel,face,render,renderSettings,close:async()=>{await ctx.fiber.dispose();for(const dispose of scopeDisposers)dispose?.()}}
}
test('production factory places controls only in Plugins settings and preserves authenticated Session arguments',async()=>{const f=await browserFixture();try{assert.equal(f.settings.entry.name,'settings.plugins.tab');assert.equal(f.settings.entry.label(),'手机连接');assert.equal(f.panel.entry.name,'harmony.controls');assert.equal([...f.rows.values()].some(row=>row.entry.name==='conversation.input.dock'),false);assert.deepEqual(f.calls,[]);assert.equal(f.panel.entry.inject(sid),f.face);await f.face.run('status');assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],sid);assert.equal(f.calls[0][1],'/harmony-device status');assert.equal(f.calls[0][2].length,0);assert.match(f.render(),/手机连接控制/);assert.match(f.render('en'),/Phone connection controls/)}finally{await f.close()}})
test('built settings panel renders the reported deadline and localized expiry guidance', async () => {
 const f = await browserFixture(async sessionId => ({ ok: true, value: {
  result: success('workspace-enabled', { enabled: true, expiresAt: 5000 }, sessionId),
 } }))
 try {
  await f.face.run('workspace-status')
  assert.match(f.render(), /<time[^>]+1970-01-01T00:00:05\.000Z/)
  assert.match(f.render(), /已到截止时间，请查询工作区授权状态/)
  assert.match(f.render('en'), /The reported deadline has passed/)
  assert.equal(f.calls.length, 1)
 } finally { await f.close() }
})
test('built settings panel offers saved connection only after a fresh paired status', async () => {
 const f = await browserFixture(async (sessionId, line) => {
  const result = line.endsWith('workspace-status') ? success('workspace-enabled', { enabled: true, expiresAt: 5000 }, sessionId)
   : line.endsWith('stop') ? success('stopped', undefined, sessionId)
   : { kind: 'success', text: JSON.stringify({ profileId: 'desktop', sessionId, state: 'bound', savedConnectionReady: true }) }
  return { ok: true, value: { result } }
 })
 try {
  await f.face.run('workspace-status')
  await f.face.run('stop')
  assert.equal(f.face.hooks.control.getSnapshot().workspaceState, null)
  assert.match(f.render(), /data-harmony-action="connect" disabled/)
  await f.face.run('status')
  assert.match(f.render(), /data-harmony-action="connect">连接/)
  assert.match(f.render(), /data-harmony-action="route-start" disabled/)
  assert.deepEqual(f.calls.map(call => call[1]), ['/harmony-device workspace-status', '/harmony-device stop', '/harmony-device status'])
 } finally { await f.close() }
})
test('Plugins settings show guidance without a Session and mount controls without dispatching',async()=>{const f=await browserFixture();try{assert.match(f.renderSettings(false),/请先打开一个会话/);assert.equal(f.renderSettings(false).includes('data-harmony-action'),false);assert.match(f.renderSettings(),/data-harmony-action="status"/);assert.deepEqual(f.calls,[])}finally{await f.close()}})
test('normal remote confirmation wait disables every action without fabricating an answer',async()=>{let settle;const f=await browserFixture((id,line)=>line.endsWith('status')?Promise.resolve({ok:true,value:{result:success('bound',undefined,id)}}):new Promise(resolve=>{settle=resolve}));try{await f.face.run('status');const request=f.face.run('route-start');const html=f.render();for(const m of html.matchAll(/data-harmony-action="([^"]+)"([^>]*)/g))assert.match(m[2],/disabled/);assert.match(html,/等待命令或正常产品确认/);assert.equal(f.calls.length,2);settle({ok:true,value:{result:{kind:'error',text:'Deny'}}});await request;assert.equal(f.face.hooks.control.getSnapshot().notice,'rejected');assert.equal(f.calls.length,2)}finally{await f.close()}})
test('initial view snapshot has ten fixed actions, no pairing or arbitrary command input',async()=>{const f=await browserFixture();try{const html=f.render();const actions=[...html.matchAll(/data-harmony-action="([^"]+)"([^>]*)/g)].map(m=>({action:m[1],disabled:/disabled/.test(m[2])}));assert.deepEqual(actions,[{action:'status',disabled:false},{action:'route-status',disabled:false},{action:'route-start',disabled:true},{action:'connect',disabled:true},{action:'reconnect',disabled:true},{action:'stop',disabled:false},{action:'route-confirm',disabled:true},{action:'workspace-status',disabled:false},{action:'workspace-allow',disabled:true},{action:'workspace-stop',disabled:false}]);assert.equal(html.includes('data-harmony-action="revoke"'),false);assert.equal(html.includes('data-harmony-action="start"'),false);assert.match(html,/本地停止不等于中转撤销/)}finally{await f.close()}})
test('plugin unload removes panel and prevents requests from old callbacks',async()=>{const f=await browserFixture();try{await f.plugin.dispose();assert.equal(f.rows.size,0);assert.equal(await f.face.run('status'),false);assert.deepEqual(f.calls,[])}finally{await f.close()}})
test('scope replacement cannot redirect the original panel into another conversation',async()=>{const f=await browserFixture();try{f.scopes.set(sid,{id:'replacement'});assert.equal(await f.face.run('status'),false);assert.deepEqual(f.calls,[])}finally{await f.close()}})
