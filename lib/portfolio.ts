import {z} from "zod";
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
export const stateSchema=z.object({platforms:z.array(platformSchema).max(300),accounts:z.array(accountSchema).max(300),trades:z.array(tradeSchema).max(10000),tfex:z.array(tfexSchema).max(10000),cash:z.array(cashSchema).max(10000),quotes:z.record(z.string().max(200),nonnegative),fx:positive});
export type Portfolio=z.infer<typeof stateSchema>;
export type Trade=z.infer<typeof tradeSchema>;
export type Tfex=z.infer<typeof tfexSchema>;
export type Account=z.infer<typeof accountSchema>;
export const blankPortfolio=():Portfolio=>({platforms:[],accounts:[],trades:[],tfex:[],cash:[],quotes:{},fx:35});
export const assetKey=(t:Pick<Trade,"symbol"|"currency"|"platform">)=>`${t.symbol.toUpperCase()}|${t.currency}|${t.platform}`;
export function tfexPnl(t:Tfex){return t.exit===null?null:((t.exit-t.entry)*(t.side==="LONG"?1:-1)*t.qty*t.multiplier-t.fee);}
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
 const platforms=new Set(d.platforms.map(x=>x.id)),accounts=new Map(d.accounts.map(x=>[x.id,x]));
 for(const t of d.trades){if(!platforms.has(t.platform)||!accounts.has(t.account))throw new Error("ไม่พบบัญชีหรือแพลตฟอร์มที่เลือก");if(accounts.get(t.account)!.currency!==t.currency)throw new Error("สกุลเงินของรายการต้องตรงกับบัญชี");}
 for(const t of d.tfex)if(!platforms.has(t.platform))throw new Error("ไม่พบโบรกเกอร์ TFEX");
 for(const t of d.cash)if(!accounts.has(t.account))throw new Error("ไม่พบบัญชีเงินสด");
 const result=summarize(d);
 for(const [a,b] of result.balances)if(b<-.005)throw new Error(`เงินในบัญชี ${accounts.get(a)?.name} ไม่เพียงพอ กรุณาตรวจสอบยอดตั้งต้นหรือฝากเงินเพิ่ม`);
 return d;
}
