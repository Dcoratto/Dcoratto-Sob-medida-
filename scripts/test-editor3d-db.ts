// Isolated PostgreSQL with real migration/functions/RLS; never connects to the production database.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve(process.env.PGLITE_MODULE || '.npm-cache/material-alternatives-test/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();
try {
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema app_private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,app_private to authenticated; grant execute on function auth.uid() to authenticated;
    create table public.empresas(id text primary key);
    create table public.users(id text primary key,auth_user_id uuid,empresa_id text,blocked boolean,role text,permissions jsonb,updated_at timestamptz);
    create function app_private.current_empresa_id() returns text language sql stable security definer set search_path='' as $$select u.empresa_id from public.users u where u.auth_user_id=auth.uid() order by updated_at desc nulls last,id limit 1$$;
    grant execute on function app_private.current_empresa_id() to authenticated;
    create table public.quotes(id text primary key,empresa_id text,pieces jsonb,total_area numeric,total_price numeric,material_id text,payment_method text);
    alter table quotes enable row level security;
    create policy tenant_all_quotes on quotes for all to authenticated using(empresa_id=app_private.current_empresa_id()) with check(empresa_id=app_private.current_empresa_id());
    grant select,insert,update on quotes to authenticated;
    grant select,update on users to authenticated;
    alter table users enable row level security;
    create policy self_users on users to authenticated using(auth_user_id=auth.uid()) with check(auth_user_id=auth.uid());
  `);
  await db.exec(readFileSync('supabase/migrations/20261011230428_quote_piece_editor3d.sql','utf8'));
  await db.exec(readFileSync('supabase/tests/quote_piece_editor3d.sql','utf8'));
  console.log('Editor3D PostgreSQL: SQL/RLS, authorization, IDOR, schema, CAS, immutability and official-data preservation passed');
} catch(error:any){console.error(error.message, error.position, error.internalQuery, error.where);process.exitCode=1;}
finally{await db.close();}
