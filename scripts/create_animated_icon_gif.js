const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { GifWriter } = require('omggif');

(async () => {
  const rootDir = 'C:/h2F';
  const logoPath = path.join(rootDir, 'assets/brand_logo.png');
  const logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  async function generateGif(size, numFrames, frameDelay) {
    const framesData = await page.evaluate(async (dataUri, size, numFrames) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const frames = [];

          for (let f = 0; f < numFrames; f++) {
            const progress = f / numFrames;

            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);

            ctx.save();
            const sweepX = -size * 0.4 + progress * (size * 1.8);
            const sweepY = sweepX;

            const grad = ctx.createLinearGradient(
              sweepX - size * 0.3, sweepY - size * 0.3,
              sweepX + size * 0.3, sweepY + size * 0.3
            );

            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.35, 'rgba(0, 242, 254, 0.1)');
            grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
            grad.addColorStop(0.65, 'rgba(217, 70, 239, 0.15)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);

            const pulse = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5;
            const radial = ctx.createRadialGradient(
              size * 0.5, size * 0.5, size * 0.1,
              size * 0.5, size * 0.5, size * 0.55
            );
            radial.addColorStop(0, `rgba(59, 130, 246, ${0.06 * pulse})`);
            radial.addColorStop(0.7, `rgba(139, 92, 246, ${0.08 * pulse})`);
            radial.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = radial;
            ctx.fillRect(0, 0, size, size);
            ctx.restore();

            const imgData = ctx.getImageData(0, 0, size, size);
            frames.push(Array.from(imgData.data));
          }
          resolve(frames);
        };
        img.src = dataUri;
      });
    }, logoBase64, size, numFrames);

    function createPaletteAndIndexedPixels(rgbaArray, width, height) {
      const totalPixels = width * height;
      const colorMap = new Map();
      const palette = [];
      const indexedPixels = new Uint8Array(totalPixels);

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const r = rgbaArray[idx] & 0xf8;
        const g = rgbaArray[idx + 1] & 0xf8;
        const b = rgbaArray[idx + 2] & 0xf8;
        const key = (r << 16) | (g << 8) | b;
        if (!colorMap.has(key)) {
          if (palette.length < 256) {
            colorMap.set(key, palette.length);
            palette.push(key);
          } else {
            colorMap.set(key, 0);
          }
        }
        indexedPixels[i] = colorMap.get(key);
      }
      while (palette.length < 256) palette.push(0);
      return { palette, indexedPixels };
    }

    const gifBuffer = Buffer.alloc(10 * 1024 * 1024);
    const gifWriter = new GifWriter(gifBuffer, size, size, { loop: 0 });

    for (let f = 0; f < framesData.length; f++) {
      const { palette, indexedPixels } = createPaletteAndIndexedPixels(framesData[f], size, size);
      gifWriter.addFrame(0, 0, size, size, indexedPixels, {
        palette: palette,
        delay: frameDelay,
        disposal: 2
      });
    }

    return gifBuffer.slice(0, gifWriter.end());
  }

  console.log('Rendering 256x256 GIF...');
  const gif256 = await generateGif(256, 24, 6);

  console.log('Rendering 128x128 GIF...');
  const gif128 = await generateGif(128, 24, 6);

  await browser.close();

  // Save 256x256
  fs.writeFileSync(path.join(rootDir, 'assets/icon.gif'), gif256);
  fs.writeFileSync(path.join(rootDir, 'assets/brand_logo.gif'), gif256);
  fs.writeFileSync(path.join(rootDir, 'HTML To Figma Perfect/assets/icon.gif'), gif256);

  // Save 128x128
  fs.writeFileSync(path.join(rootDir, 'packages/chrome-extension/icons/icon.gif'), gif128);
  fs.writeFileSync(path.join(rootDir, 'packages/chrome-extension/icons/icon128.gif'), gif128);
  fs.writeFileSync(path.join(rootDir, 'packages/figma-plugin/icon.gif'), gif128);

  const artifactDir = 'C:/Users/Siam/.gemini/antigravity/brain/7ae2e08d-ceb5-4502-a0f7-7008735b4cb9';
  if (fs.existsSync(artifactDir)) {
    fs.writeFileSync(path.join(artifactDir, 'icon_animated_256.gif'), gif256);
    fs.writeFileSync(path.join(artifactDir, 'icon_animated_128.gif'), gif128);
  }

  console.log(`✓ 256x256 GIF: ${(gif256.length / 1024).toFixed(1)} KB`);
  console.log(`✓ 128x128 GIF: ${(gif128.length / 1024).toFixed(1)} KB`);
})();
