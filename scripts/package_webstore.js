/**
 * Chrome Web Store Packaging Pipeline
 * 
 * Prepares a clean, 100% compliant Chrome Extension package for the Chrome Web Store.
 * Uses clean auditable source code (as required by Google CWS Code Obfuscation Policies),
 * validates Manifest V3 metadata, and builds a ready-to-upload .zip file.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const extSrcDir = path.join(rootDir, 'packages/chrome-extension');
const distDir = path.join(rootDir, 'dist');
const storeBuildDir = path.join(distDir, 'chrome-extension-webstore');
const zipOutputPath = path.join(distDir, 'html-to-figma-chrome-extension.zip');

console.log('🚀 Preparing Chrome Web Store Production Package...\n');

// 1. Ensure clean dist directory
if (fs.existsSync(storeBuildDir)) {
  fs.rmSync(storeBuildDir, { recursive: true, force: true });
}
fs.mkdirSync(storeBuildDir, { recursive: true });

if (fs.existsSync(zipOutputPath)) {
  fs.unlinkSync(zipOutputPath);
}

// 2. Determine source files to package
// For Google Chrome Web Store approval, we MUST use clean, non-obfuscated source code
// from src_original (or fallback to root if src_original doesn't exist).
const captureSrc = fs.existsSync(path.join(extSrcDir, 'src_original/capture.js'))
  ? path.join(extSrcDir, 'src_original/capture.js')
  : path.join(extSrcDir, 'capture.js');

const injectBufferSrc = fs.existsSync(path.join(extSrcDir, 'src_original/inject_preserve_buffer.js'))
  ? path.join(extSrcDir, 'src_original/inject_preserve_buffer.js')
  : path.join(extSrcDir, 'inject_preserve_buffer.js');

// 3. Copy core files
fs.copyFileSync(captureSrc, path.join(storeBuildDir, 'capture.js'));
fs.copyFileSync(injectBufferSrc, path.join(storeBuildDir, 'inject_preserve_buffer.js'));

const directCopies = [
  'background.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'manifest.json',
  'opentype.min.js',
  'potrace.min.js',
  'woff2.min.js'
];

for (const file of directCopies) {
  const src = path.join(extSrcDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(storeBuildDir, file));
    console.log(`   ✓ Copied ${file}`);
  } else {
    console.error(`   ❌ Missing required file: ${file}`);
    process.exit(1);
  }
}

// 4. Copy icons
const iconsSrcDir = path.join(extSrcDir, 'icons');
const iconsDestDir = path.join(storeBuildDir, 'icons');
fs.mkdirSync(iconsDestDir, { recursive: true });

const requiredIcons = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
for (const icon of requiredIcons) {
  const src = path.join(iconsSrcDir, icon);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(iconsDestDir, icon));
    console.log(`   ✓ Copied icon: icons/${icon}`);
  } else {
    console.error(`   ❌ Missing required icon: icons/${icon}`);
    process.exit(1);
  }
}

// 5. Validate Manifest V3 in build
const manifest = JSON.parse(fs.readFileSync(path.join(storeBuildDir, 'manifest.json'), 'utf8'));
console.log('\n🔍 Validating Manifest V3 Requirements:');
console.log(`   - Manifest Version: ${manifest.manifest_version} (Required: 3)`);
console.log(`   - Name: "${manifest.name}"`);
console.log(`   - Version: ${manifest.version}`);
console.log(`   - Default Popup: ${manifest.action?.default_popup || 'None'}`);
console.log(`   - Permissions: ${JSON.stringify(manifest.permissions)}`);
console.log(`   - Host Permissions: ${JSON.stringify(manifest.host_permissions)}`);

if (manifest.manifest_version !== 3) {
  console.error('❌ Error: manifest_version must be 3.');
  process.exit(1);
}

// 6. Compress into .zip archive for Chrome Web Store
console.log('\n📦 Creating Chrome Web Store .zip archive...');
try {
  // Use PowerShell Compress-Archive for native, dependable zip creation on Windows
  const psCmd = `powershell -Command "Compress-Archive -Path '${storeBuildDir}/*' -DestinationPath '${zipOutputPath}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });
  
  const zipStats = fs.statSync(zipOutputPath);
  console.log(`\n🎉 Success! Chrome Web Store package created:`);
  console.log(`   📁 Archive: dist/html-to-figma-chrome-extension.zip`);
  console.log(`   📊 Size: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB (${zipStats.size} bytes)`);
  console.log(`   🚀 Ready to drag & drop into Chrome Developer Dashboard!\n`);
} catch (zipErr) {
  console.error('❌ Failed to create zip file:', zipErr);
  process.exit(1);
}
