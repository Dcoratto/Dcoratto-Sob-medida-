-- Execute in the isolated scripts/test-editor3d-db.ts harness. All fixtures roll back.
begin;
insert into empresas values('editor3d-test'),('editor3d-other');
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000101','beta-authorized@example.test',now()),
 ('00000000-0000-4000-8000-000000000102','beta-denied@example.test',now()),
 ('00000000-0000-4000-8000-000000000103','beta-other@example.test',now());
insert into users(id,auth_user_id,empresa_id,role,permissions) values
 ('editor3d-allowed','00000000-0000-4000-8000-000000000101','editor3d-test','vendedor','{}'),
 ('editor3d-denied','00000000-0000-4000-8000-000000000102','editor3d-test','vendedor','{}'),
 ('editor3d-other','00000000-0000-4000-8000-000000000103','editor3d-other','vendedor','{}');
insert into quote_editor3d_access_grants(user_id,empresa_id) values('00000000-0000-4000-8000-000000000101','editor3d-test');
insert into quotes(id,empresa_id,pieces,total_area,total_price,material_id,payment_method) values
 ('editor3d-q','editor3d-test','[{"id":"p1","length":250,"width":60,"quantity":3,"area":1.5,"drawingJson":"official"}]',4.5,9000,'stone','pix'),
 ('editor3d-q2','editor3d-test','[{"id":"p2"}]',1,100,'stone','pix'),
 ('editor3d-duplicate','editor3d-test','[{"id":"p1"},{"id":"p1"}]',1,100,'stone','pix'),
 ('editor3d-foreign','editor3d-other','[{"id":"foreign"}]',1,100,'stone','pix');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
set local role authenticated;
do $$
declare m jsonb:='{"schemaVersion":1,"type":"rectangular_countertop","dimensions":{"lengthMm":2500,"depthMm":600,"thicknessMm":20}}';
  d jsonb; n jsonb; snapshot jsonb; bad jsonb; rejected boolean; dimension text; value jsonb;
begin
  if not public.quote_editor3d_access() then raise exception 'FAIL: authorized access'; end if;
  select to_jsonb(q) into snapshot from quotes q where id='editor3d-q';
  if public.quote_piece_drawing_get('editor3d-q','p1') is not null then raise exception 'FAIL: empty drawing'; end if;
  d:=public.quote_piece_drawing_save('editor3d-q','p1',m,null);
  if d->>'revision'<>'1' or d->'model'<>m then raise exception 'FAIL: create'; end if;
  if public.quote_piece_drawing_get('editor3d-q','p1')<>d then raise exception 'FAIL: reopen'; end if;
  rejected:=false;begin perform public.quote_piece_drawing_save('editor3d-q','p1',m,null);exception when serialization_failure then rejected:=true;end;
  if not rejected then raise exception 'FAIL: concurrent create';end if;
  n:=public.quote_piece_drawing_save('editor3d-q','p1',jsonb_set(m,'{dimensions,lengthMm}','3000'),1);
  if n->>'revision'<>'2' then raise exception 'FAIL: increment';end if;
  rejected:=false;begin perform public.quote_piece_drawing_save('editor3d-q','p1',m,1);exception when serialization_failure then rejected:=true;end;
  if not rejected or public.quote_piece_drawing_get('editor3d-q','p1')<>n then raise exception 'FAIL: stale overwrite';end if;
  foreach dimension in array array['lengthMm','depthMm','thicknessMm'] loop
    for value in select * from jsonb_array_elements('[0,-1,999999,1.5,"NaN","Infinity",null,"2500"]') loop
      bad:=jsonb_set(m,array['dimensions',dimension],value);
      if app_private.valid_editor3d_model(bad) then raise exception 'FAIL: dimensions validator';end if;
      rejected:=false;begin perform public.quote_piece_drawing_save('editor3d-q','p1',bad,2);exception when others then rejected:=true;end;
      if not rejected then raise exception 'FAIL: invalid save';end if;
    end loop;
  end loop;
  for bad in select * from jsonb_array_elements('[null,[],{}, {"schemaVersion":2,"type":"rectangular_countertop","dimensions":{"lengthMm":2500,"depthMm":600,"thicknessMm":20}}]') loop
    if app_private.valid_editor3d_model(bad) then raise exception 'FAIL: schema validator';end if;
  end loop;
  if app_private.valid_editor3d_model(m||jsonb_build_object('padding',repeat('x',1024))) then raise exception 'FAIL: JSON size';end if;
  rejected:=false;begin perform public.quote_piece_drawing_save('editor3d-q2','p1',m,null);exception when others then rejected:=true;end;
  if not rejected then raise exception 'FAIL: piece from other quote';end if;
  rejected:=false;begin perform public.quote_piece_drawing_save('editor3d-foreign','foreign',m,null);exception when others then rejected:=true;end;
  if not rejected then raise exception 'FAIL: foreign tenant';end if;
  rejected:=false;begin perform public.quote_piece_drawing_save('editor3d-duplicate','p1',m,null);exception when others then rejected:=true;end;
  if not rejected then raise exception 'FAIL: duplicate piece';end if;
  rejected:=false;begin update quote_piece_drawings set quote_id='editor3d-q2',piece_id='p2',revision=revision+1 where id=(d->>'id')::uuid;exception when others then rejected:=true;end;
  if not rejected then raise exception 'FAIL: mutable link';end if;
  rejected:=false;begin update quote_piece_drawings set model=m where id=(d->>'id')::uuid;exception when serialization_failure then rejected:=true;end;
  if not rejected then raise exception 'FAIL: direct update without CAS';end if;
  if (select to_jsonb(q) from quotes q where id='editor3d-q')<>snapshot then raise exception 'FAIL: official data changed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
set local role authenticated;
do $$declare rejected boolean:=false;begin
  -- Existing self-editable user permissions/roles cannot grant access to the protected Beta.
  update users set role='administrativo',permissions='{"orcamento":{"editar":true,"visualizar":true},"admin":{"visualizarUsuarios":true}}' where id='editor3d-denied';
  if public.quote_editor3d_access() or exists(select 1 from quote_piece_drawings) then raise exception 'FAIL: unauthorized RLS/self-promotion';end if;
  begin perform public.quote_piece_drawing_get('editor3d-q','p1');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'FAIL: unauthorized RPC';end if;
  rejected:=false;begin insert into quote_editor3d_access_grants(user_id,empresa_id) values(auth.uid(),'editor3d-test');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'FAIL: self grant';end if;
  rejected:=false;begin insert into quote_piece_drawings(empresa_id,quote_id,piece_id,model) values('editor3d-test','editor3d-q2','p2','{"schemaVersion":1,"type":"rectangular_countertop","dimensions":{"lengthMm":2500,"depthMm":600,"thicknessMm":20}}');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'FAIL: direct unauthorized insert';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$declare rejected boolean:=false;begin
  begin perform public.quote_editor3d_access();exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'FAIL: anonymous RPC';end if;
end $$;
reset role;
rollback;
