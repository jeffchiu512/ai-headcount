import fs from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve(import.meta.dirname, '../public/samples');
await fs.mkdir(out, {recursive:true});
const agencies = ['行政發展部','公共建設部','數位服務部','環境資源部','社會服務部','文化教育部'].flatMap((name,i) => {
  const code = String(i+1).padStart(3,'0');
  return [{code, name:'示範'+name, parent_code:null}, {code:code+'-01',name:'示範'+name.replace('部','署')+'北區分署',parent_code:code}, {code:code+'-02',name:'示範'+name.replace('部','署')+'南區分署',parent_code:code}];
});
const sources = {
  webhr:{label:'WebHR 組織編制系統',headers:['機關代碼','機關名稱','編制員額(職員)'],rows:[],records:[]},
  d5cur:{label:'D5 現有員額調查表',headers:['年度','機關代碼','機關名稱',...['職員','聘僱','工友'].flatMap(c=>['預算員額','現有員額','缺額'].map(m=>`${m}(${c})`))],rows:[],records:[]},
  d5add:{label:'D5 請增員額情形一覽表',headers:['年度','機關代碼','機關名稱','職員','聘用','約僱'],rows:[],records:[]},
  d7:{label:'D7 多元人力填報系統',headers:['年度','機關代碼','機關名稱','約用'],rows:[],records:[]}
};
for (const [i,a] of agencies.entries()) {
  const base = a.parent_code ? 140+i*13 : 650+i*17;
  const common={agency_code:a.code,agency_name:a.name,parent_code:a.parent_code};
  const established=base+180;
  sources.webhr.rows.push([a.code,a.name,established]);
  sources.webhr.records.push({...common,year:null,category:'職員',established});
  for(let year=106;year<=115;year++) {
    const row=[year,a.code,a.name];
    for(const [j,category] of ['職員','聘僱','工友'].entries()) {
      const budget=j===0?base+(year-106)*9:j===1?35+i*3+(year-106)*2:8+i%5;
      const vacancies=Math.round(budget*(0.025+((i*7+year*3+j)%21)/100));
      const actual=budget-vacancies;
      row.push(budget,actual,vacancies);
      sources.d5cur.records.push({...common,year,category,budget,actual,vacancies});
    }
    sources.d5cur.rows.push(row);
    const adds=['職員','聘用','約僱'].map((_,j)=>(i*3+year*5+j*2)%(j?7:24));
    sources.d5add.rows.push([year,a.code,a.name,...adds]);
    ['職員','聘用','約僱'].forEach((category,j)=>sources.d5add.records.push({...common,year,category,additions:adds[j]}));
    const temp=(i*5+year*3)%16;
    sources.d7.rows.push([year,a.code,a.name,temp]);
    sources.d7.records.push({...common,year,category:'約用',additions:temp});
  }
}
const datasets=Object.entries(sources).map(([source,s])=>({source,label:s.label,base_date:'2026-11-18',file_name:`示範_${source}.csv`,headers:s.headers,rows:s.rows,records:s.records}));
await fs.writeFile(path.join(out,'demo.json'),JSON.stringify({agencies,datasets}));
// CSV files are serialized from exactly the same typed records as the demo snapshots.
for (const d of datasets) {
  const csv=[d.headers,...d.rows].map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');
  await fs.writeFile(path.join(out,`${d.source}.csv`),'\uFEFF'+csv);
}
console.log(datasets.map(d=>`${d.source}: ${d.rows.length} source rows / ${d.records.length} normalized records`).join('\n'));
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const seed=datasets.map(d=>`with snapshot as (
 insert into headcount_private.snapshots(source,base_date,file_name,is_demo)
 select ${quote(d.source)},'2026-11-18',${quote(d.file_name)},true
 where not exists(select 1 from headcount_private.snapshots where source=${quote(d.source)} and is_demo)
 returning id
)
insert into headcount_private.records(snapshot_id,agency_code,agency_name,parent_code,year,category,established,budget,actual,vacancies,additions)
select s.id,r.* from snapshot s cross join jsonb_to_recordset(${quote(JSON.stringify(d.records))}::jsonb)
as r(agency_code text,agency_name text,parent_code text,year integer,category text,established integer,budget integer,actual integer,vacancies integer,additions integer);`).join('\n');
await fs.writeFile(path.resolve(import.meta.dirname,'../supabase/seed.sql'),seed);
