export type AppUser={userId:string,email:string,displayName:string,fullName:string|null,picture:string|null};
export type SessionPayload={email:string,name:string|null,picture:string|null,iat:number,exp:number};
export type OAuthStatePayload={state:string,verifier:string,returnTo:string,exp:number};
