const fs = require('fs');
const acorn = require('acorn');

// 1. In code.js files: prevent absolute pseudo elements from stretching container width
const codeFiles = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

const targetLoop = 'for(const e of K.children){let r=(e.x||0)+(e.width||0);';
const replLoop = 'for(const e of K.children){if(e&&(e.name?.includes("__after")||e.name?.includes("__before")||e.name?.includes("mask-gradient")))continue;let r=(e.x||0)+(e.width||0);';

for (const file of codeFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(targetLoop)) {
    content = content.replace(targetLoop, replLoop);
    acorn.parse(content, { ecmaVersion: 2022 });
    fs.writeFileSync(file, content, 'utf8');
    console.log('✓ Patched code.js pseudo-stretch guard in', file);
  } else if (content.includes(replLoop)) {
    console.log('Already patched pseudo-stretch in', file);
  } else {
    console.error('targetLoop not found in', file);
    process.exit(1);
  }
}

// 2. In minified capture.js files: add translate support to function V
const minCaptureFiles = [
  'packages/chrome-extension/capture.js',
  'HTML To Figma Perfect/packages/chrome-extension/capture.js'
];

const minCapTarget = 'isNaN(n)||"auto"===e.top?isNaN(o)||"auto"===e.bottom||(v.y=c.y+c.height-v.height-o-s):v.y=c.y+n+a;let u=l||t.parentElement;';
const minCapRepl = 'isNaN(n)||"auto"===e.top?isNaN(o)||"auto"===e.bottom||(v.y=c.y+c.height-v.height-o-s):v.y=c.y+n+a;if(e.translate&&"none"!==e.translate){const t=e.translate.trim().split(/\\s+/);if(t[0]){const r=t[0].endsWith("%")?v.width*(parseFloat(t[0])/100):parseFloat(t[0]);isNaN(r)||(v.x+=r)}if(t[1]){const r=t[1].endsWith("%")?v.height*(parseFloat(t[1])/100):parseFloat(t[1]);isNaN(r)||(v.y+=r)}}let u=l||t.parentElement;';

for (const file of minCaptureFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(minCapTarget)) {
    content = content.replace(minCapTarget, minCapRepl);
    acorn.parse(content, { ecmaVersion: 2022 });
    fs.writeFileSync(file, content, 'utf8');
    console.log('✓ Patched minified capture.js translate support in', file);
  } else if (content.includes(minCapRepl)) {
    console.log('Already patched translate in', file);
  } else {
    console.error('minCapTarget not found in', file);
    process.exit(1);
  }
}

// 3. In unminified capture.js files: add translate support
const unminCaptureFiles = [
  'packages/chrome-extension/src_original/capture.js',
  'packages/chrome-extension-webstore/capture.js'
];

const unminTarget = `        if (!isNaN(t) && cs.top !== 'auto') pseudoRect.y = baseRect.y + t + mt;
        else if (!isNaN(b) && cs.bottom !== 'auto') pseudoRect.y = baseRect.y + baseRect.height - pseudoRect.height - b - mb;`;

const unminRepl = `        if (!isNaN(t) && cs.top !== 'auto') pseudoRect.y = baseRect.y + t + mt;
        else if (!isNaN(b) && cs.bottom !== 'auto') pseudoRect.y = baseRect.y + baseRect.height - pseudoRect.height - b - mb;
        if (cs.translate && cs.translate !== 'none') {
          const tr = cs.translate.trim().split(/\\s+/);
          if (tr[0]) {
            const tx = tr[0].endsWith('%') ? pseudoRect.width * (parseFloat(tr[0]) / 100) : parseFloat(tr[0]);
            if (!isNaN(tx)) pseudoRect.x += tx;
          }
          if (tr[1]) {
            const ty = tr[1].endsWith('%') ? pseudoRect.height * (parseFloat(tr[1]) / 100) : parseFloat(tr[1]);
            if (!isNaN(ty)) pseudoRect.y += ty;
          }
        }`;

for (const file of unminCaptureFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  const isCrlf = content.includes('\r\n');
  const normTarget = isCrlf ? unminTarget.replace(/\n/g, '\r\n') : unminTarget;
  const normRepl = isCrlf ? unminRepl.replace(/\n/g, '\r\n') : unminRepl;

  if (content.includes(normTarget)) {
    content = content.replace(normTarget, normRepl);
    acorn.parse(content, { ecmaVersion: 2022 });
    fs.writeFileSync(file, content, 'utf8');
    console.log('✓ Patched unminified capture.js translate support in', file);
  } else if (content.includes(normRepl)) {
    console.log('Already patched unminified translate in', file);
  } else {
    console.error('unminTarget not found in', file);
    process.exit(1);
  }
}

// 4. In capture.js files: update function H to recognize background-repeat: space and round
const minHTarget = 'const i=(n||"").toLowerCase(),r=i.includes("repeat")&&!i.includes("no-repeat");';
const minHRepl = 'const i=(n||"").toLowerCase(),r=(i.includes("repeat")||"space"===i||"round"===i)&&!i.includes("no-repeat");';

for (const file of minCaptureFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(minHTarget)) {
    content = content.replace(minHTarget, minHRepl);
    acorn.parse(content, { ecmaVersion: 2022 });
    fs.writeFileSync(file, content, 'utf8');
    console.log('✓ Patched minified function H in', file);
  } else if (content.includes(minHRepl)) {
    console.log('Already patched H in', file);
  } else {
    console.error('minHTarget not found in', file);
    process.exit(1);
  }
}

console.log('All button fixes successfully applied and validated!');
