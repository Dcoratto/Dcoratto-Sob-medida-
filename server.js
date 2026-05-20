import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import calendarFeedHandler from './api/calendar-feed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'dist');

app.get('/api/calendar-feed', (req, res) => {
  calendarFeedHandler(req, res);
});

app.get('/calendar/:uid/:token.ics', (req, res) => {
  req.query = {...req.query, uid: req.params.uid, token: req.params.token};
  calendarFeedHandler(req, res);
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
