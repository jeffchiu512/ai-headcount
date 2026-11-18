import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import type {Session} from '@supabase/supabase-js';
import {ArrowDownToLine,ArrowRight,BarChart3,Building2,Check,ChevronRight,Database,FileSpreadsheet,History,LayoutDashboard,LoaderCircle,LogIn,LogOut,RefreshCw,Search,Sparkles,TrendingUp,Upload,X} from 'lucide-react';
import {supabase} from './client';
import {assetUrl,authRedirectUrl} from './paths';
import {ChartView} from './ChartView';
import {buildIntegrated} from './integrated';
import {SyncStatus} from './SyncStatus';
import {exportExcel,normalize,readFile} from './files';
import {labels,makeResult,num,percent,SOURCES,sum,type Dashboard,type DataRow,type Result,type Source} from './types';

type Page='overview'|'vacancy'|'additions'|'query'|'import';
const nav=[{id:'overview',label:'整合統計表',icon:LayoutDashboard},{id:'vacancy',label:'缺額分析',icon:BarChart3},{id:'additions',label:'核增情形',icon:TrendingUp},{id:'query',label:'智慧查詢',icon:Sparkles},{id:'import',label:'資料同步與備援',icon:Database}] as const;
const empty:Dashboard={sources:[],agencies:[],establishment:[],current:[],additions:[]};
const examples=['目前缺額率最高的前五個機關是哪些？','各主管機關含所屬，近三年核增員額合計是多少？','比較示範數位服務部近五年的職員預算與現員趨勢','哪些機關近三年每年都有職員核增，目前職員缺額率仍高於 10%？'];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function Spinner(){return <LoaderCircle size={17} className="spin"/>;}
function Notice({children,error=false}:{children:React.ReactNode;error?:boolean}){return <div className={'notice '+(error?'error':'')}>{children}</div>;}

function ResultView({result,onAgency}:{result:Result;onAgency?:(code:string)=>void}){
 const [exporting,setExporting]=useState(false);const [exportError,setExportError]=useState('');const [page,setPage]=useState(0);
 useEffect(()=>setPage(0),[result]);
 const rows=result.data.slice(page*25,(page+1)*25);
 return <>
  {result.warnings?.map((w,i)=><Notice key={i}>{w}</Notice>)}
  <section className="panel result-panel">
   <div className="panel-head"><div><span className="eyebrow">ANALYSIS RESULT</span><h2>{result.title}</h2></div><button className="button secondary" disabled={exporting||!result.data.length} onClick={async()=>{setExporting(true);setExportError('');try{await exportExcel(result);}catch(e){setExportError((e as Error).message);}finally{setExporting(false);}}}>{exporting?<Spinner/>:<ArrowDownToLine size={16}/>}匯出 Excel</button></div>
   {exportError&&<Notice error>{exportError}</Notice>}
   {result.data.length?(result.presentation.type!=='table'&&<ChartView result={result}/>):<div className="empty-chart">查無符合資料，請調整年度或篩選條件。</div>}
   {!!result.assumptions?.length&&<div className="method">{result.assumptions.join('；')}</div>}
   <div className={result.headerRows?'table-wrap integrated-table':'table-wrap'}><table aria-label={result.title} style={result.headerRows?{minWidth:Math.max(500,280+(result.columns.length-1)*114)}:undefined}><thead>{result.headerRows?result.headerRows.map((header,level)=><tr key={level}>{header.map((h,i)=><th key={i} colSpan={h.colSpan} rowSpan={h.rowSpan} className={'header-'+(h.tone||'default')} scope={h.colSpan&&h.colSpan>1?'colgroup':'col'}>{h.label}{h.source&&<span className="source-badge" data-source={h.source}>{h.source==='d5cur'?'D5現員':h.source==='d5add'?'D5請增':h.source==='d7'?'D7':'WebHR'}</span>}</th>)}</tr>):<tr>{result.columns.map(c=><th key={c.key} className={c.type==='number'?'number':''} scope="col">{labels[c.key]||c.label}</th>)}</tr>}</thead><tbody>{rows.map((row,i)=><tr key={i} className={row._kind?String(row._kind):''}>{result.columns.map(c=><td key={c.key} className={c.type==='number'?'number':''}>{c.key==='agency_name'&&onAgency&&row.agency_code?<button className="text-link" onClick={()=>onAgency(String(row.agency_code))}>{String(row[c.key])}<ChevronRight size={15}/></button>:c.format==='percent'?percent(row[c.key]):num(row[c.key])}</td>)}</tr>)}</tbody></table></div>
   <div className="table-footer"><span>共 {num(result.metadata?.agencyCount??result.data.length)} {result.headerRows?'個機關（另列小計、合計）':'筆'}{result.metadata?.truncated?'（結果已截斷）':''}</span><div><button className="button small secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>上一頁</button><span className="page-number">{page+1} / {Math.max(1,Math.ceil(result.data.length/25))}</span><button className="button small secondary" disabled={(page+1)*25>=result.data.length} onClick={()=>setPage(p=>p+1)}>下一頁</button></div></div>
  </section>
  {result.sql&&<details className="panel sql-panel"><summary>查詢 SQL 與資料來源</summary><pre>{result.sql}</pre><div className="method">{Array.isArray(result.metadata?.sources)?(result.metadata.sources as {source:Source;base_date:string}[]).map(s=>`${SOURCES[s.source]?.short||s.source}：${s.base_date}`).join('；'):''}</div></details>}
 </>;
}

function AuthModal({close,onSignedIn}:{close:()=>void;onSignedIn:()=>void}){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [signup,setSignup]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');try{
  if(signup){const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}});if(error)throw error;if(data.session){onSignedIn();close();}else setMessage('已寄出驗證信，請完成信箱驗證後登入。');}
  else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;onSignedIn();close();}
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <div className="modal-backdrop" onClick={close}><div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="modal auth-modal" onClick={e=>e.stopPropagation()}><button className="icon-button close" aria-label="關閉" onClick={close}><X/></button><div className="auth-mark"><Building2 size={28}/></div><span className="eyebrow">AI HEADCOUNT</span><h2 id="auth-title">{signup?'建立您的工作帳號':'登入員額分析工作台'}</h2><p className="muted">登入後可使用智慧查詢、保存匯入資料與查詢紀錄。</p><form onSubmit={submit}><label>電子郵件<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>密碼<input type="password" autoComplete={signup?'new-password':'current-password'} minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="至少 8 個字元"/></label>{message&&<Notice>{message}</Notice>}<button className="button primary full" disabled={busy}>{busy?<Spinner/>:<LogIn size={16}/>} {signup?'建立帳號':'登入'}</button></form><button className="text-link auth-switch" onClick={()=>{setSignup(!signup);setMessage('');}}>{signup?'已有帳號，返回登入':'首次使用？建立帳號'}</button></div></div>;
}

export default function App(){
 const loadVersion=useRef(0);
 const [page,setPage]=useState<Page>('overview');const [dashboard,setDashboard]=useState<Dashboard>(empty);const [session,setSession]=useState<Session|null>(null);const [busy,setBusy]=useState(true);const [error,setError]=useState('');const [auth,setAuth]=useState(false);const [year,setYear]=useState<number|null>(null);const [category,setCategory]=useState('合計');const [keyword,setKeyword]=useState('');const [withSubs,setWithSubs]=useState(false);const [yearsN,setYearsN]=useState(3);const [threshold,setThreshold]=useState('');const [vacSort,setVacSort]=useState('vacancy_rate');const [selectedAgency,setSelectedAgency]=useState<string|null>(null);
 const [question,setQuestion]=useState('');const [queryBusy,setQueryBusy]=useState(false);const [queryResult,setQueryResult]=useState<Result|null>(null);const [queryMessage,setQueryMessage]=useState('');const [history,setHistory]=useState<{id:string;question:string;title:string;result:Result;created_at:string}[]>([]);const [showHistory,setShowHistory]=useState(false);const [modelStatus,setModelStatus]=useState<{configured:boolean;model:string;provider?:string}|null>(null);
 const [source,setSource]=useState<Source>('webhr');const [baseDate,setBaseDate]=useState(today());const [pending,setPending]=useState<{file:string;records:DataRow[];source:Source}|null>(null);const [importBusy,setImportBusy]=useState(false);const [importMessage,setImportMessage]=useState('');

 async function load(currentSession:Session|null){
  const version=++loadVersion.current;
  setBusy(true);setError('');
  try{
   if(currentSession){const {data,error}=await supabase.rpc('hc_get_dashboard');if(error)throw error;if(version===loadVersion.current)setDashboard(data);}
   else{const response=await fetch(assetUrl('samples/demo.json'));if(!response.ok)throw Error('示範資料載入失敗');const demo=await response.json();if(version!==loadVersion.current)return;setDashboard({agencies:demo.agencies.map((a:{code:string;name:string;parent_code:string})=>({agency_code:a.code,agency_name:a.name,parent_code:a.parent_code})),sources:demo.datasets.map((d:{source:Source;base_date:string;file_name:string;records:DataRow[]})=>({id:d.source,source:d.source,base_date:d.base_date,file_name:d.file_name,is_demo:true,created_at:'2026-11-18T00:00:00Z',record_count:d.records.length})),establishment:demo.datasets.find((d:{source:string})=>d.source==='webhr').records,current:demo.datasets.find((d:{source:string})=>d.source==='d5cur').records,additions:demo.datasets.filter((d:{source:string})=>['d5add','d7'].includes(d.source)).flatMap((d:{source:string;records:DataRow[]})=>d.records.map(r=>({...r,source:d.source})))});}
  }catch(e){if(version===loadVersion.current)setError((e as Error).message);}finally{if(version===loadVersion.current)setBusy(false);}
 }
 useEffect(()=>{
  let alive=true;
  supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);void load(data.session);}});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{if(alive)setSession(s);});
  return()=>{alive=false;subscription.unsubscribe();};
 },[]);
 const uid=session?.user.id;
 const importUserId=useRef(uid);importUserId.current=uid;
 useEffect(()=>{setQueryResult(null);setHistory([]);setQueryMessage('');setPending(null);setImportBusy(false);setImportMessage('');setModelStatus(null);void load(session);if(session){void loadHistory();void supabase.functions.invoke('headcount-query',{body:{action:'status'}}).then(({data,error})=>{if(!error)setModelStatus(data);});}},[uid]);
 async function loadHistory(){const {data,error}=await supabase.from('headcount_query_history').select('id,question,title,result,created_at').order('created_at',{ascending:false}).limit(20);if(!error)setHistory(data||[]);}
 const availableYears=useMemo(()=>[...new Set(dashboard.current.map(r=>Number(r.year)))].sort((a,b)=>b-a),[dashboard]);
 const chosenYear=year&&availableYears.includes(year)?year:availableYears[0];
 const currentCategory=['職員','聘僱','工友'].includes(category)?category:'合計';
 const currentRows=dashboard.current.filter(r=>r.year===chosenYear&&(currentCategory==='合計'||r.category===currentCategory));
 const latestAdditionYear=Math.max(0,...dashboard.additions.map(r=>Number(r.year)));
 const firstAdditionYear=latestAdditionYear-yearsN+1;
 const filteredAgencies=dashboard.agencies.filter(a=>String(a.agency_name).includes(keyword)||String(a.agency_code).includes(keyword));
 const displayAgencies=withSubs?dashboard.agencies.filter(a=>!a.parent_code&&filteredAgencies.some(f=>f.agency_code===a.agency_code||f.parent_code===a.agency_code)):filteredAgencies;
 const aggregateRows=displayAgencies.map(a=>{
  const codes=withSubs?dashboard.agencies.filter(x=>x.agency_code===a.agency_code||x.parent_code===a.agency_code).map(x=>x.agency_code):[a.agency_code];
  const matched=currentRows.filter(r=>codes.includes(r.agency_code));
  const expected=codes.length*(currentCategory==='合計'?3:1);
  const complete=(field:string)=>matched.length===expected?sum(matched,field):null;
  const budget=complete('budget'),actual=complete('actual'),vacancies=complete('vacancies');
  const establishment=dashboard.establishment.filter(r=>codes.includes(r.agency_code));
  return {agency_code:a.agency_code,agency_name:a.agency_name,established:establishment.length===codes.length?sum(establishment,'established'):null,budget,actual,vacancies,vacancy_rate:typeof budget==='number'&&budget>0&&typeof vacancies==='number'?vacancies/budget:null} as DataRow;
 });
 const standardResult=useMemo(()=>{
  if(page==='vacancy'){
   const thr=threshold.trim()===''?null:Number(threshold)/100;
   const rows=aggregateRows.filter(r=>thr===null||(typeof r.vacancy_rate==='number'&&r.vacancy_rate>=thr)).sort((a,b)=>Number(b[vacSort]??-1)-Number(a[vacSort]??-1));
   const result=makeResult(`${chosenYear??'—'} 年各機關缺額分析`,rows.map(({established,...r})=>r),'agency_name',[vacSort]);
   result.assumptions=['缺額率＝來源缺額÷預算員額；零分母或資料缺漏顯示「—」。',withSubs?'主管機關含所屬。':'各機關分別統計，不含所屬。'];return result;
  }
  if(page==='additions'){
   const rows=displayAgencies.map(a=>{
    const codes=withSubs?dashboard.agencies.filter(x=>x.agency_code===a.agency_code||x.parent_code===a.agency_code).map(x=>x.agency_code):[a.agency_code];
    const records=dashboard.additions.filter(r=>codes.includes(r.agency_code)&&Number(r.year)>=firstAdditionYear&&Number(r.year)<=latestAdditionYear);
    const values:DataRow={agency_code:a.agency_code,agency_name:a.agency_name};
    for(const c of ['職員','聘用','約僱','約用']){const rs=records.filter(r=>r.category===c);values[c]=rs.length===codes.length*yearsN?sum(rs,'additions'):null;}
    values.total=Object.keys(values).slice(2).every(k=>typeof values[k]==='number')?['職員','聘用','約僱','約用'].reduce((s,c)=>s+Number(values[c]),0):null;return values;
   }).sort((a,b)=>Number(b.total??-1)-Number(a.total??-1));
   const result=makeResult(`${firstAdditionYear}–${latestAdditionYear} 年核增情形`,rows,'agency_name',['職員','聘用','約僱','約用']);
   result.assumptions=['僅含核定增加，不含核減及移撥。期間缺少年度或類別時，合計顯示「—」。'];return result;
  }
  return buildIntegrated(dashboard,chosenYear,keyword,withSubs,category);
 },[page,dashboard,category,chosenYear,keyword,withSubs,yearsN,threshold,vacSort]);
 standardResult.metadata={...standardResult.metadata,sources:dashboard.sources,year:chosenYear,category,includeSubagencies:withSubs};
 const totalBudget=sum(aggregateRows,'budget'),totalActual=sum(aggregateRows,'actual'),totalVacancies=sum(aggregateRows,'vacancies');
 const overallRate=typeof totalBudget==='number'&&totalBudget>0&&typeof totalVacancies==='number'?totalVacancies/totalBudget:null;
 const incomplete=aggregateRows.filter(r=>r.budget===null||r.actual===null||r.vacancies===null).length;

 async function ask(q=question){
  if(!session){setAuth(true);return;}if(queryBusy||!q.trim())return;
  setQuestion(q);setQueryBusy(true);setQueryMessage('');setQueryResult(null);
  try{
   const {data,error}=await supabase.functions.invoke('headcount-query',{body:{question:q}});
   if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}
   if(data.error)throw Error(data.error);
   if(data.clarification)setQueryMessage(data.clarification);else{setQueryResult(data);void loadHistory();}
  }catch(e){setQueryMessage((e as Error).message);}finally{setQueryBusy(false);}
 }
 async function selectFile(file:File){
  if(!session){setAuth(true);return;}
  const ownerId=session.user.id;
  setImportBusy(true);setPending(null);setImportMessage('');const selected=source;
  try{
   const rows=await readFile(file);const records=normalize(selected,rows);
   if(importUserId.current===ownerId)setPending({file:file.name,records,source:selected});
  }catch(e){if(importUserId.current===ownerId)setImportMessage((e as Error).message);}
  finally{if(importUserId.current===ownerId)setImportBusy(false);}
 }

 async function commit(){if(!session){setAuth(true);return;}if(!pending||!baseDate)return;setImportBusy(true);try{const {error}=await supabase.rpc('hc_import_snapshot',{p_source:pending.source,p_base_date:baseDate,p_file_name:pending.file,p_records:pending.records});if(error)throw error;setPending(null);setImportMessage('匯入完成。已保留舊快照，分析改用此次匯入資料。');await load(session);}catch(e){setImportMessage((e as Error).message);}finally{setImportBusy(false);}}
 const drillResult=selectedAgency?makeResult('機關歷年現員明細',dashboard.current.filter(r=>r.agency_code===selectedAgency).sort((a,b)=>Number(a.year)-Number(b.year)),'year',['actual'],'line','category'):null;
 const currentNav=nav.find(n=>n.id===page)!;
 return <div className="app-shell">
  <aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('overview');}}><img className="brand-logo" src={assetUrl('dgpa_logo_A.PNG')} alt="行政院人事行政總處標誌"/><span>AI Headcount<small>員額分析工作台</small></span></a><div className="sidebar-section">WORKSPACE</div><nav aria-label="功能選單">{nav.map(n=><button key={n.id} className={page===n.id?'active':''} onClick={()=>{setPage(n.id);setError('');}}><n.icon size={18}/>{n.label}{page===n.id&&<span className="nav-dot"/>}</button>)}</nav></aside>
  <div className="main-shell"><header className="topbar"><div className="breadcrumb">中央機關員額資料<ChevronRight size={13}/><span>{currentNav.label}</span></div><div className="top-actions"><span className="demo-pill">{dashboard.sources.every(s=>s.is_demo)?'示範資料':'個人資料工作區'}</span>{session?<><span className="user-email">{session.user.email}</span><button className="icon-button" title="登出" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/></button></>:<button className="button small secondary" onClick={()=>setAuth(true)}><LogIn size={15}/>登入</button>}</div></header>
  <main><div className="page-heading"><div><span className="eyebrow">{page==='query'?'INTELLIGENT EXPLORATION':page==='import'?'DATA MANAGEMENT':'WORKFORCE ANALYTICS'}</span><h1>{currentNav.label}<span className="heading-dot">.</span></h1><p>{page==='query'?'用自然語言探索資料，讓每個問題都有可追溯的答案。':page==='import'?'掌握四大資料來源的同步狀態，異常時可使用手動匯入備援。':'從編制到現員，掌握各機關的人力配置與變化。'}</p></div><button className="button secondary" onClick={()=>void load(session)} disabled={busy}>{busy?<Spinner/>:<RefreshCw size={15}/>}重新整理</button></div>
  {error&&<Notice error>{error}</Notice>}
  {!session&&<div className="demo-banner"><span><span className="status-dot"/>目前瀏覽虛構示範資料，共 18 個機關、10 年紀錄。</span><button className="text-link" onClick={()=>setAuth(true)}>登入以使用智慧查詢 <ArrowRight size={14}/></button></div>}
  {busy&&!dashboard.agencies.length?<div className="loading"><Spinner/>讀取資料中…</div>:<>
  {['overview','vacancy','additions'].includes(page)&&<>
   <div className="metrics">{[{label:'預算員額',value:num(totalBudget),sub:`${chosenYear??'—'} 年 · ${currentCategory}`,icon:Building2},{label:'現有員額',value:num(totalActual),sub:'依來源現員數統計',icon:LayoutDashboard},{label:'缺額人數',value:num(totalVacancies),sub:'直接採來源缺額欄位',icon:BarChart3},{label:'整體缺額率',value:percent(overallRate),sub:'缺額合計 ÷ 預算合計',icon:TrendingUp}].map((m,i)=><section className={'metric metric-'+i} key={m.label}><div className="metric-label">{m.label}<m.icon size={17}/></div><div className="metric-value">{m.value}<small>{i<3?'人':''}</small></div><div className="metric-sub">{m.sub}</div></section>)}</div>
   {!!incomplete&&<Notice>{incomplete} 個機關資料缺漏，相關總額顯示「—」。</Notice>}
   <section className="panel filters"><label className="search-field"><Search size={16}/><input aria-label="搜尋機關" placeholder="搜尋機關名稱或代碼" value={keyword} onChange={e=>setKeyword(e.target.value)}/></label>{page!=='additions'?<><label>年度<select value={chosenYear||''} onChange={e=>setYear(Number(e.target.value))}>{availableYears.map(y=><option key={y} value={y}>{y} 年</option>)}</select></label><label>人力類別<select value={page==='overview'?category:currentCategory} onChange={e=>setCategory(e.target.value)}>{(page==='overview'?['合計','職員','聘僱','工友','約僱','約用']:['合計','職員','聘僱','工友']).map(c=><option key={c} value={c}>{page==='overview'&&c==='合計'?'全部':c}</option>)}</select></label></>:<label>統計期間<select value={yearsN} onChange={e=>setYearsN(Number(e.target.value))}>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>近 {n} 年</option>)}</select></label>}<label className="check-label"><input type="checkbox" checked={withSubs} onChange={e=>setWithSubs(e.target.checked)}/>主管機關含所屬</label>{page==='vacancy'&&<><label>缺額率門檻 (%)<input className="threshold" type="number" min="0" max="100" value={threshold} placeholder="不限" onChange={e=>setThreshold(e.target.value)}/></label><label>排序<select value={vacSort} onChange={e=>setVacSort(e.target.value)}><option value="vacancy_rate">缺額率由高至低</option><option value="vacancies">缺額數由高至低</option></select></label></>}</section>
   <ResultView result={standardResult} onAgency={setSelectedAgency}/>
   {page==='additions'&&<ResultView result={makeResult('各年度核增趨勢',Array.from({length:yearsN},(_,i)=>firstAdditionYear+i).map(y=>{const selectedCodes=displayAgencies.map(a=>a.agency_code);const codes=withSubs?dashboard.agencies.filter(a=>selectedCodes.includes(a.agency_code)||selectedCodes.includes(a.parent_code)).map(a=>a.agency_code):selectedCodes;const rs=dashboard.additions.filter(r=>r.year===y&&codes.includes(r.agency_code));return {year:y,additions:rs.length===codes.length*4?sum(rs,'additions'):null};}),'year',['additions'],'line')}/>}
  </>}
  {page==='query'&&<>
   <section className="query-hero"><div className="query-heading"><span className="sparkle-box"><Sparkles size={23}/></span><div><h2>您想了解哪些員額資訊？</h2><p>比較、排名、趨勢，或跨來源交叉分析。</p></div><span className="model-tag">{modelStatus?.model||'智慧分析'}</span></div><form onSubmit={e=>{e.preventDefault();void ask();}}><textarea aria-label="分析問題" placeholder="例如：哪些機關近三年持續核增，目前缺額率仍高於 10%？" value={question} maxLength={2000} onChange={e=>setQuestion(e.target.value)} disabled={queryBusy}/><div className="query-bottom"><span>請使用公開或示範資料提問，問題與欄位定義將送至所設定的模型服務。</span><button className="button primary" disabled={queryBusy||!question.trim()}>{queryBusy?<Spinner/>:<Sparkles size={15}/>} {queryBusy?'分析中…':'開始分析'}<ArrowRight size={15}/></button></div></form><div className="query-examples">{examples.map((q,i)=><button key={q} disabled={queryBusy} onClick={()=>void ask(q)}><span>0{i+1}</span>{q}<ArrowRight size={13}/></button>)}</div></section>
   {modelStatus&&!modelStatus.configured&&<Notice error>模型設定不完整，請於 Supabase Secrets 設定供應商的 API Key 與模型名稱。</Notice>}
   {queryBusy&&<div className="query-progress"><Spinner/><div>正在理解問題、查詢資料與規劃圖表…<small>可能需要約一分鐘；模型服務繁忙時會顯示錯誤。</small></div></div>}
   {queryMessage&&<Notice>{queryMessage}</Notice>}
   {queryResult&&<ResultView result={queryResult}/>}
   <section className="panel history-panel"><button className="history-toggle" onClick={()=>{setShowHistory(!showHistory);if(session)void loadHistory();}}><History size={17}/><strong>最近的分析</strong><span>{history.length} 筆</span><ChevronRight size={15} className={showHistory?'rotate':''}/></button>{showHistory&&<div className="history-list">{history.length?history.map(h=><button key={h.id} onClick={()=>{setQuestion(h.question);setQueryResult(h.result);setQueryMessage('已開啟歷史結果；資料為當時查詢的快照。');}}><span>{h.question}</span><small>{new Date(h.created_at).toLocaleString('zh-TW')}</small><ArrowRight size={15}/></button>):<p className="muted">尚無查詢紀錄。完成分析後會自動保存。</p>}</div>}</section>
  </>}
  {page==='import'&&<>
   <SyncStatus dashboard={dashboard}/>
   <details className="panel backup-import"><summary><Upload size={23}/><div><strong>備援：手動匯入資料</strong><span>來源同步中斷或緊急補登時使用</span></div><ChevronRight size={22}/></summary><div className="backup-content">
   <div className="import-grid"><section className="panel import-main"><div className="panel-head"><div><span className="eyebrow">STEP 01</span><h2>選擇來源與檔案</h2></div><FileSpreadsheet size={22} className="muted"/></div><div className="source-picker">{(Object.keys(SOURCES)as Source[]).map(k=><button key={k} className={source===k?'selected':''} onClick={()=>{setSource(k);setPending(null);setImportMessage('');}}><span className="source-dot" style={{background:SOURCES[k].color}}/><span>{SOURCES[k].short}</span>{source===k&&<Check size={14}/>}</button>)}</div><h3>{SOURCES[source].name}</h3><p className="muted field-list">必要欄位：{SOURCES[source].headers.join('、')}</p>{session?<label className="upload-area"><Upload size={28}/><strong>{importBusy?'正在處理檔案…':'選擇 Excel 或 CSV 檔案'}</strong><span>.xlsx / .csv · 20 MB 內 · 僅讀取第一個工作表</span><input type="file" aria-label="匯入檔案" accept=".xlsx,.csv" disabled={importBusy} onChange={e=>{const f=e.target.files?.[0];if(f)void selectFile(f);e.target.value='';}}/></label>:<div className="upload-area upload-locked"><LogIn size={28}/><strong>請先登入才能上傳檔案</strong><span>登入後即可使用備援匯入功能。</span><button className="button primary" type="button" onClick={()=>setAuth(true)}><LogIn size={17}/>登入後匯入</button></div>}<div className="import-controls"><label>資料基準日<input type="date" required value={baseDate} onChange={e=>setBaseDate(e.target.value)}/></label><a className="button secondary" href={assetUrl(`samples/${source}.xlsx`)} download><ArrowDownToLine size={15}/>下載 Excel 範例</a><a className="text-link" href={assetUrl(`samples/${source}.csv`)} download>CSV 範例</a></div>{importMessage&&<Notice>{importMessage}</Notice>}{pending&&session&&<div className="pending"><Check size={18}/><div><strong>{pending.file}</strong><p>欄位檢查完成，共 {num(pending.records.length)} 筆正規化資料。尚未寫入資料庫。</p></div><button className="button primary" disabled={!session||importBusy||!baseDate} onClick={()=>void commit()}>{importBusy?<Spinner/>:null}確認匯入</button></div>}</section><aside className="panel import-notes"><span className="eyebrow">IMPORT NOTES</span><h2>資料口徑</h2><ol><li><strong>每次匯入保留快照</strong><p>同來源分析採用您最後匯入的批次，舊資料保留於資料庫。</p></li><li><strong>缺漏不等於零</strong><p>空白數值保留為缺漏，實際為零請填入 0。</p></li><li><strong>機關階層</strong><p>範例以 001、001-01 區分主管及所屬。母機關數字不含所屬。</p></li><li><strong>僅供開發的假資料</strong><p>範例數字均為虛構。D5 增額暫以核定增加解讀。</p></li></ol><Notice>目前僅使用可送至外部模型的公開或示範資料。</Notice></aside></div>
   </div></details>
   <section className="panel"><div className="panel-head"><div><span className="eyebrow">DATA INVENTORY</span><h2>目前使用的資料批次</h2></div></div><div className="table-wrap"><table><thead><tr><th>來源</th><th>狀態</th><th>基準日</th><th className="number">正規化筆數</th><th>檔案名稱</th><th>匯入時間</th></tr></thead><tbody>{(Object.keys(SOURCES)as Source[]).map(k=>{const d=dashboard.sources.find(s=>s.source===k);return <tr key={k}><td><span className="source-dot" style={{background:SOURCES[k].color}}/>{SOURCES[k].name}</td><td><span className="status-tag">{d?d.is_demo?'示範資料':'手動備援匯入':'尚未匯入'}</span></td><td>{d?.base_date||'—'}</td><td className="number">{num(d?.record_count)}</td><td>{d?.file_name||'—'}</td><td>{d?new Date(d.created_at).toLocaleString('zh-TW'):'—'}</td></tr>;})}</tbody></table></div></section>
  </>}
  </>}
  <footer><span>AI HEADCOUNT <span className="footer-divider">/</span> 中央機關員額資料整合查詢</span></footer></main></div>
  {auth&&<AuthModal close={()=>setAuth(false)} onSignedIn={()=>{}}/>}
  {drillResult&&<div className="modal-backdrop" onClick={()=>setSelectedAgency(null)}><div className="modal detail-modal" role="dialog" aria-modal="true" aria-label="機關歷年明細" onClick={e=>e.stopPropagation()}><button className="icon-button close" aria-label="關閉" onClick={()=>setSelectedAgency(null)}><X/></button><h2>{dashboard.agencies.find(a=>a.agency_code===selectedAgency)?.agency_name}</h2><ResultView result={drillResult}/></div></div>}
 </div>;
}
