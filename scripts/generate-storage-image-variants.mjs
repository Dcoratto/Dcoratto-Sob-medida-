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
  console.error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para gerar variantes.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TARGETS = [
  {table: 'materials', id: 'id', sourceField: 'image_url', bucket: 'materials-images', prefix: 'materials'},
  {table: 'fixture_catalog', id: 'id', sourceField: 'image_url', bucket: 'fixture-files', prefix: 'fixtures/images'},
  {table: 'inventory', id: 'id', sourceField: 'photo_url', bucket: 'inventory-images', prefix: 'inventory'},
  {table: 'inventory_purchases', id: 'id', sourceField: 'photo_url', bucket: 'inventory-images', prefix: 'inventory-purchases'},
  {table: 'profiles', id: 'id', sourceField: 'photo_url', bucket: 'company-files', prefix: 'profiles'},
  {table: 'settings', id: 'id', sourceField: 'logo_url', bucket: 'company-files', prefix: 'settings'},
];

const VARIANTS = [
  {field: 'thumbnail_url', folder: 'thumbnails', width: 320, quality: 72},
  {field: 'medium_url', folder: 'medium', width: 900, quality: 80},
];

const isImageUrl = (value) => typeof value === 'string' && value.startsWith('http');

const uploadVariant = async ({target, row, sourceBuffer, variant}) => {
  const outputBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({
      width: variant.width,
      height: variant.width,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({quality: variant.quality, effort: 4})
    .toBuffer();

  const filePath = `${target.prefix}/${variant.folder}/${row[target.id]}.webp`;
  const {error: uploadError} = await supabase.storage
    .from(target.bucket)
    .upload(filePath, outputBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) throw uploadError;
  const {data} = supabase.storage.from(target.bucket).getPublicUrl(filePath);
  return data.publicUrl;
};

const generateVariantsForRow = async (target, row) => {
  const sourceUrl = row.original_url || row[target.sourceField];
  if (!isImageUrl(sourceUrl)) return null;

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem original: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/') || contentType.includes('svg') || contentType.includes('gif')) {
    return null;
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const updates = {
    original_url: sourceUrl,
  };

  for (const variant of VARIANTS) {
    updates[variant.field] = await uploadVariant({target, row, sourceBuffer, variant});
  }

  const {error} = await supabase.from(target.table).update(updates).eq(target.id, row[target.id]);
  if (error) throw error;
  return updates;
};

const main = async () => {
  const summary = [];

  for (const target of TARGETS) {
    const {data, error} = await supabase
      .from(target.table)
      .select(`${target.id}, ${target.sourceField}, thumbnail_url, medium_url, original_url`);

    if (error) throw error;

    const rows = (data || []).filter((row) =>
      isImageUrl(row.original_url || row[target.sourceField]) && (!row.thumbnail_url || !row.medium_url),
    );
    let updated = 0;

    for (const row of rows) {
      try {
        const result = await generateVariantsForRow(target, row);
        if (result) {
          updated += 1;
          console.log(`Variantes geradas ${target.table}: ${row[target.id]}`);
        }
      } catch (variantError) {
        console.error(`Falha em ${target.table} (${row[target.id]}):`, variantError.message);
      }
    }

    summary.push({table: target.table, found: rows.length, updated});
  }

  console.log('\nResumo das variantes:');
  summary.forEach((item) => {
    console.log(`- ${item.table}: ${item.updated}/${item.found}`);
  });
};

main().catch((error) => {
  console.error('Erro ao gerar variantes:', error);
  process.exit(1);
});
