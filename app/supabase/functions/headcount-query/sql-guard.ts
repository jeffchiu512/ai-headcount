import { parse, toSql } from 'pgsql-ast-parser';

const tables = new Set(['agencies','current_staff','establishment','additions']);
const functions = new Set(['sum','count','avg','min','max','round','nullif','coalesce','abs','floor','ceil','ceiling','greatest','least','lower','upper','length','concat','concat_ws','row_number','rank','dense_rank','lag','lead','first_value','last_value','stddev_pop','corr']);
const nodes = new Set(['select','with','union','union all','table','statement','ref','call','cast','binary','unary','integer','numeric','string','boolean','null','list','case','ternary','array','keyword','INNER JOIN','LEFT JOIN','RIGHT JOIN','FULL JOIN']);
const operators = new Set(['+','-','*','/','%','=','!=','<>','<','>','<=','>=','AND','OR','LIKE','ILIKE','NOT LIKE','NOT ILIKE','IN','NOT IN','IS NULL','IS NOT NULL','IS TRUE','IS FALSE','NOT','IS DISTINCT FROM','IS NOT DISTINCT FROM']);
const casts = new Set(['numeric','decimal','int','integer','int4','int8','bigint','float','float8','double precision','real','text','varchar','boolean','date']);

/** Parse and reserialize SQL; fail closed on statements, relations and functions. */
export function requestedRowLimit(question: string): number | undefined {
  const match=question.match(/前\s*(\d+|[一二兩三四五六七八九十])\s*(?:名|個|大|筆)/i)||question.match(/\btop\s+(\d+)\b/i);
  if(!match)return;
  const chinese:Record<string,number>={一:1,二:2,兩:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const value=chinese[match[1]]??Number(match[1]);
  return Number.isInteger(value)&&value>=1&&value<=500?value:undefined;
}

export function guardSql(input: string, maxRows?: number): string {
  // Accept a conventional single trailing terminator; internal separators still fail closed.
  if(typeof input==='string')input=input.trim().replace(/;\s*$/,'').trim();
  if(typeof input!=='string'||input.length>16000||/;|--|\/\*|\$/.test(input)) throw new Error('SQL 只能包含一個唯讀查詢，不接受註解或多重指令。');
  const statements=parse(input);
  if(statements.length!==1||!['select','with','union','union all'].includes(statements[0].type)) throw new Error('僅允許 SELECT 或非遞迴 WITH 查詢。');
  const ctes=new Set<string>();
  function collect(value: any) {
    if(!value||typeof value!=='object')return;
    if(value.type==='with') for(const b of value.bind||[]) ctes.add(b.alias.name);
    for(const child of Object.values(value)) if(Array.isArray(child))child.forEach(collect);else collect(child);
  }
  collect(statements[0]);
  let relationCount=0,nodeCount=0;
  function visit(value: any) {
    if(!value||typeof value!=='object')return;
    if(++nodeCount>1800)throw new Error('查詢過於複雜，請縮小問題範圍。');
    if(value.type&&!nodes.has(value.type))throw new Error(`不支援的 SQL 結構：${value.type}`);
    if(value.type==='table') {
      relationCount++;
      const n=value.name;
      if(!n||!((n.schema==='analytics'&&tables.has(n.name))||(!n.schema&&ctes.has(n.name))))throw new Error('只允許 analytics 的四個分析檢視表。');
      if(value.join&&!value.join.on&&!value.join.using)throw new Error('JOIN 必須指定關聯條件。');
    }
    if(value.type==='select') {
      if(value.into||value.for||value.forUpdate||value.locking)throw new Error('禁止寫入或鎖定資料。');
      if(value.from?.length>1&&value.from.slice(1).some((v:any)=>!v.join))throw new Error('不允許笛卡兒積。');
    }
    if(value.type==='call') {
      if(!functions.has(value.function?.name?.toLowerCase())||(value.function.schema&&value.function.schema!=='pg_catalog'))throw new Error('SQL 包含未允許的函式。');
    }
    if(value.type==='cast'&&(!casts.has(value.to?.name?.toLowerCase())||(value.to.schema&&value.to.schema!=='pg_catalog')))throw new Error('SQL 包含未允許的型別轉換。');
    if(['binary','unary'].includes(value.type)&&!operators.has(value.op))throw new Error('SQL 包含未允許的運算子。');
    if(value.type==='keyword'&&!['current_date','current_timestamp'].includes(value.keyword))throw new Error('SQL 包含未允許的關鍵字。');
    for(const child of Object.values(value))if(Array.isArray(child))child.forEach(visit);else visit(child);
  }
  visit(statements[0]);
  if(relationCount===0||relationCount>14)throw new Error('查詢必須使用分析資料，且關聯數不可超過 14。');
  if(maxRows!==undefined){
    if(!Number.isInteger(maxRows)||maxRows<1||maxRows>500)throw new Error('排名筆數須為1至500。');
    let result:any=statements[0];
    while(result.type==='with')result=result.in;
    if(result.type!=='select'||!result.orderBy?.length)throw new Error('排名查詢的最外層必須是有排序的 SELECT。');
    result.limit={limit:{type:'integer',value:maxRows}};
  }
  return toSql.statement(statements[0]);
}
