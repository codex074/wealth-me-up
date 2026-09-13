import test from 'node:test';
import assert from 'node:assert/strict';
import {signToken,verifyToken,randomToken,base64UrlEncode,base64UrlDecode} from '../lib/auth/session.ts';
import {serializeCookie,clearCookie,readCookie,redirectResponse} from '../lib/auth/http.ts';

const SECRET='test-secret-at-least-32-bytes-long!!';

test('token round trip and expiry',async()=>{
 const token=await signToken({email:'a@b.com',exp:2000},SECRET);
 assert.deepEqual(await verifyToken(token,SECRET,1000),{email:'a@b.com',exp:2000});
 assert.equal(await verifyToken(token,SECRET,2000),null);
 assert.equal(await verifyToken(token,SECRET,3000),null);
});
test('token rejects tampering, wrong secret, and malformed input',async()=>{
 const token=await signToken({email:'a@b.com',exp:2000},SECRET);
 const [payload,sig]=token.split('.');
 const forged=base64UrlEncode(new TextEncoder().encode(JSON.stringify({email:'evil@b.com',exp:2000})));
 assert.equal(await verifyToken(`${forged}.${sig}`,SECRET,1000),null);
 assert.equal(await verifyToken(token,'other-secret',1000),null);
 assert.equal(await verifyToken(payload,SECRET,1000),null);
 assert.equal(await verifyToken('',SECRET,1000),null);
 assert.equal(await verifyToken('a.b.c',SECRET,1000),null);
 const noExp=await signToken({email:'a@b.com',exp:'soon' as unknown as number},SECRET);
 assert.equal(await verifyToken(noExp,SECRET,1000),null);
});
test('base64url helpers and random tokens',()=>{
 const bytes=new Uint8Array([0,255,254,253,1,2,3]);
 const text=base64UrlEncode(bytes);
 assert.doesNotMatch(text,/[+/=]/);
 assert.deepEqual(base64UrlDecode(text),bytes);
 assert.notEqual(randomToken(),randomToken());
 assert.equal(base64UrlDecode(randomToken(16)).length,16);
});
test('cookie helpers',()=>{
 assert.equal(serializeCookie('wmu_session','abc',{maxAge:600,secure:true}),'wmu_session=abc; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure');
 assert.equal(serializeCookie('wmu_session','abc',{maxAge:600,secure:false}),'wmu_session=abc; Path=/; Max-Age=600; HttpOnly; SameSite=Lax');
 assert.equal(clearCookie('wmu_oauth',true),'wmu_oauth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
 assert.equal(readCookie('a=1; wmu_session=tok.sig; b=2','wmu_session'),'tok.sig');
 assert.equal(readCookie('a=1','wmu_session'),null);
 assert.equal(readCookie(null,'wmu_session'),null);
 const r=redirectResponse('/login',['x=1; Path=/','y=2; Path=/']);
 assert.equal(r.status,302);
 assert.equal(r.headers.get('location'),'/login');
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.deepEqual(r.headers.getSetCookie(),['x=1; Path=/','y=2; Path=/']);
 assert.equal(redirectResponse('/',[],303).status,303);
});
