const fs = require('fs');
const acorn = require('acorn');

const codeFiles = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

for (const file of codeFiles) {
  let content = fs.readFileSync(file, 'utf8');

  // 1. In prepareSvgString, sanitize class, style, color, xmlns:xlink upfront
  const oldPrep = 'n=n.replace(/<script[\\s\\S]*?<\\/script>/gi,""),';
  const newPrep = 'n=n.replace(/<script[\\s\\S]*?<\\/script>/gi,""),n=n.replace(/\\s+class="[^"]*"/gi,"").replace(/\\s+style="[^"]*"/gi,"").replace(/\\s+color="[^"]*"/gi,"").replace(/\\s+xmlns:xlink="[^"]*"/gi,""),';
  if (content.includes(oldPrep)) {
    content = content.replace(oldPrep, newPrep);
    console.log(`✓ Patched prepareSvgString in ${file}`);
  } else {
    console.log(`prepareSvgString anchor not found in ${file}`);
  }

  // 2. In se.sort, pass !1 instead of t to getEffectiveZIndex
  const oldSortCall = 'const n=getEffectiveZIndex(e,t)-getEffectiveZIndex(r,t);';
  const newSortCall = 'const n=getEffectiveZIndex(e,!1)-getEffectiveZIndex(r,!1);';
  if (content.includes(oldSortCall)) {
    content = content.replace(oldSortCall, newSortCall);
    console.log(`✓ Patched se.sort call in ${file}`);
  }

  // Verify syntax with Acorn
  acorn.parse(content, { ecmaVersion: 2022 });
  console.log(`✓ Syntax valid for ${file}`);
  fs.writeFileSync(file, content, 'utf8');
}

console.log('All patches applied cleanly!');
