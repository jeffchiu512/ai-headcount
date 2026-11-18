import {useEffect,useRef} from 'react';
import Chart from 'chart.js/auto';
import {labels,type Result} from './types';
const palette=['#2563a6','#0f8b77','#e5a332','#db7760','#7b65b8','#54a1c2','#78a648','#b96a97'];
export function ChartView({result}:{result:Result}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const {data,presentation:p,columns}=result;
 const limit=p.type==='line'?120:20;
 const categories=[...new Set(data.map(r=>String(r[p.categoryField]??'—')))];
 const categoryLabels=categories.map(value=>p.categoryField==='agency_code'?String(data.find(r=>String(r[p.categoryField]??'—')===value)?.agency_name??value):value);
 const tooMany=categories.length>limit;
 const ambiguous=new Set(data.map(r=>JSON.stringify([r[p.categoryField],p.seriesField?r[p.seriesField]:null]))).size!==data.length;
 const incompatibleUnits=new Set(p.valueFields.map(f=>columns.find(c=>c.key===f)?.format==='percent'?'percent':'number')).size>1;
 const series:(string|null)[]=p.seriesField?[...new Set(data.map(r=>String(r[p.seriesField!]??'—')))]:[null];
 const tooManySeries=series.length*p.valueFields.length>8;
 const canRender=data.length>0&&p.type!=='table'&&p.valueFields.length>0&&!tooMany&&!ambiguous&&!tooManySeries&&!incompatibleUnits&&['line','bar','doughnut'].includes(p.type);
 useEffect(()=>{
  if(!canvas.current||!canRender)return;
  const datasets=series.flatMap(s=>p.valueFields.map(field=>({
   label:[s,labels[field]||field].filter(Boolean).join(' · '),
   data:categories.map(c=>{const matches=data.filter(r=>String(r[p.categoryField]??'—')===c&&(!p.seriesField||String(r[p.seriesField]??'—')===s));return matches.length===1&&typeof matches[0][field]==='number'?Number(matches[0][field]):null;}),
   borderWidth:p.type==='line'?2:0,borderRadius:p.type==='bar'?4:0,
   backgroundColor:p.type==='doughnut'?palette:palette[(series.indexOf(s)*p.valueFields.length+p.valueFields.indexOf(field))%palette.length],
   borderColor:palette[(series.indexOf(s)*p.valueFields.length+p.valueFields.indexOf(field))%palette.length],pointRadius:3,spanGaps:false
  })));
  const percentage=p.valueFields.length>0&&p.valueFields.every(f=>columns.find(c=>c.key===f)?.format==='percent');
  const format=(n:number)=>percentage?(n*100).toFixed(1)+'%':n.toLocaleString('zh-TW');
  const horizontal=p.type==='bar'&&p.orientation==='horizontal';
  // Category axes receive ordinal tick values; resolve them through the category labels.
  const categoryTicks={font:{family:'system-ui',size:14},autoSkip:false,callback:(value:unknown)=>categoryLabels[Number(value)]??''};
  const valueTicks={font:{family:'system-ui',size:14},callback:(value:unknown)=>format(Number(value))};
  const chart=new Chart(canvas.current,{type:p.type as 'bar'|'line'|'doughnut',data:{labels:categoryLabels,datasets},options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',animation:{duration:350},plugins:{legend:{display:datasets.length>1||p.type==='doughnut',position:'bottom',labels:{font:{family:'system-ui',size:15},usePointStyle:true,padding:24}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${typeof ctx.raw==='number'?format(ctx.raw):'無資料'}`}}},scales:p.type==='doughnut'?{}:{x:{grid:{display:!horizontal?false:true,color:'#edf0eb'},ticks:horizontal?valueTicks:categoryTicks,beginAtZero:horizontal},y:{grid:{display:horizontal?false:true,color:'#edf0eb'},ticks:horizontal?categoryTicks:valueTicks,beginAtZero:!horizontal}}}});
  return()=>chart.destroy();
 },[result,canRender]);
 if(!canRender)return <div className="empty-chart">{tooMany?`分類超過 ${limit} 個，請縮小範圍，完整結果請參閱表格。`:ambiguous?'結果有重複分類，請指定分組後再繪圖。':tooManySeries?'數列超過 8 組，請縮小範圍。':incompatibleUnits?'指標包含不同單位，請分別查詢後繪圖。':'此結果以表格呈現。'}</div>;
 return <div className={'chart-wrap '+(p.type==='doughnut'?'donut':'')} style={{height:p.type==='bar'?Math.max(440,categories.length*46+100):460}}><canvas ref={canvas} role="img" aria-label={result.title}/></div>;
}
