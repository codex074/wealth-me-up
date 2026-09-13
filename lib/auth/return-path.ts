const LOGIN_PATH="/login";
const AUTH_PREFIX="/auth/";

export function safeRelativeReturnPath(value:string|null|undefined):string{
 if(!value||!value.startsWith("/")||value.startsWith("//"))return "/";
 let url:URL;
 try{url=new URL(value,"https://app.local");}catch{return "/";}
 if(url.origin!=="https://app.local")return "/";
 if(url.pathname===LOGIN_PATH||url.pathname.startsWith(AUTH_PREFIX))return "/";
 return `${url.pathname}${url.search}${url.hash}`;
}
