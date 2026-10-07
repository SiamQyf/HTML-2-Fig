const fs = require('fs');
const path = require('path');

// 1. Update code.js in packages and HTML To Figma Perfect
const codeFiles = [
  path.resolve(__dirname, '../packages/figma-plugin/src/code.js'),
  path.resolve(__dirname, '../HTML To Figma Perfect/packages/figma-plugin/src/code.js'),
];

for (const f of codeFiles) {
  if (!fs.existsSync(f)) continue;
  let t = fs.readFileSync(f, 'utf8');
  // replace height: 632 with height: 726
  t = t.replace(/height:\s*632/g, 'height: 726');
  fs.writeFileSync(f, t, 'utf8');
  console.log('Updated height in code.js:', f);
}

// 2. Update ui.html in dist, packages, and HTML To Figma Perfect
const uiFiles = [
  path.resolve(__dirname, 'figma-plugin/src/ui.html'),
  path.resolve(__dirname, '../packages/figma-plugin/src/ui.html'),
  path.resolve(__dirname, '../HTML To Figma Perfect/packages/figma-plugin/src/ui.html'),
];

for (const f of uiFiles) {
  if (!fs.existsSync(f)) continue;
  let t = fs.readFileSync(f, 'utf8');
  t = t.replace(/height:\s*632/g, 'height: 726');
  fs.writeFileSync(f, t, 'utf8');
  console.log('Updated height in ui.html:', f);
}
