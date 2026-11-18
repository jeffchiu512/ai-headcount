-- Synthetic-data development workspace. Private snapshots are scoped per user.
create schema if not exists headcount_private;
create schema if not exists analytics;
revoke all on schema headcount_private, analytics from public, anon;
grant usage on schema headcount_private, analytics to authenticated, service_role;

create table headcount_private.snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  source text not null check(source in ('webhr','d5cur','d5add','d7')),
  base_date date not null,
  file_name text not null check(length(file_name) between 1 and 250),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check ((owner_id is null and is_demo) or (owner_id is not null and not is_demo))
);
create index snapshots_owner_source on headcount_private.snapshots(owner_id,source,created_at desc);
create table headcount_private.records (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references headcount_private.snapshots(id) on delete cascade,
  agency_code text not null check(agency_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),
  agency_name text not null check(length(agency_name) between 1 and 120),
  parent_code text,
  year integer check(year between 1 and 300),
  category text not null check(category in ('職員','聘僱','工友','聘用','約僱','約用')),
  established integer check(established between 0 and 10000000),
  budget integer check(budget between 0 and 10000000),
  actual integer check(actual between 0 and 10000000),
  vacancies integer check(vacancies between 0 and 10000000),
  additions integer check(additions between 0 and 10000000),
  unique nulls not distinct(snapshot_id,agency_code,year,category)
);
create index records_snapshot on headcount_private.records(snapshot_id);
create index records_agency_year on headcount_private.records(agency_code,year);
alter table headcount_private.snapshots enable row level security;
alter table headcount_private.records enable row level security;
create policy snapshot_read on headcount_private.snapshots for select to authenticated
  using (is_demo or owner_id=(select auth.uid()));
create policy snapshot_insert on headcount_private.snapshots for insert to authenticated
  with check (owner_id=(select auth.uid()) and not is_demo);
create policy record_read on headcount_private.records for select to authenticated
  using (exists(select 1 from headcount_private.snapshots s where s.id=snapshot_id));
create policy record_insert on headcount_private.records for insert to authenticated
  with check (exists(select 1 from headcount_private.snapshots s where s.id=snapshot_id and s.owner_id=(select auth.uid()) and not s.is_demo));
grant select, insert on headcount_private.snapshots,headcount_private.records to authenticated;
grant usage,select on sequence headcount_private.records_id_seq to authenticated;
grant all on all tables in schema headcount_private to service_role;
grant usage,select on all sequences in schema headcount_private to service_role;

create view analytics.active_snapshots with(security_invoker=true) as
  select id,source,base_date,file_name,is_demo,created_at from (
    select s.*,row_number() over(partition by source order by is_demo asc,created_at desc,id desc) rn
    from headcount_private.snapshots s
  ) t where rn=1;
create view analytics.establishment with(security_invoker=true) as
  select r.agency_code,r.agency_name,r.parent_code,r.established,s.base_date,s.is_demo
  from headcount_private.records r join analytics.active_snapshots s on s.id=r.snapshot_id where s.source='webhr';
create view analytics.current_staff with(security_invoker=true) as
  select r.agency_code,r.agency_name,r.parent_code,r.year,r.category,r.budget,r.actual,r.vacancies,
    r.vacancies::numeric/nullif(r.budget,0) vacancy_rate,s.base_date,s.is_demo
  from headcount_private.records r join analytics.active_snapshots s on s.id=r.snapshot_id where s.source='d5cur';
create view analytics.additions with(security_invoker=true) as
  select r.agency_code,r.agency_name,r.parent_code,r.year,r.category,r.additions,s.source,s.base_date,s.is_demo
  from headcount_private.records r join analytics.active_snapshots s on s.id=r.snapshot_id where s.source in ('d5add','d7');
create view analytics.agencies with(security_invoker=true) as
  select distinct on(r.agency_code) r.agency_code,r.agency_name,r.parent_code
  from headcount_private.records r join analytics.active_snapshots s on s.id=r.snapshot_id
  order by r.agency_code,s.created_at desc;
grant select on all tables in schema analytics to authenticated,service_role;

create function public.hc_get_dashboard() returns jsonb language sql security invoker
  set search_path='' set statement_timeout='8s' as $$
 select jsonb_build_object(
  'sources',(select coalesce(jsonb_agg(x),'[]') from (select s.*,(select count(*) from headcount_private.records r where r.snapshot_id=s.id) record_count from analytics.active_snapshots s) x),
  'agencies',(select coalesce(jsonb_agg(x),'[]') from analytics.agencies x),
  'establishment',(select coalesce(jsonb_agg(x),'[]') from analytics.establishment x),
  'current',(select coalesce(jsonb_agg(x),'[]') from analytics.current_staff x),
  'additions',(select coalesce(jsonb_agg(x),'[]') from analytics.additions x)
 );
$$;
revoke all on function public.hc_get_dashboard() from public,anon;
grant execute on function public.hc_get_dashboard() to authenticated;

create function public.hc_import_snapshot(p_source text,p_base_date date,p_file_name text,p_records jsonb)
 returns uuid language plpgsql security invoker set search_path='' set statement_timeout='20s' as $$
 declare sid uuid;
 begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 25000 then raise exception '資料筆數須為 1–25,000'; end if;
  if p_source not in ('webhr','d5cur','d5add','d7') then raise exception '來源不正確'; end if;
  if exists(select 1 from jsonb_to_recordset(p_records) as r(year integer,category text,established integer,budget integer,actual integer,vacancies integer,additions integer)
   where case p_source
    when 'webhr' then r.year is not null or r.category<>'職員' or r.established is null
    when 'd5cur' then r.year is null or r.category not in ('職員','聘僱','工友')
    when 'd5add' then r.year is null or r.category not in ('職員','聘用','約僱')
    when 'd7' then r.year is null or r.category<>'約用' end)
  then raise exception '年度、人力類別或必要數值不符合來源定義'; end if;
  insert into headcount_private.snapshots(owner_id,source,base_date,file_name)
    values(auth.uid(),p_source,p_base_date,p_file_name) returning id into sid;
  insert into headcount_private.records(snapshot_id,agency_code,agency_name,parent_code,year,category,established,budget,actual,vacancies,additions)
    select sid,agency_code,agency_name,parent_code,year,category,established,budget,actual,vacancies,additions
    from jsonb_to_recordset(p_records) as r(agency_code text,agency_name text,parent_code text,year integer,category text,established integer,budget integer,actual integer,vacancies integer,additions integer);
  return sid;
 end;
$$;
revoke all on function public.hc_import_snapshot(text,date,text,jsonb) from public,anon;
grant execute on function public.hc_import_snapshot(text,date,text,jsonb) to authenticated;

create table public.headcount_query_history (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 question text not null,sql text not null,title text not null,result jsonb not null,
 created_at timestamptz not null default now()
);
create index headcount_query_history_owner_created on public.headcount_query_history(owner_id,created_at desc);
alter table public.headcount_query_history enable row level security;
create policy history_read on public.headcount_query_history for select to authenticated using(owner_id=(select auth.uid()));
grant select on public.headcount_query_history to authenticated;
revoke all on public.headcount_query_history from anon;
grant all on public.headcount_query_history to service_role;

-- The SQL executor owns no business tables, has no login, and cannot write data.
create role hc_query_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema headcount_private,analytics,public to hc_query_reader;
grant select on headcount_private.snapshots,headcount_private.records to hc_query_reader;
grant select on all tables in schema analytics to hc_query_reader;
create policy snapshot_query_read on headcount_private.snapshots for select to hc_query_reader
 using(is_demo or owner_id=nullif(current_setting('app.headcount_user_id',true),'')::uuid);
create policy record_query_read on headcount_private.records for select to hc_query_reader
 using(exists(select 1 from headcount_private.snapshots s where s.id=snapshot_id));
create function headcount_private.execute_query(p_sql text,p_user_id uuid) returns jsonb
 language plpgsql security definer set search_path='pg_catalog,analytics' set statement_timeout='8s' set lock_timeout='1s' as $$
 declare result jsonb; plan json; estimate numeric;
 begin
  if p_user_id is null or length(p_sql)>16000 or p_sql !~* '^\s*(select|with)\s' or p_sql ~ ';|--|/\*' then raise exception '查詢格式不正確'; end if;
  perform pg_catalog.set_config('app.headcount_user_id',p_user_id::text,true);
  execute 'explain (format json) '||p_sql into plan;
  estimate := (plan->0->'Plan'->>'Total Cost')::numeric;
  if estimate>150000 then raise exception '查詢範圍過大，請縮小年度或機關範圍'; end if;
  execute 'select coalesce(jsonb_agg(q),''[]''::jsonb) from (select * from ('||p_sql||') as result limit 501) q' into result;
  return result;
 end;
$$;
grant hc_query_reader to postgres;
grant create on schema headcount_private to hc_query_reader;
alter function headcount_private.execute_query(text,uuid) owner to hc_query_reader;
revoke create on schema headcount_private from hc_query_reader;
revoke all on function headcount_private.execute_query(text,uuid) from public,anon,authenticated;
grant execute on function headcount_private.execute_query(text,uuid) to service_role;
create function public.hc_execute_query(p_sql text,p_user_id uuid) returns jsonb language sql security invoker set search_path='' set statement_timeout='8s'
 as $$ select headcount_private.execute_query(p_sql,p_user_id); $$;
revoke all on function public.hc_execute_query(text,uuid) from public,anon,authenticated;
grant execute on function public.hc_execute_query(text,uuid) to service_role;

create table headcount_private.query_usage(user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create index query_usage_user_time on headcount_private.query_usage(user_id,created_at desc);
alter table headcount_private.query_usage enable row level security;
create function headcount_private.take_query_slot(p_user_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
 begin
  if p_user_id is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  if (select count(*) from headcount_private.query_usage where user_id=p_user_id and created_at>now()-interval '1 minute')>=8
    or (select count(*) from headcount_private.query_usage where user_id=p_user_id and created_at>=date_trunc('day',now()))>=100 then return false; end if;
  insert into headcount_private.query_usage(user_id) values(p_user_id);
  delete from headcount_private.query_usage where user_id=p_user_id and created_at<now()-interval '2 days';
  return true;
 end;
$$;
revoke all on function headcount_private.take_query_slot(uuid) from public,anon,authenticated;
grant execute on function headcount_private.take_query_slot(uuid) to service_role;
create function public.hc_take_query_slot(p_user_id uuid) returns boolean language sql security invoker set search_path=''
 as $$ select headcount_private.take_query_slot(p_user_id); $$;
revoke all on function public.hc_take_query_slot(uuid) from public,anon,authenticated;
grant execute on function public.hc_take_query_slot(uuid) to service_role;
