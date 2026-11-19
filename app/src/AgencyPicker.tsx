import {useEffect,useRef,useState} from 'react';
import {ChevronDown,Search} from 'lucide-react';
import type {DataRow} from './types';

export function AgencyPicker({agencies,selected,onChange}:{agencies:DataRow[];selected:string[]|null;onChange:(codes:string[]|null)=>void}){
 const [search,setSearch]=useState('');
 const menu=useRef<HTMLDetailsElement>(null);
 const codes=agencies.map(a=>String(a.agency_code));
 const chosen=selected===null?codes:codes.filter(code=>selected.includes(code));
 const matches=agencies.filter(a=>`${a.agency_name} ${a.agency_code}`.toLowerCase().includes(search.trim().toLowerCase()));
 useEffect(()=>{
  const close=(event:PointerEvent)=>{if(menu.current&&!menu.current.contains(event.target as Node))menu.current.open=false;};
  document.addEventListener('pointerdown',close);
  return()=>document.removeEventListener('pointerdown',close);
 },[]);
 return <details className="agency-picker" ref={menu} onKeyDown={e=>{if(e.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}>
  <summary>比較機關 <span>{selected===null?'全部機關':`已選 ${chosen.length} 個機關`}</span><ChevronDown size={17}/></summary>
  <div className="agency-picker-menu">
   <label className="agency-picker-search"><Search size={16}/><input aria-label="搜尋可選機關" placeholder="搜尋機關名稱或代碼" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <div className="agency-picker-actions"><span>可複選 · 已選 {chosen.length} / {codes.length}</span><button type="button" className="text-link" onClick={()=>onChange(null)}>全選</button><button type="button" className="text-link" onClick={()=>onChange([])}>清除</button></div>
   <div className="agency-picker-options" role="group" aria-label="比較機關選項">
    {matches.map(a=>{const code=String(a.agency_code);return <label key={code}><input type="checkbox" checked={chosen.includes(code)} onChange={e=>onChange(e.target.checked?[...chosen,code]:chosen.filter(c=>c!==code))}/><span>{String(a.agency_name)}<small>{code}</small></span></label>;})}
    {!matches.length&&<p>找不到符合的機關。</p>}
   </div>
   <p className="agency-picker-help">搜尋僅縮小選單範圍，不會取消已勾選的機關。</p>
  </div>
 </details>;
}
