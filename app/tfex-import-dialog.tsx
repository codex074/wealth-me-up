"use client";
import {useRef,useState} from "react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {prepareTfexImportBatch,tfexPnl,type Portfolio,type TfexImportResult} from "@/lib/portfolio";
import type {PiTfexStatement} from "@/lib/pi-tfex";
import {readTfexPdf} from "@/lib/read-tfex-pdf";
const money=(value:number)=>value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
type Read={file:File; statement:PiTfexStatement};
type Failed={file:File; error:string};

export function TfexImportDialog({data,save,close,salt}:{data:Portfolio;save:(next:Portfolio)=>Promise<void>;close:()=>void;salt:string}) {
 const [files,setFiles]=useState<File[]>([]),[password,setPassword]=useState("");
 const [reads,setReads]=useState<Read[]>([]),[readErrors,setReadErrors]=useState<Failed[]>([]),[fees,setFees]=useState<Record<string,string>>({});
 const [platform,setPlatform]=useState(data.platforms.find(p=>/\bpi\b|พาย/i.test(p.name))?.id??"__new_pi__");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const previewTitle=useRef<HTMLHeadingElement>(null);
 const lock=useRef(false);
 const batch=reads.length?prepareTfexImportBatch(data,reads.map(r=>r.statement),platform,fees):undefined;
 const fileFor=(statement:PiTfexStatement)=>reads.find(r=>r.statement===statement)?.file;
 const succeeded=batch?.entries.filter((e):e is {statement:PiTfexStatement;result:TfexImportResult}=>"result" in e)??[];
 const skipped=[...readErrors.map(r=>({name:r.file.name,reason:r.error})),...(batch?.entries.filter(e=>"error" in e).map(e=>({name:fileFor(e.statement)?.name??"ไฟล์",reason:(e as {error:string}).error})) ?? [])];
 async function read(event:React.FormEvent){
  event.preventDefault();if(!files.length||lock.current)return;
  lock.current=true;setBusy(true);setError("");
  const ok:Read[]=[],failed:Failed[]=[];
  for(const file of files){
   try{ok.push({file,statement:await readTfexPdf(file,password,salt)});}
   catch(e){failed.push({file,error:e instanceof Error?e.message:"อ่าน PDF ไม่สำเร็จ กรุณาลองใหม่"});}
  }
  if(!ok.length){setError(failed.map(f=>`${f.file.name}: ${f.error}`).join("\n"));lock.current=false;setBusy(false);return;}
  setReads(ok);setReadErrors(failed);setPassword("");setFees({});requestAnimationFrame(()=>previewTitle.current?.focus());
  lock.current=false;setBusy(false);
 }
 async function commit(){
  if(!reads.length||lock.current)return;
  lock.current=true;setBusy(true);setError("");
  try{const result=prepareTfexImportBatch(data,reads.map(r=>r.statement),platform,fees);if(result.needsFees)throw new Error("กรอกค่าธรรมเนียมฝั่งเปิดให้ครบ หากไม่มีให้ระบุ 0");if(!result.savedCount)throw new Error("ไม่มีรายการที่จะบันทึก");await save(result.data);close();}
  catch(e){setError(e instanceof Error&&e.name!=="ZodError"?e.message:"บันทึกไม่สำเร็จ กรุณาตรวจสอบข้อมูล");}
  finally{lock.current=false;setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent showCloseButton={false} className="!max-w-[min(1100px,calc(100%-2rem))] max-h-[90dvh] overflow-y-auto !bg-[#fcfdf9] !rounded-xl">
  <DialogHeader><DialogTitle>นำเข้า TFEX จาก PDF</DialogTitle><DialogDescription>ใบยืนยัน Pi · S50 / USD Futures · PDF ข้อความ 1–2 หน้า ไม่เกิน 10 MB ต่อไฟล์ · เลือกได้หลายไฟล์</DialogDescription></DialogHeader>
  <p className="help-text">อ่านไฟล์และรหัสผ่านบนอุปกรณ์ของคุณ บันทึกเฉพาะข้อมูลเทรดหลังตรวจรายการ · ไม่เปลี่ยนยอดบัญชีเงินสด</p>
  {!reads.length?<form onSubmit={read} className="space-y-4">
   <label className="form-field">ไฟล์ PDF (เลือกได้หลายไฟล์)<input type="file" accept=".pdf,application/pdf" required multiple disabled={busy} onChange={e=>{setFiles(Array.from(e.target.files??[]));setError("");}}/></label>
   <label className="form-field">รหัสผ่าน PDF (ถ้ามี ใช้รหัสเดียวกันทุกไฟล์)<input type="password" autoComplete="off" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
   <div className="flex flex-wrap justify-end gap-3"><button className="btn" type="button" disabled={busy} onClick={close}>ยกเลิก</button><button className="btn primary" type="submit" disabled={busy||!files.length}>{busy?"กำลังอ่าน PDF…":files.length>1?`อ่านและตรวจ ${files.length} ไฟล์`:"อ่านและตรวจรายการ"}</button></div>
  </form>:<>
   <h2 ref={previewTitle} tabIndex={-1} className="font-semibold">ตรวจรายการ {succeeded.length} ไฟล์ · {succeeded.reduce((n,e)=>n+e.result.rows.length,0)} รายการ</h2>
   <label className="form-field">โบรกเกอร์ที่จะบันทึก<select value={platform} disabled={busy} onChange={e=>{setPlatform(e.target.value);setFees({});setError("");}}>{data.platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="__new_pi__">เพิ่ม Pi Securities พร้อมรายการนี้</option></select></label>
   {skipped.length>0&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm"><p>ข้ามไฟล์ต่อไปนี้ (ไม่นำเข้า):</p><ul className="list-disc pl-5">{skipped.map((s,i)=><li key={i}>{s.name}: {s.reason}</li>)}</ul></div>}
   {succeeded.map(({statement,result})=>{const file=fileFor(statement);return <div key={statement.key} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
    <h3 className="font-medium text-sm">{file?.name} · วันที่ {statement.date} · {statement.rows.length} รายการ</h3>
    <p className="help-text">กำไร/ขาดทุนก่อนค่าธรรมเนียมตาม PDF: <strong>{money(statement.gross)} THB</strong> · ค่าธรรมเนียมรวม VAT ในเอกสาร: <strong>{money(statement.fees)} THB</strong></p>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">รายการปิดที่ไม่มีสถานะเปิดเดิม: กรอกค่าธรรมเนียมฝั่งเปิดรวม VAT เอง (ทั้งจำนวนสัญญาในแถว) หากไม่มีให้ระบุ 0 · ระบบไม่เดาค่าธรรมเนียมที่ไม่มีใน PDF</p>
    <Table><TableHeader><TableRow>{["สัญญา / ฝั่ง","จำนวน","เปิด → ปิด","วันที่เปิด → ปิด","ค่าธรรมเนียมใน PDF","ค่าธรรมเนียมเปิดเดิม","กำไรสุทธิ (THB)"].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{result.rows.map(({trade,openingFee,needsFee,matched,consumed},index)=>{const feeKey=`${statement.key}:${index}`;return consumed?<TableRow key={index}><TableCell colSpan={7} className="text-center text-muted-foreground">{trade.symbol} {trade.side} · รวมกับรายการปิดแล้ว ไม่แยกบันทึก</TableCell></TableRow>:<TableRow key={index}>
     <TableCell><strong>{trade.symbol}</strong><small className="block">{trade.side}{matched?" · จับคู่สถานะเดิม":""}</small></TableCell><TableCell>{trade.qty}</TableCell>
     <TableCell>{money(trade.entry)} → {trade.exit===null?"เปิดอยู่":money(trade.exit)}</TableCell><TableCell>{trade.date}<small className="block">{trade.closeDate??"ยังไม่ปิด"}</small></TableCell>
     <TableCell>{money(statement.rows[index].fee)}</TableCell><TableCell>{trade.exit===null?"รวมใน PDF แล้ว":matched?money(openingFee):<label className="form-field"><span className="sr-only">ค่าธรรมเนียมเปิด รายการ {index+1}</span><input className="!w-32" type="number" min="0" max="1000000000000" step="0.01" placeholder="ระบุจำนวน" value={fees[feeKey]??""} disabled={busy} onChange={e=>setFees({...fees,[feeKey]:e.target.value})}/></label>}</TableCell>
     <TableCell>{trade.exit===null||needsFee?"—":money(tfexPnl(trade)??0)}</TableCell>
    </TableRow>;})}</TableBody></Table>
   </div>;})}
   <p className="text-sm" aria-live="polite">{batch?.needsFees?"ยังคำนวณกำไรสุทธิไม่ได้จนกว่าจะกรอกค่าธรรมเนียมเปิดครบ":`กำไรสุทธิของรายการปิดที่จะบันทึก: ${money(succeeded.reduce((sum,e)=>sum+e.result.rows.reduce((s,r)=>s+(tfexPnl(r.trade)??0),0),0))} THB`}</p>
   {error&&<div className="error-message" role="alert">{error}</div>}
   <div className="flex flex-wrap justify-end gap-3"><button className="btn" disabled={busy} onClick={()=>{setReads([]);setReadErrors([]);setFees({});setError("");setFiles([]);}}>เลือกไฟล์ใหม่</button><button className="btn" disabled={busy} onClick={close}>ยกเลิก</button><button className="btn primary" disabled={busy||!batch||!batch.savedCount||batch.needsFees} onClick={()=>void commit()}>{busy?"กำลังบันทึก…":`บันทึก ${batch?.savedCount??0} รายการ${succeeded.length>1?` จาก ${succeeded.length} ไฟล์`:""}`}</button></div>
  </>}
  {!reads.length&&error&&<div className="error-message" role="alert">{error}</div>}
 </DialogContent></Dialog>;
}
