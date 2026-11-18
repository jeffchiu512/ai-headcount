import {sum,type Dashboard,type DataRow,type Result,type Source,type HeaderCell} from './types';

interface IntegratedColumn {key:string;label:string;source:Source;section:'current'|'additions';group?:string;filter:string;category?:string;metric?:string}
const definition:IntegratedColumn[]=[
 {key:'established',label:'編制員額',source:'webhr',section:'current',filter:'職員'},
 ...[['staff','職員','職員（含警察、法警）'],['employed','聘僱','聘僱'],['worker','工友','工友（含技工、駕駛、駐警）']].flatMap(([prefix,category,group])=>
  [['budget','預算員額'],['actual','現有員額'],['vacancies','缺額(非六類)']].map(([metric,label])=>({key:`${prefix}_${metric}`,label,source:'d5cur' as Source,section:'current' as const,group,filter:category,category,metric}))),
 ...[['add_staff','職員','職員'],['add_hired','聘用','聘僱'],['add_contract','約僱','約僱'],['add_temporary','其他(約用)','約用']].map(([key,label,filter])=>({key,label,filter,source:(key==='add_temporary'?'d7':'d5add') as Source,section:'additions' as const,category:key==='add_temporary'?'約用':label}))
];

export function buildIntegrated(d:Dashboard,year:number|undefined,keyword:string,includeSubs:boolean,filter:string):Result{
 const columns=definition.filter(c=>filter==='合計'||c.filter===filter);
 const years=d.additions.map(r=>Number(r.year));
 const end=years.length?Math.max(...years):null;
 const start=end===null?null:Math.max(end-9,Math.min(...years));
 const present=new Set(d.sources.map(s=>s.source));
 const sorted=[...d.agencies].sort((a,b)=>String(a.agency_code).localeCompare(String(b.agency_code)));
 const matches=sorted.filter(a=>String(a.agency_name).includes(keyword)||String(a.agency_code).includes(keyword));
 const roots=new Set(matches.map(a=>a.parent_code||a.agency_code));
 const agencies=includeSubs?sorted.filter(a=>roots.has(a.parent_code||a.agency_code)):matches;
 const rows=agencies.map(a=>{
  const row:DataRow={agency_code:a.agency_code,agency_name:a.agency_name};
  for(const col of columns){
   if(!present.has(col.source)){row[col.key]='尚無資料';continue;}
   if(col.source==='webhr')row[col.key]=d.establishment.find(r=>r.agency_code===a.agency_code)?.established??null;
   else if(col.source==='d5cur')row[col.key]=d.current.find(r=>r.agency_code===a.agency_code&&r.year===year&&r.category===col.category)?.[col.metric!]??null;
   else{
    const records=d.additions.filter(r=>r.agency_code===a.agency_code&&r.category===col.category&&Number(r.year)>=Number(start)&&Number(r.year)<=Number(end));
    row[col.key]=start!==null&&end!==null&&records.length===end-start+1?sum(records,'additions'):null;
   }
  }
  return row;
 });
 const total=(name:string,items:DataRow[],kind:string):DataRow=>({agency_name:name,_kind:kind,...Object.fromEntries(columns.map(c=>[c.key,items.length&&items.every(r=>r[c.key]==='尚無資料')?'尚無資料':sum(items,c.key)]))});
 const body:DataRow[]=[];
 if(includeSubs){
  for(const root of new Set(agencies.map(a=>String(a.parent_code||a.agency_code)))){
   const codes=agencies.filter(a=>String(a.parent_code||a.agency_code)===root).map(a=>a.agency_code);
   const family=rows.filter(r=>codes.includes(r.agency_code));body.push(...family);
   if(family.length>1)body.push(total(`小計：${sorted.find(a=>a.agency_code===root)?.agency_name||root}及所屬（${family.length} 個機關）`,family,'subtotal'));
  }
 }else body.push(...rows);
 if(rows.length)body.push(total(`合計（${rows.length} 個機關）`,rows,'total'));
 const currentCount=columns.filter(c=>c.section==='current').length;
 const addCount=columns.length-currentCount;
 const top:HeaderCell[]=[{label:'機關',rowSpan:3,tone:'agency'}];
 if(currentCount)top.push({label:'當前員額運用情形',colSpan:currentCount,tone:'current'});
 if(addCount)top.push({label:`近 10 年${start!==null?`（${start} 年至 ${end} 年）`:''}員額核增情形`,colSpan:addCount,tone:'additions'});
 const middle:HeaderCell[]=[],bottom:HeaderCell[]=[];
 for(let i=0;i<columns.length;){
  const c=columns[i];
  if(!c.group){middle.push({label:c.label,rowSpan:2,source:c.source,tone:c.source});i++;}
  else{
   const group=columns.filter(x=>x.group===c.group);middle.push({label:c.group,colSpan:group.length,tone:'d5cur'});
   bottom.push(...group.map(x=>({label:x.label,source:x.source,tone:x.source})));i+=group.length;
  }
 }
 return {title:'整合統計表',data:body,columns:[{key:'agency_name',label:'機關',type:'text'},...columns.map(c=>({key:c.key,label:`${c.section==='current'?'當前':'近10年核增'}${c.group?'－'+c.group:''}－${c.label}`,type:'number' as const}))],headerRows:[top,middle,bottom],presentation:{type:'table',categoryField:'agency_name',valueFields:[]},assumptions:[`當前員額採 ${year??'—'} 年同一年度；編制員額僅為職員。缺額採來源值，不自行重算。核增不含核減與移撥；缺漏或期間不足顯示「—」，來源未匯入顯示「尚無資料」。`],metadata:{agencyCount:agencies.length,additionStart:start,additionEnd:end}};
}
