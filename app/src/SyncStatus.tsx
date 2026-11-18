import {CheckCircle2,Database} from 'lucide-react';
import {SOURCES,num,type Dashboard,type Source} from './types';

export function SyncStatus({dashboard}:{dashboard:Dashboard}){
 return <section className="sync-section" aria-labelledby="sync-title"><div className="sync-heading"><div><h2 id="sync-title"><Database size={23}/>資料來源同步狀態</h2><p>以 API 同步作為主要資料來源，手動匯入保留為異常時的備援。</p></div><span className="demo-pill">DEMO 狀態展示</span></div><div className="sync-grid">{(Object.keys(SOURCES) as Source[]).map(source=>{
  const snapshot=dashboard.sources.find(s=>s.source===source);
  return <article className="sync-card" key={source} data-source={source}><div className="sync-card-top"><span className="source-badge" data-source={source}>{SOURCES[source].short}</span><span className="sync-state"><span className="sync-light"/>正常</span></div><h3>{SOURCES[source].name}</h3><div className="sync-message"><CheckCircle2 size={19}/>API 同步綠燈（示範）</div><dl><div><dt>資料基準日</dt><dd>{snapshot?.base_date||'—'}</dd></div><div><dt>目前資料筆數</dt><dd>{num(snapshot?.record_count)} 筆</dd></div><div><dt>目前批次</dt><dd>{snapshot?snapshot.is_demo?'示範資料':'手動備援匯入':'尚無資料'}</dd></div></dl></article>;
 })}</div></section>;
}
