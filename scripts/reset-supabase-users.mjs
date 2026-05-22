import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MASTER_ADMIN_EMAIL = 'brian_takiya77@outlook.com';

if (existsSync('.env.local')) {
  config({ path: '.env.local', override: true, quiet: true });
}
config({ override: false, quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local antes de limpar usuarios.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const listAuthUsers = async () => {
  const all = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    all.push(...users);

    if (users.length < perPage) break;
    page += 1;
  }

  return all;
};

const deleteByEmailFilter = async (table) => {
  const { data, error } = await supabase.from(table).select('id, email');
  if (error) throw error;

  const removableIds = (data || [])
    .filter((row) => normalizeEmail(row.email) !== MASTER_ADMIN_EMAIL)
    .map((row) => row.id);

  if (!removableIds.length) {
    console.log(`${table}: nenhum registro legado para remover.`);
    return;
  }

  if (dryRun) {
    console.log(`${table}: removeria ${removableIds.length} registros.`);
    return;
  }

  const { error: deleteError } = await supabase.from(table).delete().in('id', removableIds);
  if (deleteError) throw deleteError;
  console.log(`${table}: removidos ${removableIds.length} registros.`);
};

const authUsers = await listAuthUsers();
const removableAuthUsers = authUsers.filter((user) => normalizeEmail(user.email) !== MASTER_ADMIN_EMAIL);

console.log(`auth.users: ${removableAuthUsers.length} usuarios legados encontrados.`);

if (!dryRun) {
  for (const user of removableAuthUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
  console.log(`auth.users: removidos ${removableAuthUsers.length} usuarios.`);
}

await deleteByEmailFilter('profiles');
await deleteByEmailFilter('users');

console.log(dryRun ? 'Dry run concluido.' : 'Limpeza concluida.');
