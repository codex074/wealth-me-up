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
