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
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local antes de criar usuarios.');
  process.exit(1);
}

const args = process.argv.slice(2);
const emails = args
  .map((value) => String(value || '').trim().toLowerCase())
  .filter(Boolean);

if (!emails.length) {
  console.error('Informe um ou mais e-mails. Exemplo: node scripts/bootstrap-supabase-auth.mjs usuario@dominio.com');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

let failed = false;

for (const email of emails) {
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: SITE_URL,
    data: {
      name: email.split('@')[0],
    },
  });

  if (error) {
    failed = true;
    console.error(`Falha ao convidar ${email}: ${error.message}`);
    continue;
  }

  console.log(`Convite enviado para ${email}`);
}

if (failed) {
  process.exitCode = 1;
}
