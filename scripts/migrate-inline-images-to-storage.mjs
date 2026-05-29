import path from 'path';
import {fileURLToPath} from 'url';
import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({path: path.join(rootDir, '.env.local'), override: false, quiet: true});
dotenv.config({path: path.join(rootDir, '.env'), override: false, quiet: true});

const normalizeEnv = (value, fallback = '') => String(value ?? fallback).trim().replace(/^"(.*)"$/s, '$1');

const supabaseUrl = normalizeEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const serviceRoleKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para migrar imagens inline.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TARGETS = [
  {table: 'profiles', id: 'id', field: 'photo_url', bucket: 'company-files', prefix: 'profiles'},
  {table: 'materials', id: 'id', field: 'image_url', bucket: 'materials-images', prefix: 'materials'},
  {table: 'inventory', id: 'id', field: 'photo_url', bucket: 'inventory-images', prefix: 'inventory'},
  {table: 'inventory_purchases', id: 'id', field: 'photo_url', bucket: 'inventory-images', prefix: 'inventory-purchases'},
  {table: 'fixture_catalog', id: 'id', field: 'image_url', bucket: 'fixture-files', prefix: 'fixtures/images'},
  {table: 'fixture_catalog', id: 'id', field: 'manual_url', bucket: 'fixture-files', prefix: 'fixtures/manuals'},
  {table: 'settings', id: 'id', field: 'logo_url', bucket: 'company-files', prefix: 'settings'},
];

const isInlineDataUrl = (value) => typeof value === 'string' && value.startsWith('data:');

const extensionFromContentType = (contentType) => {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('svg')) return 'svg';
  return 'bin';
};

const shouldConvertToWebp = (contentType) =>
  contentType.startsWith('image/') && !contentType.includes('svg') && !contentType.includes('gif');

const optimizeAssetBuffer = async (buffer, contentType) => {
  if (!shouldConvertToWebp(contentType)) {
    return {
      buffer,
      contentType,
      extension: extensionFromContentType(contentType),
    };
  }

  const optimizedBuffer = await sharp(buffer)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({quality: 82, effort: 4})
    .toBuffer();

  return {
    buffer: optimizedBuffer,
    contentType: 'image/webp',
    extension: 'webp',
  };
};

const migrateAsset = async (target, row) => {
  const sourceUrl = row[target.field];
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Falha ao ler o arquivo inline: ${response.status}`);
  }

  const mimeMatch = sourceUrl.match(/^data:([^;,]+)(?:;base64)?,/);
  const contentType = response.headers.get('content-type') || mimeMatch?.[1] || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  const optimized = await optimizeAssetBuffer(buffer, contentType);
  const filePath = `${target.prefix}/${row[target.id]}-${target.field}.${optimized.extension}`;

  const {error: uploadError} = await supabase.storage
    .from(target.bucket)
    .upload(filePath, optimized.buffer, {
      contentType: optimized.contentType,
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

    const rows = (data || []).filter((row) => isInlineDataUrl(row[target.field]));
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

  console.log('\nResumo da migração de imagens inline:');
  summary.forEach((item) => {
    console.log(`- ${item.table}.${item.field}: ${item.migrated}/${item.found}`);
  });
};

main().catch((error) => {
  console.error('Erro na migração de imagens inline:', error);
  process.exit(1);
});
