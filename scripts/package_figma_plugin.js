/**
 * Figma Plugin Packaging Pipeline
 * Builds dist/figma-plugin/ (manifest.json, src/code.js minified, src/ui.html, icon.png).
 * Source files in packages/figma-plugin are never modified.
 */
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

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

  const code = fs.readFileSync(path.join(srcDir, 'src/code.js'), 'utf8');
  const result = await minify(code, {
    compress: { passes: 2, drop_debugger: true },
    mangle: true,
    format: { comments: false },
  });
  fs.writeFileSync(path.join(outDir, 'src/code.js'), result.code);
  console.log(`✓ code.js ${(code.length / 1024).toFixed(0)} KB → ${(result.code.length / 1024).toFixed(0)} KB`);

  fs.copyFileSync(path.join(srcDir, 'src/ui.html'), path.join(outDir, 'src/ui.html'));
  fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(outDir, 'manifest.json'));
  fs.copyFileSync(path.join(srcDir, 'icon.png'), path.join(outDir, 'icon.png'));
  console.log('✓ Plugin built at dist/figma-plugin/');
})();
