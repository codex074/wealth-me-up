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
 const message=error?(Object.hasOwn(MESSAGES,error)?MESSAGES[error]:MESSAGES.failed):null;
 return <main className="login-shell">
  <section className="login-card">
   <div className="brand"><span className="brand-icon"><ChartNoAxesCombined size={25}/></span><span>wealth<span className="brand-light"> me up</span><small>MAKE YOUR WEALTH GROW</small></span></div>
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
