-- Run through an authorized SQL connection. All fixtures and operations roll back.
begin;
insert into public.empresas(id) values('operational-test-tenant');
insert into public.users(id,auth_user_id,empresa_id,role,nome,permissions) values
 ('operational-test-user','00000000-0000-4000-8000-000000000091','operational-test-tenant','coordenador','Operational test','{"admin":{"visualizarUsuarios":true}}');
insert into public.clients(id,empresa_id,name,city,google_drive_url) values('operational-test-client','operational-test-tenant','Operational test','Suzano','https://drive.google.com/drive/folders/test');
insert into public.client_contracts(id,empresa_id,client_id,contract_number,deleted_at) values
 ('operational-test-a','operational-test-tenant','operational-test-client','OP-TEST-A',null),
 ('operational-test-b','operational-test-tenant','operational-test-client','OP-TEST-B',null),
 ('operational-test-c','operational-test-tenant','operational-test-client','OP-TEST-C',null),
 ('operational-test-deleted','operational-test-tenant','operational-test-client','OP-TEST-DELETED',now()),
 ('operational-test-empty','operational-test-tenant','operational-test-client','OP-TEST-EMPTY',null);
insert into public.client_contract_pieces(id,empresa_id,contract_id,piece_label) values
 ('operational-test-p1','operational-test-tenant','operational-test-a','Bancada'),
 ('operational-test-p2','operational-test-tenant','operational-test-a','Ilha'),
 ('operational-test-p3','operational-test-tenant','operational-test-b','Lavatório'),
 ('operational-test-p5','operational-test-tenant','operational-test-c','Soleira histórica'),
 ('operational-test-p4','operational-test-tenant','operational-test-deleted','Soleira');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
set local role authenticated;
do $$
declare d jsonb; board jsonb; version int:=0; failed boolean; event_id text; dependency_id text; occurrence text; due date; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  board:=public.operational_board('{}');
  if (board->>'total')::int<>3 or board->'cards'->0->>'stage'<>'sold' then raise exception 'FAIL: automatic cards/tenant/soft-delete'; end if;
  if app_private.operational_add_days('2026-09-04',1,'Itaquaquecetuba')<>date '2026-09-09' then raise exception 'FAIL: business days'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-a',version,'move','{"stage":"measurement"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: measurement date required'; end if;
  d:=public.operational_mutate('operational-test-a',version,'move',jsonb_build_object('stage','measurement','date',today,'time','14:00')); version:=version+1;
  if d->'card'->>'measurement_date'<>today::text or jsonb_array_length(d->'schedules')<>1 then raise exception 'FAIL: calendar sync'; end if;
  event_id:=d->'schedules'->0->>'id';
  failed:=false; begin perform public.operational_mutate('operational-test-a',version,'schedule',jsonb_build_object('kind','measurement','date',today+1)); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: reschedule reason required'; end if;
  d:=public.operational_mutate('operational-test-a',version,'schedule',jsonb_build_object('kind','measurement','date',today+1,'reason','Cliente solicitou')); version:=version+1;
  if jsonb_array_length(d->'schedules')<>1 or d->'schedules'->0->>'id'<>event_id or not exists(select 1 from public.operational_events where contract_id='operational-test-a' and kind='schedule' and payload->>'previous_date'=today::text) then raise exception 'FAIL: reschedule duplication/history'; end if;
  if not exists(select 1 from public.calendar_events where id=event_id and all_day is true and event_time is null) then raise exception 'FAIL: optional schedule time'; end if;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"executive"}'); version:=version+1;
  due:=(d->'card'->>'due_date')::date;
  if due<>app_private.operational_add_days(today,15,'Suzano') then raise exception 'FAIL: executive SLA'; end if;
  d:=public.operational_mutate('operational-test-a',version,'block','{"reason":"client","pause_sla":true,"note":"Aguardando cliente"}'); version:=version+1;
  if d->'card'->>'paused'<>'true' then raise exception 'FAIL: SLA pause'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-a',version,'move','{"stage":"approval"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: move while blocked'; end if;
  d:=public.operational_mutate('operational-test-a',version,'unblock','{}'); version:=version+1;
  if d->'card'->>'paused'<>'false' or (d->'card'->>'due_date')::date<>due then raise exception 'FAIL: resume'; end if;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"approval"}'); version:=version+1;
  failed:=false; begin perform public.operational_mutate('operational-test-a',version,'move','{"stage":"ready"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: critical checklist'; end if;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"ready","approved":true,"measures_checked":true}'); version:=version+1;
  if (d->'card'->>'due_date')::date<>app_private.operational_add_days(today,25,'Suzano') then raise exception 'FAIL: installation SLA'; end if;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"cutting","production_released":true}'); version:=version+1;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"finishing"}'); version:=version+1;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"assembly"}'); version:=version+1;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"inspection"}'); version:=version+1;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"final_finishing"}'); version:=version+1;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"delivery","inspection_done":true}'); version:=version+1;
  d:=public.operational_mutate('operational-test-a',version,'dependency','{"piece_id":"operational-test-p2","kind":"furniture"}'); version:=version+1;
  dependency_id:=d->'dependencies'->0->>'id';
  if (d->'card'->>'dependent_count')::int<>1 then raise exception 'FAIL: piece dependency'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-a',version,'move',jsonb_build_object('stage','installation','date',today)); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: blocked piece schedule confirmation'; end if;
  d:=public.operational_mutate('operational-test-a',version,'move',jsonb_build_object('stage','installation','date',today,'confirm_warning',true)); version:=version+1;
  select id into event_id from public.calendar_events where operational_contract_id='operational-test-a' and operational_kind='installation';
  d:=public.operational_mutate('operational-test-a',version,'install_pieces',jsonb_build_object('event_id',event_id,'piece_ids',jsonb_build_array('operational-test-p1'),'note','Primeira visita')); version:=version+1;
  if (d->'card'->>'installed_count')::int<>1 or d->'card'->>'stage'<>'installation' then raise exception 'FAIL: partial installation'; end if;
  if d->'pieces'->0->>'installed_at' is null or not exists(select 1 from public.operational_events where contract_id='operational-test-a' and kind='install_pieces') then raise exception 'FAIL: installation timestamp/history'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-a',version,'install_pieces',jsonb_build_object('piece_ids',jsonb_build_array('operational-test-p2','operational-test-p3'),'date',today)); exception when others then failed:=true; end;
  if not failed or exists(select 1 from public.operational_pieces where piece_id='operational-test-p2' and installed_at is not null) then raise exception 'FAIL: atomic batch/IDOR'; end if;
  d:=public.operational_mutate('operational-test-a',version,'correct_installation','{"piece_id":"operational-test-p1","reason":"Marcada por engano"}'); version:=version+1;
  if (d->'card'->>'installed_count')::int<>0 or not exists(select 1 from public.operational_visit_pieces where piece_id='operational-test-p1' and corrected_at is not null and correction_reason='Marcada por engano') then raise exception 'FAIL: audited installation correction'; end if;
  d:=public.operational_mutate('operational-test-a',version,'install_pieces',jsonb_build_object('piece_ids',jsonb_build_array('operational-test-p1'),'date',today,'time','10:35')); version:=version+1;
  if (d->'card'->>'installed_count')::int<>1 then raise exception 'FAIL: individual reinstall'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-a',version,'move','{"stage":"completed"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: premature completion'; end if;
  d:=public.operational_mutate('operational-test-a',version,'dependency_release',jsonb_build_object('id',dependency_id)); version:=version+1;
  d:=public.operational_mutate('operational-test-a',version,'install_pieces',jsonb_build_object('piece_ids',jsonb_build_array('operational-test-p2'),'date',today)); version:=version+1;
  if jsonb_array_length(d->'visits')<>3 or (d->'card'->>'installed_count')::int<>2 or d->'card'->>'stage'<>'installation' then raise exception 'FAIL: multiple visits/no automatic completion'; end if;
  d:=public.operational_mutate('operational-test-a',version,'move','{"stage":"completed"}'); version:=version+1;
  if d->'card'->>'stage'<>'completed' then raise exception 'FAIL: completion'; end if;
  if (public.operational_board('{}')->>'total')::int<>1 then raise exception 'FAIL: completed hidden'; end if;
  d:=public.operational_mutate('operational-test-a',version,'aftercare_open','{"reason":"Ocorrencia geral","piece_ids":[]}'); version:=version+1;
  occurrence:=d->'aftercare'->0->>'id';
  d:=public.operational_mutate('operational-test-a',version,'aftercare_resolve',jsonb_build_object('id',occurrence,'reason','Resolvido')); version:=version+1;
  if d->'card'->>'stage'<>'completed' then raise exception 'FAIL: zero-piece aftercare'; end if;
  d:=public.operational_mutate('operational-test-a',version,'aftercare_open','{"reason":"Uma peca","piece_ids":["operational-test-p1"]}'); version:=version+1;
  select id into occurrence from public.operational_aftercare where contract_id='operational-test-a' and resolved_at is null;
  d:=public.operational_mutate('operational-test-a',version,'aftercare_open','{"reason":"Duas pecas","piece_ids":["operational-test-p1","operational-test-p2"]}'); version:=version+1;
  if jsonb_array_length(d->'aftercare')<>3 then raise exception 'FAIL: multiple aftercare/history'; end if;
  d:=public.operational_mutate('operational-test-a',version,'aftercare_resolve',jsonb_build_object('id',occurrence,'reason','Resolvido')); version:=version+1;
  if d->'card'->>'stage'<>'aftercare' then raise exception 'FAIL: remaining open occurrence'; end if;
  select id into occurrence from public.operational_aftercare where contract_id='operational-test-a' and resolved_at is null;
  d:=public.operational_mutate('operational-test-a',version,'aftercare_resolve',jsonb_build_object('id',occurrence,'reason','Resolvido')); version:=version+1;
  if d->'card'->>'stage'<>'completed' or jsonb_array_length(d->'aftercare')<>3 then raise exception 'FAIL: final aftercare resolution/history'; end if;
  if d->>'drive_url'<>'https://drive.google.com/drive/folders/test' then raise exception 'FAIL: existing Drive link'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-a',version-1,'priority','{"priority":"urgent"}'); exception when serialization_failure then failed:=true; end;
  if not failed then raise exception 'FAIL: stale version'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-b',0,'piece','{"piece_id":"operational-test-p1","stage":"cutting"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: contract-piece IDOR'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-deleted',0,'note','{"note":"x"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: deleted contract'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-b',0,'note','{"note":"<script>alert(1)</script>"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: HTML input'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-c',0,'manual_stage_adjust','{"stage":"cutting"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: manual adjustment reason required'; end if;
  d:=public.operational_mutate('operational-test-c',0,'manual_stage_adjust','{"stage":"cutting","reason":"Contrato ja estava em producao antes da implantacao"}');
  if d->'card'->>'stage'<>'cutting' or jsonb_array_length(d->'schedules')<>0 or jsonb_array_length(d->'slas')<>0 then raise exception 'FAIL: manual stage adjustment without invented dates'; end if;
  if (select count(*) from public.operational_events where contract_id='operational-test-c')<>1 or exists(select 1 from public.operational_events where contract_id='operational-test-c' and kind='move') then raise exception 'FAIL: manual adjustment single honest event'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-b',0,'move','{"stage":"cutting","production_released":true}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: manual adjustment must not loosen normal move guard'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-c',0,'manual_stage_adjust','{"stage":"completed","reason":"stale"}'); exception when serialization_failure then failed:=true; end;
  if not failed then raise exception 'FAIL: manual adjustment stale version'; end if;
  d:=public.operational_mutate('operational-test-c',1,'manual_stage_adjust','{"stage":"completed","reason":"Contrato finalizado antes da implantacao"}');
  if d->'card'->>'stage'<>'completed' or (d->'card'->>'installed_count')::int<>0 then raise exception 'FAIL: historical completion state'; end if;
  if exists(select 1 from public.operational_visits where contract_id='operational-test-c') or exists(select 1 from public.operational_pieces where contract_id='operational-test-c' and installed_at is not null) then raise exception 'FAIL: historical completion must not create fake installation'; end if;
  if not exists(select 1 from public.operational_events where contract_id='operational-test-c' and kind='manual_stage_adjust' and payload->>'historical_completed'='true') then raise exception 'FAIL: historical completion audit'; end if;
  failed:=false; begin update public.operational_events set kind='tampered'; exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'FAIL: immutable history'; end if;
  failed:=false; begin update public.calendar_events set date_key=(today+2)::text where id=event_id; exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: direct calendar mutation'; end if;
  if (public.operational_board('{"situation":"blocked"}')->>'total')::int<>0 then raise exception 'FAIL: blocked filter'; end if;
  if (public.operational_detail('operational-test-a')->'card'->>'version')::int<>version then raise exception 'FAIL: persistence'; end if;
  d:=public.operational_settings_save('{"executive_days":12,"installation_days":20,"attention_days":4,"urgent_days":1}');
  if (d->>'executive_days')::int<>12 then raise exception 'FAIL: settings'; end if;
  failed:=false; begin perform public.operational_mutate('operational-test-b',0,'move','{"stage":"completed"}'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: invalid stage jump'; end if;
  d:=public.operational_mutate('operational-test-b',0,'move',jsonb_build_object('stage','measurement','date',today));
  d:=public.operational_mutate('operational-test-b',1,'move','{"stage":"executive"}');
  d:=public.operational_mutate('operational-test-b',2,'move','{"stage":"approval"}');
  d:=public.operational_mutate('operational-test-b',3,'move','{"stage":"ready","approved":true,"measures_checked":true}');
  d:=public.operational_mutate('operational-test-b',4,'move','{"stage":"cutting","production_released":true}');
  d:=public.operational_mutate('operational-test-b',5,'move','{"stage":"finishing"}');
  d:=public.operational_mutate('operational-test-b',6,'move','{"stage":"assembly"}');
  d:=public.operational_mutate('operational-test-b',7,'move','{"stage":"inspection"}');
  d:=public.operational_mutate('operational-test-b',8,'move','{"stage":"finishing","reason":"Retorno para ajuste"}');
  if d->'card'->>'stage'<>'finishing' or not exists(select 1 from public.operational_events where contract_id='operational-test-b' and payload->>'reason'='Retorno para ajuste') then raise exception 'FAIL: backward transition history'; end if;
  d:=public.operational_mutate('operational-test-b',9,'move','{"stage":"ready","approved":true,"measures_checked":true,"reason":"Retorno operacional"}');
  failed:=false; begin perform public.operational_mutate('operational-test-b',10,'schedule',jsonb_build_object('kind','installation','date',today+200)); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: outside SLA confirmation'; end if;
  d:=public.operational_mutate('operational-test-b',10,'schedule',jsonb_build_object('kind','installation','date',today+200,'confirm_warning',true));
  if not exists(select 1 from public.operational_events where contract_id='operational-test-b' and payload->>'outside_deadline'='true') then raise exception 'FAIL: outside SLA history'; end if;
end $$;
reset role;
-- Simulate a pause spanning several business days without persisting any fixture.
update public.operational_slas set started_on=(now() at time zone 'America/Sao_Paulo')::date-10,original_due=(now() at time zone 'America/Sao_Paulo')::date+30,due_date=(now() at time zone 'America/Sao_Paulo')::date+30 where contract_id='operational-test-b';
select public.operational_mutate('operational-test-b',11,'block','{"reason":"client","pause_sla":true}');
update public.operational_blocks set started_at=now()-interval '5 days' where contract_id='operational-test-b' and ended_at is null;
set local role authenticated;
do $$ declare d jsonb; expected date; original date; today date:=(now() at time zone 'America/Sao_Paulo')::date; begin
  select original_due,app_private.operational_add_days(due_date,app_private.operational_days_between(today-5,today,'Suzano'),'Suzano') into original,expected from public.operational_slas where contract_id='operational-test-b';
  if (public.operational_detail('operational-test-b')->'card'->>'due_date')::date<>expected then raise exception 'FAIL: effective paused deadline'; end if;
  d:=public.operational_mutate('operational-test-b',12,'unblock','{}');
  if (d->'card'->>'due_date')::date<>expected or (d->'slas'->0->>'original_due')::date<>original then raise exception 'FAIL: multi-day resume/original SLA preserved'; end if;
end $$;
reset role;
insert into public.operational_events(empresa_id,contract_id,kind,payload,actor_uid,actor_name,created_at)
select 'operational-test-tenant','operational-test-b','note',jsonb_build_object('note','Evento de teste '||n),'00000000-0000-4000-8000-000000000091','Operational test',clock_timestamp()-interval '1 year'+n*interval '1 second' from generate_series(1,210) n;
set local role authenticated;
do $$ declare d jsonb; last_event jsonb; older jsonb; begin
  d:=public.operational_detail('operational-test-b');
  if jsonb_array_length(d->'events')<>200 then raise exception 'FAIL: timeline initial bound'; end if;
  last_event:=d->'events'->199;
  older:=public.operational_events_page('operational-test-b',(last_event->>'created_at')::timestamptz,last_event->>'id');
  if jsonb_array_length(older)<10 or jsonb_array_length(older)>100 then raise exception 'FAIL: timeline pagination'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$ declare failed boolean:=false; begin
  begin perform public.operational_detail('operational-test-a'); exception when others then failed:=true; end;
  if not failed then raise exception 'FAIL: tenant IDOR'; end if;
  if exists(select 1 from public.operational_events where contract_id='operational-test-a') then raise exception 'FAIL: tenant RLS'; end if;
end $$;
reset role;
select 'PASS: operational transactional integration suite; fixtures rolled back' as result;
rollback;
