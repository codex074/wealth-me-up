import {z} from "zod";
import type {PiTfexStatement} from "./pi-tfex.ts";
const text=z.string().trim().min(1).max(120);
const id=z.string().min(1).max(80);
const notes=z.string().max(2000);
const positive=z.number().finite().positive().max(1e12);
const nonnegative=z.number().finite().min(0).max(1e12);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"วันที่ไม่ถูกต้อง");
const currency=z.enum(["THB","USD"]);
export const platformSchema=z.object({id,name:text,kind:z.enum(["โบรกเกอร์","ธนาคาร","แอปลงทุน","อื่นๆ"]),notes});
export const accountSchema=z.object({id,name:text,bank:text,number:z.string().max(80),currency,opening:nonnegative,notes});
export const tradeSchema=z.object({id,symbol:text,name:text,type:z.enum(["หุ้นสหรัฐฯ","หุ้นไทย","กองทุน","อื่นๆ"]),platform:id,account:id,side:z.enum(["BUY","SELL"]),currency,qty:positive,price:positive,fee:nonnegative,date,notes});
export const tfexSchema=z.object({id,symbol:text,platform:id,side:z.enum(["LONG","SHORT"]),qty:positive.int(),entry:positive,exit:positive.nullable(),multiplier:positive,fee:nonnegative,date,closeDate:date.nullable(),notes}).refine(v=>v.exit===null?v.closeDate===null:!!v.closeDate&&v.closeDate>=v.date,"วันที่ปิดต้องไม่ก่อนวันที่เปิด");
export const cashSchema=z.object({id,account:id,side:z.enum(["DEPOSIT","WITHDRAW"]),amount:positive,date,notes});
const importKeyPattern=/^[a-f0-9]{64}$/;
// Legacy entries are a bare key (always blocking, no recovery). Current entries record which trade
// ids the import produced, so a document can be re-imported once every one of those is deleted.
export const tfexImportSchema=z.union([z.string().regex(importKeyPattern),z.object({key:z.string().regex(importKeyPattern),tradeIds:z.array(id).max(10000)})]);
export const stateSchema=z.object({platforms:z.array(platformSchema).max(300),accounts:z.array(accountSchema).max(300),trades:z.array(tradeSchema).max(10000),tfex:z.array(tfexSchema).max(10000),tfexImports:z.array(tfexImportSchema).max(10000).optional(),cash:z.array(cashSchema).max(10000),quotes:z.record(z.string().max(200),nonnegative),fx:positive});
export type Portfolio=z.infer<typeof stateSchema>;
export type Trade=z.infer<typeof tradeSchema>;
export type Tfex=z.infer<typeof tfexSchema>;
export type Account=z.infer<typeof accountSchema>;
export type TfexImport=z.infer<typeof tfexImportSchema>;
const importKey=(entry:TfexImport)=>typeof entry==="string"?entry:entry.key;
export const blankPortfolio=():Portfolio=>({platforms:[],accounts:[],trades:[],tfex:[],cash:[],quotes:{},fx:35});
export const assetKey=(t:Pick<Trade,"symbol"|"currency"|"platform">)=>`${t.symbol.toUpperCase()}|${t.currency}|${t.platform}`;
export function tfexPnl(t:Tfex){return t.exit===null?null:((t.exit-t.entry)*(t.side==="LONG"?1:-1)*t.qty*t.multiplier-t.fee);}
export type TfexScope = {kind:"all"} | {kind:"year", year:number} | {kind:"quarter", year:number, quarter:1|2|3|4};
export type TfexPnlPoint = {date:string, cumulative:number};
const tfexQuarter=(closeDate:string)=>Math.ceil(Number(closeDate.slice(5,7))/3) as 1|2|3|4;
/** Cumulative realized TFEX P&L, bucketed by closeDate (never the open date). "year"/"quarter"
 * scopes restart the running total from 0 at the period's start; "all" runs from the first
 * ever closed trade. Same-day closes collapse into one point (recharts' category axis renders
 * duplicate x-values as separate slots joined by a diagonal segment, implying intra-day
 * movement that never happened).
 */
export function tfexPnlSeries(data:Portfolio, scope:TfexScope):TfexPnlPoint[]{
 const closed=data.tfex.filter(t=>t.exit!==null).filter(t=>{
  if(scope.kind==="all")return true;
  if(t.closeDate!.slice(0,4)!==String(scope.year))return false;
  return scope.kind==="year"||tfexQuarter(t.closeDate!)===scope.quarter;
 });
 if(!closed.length)return [];
 const sorted=[...closed].sort((a,b)=>a.closeDate!.localeCompare(b.closeDate!));
 const byDate=new Map<string,number>();
 for(const t of sorted)byDate.set(t.closeDate!,(byDate.get(t.closeDate!)??0)+tfexPnl(t)!);
 const points:TfexPnlPoint[]=[];
 let running=0;
 for(const [date,pnl] of byDate){running+=pnl;points.push({date,cumulative:running});}
 if(scope.kind!=="all"){
  const periodStart=scope.kind==="year"?`${scope.year}-01-01`:`${scope.year}-${String((scope.quarter-1)*3+1).padStart(2,"0")}-01`;
  if(periodStart<points[0].date)points.unshift({date:periodStart,cumulative:0});
 }
 return points;
}
export type TfexPerformance = {
 closed:number, won:number, lost:number,
 winRate:number|null, profitFactor:number|null, expectancy:number|null, payoffRatio:number|null,
 largestWin:number|null, largestLoss:number|null, maxConsecutiveLosses:number,
 avgHoldingDays:number|null, feeDrag:number,
 maxDrawdown:number, currentDrawdown:number, recoveryFactor:number|null,
};
/** All-time performance/risk metrics for closed TFEX trades. Unscoped by period (mirrors
 * summarize()'s stat cards, not the chart's period picker), ordered chronologically by close
 * date for the streak and drawdown calculations. Ratios that are undefined at the current
 * sample size (e.g. no losing trades yet) return null rather than NaN/Infinity.
 */
export function tfexPerformance(data:Portfolio):TfexPerformance{
 const closedTrades=[...data.tfex.filter(t=>t.exit!==null)].sort((a,b)=>a.closeDate!.localeCompare(b.closeDate!));
 const closed=closedTrades.length;
 const pnls=closedTrades.map(t=>tfexPnl(t)!);
 const wins=pnls.filter(p=>p>0),losses=pnls.filter(p=>p<0);
 const won=wins.length,lost=losses.length;
 const grossProfit=wins.reduce((s,p)=>s+p,0),grossLoss=-losses.reduce((s,p)=>s+p,0);
 const totalPnl=pnls.reduce((s,p)=>s+p,0);
 let streak=0,maxStreak=0;
 for(const p of pnls){streak=p<0?streak+1:0;if(streak>maxStreak)maxStreak=streak;}
 let running=0,peak=0,maxDrawdown=0;
 for(const p of pnls){running+=p;if(running>peak)peak=running;const dd=peak-running;if(dd>maxDrawdown)maxDrawdown=dd;}
 return {
  closed,won,lost,
  winRate:closed?won/closed*100:null,
  profitFactor:grossLoss>0?grossProfit/grossLoss:null,
  expectancy:closed?totalPnl/closed:null,
  payoffRatio:won&&lost?(grossProfit/won)/(grossLoss/lost):null,
  largestWin:won?Math.max(...wins):null,
  largestLoss:lost?Math.min(...losses):null,
  maxConsecutiveLosses:maxStreak,
  avgHoldingDays:closed?closedTrades.reduce((s,t)=>s+(Date.parse(t.closeDate!)-Date.parse(t.date))/86400000,0)/closed:null,
  feeDrag:closedTrades.reduce((s,t)=>s+t.fee,0),
  maxDrawdown,
  currentDrawdown:peak-running,
  recoveryFactor:maxDrawdown>0?totalPnl/maxDrawdown:null,
 };
}
/** Years/quarters that have at least one closed TFEX trade, most recent first, for a period picker. */
export function availableTfexPeriods(data:Portfolio):{years:number[], quarters:{year:number, quarter:1|2|3|4}[]}{
 const closed=data.tfex.filter(t=>t.exit!==null);
 const years=[...new Set(closed.map(t=>Number(t.closeDate!.slice(0,4))))].sort((a,b)=>b-a);
 const quarters=[...new Set(closed.map(t=>`${t.closeDate!.slice(0,4)}-${tfexQuarter(t.closeDate!)}`))]
  .map(key=>{const [year,quarter]=key.split("-").map(Number);return {year,quarter:quarter as 1|2|3|4};})
  .sort((a,b)=>b.year-a.year||b.quarter-a.quarter);
 return {years,quarters};
}
export function summarize(data:Portfolio){
 const positions=new Map<string,{key:string,symbol:string,name:string,type:string,platform:string,currency:string,qty:number,cost:number,avg:number,price:number,value:number,gain:number}>();
 const balances=new Map(data.accounts.map(a=>[a.id,a.opening]));
 let realizedTHB=0;
 for(const entry of data.cash) balances.set(entry.account,(balances.get(entry.account)??0)+entry.amount*(entry.side==="DEPOSIT"?1:-1));
 for(const t of [...data.trades].sort((a,b)=>a.date.localeCompare(b.date))){
  const key=assetKey(t),p=positions.get(key)??{key,symbol:t.symbol.toUpperCase(),name:t.name,type:t.type,platform:t.platform,currency:t.currency,qty:0,cost:0,avg:0,price:t.price,value:0,gain:0};
  if(t.side==="BUY"){p.cost+=t.qty*t.price+t.fee;p.qty+=t.qty;}else{if(t.qty>p.qty+1e-8)throw new Error(`ขาย ${t.symbol} มากกว่าจำนวนที่ถือครอง ณ ${t.date}`);const cost=p.qty?p.cost/p.qty*t.qty:0;p.cost-=cost;p.qty-=t.qty;realizedTHB+=(t.qty*t.price-t.fee-cost)*(t.currency==="USD"?data.fx:1);}
  p.price=data.quotes[key]??t.price;p.avg=p.qty>1e-8?p.cost/p.qty:0;p.value=p.qty*p.price;p.gain=p.value-p.cost;
  positions.set(key,p);balances.set(t.account,(balances.get(t.account)??0)+(t.side==="BUY"?-t.qty*t.price-t.fee:t.qty*t.price-t.fee));
 }
 const assets=[...positions.values()].filter(p=>p.qty>1e-8);
 const invested=assets.reduce((v,p)=>v+p.value*(p.currency==="USD"?data.fx:1),0);
 const cost=assets.reduce((v,p)=>v+p.cost*(p.currency==="USD"?data.fx:1),0);
 const cash=data.accounts.reduce((v,a)=>v+(balances.get(a.id)??0)*(a.currency==="USD"?data.fx:1),0);
 const closed=data.tfex.filter(t=>t.exit!==null),pnl=closed.reduce((v,t)=>v+(tfexPnl(t)??0),0);
 return {assets,balances,invested,cost,cash,total:invested+cash,gain:invested-cost,realizedTHB,pnl,closed:closed.length,winRate:closed.length?closed.filter(t=>(tfexPnl(t)??0)>0).length/closed.length*100:0};
}
export function validatePortfolio(input:unknown):Portfolio{
 const d=stateSchema.parse(input);
 for(const list of [d.platforms,d.accounts,d.trades,d.tfex,d.cash])if(new Set(list.map(x=>x.id)).size!==list.length)throw new Error("มีรหัสรายการซ้ำ");
 if(new Set((d.tfexImports??[]).map(importKey)).size!==(d.tfexImports??[]).length)throw new Error("มีเอกสาร TFEX นำเข้าซ้ำ");
 const platforms=new Set(d.platforms.map(x=>x.id)),accounts=new Map(d.accounts.map(x=>[x.id,x]));
 for(const t of d.trades){if(!platforms.has(t.platform)||!accounts.has(t.account))throw new Error("ไม่พบบัญชีหรือแพลตฟอร์มที่เลือก");if(accounts.get(t.account)!.currency!==t.currency)throw new Error("สกุลเงินของรายการต้องตรงกับบัญชี");}
 for(const t of d.tfex)if(!platforms.has(t.platform))throw new Error("ไม่พบโบรกเกอร์ TFEX");
 for(const t of d.cash)if(!accounts.has(t.account))throw new Error("ไม่พบบัญชีเงินสด");
 const result=summarize(d);
 for(const [a,b] of result.balances)if(b<-.005)throw new Error(`เงินในบัญชี ${accounts.get(a)?.name} ไม่เพียงพอ กรุณาตรวจสอบยอดตั้งต้นหรือฝากเงินเพิ่ม`);
 return d;
}

export type TfexImportPreview = {trade:Tfex; openingFee:number; needsFee:boolean; matched:boolean; consumed:boolean};
export type TfexImportResult = {data:Portfolio; rows:TfexImportPreview[]; needsFees:boolean; savedCount:number};
/** Reconcile against the current ledger before preview and again before saving.
 * A close consumes a unique matching open lot, preserving fees on a partial close.
 * Ambiguous/manual duplicates require resolution instead of silently guessing.
 */
export function prepareTfexImport(data:Portfolio, statement:PiTfexStatement, platform:string, openingFees:Record<number,string>={}):TfexImportResult {
 const priorImport=(data.tfexImports??[]).find(e=>importKey(e)===statement.key);
 // A legacy bare-string entry has no recorded trade ids and always blocks. A current entry only
 // blocks while at least one trade id it produced is still in the ledger; once the user deletes
 // every one of them (wrong broker, duplicate platform, ...) the document can be imported again.
 if(priorImport&&(typeof priorImport==="string"||priorImport.tradeIds.some(id=>data.tfex.some(t=>t.id===id))))throw new Error("ไฟล์นี้บันทึกแล้ว ไม่สามารถนำเข้าซ้ำได้ แม้เปลี่ยนชื่อไฟล์หรือโบรกเกอร์");
 const next=structuredClone(data);
 if(platform==="__new_pi__"){
  platform=crypto.randomUUID();
  next.platforms.push({id:platform,name:"Pi Securities",kind:"โบรกเกอร์",notes:""});
 }
 if(!next.platforms.some(p=>p.id===platform))throw new Error("กรุณาเลือกโบรกเกอร์");
 const preview: TfexImportPreview[]=[];
 // Track trades this same import produced, so a later row in the same document that fully
 // consumes one (a same-day open immediately closed) can mark the earlier preview row consumed
 // instead of leaving a phantom entry that will not actually be saved.
 const producedAt=new Map<string,number>();
 for(const [index,row] of statement.rows.entries()){
  const sameOpen=(t:Tfex)=>t.platform===platform&&t.symbol.toUpperCase()===row.symbol&&t.side===row.side&&t.date===row.date&&t.entry===row.entry;
  // Inspect the saved ledger, not earlier rows of this same document (identical fills are valid).
  if(data.tfex.some(t=>sameOpen(t)&&(row.exit===null||(t.exit===row.exit&&t.closeDate===row.closeDate))))throw new Error(`พบรายการเดิมที่อาจซ้ำกับ ${row.symbol} วันที่ ${row.date} กรุณาตรวจหรือแก้รายการเดิมก่อนนำเข้า`);
  let openingFee=0, needsFee=false, matched=false;
  if(row.exit!==null){
   const candidates=next.tfex.filter(t=>sameOpen(t)&&t.exit===null);
   // A close with no exact-date/entry match must not silently fall through to "new position" if an open lot of the same symbol/side already exists — that lot would stay open forever.
   if(!candidates.length&&next.tfex.some(t=>t.platform===platform&&t.symbol.toUpperCase()===row.symbol&&t.side===row.side&&t.exit===null))throw new Error(`มีสถานะเปิด ${row.symbol} ${row.side} ที่วันที่/ราคาเปิดไม่ตรงกับเอกสาร กรุณาแก้ไขรายการเดิมก่อนนำเข้า`);
   if(candidates.length){
    if(candidates.some(existing=>existing.multiplier!==row.multiplier)||candidates.reduce((sum,existing)=>sum+existing.qty,0)<row.qty)throw new Error(`จำนวนหรือมูลค่าต่อจุดของสถานะเดิม ${row.symbol} ไม่ตรงกับ PDF`);
    matched=true;
    let remaining=row.qty;const matchedNotes:string[]=[];
    for(const existing of candidates){
     if(!remaining)break;
     const take=Math.min(remaining,existing.qty);
     const allocated=Math.round(existing.fee*100*take/existing.qty)/100;
     openingFee=Math.round((openingFee+allocated)*100)/100;
     if(existing.notes&&!matchedNotes.includes(existing.notes))matchedNotes.push(existing.notes);
     remaining-=take;
     if(existing.qty===take){
      next.tfex=next.tfex.filter(t=>t.id!==existing.id);
      if(producedAt.has(existing.id))preview[producedAt.get(existing.id)!].consumed=true;
     }else{existing.qty-=take;existing.fee=Math.round((existing.fee-allocated)*100)/100;}
    }
    const trade:Tfex={...row,id:crypto.randomUUID(),platform,fee:Math.round((openingFee+row.fee)*100)/100,notes:matchedNotes.join("\n")};
    next.tfex.push(trade);producedAt.set(trade.id,preview.length);preview.push({trade,openingFee,needsFee,matched,consumed:false});continue;
   }
   const input=openingFees[index];
   needsFee=input===undefined||input.trim()==="";
   openingFee=needsFee?0:Number(input);
   if(!Number.isFinite(openingFee)||openingFee<0||openingFee>1e12)throw new Error("ค่าธรรมเนียมเปิดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
  }
  const {gross: _gross,...fields}=row;
  void _gross;
  const trade:Tfex={...fields,id:crypto.randomUUID(),platform,fee:Math.round((openingFee+row.fee)*100)/100,notes:"นำเข้าจากใบยืนยัน Pi"};
  next.tfex.push(trade);producedAt.set(trade.id,preview.length);preview.push({trade,openingFee,needsFee,matched,consumed:false});
 }
 const tradeIds=preview.filter(r=>!r.consumed).map(r=>r.trade.id);
 next.tfexImports=[...(next.tfexImports??[]).filter(e=>importKey(e)!==statement.key),{key:statement.key,tradeIds}];
 return {data:validatePortfolio(next),rows:preview,needsFees:preview.some(r=>r.needsFee),savedCount:preview.filter(r=>!r.consumed).length};
}

export type TfexImportBatchEntry = {statement:PiTfexStatement} & ({result:TfexImportResult}|{error:string});
export type TfexImportBatchResult = {entries:TfexImportBatchEntry[]; data:Portfolio; needsFees:boolean; savedCount:number};
/** Import several statements at once. Sorted by trading date so a close in a later
 * document can match an open lot from an earlier one. openingFees keys are
 * "<statement.key>:<row index>" so several statements' rows don't collide.
 * A statement that fails validation is skipped; the rest still apply. If `platform`
 * is the "__new_pi__" sentinel, every statement after the first lands on the one
 * broker created for the batch instead of each creating its own.
 */
export function prepareTfexImportBatch(data:Portfolio, statements:PiTfexStatement[], platform:string, openingFees:Record<string,string>={}):TfexImportBatchResult {
 const sorted=[...statements].sort((a,b)=>a.date.localeCompare(b.date));
 let runningData=data, resolvedPlatform=platform;
 const entries:TfexImportBatchEntry[]=[];
 for(const statement of sorted){
  const prefix=`${statement.key}:`;
  const localFees=Object.fromEntries(Object.entries(openingFees).filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[Number(key.slice(prefix.length)),value]));
  try{
   const result=prepareTfexImport(runningData,statement,resolvedPlatform,localFees);
   runningData=result.data;
   if(resolvedPlatform==="__new_pi__")resolvedPlatform=result.rows[0].trade.platform;
   entries.push({statement,result});
  }catch(e){
   entries.push({statement,error:e instanceof Error&&e.name!=="ZodError"?e.message:"นำเข้าไม่สำเร็จ"});
  }
 }
 return {entries,data:runningData,needsFees:entries.some(e=>"result" in e&&e.result.needsFees),savedCount:entries.reduce((sum,e)=>sum+("result" in e?e.result.savedCount:0),0)};
}
