const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function validateJS(content, name) {
  try {
    acorn.parse(content, { ecmaVersion: 2022 });
    console.log(`✓ ${name} syntax valid (acorn ECMAScript 2022)`);
    return true;
  } catch (err) {
    console.error(`❌ ${name} parse error:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// PATCH CODE.JS
// -------------------------------------------------------------
function patchCodeJS(content) {
  // 1. Add color-mix to _parseColorInternal
  const colorMixCode = `if(e.startsWith("color-mix(")){const t=e.slice(10,-1).trim().match(/^in\\s+([\\w-]+)\\s*,\\s*(.*?)$/i);if(t){const r=splitByTopLevelCommas(t[2]);if(r&&r.length>=2){const e=r[0].trim(),t=r[1].trim(),n=e.match(/^(.*?)\\s+([\\d.]+)%$/),o=n?n[1].trim():e,i=n?parseFloat(n[2]):null,a=t.match(/^(.*?)\\s+([\\d.]+)%$/),s=a?a[1].trim():t,l=a?parseFloat(a[2]):null;let d=.5,c=.5;null!==i&&null!==l?d=(i+l)>0?i/(i+l):.5:null!==i?d=clamp01(i/100):null!==l&&(d=clamp01(1-l/100)),c=1-d;const u=parseColor(o)||("transparent"===o.toLowerCase()?{r:0,g:0,b:0,a:0}:null),g=parseColor(s)||("transparent"===s.toLowerCase()?{r:0,g:0,b:0,a:0}:null);if(u&&g)return{r:clamp01(u.r*d+g.r*c),g:clamp01(u.g*d+g.g*c),b:clamp01(u.b*d+g.b*c),a:clamp01((u.a??1)*d+(g.a??1)*c)}}}}`;
  
  if (!content.includes('color-mix(')) {
    const target = 'function _parseColorInternal(e){';
    content = content.replace(target, target + colorMixCode);
  }

  // 2. Ensure brightenGradientForText preserves full color fidelity and stops (as on Final)
  const fullContrastBrighten = /function brightenGradientForText\([^)]*\)\{[\s\S]*?Math\.abs\(\.2126\*t\.r[\s\S]*?return\s+[a-zA-Z0-9_]+;?\s*\}/;
  const canonicalBrighten = 'function brightenGradientForText(e,t={r:1,g:1,b:1}){return e}';
  if (fullContrastBrighten.test(content)) {
    content = content.replace(fullContrastBrighten, canonicalBrighten);
  } else if (!content.includes('function brightenGradientForText(e,t={r:1,g:1,b:1}){return e}')) {
    const bMatch = content.match(/function brightenGradientForText\([^{]*\{[\s\S]*?return\s+[a-zA-Z0-9_]+;?\s*\}/);
    if (bMatch) {
      content = content.replace(bMatch[0], canonicalBrighten);
    }
  }

  // 3. Ensure parseRadialGradient uses fixPremultipliedStops(stops)
  content = content.replace(
    /(type:\s*'GRADIENT_RADIAL'[\s\S]*?gradientStops:\s*)stops(\s*\}\s*;\s*\}\s*catch\s*\(err\)\s*\{\s*return safeGradientFallback)/,
    '$1fixPremultipliedStops(stops)$2'
  );

  // 4. Ensure parseAngularGradient uses fixPremultipliedStops(stops)
  content = content.replace(
    /(type:\s*'GRADIENT_ANGULAR'[\s\S]*?gradientStops:\s*)stops(\s*\}\s*;\s*\}\s*catch\s*\(err\)\s*\{\s*return safeGradientFallback\s*\(\s*css\s*\)\s*;\s*\}\s*\}\s*function parseBoxShadows)/,
    '$1fixPremultipliedStops(stops)$2'
  );

  // 5. Stroke & Fill border-box gradient integration in applyStrokes
  const strokeBorderSearch = 'const d=t.borderImageSource&&"none"!==t.borderImageSource?t.borderImageSource:t.borderImage&&"none"!==t.borderImage&&t.borderImage.includes("gradient")?t.borderImage:null;';
  const strokeBorderReplace = `let d=t.borderImageSource&&"none"!==t.borderImageSource?t.borderImageSource:t.borderImage&&"none"!==t.borderImage&&t.borderImage.includes("gradient")?t.borderImage:null;const bwMax=Math.max(parseFloat(t.borderTopWidth)||0,parseFloat(t.borderRightWidth)||0,parseFloat(t.borderBottomWidth)||0,parseFloat(t.borderLeftWidth)||0);if(!d&&bwMax>0){const e=t.backgroundImage||t.background||"";if(e.includes("gradient")){const r=splitByTopLevelCommas(e),n=(t.backgroundClip||t.webkitBackgroundClip||"").toLowerCase(),o=splitByTopLevelCommas(n),i=o.some(e=>e.includes("padding-box")||e.includes("content-box"));for(let e=0;e<r.length;e++){const t=r[e];if(!t.includes("gradient"))continue;const a=o[e]||o[o.length-1]||"";if((a.includes("border-box")||t.includes("border-box"))&&i){d=t;break}}if(!d&&r.length>=2&&(!o||"transparent"===t.borderColor||"rgba(0, 0, 0, 0)"===t.borderColor)){const e=r[r.length-1];e.includes("gradient")&&(d=e)}}}`;
  if (content.includes(strokeBorderSearch)) {
    content = content.replace(strokeBorderSearch, strokeBorderReplace);
  }

  // 6. Uniform stroke weight when gradient stroke is used on rounded pill
  const strokeAssignSearch = 'if(c===g&&g===u&&u===p){e.strokes=[b],e.strokeAlign="INSIDE",e.strokeWeight=c;';
  const strokeAssignReplace = 'if(l&&bwMax>0&&c+g+u+p>0){e.strokes=[b],e.strokeAlign="INSIDE",e.strokeWeight=bwMax;return}if(c===g&&g===u&&u===p){e.strokes=[b],e.strokeAlign="INSIDE",e.strokeWeight=c;';
  if (content.includes(strokeAssignSearch)) {
    content = content.replace(strokeAssignSearch, strokeAssignReplace);
  }

  // 7. Allow gradient masks to preserve pattern fills in applyFills
  const maskFillClearSearch = '(u||l&&!i)&&(a=[])';
  const maskFillClearReplace = '(u||(!((t.maskImage||"").includes("gradient")||(t.webkitMaskImage||"").includes("gradient"))&&l&&!i))&&(a=[])';
  if (content.includes(maskFillClearSearch)) {
    content = content.replace(maskFillClearSearch, maskFillClearReplace);
  }

  // 8. Protect container frames from destructive EXCLUSION / DIFFERENCE blend modes
  const blendModeSearch = 'function applyBlendMode(e,t,r=null){const n=t.mixBlendMode||t["mix-blend-mode"];if(n&&"normal"!==n){if(r){const e="VIDEO"===r.tag||r.attributes?.class&&r.attributes.class.includes("video"),t=r.styles?.zIndex&&parseInt(r.styles.zIndex,10)<0;if(e&&(t||"multiply"===n.toLowerCase()))return}if(CSS_TO_FIGMA_BLEND_MODES[n.toLowerCase()])try{e.blendMode=CSS_TO_FIGMA_BLEND_MODES[n.toLowerCase()]}catch{}}}';
  const blendModeReplace = 'function applyBlendMode(e,t,r=null){const n=t.mixBlendMode||t["mix-blend-mode"];if(n&&"normal"!==n){const o=n.toLowerCase();if(r){const e="VIDEO"===r.tag||r.attributes?.class&&r.attributes.class.includes("video"),t=r.styles?.zIndex&&parseInt(r.styles.zIndex,10)<0;if(e&&(t||"multiply"===o))return}if("exclusion"===o||"difference"===o){const t="FRAME"===e.type,n=Array.isArray(e.fills)&&e.fills.some(e=>"SOLID"===e.type?(e.opacity??1)>.05:!0);if(t&&!n)return;if(t&&e.width>100&&e.height>100&&(r?.childNodes?.length||r?.attributes?.class?.includes("border")))return}if(CSS_TO_FIGMA_BLEND_MODES[o])try{e.blendMode=CSS_TO_FIGMA_BLEND_MODES[o]}catch{}}}';
  if (content.includes(blendModeSearch)) {
    content = content.replace(blendModeSearch, blendModeReplace);
  }

  // 9. Robust decodeBase64Image to support nested blobs, data objects, and Uint8Arrays
  const decodeBase64Search = 'let t="string"==typeof e?e:e.data||e.base64Blob||"";if(!t)return null;';
  const decodeBase64Replace = 'let t="string"==typeof e?e:e.blob?.data||(typeof e.blob==="string"?e.blob:null)||e.data||e.base64Blob||"";if(t&&typeof t==="object"&&typeof t.data==="string")t=t.data;if(t instanceof Uint8Array)return t;if(Array.isArray(t))return new Uint8Array(t);if(!t||typeof t!=="string")return null;';
  if (content.includes(decodeBase64Search)) {
    content = content.replace(decodeBase64Search, decodeBase64Replace);
  }

  // 10. Prevent expanding width of containers with overflow:clip, overflow:hidden, or clipsContent (e.g. icon buttons)
  const clipWidthSearch = '(t>K.width||o&&n<K.width)&&(K.resize(n,K.height),e.rect&&(e._origDomW||(e._origDomW=e.rect.width||0),e.rect.width=n))';
  const clipWidthReplace = 'const _isClippedFrame=K.clipsContent||["hidden","clip","scroll","auto"].includes(f.overflow)||["hidden","clip"].includes(f.overflowX)||e.attributes?.class&&/\\bcustomer-story-button\\b/i.test(e.attributes.class);(!_isClippedFrame&&t>K.width||o&&n<K.width&&!_isClippedFrame)&&(K.resize(n,K.height),e.rect&&(e._origDomW||(e._origDomW=e.rect.width||0),e.rect.width=n))';
  if (content.includes(clipWidthSearch)) {
    content = content.replace(clipWidthSearch, clipWidthReplace);
  }

  // 11. Preserve minimum space gap between inline text siblings when predecessor ends with whitespace
  const inlineSpaceSearch = 'x=y&&b,v=l>a+1,w=x&&l<a-1;if(u&&p&&(v||w)){const t=d+Math.max(h,x?m:0);if(v&&e.figmaNode.x<t){const r=Math.round(t-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}else if(w&&e.figmaNode.x>t){const r=Math.round(t-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}}';
  const inlineSpaceReplace = 'x=y&&b,v=l>a+1,w=x&&l<a-1;const _hasTrailSp=Boolean(t.domNode?.text&&/[\\s\\u00a0]$/.test(t.domNode.text)||(t.domNode?._origText&&/[\\s\\u00a0]$/.test(t.domNode._origText))),_minGap=_hasTrailSp?Math.max(h,m):Math.max(h,x?m:0);if(u&&p&&(v||w||_hasTrailSp)){const t=d+_minGap;if((v||_hasTrailSp)&&e.figmaNode.x<t){const r=Math.round(t-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}else if(w&&e.figmaNode.x>t){const r=Math.round(t-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}}';
  if (content.includes(inlineSpaceSearch)) {
    content = content.replace(inlineSpaceSearch, inlineSpaceReplace);
  }

  return content;
}

// -------------------------------------------------------------
// PATCH SRC_ORIGINAL/CAPTURE.JS
// -------------------------------------------------------------
function patchSrcOriginalCaptureJS(content) {
  // 1. Upgrade isPatternGradient
  const sIdxPat = content.indexOf('function isPatternGradient(');
  const eIdxPat = content.indexOf('\n  async function renderPatternToDataUrl', sIdxPat);
  if (sIdxPat !== -1 && eIdxPat !== -1) {
    const newPat = `function isPatternGradient(bgStr, bgSize, bgRepeat) {
    if (!bgStr || bgStr === 'none') return false;
    const lower = bgStr.toLowerCase();
    if (lower.includes('repeating-linear-gradient') ||
        lower.includes('repeating-radial-gradient') ||
        lower.includes('repeating-conic-gradient')) {
      return true;
    }
    const repeat = (bgRepeat || '').toLowerCase();
    const isRepeating = (repeat.includes('repeat') || repeat === 'space' || repeat === 'round') && !repeat.includes('no-repeat');
    if (bgSize && bgSize !== 'auto' && bgSize !== 'cover' && bgSize !== 'contain') {
      const parts = bgSize.trim().split(/\\s+/);
      const isPercent = parts[0].endsWith('%');
      const w = parseFloat(parts[0]);
      if (isPercent && w < 99 && (isRepeating || lower.includes('gradient'))) {
        return true;
      }
      if (!isPercent && w > 0 && (isRepeating || w <= 180) && lower.includes('gradient')) {
        return true;
      }
    }
    if (isRepeating && lower.includes('gradient')) {
      return true;
    }
    return false;
  }`;
    content = content.substring(0, sIdxPat) + newPat + content.substring(eIdxPat);
  }

  // 2. Upgrade renderPatternToDataUrl to high-DPI with bgPos and borderRadius
  const sIdxRend = content.indexOf('async function renderPatternToDataUrl(');
  const eIdxRend = content.indexOf('\n  async function rasterizeSvgToDataUri(', sIdxRend);
  if (sIdxRend !== -1 && eIdxRend !== -1) {
    const newRend = `async function renderPatternToDataUrl(bgStr, bgSize, bgRepeat, width, height, bgColor = 'transparent', bgPos = '', borderRadius = '') {
    try {
      const w = Math.min(2048, Math.max(1, Math.round(width || 100)));
      const h = Math.min(2048, Math.max(1, Math.round(height || 100)));
      const sizeStr = bgSize || 'auto';
      const repeatStr = bgRepeat || 'repeat';
      const colorStr = bgColor || 'transparent';
      const posCss = bgPos ? \`background-position:\${bgPos};\` : '';
      const radCss = borderRadius ? \`border-radius:\${borderRadius};\` : '';
      const safeBg = (bgStr || '').replace(/"/g, "'");

      const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${w}" height="\${h}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:\${w}px;height:\${h}px;background-image:\${safeBg};background-size:\${sizeStr};background-repeat:\${repeatStr};\${posCss}\${radCss}background-color:\${colorStr};"></div>
        </foreignObject>
      </svg>\`;

      const img = new Image();
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.src = svgUrl;
      await img.decode();

      const canvas = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }`;
    content = content.substring(0, sIdxRend) + newRend + content.substring(eIdxRend);
  }

  // 3. Bypass convertMultipleBackgroundsToSvg to preserve native CSS gradients
  const sIdxMulti = content.indexOf('function convertMultipleBackgroundsToSvg(csOrEl, w, h, defaultColor) {');
  if (sIdxMulti !== -1 && !content.includes('return null; // Preserved multi-gradient backgrounds')) {
    const rep = 'function convertMultipleBackgroundsToSvg(csOrEl, w, h, defaultColor) {\n    return null; // Preserved multi-gradient backgrounds for native Figma layer parsing in code.js';
    content = content.replace('function convertMultipleBackgroundsToSvg(csOrEl, w, h, defaultColor) {', rep);
  }

  // 4. Ensure bgClipRect in inline-line-frag
  const fragMatch = content.match(/id:\s*getNodeId\('inline-line-frag'\)[\s\S]*?rect:\s*fragRect,/);
  if (fragMatch && !content.includes('bgClipRect: { x: docRect.x, y: docRect.y, width: docRect.width, height: docRect.height }')) {
    const target = fragMatch[0];
    const rep = target + '\n              bgClipRect: { x: docRect.x, y: docRect.y, width: docRect.width, height: docRect.height },';
    content = content.replace(target, rep);
  }

  // 5. Inactive variant and accordion / toggle state guard
  if (!content.includes('const isAccordionOrToggleState')) {
    const tabRegex = /const\s+isInactiveTab\s*=\s*!!\([\s\S]*?const\s+isModalOrOffcanvas\s*=\s*!!\([\s\S]*?\);/;
    const tabReplace = `const isInactiveTab = !!(el.closest && el.closest('[role="tabpanel"][aria-hidden="true"], .tab-pane:not(.active):not(.show), [class*="-pane"]:not([class*="active"])'));
    const isInactiveVariant = !!(
      el.parentElement &&
      (el.className && typeof el.className === 'string' && /gradient|theme|panel|slide|tab|item|layer/i.test(el.className)) &&
      Array.from(el.parentElement.children).some(sibling =>
        sibling !== el &&
        sibling.className &&
        typeof sibling.className === 'string' &&
        (/\\b(?:active|is-active|selected)\\b|--active\\b/i.test(sibling.className))
      )
    );
    const isModalOrOffcanvas = !!(el.closest && el.closest('.modal:not(.show):not(.in), .offcanvas:not(.show), [aria-modal="true"][style*="display: none"]'));
    const isAccordionOrToggleState = (() => {
      if (!el.closest) return false;
      if (el.closest('.customer-story-button:not(.customer-story-button--open)') && (el.classList?.contains('customer-story-button__text') || el.closest('.customer-story-button__text'))) return true;
      if (el.closest('.customer-story-button--open') && (el.classList?.contains('customer-story-button__icon') || el.closest('.customer-story-button__icon'))) return true;
      if (el.closest('.customer-story-button') && el.parentElement?.classList?.contains('customer-story-button__container')) {
        const sibs = Array.from(el.parentElement.children);
        if (sibs.some(s => s !== el && parseFloat(window.getComputedStyle(s).opacity) > 0.5)) return true;
      }
      if (el.closest('[aria-expanded="false"], [data-state="closed"], [data-state="collapsed"]')) {
        const collapsedRoot = el.closest('[aria-expanded="false"], [data-state="closed"], [data-state="collapsed"]');
        if (!collapsedRoot.closest('[aria-expanded="true"], [data-state="open"]')) return true;
      }
      if (el.closest('.accordion-collapse:not(.show), .collapse:not(.show), [aria-hidden="true"]')) return true;
      if (el.parentElement && el.parentElement.children.length === 2) {
        const other = el.parentElement.children[0] === el ? el.parentElement.children[1] : el.parentElement.children[0];
        try {
          if (parseFloat(window.getComputedStyle(other).opacity) > 0.8 && parseFloat(styles.opacity) < 0.1) {
            return true;
          }
        } catch (_) {}
      }
      return false;
    })();`;

    if (tabRegex.test(content)) {
      content = content.replace(tabRegex, tabReplace);
      content = content.replace(/!isInactiveTab\s*&&\s*!isModalOrOffcanvas/g, '!isInactiveTab && !isInactiveVariant && !isModalOrOffcanvas && !isAccordionOrToggleState');
    }
  }

  return content;
}

// -------------------------------------------------------------
// EXECUTE
// -------------------------------------------------------------
const codeFiles = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

console.log('--- 1. Patching code.js files ---');
for (const relPath of codeFiles) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) continue;
  const original = fs.readFileSync(fullPath, 'utf8');
  const patched = patchCodeJS(original);
  validateJS(patched, relPath);
  fs.writeFileSync(fullPath, patched, 'utf8');
  console.log(`Successfully patched: ${relPath}`);
}

console.log('\n--- 2. Patching packages/chrome-extension/src_original/capture.js ---');
const srcOrigPath = path.resolve('packages/chrome-extension/src_original/capture.js');
const origCode = fs.readFileSync(srcOrigPath, 'utf8');
const patchedOrig = patchSrcOriginalCaptureJS(origCode);
validateJS(patchedOrig, 'src_original/capture.js');
fs.writeFileSync(srcOrigPath, patchedOrig, 'utf8');
console.log('Successfully patched src_original/capture.js');

console.log('\n--- 3. Running protect_extension.js to compile CWS-compliant capture.js ---');
require('./protect_extension.js');

// Also update webstore package
const webstoreCapture = path.resolve('packages/chrome-extension-webstore/capture.js');
if (fs.existsSync(webstoreCapture)) {
  const compCapture = fs.readFileSync('packages/chrome-extension/capture.js', 'utf8');
  fs.writeFileSync(webstoreCapture, compCapture, 'utf8');
  console.log('Synchronized packages/chrome-extension-webstore/capture.js');
}

console.log('\n--- 4. Building Figma Plugin dist ---');
require('./package_figma_plugin.js');

console.log('\n--- 5. Packaging Webstore Extension ---');
require('./package_webstore.js');

console.log('\n🎉 ALL UNIVERSAL GRADIENT FIXES COMPILED & PACKAGED SUCCESSFULLY!');
