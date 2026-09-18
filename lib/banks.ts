export type Bank={id:string,name:string,logo:string};
export const banks:Bank[]=[
 {id:"scb",name:"ธนาคารไทยพาณิชย์ (SCB)",logo:"/logos/banks/scb.svg"},
 {id:"kbank",name:"ธนาคารกสิกรไทย (KBank)",logo:"/logos/banks/kbank.svg"},
 {id:"bbl",name:"ธนาคารกรุงเทพ (Bangkok Bank)",logo:"/logos/banks/bbl.svg"},
 {id:"krungsri",name:"ธนาคารกรุงศรีอยุธยา (Krungsri)",logo:"/logos/banks/krungsri.svg"},
 {id:"ktb",name:"ธนาคารกรุงไทย (KTB)",logo:"/logos/banks/ktb.svg"},
 {id:"gsb",name:"ธนาคารออมสิน (GSB)",logo:"/logos/banks/gsb.svg"},
 {id:"baac",name:"ธ.ก.ส. (BAAC)",logo:"/logos/banks/baac.svg"},
 {id:"ttb",name:"ทีทีบี (ttb)",logo:"/logos/banks/ttb.png"},
 {id:"cimbt",name:"ซีไอเอ็มบี ไทย (CIMB Thai)",logo:"/logos/banks/cimbt.svg"},
 {id:"uob",name:"ยูโอบี (UOB)",logo:"/logos/banks/uob.svg"},
 {id:"lhbank",name:"แลนด์ แอนด์ เฮ้าส์ (LH Bank)",logo:"/logos/banks/lhbank.svg"},
 {id:"kkp",name:"เกียรตินาคินภัทร (KKP)",logo:"/logos/banks/kkp.png"},
 {id:"citi",name:"ซิตี้แบงก์ (Citibank)",logo:"/logos/banks/citi.svg"},
 {id:"icbc",name:"ไอซีบีซี (ไทย) (ICBC Thai)",logo:"/logos/banks/icbc.svg"},
 {id:"ghb",name:"ธนาคารอาคารสงเคราะห์ (GHB)",logo:"/logos/banks/ghb.svg"},
 {id:"dime",name:"Dime! (แพลตฟอร์มเติมเงิน)",logo:"/logos/banks/dime.svg"},
];
export const findBank=(name:string)=>banks.find(b=>b.name===name);
