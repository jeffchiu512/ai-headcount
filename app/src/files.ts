import {SOURCES,type Source,type DataRow,type Result} from './types';

function parseCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else throw Error('CSV 引號位置不正確');}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw Error('CSV 引號未結束');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export async function readFile(file:File):Promise<unknown[][]>{
 if(file.size>20*1024*1024)throw Error('檔案大小不可超過 20 MB');
 if(/\.csv$/i.test(file.name)){
  const buffer=await file.arrayBuffer();let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('big5').decode(buffer);}
  return parseCsv(text.replace(/^\uFEFF/,''));
 }
 if(!/\.xlsx$/i.test(file.name))throw Error('請選擇 .xlsx 或 .csv 檔案');
 const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const sheet=wb.worksheets[0];if(!sheet)throw Error('找不到工作表');
 if(sheet.rowCount>10000)throw Error('來源檔案最多 10,000 列');
 const rows:unknown[][]=[];
 sheet.eachRow(row=>rows.push(Array.from({length:sheet.columnCount},(_,i)=>{
  const cell=row.getCell(i+1);const v=cell.value;
  if(v&&typeof v==='object'&&'formula' in v)throw Error(`第 ${row.number} 列包含公式，請先貼上為純值`);
  return typeof v==='object'&&v!==null?cell.text:v;
 })));
 return rows;
}
const norm=(v:unknown)=>String(v??'').replaceAll('（','(').replaceAll('）',')').replace(/\s/g,'').replace(/^\uFEFF/,'');
export function normalize(source:Source,rows:unknown[][]):DataRow[]{
 if(rows.length<2)throw Error('檔案沒有資料列');
 if(rows.length>10001)throw Error('來源檔案最多 10,000 列');
 const headers=rows[0].map(norm);const required=SOURCES[source].headers;
 for(const h of required)if(!headers.includes(norm(h)))throw Error(`缺少欄位：${h}`);
 if(new Set(headers).size!==headers.length)throw Error('欄位名稱重複');
 const records:DataRow[]=[];const seen=new Set<string>();
 for(const [idx,row]of rows.slice(1).entries()){
  if(row.every(v=>v===null||v===undefined||String(v).trim()===''))continue;
  const get=(h:string)=>row[headers.indexOf(norm(h))];
  const integer=(h:string,required=false)=>{const v=get(h);if(v===null||v===undefined||String(v).trim()===''){if(required)throw Error(`第 ${idx+2} 列「${h}」不可空白`);return null;}
   const s=String(v).replaceAll(',','').trim();const n=Number(s);if(!/^\d+$/.test(s)||!Number.isSafeInteger(n)||n>10000000)throw Error(`第 ${idx+2} 列「${h}」須為非負整數`);return n;};
  const code=String(get('機關代碼')??'').trim(),name=String(get('機關名稱')??'').trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(code)||!name||name.length>120)throw Error(`第 ${idx+2} 列的機關代碼或名稱不正確`);
  let year=source==='webhr'?null:integer('年度',true);if(year!==null&&year>1911)year-=1911;
  if(year!==null&&(year<1||year>300))throw Error(`第 ${idx+2} 列年度不正確`);
  const key=code+'|'+year;if(seen.has(key))throw Error(`第 ${idx+2} 列機關與年度重複`);seen.add(key);
  const base={agency_code:code,agency_name:name,parent_code:code.includes('-')?code.split('-')[0]:null,year};
  if(source==='webhr')records.push({...base,category:'職員',established:integer('編制員額(職員)',true)});
  if(source==='d5cur')for(const category of ['職員','聘僱','工友'])records.push({...base,category,budget:integer(`預算員額(${category})`),actual:integer(`現有員額(${category})`),vacancies:integer(`缺額(${category})`)});
  if(source==='d5add')for(const category of ['職員','聘用','約僱'])records.push({...base,category,additions:integer(category)});
  if(source==='d7')records.push({...base,category:'約用',additions:integer('約用')});
 }
 if(!records.length||records.length>25000)throw Error('正規化後的資料筆數須為 1–25,000');
 return records;
}
export async function exportExcel(result:Result){
 const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();
 const sheet=wb.addWorksheet('查詢結果');
 sheet.columns=result.columns.map(c=>({key:c.key,width:c.type==='number'?18:44}));
 const headerCount=result.headerRows?.length||1;
 if(result.headerRows){
  const occupied=new Set<string>();
  const colors:Record<string,string>={agency:'FF1F3A5F',current:'FF1F3A5F',additions:'FF346A9E',webhr:'FFFFE29A',d5cur:'FFC6E0B4',d5add:'FFBDD7EE',d7:'FFF8CBAD'};
  result.headerRows.forEach((row,r)=>{
   let col=1;
   for(const h of row){
    while(occupied.has(`${r+1}:${col}`))col++;
    const lastRow=r+(h.rowSpan||1),lastCol=col+(h.colSpan||1)-1;
    const cell=sheet.getCell(r+1,col);
    cell.value=h.label+(h.source?'\n'+SOURCES[h.source].short:'');
    if(lastRow>r+1||lastCol>col)sheet.mergeCells(r+1,col,lastRow,lastCol);
    cell.font={bold:true,size:12,color:{argb:['agency','current','additions'].includes(h.tone||'')?'FFFFFFFF':'FF1F2933'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors[h.tone||'']||'FFEEF2F7'}};
    cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    for(let rr=r+1;rr<=lastRow;rr++)for(let cc=col;cc<=lastCol;cc++)occupied.add(`${rr}:${cc}`);
    col=lastCol+1;
   }
   sheet.getRow(r+1).height=36;
  });
 }else{
  sheet.addRow(result.columns.map(c=>c.label));
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F3A5F'}};
 }
 for(const row of result.data){const added=sheet.addRow(row);if(row._kind){added.font={bold:true};added.fill={type:'pattern',pattern:'solid',fgColor:{argb:row._kind==='total'?'FFDCE8F5':'FFEFF5E9'}};}}
 for(const [i,c]of result.columns.entries())if(c.type==='number')sheet.getColumn(i+1).numFmt=c.format==='percent'?'0.0%':'#,##0.##';
 sheet.views=[{state:'frozen',ySplit:headerCount,xSplit:result.headerRows?1:0}];
 if(!result.headerRows)sheet.autoFilter={from:{row:headerCount,column:1},to:{row:headerCount,column:result.columns.length}};
 sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
 const info=wb.addWorksheet('資料說明');info.columns=[{width:25},{width:100}];
 info.addRows([['報表',result.title],['匯出時間',new Date().toLocaleString('zh-TW')],['SQL',result.sql||'標準統計'],['查詢口徑',(result.assumptions||[]).join('；')],['警示',(result.warnings||[]).join('；')],['資料來源',JSON.stringify(result.metadata||{})]]);
 const bytes=await wb.xlsx.writeBuffer();const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=objectUrl;a.download=result.title.replace(/[\\/:*?"<>|]/g,'_')+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
