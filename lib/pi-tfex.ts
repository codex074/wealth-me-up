/** Strict adapter for Pi's one-page S50 futures daily confirmation.
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
function date(value: string) {
  const [day, month, year] = value.split("/");
  const result = `${year}-${month}-${day}`;
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error("วันที่ใน PDF ไม่ถูกต้อง");
  return result;
}
export async function parsePiTfex(text: string): Promise<PiTfexStatement> {
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
    const match = line.match(/^(\S+) (BH-\d{8}-\d+) ([LS]) (Open|Close) (.+)$/);
    if (!match) throw new Error("มีแถวซื้อขายที่อ่านไม่ได้ จึงยังไม่นำเข้าทั้งไฟล์");
    const [, symbol, contract, direction, status, rest] = match;
    if (!/^S50[HMUZ]\d{2}$/.test(symbol)) throw new Error("รุ่นแรกนำเข้าได้เฉพาะ SET50 Index Futures (S50) ไม่รองรับ Options หรือสัญญาอื่น");
    if (contractIds.has(contract) || !contract.startsWith(`BH-${stamp}-`)) throw new Error("เลขรายการซื้อขายซ้ำหรือวันที่ไม่ตรงกับเอกสาร");
    contractIds.add(contract);
    const values = amounts(rest);
    if (values.length !== 7) throw new Error("จำนวนคอลัมน์ซื้อขายไม่ตรงกับรูปแบบ Pi");
    const [qty, price, settlement, commission, vat, withholding, charge] = values;
    if (!Number.isInteger(qty) || qty <= 0 || price <= 0 || settlement !== 0 || commission < 0 || vat < 0 || withholding !== 0 || !equal(charge, commission + vat)) throw new Error("จำนวนสัญญาหรือยอดค่าธรรมเนียมไม่ตรงกัน หรือมีรายการชำระราคาที่ยังไม่รองรับ");
    executions.push({symbol, side: direction === "L" ? "LONG" : "SHORT", status, qty, price, fee: charge, used: 0});
  }
  if (!executions.length) throw new Error("ไม่พบรายการเทรดในไฟล์");
  const total = amounts(lines[end].replace("Grand Total", ""));
  const fees = executions.reduce((sum, e) => sum + e.fee, 0);
  if (total.length !== 5 || total[0] !== 0 || total[3] !== 0 || !equalTotal(total[4], fees, executions.length) || !equalTotal(total[1] + total[2], fees, executions.length)) throw new Error("ยอดรวมค่าธรรมเนียมใน PDF ไม่ตรงกับรายการ");
  const rows: PiTfexRow[] = [];
  const closingStart = lines.indexOf("POSITION CLOSING");
  const closingEnd = lines.indexOf("STATEMENT OF ACCOUNT");
  let gross = 0;
  if (closingStart >= 0) {
    const section = lines.slice(closingStart + 1, closingEnd);
    const positions = section.filter(l => /^\d{2}\//.test(l));
    if (positions.length % 2) throw new Error("คู่เปิด–ปิดใน PDF ไม่ครบ");
    for (let index = 0; index < positions.length; index += 2) {
      const opening = positions[index].match(/^(\d{2}\/\d{2}\/\d{4}) (\S+) (.+)$/);
      const closing = positions[index + 1].match(/^(\d{2}\/\d{2}\/\d{4}) (\S+) C (.+)$/);
      if (!opening || !closing || opening[2] !== closing[2]) throw new Error("จับคู่สถานะเปิด–ปิดไม่ได้");
      const a = amounts(opening[3]), b = amounts(closing[3]);
      if (a.length !== 4 || (b.length !== 5 && b.length !== 6) || (b.length === 6 && b[5] !== 0)) throw new Error("ข้อมูลสถานะปิดไม่ครบหรือมี Options");
      const [long, short, entry, qty] = a;
      const [closeLong, closeShort, exit, closeQty, pnl] = b;
      const side = long > 0 && short === 0 ? "LONG" : short > 0 && long === 0 ? "SHORT" : null;
      if (!side || qty !== closeQty || !Number.isInteger(qty) || qty <= 0 || long + short !== qty || closeLong !== short || closeShort !== long || entry <= 0 || exit <= 0) throw new Error("ฝั่งหรือจำนวนสัญญาเปิด–ปิดไม่สอดคล้องกัน");
      const opened = date(opening[1]), closed = date(closing[1]);
      if (closed !== tradingDate || opened > closed || !equal((exit - entry) * (side === "LONG" ? 1 : -1) * qty * 200, pnl)) throw new Error("วันที่หรือกำไรใน PDF ไม่ตรงกับการคำนวณ S50 (200 บาท/จุด)");
      let remaining = qty, fee = 0;
      for (const execution of executions) {
        if (execution.status !== "Close" || execution.symbol !== opening[2] || execution.side === side || execution.price !== exit) continue;
        const take = Math.min(remaining, execution.qty - execution.used);
        // Allocate in satang; the final portion receives the remainder.
        const before = Math.round(execution.fee * 100 * execution.used / execution.qty);
        execution.used += take;
        fee += (Math.round(execution.fee * 100 * execution.used / execution.qty) - before) / 100;
        remaining -= take;
      }
      if (remaining) throw new Error("จำนวนสถานะปิดไม่ตรงกับตารางซื้อขาย");
      rows.push({symbol: opening[2], side, qty, entry, exit, date: opened, closeDate: closed, multiplier: 200, fee, gross: pnl});
      gross += pnl;
    }
    const closingTotal = section.find(l => l.startsWith("Total "));
    if (positions.length) {
      const totals = closingTotal ? amounts(closingTotal.replace("Total", "")) : [];
      if (totals.length !== 2 || !equalTotal(totals[0], gross, positions.length / 2) || totals[1] !== 0) throw new Error("ยอดกำไรรวมของสถานะปิดไม่ตรงกัน");
    }
  }
  for (const e of executions) {
    if (e.status === "Close" && e.used !== e.qty) throw new Error("ไม่มีข้อมูลต้นทุนเปิดครบสำหรับรายการปิดในไฟล์");
    if (e.status === "Open") rows.unshift({symbol:e.symbol, side:e.side, qty:e.qty, entry:e.price, exit:null, date:tradingDate, closeDate:null, multiplier:200, fee:e.fee, gross:null});
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pi:${documentNo[0]}`));
  const key = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  return {key, date:tradingDate, rows, fees, gross};
}
