/**
 * Comprehensive 360° Visual & Layout Audit Engine for HTML-2-Fig
 *
 * Exhaustively analyzes every visible element across the entire webpage:
 * 1. Element Coverage: Detects missing text, missing images, SVGs, buttons, links
 * 2. Text Integrity: Swallowed links, word collisions, truncated text, whitespace collapse
 * 3. 2D Absolute Geometry: Accurate page-level X/Y coordinates, width/height scaling
 * 4. Typography Fidelity: Font size, font weight, line height, text alignment
 * 5. Color & Style Fidelity: Text fills, background colors, contrast drops, opacity, visibility
 * 6. Container Bounds: Children spilling out of bounds, offscreen clipping
 * 7. Composite Fidelity Index: Multi-category percentage scores (0-100%) + Interactive Report
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CAPTURE_JS_PATH = fs.existsSync(path.join(ROOT_DIR, 'packages/chrome-extension/src_original/capture.js'))
  ? path.join(ROOT_DIR, 'packages/chrome-extension/src_original/capture.js')
  : path.join(ROOT_DIR, 'packages/chrome-extension/capture.js');
const FIGMA_CODE_PATH = path.join(ROOT_DIR, 'packages/figma-plugin/src/code.js');
const REPORT_DIR = path.join(ROOT_DIR, 'audit_reports');

// Mock Figma Environment
class MockNode {
  constructor(type, textMetricsMap = {}) {
    this.type = type;
    this.children = [];
    this.fills = [];
    this.strokes = [];
    this.strokeWeight = 0;
    this.opacity = 1;
    this.blendMode = 'PASS_THROUGH';
    this.x = 0;
    this.y = 0;
    this.width = 100;
    this.height = 100;
    this.name = '';
    this.visible = true;
    this._characters = '';
    this._fontSize = 16;
    this.lineHeight = null;
    this.letterSpacing = null;
    this.textAlignHorizontal = 'LEFT';
    this.cornerRadius = 0;
    this.clipsContent = false;
    this._textMetricsMap = textMetricsMap;
    this._resized = false;
    this._rangeFills = [];
    this._rangeFontSizes = [];
    this._rangeFontNames = [];
  }
  get characters() {
    return this._characters;
  }
  set characters(val) {
    this._characters = val || '';
    this._recomputeTextSize();
  }
  get fontSize() {
    return this._fontSize;
  }
  set fontSize(val) {
    this._fontSize = typeof val === 'number' ? val : (parseFloat(val) || 16);
    this._recomputeTextSize();
  }
  _recomputeTextSize() {
    if (this.type === 'TEXT' && !this._resized && this._characters) {
      const clean = this._characters.replace(/\s+/g, ' ').trim();
      if (this._textMetricsMap && this._textMetricsMap[clean]) {
        this.width = Math.round(this._textMetricsMap[clean].width);
        this.height = Math.round(this._textMetricsMap[clean].height);
      } else {
        const fs = typeof this._fontSize === 'number' ? this._fontSize : 16;
        this.width = Math.round(this._characters.length * fs * 0.48);
        this.height = Math.round(fs * 1.2);
      }
    }
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
  }
  insertChild(idx, child) {
    child.parent = this;
    this.children.splice(idx, 0, child);
  }
  resize(w, h) {
    this._resized = true;
    this.width = w;
    this.height = h;
  }
  remove() {
    this._isRemoved = true;
    if (this.parent) {
      const idx = this.parent.children.indexOf(this);
      if (idx !== -1) this.parent.children.splice(idx, 1);
      this.parent = null;
    }
  }
  setRangeFills(start, end, fills) {
    this._rangeFills.push({ start, end, fills });
  }
  setRangeFontSize(start, end, size) {
    this._rangeFontSizes.push({ start, end, size });
  }
  setRangeFontName(start, end, fontName) {
    this._rangeFontNames.push({ start, end, fontName });
  }
  setRangeTextDecoration(start, end, dec) { this.textDecoration = dec; }
  setRangeLetterSpacing(start, end, ls) { this.letterSpacing = ls; }
  setRangeLineHeight(start, end, lh) { this.lineHeight = lh; }
  setRangeFontVariationAxes(start, end, axes) {}
  getRangeAllFontNames(start, end) {
    if (this._rangeFontNames.length > 0) {
      const names = [];
      for (const r of this._rangeFontNames) {
        if (Math.max(start, r.start) < Math.min(end, r.end)) names.push(r.fontName);
      }
      if (names.length > 0) return names;
    }
    return this.fontName ? [this.fontName] : [{ family: 'Inter', style: 'Regular' }];
  }
  getFontNameAt(charIndex) {
    if (this._rangeFontNames && this._rangeFontNames.length > 0) {
      for (let i = this._rangeFontNames.length - 1; i >= 0; i--) {
        const r = this._rangeFontNames[i];
        if (charIndex >= r.start && charIndex < r.end) return r.fontName;
      }
    }
    return this.fontName;
  }
  getFillAt(charIndex) {
    if (this._rangeFills.length > 0) {
      for (let i = this._rangeFills.length - 1; i >= 0; i--) {
        const r = this._rangeFills[i];
        if (charIndex >= r.start && charIndex < r.end) {
          const solid = r.fills?.find(f => f.type === 'SOLID');
          if (solid) return solid.color;
        }
      }
    }
    const solid = this.fills?.find(f => f.type === 'SOLID');
    return solid ? solid.color : null;
  }
  getFontSizeAt(charIndex) {
    if (this._rangeFontSizes.length > 0) {
      for (let i = this._rangeFontSizes.length - 1; i >= 0; i--) {
        const r = this._rangeFontSizes[i];
        if (charIndex >= r.start && charIndex < r.end) {
          return r.size;
        }
      }
    }
    return this.fontSize;
  }
  get absoluteTransform() {
    let ax = this.x || 0;
    let ay = this.y || 0;
    let curr = this.parent;
    while (curr) {
      ax += curr.x || 0;
      ay += curr.y || 0;
      curr = curr.parent;
    }
    return [
      [1, 0, ax],
      [0, 1, ay]
    ];
  }
}

function createFigmaMock(textMetricsMap = {}) {
  const createdNodes = [];
  return {
    createdNodes,
    env: {
      showUI: () => {},
      notify: () => {},
      on: () => {},
      flatten: (nodes) => (nodes && nodes[0] ? nodes[0] : null),
      listAvailableFontsAsync: async () => [],
      createFrame: () => {
        const n = new MockNode('FRAME', textMetricsMap);
        createdNodes.push(n);
        return n;
      },
      createText: () => {
        const n = new MockNode('TEXT', textMetricsMap);
        createdNodes.push(n);
        return n;
      },
      createRectangle: () => {
        const n = new MockNode('RECTANGLE', textMetricsMap);
        createdNodes.push(n);
        return n;
      },
      createLine: () => {
        const n = new MockNode('LINE', textMetricsMap);
        createdNodes.push(n);
        return n;
      },
      createVector: () => {
        const n = new MockNode('VECTOR', textMetricsMap);
        createdNodes.push(n);
        return n;
      },
      createNodeFromSvg: (svgString = '') => {
        const n = new MockNode('FRAME', textMetricsMap);
        n.name = 'svg';
        n.isSvg = true;
        let w = 100, h = 100;
        if (typeof svgString === 'string') {
          const wm = svgString.match(/width=["']([\d.]+)["']/i);
          const hm = svgString.match(/height=["']([\d.]+)["']/i);
          const vm = svgString.match(/viewBox=["'][-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)["']/i);
          if (wm && hm) {
            w = parseFloat(wm[1]) || 100;
            h = parseFloat(hm[1]) || 100;
          } else if (vm) {
            w = parseFloat(vm[1]) || 100;
            h = parseFloat(vm[2]) || 100;
          }
        }
        n.width = w;
        n.height = h;
        const v = new MockNode('VECTOR', textMetricsMap);
        v.name = 'vector';
        v.isSvg = true;
        v.width = w;
        v.height = h;
        n.appendChild(v);
        createdNodes.push(n);
        createdNodes.push(v);
        return n;
      },
      createImage: () => ({
        hash: 'mock-hash',
        getSizeAsync: async () => ({ width: 100, height: 100 })
      }),
      base64Decode: (str) => Buffer.from(str, 'base64'),
      loadFontAsync: async () => {},
      viewport: { center: { x: 720, y: 450 }, scrollAndZoomIntoView: () => {} },
      currentPage: {
        selection: [],
        appendChild: () => {}
      },
      ui: { postMessage: () => {}, resize: () => {}, onmessage: null },
      clientStorage: { getAsync: async () => null, setAsync: async () => {} }
    }
  };
}

function getAbsoluteFigmaRect(node) {
  let x = node.x || 0;
  let y = node.y || 0;
  let curr = node.parent;
  // Stop at the root import frame so we get page-relative coordinates [0..w, 0..h]
  // and do not include the canvas placement viewport offset of the root frame
  while (curr && curr.parent && curr.name !== 'document') {
    x += curr.x || 0;
    y += curr.y || 0;
    curr = curr.parent;
  }
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    width: Math.round((node.width || 0) * 10) / 10,
    height: Math.round((node.height || 0) * 10) / 10
  };
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return s;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(c1, c2) {
  const l1 = getLuminance(c1.r, c1.g, c1.b);
  const l2 = getLuminance(c2.r, c2.g, c2.b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function getColorDistance(c1, c2) {
  return Math.sqrt(
    Math.pow((c1.r || 0) - (c2.r || 0), 2) +
    Math.pow((c1.g || 0) - (c2.g || 0), 2) +
    Math.pow((c1.b || 0) - (c2.b || 0), 2)
  );
}

async function auditUrl(targetUrl, options = {}) {
  console.log(`\n======================================================`);
  console.log(`🔍 [HTML-2-Fig 360° Audit] Starting comprehensive check for:`);
  console.log(`   ${targetUrl}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('⏳ Navigating to URL...');
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    console.warn('⚠️ Navigation timeout or warning, proceeding with loaded DOM...');
  }

  // Wait for entrance animations / Slider Revolution to reach resting state
  try {
    const hasSlider = await page.$('.rev_slider, [class*="rev_slider"], .tp-caption, [data-frames]');
    if (hasSlider) {
      console.log('⏳ Waiting 2.8s for hero slider entrance animations to settle...');
      await new Promise(r => setTimeout(r, 2800));
    }
  } catch (_) {}

  // Smooth scroll to trigger lazy loading / animations
  console.log('📜 Scrolling page to trigger lazy loading & animations...');
  await page.evaluate(async () => {
    const totalHeight = document.body.scrollHeight;
    for (let y = 0; y < Math.min(totalHeight, 10000); y += 600) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
    try {
      const swipers = document.querySelectorAll('.swiper, [class*="swiper-container"], [class*="swiper"]');
      for (const el of swipers) {
        const s = el.swiper || (window.jQuery && window.jQuery(el).data('swiper'));
        if (s) {
          try {
            if (s.autoplay && s.autoplay.stop) s.autoplay.stop();
            if (typeof s.slideToLoop === 'function') s.slideToLoop(0, 0);
            else if (typeof s.slideTo === 'function') s.slideTo(0, 0);
          } catch(e) {}
        }
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 800));
  });

  // 1. Extract Ground-Truth DOM Data (Text, Images, Interactive, Dimensions, Styles)
  console.log('📐 Extracting 360° Ground-Truth DOM hierarchy & visual glyph metrics...');
  const domTruth = await page.evaluate(() => {
    function parseRgb(colorStr) {
      const m = (colorStr || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return {
        r: parseInt(m[1]) / 255,
        g: parseInt(m[2]) / 255,
        b: parseInt(m[3]) / 255,
        a: m[4] !== undefined ? parseFloat(m[4]) : 1
      };
    }

    function getLuminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function getContrast(c1, c2) {
      const l1 = getLuminance(c1.r, c1.g, c1.b);
      const l2 = getLuminance(c2.r, c2.g, c2.b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function getEffectiveBg(element) {
      let curr = element;
      const layers = [];
      while (curr && curr !== document.documentElement) {
        const comp = window.getComputedStyle(curr);
        const bg = parseRgb(comp.backgroundColor);
        if (bg && bg.a > 0.01) {
          layers.unshift(bg);
        }
        curr = curr.parentElement;
      }
      let curR = 1, curG = 1, curB = 1;
      for (const l of layers) {
        curR = l.r * l.a + curR * (1 - l.a);
        curG = l.g * l.a + curG * (1 - l.a);
        curB = l.b * l.a + curB * (1 - l.a);
      }
      return { r: curR, g: curG, b: curB };
    }

    function isElementVisible(element) {
      let curr = element;
      let elRect = null;
      while (curr && curr !== document.documentElement) {
        const comp = window.getComputedStyle(curr);
        if (comp.display === 'none' || comp.visibility === 'hidden' || parseFloat(comp.opacity) < 0.05) {
          return false;
        }
        if ((window.scrollY || 0) === 0 && (curr.classList?.contains('scroll-progress') || curr.classList?.contains('scroll-top') || (typeof curr.className === 'string' && /(?:scroll-progress|scroll-top)/i.test(curr.className)))) {
          return false;
        }
        if (typeof curr.className === 'string' && /(?:^|\b)(?:[a-z0-9_-]*(?:visually[-_]?hidden|sr[-_]?only|screen[-_]?reader)|invisible|rbb-modal|account-form-canvas|popup-modal|drawer-modal)(?:$|\b)/i.test(curr.className)) {
          if (comp.visibility === 'hidden' || parseFloat(comp.opacity) === 0 || comp.display === 'none' || curr.getAttribute('aria-hidden') === 'true') {
            return false;
          }
        }
        if (curr !== element && (comp.overflow === 'hidden' || comp.overflowY === 'hidden' || comp.overflowX === 'hidden')) {
          if (!elRect) elRect = element.getBoundingClientRect();
          const cRect = curr.getBoundingClientRect();
          if (cRect.width > 0 && cRect.height > 0) {
            if (elRect.top >= cRect.bottom - 1 || elRect.bottom <= cRect.top + 1 ||
                elRect.left >= cRect.right - 1 || elRect.right <= cRect.left + 1) {
              return false;
            }
          }
        }
        curr = curr.parentElement;
      }
      return true;
    }

    const scrollY = window.scrollY || 0;
    const scrollX = window.scrollX || 0;
    const textElements = [];
    const imageElements = [];

    // A. Collect all text-bearing elements
    const all = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, a, button, [role="button"], span, div, li, td, th, label, strong, b, em, i, input, textarea, select');
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (!isElementVisible(el)) continue;

      const cs = window.getComputedStyle(el);
      // Skip screen-reader only and visually clipped elements
      if (typeof el.className === 'string' && /(?:^|\b)(?:[a-z0-9_-]*(?:visually[-_]?hidden|sr[-_]?only|screen[-_]?reader)|invisible)(?:$|\b)/i.test(el.className)) continue;
      if (cs.clip && /rect\(\s*(?:0px|1px|0|1)[,\s]+(?:0px|1px|0|1)/i.test(cs.clip)) continue;
      if (cs.clipPath && /inset\(\s*(?:50%|100%)/i.test(cs.clipPath)) continue;
      if (el.closest('svg, defs, mask, template, noscript, script, style, [aria-hidden="true"]')) continue;

      let text = '';
      let visualRect = rect;
      let isElClamped = false;
      const textNodes = [];

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        if (el.tagName === 'INPUT') {
          const it = (el.getAttribute('type') || el.type || 'text').toLowerCase();
          if (['checkbox', 'radio', 'hidden', 'file', 'image', 'color', 'range'].includes(it)) {
            continue;
          }
        }
        text = (el.value || el.placeholder || el.getAttribute('placeholder') || '').trim();
      } else {
        // Prevent parent container text duplication:
        // If el has children, check if those children contain visible text.
        // If so, el is a wrapper/container and its children represent the actual text nodes with their own font size/color.
        if (el.children.length > 0) {
          const hasTextChild = Array.from(el.children).some(c => {
            if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(c.tagName)) return false;
            const ccs = window.getComputedStyle(c);
            if (ccs.display === 'none' || ccs.visibility === 'hidden' || parseFloat(ccs.opacity) === 0) return false;
            return (c.textContent || '').trim().length > 0;
          });
          if (hasTextChild) {
            const directText = Array.from(el.childNodes)
              .filter(n => n.nodeType === 3 && n.textContent.trim().length > 0)
              .map(n => n.textContent.trim())
              .join(' ');
            if (!directText) {
              continue;
            }
          }
        }

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
              const p = node.parentElement;
              if (!p || !isElementVisible(p)) return NodeFilter.FILTER_REJECT;
              if (p.closest('svg, defs, mask, template, noscript, script, style, [aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
              if (typeof p.className === 'string' && /(?:^|\b)(?:[a-z0-9_-]*(?:visually[-_]?hidden|sr[-_]?only|screen[-_]?reader)|invisible)(?:$|\b)/i.test(p.className)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          let tn;
          while ((tn = walker.nextNode())) {
            textNodes.push(tn);
          }

          if (textNodes.length > 0) {
            text = textNodes.map(t => t.textContent).join(' ').replace(/\s+/g, ' ').trim();
            try {
              const range = document.createRange();
              range.setStartBefore(textNodes[0]);
              range.setEndAfter(textNodes[textNodes.length - 1]);
              const tr = range.getBoundingClientRect();
              let trH = tr.height;
              const pEl = el.parentElement;
              const cs = window.getComputedStyle(el);
              const pCs = pEl ? window.getComputedStyle(pEl) : cs;
              const lc = parseInt(cs.webkitLineClamp || cs.lineClamp || pCs.webkitLineClamp || pCs.lineClamp, 10);
              const isOverflowHidden = (cs.overflow && cs.overflow !== 'visible') || (pCs.overflow && pCs.overflow !== 'visible');
              const clientH = el.clientHeight > 0 ? el.clientHeight : (pEl ? pEl.clientHeight : 0);
              if ((lc > 0 || isOverflowHidden) && clientH > 0 && clientH < trH - 4) {
                trH = clientH;
                isElClamped = true;
              }
              if (tr.width > 0 && tr.height > 0) visualRect = { x: tr.x, y: tr.y, width: tr.width, height: trH };
            } catch (_) {}
          } else {
            // Reject elements with no visible text nodes to avoid pulling in scripts/styles/templates
            continue;
          }
        }

      if (el.hasAttribute && el.hasAttribute('data-to-value')) {
        let val = el.getAttribute('data-to-value');
        const delimiter = el.getAttribute('data-delimiter') || ',';
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 1000 && !val.includes(delimiter)) {
          val = num.toLocaleString('en-US');
        }
        text = val;
      }

      if (!text || text.length < 2) continue;
      const fullText = text;
      const displayKey = text.length > 80 ? text.slice(0, 80) : text;
      const cleanText = fullText.replace(/\s+/g, ' ').trim();
      const isStrikethrough = !!el.closest('del, s') || (cs.textDecorationLine && cs.textDecorationLine.includes('line-through')) || (cs.textDecoration && cs.textDecoration.includes('line-through'));

      const parentEl = el.parentElement;
      const parentRect = parentEl ? parentEl.getBoundingClientRect() : null;
      const clonedSliderParent = el.closest('.slick-cloned, [class*="slick-cloned"], .swiper-slide:not(.swiper-slide-active):not(.swiper-slide-visible), .slick-slide:not(.slick-active)');
      const isPromoModalChild = !!el.closest('.awb-off-canvas-wrap, [class*="newsletter-popup"], [class*="promo-popup"], #onetrust-consent-sdk, [class*="type-popup"]');
      const isSliderChild = !!clonedSliderParent || isPromoModalChild || (visualRect.x + visualRect.width < -50) || (visualRect.x > 2500);
      const isInlineInParagraph = el.tagName === 'A' && cs.display.startsWith('inline') &&
        (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'LABEL', 'BLOCKQUOTE', 'FIGCAPTION', 'DIV', 'SPAN'].includes(parentEl?.tagName) ||
         (parentEl && (parentEl.textContent || '').trim().length > cleanText.length + 5));

      const textRgb = parseRgb(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
      const bgRgb = getEffectiveBg(el);
      const domContrast = getContrast(textRgb, bgRgb);

      // Extract fine-grained segments for text nodes with distinct styling
      const segments = textNodes.map(tn => {
        const pe = tn.parentElement || el;
        const comp = window.getComputedStyle(pe);
        const parsedCol = parseRgb(comp.color) || textRgb;
        return {
          text: tn.textContent,
          color: parsedCol,
          fontSize: parseFloat(comp.fontSize) || parseFloat(cs.fontSize) || 16,
          fontWeight: parseInt(comp.fontWeight) || (comp.fontWeight === 'bold' ? 700 : 400)
        };
      });

      // Handle multi-layer shader text (e.g. duplicate overlapping spans with blend/alpha)
      const existingOverlapping = textElements.slice(-6).find(prev => 
        Math.abs(prev.visualRect.x - visualRect.x) < 10 &&
        Math.abs(prev.visualRect.y - visualRect.y) < 10 &&
        (prev.cleanText === cleanText || prev.cleanText.includes(cleanText.slice(0, 30)) || cleanText.includes(prev.cleanText.slice(0, 30)))
      );
      if (existingOverlapping) {
        const c1 = existingOverlapping.domColor;
        const c2 = textRgb;
        const a2 = c2.a || 1;
        const blended = {
          r: Math.round((c2.r * a2 + c1.r * (1 - a2)) * 100) / 100,
          g: Math.round((c2.g * a2 + c1.g * (1 - a2)) * 100) / 100,
          b: Math.round((c2.b * a2 + c1.b * (1 - a2)) * 100) / 100,
          a: 1
        };
        existingOverlapping.overlappingColors = [c2, blended];
        continue;
      }

      textElements.push({
        type: 'TEXT',
        tag: el.tagName,
        className: el.className ? String(el.className).slice(0, 80) : '',
        id: el.id || '',
        text: displayKey,
        fullText: fullText,
        cleanText: cleanText,
        segments: segments,
        isSliderChild,
        isClamped: isElClamped,
        isInlineInParagraph,
        domContrast: Math.round(domContrast * 100) / 100,
        domColor: textRgb,
        domBgColor: bgRgb,
        fontSize: parseFloat(cs.fontSize) || 16,
        fontWeight: parseInt(cs.fontWeight) || (cs.fontWeight === 'bold' ? 700 : 400),
        lineHeight: parseFloat(cs.lineHeight) || null,
        letterSpacing: parseFloat(cs.letterSpacing) || null,
        textDecoration: isStrikethrough ? 'line-through' : (cs.textDecoration || cs.textDecorationLine || ''),
        textTransform: cs.textTransform || 'none',
        textAlign: cs.textAlign || 'left',
        opacity: parseFloat(cs.opacity) || 1,
        display: cs.display,
        elementRect: {
          x: Math.round(rect.x * 10) / 10,
          y: Math.round(rect.y * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        },
        visualRect: {
          x: Math.round(visualRect.x * 10) / 10,
          y: Math.round(visualRect.y * 10) / 10,
          width: Math.round(visualRect.width * 10) / 10,
          height: Math.round(visualRect.height * 10) / 10
        },
        absRect: {
          x: Math.round((visualRect.x + scrollX) * 10) / 10,
          y: Math.round((visualRect.y + scrollY) * 10) / 10,
          width: Math.round(visualRect.width * 10) / 10,
          height: Math.round(visualRect.height * 10) / 10
        },
        parentRect: parentRect ? {
          x: Math.round(parentRect.x * 10) / 10,
          y: Math.round(parentRect.y * 10) / 10,
          width: Math.round(parentRect.width * 10) / 10,
          height: Math.round(parentRect.height * 10) / 10
        } : null,
        relativeVisualPos: parentRect ? {
          x: Math.round((visualRect.x - parentRect.x) * 10) / 10,
          y: Math.round((visualRect.y - parentRect.y) * 10) / 10
        } : { x: visualRect.x, y: visualRect.y }
      });
    }

    // B. Collect all visible images, SVGs, canvas, and background gradients (including CSS-based gradients)
    const mediaCandidates = document.querySelectorAll('img, svg, canvas, div, section, span, header, footer, a, [style*="background-image"]');
    for (const m of mediaCandidates) {
      if (m.closest('defs, mask, symbol, template, noscript, script, style')) continue;
      if (typeof m.className === 'string' && /(?:^|\b)(?:[a-z0-9_-]*(?:visually[-_]?hidden|sr[-_]?only|screen[-_]?reader)|invisible)(?:$|\b)/i.test(m.className)) continue;
      const mr = m.getBoundingClientRect();
      if (mr.width < 10 || mr.height < 10) continue;
      // Skip media completely positioned above page fold
      if (mr.y + scrollY < -10) continue;
      if (!isElementVisible(m)) continue;

      const mcs = window.getComputedStyle(m);
      if (mcs.display === 'none' || mcs.visibility === 'hidden' || parseFloat(mcs.opacity) === 0) continue;
      if (mcs.webkitBackgroundClip === 'text' || mcs.backgroundClip === 'text') continue;
      if (mcs.backgroundImage && (mcs.backgroundImage.includes('trans-tile') || mcs.backgroundImage.includes('rev-trans-tile') || mcs.backgroundImage.includes('spacer.gif') || mcs.backgroundImage.includes('data:image/gif;base64,R0lGODlhAQABA'))) continue;

      const isImg = m.tagName === 'IMG' || m.tagName === 'PICTURE';
      const isSvg = m.tagName === 'svg';
      const isCanvas = m.tagName === 'CANVAS';
      const hasGrad = mcs.backgroundImage && mcs.backgroundImage.includes('gradient');
      const hasBgImg = mcs.backgroundImage && mcs.backgroundImage.includes('url(');

      if (!isImg && !isSvg && !isCanvas && !hasGrad && !hasBgImg) continue;

      const isSlider = !!m.closest('.slick-cloned, [class*="slick-cloned"], .swiper-slide, [class*="swiper-slide"]') || (mr.x + mr.width < -50) || (mr.x > 2500);

      imageElements.push({
        type: hasGrad ? 'GRADIENT' : isCanvas ? 'CANVAS' : isSvg ? 'SVG' : 'IMAGE',
        tag: m.tagName,
        className: m.className ? String(m.className).slice(0, 60) : '',
        isSlider,
        hasGradient: !!hasGrad,
        absRect: {
          x: Math.round((mr.x + scrollX) * 10) / 10,
          y: Math.round((mr.y + scrollY) * 10) / 10,
          width: Math.round(mr.width * 10) / 10,
          height: Math.round(mr.height * 10) / 10
        }
      });
    }

    return { textElements, imageElements };
  });

  const screenshotName = `screenshot_${Date.now()}.png`;
  const screenshotPath = path.join(REPORT_DIR, screenshotName);
  console.log(`📸 Capturing live page viewport screenshot -> ${screenshotName}...`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  // 2. Run capture.js inside page
  console.log('⚡ Running capture.js engine...');
  const captureJs = fs.readFileSync(CAPTURE_JS_PATH, 'utf8');
  await page.evaluate(captureJs);

  const payload = await page.evaluate(async () => {
    return await window.html2Fig.captureRaw();
  });

  await browser.close();

  console.log(`📦 Captured raw payload: ${payload?.root?.childNodes?.length || 0} top-level nodes.`);

  // 3. Run simulated Figma render
  console.log('🎨 Rendering inside simulated Figma engine (code.js)...');
  const textMetricsMap = {};
  for (const item of domTruth.textElements) {
    if (item.visualRect) {
      if (item.fullText) textMetricsMap[item.fullText.replace(/\s+/g, ' ').trim()] = item.visualRect;
      if (item.text) textMetricsMap[item.text.replace(/\s+/g, ' ').trim()] = item.visualRect;
    }
  }

  const { createdNodes, env: mockFigma } = createFigmaMock(textMetricsMap);
  global.__html__ = '';
  global.figma = mockFigma;

  const figmaCode = fs.readFileSync(FIGMA_CODE_PATH, 'utf8');
  eval(figmaCode);

  await renderTree(payload);
  console.log(`✨ Figma render complete: ${createdNodes.length} nodes created.`);

  // 4. Exhaustive 360° Anomaly & Discrepancy Analysis
  console.log('🔎 Running Comprehensive 360° Discrepancy & Fidelity Analysis...');
  const anomalies = [];

  // Index Figma Nodes
  const figmaTextList = [];
  const figmaMediaList = [];

  const rootFrames = createdNodes.filter(n => !n.parent);
  for (const fn of createdNodes) {
    if (fn._isRemoved) continue;
    let isAttached = false;
    let cur = fn;
    while (cur) {
      if (rootFrames.includes(cur)) {
        isAttached = true;
        break;
      }
      cur = cur.parent;
    }
    if (!isAttached) continue;

    const absRect = getAbsoluteFigmaRect(fn);
    if (fn.type === 'TEXT' && fn.characters && fn.characters.trim()) {
      const clean = fn.characters.replace(/\s+/g, ' ').trim();
      figmaTextList.push({
        node: fn,
        cleanText: clean,
        shortKey: clean.slice(0, 35),
        absRect
      });
    } else if (fn.type === 'FRAME' || fn.type === 'VECTOR' || fn.type === 'RECTANGLE') {
      const hasImg = fn.fills?.some(f => f.type === 'IMAGE');
      const hasGrad = fn.fills?.some(f => f.type && f.type.includes('GRADIENT'));
      const isVector = fn.type === 'VECTOR' || fn.isSvg || (fn.name && (fn.name.toLowerCase().includes('svg') || fn.name.toLowerCase().includes('vector') || fn.name.toLowerCase().includes('icon')));
      if (hasImg || isVector || hasGrad) {
        figmaMediaList.push({ node: fn, absRect, isImage: hasImg, isGradient: hasGrad });
      }
    }
  }

  let textMatchedCount = 0;
  let textGeometryPassCount = 0;
  let typographyPassCount = 0;
  let colorPassCount = 0;

  // 4.1 TEXT ELEMENT AUDIT (Coverage, Geometry, Typography, Color)
  for (const domItem of domTruth.textElements) {
    if (!domItem.text || domItem.text.length < 2) continue;
    if (domItem.isSliderChild) continue;

    const cleanDom = domItem.cleanText;
    const shortKey = cleanDom.slice(0, 35);

    // Multi-candidate matching: 2D Euclidean distance on page coordinates to disambiguate repeated strings
    const isDomCode = domItem.tag === 'CODE' || domItem.tag === 'PRE' ||
      (typeof domItem.className === 'string' && /(?:code|syntax|token|snippet|terminal|pre|mono)/i.test(domItem.className)) ||
      /['"`();={}]/.test(cleanDom);
    const bareDomToken = cleanDom.replace(/['"`\s]/g, '').toLowerCase();

    const candidateNodes = figmaTextList.filter(f => {
      if (f.cleanText.toLowerCase() === cleanDom.toLowerCase()) return true;
      if (f.cleanText.replace(/\s+/g, '').toLowerCase() === cleanDom.replace(/\s+/g, '').toLowerCase()) return true;
      if (f.cleanText.endsWith('...') && cleanDom.toLowerCase().startsWith(f.cleanText.slice(0, -3).trim().toLowerCase())) return true;
      if (isDomCode && bareDomToken.length >= 3) {
        const fBare = f.cleanText.replace(/['"`\s]/g, '').toLowerCase();
        if (fBare === bareDomToken) return true;
      }
      return false;
    });
    let matched = null;
    if (candidateNodes.length > 0) {
      const bestCandidate = candidateNodes.reduce((closest, curr) => {
        const distCurr = Math.hypot(curr.absRect.x - domItem.absRect.x, curr.absRect.y - domItem.absRect.y);
        const distClosest = Math.hypot(closest.absRect.x - domItem.absRect.x, closest.absRect.y - domItem.absRect.y);
        return distCurr < distClosest ? curr : closest;
      }, candidateNodes[0]);

      const bestDist = Math.hypot(bestCandidate.absRect.x - domItem.absRect.x, bestCandidate.absRect.y - domItem.absRect.y);
      if (bestDist < 800) {
        matched = bestCandidate;
      }
    }

    if (!matched && cleanDom.length >= 4) {
      const partials = figmaTextList.filter(f => {
        if (!f.cleanText || f.cleanText.length < 4) return false;
        const fText = f.cleanText.toLowerCase();
        const dText = cleanDom.toLowerCase();
        if ((fText.length < 15 && dText.length >= 25) || (dText.length < 15 && fText.length >= 25)) return false;
        if (isDomCode && (fText.length < 20 && !/['"`();={}]/.test(fText))) {
          return false;
        }
        return fText.includes(dText) || dText.includes(fText) ||
          f.cleanText.replace(/\s+/g, '').toLowerCase().includes(cleanDom.replace(/\s+/g, '').toLowerCase()) ||
          cleanDom.replace(/\s+/g, '').toLowerCase().includes(f.cleanText.replace(/\s+/g, '').toLowerCase()) ||
          (isDomCode && bareDomToken.length >= 3 && fText.includes(bareDomToken));
      });
      if (partials.length > 0) {
        const bestCandidate = partials.reduce((closest, curr) => {
          const distCurr = Math.hypot(curr.absRect.x - domItem.absRect.x, curr.absRect.y - domItem.absRect.y);
          const distClosest = Math.hypot(closest.absRect.x - domItem.absRect.x, closest.absRect.y - domItem.absRect.y);
          return distCurr < distClosest ? curr : closest;
        }, partials[0]);
        const dist = Math.hypot(bestCandidate.absRect.x - domItem.absRect.x, bestCandidate.absRect.y - domItem.absRect.y);
        if (dist < 800) {
          matched = bestCandidate;
        }
      }
    }

    if (!matched && cleanDom.length >= 4) {
      // Rotating/ticker text: Words rotate dynamically between DOM snapshot and capture
      const domWords = cleanDom.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      if (domWords.length >= 3) {
        const locCandidates = figmaTextList.filter(f => {
          const dist = Math.hypot(f.absRect.x - domItem.absRect.x, f.absRect.y - domItem.absRect.y);
          if (dist > 150) return false;
          const fWords = f.cleanText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const shared = domWords.filter(w => fWords.includes(w)).length;
          return shared >= Math.min(3, Math.ceil(domWords.length * 0.6));
        });
        if (locCandidates.length > 0) {
          matched = locCandidates[0];
        }
      }
    }

    if (!matched) {
      // Check if text is contained inside an existing Figma text block (e.g. inline span merged into sentence)
      let swallowed = null;
      const cleanLower = cleanDom.toLowerCase();
      const cleanCompact = cleanLower.replace(/\s+/g, '');
      if (cleanLower.length >= 2) {
        swallowed = figmaTextList.find(f => {
          const fLower = f.cleanText.toLowerCase();
          const fCompact = fLower.replace(/\s+/g, '');
          if (fCompact.includes(cleanCompact)) {
            if (cleanLower.length <= 3) {
              const isCounterToken = /^\d+(?:\.\d+)?$/.test(cleanDom) || /^[kmbgt%]+$/i.test(cleanDom) || cleanDom.includes('+');
              if (isCounterToken) return true;
              const wordRe = new RegExp('(?:^|\\s|\\W)' + cleanDom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|\\s|\\W)', 'i');
              return wordRe.test(f.cleanText);
            }
            return true;
          }
          return false;
        });
      }
      if (swallowed) {
        if (!domItem.isInlineInParagraph && ['A', 'BUTTON'].includes(domItem.tag)) {
          anomalies.push({
            severity: 'CRITICAL',
            category: 'COVERAGE',
            type: 'SWALLOWED_INTERACTIVE_LINK',
            message: `Interactive link "${domItem.text}" was swallowed into an unrelated text block!`,
            details: {
              expected: `Standalone ${domItem.tag} layer`,
              actual: `Swallowed in: "${swallowed.cleanText.slice(0, 60)}..."`,
              domPosition: `x:${domItem.absRect.x}, y:${domItem.absRect.y}`
            }
          });
        }
      } else {
        anomalies.push({
          severity: 'CRITICAL',
          category: 'COVERAGE',
          type: 'MISSING_TEXT_ELEMENT',
          message: `Text "${domItem.text}" was not rendered in Figma!`,
          details: {
            expected: `Visible text: "${domItem.text}"`,
            actual: 'Missing from Figma scene graph',
            domPosition: `x:${domItem.absRect.x}, y:${domItem.absRect.y}`
          }
        });
      }
      continue;
    }

    textMatchedCount++;
    const figmaNode = matched.node;
    const parentFrame = figmaNode.parent;

    // Check: Character Loss / Text Truncation
    function getAncestorCombinedText(node, maxDepth = 4) {
      let cur = node?.parent;
      for (let d = 0; d < maxDepth && cur; d++) {
        if (cur.children && cur.children.length > 1) {
          const textNodes = [];
          function collectTexts(n) {
            if (n.type === 'TEXT' && n.characters) textNodes.push(n.characters);
            if (n.children) n.children.forEach(collectTexts);
          }
          collectTexts(cur);
          const combined = textNodes.join(' ').replace(/\s+/g, ' ').trim();
          const cleanWords = cleanDom.split(/\s+/).map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').trim()).filter(w => w.length >= 2);
          const allWordsPresent = cleanWords.length >= 2 && cleanWords.every(w => combined.toLowerCase().includes(w.toLowerCase()));
          if (combined && (
            combined.toLowerCase().includes(cleanDom.toLowerCase()) ||
            combined.replace(/\s+/g, '').toLowerCase().includes(cleanDom.replace(/\s+/g, '').toLowerCase()) ||
            allWordsPresent
          )) {
            return combined;
          }
        }
        cur = cur.parent;
      }
      return '';
    }

    const ancestorCombined = getAncestorCombinedText(figmaNode);
    const isSplitAcrossSiblings = Boolean(ancestorCombined);

    if (cleanDom.length >= 4 && matched.cleanText !== cleanDom) {
      const isIntentionalClamp = domItem.isClamped || matched.cleanText.endsWith('...') || matched.node.textTruncation === 'ENDING';
      if (!isIntentionalClamp && !isSplitAcrossSiblings && cleanDom.includes(matched.cleanText) && matched.cleanText.length <= cleanDom.length - 1) {
        anomalies.push({
          severity: 'CRITICAL',
          category: 'TEXT_INTEGRITY',
          type: 'TEXT_CHARACTERS_TRUNCATED',
          message: `Text "${domItem.text}" truncated in Figma (lost ${cleanDom.length - matched.cleanText.length} characters)!`,
          details: {
            expected: `Full text: "${cleanDom}"`,
            actual: `Rendered: "${matched.cleanText}"`,
            missingChars: cleanDom.slice(matched.cleanText.length) || cleanDom.replace(matched.cleanText, '')
          }
        });
      }
    }

    // Check: Container Clipping with clipsContent enabled (Top, Bottom, Left, Right)
    if (parentFrame && parentFrame.clipsContent) {
      const figmaRightEdge = figmaNode.x + figmaNode.width;
      const figmaBottomEdge = figmaNode.y + figmaNode.height;

      if (figmaNode.y < -2) {
        anomalies.push({
          severity: 'CRITICAL',
          category: 'GEOMETRY',
          type: 'CONTAINER_TOP_CLIPPING_DECAPITATION',
          message: `Text "${domItem.text}" top edge (${Math.round(figmaNode.y)}px) clipped/decapitated by parent frame with clipsContent enabled!`,
          details: {
            expected: `Parent frame top allows overflow or clipsContent is false`,
            actual: `Figma node y is ${Math.round(figmaNode.y)}px (clipped by ${Math.round(-figmaNode.y)}px)`
          }
        });
      }
      if (figmaRightEdge > parentFrame.width + 1 && parentFrame.width > 20) {
        anomalies.push({
          severity: 'CRITICAL',
          category: 'GEOMETRY',
          type: 'CONTAINER_CLIPPING_CUTOFF',
          message: `Text "${domItem.text}" visually clipped horizontally by parent frame with clipsContent enabled!`,
          details: {
            expected: `Parent frame width >= ${Math.round(figmaRightEdge)}px`,
            actual: `Parent frame width is ${Math.round(parentFrame.width)}px (clipped by ${Math.round(figmaRightEdge - parentFrame.width)}px)`
          }
        });
      }
      if (figmaNode.x < -2) {
        anomalies.push({
          severity: 'CRITICAL',
          category: 'GEOMETRY',
          type: 'CONTAINER_LEFT_CLIPPING',
          message: `Text "${domItem.text}" left edge (${Math.round(figmaNode.x)}px) clipped by parent frame!`,
          details: {
            expected: `Parent frame left allows overflow`,
            actual: `Figma node x is ${Math.round(figmaNode.x)}px`
          }
        });
      }
    }

    // Check: Word Collisions / Text Fusion (e.g. ProductsPricingAtlas or link merging)
    const isCode = domItem.tag === 'CODE' || domItem.tag === 'PRE' ||
      (typeof domItem.className === 'string' && /(?:code|syntax|token|snippet|terminal|pre|mono)/i.test(domItem.className)) ||
      (typeof figmaNode.name === 'string' && /(?:code|syntax|token|snippet|mono)/i.test(figmaNode.name)) ||
      /['"`();={}]/.test(figmaNode.characters);
    if (!isCode && figmaNode.characters && figmaNode.characters.length > 15) {
      const fused = figmaNode.characters.match(/[a-z]{2,}[A-Z][a-z]{2,}/g) || [];
      if (fused.length >= 1) {
        const domHasFused = fused.every(w => (domItem.fullText || '').includes(w) || domTruth.textElements.some(d => (d.cleanText || '').includes(w) || (d.fullText || '').includes(w)));
        if (!domHasFused) {
          anomalies.push({
            severity: 'CRITICAL',
            category: 'TEXT_INTEGRITY',
            type: 'TEXT_FUSION_COLLAPSE',
            message: `Text node contains ${fused.length} collapsed words without spacing: links or list items were merged!`,
            details: {
              expected: 'Separated words with whitespace',
              actual: `Fused samples: "${fused.slice(0, 4).join(', ')}"`,
              textSample: figmaNode.characters.slice(0, 75) + '...'
            }
          });
        }
      }
    }

    // Check: Container Overflow & Text Truncation
    if (parentFrame && parentFrame.width > 20) {
      const isCentered = figmaNode.textAlignHorizontal === 'CENTER' && Math.abs(figmaNode.width - parentFrame.width) <= 20;
      const figmaRightEdge = figmaNode.x + figmaNode.width;
      const isOverflowingFigma = !isCentered && figmaRightEdge > parentFrame.width + 6;
      const domContained = domItem.parentRect ? (domItem.relativeVisualPos.x + domItem.visualRect.width <= domItem.parentRect.width + 10) : true;

      if (isOverflowingFigma && domContained) {
        anomalies.push({
          severity: 'CRITICAL',
          category: 'GEOMETRY',
          type: 'CONTAINER_OVERFLOW',
          message: `Text "${domItem.text}" pushed outside parent container bounds!`,
          details: {
            expected: `Contained in parent (w: ${domItem.parentRect?.width}px)`,
            actual: `Figma node right edge (${figmaRightEdge}px) exceeds parent frame (${parentFrame.width}px) by +${Math.round(figmaRightEdge - parentFrame.width)}px`,
            overflowPixels: Math.round(figmaRightEdge - parentFrame.width)
          }
        });
      }

      // Check: Truncation in constrained parent frames (e.g. fixed containers clipping text)
      const isConstrainedLinkOrHeading = ['A', 'BUTTON', 'LI', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'P'].includes(domItem.tag);
      const isNarrowParent = (parentFrame.clipsContent || parentFrame.width < domItem.visualRect.width - 2) && domItem.text.length >= 6 && domItem.visualRect.width >= 40;
      if (isConstrainedLinkOrHeading && isNarrowParent && parentFrame.width < domItem.visualRect.width - 4) {
        anomalies.push({
          severity: 'CRITICAL',
          category: 'GEOMETRY',
          type: 'TEXT_TRUNCATION_CLIPPING',
          message: `Parent frame "${parentFrame.name || parentFrame.type}" is constrained to ${Math.round(parentFrame.width)}px, clipping text "${domItem.text}" (requires ${Math.round(domItem.visualRect.width)}px)!`,
          details: {
            expected: `Parent container width >= ${Math.round(domItem.visualRect.width + 4)}px`,
            actual: `Parent frame width is ${Math.round(parentFrame.width)}px (clipped by ${Math.round(domItem.visualRect.width - parentFrame.width)}px)`
          }
        });
      }

      // Check: Geometry & Position Shifts
      const parentDomWidth = domItem.parentRect?.width || 0;
      const parentDomHeight = domItem.parentRect?.height || 0;
      const isSameWidth = Math.abs(parentFrame.width - parentDomWidth) <= 50;
      const isSameHeight = Math.abs(parentFrame.height - parentDomHeight) <= 50;

      let geomPass = true;
      if (isSameWidth && domContained) {
        let figmaVisualX = figmaNode.x;
        const textWidth = domItem.visualRect.width || figmaNode.width;
        if (figmaNode.textAlignHorizontal === 'CENTER' && figmaNode.width > textWidth) {
          figmaVisualX = figmaNode.x + (figmaNode.width - textWidth) / 2;
        } else if (figmaNode.textAlignHorizontal === 'RIGHT' && figmaNode.width > textWidth) {
          figmaVisualX = figmaNode.x + (figmaNode.width - textWidth);
        }

        const deltaX = Math.abs(figmaVisualX - domItem.relativeVisualPos.x);
        const absDeltaX = Math.abs(matched.absRect.x - domItem.absRect.x);
        const isInlineOrUnified = domItem.isInlineInParagraph || isSplitAcrossSiblings || (matched.cleanText !== domItem.cleanText && matched.cleanText.includes(domItem.cleanText));
        if (deltaX > 25 && absDeltaX > 20 && !isInlineOrUnified) {
          geomPass = false;
          anomalies.push({
            severity: deltaX > 80 ? 'CRITICAL' : 'WARNING',
            category: 'GEOMETRY',
            type: 'HORIZONTAL_POSITION_SHIFT',
            message: `Horizontal shift of ${Math.round(deltaX)}px for "${domItem.text}"`,
            details: {
              expected: `DOM Relative X: ${domItem.relativeVisualPos.x}px`,
              actual: `Figma Relative X: ${Math.round(figmaVisualX)}px (Delta: ${Math.round(deltaX)}px)`,
              deltaX: Math.round(deltaX)
            }
          });
        }

        if (isSameHeight) {
          const deltaY = Math.abs(figmaNode.y - domItem.relativeVisualPos.y);
          const absDeltaY = Math.abs(matched.absRect.y - domItem.absRect.y);
          if (deltaY > 60 && Math.abs(figmaNode.y) > 0 && absDeltaY > 50 && !isInlineOrUnified) {
            geomPass = false;
            anomalies.push({
              severity: deltaY > 150 ? 'CRITICAL' : 'WARNING',
              category: 'GEOMETRY',
              type: 'VERTICAL_POSITION_SHIFT',
              message: `Vertical position shift of ${Math.round(deltaY)}px for "${domItem.text}"`,
              details: {
                expected: `DOM Relative Y: ${domItem.relativeVisualPos.y}px`,
                actual: `Figma Relative Y: ${Math.round(figmaNode.y)}px (Delta: ${Math.round(deltaY)}px)`,
                deltaY: Math.round(deltaY)
              }
            });
          }
        }

        const deltaH = Math.abs(figmaNode.height - domItem.visualRect.height);
        if (deltaH > 25 && domItem.visualRect.height > 20 && !isInlineOrUnified) {
          geomPass = false;
          anomalies.push({
            severity: deltaH > 50 ? 'CRITICAL' : 'WARNING',
            category: 'GEOMETRY',
            type: 'TEXT_HEIGHT_OVERFLOW',
            message: `Text height overflow / discrepancy for "${domItem.text}" (Expected ${Math.round(domItem.visualRect.height)}px, got Figma ${Math.round(figmaNode.height)}px)`,
            details: {
              expected: `DOM Height: ${Math.round(domItem.visualRect.height)}px`,
              actual: `Figma Height: ${Math.round(figmaNode.height)}px (Delta: ${Math.round(deltaH)}px)`,
              deltaH: Math.round(deltaH)
            }
          });
        }

        if (parentFrame && parentFrame.children) {
          for (const sib of parentFrame.children) {
            if (sib === figmaNode || sib._isRemoved || sib.visible === false) continue;
            const sName = (sib.name || '').toLowerCase();
            if (sName.includes('bg') || sName.includes('background') || sName.includes('mask') || sName.includes('outline') || sName.includes('border') || sName.includes('gradient')) continue;
            if (sib.y > figmaNode.y + 10 && (figmaNode.y + figmaNode.height) > (sib.y + 8) && (sib.type === 'FRAME' || sib.type === 'RECTANGLE' || sib.type === 'VECTOR')) {
              const hasHoriz = Math.min(figmaNode.x + figmaNode.width, sib.x + sib.width) - Math.max(figmaNode.x, sib.x) > 10;
              if (hasHoriz) {
                anomalies.push({
                  severity: 'CRITICAL',
                  category: 'LAYOUT_COLLISION',
                  type: 'TEXT_SIBLING_OVERFLOW_COLLISION',
                  message: `Text "${domItem.text}" overflows into sibling "${sib.name || sib.type}" by ${Math.round((figmaNode.y + figmaNode.height) - sib.y)}px!`,
                  details: {
                    textBounds: `y: ${Math.round(figmaNode.y)}, h: ${Math.round(figmaNode.height)} (bottom: ${Math.round(figmaNode.y + figmaNode.height)})`,
                    siblingBounds: `y: ${Math.round(sib.y)}, h: ${Math.round(sib.height)}`
                  }
                });
              }
            }
          }
        }
      }
      if (geomPass) textGeometryPassCount++;
    }

    // Check: Typography Fidelity (Font Size, Weight, Alignment)
    let typoPass = true;
    let matchCharIndex = 0;
    if (figmaNode.characters) {
      const searchTarget = cleanDom.toLowerCase().slice(0, 20);
      let idx = figmaNode.characters.toLowerCase().indexOf(searchTarget);
      if (idx === -1) {
        const bareToken = cleanDom.replace(/['"`\s]/g, '').toLowerCase();
        if (bareToken.length >= 2) {
          idx = figmaNode.characters.toLowerCase().indexOf(bareToken);
        }
      }
      if (idx !== -1) matchCharIndex = idx;
    }

    let expectedFontSize = domItem.fontSize;
    let expectedColor = domItem.domColor;
    let expectedWeight = domItem.fontWeight || 400;
    if (domItem.segments && domItem.segments.length > 0) {
      let runLen = 0;
      for (const seg of domItem.segments) {
        const segLen = (seg.text || '').replace(/\s+/g, ' ').length;
        if (matchCharIndex <= runLen + segLen) {
          expectedFontSize = seg.fontSize;
          expectedColor = seg.color;
          if (seg.fontWeight) expectedWeight = seg.fontWeight;
          break;
        }
        runLen += segLen;
      }
    }

    const figmaFs = (figmaNode.getFontSizeAt ? figmaNode.getFontSizeAt(matchCharIndex) : figmaNode.fontSize) || 16;
    if (Math.abs(figmaFs - expectedFontSize) >= 3 && expectedFontSize > 9 && !isInlineOrUnified) {
      typoPass = false;
      anomalies.push({
        severity: Math.abs(figmaFs - expectedFontSize) >= 6 ? 'CRITICAL' : 'WARNING',
        category: 'TYPOGRAPHY',
        type: 'FONT_SIZE_MISMATCH',
        message: `Font size discrepancy for "${domItem.text}" (Expected ${expectedFontSize}px, got ${figmaFs}px)`,
        details: {
          expected: `DOM Font Size: ${expectedFontSize}px`,
          actual: `Figma Font Size: ${figmaFs}px`
        }
      });
    }

    // Check: Font Weight Discrepancy
    const domWeight = expectedWeight;
    const figmaFont = (figmaNode.getFontNameAt ? figmaNode.getFontNameAt(matchCharIndex) : figmaNode.fontName) || figmaNode.fontName;
    const figmaWeight = parseWeightFromStyleOrName(figmaFont?.style) || 400;
    if ((domWeight >= 600 && figmaWeight <= 400) || (domWeight <= 400 && figmaWeight >= 700) || (domWeight >= 700 && figmaWeight <= 500)) {
      typoPass = false;
      anomalies.push({
        severity: 'WARNING',
        category: 'TYPOGRAPHY',
        type: 'FONT_WEIGHT_MISMATCH',
        message: `Font weight mismatch for "${domItem.text}" (Expected bold ${domWeight}, got ${figmaWeight})`,
        details: {
          expected: `DOM Weight: ${domWeight}`,
          actual: `Figma Style: ${figmaFont?.style || 'Regular'} (${figmaWeight})`
        }
      });
    }

    // Check: Line Height Fidelity
    if (domItem.lineHeight && figmaNode.lineHeight && figmaNode.lineHeight.unit === 'PIXELS') {
      const isSubRun = figmaNode.characters && figmaNode.characters.length > cleanDom.length + 5;
      if (!isSubRun) {
        const deltaLh = Math.abs(figmaNode.lineHeight.value - domItem.lineHeight);
        if (deltaLh >= 8 && domItem.lineHeight > 10) {
          typoPass = false;
          anomalies.push({
            severity: 'WARNING',
            category: 'TYPOGRAPHY',
            type: 'LINE_HEIGHT_MISMATCH',
            message: `Line height discrepancy for "${domItem.text}" (Expected ${Math.round(domItem.lineHeight)}px, got ${Math.round(figmaNode.lineHeight.value)}px)`,
            details: {
              expected: `DOM Line Height: ${Math.round(domItem.lineHeight)}px`,
              actual: `Figma Line Height: ${Math.round(figmaNode.lineHeight.value)}px`
            }
          });
        }
      }
    }

    // Check: Letter Spacing Fidelity
    if (domItem.letterSpacing !== null && typeof domItem.letterSpacing === 'number' && Math.abs(domItem.letterSpacing) >= 1) {
      const figmaLs = figmaNode.letterSpacing?.value || 0;
      if (Math.abs(figmaLs - domItem.letterSpacing) >= 1.5) {
        anomalies.push({
          severity: 'WARNING',
          category: 'TYPOGRAPHY',
          type: 'LETTER_SPACING_MISMATCH',
          message: `Letter spacing mismatch for "${domItem.text}" (Expected ${domItem.letterSpacing}px, got ${figmaLs}px)`,
          details: {
            expected: `DOM Letter Spacing: ${domItem.letterSpacing}px`,
            actual: `Figma Letter Spacing: ${figmaLs}px`
          }
        });
      }
    }

    // Check: Text Decoration (Strikethrough / Underline)
    const domStrikethrough = domItem.textDecoration && domItem.textDecoration.includes('line-through');
    const figmaStrikethrough = figmaNode.textDecoration === 'STRIKETHROUGH';
    if (domStrikethrough && !figmaStrikethrough) {
      anomalies.push({
        severity: 'WARNING',
        category: 'TYPOGRAPHY',
        type: 'TEXT_DECORATION_MISMATCH',
        message: `Missing strikethrough decoration on "${domItem.text}"`,
        details: {
          expected: 'DOM has line-through strikethrough',
          actual: 'Figma text decoration is none'
        }
      });
    }

    // Check: Button / Interactive Container Dimensions
    if (parentFrame && (['BUTTON', 'INPUT'].includes(domItem.tag) || (domItem.tag === 'A' && (parentFrame.name?.toLowerCase().includes('button') || parentFrame.name?.toLowerCase().includes('btn'))))) {
      const targetDomHeight = ['BUTTON', 'A', 'INPUT'].includes(domItem.tag)
        ? (domItem.elementRect?.height || domItem.visualRect.height)
        : (domItem.parentRect?.height || domItem.visualRect.height);
      if (targetDomHeight >= 25 && parentFrame.height > 0) {
        const deltaH = Math.abs(parentFrame.height - targetDomHeight);
        if (deltaH >= 16) {
          anomalies.push({
            severity: 'WARNING',
            category: 'GEOMETRY',
            type: 'BUTTON_DIMENSION_MISMATCH',
            message: `Button/Input "${domItem.text}" height mismatch (DOM: ${Math.round(targetDomHeight)}px, Figma: ${Math.round(parentFrame.height)}px)`,
            details: {
              expected: `DOM height: ${Math.round(targetDomHeight)}px`,
              actual: `Figma frame height: ${Math.round(parentFrame.height)}px`
            }
          });
        }
      }
    }

    const domAlign = domItem.textAlign.toUpperCase();
    const figmaAlign = figmaNode.textAlignHorizontal;
    if ((domAlign === 'CENTER' && figmaAlign !== 'CENTER') || (domAlign === 'RIGHT' && figmaAlign !== 'RIGHT')) {
      if (figmaNode.width > domItem.visualRect.width + 25) {
        typoPass = false;
        anomalies.push({
          severity: 'WARNING',
          category: 'TYPOGRAPHY',
          type: 'TEXT_ALIGN_MISMATCH',
          message: `Text alignment mismatch for "${domItem.text}" (Expected ${domAlign}, got ${figmaAlign})`,
          details: {
            expected: `DOM Text Align: ${domAlign}`,
            actual: `Figma Text Align: ${figmaAlign}`
          }
        });
      }
    }
    if (typoPass) typographyPassCount++;

    // Check: Color Fidelity & Contrast
    let colorPass = true;
    const figmaColor = figmaNode.getFillAt ? figmaNode.getFillAt(matchCharIndex) : figmaNode.fills?.find(f => f.type === 'SOLID')?.color;
    if (figmaColor) {
      let colDist = getColorDistance(figmaColor, expectedColor);
      if (colDist > 0.25 && domItem.overlappingColors && domItem.overlappingColors.length > 0) {
        for (const oc of domItem.overlappingColors) {
          const d = getColorDistance(figmaColor, oc);
          if (d < colDist) colDist = d;
        }
      }

      if (colDist > 0.25 && expectedColor.a > 0.4 && !isSplitAcrossSiblings) {
        colorPass = false;
        anomalies.push({
          severity: colDist > 0.5 ? 'CRITICAL' : 'WARNING',
          category: 'STYLING',
          type: 'COLOR_MISMATCH',
          message: `Text color discrepancy for "${domItem.text}"`,
          details: {
            expected: `DOM Color: rgb(${Math.round(expectedColor.r*255)}, ${Math.round(expectedColor.g*255)}, ${Math.round(expectedColor.b*255)})`,
            actual: `Figma Color: rgb(${Math.round(figmaColor.r*255)}, ${Math.round(figmaColor.g*255)}, ${Math.round(figmaColor.b*255)})`,
            colorDistance: Math.round(colDist * 100) / 100
          }
        });
      }
    }
    if (colorPass) colorPassCount++;
  }

  // 4.2 MEDIA & IMAGE AUDIT
  let mediaMatchedCount = 0;
  const topFigma = figmaMediaList.filter(fm => fm.absRect.y < 100);
  console.log(`🖼️ Total figma media indexed: ${figmaMediaList.length}, Top header media (<100px): ${topFigma.length}`);
  for (const media of domTruth.imageElements) {
    if (media.isSlider) continue;
    const match = figmaMediaList.find(fm => {
      const dx = Math.abs(fm.absRect.x - media.absRect.x);
      const dy = Math.abs(fm.absRect.y - media.absRect.y);
      const maxDy = Math.max(100, media.absRect.y * 0.025);
      if (dx <= 80 && dy <= maxDy) {
        if (media.hasGradient) return fm.isGradient;
        return true;
      }
      // If the DOM element is a container with a background image,
      // Figma may render it as a positioned child layer (e.g. bg-image with background-position) inside the container
      if (!media.hasGradient && (media.tag === 'SECTION' || media.tag === 'DIV' || media.tag === 'HEADER' || media.tag === 'FOOTER' || media.tag === 'SPAN' || media.tag === 'A')) {
        let p = fm.node?.parent;
        while (p && p.name !== 'document') {
          const pRect = getAbsoluteFigmaRect(p);
          if (Math.abs(pRect.x - media.absRect.x) <= 40 && Math.abs(pRect.y - media.absRect.y) <= 40) {
            return true;
          }
          p = p.parent;
        }
      }
      return false;
    });
    if (match) {
      mediaMatchedCount++;
      let p = match.node?.parent;
      const isBgPatternOrMask = (media.className && /(?:background-pattern|background-mask|awb-background|pattern|mask)/i.test(media.className)) ||
                                (p.name && /(?:background-pattern|background-mask|awb-background|pattern|mask)/i.test(p.name));
      if (p && p.clipsContent && !isBgPatternOrMask) {
        if (match.node.y < -2) {
          anomalies.push({
            severity: 'CRITICAL',
            category: 'GEOMETRY',
            type: 'MEDIA_TOP_CLIPPING_DECAPITATION',
            message: `Media/Avatar <${media.tag} class="${media.className || ''}"> top edge (${Math.round(match.node.y)}px) is chopped off / decapitated by parent frame with clipsContent enabled!`,
            details: {
              expected: 'Avatar/Media unclipped with clipsContent: false',
              actual: `Parent frame "${p.name || p.type}" has clipsContent=true, clipping top ${Math.round(-match.node.y)}px of media`
            }
          });
        }
        if (match.node.x < -2 || (match.node.x + match.node.width > p.width + 2 && p.width > 20)) {
          anomalies.push({
            severity: 'CRITICAL',
            category: 'GEOMETRY',
            type: 'MEDIA_CLIPPING_CUTOFF',
            message: `Media/Avatar <${media.tag} class="${media.className || ''}"> clipped horizontally by parent frame with clipsContent enabled!`,
            details: {
              expected: 'Unclipped media',
              actual: `Parent frame "${p.name || p.type}" has clipsContent=true`
            }
          });
        }
      }
    } else {
      anomalies.push({
        severity: 'WARNING',
        category: 'COVERAGE',
        type: media.hasGradient ? 'MISSING_GRADIENT_BACKGROUND' : 'MISSING_MEDIA_ELEMENT',
        message: `${media.hasGradient ? 'Background gradient' : 'Image or SVG graphic'} at (${media.absRect.x}, ${media.absRect.y}) was not found in Figma!`,
        details: {
          expected: `Visual media: ${media.tag} (${media.absRect.width}x${media.absRect.height}) ${media.hasGradient ? 'with radial/linear gradient' : ''}`,
          actual: 'No corresponding image, gradient fill, or vector layer found in Figma'
        }
      });
    }
  }

  // 4.3 CONTRAST & LEGIBILITY AUDIT
  for (const fn of createdNodes) {
    if (fn.type === 'TEXT' && fn.characters && fn.characters.trim()) {
      const textFill = fn.fills?.find(f => f.type === 'SOLID');
      let p = fn.parent;
      let parentFill = null;
      let hasImageFill = false;

      while (p && p.name !== 'document' && !parentFill) {
        const hasBgSibling = p.parent?.children?.some(c => 
          c !== p && (
            (c.name && (c.name.includes('background') || c.name.includes('bg-') || c.name.includes('picture') || c.name.includes('canvas') || c.name.includes('graphic'))) ||
            (c.fills && c.fills.some(f => f.type === 'IMAGE'))
          )
        );
        if (hasBgSibling || (p.fills && p.fills.some(f => f.type === 'IMAGE'))) {
          hasImageFill = true;
          break;
        }
        parentFill = p.fills?.find(f => f.type === 'SOLID');
        p = p.parent;
      }

      if (hasImageFill) continue;

      if (textFill && parentFill) {
        const op = parentFill.opacity !== undefined ? parentFill.opacity : 1;
        const baseRgb = { r: 1, g: 1, b: 1 };
        const bgRgb = {
          r: parentFill.color.r * op + baseRgb.r * (1 - op),
          g: parentFill.color.g * op + baseRgb.g * (1 - op),
          b: parentFill.color.b * op + baseRgb.b * (1 - op)
        };

        const ratio = getContrastRatio(textFill.color, bgRgb);

        if (ratio < 2.0 && fn.opacity > 0.05) {
          const cleanFigma = fn.characters.replace(/\s+/g, ' ').trim().toLowerCase();
          const matchedDom = domTruth.textElements.find(d => {
            const dClean = d.cleanText.toLowerCase();
            return dClean === cleanFigma || (cleanFigma.length >= 4 && (dClean.includes(cleanFigma) || cleanFigma.includes(dClean)));
          });

          const isDomLowContrast = matchedDom && matchedDom.domContrast < 2.0;
          const isFidelityMatch = matchedDom && Math.abs(ratio - matchedDom.domContrast) <= 0.35;

          if (isDomLowContrast || isFidelityMatch) {
            continue;
          }

          anomalies.push({
            severity: 'CRITICAL',
            category: 'STYLING',
            type: 'LOW_CONTRAST',
            message: `Text "${fn.characters.slice(0, 30)}" has unreadable low contrast (${ratio.toFixed(2)}:1) against parent background!`,
            details: {
              expected: `Legible contrast >= 3:1 (DOM had ${matchedDom ? matchedDom.domContrast + ':1' : 'good contrast'})`,
              actual: `Contrast collapsed to ${ratio.toFixed(2)}:1`,
              textColor: `rgb(${Math.round(textFill.color.r*255)}, ${Math.round(textFill.color.g*255)}, ${Math.round(textFill.color.b*255)})`,
              parentBg: `rgb(${Math.round(bgRgb.r*255)}, ${Math.round(bgRgb.g*255)}, ${Math.round(bgRgb.b*255)})`
            }
          });
        }
      }
    }
  }

  // 4.3 SIBLING COLLISION AUDIT (Detects text overlapping sibling icons, badges, or pseudo-elements)
  for (const fn of createdNodes) {
    if (fn.type === 'FRAME' && fn.children && fn.children.length > 1) {
      for (let i = 0; i < fn.children.length; i++) {
        const c1 = fn.children[i];
        if (c1.type !== 'TEXT' || !c1.characters || !c1.characters.trim()) continue;
        for (let j = 0; j < fn.children.length; j++) {
          if (i === j) continue;
          const c2 = fn.children[j];
          const sName = (c2.name || '').toLowerCase();
          if (sName.includes('bg') || sName.includes('background') || sName.includes('mask') || sName.includes('outline') || sName.includes('border') || sName.includes('gradient')) continue;
          if (c2.width >= fn.width - 4 && c2.height >= fn.height - 4) continue;
          const isIconOrMedia = c2.name?.includes('icon') || c2.name?.includes('before') || c2.name?.includes('after') ||
            c2.type === 'VECTOR' || c2.type === 'RECTANGLE' || c2.fills?.some(f => f.type === 'IMAGE');
          if (!isIconOrMedia) continue;

          // Check 2D bounding box intersection
          const xOverlap = Math.min(c1.x + c1.width, c2.x + c2.width) - Math.max(c1.x, c2.x);
          const yOverlap = Math.min(c1.y + c1.height, c2.y + c2.height) - Math.max(c1.y, c2.y);
          if (xOverlap > 4 && yOverlap > 4) {
            const cleanText = c1.characters.replace(/\s+/g, ' ').trim();
            const matchedDom = domTruth.textElements.find(d => d.cleanText === cleanText);
            const domRelativeX = matchedDom ? matchedDom.relativeVisualPos.x : null;
            if (domRelativeX === null || domRelativeX >= c2.width - 2) {
              anomalies.push({
                severity: 'CRITICAL',
                category: 'GEOMETRY',
                type: 'SIBLING_OVERLAP_COLLISION',
                message: `Text "${c1.characters}" overlaps sibling ${c2.name || c2.type} inside container "${fn.name || 'frame'}"!`,
                details: {
                  expected: `Text positioned beside icon (DOM offset X: ${domRelativeX !== null ? Math.round(domRelativeX) + 'px' : 'distinct'})`,
                  actual: `Figma text at X: ${Math.round(c1.x)}px collides with ${c2.name || c2.type} at X: ${Math.round(c2.x)}px (w: ${c2.width}px)`,
                  overlapPixels: Math.round(xOverlap)
                }
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate anomalies
  const seen = new Set();
  const uniqueAnomalies = [];
  for (const a of anomalies) {
    const key = `${a.type}|${(a.message || '').slice(0, 35)}|${JSON.stringify(a.details || {})}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueAnomalies.push(a);
    }
  }

  // Sort: CRITICAL first, then highest overflow / delta
  uniqueAnomalies.sort((a, b) => {
    if (a.severity === 'CRITICAL' && b.severity !== 'CRITICAL') return -1;
    if (b.severity === 'CRITICAL' && a.severity !== 'CRITICAL') return 1;
    return (b.details?.overflowPixels || b.details?.deltaX || 0) - (a.details?.overflowPixels || a.details?.deltaX || 0);
  });

  // 5. Compute Quantitative Fidelity Scores (0 - 100%)
  const checkableElements = domTruth.textElements.filter(e => !e.isSliderChild && e.text && e.text.length >= 2);
  const totalCheckable = checkableElements.length || 1;
  const coverageRate = Math.min(100, Math.round((textMatchedCount / totalCheckable) * 100));
  const geometryRate = Math.min(100, Math.round((textGeometryPassCount / Math.max(1, textMatchedCount)) * 100));
  const typographyRate = Math.min(100, Math.round((typographyPassCount / Math.max(1, textMatchedCount)) * 100));
  const stylingRate = Math.min(100, Math.round((colorPassCount / Math.max(1, textMatchedCount)) * 100));

  const criticalCount = uniqueAnomalies.filter(a => a.severity === 'CRITICAL').length;
  const warningCount = uniqueAnomalies.filter(a => a.severity === 'WARNING').length;

  // Composite Fidelity Score (Weighted Index)
  let compositeScore = Math.round(
    (coverageRate * 0.35) +
    (geometryRate * 0.30) +
    (typographyRate * 0.20) +
    (stylingRate * 0.15)
  );
  if (criticalCount > 0) {
    compositeScore = Math.max(0, compositeScore - (criticalCount * 5));
  }

  // 6. Generate Interactive HTML Report
  const reportHtml = generateHtmlReport(
    targetUrl,
    screenshotName,
    uniqueAnomalies,
    createdNodes.length,
    domTruth.textElements.length,
    {
      compositeScore,
      coverageRate,
      geometryRate,
      typographyRate,
      stylingRate,
      mediaCount: domTruth.imageElements.length,
      mediaMatched: mediaMatchedCount
    }
  );

  const reportFilePath = path.join(REPORT_DIR, 'audit_report.html');
  fs.writeFileSync(reportFilePath, reportHtml, 'utf8');

  // Terminal Summary
  console.log(`\n======================================================`);
  console.log(`📊 [360° AUDIT RESULT] ${criticalCount === 0 ? '✅ PASSED — CLEAN HIGH-FIDELITY CONVERSION' : `❌ DEFECTS DETECTED — ${uniqueAnomalies.length} ISSUES FOUND`}`);
  console.log(`======================================================`);
  console.log(`Overall Visual Fidelity Index: ${compositeScore}% / 100%`);
  console.log(`  ├── Element Coverage:        ${coverageRate}% (${textMatchedCount}/${domTruth.textElements.length} text elements)`);
  console.log(`  ├── Geometric Accuracy:      ${geometryRate}% aligned`);
  console.log(`  ├── Typography Fidelity:     ${typographyRate}% matched`);
  console.log(`  └── Color & Style Fidelity:  ${stylingRate}% matched`);
  console.log(`Total DOM Elements Checked:    ${domTruth.textElements.length}`);
  console.log(`Total Figma Nodes Rendered:    ${createdNodes.length}`);
  console.log(`Critical Defects Found:        ${criticalCount}`);
  console.log(`Warnings Found:                ${warningCount}`);

  if (uniqueAnomalies.length > 0) {
    console.log(`\n🚨 Detected Discrepancies:`);
    for (const a of uniqueAnomalies.slice(0, 12)) {
      console.log(`  [${a.severity}] [${a.category}] ${a.type}: ${a.message}`);
      if (a.details?.expected) console.log(`     ↳ Expected: ${a.details.expected}`);
      if (a.details?.actual) console.log(`     ↳ Actual:   ${a.details.actual}`);
    }
  }

  console.log(`\n📄 Detailed Interactive HTML Report Generated at:`);
  console.log(`   ${reportFilePath}\n`);

  return {
    passed: criticalCount === 0,
    compositeScore,
    anomalies: uniqueAnomalies,
    reportPath: reportFilePath
  };
}

function generateHtmlReport(url, screenshotName, anomalies, figmaCount, domCount, scores) {
  const criticalCount = anomalies.filter(a => a.severity === 'CRITICAL').length;
  const warningCount = anomalies.filter(a => a.severity === 'WARNING').length;
  const statusColor = criticalCount === 0 ? '#10b981' : '#ef4444';
  const statusText = criticalCount === 0 ? 'PASSED — HIGH FIDELITY' : 'DEFECTS FOUND';

  const rows = anomalies.map(a => `
    <tr class="${a.severity.toLowerCase()}">
      <td><span class="badge ${a.severity.toLowerCase()}">${a.severity}</span></td>
      <td><span class="category-tag">${a.category || 'GENERAL'}</span></td>
      <td><code>${a.type}</code></td>
      <td><strong>${escapeHtml(a.message)}</strong></td>
      <td class="details-col">
        ${a.details?.expected ? `<div><span class="label">Expected:</span> <code>${escapeHtml(String(a.details.expected))}</code></div>` : ''}
        ${a.details?.actual ? `<div><span class="label">Actual:</span> <code>${escapeHtml(String(a.details.actual))}</code></div>` : ''}
        ${a.details?.domPosition ? `<div><span class="label">DOM Pos:</span> <code>${escapeHtml(a.details.domPosition)}</code></div>` : ''}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HTML-2-Fig 360° Visual Fidelity Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; margin: 0; padding: 32px 24px; }
    .container { max-width: 1300px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 28px; }
    h1 { margin: 0; font-size: 26px; display: flex; align-items: center; gap: 12px; }
    .url { color: #94a3b8; font-size: 14px; margin-top: 6px; word-break: break-all; }
    
    .score-banner { display: grid; grid-template-columns: 260px 1fr; gap: 24px; background: #131c2e; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 28px; }
    .score-circle { display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid #1e293b; padding-right: 24px; }
    .score-circle .val { font-size: 54px; font-weight: 800; color: ${scores.compositeScore >= 95 ? '#10b981' : scores.compositeScore >= 80 ? '#fbbf24' : '#ef4444'}; }
    .score-circle .lbl { font-size: 13px; color: #94a3b8; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
    
    .subscores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: center; }
    .subcard { background: #0b0f19; padding: 14px 18px; border-radius: 8px; border: 1px solid #243048; }
    .subcard .sublbl { font-size: 12px; color: #94a3b8; margin-bottom: 6px; }
    .subcard .subval { font-size: 24px; font-weight: bold; color: #f8fafc; }
    
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
    .card { background: #131c2e; border-radius: 8px; padding: 18px; border: 1px solid #1e293b; }
    .card .num { font-size: 28px; font-weight: bold; margin-top: 4px; }
    
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge.critical { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
    .badge.warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
    .category-tag { background: #1e293b; color: #38bdf8; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    
    table { width: 100%; border-collapse: collapse; background: #131c2e; border-radius: 8px; overflow: hidden; border: 1px solid #1e293b; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #1e293b; font-size: 14px; }
    th { background: #0b0f19; color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: 600; }
    code { background: #0b0f19; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; }
    .details-col .label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; margin-right: 4px; }
    
    .screenshot-box { margin-top: 36px; background: #131c2e; padding: 20px; border-radius: 12px; border: 1px solid #1e293b; }
    .screenshot-box img { max-width: 100%; border-radius: 6px; border: 1px solid #334155; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>HTML-2-Fig 360° Visual Fidelity Audit <span class="badge" style="background:${statusColor};color:#fff;">${statusText}</span></h1>
        <div class="url">Target URL: <a href="${escapeHtml(url)}" target="_blank" style="color:#38bdf8;">${escapeHtml(url)}</a></div>
      </div>
      <div style="color:#94a3b8;font-size:14px;">${new Date().toLocaleString()}</div>
    </div>

    <div class="score-banner">
      <div class="score-circle">
        <div class="val">${scores.compositeScore}%</div>
        <div class="lbl">Fidelity Index</div>
      </div>
      <div class="subscores">
        <div class="subcard">
          <div class="sublbl">Coverage Rate</div>
          <div class="subval" style="color:#38bdf8;">${scores.coverageRate}%</div>
        </div>
        <div class="subcard">
          <div class="sublbl">Geometry Accuracy</div>
          <div class="subval" style="color:#10b981;">${scores.geometryRate}%</div>
        </div>
        <div class="subcard">
          <div class="sublbl">Typography Fidelity</div>
          <div class="subval" style="color:#a855f7;">${scores.typographyRate}%</div>
        </div>
        <div class="subcard">
          <div class="sublbl">Style & Color Accuracy</div>
          <div class="subval" style="color:#f59e0b;">${scores.stylingRate}%</div>
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="card">
        <div style="color:#94a3b8;font-size:12px;">CRITICAL DEFECTS</div>
        <div class="num" style="color:#ef4444;">${criticalCount}</div>
      </div>
      <div class="card">
        <div style="color:#94a3b8;font-size:12px;">WARNINGS</div>
        <div class="num" style="color:#f59e0b;">${warningCount}</div>
      </div>
      <div class="card">
        <div style="color:#94a3b8;font-size:12px;">DOM ELEMENTS CHECKED</div>
        <div class="num" style="color:#38bdf8;">${domCount}</div>
      </div>
      <div class="card">
        <div style="color:#94a3b8;font-size:12px;">FIGMA NODES CREATED</div>
        <div class="num" style="color:#10b981;">${figmaCount}</div>
      </div>
    </div>

    ${anomalies.length > 0 ? `
    <h2 style="margin: 28px 0 16px 0;">🚨 Detected Discrepancies & Anomalies (${anomalies.length})</h2>
    <table>
      <thead>
        <tr>
          <th style="width:90px;">Severity</th>
          <th style="width:110px;">Category</th>
          <th style="width:200px;">Anomaly Type</th>
          <th>Description</th>
          <th>Expected vs Actual</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ` : `
    <div style="background:#131c2e;padding:36px;border-radius:12px;text-align:center;border:1px solid #10b981;margin-bottom:28px;">
      <h2 style="color:#10b981;margin:0 0 8px 0;">🎉 100% Clean Layout! No Visual, Geometric, or Styling Anomalies</h2>
      <p style="color:#94a3b8;margin:0;">Every single DOM element faithfully converted: no coordinate drift, no dropped layers, no unreadable contrast, and no word collisions.</p>
    </div>
    `}

    <div class="screenshot-box">
      <h3 style="margin:0 0 6px 0;">📸 Ground-Truth Page Viewport</h3>
      <div style="color:#94a3b8;font-size:13px;">Live browser rendering used as the ground-truth benchmark for geometry and styling.</div>
      <img src="${screenshotName}" alt="Page Viewport Screenshot" />
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// CLI entry point
if (require.main === module) {
  let targetUrl = process.argv[2] || 'https://stripe.com/';
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('file://')) {
    const resolved = path.resolve(targetUrl);
    if (fs.existsSync(resolved)) {
      targetUrl = 'file://' + resolved.replace(/\\/g, '/');
    }
  }
  auditUrl(targetUrl).catch(err => {
    console.error('Audit crashed with error:', err);
    process.exit(1);
  });
}

module.exports = { auditUrl, createFigmaMock, getAbsoluteFigmaRect };
