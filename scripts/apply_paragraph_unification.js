const fs = require('fs');
const acorn = require('acorn');

// 1. Helper functions to add to capture.js
const captureHelperCode = `
  function canUnifyTextContainer(el) {
    if (!el || el.childNodes.length === 0) return false;
    const tag = el.tagName.toUpperCase();
    const isSemanticText = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'FIGCAPTION', 'LABEL'].includes(tag);
    const isTextClass = typeof el.className === 'string' && /split-text|text-reveal|splitting|word-wrap|char-wrap/i.test(el.className);

    if (!isSemanticText && !isTextClass) {
      if (['BODY', 'HTML', 'MAIN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FORM', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'UL', 'OL', 'BUTTON', 'A'].includes(tag)) {
        return false;
      }
    }

    let totalTextLength = 0;
    let textNodeCount = 0;
    let elementCount = 0;
    let hasIncompatibleChild = false;

    function inspect(curr) {
      if (hasIncompatibleChild) return;
      for (const child of curr.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          totalTextLength += (child.textContent || '').trim().length;
          textNodeCount++;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          elementCount++;
          const cTag = child.tagName.toUpperCase();
          if (cTag === 'BR') continue;
          if (['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'HR'].includes(cTag)) {
            hasIncompatibleChild = true;
            return;
          }
          const cs = window.getComputedStyle(child);
          if (cs.display === 'none') continue;
          if ((cs.backgroundImage && cs.backgroundImage !== 'none') ||
              (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') ||
              (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0) ||
              (cs.boxShadow && cs.boxShadow !== 'none')) {
            hasIncompatibleChild = true;
            return;
          }
          if (!cs.display.startsWith('inline') && cs.display !== 'contents') {
            hasIncompatibleChild = true;
            return;
          }
          inspect(child);
        }
      }
    }

    inspect(el);

    if (hasIncompatibleChild || totalTextLength === 0) return false;
    return isSemanticText || (elementCount >= 1 && (textNodeCount + elementCount) >= 2);
  }

  function compressStyledSegments(rawSegments, containerStyles) {
    const merged = [];
    let current = null;
    for (const seg of rawSegments) {
      if (!current) {
        current = { ...seg };
        continue;
      }
      const same = current.fontFamily === seg.fontFamily &&
                   current.fontWeight === seg.fontWeight &&
                   current.fontStyle === seg.fontStyle &&
                   current.fontStretch === seg.fontStretch &&
                   current.fontSize === seg.fontSize &&
                   current.color === seg.color &&
                   current.lineHeight === seg.lineHeight &&
                   current.letterSpacing === seg.letterSpacing &&
                   current.textDecoration === seg.textDecoration;
      if (same && current.end === seg.start) {
        current.end = seg.end;
      } else {
        merged.push(current);
        current = { ...seg };
      }
    }
    if (current) merged.push(current);

    if (merged.length <= 1) return [];

    const diffSegments = [];
    for (const seg of merged) {
      const diff = { start: seg.start, end: seg.end };
      let hasDiff = false;

      if (seg.fontWeight && seg.fontWeight !== (containerStyles.fontWeight || '400')) {
        diff.fontWeight = seg.fontWeight;
        hasDiff = true;
      }
      if (seg.fontFamily && seg.fontFamily !== containerStyles.fontFamily) {
        diff.fontFamily = seg.fontFamily;
        hasDiff = true;
      }
      if (seg.fontStyle && seg.fontStyle !== (containerStyles.fontStyle || 'normal')) {
        diff.fontStyle = seg.fontStyle;
        hasDiff = true;
      }
      if (seg.fontSize && Math.abs(seg.fontSize - (parseFloat(containerStyles.fontSize) || 16)) > 0.5) {
        diff.fontSize = seg.fontSize;
        hasDiff = true;
      }
      if (seg.color && seg.color !== containerStyles.color && seg.color !== containerStyles.webkitTextFillColor) {
        diff.color = seg.color;
        hasDiff = true;
      }
      if (seg.textDecoration && !['none', ''].includes(seg.textDecoration) && seg.textDecoration !== containerStyles.textDecoration) {
        diff.textDecoration = seg.textDecoration;
        hasDiff = true;
      }
      if (hasDiff) {
        diffSegments.push(diff);
      }
    }

    return diffSegments;
  }

  function buildUnifiedTextNode(el, containerStyles, fonts) {
    let fullText = "";
    const rawSegments = [];

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        let t = node.textContent;
        if (!t) return;
        const parentCs = window.getComputedStyle(node.parentElement);
        const ws = parentCs.whiteSpace || 'normal';
        if (ws === 'normal' || ws === 'nowrap') {
          t = t.replace(/[\\r\\n\\t]+/g, ' ');
        }
        const start = fullText.length;
        fullText += t;
        const end = fullText.length;
        if (fonts && typeof fonts.addFont === 'function') {
          fonts.addFont(parentCs.fontFamily, parentCs.fontWeight, parentCs.fontStyle);
        }
        rawSegments.push({
          start,
          end,
          fontFamily: parentCs.fontFamily,
          fontWeight: parentCs.fontWeight,
          fontStyle: parentCs.fontStyle,
          fontStretch: parentCs.fontStretch,
          fontSize: parseFloat(parentCs.fontSize) || 16,
          color: convertColors(parentCs.color),
          lineHeight: parentCs.lineHeight,
          letterSpacing: parentCs.letterSpacing,
          textDecoration: parentCs.textDecorationLine || parentCs.textDecoration
        });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'BR') {
          fullText += "\\n";
          return;
        }
        for (const child of node.childNodes) {
          walk(child);
        }
      }
    }

    walk(el);

    const diffSegments = compressStyledSegments(rawSegments, containerStyles);

    const rect = el.getBoundingClientRect();
    const isFixed = isElementOrAncestorFixed(el, containerStyles);
    const fixedShiftY = isFixed ? getFixedShiftY(el, containerStyles) : 0;
    const scrollY = (isFixed ? 0 : window.scrollY) + fixedShiftY;
    const scrollX = isFixed ? 0 : window.scrollX;
    const cs = window.getComputedStyle(el);

    if (fonts && typeof fonts.addFont === 'function') {
      fonts.addFont(containerStyles.fontFamily, containerStyles.fontWeight, containerStyles.fontStyle);
    }

    return {
      nodeType: TEXT_NODE,
      id: getNodeId('unified-text'),
      text: fullText,
      rect: {
        x: rect.x + scrollX,
        y: rect.y + scrollY,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      },
      styles: getTextNodeStyles(containerStyles),
      lineCount: Math.max(1, Math.round(rect.height / (parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.4))),
      styledSegments: diffSegments.length > 0 ? diffSegments : undefined
    };
  }
`;

// Patch capture files
const captureFiles = [
  'packages/chrome-extension/src_original/capture.js',
  'packages/chrome-extension-webstore/capture.js'
];

const insertMarker = 'async function serializeNode(node, assets, fonts, parentStyles) {';

const targetLoop = `if (!svgContent) {
      const sourceNodes = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
      for (const child of sourceNodes) {
        const sChild = await serializeNode(child, assets, fonts, styles);
        if (sChild) {
          const itemsToAdd = Array.isArray(sChild) ? sChild : [sChild];
          for (const item of itemsToAdd) {
            childNodes.push(item);
          }
        }
      }`;

const replLoop = `if (!svgContent) {
      if (canUnifyTextContainer(el)) {
        const uNode = buildUnifiedTextNode(el, styles, fonts);
        if (uNode) childNodes.push(uNode);
      } else {
        const sourceNodes = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
        for (const child of sourceNodes) {
          const sChild = await serializeNode(child, assets, fonts, styles);
          if (sChild) {
            const itemsToAdd = Array.isArray(sChild) ? sChild : [sChild];
            for (const item of itemsToAdd) {
              childNodes.push(item);
            }
          }
        }
      }`;

for (const f of captureFiles) {
  if (!fs.existsSync(f)) continue;
  let code = fs.readFileSync(f, 'utf8');
  const isCrlf = code.includes('\r\n');

  if (!code.includes('function canUnifyTextContainer')) {
    const normInsert = isCrlf ? captureHelperCode.replace(/\n/g, '\r\n') : captureHelperCode;
    const replacement = normInsert + (isCrlf ? '\r\n  ' : '\n  ') + insertMarker;
    code = code.replace(insertMarker, replacement);
  }

  const normTarget = isCrlf ? targetLoop.replace(/\n/g, '\r\n') : targetLoop;
  const normRepl = isCrlf ? replLoop.replace(/\n/g, '\r\n') : replLoop;
  if (code.includes(normTarget)) {
    code = code.replace(normTarget, normRepl);
  }

  acorn.parse(code, { ecmaVersion: 2022 });
  fs.writeFileSync(f, code, 'utf8');
  console.log('✓ Successfully patched and validated capture:', f);
}

// 2. Patch Figma plugin code.js files
const codeFiles = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

const targetCodeDec = 'if(A.includes("underline")&&!S)try{f.textDecoration="UNDERLINE"}catch{}else if(A.includes("line-through"))try{f.textDecoration="STRIKETHROUGH"}catch{}';
const additionCode = `if(Array.isArray(e.styledSegments)&&e.styledSegments.length>0&&f.characters)for(const t of e.styledSegments){const r=t.start,n=t.end;if("number"==typeof r&&"number"==typeof n&&r<n&&n<=f.characters.length)try{if(t.fontFamily||t.fontWeight||t.fontStyle){const e=await loadFont(t.fontFamily||g.fontFamily,t.fontWeight||g.fontWeight,"italic"===t.fontStyle,t.fontStretch);e&&f.setRangeFontName(r,n,{family:e.family,style:e.style})}"number"==typeof t.fontSize&&t.fontSize>0&&f.setRangeFontSize(r,n,t.fontSize);if(t.color){const e=parseColor(t.color);e&&e.a>.005&&f.setRangeFills(r,n,[{type:"SOLID",color:{r:e.r,g:e.g,b:e.b},opacity:clamp01(e.a)}])}t.textDecoration&&t.textDecoration.includes("underline")?f.setRangeTextDecoration(r,n,"UNDERLINE"):t.textDecoration&&t.textDecoration.includes("line-through")&&f.setRangeTextDecoration(r,n,"STRIKETHROUGH");if(t.lineHeight&&"normal"!==t.lineHeight){const e=parseFloat(t.lineHeight);!isNaN(e)&&e>0&&f.setRangeLineHeight(r,n,{value:e,unit:"PIXELS"})}if(t.letterSpacing&&"normal"!==t.letterSpacing&&"0px"!==t.letterSpacing){const e=String(t.letterSpacing).trim();if(e.endsWith("em")){const t=parseFloat(e);!isNaN(t)&&f.setRangeLetterSpacing(r,n,{value:100*t,unit:"PERCENT"})}else{const t=parseFloat(e);!isNaN(t)&&f.setRangeLetterSpacing(r,n,{value:t,unit:"PIXELS"})}}}catch(e){}}`;

for (const f of codeFiles) {
  if (!fs.existsSync(f)) continue;
  let code = fs.readFileSync(f, 'utf8');
  if (!code.includes('e.styledSegments.length>0&&f.characters')) {
    if (!code.includes(targetCodeDec)) {
      console.error('Target not found in', f);
      process.exit(1);
    }
    code = code.replace(targetCodeDec, targetCodeDec + additionCode);
    acorn.parse(code, { ecmaVersion: 2022 });
    fs.writeFileSync(f, code, 'utf8');
    console.log('✓ Successfully patched and validated plugin code:', f);
  } else {
    console.log('Already patched:', f);
  }
}

console.log('\nAll files patched and validated with Acorn!');
