const fs = require('fs');
const acorn = require('acorn');

// 1. Minified capture.js files
const minCaptureFiles = [
  'packages/chrome-extension/capture.js',
  'HTML To Figma Perfect/packages/chrome-extension/capture.js'
];

const minCapTarget = 'if(Xr>=Pr.minY-6&&Xr<=Pr.maxY+6){const Gr=await st(Br,o,i,l);Array.isArray(Gr)?$r.push(...Gr):Gr&&$r.push(Gr)}';
const minCapRepl = 'if(Xr>=Pr.minY-6&&Xr<=Pr.maxY+6){const Gr=await st(Br,o,i,l);if(Gr){const _items=Array.isArray(Gr)?Gr:[Gr];for(const _g of _items){if(_g&&_g.rect){const _gy=_g.rect.y+(_g.rect.height||0)/2;if(_gy>=Pr.minY-6&&_gy<=Pr.maxY+6)$r.push(_g)}else $r.push(_g)}}}';

for (const file of minCaptureFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(minCapTarget)) {
    content = content.replace(minCapTarget, minCapRepl);
    acorn.parse(content, { ecmaVersion: 2022 });
    fs.writeFileSync(file, content, 'utf8');
    console.log('✓ Patched minified capture:', file);
  } else if (content.includes(minCapRepl)) {
    console.log('Already patched:', file);
  } else {
    console.error('Target not found in', file);
    process.exit(1);
  }
}

// 2. Unminified capture.js files
const unminCaptureFiles = [
  'packages/chrome-extension/src_original/capture.js',
  'packages/chrome-extension-webstore/capture.js'
];

const unminTargetPattern = `if (Array.isArray(sChild)) {
                  fragChildNodes.push(...sChild);
                } else if (sChild) {
                  fragChildNodes.push(sChild);
                }`;

const unminReplPattern = `if (sChild) {
                  const _items = Array.isArray(sChild) ? sChild : [sChild];
                  for (const _g of _items) {
                    if (_g && _g.rect) {
                      const _gy = _g.rect.y + (_g.rect.height || 0) / 2;
                      if (_gy >= dl.minY - 6 && _gy <= dl.maxY + 6) {
                        fragChildNodes.push(_g);
                      }
                    } else {
                      fragChildNodes.push(_g);
                    }
                  }
                }`;

for (const file of unminCaptureFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  const isCrlf = content.includes('\r\n');
  const normTarget = isCrlf ? unminTargetPattern.replace(/\n/g, '\r\n') : unminTargetPattern;
  const normRepl = isCrlf ? unminReplPattern.replace(/\n/g, '\r\n') : unminReplPattern;

  if (content.includes(normTarget)) {
    content = content.replace(normTarget, normRepl);
    acorn.parse(content, { ecmaVersion: 2022 });
    fs.writeFileSync(file, content, 'utf8');
    console.log('✓ Patched unminified capture:', file);
  } else if (content.includes(normRepl)) {
    console.log('Already patched:', file);
  } else {
    console.error('Unminified target not found in', file);
    process.exit(1);
  }
}

// 3. Figma plugin code.js files
const codeFiles = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

const codeTarget = 'const _hasInSib=s&&(s.pseudoElementNodes?.before||s.pseudoElementNodes?.after||(s.childNodes&&s.childNodes.length>1));if(_hasInSib&&h.endsWith(" "))h=h.slice(0,-1)+"\\u00a0";if(_hasInSib&&h.startsWith(" "))h="\\u00a0"+h.slice(1);';
const codeRepl = 'const _hasInSib=s&&(s.pseudoElementNodes?.before||s.pseudoElementNodes?.after||(s.childNodes&&s.childNodes.length>1)||(t&&t.children&&t.children.length>0)||(s.parentElement&&s.parentElement.childNodes&&s.parentElement.childNodes.length>1));if((_hasInSib||!s||"inline"===s.styles?.display)&&h.endsWith(" "))h=h.slice(0,-1)+"\\u00a0";if((_hasInSib||!s||"inline"===s.styles?.display)&&h.startsWith(" "))h="\\u00a0"+h.slice(1);';

for (const file of codeFiles) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(codeTarget)) {
    content = content.replace(codeTarget, codeRepl);
    acorn.parse(content, { ecmaVersion: 2022 });
    fs.writeFileSync(file, content, 'utf8');
    console.log('✓ Patched code.js:', file);
  } else if (content.includes(codeRepl)) {
    console.log('Already patched:', file);
  } else {
    console.error('code.js target not found in', file);
    process.exit(1);
  }
}

console.log('All text patches successfully applied and validated!');
