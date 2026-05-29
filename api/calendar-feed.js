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

const getSupabaseClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_ENV_MISSING:SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const parseDateKey = (value, eventTime = '09:00') => {
  if (!value || !String(value).includes('-')) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hours, minutes] = String(eventTime || '09:00').split(':').map(Number);
  return new Date(year, month - 1, day, Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
};

const eventLabel = (type) => (type === 'entrega' ? 'Entrega' : type === 'medicao' ? 'Medicao' : 'Evento');

const escapeIcsText = (value = '') =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const foldIcsLine = (line = '') => {
  const text = String(line);
  const maxLength = 73;
  if (text.length <= maxLength) return text;

  const parts = [];
  for (let index = 0; index < text.length; index += maxLength) {
    parts.push(text.slice(index, index + maxLength));
  }

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n');
};

const formatDateTimeUtc = (date) => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
};

const formatDateTimeLocal = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
};

const addOneHour = (date) => new Date(date.getTime() + 60 * 60 * 1000);

const clientFullAddress = (client) => {
  if (!client) return '';
  const locationBits = [
    client.address,
    client.neighborhood,
    client.city,
    client.zipCode ? `CEP ${client.zipCode}` : '',
  ].filter(Boolean);
  const condominiumBits = [
    client.condominiumName,
    client.tower ? `Torre ${client.tower}` : '',
    client.apartmentNumber ? `Apto ${client.apartmentNumber}` : '',
    client.block ? `Bloco ${client.block}` : '',
    client.lot ? `Lote ${client.lot}` : '',
  ].filter(Boolean);
  return [...locationBits, ...condominiumBits].join(' | ');
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const {uid, token} = req.query || {};
  if (!uid || !token) {
    res.status(400).send('Missing uid or token.');
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const {data: profile, error: profileError} = await supabase
      .from('profiles')
      .select('id, calendar_feed_token')
      .eq('id', String(uid))
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.calendar_feed_token !== token) {
      res.status(403).send('Invalid calendar token.');
      return;
    }

    const [{data: quotes, error: quotesError}, {data: clients, error: clientsError}, {data: manualEvents, error: manualEventsError}] = await Promise.all([
      supabase
        .from('quotes')
        .select('id, client_id, client_name, environment, status, measurement_date, delivery_date')
        .or('measurement_date.not.is.null,delivery_date.not.is.null'),
      supabase
        .from('clients')
        .select('id, phone, email, address, neighborhood, city, zip_code, condominium_name, tower, apartment_number, block, lot'),
      supabase
        .from('calendar_events')
        .select('id, title, description, date, date_key, client_id, client_name, event_time, created_by_name'),
    ]);

    if (quotesError) throw quotesError;
    if (clientsError) throw clientsError;
    if (manualEventsError) throw manualEventsError;

    const clientMap = new Map((clients || []).map((client) => [client.id, client]));
    const events = [];

    for (const quote of quotes || []) {
      const client = clientMap.get(quote.client_id);
      const measurementDate = toDate(quote.measurement_date);
      const deliveryDate = toDate(quote.delivery_date);

      if (measurementDate) {
        events.push({
          uid: `${quote.id}-medicao@dcoratto`,
          title: `${eventLabel('medicao')} | ${quote.client_name || 'Cliente'}`,
          description: [
            `Cliente: ${quote.client_name || 'Nao informado'}`,
            client?.phone ? `Telefone: ${client.phone}` : '',
            client?.email ? `E-mail: ${client.email}` : '',
            clientFullAddress(client),
            quote.environment ? `Ambiente: ${quote.environment}` : '',
            quote.status ? `Status: ${quote.status}` : '',
          ].filter(Boolean).join('\n'),
          location: clientFullAddress(client),
          start: measurementDate,
        });
      }

      if (deliveryDate) {
        events.push({
          uid: `${quote.id}-entrega@dcoratto`,
          title: `${eventLabel('entrega')} | ${quote.client_name || 'Cliente'}`,
          description: [
            `Cliente: ${quote.client_name || 'Nao informado'}`,
            client?.phone ? `Telefone: ${client.phone}` : '',
            client?.email ? `E-mail: ${client.email}` : '',
            clientFullAddress(client),
            quote.environment ? `Ambiente: ${quote.environment}` : '',
            quote.status ? `Status: ${quote.status}` : '',
          ].filter(Boolean).join('\n'),
          location: clientFullAddress(client),
          start: deliveryDate,
        });
      }
    }

    for (const manualEvent of manualEvents || []) {
      const eventDate = parseDateKey(manualEvent.date_key, manualEvent.event_time) || toDate(manualEvent.date);
      if (!eventDate) continue;
      const client = manualEvent.client_id ? clientMap.get(manualEvent.client_id) : null;
      events.push({
        uid: `manual-${manualEvent.id}@dcoratto`,
        title: [manualEvent.title || 'Evento', manualEvent.client_name].filter(Boolean).join(' | '),
        description: [
          manualEvent.description || '',
          client?.phone ? `Telefone: ${client.phone}` : '',
          client?.email ? `E-mail: ${client.email}` : '',
          clientFullAddress(client),
          manualEvent.created_by_name ? `Criado por: ${manualEvent.created_by_name}` : '',
        ].filter(Boolean).join('\n'),
        location: clientFullAddress(client),
        start: eventDate,
      });
    }

    events.sort((a, b) => a.start.getTime() - b.start.getTime());

    const nowStamp = formatDateTimeUtc(new Date());
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Dcoratto Sob Medida//Cronograma//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Dcoratto Sob Medida',
      'X-WR-TIMEZONE:America/Sao_Paulo',
      'X-PUBLISHED-TTL:PT1H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      ...events.flatMap((event) => [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(event.uid)}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART;TZID=America/Sao_Paulo:${formatDateTimeLocal(event.start)}`,
        `DTEND;TZID=America/Sao_Paulo:${formatDateTimeLocal(addOneHour(event.start))}`,
        `SUMMARY:${escapeIcsText(event.title)}`,
        event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
        event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
        'END:VEVENT',
      ].filter(Boolean)),
      'END:VCALENDAR',
    ].map(foldIcsLine).join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="dcoratto-cronograma.ics"');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).send(ics);
  } catch (error) {
    console.error('Calendar feed error', error);
    const message = String(error?.message || '');
    if (message.startsWith('SUPABASE_ENV_MISSING:')) {
      const missing = message.split(':')[1] || '';
      res.status(500).send(`Calendar feed misconfigured. Missing env: ${missing}`);
      return;
    }
    res.status(500).send(`Unable to generate calendar feed. ${message || ''}`.trim());
  }
}
