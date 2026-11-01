/** Append-only signed replay history must survive the next approved route without losing prior decisions. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const api=await import(pathToFileURL(process.env.DSH_ROUTE_HISTORY_MODULE).href),p=api.nodeE2EPrimitives
const config=JSON.parse(await readFile('product.config.json','utf8'))
const bytes=raw=>new TextEncoder().encode(raw).length
function memory(){let raw=null,writes=0;return{get raw(){return raw},get writes(){return writes},read:async()=>raw,write:async next=>{raw=next;writes++},compareAndSet:async(old,next)=>{assert.equal(raw,old);raw=next;writes++},close:async()=>{}}}
async function fixture(){
 const authority={},desktop=memory(),phone=memory(),source=api.fixtureSource(),clock=()=>1000000
 const unsigned={schema:'harmony-device-binding/1',bindingId:'fixture-original-binding',desktopId:'fixture-desktop',profileId:'desktop',deviceId:'fixture-phone',identityAlias:'fixture-original-phone',desktopPublicSpki:api.desktopKey.publicSpki,phonePublicSpki:api.phoneKey.publicSpki,desktopCredentialId:await p.credentialId(api.desktopKey.publicSpki),credentialId:await p.credentialId(api.phoneKey.publicSpki),audience:'relay.example',scope:{kind:'all-visible-sessions',profileId:'desktop'},operations:[...api.deviceGrantOperations],epoch:1,createdAt:1,revoked:false}
 const binding={...unsigned,signature:p.encode(await api.desktopKey.sign(api.deviceBindingBytes(unsigned)))}
 const make=(role,storage)=>new api.DeviceRouteOwner(authority,role,async()=>binding,storage,role==='desktop'?api.desktopKey:api.phoneKey,p,clock,role==='desktop'?source:undefined)
 const d=make('desktop',desktop),seed=make('phone',phone)
 while(phone.raw===null||bytes(phone.raw)<30000){const offer=await d.offer(authority,600000);await seed.acceptOffer(authority,offer,true);await seed.retire(authority);await d.retire(authority)}
 assert.ok(bytes(phone.raw)<=32768);await seed.close()
 return{authority,desktop,phone,d,make,close:()=>d.close()}
}

test('configured phone storage appends a new signed route past 32 KiB while preserving all prior history',async()=>{
 const f=await fixture(),before=JSON.parse(f.phone.raw),beforeBytes=bytes(f.phone.raw)
 const storage=new api.ProductRouteStorage(f.phone,Math.min(config.core.trustMaxBytes,524288)),phone=f.make('phone',storage)
 try{
  assert.ok(config.publicTrustMaxBytes>=config.core.trustMaxBytes)
  const offer=await f.d.offer(f.authority,600000),route=await phone.acceptOffer(f.authority,offer,true),after=JSON.parse(f.phone.raw)
  assert.ok(bytes(f.phone.raw)>32768);assert.ok(beforeBytes<32768)
  assert.deepEqual(after.offers.slice(0,-1),before.offers);assert.deepEqual(after.routes.slice(0,-1),before.routes);assert.deepEqual(after.retired,before.retired)
  assert.equal((await phone.current(f.authority)).offer.routeId,route.offer.routeId)
  await assert.rejects(phone.acceptOffer(f.authority,offer,true))
 }finally{await phone.close();await storage.close();await f.close()}
})

test('oversized public history refuses before writing and retains the previous bytes',async()=>{
 const f=await fixture(),previous=f.phone.raw,writes=f.phone.writes,storage=new api.ProductRouteStorage(f.phone,524288)
 try{await assert.rejects(storage.compareAndSet(previous,' '.repeat(524289)));assert.equal(f.phone.raw,previous);assert.equal(f.phone.writes,writes)}finally{await storage.close();await f.close()}
})
