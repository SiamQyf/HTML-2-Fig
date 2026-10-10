const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Source icon: The newly made brand logo (Luminous Trace: neon </> curving into Figma logo)
const sourceBrainPath = 'C:/Users/Siam/.gemini/antigravity-ide/brain/43001b82-b371-4969-bb16-30582b40a9e1/plugin_matched_logo_1791632348443.jpg';
const repoSourcePath = path.resolve(__dirname, '../assets/brand_logo.jpg');

let sourceImagePath = sourceBrainPath;
if (!fs.existsSync(sourceImagePath)) {
  if (fs.existsSync(repoSourcePath)) {
    sourceImagePath = repoSourcePath;
  } else {
    console.error('Source image not found in brain or repo:', sourceImagePath);
    process.exit(1);
  }
}

// Ensure repo copy exists
if (!fs.existsSync(repoSourcePath)) {
  fs.copyFileSync(sourceImagePath, repoSourcePath);
  console.log('✓ Preserved source brand logo to assets/brand_logo.jpg');
}

const sourceBuffer = fs.readFileSync(sourceImagePath);
const sourceBase64 = 'data:image/jpeg;base64,' + sourceBuffer.toString('base64');

(async () => {
  console.log('🎨 Generating all icon sizes using Puppeteer canvas from new brand logo...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  async function renderIcon(size) {
    const pngBase64 = await page.evaluate(async (dataUri, s) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = s;
          canvas.height = s;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, s, s);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataUri;
      });
    }, sourceBase64, size);

    const base64Data = pngBase64.replace(/^data:image\/png;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }

  const [buf1024, buf128, buf48, buf32, buf16] = await Promise.all([
    renderIcon(1024),
    renderIcon(128),
    renderIcon(48),
    renderIcon(32),
    renderIcon(16)
  ]);

  await browser.close();

  const destinations = [
    // 1024px main icons
    { path: 'assets/icon.png', buffer: buf1024 },
    { path: 'assets/brand_logo.png', buffer: buf1024 },
    { path: 'packages/figma-plugin/icon.png', buffer: buf128 },
    { path: 'HTML To Figma Perfect/assets/icon.png', buffer: buf1024 },
    { path: 'HTML To Figma Perfect/assets/brand_logo.png', buffer: buf1024 },
    { path: 'HTML To Figma Perfect/packages/figma-plugin/icon.png', buffer: buf128 },
    { path: 'dist/figma-plugin/icon.png', buffer: buf128 },

    // Chrome Extension icons
    { path: 'packages/chrome-extension/icons/icon128.png', buffer: buf128 },
    { path: 'packages/chrome-extension/icons/icon48.png', buffer: buf48 },
    { path: 'packages/chrome-extension/icons/icon32.png', buffer: buf32 },
    { path: 'packages/chrome-extension/icons/icon16.png', buffer: buf16 },

    // Mirrored Chrome Extension icons
    { path: 'HTML To Figma Perfect/packages/chrome-extension/icons/icon128.png', buffer: buf128 },
    { path: 'HTML To Figma Perfect/packages/chrome-extension/icons/icon48.png', buffer: buf48 },
    { path: 'HTML To Figma Perfect/packages/chrome-extension/icons/icon32.png', buffer: buf32 },
    { path: 'HTML To Figma Perfect/packages/chrome-extension/icons/icon16.png', buffer: buf16 },

    // Chrome Extension Webstore icons
    { path: 'packages/chrome-extension-webstore/icons/icon128.png', buffer: buf128 },
    { path: 'packages/chrome-extension-webstore/icons/icon48.png', buffer: buf48 },
    { path: 'packages/chrome-extension-webstore/icons/icon32.png', buffer: buf32 },
    { path: 'packages/chrome-extension-webstore/icons/icon16.png', buffer: buf16 },

    // Dist icons
    { path: 'dist/chrome-extension-webstore/icons/icon128.png', buffer: buf128 },
    { path: 'dist/chrome-extension-webstore/icons/icon48.png', buffer: buf48 },
    { path: 'dist/chrome-extension-webstore/icons/icon32.png', buffer: buf32 },
    { path: 'dist/chrome-extension-webstore/icons/icon16.png', buffer: buf16 },

    { path: 'dist/html-to-figma-chrome-extension/icons/icon128.png', buffer: buf128 },
    { path: 'dist/html-to-figma-chrome-extension/icons/icon48.png', buffer: buf48 },
    { path: 'dist/html-to-figma-chrome-extension/icons/icon32.png', buffer: buf32 },
    { path: 'dist/html-to-figma-chrome-extension/icons/icon16.png', buffer: buf16 }
  ];

  for (const item of destinations) {
    const fullPath = path.resolve(__dirname, '..', item.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, item.buffer);
    console.log(`   ✓ Written ${item.path} (${item.buffer.length} bytes)`);
  }

  console.log('\n🎉 All icons successfully generated and deployed from the new brand logo!');
})();
