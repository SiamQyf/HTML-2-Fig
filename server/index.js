const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const { execSync } = require('child_process');

// Auto-detect or download Chrome executable path dynamically
let cachedChromeExecutable = process.env.PUPPETEER_EXECUTABLE_PATH || null;

function getChromeExecutablePath() {
  if (cachedChromeExecutable && fs.existsSync(cachedChromeExecutable)) {
    return cachedChromeExecutable;
  }

  // 1. Check common system paths
  const systemPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) {
      cachedChromeExecutable = p;
      return p;
    }
  }

  // 2. Install Chrome via puppeteer CLI if not present
  try {
    console.log('[Puppeteer] Ensuring Chrome is installed...');
    const out = execSync('npx puppeteer browsers install chrome', { encoding: 'utf8' }).trim();
    console.log('[Puppeteer] Installer output:', out);
    const parts = out.split(/\s+/);
    const lastPart = parts[parts.length - 1];
    if (lastPart && fs.existsSync(lastPart)) {
      cachedChromeExecutable = lastPart;
      return lastPart;
    }
  } catch (err) {
    console.warn('[Puppeteer] Auto-install warning:', err.message);
  }

  return undefined;
}

// Pre-check and download Chrome on startup
setTimeout(() => {
  try {
    const p = getChromeExecutablePath();
    console.log('⚡ [Puppeteer] Ready with Chrome at:', p || 'default');
  } catch (e) {}
}, 1000);

// Read local capture script for instant injection without external network delay
let captureScript = '';
const localCapturePath = path.join(__dirname, '..', 'packages', 'chrome-extension', 'capture.js');
if (fs.existsSync(localCapturePath)) {
  captureScript = fs.readFileSync(localCapturePath, 'utf8');
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'HTML-2-Fig Headless Capture Server',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Capture endpoint
app.post('/api/capture', async (req, res) => {
  const { url, width = 1440, height = 900 } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  let browser = null;
  try {
    const execPath = getChromeExecutablePath();
    console.log(`[Capture] Launching headless browser for: ${targetUrl} (bin: ${execPath || 'auto'})`);
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: execPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1440,900'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: parseInt(width, 10) || 1440,
      height: parseInt(height, 10) || 900,
      deviceScaleFactor: 1
    });

    // Custom user agent to prevent basic bot blocks
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    console.log(`[Capture] Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 35000
    });

    // Inject capture engine
    console.log('[Capture] Injecting capture script...');
    if (captureScript) {
      await page.evaluate(captureScript);
    } else {
      await page.addScriptTag({
        url: 'https://cdn.jsdelivr.net/gh/SiamQyf/HTML-2-Fig@Final/packages/chrome-extension/capture.js'
      });
    }

    // Wait 400ms for dynamic fonts and layouts to settle
    await new Promise((r) => setTimeout(r, 400));

    // Run DOM extraction in browser context
    console.log('[Capture] Extracting HyperNodes...');
    const payload = await page.evaluate(async () => {
      if (window.html2Fig && typeof window.html2Fig.captureRaw === 'function') {
        return await window.html2Fig.captureRaw();
      }
      throw new Error('Capture engine failed to initialize');
    });

    console.log(`[Capture] Successfully captured ${targetUrl}`);
    return res.json({ success: true, payload });
  } catch (err) {
    console.error(`[Capture Error] ${targetUrl}:`, err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to capture webpage'
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ HTML-2-Fig Capture Server listening on port ${PORT}`);
});
