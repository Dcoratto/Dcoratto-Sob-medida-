import path from 'path';
import {fileURLToPath} from 'url';
import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({path: path.join(rootDir, '.env.local'), override: false, quiet: true});
dotenv.config({path: path.join(rootDir, '.env'), override: false, quiet: true});

const normalizeEnv = (value, fallback = '') => String(value ?? fallback).trim().replace(/^"(.*)"$/s, '$1');

const supabaseUrl = normalizeEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const accessKey = normalizeEnv(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY,
);

if (!supabaseUrl || !accessKey) {
  console.error('Defina SUPABASE_URL/VITE_SUPABASE_URL e uma chave SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY no .env para migrar os arquivos.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, accessKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TARGETS = [
  {table: 'materials', id: 'id', field: 'image_url', bucket: 'materials-images', prefix: 'materials'},
  {table: 'inventory', id: 'id', field: 'photo_url', bucket: 'inventory-images', prefix: 'inventory'},
  {table: 'inventory_purchases', id: 'id', field: 'photo_url', bucket: 'inventory-images', prefix: 'inventory-purchases'},
  {table: 'fixture_catalog', id: 'id', field: 'image_url', bucket: 'fixture-files', prefix: 'fixtures/images'},
  {table: 'fixture_catalog', id: 'id', field: 'manual_url', bucket: 'fixture-files', prefix: 'fixtures/manuals'},
  {table: 'settings', id: 'id', field: 'logo_url', bucket: 'company-files', prefix: 'settings'},
];

const isFirebaseAsset = (value) =>
  typeof value === 'string' &&
  (value.includes('firebasestorage.googleapis.com') || value.includes('storage.googleapis.com')) &&
  !value.startsWith('data:');

const extensionFrom = (url, contentType) => {
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  })();
  const candidate = pathname.split('.').pop();
  if (candidate && candidate.length <= 5) return candidate.toLowerCase();

  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('pdf')) return 'pdf';
  return 'bin';
};

const migrateAsset = async (target, row) => {
  const sourceUrl = row[target.field];
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${sourceUrl}: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const extension = extensionFrom(sourceUrl, contentType);
  const filePath = `${target.prefix}/${row[target.id]}-${target.field}.${extension}`;
  const buffer = Buffer.from(await response.arrayBuffer());

  const {error: uploadError} = await supabase.storage
    .from(target.bucket)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const {data: publicData} = supabase.storage.from(target.bucket).getPublicUrl(filePath);
  const {error: updateError} = await supabase.from(target.table).update({
    [target.field]: publicData.publicUrl,
  }).eq(target.id, row[target.id]);

  if (updateError) throw updateError;
  return publicData.publicUrl;
};

const main = async () => {
  const summary = [];

  for (const target of TARGETS) {
    const {data, error} = await supabase.from(target.table).select(`${target.id}, ${target.field}`);
    if (error) throw error;

    const rows = (data || []).filter((row) => isFirebaseAsset(row[target.field]));
    let migrated = 0;

    for (const row of rows) {
      try {
        await migrateAsset(target, row);
        migrated += 1;
        console.log(`Migrado ${target.table}.${target.field}: ${row[target.id]}`);
      } catch (assetError) {
        console.error(`Falha em ${target.table}.${target.field} (${row[target.id]}):`, assetError.message);
      }
    }

    summary.push({
      table: target.table,
      field: target.field,
      found: rows.length,
      migrated,
    });
  }

  console.log('\nResumo da migração de arquivos:');
  summary.forEach((item) => {
    console.log(`- ${item.table}.${item.field}: ${item.migrated}/${item.found}`);
  });
};

main().catch((error) => {
  console.error('Erro na migração de arquivos:', error);
  process.exit(1);
});
