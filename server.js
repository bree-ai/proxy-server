const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
// Allow CORS from anywhere (lock to your HubSpot domain in production)
app.use((req, res, next) => {
 res.header('Access-Control-Allow-Origin', '*');
 res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
 res.header('Access-Control-Allow-Headers', 'Content-Type, X-HubSpot-Token, X-Target-URL');
 if (req.method === 'OPTIONS') return res.sendStatus(204);
 next();
});
// ── /anthropic → Anthropic API ──────────────────────────────
app.post('/anthropic', async (req, res) => {
 try {
 const response = await axios.post(
 'https://api.anthropic.com/v1/messages',
 req.body,
 {
 headers: {
 'Content-Type': 'application/json',
 'x-api-key': process.env.ANTHROPIC_API_KEY,
 'anthropic-version': '2023-06-01',
 },
 }
 );
 res.json(response.data);
 } catch (err) {
 const status = err.response ? err.response.status : 500;
 const message = err.response ? JSON.stringify(err.response.data) : err.message;
 res.status(status).json({ error: { message } });
 }
});
// ── /hubspot → HubSpot API ──────────────────────────────────
app.all('/hubspot', async (req, res) => {
 const token = req.headers['x-hubspot-token'];
 const targetUrl = req.headers['x-target-url'];
 if (!token) return res.status(400).json({ error: 'Missing X-HubSpot-Token header' });
 if (!targetUrl || !targetUrl.startsWith('https://api.hubspot.com/'))
 return res.status(400).json({ error: 'Invalid X-Target-URL header' });
 try {
 const response = await axios({
 method: req.method,
 url: targetUrl,
 headers: {
 'Content-Type': 'application/json',
 'Authorization': 'Bearer ' + token,
 },
 data: req.body,
 });
 res.json(response.data);
 } catch (err) {
 const status = err.response ? err.response.status : 500;
 const message = err.response ? JSON.stringify(err.response.data) : err.message;
 res.status(status).json({ error: { message } });
 }
});
// Health check
app.get('/', (req, res) => res.send('CREtech proxy running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
