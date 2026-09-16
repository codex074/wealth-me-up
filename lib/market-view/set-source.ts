const BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const BOOTSTRAP_PAGE_URL="https://www.set.or.th/en/market/statistics/investor-type";
const COOKIE_TTL_MS=10*60*1000;
const REQUEST_TIMEOUT_MS=7_000;

// SET groups every listed company into eight industry groups; the composition
// payload carries the code, so map it to a readable label for the heatmap.
const INDUSTRY_LABEL_BY_CODE:Record<string,string>={
 AGRO:"Agro & Food Industry",
 CONSUMP:"Consumer Products",
 FINCIAL:"Financials",
 INDUS:"Industrials",
 PROPCON:"Property & Construction",
 RESOURC:"Resources",
 SERVICE:"Services",
 TECH:"Technology"
};

export interface SetIndexConstituent{
 symbol:string;
 name:string;
 sector:string;
 price:number|null;
 changePercent:number|null;
 marketCap:number|null;
}

interface SetCompositionStock{
 industryName?:string;
 last?:number;
 marketCap?:number;
 nameEN?:string;
 percentChange?:number;
 symbol?:string;
}

interface SetCompositionBody{
 composition?:{stockInfos?:SetCompositionStock[]};
}

let sessionCookie:{value:string;expiresAt:number}|null=null;

async function getSessionCookie(forceRefresh:boolean):Promise<string>{
 if(!forceRefresh&&sessionCookie&&sessionCookie.expiresAt>Date.now())return sessionCookie.value;
 sessionCookie=null;
 const response=await fetch(BOOTSTRAP_PAGE_URL,{
  headers:{"user-agent":BROWSER_USER_AGENT},
  signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
 });
 const setCookies=response.headers.getSetCookie?.()??[];
 const value=setCookies.map(c=>c.split(";")[0]).filter(Boolean).join("; ");
 if(!value)throw new Error("SET statistics site did not return a session cookie.");
 sessionCookie={value,expiresAt:Date.now()+COOKIE_TTL_MS};
 return value;
}

async function fetchSetJson<T>(url:string,referer:string):Promise<T>{
 let response=await requestOnce(url,referer,false);
 if(response.status===403)response=await requestOnce(url,referer,true);
 if(!response.ok)throw new Error(`Failed to fetch SET public data (${response.status} ${response.statusText}).`);
 return response.json() as Promise<T>;
}

async function requestOnce(url:string,referer:string,forceRefreshCookie:boolean):Promise<Response>{
 const cookie=await getSessionCookie(forceRefreshCookie);
 return fetch(url,{
  headers:{
   accept:"application/json",
   cookie,
   referer,
   "user-agent":BROWSER_USER_AGENT
  },
  signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)
 });
}

function industryLabel(code:unknown):string{
 const key=String(code??"").toUpperCase();
 return INDUSTRY_LABEL_BY_CODE[key]??(key||"Other");
}

function toNullableNumber(value:unknown):number|null{
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);
 return Number.isFinite(n)?n:null;
}

export async function fetchSet100Constituents():Promise<SetIndexConstituent[]>{
 const body=await fetchSetJson<SetCompositionBody>(
  "https://www.set.or.th/api/set/index/SET100/composition?lang=en",
  "https://www.set.or.th/en/market/index/set100/overview"
 );
 return (body.composition?.stockInfos??[])
  .filter(stock=>Boolean(stock?.symbol))
  .map((stock):SetIndexConstituent=>({
   symbol:stock.symbol??"",
   name:stock.nameEN??stock.symbol??"",
   sector:industryLabel(stock.industryName),
   price:toNullableNumber(stock.last),
   changePercent:toNullableNumber(stock.percentChange),
   marketCap:toNullableNumber(stock.marketCap)
  }));
}
