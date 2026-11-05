const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

function getAnalyzer() {
  try {
    delete require.cache[require.resolve('./engine/analyzer')];
    return require('./engine/analyzer');
  } catch (e) {
    console.error('[Analyzer Load Error]', e);
    return null;
  }
}

function getAutoHealer() {
  try {
    delete require.cache[require.resolve('./engine/auto_healer')];
    return require('./engine/auto_healer');
  } catch (e) {
    console.error('[AutoHealer Load Error]', e);
    return null;
  }
}

const app = express();
const PORT = process.env.PORT || 4100;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. Audit payload endpoint
app.post('/api/audit', (req, res) => {
  try {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ error: 'Payload is empty' });
    }
    const analyzer = getAnalyzer();
    if (!analyzer || typeof analyzer.auditPayload !== 'function') {
      return res.status(500).json({ error: 'Diagnostic analyzer failed to load' });
    }
    const report = analyzer.auditPayload(payload);
    res.json(report);
  } catch (err) {
    console.error('[Diagnostic Agent Audit Error]', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// 2. Auto-heal payload endpoint
app.post('/api/heal', (req, res) => {
  try {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ error: 'Payload is empty' });
    }
    const healer = getAutoHealer();
    if (!healer || typeof healer.healPayload !== 'function') {
      return res.status(500).json({ error: 'Auto-healer engine failed to load' });
    }
    const result = healer.healPayload(payload);
    res.json(result);
  } catch (err) {
    console.error('[Diagnostic Agent Heal Error]', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// 3. Sample Porto payload endpoint for quick 1-click testing
app.get('/api/sample-porto', (req, res) => {
  const candidatePaths = [
    path.join(__dirname, '../../scratch/uploaded_porto_1707w.json'),
    path.join(__dirname, '../../scratch/step_10854.json'),
    path.join(__dirname, '../../scratch/competitor_porto.json')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const data = fs.readFileSync(p, 'utf8');
        return res.json(JSON.parse(data));
      } catch (e) {}
    }
  }

  res.status(404).json({ error: 'Sample Porto payload not found on disk.' });
});

// 4. Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '2.0.0',
    port: PORT,
    activeRules: [
      'UNRESOLVED_INVIEWPORT_STYLE',
      'BURIED_OVERLAY',
      'LAZY_PLACEHOLDER_IMAGE',
      'INVISIBLE_TEXT',
      'STAIRCASE_HEADLINE',
      'WARPED_PARALLAX_CONTAINER'
    ]
  });
});

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🤖 HTML-to-Figma Autonomous Diagnostic Agent Web App`);
  console.log(`🚀 Server running on: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const fallbackPort = PORT + 1;
    console.warn(`⚠️ Port ${PORT} in use. Retrying on port ${fallbackPort}...`);
    app.listen(fallbackPort, () => {
      console.log(`=======================================================`);
      console.log(`🤖 HTML-to-Figma Autonomous Diagnostic Agent Web App`);
      console.log(`🚀 Server running on: http://localhost:${fallbackPort}`);
      console.log(`=======================================================`);
    });
  } else {
    console.error('Server error:', err);
  }
});

