export const MARKET_VIEW_MARKETS=["SP500","NASDAQ100","DJI","SET100","CSI300","NIKKEI225","HSI","KOSPI200","VN30"] as const;
export type MarketViewMarket=(typeof MARKET_VIEW_MARKETS)[number];

export interface MarketViewStock{
 symbol:string;
 name:string;
 price:number;
 changePercent:number;
 marketCap:number;
 currency:string;
}

export interface MarketViewSector{
 sector:string;
 stocks:MarketViewStock[];
 totalMarketCap:number;
}

export interface MarketViewResponse{
 market:MarketViewMarket;
 sectors:MarketViewSector[];
 updatedAt:string;
}

export interface MarketViewConstituent{
 symbol:string;
 name:string;
 sector:string;
}
