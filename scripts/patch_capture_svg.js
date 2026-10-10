const fs = require('fs');

const file = 'packages/chrome-extension/src_original/capture.js';
let code = fs.readFileSync(file, 'utf8');
const isCrlf = code.includes('\r\n');

// 1. vectorizeEmbeddedSvgImages: guard against pattern
const oldVecPattern = `  async function vectorizeEmbeddedSvgImages(svgString) {
    if (!svgString || typeof svgString !== 'string') return { isVector: true, svg: svgString };


    if (!svgString.includes('<pattern') && !svgString.includes('<image')) return { isVector: true, svg: svgString };`;

const newVecPattern = `  async function vectorizeEmbeddedSvgImages(svgString) {
    if (!svgString || typeof svgString !== 'string') return { isVector: true, svg: svgString };

    // SVGs with repeating pattern fills cannot be simplified to a single tile
    if (svgString.includes('<pattern')) return { isVector: true, svg: svgString };

    if (!svgString.includes('<image')) return { isVector: true, svg: svgString };`;

const normOldVec = isCrlf ? oldVecPattern.replace(/\n/g, '\r\n') : oldVecPattern;
const normNewVec = isCrlf ? newVecPattern.replace(/\n/g, '\r\n') : newVecPattern;

if (code.includes(normOldVec)) {
  code = code.replace(normOldVec, normNewVec);
  console.log('Patched vectorizeEmbeddedSvgImages');
} else {
  console.error('normOldVec not found');
}

// 2. HTMLImageElement SVG handling: if svg has pattern, force rasterization and do not set placeholderUrl to tile
const oldImgSvg = `          if (svgText) {
            const vRes = await vectorizeEmbeddedSvgImages(svgText);
            if (vRes && vRes.dataUri && !vRes.isVector) {
              placeholderUrl = vRes.dataUri;
              if (assets) assets.addDataUrl(vRes.dataUri);
              tag = 'IMG';
              svgContent = null;
            } else if (vRes && vRes.isVector) {
              svgContent = vRes.svg;
              tag = 'SVG';
            } else {
              svgContent = svgText;
              tag = 'SVG';
            }`;

const newImgSvg = `          if (svgText) {
            if (svgText.includes('<pattern')) {
              // Patterned SVG: do NOT extract a single tile. Rasterize entire SVG via canvas at native resolution!
              assets.addImage(rawSrc, true);
              tag = 'IMG';
              placeholderUrl = null;
              svgContent = null;
            } else {
              const vRes = await vectorizeEmbeddedSvgImages(svgText);
              if (vRes && vRes.dataUri && !vRes.isVector) {
                placeholderUrl = vRes.dataUri;
                if (assets) assets.addDataUrl(vRes.dataUri);
                tag = 'IMG';
                svgContent = null;
              } else if (vRes && vRes.isVector) {
                svgContent = vRes.svg;
                tag = 'SVG';
              } else {
                svgContent = svgText;
                tag = 'SVG';
              }
            }`;

const normOldImg = isCrlf ? oldImgSvg.replace(/\n/g, '\r\n') : oldImgSvg;
const normNewImg = isCrlf ? newImgSvg.replace(/\n/g, '\r\n') : newImgSvg;

if (code.includes(normOldImg)) {
  code = code.replace(normOldImg, normNewImg);
  console.log('Patched HTMLImageElement SVG handling');
} else {
  console.error('normOldImg not found');
}

fs.writeFileSync(file, code, 'utf8');
console.log('Finished updating capture.js');
