import {getUser} from "@/app/auth";
import {getMarketViewResponse} from "@/lib/market-view/dashboard";
import {findMarketConfig} from "@/lib/market-view/markets";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function currentUser(){try{return await getUser();}catch(e){if(e instanceof Error&&e.message.startsWith("AUTH_NOT_CONFIGURED")){console.error("Auth not configured",e);return "unconfigured" as const;}throw e;}}
export async function GET(_request:Request,{params}:{params:Promise<{market:string}>}){
 const user=await currentUser();if(user==="unconfigured")return reply({error:"ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ"},500);if(!user)return reply({error:"กรุณาเข้าสู่ระบบเพื่อดูข้อมูลตลาด"},401);
 const {market}=await params;
 const config=findMarketConfig(market.toUpperCase());
 if(!config)return reply({error:"ไม่พบข้อมูลตลาดที่เลือก"},404);
 try{
  const data=await getMarketViewResponse(config.market);
  return reply(data);
 }catch(e){
  console.error("Market view load failed",e);
  return reply({error:"ยังโหลดข้อมูลตลาดไม่ได้ กรุณาลองใหม่อีกครั้ง"},503);
 }
}
