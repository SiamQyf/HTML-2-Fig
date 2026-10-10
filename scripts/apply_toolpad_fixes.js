const fs = require('fs');
const acorn = require('acorn');

// 1. Fix scripts/patch_code_js.js
let patchScript = fs.readFileSync('scripts/patch_code_js.js', 'utf8');
patchScript = patchScript.replace(/const B=\(\(M\.match/g, 'const B=(M.match');
patchScript = patchScript.replace(/const t=\(\(i\.match/g, 'const t=(i.match');
patchScript = patchScript.replace(/const t=\(\(e\.placeholderUrl\.match/g, 'const t=(e.placeholderUrl.match');
fs.writeFileSync('scripts/patch_code_js.js', patchScript, 'utf8');
console.log('Fixed scripts/patch_code_js.js');

const files = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log('Skipping non-existent:', file);
    continue;
  }
  let code = fs.readFileSync(file, 'utf8');

  // Fix 1: Fix parens from earlier patch
  code = code.replace(/const B=\(\(M\.match/g, 'const B=(M.match');
  code = code.replace(/const t=\(\(i\.match/g, 'const t=(i.match');
  code = code.replace(/const t=\(\(e\.placeholderUrl\.match/g, 'const t=(e.placeholderUrl.match');

  // Fix 2: IMG tag SVG vs Raster detection
  const oldImgCheck = 'if(a||n.includes("<svg")||n.includes("<?xml"))try{';
  const newImgCheck = 'const isRaster=(r[0]===0x89&&r[1]===0x50)||(r[0]===0xff&&r[1]===0xd8)||(r[0]===0x47&&r[1]===0x49)||(r[0]===0x52&&r[1]===0x49);const isSvg=!isRaster&&(n.includes("<svg")||n.includes("<?xml"));if(isSvg)try{';
  if (code.includes(oldImgCheck)) {
    code = code.replace(oldImgCheck, newImgCheck);
    console.log(file, ': replaced oldImgCheck');
  } else {
    console.log(file, ': oldImgCheck not found (may already be replaced)');
  }

  // Fix 3: Text inline sibling spacing (prevent horizontal centering shift on inline siblings)
  const oldTextInline1 = 'm?e.contentRect&&null!=r?f.x=Math.round(e.contentRect.x-r+(e.contentRect.width-n)/2):f.x=O+Math.round((U-n)/2):';
  const newTextInline1 = 'm?f.x=O:';
  if (code.includes(oldTextInline1)) {
    code = code.replace(oldTextInline1, newTextInline1);
    console.log(file, ': replaced oldTextInline1');
  } else {
    console.log(file, ': oldTextInline1 not found');
  }

  const oldTextInline2 = ':f.x=U>0?O+Math.round((U-n)/2):O';
  const newTextInline2 = ':f.x=O';
  if (code.includes(oldTextInline2)) {
    code = code.replace(oldTextInline2, newTextInline2);
    console.log(file, ': replaced oldTextInline2');
  }

  // Fix 4: Enhance hydrateSvgPatterns to resolve pattern images and cleanup orphaned tile nodes
  const oldHydrate = 'function hydrateSvgPatterns(e,t){if(!e||!t)return;const r=t.includes("<pattern"),n=t.includes("<image");if(!r&&!n)return;const o={},i=Array.from(t.matchAll(/<pattern\\b[^>]*?\\bid=["\']([^"\']+)["\'][^>]*?>([\\s\\S]*?)<\\/pattern>/gi));for(const e of i){const t=e[1],r=e[2].match(/(?:xlink:)?href=["\'](data:image\\/[^"\']+)["\']/i);if(r){const e=decodeBase64Image(r[1]);if(e)try{const r=figma.createImage(e);o[t]=r.hash}catch{}}}const a=Object.keys(o);if(a.length>0){const r=Array.from(t.matchAll(/<(?:path|rect|circle|polygon|ellipse)\\b[^>]*?\\bfill=["\']url\\(#([^"\']+)\\)["\']/gi));!function e(t){if(t.fills&&0===t.fills.length){const e=r[0]?.[1],n=e&&o[e]?o[e]:o[a[0]];n&&(t.fills=[{type:"IMAGE",imageHash:n,scaleMode:"FILL"}])}if(t.children)for(const r of t.children)e(r)}(e)}if(n&&!r){';
  
  const newHydrate = `function hydrateSvgPatterns(e,t){if(!e||!t)return;const r=t.includes("<pattern"),n=t.includes("<image");if(!r&&!n)return;const imgMap={};for(const m of t.matchAll(/<image\\b[^>]*?\\bid=["']([^"']+)["'][^>]*?(?:xlink:)?href=["'](data:image\\/[^"']+)["']/gi)){imgMap[m[1]]=m[2]}for(const m of t.matchAll(/<image\\b[^>]*?(?:xlink:)?href=["'](data:image\\/[^"']+)["'][^>]*?\\bid=["']([^"']+)["']/gi)){imgMap[m[2]]=m[1]}const o={},i=Array.from(t.matchAll(/<pattern\\b[^>]*?\\bid=["']([^"']+)["'][^>]*?>([\\s\\S]*?)<\\/pattern>/gi));for(const e of i){const t=e[1];let u=e[2].match(/(?:xlink:)?href=["'](data:image\\/[^"']+)["']/i)?.[1];if(!u){const useM=e[2].match(/(?:xlink:)?href=["']#([^"']+)["']/i);if(useM&&imgMap[useM[1]])u=imgMap[useM[1]]}if(u){const e=decodeBase64Image(u);if(e)try{const r=figma.createImage(e);o[t]=r.hash}catch{}}}const a=Object.keys(o);if(a.length>0){const r=Array.from(t.matchAll(/<(?:path|rect|circle|polygon|ellipse)\\b[^>]*?\\bfill=["']url\\(#([^"']+)\\)["']/gi));!function p(t){if(t.fills&&0===t.fills.length){const e=r[0]?.[1],n=e&&o[e]?o[e]:o[a[0]];n&&(t.fills=[{type:"IMAGE",imageHash:n,scaleMode:"FILL"}])}if(t.children)for(const r of t.children)p(r)}(e);if(e.children){for(let idx=e.children.length-1;idx>=0;idx--){const ch=e.children[idx];if((ch.type==="RECTANGLE"||ch.type==="FRAME")&&ch.width<e.width*0.2&&ch.height>=e.height*0.2){try{ch.remove()}catch{ch.visible=!1}}}}}if(n&&!r){`;

  if (code.includes(oldHydrate)) {
    code = code.replace(oldHydrate, newHydrate);
    console.log(file, ': replaced oldHydrate with enhanced hydrateSvgPatterns');
  } else {
    console.log(file, ': oldHydrate not found');
  }

  // Syntax check
  try {
    acorn.parse(code, { ecmaVersion: 2022 });
    console.log('Acorn: Syntax is 100% VALID for', file);
  } catch (err) {
    console.error('Acorn syntax error in', file, err.message, 'at', err.pos);
    process.exit(1);
  }

  fs.writeFileSync(file, code, 'utf8');
  console.log('Successfully written', file);
}
