"use client";
import {useRef,useState} from "react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {prepareTfexImport,tfexPnl,type Portfolio} from "@/lib/portfolio";
import type {PiTfexStatement} from "@/lib/pi-tfex";
import {readTfexPdf} from "@/lib/read-tfex-pdf";
const money=(value:number)=>value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

export function TfexImportDialog({data,save,close,salt}:{data:Portfolio;save:(next:Portfolio)=>Promise<void>;close:()=>void;salt:string}) {
 const [file,setFile]=useState<File|null>(null),[password,setPassword]=useState("");
 const [statement,setStatement]=useState<PiTfexStatement|null>(null),[fees,setFees]=useState<Record<number,string>>({});
 const [platform,setPlatform]=useState(data.platforms.find(p=>/\bpi\b|พาย/i.test(p.name))?.id??"__new_pi__");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const previewTitle=useRef<HTMLHeadingElement>(null);
 const lock=useRef(false);
 let preview:ReturnType<typeof prepareTfexImport>|undefined,previewError="";
 if(statement){try{preview=prepareTfexImport(data,statement,platform,Object.fromEntries(Object.entries(fees).map(([key,value])=>[key,Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1e12?value:""])));}catch(e){previewError=e instanceof Error&&e.name!=="ZodError"?e.message:"ข้อมูลนำเข้าไม่ผ่านการตรวจสอบ";}}
 async function read(event:React.FormEvent){
  event.preventDefault();if(!file||lock.current)return;
  lock.current=true;setBusy(true);setError("");
  try{const result=await readTfexPdf(file,password,salt);setStatement(result);setPassword("");setFees({});requestAnimationFrame(()=>previewTitle.current?.focus());}
  catch(e){setError(e instanceof Error?e.message:"อ่าน PDF ไม่สำเร็จ กรุณาลองใหม่");}
  finally{lock.current=false;setBusy(false);}
 }
 async function commit(){
  if(!statement||lock.current)return;
  lock.current=true;setBusy(true);setError("");
  try{const result=prepareTfexImport(data,statement,platform,fees);if(result.needsFees)throw new Error("กรอกค่าธรรมเนียมฝั่งเปิดให้ครบ หากไม่มีให้ระบุ 0");await save(result.data);close();}
  catch(e){setError(e instanceof Error&&e.name!=="ZodError"?e.message:"บันทึกไม่สำเร็จ กรุณาตรวจสอบข้อมูล");}
  finally{lock.current=false;setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent showCloseButton={false} className="!max-w-[min(1100px,calc(100%-2rem))] max-h-[90dvh] overflow-y-auto !bg-[#fcfdf9] !rounded-xl">
  <DialogHeader><DialogTitle>นำเข้า TFEX จาก PDF</DialogTitle><DialogDescription>ใบยืนยัน Pi · S50 / USD Futures · PDF ข้อความ 1–2 หน้า ไม่เกิน 10 MB</DialogDescription></DialogHeader>
  <p className="help-text">อ่านไฟล์และรหัสผ่านบนอุปกรณ์ของคุณ บันทึกเฉพาะข้อมูลเทรดหลังตรวจรายการ · ไม่เปลี่ยนยอดบัญชีเงินสด</p>
  {!statement?<form onSubmit={read} className="space-y-4">
   <label className="form-field">ไฟล์ PDF<input type="file" accept=".pdf,application/pdf" required disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setError("");}}/></label>
   <label className="form-field">รหัสผ่าน PDF (ถ้ามี)<input type="password" autoComplete="off" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
   <div className="flex flex-wrap justify-end gap-3"><button className="btn" type="button" disabled={busy} onClick={close}>ยกเลิก</button><button className="btn primary" type="submit" disabled={busy||!file}>{busy?"กำลังอ่าน PDF…":"อ่านและตรวจรายการ"}</button></div>
  </form>:<>
   <h2 ref={previewTitle} tabIndex={-1} className="font-semibold">ตรวจรายการวันที่ {statement.date} · {statement.rows.length} รายการ</h2>
   <label className="form-field">โบรกเกอร์ที่จะบันทึก<select value={platform} disabled={busy} onChange={e=>{setPlatform(e.target.value);setFees({});setError("");}}>{data.platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="__new_pi__">เพิ่ม Pi Securities พร้อมรายการนี้</option></select></label>
   <p className="help-text">กำไร/ขาดทุนก่อนค่าธรรมเนียมตาม PDF: <strong>{money(statement.gross)} THB</strong> · ค่าธรรมเนียมรวม VAT ในเอกสาร: <strong>{money(statement.fees)} THB</strong></p>
   {preview&&<>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">รายการปิดที่ไม่มีสถานะเปิดเดิม: กรอกค่าธรรมเนียมฝั่งเปิดรวม VAT เอง (ทั้งจำนวนสัญญาในแถว) หากไม่มีให้ระบุ 0 · ระบบไม่เดาค่าธรรมเนียมที่ไม่มีใน PDF</p>
    <Table><TableHeader><TableRow>{["สัญญา / ฝั่ง","จำนวน","เปิด → ปิด","วันที่เปิด → ปิด","ค่าธรรมเนียมใน PDF","ค่าธรรมเนียมเปิดเดิม","กำไรสุทธิ (THB)"].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.rows.map(({trade,openingFee,needsFee,matched,consumed},index)=>consumed?<TableRow key={index}><TableCell colSpan={7} className="text-center text-muted-foreground">{trade.symbol} {trade.side} · รวมกับรายการปิดแล้ว ไม่แยกบันทึก</TableCell></TableRow>:<TableRow key={index}>
     <TableCell><strong>{trade.symbol}</strong><small className="block">{trade.side}{matched?" · จับคู่สถานะเดิม":""}</small></TableCell><TableCell>{trade.qty}</TableCell>
     <TableCell>{money(trade.entry)} → {trade.exit===null?"เปิดอยู่":money(trade.exit)}</TableCell><TableCell>{trade.date}<small className="block">{trade.closeDate??"ยังไม่ปิด"}</small></TableCell>
     <TableCell>{money(statement.rows[index].fee)}</TableCell><TableCell>{trade.exit===null?"รวมใน PDF แล้ว":matched?money(openingFee):<label className="form-field"><span className="sr-only">ค่าธรรมเนียมเปิด รายการ {index+1}</span><input className="!w-32" type="number" min="0" max="1000000000000" step="0.01" placeholder="ระบุจำนวน" value={fees[index]??""} disabled={busy} onChange={e=>setFees({...fees,[index]:e.target.value})}/></label>}</TableCell>
     <TableCell>{trade.exit===null||needsFee?"—":money(tfexPnl(trade)??0)}</TableCell>
    </TableRow>)}</TableBody></Table>
    <p className="text-sm" aria-live="polite">{preview.needsFees?"ยังคำนวณกำไรสุทธิไม่ได้จนกว่าจะกรอกค่าธรรมเนียมเปิดครบ":`กำไรสุทธิของรายการปิดที่จะบันทึก: ${money(preview.rows.reduce((sum,r)=>sum+(tfexPnl(r.trade)??0),0))} THB`}</p>
   </>}
   {previewError&&<div className="error-message" role="alert">{previewError}</div>}
   <div className="flex flex-wrap justify-end gap-3"><button className="btn" disabled={busy} onClick={()=>{setStatement(null);setFees({});setError("");setFile(null);}}>เลือกไฟล์ใหม่</button><button className="btn" disabled={busy} onClick={close}>ยกเลิก</button><button className="btn primary" disabled={busy||!preview||preview.needsFees} onClick={()=>void commit()}>{busy?"กำลังบันทึก…":`บันทึก ${preview?.savedCount??statement.rows.length} รายการ`}</button></div>
  </>}
  {error&&<div className="error-message" role="alert">{error}</div>}
 </DialogContent></Dialog>;
}
