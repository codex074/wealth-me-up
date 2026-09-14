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
   console.warn("Google login denied: email not in allowlist",identity.email);
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
