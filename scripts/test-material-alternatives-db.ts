// Isolated PostgreSQL harness. Install PGlite in the ignored .npm-cache directory; never connects to Supabase.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {calculateQuotePaymentTotals} from '../src/lib/quotePaymentSimulation';

const modulePath = resolve(process.env.PGLITE_MODULE || '.npm-cache/material-alternatives-test/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite} = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const migration = (name: string) => readFileSync(resolve('supabase/migrations', name), 'utf8');
const functionSql = (source: string, name: string) => {
  const start = source.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('$$;', source.indexOf('as $$', start)) + 3);
};
let assertions = 0;
async function rejects(sql: string, params: unknown[], pattern: RegExp) {
  await assert.rejects(db.query(sql, params), pattern); assertions++;
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema app_private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create function app_private.current_empresa_id() returns text language sql stable as $$select current_setting('test.empresa', true)$$;
    grant usage on schema app_private to authenticated;
    create table public.empresas(id text primary key);
    insert into public.empresas values ('tenant'), ('other');
    create table public.clients(id text, name text, city text, neighborhood text);
    create table public.settings(id text, company_name text, address text, email text, logo_url text, phone text, default_notes text);
    create table public.materials(id text primary key, empresa_id text, name text, active boolean default true,
      price_per_m2 numeric, base_cost_per_m2 numeric, base_minimum_sale_per_m2 numeric, provider text, category text,
      material_line text, material_type text, thickness_label text, texture text, image_url text,
      thumbnail_url text, medium_url text, original_url text);
    create table public.inventory(id text, empresa_id text, material_id text, status text, minimum_sale_price numeric,
      cost numeric, material_line text, material_type text, thickness_label text, texture text, provider text);
    create table public.quotes(id text primary key, empresa_id text, client_name text, commercial_notes text, commission_percent numeric,
      delivery_date timestamptz, delivery_days integer, entry_amount numeric, environment text, include_cutouts boolean,
      include_delivery boolean, include_labor boolean, include_sculpted_sink boolean, installment_amount numeric, installment_count integer,
      material_id text, material_name text, measurement_date timestamptz, negotiation_discount_percent numeric, payment_method text,
      payment_mode text, payment_notes text, pieces jsonb default '[]', pricing_snapshot jsonb, remaining_payment_method text,
      responsible text, rt_percent numeric, total_area numeric, total_payment_method text, total_price numeric,
      validity_date timestamptz, updated_at timestamptz, status text default 'Orçamento');
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at := now(); return new; end$$;
  `);
  const original = migration('20260809132529_quote_digital_presentations.sql');
  await db.exec(original.slice(0, original.indexOf('create or replace function app_private.build_quote_presentation_snapshot(')));
  await db.exec(functionSql(original, 'app_private.insert_quote_presentation_event'));
  // Actual installed builder + quantity extension, not a mocked calculation/snapshot builder.
  await db.exec(migration('20260813173634_quote_presentation_distribute_total_between_pieces.sql'));
  await db.exec(migration('20261007023721_quote_piece_quantity.sql'));
  // Crypto itself is outside this test; use PostgreSQL UUIDs for the acceptance token fixture.
  await db.exec(functionSql(migration('20260810101000_fix_quote_presentation_secure_token_generation.sql'), 'public.accept_quote_presentation')
    .replace("encode(extensions.gen_random_bytes(18), 'hex')", "replace(gen_random_uuid()::text, '-', '')"));
  await db.exec(functionSql(migration('20260831120000_quote_presentation_public_access_after_expiration.sql'), 'public.get_public_quote_presentation'));
  await db.exec(migration('20261009020810_quote_material_alternatives.sql'));
  // Verify the previously shipped quantity regression against the wrapped real builder too.
  await db.exec(readFileSync('supabase/tests/quote_piece_quantity.sql', 'utf8'));
  assertions++;
  await db.exec(`
    alter table public.quotes enable row level security;
    create policy tenant_quotes on public.quotes for all to authenticated
      using (empresa_id = app_private.current_empresa_id()) with check (empresa_id = app_private.current_empresa_id());
    grant select, insert, update on public.quotes to authenticated;
    grant select on public.materials, public.inventory to authenticated;
    set test.empresa = 'tenant';
    insert into public.materials(id,empresa_id,name,price_per_m2,base_minimum_sale_per_m2) values
      ('main','tenant','Principal',900,800), ('alt','tenant','Alternativo',1800,1000), ('foreign','other','Externo',100,50);
  `);
  await db.exec(readFileSync('supabase/tests/quote_material_alternatives.sql', 'utf8')); assertions++;
  const config = {ruleVersion: 1, subtotalBeforeAdjustment: 10000, legacyComplexityPercent: 0,
    totalsInput: {paymentMode: 'total', entryAmount: 0, selectedAdjustment: 0, commissionPercent: 0, negotiationDiscountPercent: 0, rtPercent: 0},
    options: [{id: 'option', principalMaterialId: 'main', materialId: 'alt', pieceIds: ['piece'], pricePerM2: 1800,
      standardPrice: 1800, minimumPrice: 1000, material: {id: 'alt', name: 'Alternativo'}, pieceDeltas: {piece: 5940}}]};
  await db.query(`insert into public.quotes(id,empresa_id,total_price,pieces,material_alternatives) values ('q','tenant',10000,$1,$2)`,
    [JSON.stringify([{id: 'piece', materialId: 'main', quantity: 3, presentationArea: 6, presentationValue: 10000}]), JSON.stringify(config)]);
  const persisted = await db.query(`select material_alternatives from public.quotes where id='q'`);
  assert.deepEqual(persisted.rows[0].material_alternatives, config); assertions++;
  const built = await db.query(`select app_private.build_quote_presentation_snapshot(q,null::public.clients,null::public.materials,null::public.settings,1) as snapshot from public.quotes q where id='q'`);
  const snapshot = built.rows[0].snapshot;
  assert.deepEqual(snapshot.materialAlternatives, config); assertions++;
  assert.equal(snapshot.pieces[0].quantity, 3); assertions++;
  const pid = '10000000-0000-4000-8000-000000000001';
  const vid = '20000000-0000-4000-8000-000000000001';
  const token = 'test-material-alternatives-token-0001';
  await db.query(`insert into public.quote_presentations(id,empresa_id,quote_id) values ($1,'tenant','q')`, [pid]);
  await db.query(`insert into public.quote_presentation_versions(id,presentation_id,empresa_id,quote_id,version_number,proposal_code,public_token,snapshot,valid_until) values ($1,$2,'tenant','q',1,'PROP-1',$3,$4,now()+interval '1 day')`, [vid,pid,token,JSON.stringify(snapshot)]);
  await db.query(`update public.quote_presentations set current_version_id=$1 where id=$2`, [vid,pid]);
  const confirm = `select public.accept_quote_presentation_materials($1,'Cliente Teste',$2,$3,$4) as result`;
  await rejects(confirm, [token,vid,'{"piece":"unoffered"}',15940], /não autorizado/);
  await rejects(confirm, [token,vid,'{"foreign-piece":"option"}',15940], /não autorizado/);
  await rejects(confirm, [token,vid,'{"piece":{"id":"option","price":1}}',15940], /somente IDs/);
  await rejects(confirm, [token,vid,'{"piece":"option"}',1], /Valor divergente/);
  await rejects(confirm, ['invalid',vid,'{}',10000], /inválida/);
  await rejects(confirm, [token,'20000000-0000-4000-8000-000000000002','{}',10000], /inválida/);
  // Quote edits require a new published version. The old endpoint must not bypass this rule.
  await db.exec(`update public.quotes set total_price=10001 where id='q'`);
  await rejects(confirm, [token,vid,'{}',10000], /desatualizada/);
  await rejects(`select public.accept_quote_presentation($1,'Cliente Teste')`, [token], /desatualizada/);
  await db.exec(`update public.quotes set total_price=10000 where id='q'`);
  await db.query(`update public.quote_presentation_versions set valid_until=now()-interval '1 day' where id=$1`,[vid]);
  await rejects(confirm,[token,vid,'{}',10000],/indisponível/);
  await db.query(`update public.quote_presentation_versions set valid_until=now()+interval '1 day' where id=$1`,[vid]);
  await db.query(`update public.quote_presentations set current_version_id=null where id=$1`,[pid]);
  await rejects(confirm,[token,vid,'{}',10000],/desatualizada/);
  await db.query(`update public.quote_presentations set current_version_id=$1 where id=$2`,[vid,pid]);
  await db.query(`update public.quote_presentation_versions set revoked_at=now() where id=$1`,[vid]);
  await rejects(confirm,[token,vid,'{}',10000],/indisponível/);
  await db.query(`update public.quote_presentation_versions set revoked_at=null where id=$1`,[vid]);
  // Catalog changes must not silently reprice an already published proposal.
  await db.exec(`update public.materials set price_per_m2=9999,base_minimum_sale_per_m2=9999 where id='alt'`);
  const accepted = await db.query(confirm,[token,vid,'{"piece":"option"}',15940]);
  assert.equal(accepted.rows[0].result.accepted,true); assertions++;
  const repeat = await db.query(confirm,[token,vid,'{"piece":"option"}',15940]);
  assert.deepEqual(repeat.rows[0].result,accepted.rows[0].result); assertions++;
  assert.equal((await db.query(`select count(*)::integer as count from public.quote_presentation_acceptances where version_id=$1`,[vid])).rows[0].count,1); assertions++;
  await rejects(confirm,[token,vid,'{}',10000],/já possui um aceite/);
  const evidence = await db.query(`select accepted_snapshot from public.quote_presentation_acceptances where version_id=$1`,[vid]);
  assert.equal(evidence.rows[0].accepted_snapshot.investment.totalPrice,15940); assertions++;
  assert.equal(evidence.rows[0].accepted_snapshot.originalSnapshot.investment.totalPrice,10000); assertions++;
  assert.equal(evidence.rows[0].accepted_snapshot.materialSelection.affectedPieces[0].piece.quantity,3); assertions++;
  const publicView = await db.query(`select public.get_public_quote_presentation($1) as payload`,[token]);
  assert.deepEqual(publicView.rows[0].payload.snapshot.materialSelection.selections,{piece:'option'}); assertions++;
  assert.equal(publicView.rows[0].payload.snapshot.materialSourceFingerprint,undefined); assertions++;
  assert.equal((await db.query(`select total_price from public.quotes where id='q'`)).rows[0].total_price,'10000'); assertions++;
  // Validate minimum price, ownership, duplicate and association rejection on persistence.
  const write = `update public.quotes set material_alternatives=$1 where id='q'`;
  await db.exec(`update public.materials set price_per_m2=1800,base_minimum_sale_per_m2=1000 where id='alt'`);
  const invalid = structuredClone(config); invalid.options[0].pricePerM2 = 999;
  await rejects(write,[JSON.stringify(invalid)],/mínimo/);
  const foreign = structuredClone(config); foreign.options[0].materialId='foreign';
  await rejects(write,[JSON.stringify(foreign)],/não autorizado/);
  const duplicate = structuredClone(config); duplicate.options.push({...duplicate.options[0],id:'duplicate'});
  await rejects(write,[JSON.stringify(duplicate)],/duplicada/);
  const badPiece = structuredClone(config); badPiece.options[0].pieceIds=['other-quote'];
  await rejects(write,[JSON.stringify(badPiece)],/não pertence/);
  const variant = structuredClone(config) as typeof config & {options: Array<typeof config.options[number] & {materialVariantKey?: string}>}; variant.options[0].materialVariantKey='arbitrary';
  await rejects(write,[JSON.stringify(variant)],/Variante/);
  await db.exec(`set role anon`);
  await rejects(`select * from public.quotes`,[],/permission denied/);
  await rejects(`select app_private.material_simulation_total('{}',0)`,[],/permission denied/);
  await db.exec(`reset role; set role authenticated; set test.empresa='other'`);
  assert.equal((await db.query(`select id from public.quotes`)).rows.length,0); assertions++;
  await db.exec(`reset role`);
  // Capture a legacy partial acceptance BEFORE the new guard, then verify compatibility.
  await db.exec(`insert into public.materials(id,empresa_id,name,price_per_m2,base_minimum_sale_per_m2) values
    ('main2','tenant','Segundo principal',900,800), ('alt2','tenant','Segunda alternativa',1800,1000)`);
  const groupConfig = {...config, options: [
    {...config.options[0], id: 'ga', pieceIds: ['a','b'], pieceDeltas: {a: 100, b: 200}},
    {...config.options[0], id: 'gb', materialId: 'alt2', material: {id: 'alt2', name: 'Segunda alternativa'}, pieceIds: ['a','b'], pieceDeltas: {a: 50, b: 50}},
    {...config.options[0], id: 'gc', principalMaterialId: 'main2', materialId: 'alt2', material: {id: 'alt2', name: 'Segunda alternativa'}, pieceIds: ['c'], pieceDeltas: {c: -50}},
  ]};
  const publishGroup = async (id: string) => {
    await db.query(`insert into public.quotes(id,empresa_id,total_price,pieces,material_alternatives) values ($1,'tenant',10000,$2,$3)`,
      [id, JSON.stringify([{id:'a',materialId:'main',quantity:3,presentationValue:5000}, {id:'b',materialId:'main',quantity:1,presentationValue:3000},
        {id:'c',materialId:'main2',quantity:2,presentationValue:2000}]), JSON.stringify(groupConfig)]);
    const ids = (await db.query(`select gen_random_uuid() as pid, gen_random_uuid() as vid`)).rows[0];
    const token = `test-group-material-token-${id}`;
    await db.query(`insert into public.quote_presentations(id,empresa_id,quote_id) values ($1,'tenant',$2)`,[ids.pid,id]);
    await db.query(`insert into public.quote_presentation_versions(id,presentation_id,empresa_id,quote_id,version_number,proposal_code,public_token,snapshot,valid_until)
      select $1,$2,'tenant',id,1,'GROUP-1',$3,app_private.build_quote_presentation_snapshot(q,null::public.clients,null::public.materials,null::public.settings,1),now()+interval '1 day'
      from public.quotes q where id=$4`,[ids.vid,ids.pid,token,id]);
    await db.query(`update public.quote_presentations set current_version_id=$1 where id=$2`,[ids.vid,ids.pid]);
    return {token, ...ids};
  };
  const legacyGroup = await publishGroup('legacy-group');
  const legacyAcceptance = await db.query(confirm,[legacyGroup.token,legacyGroup.vid,'{"a":"ga"}',10100]);
  await db.exec(migration('20261009025512_quote_material_group_selection.sql'));
  await db.exec(readFileSync('supabase/tests/quote_material_group_selection.sql', 'utf8')); assertions++;
  const legacyRetry = await db.query(confirm,[legacyGroup.token,legacyGroup.vid,'{"a":"ga"}',10100]);
  assert.deepEqual(legacyRetry.rows[0].result,legacyAcceptance.rows[0].result); assertions++;
  const group = await publishGroup('full-group');
  const beforeGroup = (await db.query(`select to_jsonb(q) as quote from public.quotes q where id='full-group'`)).rows[0].quote;
  await rejects(confirm,[group.token,group.vid,'{"a":"ga"}',10100],/Troca parcial/);
  await rejects(confirm,[group.token,group.vid,'{"a":"ga","b":"gb"}',10150],/mesmo material/);
  await rejects(confirm,[group.token,group.vid,'{"a":"ga","b":"ga","c":"gc"}',1],/Valor divergente/);
  const groupChoices = {a:'ga',b:'ga',c:'gc'};
  const fullAccepted = await db.query(confirm,[group.token,group.vid,JSON.stringify(groupChoices),10250]);
  assert.equal(fullAccepted.rows[0].result.accepted,true); assertions++;
  assert.deepEqual((await db.query(confirm,[group.token,group.vid,JSON.stringify(groupChoices),10250])).rows[0].result,fullAccepted.rows[0].result); assertions++;
  const groupView = (await db.query(`select public.get_public_quote_presentation($1) as payload`,[group.token])).rows[0].payload;
  assert.deepEqual(groupView.snapshot.materialSelection.selections,groupChoices); assertions++;
  const groupEvidence = (await db.query(`select accepted_snapshot from public.quote_presentation_acceptances where version_id=$1`,[group.vid])).rows[0].accepted_snapshot;
  assert.equal(groupEvidence.materialSelection.affectedPieces.length,3); assertions++;
  assert.equal(groupEvidence.materialSelection.affectedPieces[0].piece.quantity,3); assertions++;
  assert.equal(groupEvidence.materialSelection.versionId,group.vid); assertions++;
  assert.ok(groupEvidence.materialSelection.confirmedAt); assertions++;
  assert.deepEqual((await db.query(`select to_jsonb(q) as quote from public.quotes q where id='full-group'`)).rows[0].quote,beforeGroup); assertions++;
  // Deterministic cross-language cents parity, including negative adjustments and entry crossing.
  for (let index = 0; index < 200; index++) {
    const base = index * 103.17 + 0.005;
    const delta = (index % 2 ? -1 : 1) * index * 17.13;
    const context = {...config, subtotalBeforeAdjustment: base, legacyComplexityPercent: index % 3 ? 0 : 5,
      totalsInput: {paymentMode: index % 2 ? 'entry' : 'total', entryAmount: index * 90.11, selectedAdjustment: index % 4 ? 8.3 : -3.7,
        commissionPercent: 3.15, negotiationDiscountPercent: 1.2, rtPercent: 2.5}};
    const actual = await db.query(`select app_private.material_simulation_total($1,$2) as total`,[JSON.stringify(context),delta]);
    const expected = calculateQuotePaymentTotals({...context.totalsInput, paymentMode: context.totalsInput.paymentMode as 'entry'|'total', subtotalBeforeAdjustment: base + delta * (1 + context.legacyComplexityPercent/100)}).totalPrice;
    assert.equal(Number(actual.rows[0].total),expected,`parity ${index}`); assertions++;
  }
  console.log(`PostgreSQL isolated: ${assertions} assertions passed (real builder, quantity migration, acceptance, RLS, financial parity).`);
} finally {
  await db.close();
}
