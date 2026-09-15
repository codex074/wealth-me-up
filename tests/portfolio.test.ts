import test from 'node:test';
import assert from 'node:assert/strict';
import {availableTfexPeriods,blankPortfolio,summarize,tfexPnl,tfexPnlSeries,validatePortfolio,type Portfolio} from '../lib/portfolio.ts';
// Synthetic fixture (formerly the app's sample portfolio); never shipped to users.
const demoPortfolio:Portfolio={fx:35,platforms:[{id:"dime",name:"Dime!",kind:"แอปลงทุน",notes:""},{id:"innovest",name:"InnovestX",kind:"โบรกเกอร์",notes:""},{id:"kplus",name:"K PLUS",kind:"ธนาคาร",notes:""}],accounts:[{id:"kbank",name:"บัญชีออมทรัพย์กสิกร",bank:"กสิกรไทย",number:"xxx-x-xx458-2",currency:"THB",opening:325000,notes:"ตัวอย่าง"},{id:"scb",name:"บัญชีลงทุนไทย",bank:"ไทยพาณิชย์",number:"xxx-xxx-7291",currency:"THB",opening:247000,notes:"ตัวอย่าง"},{id:"usd",name:"Dime! USD",bank:"Dime!",number:"DEMO-USD",currency:"USD",opening:12500,notes:"ตัวอย่าง"}],trades:[{id:"d1",symbol:"AAPL",name:"Apple Inc.",type:"หุ้นสหรัฐฯ",platform:"dime",account:"usd",currency:"USD",side:"BUY",qty:20,price:185.5,fee:1,date:"2026-08-01",notes:""},{id:"d2",symbol:"NVDA",name:"NVIDIA Corporation",type:"หุ้นสหรัฐฯ",platform:"dime",account:"usd",currency:"USD",side:"BUY",qty:35,price:108.2,fee:1,date:"2026-08-12",notes:""},{id:"d3",symbol:"ADVANC",name:"แอดวานซ์ อินโฟร์ เซอร์วิส",type:"หุ้นไทย",platform:"innovest",account:"scb",currency:"THB",side:"BUY",qty:600,price:245,fee:100,date:"2026-08-18",notes:""},{id:"d4",symbol:"K-USXNDQ",name:"กองทุนเปิดเค ยูเอส หุ้นทุน",type:"กองทุน",platform:"kplus",account:"kbank",currency:"THB",side:"BUY",qty:4200,price:12.8,fee:0,date:"2026-08-25",notes:""}],tfex:[{id:"f1",symbol:"S50U26",platform:"innovest",side:"LONG",qty:2,entry:842.5,exit:855,multiplier:200,fee:140,date:"2026-08-26",closeDate:"2026-08-27",notes:"ตัวอย่าง · ทำตามแผน"},{id:"f2",symbol:"S50U26",platform:"innovest",side:"SHORT",qty:1,entry:860,exit:868,multiplier:200,fee:70,date:"2026-08-28",closeDate:"2026-08-28",notes:"ตัวอย่าง · ตัดขาดทุน"},{id:"f3",symbol:"S50U26",platform:"innovest",side:"LONG",qty:1,entry:850,exit:872,multiplier:200,fee:70,date:"2026-08-29",closeDate:"2026-08-30",notes:"ตัวอย่าง"}],cash:[],quotes:{"AAPL|USD|dime":224.5,"NVDA|USD|dime":131.88,"ADVANC|THB|innovest":284,"K-USXNDQ|THB|kplus":14.36}};

test('THB and USD portfolio reconciles investments, fees, and cash',()=>{const d=validatePortfolio(demoPortfolio),s=summarize(d);assert.equal(s.balances.get('usd'),5001);assert.equal(s.balances.get('kbank'),271240);assert.equal(s.balances.get('scb'),99900);assert.equal(s.total,s.cash+s.invested);assert.equal(s.pnl,7520);});
test('partial sale uses weighted cost and settles net proceeds',()=>{const d=structuredClone(demoPortfolio);d.trades.push({...d.trades[0],id:'sell',side:'SELL',qty:5,price:230,fee:2,date:'2026-09-01'});const s=summarize(validatePortfolio(d));assert.equal(s.balances.get('usd'),6149);assert.equal(s.assets.find(a=>a.symbol==='AAPL')!.qty,15);assert.ok(Math.abs(s.realizedTHB-(1150-2-927.75)*35)<.00001);});
test('rejects overselling including backdated and edited trades',()=>{const d=structuredClone(demoPortfolio);d.trades.push({...d.trades[0],id:'sell',side:'SELL',qty:21,date:'2026-09-01'});assert.throws(()=>validatePortfolio(d),/มากกว่าจำนวน/);d.trades[4].qty=1;d.trades[4].date='2026-07-01';assert.throws(()=>validatePortfolio(d),/มากกว่าจำนวน/);});
test('rejects currency mismatch and insufficient cash',()=>{const d=structuredClone(demoPortfolio);d.trades[0].currency='THB';assert.throws(()=>validatePortfolio(d),/สกุลเงิน/);d.trades[0].currency='USD';d.accounts[2].opening=1;assert.throws(()=>validatePortfolio(d),/ไม่เพียงพอ/);});
test('TFEX long, short, open, and zero-profit calculations',()=>{const t=demoPortfolio.tfex[0];assert.equal(tfexPnl(t),4860);assert.equal(tfexPnl({...t,side:'SHORT'}),-5140);assert.equal(tfexPnl({...t,exit:null,closeDate:null}),null);assert.equal(tfexPnl({...t,exit:t.entry,fee:0}),0);});
test('rejects invalid TFEX closure and fractional contracts',()=>{const d=structuredClone(demoPortfolio);d.tfex[0].closeDate='2026-07-01';assert.throws(()=>validatePortfolio(d));d.tfex[0].closeDate='2026-08-27';d.tfex[0].qty=1.5;assert.throws(()=>validatePortfolio(d));});
test('cash entries and FX affect the correct balances without changing native holdings',()=>{const d=structuredClone(demoPortfolio);d.cash.push({id:'deposit',account:'usd',side:'DEPOSIT',amount:100,date:'2026-09-01',notes:''});const before=summarize(d);d.fx=40;const after=summarize(validatePortfolio(d));assert.equal(after.balances.get('usd'),5101);assert.deepEqual(before.assets,after.assets);assert.ok(after.total>before.total);});
test('empty portfolios and foreign references are handled',()=>{assert.equal(summarize(blankPortfolio()).total,0);const d=structuredClone(demoPortfolio);d.platforms=[];assert.throws(()=>validatePortfolio(d),/ไม่พบ/);});

test('tfexPnlSeries "all" scope sums closed trades ascending by close date, starting from the first trade\'s own pnl',()=>{
 const series=tfexPnlSeries(demoPortfolio,{kind:'all'});
 assert.deepEqual(series,[{date:'2026-08-27',cumulative:4860},{date:'2026-08-28',cumulative:3190},{date:'2026-08-30',cumulative:7520}]);
});
test('tfexPnlSeries collapses same-day closes into one point',()=>{
 const d=structuredClone(demoPortfolio);
 d.tfex.push({id:'f4',symbol:'S50U26',platform:'innovest',side:'LONG',qty:1,entry:800,exit:810,multiplier:200,fee:10,date:'2026-08-28',closeDate:'2026-08-28',notes:''});
 d.tfex.push({id:'f5',symbol:'S50U26',platform:'innovest',side:'SHORT',qty:1,entry:900,exit:890,multiplier:200,fee:5,date:'2026-08-28',closeDate:'2026-08-28',notes:''});
 const series=tfexPnlSeries(d,{kind:'all'});
 assert.equal(series.length,3);
 assert.deepEqual(series,[{date:'2026-08-27',cumulative:4860},{date:'2026-08-28',cumulative:7175},{date:'2026-08-30',cumulative:11505}]);
});
test('tfexPnlSeries returns empty for a scope with no closed trades',()=>{
 const d=structuredClone(demoPortfolio);d.tfex=d.tfex.map(t=>({...t,exit:null,closeDate:null}));
 assert.deepEqual(tfexPnlSeries(d,{kind:'all'}),[]);
 assert.deepEqual(tfexPnlSeries(demoPortfolio,{kind:'year',year:2020}),[]);
});
test('tfexPnlSeries year scope anchors at Jan 1 and restarts the running total from 0',()=>{
 const series=tfexPnlSeries(demoPortfolio,{kind:'year',year:2026});
 assert.deepEqual(series,[{date:'2026-01-01',cumulative:0},{date:'2026-08-27',cumulative:4860},{date:'2026-08-28',cumulative:3190},{date:'2026-08-30',cumulative:7520}]);
});
test('tfexPnlSeries quarter scope partitions strictly at the boundary and omits the anchor when a close lands exactly on the quarter start',()=>{
 const d:Portfolio={...blankPortfolio(),tfex:[
  {id:'q2',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:700,exit:720,multiplier:200,fee:0,date:'2026-06-25',closeDate:'2026-06-30',notes:''},
  {id:'q3',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:500,exit:510,multiplier:200,fee:0,date:'2026-07-01',closeDate:'2026-07-01',notes:''},
 ]};
 assert.deepEqual(tfexPnlSeries(d,{kind:'quarter',year:2026,quarter:2}),[{date:'2026-04-01',cumulative:0},{date:'2026-06-30',cumulative:4000}]);
 assert.deepEqual(tfexPnlSeries(d,{kind:'quarter',year:2026,quarter:3}),[{date:'2026-07-01',cumulative:2000}]);
});
test('tfexPnlSeries year scope buckets by close date, not open date, across a year rollover',()=>{
 const d:Portfolio={...blankPortfolio(),tfex:[{id:'r1',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:100,exit:110,multiplier:200,fee:0,date:'2025-12-28',closeDate:'2026-01-03',notes:''}]};
 assert.deepEqual(tfexPnlSeries(d,{kind:'year',year:2026}),[{date:'2026-01-01',cumulative:0},{date:'2026-01-03',cumulative:2000}]);
 assert.deepEqual(tfexPnlSeries(d,{kind:'year',year:2025}),[]);
});
test('tfexPnlSeries running total can dip negative then recover, without clamping',()=>{
 const d:Portfolio={...blankPortfolio(),tfex:[
  {id:'m1',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:100,exit:90,multiplier:200,fee:0,date:'2026-02-01',closeDate:'2026-02-05',notes:''},
  {id:'m2',symbol:'S50U26',platform:'pi',side:'SHORT',qty:1,entry:100,exit:102.5,multiplier:200,fee:0,date:'2026-02-01',closeDate:'2026-02-05',notes:''},
  {id:'m3',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:100,exit:120,multiplier:200,fee:0,date:'2026-02-06',closeDate:'2026-02-10',notes:''},
  {id:'m4',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:100,exit:104,multiplier:200,fee:0,date:'2026-02-11',closeDate:'2026-02-15',notes:''},
 ]};
 assert.deepEqual(tfexPnlSeries(d,{kind:'all'}),[{date:'2026-02-05',cumulative:-2500},{date:'2026-02-10',cumulative:1500},{date:'2026-02-15',cumulative:2300}]);
});
test('availableTfexPeriods lists only years/quarters that have a closed trade, most recent first',()=>{
 assert.deepEqual(availableTfexPeriods(demoPortfolio),{years:[2026],quarters:[{year:2026,quarter:3}]});
 const spread:Portfolio={...blankPortfolio(),tfex:[
  {id:'p1',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:1,exit:2,multiplier:200,fee:0,date:'2024-01-15',closeDate:'2024-02-01',notes:''},
  {id:'p2',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:1,exit:2,multiplier:200,fee:0,date:'2025-10-15',closeDate:'2025-11-01',notes:''},
  {id:'p3',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:1,exit:2,multiplier:200,fee:0,date:'2026-07-15',closeDate:'2026-08-01',notes:''},
 ]};
 assert.deepEqual(availableTfexPeriods(spread),{years:[2026,2025,2024],quarters:[{year:2026,quarter:3},{year:2025,quarter:4},{year:2024,quarter:1}]});
});
test('availableTfexPeriods dedupes a quarter shared by trades closing in different months, and returns empty lists otherwise',()=>{
 const d:Portfolio={...blankPortfolio(),tfex:[
  {id:'j1',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:1,exit:2,multiplier:200,fee:0,date:'2026-01-10',closeDate:'2026-01-15',notes:''},
  {id:'j2',symbol:'S50U26',platform:'pi',side:'LONG',qty:1,entry:1,exit:2,multiplier:200,fee:0,date:'2026-03-15',closeDate:'2026-03-20',notes:''},
 ]};
 assert.deepEqual(availableTfexPeriods(d),{years:[2026],quarters:[{year:2026,quarter:1}]});
 assert.deepEqual(availableTfexPeriods(blankPortfolio()),{years:[],quarters:[]});
 const allOpen=structuredClone(demoPortfolio);allOpen.tfex=allOpen.tfex.map(t=>({...t,exit:null,closeDate:null}));
 assert.deepEqual(availableTfexPeriods(allOpen),{years:[],quarters:[]});
});
