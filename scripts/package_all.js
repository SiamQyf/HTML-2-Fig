const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('📦 Starting Complete Packaging Workflow...\n');

// 1. Minify/protect chrome extension
console.log('1️⃣ Running protect_extension.js...');
execSync('node scripts/protect_extension.js', { cwd: rootDir, stdio: 'inherit' });

// 2. Package figma plugin
console.log('\n2️⃣ Running package_figma_plugin.js...');
execSync('node scripts/package_figma_plugin.js', { cwd: rootDir, stdio: 'inherit' });

// 3. Package Chrome Web Store extension zip
console.log('\n3️⃣ Running package_webstore.js...');
execSync('node scripts/package_webstore.js', { cwd: rootDir, stdio: 'inherit' });

// 4. Create Figma Plugin Zip
console.log('\n4️⃣ Creating Figma Plugin Zip...');
const pluginDist = path.join(distDir, 'figma-plugin');
const pluginZipDist = path.join(distDir, 'html-to-figma-plugin.zip');
const pluginZipRoot = path.join(rootDir, 'HTML-To-Figma-Plugin.zip');

if (fs.existsSync(pluginZipDist)) fs.unlinkSync(pluginZipDist);
if (fs.existsSync(pluginZipRoot)) fs.unlinkSync(pluginZipRoot);

const pluginItems = fs.readdirSync(pluginDist).map(i => `"${i}"`).join(' ');
execSync(`tar -a -c -f "${pluginZipDist}" -C "${pluginDist}" ${pluginItems}`, { stdio: 'inherit' });
fs.copyFileSync(pluginZipDist, pluginZipRoot);
console.log(`   ✓ Created: ${pluginZipDist}`);
console.log(`   ✓ Mirrored: ${pluginZipRoot}`);

// 5. Copy Chrome Web Store zip to root
const cwsZipDist = path.join(distDir, 'html-to-figma-chrome-extension.zip');
const cwsZipRoot = path.join(rootDir, 'HTML-To-Figma-Chrome-Extension.zip');
fs.copyFileSync(cwsZipDist, cwsZipRoot);
console.log(`   ✓ Mirrored: ${cwsZipRoot}`);

// 6. Create Complete Bundle Zip (Both Extension + Plugin)
console.log('\n5️⃣ Creating Complete Publish Bundle (Extension + Plugin)...');
const bundleZipDist = path.join(distDir, 'html-to-figma-complete-bundle.zip');
const bundleZipRoot = path.join(rootDir, 'HTML-To-Figma-Complete-Bundle.zip');

if (fs.existsSync(bundleZipDist)) fs.unlinkSync(bundleZipDist);
if (fs.existsSync(bundleZipRoot)) fs.unlinkSync(bundleZipRoot);

execSync(`tar -a -c -f "${bundleZipDist}" -C "${distDir}" html-to-figma-chrome-extension.zip html-to-figma-plugin.zip`, { stdio: 'inherit' });
fs.copyFileSync(bundleZipDist, bundleZipRoot);
console.log(`   ✓ Created: ${bundleZipDist}`);
console.log(`   ✓ Mirrored: ${bundleZipRoot}`);

console.log('\n🎉 ALL PUBLISHING PACKAGES READY:');
[cwsZipRoot, pluginZipRoot, bundleZipRoot].forEach(f => {
  const stats = fs.statSync(f);
  console.log(`   📦 ${path.basename(f)}: ${(stats.size / 1024).toFixed(1)} KB (${stats.size} bytes)`);
});
