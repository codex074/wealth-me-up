import sp500 from "./data/sp500.json";
import nasdaq100 from "./data/nasdaq100.json";
import dji from "./data/dji.json";
import set100 from "./data/set100.json";
import csi300 from "./data/csi300.json";
import nikkei225 from "./data/nikkei225.json";
import hsi from "./data/hsi.json";
import kospi200 from "./data/kospi200.json";
import vn30 from "./data/vn30.json";
import type {MarketViewConstituent,MarketViewMarket} from "./types";

const CONSTITUENTS_BY_MARKET:Record<MarketViewMarket,MarketViewConstituent[]>={
 SP500:sp500,
 NASDAQ100:nasdaq100,
 DJI:dji,
 SET100:set100,
 CSI300:csi300,
 NIKKEI225:nikkei225,
 HSI:hsi,
 KOSPI200:kospi200,
 VN30:vn30
};

export function getConstituents(market:MarketViewMarket):MarketViewConstituent[]{
 return CONSTITUENTS_BY_MARKET[market];
}
