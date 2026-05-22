import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {cert, getApps, initializeApp} from 'firebase-admin/app';
import {DocumentReference, GeoPoint, Timestamp, getFirestore} from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with {type: 'json'};

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_COLLECTIONS = [
  'profiles',
  'users',
  'settings',
  'clients',
  'quotes',
  'materials',
  'userMaterialPrices',
  'inventory',
  'inventoryReservations',
  'inventoryPurchases',
  'employees',
  'fixtureCatalog',
  'condominiums',
  'calendarEvents',
  'dashboardNotes',
  'systemEvents',
  'auditLogs',
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    outDir: path.join(rootDir, 'exports', `firebase-firestore-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    collections: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out-dir') {
      result.outDir = path.resolve(rootDir, args[index + 1] || '');
      index += 1;
      continue;
    }
    if (arg === '--collections') {
      result.collections = (args[index + 1] || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`
Uso:
  npm run export:firebase

Opções:
  --collections clients,quotes,materials
  --out-dir exports/minha-pasta
      `);
      process.exit(0);
    }
  }

  return result;
};

const {outDir, collections} = parseArgs();

const normalizeEnv = (value, fallback = '') => String(value || fallback || '').trim();

const FIREBASE_PROJECT_ID = normalizeEnv(process.env.FIREBASE_PROJECT_ID, firebaseConfig.projectId);
const FIREBASE_CLIENT_EMAIL = normalizeEnv(process.env.FIREBASE_CLIENT_EMAIL);
const FIREBASE_PRIVATE_KEY = normalizeEnv(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
const FIRESTORE_DATABASE_ID = normalizeEnv(process.env.FIRESTORE_DATABASE_ID, firebaseConfig.firestoreDatabaseId);

const missing = [];
if (!FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
if (!FIREBASE_CLIENT_EMAIL) missing.push('FIREBASE_CLIENT_EMAIL');
if (!FIREBASE_PRIVATE_KEY) missing.push('FIREBASE_PRIVATE_KEY');
if (!FIRESTORE_DATABASE_ID) missing.push('FIRESTORE_DATABASE_ID');

if (missing.length) {
  console.error(`Faltam variáveis no .env: ${missing.join(', ')}`);
  console.error('Use o arquivo .env.example como base e preencha as credenciais do Firebase Admin.');
  process.exit(1);
}

const ensureAdminApp = () => {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
    }),
    projectId: FIREBASE_PROJECT_ID,
  });
};

const db = () => getFirestore(ensureAdminApp(), FIRESTORE_DATABASE_ID);

const serializeValue = (value) => {
  if (value instanceof Timestamp) {
    return {
      __type: 'timestamp',
      iso: value.toDate().toISOString(),
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  if (value instanceof GeoPoint) {
    return {
      __type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof DocumentReference) {
    return {
      __type: 'document_reference',
      path: value.path,
      id: value.id,
    };
  }

  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return {
      __type: 'bytes',
      base64: Buffer.from(value).toString('base64'),
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]),
    );
  }

  return value;
};

const exportCollection = async (collectionName, outDir) => {
  console.log(`Exportando ${collectionName}...`);
  const snapshot = await db().collection(collectionName).get();
  const documents = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...serializeValue(doc.data() || {}),
  }));

  const filePath = path.join(outDir, `${collectionName}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(documents, null, 2)}\n`, 'utf8');
  console.log(`  ${documents.length} documentos salvos em ${filePath}`);
  return {collectionName, count: documents.length};
};

const main = async () => {
  const targetCollections = collections.length ? collections : DEFAULT_COLLECTIONS;

  await fs.mkdir(outDir, {recursive: true});

  const summary = [];
  for (const collectionName of targetCollections) {
    try {
      const result = await exportCollection(collectionName, outDir);
      summary.push(result);
    } catch (error) {
      console.error(`Falha ao exportar ${collectionName}:`, error);
      summary.push({collectionName, count: 0, error: String(error)});
    }
  }

  const summaryPath = path.join(outDir, 'summary.json');
  await fs.writeFile(
    summaryPath,
    `${JSON.stringify({
      projectId: FIREBASE_PROJECT_ID,
      firestoreDatabaseId: FIRESTORE_DATABASE_ID,
      exportedAt: new Date().toISOString(),
      collections: summary,
    }, null, 2)}\n`,
    'utf8',
  );

  console.log('\nExportação concluída.');
  console.log(`Pasta de saída: ${outDir}`);
  console.log(`Resumo: ${summaryPath}`);
};

main().catch((error) => {
  console.error('Erro geral na exportação:', error);
  process.exit(1);
});
