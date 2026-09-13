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
