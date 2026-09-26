import {test} from 'node:test';
import assert from 'node:assert/strict';

test('calendar subscription isolates tenant, reuses operational measurement and hides deleted contracts', async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-placeholder';
  const requests = [];
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input));
    assert.equal(url.hostname, 'fixture.supabase.co', 'tests must never access the real database');
    requests.push(url);
    const table = url.pathname.split('/').at(-1);
    const rows = {
      profiles: {id: 'fixture-user', calendar_feed_token: 'fixture-token', empresa_id: 'fixture-tenant'},
      quotes: [{id: 'quote-a', client_id: 'client-a', client_name: 'Cliente de teste', measurement_date: '2026-09-17T17:00:00Z'}],
      clients: [{id: 'client-a', city: 'Suzano'}],
      calendar_events: [
        {id: 'measurement-a', operational_contract_id: 'contract-a', operational_kind: 'measurement', title: 'Medição', date_key: '2026-09-24', event_time: '14:00', client_id: 'client-a'},
        {id: 'installation-a', operational_contract_id: 'contract-a', operational_kind: 'installation', title: 'Instalação', date_key: '2026-09-25', all_day: true, client_id: 'client-a'},
        {id: 'deleted-event', operational_contract_id: 'deleted-contract', operational_kind: 'measurement', title: 'Deleted contract', date_key: '2026-09-26'},
      ],
      client_contracts: [{id: 'contract-a', quote_id: 'quote-a'}],
    };
    return new Response(JSON.stringify(rows[table] ?? []), {status: 200, headers: {'Content-Type': 'application/json'}});
  };
  try {
    const {default: handler} = await import('../api/calendar-feed.js');
    let status; let body;
    const response = {status(code) {status = code; return this;}, send(value) {body = value; return this;}, setHeader() {}};
    await handler({method: 'GET', query: {uid: 'fixture-user', token: 'fixture-token'}}, response);
    assert.equal(status, 200);
    const unfolded = body.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('UID:manual-measurement-a@dcoratto'));
    assert.ok(!unfolded.includes('UID:quote-a-medicao@dcoratto'));
    assert.ok(!unfolded.includes('deleted-event'));
    assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20260925'));
    assert.ok(unfolded.includes('DTEND;VALUE=DATE:20260926'));
    for (const url of requests.filter(url => !url.pathname.endsWith('/profiles'))) assert.equal(url.searchParams.get('empresa_id'), 'eq.fixture-tenant');
    assert.equal(requests.filter(url => url.pathname.endsWith('/client_contracts')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
