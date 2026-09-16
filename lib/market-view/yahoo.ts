const BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const CRUMB_TTL_MS=55*60*1000;
const SYMBOLS_PER_BATCH=50;
const REQUEST_TIMEOUT_MS=10_000;

export interface YahooQuote{
 changePercent:number;
 currency:string;
 marketCap:number;
 price:number;
}

let crumbCache:{cookie:string;crumb:string;expiresAt:number}|null=null;

async function fetchCrumb():Promise<{cookie:string;crumb:string}>{
 if(crumbCache&&crumbCache.expiresAt>Date.now())return crumbCache;
 const cookieResponse=await fetch("https://fc.yahoo.com",{
  headers:{"user-agent":BROWSER_USER_AGENT},
  signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
 });
 const setCookies=cookieResponse.headers.getSetCookie?.()??[];
 const cookie=setCookies.map(c=>c.split(";")[0]).filter(Boolean).join("; ");
 if(!cookie)throw new Error("Yahoo did not return a session cookie.");
 const crumbResponse=await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb",{
  headers:{"user-agent":BROWSER_USER_AGENT,cookie},
  signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
 });
 const crumb=(await crumbResponse.text()).trim();
 if(!crumb||crumb.includes("<"))throw new Error("Yahoo did not return a crumb.");
 crumbCache={cookie,crumb,expiresAt:Date.now()+CRUMB_TTL_MS};
 return crumbCache;
}

interface YahooRawQuote{
 symbol?:string;
 regularMarketChangePercent?:number;
 regularMarketPrice?:number;
 marketCap?:number;
 currency?:string;
}

async function fetchQuoteBatch(symbols:string[],retried=false):Promise<YahooRawQuote[]>{
 const {cookie,crumb}=await fetchCrumb();
 const url=`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}&crumb=${encodeURIComponent(crumb)}`;
 const response=await fetch(url,{
  headers:{"user-agent":BROWSER_USER_AGENT,cookie},
  signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
 });
 const body=await response.json() as {quoteResponse?:{result?:YahooRawQuote[];error?:unknown}};
 if(body.quoteResponse?.error&&!retried){
  crumbCache=null;
  return fetchQuoteBatch(symbols,true);
 }
 return body.quoteResponse?.result??[];
}

export async function fetchYahooQuotes(symbols:string[]):Promise<Record<string,YahooQuote>>{
 const result:Record<string,YahooQuote>={};
 for(let i=0;i<symbols.length;i+=SYMBOLS_PER_BATCH){
  const batch=symbols.slice(i,i+SYMBOLS_PER_BATCH);
  try{
   const quotes=await fetchQuoteBatch(batch);
   for(const quote of quotes){
    if(!quote?.symbol)continue;
    result[quote.symbol]={
     changePercent:quote.regularMarketChangePercent??0,
     currency:quote.currency??"USD",
     marketCap:quote.marketCap??0,
     price:quote.regularMarketPrice??0
    };
   }
  }catch(error){
   console.error("Yahoo quote batch failed",error);
  }
 }
 return result;
}
