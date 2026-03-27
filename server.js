const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json({ limit: '10mb' }));

// CORS — allow everything
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-HubSpot-Token, X-Target-URL');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check — Railway uses this to confirm the server is alive
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'CREtech proxy running' });
});

// /anthropic → Anthropic API
app.post('/anthropic', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY environment variable not set' } });
  }
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
        timeout: 60000,
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
