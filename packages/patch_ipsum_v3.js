const fs = require('fs');
const path = require('path');
const files = [
  path.resolve(__dirname, '../packages/figma-plugin/src/code.js'),
  path.resolve(__dirname, '../HTML To Figma Perfect/packages/figma-plugin/src/code.js'),
];
// reuse the minified block body from dist, renaming e.type -> msg.type
const dist = fs.readFileSync(path.resolve(__dirname, 'figma-plugin/src/code.js'), 'utf8');
const a = dist.indexOf('if("lorem_ipsum_replace"===e.type){');
const b = dist.indexOf('if("switch_to_assets_diary"!==e.type)', a);
const block = dist.slice(a, b).replace('"lorem_ipsum_replace"===e.type', '"lorem_ipsum_replace"===msg.type');

for (const f of files) {
  if (!fs.existsSync(f)) { console.log('skip', f); continue; }
  const t = fs.readFileSync(f, 'utf8');
  const s = t.indexOf("if (msg.type === 'lorem_ipsum_replace') {");
  const e = t.indexOf("if (msg.type === 'switch_to_assets_diary')", s);
  if (s < 0 || e < 0) { console.log('marker missing', f); continue; }
  fs.writeFileSync(f, t.slice(0, s) + block + '\r\n\r\n  ' + t.slice(e));
  console.log('patched', f);
}
