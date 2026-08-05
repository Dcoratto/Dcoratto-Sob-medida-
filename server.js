import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import calendarFeedHandler from './api/calendar-feed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'dist');
const allowedOrigins = String(process.env.CORS_ORIGIN || process.env.APP_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originAllowed = origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin));

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/api/calendar-feed', (req, res) => {
  calendarFeedHandler(req, res);
});

app.get('/calendar/:uid/:token.ics', (req, res) => {
  req.query = {...req.query, uid: req.params.uid, token: req.params.token};
  calendarFeedHandler(req, res);
});

const sendNoCacheFile = (res, fileName) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(distDir, fileName));
};

app.get(['/sw.js', '/manifest.webmanifest', '/', '/index.html'], (req, res) => {
  const fileName = req.path === '/sw.js'
    ? 'sw.js'
    : req.path === '/manifest.webmanifest'
      ? 'manifest.webmanifest'
      : 'index.html';
  sendNoCacheFile(res, fileName);
});

app.use(express.static(distDir, {
  extensions: ['html'],
  maxAge: '1h',
}));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).send('API route not found.');
    return;
  }

  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
