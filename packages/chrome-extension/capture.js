/*
 * HTML 2 Fig — High-Fidelity Capture Engine
 * Captures document.body directly (preventing duplicated HEAD/HTML rendering),
 * pre-scrolls to activate lazy sections, and serializes clean DOM trees.
 */
;(async function html2FigCapture() {
  'use strict';

  if (window.__html2FigRunning) return;
  window.__html2FigRunning = true;

  const FETCH_TIMEOUT = 15000;
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;

  /* ======================================================================
   *  1.  CSS DEFAULTS MAP
   * ====================================================================== */
  const CSS_DEFAULTS = {
    alignContent: 'normal', alignItems: 'normal', alignSelf: 'auto',
    aspectRatio: 'auto', backdropFilter: 'none', backgroundAttachment: 'scroll',
    backgroundBlendMode: 'normal', backgroundClip: 'border-box', webkitBackgroundClip: 'border-box',
    backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
    backgroundOrigin: 'padding-box', backgroundPosition: '0% 0%', backgroundPositionX: '0%', backgroundPositionY: '0%',
    backgroundRepeat: 'repeat', backgroundSize: 'auto', borderBottomColor: 'rgb(0, 0, 0)',
    borderBottomLeftRadius: '0px', borderBottomRightRadius: '0px', borderBottomStyle: 'none',
    borderBottomWidth: '0px', borderCollapse: 'separate', borderImageOutset: '0',
    borderImageRepeat: 'stretch', borderImageSlice: '100%', borderImageSource: 'none',
    borderImageWidth: '1', borderLeftColor: 'rgb(0, 0, 0)', borderLeftStyle: 'none',
    borderLeftWidth: '0px', borderRightColor: 'rgb(0, 0, 0)', borderRightStyle: 'none',
    borderRightWidth: '0px', borderSpacing: '0px', borderTopColor: 'rgb(0, 0, 0)',
    borderTopLeftRadius: '0px', borderTopRightRadius: '0px', borderTopStyle: 'none',
    borderTopWidth: '0px', bottom: 'auto', boxShadow: 'none', boxSizing: 'content-box',
    clear: 'none', clip: 'auto', clipPath: 'none', clipRule: 'nonzero',
    color: 'rgb(0, 0, 0)', colorScheme: 'normal', columnGap: 'normal',
    display: '', filter: 'none', flexBasis: 'auto', flexDirection: 'row',
    flexGrow: '0', flexShrink: '1', flexWrap: 'nowrap', float: 'none',
    fontFamily: 'Times', fontSize: '16px', fontStretch: '100%',
    fontStyle: 'normal', fontWeight: '400', gridAutoColumns: 'auto',
    gridAutoFlow: 'row', gridAutoRows: 'auto', height: 'auto',
    isolation: 'auto', justifyContent: 'normal', justifyItems: 'normal',
    left: 'auto', letterSpacing: 'normal', lineHeight: 'normal',
    marginBottom: '0px', marginLeft: '0px', marginRight: '0px', marginTop: '0px',
    maxHeight: 'none', maxWidth: 'none', minHeight: 'auto', minWidth: 'auto',
    mixBlendMode: 'normal', objectFit: 'fill', opacity: '1', order: '0',
    outlineColor: 'rgb(0, 0, 0)', outlineOffset: '0px', outlineStyle: 'none',
    outlineWidth: '0px', overflow: 'visible', overflowX: 'visible', overflowY: 'visible',
    position: 'static', paddingBottom: '0px', paddingLeft: '0px',
    paddingRight: '0px', paddingTop: '0px', quotes: 'auto', right: 'auto',
    rowGap: 'normal', textAlign: 'start', textDecorationColor: 'rgb(0, 0, 0)',
    textDecorationLine: 'none', textDecorationStyle: 'solid', textIndent: '0px',
    textShadow: 'none', textTransform: 'none', top: 'auto',
    transform: 'none', transformOrigin: 'auto', translate: 'none',
    filter: 'none', webkitFilter: 'none', backdropFilter: 'none', webkitBackdropFilter: 'none', maskImage: 'none',
    rotate: 'none', scale: 'none', verticalAlign: 'baseline',
    visibility: 'visible', webkitTextFillColor: '', whiteSpace: 'normal',
    width: 'auto', writingMode: 'horizontal-tb', zIndex: 'auto', clipPath: 'none'
  };

  /* ======================================================================
   *  2.  IN-PAGE TOAST NOTIFICATION
   * ====================================================================== */
  function showToast(message, duration) {
    const host = document.createElement('div');
    host.style.cssText = 'all:initial; position:fixed; z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          background: #1e1e1e; color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px; font-weight: 500; padding: 12px 22px; border-radius: 10px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12);
          display: flex; align-items: center; gap: 8px; z-index: 2147483647; pointer-events: auto;
          animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      </style>
      <div class="toast">${message}</div>
    `;
    document.documentElement.appendChild(host);
    if (duration) setTimeout(() => { try { host.remove(); } catch {} }, duration);
    return host;
  }

  /* ======================================================================
   *  3.  PAGE PRE-SCROLLER (Triggers lazy-loaded images & animations)
   * ====================================================================== */
  async function prepareAndScrollPage() {
    const style = document.createElement('style');
    style.id = 'h2f-scroll-fix';
    style.innerHTML = 'html, body { scroll-behavior: auto !important; }';
    document.head.appendChild(style);

    let scrollHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    
    // Smooth scroll (approx ~2000px per second)
    const step = 32; // 32px per step
    const delay = 16; // ~60fps

    for (let y = 0; y < scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, delay));
      scrollHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    }
    
    window.scrollTo(0, scrollHeight);
    await new Promise(r => setTimeout(r, 600));
    
    // Smoothly return to top at a moderate speed
    for (let y = scrollHeight; y > 0; y -= (step * 8)) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 16));
    }

    // Always restore exactly to top (0, 0) for DOM serialization
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 200));

    // Automatically defeat scroll-linked animations
    const animKiller = document.createElement('style');
    animKiller.id = 'h2f-animation-killer';
    animKiller.innerHTML = `* { transition: none !important; animation: none !important; }`;
    document.head.appendChild(animKiller);
  }

  /* ======================================================================
   *  4.  UNIVERSAL ASSET & IMAGE CONVERTER
   * ====================================================================== */
  async function convertToPngBlob(blob) {
    if (!blob) return null;
    
    // Preserve SVGs as vectors; never convert to PNG
    if (blob.type === 'image/svg+xml' || blob.type === 'text/xml' || blob.type === 'image/svg') {
      return blob;
    }
    try {
      const buffer = await blob.slice(0, 60).arrayBuffer();
      const prefix = new TextDecoder('utf-8').decode(buffer).toLowerCase();
      if (prefix.includes('<svg') || prefix.includes('<?xml')) {
        return blob;
      }
    } catch {}

    const MAX_SIZE = 4000; // Keep safely under Figma's 4096 absolute limit

    try {
      if (typeof createImageBitmap === 'function') {
        const bmp = await createImageBitmap(blob);
        const isOversized = bmp.width > MAX_SIZE || bmp.height > MAX_SIZE;
        
        // Check magic bytes because CDNs often lie and serve WebP/AVIF with image/jpeg headers
        const buffer = await blob.slice(0, 16).arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const isWebP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && 
                       bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // RIFF....WEBP
        const isAvif = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
                       bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66; // ftypavif
        
        const isSafeFormat = !isWebP && !isAvif && blob.type !== 'image/svg+xml' && (blob.type === 'image/png' || blob.type === 'image/jpeg' || blob.type === 'image/gif');

        if (!isOversized && isSafeFormat) {
          return blob; // Safe to return directly!
        }
        
        // Otherwise, draw to canvas (downscaling if needed, and converting format to PNG)
        const c = document.createElement('canvas');
        let drawWidth = bmp.width;
        let drawHeight = bmp.height;
        if (drawWidth > MAX_SIZE || drawHeight > MAX_SIZE) {
          const ratio = Math.min(MAX_SIZE / drawWidth, MAX_SIZE / drawHeight);
          drawWidth = Math.floor(drawWidth * ratio);
          drawHeight = Math.floor(drawHeight * ratio);
        }
        c.width = drawWidth || 1;
        c.height = drawHeight || 1;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(bmp, 0, 0, drawWidth, drawHeight);
          return new Promise(resolve => c.toBlob(resolve, 'image/png'));
        }
      }
    } catch {}

    // Fallback if createImageBitmap is not supported
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const isOversized = img.width > MAX_SIZE || img.height > MAX_SIZE;
          const buffer = await blob.slice(0, 16).arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const isWebP = bytes[0] === 0x52 && bytes[2] === 0x46; // simplified check
          const isSafeFormat = !isWebP && (blob.type === 'image/png' || blob.type === 'image/jpeg');

          if (!isOversized && isSafeFormat) {
            resolve(blob);
            return;
          }

          const c = document.createElement('canvas');
          let drawWidth = img.width;
          let drawHeight = img.height;
          if (drawWidth > MAX_SIZE || drawHeight > MAX_SIZE) {
            const ratio = Math.min(MAX_SIZE / drawWidth, MAX_SIZE / drawHeight);
            drawWidth = Math.floor(drawWidth * ratio);
            drawHeight = Math.floor(drawHeight * ratio);
          }
          c.width = drawWidth || 1;
          c.height = drawHeight || 1;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
          c.toBlob(b => resolve(b), 'image/png');
        } catch {
          resolve(blob);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      img.src = url;
    });
  }

  function blobToBase64(blob) {
    if (!blob) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: blob.type, data: reader.result });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function rasterizeCanvas(cv) {
    try {
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      if (blob) return blobToBase64(blob);
    } catch {}
    try {
      const dataUrl = cv.toDataURL('image/png');
      return { type: 'image/png', data: dataUrl };
    } catch {
      return null;
    }
  }

  async function rasterizeVideo(video) {
    try {
      if (video.videoWidth === 0 || video.videoHeight === 0) return null;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      return blob ? blobToBase64(blob) : null;
    } catch {
      return null;
    }
  }

  async function fetchImage(url) {
    if (!url) return null;
    let absoluteUrl = url;
    try {
      absoluteUrl = new URL(url, document.baseURI).href;
    } catch {}

    // Method 1: Direct fetch in page context
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res = await fetch(absoluteUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        let blob = await res.blob();
        blob = await convertToPngBlob(blob);
        const b64 = await blobToBase64(blob);
        if (b64 && b64.data) return { url: absoluteUrl, blob: b64 };
      }
    } catch {}

    // Method 2: Extension background worker fetch (bypasses CORS restrictions)
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const bgRes = await new Promise((res) => {
          chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: absoluteUrl }, (resp) => {
            if (chrome.runtime.lastError) res(null);
            else res(resp);
          });
        });
        if (bgRes && bgRes.data) {
          try {
            const res = await fetch(bgRes.data);
            let blob = await res.blob();
            blob = await convertToPngBlob(blob);
            const b64 = await blobToBase64(blob);
            if (b64 && b64.data) return { url: absoluteUrl, blob: b64 };
          } catch {
            return { url: absoluteUrl, blob: { type: 'image/png', data: bgRes.data } };
          }
        }
      }
    } catch {}

    // Method 3: HTMLImageElement + Canvas draw fallback
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 1;
          c.height = img.naturalHeight || 1;
          const ctx = c.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0);
          c.toBlob(b => {
            blobToBase64(b).then(b64 => resolve({ url: absoluteUrl, blob: b64 })).catch(() => resolve({ url: absoluteUrl, blob: null }));
          }, 'image/png');
        } catch {
          resolve({ url: absoluteUrl, blob: null });
        }
      };
      img.onerror = () => resolve({ url: absoluteUrl, blob: null });
      img.src = absoluteUrl;
    });
  }

  class AssetCollector {
    constructor() {
      this.promises = new Map();
      this.rasterizedId = 0;
    }
    addImage(url) {
      if (!url) return;
      let absoluteUrl = url;
      try {
        absoluteUrl = new URL(url, document.baseURI).href;
      } catch {}
      if (this.promises.has(absoluteUrl)) return;
      this.promises.set(absoluteUrl, fetchImage(absoluteUrl));
      if (url !== absoluteUrl) {
        this.promises.set(url, this.promises.get(absoluteUrl));
      }
    }
    addCanvas(canvas) {
      const id = `rasterized:canvas:${++this.rasterizedId}`;
      this.promises.set(id, rasterizeCanvas(canvas).then(blob => ({ url: id, blob })));
      return id;
    }
    addVideo(video) {
      const id = `rasterized:video:${++this.rasterizedId}`;
      this.promises.set(id, rasterizeVideo(video).then(blob => ({ url: id, blob })));
      return id;
    }
    async getBlobMap() {
      const map = {};
      for (const [url, p] of this.promises.entries()) {
        try {
          const res = await p;
          if (res && res.blob) map[url] = res;
        } catch {}
      }
      return map;
    }
  }

  /* ======================================================================
   *  5.  FONT COLLECTOR
   * ====================================================================== */
  class FontCollector {
    constructor() {
      this.families = new Set();
    }
    addFont(family) {
      if (!family) return;
      const clean = family.replace(/['"]/g, '').split(',')[0].trim();
      if (clean) this.families.add(clean);
    }
    getFonts() {
      return Array.from(this.families);
    }
  }

  /* ======================================================================
   *  6.  DOM TRAVERSAL (Clean Element-by-Element)
   * ====================================================================== */
  let nodeCounter = 0;
  function getNodeId(prefix = 'h2f') { return `${prefix}-node-${++nodeCounter}`; }

  // Memoized Canvas-based color normalizer
  const colorCache = new Map();
  let colorCanvas = null, colorCtx = null;
  function normalizeColor(cssColor) {
    if (!cssColor || cssColor === 'none' || cssColor === 'transparent') return 'rgba(0, 0, 0, 0)';
    if (cssColor.startsWith('rgba') || (cssColor.startsWith('rgb(') && cssColor.includes(',')) || cssColor.startsWith('#')) return cssColor;
    if (colorCache.has(cssColor)) return colorCache.get(cssColor);
    
    if (!colorCanvas) {
      colorCanvas = document.createElement('canvas');
      colorCanvas.width = 1;
      colorCanvas.height = 1;
      colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
    }
    
    colorCtx.fillStyle = '#123456';
    colorCtx.fillStyle = cssColor;
    if (colorCtx.fillStyle === '#123456' && cssColor !== '#123456') {
      return cssColor;
    }

    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillRect(0, 0, 1, 1);
    const data = colorCtx.getImageData(0, 0, 1, 1).data;
    const rgba = 'rgba(' + data[0] + ', ' + data[1] + ', ' + data[2] + ', ' + (data[3] / 255) + ')';
    colorCache.set(cssColor, rgba);
    return rgba;
  }

  function getElementStyles(el) {
    const cs = window.getComputedStyle(el);
    const styles = {};

    // Helper to convert complex color functions to rgba using the canvas
    const convertColors = (str) => {
      if (!str || typeof str !== 'string') return str;
      if (!str.includes('okl') && !str.includes('lab') && !str.includes('lch') && !str.includes('color(')) return str;
      return str.replace(/(?:oklch|oklab|lab|lch|color)\([^)]+\)/g, match => {
        const normalized = normalizeColor(match);
        return normalized !== match ? normalized : match;
      });
    };

    for (const [prop, defVal] of Object.entries(CSS_DEFAULTS)) {
      const val = cs[prop];
      if (val !== undefined && val !== defVal && val !== '') {
        styles[prop] = convertColors(val);
      }
    }
    styles.fontFamily = cs.fontFamily;
    styles.fontSize = cs.fontSize;
    styles.fontWeight = cs.fontWeight;
    styles.fontStyle = cs.fontStyle;
    styles.color = convertColors(cs.color);
    styles.webkitTextFillColor = convertColors(cs.webkitTextFillColor || cs.color);
    styles.lineHeight = cs.lineHeight;
    styles.letterSpacing = cs.letterSpacing;
    styles.textAlign = cs.textAlign;
    styles.textTransform = cs.textTransform;
    styles.textDecoration = cs.textDecoration;
    styles.textDecorationLine = cs.textDecorationLine;

    const isLink = el.tagName === 'A' || !!el.closest('a');
    if (isLink) {
      const aEl = el.tagName === 'A' ? el : el.closest('a');
      const aCs = aEl ? window.getComputedStyle(aEl) : cs;
      const aDec = (aCs.textDecorationLine || aCs.textDecoration || '').toLowerCase();
      const hasBorderUnderline = parseFloat(aCs.borderBottomWidth) > 0 && aCs.borderBottomStyle !== 'none';
      if (aDec.includes('underline') || hasBorderUnderline) {
        styles.textDecorationLine = 'underline';
      }
    }

    // Capture effective CSS filter (including ancestor invert filters for SVGs)
    styles.filter = cs.filter || 'none';
    if (!styles.filter || styles.filter === 'none') {
      let p = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const pf = window.getComputedStyle(p).filter;
        if (pf && pf !== 'none' && pf.includes('invert')) {
          styles.filter = pf;
          break;
        }
        p = p.parentElement;
      }
    }
    // Always capture background and border radius for frame fills
    styles.backgroundColor = cs.backgroundColor;
    styles.backgroundPosition = cs.backgroundPosition;
    styles.backgroundPositionX = cs.backgroundPositionX;
    styles.backgroundPositionY = cs.backgroundPositionY;
    styles.backgroundSize = cs.backgroundSize;
    styles.borderRadius = cs.borderRadius;
    styles.borderTopLeftRadius = cs.borderTopLeftRadius;
    styles.borderTopRightRadius = cs.borderTopRightRadius;
    styles.borderBottomRightRadius = cs.borderBottomRightRadius;
    styles.borderBottomLeftRadius = cs.borderBottomLeftRadius;
    styles.borderTopStyle = cs.borderTopStyle;
    styles.borderBottomStyle = cs.borderBottomStyle;
    styles.borderLeftStyle = cs.borderLeftStyle;
    styles.borderRightStyle = cs.borderRightStyle;
    styles.borderTopWidth = cs.borderTopWidth;
    styles.borderBottomWidth = cs.borderBottomWidth;
    styles.borderLeftWidth = cs.borderLeftWidth;
    styles.borderRightWidth = cs.borderRightWidth;
    styles.borderTopColor = cs.borderTopColor;
    styles.borderBottomColor = cs.borderBottomColor;
    styles.borderLeftColor = cs.borderLeftColor;
    styles.borderRightColor = cs.borderRightColor;

    return styles;
  }

  function getAttributes(el) {
    const attrs = {};
    if (!el.attributes) return attrs;
    const allowed = ['id', 'class', 'src', 'currentSrc', 'srcset', 'data-src', 'alt', 'href', 'type', 'placeholder', 'value', 'aria-label'];
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      if (allowed.includes(name) || name.startsWith('aria-') || name.startsWith('data-')) {
        attrs[attr.name] = attr.value;
      }
    }
    if (el instanceof HTMLImageElement) {
      if (el.currentSrc) attrs.currentSrc = el.currentSrc;
      if (el.src) attrs.src = el.src;
    }
    return attrs;
  }

  
  /* ======================================================================
   *  5.5  OPENTYPE FONT SVG EXTRACTION
   * ====================================================================== */
  const fontUrlMap = new Map();
  const fontParseCache = new Map();

  function parseFontFaceRule(rawFamily, rawSrc, baseUrl) {
    if (!rawFamily || !rawSrc) return;
    const cleanFamily = rawFamily.replace(/['"]/g, '').trim();
    if (!cleanFamily) return;
    const urls = Array.from(rawSrc.matchAll(/url\(["']?(.*?)["']?\)/gi)).map(m => m[1]);
    const fontUrl = urls.find(u => {
      const p = u.split('?')[0].split('#')[0].toLowerCase();
      return p.endsWith('.ttf');
    }) || urls.find(u => {
      const p = u.split('?')[0].split('#')[0].toLowerCase();
      return p.endsWith('.woff') && !p.includes('.woff2');
    }) || urls.find(u => {
      const p = u.split('?')[0].split('#')[0].toLowerCase();
      return p.endsWith('.otf');
    }) || urls.find(u => {
      const p = u.split('?')[0].split('#')[0].toLowerCase();
      return !p.includes('.woff2');
    }) || urls[0];
    if (fontUrl && !fontUrl.startsWith('data:')) {
      try {
        const fullUrl = new URL(fontUrl, baseUrl).href;
        fontUrlMap.set(cleanFamily, fullUrl);
        fontUrlMap.set(cleanFamily.toLowerCase(), fullUrl);
      } catch {}
    }
  }

  function parseCssFontFaces(cssText, baseUrl) {
    if (!cssText) return;
    const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
    let match;
    while ((match = fontFaceRegex.exec(cssText)) !== null) {
      const block = match[1];
      const familyMatch = block.match(/font-family\s*:\s*([^;]+)/i);
      const srcMatch = block.match(/src\s*:\s*([^;]+)/i);
      if (familyMatch && srcMatch) {
        parseFontFaceRule(familyMatch[1], srcMatch[1], baseUrl);
      }
    }
  }

  async function initFontMap() {
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          if (sheet.cssRules) {
            for (const rule of Array.from(sheet.cssRules)) {
              if (rule.type === CSSRule.FONT_FACE_RULE) {
                parseFontFaceRule(rule.style.fontFamily, rule.style.src, sheet.href || window.location.href);
              }
            }
          }
        } catch (e) {
          // Cross-origin stylesheet: fetch CSS text via background service worker
          if (sheet.href) {
            try {
              let cssText = null;
              if (typeof chrome !== 'undefined' && chrome.runtime) {
                const bgRes = await new Promise((res) => {
                  chrome.runtime.sendMessage({ type: 'FETCH_TEXT', url: sheet.href }, (resp) => {
                    if (chrome.runtime.lastError) res(null);
                    else res(resp);
                  });
                });
                if (bgRes && bgRes.data) cssText = bgRes.data;
              }
              if (!cssText) {
                const r = await fetch(sheet.href);
                if (r.ok) cssText = await r.text();
              }
              if (cssText) {
                parseCssFontFaces(cssText, sheet.href);
              }
            } catch {}
          }
        }
      }
    } catch(e) {}
  }

  async function getFontSvgPath(family, char, fontSize) {
    if (!family || !char || typeof opentype === 'undefined') return null;
    const cleanFamily = family.replace(/['"]/g, '').split(',')[0].trim();
    const url = fontUrlMap.get(cleanFamily) || fontUrlMap.get(cleanFamily.toLowerCase());
    if (!url) return null;

    if (!fontParseCache.has(url)) {
      fontParseCache.set(url, new Promise(async (resolve) => {
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            const bgRes = await new Promise((res) => {
              chrome.runtime.sendMessage({ type: 'FETCH_FONT', url }, (resp) => {
                if (chrome.runtime.lastError) res({ error: chrome.runtime.lastError.message });
                else res(resp || { error: 'No response' });
              });
            });
            if (bgRes && bgRes.data) {
              const binaryString = atob(bgRes.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const font = opentype.parse(bytes.buffer);
              resolve(font);
              return;
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      }));
    }

    const font = await fontParseCache.get(url);
    if (!font) return null;

    try {
      const size = parseFloat(fontSize) || 16;
      const baselineY = (font.ascender / font.unitsPerEm) * size;
      const path = font.getPath(char, 0, baselineY, size);
      const bbox = path.getBoundingBox();
      if (!bbox || (bbox.x1 === 0 && bbox.x2 === 0 && bbox.y1 === 0 && bbox.y2 === 0)) return null;
      return { svgPath: path.toSVG(), bbox };
    } catch {
      return null;
    }
  }

  function isIconElementOrFont(text, fontFamily, className) {
    if (!text) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;

    // Normal text containing spaces, tabs, newlines, or longer than 25 chars, is NEVER an icon!
    if (trimmed.includes(' ') || trimmed.includes('\t') || trimmed.includes('\n') || Array.from(trimmed).length > 25) {
      return false;
    }

    // Check for Private Use Area (PUA) characters (standard for icon fonts like FontAwesome, RemixIcon, etc.)
    for (const char of Array.from(trimmed)) {
      const code = char.codePointAt(0);
      if ((code >= 0xE000 && code <= 0xF8FF) || 
          (code >= 0xF0000 && code <= 0xFFFFD) || 
          (code >= 0x100000 && code <= 0x10FFFD)) {
        return true;
      }
    }

    const fontName = (fontFamily || '').toLowerCase();
    const cls = (className || '').toLowerCase();

    // Material icons / symbols use ligatures (e.g. "search", "menu", "arrow_forward")
    const isMaterialFont = fontName.includes('material') || /\b(?:material-icons|material-symbols)\b/i.test(cls);
    if (isMaterialFont && /^[a-z0-9_-]+$/i.test(trimmed)) {
      return true;
    }

    // Icon fonts with 1-2 characters (e.g. FontAwesome, RemixIcon, Tabler, Bootstrap)
    const isIconFont = /(?:awesome|feather|tabler|boxicon|remix|glyph)/i.test(fontName) && !fontName.includes('system-ui');
    if (Array.from(trimmed).length <= 2) {
      if (isIconFont) return true;
      // Specific icon library classes (do not match generic "icon" alone which is just a container)
      if (/\b(?:fa|fa-[a-z0-9-]+|bi|bi-[a-z0-9-]+|bx|bxs|bxl|ri-[a-z0-9-]+|feather|mdi-[a-z0-9-]+)\b/i.test(cls)) {
        return true;
      }
    }

    return false;
  }

  function renderGlyphToImage(char, styles, width, height) {
    try {
      if (!char) return null;
      const scale = 4;
      const w = Math.max(1, Math.round((width || 16) * scale));
      const h = Math.max(1, Math.round((height || 16) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.scale(scale, scale);

      let fontStr = styles.font;
      if (!fontStr || fontStr === 'normal') {
        const style = styles.fontStyle || 'normal';
        const weight = styles.fontWeight || '400';
        const size = styles.fontSize || '16px';
        const family = styles.fontFamily || 'sans-serif';
        fontStr = `${style} ${weight} ${size} ${family}`;
      }
      ctx.font = fontStr;
      ctx.fillStyle = styles.color || '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const drawW = width || 16;
      const drawH = height || 16;
      ctx.fillText(char, drawW / 2, drawH / 2);

      const imgData = ctx.getImageData(0, 0, w, h).data;
      let hasPixels = false;
      for (let i = 3; i < imgData.length; i += 4) {
        if (imgData[i] > 10) {
          hasPixels = true;
          break;
        }
      }
      if (!hasPixels) return null;
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  function serializeSVG(el) {
    try {
      const clone = el.cloneNode(true);
      const cs = window.getComputedStyle(el);
      const w = parseFloat(cs.width) || el.clientWidth || el.getBoundingClientRect().width;
      const h = parseFloat(cs.height) || el.clientHeight || el.getBoundingClientRect().height;
      if (w > 0 && h > 0) {
        clone.setAttribute('width', String(Math.round(w)));
        clone.setAttribute('height', String(Math.round(h)));
      }

      const computedColor = cs.color ? normalizeColor(cs.color) || cs.color : null;
      const origChildren = [el, ...Array.from(el.querySelectorAll('*'))];
      const cloneChildren = [clone, ...Array.from(clone.querySelectorAll('*'))];
      for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
        const orig = origChildren[i];
        const cloned = cloneChildren[i];
        try {
          const origCs = window.getComputedStyle(orig);
          
          const tagName = orig.tagName.toUpperCase();
          const isDefTag = ['DEFS', 'CLIPPATH', 'LINEARGRADIENT', 'RADIALGRADIENT', 'MASK', 'PATTERN', 'SYMBOL', 'STOP', 'USE', 'G'].includes(tagName);
          
          if (!isDefTag && (origCs.display === 'none' || origCs.visibility === 'hidden' || parseFloat(origCs.opacity) === 0)) {
            cloned.remove();
            continue;
          }

          if (isDefTag) {
            continue; // Do not corrupt gradients, stops, masks, or groups with explicit fills
          }

          let computedFill = origCs.fill;
          let computedStroke = origCs.stroke;
          
          // CRITICAL: Chrome resolves url(#gradient) to url("http://page...#gradient").
          // Figma's SVG importer crashes if it sees a full URL.
          // If the computed fill/stroke is a URL, we MUST NOT override the attribute!
          if (computedFill && computedFill.includes('url(')) computedFill = null;
          else if (computedFill) computedFill = normalizeColor(computedFill) || computedFill;
          
          if (computedStroke && computedStroke.includes('url(')) computedStroke = null;
          else if (computedStroke) computedStroke = normalizeColor(computedStroke) || computedStroke;

          const attrFill = cloned.getAttribute('fill');
          const attrStroke = cloned.getAttribute('stroke');

          function applyColorAttr(el, attrName, colorVal) {
            if (!colorVal || colorVal === 'rgba(0, 0, 0, 0)' || colorVal === 'transparent' || colorVal === 'none') {
              el.setAttribute(attrName, 'none');
              return;
            }
            const m = colorVal.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i);
            if (m) {
              const r = Math.round(parseFloat(m[1])).toString(16).padStart(2, '0');
              const g = Math.round(parseFloat(m[2])).toString(16).padStart(2, '0');
              const b = Math.round(parseFloat(m[3])).toString(16).padStart(2, '0');
              el.setAttribute(attrName, `#${r}${g}${b}`);
              if (m[4] !== undefined) {
                const opAttr = attrName === 'fill' ? 'fill-opacity' : 'stroke-opacity';
                el.setAttribute(opAttr, parseFloat(m[4]).toString());
              }
            } else {
              el.setAttribute(attrName, colorVal);
            }
          }

          if (attrFill === 'currentColor') {
            applyColorAttr(cloned, 'fill', computedColor);
          } else if (computedFill) {
            applyColorAttr(cloned, 'fill', computedFill);
          }

          if (attrStroke === 'currentColor') {
            applyColorAttr(cloned, 'stroke', computedColor);
          } else if (computedStroke) {
            applyColorAttr(cloned, 'stroke', computedStroke);
          }
          
          const op = parseFloat(origCs.opacity);
          if (!isNaN(op) && op < 1) {
            cloned.setAttribute('opacity', op.toString());
          }
        } catch {}
      }

      if (!el.hasAttribute('fill')) clone.removeAttribute('fill');
      if (!el.hasAttribute('stroke')) clone.removeAttribute('stroke');

      if (computedColor) {
        clone.setAttribute('color', computedColor);
        clone.style.color = computedColor;
      }

      return clone.outerHTML;
    } catch (e) {
      return null;
    }
  }

  function splitByTopLevelCommas(str) {
    if (!str) return [];
    let result = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  function convertMultipleBackgroundsToSvg(csOrEl, w, h, defaultColor) {
    if (!csOrEl) return null;
    const cs = (csOrEl instanceof Element) ? window.getComputedStyle(csOrEl) : csOrEl;
    const bgImage = cs.backgroundImage || '';
    if (!bgImage || !bgImage.includes(',')) return null;
    const bgs = splitByTopLevelCommas(bgImage);
    if (bgs.length < 2 || !bgs.every(b => b.includes('linear-gradient'))) return null;

    const sizes = splitByTopLevelCommas(cs.backgroundSize || '');
    let pos = splitByTopLevelCommas(cs.backgroundPosition || '');
    const posXList = splitByTopLevelCommas(cs.backgroundPositionX || '');
    const posYList = splitByTopLevelCommas(cs.backgroundPositionY || '');

    function parseDimVal(valStr, containerDim) {
      if (!valStr || valStr === 'auto') return containerDim;
      valStr = valStr.trim().toLowerCase();
      if (valStr.endsWith('%')) {
        return containerDim * (parseFloat(valStr) / 100);
      }
      const num = parseFloat(valStr);
      return isNaN(num) ? containerDim : num;
    }

    function parsePosVal(valStr, containerDim, elementDim) {
      if (!valStr) return 0;
      valStr = valStr.trim().toLowerCase();
      if (valStr === 'left' || valStr === 'top' || valStr === '0' || valStr === '0px' || valStr === '0%') return 0;
      if (valStr === 'right' || valStr === 'bottom') return containerDim - elementDim;
      if (valStr === 'center') return (containerDim - elementDim) / 2;
      if (valStr.endsWith('%')) {
        const pct = parseFloat(valStr) / 100;
        return (containerDim - elementDim) * pct;
      }
      const num = parseFloat(valStr);
      return isNaN(num) ? 0 : num;
    }

    const roundW = Math.round(w) || 1;
    const roundH = Math.round(h) || 1;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${roundW}" height="${roundH}" viewBox="0 0 ${roundW} ${roundH}">`;

    for (let i = 0; i < bgs.length; i++) {
      const bg = bgs[i];
      const sizeStr = sizes[i] || sizes[0] || '100% 100%';
      const sizeParts = sizeStr.trim().split(/\s+/);
      const swStr = sizeParts[0] || '100%';
      const shStr = sizeParts[1] || sizeParts[0] || '100%';

      const rw = parseDimVal(swStr, w);
      const rh = parseDimVal(shStr, h);

      let pxStr = '0%';
      let pyStr = '50%';
      if (pos.length >= bgs.length) {
        const posParts = pos[i].trim().split(/\s+/);
        pxStr = posParts[0] || '0%';
        pyStr = posParts[1] || '50%';
      } else if (posXList.length >= bgs.length || posYList.length >= bgs.length) {
        pxStr = posXList[i] || posXList[0] || '0%';
        pyStr = posYList[i] || posYList[0] || '50%';
      } else if (pos.length > 0) {
        const posParts = (pos[i] || pos[0]).trim().split(/\s+/);
        pxStr = posParts[0] || '0%';
        pyStr = posParts[1] || '50%';
      }

      const rx = parsePosVal(pxStr, w, rw);
      const ry = parsePosVal(pyStr, h, rh);

      let color = defaultColor || cs.color || '#000000';
      const colorMatch = bg.match(/(?:rgba?|hsla?|color)\([^)]+\)|#[0-9a-f]{3,8}|\b(?:transparent|black|white|red|green|blue|yellow)\b/i);
      if (colorMatch && colorMatch[0].toLowerCase() !== 'transparent') {
        color = colorMatch[0];
      }

      let fillOpacity = 1;
      let hexColor = color;
      const m = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i);
      if (m) {
        const r = Math.round(parseFloat(m[1])).toString(16).padStart(2, '0');
        const g = Math.round(parseFloat(m[2])).toString(16).padStart(2, '0');
        const b = Math.round(parseFloat(m[3])).toString(16).padStart(2, '0');
        hexColor = `#${r}${g}${b}`;
        if (m[4] !== undefined) fillOpacity = parseFloat(m[4]);
      }
      const opAttr = fillOpacity < 1 ? ` fill-opacity="${fillOpacity}"` : '';

      svg += `<rect x="${Number(rx.toFixed(2))}" y="${Number(ry.toFixed(2))}" width="${Number(rw.toFixed(2))}" height="${Number(rh.toFixed(2))}" fill="${hexColor}"${opAttr} />`;
    }
    svg += `</svg>`;
    return svg;
  }

  async function serializePseudo(el, pseudo, fonts, parentRect) {
    try {
      const cs = window.getComputedStyle(el, pseudo);
      const content = cs.content;
      if (!content || content === 'none' || content === 'normal') return null;
      
      const display = cs.display;
      if (display === 'none' || parseFloat(cs.opacity) < 0.02 || cs.visibility === 'hidden') return null;
      if (parseInt(cs.zIndex) < 0) return null;
      if (parseFloat(cs.width) === 0 || parseFloat(cs.height) === 0) return null;
      if (cs.clipPath && cs.clipPath !== 'none' && (cs.clipPath.includes('inset(100%)') || cs.clipPath.includes('(0px'))) return null;

      const styles = {};
      for (const [prop, defVal] of Object.entries(CSS_DEFAULTS)) {
        const val = cs[prop];
        if (val !== undefined && val !== defVal && val !== '') {
          styles[prop] = val;
        }
      }
      
      let rawContent = content;
      const altSep = rawContent.indexOf('" / "');
      if (altSep !== -1) rawContent = rawContent.substring(0, altSep + 1);
      const text = rawContent.replace(/^["']|["']$/g, '').trim();
      
      if (styles.fontFamily) fonts.addFont(styles.fontFamily);
      
      let pseudoRect = { ...parentRect };
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      if (!isNaN(w) && cs.width !== 'auto') pseudoRect.width = w;
      if (!isNaN(h) && cs.height !== 'auto') pseudoRect.height = h;

      if (cs.position === 'absolute') {
        const t = parseFloat(cs.top);
        const b = parseFloat(cs.bottom);
        const l = parseFloat(cs.left);
        const r = parseFloat(cs.right);

        if (!isNaN(l) && cs.left !== 'auto') pseudoRect.x = parentRect.x + l;
        else if (!isNaN(r) && cs.right !== 'auto') pseudoRect.x = parentRect.x + parentRect.width - pseudoRect.width - r;
        
        if (!isNaN(t) && cs.top !== 'auto') pseudoRect.y = parentRect.y + t;
        else if (!isNaN(b) && cs.bottom !== 'auto') pseudoRect.y = parentRect.y + parentRect.height - pseudoRect.height - b;
      }

      const bgs = splitByTopLevelCommas(cs.backgroundImage);
      if (bgs.length > 1 && bgs.every(b => b.includes('linear-gradient'))) {
        const svgStr = convertMultipleBackgroundsToSvg(cs, pseudoRect.width, pseudoRect.height, cs.color);
        if (svgStr) {
          return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('svg-bg-pseudo'),
            tag: 'SVG',
            content: svgStr,
            styles: styles,
            rect: pseudoRect
          };
        }
      }

      if (cs.transform && cs.transform.includes('matrix')) {
        const parts = cs.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
        if (parts) {
          const vals = parts[1].split(',').map(parseFloat);
          let tx = 0, ty = 0;
          if (vals.length === 16) {
            const sx = vals[0]; const sy = vals[5];
            if (Math.abs(sx) < 0.001 || Math.abs(sy) < 0.001) return null;
            tx = vals[12]; ty = vals[13];
          } else {
            const [a, b, c, d] = vals;
            if ((Math.abs(a) < 0.001 && Math.abs(b) < 0.001) || (Math.abs(c) < 0.001 && Math.abs(d) < 0.001)) return null;
            tx = vals[4]; ty = vals[5];
          }
          pseudoRect.x += tx;
          pseudoRect.y += ty;
        }
      }

      const chars = Array.from(text);
      const isIcon = isIconElementOrFont(text, cs.fontFamily, el.className);
      if (isIcon) {
        let fontData = null;
        if (chars.length === 1) {
          fontData = await getFontSvgPath(cs.fontFamily, text, cs.fontSize);
        }
        if (fontData && fontData.svgPath) {
           const { svgPath, bbox } = fontData;
           const pathW = bbox.x2 - bbox.x1;
           const pathH = bbox.y2 - bbox.y1;
           const parentW = Math.ceil(pseudoRect.width);
           const parentH = Math.ceil(pseudoRect.height);
           const tx = (parentW - pathW) / 2 - bbox.x1;
           const ty = (parentH - pathH) / 2 - bbox.y1;
           const fillColor = cs.color || '#000000';
           let fillOpacity = 1;
           let hexColor = fillColor;
           const m = fillColor.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i);
           if (m) {
             const r = Math.round(parseFloat(m[1])).toString(16).padStart(2, '0');
             const g = Math.round(parseFloat(m[2])).toString(16).padStart(2, '0');
             const b = Math.round(parseFloat(m[3])).toString(16).padStart(2, '0');
             hexColor = `#${r}${g}${b}`;
             if (m[4] !== undefined) fillOpacity = parseFloat(m[4]);
           }
           const opAttr = fillOpacity < 1 ? ` fill-opacity="${fillOpacity}"` : '';

           return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('svg-icon-pseudo'),
            tag: 'SVG',
            content: `<svg width="${parentW}" height="${parentH}" viewBox="0 0 ${parentW} ${parentH}" fill="${hexColor}"${opAttr}><g transform="translate(${tx}, ${ty})">${svgPath}</g></svg>`,
            styles: styles,
            rect: pseudoRect
          };
        }

        // Absolute match fallback: canvas glyph rendering
        const iconW = Math.ceil(pseudoRect.width) || parseFloat(cs.fontSize) || 16;
        const iconH = Math.ceil(pseudoRect.height) || parseFloat(cs.fontSize) || 16;
        const dataUrl = renderGlyphToImage(text, cs, iconW, iconH);
        if (dataUrl) {
          return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('icon-img-pseudo'),
            tag: 'IMG',
            attributes: { src: dataUrl, alt: 'icon' },
            styles: { ...styles, backgroundColor: 'transparent', backgroundImage: 'none' },
            rect: {
              ...pseudoRect,
              width: iconW,
              height: iconH
            }
          };
        }
      }

      return {
        nodeType: ELEMENT_NODE,
        id: getNodeId('pseudo'),
        tag: 'SPAN',
        attributes: { class: pseudo.replace('::', '__') },
        styles,
        rect: pseudoRect,
        text
      };
    } catch {
      return null;
    }
  }

  async function serializeNode(node, assets, fonts, parentStyles) {
    if (node.nodeType === TEXT_NODE) {
      const text = node.textContent || '';
      if (!text.trim()) return null;
      const r = document.createRange();
      r.selectNodeContents(node);
      const rect = r.getBoundingClientRect();
      const clientRects = r.getClientRects();
      r.detach();
      if (rect.width === 0 && rect.height === 0) return null;
      const isFixed = parentStyles?.position === 'fixed';

      // If single line or small inline token (like '$', '13', 'Popular Package'), preserve exact position
      
      // Check if it's an icon font character
      const charStr = text.trim() || text;
      const isIcon = isIconElementOrFont(charStr, parentStyles?.fontFamily, node.parentElement?.className);
      if (isIcon) {
        let fontData = null;
        if (Array.from(charStr).length === 1) {
          fontData = await getFontSvgPath(parentStyles?.fontFamily, charStr, parentStyles?.fontSize);
        }
        if (fontData && fontData.svgPath) {
          const { svgPath, bbox } = fontData;
          const pathW = bbox.x2 - bbox.x1;
          const pathH = bbox.y2 - bbox.y1;
          const parentW = Math.ceil(rect.width);
          const parentH = Math.ceil(rect.height);
          const tx = (parentW - pathW) / 2 - bbox.x1;
          const ty = (parentH - pathH) / 2 - bbox.y1;
          const fillColor = parentStyles?.webkitTextFillColor || parentStyles?.color || '#000000';
          let fillOpacity = 1;
          let hexColor = fillColor;
          const m = fillColor.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i);
          if (m) {
            const r = Math.round(parseFloat(m[1])).toString(16).padStart(2, '0');
            const g = Math.round(parseFloat(m[2])).toString(16).padStart(2, '0');
            const b = Math.round(parseFloat(m[3])).toString(16).padStart(2, '0');
            hexColor = `#${r}${g}${b}`;
            if (m[4] !== undefined) fillOpacity = parseFloat(m[4]);
          }
          const opAttr = fillOpacity < 1 ? ` fill-opacity="${fillOpacity}"` : '';

          return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('svg-icon'),
            tag: 'SVG',
            content: `<svg width="${parentW}" height="${parentH}" viewBox="0 0 ${parentW} ${parentH}" fill="${hexColor}"${opAttr}><g transform="translate(${tx}, ${ty})">${svgPath}</g></svg>`,
            styles: parentStyles || {},
            rect: {
              x: rect.x + (isFixed ? 0 : window.scrollX),
              y: rect.y + (isFixed ? 0 : window.scrollY),
              width: parentW,
              height: parentH
            }
          };
        }

        // Absolute match fallback: canvas glyph rendering
        if (isIconElementOrFont(charStr, parentStyles?.fontFamily, node.parentElement?.className)) {
          const iconW = Math.ceil(rect.width) || parseFloat(parentStyles?.fontSize) || 16;
          const iconH = Math.ceil(rect.height) || parseFloat(parentStyles?.fontSize) || 16;
          const dataUrl = renderGlyphToImage(charStr, parentStyles, iconW, iconH);
          if (dataUrl) {
            return {
              nodeType: ELEMENT_NODE,
              id: getNodeId('icon-img'),
              tag: 'IMG',
              attributes: { src: dataUrl, alt: 'icon' },
              styles: { ...(parentStyles || {}), backgroundColor: 'transparent', backgroundImage: 'none' },
              rect: {
                x: rect.x + (isFixed ? 0 : window.scrollX),
                y: rect.y + (isFixed ? 0 : window.scrollY),
                width: iconW,
                height: iconH
              }
            };
          }
        }
      }

      const fontSize = parseFloat(parentStyles?.fontSize) || 16;
      if (clientRects.length <= 1 && rect.height <= fontSize * 1.5) {

        return {
          nodeType: TEXT_NODE,
          id: getNodeId('text'),
          text,
          rect: {
            x: rect.x + (isFixed ? 0 : window.scrollX),
            y: rect.y + (isFixed ? 0 : window.scrollY),
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height)
          },
          styles: parentStyles || {},
          lineCount: 1
        };
      }

      // For multiline inline text with spans/links, slice text per line by character rects
      const segments = [];
      const len = node.length;
      let lineStart = 0;
      let lastTop = null;

      for (let i = 0; i < len; i++) {
        r.setStart(node, i);
        r.setEnd(node, i + 1);
        const charRect = r.getBoundingClientRect();
        if (charRect.width === 0 && charRect.height === 0) continue;

        if (lastTop === null) {
          lastTop = charRect.top;
        } else if (Math.abs(charRect.top - lastTop) > 3) {
          // Line break detected
          r.setStart(node, lineStart);
          r.setEnd(node, i);
          const lineBox = r.getBoundingClientRect();
          const lineText = text.slice(lineStart, i);
          if (lineText.trim()) {
            segments.push({
              nodeType: TEXT_NODE,
              id: getNodeId('text-line'),
              text: lineText,
              rect: {
                x: lineBox.x + (isFixed ? 0 : window.scrollX),
                y: lineBox.y + (isFixed ? 0 : window.scrollY),
                width: Math.ceil(lineBox.width),
                height: Math.ceil(lineBox.height)
              },
              styles: parentStyles || {},
              lineCount: 1
            });
          }
          lineStart = i;
          lastTop = charRect.top;
        }
      }

      // Add final line segment
      r.setStart(node, lineStart);
      r.setEnd(node, len);
      const finalBox = r.getBoundingClientRect();
      const finalLineText = text.slice(lineStart);
      if (finalLineText.trim()) {
        segments.push({
          nodeType: TEXT_NODE,
          id: getNodeId('text-line'),
          text: finalLineText,
          rect: {
            x: finalBox.x + (isFixed ? 0 : window.scrollX),
            y: finalBox.y + (isFixed ? 0 : window.scrollY),
            width: Math.ceil(finalBox.width),
            height: Math.ceil(finalBox.height)
          },
          styles: parentStyles || {},
          lineCount: 1
        });
      }

      if (segments.length === 1) return segments[0];
      if (segments.length > 1) {
        // Return a group array as pseudo element or return segments
        // We can return a flat virtual group node or element node
        return {
          nodeType: ELEMENT_NODE,
          id: getNodeId('text-wrap'),
          tag: 'SPAN',
          styles: { ...parentStyles, backgroundColor: 'rgba(0, 0, 0, 0)' },
          rect: {
            x: rect.x + (isFixed ? 0 : window.scrollX),
            y: rect.y + (isFixed ? 0 : window.scrollY),
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height)
          },
          childNodes: segments
        };
      }

      return {
        nodeType: TEXT_NODE,
        id: getNodeId('text'),
        text,
        rect: {
          x: rect.x + (isFixed ? 0 : window.scrollX),
          y: rect.y + (isFixed ? 0 : window.scrollY),
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height)
        },
        styles: parentStyles || {},
        lineCount: 1
      };
    }

    if (node.nodeType !== ELEMENT_NODE) return null;
    const el = node;
    const tag = el.tagName.toUpperCase();
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'LINK', 'TEMPLATE'].includes(tag)) return null;

    const styles = getElementStyles(el);
    if (styles.display === 'none' || styles.visibility === 'hidden' || parseFloat(styles.opacity) < 0.02) return null;

    if (styles.transform && styles.transform.includes('matrix')) {
      const parts = styles.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
      if (parts) {
        const vals = parts[1].split(',').map(s => parseFloat(s.trim()));
        if (styles.transform.startsWith('matrix3d')) {
          const sx = vals[0], sy = vals[5];
          if (Math.abs(sx) < 0.001 || Math.abs(sy) < 0.001) return null;
        } else {
          const [a, b, c, d] = vals;
          if ((Math.abs(a) < 0.001 && Math.abs(b) < 0.001) || (Math.abs(c) < 0.001 && Math.abs(d) < 0.001)) return null;
        }
      }
    }
    if (styles.fontFamily) fonts.addFont(styles.fontFamily);

    if (el instanceof HTMLImageElement) {
      const url = el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original') || el.srcset?.split(',')[0]?.trim()?.split(' ')[0];
      if (url) assets.addImage(url);
    } else if (el instanceof HTMLPictureElement) {
      const imgChild = el.querySelector('img');
      if (imgChild) {
        const url = imgChild.currentSrc || imgChild.src || imgChild.getAttribute('data-src');
        if (url) assets.addImage(url);
      }
    }
    if (styles.backgroundImage && styles.backgroundImage !== 'none') {
      const matches = styles.backgroundImage.matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g);
      for (const m of matches) {
        if (m[1] && !m[1].startsWith('data:')) assets.addImage(m[1].trim());
      }
    }

    let placeholderUrl = null;
    if (el instanceof HTMLCanvasElement) {
      placeholderUrl = assets.addCanvas(el);
    } else if (el instanceof HTMLVideoElement) {
      if (el.poster) assets.addImage(el.poster);
      else placeholderUrl = assets.addVideo(el);
    }

    const clientRect = el.getBoundingClientRect();
    const isFixed = styles.position === 'fixed';
    
    // For position: fixed elements (like floating scroll-to-top buttons in bottom-right),
    // when document is scrolled to top (0,0), clientRect.y is their exact viewport position.
    // If anchored to bottom, ensure it renders visibly within the full document frame.
    let posX = clientRect.x + (isFixed ? 0 : window.scrollX);
    let posY = clientRect.y + (isFixed ? 0 : window.scrollY);

    const docRect = {
      x: posX,
      y: posY,
      width: clientRect.width,
      height: clientRect.height
    };

    let svgContent = null;
    if (tag === 'SVG' || el instanceof SVGElement) {
      svgContent = serializeSVG(el);
    } else {
      const cs = window.getComputedStyle(el);
      const bgs = splitByTopLevelCommas(cs.backgroundImage || styles.backgroundImage || '');
      const hasChildElements = el.children && el.children.length > 0;
      const hasText = el.childNodes && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!hasChildElements && !hasText && bgs.length > 1 && bgs.every(b => b.includes('linear-gradient'))) {
        const fallbackSvg = convertMultipleBackgroundsToSvg(cs, docRect.width, docRect.height, cs.color || styles.color);
        if (fallbackSvg) {
          svgContent = fallbackSvg;
          styles.backgroundImage = 'none'; // Clear bg to prevent double rendering in code.js
        }
      }
    }

    const before = await serializePseudo(el, '::before', fonts, docRect);
    const after = await serializePseudo(el, '::after', fonts, docRect);
    const pseudoElementNodes = (before || after) ? { before, after } : undefined;

    const childNodes = [];
    if (!svgContent) {
      const sourceNodes = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
      for (const child of sourceNodes) {
        const sChild = await serializeNode(child, assets, fonts, styles);
        if (sChild) childNodes.push(sChild);
      }

      // Sort child nodes according to CSS stacking context (z-index)
      if (childNodes.length > 1) {
        childNodes.sort((a, b) => {
          const zA = a.styles?.zIndex && a.styles.zIndex !== 'auto' ? parseInt(a.styles.zIndex, 10) || 0 : 0;
          const zB = b.styles?.zIndex && b.styles.zIndex !== 'auto' ? parseInt(b.styles.zIndex, 10) || 0 : 0;
          return zA - zB;
        });
      }
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || tag === 'INPUT' || tag === 'TEXTAREA') {
      const val = el.value || el.placeholder || el.getAttribute('placeholder') || '';
      if (val && !childNodes.length) {
        const isPlaceholder = !el.value && (el.placeholder || el.getAttribute('placeholder'));
        const padLeft = parseFloat(styles.paddingLeft) || 0;
        const padTop = parseFloat(styles.paddingTop) || 0;
        const padRight = parseFloat(styles.paddingRight) || 0;
        const padBottom = parseFloat(styles.paddingBottom) || 0;
        
        // Placeholder text style (slightly lighter if it's placeholder)
        const textStyles = { ...styles };
        if (isPlaceholder) {
          textStyles.color = textStyles.color ? textStyles.color : 'rgba(0, 0, 0, 0.4)';
          textStyles.opacity = '0.55';
        }

        childNodes.push({
          nodeType: TEXT_NODE,
          id: getNodeId('input-text'),
          text: val,
          rect: {
            x: docRect.x + padLeft,
            y: docRect.y + padTop,
            width: Math.max(1, docRect.width - padLeft - padRight),
            height: Math.max(1, docRect.height - padTop - padBottom)
          },
          styles: textStyles,
          lineCount: 1
        });
      }
    }

    return {
      nodeType: ELEMENT_NODE,
      id: getNodeId('el'),
      tag,
      attributes: getAttributes(el),
      styles,
      rect: docRect,
      childNodes,
      content: svgContent || undefined,
      placeholderUrl: placeholderUrl || undefined,
      pseudoElementNodes
    };
  }

  /* ======================================================================
   *  7.  CLIPBOARD WRITER & INITIATOR
   * ====================================================================== */
  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed; left:-9999px; top:-9999px; opacity:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const res = document.execCommand('copy');
        ta.remove();
        return res;
      } catch {
        return false;
      }
    }
  }

  try {
    await initFontMap();
    const toast = showToast('⏳ Pre-rendering full webpage…');

    // 1. Scroll through page to activate lazy-loaded elements & image sources
    await prepareAndScrollPage();

    // 2. Decode all visible and lazy-loaded images
    const images = Array.from(document.images || []);
    images.forEach(img => {
      if (img.decoding !== 'sync') img.decoding = 'sync';
      if (img.loading !== 'eager') img.loading = 'eager';
    });
    await Promise.allSettled(images.map(img => img.decode().catch(() => {})));

    const assets = new AssetCollector();
    const fonts = new FontCollector();

    // Target document.body directly to avoid double nesting HTML + BODY frames
    const targetElement = document.body || document.documentElement;
    const root = await serializeNode(targetElement, assets, fonts, null);

    if (targetElement === document.body && document.documentElement) {
      const htmlStyles = window.getComputedStyle(document.documentElement);
      if (htmlStyles.backgroundColor !== 'rgba(0, 0, 0, 0)' && (!root.styles.backgroundColor || root.styles.backgroundColor === 'rgba(0, 0, 0, 0)')) {
        root.styles.backgroundColor = htmlStyles.backgroundColor;
      }
      if (htmlStyles.backgroundImage !== 'none' && (!root.styles.backgroundImage || root.styles.backgroundImage === 'none')) {
        root.styles.backgroundImage = htmlStyles.backgroundImage;
        root.styles.backgroundSize = htmlStyles.backgroundSize;
        root.styles.backgroundPositionX = htmlStyles.backgroundPositionX;
        root.styles.backgroundPositionY = htmlStyles.backgroundPositionY;
        root.styles.backgroundRepeat = htmlStyles.backgroundRepeat;
        const matches = htmlStyles.backgroundImage.matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g);
        for (const m of matches) {
          if (m[1] && !m[1].startsWith('data:')) assets.addImage(m[1].trim());
        }
      }
    }
    const assetMap = await assets.getBlobMap();

    let fullDocWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0,
      window.innerWidth
    );
    const fullDocHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
      window.innerHeight
    );

    const payload = {
      version: 2,
      generator: 'HTML-2-Fig',
      documentTitle: document.title || 'Web Import',
      documentRect: {
        x: 0,
        y: 0,
        width: fullDocWidth,
        height: fullDocHeight
      },
      viewportRect: {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      },
      devicePixelRatio: window.devicePixelRatio || 1,
      root,
      assets: assetMap,
      fonts: fonts.getFonts()
    };

    const json = JSON.stringify(payload);
    const ok = await writeClipboard(json);

    try { toast.remove(); } catch {}

    if (ok) {
      showToast('✅ Full page captured! Paste into Figma plugin (Ctrl+V)', 6000);
    } else {
      showToast('⚠️ Capture complete. Please allow clipboard access.', 6000);
    }
  } catch (err) {
    console.error('[HTML-2-Fig] Capture error:', err);
    showToast('❌ Capture failed: ' + (err.message || err), 8000);
  } finally {
    window.__html2FigRunning = false;
    const scrollFix = document.getElementById('h2f-scroll-fix');
    if (scrollFix) scrollFix.remove();
  }
})();

