import {base64UrlDecode,base64UrlEncode,randomToken} from "./session.ts";

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
