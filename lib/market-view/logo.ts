export function getLogoUrl(symbol:string):string{
 return `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png`;
}

export function stripExchangeSuffix(symbol:string):string{
 return symbol.replace(/\.[A-Za-z]+$/,"");
}
