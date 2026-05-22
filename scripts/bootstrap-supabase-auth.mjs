import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) {
  config({ path: '.env.local', override: true, quiet: true });
}
config({ override: false, quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SUPABASE_SITE_URL || process.env.VITE_APP_URL || 'http://127.0.0.1:3000';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local antes de convidar os usuários.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const loadRows = async (table) => {
  const all = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    all.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
};

const loadAuthUsers = async () => {
  const emails = new Set();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    users.forEach((user) => {
      const email = normalizeEmail(user.email);
      if (email) emails.add(email);
    });
    if (users.length < perPage) break;
    page += 1;
  }

  return emails;
};

const buildCandidates = (profiles, users) => {
  const map = new Map();

  [...profiles, ...users].forEach((row) => {
    const email = normalizeEmail(row.email);
    if (!email) return;
    const name = String(row.name || row.nome || row.fullName || email.split('@')[0] || '').trim();
    if (!map.has(email)) {
      map.set(email, {
        email,
        name,
        role: row.role || null,
      });
    }
  });

  return [...map.values()].sort((a, b) => a.email.localeCompare(b.email));
};

const inviteUsers = async () => {
  const [profiles, users, authEmails] = await Promise.all([
    loadRows('profiles'),
    loadRows('users'),
    loadAuthUsers(),
  ]);

  const candidates = buildCandidates(profiles, users);
  const pending = candidates.filter((candidate) => !authEmails.has(candidate.email));

  if (!pending.length) {
    console.log('Nenhum usuário pendente de convite.');
    return;
  }

  let invited = 0;
  const failed = [];

  for (const candidate of pending) {
    const { error } = await supabase.auth.admin.inviteUserByEmail(candidate.email, {
      redirectTo: SITE_URL,
      data: {
        name: candidate.name,
        role: candidate.role || '',
      },
    });

    if (error) {
      failed.push({ email: candidate.email, error: error.message });
      continue;
    }

    invited += 1;
    console.log(`Convite enviado para ${candidate.email}`);
  }

  console.log('---');
  console.log(`Convidados enviados: ${invited}`);
  console.log(`Falhas: ${failed.length}`);

  if (failed.length) {
    failed.forEach((item) => console.log(`- ${item.email}: ${item.error}`));
    process.exitCode = 1;
  }
};

inviteUsers().catch((error) => {
  console.error('Falha ao convidar usuários para o Supabase Auth:', error.message || error);
  process.exit(1);
});
