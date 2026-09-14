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
// Owner email used to salt the fingerprint; synthetic, not a real account.
const SALT='owner@example.com';
// Same trading date open + close (day trade): the execution table has both an Open and a Close row for one round trip.
const sameDayRoundTrip=`Pi Securities Public Company Limited
Confirmation Note / Tax Invoice / Settlement Statement
DN-20260109-99999
Instrument Contract Long/ No. of Cost Premium/Settlement Commission and Charge
Code No. Short Status Contract Price Amount Fees* VAT W/H Amount
----------------
S50H26 SH-20260109-90001 S Open 2 900.00 0.00 40.00 2.80 0.00 42.80
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
 const s=await parsePiTfex(statement,SALT);assert.equal(s.rows.length,1);assert.deepEqual(s.rows[0],{symbol:'S50H26',side:'SHORT',qty:2,entry:900,exit:905,date:'2026-01-02',closeDate:'2026-01-09',multiplier:200,fee:42.8,gross:-2000});assert.equal(s.fees,42.8);assert.equal(s.gross,-2000);
});
test('fails the whole file for unsupported contracts, missing rows, corrupt totals or dates',async()=>{
 for(const input of [statement.replaceAll('S50H26','GOG26'),statement.replace('L Close','X Close'),statement.replace('-2,000.00','-1,000.00'),statement.replace('Grand Total 0.00 40.00 2.80 0.00 42.80','Grand Total 0.00 40.00 2.80 0.00 43.80'),statement.replace('02/01/2026','32/01/2026'),statement.replace('09/01/2026 S50H26 C 2 0 905.00 2 -2,000.00',''),statement.replace('2 905.00','1.5 905.00')])await assert.rejects(()=>parsePiTfex(input,SALT));
});
test('LONG, break-even and open-only statements',async()=>{
 const long=await parsePiTfex(statement.replace('BH-20260109-90001 L Close','SE-20260109-90001 S Close').replace('0 2 900.00','2 0 900.00').replace('C 2 0 905.00','C 0 2 905.00').replaceAll('-2,000.00','2,000.00'),SALT);assert.equal(long.rows[0].side,'LONG');assert.equal(long.gross,2000);
 const even=await parsePiTfex(statement.replace('900.00','905.00').replaceAll('-2,000.00','0.00'),SALT);assert.equal(even.gross,0);
 const open=await parsePiTfex(statement.replace('BH-20260109-90001 L Close','SH-20260109-90001 S Open').replace(/POSITION CLOSING[\s\S]*STATEMENT OF ACCOUNT/,'STATEMENT OF ACCOUNT'),SALT);assert.equal(open.rows[0].exit,null);assert.equal(open.rows[0].side,'SHORT');assert.equal(open.gross,0);
});
test('requires explicit opening fees, preserves cash, and prevents duplicate import after reload',async()=>{
 const s=await parsePiTfex(statement,SALT),data=portfolio();assert.equal(prepareTfexImport(data,s,'pi').needsFees,true);
 const preview=prepareTfexImport(data,s,'pi',{0:'31.10'});assert.equal(preview.needsFees,false);assert.equal(preview.data.tfex[0].fee,73.9);assert.equal(summarize(preview.data).pnl,-2073.9);assert.equal(summarize(preview.data).cash,0);assert.equal(data.tfex.length,0);
 const reloaded=validatePortfolio(JSON.parse(JSON.stringify(preview.data)));assert.throws(()=>prepareTfexImport(reloaded,s,'pi'),/บันทึกแล้ว/);
 const renamed=await parsePiTfex(statement.replaceAll(' ','  '),SALT);assert.equal(renamed.key,s.key);
 assert.equal(prepareTfexImport(data,s,'pi',{0:'0'}).needsFees,false);
 assert.throws(()=>prepareTfexImport(data,s,'pi',{0:'-1'}),/ค่าธรรมเนียม/);
});
test('partial close allocates existing opening fees and retains the remainder and notes',async()=>{
 const s=await parsePiTfex(statement,SALT),data=portfolio();data.tfex.push({id:'existing',platform:'pi',symbol:'S50H26',side:'SHORT',qty:3,entry:900,exit:null,date:'2026-01-02',closeDate:null,multiplier:200,fee:60,notes:'แผนเดิม'});
 const result=prepareTfexImport(data,s,'pi');assert.equal(result.needsFees,false);assert.equal(result.rows[0].matched,true);assert.equal(result.rows[0].trade.fee,82.8);assert.equal(result.rows[0].trade.notes,'แผนเดิม');assert.equal(result.data.tfex[0].qty,1);assert.equal(result.data.tfex[0].fee,20);assert.equal(data.tfex[0].qty,3);
});
test('rejects over-close and duplicate manual closes',async()=>{
 const s=await parsePiTfex(statement,SALT),data=portfolio();const closed=prepareTfexImport(data,s,'pi',{0:'0'}).data.tfex[0];data.tfex=[closed];assert.throws(()=>prepareTfexImport(data,s,'pi'),/อาจซ้ำ/);
 data.tfex=[{...closed,exit:null,closeDate:null,qty:1}];assert.throws(()=>prepareTfexImport(data,s,'pi'),/จำนวน/);
});
test('closes multiple identical opening lots FIFO and allocates their fees',async()=>{
 const s=await parsePiTfex(statement,SALT),data=portfolio();
 data.tfex=[
  {id:'first',platform:'pi',symbol:'S50H26',side:'SHORT',qty:1,entry:900,exit:null,date:'2026-01-02',closeDate:null,multiplier:200,fee:10,notes:'lot 1'},
  {id:'second',platform:'pi',symbol:'S50H26',side:'SHORT',qty:2,entry:900,exit:null,date:'2026-01-02',closeDate:null,multiplier:200,fee:30,notes:'lot 2'},
 ];
 const result=prepareTfexImport(data,s,'pi');
 assert.equal(result.needsFees,false);assert.equal(result.rows[0].openingFee,25);assert.equal(result.rows[0].trade.fee,67.8);assert.equal(result.rows[0].trade.notes,'lot 1\nlot 2');
 assert.deepEqual(result.data.tfex.filter(t=>t.exit===null).map(t=>({id:t.id,qty:t.qty,fee:t.fee})),[{id:'second',qty:1,fee:15}]);
});
test('an open lot with a mismatched date or entry blocks the close instead of leaving it stale',async()=>{
 const s=await parsePiTfex(statement,SALT),data=portfolio();
 data.tfex.push({id:'existing',platform:'pi',symbol:'S50H26',side:'SHORT',qty:2,entry:900,exit:null,date:'2026-01-03',closeDate:null,multiplier:200,fee:0,notes:''});
 assert.throws(()=>prepareTfexImport(data,s,'pi'),/วันที่\/ราคาเปิดไม่ตรงกับเอกสาร/);
});
test('a genuinely new position with no open lot of that symbol\/side still takes the opening-fee path',async()=>{
 const s=await parsePiTfex(statement,SALT),data=portfolio();
 assert.equal(prepareTfexImport(data,s,'pi').needsFees,true);
});
test('a same-day open+close pair leaves no phantom preview row and the saved count matches what is kept',async()=>{
 const s=await parsePiTfex(sameDayRoundTrip,SALT);assert.equal(s.rows.length,2);
 const result=prepareTfexImport(portfolio(),s,'pi',{});
 assert.equal(result.data.tfex.length,1);assert.equal(result.data.tfex[0].exit,905);
 assert.equal(result.savedCount,1);
 assert.equal(result.rows.filter(r=>!r.consumed).length,1);
});
test('deleting every trade an import produced allows the same document to be re-imported',async()=>{
 const s=await parsePiTfex(statement,SALT);
 const imported=prepareTfexImport(portfolio(),s,'pi',{0:'0'}).data;
 assert.throws(()=>prepareTfexImport(imported,s,'pi',{0:'0'}),/บันทึกแล้ว/);
 const deleted={...imported,tfex:[]};
 const reimported=prepareTfexImport(deleted,s,'pi',{0:'0'});
 assert.equal(reimported.needsFees,false);assert.equal(reimported.data.tfex.length,1);
});
test('a legacy bare-string tfexImports entry still blocks re-import',async()=>{
 const s=await parsePiTfex(statement,SALT),data=portfolio();
 data.tfexImports=[s.key];
 assert.throws(()=>prepareTfexImport(data,s,'pi'),/บันทึกแล้ว/);
});
test('grand total tolerance scales with row count so VAT rounding across many rows is accepted, larger drift is not',async()=>{
 const rows=Array.from({length:8},(_,i)=>`S50H26 BU-20260109-9000${i+1} L Open 1 905.00 0.00 5.00 0.35 0.00 5.35`).join('\n');
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
 const accepted=await parsePiTfex(build('42.82'),SALT);assert.equal(accepted.rows.length,8);assert.ok(Math.abs(accepted.fees-42.8)<1e-8);
 await assert.rejects(()=>parsePiTfex(build('43.80'),SALT));
});
test('the fingerprint is salted by the signed-in owner\'s email, case-insensitively',async()=>{
 const a=await parsePiTfex(statement,'owner@example.com');
 const b=await parsePiTfex(statement,'other-owner@example.com');
 assert.notEqual(a.key,b.key);
 const c=await parsePiTfex(statement,'OWNER@EXAMPLE.COM');
 assert.equal(a.key,c.key);
});
test('old payloads remain compatible; import can atomically create a broker',async()=>{
 const data=blankPortfolio(),s=await parsePiTfex(statement,SALT);assert.equal(validatePortfolio(data).tfexImports,undefined);
 const next=prepareTfexImport(data,s,'__new_pi__',{0:'0'}).data;assert.equal(next.platforms.length,1);assert.equal(next.tfex[0].platform,next.platforms[0].id);assert.equal(data.platforms.length,0);
});
test('one execution can close multiple entry lots without duplicating its fee',async()=>{
 const input=statement.replace('02/01/2026 S50H26 0 2 900.00 2\n09/01/2026 S50H26 C 2 0 905.00 2 -2,000.00',`02/01/2026 S50H26 0 1 900.00 1
09/01/2026 S50H26 C 1 0 905.00 1 -1,000.00
05/01/2026 S50H26 0 1 910.00 1
09/01/2026 S50H26 C 1 0 905.00 1 1,000.00`).replace('Total -2,000.00 0.00','Total 0.00 0.00');
 const s=await parsePiTfex(input,SALT);assert.equal(s.rows.length,2);assert.equal(s.gross,0);assert.deepEqual(s.rows.map(r=>r.fee),[21.4,21.4]);
 const result=prepareTfexImport(portfolio(),s,'pi',{0:'10',1:'20'});assert.ok(Math.abs(summarize(result.data).pnl+72.8)<1e-8);
});
test('backdated opening import cannot recreate an already closed lot',async()=>{
 const s=await parsePiTfex(statement,SALT),data=prepareTfexImport(portfolio(),s,'pi',{0:'0'}).data;
 const backdated={...s,key:'f'.repeat(64),rows:[{...s.rows[0],exit:null,closeDate:null,gross:null}]};
 assert.throws(()=>prepareTfexImport(data,backdated,'pi'),/อาจซ้ำ/);
});
test('USD Futures use the observed 1,000 THB point value and support BU/SE execution ids',async()=>{
 const usd=statement
  .replaceAll('S50H26','USDU26')
  .replace('BH-20260109-90001 L Close 2 905.00','SE-20260109-90001 S Close 5 34.96')
  .replace('0 2 900.00 2','5 0 34.75 5')
  .replace('C 2 0 905.00 2 -2,000.00','C 0 5 34.96 5 1,050.00')
  .replaceAll('-2,000.00','1,050.00');
 const parsed=await parsePiTfex(usd,SALT);
 assert.deepEqual(parsed.rows[0],{symbol:'USDU26',side:'LONG',qty:5,entry:34.75,exit:34.96,date:'2026-01-02',closeDate:'2026-01-09',multiplier:1000,fee:42.8,gross:1050});
 assert.ok(Math.abs(summarize(prepareTfexImport(portfolio(),parsed,'pi',{0:'0'}).data).pnl-1007.2)<1e-8);
 const open=await parsePiTfex(usd.replace('SE-20260109-90001 S Close 5 34.96','BU-20260109-90001 L Open 5 34.96').replace(/POSITION CLOSING[\s\S]*STATEMENT OF ACCOUNT/,'STATEMENT OF ACCOUNT'),SALT);
 assert.equal(open.rows[0].multiplier,1000);assert.equal(open.rows[0].side,'LONG');assert.equal(open.rows[0].exit,null);
});
test('rejects an execution id whose prefix contradicts its side or open/close status',async()=>{
 await assert.rejects(()=>parsePiTfex(statement.replace('BH-20260109-90001','BU-20260109-90001'),SALT),/รหัสรายการ/);
});
test('one closing execution can close several cost lots and outstanding rows are excluded',async()=>{
 const grouped=`Pi Securities Public Company Limited
Confirmation Note / Tax Invoice / Settlement Statement
DN-20260109-99999
Instrument Contract Long/ No. of Cost Premium/Settlement Commission and Charge
Code No. Short Status Contract Price Amount Fees* VAT W/H Amount
S50H26 SE-20260109-90001 S Close 2 895.00 0.00 40.00 2.80 0.00 42.80
Total 0.00 40.00 2.80 0.00 42.80
Grand Total 0.00 40.00 2.80 0.00 42.80
POSITION CLOSING
01/01/2026 S50H26 2 0 900.00 1
02/01/2026 S50H26 1 0 910.00 1
09/01/2026 S50H26 C 0 2 895.00 2 -4,000.00
Total -4,000.00 0.00
OUTSTANDING POSITION AS OF 09/01/2026
09/01/2026 S50H26 BU-20260109-99999 1 0 890.00 895.00 1,000.00 0.00 0.00
STATEMENT OF ACCOUNT`;
 const parsed=await parsePiTfex(grouped,SALT);
 assert.deepEqual(parsed.rows.map(row=>({entry:row.entry,qty:row.qty,gross:row.gross,fee:row.fee})),[
  {entry:900,qty:1,gross:-1000,fee:21.4},
  {entry:910,qty:1,gross:-3000,fee:21.4},
 ]);
 assert.equal(parsed.gross,-4000);
});
