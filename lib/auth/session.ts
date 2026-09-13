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
