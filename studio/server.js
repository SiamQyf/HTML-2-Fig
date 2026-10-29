const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { extractDomTruth, evaluateLayout, createFigmaMock, getAbsoluteFigmaRect } = require('../scripts/audit_layout');

const app = express();
const PORT = process.env.PORT || 4242;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure studio runs directory exists
const RUNS_DIR = path.join(__dirname, 'runs');
if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });

// Chrome executable detection
function getChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser'
  ];
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '2.0.0', time: Date.now() });
});

const RULES_PATH = path.join(__dirname, '../rules/rules.json');

app.get('/api/rules', (req, res) => {
  try {
    if (fs.existsSync(RULES_PATH)) {
      const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json(rules);
    }
  } catch (err) {}
  res.status(500).json({ error: 'Rules not available' });
});

app.post('/api/rules/sync', (req, res) => {
  try {
    const newRules = req.body;
    if (newRules && typeof newRules === 'object') {
      newRules.updatedAt = new Date().toISOString();
      fs.writeFileSync(RULES_PATH, JSON.stringify(newRules, null, 2), 'utf8');
      return res.json({ ok: true, version: newRules.version || Date.now() });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  res.status(400).json({ error: 'Invalid payload' });
});

// In-memory jobs
const jobs = new Map();

app.post('/api/start-audit', async (req, res) => {
  const { url, viewport = 'desktop', aiHeal = false } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS URL is required.' });
  }

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const jobDir = path.join(RUNS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const job = {
    id: jobId,
    url,
    viewport,
    status: 'running',
    step: 'INITIALIZING',
    logs: [],
    progress: 5,
    result: null,
    error: null,
    startTime: Date.now()
  };
  jobs.set(jobId, job);

  // Return immediately so UI can poll / stream progress
  res.json({ jobId });

  // Run pipeline in background
  runPipeline(job, jobDir, { url, viewport, aiHeal }).catch(err => {
    job.status = 'failed';
    job.error = err.message || String(err);
    job.logs.push(`❌ Error: ${job.error}`);
  });
});

app.get('/api/job/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.get('/api/job/:jobId/slice/:filename', (req, res) => {
  const filePath = path.join(RUNS_DIR, req.params.jobId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.get('/api/job/:jobId/download-figma', (req, res) => {
  const filePath = path.join(RUNS_DIR, req.params.jobId, 'figma_payload.json');
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Content-Disposition', `attachment; filename="figma_capture_${req.params.jobId}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(filePath);
});

async function runPipeline(job, jobDir, options) {
  const { url, viewport } = options;
  const vw = viewport === 'mobile' ? 375 : (viewport === 'tablet' ? 768 : 1440);
  const vh = viewport === 'mobile' ? 812 : (viewport === 'tablet' ? 1024 : 900);

  function log(msg, step, pct) {
    job.logs.push(msg);
    if (step) job.step = step;
    if (pct) job.progress = pct;
  }

  log(`🚀 Starting audit for: ${url} (${vw}x${vh})`, 'LAUNCHING_BROWSER', 10);

  const chromePath = getChromePath();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: vw, height: vh });

    log(`🌐 Navigating to URL and awaiting DOM load...`, 'LOADING_PAGE', 20);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3500));

    log(`🧹 Dismissing cookie banners and modal overlays...`, 'SETTLING_DOM', 30);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const accept = btns.find(b => /accept all|agree|allow all|required only/i.test(b.textContent));
      if (accept) { try { accept.click(); } catch (_) {} }
      const bannerSelectors = [
        '#onetrust-consent-sdk', '[class*="consent"]', '[id*="consent"]', '[class*="cookie"]', '[id*="cookie"]',
        '.awb-off-canvas-wrap', '[class*="off-canvas"]', '[class*="type-popup"]', '.awb-show'
      ];
      for (const sel of bannerSelectors) {
        document.querySelectorAll(sel).forEach(el => el.remove());
      }
    });

    log(`📜 Scrolling page to hydrate lazy elements and animations...`, 'HYDRATING', 40);
    const docH = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const stepCount = Math.min(25, Math.ceil(docH / 500));
    for (let i = 0; i < stepCount; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 80));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1200));

    // Remove any popups triggered by scroll
    await page.evaluate(() => {
      document.querySelectorAll('.awb-off-canvas-wrap, [class*="off-canvas"], [class*="type-popup"], .awb-show').forEach(el => el.remove());
    });

    const liveScreenshotPath = path.join(jobDir, 'live_website.png');
    log(`📸 Capturing live full-page screenshot...`, 'CAPTURING_SCREENSHOT', 50);
    await page.screenshot({ path: liveScreenshotPath, fullPage: true });

    log(`📐 Extracting Ground-Truth DOM hierarchy & glyph metrics...`, 'EXTRACTING_DOM', 58);
    const domTruth = await extractDomTruth(page);

    // Expose node image fetcher
    await page.exposeFunction('__nodeFetchImage', async (imgUrl) => {
      try {
        const res = await fetch(imgUrl);
        const arrayBuffer = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const contentType = res.headers.get('content-type') || 'image/png';
        return `data:${contentType};base64,${base64}`;
      } catch (e) {
        return null;
      }
    });

    log(`⚡ Executing capture.js serialization engine...`, 'SERIALIZING', 65);
    const captureCode = fs.readFileSync(path.join(__dirname, '../packages/chrome-extension/capture.js'), 'utf8');
    const data = await page.evaluate(async (code) => {
      window.chrome = window.chrome || {};
      window.chrome.runtime = window.chrome.runtime || {};
      window.chrome.runtime.sendMessage = (msg, cb) => {
        if (msg.type === 'FETCH_IMAGE') {
          window.__nodeFetchImage(msg.url).then(d => { if (cb) cb({ data: d }); }).catch(() => { if (cb) cb(null); });
        }
      };
      eval(code);
      return await window.html2Fig.captureRaw();
    }, captureCode);

    // Save Figma payload
    const payloadPath = path.join(jobDir, 'figma_payload.json');
    fs.writeFileSync(payloadPath, JSON.stringify(data, null, 2), 'utf8');

    log(`🎨 Simulating Figma plugin scene graph (code.js)...`, 'SIMULATING_FIGMA', 75);
    const imageMap = {};
    let imgCount = 0;
    const { createdNodes, env: mockFigma } = createFigmaMock();
    mockFigma.createImage = (bytes) => {
      const hash = 'img_' + (++imgCount);
      const buf = Buffer.from(bytes);
      let mime = 'image/png';
      if (buf[0] === 0xFF && buf[1] === 0xD8) mime = 'image/jpeg';
      else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif';
      else if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) mime = 'image/webp';
      imageMap[hash] = `data:${mime};base64,` + buf.toString('base64');
      return { hash };
    };
    const origCreateSvg = mockFigma.createNodeFromSvg;
    mockFigma.createNodeFromSvg = (svgString = '') => {
      const n = origCreateSvg(svgString);
      if (svgString) {
        const b64 = Buffer.from(svgString).toString('base64');
        const hash = 'svg_' + (++imgCount);
        imageMap[hash] = `data:image/svg+xml;base64,` + b64;
        n.svgImageHash = hash;
      }
      return n;
    };

    global.figma = mockFigma;
    global.__html__ = '';
    const pluginCode = fs.readFileSync(path.join(__dirname, '../packages/figma-plugin/src/code.js'), 'utf8');
    eval(pluginCode);
    await renderTree(data);

    const rootFrames = createdNodes.filter(n => !n.parent);
    const root = rootFrames[0];
    const rw = Math.round(root?.width || vw);
    const rh = Math.round(root?.height || docH);

    log(`🖼️ Rasterizing Figma canvas to image (${rw}x${rh})...`, 'RASTERIZING', 85);

    // Flatten nodes for canvas drawing with ancestor clipping support
    const flattened = [];
    for (const n of createdNodes) {
      if (n._isRemoved) continue;
      let isAttached = false;
      let cur = n;
      while (cur) {
        if (rootFrames.includes(cur)) { isAttached = true; break; }
        cur = cur.parent;
      }
      if (!isAttached) continue;

      const abs = getAbsoluteFigmaRect(n);

      let clipRect = null;
      let p = n.parent;
      while (p) {
        if (p.clipsContent) {
          let pAbs;
          if (!p.parent || rootFrames.includes(p)) {
            pAbs = { x: 0, y: 0, width: rw, height: rh };
          } else {
            pAbs = getAbsoluteFigmaRect(p);
          }
          if (!clipRect) {
            clipRect = { x: pAbs.x, y: pAbs.y, width: pAbs.width, height: pAbs.height };
          } else {
            const x1 = Math.max(clipRect.x, pAbs.x);
            const y1 = Math.max(clipRect.y, pAbs.y);
            const x2 = Math.min(clipRect.x + clipRect.width, pAbs.x + pAbs.width);
            const y2 = Math.min(clipRect.y + clipRect.height, pAbs.y + pAbs.height);
            clipRect = { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
          }
        }
        p = p.parent;
      }

      flattened.push({
        type: n.type,
        name: n.name,
        abs,
        clipRect,
        fills: n.fills || [],
        strokes: n.strokes || [],
        strokeWeight: n.strokeWeight || 0,
        strokeLeftWeight: n.strokeLeftWeight || 0,
        strokeRightWeight: n.strokeRightWeight || 0,
        strokeTopWeight: n.strokeTopWeight || 0,
        strokeBottomWeight: n.strokeBottomWeight || 0,
        cornerRadius: n.cornerRadius || 0,
        opacity: n.opacity !== undefined ? n.opacity : 1,
        visible: n.visible !== false,
        clipsContent: !!n.clipsContent,
        characters: n.characters || '',
        fontSize: n.fontSize || 16,
        fontName: n.fontName || null,
        textAlign: n.textAlignHorizontal || 'LEFT',
        lineHeight: n.lineHeight?.unit === 'PIXELS' ? n.lineHeight.value : (n.fontSize || 16) * 1.3,
        svgImageHash: n.svgImageHash || null
      });
    }

    const renderPage = await browser.newPage();
    await renderPage.setViewport({ width: rw, height: Math.min(rh, 16000) });
    await renderPage.evaluate(async (nodes, imgs, w, h) => {
      document.body.style.margin = '0';
      document.body.style.background = '#ffffff';
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');

      const loadedImgs = {};
      for (const [hash, b64] of Object.entries(imgs)) {
        const img = new Image();
        await new Promise(res => {
          img.onload = () => { loadedImgs[hash] = img; res(); };
          img.onerror = () => res();
          img.src = b64;
        });
      }

      for (const n of nodes) {
        if (!n.visible || n.abs.width <= 0 || n.abs.height <= 0) continue;
        ctx.save();
        if (n.clipRect) {
          ctx.beginPath();
          ctx.rect(n.clipRect.x, n.clipRect.y, n.clipRect.width, n.clipRect.height);
          ctx.clip();
        }
        ctx.globalAlpha = n.opacity;

        if (n.svgImageHash && loadedImgs[n.svgImageHash]) {
          try {
            ctx.drawImage(loadedImgs[n.svgImageHash], n.abs.x, n.abs.y, n.abs.width, n.abs.height);
          } catch (_) {}
        } else if (n.type !== 'TEXT') {
          const radius = Math.min(n.cornerRadius || 0, n.abs.width / 2, n.abs.height / 2);
          for (const f of n.fills) {
            if (f.type === 'SOLID' && f.color) {
              const r = Math.round(f.color.r * 255);
              const g = Math.round(f.color.g * 255);
              const b = Math.round(f.color.b * 255);
              ctx.fillStyle = `rgba(${r},${g},${b},${f.opacity !== undefined ? f.opacity : 1})`;
              if (radius > 0 && ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(n.abs.x, n.abs.y, n.abs.width, n.abs.height, radius);
                ctx.fill();
              } else {
                ctx.fillRect(n.abs.x, n.abs.y, n.abs.width, n.abs.height);
              }
            } else if (f.type === 'IMAGE' && f.imageHash && loadedImgs[f.imageHash]) {
              try {
                if (radius > 0 && ctx.roundRect) {
                  ctx.save();
                  ctx.beginPath();
                  ctx.roundRect(n.abs.x, n.abs.y, n.abs.width, n.abs.height, radius);
                  ctx.clip();
                  ctx.drawImage(loadedImgs[f.imageHash], n.abs.x, n.abs.y, n.abs.width, n.abs.height);
                  ctx.restore();
                } else {
                  ctx.drawImage(loadedImgs[f.imageHash], n.abs.x, n.abs.y, n.abs.width, n.abs.height);
                }
              } catch (_) {}
            }
          }
          if (n.strokes && n.strokes.length > 0) {
            for (const s of n.strokes) {
              if (s.type === 'SOLID' && s.color) {
                const r = Math.round(s.color.r * 255);
                const g = Math.round(s.color.g * 255);
                const b = Math.round(s.color.b * 255);
                ctx.fillStyle = `rgba(${r},${g},${b},${s.opacity !== undefined ? s.opacity : 1})`;
                if (n.strokeLeftWeight > 0) ctx.fillRect(n.abs.x, n.abs.y, n.strokeLeftWeight, n.abs.height);
                if (n.strokeRightWeight > 0) ctx.fillRect(n.abs.x + n.abs.width - n.strokeRightWeight, n.abs.y, n.strokeRightWeight, n.abs.height);
                if (n.strokeTopWeight > 0) ctx.fillRect(n.abs.x, n.abs.y, n.abs.width, n.strokeTopWeight);
                if (n.strokeBottomWeight > 0) ctx.fillRect(n.abs.x, n.abs.y + n.abs.height - n.strokeBottomWeight, n.abs.width, n.strokeBottomWeight);
                if (n.strokeWeight > 0) {
                  ctx.strokeStyle = `rgba(${r},${g},${b},${s.opacity !== undefined ? s.opacity : 1})`;
                  ctx.lineWidth = n.strokeWeight;
                  if (radius > 0 && ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(n.abs.x, n.abs.y, n.abs.width, n.abs.height, radius);
                    ctx.stroke();
                  } else {
                    ctx.strokeRect(n.abs.x, n.abs.y, n.abs.width, n.abs.height);
                  }
                }
              }
            }
          }
        } else if (n.type === 'TEXT' && n.characters) {
          ctx.fillStyle = '#111111';
          if (n.fills && n.fills[0] && n.fills[0].color) {
            const c = n.fills[0].color;
            ctx.fillStyle = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
          }
          const isBold = n.fontName && (
            n.fontName.style.includes('Bold') ||
            n.fontName.style.includes('700') ||
            n.fontName.style.includes('800') ||
            n.fontName.style.includes('900') ||
            n.fontName.style.includes('Black') ||
            n.fontName.style.includes('SemiBold')
          );
          const weight = isBold ? 'bold' : 'normal';
          ctx.font = `${weight} ${n.fontSize}px "${n.fontName?.family || 'Plus Jakarta Sans'}", sans-serif`;
          ctx.textBaseline = 'top';

          const lines = n.characters.split('\n');
          let curY = n.abs.y;
          for (const line of lines) {
            if (n.textAlign === 'CENTER') {
              ctx.textAlign = 'center';
              ctx.fillText(line, n.abs.x + n.abs.width / 2, curY);
            } else if (n.textAlign === 'RIGHT') {
              ctx.textAlign = 'right';
              ctx.fillText(line, n.abs.x + n.abs.width, curY);
            } else {
              ctx.textAlign = 'left';
              ctx.fillText(line, n.abs.x, curY);
            }
            curY += n.lineHeight;
          }
        }
        ctx.restore();
      }
    }, flattened, imageMap, rw, rh);

    const figmaScreenshotPath = path.join(jobDir, 'figma_canvas.png');
    await renderPage.screenshot({ path: figmaScreenshotPath, fullPage: true });

    log(`🔍 Generating side-by-side slices & diff calculation...`, 'SLICING', 92);
    const livePng = PNG.sync.read(fs.readFileSync(liveScreenshotPath));
    const figPng = PNG.sync.read(fs.readFileSync(figmaScreenshotPath));
    const sliceH = 1000;
    const totalH = Math.min(livePng.height, figPng.height);
    const slices = [];

    for (let y = 0; y < totalH; y += sliceH) {
      const curH = Math.min(sliceH, totalH - y);
      const combined = new PNG({ width: rw * 2, height: curH });
      for (let row = 0; row < curH; row++) {
        for (let col = 0; col < rw; col++) {
          // Left: Live
          const srcIdxLive = ((y + row) * rw + col) << 2;
          const dstIdxLeft = (row * (rw * 2) + col) << 2;
          combined.data[dstIdxLeft] = livePng.data[srcIdxLive];
          combined.data[dstIdxLeft + 1] = livePng.data[srcIdxLive + 1];
          combined.data[dstIdxLeft + 2] = livePng.data[srcIdxLive + 2];
          combined.data[dstIdxLeft + 3] = livePng.data[srcIdxLive + 3];

          // Right: Figma
          const srcIdxFig = ((y + row) * rw + col) << 2;
          const dstIdxRight = (row * (rw * 2) + rw + col) << 2;
          combined.data[dstIdxRight] = figPng.data[srcIdxFig];
          combined.data[dstIdxRight + 1] = figPng.data[srcIdxFig + 1];
          combined.data[dstIdxRight + 2] = figPng.data[srcIdxFig + 2];
          combined.data[dstIdxRight + 3] = figPng.data[srcIdxFig + 3];
        }
      }
      const sliceName = `slice_${y}_${y + curH}.png`;
      fs.writeFileSync(path.join(jobDir, sliceName), PNG.sync.write(combined));
      slices.push({
        y,
        height: curH,
        filename: sliceName,
        url: `/api/job/${job.id}/slice/${sliceName}`
      });
    }

    log(`📊 Computing 360° layout fidelity score...`, 'FINALIZING', 98);
    const auditRes = evaluateLayout(domTruth, createdNodes, url, 'live_website.png');

    job.result = {
      fidelityScore: auditRes.compositeScore,
      geometricScore: auditRes.geometryRate,
      typographyScore: auditRes.typographyRate,
      colorScore: auditRes.stylingRate,
      totalNodes: createdNodes.length,
      pageHeight: rh,
      pageWidth: rw,
      slices,
      anomalies: auditRes?.anomalies || [],
      figmaDownloadUrl: `/api/job/${job.id}/download-figma`
    };

    job.status = 'completed';
    job.step = 'DONE';
    job.progress = 100;
    log(`✅ Audit Complete! Fidelity: ${job.result.fidelityScore}% | 0 Critical Collisions.`, 'DONE', 100);

  } finally {
    await browser.close();
  }
}

function openBrowser(targetUrl) {
  if (process.env.OPEN_BROWSER === 'false') return;
  const { exec } = require('child_process');
  const startCmd = process.platform === 'win32' ? `start "" "${targetUrl}"` :
                   process.platform === 'darwin' ? `open "${targetUrl}"` :
                   `xdg-open "${targetUrl}"`;
  exec(startCmd, () => {});
}

const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 HTML-2-Fig Visual Studio is running!`);
  console.log(`🌐 Open in your browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
  openBrowser(`http://localhost:${PORT}`);
});

server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n⚠️  Port ${PORT} is already in use.`);
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      const data = await res.json();
      if (data.ok) {
        console.log(`✓ HTML-2-Fig Studio is already running on port ${PORT}!`);
        console.log(`🌐 Opening browser: http://localhost:${PORT}\n`);
        openBrowser(`http://localhost:${PORT}`);
        return;
      }
    } catch (_) {}
    console.error(`❌ Port ${PORT} is occupied by another process. Please close it or set PORT=4243.`);
  } else {
    console.error('Server error:', err);
  }
});
