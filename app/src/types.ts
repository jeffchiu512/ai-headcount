export type Source = 'webhr'|'d5cur'|'d5add'|'d7';
export type DataRow = Record<string, string|number|null|boolean>;
export interface Snapshot { id:string;source:Source;base_date:string;file_name:string;is_demo:boolean;created_at:string;record_count:number }
export interface Dashboard { sources:Snapshot[];agencies:DataRow[];establishment:DataRow[];current:DataRow[];additions:DataRow[] }
export interface Column {key:string;label:string;type:'text'|'number';format?:string}
export interface HeaderCell {label:string;colSpan?:number;rowSpan?:number;source?:Source;tone?:string}
export interface Presentation {type:string;orientation?:string;categoryField:string;valueFields:string[];seriesField?:string|null}
export interface Result {title:string;data:DataRow[];columns:Column[];presentation:Presentation;headerRows?:HeaderCell[][];sql?:string;assumptions?:string[];warnings?:string[];metadata?:Record<string,unknown>}
export const SOURCES:Record<Source,{name:string;short:string;color:string;headers:string[]}>={
 webhr:{name:'WebHR 組織編制系統',short:'WebHR',color:'#b9863d',headers:['機關代碼','機關名稱','編制員額(職員)']},
 d5cur:{name:'D5 現有員額調查表',short:'D5 現員',color:'#4e8370',headers:['年度','機關代碼','機關名稱',...['職員','聘僱','工友'].flatMap(c=>['預算員額','現有員額','缺額'].map(m=>`${m}(${c})`))]},
 d5add:{name:'D5 請增員額情形一覽表',short:'D5 核增',color:'#547ea1',headers:['年度','機關代碼','機關名稱','職員','聘用','約僱']},
 d7:{name:'D7 多元人力填報系統',short:'D7 約用',color:'#b9765f',headers:['年度','機關代碼','機關名稱','約用']}
};
export const labels:Record<string,string>={agency_code:'機關代碼',agency_name:'機關名稱',parent_code:'主管機關代碼',year:'年度',category:'人力類別',established:'編制員額',budget:'預算員額',actual:'現有員額',vacancies:'缺額',vacancy_rate:'缺額率',additions:'核增員額',total:'合計',total_additions:'核增合計',total_budget:'預算合計',total_actual:'現員合計',total_vacancies:'缺額合計',base_date:'資料基準日',source:'來源',is_demo:'示範資料'};
Object.assign(labels,{add_staff:'近10年核增－職員',add_hired:'近10年核增－聘用',add_contract:'近10年核增－約僱',add_temporary:'近10年核增－約用'});
export const num=(value:unknown)=>typeof value==='number'?value.toLocaleString('zh-TW',{maximumFractionDigits:2}):value===null||value===undefined?'—':String(value);
export const percent=(value:unknown)=>typeof value==='number'?(value*100).toFixed(1)+'%':'—';
export function sum(rows:DataRow[],field:string){return rows.length&&rows.every(r=>typeof r[field]==='number')?rows.reduce((s,r)=>s+Number(r[field]),0):null;}
export function makeResult(title:string,rows:DataRow[],x:string,ys:string[],type='bar',seriesField?:string):Result{
 const keys=[...new Set(rows.flatMap(Object.keys))];
 return {title,data:rows,columns:keys.map(key=>({key,label:labels[key]||key,type:rows.some(r=>typeof r[key]==='number')?'number':'text',format:/rate|ratio|share/.test(key)?'percent':undefined})),presentation:{type,orientation:'horizontal',categoryField:x,valueFields:ys,seriesField}};
}
