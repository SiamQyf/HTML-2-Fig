/**
 * Automated Ground-Truth Visual Regression & Pixel Diff Engine for HTML-2-Fig
 *
 * Compares actual DOM rendering against Figma export using pixelmatch:
 * 1. Pixel-by-pixel color distance analysis
 * 2. Visual Match Index (0 - 100%)
 * 3. Cluster detection of defect bounding boxes
 * 4. Interactive Split-Slider HTML Report with difference heatmap
 */

const fs = require('fs');
const path = require('path');
const _pm = require('pixelmatch');
const pixelmatch = _pm.default || _pm;
const { PNG } = require('pngjs');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT_DIR, 'audit_reports');

function parsePng(filePath) {
  const data = fs.readFileSync(filePath);
  return PNG.sync.read(data);
}

function writePng(filePath, png) {
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(filePath, buffer);
}

function resizeOrPad(png, targetWidth, targetHeight) {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png;
  }
  const resized = new PNG({ width: targetWidth, height: targetHeight });
  // Fill transparent or white background
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const targetIdx = (targetWidth * y + x) << 2;
      if (x < png.width && y < png.height) {
        const srcIdx = (png.width * y + x) << 2;
        resized.data[targetIdx] = png.data[srcIdx];
        resized.data[targetIdx + 1] = png.data[srcIdx + 1];
        resized.data[targetIdx + 2] = png.data[srcIdx + 2];
        resized.data[targetIdx + 3] = png.data[srcIdx + 3];
      } else {
        resized.data[targetIdx] = 255;
        resized.data[targetIdx + 1] = 255;
        resized.data[targetIdx + 2] = 255;
        resized.data[targetIdx + 3] = 0;
      }
    }
  }
  return resized;
}

/**
 * Cluster diff pixels into bounding box defects
 */
function findDefectClusters(diffPng, threshold = 10, maxClusters = 25) {
  const width = diffPng.width;
  const height = diffPng.height;
  const gridCellSize = 32;
  const cols = Math.ceil(width / gridCellSize);
  const rows = Math.ceil(height / gridCellSize);
  const grid = new Int32Array(cols * rows);

  // Mark grid cells containing diff pixels (pixelmatch paints diff pixels red [255, 0, 0])
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / gridCellSize);
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const r = diffPng.data[idx];
      const g = diffPng.data[idx + 1];
      const b = diffPng.data[idx + 2];
      // Red diff marker
      if (r > 200 && g < 80 && b < 80) {
        const col = Math.floor(x / gridCellSize);
        grid[row * cols + col]++;
      }
    }
  }

  // Find active bounding boxes
  const clusters = [];
  const visited = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gIdx = r * cols + c;
      if (visited[gIdx] || grid[gIdx] < threshold) continue;

      // Flood fill to find cluster bounds
      let minC = c, maxC = c, minR = r, maxR = r;
      let totalDiff = 0;
      const queue = [[c, r]];
      visited[gIdx] = 1;

      while (queue.length > 0) {
        const [currC, currR] = queue.pop();
        totalDiff += grid[currR * cols + currC];
        minC = Math.min(minC, currC);
        maxC = Math.max(maxC, currC);
        minR = Math.min(minR, currR);
        maxR = Math.max(maxR, currR);

        // Check neighbors
        for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nc = currC + dc;
          const nr = currR + dr;
          if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
            const nIdx = nr * cols + nc;
            if (!visited[nIdx] && grid[nIdx] >= threshold) {
              visited[nIdx] = 1;
              queue.push([nc, nr]);
            }
          }
        }
      }

      clusters.push({
        x: minC * gridCellSize,
        y: minR * gridCellSize,
        width: Math.min(width, (maxC + 1) * gridCellSize) - (minC * gridCellSize),
        height: Math.min(height, (maxR + 1) * gridCellSize) - (minR * gridCellSize),
        diffPixelCount: totalDiff
      });
    }
  }

  // Sort by severity (pixel count)
  clusters.sort((a, b) => b.diffPixelCount - a.diffPixelCount);
  return clusters.slice(0, maxClusters);
}

async function runVisualDiff(domImagePath, figmaImagePath, options = {}) {
  console.log('\n======================================================');
  console.log(`🖼️ [Visual Diff] Comparing:`);
  console.log(`   DOM Screenshot:   ${domImagePath}`);
  console.log(`   Figma Export:     ${figmaImagePath}`);
  console.log('======================================================\n');

  if (!fs.existsSync(domImagePath)) {
    throw new Error(`DOM image does not exist: ${domImagePath}`);
  }
  if (!fs.existsSync(figmaImagePath)) {
    throw new Error(`Figma image does not exist: ${figmaImagePath}`);
  }

  let img1 = parsePng(domImagePath);
  let img2 = parsePng(figmaImagePath);

  const maxWidth = Math.max(img1.width, img2.width);
  const maxHeight = Math.max(img1.height, img2.height);

  img1 = resizeOrPad(img1, maxWidth, maxHeight);
  img2 = resizeOrPad(img2, maxWidth, maxHeight);

  const diffPng = new PNG({ width: maxWidth, height: maxHeight });

  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diffPng.data,
    maxWidth,
    maxHeight,
    {
      threshold: options.threshold !== undefined ? options.threshold : 0.1,
      includeAA: false,
      diffColor: [255, 30, 80], // Bright neon red
      diffColorAlt: [0, 220, 255]
    }
  );

  const totalPixels = maxWidth * maxHeight;
  const matchPercentage = Number((((totalPixels - numDiffPixels) / totalPixels) * 100).toFixed(2));

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

  const diffOutputPath = path.join(REPORT_DIR, 'visual_diff_mask.png');
  writePng(diffOutputPath, diffPng);

  // Detect defect bounding boxes
  const defectClusters = findDefectClusters(diffPng);

  console.log('------------------------------------------------------');
  console.log('📊 VISUAL FIDELITY SCORE');
  console.log('------------------------------------------------------');
  console.log(`• Dimensions:            ${maxWidth} x ${maxHeight} px`);
  console.log(`• Total Pixels:          ${totalPixels.toLocaleString()}`);
  console.log(`• Mismatched Pixels:     ${numDiffPixels.toLocaleString()}`);
  console.log(`• Match Index:           ${matchPercentage >= 95 ? '✅ ' : matchPercentage >= 85 ? '⚠️ ' : '❌ '}${matchPercentage}%`);
  console.log(`• Defect Clusters Found: ${defectClusters.length}`);
  console.log('------------------------------------------------------');

  if (defectClusters.length > 0) {
    console.log('\n🔍 TOP DETECTED DEFECT REGIONS:');
    defectClusters.slice(0, 8).forEach((cluster, idx) => {
      console.log(`  [Region ${idx + 1}] Bounds: [X: ${cluster.x}, Y: ${cluster.y}, W: ${cluster.width}, H: ${cluster.height}] &bull; ~${cluster.diffPixelCount} mismatched pixels`);
    });
  }

  // Copy images to report directory for self-contained HTML
  const domCopy = path.join(REPORT_DIR, 'dom_snapshot.png');
  const figmaCopy = path.join(REPORT_DIR, 'figma_snapshot.png');
  fs.copyFileSync(domImagePath, domCopy);
  fs.copyFileSync(figmaImagePath, figmaCopy);

  // Generate Interactive Comparison HTML
  const reportPath = path.join(REPORT_DIR, 'visual_diff_report.html');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>HTML-2-Fig Visual Regression Diff</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0d14; color: #f8fafc; margin: 0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 6px; color: #6366f1; }
    .subtitle { color: #94a3b8; font-size: 13px; margin-bottom: 20px; }
    .stat-row { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-box { background: rgba(18, 23, 37, 0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 20px; }
    .stat-val { font-size: 26px; font-weight: 700; color: ${matchPercentage >= 95 ? '#10b981' : matchPercentage >= 85 ? '#f59e0b' : '#f43f5e'}; }
    .stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }
    
    .toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
    .btn { background: #1e293b; color: #f8fafc; border: 1px solid rgba(255,255,255,0.12); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.15s; }
    .btn:hover { background: #334155; }
    .btn.active { background: #6366f1; border-color: #818cf8; }

    .diff-container {
      position: relative;
      display: inline-block;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      max-width: 100%;
    }
    .diff-img {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .overlay-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }
    .cluster-box {
      position: absolute;
      border: 2px solid #f43f5e;
      background: rgba(244, 63, 94, 0.15);
      border-radius: 4px;
      pointer-events: all;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .cluster-box:hover {
      background: rgba(244, 63, 94, 0.35);
      border-color: #fb7185;
      transform: scale(1.01);
    }
    .cluster-tag {
      position: absolute;
      top: -20px;
      left: 0;
      background: #f43f5e;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
    }
    .clusters-list {
      margin-top: 24px;
      background: rgba(18, 23, 37, 0.6);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 16px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    th { color: #94a3b8; font-weight: 600; font-size: 12px; }
  </style>
</head>
<body>
  <h1>🖼️ HTML-2-Fig Ground Truth Visual Diff</h1>
  <div class="subtitle">DOM Screenshot vs Figma Render &bull; ${new Date().toLocaleString()}</div>

  <div class="stat-row">
    <div class="stat-box">
      <div class="stat-val">${matchPercentage}%</div>
      <div class="stat-lbl">Visual Match Index</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color: #cbd5e1;">${numDiffPixels.toLocaleString()}</div>
      <div class="stat-lbl">Mismatched Pixels</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color: #cbd5e1;">${defectClusters.length}</div>
      <div class="stat-lbl">Defect Regions</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color: #cbd5e1;">${maxWidth}&times;${maxHeight}</div>
      <div class="stat-lbl">Dimensions (px)</div>
    </div>
  </div>

  <div class="toolbar">
    <button class="btn active" id="btn-split" onclick="setView('split')">Side-by-Side Slider</button>
    <button class="btn" id="btn-heatmap" onclick="setView('heatmap')">Diff Heatmap</button>
    <button class="btn" id="btn-dom" onclick="setView('dom')">DOM Ground Truth</button>
    <button class="btn" id="btn-figma" onclick="setView('figma')">Figma Render</button>
    <button class="btn" id="btn-boxes" onclick="toggleBoxes()">Toggle Defect Boxes</button>
  </div>

  <div class="diff-container" id="container">
    <img src="dom_snapshot.png" class="diff-img" id="base-img" />
    <img src="figma_snapshot.png" class="overlay-img" id="figma-img" style="opacity: 0;" />
    <img src="visual_diff_mask.png" class="overlay-img" id="diff-img" style="opacity: 0;" />
    <div id="boxes-layer">
      ${defectClusters.map((c, i) => `
        <div class="cluster-box" style="left:${c.x}px; top:${c.y}px; width:${c.width}px; height:${c.height}px;" title="Region ${i + 1}: ${c.diffPixelCount} mismatched pixels">
          <div class="cluster-tag">#${i + 1} (${c.diffPixelCount}px)</div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="clusters-list">
    <h3 style="font-size: 15px; margin-bottom: 8px;">📍 Detected Defect Clusters</h3>
    <table>
      <thead>
        <tr><th>#</th><th>X</th><th>Y</th><th>Width</th><th>Height</th><th>Diff Pixels</th></tr>
      </thead>
      <tbody>
        ${defectClusters.map((c, i) => `
          <tr>
            <td><strong>#${i + 1}</strong></td>
            <td>${c.x}px</td>
            <td>${c.y}px</td>
            <td>${c.width}px</td>
            <td>${c.height}px</td>
            <td style="color:#f43f5e; font-weight:600;">${c.diffPixelCount.toLocaleString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <script>
    let showBoxes = true;
    function setView(mode) {
      document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
      const figmaImg = document.getElementById('figma-img');
      const diffImg = document.getElementById('diff-img');
      
      if (mode === 'split') {
        document.getElementById('btn-split').classList.add('active');
        figmaImg.style.opacity = '0.5';
        diffImg.style.opacity = '0';
      } else if (mode === 'heatmap') {
        document.getElementById('btn-heatmap').classList.add('active');
        figmaImg.style.opacity = '0';
        diffImg.style.opacity = '1';
      } else if (mode === 'dom') {
        document.getElementById('btn-dom').classList.add('active');
        figmaImg.style.opacity = '0';
        diffImg.style.opacity = '0';
      } else if (mode === 'figma') {
        document.getElementById('btn-figma').classList.add('active');
        figmaImg.style.opacity = '1';
        diffImg.style.opacity = '0';
      }
    }
    function toggleBoxes() {
      showBoxes = !showBoxes;
      document.getElementById('boxes-layer').style.display = showBoxes ? 'block' : 'none';
      document.getElementById('btn-boxes').classList.toggle('active', showBoxes);
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(reportPath, html, 'utf8');
  console.log(`\n📄 Interactive Visual Diff report saved to: ${reportPath}`);

  return {
    matchPercentage,
    numDiffPixels,
    defectClusters,
    reportPath
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const puppeteer = require('puppeteer');
  
  (async () => {
    if (args.length === 1 && (args[0].startsWith('http') || args[0].endsWith('.html'))) {
      const target = args[0];
      console.log(`\n🌐 Capturing DOM screenshot for: ${target}`);
      const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      let targetUrl = target;
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        targetUrl = 'file://' + path.resolve(target).replace(/\\/g, '/');
      }
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
      const domSnapPath = path.join(REPORT_DIR, 'dom_snapshot.png');
      await page.screenshot({ path: domSnapPath });
      await browser.close();
      console.log(`📸 DOM screenshot saved to: ${domSnapPath}`);
      console.log(`💡 To compare against your Figma export:`);
      console.log(`   node scripts/audit_visual_diff.js ${domSnapPath} <your_figma_export.png>\n`);
    } else if (args.length >= 2) {
      await runVisualDiff(args[0], args[1]);
    } else {
      console.log('Usage:');
      console.log('  1. Compare two images:');
      console.log('     node scripts/audit_visual_diff.js <dom_image.png> <figma_image.png>');
      console.log('  2. Capture live page reference:');
      console.log('     node scripts/audit_visual_diff.js <url_or_html_file>');
    }
  })().catch(err => {
    console.error('Visual diff failed:', err);
    process.exit(1);
  });
}

module.exports = { runVisualDiff };
