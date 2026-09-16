"use client";
import {useEffect,useState,type ReactNode} from "react";
import {Plus,Pencil,Wallet,Landmark,ArrowUpRight,ArrowDownLeft,TrendingUp} from "lucide-react";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from "@/components/ui/table";
import {Portfolio,availableTfexPeriods,summarize,tfexPerformance,tfexPnl,tfexPnlSeries,validatePortfolio,type TfexPerformance,type TfexScope} from "@/lib/portfolio";
import {ResponsiveContainer,LineChart,Line,CartesianGrid,XAxis,YAxis,ReferenceLine,Tooltip,type TooltipContentProps} from "recharts";
export type Modal={kind:"platform"|"account"|"trade"|"tfex"|"cash"|"quote"|"fx",id?:string}|null;
const n=(v:number)=>v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const labels={platform:"แพลตฟอร์ม / โบรกเกอร์",account:"บัญชีเงินสด",trade:"รายการซื้อขาย",tfex:"การเทรด TFEX",cash:"ฝาก / ถอนเงิน",quote:"ราคาประเมินสินทรัพย์",fx:"อัตราแลกเปลี่ยน"};
export function Picker({label,value,options,onChange}:{label:string,value:string,options:[string,string][],onChange:(v:string)=>void}){return <label className="form-field">{label}<Select value={value||undefined} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue placeholder="เลือก..."/></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></label>}
const thMonths=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function TfexTooltip({active,payload,label,money}:Partial<TooltipContentProps<number,string>>&{money:(n:number)=>string}){
 if(!active||!payload?.length)return null;
 const v=Number(payload[0].value),d=String(label);
 return <div className="rounded-md border border-[#ffffff33] bg-[#0d2338] px-3 py-2 text-xs shadow-sm">
  <strong className={v>=0?"dark-positive":"dark-negative"}>{v>=0?"+":"−"}{money(Math.abs(v))}</strong>
  <div className="mt-1 text-[#93a8c2]">{Number(d.slice(8,10))} {thMonths[Number(d.slice(5,7))-1]} {d.slice(0,4)}</div>
 </div>;
}
/** Cumulative realized TFEX P&L. Scoped independently of the stat cards/table above and
 * below it (per product decision: the period filter here never affects those). State lives
 * here (not lifted) so it resets to "ทั้งหมด" whenever the user leaves and returns to the
 * TFEX page — acceptable since that's the confirmed default anyway.
 */
function TfexPnlChart({data,money}:{data:Portfolio,money:(n:number)=>string}){
 const [mode,setMode]=useState<"all"|"year"|"quarter">("all");
 const [year,setYear]=useState<number|null>(null);
 const [quarter,setQuarter]=useState<{year:number,quarter:1|2|3|4}|null>(null);
 const periods=availableTfexPeriods(data);
 const effectiveYear=year!==null&&periods.years.includes(year)?year:periods.years[0]??null;
 const effectiveQuarter=quarter&&periods.quarters.some(q=>q.year===quarter.year&&q.quarter===quarter.quarter)?quarter:periods.quarters[0]??null;
 const scope:TfexScope|null=mode==="all"?{kind:"all"}:mode==="year"?(effectiveYear!==null?{kind:"year",year:effectiveYear}:null):(effectiveQuarter?{kind:"quarter",year:effectiveQuarter.year,quarter:effectiveQuarter.quarter}:null);
 const series=scope?tfexPnlSeries(data,scope):[];
 const scopeLabel=mode==="all"?"สะสมทั้งหมด":mode==="year"?`ปี ${effectiveYear}`:`ไตรมาส ${effectiveQuarter?.quarter} ปี ${effectiveQuarter?.year}`;
 const tick=(d:string)=>mode==="quarter"?`${d.slice(8,10)}/${d.slice(5,7)}`:mode==="year"?thMonths[Number(d.slice(5,7))-1]:`${thMonths[Number(d.slice(5,7))-1]} ${d.slice(2,4)}`;
 const last=series[series.length-1];
 return <div className="mt-2">
  <div className="panel-heading" style={{padding:0}}>
   <div><h2>กำไร/ขาดทุนสะสม</h2><p>ผลรวมกำไร/ขาดทุนที่รับรู้แล้วตามช่วงเวลา</p></div>
   <div className="flex items-center gap-3">
    {mode==="year"&&<Select value={effectiveYear!==null?String(effectiveYear):undefined} onValueChange={v=>setYear(Number(v))}><SelectTrigger aria-label="เลือกปี"><SelectValue/></SelectTrigger><SelectContent>{periods.years.map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>}
    {mode==="quarter"&&<Select value={effectiveQuarter?`${effectiveQuarter.year}-${effectiveQuarter.quarter}`:undefined} onValueChange={v=>{const [y,q]=v.split("-").map(Number);setQuarter({year:y,quarter:q as 1|2|3|4});}}><SelectTrigger aria-label="เลือกไตรมาส"><SelectValue/></SelectTrigger><SelectContent>{periods.quarters.map(q=><SelectItem key={`${q.year}-${q.quarter}`} value={`${q.year}-${q.quarter}`}>{`Q${q.quarter} ${q.year}`}</SelectItem>)}</SelectContent></Select>}
    <Tabs value={mode} onValueChange={v=>setMode(v as typeof mode)}><TabsList className="range-tabs"><TabsTrigger value="all">ทั้งหมด</TabsTrigger><TabsTrigger value="year">รายปี</TabsTrigger><TabsTrigger value="quarter">ไตรมาส</TabsTrigger></TabsList></Tabs>
   </div>
  </div>
  {series.length?<>
   <div className={`chart-summary ${last.cumulative>=0?"dark-positive":"dark-negative"}`}>{money(last.cumulative)} <span className="chart-caption-muted">{scopeLabel}</span></div>
   <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{top:5,right:10,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff14"/><XAxis dataKey="date" tickFormatter={tick} tick={{fontSize:10,fill:"#93a8c2"}} axisLine={false} tickLine={false} minTickGap={24} interval="preserveStartEnd"/><YAxis hide/><ReferenceLine y={0} stroke="#ffffff55" strokeDasharray="4 4"/><Tooltip content={<TfexTooltip money={money}/>}/><Line type="monotone" dataKey="cumulative" stroke="#ffffff" strokeWidth={2} dot={false} activeDot={{r:4}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
   <div className="chart-legend"><span><i className="legend-line"/>กำไร/ขาดทุนสะสม</span><span><i className="legend-line dashed"/>เส้นฐาน 0</span></div>
  </>:<div className="chart-wrap"><div className="empty-state"><TrendingUp className="mx-auto mb-3" size={32}/><p>ยังไม่มีเทรดที่ปิดสถานะในช่วงเวลานี้</p></div></div>}
 </div>;
}
export function DataViews({page,data,open,money}:{page:string,data:Portfolio,open:(m:Modal)=>void,money:(n:number)=>string}){
 const s=summarize(data),platform=(id:string)=>data.platforms.find(x=>x.id===id)?.name??"—";
 if(page==="accounts")return <><div className="data-toolbar"><p className="help-text">ยอดคงเหลือ = ยอดตั้งต้น + ฝาก − ถอน − ซื้อ + ขาย (รวมค่าธรรมเนียม)</p><button className="btn" onClick={()=>open({kind:"cash"})}><ArrowDownLeft size={16}/> ฝาก / ถอนเงิน</button></div><div className="cards-grid">{data.accounts.map(a=><section className="panel detail-card" key={a.id}><div className="flex justify-between items-center"><span className="stat-icon"><Wallet size={22}/></span><span className="platform-pill">{a.currency}</span></div><h2>{a.name}</h2><p>{a.bank}</p><p>{a.number||"ไม่ได้ระบุเลขบัญชี"}</p><div className="stat-value">{a.currency==="USD"?"$":"฿"}{n(s.balances.get(a.id)??0)}</div><p className="help-text">ยอดตั้งต้น {n(a.opening)} {a.currency}</p>{a.notes&&<p>{a.notes}</p>}<button className="text-button" onClick={()=>open({kind:"account",id:a.id})}><Pencil size={14}/> แก้ไขบัญชี</button></section>)}</div>{!data.accounts.length&&<Empty title="เพิ่มบัญชีเงินสดบัญชีแรก" text="ระบุธนาคาร เลขบัญชี สกุลเงิน และยอดตั้งต้นของคุณ" onClick={()=>open({kind:"account"})}/>} {!!data.cash.length&&<section className="panel holdings mt-6"><div className="panel-heading"><h2>ประวัติฝาก / ถอน</h2></div><Table><TableHeader><TableRow>{["วันที่","บัญชี","รายการ","จำนวนเงิน",""].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{[...data.cash].reverse().map(c=><TableRow key={c.id}><TableCell>{c.date}</TableCell><TableCell>{data.accounts.find(a=>a.id===c.account)?.name}</TableCell><TableCell>{c.side==="DEPOSIT"?"ฝากเงิน":"ถอนเงิน"}</TableCell><TableCell>{n(c.amount)} {data.accounts.find(a=>a.id===c.account)?.currency}</TableCell><TableCell><button aria-label="แก้ไขรายการเงินสด" onClick={()=>open({kind:"cash",id:c.id})}><Pencil size={14}/></button></TableCell></TableRow>)}</TableBody></Table></section>}</>;
 if(page==="platforms")return <><div className="cards-grid">{data.platforms.map(p=><section key={p.id} className="panel detail-card"><span className="stat-icon inline-block"><Landmark size={24}/></span><h2>{p.name}</h2><p>{p.kind}</p><p>{data.trades.filter(t=>t.platform===p.id).length} รายการซื้อขาย · {data.tfex.filter(t=>t.platform===p.id).length} เทรด TFEX</p>{p.notes&&<p>{p.notes}</p>}<button className="text-button mt-5" onClick={()=>open({kind:"platform",id:p.id})}><Pencil size={14}/> แก้ไขรายละเอียด</button></section>)}</div>{!data.platforms.length&&<Empty title="เชื่อมภาพรวมทุกแพลตฟอร์ม" text="เพิ่มชื่อโบรกเกอร์ ธนาคาร หรือแอปที่คุณใช้ลงทุน" onClick={()=>open({kind:"platform"})}/>}<p className="help-text mt-5">ใช้จัดหมวดหมู่รายการที่บันทึกเอง ยังไม่ได้เชื่อมต่อหรือส่งคำสั่งซื้อขายไปยังโบรกเกอร์</p></>;
 if(page==="transactions")return <><div className="data-toolbar"><p className="help-text">บันทึกซื้อ–ขายตามวันที่ทำรายการ · คำนวณต้นทุนเฉลี่ยรวมค่าธรรมเนียม</p><strong className={s.realizedTHB>=0?"positive":"negative"}>กำไรรับรู้ {money(s.realizedTHB)}</strong></div>{!data.trades.length?<Empty title="เริ่มบันทึกการลงทุนของคุณ" text="เพิ่มบัญชีและแพลตฟอร์ม แล้วบันทึกการซื้อขายครั้งแรก" onClick={()=>open({kind:"trade"})}/>:<section className="panel holdings"><Table><TableHeader><TableRow>{["วันที่ / สินทรัพย์","รายการ","แพลตฟอร์ม / บัญชี","จำนวน","ราคา / หน่วย","ค่าธรรมเนียม","มูลค่ารายการ",""].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{[...data.trades].sort((a,b)=>b.date.localeCompare(a.date)).map(t=><TableRow key={t.id}><TableCell><strong>{t.symbol}</strong><small>{t.date}</small>{t.notes&&<small>{t.notes}</small>}</TableCell><TableCell><span className={t.side==="BUY"?"positive-pill light":"platform-pill"}>{t.side==="BUY"?"ซื้อ":"ขาย"}</span></TableCell><TableCell>{platform(t.platform)}<small>{data.accounts.find(a=>a.id===t.account)?.name}</small></TableCell><TableCell>{t.qty.toLocaleString()}</TableCell><TableCell>{n(t.price)} {t.currency}</TableCell><TableCell>{n(t.fee)}</TableCell><TableCell>{n(t.qty*t.price+(t.side==="BUY"?t.fee:-t.fee))} {t.currency}</TableCell><TableCell><button aria-label={`แก้ไข ${t.symbol}`} onClick={()=>open({kind:"trade",id:t.id})}><Pencil size={14}/></button></TableCell></TableRow>)}</TableBody></Table></section>}</>;
 if(page==="tfex")return <><div className="tfex-band"><div className="eyebrow">TFEX PERFORMANCE</div><div className={`hero-num ${s.pnl>=0?"dark-positive":"dark-negative"}`}>{money(s.pnl)}</div><p className="hero-sub">กำไร/ขาดทุนสุทธิที่ปิดแล้ว หักค่าธรรมเนียมรวมแล้ว</p><div className="band-grid"><div className="band-item"><div className="k">Win rate</div><div className="v">{s.winRate.toFixed(1)}%</div></div><div className="band-item"><div className="k">เทรดที่ปิดแล้ว</div><div className="v">{s.closed}</div></div><div className="band-item"><div className="k">สถานะเปิดอยู่</div><div className="v">{data.tfex.filter(t=>t.exit===null).length}</div></div></div><TfexPnlChart data={data} money={money}/></div><PerformanceRisk p={tfexPerformance(data)} money={money}/><p className="help-text mb-4">สมุดบันทึก Futures แยกจากยอดบัญชีเงินสด · กำไร TFEX ไม่ถูกนำมาบวกซ้ำในมูลค่าพอร์ต · มูลค่าต่อจุดกำหนดเองตามสัญญา</p>{!data.tfex.length?<Empty title="ทุกเทรดมีสิ่งให้เรียนรู้" text="บันทึก Long / Short ราคาเข้า–ออก และแผนการเทรดของคุณ" onClick={()=>open({kind:"tfex"})}/>:<section className="panel holdings"><Table><TableHeader><TableRow>{["สัญญา / วันที่เปิด","ฝั่ง / จำนวน","โบรกเกอร์","เปิด → ปิด","ค่าธรรมเนียม","กำไรสุทธิ (THB)","บันทึก",""].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{[...data.tfex].sort((a,b)=>b.date.localeCompare(a.date)).map(t=><TableRow key={t.id}><TableCell><strong>{t.symbol}</strong><small>{t.date}</small></TableCell><TableCell><span className={t.side==="LONG"?"positive":"negative"}>{t.side}</span><small>{t.qty} สัญญา</small></TableCell><TableCell>{platform(t.platform)}</TableCell><TableCell>{n(t.entry)} → {t.exit===null?"เปิดอยู่":n(t.exit)}<small>{t.closeDate||"ยังไม่ปิดสถานะ"}</small></TableCell><TableCell>{n(t.fee)}</TableCell><TableCell className={(tfexPnl(t)??0)>=0?"positive":"negative"}>{t.exit===null?"—":n(tfexPnl(t)!)}</TableCell><TableCell className="max-w-52 !whitespace-normal">{t.notes||"—"}</TableCell><TableCell><button aria-label={`แก้ไขเทรด ${t.symbol}`} onClick={()=>open({kind:"tfex",id:t.id})}><Pencil size={14}/></button></TableCell></TableRow>)}</TableBody></Table></section>}</>;
 return null;
}
function MetricTile({k,sub,children}:{k:string,sub:ReactNode,children:ReactNode}){return <div className="metric-tile"><div className="k">{k}</div><div className="v">{children}</div><div className="sub">{sub}</div></div>}
/** All-time (unscoped) trading-quality and risk metrics for the TFEX page, derived purely from
 * closed trade data — no separate TFEX cash/margin account exists to source equity or capital
 * flow figures, so those are intentionally out of scope here.
 */
function PerformanceRisk({p,money}:{p:TfexPerformance,money:(n:number)=>string}){
 const pct=(v:number|null)=>v===null?"—":`${v.toFixed(1)}%`;
 const ratio=(v:number|null)=>v===null?"—":v.toFixed(2);
 return <section className="panel performance-risk mb-6">
  <div className="panel-heading"><h2>Performance & Risk</h2><p>ตัวชี้วัดคุณภาพการเทรดและความเสี่ยงของพอร์ต</p></div>
  <div className="metric-columns">
   <div className="metric-col">
    <div className="metric-col-heading">TRADING PERFORMANCE</div>
    <div className="metric-grid">
     <MetricTile k="Closed Trades" sub={`${p.won} won · ${p.lost} lost`}>{p.closed}</MetricTile>
     <MetricTile k="Win Rate" sub={`of ${p.closed} closed trades`}>{pct(p.winRate)}</MetricTile>
     <MetricTile k="Profit Factor" sub="gross profit ÷ gross loss">{ratio(p.profitFactor)}</MetricTile>
     <MetricTile k="Expectancy" sub="net P/L per closed trade">{p.expectancy===null?"—":money(p.expectancy)}</MetricTile>
     <MetricTile k="Payoff Ratio" sub="average win ÷ average loss">{ratio(p.payoffRatio)}</MetricTile>
     <MetricTile k="Largest Win / Loss" sub="THB, single closed trade"><span className="positive">{p.largestWin===null?"—":money(p.largestWin)}</span> / <span className="negative">{p.largestLoss===null?"—":money(p.largestLoss)}</span></MetricTile>
     <MetricTile k="Max Consecutive Losses" sub="longest losing streak">{p.maxConsecutiveLosses}</MetricTile>
     <MetricTile k="Avg Holding Period" sub="open to close, calendar days">{p.avgHoldingDays===null?"—":p.avgHoldingDays.toFixed(1)}</MetricTile>
     <MetricTile k="Fee Drag" sub={`${money(p.feeDrag)} total fees`}>{money(p.feeDrag)}</MetricTile>
    </div>
   </div>
   <div className="metric-col">
    <div className="metric-col-heading">RISK & EXPOSURE</div>
    <div className="metric-grid">
     <MetricTile k="Maximum Drawdown" sub="THB, on closed trades">{money(p.maxDrawdown)}</MetricTile>
     <MetricTile k="Current Drawdown" sub="below the last equity peak">{money(p.currentDrawdown)}</MetricTile>
     <MetricTile k="Recovery Factor" sub="realized P/L ÷ max drawdown">{ratio(p.recoveryFactor)}</MetricTile>
    </div>
   </div>
  </div>
 </section>;
}
function Empty({title,text,onClick}:{title:string,text:string,onClick:()=>void}){return <div className="panel empty-state"><SproutIcon/><h2 className="justify-center mt-3">{title}</h2><p className="help-text mt-2 mb-5">{text}</p><button className="btn primary" onClick={onClick}><Plus size={16}/> เพิ่มรายการ</button></div>}
function SproutIcon(){return <ArrowUpRight className="mx-auto" size={30}/>}
export function EntryDialog({modal,close,data,save,open}:{modal:Modal,close:()=>void,data:Portfolio,save:(d:Portfolio)=>Promise<void>,open:(m:Modal)=>void}){
 const [f,setF]=useState<Record<string,string>>({}),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const kind=modal?.kind;
 useEffect(()=>{if(!modal)return;const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Bangkok"});let source:Record<string,unknown>={date:today,closeDate:today,side:modal.kind==="tfex"?"LONG":modal.kind==="cash"?"DEPOSIT":"BUY",kind:"โบรกเกอร์",currency:"THB",type:"หุ้นไทย",fee:0,qty:1,multiplier:200,opening:0,notes:"",platform:data.platforms[0]?.id??"",account:data.accounts[0]?.id??"",fx:data.fx};const list=modal.kind==="trade"?data.trades:modal.kind==="platform"?data.platforms:modal.kind==="account"?data.accounts:modal.kind==="cash"?data.cash:modal.kind==="tfex"?data.tfex:[];if(modal.id)source={...source,...list.find(x=>x.id===modal.id)};if(modal.kind==="quote")source.price=data.quotes[modal.id!]??summarize(data).assets.find(a=>a.key===modal.id)?.price??0;setF(Object.fromEntries(Object.entries(source).map(([k,v])=>[k,v===null?"":String(v)])));setError("");},[modal,data]);
 const change=(key:string,value:string)=>setF(v=>({...v,[key]:value}));
 function field(key:string,label:string,type="text",required=true,extra:Record<string,unknown>={}){return <label className="form-field" key={key}>{label}<input name={key} aria-label={label} type={type} value={f[key]??""} onChange={e=>change(key,e.target.value)} required={required} maxLength={type==="text"?120:undefined} {...(type==="number"?{min:["fee","opening","price"].includes(key)?0:0.00000001,step:"any"}: {})} {...extra}/></label>}
 function pick(key:string,label:string,options:[string,string][]){return <Picker label={label} value={f[key]??""} options={options} onChange={v=>change(key,v)}/>}
 const accounts=data.accounts.map(a=>[a.id,`${a.name} (${a.currency})`] as [string,string]),platforms=data.platforms.map(p=>[p.id,p.name] as [string,string]);
 const missing=kind==="trade"?(!data.platforms.length?"platform":!data.accounts.length?"account":null):kind==="tfex"&&!data.platforms.length?"platform":kind==="cash"&&!data.accounts.length?"account":null;
 async function submit(e:React.FormEvent){e.preventDefault();if(!kind)return;setBusy(true);setError("");try{const d=structuredClone(data),id=modal?.id??crypto.randomUUID();const num=(k:string)=>Number(f[k]);const common={id,notes:f.notes??""};
 if(kind==="fx")d.fx=num("fx");else if(kind==="quote")d.quotes[id]=num("price");else{
 const key=kind==="platform"?"platforms":kind==="account"?"accounts":kind==="trade"?"trades":kind==="tfex"?"tfex":"cash";
 const value=kind==="platform"?{...common,name:f.name,kind:f.kind}:kind==="account"?{...common,name:f.name,bank:f.bank,number:f.number??"",currency:f.currency,opening:num("opening")}:kind==="trade"?{...common,symbol:f.symbol.toUpperCase(),name:f.name,type:f.type,platform:f.platform,account:f.account,currency:data.accounts.find(a=>a.id===f.account)?.currency,side:f.side,qty:num("qty"),price:num("price"),fee:num("fee"),date:f.date}:kind==="tfex"?{...common,symbol:f.symbol.toUpperCase(),platform:f.platform,side:f.side,qty:num("qty"),entry:num("entry"),exit:f.exit?num("exit"):null,multiplier:num("multiplier"),fee:num("fee"),date:f.date,closeDate:f.exit?f.closeDate:null}:{...common,account:f.account,side:f.side,amount:num("amount"),date:f.date};
 const arr=d[key] as unknown as Array<Record<string,unknown>>,idx=arr.findIndex(x=>x.id===id);if(idx>=0)arr[idx]=value;else arr.push(value);
 }await save(validatePortfolio(d));close();}catch(e){setError(e instanceof Error&&e.name!=="ZodError"?e.message:"กรุณาตรวจสอบข้อมูล เลือกช่องที่จำเป็น และใช้ตัวเลขที่ถูกต้อง");}finally{setBusy(false);}}
 return <Dialog open={!!modal} onOpenChange={v=>{if(!v&&!busy)close()}}><DialogContent className="!max-w-[570px] max-h-[90dvh] overflow-y-auto !bg-white !rounded-2xl !p-7"><DialogHeader><DialogTitle>{modal?.id&&kind!=="quote"?"แก้ไข":"บันทึก"}{kind?labels[kind]:""}</DialogTitle><DialogDescription>{kind==="tfex"?"กำไรสุทธิ = ส่วนต่างราคา × มูลค่าต่อจุด × จำนวนสัญญา − ค่าธรรมเนียมรวม":"ข้อมูลจะบันทึกในพอร์ตส่วนตัวของคุณ"}</DialogDescription></DialogHeader>{missing?<div className="empty-state !p-5"><p className="mb-5">กรุณาเพิ่ม{labels[missing]}ก่อนบันทึกรายการนี้</p><button className="btn primary" onClick={()=>open({kind:missing})}><Plus size={16}/> เพิ่ม{labels[missing]}</button></div>:<form onSubmit={submit}><div className="form-grid">
 {kind==="platform"&&<>{field("name","ชื่อแพลตฟอร์ม / โบรกเกอร์")}{pick("kind","ประเภท",["โบรกเกอร์","ธนาคาร","แอปลงทุน","อื่นๆ"].map(v=>[v,v]))}</>}
 {kind==="account"&&<>{field("name","ชื่อบัญชี")}{field("bank","ชื่อธนาคาร / ผู้ให้บริการ")}{field("number","เลขที่บัญชี","text",false)}{pick("currency","สกุลเงิน",[["THB","THB — บาท"],["USD","USD — ดอลลาร์สหรัฐ"]])}{field("opening","ยอดตั้งต้น (ก่อนรายการทั้งหมด)","number")}</>}
 {kind==="trade"&&<>{pick("side","ประเภทรายการ",[["BUY","ซื้อ"],["SELL","ขาย"]])}{field("date","วันที่ซื้อขาย","date")}{field("symbol","ชื่อย่อสินทรัพย์")}{field("name","ชื่อสินทรัพย์")}{pick("type","ประเภทสินทรัพย์",["หุ้นไทย","หุ้นสหรัฐฯ","กองทุน","อื่นๆ"].map(v=>[v,v]))}{pick("platform","แพลตฟอร์ม / โบรกเกอร์",platforms)}{pick("account","บัญชีชำระเงิน",accounts)}{field("qty","จำนวนหุ้น / หน่วย","number")}{field("price",`ราคาต่อหน่วย (${data.accounts.find(a=>a.id===f.account)?.currency??"สกุลเงินบัญชี"})`,"number",true,{min:.00000001})}{field("fee","ค่าธรรมเนียมรวม","number")}</>}
 {kind==="tfex"&&<>{field("symbol","ชื่อสัญญา เช่น S50U26")}{pick("platform","โบรกเกอร์",platforms)}{pick("side","ฝั่งการเทรด",[["LONG","Long — ซื้อ"],["SHORT","Short — ขาย"]])}{field("qty","จำนวนสัญญา","number",true,{min:1,step:1})}{field("entry","ราคาเปิด","number")}{field("exit","ราคาปิด (เว้นว่างถ้ายังเปิด)","number",false)}{field("date","วันที่เปิด","date")}{field("closeDate","วันที่ปิด","date",!!f.exit)}{field("multiplier","มูลค่าต่อจุด (THB / สัญญา)","number")}{field("fee","ค่าธรรมเนียมรวมเปิด–ปิด (THB)","number")}</>}
 {kind==="cash"&&<>{pick("account","บัญชีเงินสด",accounts)}{pick("side","ประเภทรายการ",[["DEPOSIT","ฝากเงิน"],["WITHDRAW","ถอนเงิน"]])}{field("amount","จำนวนเงิน (สกุลเงินของบัญชี)","number")}{field("date","วันที่ทำรายการ","date")}</>}
 {kind==="quote"&&<>{field("price","ราคาประเมินล่าสุด (สกุลเงินสินทรัพย์)","number")}<p className="help-text">ใช้ประเมินมูลค่าพอร์ต ราคานี้บันทึกเองและไม่มีการอัปเดตอัตโนมัติ</p></>}
 {kind==="fx"&&<>{field("fx","1 USD เท่ากับกี่ THB","number")}<p className="help-text">อัตราประเมินที่กำหนดเอง ใช้รวมมูลค่าและกำไรเป็นสกุลเงินที่เลือก โดยไม่เปลี่ยนยอดในบัญชี</p></>}
 {kind!=="fx"&&kind!=="quote"&&<label className="form-field full">หมายเหตุ<textarea rows={3} maxLength={2000} value={f.notes??""} onChange={e=>change("notes",e.target.value)} placeholder={kind==="tfex"?"แผนการเทรด เหตุผลเข้า–ออก และบทเรียน...":"รายละเอียดเพิ่มเติม (ไม่บังคับ)"}/></label>}
 </div>{error&&<div role="alert" className="error-message mt-4">{error}</div>}<div className="flex justify-end gap-3 mt-6"><button type="button" className="btn" disabled={busy} onClick={close}>ยกเลิก</button><button type="submit" className="btn primary" disabled={busy}>{busy?"กำลังบันทึก...":"บันทึกข้อมูล"}</button></div></form>}</DialogContent></Dialog>
}
