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

  // 11. Preserve minimum space gap and prevent false sibling horizontal collisions on stacked elements
  const oldSiblingBlock = 'const c=e.domNode.rect?.x||0,g=e.domNode.rect?.y||0,_hOverlap=Math.max(i,g)<Math.min(i+(t.domNode.rect?.height||16),g+(e.domNode.rect?.height||16)),u=_hOverlap||Math.abs(g-i)<=Math.max(16,Math.max(n,e.domNode.rect?.height||16)*.85),p=c>=s-6,f=parseFloat(t.domNode.styles?.fontSize||e.domNode.styles?.fontSize||16),m=Math.max(4,Math.round(.25*f)),h=Math.max(0,c-s),y="inline"===t.domNode.styles?.display||!t.domNode.styles?.display&&["SPAN","A","EM","STRONG","B","I"].includes(t.domNode.tag)||t.domNode.id&&t.domNode.id.includes("inline-line-frag")||3===t.domNode.nodeType,b="inline"===e.domNode.styles?.display||!e.domNode.styles?.display&&["SPAN","A","EM","STRONG","B","I"].includes(e.domNode.tag)||e.domNode.id&&e.domNode.id.includes("inline-line-frag")||3===e.domNode.nodeType,x=y&&b,v=l>a+1,w=x&&l<a-1;const _isIcon="SVG"===t.domNode.tag||"IMG"===t.domNode.tag||Boolean(t.domNode.id&&/icon|svg|pseudo/i.test(t.domNode.id))||Boolean(t.domNode.attributes?.class&&/icon|glyph|symbol|bullet/i.test(t.domNode.attributes.class))||Boolean(t.domNode.text&&/^[\\u2022\\u25A0-\\u27BF\\u2B00-\\u2BFF*&]/.test(t.domNode.text)),_isNextIcon="SVG"===e.domNode.tag||"IMG"===e.domNode.tag||Boolean(e.domNode.id&&/icon|svg|pseudo/i.test(e.domNode.id))||Boolean(e.domNode.attributes?.class&&/icon|glyph|symbol|bullet/i.test(e.domNode.attributes.class))||Boolean(e.domNode.text&&/^[\\u2022\\u25A0-\\u27BF\\u2B00-\\u2BFF*&]/.test(e.domNode.text)),_hasTrailSp=Boolean(t.domNode?.text&&/[\\s\\u00a0]$/.test(t.domNode.text)||(t.domNode?._origText&&/[\\s\\u00a0]$/.test(t.domNode._origText))),_hasLeadSp=Boolean(e.domNode?.text&&/^[\\s\\u00a0]/.test(e.domNode.text)||(e.domNode?._origText&&/^[\\s\\u00a0]/.test(e.domNode._origText))),_needsSpaceGap=_hasTrailSp||_hasLeadSp||h>=2,_minGap=_needsSpaceGap?Math.max(h,m):(_isIcon||_isNextIcon)?Math.max(h,3):Math.max(h,x?m:0),_targetMinX=d+_minGap;if(u&&(c>=o-2||p||e.figmaNode.x<_targetMinX)&&e.figmaNode.x<_targetMinX){const r=Math.round(_targetMinX-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}else if(u&&p&&w&&e.figmaNode.x>_targetMinX){const r=Math.round(_targetMinX-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}}';
  const newSiblingBlock = 'const c=e.domNode.rect?.x||0,g=e.domNode.rect?.y||0,_isIcon="SVG"===t.domNode.tag||"IMG"===t.domNode.tag||Boolean(t.domNode.id&&/icon|svg|pseudo/i.test(t.domNode.id))||Boolean(t.domNode.attributes?.class&&/icon|glyph|symbol|bullet/i.test(t.domNode.attributes.class))||Boolean(t.domNode.text&&/^[\\u2022\\u25A0-\\u27BF\\u2B00-\\u2BFF*&]/.test(t.domNode.text)),_isNextIcon="SVG"===e.domNode.tag||"IMG"===e.domNode.tag||Boolean(e.domNode.id&&/icon|svg|pseudo/i.test(e.domNode.id))||Boolean(e.domNode.attributes?.class&&/icon|glyph|symbol|bullet/i.test(e.domNode.attributes.class))||Boolean(e.domNode.text&&/^[\\u2022\\u25A0-\\u27BF\\u2B00-\\u2BFF*&]/.test(e.domNode.text)),_vOverlap=Math.max(i,g)<Math.min(i+(t.domNode.rect?.height||16)-1,g+(e.domNode.rect?.height||16)-1),u=_vOverlap&&(Math.abs(g-i)<=24||_isIcon||_isNextIcon),p=c>=o+2&&(c>=s-12||_isIcon||_isNextIcon),f=parseFloat(t.domNode.styles?.fontSize||e.domNode.styles?.fontSize||16),m=Math.max(4,Math.round(.25*f)),h=Math.max(0,c-s),y="inline"===t.domNode.styles?.display||!t.domNode.styles?.display&&["SPAN","A","EM","STRONG","B","I"].includes(t.domNode.tag)||t.domNode.id&&t.domNode.id.includes("inline-line-frag")||3===t.domNode.nodeType,b="inline"===e.domNode.styles?.display||!e.domNode.styles?.display&&["SPAN","A","EM","STRONG","B","I"].includes(e.domNode.tag)||e.domNode.id&&e.domNode.id.includes("inline-line-frag")||3===e.domNode.nodeType,x=y&&b,v=l>a+1,w=x&&l<a-1,_hasTrailSp=Boolean(t.domNode?.text&&/[\\s\\u00a0]$/.test(t.domNode.text)||(t.domNode?._origText&&/[\\s\\u00a0]$/.test(t.domNode._origText))),_hasLeadSp=Boolean(e.domNode?.text&&/^[\\s\\u00a0]/.test(e.domNode.text)||(e.domNode?._origText&&/^[\\s\\u00a0]/.test(e.domNode._origText))),_needsSpaceGap=_hasTrailSp||_hasLeadSp||h>=2,_minGap=_needsSpaceGap?Math.max(h,m):(_isIcon||_isNextIcon)?Math.max(h,3):Math.max(h,x?m:0),_targetMinX=d+_minGap;if(u&&p&&e.figmaNode.x<_targetMinX){const r=Math.round(_targetMinX-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}else if(u&&p&&w&&e.figmaNode.x>_targetMinX){const r=Math.round(_targetMinX-e.figmaNode.x);e.figmaNode.x+=r,e.domNode.rect&&(e.domNode.rect.x+=r)}}';
  if (content.includes(oldSiblingBlock)) {
    content = content.replace(oldSiblingBlock, newSiblingBlock);
  }

  // 12. Ensure single-line text (lineCount <= 1) is never forced into multi-line height wrapping
  const targetC = 'const C=(e.lineCount&&e.lineCount>1)||(e.text&&e.text.includes("\\n"))||(e.rect&&e.rect.height>(parseFloat(g.fontSize)||16)*1.4&&e.text&&e.text.length>25);';
  const repC = 'const C=Boolean(e.lineCount&&e.lineCount>1)||Boolean(e.text&&e.text.includes("\\n"))||(!e.lineCount&&e.rect&&e.rect.height>(parseFloat(g.fontSize)||16)*1.8&&e.text&&e.text.length>25);';
  if (content.includes(targetC)) {
    content = content.replace(targetC, repC);
  }

  // 13. Allow multi-line text to wrap using full container available width when within 50% of container width
  const targetResize1 = 'else{let e=Math.max(1,Math.ceil(U))+6;f.resize(e,Math.max(1,Math.ceil(H))),f.x=O,f.y=z}';
  const targetResize2 = 'if(_pAvail>e&&_pAvail<=1.25*U)e=_pAvail;';
  const repResize2 = 'if(_pAvail>e&&_pAvail<=1.5*U)e=_pAvail;';
  if (content.includes(targetResize2)) {
    content = content.replace(targetResize2, repResize2);
  } else if (content.includes(targetResize1)) {
    content = content.replace(targetResize1, 'else{let e=Math.max(1,Math.ceil(U))+6;const _pAvail=t&&t.width>U&&!r?Math.round(t.width-Math.max(0,O)):0;if(_pAvail>e&&_pAvail<=1.5*U)e=_pAvail;f.resize(e,Math.max(1,Math.ceil(H))),f.x=O,f.y=z}');
  }

  // 14. Do not skip explicitly requested narrow fonts in author's font-family stack
  const narrowSkip = 'if(g&&t&&!n)continue;if(!g&&n)continue;';
  if (content.includes(narrowSkip)) {
    content = content.replace(narrowSkip, 'if(g&&t&&!n)continue;');
  }

  // 15. Safe font preloading and granular try-catches for styledSegments in Figma
  const oldStyledSegments = 'if(Array.isArray(e.styledSegments)&&e.styledSegments.length>0&&f.characters)for(const t of e.styledSegments){const r=t.start,n=t.end;if("number"==typeof r&&"number"==typeof n&&r<n&&n<=f.characters.length)try{if(t.fontFamily||t.fontWeight||t.fontStyle){const e=await loadFont(t.fontFamily||g.fontFamily,t.fontWeight||g.fontWeight,"italic"===t.fontStyle,t.fontStretch);e&&f.setRangeFontName(r,n,{family:e.family,style:e.style})}"number"==typeof t.fontSize&&t.fontSize>0&&f.setRangeFontSize(r,n,t.fontSize);if(t.color){const e=parseColor(t.color);e&&e.a>.005&&f.setRangeFills(r,n,[{type:"SOLID",color:{r:e.r,g:e.g,b:e.b},opacity:clamp01(e.a)}])}t.textDecoration&&t.textDecoration.includes("underline")?f.setRangeTextDecoration(r,n,"UNDERLINE"):t.textDecoration&&t.textDecoration.includes("line-through")&&f.setRangeTextDecoration(r,n,"STRIKETHROUGH");if(t.lineHeight&&"normal"!==t.lineHeight){const e=parseFloat(t.lineHeight);!isNaN(e)&&e>0&&f.setRangeLineHeight(r,n,{value:e,unit:"PIXELS"})}if(t.letterSpacing&&"normal"!==t.letterSpacing&&"0px"!==t.letterSpacing){const e=String(t.letterSpacing).trim();if(e.endsWith("em")){const t=parseFloat(e);!isNaN(t)&&f.setRangeLetterSpacing(r,n,{value:100*t,unit:"PERCENT"})}else{const t=parseFloat(e);!isNaN(t)&&f.setRangeLetterSpacing(r,n,{value:t,unit:"PIXELS"})}}}catch(e){}}';
  // 16. Out-of-bounds gradient stop interpolation (e.g. transparent 150%)
  const newStopsLogic = [
    'let maxPos = colorStops[0].position ?? 0;',
    'for (let i = 0; i < colorStops.length; i++) {',
    '  if (colorStops[i].position < maxPos) {',
    '    colorStops[i].position = maxPos;',
    '  } else {',
    '    maxPos = colorStops[i].position;',
    '  }',
    '}',
    'const preparedStops = fixPremultipliedStops(colorStops);',
    'function interpolateAt(sA, sB, t) {',
    '  const span = sB.position - sA.position;',
    '  const factor = span > 0 ? (t - sA.position) / span : 0;',
    '  const aA = clamp01(sA.color.a ?? 1);',
    '  const aB = clamp01(sB.color.a ?? 1);',
    '  const a = aA + (aB - aA) * factor;',
    '  return {',
    '    r: sA.color.r + (sB.color.r - sA.color.r) * factor,',
    '    g: sA.color.g + (sB.color.g - sA.color.g) * factor,',
    '    b: sA.color.b + (sB.color.b - sA.color.b) * factor,',
    '    a: clamp01(a)',
    '  };',
    '}',
    'let colorAt0 = null;',
    'if (preparedStops[0].position >= 0) {',
    '  colorAt0 = { ...preparedStops[0].color, a: clamp01(preparedStops[0].color.a ?? 1) };',
    '} else {',
    '  for (let i = 0; i < preparedStops.length - 1; i++) {',
    '    if (preparedStops[i].position <= 0 && preparedStops[i + 1].position >= 0) {',
    '      colorAt0 = interpolateAt(preparedStops[i], preparedStops[i + 1], 0);',
    '      break;',
    '    }',
    '  }',
    '  if (!colorAt0) colorAt0 = { ...preparedStops[preparedStops.length - 1].color, a: clamp01(preparedStops[preparedStops.length - 1].color.a ?? 1) };',
    '}',
    'let colorAt1 = null;',
    'const last = preparedStops[preparedStops.length - 1];',
    'if (last.position <= 1) {',
    '  colorAt1 = { ...last.color, a: clamp01(last.color.a ?? 1) };',
    '} else {',
    '  for (let i = 0; i < preparedStops.length - 1; i++) {',
    '    if (preparedStops[i].position <= 1 && preparedStops[i + 1].position >= 1) {',
    '      colorAt1 = interpolateAt(preparedStops[i], preparedStops[i + 1], 1);',
    '      break;',
    '    }',
    '  }',
    '  if (!colorAt1) colorAt1 = { ...preparedStops[0].color, a: clamp01(preparedStops[0].color.a ?? 1) };',
    '}',
    'const insideStops = [];',
    'for (const s of preparedStops) {',
    '  if (s.position > 0.0001 && s.position < 0.9999) {',
    '    insideStops.push({',
    '      position: clamp01(s.position),',
    '      color: { ...s.color, a: clamp01(s.color.a ?? 1) }',
    '    });',
    '  }',
    '}',
    'const finalStops = [',
    '  { position: 0, color: colorAt0 },',
    '  ...insideStops,',
    '  { position: 1, color: colorAt1 }',
    '];',
    'return fixPremultipliedStops(finalStops);'
  ].join('\\n');

  const regexOldStops = /let\\s+maxPos\\s*=\\s*0;[\\s\\S]*?return\\s+fixPremultipliedStops\\s*\\(\\s*finalStops\\s*\\);/;
  if (regexOldStops.test(content)) {
    content = content.replace(regexOldStops, newStopsLogic);
  }

  // 17. Ensure new frames are initialized with fills = [] to prevent white leak
  const kFrameSearch = 'const K=figma.createFrame();if("absolute"===f.position';
  const kFrameReplace = 'const K=figma.createFrame();try{K.fills=[]}catch(e){}if("absolute"===f.position';
  if (content.includes(kFrameSearch)) {
    content = content.replace(kFrameSearch, kFrameReplace);
  }

  // 18. Fix applyEffects drop-shadow and blur fill checks to never overwrite gradient/image fills with solid white
  const oldDropFills = '(!e.fills||0===e.fills.length||e.fills.every(e=>(e.opacity||0)<=.005))';
  const newDropFills = '(!e.fills||0===e.fills.length||e.fills.every(e=>"SOLID"===e.type&&((void 0!==e.opacity?e.opacity:1)<=.005)))';
  if (content.includes(oldDropFills)) {
    content = content.replace(oldDropFills, newDropFills);
  }
  const oldBlurFills = '!e.fills.every(e=>(e.opacity||0)<=.001)';
  const newBlurFills = '!e.fills.every(e=>"SOLID"===e.type&&((void 0!==e.opacity?e.opacity:1)<=.001))';
  if (content.includes(oldBlurFills)) {
    content = content.replace(oldBlurFills, newBlurFills);
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

  // 6. Exclude pure hover overlay elements at resting state
  if (!content.includes('const isPureHoverOverlay')) {
    const hoverComment = '// Strictly disable hover states and hover icons for all elements across the website.';
    const hoverOverlayCode = `// Strictly disable hover states and hover icons for all elements across the website.
    const isPureHoverOverlay = /feature-box-overlay|feature-box-bg-overlay|hover-mask/i.test(cls) ||
                               !!(el.closest && el.closest('.feature-box') && /feature-box-overlay|feature-box-bg-overlay/i.test(cls));
    if (isPureHoverOverlay) {
      styles.opacity = '0';
      styles.visibility = 'hidden';
      return null;
    }`;
    if (content.includes(hoverComment)) {
      content = content.replace(hoverComment, hoverOverlayCode);
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

const distOldExt = path.resolve('dist/html-to-figma-chrome-extension/capture.js');
if (fs.existsSync(distOldExt)) {
  const compCapture = fs.readFileSync('packages/chrome-extension/capture.js', 'utf8');
  fs.writeFileSync(distOldExt, compCapture, 'utf8');
  console.log('Synchronized dist/html-to-figma-chrome-extension/capture.js');
}

console.log('\n--- 4. Building Figma Plugin dist ---');
require('./package_figma_plugin.js');

console.log('\n--- 5. Packaging Webstore Extension ---');
require('./package_webstore.js');

console.log('\n🎉 ALL UNIVERSAL GRADIENT FIXES COMPILED & PACKAGED SUCCESSFULLY!');
