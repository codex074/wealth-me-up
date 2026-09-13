import test from 'node:test';
import assert from 'node:assert/strict';
import {signToken,verifyToken,randomToken,base64UrlEncode,base64UrlDecode} from '../lib/auth/session.ts';
import {serializeCookie,clearCookie,readCookie,redirectResponse} from '../lib/auth/http.ts';
import {readAuthConfig,parseAllowedEmails,isAllowedEmail} from '../lib/auth/config.ts';
import {safeRelativeReturnPath} from '../lib/auth/return-path.ts';
import {createPkce,buildAuthorizationUrl,exchangeCode,decodeIdToken,validateIdTokenClaims} from '../lib/auth/google.ts';

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

const ENV={GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',SESSION_SECRET:SECRET,ALLOWED_EMAILS:'Owner@Example.com',APP_ORIGIN:'https://wealth-me-up.codex074.com/'};

test('allowlist parsing is case-insensitive and ignores blanks',()=>{
 const allowed=parseAllowedEmails(' A@x.com, ,b@Y.com ,');
 assert.deepEqual([...allowed],['a@x.com','b@y.com']);
 assert.ok(isAllowedEmail('B@y.COM',allowed));
 assert.ok(!isAllowedEmail('c@y.com',allowed));
 assert.equal(parseAllowedEmails(undefined).size,0);
});
test('auth config reads env and reports every missing variable',()=>{
 const config=readAuthConfig(ENV);
 assert.equal(config.appOrigin,'https://wealth-me-up.codex074.com');
 assert.equal(config.redirectUri,'https://wealth-me-up.codex074.com/auth/google/callback');
 assert.equal(config.secureCookies,true);
 assert.ok(config.allowedEmails.has('owner@example.com'));
 assert.equal(readAuthConfig({...ENV,APP_ORIGIN:'http://localhost:5173'}).secureCookies,false);
 assert.throws(()=>readAuthConfig({...ENV,GOOGLE_CLIENT_SECRET:'',ALLOWED_EMAILS:undefined}),/AUTH_NOT_CONFIGURED: missing GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS/);
 assert.throws(()=>readAuthConfig({...ENV,ALLOWED_EMAILS:' , '}),/ALLOWED_EMAILS/);
});
test('return_to is restricted to same-origin non-auth paths',()=>{
 assert.equal(safeRelativeReturnPath('/accounts?x=1#y'),'/accounts?x=1#y');
 assert.equal(safeRelativeReturnPath('/'),'/');
 assert.equal(safeRelativeReturnPath('https://evil.example/'),'/');
 assert.equal(safeRelativeReturnPath('//evil.example'),'/');
 assert.equal(safeRelativeReturnPath('/login'),'/');
 assert.equal(safeRelativeReturnPath('/auth/google/callback?code=1'),'/');
 assert.equal(safeRelativeReturnPath('/auth'),'/auth');
 assert.equal(safeRelativeReturnPath(null),'/');
 assert.equal(safeRelativeReturnPath('relative'),'/');
});

const CLAIMS={iss:'https://accounts.google.com',aud:'id',exp:2000,email_verified:true,email:'Owner@Example.com',name:'Owner',picture:'https://p/x.png'};

test('authorization URL carries PKCE, state, and scopes',async()=>{
 const {verifier,challenge}=await createPkce();
 assert.notEqual(verifier,challenge);
 assert.doesNotMatch(challenge,/[+/=]/);
 const url=new URL(buildAuthorizationUrl({clientId:'id',redirectUri:'https://app/auth/google/callback',state:'st',codeChallenge:challenge}));
 assert.equal(url.origin+url.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
 assert.equal(url.searchParams.get('client_id'),'id');
 assert.equal(url.searchParams.get('redirect_uri'),'https://app/auth/google/callback');
 assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('scope'),'openid email profile');
 assert.equal(url.searchParams.get('state'),'st');
 assert.equal(url.searchParams.get('code_challenge'),challenge);
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('prompt'),'select_account');
});
test('code exchange posts the expected form and returns the id token',async()=>{
 let captured:{url:string,body:URLSearchParams}|null=null;
 const fetchImpl=(async(input:RequestInfo|URL,init?:RequestInit)=>{captured={url:String(input),body:new URLSearchParams(String(init?.body))};return new Response(JSON.stringify({id_token:'a.b.c'}),{status:200});}) as typeof fetch;
 const result=await exchangeCode({code:'c0de',verifier:'v',clientId:'id',clientSecret:'s',redirectUri:'https://app/cb'},fetchImpl);
 assert.equal(result.idToken,'a.b.c');
 assert.equal(captured!.url,'https://oauth2.googleapis.com/token');
 assert.equal(captured!.body.get('grant_type'),'authorization_code');
 assert.equal(captured!.body.get('code'),'c0de');
 assert.equal(captured!.body.get('code_verifier'),'v');
 assert.equal(captured!.body.get('client_id'),'id');
 assert.equal(captured!.body.get('client_secret'),'s');
 assert.equal(captured!.body.get('redirect_uri'),'https://app/cb');
 const failing=(async()=>new Response('{"error":"bad"}',{status:400})) as typeof fetch;
 await assert.rejects(exchangeCode({code:'c',verifier:'v',clientId:'id',clientSecret:'s',redirectUri:'r'},failing),/TOKEN_EXCHANGE_FAILED/);
 const empty=(async()=>new Response('{}',{status:200})) as typeof fetch;
 await assert.rejects(exchangeCode({code:'c',verifier:'v',clientId:'id',clientSecret:'s',redirectUri:'r'},empty),/TOKEN_EXCHANGE_FAILED/);
});
test('id token decoding and claim validation',()=>{
 const encoded=Buffer.from(JSON.stringify(CLAIMS)).toString('base64url');
 assert.deepEqual(decodeIdToken(`h.${encoded}.s`),CLAIMS);
 assert.throws(()=>decodeIdToken('nope'));
 assert.deepEqual(validateIdTokenClaims(CLAIMS,{clientId:'id',now:1000_000}),{email:'owner@example.com',name:'Owner',picture:'https://p/x.png'});
 assert.deepEqual(validateIdTokenClaims({...CLAIMS,iss:'accounts.google.com',name:undefined,picture:undefined},{clientId:'id',now:1000_000}),{email:'owner@example.com',name:null,picture:null});
 assert.throws(()=>validateIdTokenClaims({...CLAIMS,iss:'https://evil'},{clientId:'id',now:1000_000}),/INVALID_ID_TOKEN/);
 assert.throws(()=>validateIdTokenClaims({...CLAIMS,aud:'other'},{clientId:'id',now:1000_000}),/INVALID_ID_TOKEN/);
 assert.throws(()=>validateIdTokenClaims(CLAIMS,{clientId:'id',now:2000_000}),/INVALID_ID_TOKEN/);
 assert.throws(()=>validateIdTokenClaims({...CLAIMS,email_verified:false},{clientId:'id',now:1000_000}),/INVALID_ID_TOKEN/);
 assert.throws(()=>validateIdTokenClaims({...CLAIMS,email:''},{clientId:'id',now:1000_000}),/INVALID_ID_TOKEN/);
});
