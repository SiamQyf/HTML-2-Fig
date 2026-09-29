const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const publishDir = path.resolve(__dirname, '../publish H2F');

// Only obfuscate the core proprietary algorithm engines:
// 1. capture.js (the entire DOM-to-Figma extraction engine)
// 2. code.js (the Figma plugin AST node builder)
// background.js and popup.js are browser plumbing and must not be obfuscated
// because Chrome's chrome.scripting.executeScript serializes functions by string.
const targetFiles = [
  path.join(publishDir, 'packages/chrome-extension/capture.js'),
  path.join(publishDir, 'packages/figma-plugin/src/code.js')
];

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  identifierNamesGenerator: 'hexadecimal',
  identifiersPrefix: 'h2f',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

console.log('Starting High-Security Obfuscation for publish H2F...');

for (const filePath of targetFiles) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    continue;
  }
  const relPath = path.relative(publishDir, filePath);
  const originalCode = fs.readFileSync(filePath, 'utf8');
  console.log(`\nObfuscating ${relPath} (${(originalCode.length / 1024).toFixed(1)} KB)...`);
  
  const startTime = Date.now();
  const obfuscationResult = JavaScriptObfuscator.obfuscate(originalCode, obfuscatorOptions);
  const obfuscatedCode = obfuscationResult.getObfuscatedCode();
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  fs.writeFileSync(filePath, obfuscatedCode, 'utf8');
  console.log(`✅ Secured ${relPath} in ${duration}s (${(obfuscatedCode.length / 1024).toFixed(1)} KB)`);
}

console.log('\nAll target files have been completely secured with multi-pass AST obfuscation!');
