import type {MarketViewMarket} from "./types";

export interface MarketViewMarketConfig{
 market:MarketViewMarket;
 label:string;
 assetFileName:string;
}

export const MARKET_VIEW_MARKET_CONFIGS:MarketViewMarketConfig[]=[
 {market:"SP500",label:"S&P 500",assetFileName:"sp500.json"},
 {market:"NASDAQ100",label:"Nasdaq 100",assetFileName:"nasdaq100.json"},
 {market:"DJI",label:"Dow Jones",assetFileName:"dji.json"},
 {market:"SET100",label:"SET100",assetFileName:"set100.json"},
 {market:"CSI300",label:"CSI 300",assetFileName:"csi300.json"},
 {market:"NIKKEI225",label:"Nikkei 225",assetFileName:"nikkei225.json"},
 {market:"HSI",label:"Hang Seng",assetFileName:"hsi.json"},
 {market:"KOSPI200",label:"KOSPI200",assetFileName:"kospi200.json"},
 {market:"VN30",label:"VN30",assetFileName:"vn30.json"}
];

export function findMarketConfig(market:string):MarketViewMarketConfig|undefined{
 return MARKET_VIEW_MARKET_CONFIGS.find(m=>m.market===market);
}
