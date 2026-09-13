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
