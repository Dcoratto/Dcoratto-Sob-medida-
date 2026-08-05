import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({path: path.resolve(__dirname, '../.env.local'), override: false, quiet: true});
dotenv.config({path: path.resolve(__dirname, '../.env'), override: false, quiet: true});

const normalizeEnv = (value) => String(value || '').trim().replace(/^"(.*)"$/s, '$1');
const supabaseUrl = normalizeEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseAnonKey = normalizeEnv(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
const orsApiKey = normalizeEnv(process.env.OPENROUTESERVICE_API_KEY || process.env.ORS_API_KEY);
const requestWindows = new Map();

const getAuthClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
};

const authClient = getAuthClient();

const parseBearerToken = (header = '') => {
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const normalizeAddress = (value) => String(value || '')
  .replace(/[;\r\n]+/g, ', ')
  .replace(/\s+/g, ' ')
  .trim();

const validateAddress = (value) => {
  const address = normalizeAddress(value);
  const wordCount = address.split(/[\s,.-]+/).filter(Boolean).length;
  if (address.length < 5 || address.length > 256 || wordCount > 20) return '';
  return address;
};

const enforceRateLimit = (userId) => {
  const now = Date.now();
  const current = requestWindows.get(userId);
  if (!current || current.resetAt <= now) {
    requestWindows.set(userId, {count: 1, resetAt: now + 60_000});
    return true;
  }
  if (current.count >= 30) return false;
  current.count += 1;
  return true;
};

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(data?.error?.message || data?.error || 'ROUTE_PROVIDER_ERROR'));
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const geocode = async (address) => {
  const url = new URL('https://api.openrouteservice.org/geocode/search');
  url.searchParams.set('text', address);
  url.searchParams.set('boundary.country', 'BR');
  url.searchParams.set('lang', 'pt');
  url.searchParams.set('size', '1');
  const result = await fetchJson(url, {
    headers: {
      Authorization: orsApiKey,
    },
  });
  const coordinates = result?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('ADDRESS_NOT_FOUND');
  return [Number(coordinates[0]), Number(coordinates[1])];
};

const routeDistance = async (originCoordinates, destinationCoordinates) => {
  const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
  const result = await fetchJson(url, {
    method: 'POST',
    headers: {
      Authorization: orsApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [originCoordinates, destinationCoordinates],
      instructions: false,
      geometry: false,
    }),
  });
  const route = result?.features?.[0]?.properties?.summary;
  if (!route || !Number.isFinite(Number(route.distance))) throw new Error('ROUTE_NOT_FOUND');
  return {
    distanceKm: Math.round((Number(route.distance) / 1000) * 10) / 10,
    durationMinutes: Number.isFinite(Number(route.duration))
      ? Math.round(Number(route.duration) / 60)
      : null,
  };
};

export default async function deliveryDistanceHandler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({error: 'METHOD_NOT_ALLOWED'});
    return;
  }

  if (!authClient || !orsApiKey) {
    res.status(503).json({error: 'DELIVERY_SERVICE_NOT_CONFIGURED'});
    return;
  }

  const accessToken = parseBearerToken(req.headers.authorization);
  if (!accessToken) {
    res.status(401).json({error: 'AUTH_REQUIRED'});
    return;
  }

  const {data, error} = await authClient.auth.getUser(accessToken);
  if (error || !data.user) {
    res.status(401).json({error: 'INVALID_SESSION'});
    return;
  }

  if (!enforceRateLimit(data.user.id)) {
    res.status(429).json({error: 'RATE_LIMITED'});
    return;
  }

  const origin = validateAddress(req.body?.origin);
  const destination = validateAddress(req.body?.destination);
  if (!origin || !destination) {
    res.status(422).json({error: 'INVALID_ADDRESS'});
    return;
  }

  try {
    const [originCoordinates, destinationCoordinates] = await Promise.all([
      geocode(origin),
      geocode(destination),
    ]);
    const result = await routeDistance(originCoordinates, destinationCoordinates);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({...result, provider: 'openrouteservice'});
  } catch (error) {
    const code = String(error?.message || 'DELIVERY_CALCULATION_FAILED');
    const clientCode = ['ADDRESS_NOT_FOUND', 'ROUTE_NOT_FOUND'].includes(code)
      ? code
      : 'DELIVERY_CALCULATION_FAILED';
    console.error('Delivery distance calculation failed', {code, status: error?.status || 0});
    res.status(422).json({error: clientCode});
  }
}
