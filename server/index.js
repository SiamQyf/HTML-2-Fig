const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

// Warm Browser Pool (keeps a running headless Chromium instance to avoid 5-second launch overhead)
let warmBrowser = null;
let warmBrowserPromise = null;

async function getWarmBrowser() {
  if (warmBrowser && warmBrowser.connected) {
    return warmBrowser;
  }
  if (warmBrowserPromise) {
    return warmBrowserPromise;
  }

  const execPath = getChromeExecutablePath();
  console.log(`[Puppeteer] Launching warm browser instance (bin: ${execPath || 'auto'})...`);
  warmBrowserPromise = puppeteer.launch({
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
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--mute-audio',
      '--no-default-browser-check',
      '--window-size=1440,900'
    ]
  }).then((b) => {
    warmBrowser = b;
    warmBrowserPromise = null;
    b.on('disconnected', () => {
      console.warn('[Puppeteer] Warm browser disconnected, will recreate on next request');
      warmBrowser = null;
      warmBrowserPromise = null;
    });
    return b;
  }).catch((err) => {
    console.error('[Puppeteer] Warm browser launch failed:', err.message);
    warmBrowserPromise = null;
    throw err;
  });

  return warmBrowserPromise;
}

// Pre-warm browser in background immediately on boot
setTimeout(() => {
  getWarmBrowser().then(() => {
    console.log('⚡ [Puppeteer] Headless Chrome pre-warmed and ready for instant captures!');
  }).catch((err) => {
    console.warn('[Puppeteer] Pre-warm notice:', err.message);
  });
}, 1500);

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

  let page = null;
  try {
    const browser = await getWarmBrowser();
    page = await browser.newPage();
    await page.setViewport({
      width: parseInt(width, 10) || 1440,
      height: parseInt(height, 10) || 900,
      deviceScaleFactor: 1
    });

    // Custom user agent to prevent basic bot blocks
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    // Abort media & tracking/analytics to maximize speed & save CPU
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      const reqUrl = req.url();
      if (
        type === 'media' ||
        /googletagmanager|google-analytics|doubleclick|facebook\.net|hotjar|segment\.io|sentry\.io|clarity\.ms/i.test(reqUrl)
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Inject capture engine ahead-of-time before DOM begins building
    if (captureScript) {
      await page.evaluateOnNewDocument(captureScript);
    } else {
      await page.evaluateOnNewDocument(() => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/gh/SiamQyf/HTML-2-Fig@Final/packages/chrome-extension/capture.js';
        document.documentElement.appendChild(s);
      });
    }

    console.log(`[Capture] Navigating to ${targetUrl}...`);
    try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 18000
      });
    } catch (navErr) {
      console.warn(`[Capture] Navigation notice: ${navErr.message}`);
      const hasBody = await page.evaluate(() => !!document.body).catch(() => false);
      if (!hasBody) {
        throw navErr;
      }
    }

    // Wait a brief moment for dynamic layout
    try {
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 1500 });
    } catch (_) {}

    // Fallback script injection if evaluateOnNewDocument missed (e.g. cached page)
    const engineReady = await page.evaluate(() => typeof window.html2Fig !== 'undefined' && typeof window.html2Fig.captureRaw === 'function').catch(() => false);
    if (!engineReady) {
      if (captureScript) {
        await page.evaluate(captureScript);
      } else {
        await page.addScriptTag({
          url: 'https://cdn.jsdelivr.net/gh/SiamQyf/HTML-2-Fig@Final/packages/chrome-extension/capture.js'
        });
      }
    }

    console.log('[Capture] Extracting HyperNodes...');
    const payload = await page.evaluate(async () => {
      if (window.html2Fig && typeof window.html2Fig.captureRaw === 'function') {
        return await window.html2Fig.captureRaw();
      }
      throw new Error('Capture engine failed to initialize');
    });

    console.log(`[Capture] Successfully captured ${targetUrl}`);

    // Gzip compressed response for ultra-fast network transfer (5MB -> ~400KB)
    const jsonStr = JSON.stringify({ success: true, payload });
    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (acceptEncoding.includes('gzip')) {
      const gzipped = zlib.gzipSync(Buffer.from(jsonStr));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      return res.send(gzipped);
    }

    return res.json({ success: true, payload });
  } catch (err) {
    console.error(`[Capture Error] ${targetUrl}:`, err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to capture webpage'
    });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ HTML-2-Fig Capture Server listening on port ${PORT}`);
});
