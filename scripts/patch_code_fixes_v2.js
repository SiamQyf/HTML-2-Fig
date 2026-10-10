const fs = require('fs');
const acorn = require('acorn');

const files = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');

  // 1. Prefer mainSrc over placeholderUrl if mainSrc exists in assets
  const oldPlaceholderCheck = 'if("IMG"===e.tag){const r=e.attributes||{},n=e.placeholderUrl&&!e.placeholderUrl.includes("image/svg+xml"),i=n?e.placeholderUrl:r.bestSrc||r.currentSrc||r.src||r["data-src"]||r["data-lazy-src"]||r["data-original"]||"",';
  const newPlaceholderCheck = 'if("IMG"===e.tag){const r=e.attributes||{},mSrc=r.bestSrc||r.currentSrc||r.src||r["data-src"]||r["data-lazy-src"]||r["data-original"]||"";let n=e.placeholderUrl&&!e.placeholderUrl.includes("image/svg+xml");n&&mSrc&&o&&(o[mSrc]||o[mSrc.split("/").pop()?.split("?")[0]])&&(n=!1);const i=n?e.placeholderUrl:mSrc,';

  if (code.includes(oldPlaceholderCheck)) {
    code = code.replace(oldPlaceholderCheck, newPlaceholderCheck);
    console.log(file, ': replaced placeholderUrl preference check');
  } else {
    console.log(file, ': oldPlaceholderCheck not found');
  }

  // 2. Non-breaking space preservation for inline text siblings in renderTextNode
  // Look for: f.characters=h;
  const targetChars = 'h=h.replace(/([\\u2190-\\u21FF\\u25A0-\\u27BF\\u2B00-\\u2BFF])(?!\\uFE0E)/g,"$1︎"),f.characters=h;';
  const replChars = 'h=h.replace(/([\\u2190-\\u21FF\\u25A0-\\u27BF\\u2B00-\\u2BFF])(?!\\uFE0E)/g,"$1︎");const _hasInSib=s&&(s.pseudoElementNodes?.before||s.pseudoElementNodes?.after||(s.childNodes&&s.childNodes.length>1));if(_hasInSib&&h.endsWith(" "))h=h.slice(0,-1)+"\\u00a0";if(_hasInSib&&h.startsWith(" "))h="\\u00a0"+h.slice(1);f.characters=h;';

  if (code.includes(targetChars)) {
    code = code.replace(targetChars, replChars);
    console.log(file, ': replaced f.characters=h with non-breaking space preservation');
  } else {
    console.log(file, ': targetChars not found');
  }

  try {
    acorn.parse(code, { ecmaVersion: 2022 });
    console.log(file, ': Acorn parse 100% VALID!');
  } catch (err) {
    console.error(file, ': Acorn syntax error:', err.message, 'at pos', err.pos);
    process.exit(1);
  }

  fs.writeFileSync(file, code, 'utf8');
}
