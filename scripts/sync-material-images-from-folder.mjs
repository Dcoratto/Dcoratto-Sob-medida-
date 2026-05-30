import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
  console.error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de sincronizar imagens.');
  process.exit(1);
}

const folderArg = process.argv[2];
const shouldApply = process.argv.includes('--apply');

if (!folderArg) {
  console.error('Uso: node scripts/sync-material-images-from-folder.mjs "CAMINHO_DA_PASTA" [--apply]');
  process.exit(1);
}

const sourceFolder = path.resolve(folderArg);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const materialsBucket = 'materials-images';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const normalizeKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const stripLeadingWords = (value, words) => {
  let next = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const word of words) {
      const prefix = `${word} `;
      if (next.startsWith(prefix)) {
        next = next.slice(prefix.length).trim();
        changed = true;
      }
    }
  }
  return next;
};

const stripTrailingWords = (value, words) => {
  let next = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const word of words) {
      const suffix = ` ${word}`;
      if (next.endsWith(suffix)) {
        next = next.slice(0, -suffix.length).trim();
        changed = true;
      }
    }
  }
  return next;
};

const applyNameFixes = (value) =>
  value
    .replace(/\bquartizito\b/g, 'quartzito')
    .replace(/\bacetinada\b/g, 'acetinado')
    .replace(/\bacetinado\b/g, 'acetinado')
    .replace(/\bubatuta\b/g, 'ubatuba')
    .replace(/\bbranca pinta verde\b/g, 'branco pinta verde')
    .replace(/\bspectrun\b/g, 'spectrun');

const buildFileCandidates = (baseName) => {
  const normalized = normalizeKey(baseName);
  const fixed = applyNameFixes(normalized);
  const leadingWords = ['granito', 'marmore', 'marmore', 'quartzo', 'quartzito', 'pedra', 'lamina', 'ultracompacta'];
  const trailingWords = ['polido', 'acetinado', 'escovado', 'natural', 'flameado', 'levigado', 'fosco'];
  const withoutLeading = stripLeadingWords(fixed, leadingWords);
  const withoutTrailing = stripTrailingWords(withoutLeading, trailingWords);
  return [...new Set([normalized, fixed, withoutLeading, withoutTrailing].filter(Boolean))];
};

const resolveDuplicateMatch = (fileCandidates, matchedMaterials) => {
  if (matchedMaterials.length <= 1) return matchedMaterials[0] || null;

  const candidateText = fileCandidates.join(' ');
  const narrowedByTexture = matchedMaterials.filter((material) => {
    const texture = normalizeKey(material.texture || '');
    return texture && candidateText.includes(texture);
  });
  if (narrowedByTexture.length === 1) return narrowedByTexture[0];

  const narrowedByLine = matchedMaterials.filter((material) => {
    const line = normalizeKey(material.material_line || '');
    return line && candidateText.includes(line);
  });
  if (narrowedByLine.length === 1) return narrowedByLine[0];

  const hasEscovadoInFile = candidateText.includes('escovado');
  const escovadoRows = matchedMaterials.filter((material) => normalizeKey(material.texture || '') === 'escovado');
  const nonEscovadoRows = matchedMaterials.filter((material) => normalizeKey(material.texture || '') !== 'escovado');

  if (hasEscovadoInFile && escovadoRows.length === 1) return escovadoRows[0];
  if (!hasEscovadoInFile && nonEscovadoRows.length === 1) return nonEscovadoRows[0];

  return null;
};

const parseStorageObject = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const storagePath = parsed.pathname.slice(markerIndex + marker.length);
    const [bucket, ...parts] = storagePath.split('/');
    if (!bucket || parts.length === 0) return null;
    return {bucket, path: parts.join('/')};
  } catch {
    return null;
  }
};

const buildVariantBuffer = async (inputPath, {maxSide, quality}) =>
  sharp(inputPath)
    .rotate()
    .resize({
      width: maxSide,
      height: maxSide,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({quality, effort: 4})
    .toBuffer();

const uploadVariant = async (materialId, variantName, buffer) => {
  const objectPath = `materials/${variantName}/${materialId}.webp`;
  const {error: uploadError} = await supabase.storage
    .from(materialsBucket)
    .upload(objectPath, buffer, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });
  if (uploadError) throw uploadError;
  return supabase.storage.from(materialsBucket).getPublicUrl(objectPath).data.publicUrl;
};

const listSourceFiles = async () => {
  const entries = await fs.readdir(sourceFolder, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(sourceFolder, entry.name),
      baseName: path.parse(entry.name).name,
      key: normalizeKey(path.parse(entry.name).name),
      candidates: buildFileCandidates(path.parse(entry.name).name),
    }));
};

const loadMaterials = async () => {
  const {data, error} = await supabase
    .from('materials')
    .select('id, name, image_url, thumbnail_url, medium_url, original_url, material_line, texture');
  if (error) throw error;
  return data || [];
};

const loadInventoryRows = async () => {
  const {data, error} = await supabase
    .from('inventory')
    .select('id, material_id, photo_url, thumbnail_url, medium_url, original_url');
  if (error) throw error;
  return data || [];
};

const loadPurchaseRows = async () => {
  const {data, error} = await supabase
    .from('inventory_purchases')
    .select('id, material_id, photo_url, thumbnail_url, medium_url, original_url');
  if (error) throw error;
  return data || [];
};

const removeOldObjects = async (urlsToDelete, newUrls) => {
  const newUrlSet = new Set(newUrls);
  const removable = [...new Set(urlsToDelete)]
    .filter((url) => url && !newUrlSet.has(url))
    .map(parseStorageObject)
    .filter((item) => item?.bucket === materialsBucket);

  const grouped = removable.reduce((acc, item) => {
    if (!acc[item.bucket]) acc[item.bucket] = new Set();
    acc[item.bucket].add(item.path);
    return acc;
  }, {});

  for (const [bucket, objectPaths] of Object.entries(grouped)) {
    const paths = [...objectPaths];
    if (!paths.length) continue;
    const {error} = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      console.warn(`Nao foi possivel apagar ${paths.length} arquivo(s) antigos do bucket ${bucket}: ${error.message}`);
    }
  }
};

const main = async () => {
  const [sourceFiles, materials, inventoryRows, purchaseRows] = await Promise.all([
    listSourceFiles(),
    loadMaterials(),
    loadInventoryRows(),
    loadPurchaseRows(),
  ]);

  const materialsByKey = new Map();
  for (const material of materials) {
    const key = normalizeKey(material.name);
    if (!key) continue;
    if (!materialsByKey.has(key)) {
      materialsByKey.set(key, []);
    }
    materialsByKey.get(key).push(material);
  }

  const matches = [];
  const duplicates = [];
  const missingFiles = [];

  for (const file of sourceFiles) {
    const matchedMaterials = [...new Map(
      file.candidates.flatMap((candidate) => (materialsByKey.get(candidate) || []).map((material) => [material.id, material])),
    ).values()];
    if (matchedMaterials.length === 1) {
      matches.push({file, material: matchedMaterials[0]});
      continue;
    }
    if (matchedMaterials.length > 1) {
      const resolved = resolveDuplicateMatch(file.candidates, matchedMaterials);
      if (resolved) {
        matches.push({file, material: resolved});
        continue;
      }
      duplicates.push({file, materials: matchedMaterials});
      continue;
    }
    missingFiles.push(file);
  }

  console.log(`Pasta analisada: ${sourceFolder}`);
  console.log(`Arquivos de imagem encontrados: ${sourceFiles.length}`);
  console.log(`Correspondencias unicas: ${matches.length}`);
  console.log(`Arquivos sem material: ${missingFiles.length}`);
  console.log(`Arquivos com duplicidade de material: ${duplicates.length}`);

  if (missingFiles.length) {
    console.log('\nArquivos sem correspondencia:');
    missingFiles.slice(0, 20).forEach((item) => console.log(`- ${item.name}`));
  }

  if (duplicates.length) {
    console.log('\nArquivos com mais de um material correspondente:');
    duplicates.slice(0, 20).forEach((item) => {
      console.log(`- ${item.file.name}: ${item.materials.map((material) => material.name).join(', ')}`);
    });
  }

  if (!shouldApply) {
    console.log('\nAnalise concluida. Rode novamente com --apply para substituir as imagens no Supabase.');
    return;
  }

  let updatedMaterials = 0;

  for (const {file, material} of matches) {
    try {
      const thumbnailBuffer = await buildVariantBuffer(file.fullPath, {maxSide: 360, quality: 76});
      const mediumBuffer = await buildVariantBuffer(file.fullPath, {maxSide: 1280, quality: 82});
      const originalBuffer = await buildVariantBuffer(file.fullPath, {maxSide: 2200, quality: 86});

      const [thumbnailUrl, mediumUrl, originalUrl] = await Promise.all([
        uploadVariant(material.id, 'thumbnails', thumbnailBuffer),
        uploadVariant(material.id, 'medium', mediumBuffer),
        uploadVariant(material.id, 'original', originalBuffer),
      ]);

      const materialPayload = {
        image_url: mediumUrl,
        thumbnail_url: thumbnailUrl,
        medium_url: mediumUrl,
        original_url: originalUrl,
      };

      const {error: materialUpdateError} = await supabase.from('materials').update(materialPayload).eq('id', material.id);
      if (materialUpdateError) throw materialUpdateError;

      const relatedInventory = inventoryRows.filter((row) => row.material_id === material.id);
      for (const row of relatedInventory) {
        const {error: inventoryUpdateError} = await supabase
          .from('inventory')
          .update({
            photo_url: mediumUrl,
            thumbnail_url: thumbnailUrl,
            medium_url: mediumUrl,
            original_url: originalUrl,
          })
          .eq('id', row.id);
        if (inventoryUpdateError) throw inventoryUpdateError;
      }

      const relatedPurchases = purchaseRows.filter((row) => row.material_id === material.id);
      for (const row of relatedPurchases) {
        const {error: purchaseUpdateError} = await supabase
          .from('inventory_purchases')
          .update({
            photo_url: mediumUrl,
            thumbnail_url: thumbnailUrl,
            medium_url: mediumUrl,
            original_url: originalUrl,
          })
          .eq('id', row.id);
        if (purchaseUpdateError) throw purchaseUpdateError;
      }

      await removeOldObjects(
        [
          material.image_url,
          material.thumbnail_url,
          material.medium_url,
          material.original_url,
          ...relatedInventory.flatMap((row) => [row.photo_url, row.thumbnail_url, row.medium_url, row.original_url]),
          ...relatedPurchases.flatMap((row) => [row.photo_url, row.thumbnail_url, row.medium_url, row.original_url]),
        ],
        [thumbnailUrl, mediumUrl, originalUrl],
      );

      updatedMaterials += 1;
      console.log(`Atualizado: ${material.name} <- ${file.name}`);
    } catch (error) {
      console.error(`Falha ao atualizar ${material.name} com ${file.name}: ${error.message}`);
    }
  }

  console.log(`\nSincronizacao concluida: ${updatedMaterials}/${matches.length} materiais atualizados.`);
  if (duplicates.length) {
    console.log('Materiais pulados por duplicidade:');
    duplicates.forEach((item) => console.log(`- ${item.file.name}: ${item.materials.map((material) => material.name).join(', ')}`));
  }
};

main().catch((error) => {
  console.error('Erro na sincronizacao das imagens:', error);
  process.exit(1);
});
