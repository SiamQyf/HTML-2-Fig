/*
 * HTML 2 Fig — High-Fidelity Capture Engine
 * Captures document.body directly (preventing duplicated HEAD/HTML rendering),
 * pre-scrolls to activate lazy sections, and serializes clean DOM trees.
 */
;(async function html2FigCapture() {
  'use strict';

  if (window.__html2FigRunning) return;
  window.__html2FigRunning = true;

  const FETCH_TIMEOUT = 3500;
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;

  /* ======================================================================
   *  1.  CSS DEFAULTS MAP
   * ====================================================================== */
  const CSS_DEFAULTS = {
    alignContent: 'normal', alignItems: 'normal', alignSelf: 'auto',
    aspectRatio: 'auto', backdropFilter: 'none', backgroundAttachment: 'scroll',
    backgroundBlendMode: 'normal', backgroundClip: 'border-box',
    backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
    backgroundOrigin: 'padding-box', backgroundPositionX: '0%', backgroundPositionY: '0%',
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
    rotate: 'none', scale: 'none', verticalAlign: 'baseline',
    visibility: 'visible', webkitTextFillColor: '', whiteSpace: 'normal',
    width: 'auto', writingMode: 'horizontal-tb', zIndex: 'auto'
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

    const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    const step = Math.max(window.innerHeight * 2, 1200);

    for (let y = 0; y < scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 40));
    }
    window.scrollTo(0, scrollHeight);
    await new Promise(r => setTimeout(r, 100));
    // Always restore to top (0, 0) for DOM serialization
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 60));
  }

  /* ======================================================================
   *  4.  UNIVERSAL ASSET & IMAGE CONVERTER
   * ====================================================================== */
  async function convertToPngBlob(blob) {
    if (!blob) return null;
    if (blob.type === 'image/png' || blob.type === 'image/jpeg') return blob;

    try {
      if (typeof createImageBitmap === 'function') {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = bmp.width || 1;
        c.height = bmp.height || 1;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(bmp, 0, 0);
          return new Promise(resolve => c.toBlob(resolve, 'image/png'));
        }
      }
    } catch {}

    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
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
            URL.revokeObjectURL(url);
            resolve(b || blob);
          }, 'image/png');
        } catch {
          URL.revokeObjectURL(url);
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
          return { url: absoluteUrl, blob: { type: 'image/png', data: bgRes.data } };
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

  function getElementStyles(el) {
    const cs = window.getComputedStyle(el);
    const styles = {};
    for (const [prop, defVal] of Object.entries(CSS_DEFAULTS)) {
      const val = cs[prop];
      if (val !== undefined && val !== defVal && val !== '') {
        styles[prop] = val;
      }
    }
    styles.fontFamily = cs.fontFamily;
    styles.fontSize = cs.fontSize;
    styles.fontWeight = cs.fontWeight;
    styles.fontStyle = cs.fontStyle;
    styles.color = cs.color;
    styles.webkitTextFillColor = cs.webkitTextFillColor || cs.color;
    styles.lineHeight = cs.lineHeight;
    styles.letterSpacing = cs.letterSpacing;
    styles.textAlign = cs.textAlign;
    styles.textTransform = cs.textTransform;
    // Always capture background and border radius for frame fills
    styles.backgroundColor = cs.backgroundColor;
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

  function initFontMap() {
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              const family = rule.style.fontFamily?.replace(/['"]/g, '');
              const src = rule.style.src;
              if (family && src) {
                let fontUrl = null;
                const ttfMatch = src.match(/url\(["']?(.*?\.ttf(\?.*?)?)["']?\)/i);
                const woffMatch = src.match(/url\(["']?(.*?\.woff(\?.*?)?)["']?\)/i);
                const fallbackMatch = src.match(/url\(["']?(.*?)["']?\)/);
                
                if (ttfMatch) fontUrl = ttfMatch[1];
                else if (woffMatch && !woffMatch[1].endsWith('.woff2')) fontUrl = woffMatch[1];
                else if (fallbackMatch && !fallbackMatch[1].includes('.woff2')) fontUrl = fallbackMatch[1];
                
                if (fontUrl && !fontUrl.startsWith('data:')) {
                  try { fontUrl = new URL(fontUrl, sheet.href || window.location.href).href; } catch {}
                  fontUrlMap.set(family, fontUrl);
                }
              }
            }
          }
        } catch (e) {}
      }
    } catch(e) {}
  }

  async function getFontSvgPath(family, char, fontSize) {
    if (!family || !char || typeof opentype === 'undefined') return null;
    const cleanFamily = family.replace(/['"]/g, '').split(',')[0].trim();
    const url = fontUrlMap.get(cleanFamily);
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
      
      return { svgPath: path.toSVG(), bbox };
    } catch {
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

      // Read computed fill/stroke from ORIGINAL in-DOM elements, write onto clone
      const computedColor = cs.color;
      const origChildren = el.querySelectorAll('*');
      const cloneChildren = clone.querySelectorAll('*');
      for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
        const orig = origChildren[i];
        const cloned = cloneChildren[i];
        try {
          const origCs = window.getComputedStyle(orig);
          const computedFill = origCs.fill;
          const computedStroke = origCs.stroke;

          // Resolve currentColor and inline the actual rendered color
          const attrFill = cloned.getAttribute('fill');
          const attrStroke = cloned.getAttribute('stroke');

          if (attrFill === 'currentColor') {
            cloned.setAttribute('fill', computedColor);
          } else if (computedFill && computedFill !== 'none') {
            cloned.setAttribute('fill', computedFill);
          }

          if (attrStroke === 'currentColor') {
            cloned.setAttribute('stroke', computedColor);
          } else if (computedStroke && computedStroke !== 'none' && computedStroke !== 'rgba(0, 0, 0, 0)') {
            cloned.setAttribute('stroke', computedStroke);
          }
        } catch {}
      }

      // Set color on the SVG root too for any remaining currentColor references
      if (computedColor) {
        clone.setAttribute('color', computedColor);
        clone.style.color = computedColor;
      }

      return clone.outerHTML;
    } catch {
      return null;
    }
  }

  async function serializePseudo(el, pseudo, fonts, parentRect) {
    try {
      const cs = window.getComputedStyle(el, pseudo);
      const content = cs.content;
      const display = cs.display;
      if (display === 'none' || cs.opacity === '0') return null;

      // Skip elements hidden via scale(0) transform (common for hover underlines)
      if (cs.transform && cs.transform.startsWith('matrix')) {
        const parts = cs.transform.match(/matrix\(([^)]+)\)/);
        if (parts) {
          const [a, b, c, d] = parts[1].split(',').map(s => parseFloat(s.trim()));
          if ((Math.abs(a) < 0.001 && Math.abs(b) < 0.001) || (Math.abs(c) < 0.001 && Math.abs(d) < 0.001)) {
            return null;
          }
        }
      }
      
      const hasContent = content && content !== 'none' && content !== 'normal' && content !== '""';
      const hasBgImage = cs.backgroundImage && cs.backgroundImage !== 'none';
      const hasMaskImage = (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none');
      const hasBgColor = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      const hasBorder = cs.borderWidth && parseFloat(cs.borderWidth) > 0 && cs.borderStyle !== 'none';
      const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
      
      if (!hasContent && !hasBgImage && !hasMaskImage && !hasBgColor && !hasBorder && !hasShadow) {
        return null;
      }

      const text = hasContent ? content.replace(/^[\"']|[\"']$/g, '').trim() : '';
      
      const styles = {};
      for (const [prop, defVal] of Object.entries(CSS_DEFAULTS)) {
        const val = cs[prop];
        if (val !== undefined && val !== defVal && val !== '') {
          styles[prop] = val;
        }
      }
      if (styles.fontFamily) fonts.addFont(styles.fontFamily);
      
      if (Array.from(text).length === 1) {
        const fontData = await getFontSvgPath(cs.fontFamily, text, cs.fontSize);
        if (fontData && fontData.svgPath) {
           const { svgPath, bbox } = fontData;
           const pathW = bbox.x2 - bbox.x1;
           const pathH = bbox.y2 - bbox.y1;
           const parentW = Math.ceil(parentRect.width);
           const parentH = Math.ceil(parentRect.height);
           const tx = (parentW - pathW) / 2 - bbox.x1;
           const ty = (parentH - pathH) / 2 - bbox.y1;

           return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('svg-icon-pseudo'),
            tag: 'SVG',
            content: `<svg width="${parentW}" height="${parentH}" viewBox="0 0 ${parentW} ${parentH}"><g transform="translate(${tx}, ${ty})">${svgPath}</g></svg>`,
            styles: styles,
            rect: parentRect
          };
        }
      }

      return {
        nodeType: ELEMENT_NODE,
        id: getNodeId('pseudo'),
        tag: 'SPAN',
        attributes: { class: pseudo.replace('::', '__') },
        styles,
        rect: parentRect,
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
      if (Array.from(charStr).length === 1) {
        const fontData = await getFontSvgPath(parentStyles?.fontFamily, charStr, parentStyles?.fontSize);
        if (fontData && fontData.svgPath) {
          const { svgPath, bbox } = fontData;
          const pathW = bbox.x2 - bbox.x1;
          const pathH = bbox.y2 - bbox.y1;
          const parentW = Math.ceil(rect.width);
          const parentH = Math.ceil(rect.height);
          const tx = (parentW - pathW) / 2 - bbox.x1;
          const ty = (parentH - pathH) / 2 - bbox.y1;

          return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('svg-icon'),
            tag: 'SVG',
            content: `<svg width="${parentW}" height="${parentH}" viewBox="0 0 ${parentW} ${parentH}"><g transform="translate(${tx}, ${ty})">${svgPath}</g></svg>`,
            styles: parentStyles || {},
            rect: {
              x: rect.x + (isFixed ? 0 : window.scrollX),
              y: rect.y + (isFixed ? 0 : window.scrollY),
              width: parentW,
              height: parentH
            }
          };
        }
      }

      if (clientRects.length <= 1) {

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
    if (styles.display === 'none' || styles.visibility === 'hidden') return null;
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
      const matches = styles.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g);
      for (const m of matches) {
        if (m[1] && !m[1].startsWith('data:')) assets.addImage(m[1]);
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
        const padLeft = parseFloat(styles.paddingLeft) || 12;
        const padTop = parseFloat(styles.paddingTop) || 8;
        
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
            width: Math.max(1, docRect.width - padLeft - (parseFloat(styles.paddingRight) || 12)),
            height: Math.max(1, docRect.height - padTop - (parseFloat(styles.paddingBottom) || 8))
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
    initFontMap();
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
    const assetMap = await assets.getBlobMap();

    const fullDocWidth = Math.max(
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
