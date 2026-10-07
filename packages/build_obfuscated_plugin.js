/**
 * Figma Plugin Packaging & Obfuscation Pipeline
 * Builds dist/figma-plugin/ (manifest.json, src/code.js obfuscated, src/ui.html, icon.png).
 * Source files in packages/figma-plugin are never modified.
 */
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'packages/figma-plugin');
const outDir = path.join(rootDir, 'dist/figma-plugin');

(async () => {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'src'), { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
  const domains = (manifest.networkAccess && manifest.networkAccess.allowedDomains) || [];
  if (domains.includes('*') || domains.some(d => d.includes('localhost'))) {
    console.error('❌ allowedDomains contains "*" or localhost — Figma will reject this.');
    process.exit(1);
  }

  const rawCode = fs.readFileSync(path.join(srcDir, 'src/code.js'), 'utf8');
  console.log(`📦 Packaging Figma plugin (${(rawCode.length / 1024).toFixed(0)} KB)...`);

  // Step 1: Pre-minifying with Terser
  console.log('⚡ Step 1: Pre-minifying with Terser...');
  const minified = await minify(rawCode, {
    compress: { passes: 2, drop_debugger: true },
    mangle: true,
    format: { comments: false },
  });

  // Step 2: High-security AST Obfuscation
  // Control flow flattening + string array base64 encoding + dead code insertion
  // selfDefending is disabled to ensure 100% stable execution inside Figma's QuickJS sandbox
  console.log('🔒 Step 2: Running High-Security Obfuscator...');
  const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.25,
    identifierNamesGenerator: 'hexadecimal',
    identifiersPrefix: 'h2f',
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  };

  const t0 = Date.now();
  const obfuscatedResult = JavaScriptObfuscator.obfuscate(minified.code, obfuscatorOptions);
  const finalCode = obfuscatedResult.getObfuscatedCode();
  const duration = ((Date.now() - t0) / 1000).toFixed(1);

  fs.writeFileSync(path.join(outDir, 'src/code.js'), finalCode);
  console.log(`🛡️ code.js obfuscated in ${duration}s (${(rawCode.length / 1024).toFixed(0)} KB → ${(finalCode.length / 1024).toFixed(0)} KB)`);

  fs.copyFileSync(path.join(srcDir, 'src/ui.html'), path.join(outDir, 'src/ui.html'));
  fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(outDir, 'manifest.json'));
  if (fs.existsSync(path.join(srcDir, 'icon.png'))) {
    fs.copyFileSync(path.join(srcDir, 'icon.png'), path.join(outDir, 'icon.png'));
  }

  console.log('✅ Obfuscated Plugin successfully built at dist/figma-plugin/');
})();
