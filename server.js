const express = require('express');
const axios   = require('axios');
const { Pool } = require('pg');
const app     = express();

app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-HubSpot-Token, X-Target-URL, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Postgres connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.internal')
    ? false
    : { rejectUnauthorized: false }
});

// Create table on startup if it doesn't exist
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('DB ready');
  } catch(e) {
    console.error('DB init error:', e.message);
  }
}
initDB();

async function dbGet(key) {
  const res = await pool.query('SELECT value FROM store WHERE key=$1', [key]);
  return res.rows.length ? res.rows[0].value : null;
}
async function dbSet(key, value) {
  await pool.query(`
    INSERT INTO store(key, value, updated_at) VALUES($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value=$2, updated_at=NOW()
  `, [key, value]);
}

const ADMIN_KEY = process.env.ADMIN_KEY || 'cretech2026';

// Health check
app.get('/', async (req, res) => {
  try {
    const raw = await dbGet('attendees');
    const count = raw ? JSON.parse(raw).length : 0;
    const updated = await dbGet('lastUpdated');
    res.json({ status: 'ok', attendees: count, lastUpdated: updated });
  } catch(e) {
    res.json({ status: 'ok', error: e.message });
  }
});

// GET attendees — any rep, any device
app.get('/attendees', async (req, res) => {
  try {
    const raw     = await dbGet('attendees');
    const product = await dbGet('product');
    const updated = await dbGet('lastUpdated');
    res.json({
      attendees:   raw ? JSON.parse(raw) : [],
      product:     product || '',
      lastUpdated: updated
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST attendees — admin only
app.post('/attendees', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  const { attendees, product } = req.body;
  if (!Array.isArray(attendees))
    return res.status(400).json({ error: 'attendees must be an array' });
  try {
    await dbSet('attendees', JSON.stringify(attendees));
    await dbSet('lastUpdated', new Date().toISOString());
    if (product !== undefined) await dbSet('product', product);
    res.json({ ok: true, count: attendees.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST product
app.post('/product', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    await dbSet('product', req.body.product || '');
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// /anthropic → Anthropic API
app.post('/anthropic', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY not set' } });
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      req.body,
      {
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 120000,
      }
    );
    res.json(response.data);
  } catch (err) {
    const status  = err.response ? err.response.status : 500;
    const message = err.response ? JSON.stringify(err.response.data) : err.message;
    res.status(status).json({ error: { message } });
  }
});

// /hubspot → HubSpot API
app.all('/hubspot', async (req, res) => {
  const token     = req.headers['x-hubspot-token'];
  const targetUrl = req.headers['x-target-url'];
  if (!token)     return res.status(400).json({ error: 'Missing X-HubSpot-Token' });
  if (!targetUrl || !targetUrl.startsWith('https://api.hubspot.com/'))
    return res.status(400).json({ error: 'Invalid X-Target-URL' });
  try {
    const response = await axios({
      method:  req.method,
      url:     targetUrl,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data:    req.body,
      timeout: 30000,
    });
    res.json(response.data);
  } catch (err) {
    const status  = err.response ? err.response.status : 500;
    const message = err.response ? JSON.stringify(err.response.data) : err.message;
    res.status(status).json({ error: { message } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`CREtech proxy running on port ${PORT}`));
