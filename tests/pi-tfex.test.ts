import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePiTfex} from '../lib/pi-tfex.ts';
import {blankPortfolio,prepareTfexImport,summarize,validatePortfolio} from '../lib/portfolio.ts';
// Synthetic statement; no customer identifiers or real trade records.
const statement=`Pi Securities Public Company Limited
Confirmation Note / Tax Invoice / Settlement Statement
DN-20260109-99999
Instrument Contract Long/ No. of Cost Premium/Settlement Commission and Charge
Code No. Short Status Contract Price Amount Fees* VAT W/H Amount
----------------
S50H26 BH-20260109-90001 L Close 2 905.00 0.00 40.00 2.80 0.00 42.80
------ ------ ---- ---- -----
Total 0.00 40.00 2.80 0.00 42.80
====== ====== ==== ==== =====
Grand Total 0.00 40.00 2.80 0.00 42.80
POSITION CLOSING
Trade Date Code Status Long Short Cost Price Contract Futures Options
02/01/2026 S50H26 0 2 900.00 2
09/01/2026 S50H26 C 2 0 905.00 2 -2,000.00
Total -2,000.00 0.00
STATEMENT OF ACCOUNT`;
const portfolio=()=>({...blankPortfolio(),platforms:[{id:'pi',name:'Pi test',kind:'โบรกเกอร์' as const,notes:''}]});
// Same trading date open + close (day trade): the execution table has both an Open and a Close row for one round trip.
const sameDayRoundTrip=`Pi Securities Public Company Limited
Confirmation Note / Tax Invoice / Settlement Statement
DN-20260109-99999
Instrument Contract Long/ No. of Cost Premium/Settlement Commission and Charge
Code No. Short Status Contract Price Amount Fees* VAT W/H Amount
----------------
S50H26 BH-20260109-90001 S Open 2 900.00 0.00 40.00 2.80 0.00 42.80
S50H26 BH-20260109-90002 L Close 2 905.00 0.00 40.00 2.80 0.00 42.80
------ ------ ---- ---- -----
Total 0.00 80.00 5.60 0.00 85.60
====== ====== ==== ==== =====
Grand Total 0.00 80.00 5.60 0.00 85.60
POSITION CLOSING
Trade Date Code Status Long Short Cost Price Contract Futures Options
09/01/2026 S50H26 0 2 900.00 2
09/01/2026 S50H26 C 2 0 905.00 2 -2,000.00
Total -2,000.00 0.00
STATEMENT OF ACCOUNT`;
test('Pi buy-to-close means SHORT; checks gross, VAT, dates and whole contracts',async()=>{
 const s=await parsePiTfex(statement);assert.equal(s.rows.length,1);assert.deepEqual(s.rows[0],{symbol:'S50H26',side:'SHORT',qty:2,entry:900,exit:905,date:'2026-01-02',closeDate:'2026-01-09',multiplier:200,fee:42.8,gross:-2000});assert.equal(s.fees,42.8);assert.equal(s.gross,-2000);
});
test('fails the whole file for unsupported contracts, missing rows, corrupt totals or dates',async()=>{
 for(const input of [statement.replaceAll('S50H26','GOG26'),statement.replace('L Close','X Close'),statement.replace('-2,000.00','-1,000.00'),statement.replace('Grand Total 0.00 40.00 2.80 0.00 42.80','Grand Total 0.00 40.00 2.80 0.00 43.80'),statement.replace('02/01/2026','32/01/2026'),statement.replace('09/01/2026 S50H26 C 2 0 905.00 2 -2,000.00',''),statement.replace('2 905.00','1.5 905.00')])await assert.rejects(()=>parsePiTfex(input));
});
test('LONG, break-even and open-only statements',async()=>{
 const long=await parsePiTfex(statement.replace('L Close','S Close').replace('0 2 900.00','2 0 900.00').replace('C 2 0 905.00','C 0 2 905.00').replaceAll('-2,000.00','2,000.00'));assert.equal(long.rows[0].side,'LONG');assert.equal(long.gross,2000);
 const even=await parsePiTfex(statement.replace('900.00','905.00').replaceAll('-2,000.00','0.00'));assert.equal(even.gross,0);
 const open=await parsePiTfex(statement.replace('L Close','S Open').replace(/POSITION CLOSING[\s\S]*STATEMENT OF ACCOUNT/,'STATEMENT OF ACCOUNT'));assert.equal(open.rows[0].exit,null);assert.equal(open.rows[0].side,'SHORT');assert.equal(open.gross,0);
});
test('requires explicit opening fees, preserves cash, and prevents duplicate import after reload',async()=>{
 const s=await parsePiTfex(statement),data=portfolio();assert.equal(prepareTfexImport(data,s,'pi').needsFees,true);
 const preview=prepareTfexImport(data,s,'pi',{0:'31.10'});assert.equal(preview.needsFees,false);assert.equal(preview.data.tfex[0].fee,73.9);assert.equal(summarize(preview.data).pnl,-2073.9);assert.equal(summarize(preview.data).cash,0);assert.equal(data.tfex.length,0);
 const reloaded=validatePortfolio(JSON.parse(JSON.stringify(preview.data)));assert.throws(()=>prepareTfexImport(reloaded,s,'pi'),/บันทึกแล้ว/);
 const renamed=await parsePiTfex(statement.replaceAll(' ','  '));assert.equal(renamed.key,s.key);
 assert.equal(prepareTfexImport(data,s,'pi',{0:'0'}).needsFees,false);
 assert.throws(()=>prepareTfexImport(data,s,'pi',{0:'-1'}),/ค่าธรรมเนียม/);
});
test('partial close allocates existing opening fees and retains the remainder and notes',async()=>{
 const s=await parsePiTfex(statement),data=portfolio();data.tfex.push({id:'existing',platform:'pi',symbol:'S50H26',side:'SHORT',qty:3,entry:900,exit:null,date:'2026-01-02',closeDate:null,multiplier:200,fee:60,notes:'แผนเดิม'});
 const result=prepareTfexImport(data,s,'pi');assert.equal(result.needsFees,false);assert.equal(result.rows[0].matched,true);assert.equal(result.rows[0].trade.fee,82.8);assert.equal(result.rows[0].trade.notes,'แผนเดิม');assert.equal(result.data.tfex[0].qty,1);assert.equal(result.data.tfex[0].fee,20);assert.equal(data.tfex[0].qty,3);
});
test('does not guess ambiguous lots, over-close or duplicate manual closes',async()=>{
 const s=await parsePiTfex(statement),data=portfolio();const closed=prepareTfexImport(data,s,'pi',{0:'0'}).data.tfex[0];data.tfex=[closed];assert.throws(()=>prepareTfexImport(data,s,'pi'),/อาจซ้ำ/);
 data.tfex=[{...closed,exit:null,closeDate:null,qty:1}];assert.throws(()=>prepareTfexImport(data,s,'pi'),/จำนวน/);
 data.tfex.push({...data.tfex[0],id:'second'});assert.throws(()=>prepareTfexImport(data,s,'pi'),/หลายรายการ/);
});
test('an open lot with a mismatched date or entry blocks the close instead of leaving it stale',async()=>{
 const s=await parsePiTfex(statement),data=portfolio();
 data.tfex.push({id:'existing',platform:'pi',symbol:'S50H26',side:'SHORT',qty:2,entry:900,exit:null,date:'2026-01-03',closeDate:null,multiplier:200,fee:0,notes:''});
 assert.throws(()=>prepareTfexImport(data,s,'pi'),/วันที่\/ราคาเปิดไม่ตรงกับเอกสาร/);
});
test('a genuinely new position with no open lot of that symbol\/side still takes the opening-fee path',async()=>{
 const s=await parsePiTfex(statement),data=portfolio();
 assert.equal(prepareTfexImport(data,s,'pi').needsFees,true);
});
test('a same-day open+close pair leaves no phantom preview row and the saved count matches what is kept',async()=>{
 const s=await parsePiTfex(sameDayRoundTrip);assert.equal(s.rows.length,2);
 const result=prepareTfexImport(portfolio(),s,'pi',{});
 assert.equal(result.data.tfex.length,1);assert.equal(result.data.tfex[0].exit,905);
 assert.equal(result.savedCount,1);
 assert.equal(result.rows.filter(r=>!r.consumed).length,1);
});
test('deleting every trade an import produced allows the same document to be re-imported',async()=>{
 const s=await parsePiTfex(statement);
 const imported=prepareTfexImport(portfolio(),s,'pi',{0:'0'}).data;
 assert.throws(()=>prepareTfexImport(imported,s,'pi',{0:'0'}),/บันทึกแล้ว/);
 const deleted={...imported,tfex:[]};
 const reimported=prepareTfexImport(deleted,s,'pi',{0:'0'});
 assert.equal(reimported.needsFees,false);assert.equal(reimported.data.tfex.length,1);
});
test('a legacy bare-string tfexImports entry still blocks re-import',async()=>{
 const s=await parsePiTfex(statement),data=portfolio();
 data.tfexImports=[s.key];
 assert.throws(()=>prepareTfexImport(data,s,'pi'),/บันทึกแล้ว/);
});
test('grand total tolerance scales with row count so VAT rounding across many rows is accepted, larger drift is not',async()=>{
 const rows=Array.from({length:8},(_,i)=>`S50H26 BH-20260109-9000${i+1} L Open 1 905.00 0.00 5.00 0.35 0.00 5.35`).join('\n');
 const build=(grand:string)=>`Pi Securities Public Company Limited
Confirmation Note / Tax Invoice / Settlement Statement
DN-20260109-99999
Instrument Contract Long/ No. of Cost Premium/Settlement Commission and Charge
Code No. Short Status Contract Price Amount Fees* VAT W/H Amount
----------------
${rows}
------ ------ ---- ---- -----
Total 0.00 40.00 2.80 0.00 42.80
====== ====== ==== ==== =====
Grand Total 0.00 40.00 2.80 0.00 ${grand}
STATEMENT OF ACCOUNT`;
 const accepted=await parsePiTfex(build('42.82'));assert.equal(accepted.rows.length,8);assert.ok(Math.abs(accepted.fees-42.8)<1e-8);
 await assert.rejects(()=>parsePiTfex(build('43.80')));
});
test('old payloads remain compatible; import can atomically create a broker',async()=>{
 const data=blankPortfolio(),s=await parsePiTfex(statement);assert.equal(validatePortfolio(data).tfexImports,undefined);
 const next=prepareTfexImport(data,s,'__new_pi__',{0:'0'}).data;assert.equal(next.platforms.length,1);assert.equal(next.tfex[0].platform,next.platforms[0].id);assert.equal(data.platforms.length,0);
});
test('one execution can close multiple entry lots without duplicating its fee',async()=>{
 const input=statement.replace('02/01/2026 S50H26 0 2 900.00 2\n09/01/2026 S50H26 C 2 0 905.00 2 -2,000.00',`02/01/2026 S50H26 0 1 900.00 1
09/01/2026 S50H26 C 1 0 905.00 1 -1,000.00
05/01/2026 S50H26 0 1 910.00 1
09/01/2026 S50H26 C 1 0 905.00 1 1,000.00`).replace('Total -2,000.00 0.00','Total 0.00 0.00');
 const s=await parsePiTfex(input);assert.equal(s.rows.length,2);assert.equal(s.gross,0);assert.deepEqual(s.rows.map(r=>r.fee),[21.4,21.4]);
 const result=prepareTfexImport(portfolio(),s,'pi',{0:'10',1:'20'});assert.ok(Math.abs(summarize(result.data).pnl+72.8)<1e-8);
});
test('backdated opening import cannot recreate an already closed lot',async()=>{
 const s=await parsePiTfex(statement),data=prepareTfexImport(portfolio(),s,'pi',{0:'0'}).data;
 const backdated={...s,key:'f'.repeat(64),rows:[{...s.rows[0],exit:null,closeDate:null,gross:null}]};
 assert.throws(()=>prepareTfexImport(data,backdated,'pi'),/อาจซ้ำ/);
});
