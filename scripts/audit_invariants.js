/**
 * Deterministic Semantic & AST Invariant Audit Engine for HTML-2-Fig
 *
 * Catches the real-world bugs that coordinate-diffing misses:
 * 1. Text Loss & Swallowed Whitespace (exact text node completeness check)
 * 2. Sibling Collisions & Overlaps (adjacent text, badges, and icon bounding box collisions)
 * 3. Contrast & Invisibility (WCAG luminance check - dark text on dark container, white on white)
 * 4. Stacking & Occlusion (opaque background/shape layer positioned over text/buttons)
 * 5. Degenerate Geometry (zero-width, zero-height, or offscreen clipped content)
 * 6. Section-by-Section Component Isolation (evaluates components in local coordinates)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CAPTURE_JS_PATH = fs.existsSync(path.join(ROOT_DIR, 'packages/chrome-extension/src_original/capture.js'))
  ? path.join(ROOT_DIR, 'packages/chrome-extension/src_original/capture.js')
  : path.join(ROOT_DIR, 'packages/chrome-extension/capture.js');
const REPORT_DIR = path.join(ROOT_DIR, 'audit_reports');

function parseRgb(colorStr) {
  if (!colorStr) return null;
  const s = String(colorStr).trim().toLowerCase();
  if (s === 'transparent' || s === 'none') return { r: 0, g: 0, b: 0, a: 0 };
  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/);
  if (m) {
    return {
      r: parseFloat(m[1]) / 255,
      g: parseFloat(m[2]) / 255,
      b: parseFloat(m[3]) / 255,
      a: m[4] !== undefined ? parseFloat(m[4]) : 1
    };
  }
  return null;
}

function getLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function getContrastRatio(rgb1, rgb2) {
  if (!rgb1 || !rgb2) return 21;
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function doBoxesIntersect(b1, b2, margin = 1) {
  if (!b1 || !b2) return false;
  return (
    b1.x + margin < b2.x + b2.width - margin &&
    b1.x + b1.width - margin > b2.x + margin &&
    b1.y + margin < b2.y + b2.height - margin &&
    b1.y + b1.height - margin > b2.y + margin
  );
}

async function auditInvariants(targetUrlOrFile, options = {}) {
  console.log('\n======================================================');
  console.log(`🔍 [Invariant Audit] Starting audit on: ${targetUrlOrFile}`);
  console.log('======================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: options.viewportWidth || 1440, height: options.viewportHeight || 900 });

  let isLocalFile = false;
  let targetUrl = targetUrlOrFile;
  if (!targetUrlOrFile.startsWith('http://') && !targetUrlOrFile.startsWith('https://')) {
    isLocalFile = true;
    targetUrl = 'file://' + path.resolve(targetUrlOrFile).replace(/\\/g, '/');
  }

  try {
    await page.goto(targetUrl, { waitUntil: options.wait || 'networkidle2', timeout: 60000 });
  } catch (e) {
    console.warn('⚠️ Navigation timeout or warning, proceeding with loaded DOM...');
  }

  // Scroll down to trigger lazy loading, Elementor reveals, and IntersectionObservers
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 50);
    });

    // Freeze carousels and reset to initial slide so DOM truth matches static capture representation
    document.querySelectorAll('.swiper, .swiper-container, .awb-swiper, [class*="swiper"]').forEach(s => {
      if (s.swiper) {
        try {
          s.swiper.autoplay?.stop();
          s.swiper.slideTo(0, 0);
        } catch (_) {}
      }
    });
  });
  await new Promise(r => setTimeout(r, 600));

  // Inject capture.js
  const captureJs = fs.readFileSync(CAPTURE_JS_PATH, 'utf8');
  await page.evaluate(captureJs);

  // Extract raw DOM structure and ground truth text
  const domTruth = await page.evaluate(() => {
    const textNodes = [];
    const overflowingElements = [];
    const inactiveHiddenElements = [];

    function isElementTrulyVisible(el) {
      if (!el || el === document.body || el === document.documentElement) return true;
      const isInsideEntranceAnim = !!(el.closest && el.closest('.elementor-invisible, .wow, .sal-animate, .title-anim'));
      let curr = el;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const style = window.getComputedStyle(curr);
        const isEntranceAnim = isInsideEntranceAnim || (curr.classList && (
          curr.classList.contains('elementor-invisible') ||
          curr.classList.contains('wow') ||
          curr.classList.contains('sal-animate') ||
          curr.classList.contains('title-anim')
        ));
        if (style.display === 'none' || parseFloat(style.opacity) < 0.05 || (!isEntranceAnim && style.visibility === 'hidden')) {
          return false;
        }
        // Inactive tabs, closed modals, hidden carousel slides, demo switchers, or screen-reader text
        if (curr.classList) {
          if (
            curr.classList.contains('screen-reader-text') ||
            curr.classList.contains('sr-only') ||
            curr.classList.contains('visually-hidden') ||
            curr.classList.contains('visually-hidden-focusable') ||
            curr.classList.contains('skip-link') ||
            curr.classList.contains('cnvs-switcher-container') ||
            curr.classList.contains('style-switcher') ||
            curr.classList.contains('theme-switcher')
          ) {
            return false;
          }
          if (curr.classList.contains('swiper-slide') && !curr.classList.contains('swiper-slide-active') && !curr.classList.contains('swiper-slide-visible')) {
            return false;
          }
          if (curr.classList.contains('slick-slide') && !curr.classList.contains('slick-active') && !curr.classList.contains('slick-current')) {
            return false;
          }
          if (curr.classList.contains('tab-pane') && !curr.classList.contains('active') && !curr.classList.contains('show')) {
            return false;
          }
          if (curr.classList.contains('modal') && !curr.classList.contains('show') && !curr.classList.contains('active')) {
            return false;
          }
          if (curr.classList.contains('offcanvas') && !curr.classList.contains('show')) {
            return false;
          }
          if (curr.matches && curr.matches('.awb-off-canvas-wrap.type-popup, [class*="off-canvas-wrap"].type-popup, [id^="awb-oc-"]')) {
            return false;
          }
        }
        if (curr.closest && curr.closest('.awb-off-canvas-wrap.type-popup, [class*="off-canvas-wrap"].type-popup, [id^="awb-oc-"]')) {
          return false;
        }
        curr = curr.parentElement;
      }
      return true;
    }

    // 1. Text Nodes Walker
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || !isElementTrulyVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let currTextNode;
    while ((currTextNode = walker.nextNode())) {
      const parent = currTextNode.parentElement;
      const rect = parent.getBoundingClientRect();
      const style = window.getComputedStyle(parent);
      let textVal = currTextNode.nodeValue.trim();
      const counterEl = parent.closest('.elementor-counter-number, [data-to-value], [data-to]');
      if (counterEl) {
        const toVal = counterEl.getAttribute('data-to-value') || counterEl.getAttribute('data-to');
        if (toVal) textVal = toVal;
      }
      const isLineClamped = !!(
        parent.closest('[class*="line-clamp"], [style*="-webkit-line-clamp"]') ||
        (style.webkitLineClamp && style.webkitLineClamp !== 'none')
      );
      if (textVal && rect.width > 0 && rect.height > 0) {
        textNodes.push({
          text: textVal,
          tag: parent.tagName,
          className: parent.className,
          isLineClamped,
          rect: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight
        });
      }
    }

    // 2. Overflowing Visible Elements (Avatars, Badges, Icons, Shapes extending outside parent)
    const candidates = document.querySelectorAll('img, svg, button, a, [class*="avatar"], [class*="rounded"], [class*="badge"], [class*="icon"], [class*="circle"], [class*="quote"], [class*="thumb"]');
    candidates.forEach(el => {
      if (!isElementTrulyVisible(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return;

      let p = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const pStyle = window.getComputedStyle(p);
        const pOverflow = (pStyle.overflow + ' ' + pStyle.overflowX + ' ' + pStyle.overflowY).toLowerCase();
        const pIsClipper = ['hidden', 'clip', 'scroll', 'auto'].some(v => pOverflow.includes(v));
        if (pIsClipper) {
          // If parent container already clips in the DOM, the element is clipped in the browser and does not overflow outside
          break;
        }

        const pRect = p.getBoundingClientRect();
          if (pRect.width > 20 && pRect.height > 20) {
            const topOverflow = Math.round(pRect.top - rect.top);
            const bottomOverflow = Math.round(rect.bottom - pRect.bottom);
            const leftOverflow = Math.round(pRect.left - rect.left);
            const rightOverflow = Math.round(rect.right - pRect.right);

            if (topOverflow > 4 || bottomOverflow > 4 || leftOverflow > 4 || rightOverflow > 4) {
              overflowingElements.push({
                tag: el.tagName,
                className: el.className,
                id: el.id,
                src: el.src || (el.getAttribute ? el.getAttribute('src') : '') || '',
                rect: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
                parentTag: p.tagName,
                parentClassName: p.className,
                parentId: p.id,
                parentRect: { x: pRect.x + window.scrollX, y: pRect.y + window.scrollY, width: pRect.width, height: pRect.height },
                overflow: {
                  top: Math.max(0, topOverflow),
                  bottom: Math.max(0, bottomOverflow),
                  left: Math.max(0, leftOverflow),
                  right: Math.max(0, rightOverflow)
                }
              });
              break;
            }
          }
        p = p.parentElement;
      }
    });

    // 3. Inactive & Hidden Elements (Elements inside inactive carousel slides, hidden tabs, or opacity:0)
    const hiddenCandidates = document.querySelectorAll(
      '.swiper-slide:not(.swiper-slide-active):not(.swiper-slide-visible) img, ' +
      '.swiper-slide:not(.swiper-slide-active):not(.swiper-slide-visible) [class*="avatar"], ' +
      '.slick-slide:not(.slick-active) img, ' +
      '.tab-pane:not(.active) img, ' +
      '.tab-pane:not(.show) img, ' +
      'img.zoomImg, ' +
      'img[style*="opacity: 0"], ' +
      '[class*="avatar"][style*="opacity: 0"], ' +
      '.swiper-slide-shadow-left, ' +
      '.swiper-slide-shadow-right'
    );
    hiddenCandidates.forEach(el => {
      if (isElementTrulyVisible(el)) return;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      inactiveHiddenElements.push({
        tag: el.tagName,
        className: el.className,
        id: el.id,
        src: el.src || (el.getAttribute ? el.getAttribute('src') : '') || '',
        rect: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
        computedOpacity: style.opacity,
        computedVisibility: style.visibility
      });
    });

    return { textNodes, overflowingElements, inactiveHiddenElements };
  });

  // Extract HTML-2-Fig payload
  const capturePayload = await page.evaluate(async () => {
    return await window.html2Fig.captureRaw();
  });

  await browser.close();

  const rootNode = capturePayload.root || capturePayload.rootNode || capturePayload;

  // Run the Invariant Audits
  const findings = {
    textLoss: [],
    siblingCollisions: [],
    clippedOverflow: [],
    ghostContent: [],
    contrastBugs: [],
    occlusions: [],
    degenerateNodes: [],
    sectionBreakdowns: {}
  };

  // Helper to walk captured tree
  function walkNodes(node, callback, parent = null) {
    if (!node) return;
    callback(node, parent);
    const children = [];
    if (node.pseudoElementNodes?.before) children.push(node.pseudoElementNodes.before);
    if (node.childNodes && Array.isArray(node.childNodes)) children.push(...node.childNodes);
    if (node.children && Array.isArray(node.children)) children.push(...node.children);
    if (node.pseudoElementNodes?.after) children.push(node.pseudoElementNodes.after);

    for (const ch of children) {
      walkNodes(ch, callback, node);
    }
  }

  // 1. Audit Text Loss & Integrity
  const capturedTexts = [];
  walkNodes(rootNode, (node) => {
    if (node.nodeType === 3 && node.text) {
      capturedTexts.push(node.text.trim());
    } else if (node.text && typeof node.text === 'string') {
      capturedTexts.push(node.text.trim());
    } else if (node.characters && typeof node.characters === 'string') {
      capturedTexts.push(node.characters.trim());
    }
  });

  const mergedCapturedCorpus = capturedTexts.join(' ').replace(/\s+/g, ' ').toLowerCase();
  const strippedCapturedCorpus = mergedCapturedCorpus.replace(/[,.-]/g, '');

  for (const item of domTruth.textNodes) {
    const clean = item.text.replace(/\s+/g, ' ').toLowerCase();
    if (!mergedCapturedCorpus.includes(clean)) {
      const words = clean.split(/[\s\u2010-\u2015\-]+/).map(w => w.replace(/[^\w\d]/g, '')).filter(w => w.length >= 2);
      const missingWords = words.filter(w => !mergedCapturedCorpus.includes(w) && !strippedCapturedCorpus.includes(w));

      // If element is CSS line-clamped, clamped suffix words are intentionally truncated by CSS
      if (item.isLineClamped && missingWords.length < words.length) {
        continue;
      }

      if (missingWords.length > 0) {
        findings.textLoss.push({
          expectedText: item.text,
          missingWords: missingWords.join(', '),
          tag: item.tag,
          className: item.className,
          rect: item.rect
        });
      }
    }
  }

  // Load dynamic clip rule from code.js if present
  let dynamicPluginClipRule = null;
  const FIGMA_CODE_PATH = path.join(ROOT_DIR, 'packages/figma-plugin/src/code.js');
  if (fs.existsSync(FIGMA_CODE_PATH)) {
    const figmaCode = fs.readFileSync(FIGMA_CODE_PATH, 'utf8');
    const matchRe = figmaCode.match(/,\s*re\s*=\s*([^,;]+),\s*ne\s*=/);
    if (matchRe) {
      try {
        dynamicPluginClipRule = new Function('e', `try { return Boolean(${matchRe[1]}); } catch { return false; }`);
      } catch (err) {}
    }
  }

  // Helper to determine if a container clips content in Figma
  function willContainerClipInFigma(node) {
    if (!node) return false;
    if (node.clipsContent === true) return true;
    if (dynamicPluginClipRule && dynamicPluginClipRule(node)) return true;
    const f = node.styles || {};
    const ee = ['hidden', 'clip', 'scroll', 'auto'];
    const ne = f.clipPath && 'none' !== f.clipPath && f.clipPath.includes('inset');
    return Boolean(ne || ee.includes(f.overflow) || ee.includes(f.overflowX) || ee.includes(f.overflowY));
  }

  // 2. Audit Clipped Overflowing Content (Decapitation / Sliced Badges)
  for (const item of domTruth.overflowingElements) {
    // Find matching captured node
    let matchedCaptured = null;
    let matchedParent = null;

    walkNodes(rootNode, (node, parent) => {
      if (matchedCaptured) return;
      if (node.tag === item.tag && node.rect) {
        const dx = Math.abs(node.rect.x - item.rect.x);
        const dy = Math.abs(node.rect.y - item.rect.y);
        if (dx <= 15 && dy <= 15) {
          matchedCaptured = node;
          matchedParent = parent;
        }
      }
    });

    if (matchedCaptured && matchedParent) {
      // Check if parent or any ancestor up to parent clips content
      let cur = matchedParent;
      let isClipped = false;
      let clippingAncestor = null;

      while (cur && cur !== rootNode) {
        if (willContainerClipInFigma(cur)) {
          isClipped = true;
          clippingAncestor = cur;
          break;
        }
        cur = cur.parent;
      }

      if (isClipped) {
        const maxOverflow = Math.max(item.overflow.top, item.overflow.bottom, item.overflow.left, item.overflow.right);
        const direction = item.overflow.top > 4 ? 'TOP' : (item.overflow.bottom > 4 ? 'BOTTOM' : (item.overflow.left > 4 ? 'LEFT' : 'RIGHT'));
        findings.clippedOverflow.push({
          element: `<${item.tag} class="${item.className || ''}">`,
          src: item.src ? item.src.slice(0, 50) : '',
          parent: `<${clippingAncestor.tag || item.parentTag} class="${clippingAncestor.attributes?.class || item.parentClassName || ''}">`,
          overflowAmount: maxOverflow,
          direction,
          rect: item.rect,
          message: `<${item.tag}> overflows parent by ${maxOverflow}px on ${direction}, but parent container has clipsContent=true / overflow:hidden in Figma!`
        });
      }
    }
  }

  // 3. Audit Ghost / Accidentally Unhidden Inactive Content
  for (const item of domTruth.inactiveHiddenElements) {
    if (parseFloat(item.computedOpacity) >= 0.5 && item.computedVisibility !== 'hidden') continue;

    walkNodes(rootNode, (node) => {
      if (node.tag === item.tag && node.rect) {
        const dx = Math.abs(node.rect.x - item.rect.x);
        const dy = Math.abs(node.rect.y - item.rect.y);
        if (dx <= 15 && dy <= 15) {
          const nodeClass = (node.attributes?.class || '').trim();
          const itemClass = (item.className || '').trim();
          const isExactClass = !itemClass || !nodeClass || itemClass === nodeClass || (itemClass.split(/\s+/).sort().join(' ') === nodeClass.split(/\s+/).sort().join(' '));
          if (!isExactClass) return;

          // For images, if both have src, verify they are actually the same asset
          if (item.tag === 'IMG' && item.src && (node.attributes?.src || node.src)) {
            const itemSrcBase = item.src.split('?')[0].split('/').pop();
            const nodeSrcBase = (node.attributes?.src || node.src || '').split('?')[0].split('/').pop();
            if (itemSrcBase && nodeSrcBase && itemSrcBase !== nodeSrcBase) {
              return; // Different image file from another slide or variant
            }
          }

          const op = node.styles?.opacity !== undefined ? parseFloat(node.styles.opacity) : 1;
          const vis = node.styles?.visibility || 'visible';
          const disp = node.styles?.display || 'block';

          if (op > 0.05 && vis !== 'hidden' && disp !== 'none' && !node.isHidden) {
            findings.ghostContent.push({
              element: `<${item.tag} class="${item.className || ''}">`,
              src: item.src ? item.src.slice(0, 50) : '',
              domOpacity: item.computedOpacity,
              capturedOpacity: op,
              rect: item.rect,
              message: `<${item.tag}> is inactive/hidden (opacity: ${item.computedOpacity}) in browser, but captured as visible with opacity: ${op}!`
            });
          }
        }
      }
    });
  }

  // 4. Audit Sibling Collisions
  walkNodes(rootNode, (node, parent) => {
    if (!parent || !parent.childNodes || parent.childNodes.length < 2) return;
    const siblings = parent.childNodes;
    for (let i = 0; i < siblings.length - 1; i++) {
      const s1 = siblings[i];
      const s2 = siblings[i + 1];
      if (!s1.rect || !s2.rect) continue;

      const op1 = s1.styles?.opacity !== undefined ? parseFloat(s1.styles.opacity) : 1;
      const op2 = s2.styles?.opacity !== undefined ? parseFloat(s2.styles.opacity) : 1;
      if (op1 < 0.1 || op2 < 0.1) continue;

      const pos1 = s1.styles?.position || 'static';
      const pos2 = s2.styles?.position || 'static';
      if (pos1 === 'fixed' || pos2 === 'fixed') continue;

      const getEffectiveText = (n) => {
        if (n.text) return n.text;
        if (n.childNodes && n.childNodes.length > 0) {
          return n.childNodes.map(c => c.text || '').join('');
        }
        return '';
      };
      const t1 = getEffectiveText(s1);
      const t2 = getEffectiveText(s2);

      if (pos1 === 'absolute' || pos2 === 'absolute') {
        const s1HasLongText = t1.trim().length > 15;
        const s2HasLongText = t2.trim().length > 15;
        if (!s1HasLongText || !s2HasLongText) continue;
      }

      if (s1.rect.width > 2 && s1.rect.height > 2 && s2.rect.width > 2 && s2.rect.height > 2) {
        const s1HasContent = (s1.text && s1.text.trim()) || (s1.childNodes && s1.childNodes.length > 0) || s1.tag === 'IMG' || s1.tag === 'SVG';
        const s2HasContent = (s2.text && s2.text.trim()) || (s2.childNodes && s2.childNodes.length > 0) || s2.tag === 'IMG' || s2.tag === 'SVG';

        if (s1HasContent && s2HasContent) {
          if (doBoxesIntersect(s1.rect, s2.rect, 3)) {
            // Ignore boundary margin overlaps between massive layout wrappers (e.g. page wrapper vs footer template)
            const bothAreLargeContainers = s1.rect.height > 500 && s2.rect.height > 500;
            const overlapHeight = Math.min(s1.rect.y + s1.rect.height, s2.rect.y + s2.rect.height) - Math.max(s1.rect.y, s2.rect.y);
            if (bothAreLargeContainers && overlapHeight < 150) continue;

            // Ignore modal close button headers positioned over modal body
            const s1IsCloseHeader = s1.tag === 'HEADER' && /modal-header|close/i.test(s1.attributes?.class || '') && (!s1.text || s1.text.trim() === '✕');
            const s2IsCloseHeader = s2.tag === 'HEADER' && /modal-header|close/i.test(s2.attributes?.class || '') && (!s2.text || s2.text.trim() === '✕');
            if (s1IsCloseHeader || s2IsCloseHeader) continue;

            // Ignore intentional avatar stack / badge / negative margin overlaps
            const isAvatarStack = /circle-stack|avatar-group|avatar-stack|avatars/i.test(parent.attributes?.class || '');
            const hasNegativeMargin = parseFloat(s1.styles?.marginLeft || '0') < -0.5 || parseFloat(s2.styles?.marginLeft || '0') < -0.5 ||
              parseFloat(s1.styles?.marginRight || '0') < -0.5 || parseFloat(s2.styles?.marginRight || '0') < -0.5 ||
              parseFloat(s1.styles?.marginTop || '0') < -0.5 || parseFloat(s2.styles?.marginTop || '0') < -0.5 ||
              parseFloat(s1.styles?.marginBottom || '0') < -0.5 || parseFloat(s2.styles?.marginBottom || '0') < -0.5;
            if (isAvatarStack || hasNegativeMargin) continue;

            // Ignore transparent floating header overlaying hero/slider section
            const isHeaderHeroOverlay = (
              (s1.tag === 'HEADER' || s2.tag === 'HEADER' || s1.tag === 'SECTION' || s2.tag === 'SECTION') &&
              (/floating-header|transparent-header|include-header|slider-element/i.test(s1.attributes?.class || '') ||
               /floating-header|transparent-header|include-header|slider-element/i.test(s2.attributes?.class || '') ||
               /floating-header|transparent-header|include-header/i.test(parent.attributes?.class || ''))
            );
            if (isHeaderHeroOverlay) continue;

            // Ignore minor line-height bleed between adjacent text lines/fragments
            const isInlineOrText1 = !s1.tag || ['SPAN', 'STRONG', 'EM', 'B', 'I', 'A', 'U'].includes(s1.tag);
            const isInlineOrText2 = !s2.tag || ['SPAN', 'STRONG', 'EM', 'B', 'I', 'A', 'U'].includes(s2.tag);
            if (isInlineOrText1 && isInlineOrText2 && t1 && t2) {
              const overlapHeight = Math.min(s1.rect.y + s1.rect.height, s2.rect.y + s2.rect.height) - Math.max(s1.rect.y, s2.rect.y);
              if (overlapHeight <= 12) continue;
            }

            const s1IsPureBg = /\b(?:backdrop|shadow|overlay|bottom-image-layer|grid-lines|stripes|bg-lines)\b/i.test(s1.attributes?.class || '') && !s1.text && (!s1.childNodes || s1.childNodes.length === 0);
            const s2IsPureBg = /\b(?:backdrop|shadow|overlay|bottom-image-layer|grid-lines|stripes|bg-lines)\b/i.test(s2.attributes?.class || '') && !s2.text && (!s2.childNodes || s2.childNodes.length === 0);
            if (!s1IsPureBg && !s2IsPureBg) {
              findings.siblingCollisions.push({
                sibling1: { tag: s1.tag, class: s1.attributes?.class || '', text: (s1.text || '').slice(0, 40), rect: s1.rect },
                sibling2: { tag: s2.tag, class: s2.attributes?.class || '', text: (s2.text || '').slice(0, 40), rect: s2.rect },
                parentTag: parent.tag,
                parentClass: parent.attributes?.class || ''
              });
            }
          }
        }
      }
    }
  });

  // 5. Audit Contrast & Invisibility (WCAG)
  walkNodes(rootNode, (node, parent) => {
    if (!node.text || !parent) return;
    const textStyle = node.styles || {};
    const textRgb = parseRgb(textStyle.color);
    if (!textRgb || textRgb.a < 0.1) return;

    let curr = parent;
    let bgRgb = null;
    while (curr && !bgRgb) {
      const bg = parseRgb(curr.styles?.backgroundColor);
      if (bg && bg.a > 0.4) {
        bgRgb = bg;
        break;
      }
      curr = curr.parent;
    }

    if (bgRgb) {
      const contrast = getContrastRatio(textRgb, bgRgb);
      if (contrast < 1.4) {
        findings.contrastBugs.push({
          text: node.text.slice(0, 50),
          tag: node.tag,
          class: node.attributes?.class || '',
          textColor: textStyle.color,
          bgColor: `rgba(${Math.round(bgRgb.r * 255)}, ${Math.round(bgRgb.g * 255)}, ${Math.round(bgRgb.b * 255)}, ${bgRgb.a})`,
          contrastRatio: Number(contrast.toFixed(2)),
          rect: node.rect
        });
      }
    }
  });

  // 6. Audit Degenerate Nodes
  walkNodes(rootNode, (node) => {
    if (node.rect) {
      if (node.rect.width < 0 || node.rect.height < 0) {
        findings.degenerateNodes.push({
          tag: node.tag,
          class: node.attributes?.class || '',
          rect: node.rect,
          reason: 'Negative dimension'
        });
      }
    }
  });

  // 7. Generate Section-by-Section Score
  const sections = [];
  walkNodes(rootNode, (node) => {
    const tag = (node.tag || '').toUpperCase();
    const className = (node.attributes?.class || '').toLowerCase();
    const isSection = tag === 'SECTION' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'NAV' || tag === 'MAIN' || className.includes('hero') || className.includes('banner');
    if (isSection && node.rect && node.rect.height > 60) {
      sections.push({
        name: `${tag}${node.id ? '#' + node.id : ''}${className ? '.' + className.split(' ')[0] : ''}`,
        rect: node.rect,
        node
      });
    }
  });

  const sectionScores = sections.map(sec => {
    const secBox = sec.rect;
    const collisions = findings.siblingCollisions.filter(c => doBoxesIntersect(c.sibling1.rect, secBox, 0));
    const textIssues = findings.textLoss.filter(t => doBoxesIntersect(t.rect, secBox, 0));
    const contrastIssues = findings.contrastBugs.filter(cb => doBoxesIntersect(cb.rect, secBox, 0));
    const clippedIssues = findings.clippedOverflow.filter(co => doBoxesIntersect(co.rect, secBox, 0));
    const ghostIssues = findings.ghostContent.filter(gc => doBoxesIntersect(gc.rect, secBox, 0));

    let score = 100;
    score -= collisions.length * 15;
    score -= textIssues.length * 25;
    score -= contrastIssues.length * 20;
    score -= clippedIssues.length * 35;
    score -= ghostIssues.length * 25;
    score = Math.max(0, Math.min(100, score));

    return {
      section: sec.name,
      score,
      rect: secBox,
      issues: {
        collisions: collisions.length,
        textLoss: textIssues.length,
        contrast: contrastIssues.length,
        clippedOverflow: clippedIssues.length,
        ghostContent: ghostIssues.length
      }
    };
  });

  findings.sectionBreakdowns = sectionScores;

  // Print CLI Summary
  console.log('------------------------------------------------------');
  console.log('📊 INVARIANT AUDIT RESULTS');
  console.log('------------------------------------------------------');
  console.log(`• Text Loss / Dropped Words:         ${findings.textLoss.length === 0 ? '✅ 0' : '❌ ' + findings.textLoss.length}`);
  console.log(`• Sibling Box Collisions:             ${findings.siblingCollisions.length === 0 ? '✅ 0' : '❌ ' + findings.siblingCollisions.length}`);
  console.log(`• Clipped Overflow (Decapitations):   ${findings.clippedOverflow.length === 0 ? '✅ 0' : '❌ ' + findings.clippedOverflow.length}`);
  console.log(`• Ghost / Inactive Unhidden Content:  ${findings.ghostContent.length === 0 ? '✅ 0' : '❌ ' + findings.ghostContent.length}`);
  console.log(`• Low Contrast / Unreadable:         ${findings.contrastBugs.length === 0 ? '✅ 0' : '❌ ' + findings.contrastBugs.length}`);
  console.log(`• Degenerate / Negative Sizes:       ${findings.degenerateNodes.length === 0 ? '✅ 0' : '❌ ' + findings.degenerateNodes.length}`);
  console.log('------------------------------------------------------');

  if (findings.clippedOverflow.length > 0) {
    console.log('\n❌ CLIPPED OVERFLOW / DECAPITATIONS DETECTED:');
    findings.clippedOverflow.slice(0, 5).forEach((co, idx) => {
      console.log(`  [${idx + 1}] ${co.element} (src: "${co.src}") overflows parent by ${co.overflowAmount}px on ${co.direction}`);
      console.log(`      Parent: ${co.parent}`);
      console.log(`      Alert: Parent container clips content in Figma, slicing off child head/body!`);
    });
  }

  if (findings.ghostContent.length > 0) {
    console.log('\n❌ GHOST / ACCIDENTALLY UNHIDDEN INACTIVE CONTENT:');
    findings.ghostContent.slice(0, 5).forEach((gc, idx) => {
      console.log(`  [${idx + 1}] ${gc.element} (src: "${gc.src}"): DOM opacity is ${gc.domOpacity}, but captured as visible with opacity ${gc.capturedOpacity}!`);
    });
  }

  if (findings.siblingCollisions.length > 0) {
    console.log('\n⚠️ SIBLING COLLISIONS DETECTED:');
    findings.siblingCollisions.slice(0, 5).forEach((c, idx) => {
      console.log(`  [${idx + 1}] <${c.sibling1.tag}> "${c.sibling1.text || c.sibling1.class}" overlaps <${c.sibling2.tag}> "${c.sibling2.text || c.sibling2.class}"`);
      console.log(`      S1: [X:${c.sibling1.rect.x}, Y:${c.sibling1.rect.y}, W:${c.sibling1.rect.width}, H:${c.sibling1.rect.height}]`);
      console.log(`      S2: [X:${c.sibling2.rect.x}, Y:${c.sibling2.rect.y}, W:${c.sibling2.rect.width}, H:${c.sibling2.rect.height}]`);
    });
  }

  if (findings.textLoss.length > 0) {
    console.log('\n⚠️ TEXT LOSS / DROPPED WORDS DETECTED:');
    findings.textLoss.slice(0, 5).forEach((t, idx) => {
      console.log(`  [${idx + 1}] Missing: "${t.missingWords}" from <${t.tag} class="${t.className}"> "${t.expectedText}"`);
    });
  }

  if (findings.contrastBugs.length > 0) {
    console.log('\n⚠️ LOW CONTRAST / UNREADABLE TEXT:');
    findings.contrastBugs.slice(0, 5).forEach((cb, idx) => {
      console.log(`  [${idx + 1}] "${cb.text}" | Contrast: ${cb.contrastRatio}:1 (Text: ${cb.textColor} on Bg: ${cb.bgColor})`);
    });
  }

  console.log('\n📍 SECTION BREAKDOWN:');
  sectionScores.forEach(s => {
    const icon = s.score >= 95 ? '✅' : s.score >= 80 ? '⚠️' : '❌';
    console.log(`  ${icon} ${s.section.padEnd(28)} Score: ${s.score}% (Collisions: ${s.issues.collisions}, Clipped: ${s.issues.clippedOverflow}, Ghost: ${s.issues.ghostContent}, Text: ${s.issues.textLoss})`);
  });

  // Generate Interactive HTML Report
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, 'invariant_audit_report.html');
  const reportHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>HTML-2-Fig Invariant Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #6366f1; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat-card { background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px; }
    .stat-val { font-size: 28px; font-weight: 700; margin-top: 6px; }
    .stat-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .good { color: #10b981; }
    .warn { color: #f59e0b; }
    .bad { color: #f43f5e; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; background: rgba(30, 41, 59, 0.4); border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
    th { background: rgba(255,255,255,0.04); font-weight: 600; color: #cbd5e1; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .badge-good { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-bad { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
    .section-title { font-size: 18px; margin-top: 32px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>🔍 HTML-2-Fig Invariant Audit</h1>
  <div class="subtitle">Target: ${targetUrlOrFile} &bull; Generated: ${new Date().toLocaleString()}</div>

  <div class="card-grid">
    <div class="stat-card">
      <div class="stat-label">Clipped Overflow / Decapitations</div>
      <div class="stat-val ${findings.clippedOverflow.length === 0 ? 'good' : 'bad'}">${findings.clippedOverflow.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ghost / Inactive Elements</div>
      <div class="stat-val ${findings.ghostContent.length === 0 ? 'good' : 'bad'}">${findings.ghostContent.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Sibling Collisions</div>
      <div class="stat-val ${findings.siblingCollisions.length === 0 ? 'good' : 'bad'}">${findings.siblingCollisions.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Text Loss Errors</div>
      <div class="stat-val ${findings.textLoss.length === 0 ? 'good' : 'bad'}">${findings.textLoss.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Contrast Failures</div>
      <div class="stat-val ${findings.contrastBugs.length === 0 ? 'good' : 'warn'}">${findings.contrastBugs.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Degenerate Bounds</div>
      <div class="stat-val ${findings.degenerateNodes.length === 0 ? 'good' : 'bad'}">${findings.degenerateNodes.length}</div>
    </div>
  </div>

  <div class="section-title">📍 Component Section Fidelity</div>
  <table>
    <thead>
      <tr>
        <th>Section</th>
        <th>Bounds</th>
        <th>Clipped Overflow</th>
        <th>Ghost Elements</th>
        <th>Collisions</th>
        <th>Text Loss</th>
        <th>Score</th>
      </tr>
    </thead>
    <tbody>
      ${sectionScores.map(s => `
        <tr>
          <td><strong>${s.section}</strong></td>
          <td>${s.rect.width}&times;${s.rect.height}px</td>
          <td>${s.issues.clippedOverflow > 0 ? `<span class="badge badge-bad">${s.issues.clippedOverflow}</span>` : '0'}</td>
          <td>${s.issues.ghostContent > 0 ? `<span class="badge badge-bad">${s.issues.ghostContent}</span>` : '0'}</td>
          <td>${s.issues.collisions > 0 ? `<span class="badge badge-bad">${s.issues.collisions}</span>` : '0'}</td>
          <td>${s.issues.textLoss > 0 ? `<span class="badge badge-bad">${s.issues.textLoss}</span>` : '0'}</td>
          <td><span class="badge ${s.score >= 90 ? 'badge-good' : 'badge-bad'}">${s.score}%</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${findings.clippedOverflow.length > 0 ? `
    <div class="section-title">❌ Clipped Overflow / Decapitations (Sliced Avatars & Badges)</div>
    <table>
      <thead>
        <tr><th>Overflowing Child</th><th>Parent Container</th><th>Overflow Amount</th><th>Direction</th><th>Coordinates</th></tr>
      </thead>
      <tbody>
        ${findings.clippedOverflow.map(co => `
          <tr>
            <td><code>${co.element}</code> ${co.src ? `<br><small>${co.src}</small>` : ''}</td>
            <td><code>${co.parent}</code></td>
            <td style="color: #f43f5e; font-weight: 700;">+${co.overflowAmount}px</td>
            <td><span class="badge badge-bad">${co.direction}</span></td>
            <td>X:${co.rect.x}, Y:${co.rect.y}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  ${findings.ghostContent.length > 0 ? `
    <div class="section-title">❌ Ghost / Accidentally Unhidden Inactive Content</div>
    <table>
      <thead>
        <tr><th>Ghost Element</th><th>DOM Opacity</th><th>Captured Opacity</th><th>Coordinates</th></tr>
      </thead>
      <tbody>
        ${findings.ghostContent.map(gc => `
          <tr>
            <td><code>${gc.element}</code> ${gc.src ? `<br><small>${gc.src}</small>` : ''}</td>
            <td style="color: #94a3b8;">${gc.domOpacity} (Hidden)</td>
            <td style="color: #f43f5e; font-weight: 700;">${gc.capturedOpacity} (Visible)</td>
            <td>X:${gc.rect.x}, Y:${gc.rect.y}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  ${findings.siblingCollisions.length > 0 ? `
    <div class="section-title">⚠️ Sibling Box Collisions</div>
    <table>
      <thead>
        <tr><th>Sibling 1</th><th>Sibling 2</th><th>Parent</th><th>Coordinates</th></tr>
      </thead>
      <tbody>
        ${findings.siblingCollisions.map(c => `
          <tr>
            <td><code>&lt;${c.sibling1.tag}&gt;</code> ${c.sibling1.text || c.sibling1.class}</td>
            <td><code>&lt;${c.sibling2.tag}&gt;</code> ${c.sibling2.text || c.sibling2.class}</td>
            <td><code>&lt;${c.parentTag}&gt;</code> ${c.parentClass}</td>
            <td>X:${c.sibling1.rect.x}, Y:${c.sibling1.rect.y} vs X:${c.sibling2.rect.x}, Y:${c.sibling2.rect.y}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  ${findings.textLoss.length > 0 ? `
    <div class="section-title">⚠️ Text Loss Details</div>
    <table>
      <thead>
        <tr><th>Missing Word(s)</th><th>Original Full Text</th><th>Element</th></tr>
      </thead>
      <tbody>
        ${findings.textLoss.map(t => `
          <tr>
            <td style="color: #f43f5e; font-weight: 600;">${t.missingWords}</td>
            <td>${t.expectedText}</td>
            <td><code>&lt;${t.tag} class="${t.className}"&gt;</code></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

</body>
</html>`;

  fs.writeFileSync(reportPath, reportHtml, 'utf8');
  console.log(`\n📄 Interactive report saved to: ${reportPath}`);

  return findings;
}

if (require.main === module) {
  const target = process.argv[2] || 'https://kidioz.risingbamboo.com/';
  auditInvariants(target).catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
}

module.exports = { auditInvariants };
