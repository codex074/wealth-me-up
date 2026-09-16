import {getConstituents} from "./constituents";
import {findMarketConfig} from "./markets";
import {fetchSet100Constituents} from "./set-source";
import type {MarketViewMarket,MarketViewResponse,MarketViewSector,MarketViewStock} from "./types";
import {fetchYahooQuotes} from "./yahoo";

const CACHE_TTL_MS=10*60*1000;
const cache=new Map<MarketViewMarket,{payload:MarketViewResponse;at:number}>();

function groupBySector(stocks:(MarketViewStock&{sector:string})[]):MarketViewSector[]{
 const bySector=new Map<string,MarketViewStock[]>();
 for(const {sector,...stock} of stocks){
  const list=bySector.get(sector)??[];
  list.push(stock);
  bySector.set(sector,list);
 }
 return [...bySector.entries()]
  .map(([sector,stockList]):MarketViewSector=>({
   sector,
   stocks:stockList,
   totalMarketCap:stockList.reduce((sum,s)=>sum+s.marketCap,0)
  }))
  .sort((a,b)=>b.totalMarketCap-a.totalMarketCap);
}

async function buildFromYahoo(market:MarketViewMarket):Promise<MarketViewResponse>{
 const config=findMarketConfig(market);
 if(!config)throw new Error(`Unknown market: ${market}`);
 const constituents=getConstituents(market);
 const quotesBySymbol=await fetchYahooQuotes(constituents.map(c=>c.symbol));
 const stocks=constituents.flatMap(({name,sector,symbol}):(MarketViewStock&{sector:string})[]=>{
  const quote=quotesBySymbol[symbol];
  if(!quote)return [];
  return [{sector,symbol,name,price:quote.price,changePercent:quote.changePercent,marketCap:quote.marketCap,currency:quote.currency}];
 });
 return {market,sectors:groupBySector(stocks),updatedAt:new Date().toISOString()};
}

async function buildSet100Live():Promise<MarketViewResponse|null>{
 try{
  const constituents=await fetchSet100Constituents();
  if(constituents.length===0)return null;
  const stocks=constituents.map(c=>({
   sector:c.sector,
   // Normalize to the same Yahoo-style suffixed symbol the fallback path
   // uses, so the client can treat SET100 uniformly regardless of which
   // path served it (display stripping, logo lookups).
   symbol:c.symbol.includes(".")?c.symbol:`${c.symbol}.BK`,
   name:c.name,
   price:c.price??0,
   changePercent:c.changePercent??0,
   marketCap:c.marketCap??0,
   currency:"THB"
  }));
  return {market:"SET100",sectors:groupBySector(stocks),updatedAt:new Date().toISOString()};
 }catch(error){
  console.warn("Falling back to Yahoo for SET100 dashboard",error);
  return null;
 }
}

async function buildDashboard(market:MarketViewMarket):Promise<MarketViewResponse>{
 if(market==="SET100"){
  const live=await buildSet100Live();
  if(live)return live;
 }
 return buildFromYahoo(market);
}

export async function getMarketViewResponse(market:MarketViewMarket):Promise<MarketViewResponse>{
 const cached=cache.get(market);
 if(cached&&cached.at+CACHE_TTL_MS>Date.now())return cached.payload;
 const payload=await buildDashboard(market);
 if(payload.sectors.length>0)cache.set(market,{payload,at:Date.now()});
 return payload;
}
