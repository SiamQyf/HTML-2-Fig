const fs = require('fs');
const acorn = require('acorn');

const files = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  const startIdx = code.indexOf('function hydrateSvgPatterns(e,t){');
  if (startIdx === -1) {
    console.error('hydrateSvgPatterns not found in', file);
    continue;
  }
  const endIdx = code.indexOf('if(n&&!r){', startIdx);
  if (endIdx === -1) {
    console.error('endIdx not found in', file);
    continue;
  }

  const newHydrate = `function hydrateSvgPatterns(e,t){if(!e||!t)return;const r=t.includes("<pattern"),n=t.includes("<image");if(!r&&!n)return;const imgMap={};for(const m of t.matchAll(/<image\\b[^>]*?\\bid=["']([^"']+)["'][^>]*?(?:xlink:)?href=["'](data:image\\/[^"']+)["']/gi)){imgMap[m[1]]=m[2]}for(const m of t.matchAll(/<image\\b[^>]*?(?:xlink:)?href=["'](data:image\\/[^"']+)["'][^>]*?\\bid=["']([^"']+)["']/gi)){imgMap[m[2]]=m[1]}const o={},i=Array.from(t.matchAll(/<pattern\\b[^>]*?\\bid=["']([^"']+)["'][^>]*?>([\\s\\S]*?)<\\/pattern>/gi));for(const e of i){const t=e[1];let u=e[2].match(/(?:xlink:)?href=["'](data:image\\/[^"']+)["']/i)?.[1];if(!u){const useM=e[2].match(/(?:xlink:)?href=["']#([^"']+)["']/i);if(useM&&imgMap[useM[1]])u=imgMap[useM[1]]}if(u){const e=decodeBase64Image(u);if(e)try{const r=figma.createImage(e);o[t]=r.hash}catch{}}}const a=Object.keys(o);if(a.length>0){const r=Array.from(t.matchAll(/<(?:path|rect|circle|polygon|ellipse)\\b[^>]*?\\bfill=["']url\\(#([^"']+)\\)["']/gi));!function p(t){if(t.fills&&0===t.fills.length){const e=r[0]?.[1],n=e&&o[e]?o[e]:o[a[0]];n&&(t.fills=[{type:"IMAGE",imageHash:n,scaleMode:"FILL"}])}if(t.children)for(const r of t.children)p(r)}(e);if(e.children){for(let idx=e.children.length-1;idx>=0;idx--){const ch=e.children[idx];if((ch.type==="RECTANGLE"||ch.type==="FRAME")&&ch.width<e.width*0.2&&ch.height>=e.height*0.2){try{ch.remove()}catch{ch.visible=!1}}}}}`;

  code = code.substring(0, startIdx) + newHydrate + code.substring(endIdx);

  try {
    acorn.parse(code, { ecmaVersion: 2022 });
    console.log('Acorn parse: 100% SUCCESS for', file);
  } catch (err) {
    console.error('Acorn syntax error in', file, err.message);
    process.exit(1);
  }

  fs.writeFileSync(file, code, 'utf8');
  console.log('Updated hydrateSvgPatterns in', file);
}
