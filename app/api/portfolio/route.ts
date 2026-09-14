import {env} from "cloudflare:workers";
import {getUser} from "@/app/auth";
import {validatePortfolio} from "@/lib/portfolio";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
function db(){if(!env.DB)throw new Error("Storage unavailable");return env.DB;}
async function currentUser(){try{return await getUser();}catch(e){if(e instanceof Error&&e.message.startsWith("AUTH_NOT_CONFIGURED")){console.error("Auth not configured",e);return "unconfigured" as const;}throw e;}}
export async function GET(){
 const user=await currentUser();if(user==="unconfigured")return reply({error:"ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ"},500);if(!user)return reply({error:"กรุณาเข้าสู่ระบบเพื่อเข้าถึงพอร์ต"},401);
 try{const row=await db().prepare("SELECT payload, revision FROM portfolios WHERE owner = ?").bind(user.userId).first<{payload:string,revision:number}>();return reply(row?{data:JSON.parse(row.payload),revision:row.revision}:{data:null,revision:0});}
 catch(e){console.error("Portfolio load failed",e);return reply({error:"ยังโหลดข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง"},503);}
}
export async function PUT(request:Request){
 const user=await currentUser();if(user==="unconfigured")return reply({error:"ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ"},500);if(!user)return reply({error:"กรุณาเข้าสู่ระบบเพื่อบันทึกพอร์ต"},401);
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return reply({error:"คำขอไม่ถูกต้อง"},403);
 let body;try{const raw=await request.text();if(raw.length>2000000)return reply({error:"ข้อมูลมีขนาดใหญ่เกินไป"},413);body=JSON.parse(raw);}catch{return reply({error:"ข้อมูลไม่ถูกต้อง"},400);}
 let data;try{data=validatePortfolio(body.data);if(!Number.isInteger(body.revision)||body.revision<0)throw new Error("เวอร์ชันข้อมูลไม่ถูกต้อง");}catch(e){return reply({error:e instanceof Error&&e.name!=="ZodError"?e.message:"กรุณาตรวจสอบข้อมูลในแบบฟอร์ม"},400);}
 try{const result=body.revision===0?await db().prepare("INSERT INTO portfolios (owner,payload,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(owner) DO NOTHING").bind(user.userId,JSON.stringify(data),new Date().toISOString()).run():await db().prepare("UPDATE portfolios SET payload = ?, revision = revision + 1, updated_at = ? WHERE owner = ? AND revision = ?").bind(JSON.stringify(data),new Date().toISOString(),user.userId,body.revision).run();if(!result.meta.changes)return reply({error:"ข้อมูลเปลี่ยนจากอีกหน้าต่างแล้ว กรุณาปิดแบบฟอร์มและรีเฟรชหน้าเพื่อโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง"},409);return reply({revision:body.revision+1});}
 catch(e){console.error("Portfolio save failed",e);return reply({error:"บันทึกไม่สำเร็จ ข้อมูลในแบบฟอร์มยังอยู่ กรุณาลองใหม่"},503);}
}
