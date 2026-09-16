const MAX_ABS_CHANGE_PERCENT=3;
const NEUTRAL_CHANGE_PERCENT=0.5;
const NEUTRAL_BACKGROUND_COLOR="#cbd2da";
const NEUTRAL_FONT_COLOR="#263442";
const GAIN_COLORS=["#8bd39a","#55bd73","#249f5a","#117a43"];
const LOSS_COLORS=["#f0a0a4","#e8747b","#d44853","#b52d3d"];

export const LEGEND_CHANGE_PERCENT_STEPS=[-3,-2,-1,0,1,2,3];

export function getTileColor(changePercent:number):{backgroundColor:string;fontColor:string}{
 if(Math.abs(changePercent)<NEUTRAL_CHANGE_PERCENT){
  return {backgroundColor:NEUTRAL_BACKGROUND_COLOR,fontColor:NEUTRAL_FONT_COLOR};
 }
 const clamped=Math.max(-MAX_ABS_CHANGE_PERCENT,Math.min(MAX_ABS_CHANGE_PERCENT,changePercent));
 const intensity=Math.abs(clamped)/MAX_ABS_CHANGE_PERCENT;
 const index=intensity>=0.75?3:intensity>=0.5?2:intensity>=0.25?1:0;
 const palette=changePercent>0?GAIN_COLORS:LOSS_COLORS;
 return {
  backgroundColor:palette[index],
  fontColor:index>=2?"#ffffff":changePercent>0?"#173a24":"#4a1820"
 };
}
