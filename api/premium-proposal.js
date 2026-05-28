import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({path: path.resolve(__dirname, '../.env.local'), override: false, quiet: true});
dotenv.config({path: path.resolve(__dirname, '../.env'), override: false, quiet: true});

const normalizeEnv = (value, fallback = '') => {
  const normalized = String(value ?? fallback).trim();
  return normalized.replace(/^"(.*)"$/s, '$1');
};

const SUPABASE_URL = normalizeEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_ANON_KEY = normalizeEnv(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);

const getSupabaseClient = () => {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_ENV_MISSING:SUPABASE_URL');
  }

  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('SUPABASE_ENV_MISSING:SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY');
  }

  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const {id} = req.params || {};
  const {token} = req.query || {};
  if (!id || !token) {
    res.status(400).send('Missing presentation id or token.');
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const {data, error} = await supabase
      .from('quotes')
      .select('id, premium_presentation, premium_presentation_token, premium_presentation_shared_at')
      .eq('id', String(id))
      .maybeSingle();

    if (error) throw error;
    if (!data || data.premium_presentation_token !== String(token)) {
      res.status(403).send('Invalid presentation token.');
      return;
    }

    if (!data.premium_presentation) {
      res.status(409).send('Presentation not published yet.');
      return;
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      presentation: data.premium_presentation,
      publishedAt: data.premium_presentation_shared_at || null,
    });
  } catch (error) {
    console.error('Premium proposal error', error);
    const message = String(error?.message || '');
    if (message.startsWith('SUPABASE_ENV_MISSING:')) {
      const missing = message.split(':')[1] || '';
      res.status(500).send(`Premium proposal misconfigured. Missing env: ${missing}`);
      return;
    }
    res.status(500).send(`Unable to load presentation. ${message || ''}`.trim());
  }
}

