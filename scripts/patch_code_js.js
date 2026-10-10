const fs = require('fs');

const files = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log('Skipping missing:', file);
    continue;
  }
  let code = fs.readFileSync(file, 'utf8');
  let count = 0;

  // 1. applyFills filename extraction
  const target1 = 'const B=M.split("/").pop()?.split("?")[0];';
  const repl1 = 'const B=(M.match(/([a-zA-Z0-9_\\-.]+\\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico))/i)?.[1])||M.split("/").pop()?.split("?")[0];';
  if (code.includes(target1)) {
    code = code.replace(target1, repl1);
    count++;
  }

  // 2. IMG lookup bestSrc and filename extraction
  const target2 = 'i=n?e.placeholderUrl:r.currentSrc||r.src||r["data-src"]||r["data-lazy-src"]||r["data-original"]||"",';
  const repl2 = 'i=n?e.placeholderUrl:r.bestSrc||r.currentSrc||r.src||r["data-src"]||r["data-lazy-src"]||r["data-original"]||"",';
  if (code.includes(target2)) {
    code = code.replace(target2, repl2);
    count++;
  }

  const target3 = 'e=i&&o[i]||r.currentSrc&&o[r.currentSrc]||r.src&&o[r.src]||r["data-src"]&&o[r["data-src"]]||r["data-lazy-src"]&&o[r["data-lazy-src"]],!e&&i){const t=i.split("/").pop()?.split("?")[0];';
  const repl3 = 'e=i&&o[i]||r.bestSrc&&o[r.bestSrc]||r.currentSrc&&o[r.currentSrc]||r.src&&o[r.src]||r["data-src"]&&o[r["data-src"]]||r["data-lazy-src"]&&o[r["data-lazy-src"]],!e&&i){const t=(i.match(/([a-zA-Z0-9_\\-.]+\\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico))/i)?.[1])||i.split("/").pop()?.split("?")[0];';
  if (code.includes(target3)) {
    code = code.replace(target3, repl3);
    count++;
  }

  // 3. placeholderUrl filename extraction
  const target4 = 'const t=e.placeholderUrl.split("/").pop()?.split("?")[0];';
  const repl4 = 'const t=(e.placeholderUrl.match(/([a-zA-Z0-9_\\-.]+\\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico))/i)?.[1])||e.placeholderUrl.split("/").pop()?.split("?")[0];';
  if (code.includes(target4)) {
    code = code.replace(target4, repl4);
    count++;
  }

  fs.writeFileSync(file, code, 'utf8');
  console.log(file, 'updated with', count, 'replacements');
}
