# Google Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ChatGPT-header identity and the Cloudflare Access gate with an in-app Google login (allowlist only) that gates the whole app, and update the pve1 deployment to match.

**Architecture:** Hand-rolled Google Authorization Code + PKCE flow in three route handlers, a stateless HMAC-signed session cookie verified by `app/auth.ts`, and a server-component `app/page.tsx` that redirects anonymous visitors to `/login`. Pure logic lives in `lib/auth/` (no framework imports) so it is unit-tested with `node --test`. Deployment drops Caddy and Cloudflare Access; the tunnel points straight at the app container and secrets reach the Worker through a generated `dist/server/.dev.vars`.

**Tech Stack:** Vinext (Next-compatible) on Vite + Cloudflare Workers runtime (`wrangler dev --local` in production), TypeScript 5.9, Web Crypto, `node:test` with `--experimental-strip-types`, Docker Compose, cloudflared.

**Spec:** `docs/superpowers/specs/2026-09-13-google-login-design.md`

## Global Constraints

- No new npm dependencies. Only Web Crypto (`crypto.subtle`, `crypto.getRandomValues`), `fetch`, `btoa`/`atob`.
- Files under `lib/auth/` must not import `next/*` or `cloudflare:workers`; only `app/auth.ts` and route handlers do.
- User-facing copy is Thai. Keep the green palette (`#285137`, `#e9efdf`, `#f7f8f5`). Code identifiers in English.
- Env var names, exactly: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `APP_ORIGIN`.
- Cookie names, exactly: `wmu_session` (Max-Age 2592000 = 30 days) and `wmu_oauth` (Max-Age 600). Flags: `Path=/; HttpOnly; SameSite=Lax`, plus `Secure` when `APP_ORIGIN` starts with `https://`.
- Portfolio owner key is `email.toLowerCase()`.
- Reserved auth paths (never a valid `return_to`): `/login` and anything under `/auth/`.
- Test command: `node --experimental-strip-types --test tests/auth.test.ts`. Type check: `node node_modules/typescript/bin/tsc --noEmit`. Build: `npm run build`.
- Never print or commit secret values. `deploy/.env` and `.dev.vars*` stay ignored.
- Commit after each task with the message shown. Do not push.

---

### Task 1: Signed tokens and cookie helpers (`lib/auth/session.ts`, `lib/auth/http.ts`)

**Files:**
- Create: `lib/auth/session.ts`
- Create: `lib/auth/http.ts`
- Create: `tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `signToken(payload: Record<string, unknown> & {exp: number}, secret: string): Promise<string>`
  - `verifyToken<T extends {exp: number}>(token: string, secret: string, now?: number): Promise<T | null>` — `now` is ms since epoch (default `Date.now()`); returns `null` for malformed, bad signature, non-numeric `exp`, or `exp <= now`.
  - `randomToken(bytes?: number): string` — base64url of `bytes` (default 32) random bytes.
  - `base64UrlEncode(bytes: Uint8Array): string`, `base64UrlDecode(text: string): Uint8Array`
  - `serializeCookie(name: string, value: string, options: {maxAge: number, secure: boolean}): string`
  - `clearCookie(name: string, secure: boolean): string` — `Max-Age=0`.
  - `readCookie(cookieHeader: string | null, name: string): string | null`
  - `redirectResponse(location: string, setCookies: string[], status?: 302 | 303): Response` — adds `Cache-Control: no-store`.

- [ ] **Step 1: Write the failing tests**

Create `tests/auth.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/auth.test.ts`
Expected: FAIL — cannot find module `../lib/auth/session.ts`.

- [ ] **Step 3: Implement `lib/auth/session.ts`**

```ts
const encoder=new TextEncoder();

export function base64UrlEncode(bytes:Uint8Array):string{
 let binary="";for(const b of bytes)binary+=String.fromCharCode(b);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export function base64UrlDecode(text:string):Uint8Array{
 const padded=text.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-text.length%4)%4);
 const binary=atob(padded);const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}

export function randomToken(bytes=32):string{
 return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hmac(secret:string,data:string):Promise<Uint8Array>{
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(data)));
}

function timingSafeEqual(a:Uint8Array,b:Uint8Array):boolean{
 if(a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0;
}

/** Produces `base64url(json).base64url(hmac-sha256)`. */
export async function signToken(payload:Record<string,unknown>&{exp:number},secret:string):Promise<string>{
 const body=base64UrlEncode(encoder.encode(JSON.stringify(payload)));
 return `${body}.${base64UrlEncode(await hmac(secret,body))}`;
}

/** Returns the payload when the signature is valid and `exp` (ms epoch) is still in the future. */
export async function verifyToken<T extends {exp:number}>(token:string,secret:string,now=Date.now()):Promise<T|null>{
 const parts=token.split(".");
 if(parts.length!==2||!parts[0]||!parts[1])return null;
 let expected:Uint8Array,given:Uint8Array;
 try{expected=await hmac(secret,parts[0]);given=base64UrlDecode(parts[1]);}catch{return null;}
 if(!timingSafeEqual(expected,given))return null;
 let payload:unknown;
 try{payload=JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));}catch{return null;}
 if(!payload||typeof payload!=="object")return null;
 const exp=(payload as {exp?:unknown}).exp;
 if(typeof exp!=="number"||!Number.isFinite(exp)||exp<=now)return null;
 return payload as T;
}
```

- [ ] **Step 4: Implement `lib/auth/http.ts`**

```ts
export function serializeCookie(name:string,value:string,{maxAge,secure}:{maxAge:number,secure:boolean}):string{
 return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure?"; Secure":""}`;
}

export function clearCookie(name:string,secure:boolean):string{
 return serializeCookie(name,"",{maxAge:0,secure});
}

export function readCookie(cookieHeader:string|null,name:string):string|null{
 if(!cookieHeader)return null;
 for(const part of cookieHeader.split(";")){
  const [key,...rest]=part.trim().split("=");
  if(key===name)return rest.join("=");
 }
 return null;
}

export function redirectResponse(location:string,setCookies:string[],status:302|303=302):Response{
 const headers=new Headers({Location:location,"Cache-Control":"no-store"});
 for(const cookie of setCookies)headers.append("Set-Cookie",cookie);
 return new Response(null,{status,headers});
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --experimental-strip-types --test tests/auth.test.ts`
Expected: 4 passing, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/session.ts lib/auth/http.ts tests/auth.test.ts
git commit -m "Add signed token and cookie helpers for app auth"
```

---

### Task 2: Config, allowlist, and safe return paths (`lib/auth/config.ts`, `lib/auth/return-path.ts`, `lib/auth/types.ts`)

**Files:**
- Create: `lib/auth/config.ts`
- Create: `lib/auth/return-path.ts`
- Create: `lib/auth/types.ts`
- Modify: `tests/auth.test.ts` (append)

**Interfaces:**
- Produces:
  - `type AuthConfig = {clientId: string, clientSecret: string, sessionSecret: string, allowedEmails: Set<string>, appOrigin: string, secureCookies: boolean, redirectUri: string}`
  - `readAuthConfig(env: Record<string, string | undefined>): AuthConfig` — throws `Error("AUTH_NOT_CONFIGURED: missing GOOGLE_CLIENT_ID, ...")` listing every missing/blank variable; `redirectUri` is `${appOrigin}/auth/google/callback`; `appOrigin` has any trailing slash removed.
  - `parseAllowedEmails(value: string | undefined): Set<string>` — comma-separated, trimmed, lowercased, blanks dropped.
  - `isAllowedEmail(email: string, allowed: Set<string>): boolean` — case-insensitive.
  - `safeRelativeReturnPath(value: string | null | undefined): string`
  - `type AppUser = {userId: string, email: string, displayName: string, fullName: string | null, picture: string | null}`
  - `type SessionPayload = {email: string, name: string | null, picture: string | null, iat: number, exp: number}`
  - `type OAuthStatePayload = {state: string, verifier: string, returnTo: string, exp: number}`

- [ ] **Step 1: Append failing tests to `tests/auth.test.ts`**

```ts
import {readAuthConfig,parseAllowedEmails,isAllowedEmail} from '../lib/auth/config.ts';
import {safeRelativeReturnPath} from '../lib/auth/return-path.ts';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/auth.test.ts`
Expected: FAIL — cannot find module `../lib/auth/config.ts`.

- [ ] **Step 3: Implement `lib/auth/types.ts`**

```ts
export type AppUser={userId:string,email:string,displayName:string,fullName:string|null,picture:string|null};
export type SessionPayload={email:string,name:string|null,picture:string|null,iat:number,exp:number};
export type OAuthStatePayload={state:string,verifier:string,returnTo:string,exp:number};
```

- [ ] **Step 4: Implement `lib/auth/config.ts`**

```ts
export type AuthConfig={clientId:string,clientSecret:string,sessionSecret:string,allowedEmails:Set<string>,appOrigin:string,secureCookies:boolean,redirectUri:string};

const REQUIRED=["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","SESSION_SECRET","ALLOWED_EMAILS","APP_ORIGIN"] as const;

export function parseAllowedEmails(value:string|undefined):Set<string>{
 return new Set((value??"").split(",").map(e=>e.trim().toLowerCase()).filter(Boolean));
}

export function isAllowedEmail(email:string,allowed:Set<string>):boolean{
 return allowed.has(email.trim().toLowerCase());
}

export function readAuthConfig(env:Record<string,string|undefined>):AuthConfig{
 const missing=REQUIRED.filter(name=>!env[name]||!env[name]!.trim());
 const allowedEmails=parseAllowedEmails(env.ALLOWED_EMAILS);
 if(env.ALLOWED_EMAILS&&env.ALLOWED_EMAILS.trim()&&allowedEmails.size===0)missing.push("ALLOWED_EMAILS");
 if(missing.length)throw new Error(`AUTH_NOT_CONFIGURED: missing ${missing.join(", ")}`);
 const appOrigin=env.APP_ORIGIN!.trim().replace(/\/+$/,"");
 return {
  clientId:env.GOOGLE_CLIENT_ID!.trim(),
  clientSecret:env.GOOGLE_CLIENT_SECRET!.trim(),
  sessionSecret:env.SESSION_SECRET!,
  allowedEmails,
  appOrigin,
  secureCookies:appOrigin.startsWith("https://"),
  redirectUri:`${appOrigin}/auth/google/callback`,
 };
}
```

- [ ] **Step 5: Implement `lib/auth/return-path.ts`**

```ts
const LOGIN_PATH="/login";
const AUTH_PREFIX="/auth/";

export function safeRelativeReturnPath(value:string|null|undefined):string{
 if(!value||!value.startsWith("/")||value.startsWith("//"))return "/";
 let url:URL;
 try{url=new URL(value,"https://app.local");}catch{return "/";}
 if(url.origin!=="https://app.local")return "/";
 if(url.pathname===LOGIN_PATH||url.pathname.startsWith(AUTH_PREFIX))return "/";
 return `${url.pathname}${url.search}${url.hash}`;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --experimental-strip-types --test tests/auth.test.ts`
Expected: 7 passing.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/config.ts lib/auth/return-path.ts lib/auth/types.ts tests/auth.test.ts
git commit -m "Add auth config, allowlist, and return path helpers"
```

---

### Task 3: Google OAuth helpers (`lib/auth/google.ts`)

**Files:**
- Create: `lib/auth/google.ts`
- Modify: `tests/auth.test.ts` (append)

**Interfaces:**
- Consumes: `base64UrlEncode`, `base64UrlDecode`, `randomToken` from `lib/auth/session.ts`.
- Produces:
  - `createPkce(): Promise<{verifier: string, challenge: string}>` — verifier = 32 random bytes base64url; challenge = base64url(SHA-256(verifier)).
  - `buildAuthorizationUrl(options: {clientId: string, redirectUri: string, state: string, codeChallenge: string}): string`
  - `exchangeCode(options: {code: string, verifier: string, clientId: string, clientSecret: string, redirectUri: string}, fetchImpl?: typeof fetch): Promise<{idToken: string}>` — throws on non-2xx or missing `id_token`.
  - `decodeIdToken(idToken: string): Record<string, unknown>` — parses the middle JWT segment; throws on malformed input.
  - `type GoogleIdentity = {email: string, name: string | null, picture: string | null}`
  - `validateIdTokenClaims(claims: Record<string, unknown>, options: {clientId: string, now?: number}): GoogleIdentity` — throws `Error` with message starting `INVALID_ID_TOKEN` when `iss` is not `https://accounts.google.com`/`accounts.google.com`, `aud !== clientId`, `exp` (seconds) `<= now/1000`, `email_verified !== true`, or `email` is not a non-empty string. Returns `email` trimmed and lowercased.

- [ ] **Step 1: Append failing tests to `tests/auth.test.ts`**

```ts
import {createPkce,buildAuthorizationUrl,exchangeCode,decodeIdToken,validateIdTokenClaims} from '../lib/auth/google.ts';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/auth.test.ts`
Expected: FAIL — cannot find module `../lib/auth/google.ts`.

- [ ] **Step 3: Implement `lib/auth/google.ts`**

```ts
import {base64UrlDecode,base64UrlEncode,randomToken} from "./session";

const AUTHORIZATION_ENDPOINT="https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT="https://oauth2.googleapis.com/token";
const ISSUERS=new Set(["https://accounts.google.com","accounts.google.com"]);

export type GoogleIdentity={email:string,name:string|null,picture:string|null};

export async function createPkce():Promise<{verifier:string,challenge:string}>{
 const verifier=randomToken(32);
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
 return {verifier,challenge:base64UrlEncode(new Uint8Array(digest))};
}

export function buildAuthorizationUrl({clientId,redirectUri,state,codeChallenge}:{clientId:string,redirectUri:string,state:string,codeChallenge:string}):string{
 const url=new URL(AUTHORIZATION_ENDPOINT);
 url.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:"openid email profile",state,code_challenge:codeChallenge,code_challenge_method:"S256",prompt:"select_account"}).toString();
 return url.toString();
}

export async function exchangeCode({code,verifier,clientId,clientSecret,redirectUri}:{code:string,verifier:string,clientId:string,clientSecret:string,redirectUri:string},fetchImpl:typeof fetch=fetch):Promise<{idToken:string}>{
 const body=new URLSearchParams({grant_type:"authorization_code",code,code_verifier:verifier,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri});
 const response=await fetchImpl(TOKEN_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:body.toString()});
 if(!response.ok)throw new Error(`TOKEN_EXCHANGE_FAILED: status ${response.status}`);
 const json=await response.json() as {id_token?:unknown};
 if(typeof json.id_token!=="string"||!json.id_token)throw new Error("TOKEN_EXCHANGE_FAILED: no id_token");
 return {idToken:json.id_token};
}

export function decodeIdToken(idToken:string):Record<string,unknown>{
 const parts=idToken.split(".");
 if(parts.length!==3)throw new Error("INVALID_ID_TOKEN: malformed");
 const payload=JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
 if(!payload||typeof payload!=="object")throw new Error("INVALID_ID_TOKEN: payload");
 return payload as Record<string,unknown>;
}

export function validateIdTokenClaims(claims:Record<string,unknown>,{clientId,now=Date.now()}:{clientId:string,now?:number}):GoogleIdentity{
 if(typeof claims.iss!=="string"||!ISSUERS.has(claims.iss))throw new Error("INVALID_ID_TOKEN: iss");
 if(claims.aud!==clientId)throw new Error("INVALID_ID_TOKEN: aud");
 if(typeof claims.exp!=="number"||claims.exp*1000<=now)throw new Error("INVALID_ID_TOKEN: exp");
 if(claims.email_verified!==true)throw new Error("INVALID_ID_TOKEN: email_verified");
 if(typeof claims.email!=="string"||!claims.email.trim())throw new Error("INVALID_ID_TOKEN: email");
 return {
  email:claims.email.trim().toLowerCase(),
  name:typeof claims.name==="string"&&claims.name?claims.name:null,
  picture:typeof claims.picture==="string"&&claims.picture?claims.picture:null,
 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --experimental-strip-types --test tests/auth.test.ts`
Expected: 10 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/google.ts tests/auth.test.ts
git commit -m "Add Google OAuth PKCE, token exchange, and id token validation helpers"
```

---

### Task 4: Server identity (`app/auth.ts`) replaces `app/chatgpt-auth.ts`

**Files:**
- Create: `app/auth.ts`
- Delete: `app/chatgpt-auth.ts`
- Modify: `app/api/portfolio/route.ts` (lines 2, 8, 14)
- Modify: `cloudflare-env.d.ts`
- Modify: `vite.config.ts` (the `sites({ mockAuth: !managedLinux })` line)
- Modify: `.gitignore`, `.dockerignore`

**Interfaces:**
- Consumes: `readAuthConfig`, `verifyToken`, `safeRelativeReturnPath`, `SessionPayload`, `AppUser`.
- Produces:
  - `SESSION_COOKIE = "wmu_session"`, `OAUTH_COOKIE = "wmu_oauth"`, `SESSION_MAX_AGE_SECONDS = 2592000`, `OAUTH_MAX_AGE_SECONDS = 600`
  - `authConfig(): AuthConfig` — reads `env` from `cloudflare:workers`; throws `AUTH_NOT_CONFIGURED`.
  - `getUser(): Promise<AppUser | null>` — no cookie → `null` without touching config; otherwise verify with `SESSION_SECRET` (throws only when config is missing).
  - `requireUser(returnTo: string): Promise<AppUser>` — `redirect(loginPath(returnTo))` when anonymous.
  - `loginPath(returnTo: string): string` — `/login?return_to=<encoded safe path>`.
  - `userFromSession(session: SessionPayload): AppUser` — `userId = email.toLowerCase()`, `displayName = name ?? email`.

- [ ] **Step 1: Create `app/auth.ts`**

```ts
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {env} from "cloudflare:workers";
import {readAuthConfig,type AuthConfig} from "@/lib/auth/config";
import {verifyToken} from "@/lib/auth/session";
import {safeRelativeReturnPath} from "@/lib/auth/return-path";
import type {AppUser,SessionPayload} from "@/lib/auth/types";

export const SESSION_COOKIE="wmu_session";
export const OAUTH_COOKIE="wmu_oauth";
export const SESSION_MAX_AGE_SECONDS=30*24*60*60;
export const OAUTH_MAX_AGE_SECONDS=10*60;

export function authConfig():AuthConfig{
 return readAuthConfig(env as unknown as Record<string,string|undefined>);
}

export function userFromSession(session:SessionPayload):AppUser{
 const email=session.email.trim().toLowerCase();
 return {userId:email,email,displayName:session.name??email,fullName:session.name,picture:session.picture};
}

export async function getUser():Promise<AppUser|null>{
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token)return null;
 const session=await verifyToken<SessionPayload>(token,authConfig().sessionSecret);
 if(!session||typeof session.email!=="string"||!session.email)return null;
 return userFromSession(session);
}

export function loginPath(returnTo:string):string{
 return `/login?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export async function requireUser(returnTo:string):Promise<AppUser>{
 const user=await getUser();
 if(user)return user;
 redirect(loginPath(returnTo));
}
```

- [ ] **Step 2: Delete `app/chatgpt-auth.ts` and switch the portfolio route**

```bash
git rm -q app/chatgpt-auth.ts
```

In `app/api/portfolio/route.ts` replace `import {getChatGPTUser} from "@/app/chatgpt-auth";` with `import {getUser} from "@/app/auth";` and both `await getChatGPTUser()` calls with `await getUser()`. Nothing else changes; `user.userId` is already the owner key.

- [ ] **Step 3: Type the new env vars in `cloudflare-env.d.ts`**

```ts
declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    SESSION_SECRET?: string;
    ALLOWED_EMAILS?: string;
    APP_ORIGIN?: string;
  }
}
```

- [ ] **Step 4: Stop the dev server's ChatGPT mock auth and ignore local vars**

In `vite.config.ts` change `sites({ mockAuth: !managedLinux }),` to `sites({ mockAuth: false }),`. Then remove the now-unused `managedLinux` usage only if TypeScript/ESLint complains about it (it is still used for `server.host`, so leave it).

Append to `.gitignore`:

```
# Local Worker variables (Google OAuth, session secret)
.dev.vars*
```

Append to `.dockerignore`:

```
.dev.vars*
```

- [ ] **Step 5: Type check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors. (If `cookies()` typing complains about `.get(...)?.value`, use `(await cookies()).get(SESSION_COOKIE)?.value` exactly as written; the vinext shim returns objects with `value`.)

- [ ] **Step 6: Commit**

```bash
git add app/auth.ts app/api/portfolio/route.ts cloudflare-env.d.ts vite.config.ts .gitignore .dockerignore
git commit -m "Replace ChatGPT header identity with signed session auth"
```

---

### Task 5: OAuth route handlers (`/auth/google/login`, `/auth/google/callback`, `/auth/logout`)

**Files:**
- Create: `app/auth/google/login/route.ts`
- Create: `app/auth/google/callback/route.ts`
- Create: `app/auth/logout/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4 by the exact names listed there.
- Produces: HTTP behaviour used by the login page (Task 6) and smoke test (Task 7):
  - `GET /auth/google/login?return_to=…` → 302 to Google with `Set-Cookie: wmu_oauth=…`; 500 JSON `{error:"ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ"}` when config is missing.
  - `GET /auth/google/callback` → 302 to `return_to` with `wmu_session` set and `wmu_oauth` cleared; `302 /login?error=not_allowed` for emails outside the allowlist; `302 /login?error=failed` for any other problem (missing state/code, bad cookie, exchange or claim failure, missing config).
  - `POST /auth/logout` → 303 `/login`, clears `wmu_session`; 403 when `Origin` is present and differs from the request origin. `GET` → 405 with `Allow: POST`.

- [ ] **Step 1: Create `app/auth/google/login/route.ts`**

```ts
import {OAUTH_COOKIE,OAUTH_MAX_AGE_SECONDS,authConfig} from "@/app/auth";
import {buildAuthorizationUrl,createPkce} from "@/lib/auth/google";
import {redirectResponse,serializeCookie} from "@/lib/auth/http";
import {randomToken,signToken} from "@/lib/auth/session";
import {safeRelativeReturnPath} from "@/lib/auth/return-path";
import type {OAuthStatePayload} from "@/lib/auth/types";

export const dynamic="force-dynamic";

export async function GET(request:Request){
 let config;
 try{config=authConfig();}
 catch(e){console.error("Google login unavailable",e);return Response.json({error:"ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ"},{status:500,headers:{"Cache-Control":"no-store"}});}
 const returnTo=safeRelativeReturnPath(new URL(request.url).searchParams.get("return_to"));
 const state=randomToken(32);
 const {verifier,challenge}=await createPkce();
 const payload:OAuthStatePayload={state,verifier,returnTo,exp:Date.now()+OAUTH_MAX_AGE_SECONDS*1000};
 const cookie=serializeCookie(OAUTH_COOKIE,await signToken(payload,config.sessionSecret),{maxAge:OAUTH_MAX_AGE_SECONDS,secure:config.secureCookies});
 const location=buildAuthorizationUrl({clientId:config.clientId,redirectUri:config.redirectUri,state,codeChallenge:challenge});
 return redirectResponse(location,[cookie]);
}
```

- [ ] **Step 2: Create `app/auth/google/callback/route.ts`**

```ts
import {OAUTH_COOKIE,SESSION_COOKIE,SESSION_MAX_AGE_SECONDS,authConfig} from "@/app/auth";
import {isAllowedEmail} from "@/lib/auth/config";
import {decodeIdToken,exchangeCode,validateIdTokenClaims} from "@/lib/auth/google";
import {clearCookie,readCookie,redirectResponse,serializeCookie} from "@/lib/auth/http";
import {signToken,verifyToken} from "@/lib/auth/session";
import type {OAuthStatePayload,SessionPayload} from "@/lib/auth/types";

export const dynamic="force-dynamic";

export async function GET(request:Request){
 let config;
 try{config=authConfig();}
 catch(e){console.error("Google callback unavailable",e);return redirectResponse("/login?error=failed",[]);}
 const secure=config.secureCookies;
 const clearOAuth=clearCookie(OAUTH_COOKIE,secure);
 try{
  const url=new URL(request.url);
  const code=url.searchParams.get("code");
  const state=url.searchParams.get("state");
  const raw=readCookie(request.headers.get("cookie"),OAUTH_COOKIE);
  const pending=raw?await verifyToken<OAuthStatePayload>(raw,config.sessionSecret):null;
  if(!code||!state||!pending||pending.state!==state){
   console.warn("Google callback rejected: state mismatch or missing code");
   return redirectResponse("/login?error=failed",[clearOAuth]);
  }
  const {idToken}=await exchangeCode({code,verifier:pending.verifier,clientId:config.clientId,clientSecret:config.clientSecret,redirectUri:config.redirectUri});
  const identity=validateIdTokenClaims(decodeIdToken(idToken),{clientId:config.clientId});
  if(!isAllowedEmail(identity.email,config.allowedEmails)){
   console.warn("Google login denied: email not in allowlist");
   return redirectResponse("/login?error=not_allowed",[clearOAuth,clearCookie(SESSION_COOKIE,secure)]);
  }
  const now=Date.now();
  const session:SessionPayload={email:identity.email,name:identity.name,picture:identity.picture,iat:now,exp:now+SESSION_MAX_AGE_SECONDS*1000};
  const cookie=serializeCookie(SESSION_COOKIE,await signToken(session,config.sessionSecret),{maxAge:SESSION_MAX_AGE_SECONDS,secure});
  return redirectResponse(pending.returnTo||"/",[clearOAuth,cookie]);
 }catch(e){
  console.error("Google callback failed",e instanceof Error?e.message:e);
  return redirectResponse("/login?error=failed",[clearOAuth]);
 }
}
```

- [ ] **Step 3: Create `app/auth/logout/route.ts`**

```ts
import {SESSION_COOKIE,authConfig} from "@/app/auth";
import {clearCookie,redirectResponse} from "@/lib/auth/http";

export const dynamic="force-dynamic";

export async function POST(request:Request){
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"คำขอไม่ถูกต้อง"},{status:403});
 let secure=true;
 try{secure=authConfig().secureCookies;}catch{/* clearing works with either flag */}
 return redirectResponse("/login",[clearCookie(SESSION_COOKIE,secure)],303);
}

export function GET(){
 return new Response("Method Not Allowed",{status:405,headers:{Allow:"POST"}});
}
```

- [ ] **Step 4: Type check and build**

Run: `node node_modules/typescript/bin/tsc --noEmit && npm run build`
Expected: both succeed. If the build reports that a route file must export only HTTP methods and `dynamic`, that is already the case.

- [ ] **Step 5: Exercise the routes against the dev server without Google credentials**

Start the dev server in the background: `npm run dev` (port 5173). Then:

```bash
curl -si http://localhost:5173/auth/google/login | head -5
```
Expected: `HTTP/1.1 500` with the Thai JSON error (no `.dev.vars` yet).

Create a temporary `.dev.vars` at the repo root (ignored by git):

```
GOOGLE_CLIENT_ID=dummy-client
GOOGLE_CLIENT_SECRET=dummy-secret
SESSION_SECRET=dev-only-secret-change-me-0123456789
ALLOWED_EMAILS=owner@example.com
APP_ORIGIN=http://localhost:5173
```

Restart the dev server, then:

```bash
curl -si "http://localhost:5173/auth/google/login?return_to=/accounts" | grep -i "^location\|^set-cookie\|^HTTP"
curl -si "http://localhost:5173/auth/google/callback?code=x&state=y" | grep -i "^location\|^HTTP"
curl -si -X POST -H "Origin: https://evil.example" http://localhost:5173/auth/logout | head -1
curl -si -X POST http://localhost:5173/auth/logout | grep -i "^location\|^set-cookie\|^HTTP"
curl -si http://localhost:5173/auth/logout | head -1
```
Expected, in order: 302 to `https://accounts.google.com/o/oauth2/v2/auth?…code_challenge_method=S256…` with `Set-Cookie: wmu_oauth=…; Max-Age=600; HttpOnly; SameSite=Lax` (no `Secure` because APP_ORIGIN is http); 302 `Location: /login?error=failed`; `403`; `303` with `Location: /login` and `wmu_session=; … Max-Age=0`; `405`.

If the Cloudflare Vite plugin does not pick up `.dev.vars` from the repo root, report that in the handoff; do not work around it with hard-coded values. Stop the dev server afterwards and keep `.dev.vars` (it is ignored).

- [ ] **Step 6: Commit**

```bash
git add app/auth/google/login/route.ts app/auth/google/callback/route.ts app/auth/logout/route.ts
git commit -m "Add Google OAuth login, callback, and logout routes"
```

---

### Task 6: Login page and gated dashboard

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/dashboard.tsx` (moved from `app/page.tsx`)
- Rewrite: `app/page.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `getUser`, `requireUser` from `@/app/auth`; `safeRelativeReturnPath`; `AppUser` from `@/lib/auth/types`.
- Produces: `Dashboard({user}: {user: AppUser})` client component; `/login` page.

- [ ] **Step 1: Move the client dashboard**

```bash
git mv app/page.tsx app/dashboard.tsx
```

In `app/dashboard.tsx`:

1. Add `import type {AppUser} from "@/lib/auth/types";` and `LogOut` to the lucide import list.
2. Change `export default function Home(){` to `export function Dashboard({user}:{user:AppUser}){`.
3. Add after the `number` const: `const initial=(name:string)=>name.trim().charAt(0).toUpperCase()||"W";`
4. Replace the sidebar footer `<div className="profile">…</div>` with:

```tsx
<div className="profile"><span className="profile-avatar">{initial(user.displayName)}</span><div className="profile-text"><span className="profile-name">{user.displayName}</span><small><ShieldCheck size={12}/> {user.email}</small></div><form method="post" action="/auth/logout"><button type="submit" className="logout-button" aria-label="ออกจากระบบ" title="ออกจากระบบ"><LogOut size={16}/></button></form></div>
```

5. Replace the topbar `<span className="profile-avatar small">W</span>` with `<span className="profile-avatar small" title={user.email}>{initial(user.displayName)}</span>`.
6. Replace `href="/signin-with-chatgpt?return_to=/"` with `href="/login?return_to=%2F"` and drop `target="_top"`.

- [ ] **Step 2: Write the new server `app/page.tsx`**

```tsx
import {requireUser} from "@/app/auth";
import {Dashboard} from "./dashboard";

export const dynamic="force-dynamic";

export default async function Home(){
 const user=await requireUser("/");
 return <Dashboard user={user}/>;
}
```

- [ ] **Step 3: Create `app/login/page.tsx`**

```tsx
import {redirect} from "next/navigation";
import {ChartNoAxesCombined,ShieldCheck} from "lucide-react";
import {getUser} from "@/app/auth";
import {safeRelativeReturnPath} from "@/lib/auth/return-path";

export const dynamic="force-dynamic";

const MESSAGES:Record<string,string>={
 not_allowed:"บัญชี Google นี้ไม่มีสิทธิ์ใช้งาน กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับอนุญาต",
 failed:"เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
 unconfigured:"ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ",
};

type Search=Record<string,string|string[]|undefined>;
const first=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]:v;

export default async function LoginPage({searchParams}:{searchParams:Promise<Search>|Search}){
 const params=await searchParams;
 const returnTo=safeRelativeReturnPath(first(params.return_to));
 let error=first(params.error)??"";
 try{
  const user=await getUser();
  if(user)redirect(returnTo);
 }catch(e){
  if(e instanceof Error&&e.message.startsWith("AUTH_NOT_CONFIGURED"))error="unconfigured";
  else throw e;
 }
 const message=error?MESSAGES[error]??MESSAGES.failed:null;
 return <main className="login-shell">
  <section className="login-card">
   <a className="brand" href="/"><span className="brand-icon"><ChartNoAxesCombined size={25}/></span><span>wealth<span className="brand-light"> me up</span><small>MAKE YOUR WEALTH GROW</small></span></a>
   <h1>เข้าสู่ระบบ</h1>
   <p>บันทึกการลงทุน บัญชีเงินสด และผลเทรด TFEX ของคุณในที่เดียว</p>
   {message&&<div className="error-message" role="alert">{message}</div>}
   <a className="btn primary login-google" href={`/auth/google/login?return_to=${encodeURIComponent(returnTo)}`}><GoogleMark/> เข้าสู่ระบบด้วย Google</a>
   <small className="login-note"><ShieldCheck size={13}/> เฉพาะบัญชีที่ได้รับอนุญาตเท่านั้น</small>
  </section>
 </main>;
}

function GoogleMark(){
 return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>;
}
```

- [ ] **Step 4: Append styles to `app/globals.css`**

```css
.login-shell{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#eef3e4,transparent 55%),var(--background)}.login-card{width:100%;max-width:420px;background:#fff;border:1px solid #e2e7db;border-radius:14px;padding:38px 34px;display:flex;flex-direction:column;gap:14px;box-shadow:0 12px 40px #24493318}.login-card .brand{margin-bottom:18px}.login-card h1{font-size:26px}.login-card p{color:#8e9b80;font-size:14px;line-height:1.8}.login-google{margin-top:12px;padding:13px 18px;font-size:15px}.login-note{display:flex;align-items:center;gap:5px;color:#9aa38f;font-size:12px}.profile-text{min-width:0;flex:1}.profile-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.profile small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.logout-button{color:#8b9787;padding:6px;border-radius:6px}.logout-button:hover{background:#eef2e6;color:#315531}
```

- [ ] **Step 5: Type check, build, and verify the gate**

Run: `node node_modules/typescript/bin/tsc --noEmit && npm run build`
Expected: success.

Start `npm run dev` in the background (keep the `.dev.vars` from Task 5), then:

```bash
curl -si http://localhost:5173/ | grep -i "^HTTP\|^location"
curl -si "http://localhost:5173/login?error=not_allowed" | grep -o "ไม่มีสิทธิ์ใช้งาน\|เข้าสู่ระบบด้วย Google" | sort -u
curl -si http://localhost:5173/login -H "Cookie: wmu_session=forged.token" | grep -i "^HTTP"
curl -si http://localhost:5173/api/portfolio | head -1
```
Expected: `302` with `Location: /login?return_to=%2F`; both Thai strings present; `200` (forged cookie is treated as logged out, page renders); `401`.

Then build a real session cookie to check the signed-in path:

```bash
node --experimental-strip-types -e "import('./lib/auth/session.ts').then(async m=>console.log(await m.signToken({email:'owner@example.com',name:'Owner',picture:null,iat:Date.now(),exp:Date.now()+3600000},'dev-only-secret-change-me-0123456789')))"
```
Use the printed token: `curl -si http://localhost:5173/ -H "Cookie: wmu_session=<token>" | grep -o "owner@example.com\|ออกจากระบบ" | sort -u` → both present, and `curl -si http://localhost:5173/login -H "Cookie: wmu_session=<token>" | grep -i "^HTTP\|^location"` → 302 to `/`. Stop the dev server.

Also open `http://localhost:5173/login` in a browser at desktop and ~400px width and confirm the card is centred and the button is full width on mobile.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/dashboard.tsx app/login/page.tsx app/globals.css
git commit -m "Gate the dashboard behind Google login and add the login page"
```

---

### Task 7: Deployment stack without Caddy or Cloudflare Access

**Files:**
- Modify: `deploy/docker-compose.yml`
- Delete: `deploy/Caddyfile`
- Modify: `deploy/entrypoint.sh`
- Modify: `deploy/redeploy.sh` (the `.env` check)
- Rewrite: `deploy/smoke-test.mjs`

**Interfaces:**
- Consumes: HTTP behaviour from Tasks 5–6.
- Produces: a stack where `cloudflared` forwards `wealth-me-up.codex074.com` to `http://wealth-me-up-web:8787` and the Worker sees the five auth vars.

- [ ] **Step 1: Rewrite `deploy/docker-compose.yml`**

```yaml
name: wealth-me-up

services:
  web:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    container_name: wealth-me-up-web
    restart: unless-stopped
    environment:
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID in deploy/.env}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:?Set GOOGLE_CLIENT_SECRET in deploy/.env}
      - SESSION_SECRET=${SESSION_SECRET:?Set SESSION_SECRET in deploy/.env}
      - ALLOWED_EMAILS=${ALLOWED_EMAILS:?Set ALLOWED_EMAILS in deploy/.env}
      - APP_ORIGIN=${APP_ORIGIN:-https://wealth-me-up.codex074.com}
    volumes:
      - wealth_me_up_data:/data
    networks: [internal]

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: wealth-me-up-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN:?Set TUNNEL_TOKEN in deploy/.env}
    depends_on: [web]
    networks: [internal]

networks:
  internal:

volumes:
  wealth_me_up_data:
```

Then `git rm -q deploy/Caddyfile`.

- [ ] **Step 2: Rewrite `deploy/entrypoint.sh`**

```sh
#!/bin/sh
set -eu

DATA_DIR="/data"
MARKER="${DATA_DIR}/.migrated"
WRANGLER="node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js"
VARS_FILE="dist/server/.dev.vars"
APP_ORIGIN="${APP_ORIGIN:-https://wealth-me-up.codex074.com}"
UPSTREAM_HOST="${APP_ORIGIN#https://}"
UPSTREAM_HOST="${UPSTREAM_HOST#http://}"

: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID is required}"
: "${GOOGLE_CLIENT_SECRET:?GOOGLE_CLIENT_SECRET is required}"
: "${SESSION_SECRET:?SESSION_SECRET is required}"
: "${ALLOWED_EMAILS:?ALLOWED_EMAILS is required}"

mkdir -p "${DATA_DIR}"

# Wrangler reads .dev.vars from the directory of the config file it is given.
umask 077
{
  printf 'GOOGLE_CLIENT_ID=%s\n' "${GOOGLE_CLIENT_ID}"
  printf 'GOOGLE_CLIENT_SECRET=%s\n' "${GOOGLE_CLIENT_SECRET}"
  printf 'SESSION_SECRET=%s\n' "${SESSION_SECRET}"
  printf 'ALLOWED_EMAILS=%s\n' "${ALLOWED_EMAILS}"
  printf 'APP_ORIGIN=%s\n' "${APP_ORIGIN}"
} > "${VARS_FILE}"
umask 022

if [ ! -f "${MARKER}" ]; then
  echo "Applying initial D1 migration to ${DATA_DIR} ..."
  ${WRANGLER} d1 execute DB \
    --local \
    --config dist/server/wrangler.json \
    --persist-to "${DATA_DIR}" \
    --file drizzle/0000_bumpy_tombstone.sql
  touch "${MARKER}"
fi

exec ${WRANGLER} dev \
  --local \
  --config dist/server/wrangler.json \
  --persist-to "${DATA_DIR}" \
  --ip 0.0.0.0 \
  --port 8787 \
  --local-upstream "${UPSTREAM_HOST}" \
  --upstream-protocol https \
  --inspector-port 0
```

- [ ] **Step 3: Tighten the `.env` check in `deploy/redeploy.sh`**

Replace the block starting `if [[ ! -f "$ENV_FILE" ]] || ! grep -q '^TUNNEL_TOKEN='` with:

```bash
for key in TUNNEL_TOKEN GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SESSION_SECRET ALLOWED_EMAILS; do
  if [[ ! -f "$ENV_FILE" ]] || ! grep -q "^${key}=." "$ENV_FILE"; then
    echo "deploy/.env is missing ${key} — run deploy/setup-wizard.sh first." >&2
    exit 1
  fi
done
```

Also add `--exclude='.dev.vars*'` to the `tar` command (next to `--exclude='.env*'`).

- [ ] **Step 4: Rewrite `deploy/smoke-test.mjs`**

```js
// Run inside the web container after deploy:
//   docker compose exec web node deploy/smoke-test.mjs
// Uses forged credentials only; never writes portfolio records.
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:8787';
const get = (path, headers = {}) => fetch(base + path, {headers, redirect: 'manual'});

let response = await get('/');
assert.equal(response.status, 302, 'anonymous / redirects');
assert.ok(response.headers.get('location').startsWith('/login'), 'redirect target is /login');
console.log('PASS anonymous dashboard redirects to /login');

response = await get('/api/portfolio');
assert.equal(response.status, 401, 'anonymous API');
console.log('PASS anonymous API is 401');

response = await get('/api/portfolio', {'Oai-Authenticated-User-Id': 'fake', 'Oai-Authenticated-User-Email': 'fake@example.com'});
assert.equal(response.status, 401, 'legacy ChatGPT headers are ignored');
console.log('PASS spoofed ChatGPT headers are ignored');

response = await get('/api/portfolio', {Cookie: 'wmu_session=eyJlbWFpbCI6ImZha2VAZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTk5OTl9.forged'});
assert.equal(response.status, 401, 'forged session cookie');
console.log('PASS forged session cookie is rejected');

response = await get('/auth/google/callback?code=x&state=y');
assert.equal(response.status, 302, 'callback without state redirects');
assert.equal(response.headers.get('location'), '/login?error=failed');
console.log('PASS callback without a pending state fails safely');

response = await fetch(base + '/auth/logout', {method: 'POST', headers: {Origin: 'https://invalid.example'}, redirect: 'manual'});
assert.equal(response.status, 403, 'cross-origin logout');
console.log('PASS cross-origin logout is refused');

response = await get('/auth/google/login');
assert.equal(response.status, 302, 'login route configured');
assert.ok(response.headers.get('location').startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), 'redirects to Google');
console.log('PASS Google login is configured');
```

- [ ] **Step 5: Verify the compose file and scripts parse**

```bash
sh -n deploy/entrypoint.sh && bash -n deploy/redeploy.sh && node --check deploy/smoke-test.mjs
cd deploy && GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x SESSION_SECRET=x ALLOWED_EMAILS=x TUNNEL_TOKEN=x docker compose config --quiet; cd ..
```
Expected: no output from any command (all succeed). If `docker` is unavailable locally, note it in the handoff and rely on the syntax checks.

- [ ] **Step 6: Commit**

```bash
git add deploy/docker-compose.yml deploy/entrypoint.sh deploy/redeploy.sh deploy/smoke-test.mjs
git commit -m "Serve the app directly from the tunnel with Google login env"
```

---

### Task 8: Setup wizard for Google OAuth and the tunnel change

**Files:**
- Modify: `deploy/setup-wizard.sh` — only the section below the `STAGES` marker.

**Interfaces:**
- Produces: `deploy/.env` with `TUNNEL_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `APP_ORIGIN`.

- [ ] **Step 1: Replace everything after the `# STAGES — author this section` comment block with**

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

TOTAL_STAGES=4
APP_HOST="wealth-me-up.codex074.com"

banner "wealth-me-up → Google login on ${APP_HOST}"

# ── Stage 1: Google OAuth client ───────────────────────────────────────────
stage "Google Cloud — create the OAuth client the app signs in with"
say "The app now authenticates people itself with Google. It needs an"
say "OAuth 2.0 Web client ID and secret from Google Cloud Console."
open_url "https://console.cloud.google.com/apis/credentials"
step "Pick (or create) a project, e.g. \"wealth-me-up\"."
step "If asked, configure the OAuth consent screen first: User type External,"
step "  app name \"Wealth Me Up\", your email as support/developer contact."
step "  Publishing status \"Testing\" is fine — add your own Google account"
step "  under Test users."
step "Create credentials → OAuth client ID → Application type: Web application."
step "Name: wealth-me-up. Authorized redirect URIs (add both):"
step "  https://${APP_HOST}/auth/google/callback"
step "  http://localhost:5173/auth/google/callback"
step "Create, then copy the Client ID and Client secret."
ask GOOGLE_CLIENT_ID "Paste the Client ID:"
ask_secret GOOGLE_CLIENT_SECRET "Paste the Client secret:"
write_env GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
write_env GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"

# ── Stage 2: app secrets and allowlist ─────────────────────────────────────
stage "App secrets — session key and who may sign in"
existing_secret=$(_existing SESSION_SECRET || true)
if [[ -n "$existing_secret" ]]; then
  note "SESSION_SECRET already set — keeping it (rotate it to sign everyone out)."
  if confirm "Rotate SESSION_SECRET now? (signs out every browser)"; then
    existing_secret=""
  fi
fi
if [[ -z "$existing_secret" ]]; then
  SESSION_SECRET=$(openssl rand -base64 32)
  write_env SESSION_SECRET "$SESSION_SECRET"
fi
default_emails=$(_existing ALLOWED_EMAILS || _existing OWNER_EMAIL || true)
say "Only these Google accounts may use the app (comma-separated, any case)."
[[ -n "$default_emails" && -z "$(_existing ALLOWED_EMAILS || true)" ]] && note "Defaulting to your previous OWNER_EMAIL: ${default_emails}"
ask ALLOWED_EMAILS "Allowed emails:"
[[ -z "$ALLOWED_EMAILS" ]] && ALLOWED_EMAILS="$default_emails"
[[ -z "$ALLOWED_EMAILS" ]] && { warn "ALLOWED_EMAILS cannot be empty"; exit 1; }
write_env ALLOWED_EMAILS "$ALLOWED_EMAILS"
write_env APP_ORIGIN "https://${APP_HOST}"
note "Each allowed email gets its own portfolio, keyed by that email."

# ── Stage 3: Cloudflare — tunnel straight to the app, no Access ────────────
stage "Cloudflare — point the tunnel at the app and remove the Access gate"
say "Cloudflare Access used to be the login wall. The app now has its own,"
say "so Access must be removed or you would sign in twice."
open_url "https://one.dash.cloudflare.com/"
step "Networks → Tunnels → wealth-me-up → Public Hostname → edit ${APP_HOST}:"
step "  Service Type: HTTP   URL: wealth-me-up-web:8787"
step "  Additional settings → Access → turn OFF \"Protect with Access\". Save."
step "Access → Applications → delete the \"Wealth Me Up\" application."
existing_token=$(_existing TUNNEL_TOKEN || true)
if [[ -z "$existing_token" ]]; then
  step "The tunnel token is missing here. Open the tunnel → Configure and copy"
  step "  the token after \"--token \" from the connector command."
  ask_secret TUNNEL_TOKEN "Paste the tunnel token:"
  write_env TUNNEL_TOKEN "$TUNNEL_TOKEN"
else
  note "Keeping the existing TUNNEL_TOKEN."
fi
pause "Press Enter once the hostname points at wealth-me-up-web:8787 with Access off."

# ── Stage 4: build and ship it ─────────────────────────────────────────────
stage "Deploy to pve1"
say "Pack the repo, copy it to pve1, rebuild the image inside the \"docker\""
say "LXC, and restart the stack (app + tunnel). No ports are published."
if confirm "Deploy now? (requires SSH root@pve1)"; then
  "${SCRIPT_DIR}/redeploy.sh"
else
  SKIPPED+=("deploy — run deploy/redeploy.sh manually when ready")
fi

finish
say "Visit https://${APP_HOST} — you should land on the app's own login page"
say "and be able to sign in with an allowed Google account. Then run:"
say "  ssh root@pve1 \"pct exec 103 -- sh -c 'cd /opt/wealth-me-up/deploy && docker compose exec web node deploy/smoke-test.mjs'\""
```

- [ ] **Step 2: Syntax check**

Run: `bash -n deploy/setup-wizard.sh`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add deploy/setup-wizard.sh
git commit -m "Rewrite the setup wizard for Google OAuth and a direct tunnel"
```

---

### Task 9: Documentation (`README.md`, `AGENTS.md`)

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `README.md`**

Replace the paragraph after the "Run locally" code block (the one beginning "Apply the initial migration only once…") with:

```markdown
Apply the initial migration only once in a new local database. Use the printed local URL.

Sign-in is Google OAuth handled by the app. Create `.dev.vars` in the repo root (ignored by git) before `npm run dev`:

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
SESSION_SECRET=…        # openssl rand -base64 32
ALLOWED_EMAILS=you@example.com
APP_ORIGIN=http://localhost:5173
```

The Google OAuth client must list `http://localhost:5173/auth/google/callback` as an authorized redirect URI (`deploy/setup-wizard.sh` walks through creating it). Without `.dev.vars` the app still builds and serves `/login`, but signing in returns "ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ".
```

In "Product behavior", replace the last bullet ("Durable records are stored in D1, scoped to the authenticated user…") with:

```markdown
- Sign-in is Google only, restricted to the emails in `ALLOWED_EMAILS`; everything except `/login` requires a session. Sessions are signed cookies valid for 30 days; rotating `SESSION_SECRET` signs everyone out. Durable records are stored in D1, scoped to the signed-in email (lowercased). Revision checks prevent another tab from silently overwriting newer data. Failed saves preserve the open form.
```

In "Validation", add `node --experimental-strip-types --test tests/auth.test.ts` as the second command. Update the "Core files" line to add `` `app/auth.ts` and `lib/auth/` (Google login, sessions, allowlist) ``.

Replace the whole "Self-hosted deployment (pve1)" section with:

```markdown
## Self-hosted deployment (pve1)

The app runs at **wealth-me-up.codex074.com** on the owner's infrastructure. Setup is complete only when the tunnel is healthy, the app's own login page appears at the hostname, and an allowed Google account can sign in, save, and reload.

- **Where**: the `docker` LXC (103) on Proxmox host `pve1`. The Cloudflare Workers build runs as a long-lived container (`wrangler dev --local`) backed by a SQLite-based D1 emulation on a Docker volume.
- **Access**: a dedicated Cloudflare Tunnel forwards the hostname straight to `wealth-me-up-web:8787`. Cloudflare Access is **not** used; the app authenticates people with Google and only accepts emails in `ALLOWED_EMAILS`. Do not re-enable "Protect with Access" on the route or people will sign in twice.
- **Files**: `deploy/Dockerfile`, `docker-compose.yml` (web + cloudflared), `entrypoint.sh` (writes `dist/server/.dev.vars` from the container environment, runs the once-only D1 migration, then `wrangler dev`), `setup-wizard.sh` (Google OAuth client, secrets, tunnel change), `redeploy.sh` (ship changes), `smoke-test.mjs`.
- **Secrets**: `deploy/.env` (ignored, mode 600) holds `TUNNEL_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `APP_ORIGIN`. Compose passes the auth values into the `web` container; `entrypoint.sh` turns them into the Worker's `.dev.vars`.
- **To ship a change**: `deploy/redeploy.sh` (needs SSH `root@pve1`). To add a user: append the email to `ALLOWED_EMAILS` and redeploy. To sign everyone out: rotate `SESSION_SECRET` and redeploy.
- **Owner identity**: `portfolios.owner` is the lowercased Google email. The portfolio created under Cloudflare Access used the same email, so it carries over.
- **Verify after deploy**: from the remote `deploy/` directory run `docker compose exec web node deploy/smoke-test.mjs` (checks anonymous redirects, forged cookies, legacy header spoofing, cross-origin logout, and that Google login is configured, without writing records). Then sign in from a browser with an allowed account and with a non-allowed account (expect "ไม่มีสิทธิ์ใช้งาน").
- **Known limitations**: `wrangler dev --local` is a dev server, not Cloudflare's production runtime; acceptable for private allowlisted use. Data lives only in the `wealth-me-up_wealth_me_up_data` Docker volume on pve1; back it up separately. Google's OAuth consent screen in "Testing" mode limits sign-in to listed test users and expires refresh tokens, which does not matter here because the app never calls Google after login.
```

- [ ] **Step 2: Update `AGENTS.md`**

- In "Where to work", change "For identity handling, read [app/chatgpt-auth.ts](app/chatgpt-auth.ts)." to "For identity handling, read [app/auth.ts](app/auth.ts) and `lib/auth/` (Google OAuth, signed sessions, allowlist); tests live in [tests/auth.test.ts](tests/auth.test.ts)." Change "For local setup or sign-in, follow [Run locally]…" to keep the same link.
- In "Persistence and access", first bullet becomes: "Use the signed session (`getUser` / `requireUser` in `app/auth.ts`) for ownership on every read and write; the owner key is the lowercased Google email. Never trust identity headers. Preserve owner-scoped prepared SQL, server-side validation, allowlist enforcement, and private access."
- In "Verify and hand off", replace the paragraph starting "For website publishing, follow the available Sites workflow…" with: "The app is hosted only at wealth-me-up.codex074.com (pve1) — see [Self-hosted deployment](README.md#self-hosted-deployment-pve1) and `deploy/`. Ship changes with `deploy/redeploy.sh` and run the smoke test afterwards. Keep that section current if the setup changes. `.openai/hosting.json` remains only because the vendored build plugin copies it; OpenAI Sites publishing is no longer a target. Never record deployment credentials in source or Git configuration."
- Delete the following paragraph that begins "This app is also independently self-hosted…" (now merged above).
- In "Interface and runtime", add a sentence: "Auth routes (`/auth/*`) and `/login` must stay outside the signed-in shell; all other pages go through `requireUser`."

- [ ] **Step 3: Check every referenced path exists**

```bash
for f in app/auth.ts lib/auth tests/auth.test.ts deploy/setup-wizard.sh deploy/smoke-test.mjs deploy/redeploy.sh; do test -e "$f" && echo "ok $f" || echo "MISSING $f"; done
grep -n "chatgpt-auth\|signin-with-chatgpt\|Caddy\|Cloudflare Access" README.md AGENTS.md
```
Expected: all `ok`; the grep only shows the README sentence that says Access is not used and the AGENTS sentence about Sites no longer being a target.

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "Document Google login and the simplified self-hosted stack"
```

---

### Task 10: Full verification

**Files:** none new.

- [ ] **Step 1: Run every check**

```bash
node --experimental-strip-types --test tests/portfolio.test.ts
node --experimental-strip-types --test tests/auth.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run lint
npm run build
grep -rn "chatgpt-auth\|signin-with-chatgpt\|oai-authenticated" app lib deploy --include=*.ts --include=*.tsx --include=*.mjs --include=*.sh --include=*.yml
```
Expected: both suites pass, tsc and lint clean, build succeeds, the grep returns only `deploy/smoke-test.mjs` (the spoofed-header case).

- [ ] **Step 2: Report**

State in the handoff: what was verified, that `.dev.vars` local loading was or was not confirmed, and that deployment still requires the owner to run `deploy/setup-wizard.sh` (Google Console + Cloudflare dashboard steps) followed by the smoke test and a real browser login.
