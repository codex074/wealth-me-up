"use client"
import {useEffect,useMemo,useRef,useState} from "react";
import {hierarchy,treemap,type HierarchyRectangularNode} from "d3-hierarchy";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {MARKET_VIEW_MARKET_CONFIGS} from "@/lib/market-view/markets";
import {getTileColor,LEGEND_CHANGE_PERCENT_STEPS} from "@/lib/market-view/color";
import {getLogoUrl,stripExchangeSuffix} from "@/lib/market-view/logo";
import type {MarketViewMarket,MarketViewResponse,MarketViewStock} from "@/lib/market-view/types";

const SECTOR_CAPTION_HEIGHT=24;
const LOGO_LAYOUT_MIN_SIZE=88;
const TEXT_LABEL_MIN_WIDTH=44;
const TEXT_LABEL_MIN_HEIGHT=32;
const ICON_ONLY_MIN_SIZE=18;

interface StockLeaf{sector:string;stock:MarketViewStock}
interface LayoutRect{x0:number;y0:number;x1:number;y1:number}

interface TreeLeaf{kind:"leaf";sector:string;stock:MarketViewStock}
interface TreeSector{kind:"sector";sector:string;children:TreeLeaf[]}
interface TreeRoot{kind:"root";children:TreeSector[]}
type TreeNode=TreeRoot|TreeSector|TreeLeaf;
const treeChildren=(d:TreeNode)=>d.kind==="leaf"?undefined:d.children;
const treeValue=(d:TreeNode)=>d.kind==="leaf"?d.stock.marketCap:0;

function LogoImage({symbol,size}:{symbol:string;size:number}){
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 return <div className="market-tile-logo" style={{width:size,height:size}}><img src={getLogoUrl(symbol)} alt="" style={{width:size*0.7,height:size*0.7}} onError={()=>setFailed(true)}/></div>;
}

function StockTile({leaf,rect}:{leaf:StockLeaf;rect:LayoutRect}){
 const {stock}=leaf;
 const width=rect.x1-rect.x0;
 const height=rect.y1-rect.y0;
 const {backgroundColor,fontColor}=getTileColor(stock.changePercent);
 const sign=stock.changePercent>0?"+":"";
 const label=stripExchangeSuffix(stock.symbol);
 const title=`${stock.name} (${stock.symbol})\n${stock.price.toLocaleString()} ${stock.currency}\n${sign}${stock.changePercent.toFixed(2)}%`;
 const hasLogoLayout=width>=LOGO_LAYOUT_MIN_SIZE&&height>=LOGO_LAYOUT_MIN_SIZE;
 const hasTextLayout=!hasLogoLayout&&width>=TEXT_LABEL_MIN_WIDTH&&height>=TEXT_LABEL_MIN_HEIGHT;
 const iconOnly=!hasLogoLayout&&!hasTextLayout&&Math.min(width,height)>=ICON_ONLY_MIN_SIZE;
 const logoSize=hasLogoLayout?Math.min(40,Math.max(22,Math.min(width,height)*0.28)):Math.min(width,height)-4;
 return (
  <div className="market-tile" title={title} style={{left:rect.x0,top:rect.y0,width,height,background:backgroundColor,color:fontColor}}>
   {(hasLogoLayout||iconOnly)&&<LogoImage symbol={stock.symbol} size={logoSize}/>}
   {(hasLogoLayout||hasTextLayout)&&<span className="market-tile-symbol">{label}</span>}
   {(hasLogoLayout||hasTextLayout)&&<span className="market-tile-change">{sign}{stock.changePercent.toFixed(2)}%</span>}
  </div>
 );
}

function Heatmap({data,width}:{data:MarketViewResponse;width:number}){
 const height=width<767?480:640;
 const root=useMemo(()=>{
  if(width<=0)return null;
  const rootDatum:TreeRoot={kind:"root",children:data.sectors.map((s):TreeSector=>({
   kind:"sector",
   sector:s.sector,
   children:s.stocks.map((stock):TreeLeaf=>({kind:"leaf",sector:s.sector,stock}))
  }))};
  const h=hierarchy<TreeNode>(rootDatum,treeChildren)
   .sum(treeValue)
   .sort((a,b)=>(b.value??0)-(a.value??0));
  const laidOut:HierarchyRectangularNode<TreeNode>=treemap<TreeNode>()
   .size([width,height])
   .paddingOuter(3)
   .paddingTop(node=>node.depth===1?SECTOR_CAPTION_HEIGHT:0)
   .paddingInner(2)
   .round(true)(h);
  return laidOut;
 },[data,width,height]);

 if(!root)return null;

 const sectors=root.children??[];

 return (
  <div className="market-heatmap-wrap" style={{height}}>
   {sectors.map(sectorNode=>{
    const sectorDatum=sectorNode.data as TreeSector;
    return (
     <div key={sectorDatum.sector}>
      <div className="market-sector" style={{left:sectorNode.x0,top:sectorNode.y0,width:sectorNode.x1-sectorNode.x0,height:sectorNode.y1-sectorNode.y0}}/>
      <div className="market-sector-label" style={{left:sectorNode.x0+4,top:sectorNode.y0,width:sectorNode.x1-sectorNode.x0-8,height:SECTOR_CAPTION_HEIGHT}}>{sectorDatum.sector}</div>
      {(sectorNode.children??[]).map(leaf=>{
       const leafDatum=leaf.data as TreeLeaf;
       return <StockTile key={leafDatum.stock.symbol} leaf={{sector:leafDatum.sector,stock:leafDatum.stock}} rect={{x0:leaf.x0??0,y0:leaf.y0??0,x1:leaf.x1??0,y1:leaf.y1??0}}/>;
      })}
     </div>
    );
   })}
  </div>
 );
}

export function MarketView(){
 const [market,setMarket]=useState<MarketViewMarket>("SP500");
 const [data,setData]=useState<MarketViewResponse|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const containerRef=useRef<HTMLDivElement>(null);
 const [width,setWidth]=useState(0);

 useEffect(()=>{
  const el=containerRef.current;
  if(!el)return;
  const observer=new ResizeObserver(entries=>{
   const entry=entries[0];
   if(entry)setWidth(entry.contentRect.width);
  });
  observer.observe(el);
  return ()=>observer.disconnect();
 },[]);

 useEffect(()=>{
  let cancelled=false;
  setLoading(true);
  setError(null);
  fetch(`/api/market-view/${market}`)
   .then(async r=>{
    const body=await r.json() as MarketViewResponse&{error?:string};
    if(!r.ok)throw new Error(body?.error||"โหลดข้อมูลไม่สำเร็จ");
    return body;
   })
   .then(body=>{if(!cancelled){setData(body);setLoading(false);}})
   .catch(e=>{if(!cancelled){setError(e instanceof Error?e.message:"โหลดข้อมูลไม่สำเร็จ");setLoading(false);}});
  return ()=>{cancelled=true;};
 },[market]);

 return (
  <section className="panel">
   <div style={{padding:"20px 20px 0"}}>
    <Tabs value={market} onValueChange={v=>setMarket(v as MarketViewMarket)}>
     <TabsList className="market-tabs">
      {MARKET_VIEW_MARKET_CONFIGS.map(m=><TabsTrigger key={m.market} value={m.market}>{m.label}</TabsTrigger>)}
     </TabsList>
    </Tabs>
   </div>
   <div ref={containerRef}>
    {error&&<div className="error-message" style={{margin:20}}>{error}</div>}
    {!error&&loading&&<div className="empty-state">กำลังโหลดข้อมูลตลาด...</div>}
    {!error&&!loading&&data&&width>0&&<Heatmap data={data} width={width}/>}
   </div>
   {!error&&!loading&&data&&(
    <div className="market-legend">
     {LEGEND_CHANGE_PERCENT_STEPS.map(step=>{
      const {backgroundColor}=getTileColor(step);
      return <span className="market-legend-swatch" key={step}><i style={{background:backgroundColor}}/>{step>0?"+":""}{step}%</span>;
     })}
     <span className="market-updated">อัปเดตล่าสุด {new Date(data.updatedAt).toLocaleTimeString("th-TH")}</span>
    </div>
   )}
  </section>
 );
}
