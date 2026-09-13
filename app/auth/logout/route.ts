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
