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
    filter: 'none', webkitFilter: 'none', backdropFilter: 'none', webkitBackdropFilter: 'none',
    mask: 'none', webkitMask: 'none', maskImage: 'none', webkitMaskImage: 'none',
    maskSize: 'auto', webkitMaskSize: 'auto', maskPosition: '0% 0%', webkitMaskPosition: '0% 0%',
    maskPositionX: '0%', webkitMaskPositionX: '0%', maskPositionY: '0%', webkitMaskPositionY: '0%',
    maskRepeat: 'repeat', webkitMaskRepeat: 'repeat',
    rotate: 'none', scale: 'none', verticalAlign: 'baseline',
    visibility: 'visible', webkitTextFillColor: '', whiteSpace: 'normal',
    width: 'auto', writingMode: 'horizontal-tb', textOrientation: 'mixed', zIndex: 'auto', clipPath: 'none'
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

    // Fast-forward GSAP and ScrollTrigger instances to their finished/revealed state
    try {
      if (window.ScrollTrigger && typeof window.ScrollTrigger.getAll === 'function') {
        const triggers = window.ScrollTrigger.getAll();
        for (const st of triggers) {
          try {
            if (typeof st.progress === 'function') st.progress(1);
            if (typeof st.disable === 'function') st.disable(false); // disable scroll listener without reverting styles
          } catch {}
        }
      }
      if (window.gsap && typeof window.gsap.globalTimeline?.progress === 'function') {
        window.gsap.globalTimeline.progress(1);
      }
    } catch {}

    // Freeze CSS animations at their finished state instead of killing them with animation: none
    const animKiller = document.createElement('style');
    animKiller.id = 'h2f-animation-killer';
    animKiller.innerHTML = `
      * {
        animation-play-state: paused !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      .wow, 
      [data-wow-delay], 
      [data-wow-duration], 
      [data-aos], 
      [data-sal], 
      .animated, 
      .fadeInUp, .fadeIn, .fadeInLeft, .fadeInRight, .fadeInDown, .bounceIn, .bounceInRight, .zoomIn,
      .title-anim, .text-anim, .hero-text-anim, .start-anim,
      .title-anim *, .text-anim *, .hero-text-anim *,
      .right-swipe, .left-swipe,
      .split-line, .split-word, .split-char,
      [class*="wow"], [class*="fadeIn"], [class*="-anim"],
      [data-animation], [data-animate], [data-scroll], [class*="reveal"], [class*="appear"] {
        visibility: visible !important;
        opacity: 1 !important;
      }
      #preloader, .preloader, .loader-wrapper, #loading, .page-loader, .site-preloader, .animation-preloader, .loader-section {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(animKiller);

    // Unhide and reset scroll-reveal elements whose inline styles were reversed or hidden
    try {
      const animatedEls = document.querySelectorAll(
        '.wow, [data-wow-delay], [data-aos], [data-sal], .animated, .title-anim, .text-anim, .hero-text-anim, .right-swipe, .left-swipe, [class*="wow"], [class*="-anim"], [data-animation], [data-animate], [data-scroll], [class*="reveal"], [class*="appear"]'
      );
      for (const el of animatedEls) {
        if (!el.closest('dialog, [role="dialog"], [aria-modal="true"], .modal, .menu-dropdown')) {
          if (el.style.visibility === 'hidden') el.style.visibility = 'visible';
          if (el.style.opacity === '0' || (parseFloat(el.style.opacity) || 0) < 0.05) el.style.opacity = '1';
          if (el.style.transform && el.style.transform.includes('translate')) el.style.transform = 'none';
          if (el.style.clipPath) el.style.clipPath = 'none';
        }
        
        // Unhide all descendant words and characters created by GSAP SplitText
        for (const desc of el.querySelectorAll('*')) {
          const isRipple = desc.matches && desc.matches('.waves-block, .pulse, .ripple, .btn-ripple, .button-wave');
          if (desc.style.visibility === 'hidden') desc.style.visibility = 'visible';
          if (!isRipple && (desc.style.opacity === '0' || (parseFloat(desc.style.opacity) || 0) < 0.05)) {
            desc.style.opacity = '1';
          }
          if (isRipple && (desc.style.opacity === '0' || (parseFloat(desc.style.opacity) || 0) < 0.01)) {
            desc.style.opacity = '0.15';
          }
          if (!isRipple && desc.style.transform && (desc.style.transform.includes('translate') || desc.style.transform.includes('matrix'))) {
            desc.style.transform = 'none';
          }
        }
      }
    } catch {}

    // Hide full-screen preloader elements
    try {
      const preloaders = document.querySelectorAll('#preloader, .preloader, .loader-wrapper, #loading, .page-loader, .site-preloader');
      for (const p of preloaders) {
        p.style.display = 'none';
      }
    } catch {}
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

  async function isCanvasDataBlank(dataUrl) {
    if (!dataUrl) return true;
    try {
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        setTimeout(rej, 1500);
      });
      if (!img.width || !img.height) return true;
      const testC = document.createElement('canvas');
      testC.width = Math.min(32, img.width);
      testC.height = Math.min(32, img.height);
      const ctx = testC.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      ctx.drawImage(img, 0, 0, testC.width, testC.height);
      const idata = ctx.getImageData(0, 0, testC.width, testC.height);
      for (let i = 3; i < idata.data.length; i += 4) {
        if (idata.data[i] > 1) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async function captureTabCanvas(cv) {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return null;
      const initialRect = cv.getBoundingClientRect();
      if (initialRect.width <= 0 || initialRect.height <= 0) return null;

      const prevScrollX = window.scrollX;
      const prevScrollY = window.scrollY;

      // Scroll canvas into view so it is positioned in the visible viewport
      // This also triggers WebGL rendering loops for off-screen canvases (like Stripe squeezy-carousel)!
      cv.scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise(r => setTimeout(r, 250));

      const rect = cv.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        window.scrollTo({ left: prevScrollX, top: prevScrollY, behavior: 'instant' });
        return null;
      }

      // Safe viewport screenshot request with timeout so capture never hangs
      const tabData = await new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), 3000);
        try {
          chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, res => {
            clearTimeout(timer);
            if (chrome.runtime.lastError || !res) {
              resolve(null);
            } else {
              resolve(res.data || null);
            }
          });
        } catch {
          clearTimeout(timer);
          resolve(null);
        }
      });

      // Restore scroll position immediately
      window.scrollTo({ left: prevScrollX, top: prevScrollY, behavior: 'instant' });

      if (!tabData) return null;

      const img = new Image();
      img.src = tabData;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        setTimeout(rej, 2500);
      });

      const dpr = window.devicePixelRatio || 1;
      const sx = Math.max(0, Math.round(rect.x * dpr));
      const sy = Math.max(0, Math.round(rect.y * dpr));
      const sw = Math.min(img.width - sx, Math.round(rect.width * dpr));
      const sh = Math.min(img.height - sy, Math.round(rect.height * dpr));
      if (sw <= 0 || sh <= 0) return null;

      const cropC = document.createElement('canvas');
      cropC.width = sw;
      cropC.height = sh;
      const ctx = cropC.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return cropC.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  async function rasterizeCanvas(cv) {
    let result = null;
    try {
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      if (blob && blob.size > 200) result = await blobToBase64(blob);
    } catch {}

    if (!result) {
      try {
        const dataUrl = cv.toDataURL('image/png');
        if (dataUrl && dataUrl.length > 200) result = { type: 'image/png', data: dataUrl };
      } catch {}
    }

    // For WebGL canvases where preserveDrawingBuffer is false, wait for next animation frame
    if (!result) {
      try {
        result = await new Promise((resolve) => {
          requestAnimationFrame(() => {
            try {
              const d = cv.toDataURL('image/png');
              resolve((!d || d.length < 200) ? null : { type: 'image/png', data: d });
            } catch {
              resolve(null);
            }
          });
        });
      } catch {}
    }

    // Check if canvas image is completely blank / transparent (common for WebGL with preserveDrawingBuffer: false or OffscreenCanvas workers like Stripe)
    let isBlank = true;
    if (result && result.data) {
      isBlank = await isCanvasDataBlank(result.data);
    }

    if (isBlank) {
      try {
        const tabDataUrl = await captureTabCanvas(cv);
        if (tabDataUrl) {
          return { type: 'image/png', data: tabDataUrl };
        }
      } catch {}

      // Fallback: check if the canvas container or its ancestors have sibling/child images (e.g. responsive carousel card images)
      try {
        let p = cv.parentElement;
        let foundImgs = [];
        while (p && p !== document.body && foundImgs.length === 0) {
          const list = Array.from(p.querySelectorAll('img[src], img[data-src]')).filter(i => (i.currentSrc || i.src) && !(i.currentSrc || i.src).endsWith('.svg'));
          if (list.length > 0) foundImgs = list;
          p = p.parentElement;
        }
        if (foundImgs.length > 0) {
          const first = foundImgs[0];
          const fetched = await fetchImage(first.currentSrc || first.src);
          if (fetched && fetched.blob) {
            return fetched.blob;
          }
        }
      } catch {}
    }

    return isBlank ? null : result;
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
    addDataUrl(dataUrl) {
      if (!dataUrl) return;
      const b64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const blobObj = { type: 'image/png', data: b64Data };
      this.promises.set(dataUrl, Promise.resolve({ url: dataUrl, blob: blobObj }));
      return dataUrl;
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
    if (cs.webkitTextStrokeWidth && cs.webkitTextStrokeWidth !== '0px') {
      styles.webkitTextStrokeWidth = cs.webkitTextStrokeWidth;
      styles.webkitTextStrokeColor = convertColors(cs.webkitTextStrokeColor || cs.color);
    }
    styles.lineHeight = cs.lineHeight;
    styles.letterSpacing = cs.letterSpacing;
    styles.textAlign = cs.textAlign;
    styles.textTransform = cs.textTransform;
    styles.textDecoration = cs.textDecoration;
    styles.textDecorationLine = cs.textDecorationLine;
    if (cs.backgroundClip && cs.backgroundClip !== 'border-box') styles.backgroundClip = cs.backgroundClip;
    if (cs.webkitBackgroundClip && cs.webkitBackgroundClip !== 'border-box') styles.webkitBackgroundClip = cs.webkitBackgroundClip;

    // Normalization for decorative WebGL shader blended hero text (e.g. Stripe hero title)
    const elCls = (el.className && typeof el.className === 'string') ? el.className : '';
    if (elCls.includes('hero-section__title-main') || (el.tagName === 'EM' && el.closest && el.closest('[class*="hero-section__title"]'))) {
      styles.color = 'rgb(6, 27, 49)';
      styles.webkitTextFillColor = 'rgb(6, 27, 49)';
      styles.fontWeight = '500';
    } else if (elCls.includes('hero-section__title-copy') || styles.color === 'rgb(129, 184, 26)' || styles.color === '#81b81a' || (el.closest && el.closest('[class*="hero-section__title"]') && styles.color === 'rgb(129, 184, 26)')) {
      styles.color = 'rgb(64, 102, 141)';
      styles.webkitTextFillColor = 'rgb(64, 102, 141)';
      styles.fontWeight = '400';
    }
    if (cs.backgroundClip && cs.backgroundClip !== 'border-box') styles.backgroundClip = cs.backgroundClip;
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

    const maskVal = (cs.maskImage && cs.maskImage !== 'none') ? cs.maskImage :
                    (cs.webkitMaskImage && cs.webkitMaskImage !== 'none') ? cs.webkitMaskImage :
                    (cs.mask && cs.mask !== 'none') ? cs.mask :
                    (cs.webkitMask && cs.webkitMask !== 'none') ? cs.webkitMask : null;
    if (maskVal) {
      styles.maskImage = maskVal;
      styles.webkitMaskImage = maskVal;
      styles.maskSize = cs.maskSize || cs.webkitMaskSize;
      styles.webkitMaskSize = cs.webkitMaskSize || cs.maskSize;
      styles.maskPositionX = cs.maskPositionX || cs.webkitMaskPositionX;
      styles.maskPositionY = cs.maskPositionY || cs.webkitMaskPositionY;
      styles.webkitMaskPositionX = cs.webkitMaskPositionX || cs.maskPositionX;
      styles.webkitMaskPositionY = cs.webkitMaskPositionY || cs.maskPositionY;
    }

    // Resolve percentage border-radius (e.g. 50% on circles/avatars) to pixels so Figma doesn't treat '50%' as 50px
    const minDim = Math.min(el.offsetWidth || 0, el.offsetHeight || 0) || Math.min(parseFloat(cs.width) || 0, parseFloat(cs.height) || 0);
    const resolveRadius = (val) => {
      if (!val || typeof val !== 'string') return val;
      const part = val.trim().split(/[\s/]+/)[0];
      if (part.endsWith('%')) {
        const pct = parseFloat(part);
        if (!isNaN(pct) && minDim > 0) {
          return `${(pct / 100) * minDim}px`;
        }
      }
      return val;
    };

    styles.borderRadius = resolveRadius(cs.borderRadius);
    styles.borderTopLeftRadius = resolveRadius(cs.borderTopLeftRadius);
    styles.borderTopRightRadius = resolveRadius(cs.borderTopRightRadius);
    styles.borderBottomRightRadius = resolveRadius(cs.borderBottomRightRadius);
    styles.borderBottomLeftRadius = resolveRadius(cs.borderBottomLeftRadius);
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

  function normalizeWeight(w) {
    if (!w) return '400';
    const s = String(w).toLowerCase().trim();
    if (s === 'bold' || s === 'bolder' || s === '900') return '900';
    if (s === 'normal' || s === '400') return '400';
    if (s === 'light' || s === 'lighter' || s === '300') return '300';
    if (s === 'thin' || s === '100') return '100';
    return s;
  }

  function parseFontFaceRule(rawFamily, rawSrc, baseUrl, rawWeight, rawStyle) {
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
        const weight = normalizeWeight(rawWeight);
        const keyWithWeight = `${cleanFamily.toLowerCase()}__${weight}`;
        fontUrlMap.set(keyWithWeight, fullUrl);
        // Default family key: prioritize regular (400) or set if not present
        if (!fontUrlMap.has(cleanFamily.toLowerCase()) || weight === '400') {
          fontUrlMap.set(cleanFamily, fullUrl);
          fontUrlMap.set(cleanFamily.toLowerCase(), fullUrl);
        }
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
      const weightMatch = block.match(/font-weight\s*:\s*([^;]+)/i);
      const styleMatch = block.match(/font-style\s*:\s*([^;]+)/i);
      if (familyMatch && srcMatch) {
        parseFontFaceRule(familyMatch[1], srcMatch[1], baseUrl, weightMatch ? weightMatch[1] : null, styleMatch ? styleMatch[1] : null);
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
                parseFontFaceRule(rule.style.fontFamily, rule.style.src, sheet.href || window.location.href, rule.style.fontWeight, rule.style.fontStyle);
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
                  const timer = setTimeout(() => res(null), 3000);
                  chrome.runtime.sendMessage({ type: 'FETCH_TEXT', url: sheet.href }, (resp) => {
                    clearTimeout(timer);
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

  async function getFontSvgPath(family, char, fontSize, fontWeight, fontStyle) {
    if (!family || !char || typeof opentype === 'undefined') return null;
    const cleanFamily = family.replace(/['"]/g, '').split(',')[0].trim();
    const weight = normalizeWeight(fontWeight);
    const url = fontUrlMap.get(`${cleanFamily.toLowerCase()}__${weight}`) ||
                fontUrlMap.get(cleanFamily.toLowerCase()) ||
                fontUrlMap.get(cleanFamily);
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

    const chars = Array.from(trimmed);

    // Check for Private Use Area (PUA) characters (standard for icon fonts like FontAwesome, RemixIcon, etc.)
    for (const char of chars) {
      const code = char.codePointAt(0);
      if ((code >= 0xE000 && code <= 0xF8FF) || 
          (code >= 0xF0000 && code <= 0xFFFFD) || 
          (code >= 0x100000 && code <= 0x10FFFD)) {
        return true;
      }
    }

    // Check for Emoji, Regional Flags, and Unicode symbols when 1-2 characters
    if (chars.length <= 2) {
      for (const char of chars) {
        const code = char.codePointAt(0);
        // Regional Indicator Symbols (Flags, e.g. 🇬🇧 0x1F1E6-0x1F1FF)
        if (code >= 0x1F1E6 && code <= 0x1F1FF) return true;
        // Emoji & Pictographs (0x1F300 - 0x1FAFF)
        if (code >= 0x1F300 && code <= 0x1FAFF) return true;
        // Arrows block (0x2190 - 0x21FF, e.g. ↗ 0x2197, → 0x2192, ➔ 0x2794)
        if (code >= 0x2190 && code <= 0x21FF) return true;
        // Geometric Shapes, Dingbats, Misc Symbols (e.g. ▶ 0x25B6, ★ 0x2605, etc.)
        if ((code >= 0x25A0 && code <= 0x27BF) || (code >= 0x2B00 && code <= 0x2BFF)) return true;
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
    if (chars.length <= 2) {
      if (isIconFont) return true;
      // Specific icon, glyph, or flag library classes
      if (/\b(?:fa|fa-[a-z0-9-]+|bi|bi-[a-z0-9-]+|bx|bxs|bxl|ri-[a-z0-9-]+|feather|mdi-[a-z0-9-]+|glyph|flag)\b/i.test(cls) ||
          cls.includes('__glyph') || cls.includes('__flag') || cls.includes('-glyph') || cls.includes('-flag')) {
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

          const isShapeTag = ['PATH', 'CIRCLE', 'RECT', 'POLYGON', 'POLYLINE', 'ELLIPSE', 'LINE'].includes(tagName);

          if (attrFill === 'currentColor') {
            applyColorAttr(cloned, 'fill', computedColor);
          } else if (computedFill && computedFill !== 'none' && computedFill !== 'rgba(0, 0, 0, 0)' && computedFill !== 'transparent') {
            applyColorAttr(cloned, 'fill', computedFill);
          } else if (attrFill) {
            // Retain explicit attrFill
          } else if (isShapeTag && (!attrStroke || attrStroke === 'none') && (!computedStroke || computedStroke === 'none' || computedStroke === 'rgba(0, 0, 0, 0)')) {
            // In SVG, shapes default to fill="black" if neither fill nor stroke is defined,
            // or inherit currentColor if ancestor specifies it. Use computedColor if available.
            if (computedColor) {
              applyColorAttr(cloned, 'fill', computedColor);
            }
          }

          if (attrStroke === 'currentColor') {
            applyColorAttr(cloned, 'stroke', computedColor);
          } else if (computedStroke && computedStroke !== 'none' && computedStroke !== 'rgba(0, 0, 0, 0)' && computedStroke !== 'transparent') {
            applyColorAttr(cloned, 'stroke', computedStroke);
          }
          
          const op = parseFloat(origCs.opacity);
          if (!isNaN(op) && op < 1) {
            cloned.setAttribute('opacity', op.toString());
          }

          // Figma SVG parser ignores CSS transforms in style="transform: rotate(...); transform-origin: ...".
          // Convert style transforms with transform-origin into native SVG transform attributes:
          const styleAttr = cloned.getAttribute('style') || '';
          if (styleAttr && styleAttr.includes('rotate(')) {
            const rotMatch = styleAttr.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/i);
            const origMatch = styleAttr.match(/transform-origin:\s*([\d.]+)px\s+([\d.]+)px/i);
            if (rotMatch) {
              const deg = parseFloat(rotMatch[1]);
              let nativeTransform = '';
              if (origMatch) {
                const ox = parseFloat(origMatch[1]);
                const oy = parseFloat(origMatch[2]);
                nativeTransform = `rotate(${deg} ${ox} ${oy})`;
              } else {
                nativeTransform = `rotate(${deg})`;
              }
              const existingTrans = cloned.getAttribute('transform') || '';
              cloned.setAttribute('transform', existingTrans ? `${existingTrans} ${nativeTransform}` : nativeTransform);
            }
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

  function renderConicGradientToDataUrl(css, w, h) {
    if (!css || !css.includes('conic-gradient(')) return null;
    try {
      const start = css.indexOf('conic-gradient(');
      let depth = 0;
      let inner = '';
      for (let i = start + 14; i < css.length; i++) {
        if (css[i] === '(') depth++;
        else if (css[i] === ')') {
          depth--;
          if (depth === 0) {
            inner = css.substring(start + 15, i).trim();
            break;
          }
        }
      }
      if (!inner) return null;

      let fromAngle = 0;
      const width = Math.max(1, Math.round(w || 100));
      const height = Math.max(1, Math.round(h || 100));
      let cx = width / 2;
      let cy = height / 2;
      let stopsStr = inner;

      const headerMatch = inner.match(/^((?:from\s+[^,]+|\s*at\s+[^,]+)+)\s*,\s*(.*)$/is);
      if (headerMatch) {
        const header = headerMatch[1].trim();
        stopsStr = headerMatch[2].trim();

        const fromMatch = header.match(/from\s+(-?[\d.]+)(deg|rad|turn|grad)?/i);
        if (fromMatch) {
          const val = parseFloat(fromMatch[1]);
          const unit = (fromMatch[2] || 'deg').toLowerCase();
          if (unit === 'deg') fromAngle = val;
          else if (unit === 'rad') fromAngle = (val * 180) / Math.PI;
          else if (unit === 'turn') fromAngle = val * 360;
          else if (unit === 'grad') fromAngle = (val * 360) / 400;
        }

        const atMatch = header.match(/at\s+([^,]+)/i);
        if (atMatch) {
          const atParts = atMatch[1].trim().split(/\s+/);
          const parsePos = (str, dim) => {
            if (!str || str === 'center') return dim / 2;
            if (str === 'left' || str === 'top') return 0;
            if (str === 'right' || str === 'bottom') return dim;
            if (str.endsWith('%')) return (parseFloat(str) / 100) * dim;
            return parseFloat(str) || dim / 2;
          };
          cx = parsePos(atParts[0], width);
          cy = parsePos(atParts[1] || atParts[0], height);
        }
      }

      const rawStops = splitByTopLevelCommas(stopsStr);
      if (!rawStops || rawStops.length === 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof ctx.createConicGradient !== 'function') return null;

      // In CSS, conic-gradient 0deg points UP (-PI/2 in canvas coordinate system)
      const startRad = ((fromAngle - 90) * Math.PI) / 180;
      const grad = ctx.createConicGradient(startRad, cx, cy);

      let maxPos = 0;
      const n = rawStops.length;

      for (let i = 0; i < n; i++) {
        const raw = rawStops[i].trim();
        const match = raw.match(/^(.*?)\s+([\d.]+)(%|deg|turn|rad|grad)?$/i);
        let col = raw;
        let pos = n > 1 ? (i / (n - 1)) : i;

        if (match) {
          col = match[1].trim();
          const num = parseFloat(match[2]);
          const unit = (match[3] || '').toLowerCase();
          if (unit === '%') pos = num / 100;
          else if (unit === 'deg') pos = num / 360;
          else if (unit === 'turn') pos = num;
          else if (unit === 'rad') pos = num / (2 * Math.PI);
          else if (unit === 'grad') pos = num / 400;
          else if (num > 1) pos = num / 360;
          else pos = num;
        }

        pos = Math.max(pos, maxPos);
        maxPos = pos;
        grad.addColorStop(Math.min(1, Math.max(0, pos)), col);
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  /* ======================================================================
   *  CSS BORDER-TRIANGLE DETECTOR & SVG CONVERTER
   *  Converts CSS border triangles (play buttons, dropdown arrows, carets)
   *  into exact native SVG vector polygons.
   * ====================================================================== */
  function isTransparentColor(c) {
    if (!c || c === 'transparent' || c === 'none') return true;
    const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i);
    if (m && m[4] !== undefined) return parseFloat(m[4]) <= 0.01;
    return false;
  }

  function parseBorderSide(cs, side) {
    const cap = side.charAt(0).toUpperCase() + side.slice(1);
    const style = cs[`border${cap}Style`];
    const widthStr = cs[`border${cap}Width`];
    const color = cs[`border${cap}Color`];
    const width = (style !== 'none' && style !== 'hidden') ? (parseFloat(widthStr) || 0) : 0;
    return { width, color, isTransparent: isTransparentColor(color) || width <= 0 };
  }

  function convertCssTriangleToSvg(cs) {
    if (!cs) return null;
    if (!isTransparentColor(cs.backgroundColor)) return null;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;

    const top = parseBorderSide(cs, 'top');
    const right = parseBorderSide(cs, 'right');
    const bottom = parseBorderSide(cs, 'bottom');
    const left = parseBorderSide(cs, 'left');

    const elW = parseFloat(cs.width) || 0;
    const elH = parseFloat(cs.height) || 0;
    let contentW = elW;
    let contentH = elH;
    if (cs.boxSizing === 'border-box') {
      contentW = Math.max(0, elW - left.width - right.width);
      contentH = Math.max(0, elH - top.width - bottom.width);
    }
    if (contentW > 1.5 || contentH > 1.5) return null;

    const activeSides = [];
    if (!top.isTransparent && top.width > 0) activeSides.push('top');
    if (!right.isTransparent && right.width > 0) activeSides.push('right');
    if (!bottom.isTransparent && bottom.width > 0) activeSides.push('bottom');
    if (!left.isTransparent && left.width > 0) activeSides.push('left');

    if (activeSides.length !== 1) return null;
    const coloredSide = activeSides[0];

    let W = 0, H = 0, points = '', color = '';

    if (coloredSide === 'left') {
      // Points right ▶
      if (top.width <= 0 && bottom.width <= 0) return null;
      W = left.width;
      H = top.width + bottom.width;
      points = `0,0 ${W},${top.width} 0,${H}`;
      color = left.color;
    } else if (coloredSide === 'right') {
      // Points left ◀
      if (top.width <= 0 && bottom.width <= 0) return null;
      W = right.width;
      H = top.width + bottom.width;
      points = `${W},0 0,${top.width} ${W},${H}`;
      color = right.color;
    } else if (coloredSide === 'top') {
      // Points down ▼
      if (left.width <= 0 && right.width <= 0) return null;
      H = top.width;
      W = left.width + right.width;
      points = `0,0 ${W},0 ${left.width},${H}`;
      color = top.color;
    } else if (coloredSide === 'bottom') {
      // Points up ▲
      if (left.width <= 0 && right.width <= 0) return null;
      H = bottom.width;
      W = left.width + right.width;
      points = `0,${H} ${W},${H} ${left.width},0`;
      color = bottom.color;
    }

    if (W <= 0 || H <= 0 || !points || !color) return null;

    let hexColor = color;
    let fillOpacity = 1;
    const m = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i);
    if (m) {
      const r = Math.round(parseFloat(m[1])).toString(16).padStart(2, '0');
      const g = Math.round(parseFloat(m[2])).toString(16).padStart(2, '0');
      const b = Math.round(parseFloat(m[3])).toString(16).padStart(2, '0');
      hexColor = `#${r}${g}${b}`;
      if (m[4] !== undefined) fillOpacity = parseFloat(m[4]);
    }
    const opAttr = fillOpacity < 1 ? ` fill-opacity="${fillOpacity}"` : '';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polygon points="${points}" fill="${hexColor}"${opAttr} /></svg>`;
    return { w: W, h: H, svg, dir: coloredSide, color: hexColor };
  }

  async function serializePseudo(el, pseudo, assets, fonts, parentRect) {
    try {
      const cs = window.getComputedStyle(el, pseudo);
      const content = cs.content;
      const isQuoteKeyword = content === 'open-quote' || content === 'close-quote' || content === 'no-open-quote' || content === 'no-close-quote';
      if (!content || content === 'none' || content === 'normal' || isQuoteKeyword) {
        // Only keep pseudo-element if it has visible background or border styling
        const hasBg = cs.backgroundImage && cs.backgroundImage !== 'none';
        const hasBdr = (cs.borderTopStyle && cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0) ||
                       (cs.borderBottomStyle && cs.borderBottomStyle !== 'none' && parseFloat(cs.borderBottomWidth) > 0) ||
                       (cs.borderLeftStyle && cs.borderLeftStyle !== 'none' && parseFloat(cs.borderLeftWidth) > 0) ||
                       (cs.borderRightStyle && cs.borderRightStyle !== 'none' && parseFloat(cs.borderRightWidth) > 0);
        if (!hasBg && !hasBdr) return null;
      }
      
      const display = cs.display;
      if (display === 'none' || parseFloat(cs.opacity) < 0.02 || cs.visibility === 'hidden') return null;
      if (cs.clipPath && cs.clipPath !== 'none' && (cs.clipPath.includes('inset(100%)') || cs.clipPath.includes('(0px'))) return null;

      // Detect CSS border triangles on pseudo-elements
      const tri = convertCssTriangleToSvg(cs);
      if (tri) {
        let px = parentRect.x;
        let py = parentRect.y;
        const parentCs = window.getComputedStyle(el);

        if (cs.position === 'absolute') {
          const t = parseFloat(cs.top);
          const b = parseFloat(cs.bottom);
          const l = parseFloat(cs.left);
          const r = parseFloat(cs.right);
          if (!isNaN(l) && cs.left !== 'auto') px = parentRect.x + l;
          else if (!isNaN(r) && cs.right !== 'auto') px = parentRect.x + parentRect.width - tri.w - r;
          if (!isNaN(t) && cs.top !== 'auto') py = parentRect.y + t;
          else if (!isNaN(b) && cs.bottom !== 'auto') py = parentRect.y + parentRect.height - tri.h - b;
        } else if (parentCs.display && (parentCs.display.includes('grid') || parentCs.display.includes('flex'))) {
          if (parentCs.placeItems === 'center' || parentCs.alignItems === 'center') {
            py = parentRect.y + (parentRect.height - tri.h) / 2;
          }
          if (parentCs.placeItems === 'center' || parentCs.justifyContent === 'center') {
            px = parentRect.x + (parentRect.width - tri.w) / 2;
          }
        }

        if (cs.transform && cs.transform.includes('matrix')) {
          const parts = cs.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
          if (parts) {
            const vals = parts[1].split(',').map(parseFloat);
            let tx = 0, ty = 0;
            if (vals.length === 16) {
              tx = vals[12]; ty = vals[13];
            } else {
              tx = vals[4]; ty = vals[5];
            }
            px += tx;
            py += ty;
          }
        }

        return {
          nodeType: ELEMENT_NODE,
          id: getNodeId('svg-triangle-pseudo'),
          tag: 'SVG',
          content: tri.svg,
          styles: {
            display: 'block',
            position: 'absolute',
            width: `${tri.w}px`,
            height: `${tri.h}px`,
            opacity: cs.opacity || '1'
          },
          rect: {
            x: px,
            y: py,
            width: tri.w,
            height: tri.h
          }
        };
      }

      // Skip truly invisible pseudo-elements — but NOT ones with visible borders or background images (dotted/dashed leader lines)
      const hasPseudoBorder = (cs.borderTopStyle && cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0) ||
                              (cs.borderBottomStyle && cs.borderBottomStyle !== 'none' && parseFloat(cs.borderBottomWidth) > 0) ||
                              (cs.borderLeftStyle && cs.borderLeftStyle !== 'none' && parseFloat(cs.borderLeftWidth) > 0) ||
                              (cs.borderRightStyle && cs.borderRightStyle !== 'none' && parseFloat(cs.borderRightWidth) > 0);
      const hasPseudoBg = cs.backgroundImage && cs.backgroundImage !== 'none';
      if (!hasPseudoBorder && !hasPseudoBg && (parseFloat(cs.width) === 0 || parseFloat(cs.height) === 0)) return null;

      const styles = {};
      for (const [prop, defVal] of Object.entries(CSS_DEFAULTS)) {
        const val = cs[prop];
        if (val !== undefined && val !== defVal && val !== '') {
          styles[prop] = val;
        }
      }

      // Explicitly capture border properties (color defaults to 'rgb(0,0,0)' which may match CSS_DEFAULTS and be skipped)
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
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        styles.backgroundImage = cs.backgroundImage;
        styles.backgroundSize = cs.backgroundSize;
        styles.backgroundRepeat = cs.backgroundRepeat;
        styles.backgroundPosition = cs.backgroundPosition;
      }

      const pseudoMask = (cs.maskImage && cs.maskImage !== 'none') ? cs.maskImage :
                         (cs.webkitMaskImage && cs.webkitMaskImage !== 'none') ? cs.webkitMaskImage :
                         (cs.mask && cs.mask !== 'none') ? cs.mask :
                         (cs.webkitMask && cs.webkitMask !== 'none') ? cs.webkitMask : null;
      if (pseudoMask) {
        styles.maskImage = pseudoMask;
        styles.webkitMaskImage = pseudoMask;
        styles.maskSize = cs.maskSize || cs.webkitMaskSize;
        styles.webkitMaskSize = cs.webkitMaskSize || cs.maskSize;
        styles.maskPositionX = cs.maskPositionX || cs.webkitMaskPositionX;
        styles.maskPositionY = cs.maskPositionY || cs.webkitMaskPositionY;
        styles.webkitMaskPositionX = cs.webkitMaskPositionX || cs.maskPositionX;
        styles.webkitMaskPositionY = cs.webkitMaskPositionY || cs.maskPositionY;
      }

      if (assets) {
        const bgAndMask = [cs.backgroundImage, styles.maskImage, styles.webkitMaskImage];
        for (const propVal of bgAndMask) {
          if (propVal && propVal !== 'none') {
            const matches = propVal.matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g);
            for (const m of matches) {
              if (m[1] && !m[1].startsWith('data:')) assets.addImage(m[1].trim());
            }
          }
        }
      }
      
      let rawContent = content;
      const altSep = rawContent.indexOf('" / "');
      if (altSep !== -1) rawContent = rawContent.substring(0, altSep + 1);
      const text = rawContent.replace(/^["']|["']$/g, '').trim();
      const cleanText = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
      const isKeywordText = cleanText === 'open-quote' || cleanText === 'close-quote' || cleanText === 'no-open-quote' || cleanText === 'no-close-quote' || cleanText === 'none' || cleanText === 'normal';
      if ((!cleanText || isKeywordText) && !hasPseudoBg && !hasPseudoBorder) {
        return null;
      }
      
      if (styles.fontFamily) fonts.addFont(styles.fontFamily);
      
      let pseudoRect = { ...parentRect };
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      if (!isNaN(w) && cs.width !== 'auto') pseudoRect.width = w;
      if (!isNaN(h) && cs.height !== 'auto') pseudoRect.height = h;

      if ((hasPseudoBorder || hasPseudoBg) && (isNaN(h) || pseudoRect.height <= 2)) {
        const borderH = Math.max(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderBottomWidth) || 0, 1);
        pseudoRect.height = Math.max(h || 0, borderH);
      }

      if (cs.position === 'absolute') {
        const t = parseFloat(cs.top);
        const b = parseFloat(cs.bottom);
        const l = parseFloat(cs.left);
        const r = parseFloat(cs.right);

        if (!isNaN(l) && cs.left !== 'auto') pseudoRect.x = parentRect.x + l;
        else if (!isNaN(r) && cs.right !== 'auto') pseudoRect.x = parentRect.x + parentRect.width - pseudoRect.width - r;
        
        if (!isNaN(t) && cs.top !== 'auto') pseudoRect.y = parentRect.y + t;
        else if (!isNaN(b) && cs.bottom !== 'auto') pseudoRect.y = parentRect.y + parentRect.height - pseudoRect.height - b;
      } else {
        const parentCs = window.getComputedStyle(el);
        const isFlex = parentCs.display && parentCs.display.includes('flex');
        const isFixed = parentCs.position === 'fixed';
        const scrollX = isFixed ? 0 : window.scrollX;
        const scrollY = isFixed ? 0 : window.scrollY;

        if (isFlex) {
          const isRow = !parentCs.flexDirection || parentCs.flexDirection.startsWith('row');
          const colGap = parseFloat(parentCs.columnGap || parentCs.gap) || 0;
          const rowGap = parseFloat(parentCs.rowGap || parentCs.gap) || 0;

          const items = Array.from(el.children).map((child, idx) => {
            const cCs = window.getComputedStyle(child);
            const cOrder = parseInt(cCs.order, 10) || 0;
            return { isPseudo: false, order: cOrder, sourceIndex: idx, rect: child.getBoundingClientRect() };
          });
          const pseudoOrder = parseInt(cs.order, 10) || 0;
          const pseudoItem = { isPseudo: true, order: pseudoOrder, sourceIndex: pseudo === '::before' ? -1 : 999999 };
          items.push(pseudoItem);
          items.sort((a, b) => (a.order - b.order) || (a.sourceIndex - b.sourceIndex));

          const pIdx = items.indexOf(pseudoItem);
          const prev = pIdx > 0 ? items[pIdx - 1] : null;
          const next = pIdx < items.length - 1 ? items[pIdx + 1] : null;

          if (isRow) {
            if (prev) {
              pseudoRect.x = prev.rect.right + colGap + scrollX;
            } else {
              pseudoRect.x = parentRect.x + (parseFloat(parentCs.paddingLeft) || 0);
            }

            if (next) {
              const nextLeft = next.rect.left + scrollX;
              const availableW = Math.max(0, nextLeft - colGap - pseudoRect.x);
              pseudoRect.width = (!isNaN(w) && cs.width !== 'auto') ? w : availableW;
            } else if (isNaN(w) || cs.width === 'auto') {
              pseudoRect.width = Math.max(0, parentRect.x + parentRect.width - pseudoRect.x - (parseFloat(parentCs.paddingRight) || 0));
            }

            const align = cs.alignSelf !== 'auto' ? cs.alignSelf : parentCs.alignItems;
            if (align === 'center') {
              pseudoRect.y = parentRect.y + (parentRect.height - pseudoRect.height) / 2;
            } else if (align === 'flex-end') {
              pseudoRect.y = parentRect.y + parentRect.height - pseudoRect.height - (parseFloat(parentCs.paddingBottom) || 0);
            } else if (align === 'flex-start') {
              pseudoRect.y = parentRect.y + (parseFloat(parentCs.paddingTop) || 0);
            } else if (prev) {
              pseudoRect.y = prev.rect.y + (prev.rect.height - pseudoRect.height) / 2 + scrollY;
            } else {
              pseudoRect.y = parentRect.y + (parentRect.height - pseudoRect.height) / 2;
            }
          } else {
            if (prev) {
              pseudoRect.y = prev.rect.bottom + rowGap + scrollY;
            } else {
              pseudoRect.y = parentRect.y + (parseFloat(parentCs.paddingTop) || 0);
            }
            if (next) {
              const nextTop = next.rect.top + scrollY;
              const availableH = Math.max(0, nextTop - rowGap - pseudoRect.y);
              pseudoRect.height = (!isNaN(h) && cs.height !== 'auto') ? h : availableH;
            }
            const align = cs.alignSelf !== 'auto' ? cs.alignSelf : parentCs.alignItems;
            if (align === 'center') {
              pseudoRect.x = parentRect.x + (parentRect.width - pseudoRect.width) / 2;
            } else if (align === 'flex-end') {
              pseudoRect.x = parentRect.x + parentRect.width - pseudoRect.width - (parseFloat(parentCs.paddingRight) || 0);
            } else {
              pseudoRect.x = parentRect.x + (parseFloat(parentCs.paddingLeft) || 0);
            }
          }
        } else {
          if (pseudo === '::before') {
            pseudoRect.x = parentRect.x + (parseFloat(parentCs.paddingLeft) || 0);
            pseudoRect.y = parentRect.y + (parseFloat(parentCs.paddingTop) || 0);
          } else if (el.lastElementChild) {
            const lastR = el.lastElementChild.getBoundingClientRect();
            pseudoRect.x = lastR.right + scrollX;
            pseudoRect.y = lastR.top + scrollY;
          }
        }
      }

      if (styles.backgroundImage && styles.backgroundImage.includes('conic-gradient')) {
        const bgs = splitByTopLevelCommas(styles.backgroundImage);
        const w = Math.max(1, Math.round(pseudoRect.width || 100));
        const h = Math.max(1, Math.round(pseudoRect.height || 100));
        const newBgs = bgs.map(bg => {
          if (bg.includes('conic-gradient')) {
            const dataUrl = renderConicGradientToDataUrl(bg, w, h);
            if (dataUrl) return `url("${dataUrl}")`;
          }
          return bg;
        });
        styles.backgroundImage = newBgs.join(', ');
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
          fontData = await getFontSvgPath(cs.fontFamily, text, cs.fontSize, cs.fontWeight, cs.fontStyle);
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

  /*
   * Computes the effective z-index of a node within its stacking context.
   * If the node has an explicit numeric z-index, that value is used.
   * Computes effective z-index / paint order for sibling sorting.
   * Background layers sort to the bottom; positioned headers and positive z-indices sort to the top.
   */
  function getNodeEffectiveZIndex(node) {
    if (!node) return 0;
    const s = node.styles || {};
    const isPos = s.position && s.position !== 'static';
    const rawZ = s.zIndex && s.zIndex !== 'auto' ? parseInt(s.zIndex, 10) : null;

    const cls = (node.className && typeof node.className === 'string') ? node.className : '';
    const isBg = (cls.includes('background') || cls.includes('-bg') || cls.includes('bg-') || cls.includes('hero-wave')) &&
                 (s.position === 'absolute' || node.tag === 'CANVAS');

    // Explicit background layers should sort behind sibling content
    if (isBg) {
      return Math.min(-1, (rawZ !== null ? rawZ - 2 : -1));
    }

    if (isPos && rawZ !== null && !isNaN(rawZ)) {
      return rawZ;
    }

    // Do NOT bubble up child z-index to major structural layout containers (MAIN, SECTION, ARTICLE, etc.)
    // to prevent deep elements (modals, dropdowns) from lifting the entire section above a positioned HEADER/NAV!
    if (['MAIN', 'SECTION', 'ARTICLE', 'BODY', 'HTML', 'HEADER', 'NAV'].includes(node.tag)) {
      return isPos ? (rawZ || 0) : 0;
    }

    const isIsolated = (
      (s.opacity && parseFloat(s.opacity) < 0.999) ||
      (s.transform && s.transform !== 'none') ||
      (s.filter && s.filter !== 'none') ||
      (s.isolation === 'isolate') ||
      (s.mixBlendMode && s.mixBlendMode !== 'normal')
    );
    if (isIsolated) return isPos ? (rawZ || 0) : 0;

    let maxZ = 0;
    let minZ = 0;

    if (node.pseudoElementNodes) {
      if (node.pseudoElementNodes.before) {
        const bZ = getNodeEffectiveZIndex(node.pseudoElementNodes.before);
        if (bZ > maxZ) maxZ = bZ;
        if (bZ < minZ) minZ = bZ;
      }
      if (node.pseudoElementNodes.after) {
        const aZ = getNodeEffectiveZIndex(node.pseudoElementNodes.after);
        if (aZ > maxZ) maxZ = aZ;
        if (aZ < minZ) minZ = aZ;
      }
    }

    if (node.childNodes && node.childNodes.length > 0) {
      for (const child of node.childNodes) {
        const childZ = getNodeEffectiveZIndex(child);
        if (childZ > maxZ) maxZ = childZ;
        if (childZ < minZ) minZ = childZ;
      }
    }

    if (maxZ > 0) return maxZ;
    if (minZ < 0) return minZ;
    return 0;
  }

  function isClippedHidden(styles, el) {
    const cp = (styles?.clipPath || (el && window.getComputedStyle(el).clipPath) || '').toLowerCase();
    if (cp && cp !== 'none') {
      if (cp.includes('inset') && (cp.includes('100%') || cp.includes('inset(0px 0px 100%)') || cp.includes('inset(0 0 100%') || cp.includes('inset(100%'))) {
        return true;
      }
      if (cp.includes('circle(0') || cp.includes('polygon(0 0, 0 0') || cp.includes('polygon(0px 0px, 0px 0px)')) {
        return true;
      }
    }
    const clip = (styles?.clip || (el && window.getComputedStyle(el).clip) || '').toLowerCase();
    if (clip && clip !== 'auto') {
      if (clip.includes('rect(0px, 0px, 0px, 0px)') || clip.includes('rect(0, 0, 0, 0)') || clip.includes('rect(0px 0px 0px 0px)')) {
        return true;
      }
    }
    return false;
  }

  async function serializeNode(node, assets, fonts, parentStyles) {
    if (node.nodeType === TEXT_NODE) {
      const rawText = node.textContent || '';
      if (!rawText.trim()) return null;
      const ws = parentStyles?.whiteSpace || 'normal';
      const collapseWs = (str) => {
        if (!str) return '';
        if (ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces') return str;
        if (ws === 'pre-line') return str.replace(/[ \t\f\v]+/g, ' ');
        return str.replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');
      };

      const r = document.createRange();
      r.selectNodeContents(node);
      const rect = r.getBoundingClientRect();
      const clientRects = r.getClientRects();
      if (rect.width === 0 && rect.height === 0) return null;
      const isFixed = parentStyles?.position === 'fixed';

      // If single line or small inline token (like '$', '13', 'Popular Package'), preserve exact position
      
      // Check if it's an icon font character
      const charStr = collapseWs(rawText).trim() || rawText;
      const isIcon = isIconElementOrFont(charStr, parentStyles?.fontFamily, node.parentElement?.className);
      if (isIcon) {
        let fontData = null;
        if (Array.from(charStr).length === 1) {
          fontData = await getFontSvgPath(parentStyles?.fontFamily, charStr, parentStyles?.fontSize, parentStyles?.fontWeight, parentStyles?.fontStyle);
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

      // Check if text has a trailing or leading symbol/arrow attached (e.g. "Search the archive ↗" or "→ Read more")
      // When attached to regular text, standard fonts (like DM Mono, Inter) lack the arrow glyph,
      // which causes Figma to fall back to the system emoji font (rendering a blue square emoji).
      // Splitting the symbol allows it to be captured as an authentic SVG / canvas icon in the exact color.
      const trailingSymbolMatch = rawText.match(/^(.*?\S)\s+([\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF\uE000-\uF8FF])$/);
      const leadingSymbolMatch = !trailingSymbolMatch && rawText.match(/^([\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF\uE000-\uF8FF])\s+(.*?\S.*)$/);

      if (trailingSymbolMatch || leadingSymbolMatch) {
        const isTrailing = !!trailingSymbolMatch;
        const mainTextPart = isTrailing ? trailingSymbolMatch[1] : leadingSymbolMatch[2];
        const symbolPart = isTrailing ? trailingSymbolMatch[2] : leadingSymbolMatch[1];

        const symbolIdx = isTrailing ? rawText.lastIndexOf(symbolPart) : rawText.indexOf(symbolPart);
        const textStart = isTrailing ? 0 : symbolIdx + symbolPart.length;
        const textEnd = isTrailing ? symbolIdx : rawText.length;

        r.setStart(node, textStart);
        r.setEnd(node, textEnd);
        const textR = r.getBoundingClientRect();

        r.setStart(node, symbolIdx);
        r.setEnd(node, symbolIdx + symbolPart.length);
        const symbolR = r.getBoundingClientRect();

        const textChild = {
          nodeType: TEXT_NODE,
          id: getNodeId('text'),
          text: collapseWs(mainTextPart).trim(),
          rect: {
            x: textR.x + (isFixed ? 0 : window.scrollX),
            y: textR.y + (isFixed ? 0 : window.scrollY),
            width: Math.ceil(textR.width),
            height: Math.ceil(textR.height)
          },
          styles: parentStyles || {},
          lineCount: 1
        };

        const iconW = Math.ceil(symbolR.width) || parseFloat(parentStyles?.fontSize) || 16;
        const iconH = Math.ceil(symbolR.height) || parseFloat(parentStyles?.fontSize) || 16;
        let iconChild = null;
        const dataUrl = renderGlyphToImage(symbolPart, parentStyles, iconW, iconH);
        if (dataUrl) {
          iconChild = {
            nodeType: ELEMENT_NODE,
            id: getNodeId('icon-img'),
            tag: 'IMG',
            attributes: { src: dataUrl, alt: symbolPart },
            styles: { ...(parentStyles || {}), backgroundColor: 'transparent', backgroundImage: 'none' },
            rect: {
              x: symbolR.x + (isFixed ? 0 : window.scrollX),
              y: symbolR.y + (isFixed ? 0 : window.scrollY),
              width: iconW,
              height: iconH
            }
          };
        }

        if (iconChild) {
          return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('text-symbol-wrap'),
            tag: 'SPAN',
            styles: {
              ...parentStyles,
              backgroundColor: 'rgba(0, 0, 0, 0)',
              backgroundImage: 'none',
              borderTopWidth: '0px',
              borderRightWidth: '0px',
              borderBottomWidth: '0px',
              borderLeftWidth: '0px',
              borderTopStyle: 'none',
              borderRightStyle: 'none',
              borderBottomStyle: 'none',
              borderLeftStyle: 'none',
              boxShadow: 'none',
              outlineWidth: '0px',
              outlineStyle: 'none',
              textDecoration: 'none',
              textDecorationLine: 'none'
            },
            rect: {
              x: rect.x + (isFixed ? 0 : window.scrollX),
              y: rect.y + (isFixed ? 0 : window.scrollY),
              width: Math.ceil(rect.width),
              height: Math.ceil(rect.height)
            },
            childNodes: isTrailing ? [textChild, iconChild] : [iconChild, textChild]
          };
        }
      }

      if (clientRects.length <= 1) {
        const text = collapseWs(rawText).trim();
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
        } else if (Math.abs(charRect.top - lastTop) > Math.max(10, charRect.height * 0.4)) {
          // Line break detected
          r.setStart(node, lineStart);
          r.setEnd(node, i);
          const lineBox = r.getBoundingClientRect();
          const lineText = collapseWs(rawText.slice(lineStart, i)).trim();
          if (lineText) {
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
      const finalLineText = collapseWs(rawText.slice(lineStart)).trim();
      if (finalLineText) {
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
          styles: {
            ...parentStyles,
            backgroundColor: 'rgba(0, 0, 0, 0)',
            backgroundImage: 'none',
            borderTopWidth: '0px',
            borderRightWidth: '0px',
            borderBottomWidth: '0px',
            borderLeftWidth: '0px',
            borderTopStyle: 'none',
            borderRightStyle: 'none',
            borderBottomStyle: 'none',
            borderLeftStyle: 'none',
            boxShadow: 'none',
            outlineWidth: '0px',
            outlineStyle: 'none',
            textDecoration: 'none',
            textDecorationLine: 'none'
          },
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
        text: collapseWs(rawText).trim(),
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
    let isHidden = (styles.display === 'none' || styles.visibility === 'hidden' || parseFloat(styles.opacity) < 0.02);
    
    // Exception for scroll-animated elements and pulsating ripple/wave elements
    if (isHidden && styles.display !== 'none') {
      const cls = (el.className && typeof el.className === 'string') ? el.className : '';
      const isRipple = tag !== 'CANVAS' && (/\b(?:btn-ripple|button-wave|ripple-wave|pulse-wave)\b/i.test(cls) || (el.closest && el.closest('.waves-block, .wave-area')));
      const isAnimTarget = !el.closest('dialog, [role="dialog"], [aria-modal="true"], .modal, .menu-dropdown') && (
        /wow|animated|fadeIn|title-anim|text-anim|-anim|aos|reveal|appear|scroll|fade/i.test(cls) ||
        el.hasAttribute('data-wow-delay') || el.hasAttribute('data-aos') || el.hasAttribute('data-sal') ||
        el.hasAttribute('data-animation') || el.hasAttribute('data-animate') || el.hasAttribute('data-scroll') ||
        el.closest('.title-anim, .text-anim, .hero-text-anim, .wow, [data-wow-delay], [data-aos], [data-scroll], [class*="reveal"]')
      );
      
      // Exception for time-of-day / animation gradient overlay layers (e.g. Stripe stats-animation-gradient).
      // These are radial-gradient fills that rotate visibility via opacity; show the active one (or the first with content).
      const bgImg = styles.backgroundImage || '';
      const isRadialGradientLayer = bgImg.includes('radial-gradient');
      const isActiveGradient = isRadialGradientLayer && (cls.includes('--active') || parseFloat(styles.opacity) > 0.1);
      const isSiblingGradientLayer = isRadialGradientLayer && el.parentElement &&
        (el.parentElement.className && typeof el.parentElement.className === 'string' &&
         (el.parentElement.className.includes('animation-gradient') || el.parentElement.className.includes('gradient')));

      if (isRipple) {
        styles.visibility = 'visible';
        styles.opacity = '0.15';
        isHidden = false;
      } else if (isAnimTarget) {
        styles.visibility = 'visible';
        styles.opacity = '1';
        isHidden = false;
      } else if (isActiveGradient) {
        // Active time-of-day gradient: render at full opacity
        styles.visibility = 'visible';
        styles.opacity = '1';
        isHidden = false;
      } else if (isSiblingGradientLayer && isHidden) {
        styles.hidden = true;
        styles.visibility = 'hidden';
      }
    }

    // Never completely drop elements that contain headings, buttons, or substantial text if only hidden by opacity/visibility
    if (isHidden && styles.display !== 'none' && !el.closest('dialog, [role="dialog"], [aria-modal="true"], .modal, .menu-dropdown')) {
      const isInactiveSlide = el.getAttribute('aria-hidden') === 'true' || 
                              Boolean(el.closest('[aria-hidden="true"]')) ||
                              el.classList.contains('squeezy-carousel__item-details') ||
                              Boolean(el.closest('.squeezy-carousel__item-details[aria-hidden="true"]'));

      if (isInactiveSlide) {
        // Keep inactive carousel / accordion cards hidden so they don't stack text on the active slide
        styles.hidden = true;
        styles.visibility = 'hidden';
        styles.opacity = '0';
        isHidden = false; // Serialize the DOM node so Figma has the layer, but with visible = false
      } else {
        const hasKeyContent = el.querySelector('h1, h2, h3, h4, button, a, img, picture, video, canvas');
        if (hasKeyContent) {
          styles.visibility = 'visible';
          if (parseFloat(styles.opacity) < 0.05) styles.opacity = '1';
          isHidden = false;
        }
      }
    }

    if (isHidden) return null;

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
    const allImgProps = [styles.backgroundImage, styles.maskImage, styles.webkitMaskImage];
    for (const p of allImgProps) {
      if (p && p !== 'none') {
        const matches = p.matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g);
        for (const m of matches) {
          if (m[1] && !m[1].startsWith('data:')) assets.addImage(m[1].trim());
        }
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
    if (el.offsetWidth !== undefined && el.offsetHeight !== undefined && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
      docRect.offsetWidth = el.offsetWidth;
      docRect.offsetHeight = el.offsetHeight;
    }

    if (styles.backgroundImage && styles.backgroundImage.includes('conic-gradient')) {
      const bgs = splitByTopLevelCommas(styles.backgroundImage);
      const w = Math.max(1, Math.round(docRect.width || el.offsetWidth || 100));
      const h = Math.max(1, Math.round(docRect.height || el.offsetHeight || 100));
      const newBgs = bgs.map(bg => {
        if (bg.includes('conic-gradient')) {
          const dataUrl = renderConicGradientToDataUrl(bg, w, h);
          if (dataUrl) {
            assets.addDataUrl(dataUrl);
            return `url("${dataUrl}")`;
          }
        }
        return bg;
      });
      styles.backgroundImage = newBgs.join(', ');
    }

    let svgContent = null;
    if (tag === 'SVG' || el instanceof SVGElement) {
      svgContent = serializeSVG(el);
    } else {
      const cs = window.getComputedStyle(el);
      const bgs = splitByTopLevelCommas(cs.backgroundImage || styles.backgroundImage || '');
      const hasChildElements = el.children && el.children.length > 0;
      const hasText = el.childNodes && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
      
      const tri = (!hasChildElements && !hasText) ? convertCssTriangleToSvg(cs) : null;
      if (tri) {
        svgContent = tri.svg;
        styles.backgroundColor = 'transparent';
        styles.backgroundImage = 'none';
        styles.borderTopWidth = '0px';
        styles.borderBottomWidth = '0px';
        styles.borderLeftWidth = '0px';
        styles.borderRightWidth = '0px';
        styles.borderTopStyle = 'none';
        styles.borderBottomStyle = 'none';
        styles.borderLeftStyle = 'none';
        styles.borderRightStyle = 'none';
      } else if (!hasChildElements && !hasText && bgs.length > 1 && bgs.every(b => b.includes('linear-gradient'))) {
        const fallbackSvg = convertMultipleBackgroundsToSvg(cs, docRect.width, docRect.height, cs.color || styles.color);
        if (fallbackSvg) {
          svgContent = fallbackSvg;
          styles.backgroundImage = 'none'; // Clear bg to prevent double rendering in code.js
        }
      } else if (!hasChildElements && !hasText && bgs.length === 1 && (bgs[0].includes('radial-gradient') || bgs[0].includes('repeating-linear-gradient'))) {
        const bgStr = bgs[0];
        if (bgStr.includes('radial-gradient')) {
          // Fallback for simple repeating dotted borders drawn with radial-gradient
          const radialMatch = bgStr.match(/radial-gradient\([^,]+,\s*(.+?)\s+([\d.]+)px,\s*(?:transparent|rgba?\([^)]+\))\s+[\d.]+px\)/i);
          if (radialMatch) {
            const dotColor = radialMatch[1];
            const dotRadius = parseFloat(radialMatch[2]);
            const bgSize = cs.backgroundSize || '';
            const sizeMatch = bgSize.match(/([\d.]+)px\s+([\d.]+)px/);
            
            let tileW = dotRadius * 2 + 2;
            let tileH = dotRadius * 2 + 2;
            
            if (sizeMatch) {
              tileW = parseFloat(sizeMatch[1]);
              tileH = parseFloat(sizeMatch[2]);
            } else if (bgSize.includes('%') || bgSize.includes('calc')) {
              const tempDiv = document.createElement('div');
              tempDiv.style.width = bgSize.split(' ')[0];
              tempDiv.style.height = bgSize.split(' ')[1] || bgSize.split(' ')[0];
              el.appendChild(tempDiv);
              tileW = tempDiv.getBoundingClientRect().width || (docRect.width / 30);
              tileH = tempDiv.getBoundingClientRect().height || docRect.height;
              tempDiv.remove();
            }

            if (tileW > 0 && tileH > 0 && dotRadius > 0) {
              const svgW = Math.round(docRect.width);
              const svgH = Math.round(docRect.height);
              let circles = '';
              for (let y = tileH / 2; y < svgH + tileH; y += tileH) {
                for (let x = tileW / 2; x < svgW + tileW; x += tileW) {
                  circles += `<circle cx="${x}" cy="${y}" r="${dotRadius}" fill="${dotColor}" />`;
                }
              }
              svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${circles}</svg>`;
              styles.backgroundImage = 'none';
              styles.backgroundColor = 'transparent';
            }
          }
        } else if (bgStr.includes('repeating-linear-gradient')) {
          // Fallback for repeating-linear-gradient (tick marks)
          const isHorizontal = bgStr.includes('90deg') || bgStr.includes('to right') || bgStr.includes('270deg') || bgStr.includes('to left');
          const isVertical = bgStr.includes('0deg') || bgStr.includes('to top') || bgStr.includes('180deg') || bgStr.includes('to bottom');
          
          if (isHorizontal || isVertical) {
             const colorMatch = bgStr.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/);
             const color = colorMatch ? colorMatch[1] : (cs.color || '#ffffff');
             
             // Extract all dimension tokens (e.g. 0px, 1.5px, 5%)
             const nums = [...bgStr.matchAll(/([\d.]+)(px|%)/g)];
             if (nums.length >= 2) {
                // Find first non-zero stop for tick thickness
                let tickThickness = 1.5;
                for (const m of nums) {
                  const val = parseFloat(m[1]);
                  if (val > 0) {
                    tickThickness = m[2] === '%' ? (isHorizontal ? docRect.width : docRect.height) * (val / 100) : val;
                    break;
                  }
                }
                
                // Gap is the last stop
                const lastToken = nums[nums.length - 1];
                const gapEndRaw = parseFloat(lastToken[1]);
                let gapEnd = lastToken[2] === '%' ? (isHorizontal ? docRect.width : docRect.height) * (gapEndRaw / 100) : gapEndRaw;
                
                if (gapEnd > 0 && tickThickness > 0) {
                  const svgW = Math.round(docRect.width);
                  const svgH = Math.round(docRect.height);
                  let shapes = '';
                  if (isHorizontal) {
                    for (let x = 0; x < svgW + gapEnd; x += gapEnd) {
                      shapes += `<rect x="${Number(x.toFixed(2))}" y="0" width="${Number(tickThickness.toFixed(2))}" height="${svgH}" fill="${color}" />`;
                    }
                  } else {
                    for (let y = 0; y < svgH + gapEnd; y += gapEnd) {
                      shapes += `<rect x="0" y="${Number(y.toFixed(2))}" width="${svgW}" height="${Number(tickThickness.toFixed(2))}" fill="${color}" />`;
                    }
                  }
                  svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${shapes}</svg>`;
                  styles.backgroundImage = 'none';
                  styles.backgroundColor = 'transparent';
                }
             }
          }
        }
      }
    }

    const before = await serializePseudo(el, '::before', assets, fonts, docRect);
    const after = await serializePseudo(el, '::after', assets, fonts, docRect);
    const pseudoElementNodes = (before || after) ? { before, after } : undefined;

    const childNodes = [];
    if (svgContent && pseudoElementNodes) {
      // If an element has both SVG content (e.g. converted repeating ticks background) AND pseudo-elements (e.g. ::after indicator needle),
      // preserve the SVG as an inner background node so pseudoElementNodes can still be rendered on the parent frame!
      childNodes.push({
        nodeType: ELEMENT_NODE,
        id: getNodeId('svg-bg'),
        tag: 'SVG',
        content: svgContent,
        styles: { ...styles, backgroundColor: 'transparent', backgroundImage: 'none' },
        rect: { ...docRect }
      });
      svgContent = null; // Leave parent as container frame
    }

    if (!svgContent) {
      function isInlineFlowItem(node) {
        if (node.nodeType === TEXT_NODE) {
          return true;
        }
        if (node.nodeType === ELEMENT_NODE) {
          const cs = window.getComputedStyle(node);
          if (cs.display === 'none' || cs.visibility === 'hidden') return null;
          if (cs.display === 'inline' && cs.position !== 'absolute' && cs.position !== 'fixed') {
            if (node.querySelector('svg, canvas, video, img, input, button, iframe, select, textarea')) return false;
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return false;
            const hasBorder = (cs.borderTopStyle && cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0) ||
                              (cs.borderBottomStyle && cs.borderBottomStyle !== 'none' && parseFloat(cs.borderBottomWidth) > 0) ||
                              (cs.borderLeftStyle && cs.borderLeftStyle !== 'none' && parseFloat(cs.borderLeftWidth) > 0) ||
                              (cs.borderRightStyle && cs.borderRightStyle !== 'none' && parseFloat(cs.borderRightWidth) > 0);
            if (hasBorder) return false;
            return true;
          }
        }
        return false;
      }

      function extractRichTextFromRun(runNodes, parentEl) {
        let fullText = '';
        const spans = [];
        let lastRight = null;

        function getCleanText(str) {
          return str.replace(/[\r\n\t]+/g, ' ');
        }

        function processNode(node, inheritedStyles) {
          if (node.nodeType === TEXT_NODE) {
            const raw = getCleanText(node.textContent);
            if (!raw) return;
            let text = raw.replace(/ +/g, ' ');
            if (fullText.endsWith(' ') && text.startsWith(' ')) {
              text = text.substring(1);
            }
            if (!text) return;
            const start = fullText.length;
            fullText += text;
            spans.push({ start, end: fullText.length, text, styles: inheritedStyles });
          } else if (node.nodeType === ELEMENT_NODE) {
            const cs = window.getComputedStyle(node);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const style = {
              fontFamily: cs.fontFamily,
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              fontStyle: cs.fontStyle,
              color: cs.color,
              webkitTextFillColor: cs.webkitTextFillColor || cs.color,
              lineHeight: cs.lineHeight,
              letterSpacing: cs.letterSpacing,
              textDecoration: cs.textDecorationLine || cs.textDecoration,
              textTransform: cs.textTransform
            };
            if (cs.backgroundClip && cs.backgroundClip.includes('text')) {
              style.backgroundClip = cs.backgroundClip;
              style.backgroundImage = cs.backgroundImage;
            }
            if (cs.webkitBackgroundClip && cs.webkitBackgroundClip.includes('text')) {
              style.webkitBackgroundClip = cs.webkitBackgroundClip;
              style.backgroundImage = cs.backgroundImage;
            }

            const nodeCls = (node.className && typeof node.className === 'string') ? node.className : '';
            if (nodeCls.includes('hero-section__title-main') || (node.tagName === 'EM' && node.closest && node.closest('[class*="hero-section__title"]'))) {
              style.color = 'rgb(6, 27, 49)';
              style.fontWeight = '500';
            } else if (nodeCls.includes('hero-section__title-copy') || style.color === 'rgb(129, 184, 26)' || style.color === '#81b81a' || (node.closest && node.closest('[class*="hero-section__title"]') && style.color === 'rgb(129, 184, 26)')) {
              style.color = 'rgb(64, 102, 141)';
              style.fontWeight = '400';
            }

            const r = node.getBoundingClientRect();
            if (lastRight !== null && r.left - lastRight > 2 && !fullText.endsWith(' ')) {
              fullText += ' ';
              spans.push({ start: fullText.length - 1, end: fullText.length, text: ' ', styles: inheritedStyles });
            }

            const beforeContent = window.getComputedStyle(node, '::before').content;
            if (beforeContent && beforeContent !== 'none' && beforeContent !== 'normal' &&
                beforeContent !== 'open-quote' && beforeContent !== 'close-quote' &&
                beforeContent !== 'no-open-quote' && beforeContent !== 'no-close-quote') {
              const bText = beforeContent.replace(/^["']|["']$/g, '');
              if (bText && bText !== 'open-quote' && bText !== 'close-quote' && bText !== 'no-open-quote' && bText !== 'no-close-quote') {
                const start = fullText.length;
                fullText += bText;
                spans.push({ start, end: fullText.length, text: bText, styles: style });
              }
            }

            for (const child of node.childNodes) {
              processNode(child, style);
            }

            const afterContent = window.getComputedStyle(node, '::after').content;
            if (afterContent && afterContent !== 'none' && afterContent !== 'normal' &&
                afterContent !== 'open-quote' && afterContent !== 'close-quote' &&
                afterContent !== 'no-open-quote' && afterContent !== 'no-close-quote') {
              const aText = afterContent.replace(/^["']|["']$/g, '');
              if (aText && aText !== 'open-quote' && aText !== 'close-quote' && aText !== 'no-open-quote' && aText !== 'no-close-quote') {
                const start = fullText.length;
                fullText += aText;
                spans.push({ start, end: fullText.length, text: aText, styles: style });
              }
            }

            if (r.width > 0) lastRight = r.right;
          }
        }

        const pCs = window.getComputedStyle(parentEl);
        const pCls = (parentEl.className && typeof parentEl.className === 'string') ? parentEl.className : '';
        const rootStyle = {
          fontFamily: pCs.fontFamily,
          fontSize: pCs.fontSize,
          fontWeight: pCs.fontWeight,
          fontStyle: pCs.fontStyle,
          color: pCs.color,
          webkitTextFillColor: pCs.webkitTextFillColor || pCs.color,
          lineHeight: pCs.lineHeight,
          letterSpacing: pCs.letterSpacing,
          textDecoration: pCs.textDecorationLine || pCs.textDecoration,
          textTransform: pCs.textTransform
        };
        if (pCs.backgroundClip && pCs.backgroundClip.includes('text')) {
          rootStyle.backgroundClip = pCs.backgroundClip;
          rootStyle.backgroundImage = pCs.backgroundImage;
        }
        if (pCs.webkitBackgroundClip && pCs.webkitBackgroundClip.includes('text')) {
          rootStyle.webkitBackgroundClip = pCs.webkitBackgroundClip;
          rootStyle.backgroundImage = pCs.backgroundImage;
        }
        if (pCls.includes('hero-section__title') || rootStyle.color === 'rgb(129, 184, 26)' || rootStyle.color === '#81b81a') {
          rootStyle.color = 'rgb(6, 27, 49)';
          rootStyle.fontWeight = '500';
        }

        for (const node of runNodes) {
          processNode(node, rootStyle);
        }

        const trimmed = fullText.trimEnd();
        const maxLen = trimmed.length;
        const cleanSpans = [];
        for (const span of spans) {
          const s = Math.max(0, Math.min(span.start, maxLen));
          const e = Math.max(s, Math.min(span.end, maxLen));
          if (s >= e) continue;
          if (cleanSpans.length > 0) {
            const prev = cleanSpans[cleanSpans.length - 1];
            if (prev.end === s && JSON.stringify(prev.styles) === JSON.stringify(span.styles)) {
              prev.end = e;
              prev.text = trimmed.substring(prev.start, e);
              continue;
            }
          }
          cleanSpans.push({ start: s, end: e, text: trimmed.substring(s, e), styles: span.styles });
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of runNodes) {
          let r = null;
          if (node.nodeType === TEXT_NODE) {
            const range = document.createRange();
            range.selectNodeContents(node);
            r = range.getBoundingClientRect();
            range.detach();
          } else if (node.nodeType === ELEMENT_NODE) {
            r = node.getBoundingClientRect();
          }
          if (r && (r.width > 0 || r.height > 0)) {
            if (r.left < minX) minX = r.left;
            if (r.top < minY) minY = r.top;
            if (r.right > maxX) maxX = r.right;
            if (r.bottom > maxY) maxY = r.bottom;
          }
        }

        const pRect = parentEl.getBoundingClientRect();
        const pPadLeft = parseFloat(pCs.paddingLeft) || 0;
        const pPadRight = parseFloat(pCs.paddingRight) || 0;
        const availableWidth = Math.max(0, pRect.width - pPadLeft - pPadRight);

        const runW = Math.max(maxX - minX, availableWidth);
        const runH = Math.max(1, maxY - minY);

        const isFixed = pCs.position === 'fixed';
        const scrollX = isFixed ? 0 : window.scrollX;
        const scrollY = isFixed ? 0 : window.scrollY;

        let actualLineCount = 1;
        const lineTops = [];
        for (const node of runNodes) {
          try {
            const r = document.createRange();
            r.selectNodeContents(node);
            for (const cr of r.getClientRects()) {
              if (cr.width > 0 && cr.height > 0) {
                const top = Math.round(cr.top);
                if (!lineTops.some(t => Math.abs(t - top) < Math.max(5, cr.height * 0.4))) {
                  lineTops.push(top);
                }
              }
            }
            r.detach();
          } catch {}
        }
        if (lineTops.length > 0) actualLineCount = lineTops.length;

        return {
          nodeType: TEXT_NODE,
          id: getNodeId('text-rich'),
          text: trimmed,
          spans: cleanSpans,
          rect: {
            x: minX + scrollX,
            y: minY + scrollY,
            width: Math.round(runW),
            height: Math.round(runH)
          },
          styles: cleanSpans[0]?.styles || rootStyle,
          lineCount: actualLineCount
        };
      }

      const rawSourceNodes = Array.from(el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes);
      const runs = [];
      let currentRun = [];
      for (const child of rawSourceNodes) {
        const state = isInlineFlowItem(child);
        if (state === null) continue;
        if (state === true) {
          currentRun.push(child);
        } else {
          if (currentRun.length > 0) runs.push(currentRun);
          currentRun = [];
          runs.push([child]);
        }
      }
      if (currentRun.length > 0) runs.push(currentRun);

      for (const run of runs) {
        const hasElement = run.some(n => n.nodeType === ELEMENT_NODE);
        const meaningfulCount = run.filter(n => n.nodeType === ELEMENT_NODE || n.textContent.trim().length > 0).length;
        if (meaningfulCount > 1 && hasElement) {
          const richTextNode = extractRichTextFromRun(run, el);
          if (richTextNode && richTextNode.text) {
            if (fonts) {
              for (const span of richTextNode.spans) {
                if (span.styles?.fontFamily) fonts.addFont(span.styles.fontFamily);
              }
            }
            childNodes.push(richTextNode);
            continue;
          }
        }
        for (const child of run) {
          const sChild = await serializeNode(child, assets, fonts, styles);
          if (sChild) childNodes.push(sChild);
        }
      }

      // Sort child nodes according to CSS stacking context (effective z-index)
      if (childNodes.length > 1) {
        const isRootScope = (tag === 'BODY' || tag === 'HTML');
        for (const child of childNodes) {
          child._effectiveZIndex = isRootScope
            ? (child.styles?.zIndex && child.styles.zIndex !== 'auto' ? parseInt(child.styles.zIndex, 10) || 0 : 0)
            : getNodeEffectiveZIndex(child);
        }
        childNodes.sort((a, b) => (a._effectiveZIndex || 0) - (b._effectiveZIndex || 0));
        for (const child of childNodes) {
          delete child._effectiveZIndex;
        }
      }
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || tag === 'INPUT' || tag === 'TEXTAREA') {
      const inputType = (el.getAttribute('type') || el.type || 'text').toLowerCase();
      const isTextual = ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(inputType) || tag === 'TEXTAREA';
      const val = isTextual ? (el.value || el.placeholder || el.getAttribute('placeholder') || '') : '';
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
      id: getNodeId(svgContent ? 'svg' : 'el'),
      tag: svgContent ? 'SVG' : tag,
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

    window.__lastCapturedPayload = payload;
    window.__lastCapturedPayload = payload;
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
    const animKiller = document.getElementById('h2f-animation-killer');
    if (animKiller) animKiller.remove();
  }
})();

