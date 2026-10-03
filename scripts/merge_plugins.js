const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const h2fPluginDir = path.join(rootDir, 'packages', 'figma-plugin');
const assetsDiaryDir = path.join(rootDir, 'Assets Diary');

console.log('--- Merging Assets Diary into HTML To Figma Plugin ---');

// 1. Process Assets Diary UI HTML
let adUi = fs.readFileSync(path.join(assetsDiaryDir, 'ui.html'), 'utf8');

// Inject the Back to HTML to Figma top bar right after <body>
const topBarHtml = `
<div class="h2f-top-bar" id="h2fTopBar" style="background:#0a0d14;padding:9px 16px;display:flex;align-items:center;justify-content:space-between;margin:0 -20px 0 -20px;border-bottom:1px solid rgba(255,255,255,0.12);position:sticky;top:0;z-index:999999;box-shadow:0 2px 10px rgba(0,0,0,0.5);">
  <button id="btnBackToHtml2Fig" type="button" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;border:none;border-radius:6px;padding:6px 13px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px;cursor:pointer;box-shadow:0 2px 8px rgba(79,70,229,0.35);transition:all 0.15s ease;" onmouseover="this.style.filter='brightness(1.15)';this.style.transform='translateY(-1px)'" onmouseout="this.style.filter='none';this.style.transform='none'">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>
    Back to HTML to Figma
  </button>
  <span style="font-size:10.5px;color:#a5b4fc;font-weight:700;letter-spacing:0.3px;">HTML ➔ Figma Perfect</span>
</div>
`;

adUi = adUi.replace(/<body[^>]*>/i, match => match + '\n' + topBarHtml);

// Inject back button click handler
const backScript = `
<script>
  (function() {
    function wireBackBtn() {
      const btn = document.getElementById('btnBackToHtml2Fig');
      if (btn && !btn._h2fBound) {
        btn._h2fBound = true;
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          parent.postMessage({ pluginMessage: { type: 'switch_to_html2fig' } }, '*');
        });
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireBackBtn);
    } else {
      wireBackBtn();
    }
    setTimeout(wireBackBtn, 200);
    setTimeout(wireBackBtn, 800);
  })();
</script>
`;

adUi = adUi.replace(/<\/body>/i, backScript + '\n</body>');

// 2. Process Assets Diary code.js
let adCode = fs.readFileSync(path.join(assetsDiaryDir, 'code.js'), 'utf8');

// Remove initial figma.showUI call from Assets Diary code
adCode = adCode.replace(
  /figma\.showUI\(__html__,\s*\{[^}]*\}\);?/,
  '// [Merged] Initial showUI suppressed - managed by root plugin controller'
);

// Convert figma.ui.onmessage to handleAssetsDiaryMessage
adCode = adCode.replace(
  /figma\.ui\.onmessage\s*=\s*async\s*\(([^)]*)\)\s*=>\s*\{/,
  'async function handleAssetsDiaryMessage($1) {'
);

// Gate selectionchange listener by active view
adCode = adCode.replace(
  /figma\.on\('selectionchange',\s*\(\)\s*=>\s*\{/,
  `figma.on('selectionchange', () => {\n  if (currentPluginView !== 'assets_diary') return;`
);

// Convert anonymous initPluginHost to named function
adCode = adCode.replace(
  /\(async\s+function\s+initPluginHost\(\)\s*\{/,
  'async function initAssetsDiarySession() {'
);
adCode = adCode.replace(
  /\}\)\(\);?\s*$/,
  '}\n'
);

// 3. Process packages/figma-plugin/src/code.js from pristine git commit 0256023
let h2fCode = execSync('git show 0256023:packages/figma-plugin/src/code.js', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

// Add currentPluginView and set initial UI height to 445
h2fCode = h2fCode.replace(
  /figma\.showUI\(__html__,\s*\{\s*width:\s*380,\s*height:\s*380,\s*themeColors:\s*true\s*\}\);/,
  `let currentPluginView = 'html2fig';\nfigma.showUI(__html__, { width: 323, height: 445, themeColors: true });`
);

// Update figma.ui.onmessage to handle switch_to_assets_diary, switch_to_html2fig, and delegate unhandled messages
const targetOnMessage = `figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'switch_to_assets_diary') {
    currentPluginView = 'assets_diary';
    figma.showUI(ASSETS_DIARY_HTML, { width: 400, height: 750, themeColors: true });
    try {
      await initAssetsDiarySession();
    } catch (e) {
      console.error('[Assets Diary init error]', e);
    }
    return;
  }

  if (msg.type === 'switch_to_html2fig') {
    currentPluginView = 'html2fig';
    figma.showUI(__html__, { width: 323, height: 445, themeColors: true });
    checkLicenseAndUsage().then((info) => {
      figma.ui.postMessage({ type: 'license_info', ...info });
    }).catch(() => {
      figma.ui.postMessage({ type: 'license_info', isPro: false, freeUsed: 0, maxFree: MAX_FREE_EXPORTS });
    });
    return;
  }

  if (msg.type === 'import' && msg.data) {`;

h2fCode = h2fCode.replace(
  /figma\.ui\.onmessage\s*=\s*async\s*\(msg\)\s*=>\s*\{\s*if\s*\(msg\.type\s*===\s*'import'\s*&&\s*msg\.data\)\s*\{/,
  targetOnMessage
);

// Update resize height fallback and delegate unhandled messages to handleAssetsDiaryMessage
const targetEndOnMessage = `  } else if (msg.type === 'resize') {
    figma.ui.resize(msg.width || 380, msg.height || 445);
  } else {
    try {
      await handleAssetsDiaryMessage(msg);
    } catch (err) {
      console.error('[Assets Diary Error]', err);
    }
  }
};`;

h2fCode = h2fCode.replace(
  /\}\s*else\s*if\s*\(msg\.type\s*===\s*'resize'\)\s*\{\s*figma\.ui\.resize\(msg\.width\s*\|\|\s*380,\s*msg\.height\s*\|\|\s*380\);\s*\}\s*\};/,
  targetEndOnMessage
);

// Ensure renderTree dimensions are always strictly positive finite numbers to prevent resize exceptions
h2fCode = h2fCode.replace(
  /let dw = contentW \|\| Math\.min\(docW, viewportW\);\s*const dh = Math\.round\(data\.documentRect\?\.height \|\| data\.viewportRect\?\.height \|\| 900\);/,
  `let dw = Math.max(10, Math.round(contentW || Math.min(docW, viewportW) || 1440));\n  const dh = Math.max(10, Math.round(data.documentRect?.height || data.viewportRect?.height || 900));`
);

h2fCode = h2fCode.replace(
  /cutAndPasteNavbarsToTop\(rootFrame\);/,
  `try { cutAndPasteNavbarsToTop(rootFrame); } catch (e) {}`
);

// Append ASSETS_DIARY_HTML string and adCode to h2fCode
const mergedCode = `
${h2fCode}

// ============================================================================
// ==================== ASSETS DIARY INTEGRATED MODULE ========================
// ============================================================================

const ASSETS_DIARY_HTML = ${JSON.stringify(adUi)};

${adCode}
`;

fs.writeFileSync(path.join(h2fPluginDir, 'src', 'code.js'), mergedCode.trim() + '\n', 'utf8');
console.log('✓ Successfully generated packages/figma-plugin/src/code.js');

// 4. Update packages/figma-plugin/src/ui.html
let h2fUi = fs.readFileSync(path.join(h2fPluginDir, 'src', 'ui.html'), 'utf8');

// Ensure button is <button class="btn-assets-diary" id="btnAssetsDiary" type="button">
h2fUi = h2fUi.replace(
  /<a\s+class="btn-assets-diary"\s+id="btnAssetsDiary"[^>]*>([\s\S]*?)<\/a>/,
  `<button class="btn-assets-diary" id="btnAssetsDiary" type="button">$1</button>`
);

// Ensure btnAssetsDiary click listener exists
if (!h2fUi.includes(`switch_to_assets_diary`)) {
  const switchScript = `
  const btnAssetsDiary = document.getElementById('btnAssetsDiary');
  if (btnAssetsDiary) {
    btnAssetsDiary.addEventListener('click', () => {
      parent.postMessage({ pluginMessage: { type: 'switch_to_assets_diary' } }, '*');
    });
  }
`;
  h2fUi = h2fUi.replace(
    /btnRemovePayload\.addEventListener\('click'[\s\S]*?\}\);/,
    match => match + '\n' + switchScript
  );
}

fs.writeFileSync(path.join(h2fPluginDir, 'src', 'ui.html'), h2fUi, 'utf8');
console.log('✓ Verified packages/figma-plugin/src/ui.html');

// 5. Update manifest.json
const manifestPath = path.join(h2fPluginDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

manifest.networkAccess = {
  allowedDomains: [
    "https://api.gumroad.com",
    "https://www.googleapis.com",
    "https://oauth2.googleapis.com",
    "https://accounts.google.com"
  ],
  reasoning: "Verify customer Gumroad license keys and connect to Google Drive for Assets Diary."
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('✓ Verified packages/figma-plugin/manifest.json');

// 6. Mirror everything to 'HTML To Figma Perfect'
const mirrorDir = path.join(rootDir, 'HTML To Figma Perfect', 'packages', 'figma-plugin');
if (fs.existsSync(mirrorDir)) {
  fs.copyFileSync(path.join(h2fPluginDir, 'src', 'code.js'), path.join(mirrorDir, 'src', 'code.js'));
  fs.copyFileSync(path.join(h2fPluginDir, 'src', 'ui.html'), path.join(mirrorDir, 'src', 'ui.html'));
  fs.copyFileSync(manifestPath, path.join(mirrorDir, 'manifest.json'));
  console.log('✓ Mirrored files to HTML To Figma Perfect');
}

console.log('--- Merge complete! ---');
