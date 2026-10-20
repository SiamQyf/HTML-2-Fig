const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..');
const captureFile = path.join(rootDir, 'packages/chrome-extension/src_original/capture.js');

let code = fs.readFileSync(captureFile, 'utf8');
const hadCRLF = code.includes('\r\n');
if (hadCRLF) {
  code = code.replace(/\r\n/g, '\n');
}

const target = `            cumRaw = wordInRaw + words[w].length;
            let hasBreak = false;
            for (const bp of breakIndicesInRaw) {
              if (bp >= cumRaw - 1 && bp <= cumRaw + 4) {
                hasBreak = true;
                break;
              }
            }`;

const repl = `            const wordEndInRaw = wordInRaw + words[w].length;
            cumRaw = wordEndInRaw;
            const nextWordInRaw = raw.indexOf(words[w + 1], wordEndInRaw);
            const limit = nextWordInRaw !== -1 ? nextWordInRaw : wordEndInRaw + 1;
            let hasBreak = false;
            for (const bp of breakIndicesInRaw) {
              if (bp >= wordEndInRaw && bp < limit) {
                hasBreak = true;
                break;
              }
            }`;

if (!code.includes(target)) {
  console.error('Target chunk not found in capture.js');
  process.exit(1);
}

code = code.replace(target, repl);

if (hadCRLF) {
  code = code.replace(/\n/g, '\r\n');
}

try {
  acorn.parse(code, { ecmaVersion: 2022 });
  console.log('✓ Acorn parse valid: capture.js');
} catch (err) {
  console.error('❌ Acorn syntax error in capture.js:', err.message);
  process.exit(1);
}

fs.writeFileSync(captureFile, code, 'utf8');
console.log('✓ Successfully patched capture.js!');
