/** Strict adapter for Pi's S50 and USD futures daily confirmation.
 * Document text is data only. Unknown rows/layouts fail the entire import.
 */
export type PiTfexRow = {
  symbol: string; side: "LONG" | "SHORT"; qty: number; entry: number;
  exit: number | null; date: string; closeDate: string | null;
  multiplier: number; fee: number; gross: number | null;
};
export type PiTfexStatement = { key: string; date: string; rows: PiTfexRow[]; fees: number; gross: number };
const numberPattern = "-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
const numeric = (value: string) => Number(value.replaceAll(",", ""));
const amounts = (value: string) => value.trim().split(/\s+/).map(v => {
  if (!new RegExp(`^${numberPattern}$`).test(v)) throw new Error("รูปแบบตัวเลขใน PDF ไม่ถูกต้อง");
  return numeric(v);
});
const equal = (a: number, b: number) => Math.abs(a - b) < 0.011;
// Printed section/grand totals accumulate broker rounding (e.g. VAT computed per row on the
// commission subtotal) that per-row equality is too tight for; scale the slack with row count.
const equalTotal = (a: number, b: number, rows: number) => Math.abs(a - b) <= 0.005 * rows + 0.01;
const instrument = (symbol: string) => {
  if (/^S50[HMUZ]\d{2}$/.test(symbol)) return {name:"SET50 Index Futures",multiplier:200};
  if (/^USD[FGHJKMNQUVXZ]\d{2}$/.test(symbol)) return {name:"USD Futures",multiplier:1000};
  return null;
};
const expectedContractPrefix = (side:"LONG"|"SHORT", status:string) => side==="LONG"?(status==="Open"?"BU":"BH"):(status==="Open"?"SH":"SE");
function date(value: string) {
  const [day, month, year] = value.split("/");
  const result = `${year}-${month}-${day}`;
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error("วันที่ใน PDF ไม่ถูกต้อง");
  return result;
}
// Salted with the signed-in owner's email so a D1 row does not expose a brute-forceable
// sha256("pi:DN-YYYYMMDD-NNNNN") — the Pi document number preimage space is small.
export async function fingerprint(documentNo: string, salt: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pi:${salt.trim().toLowerCase()}:${documentNo}`));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export async function parsePiTfex(text: string, salt: string): Promise<PiTfexStatement> {
  const lines = text.split(/\r?\n/).map(l => l.trim().replace(/\s+/g, " ")).filter(Boolean);
  const normalized = lines.join("\n");
  if (!/Pi Securities Public Company Limited/i.test(normalized) || !normalized.includes("Confirmation Note") || !normalized.includes("STATEMENT OF ACCOUNT")) throw new Error("รองรับเฉพาะใบยืนยันการซื้อขาย TFEX ของ Pi รูปแบบที่กำหนด (PDF ข้อความ ไม่ใช่ภาพสแกน)");
  const documentNo = normalized.match(/\bDN-(\d{8})-\d+\b/);
  if (!documentNo) throw new Error("ไม่พบเลขที่เอกสาร Pi");
  const stamp = documentNo[1];
  const tradingDate = date(`${stamp.slice(6, 8)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)}`);
  const start = lines.findIndex(l => /^Instrument Contract Long\//.test(l));
  const end = lines.findIndex(l => l.startsWith("Grand Total"));
  if (start < 0 || end <= start) throw new Error("ไม่พบตารางรายการซื้อขายที่ครบถ้วน");
  const executions: { symbol: string; side: "LONG" | "SHORT"; status: string; qty: number; price: number; fee: number; used: number }[] = [];
  const contractIds = new Set<string>();
  for (const line of lines.slice(start + 1, end)) {
    if (/^(Code |Total |[-= ]+$)/.test(line)) continue;
    const match = line.match(/^(\S+) ([A-Z]{2}-\d{8}-\d+) ([LS]) (Open|Close) (.+)$/);
    if (!match) throw new Error("มีแถวซื้อขายที่อ่านไม่ได้ จึงยังไม่นำเข้าทั้งไฟล์");
    const [, symbol, contract, direction, status, rest] = match;
    if (!instrument(symbol)) throw new Error(`ยังไม่รองรับสัญญา ${symbol} รองรับเฉพาะ SET50 Index Futures และ USD Futures`);
    if (contractIds.has(contract) || contract.slice(3,11)!==stamp) throw new Error("เลขรายการซื้อขายซ้ำหรือวันที่ไม่ตรงกับเอกสาร");
    const side=direction === "L" ? "LONG" : "SHORT";
    if(contract.slice(0,2)!==expectedContractPrefix(side,status))throw new Error("รหัสรายการไม่สอดคล้องกับฝั่งและสถานะเปิด–ปิด");
    contractIds.add(contract);
    const values = amounts(rest);
    if (values.length !== 7) throw new Error("จำนวนคอลัมน์ซื้อขายไม่ตรงกับรูปแบบ Pi");
    const [qty, price, settlement, commission, vat, withholding, charge] = values;
    if (!Number.isInteger(qty) || qty <= 0 || price <= 0 || settlement !== 0 || commission < 0 || vat < 0 || withholding !== 0 || !equal(charge, commission + vat)) throw new Error("จำนวนสัญญาหรือยอดค่าธรรมเนียมไม่ตรงกัน หรือมีรายการชำระราคาที่ยังไม่รองรับ");
    executions.push({symbol, side, status, qty, price, fee: charge, used: 0});
  }
  if (!executions.length) throw new Error("ไม่พบรายการเทรดในไฟล์");
  const total = amounts(lines[end].replace("Grand Total", ""));
  const fees = executions.reduce((sum, e) => sum + e.fee, 0);
  if (total.length !== 5 || total[0] !== 0 || total[3] !== 0 || !equalTotal(total[4], fees, executions.length) || !equalTotal(total[1] + total[2], fees, executions.length)) throw new Error("ยอดรวมค่าธรรมเนียมใน PDF ไม่ตรงกับรายการ");
  const rows: PiTfexRow[] = [];
  const closingStart = lines.indexOf("POSITION CLOSING");
  let gross = 0;
  if (closingStart >= 0) {
    const closingEnd=lines.findIndex((line,index)=>index>closingStart&&(line.startsWith("OUTSTANDING POSITION")||line==="STATEMENT OF ACCOUNT"));
    const section = lines.slice(closingStart + 1, closingEnd);
    const positions = section.filter(l => /^\d{2}\//.test(l));
    type Pending={symbol:string;side:"LONG"|"SHORT";qty:number;entry:number;opened:string;spec:{name:string;multiplier:number}};
    let pending:Pending[]=[];
    let closedGroups=0;
    for (const line of positions) {
      const closing=line.match(/^(\d{2}\/\d{2}\/\d{4}) (\S+) C (.+)$/);
      if(!closing){
        const opening=line.match(/^(\d{2}\/\d{2}\/\d{4}) (\S+) (.+)$/);
        if(!opening)throw new Error("อ่านสถานะเปิดในตารางปิดไม่ได้");
        const values=amounts(opening[3]);
        if(values.length!==4)throw new Error("ข้อมูลสถานะเปิดในตารางปิดไม่ครบ");
        const [long,short,entry,qty]=values;
        const side:Pending["side"]|null=long>0&&short===0?"LONG":short>0&&long===0?"SHORT":null;
        const spec=instrument(opening[2]);
        if(!side||!spec||!Number.isInteger(qty)||qty<=0||entry<=0||(side==="LONG"?long:short)<qty)throw new Error("ฝั่งหรือจำนวนสัญญาสถานะเปิดไม่ถูกต้อง");
        pending.push({symbol:opening[2],side,qty,entry,opened:date(opening[1]),spec});
        continue;
      }
      if(!pending.length)throw new Error("พบสถานะปิดที่ไม่มีสถานะเปิดนำหน้า");
      const values=amounts(closing[3]);
      if((values.length!==5&&values.length!==6)||(values.length===6&&values[5]!==0))throw new Error("ข้อมูลสถานะปิดไม่ครบหรือมี Options");
      const [closeLong,closeShort,exit,closeQty,pnl]=values;
      const symbol=closing[2],side=pending[0].side,closed=date(closing[1]);
      const totalQty=pending.reduce((sum,row)=>sum+row.qty,0);
      if(pending.some(row=>row.symbol!==symbol||row.side!==side)||closeQty!==totalQty||!Number.isInteger(closeQty)||closeQty<=0||exit<=0||(side==="LONG"?(closeLong!==0||closeShort!==closeQty):(closeLong!==closeQty||closeShort!==0)))throw new Error("ฝั่งหรือจำนวนสัญญาเปิด–ปิดไม่สอดคล้องกัน");
      const calculated=pending.reduce((sum,row)=>sum+Math.round((exit-row.entry)*(side==="LONG"?1:-1)*row.qty*row.spec.multiplier*100)/100,0);
      if(closed!==tradingDate||pending.some(row=>row.opened>closed)||!equal(calculated,pnl))throw new Error(`วันที่หรือกำไรใน PDF ไม่ตรงกับการคำนวณ ${pending[0].spec.name} (${pending[0].spec.multiplier.toLocaleString("en-US")} บาท/จุด)`);
      for(const opening of pending){
        let remaining=opening.qty,fee=0;
        for(const execution of executions){
          if(execution.status!=="Close"||execution.symbol!==symbol||execution.side===side||execution.price!==exit)continue;
          const take=Math.min(remaining,execution.qty-execution.used);
          const before=Math.round(execution.fee*100*execution.used/execution.qty);
          execution.used+=take;
          fee+=(Math.round(execution.fee*100*execution.used/execution.qty)-before)/100;
          remaining-=take;
        }
        if(remaining)throw new Error("จำนวนสถานะปิดไม่ตรงกับตารางซื้อขาย");
        const rowGross=Math.round((exit-opening.entry)*(side==="LONG"?1:-1)*opening.qty*opening.spec.multiplier*100)/100;
        rows.push({symbol,side,qty:opening.qty,entry:opening.entry,exit,date:opening.opened,closeDate:closed,multiplier:opening.spec.multiplier,fee,gross:rowGross});
      }
      gross+=pnl;closedGroups++;pending=[];
    }
    if(pending.length)throw new Error("พบสถานะเปิดในตารางปิดที่ไม่มีรายการปิดตามมา");
    const closingTotal = section.find(l => l.startsWith("Total "));
    if (positions.length) {
      const totals = closingTotal ? amounts(closingTotal.replace("Total", "")) : [];
      if (totals.length !== 2 || !equalTotal(totals[0], gross, closedGroups) || totals[1] !== 0) throw new Error("ยอดกำไรรวมของสถานะปิดไม่ตรงกัน");
    }
  }
  for (const e of executions) {
    if (e.status === "Close" && e.used !== e.qty) throw new Error("ไม่มีข้อมูลต้นทุนเปิดครบสำหรับรายการปิดในไฟล์");
    if (e.status === "Open") rows.unshift({symbol:e.symbol, side:e.side, qty:e.qty, entry:e.price, exit:null, date:tradingDate, closeDate:null, multiplier:instrument(e.symbol)!.multiplier, fee:e.fee, gross:null});
  }
  const key = await fingerprint(documentNo[0], salt);
  return {key, date:tradingDate, rows, fees, gross};
}
