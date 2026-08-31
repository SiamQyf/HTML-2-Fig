/*
 * HTML 2 Fig — Capture Engine
 * Injected into the active tab's MAIN world.
 * Traverses live DOM, computes styles, geometry, images (with PNG transcoding),
 * SVGs, and serializes everything into an export-compliant payload for Figma.
 */
;(async function html2FigCapture() {
  'use strict';

  if (window.__html2FigRunning) return;
  window.__html2FigRunning = true;

  const FETCH_TIMEOUT = 9000;
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
    color: 'rgb(0, 0, 0)', columnGap: 'normal', display: '', filter: 'none',
    flexBasis: 'auto', flexDirection: 'row', flexGrow: '0', flexShrink: '1',
    flexWrap: 'nowrap', float: 'none', fontFamily: 'Times', fontSize: '16px',
    fontStretch: '100%', fontStyle: 'normal', fontWeight: '400',
    gridAutoColumns: 'auto', gridAutoFlow: 'row', gridAutoRows: 'auto',
    height: 'auto', isolation: 'auto', justifyContent: 'normal',
    left: 'auto', letterSpacing: 'normal', lineHeight: 'normal',
    marginBottom: '0px', marginLeft: '0px', marginRight: '0px', marginTop: '0px',
    maxHeight: 'none', maxWidth: 'none', minHeight: 'auto', minWidth: 'auto',
    mixBlendMode: 'normal', objectFit: 'fill', opacity: '1', order: '0',
    overflow: 'visible', overflowX: 'visible', overflowY: 'visible',
    position: 'static', paddingBottom: '0px', paddingLeft: '0px',
    paddingRight: '0px', paddingTop: '0px', quotes: 'auto', right: 'auto',
    rowGap: 'normal', textAlign: 'start', textDecorationLine: 'none',
    textTransform: 'none', top: 'auto', transform: 'none', translate: 'none',
    rotate: 'none', scale: 'none', visibility: 'visible',
    webkitTextFillColor: '', whiteSpace: 'normal', width: 'auto', zIndex: 'auto'
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
   *  3.  IMAGE & ASSET CONVERSION (AVIF/WebP -> PNG for Figma)
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
        ctx.drawImage(bmp, 0, 0);
        return new Promise(resolve => c.toBlob(resolve, 'image/png'));
      }
    } catch {}
    return blob;
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

  async function fetchImage(url) {
    if (!url) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let blob = await res.blob();
      blob = await convertToPngBlob(blob);
      return { url, blob: await blobToBase64(blob) };
    } catch {
      // Fallback via canvas draw
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || 1;
            c.height = img.naturalHeight || 1;
            c.getContext('2d').drawImage(img, 0, 0);
            c.toBlob(b => {
              blobToBase64(b).then(b64 => resolve({ url, blob: b64 })).catch(() => resolve({ url, blob: null }));
            }, 'image/png');
          } catch { resolve({ url, blob: null }); }
        };
        img.onerror = () => resolve({ url, blob: null });
        img.src = url;
      });
    }
  }

  class AssetCollector {
    constructor() {
      this.promises = new Map();
      this.rasterizedId = 0;
    }
    addImage(url) {
      if (!url || this.promises.has(url)) return;
      this.promises.set(url, fetchImage(url));
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
   *  4.  FONT COLLECTOR
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
   *  5.  DOM TRAVERSAL & COMPUTED STYLE SERIALIZATION
   * ====================================================================== */
  let nodeCounter = 0;
  function getNodeId() { return `h2f-node-${++nodeCounter}`; }

  function getElementStyles(el) {
    const cs = window.getComputedStyle(el);
    const styles = {};
    for (const [prop, defVal] of Object.entries(CSS_DEFAULTS)) {
      const val = cs[prop];
      if (val !== undefined && val !== defVal && val !== '') {
        styles[prop] = val;
      }
    }
    return styles;
  }

  function getAttributes(el) {
    const attrs = {};
    if (!el.attributes) return attrs;
    const allowed = ['id', 'class', 'src', 'currentSrc', 'srcset', 'data-src', 'alt', 'href', 'type', 'placeholder', 'value'];
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      if (allowed.includes(name) || name.startsWith('aria-')) {
        attrs[attr.name] = attr.value;
      }
    }
    if (el instanceof HTMLImageElement) {
      if (el.currentSrc) attrs.currentSrc = el.currentSrc;
      if (el.src) attrs.src = el.src;
    }
    return attrs;
  }

  function serializeSVG(el) {
    try {
      const clone = el.cloneNode(true);
      const cs = window.getComputedStyle(el);
      const w = parseFloat(cs.width) || el.clientWidth;
      const h = parseFloat(cs.height) || el.clientHeight;
      if (w > 0 && h > 0) {
        clone.setAttribute('width', String(w));
        clone.setAttribute('height', String(h));
      }
      return clone.outerHTML;
    } catch { return null; }
  }

  function serializeNode(node, assets, fonts) {
    if (node.nodeType === TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (!text) return null;
      const r = document.createRange();
      r.selectNodeContents(node);
      const rect = r.getBoundingClientRect();
      r.detach();
      if (rect.width === 0 && rect.height === 0) return null;
      return {
        nodeType: TEXT_NODE,
        id: getNodeId(),
        text: node.textContent || '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        lineCount: 1
      };
    }

    if (node.nodeType !== ELEMENT_NODE) return null;
    const el = node;
    const tag = el.tagName.toUpperCase();
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'IFRAME', 'LINK'].includes(tag)) return null;

    const styles = getElementStyles(el);
    if (styles.fontFamily) fonts.addFont(styles.fontFamily);

    // Collect image assets
    if (el instanceof HTMLImageElement) {
      const url = el.currentSrc || el.src || el.getAttribute('data-src');
      if (url) assets.addImage(url);
    }
    if (styles.backgroundImage && styles.backgroundImage !== 'none') {
      const matches = styles.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g);
      for (const m of matches) {
        if (m[1] && !m[1].startsWith('data:')) assets.addImage(m[1]);
      }
    }

    const rect = el.getBoundingClientRect();
    let svgContent = null;
    if (tag === 'SVG' || el instanceof SVGElement) {
      svgContent = serializeSVG(el);
    }

    const childNodes = [];
    if (!svgContent) {
      for (const child of el.childNodes) {
        const sChild = serializeNode(child, assets, fonts);
        if (sChild) childNodes.push(sChild);
      }
    }

    return {
      nodeType: ELEMENT_NODE,
      id: getNodeId(),
      tag,
      attributes: getAttributes(el),
      styles,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      childNodes,
      content: svgContent || undefined
    };
  }

  /* ======================================================================
   *  6.  CLIPBOARD WRITER & ENTRY POINT
   * ====================================================================== */
  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const res = document.execCommand('copy');
        ta.remove();
        return res;
      } catch { return false; }
    }
  }

  try {
    const toast = showToast('⏳ Capturing webpage…');

    // Pre-decode all images
    const images = Array.from(document.images || []);
    images.forEach(img => { img.decoding = 'sync'; img.loading = 'eager'; });
    await Promise.allSettled(images.map(img => img.decode().catch(() => {})));

    const assets = new AssetCollector();
    const fonts = new FontCollector();

    const root = serializeNode(document.documentElement, assets, fonts);
    const assetMap = await assets.getBlobMap();

    const payload = {
      version: 2,
      generator: 'HTML-2-Fig',
      documentTitle: document.title || 'Web Import',
      documentRect: { x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      viewportRect: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio || 1,
      root,
      assets: assetMap,
      fonts: fonts.getFonts()
    };

    const json = JSON.stringify(payload);
    const ok = await writeClipboard(json);

    try { toast.remove(); } catch {}

    if (ok) {
      showToast('✅ Captured! Open Figma plugin → Import from Clipboard', 6000);
    } else {
      showToast('⚠️ Capture complete. Please allow clipboard permissions.', 6000);
    }
  } catch (err) {
    console.error('[HTML-2-Fig] Capture error:', err);
    showToast('❌ Capture failed: ' + (err.message || err), 8000);
  } finally {
    window.__html2FigRunning = false;
  }
})();
