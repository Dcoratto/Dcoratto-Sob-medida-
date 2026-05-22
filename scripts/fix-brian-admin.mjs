import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MASTER_ADMIN_EMAIL = 'brian_takiya77@outlook.com';
const DEFAULT_NAME = 'Brian Takiya';

if (existsSync('.env.local')) {
  config({ path: '.env.local', override: true, quiet: true });
}
config({ override: false, quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nextPassword = String(process.argv[2] || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local.');
  process.exit(1);
}

if (!nextPassword || nextPassword.length < 6) {
  console.error('Informe uma nova senha com pelo menos 6 caracteres.');
  console.error('Exemplo: node scripts/fix-brian-admin.mjs MinhaSenha123');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) {
  console.error(`Falha ao listar usuarios do Auth: ${error.message}`);
  process.exit(1);
}

const authUser = (data?.users || []).find((user) => String(user.email || '').toLowerCase() === MASTER_ADMIN_EMAIL);
if (!authUser) {
  console.error(`Usuario ${MASTER_ADMIN_EMAIL} nao encontrado no Supabase Auth.`);
  process.exit(1);
}

const { error: passwordError } = await supabase.auth.admin.updateUserById(authUser.id, {
  password: nextPassword,
  email_confirm: true,
  user_metadata: {
    ...(authUser.user_metadata || {}),
    name: authUser.user_metadata?.name || DEFAULT_NAME,
  },
});

if (passwordError) {
  console.error(`Falha ao atualizar senha: ${passwordError.message}`);
  process.exit(1);
}

const profilePayload = {
  id: authUser.id,
  auth_user_id: authUser.id,
  name: authUser.user_metadata?.name || DEFAULT_NAME,
  email: MASTER_ADMIN_EMAIL,
  role: 'admin',
  blocked: false,
};

const userPayload = {
  id: authUser.id,
  auth_user_id: authUser.id,
  nome: authUser.user_metadata?.name || DEFAULT_NAME,
  name: authUser.user_metadata?.name || DEFAULT_NAME,
  email: MASTER_ADMIN_EMAIL,
  role: 'administrativo',
  permissions: {
    dashboard: { visualizar: true },
    orcamento: { visualizar: true, criar: true, editar: true, excluir: true, aprovar: true },
    historico: { visualizar: true },
    materiais: { visualizar: true, editar: true },
    estoque: { visualizar: true, adicionar: true, editar: true, excluir: true, movimentar: true },
    relatorios: { visualizar: true, exportar: true, verFaturamento: true, verProdutividade: true },
    admin: { visualizarUsuarios: true, alterarPermissoes: true, excluirUsuarios: true },
    cliente: { visualizar: true, editarDados: true, alterarEtapa: true, anexarArquivos: true, avaliarFuncionarios: true, verValores: true },
    medicao: { visualizar: true, criar: true, editar: true },
    projeto: { visualizar: true, criar: true, editar: true, aprovar: true },
    producao: { visualizar: true, alterarEtapa: true, conferirMedidas: true, finalizarProducao: true },
    liberacao: { visualizar: true, aprovar: true, reprovar: true },
  },
  blocked: false,
};

const { error: profileError } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });
if (profileError) {
  console.error(`Falha ao recriar profile: ${profileError.message}`);
  process.exit(1);
}

const { error: userError } = await supabase.from('users').upsert(userPayload, { onConflict: 'id' });
if (userError) {
  console.error(`Falha ao recriar usuario administrativo: ${userError.message}`);
  process.exit(1);
}

console.log('Brian configurado com sucesso no Supabase.');
console.log(`E-mail: ${MASTER_ADMIN_EMAIL}`);
console.log('Profile: admin');
console.log('User role: administrativo');
