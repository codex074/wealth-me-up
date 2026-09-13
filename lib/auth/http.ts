export function serializeCookie(name:string,value:string,{maxAge,secure}:{maxAge:number,secure:boolean}):string{
 return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure?"; Secure":""}`;
}

export function clearCookie(name:string,secure:boolean):string{
 return serializeCookie(name,"",{maxAge:0,secure});
}

export function readCookie(cookieHeader:string|null,name:string):string|null{
 if(!cookieHeader)return null;
 for(const part of cookieHeader.split(";")){
  const [key,...rest]=part.trim().split("=");
  if(key===name)return rest.join("=");
 }
 return null;
}

export function redirectResponse(location:string,setCookies:string[],status:302|303=302):Response{
 const headers=new Headers({Location:location,"Cache-Control":"no-store"});
 for(const cookie of setCookies)headers.append("Set-Cookie",cookie);
 return new Response(null,{status,headers});
}
