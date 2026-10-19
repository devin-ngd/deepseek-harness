/** SDK substitute uses a single known scalar 6, never HUKS, a device, entropy generation, credentials or network. */
import { createECDH, createPrivateKey, createPublicKey, createHash, sign, verify, diffieHellman, hkdfSync, createCipheriv, createDecipheriv } from 'node:crypto'
const scalar = Buffer.alloc(32); scalar[31] = 6
const ec = createECDH('prime256v1'); ec.setPrivateKey(scalar); const point = ec.getPublicKey()
const fixture = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: scalar.toString('base64url'), x: point.subarray(1,33).toString('base64url'), y: point.subarray(33).toString('base64url') } })
export const fixturePublic = createPublicKey(fixture).export({ format: 'der', type: 'spki' })
export const state = { calls: [], aliases: new Set(), handles: new Map(), failure: null, failureCode: null, clears: 0, huksOptions: [] }
const operation = name => { state.calls.push(name); if (state.failure === name) throw Object.assign(new Error('FAKE_NATIVE_FAILURE'), state.failureCode === null ? {} : { code: state.failureCode }) }
export const reset = () => { state.calls.length = 0; state.aliases.clear(); state.handles.clear(); state.failure = null; state.failureCode = null; state.clears = 0; state.huksOptions.length = 0 }
function purpose(operation, options, expected) { const value = options?.properties?.find(row => row.tag === 4)?.value; state.huksOptions.push({ operation, purpose: value }); if (value !== expected) throw Object.assign(new Error('FAKE_INVALID_PURPOSE'), { code: 12000003 }) }
export const huks = {
  HuksTag: { HUKS_TAG_AUTH_STORAGE_LEVEL:1, HUKS_TAG_ALGORITHM:2, HUKS_TAG_KEY_SIZE:3, HUKS_TAG_PURPOSE:4, HUKS_TAG_DIGEST:5 },
  HuksKeyAlg:{HUKS_ALG_ECC:2}, HuksKeySize:{HUKS_ECC_KEY_SIZE_256:256}, HuksKeyPurpose:{HUKS_KEY_PURPOSE_SIGN:4,HUKS_KEY_PURPOSE_VERIFY:8}, HuksKeyDigest:{HUKS_DIGEST_SHA256:12}, HuksAuthStorageLevel:{HUKS_AUTH_STORAGE_LEVEL_ECE:2},
  isKeyItemExist: async alias => { operation('legacy-exists'); if (!state.aliases.has(alias)) throw Object.assign(new Error('queried entity does not exist'), { code: 12000011 }); return true },
  hasKeyItem: async alias => { operation('exists'); return state.aliases.has(alias) },
  generateKeyItem: async (alias, options) => { operation('create'); purpose('create', options, 12); state.aliases.add(alias) },
  exportKeyItem: async alias => { operation('public'); if (!state.aliases.has(alias)) throw Error('FAKE_KEY_MISSING'); return { outData:fixturePublic } },
  deleteKeyItem: async alias => { operation('remove'); state.aliases.delete(alias) },
  initSession: async (alias, options) => { operation('init'); purpose('init', options, 4); if (!state.aliases.has(alias)) throw Error('FAKE_KEY_MISSING'); const handle=state.handles.size+1; state.handles.set(handle,Buffer.alloc(0)); return { handle } },
  updateSession: async (handle, options) => { operation('update'); purpose('update', options, 4); state.handles.set(handle, Buffer.from(options.inData)) },
  finishSession: async (handle, options) => { operation('finish'); purpose('finish', options, 4); const data=state.handles.get(handle);state.handles.delete(handle);return { outData:sign('sha256',data,{key:fixture,dsaEncoding:'der'}) } },
  abortSession: async (handle, options) => { operation('abort'); purpose('abort', options, 4); state.handles.delete(handle) },
}
const publicKey = bytes => { const key=createPublicKey({key:Buffer.from(bytes),format:'der',type:'spki'});return { key,getEncoded:()=>({data:key.export({format:'der',type:'spki'})}),getAsyKeySpec:()=>key.asymmetricKeyDetails?.namedCurve } }
const privateKey = { key:fixture, clearMem:()=>{state.clears++} }
export const cryptoFramework = {
  AsyKeySpecItem:{ECC_CURVE_NAME_STR:1},
  createMd:()=>{const md=createHash('sha256');return {update:async data=>{md.update(data.data)},digest:async()=>({data:md.digest()})}},
  CryptoMode:{ENCRYPT_MODE:1,DECRYPT_MODE:2},
  createAsyKeyGenerator: () => ({ convertKey:async pub=>({pubKey:publicKey(pub.data),priKey:privateKey}),generateKeyPair:async()=>{operation('ephemeral-fixture');return {pubKey:publicKey(fixturePublic),priKey:privateKey}} }),
  createVerify:()=>{let key;return {init:async pub=>{key=pub.key},verify:async (data,sig)=>verify('sha256',data.data,{key,dsaEncoding:'der'},sig.data)}},
  createKeyAgreement:algorithm=>{if(algorithm!=='ECC256')throw Object.assign(new Error('DOCUMENTED_P256_AGREEMENT_REQUIRED'),{code:401});return {generateSecret:async (privateValue,publicValue)=>({data:diffieHellman({privateKey:privateValue.key,publicKey:publicValue.key})})}},
  createKdf:()=>({generateSecret:async spec=>({data:new Uint8Array(hkdfSync('sha256',spec.key,spec.salt,spec.info,spec.keySize))})}),
  createSymKeyGenerator:()=>({convertKey:async data=>({data:Buffer.from(data.data),clearMem(){this.data.fill(0);state.clears++}})}),
  createCipher:()=>{let key,params,mode;return {init:async (m,k,p)=>{mode=m;key=k;params=p},doFinal:async data=>{operation('cipher');if(mode===1){const c=createCipheriv('aes-256-gcm',key.data,params.iv.data,{authTagLength:16});c.setAAD(params.aad.data);return {data:Buffer.concat([c.update(data.data),c.final(),c.getAuthTag()])}}const c=createDecipheriv('aes-256-gcm',key.data,params.iv.data,{authTagLength:16});c.setAAD(params.aad.data);c.setAuthTag(params.authTag.data);return {data:Buffer.concat([c.update(data.data),c.final()])}}}},
}
