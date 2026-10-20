const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..');

// 1. Figma Plugin files
const codeFiles = [
  path.join(rootDir, 'packages/figma-plugin/src/code.js'),
  path.join(rootDir, 'HTML To Figma Perfect/packages/figma-plugin/src/code.js')
];

const targetResize = 'else{let e=Math.max(1,Math.ceil(U))+6;const _pAvail=t&&t.width>U&&!r?Math.round(t.width-Math.max(0,O)):0;if(_pAvail>e&&_pAvail<=1.5*U)e=_pAvail;f.resize(e,Math.max(1,Math.ceil(H))),f.x=O,f.y=z}';
const replResize = 'else{let e=Math.max(1,Math.ceil(U))+2;f.resize(e,Math.max(1,Math.ceil(H))),f.x=O,f.y=z}';

const targetCenter = '!(Math.abs(t.width-U)<=16||!r||Math.abs(l-U)<=16||e._isDirectTextNode)';
const replCenter = '!(Math.abs(t.width-U)<=16||Math.abs(l-U)<=16||e._isDirectTextNode)';

const targetRight = '!(Math.abs(t.width-U)<=16||!r||Math.abs(a-U)<=16)';
const replRight = '!(Math.abs(t.width-U)<=16||Math.abs(a-U)<=16)';

for (const file of codeFiles) {
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }
  let code = fs.readFileSync(file, 'utf8');

  if (code.includes(targetResize)) {
    code = code.replace(targetResize, replResize);
    console.log(`✓ Replaced multiline text resize heuristic (_pAvail removed) in ${file}`);
  } else if (code.includes(replResize)) {
    console.log(`- Already replaced multiline text resize heuristic in ${file}`);
  } else {
    console.error(`❌ targetResize not found in ${file}`);
    process.exit(1);
  }

  if (code.includes(targetCenter)) {
    code = code.replace(targetCenter, replCenter);
    console.log(`✓ Removed !r expansion in center alignment in ${file}`);
  } else if (code.includes(replCenter)) {
    console.log(`- Already removed !r expansion in center alignment in ${file}`);
  } else {
    console.error(`❌ targetCenter not found in ${file}`);
    process.exit(1);
  }

  if (code.includes(targetRight)) {
    code = code.replace(targetRight, replRight);
    console.log(`✓ Removed !r expansion in right alignment in ${file}`);
  } else if (code.includes(replRight)) {
    console.log(`- Already removed !r expansion in right alignment in ${file}`);
  } else {
    console.error(`❌ targetRight not found in ${file}`);
    process.exit(1);
  }

  try {
    acorn.parse(code, { ecmaVersion: 2022 });
    console.log(`✓ ${file} syntax valid!`);
  } catch (err) {
    console.error(`❌ Acorn syntax error in ${file}:`, err.message);
    process.exit(1);
  }

  fs.writeFileSync(file, code, 'utf8');
}

// 2. Chrome Extension src_original/capture.js
const captureFile = path.join(rootDir, 'packages/chrome-extension/src_original/capture.js');
let captureCode = fs.readFileSync(captureFile, 'utf8');

const capPatches = [
  [
    'diff.fontWeight = seg.fontWeight;',
    'diff.fontWeight = normalizeFontWeightMinRegular(seg.fontWeight);',
    'normalizeFontWeightMinRegular on diff.fontWeight'
  ],
  [
    'fonts.addFont(parentCs.fontFamily, parentCs.fontWeight, parentCs.fontStyle);',
    'fonts.addFont(parentCs.fontFamily, normalizeFontWeightMinRegular(parentCs.fontWeight), parentCs.fontStyle);',
    'normalizeFontWeightMinRegular on walk fonts.addFont'
  ],
  [
    'fonts.addFont(effectiveStyles.fontFamily, effectiveStyles.fontWeight, effectiveStyles.fontStyle);',
    'fonts.addFont(effectiveStyles.fontFamily, normalizeFontWeightMinRegular(effectiveStyles.fontWeight), effectiveStyles.fontStyle);',
    'normalizeFontWeightMinRegular on effectiveStyles fonts.addFont'
  ],
  [
    'fontWeight: parentCs.fontWeight,',
    'fontWeight: normalizeFontWeightMinRegular(parentCs.fontWeight),',
    'normalizeFontWeightMinRegular on buildUnifiedTextFromRun rawSegments'
  ],
  [
    "const fWeight = cs.fontWeight || 'normal';",
    "const fWeight = styles.fontWeight || '400';",
    'use styles.fontWeight (min 400) for canvas font metric analysis'
  ],
  [
    'parseFontFaceRule(rule.style.fontFamily, rule.style.src, sheet.href || window.location.href, rule.style.fontWeight, rule.style.fontStyle);',
    'parseFontFaceRule(rule.style.fontFamily, rule.style.src, sheet.href || window.location.href, normalizeFontWeightMinRegular(rule.style.fontWeight), rule.style.fontStyle);',
    'normalizeFontWeightMinRegular on parseFontFaceRule'
  ]
];

for (const [target, repl, desc] of capPatches) {
  if (captureCode.includes(target)) {
    // Replace all occurrences if there are multiple (e.g. fonts.addFont)
    captureCode = captureCode.split(target).join(repl);
    console.log(`✓ Patched capture.js: [${desc}]`);
  } else if (captureCode.includes(repl)) {
    console.log(`- Already patched capture.js: [${desc}]`);
  } else {
    console.error(`❌ Target not found in capture.js: [${desc}]`);
    process.exit(1);
  }
}

try {
  acorn.parse(captureCode, { ecmaVersion: 2022 });
  console.log('✓ packages/chrome-extension/src_original/capture.js syntax valid!');
} catch (err) {
  console.error('❌ Acorn syntax error in capture.js:', err.message);
  process.exit(1);
}

fs.writeFileSync(captureFile, captureCode, 'utf8');

console.log('\nAll text rendering patches successfully applied!');
