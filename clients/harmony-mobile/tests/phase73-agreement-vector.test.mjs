/** RFC5903 section8.1 public test values; no device identities, entropy generation or network. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, diffieHellman, webcrypto } from 'node:crypto'
import { NativeTransientAgreement, NativeCryptoPrimitives, cryptoFramework, reset } from '../.build/phase35-native-crypto.js'
const hex=value=>Buffer.from(value.replaceAll(' ',''),'hex'),base=value=>hex(value).toString('base64url')
const alice={kty:'EC',crv:'P-256',d:base('C88F01F5 10D9AC3F 70A292DA A2316DE5 44E9AAB8 AFE84049 C62A9C57 862D1433'),x:base('DAD0B653 94221CF9 B051E1FE CA5787D0 98DFE637 FC90B9EF 945D0C37 72581180'),y:base('5271A046 1CDB8252 D61F1C45 6FA3E59A B1F45B33 ACCF5F58 389E0577 B8990BB3')}
const bob={kty:'EC',crv:'P-256',x:base('D12DFB52 89C8D4F8 1208B702 70398C34 2296970A 0BCCB74C 736FC755 4494BF63'),y:base('56FBF3CA 366CC23E 8157854C 13C58D6A AC23F046 ADA30F83 53E74F33 039872AB')}
const expected=hex('D6840F6B 42F6EDAF D13116E0 E1256520 2FEF8E9E CE7DCE03 812464D0 4B9442DE'),privateKey=createPrivateKey({key:alice,format:'jwk'}),publicKey=createPublicKey({key:bob,format:'jwk'}),peer=publicKey.export({type:'spki',format:'der'})
test('RFC5903 fixed shared secret agrees through Node and independent WebCrypto API',async()=>{
  assert.deepEqual(diffieHellman({privateKey,publicKey}),expected)
  const local=await webcrypto.subtle.importKey('jwk',alice,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']),remote=await webcrypto.subtle.importKey('jwk',bob,{name:'ECDH',namedCurve:'P-256'},false,[])
  assert.deepEqual(Buffer.from(await webcrypto.subtle.deriveBits({name:'ECDH',public:remote},local,256)),expected)
})
test('actual ETS agreement requests the documented native algorithm and preserves RFC5903 SPKI/secret bytes',async()=>{
  reset();const generator=cryptoFramework.createAsyKeyGenerator,agreementFactory=cryptoFramework.createKeyAgreement,calls=[];let clears=0
  cryptoFramework.createAsyKeyGenerator=(...args)=>({...generator(...args),generateKeyPair:async()=>({pubKey:{getEncoded:()=>({data:createPublicKey(privateKey).export({type:'spki',format:'der'})})},priKey:{key:privateKey,clearMem:()=>{clears++}}})})
  cryptoFramework.createKeyAgreement=algorithm=>{calls.push(algorithm);return agreementFactory(algorithm)}
  const authority={},agreement=new NativeTransientAgreement(authority)
  try{await agreement.initialize(authority);assert.deepEqual(Buffer.from(await agreement.derive(authority,peer)),expected);assert.deepEqual(calls,['ECC256']);await assert.rejects(agreement.derive(authority,Uint8Array.of(4,1,2,3)),{code:'agreement-derive-failed'})}
  finally{agreement.close();cryptoFramework.createAsyKeyGenerator=generator;cryptoFramework.createKeyAgreement=agreementFactory}
  assert.equal(clears,1)
})
test('SDK-wrapper HKDF byte lengths and GCM ciphertext/tag framing match WebCrypto for UTF8 application data',async()=>{
  const native=new NativeCryptoPrimitives(8192),salt=new Uint8Array(32).fill(3),info=Buffer.from('dsh-mobile-e2e/1 fixed traffic-key'),input=Buffer.from('synthetic 手机 rich form'),iv=new Uint8Array(12).fill(4),aad=Buffer.from('fixed authenticated header')
  const baseKey=await webcrypto.subtle.importKey('raw',expected,'HKDF',false,['deriveBits']),reference=new Uint8Array(await webcrypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},baseKey,288)),derived=await native.hkdf(expected,salt,info,36)
  assert.deepEqual(Buffer.from(derived),Buffer.from(reference));const key=derived.slice(0,32),webKey=await webcrypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt','decrypt']),sealed=await native.encrypt(key,iv,aad,input),webSealed=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},webKey,input)
  assert.deepEqual(Buffer.from(sealed),Buffer.from(webSealed));assert.equal(sealed.length,input.length+16);assert.deepEqual(Buffer.from(await native.decrypt(key,iv,aad,new Uint8Array(webSealed))),input);sealed[sealed.length-1]^=1;await assert.rejects(native.decrypt(key,iv,aad,sealed),{code:'crypto-decrypt-failed'});derived.fill(0);key.fill(0)
})
