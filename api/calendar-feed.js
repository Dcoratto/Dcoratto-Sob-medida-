import {initializeApp, cert, getApps} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';

const normalizeEnv = (value, fallback = '') => {
  const normalized = String(value ?? fallback).trim();
  return normalized.replace(/^"(.*)"$/s, '$1');
};

const FIREBASE_PROJECT_ID = normalizeEnv(process.env.FIREBASE_PROJECT_ID, 'ai-studio-applet-webapp-2ecc9');
const FIREBASE_CLIENT_EMAIL = normalizeEnv(process.env.FIREBASE_CLIENT_EMAIL);
const FIREBASE_PRIVATE_KEY = normalizeEnv(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
const FIRESTORE_DATABASE_ID = normalizeEnv(process.env.FIRESTORE_DATABASE_ID, 'ai-studio-1e79ab13-281e-49ca-b45c-a24a4386b051');

const ensureAdminApp = () => {
  if (getApps().length) return getApps()[0];
  if (!FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Firebase Admin credentials are not configured.');
  }
  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
    }),
  });
};

const db = () => getFirestore(ensureAdminApp(), FIRESTORE_DATABASE_ID);

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const parseDateKey = (value) => {
  if (!value || !String(value).includes('-')) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const eventLabel = (type) => (type === 'entrega' ? 'Entrega' : type === 'medicao' ? 'Medicao' : 'Evento');

const escapeIcsText = (value = '') =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const formatDateTimeUtc = (date) => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
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
  return [...locationBits, ...condominiumBits].join(' · ');
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
    const firestore = db();
    const profileSnap = await firestore.doc(`profiles/${uid}`).get();
    if (!profileSnap.exists || profileSnap.data()?.calendarFeedToken !== token) {
      res.status(403).send('Invalid calendar token.');
      return;
    }

    const [quotesSnap, clientsSnap, manualEventsSnap] = await Promise.all([
      firestore.collection('quotes').get(),
      firestore.collection('clients').get(),
      firestore.collection('calendarEvents').get(),
    ]);

    const clients = clientsSnap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    const clientMap = new Map(clients.map((client) => [client.id, client]));
    const events = [];

    for (const docSnap of quotesSnap.docs) {
      const quote = {id: docSnap.id, ...docSnap.data()};
      const client = clientMap.get(quote.clientId);
      const measurementDate = toDate(quote.measurementDate);
      const deliveryDate = toDate(quote.deliveryDate);

      if (measurementDate) {
        events.push({
          uid: `${quote.id}-medicao@dcoratto`,
          title: `${eventLabel('medicao')} · ${quote.clientName || 'Cliente'}`,
          description: [
            `Cliente: ${quote.clientName || 'Nao informado'}`,
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
          title: `${eventLabel('entrega')} · ${quote.clientName || 'Cliente'}`,
          description: [
            `Cliente: ${quote.clientName || 'Nao informado'}`,
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

    for (const docSnap of manualEventsSnap.docs) {
      const manualEvent = {id: docSnap.id, ...docSnap.data()};
      const eventDate = parseDateKey(manualEvent.dateKey) || toDate(manualEvent.date);
      if (!eventDate) continue;
      const client = manualEvent.clientId ?clientMap.get(manualEvent.clientId) : null;
      events.push({
        uid: `manual-${manualEvent.id}@dcoratto`,
        title: [manualEvent.title || 'Evento', manualEvent.clientName].filter(Boolean).join(' · '),
        description: [
          manualEvent.description || '',
          client?.phone ? `Telefone: ${client.phone}` : '',
          client?.email ? `E-mail: ${client.email}` : '',
          clientFullAddress(client),
          manualEvent.createdByName ? `Criado por: ${manualEvent.createdByName}` : '',
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
      ...events.flatMap((event) => [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(event.uid)}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${formatDateTimeUtc(event.start)}`,
        `DTEND:${formatDateTimeUtc(addOneHour(event.start))}`,
        `SUMMARY:${escapeIcsText(event.title)}`,
        event.description ?`DESCRIPTION:${escapeIcsText(event.description)}` : '',
        event.location ?`LOCATION:${escapeIcsText(event.location)}` : '',
        'END:VEVENT',
      ].filter(Boolean)),
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="dcoratto-cronograma.ics"');
    res.status(200).send(ics);
  } catch (error) {
    console.error('Calendar feed error', error);
    res.status(500).send('Unable to generate calendar feed.');
  }
}
