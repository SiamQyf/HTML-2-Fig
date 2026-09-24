/*
 * HTML 2 Fig — High-Fidelity Capture Engine
 * Captures document.body directly (preventing duplicated HEAD/HTML rendering),
 * pre-scrolls to activate lazy sections, and serializes clean DOM trees.
 */
(function() {
  'use strict';

  window.html2Fig = window.html2Fig || {};

  const FETCH_TIMEOUT = 15000;
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  let captureTimedOut = false;

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
    const cleanupTasks = [];

    const style = document.createElement('style');
    style.id = 'h2f-scroll-fix';
    style.innerHTML = 'html, body { scroll-behavior: auto !important; }';
    document.head.appendChild(style);
    cleanupTasks.push(() => { try { style.remove(); } catch {} });


    // Neutralize GSAP ScrollSmoother — save state for restoration
    try {
      if (window.ScrollSmoother) {
        const sm = window.ScrollSmoother.get();
        if (sm) {
          sm.paused(true);
          cleanupTasks.push(() => { try { sm.paused(false); } catch {} });
        }
      }
      const sw = document.getElementById('smooth-wrapper');
      const sc = document.getElementById('smooth-content');
      if (sw) {
        const saved = { position: sw.style.position, height: sw.style.height, overflow: sw.style.overflow, maxHeight: sw.style.maxHeight };
        sw.style.setProperty('position', 'static', 'important');
        sw.style.setProperty('height', 'auto', 'important');
        sw.style.setProperty('max-height', 'none', 'important');
        sw.style.setProperty('overflow', 'visible', 'important');
        cleanupTasks.push(() => {
          sw.style.position = saved.position;
          sw.style.height = saved.height;
          sw.style.maxHeight = saved.maxHeight;
          sw.style.overflow = saved.overflow;
        });

        // Unconstrain all ancestors of smooth-wrapper (e.g. .my-app, .dialog-off-canvas-main-canvas)
        let cur = sw.parentElement;
        while (cur && cur !== document.documentElement) {
          const el = cur;
          const s = {
            height: el.style.height,
            maxHeight: el.style.maxHeight,
            overflow: el.style.overflow,
            overflowX: el.style.overflowX,
            overflowY: el.style.overflowY
          };
          el.style.setProperty('height', 'auto', 'important');
          el.style.setProperty('max-height', 'none', 'important');
          el.style.setProperty('overflow', 'visible', 'important');
          el.style.setProperty('overflow-x', 'visible', 'important');
          el.style.setProperty('overflow-y', 'visible', 'important');
          cleanupTasks.push(() => {
            el.style.height = s.height;
            el.style.maxHeight = s.maxHeight;
            el.style.overflow = s.overflow;
            el.style.overflowX = s.overflowX;
            el.style.overflowY = s.overflowY;
          });
          cur = cur.parentElement;
        }
      }
      if (sc) {
        const saved = { position: sc.style.position, height: sc.style.height, overflow: sc.style.overflow, transform: sc.style.transform };
        sc.style.setProperty('position', 'static', 'important');
        sc.style.setProperty('height', 'auto', 'important');
        sc.style.setProperty('overflow', 'visible', 'important');
        sc.style.setProperty('transform', 'none', 'important');
        cleanupTasks.push(() => { sc.style.position = saved.position; sc.style.height = saved.height; sc.style.overflow = saved.overflow; sc.style.transform = saved.transform; });
      }
    } catch (e) {}

    // Fast-forward GSAP ScrollTriggers — save state for restoration
    try {
      if (window.ScrollTrigger) {
        const savedTriggers = [];
        window.ScrollTrigger.getAll().forEach(st => {
          try {
            const savedProgress = st.animation ? st.animation.progress() : null;
            const isCrazyScale = st.vars?.scrub && st.trigger && (st.trigger.className || '').includes('circle-shape');
            if (st.animation && !isCrazyScale) {
              st.animation.progress(1);
            }
            if (typeof st.vars?.onEnter === 'function') {
              try { st.vars.onEnter(); } catch (e) {}
            }
            st.disable(false);
            savedTriggers.push({ st, savedProgress, isCrazyScale });
          } catch (e) {}
        });
        cleanupTasks.push(() => {
          for (const { st, savedProgress, isCrazyScale } of savedTriggers) {
            try { st.enable(); if (st.animation && savedProgress !== null && !isCrazyScale) st.animation.progress(savedProgress); } catch {}
          }
          try { window.ScrollTrigger.refresh(); } catch {}
        });
      }
      if (window.gsap) {
        const savedTweens = [];
        window.gsap.globalTimeline.getChildren().forEach(tween => {
          try { savedTweens.push({ tween, progress: tween.progress() }); tween.progress(1); } catch {}
        });
        cleanupTasks.push(() => { for (const { tween, progress } of savedTweens) { try { tween.progress(progress); } catch {} } });
      }
    } catch (e) {}

    // Automatically defeat scroll-linked animations and force scroll-reveal elements visible
    const animKiller = document.createElement('style');
    animKiller.id = 'h2f-animation-killer';
    animKiller.innerHTML = `
      * { transition: none !important; animation: none !important; }
      #smooth-wrapper, #smooth-content {
        position: static !important;
        height: auto !important;
        overflow: visible !important;
        transform: none !important;
      }
      .words, .word, .line, .letter, .bw-reveal-text, .bw-reveal-text-2, .bw-title-anim, .bw-split-text {
        visibility: visible !important;
        opacity: 1 !important;
        transform: none !important;
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
      [class*="wow"], [class*="fadeIn"], [class*="-anim"] {
        visibility: visible !important;
        opacity: 1 !important;
        animation: none !important;
        transition: none !important;
      }
      .hero-wave-animation, .hero-wave-animation__static, .hero-wave-animation__static img {
        opacity: 1 !important;
        visibility: visible !important;
      }
      #preloader, .preloader, .loader-wrapper, #loading, .page-loader, .site-preloader, .animation-preloader, .loader-section {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(animKiller);
    cleanupTasks.push(() => { try { animKiller.remove(); } catch {} });

    // Clean up Odometer and other animated counters to prevent overlapping number ribbons
    try {
      const counters = document.querySelectorAll('.odometer, .counter, [data-count], [data-to]');
      for (const el of counters) {
        const val = el.getAttribute('data-count') || el.getAttribute('data-to') || el.getAttribute('data-val');
        if (val) {
          el.innerHTML = val;
        } else if (el.classList.contains('odometer')) {
          // If no data attribute is found but it's an odometer, just use the stripped text
          el.innerHTML = el.innerText.replace(/\s+/g, '');
        }
      }
    } catch (e) {}

    // Save and modify inline styles on animated elements
    const savedInlineStyles = [];
    try {
      const animatedEls = document.querySelectorAll(
        '.wow, [data-wow-delay], [data-aos], [data-sal], .animated, .title-anim, .text-anim, .hero-text-anim, .right-swipe, .left-swipe, [class*="wow"], [class*="-anim"], .bw-reveal-text, .bw-reveal-text-2, .bw-title-anim, .bw-split-text, .words, .word, .line, .letter'
      );
      for (const el of animatedEls) {
        const saved = { el, v: el.style.visibility, o: el.style.opacity, t: el.style.transform, c: el.style.clipPath };
        savedInlineStyles.push(saved);
        if (el.style.visibility === 'hidden') el.style.visibility = 'visible';
        if (el.style.opacity === '0' || (parseFloat(el.style.opacity) || 0) < 0.05) el.style.opacity = '1';
        if (el.style.transform) {
          if (el.style.transform.includes('translate') || el.style.transform.includes('scale(100') || el.style.transform.includes('scale(100,') || el.style.transform.includes('matrix')) {
            el.style.transform = 'none';
          }
        }
        if (el.style.clipPath) el.style.clipPath = 'none';
        
        for (const desc of el.querySelectorAll('*')) {
          savedInlineStyles.push({ el: desc, v: desc.style.visibility, o: desc.style.opacity, t: desc.style.transform });
          if (desc.style.visibility === 'hidden') desc.style.visibility = 'visible';
          if (desc.style.opacity === '0' || (parseFloat(desc.style.opacity) || 0) < 0.05) {
            desc.style.opacity = '1';
          }
          if (desc.style.transform) desc.style.transform = 'none';
        }
      }
    } catch {}

    cleanupTasks.push(() => {
      for (const s of savedInlineStyles) {
        try { s.el.style.visibility = s.v; s.el.style.opacity = s.o; s.el.style.transform = s.t; if (s.c !== undefined) s.el.style.clipPath = s.c; } catch {}
      }
    });

    // Hide preloaders — save state
    try {
      const preloaders = document.querySelectorAll('#preloader, .preloader, .loader-wrapper, #loading, .page-loader, .site-preloader');
      for (const p of preloaders) {
        const savedDisplay = p.style.display;
        p.style.display = 'none';
        cleanupTasks.push(() => { p.style.display = savedDisplay; });
      }
    } catch {}


    // Now that virtual smooth scroll wrappers and scroll-linked animations are neutralized, scroll natively to trigger lazy images
    let scrollHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    const MAX_SCROLL_HEIGHT = 50000;
    const MAX_SCROLL_TIME = 15000;
    const step = 32;
    const delay = 16;
    const scrollStart = performance.now();

    for (let y = 0; y < scrollHeight; y += step) {
      if (captureTimedOut) break;
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, delay));
      const newHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      scrollHeight = Math.min(newHeight, MAX_SCROLL_HEIGHT);
      if (performance.now() - scrollStart > MAX_SCROLL_TIME) break;
    }
    
    window.scrollTo(0, scrollHeight);
    await new Promise(r => setTimeout(r, 600));
    
    for (let y = scrollHeight; y > 0; y -= (step * 8)) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 16));
    }

    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 200));

    // Ensure all web fonts are fully downloaded before computing visual metrics
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise(r => setTimeout(r, 3000)) // Safety timeout
        ]);
      }
    } catch (e) {}

    return function cleanup() {
      for (let i = cleanupTasks.length - 1; i >= 0; i--) { try { cleanupTasks[i](); } catch {} }
    };
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
          const timer = setTimeout(() => res(null), FETCH_TIMEOUT);
          chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: absoluteUrl }, (resp) => {
            clearTimeout(timer);
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

    // Method 3: HTMLImageElement + Canvas draw fallback (for raster images only, never SVGs)
    if (absoluteUrl.includes('.svg') || absoluteUrl.startsWith('data:image/svg+xml')) {
      return { url: absoluteUrl, blob: null };
    }

    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({ url: absoluteUrl, blob: null }), FETCH_TIMEOUT);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
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
      img.onerror = () => { clearTimeout(timer); resolve({ url: absoluteUrl, blob: null }); };
      img.src = absoluteUrl;
    });
  }

  async function fetchFadedImage(url, fadeLeftPct = 0.18, fadeRightPct = 0.18) {
    const raw = await fetchImage(url);
    if (!raw || !raw.blob || !raw.blob.data) return raw;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(raw);

          // Draw original image
          ctx.drawImage(img, 0, 0);

          // Apply smooth horizontal alpha fade using destination-in
          ctx.globalCompositeOperation = 'destination-in';
          const grad = ctx.createLinearGradient(0, 0, c.width, 0);
          grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          grad.addColorStop(fadeLeftPct, 'rgba(0, 0, 0, 1)');
          grad.addColorStop(1 - fadeRightPct, 'rgba(0, 0, 0, 1)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, c.width, c.height);

          const dataUrl = c.toDataURL('image/png');
          const b64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          resolve({ url, blob: { type: 'image/png', data: b64Data } });
        } catch (e) {
          resolve(raw);
        }
      };
      img.onerror = () => resolve(raw);
      const dataSrc = raw.blob.data.startsWith('data:') ? raw.blob.data : `data:${raw.blob.type || 'image/png'};base64,${raw.blob.data}`;
      img.src = dataSrc;
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
    addFadedImage(url, fadeLeftPct = 0.18, fadeRightPct = 0.18) {
      if (!url) return;
      let absoluteUrl = url;
      try {
        absoluteUrl = new URL(url, document.baseURI).href;
      } catch {}
      if (this.promises.has(absoluteUrl)) return;
      this.promises.set(absoluteUrl, fetchFadedImage(absoluteUrl, fadeLeftPct, fadeRightPct));
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
      const ASSET_TIMEOUT = 20000;
      const map = {};
      const entries = Array.from(this.promises.entries());
      const results = await Promise.allSettled(
        entries.map(([url, p]) =>
          Promise.race([
            p,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ASSET_TIMEOUT))
          ]).then(res => ({ url, res }))
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.res && r.value.res.blob) {
          map[r.value.url] = r.value.res;
        }
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

    // Strip zero-size / invisible box shadows (e.g. 'rgb(...) 0px 0px 0px 0px')
    if (styles.boxShadow && styles.boxShadow !== 'none') {
      const parts = styles.boxShadow.split(/,(?![^(]*\))/);
      const isAllZero = parts.every(s => {
        const clean = s.replace(/inset/gi, '').trim();
        const m = clean.match(/(.*?)\s*(-?[\d.]+px)\s+(-?[\d.]+px)(?:\s+([\d.]+px))?(?:\s+([\d.]+px))?/);
        if (!m) return true;
        const x = parseFloat(m[2]) || 0;
        const y = parseFloat(m[3]) || 0;
        const radius = parseFloat(m[4]) || 0;
        const spread = parseFloat(m[5]) || 0;
        return x === 0 && y === 0 && radius === 0 && spread === 0;
      });
      if (isAllZero) {
        delete styles.boxShadow;
      }
    }

    styles.fontFamily = cs.fontFamily;
    styles.fontSize = cs.fontSize;
    styles.fontStyle = cs.fontStyle;
    styles.fontStretch = cs.fontStretch;
    
    // Dynamically analyze font visual thickness and stretch using Canvas
    // Completely independent of CSS font-weight
    const isIconFont = (cs.fontFamily || '').toLowerCase().match(/icon|awesome|glyph|symbol|feather|material/i);
    const fontKey = `${cs.fontFamily}-${cs.fontStyle}`;
    if (!window._fontMetricsCache) window._fontMetricsCache = {};
    if (!window._fontMetricsCache[fontKey]) {
      if (isIconFont) {
        // Icon fonts don't contain Latin characters; give safe standard fallback density
        window._fontMetricsCache[fontKey] = { stretchRatio: 0.6, density: 0.16 };
      } else {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          const testString = 'Hox@gA08W';
          const testSize = 60;
          ctx.font = `${cs.fontStyle} normal ${testSize}px ${cs.fontFamily}, sans-serif`;
          const metrics = ctx.measureText(testString);
          const w = metrics.width;
          if (w > 5 && isFinite(w)) {
            canvas.width = Math.ceil(w);
            canvas.height = Math.ceil(testSize * 1.5);
            ctx.font = `${cs.fontStyle} normal ${testSize}px ${cs.fontFamily}, sans-serif`;
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'black';
            ctx.fillText(testString, 0, 0);
            
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let filled = 0;
            for (let i = 3; i < imgData.length; i += 4) {
              if (imgData[i] > 128) filled++;
            }
            
            const stretchRatio = (w / testString.length) / testSize;
            let density = filled / (w * testSize);
            // Guard against corrupted or zero readings
            if (!isFinite(density) || density <= 0.01) density = 0.16;
            if (!isFinite(stretchRatio) || stretchRatio <= 0.1) stretchRatio = 0.6;
            window._fontMetricsCache[fontKey] = { stretchRatio, density };
          } else {
            window._fontMetricsCache[fontKey] = { stretchRatio: 0.6, density: 0.16 };
          }
        } catch (e) {
          window._fontMetricsCache[fontKey] = { stretchRatio: 0.6, density: 0.16 };
        }
      }
    }
    const fm = window._fontMetricsCache[fontKey];
    styles.visualStretch = fm.stretchRatio;
    styles.visualDensity = fm.density;

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

    // Explicitly capture background clip (including text clip with multiple values like 'text, text')
    if (cs.backgroundClip && cs.backgroundClip.includes('text')) styles.backgroundClip = cs.backgroundClip;
    if (cs.webkitBackgroundClip && cs.webkitBackgroundClip.includes('text')) styles.webkitBackgroundClip = cs.webkitBackgroundClip;

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
                try {
                  const ctrl = new AbortController();
                  const timer = setTimeout(() => ctrl.abort(), 5000);
                  const r = await fetch(sheet.href, { signal: ctrl.signal });
                  clearTimeout(timer);
                  if (r.ok) cssText = await r.text();
                } catch {}
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
              const timer = setTimeout(() => res(null), FETCH_TIMEOUT);
              chrome.runtime.sendMessage({ type: 'FETCH_FONT', url }, (resp) => {
                clearTimeout(timer);
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
          const ctrl = new AbortController();
          const fTimer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
          const resp = await fetch(url, { signal: ctrl.signal });
          clearTimeout(fTimer);
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            const font = opentype.parse(buf);
            resolve(font);
            return;
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

    // Icon fonts with 1-2 characters (e.g. FontAwesome, RemixIcon, Tabler, Bootstrap, Phosphor)
    const isIconFont = /(?:icon|awesome|feather|tabler|boxicon|remix|glyph|phosphor)/i.test(fontName) && !fontName.includes('system-ui');
    if (chars.length <= 2) {
      if (isIconFont) return true;
      // Specific icon, glyph, or flag library classes
      if (/\b(?:fa|fa-[a-z0-9-]+|bi|bi-[a-z0-9-]+|bx|bxs|bxl|ri-[a-z0-9-]+|feather|mdi-[a-z0-9-]+|glyph|flag|ph|ph-[a-z0-9-]+|icon-[a-z0-9-]+|[a-z0-9-]+-icon-[a-z0-9-]+)\b/i.test(cls) ||
          cls.includes('__glyph') || cls.includes('__flag') || cls.includes('-glyph') || cls.includes('-flag') || cls.includes('icon')) {
        return true;
      }
    }

    return false;
  }

  function isElementOrAncestorFixed(el, styles) {
    if (styles && styles.position === 'fixed') return true;
    let cur = el ? el.parentElement : null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      try {
        if (window.getComputedStyle(cur).position === 'fixed') return true;
      } catch {}
      cur = cur.parentElement;
    }
    return false;
  }

  function renderGlyphToImage(char, styles, width, height) {
    try {
      if (!char) return null;
      const scale = 4;
      const drawW = width || 16;
      const drawH = height || 16;
      const w = Math.max(1, Math.round(drawW * scale));
      const h = Math.max(1, Math.round(drawH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.scale(scale, scale);

      const style = styles.fontStyle || 'normal';
      const weight = styles.fontWeight || '400';
      const size = styles.fontSize || '16px';
      const family = styles.fontFamily || 'sans-serif';
      const fontStr = `${style} ${weight} ${size} ${family}`;
      ctx.font = fontStr;
      ctx.fillStyle = styles.color || '#000000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.fillText(char, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const alpha = imgData[(y * w + x) * 4 + 3];
          if (alpha > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX === -1 || maxY === -1) return null;

      ctx.clearRect(0, 0, drawW, drawH);

      const glyphLogicW = (maxX - minX + 1) / scale;
      const glyphLogicH = (maxY - minY + 1) / scale;
      const offsetX = (drawW - glyphLogicW) / 2 - (minX / scale);
      const offsetY = (drawH - glyphLogicH) / 2 - (minY / scale);

      ctx.fillText(char, offsetX, offsetY);

      const finalImgData = ctx.getImageData(0, 0, w, h).data;
      let hasPixels = false;
      for (let i = 3; i < finalImgData.length; i += 4) {
        if (finalImgData[i] > 10) {
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
      const origChildren = [el].concat(Array.from(el.querySelectorAll('*')));
      const cloneChildren = [clone].concat(Array.from(clone.querySelectorAll('*')));
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

          if (isDefTag || orig.closest('defs')) {
            continue; // Do not corrupt defs, gradients, stops, masks, paths inside defs, or groups with explicit fills
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
          
          if (cloned.getAttribute('stroke') && cloned.getAttribute('stroke') !== 'none') {
            const sw = origCs.strokeWidth;
            if (sw && parseFloat(sw) >= 0) cloned.setAttribute('stroke-width', sw);
            
            const lc = origCs.strokeLinecap;
            if (lc && lc !== 'butt') cloned.setAttribute('stroke-linecap', lc);
            
            const lj = origCs.strokeLinejoin;
            if (lj && lj !== 'miter') cloned.setAttribute('stroke-linejoin', lj);
            
            const da = origCs.strokeDasharray;
            if (da && da !== 'none') cloned.setAttribute('stroke-dasharray', da);
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

  function extractSvgTexts(el) {
    try {
      if (!el || typeof el.querySelectorAll !== 'function') return null;
      const textEls = Array.from(el.querySelectorAll('text'));
      if (!textEls.length) return null;
      const svgTexts = [];

      for (const textEl of textEls) {
        if (typeof textEl.getNumberOfChars !== 'function') continue;
        const numChars = textEl.getNumberOfChars();
        if (!numChars) continue;

        const cs = window.getComputedStyle(textEl);
        const textFamily = cs.fontFamily;
        const textWeight = cs.fontWeight || '400';
        const textStyle = cs.fontStyle || 'normal';
        const parsedFontSize = parseFloat(cs.fontSize) || 16;
        const textFill = cs.fill && cs.fill !== 'none' ? cs.fill : (cs.color || '#000000');
        const textOpacity = parseFloat(cs.fillOpacity || cs.opacity || '1');

        for (let i = 0; i < numChars; i++) {
          const char = textEl.textContent[i];
          if (!char || !char.trim()) continue;
          try {
            const start = textEl.getStartPositionOfChar(i);
            const end = textEl.getEndPositionOfChar(i);
            const rot = textEl.getRotationOfChar(i);
            const advance = Math.hypot(end.x - start.x, end.y - start.y) || (parsedFontSize * 0.6);
            svgTexts.push({
              char,
              x: start.x,
              y: start.y,
              rot,
              advance,
              fontSize: parsedFontSize,
              fontFamily: textFamily,
              fontWeight: textWeight,
              fontStyle: textStyle,
              fill: textFill,
              opacity: isNaN(textOpacity) ? 1 : textOpacity
            });
          } catch (e) {}
        }
      }

      return svgTexts.length > 0 ? svgTexts : null;
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

    const repeat = (cs.backgroundRepeat || '').toLowerCase();
    if (repeat.includes('repeat') && !repeat.includes('no-repeat')) return null;
    if (bgs.some(b => b.includes('transparent') || b.includes('rgba(0, 0, 0, 0)'))) return null;

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

  function isPatternGradient(bgStr, bgSize, bgRepeat) {
    if (!bgStr || bgStr === 'none') return false;
    const lower = bgStr.toLowerCase();
    if (lower.includes('repeating-linear-gradient') ||
        lower.includes('repeating-radial-gradient') ||
        lower.includes('repeating-conic-gradient')) {
      return true;
    }
    const repeat = (bgRepeat || '').toLowerCase();
    const isRepeating = repeat.includes('repeat') && !repeat.includes('no-repeat');
    if (bgSize && bgSize !== 'auto' && bgSize !== 'cover' && bgSize !== 'contain') {
      const parts = bgSize.trim().split(/\s+/);
      const w = parseFloat(parts[0]);
      if (w > 0 && (isRepeating || w <= 160) && (lower.includes('radial-gradient') || lower.includes('linear-gradient'))) {
        return true;
      }
    }
    return false;
  }

  async function renderPatternToDataUrl(bgStr, bgSize, bgRepeat, width, height) {
    try {
      const w = Math.min(2048, Math.max(1, Math.round(width || 100)));
      const h = Math.min(2048, Math.max(1, Math.round(height || 100)));
      const sizeStr = bgSize || 'auto';
      const repeatStr = bgRepeat || 'repeat';

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background-image:${bgStr};background-size:${sizeStr};background-repeat:${repeatStr};background-color:transparent;"></div>
        </foreignObject>
      </svg>`;

      const img = new Image();
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.src = svgUrl;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  /* ======================================================================
   *  SVG EMBEDDED RASTER-TO-VECTOR CONVERTER
   *  Converts SVGs containing raster <pattern><image> or <image> into 100%
   *  pure vector shapes (<rect>, <g fill="...">) with solid color fills.
   * ====================================================================== */
  async function vectorizeEmbeddedSvgImages(svgString) {
    if (!svgString || typeof svgString !== 'string') return { isVector: true, svg: svgString };
    if (!svgString.includes('<pattern') && !svgString.includes('<image')) return { isVector: true, svg: svgString };

    // Check for embedded data:image
    const imgMatch = svgString.match(/(?:xlink:)?href=["'](data:image\/[^"']+)["']/i);
    if (!imgMatch) return { isVector: true, svg: svgString };

    const dataUri = imgMatch[1];
    try {
      const img = new Image();
      await new Promise((r) => {
        img.onload = r;
        img.onerror = r;
        img.src = dataUri;
      });
      if (!img.width || !img.height) return { isVector: false, dataUri };

      const w = img.width, h = img.height;
      // If graphic is larger than 300x300, it's a photo or large graphic -> return as IMAGE!
      if (w > 300 || h > 300) {
        return { isVector: false, dataUri };
      }

      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, w, h).data;

      // Quantize colors slightly to eliminate compression artifacts
      function getHex(r, g, b) {
        const qr = Math.min(255, Math.round(r / 8) * 8);
        const qg = Math.min(255, Math.round(g / 8) * 8);
        const qb = Math.min(255, Math.round(b / 8) * 8);
        return '#' + ((1 << 24) + (qr << 16) + (qg << 8) + qb).toString(16).slice(1);
      }

      const colorSpans = {};
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const a = imgData[idx + 3];
          if (a < 40) continue;

          const hex = getHex(imgData[idx], imgData[idx + 1], imgData[idx + 2]);
          if (!colorSpans[hex]) colorSpans[hex] = [];

          let run = 1;
          while (x + run < w) {
            const nIdx = (y * w + (x + run)) * 4;
            if (imgData[nIdx + 3] >= 40 && getHex(imgData[nIdx], imgData[nIdx + 1], imgData[nIdx + 2]) === hex) {
              run++;
            } else {
              break;
            }
          }
          colorSpans[hex].push({ x, y, w: run, h: 1 });
          x += run - 1;
        }
      }

      // If it has too many distinct colors (> 64), it's a photo/complex artwork -> return as IMAGE!
      if (Object.keys(colorSpans).length > 64) {
        return { isVector: false, dataUri };
      }

      // Merge adjacent spans vertically
      let vectorShapes = '';
      for (const [color, spans] of Object.entries(colorSpans)) {
        const merged = [];
        const used = new Set();
        for (let i = 0; i < spans.length; i++) {
          if (used.has(i)) continue;
          let r = { ...spans[i] };
          used.add(i);
          for (let j = i + 1; j < spans.length; j++) {
            if (used.has(j)) continue;
            const r2 = spans[j];
            if (r2.x === r.x && r2.w === r.w && r2.y === r.y + r.h) {
              r.h += r2.h;
              used.add(j);
            }
          }
          merged.push(r);
        }

        vectorShapes += `  <g fill="${color}">\n`;
        for (const r of merged) {
          vectorShapes += `    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />\n`;
        }
        vectorShapes += `  </g>\n`;
      }

      const wMatch = svgString.match(/width=["']([\d.]+)["']/i);
      const hMatch = svgString.match(/height=["']([\d.]+)["']/i);
      const targetW = wMatch ? wMatch[1] : w;
      const targetH = hMatch ? hMatch[1] : h;

      return {
        isVector: true,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${targetW}" height="${targetH}">\n${vectorShapes}</svg>`
      };
    } catch {
      return { isVector: false, dataUri };
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

  function getQuoteMarks(el) {
    if (!el) return { open: '“', close: '”' };
    const cs = window.getComputedStyle(el);
    const qProp = cs.quotes;
    if (qProp === 'none') return { open: '', close: '' };
    if (qProp && qProp !== 'auto') {
      const matches = qProp.match(/"([^"]*)"|'([^']*)'/g);
      if (matches && matches.length >= 2) {
        return {
          open: matches[0].replace(/['"]/g, ''),
          close: matches[1].replace(/['"]/g, '')
        };
      }
    }
    const lang = (el.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || 'en').toLowerCase();
    if (lang.startsWith('fr')) return { open: '« ', close: ' »' };
    if (lang.startsWith('de')) return { open: '„', close: '“' };
    if (lang.startsWith('es')) return { open: '«', close: '»' };
    return { open: '“', close: '”' };
  }

  function getPositionedContainingBlock(el) {
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const curCs = window.getComputedStyle(cur);
      if (curCs.position !== 'static' || curCs.transform !== 'none' || curCs.filter !== 'none' || curCs.perspective !== 'none') {
        return cur;
      }
      cur = cur.parentElement;
    }
    return document.body || document.documentElement;
  }

  function establishesStackingContext(node) {
    if (!node) return false;
    const s = node.styles || {};
    if (s.zIndex && s.zIndex !== 'auto' && (s.position === 'absolute' || s.position === 'relative' || s.position === 'fixed' || s.position === 'sticky')) return true;
    if (s.opacity !== undefined && parseFloat(s.opacity) < 1) return true;
    if (s.transform && s.transform !== 'none') return true;
    if (s.filter && s.filter !== 'none') return true;
    if (s.perspective && s.perspective !== 'none') return true;
    if (s.clipPath && s.clipPath !== 'none') return true;
    if (s.mask && s.mask !== 'none') return true;
    if (s.isolation === 'isolate') return true;
    if (s.contain && (s.contain.includes('paint') || s.contain.includes('layout'))) return true;
    return false;
  }

  function getEffectiveZIndex(node) {
    if (!node) return 0;
    const s = node.styles || {};
    const zRaw = s.zIndex;
    let selfZ = 0;
    if (zRaw && zRaw !== 'auto') {
      const z = parseInt(zRaw, 10);
      if (!isNaN(z)) selfZ = z * 2;
    } else {
      const isPositioned = s.position === 'absolute' || s.position === 'fixed' || s.position === 'relative' || s.position === 'sticky';
      if (isPositioned) selfZ = 1;
    }

    if (establishesStackingContext(node)) {
      return selfZ;
    }

    let maxZ = selfZ;
    let minZ = selfZ;
    if (node.pseudoElementNodes?.before) {
      const bZ = getEffectiveZIndex(node.pseudoElementNodes.before);
      if (bZ > maxZ) maxZ = bZ;
      if (bZ < minZ) minZ = bZ;
    }
    if (node.pseudoElementNodes?.after) {
      const aZ = getEffectiveZIndex(node.pseudoElementNodes.after);
      if (aZ > maxZ) maxZ = aZ;
      if (aZ < minZ) minZ = aZ;
    }
    if (node.childNodes && node.childNodes.length > 0) {
      for (const child of node.childNodes) {
        const cZ = getEffectiveZIndex(child);
        if (cZ > maxZ) maxZ = cZ;
        if (cZ < minZ) minZ = cZ;
      }
    }
    return maxZ !== 0 ? maxZ : minZ;
  }

  async function serializePseudo(el, pseudo, assets, fonts, parentRect) {
    if (captureTimedOut) return null;
    try {
      const cs = window.getComputedStyle(el, pseudo);
      const content = cs.content;
      if (!content || content === 'none' || content === 'normal') return null;
      
      const display = cs.display;
      if (display === 'none' || parseFloat(cs.opacity) < 0.02 || cs.visibility === 'hidden') return null;
      if (cs.clipPath && cs.clipPath !== 'none' && (cs.clipPath.includes('inset(100%)') || cs.clipPath.includes('(0px'))) return null;

      // Resolve containing block for absolutely positioned pseudo-elements
      let containingEl = el;
      let baseRect = parentRect;
      if (cs.position === 'absolute') {
        containingEl = getPositionedContainingBlock(el);
        if (containingEl && containingEl !== el) {
          const clientCbRect = containingEl.getBoundingClientRect();
          const cbFixed = isElementOrAncestorFixed(containingEl, window.getComputedStyle(containingEl));
          const cbScrollX = cbFixed ? 0 : window.scrollX;
          const cbScrollY = cbFixed ? 0 : window.scrollY;
          baseRect = {
            x: clientCbRect.x + cbScrollX,
            y: clientCbRect.y + cbScrollY,
            width: clientCbRect.width,
            height: clientCbRect.height
          };
        }
      }

      // Detect CSS border triangles on pseudo-elements
      const tri = convertCssTriangleToSvg(cs);
      if (tri) {
        let px = baseRect.x;
        let py = baseRect.y;
        const parentCs = window.getComputedStyle(el);

        if (cs.position === 'absolute') {
          const t = parseFloat(cs.top);
          const b = parseFloat(cs.bottom);
          const l = parseFloat(cs.left);
          const r = parseFloat(cs.right);
          if (!isNaN(l) && cs.left !== 'auto') px = baseRect.x + l;
          else if (!isNaN(r) && cs.right !== 'auto') px = baseRect.x + baseRect.width - tri.w - r;
          if (!isNaN(t) && cs.top !== 'auto') py = baseRect.y + t;
          else if (!isNaN(b) && cs.bottom !== 'auto') py = baseRect.y + baseRect.height - tri.h - b;
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
      let text = rawContent.replace(/^["']|["']$/g, '').trim();

      // Resolve CSS quote keywords
      if (text === 'open-quote' || text === 'close-quote' || text === 'no-open-quote' || text === 'no-close-quote' ||
          rawContent === 'open-quote' || rawContent === 'close-quote') {
        if (text === 'no-open-quote' || text === 'no-close-quote') return null;
        if (el.tagName === 'Q') return null; // <q> elements inline their quotes directly into their text flow
        const quotes = getQuoteMarks(el);
        text = (text === 'open-quote' || rawContent === 'open-quote') ? quotes.open : quotes.close;
        if (!text) return null;
      }
      
      if (styles.fontFamily) fonts.addFont(styles.fontFamily);
      
      let pseudoRect = { ...baseRect };
      delete pseudoRect.offsetWidth;
      delete pseudoRect.offsetHeight;
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      if (!isNaN(w) && cs.width !== 'auto') pseudoRect.width = w;
      if (!isNaN(h) && cs.height !== 'auto') pseudoRect.height = h;

      // If text exists and width is auto, size pseudoRect to text width to avoid stretching across parentRect
      const isIconPseudo = isIconElementOrFont(text, cs.fontFamily, el.className) || (parentRect.width > 0 && parentRect.width <= 48 && Math.abs(parentRect.width - parentRect.height) <= 4);
      if (text && !isIconPseudo && (isNaN(w) || cs.width === 'auto') && cs.position !== 'absolute') {
        const estCharW = (parseFloat(cs.fontSize) || 16) * 0.55;
        pseudoRect.width = Math.ceil(text.length * estCharW);
        const estLineH = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.2;
        pseudoRect.height = Math.ceil(estLineH);
      }

      if ((hasPseudoBorder || hasPseudoBg) && (isNaN(h) || pseudoRect.height <= 2)) {
        const borderH = Math.max(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderBottomWidth) || 0, 1);
        pseudoRect.height = Math.max(h || 0, borderH);
      }

      if (cs.position === 'absolute') {
        const t = parseFloat(cs.top);
        const b = parseFloat(cs.bottom);
        const l = parseFloat(cs.left);
        const r = parseFloat(cs.right);

        if (!isNaN(l) && cs.left !== 'auto') pseudoRect.x = baseRect.x + l;
        else if (!isNaN(r) && cs.right !== 'auto') pseudoRect.x = baseRect.x + baseRect.width - pseudoRect.width - r;
        
        if (!isNaN(t) && cs.top !== 'auto') pseudoRect.y = baseRect.y + t;
        else if (!isNaN(b) && cs.bottom !== 'auto') pseudoRect.y = baseRect.y + baseRect.height - pseudoRect.height - b;

        // Filter out pseudo-elements that are completely outside an overflow:hidden ancestor
        let clipAncestor = containingEl || el.parentElement;
        while (clipAncestor && clipAncestor !== document.body && clipAncestor !== document.documentElement) {
          const clipCs = window.getComputedStyle(clipAncestor);
          const overflow = (clipCs.overflow || '') + ' ' + (clipCs.overflowX || '') + ' ' + (clipCs.overflowY || '');
          if (overflow.includes('hidden') || overflow.includes('clip')) {
            const cRect = clipAncestor.getBoundingClientRect();
            const cFixed = isElementOrAncestorFixed(clipAncestor, clipCs);
            const cScrollX = cFixed ? 0 : window.scrollX;
            const cScrollY = cFixed ? 0 : window.scrollY;
            const cDocX = cRect.x + cScrollX;
            const cDocY = cRect.y + cScrollY;
            
            const isOutside = (
              (pseudoRect.x + pseudoRect.width) <= cDocX ||
              pseudoRect.x >= (cDocX + cRect.width) ||
              (pseudoRect.y + pseudoRect.height) <= cDocY ||
              pseudoRect.y >= (cDocY + cRect.height)
            );
            if (isOutside) {
              return null;
            }
          }
          if (clipAncestor === containingEl) break;
          clipAncestor = clipAncestor.parentElement;
        }

        // Inherit border radius from containing block if pseudo covers it
        if (containingEl && containingEl !== el) {
          const cbCs = window.getComputedStyle(containingEl);
          if (cbCs.borderRadius && cbCs.borderRadius !== '0px' && (!styles.borderRadius || styles.borderRadius === '0px')) {
            if (Math.abs(pseudoRect.width - baseRect.width) <= 4 && Math.abs(pseudoRect.height - baseRect.height) <= 4) {
              styles.borderRadius = cbCs.borderRadius;
              styles.borderTopLeftRadius = cbCs.borderTopLeftRadius;
              styles.borderTopRightRadius = cbCs.borderTopRightRadius;
              styles.borderBottomLeftRadius = cbCs.borderBottomLeftRadius;
              styles.borderBottomRightRadius = cbCs.borderBottomRightRadius;
            }
          }
        }
      } else {
        const parentCs = window.getComputedStyle(el);
        const isFlex = parentCs.display && parentCs.display.includes('flex');
        const isFixed = isElementOrAncestorFixed(el, parentCs);
        const scrollX = isFixed ? 0 : window.scrollX;
        const scrollY = isFixed ? 0 : window.scrollY;

        const pMarginLeft = parseFloat(cs.marginLeft) || 0;
        const pMarginRight = parseFloat(cs.marginRight) || 0;
        const pMarginTop = parseFloat(cs.marginTop) || 0;
        const pMarginBottom = parseFloat(cs.marginBottom) || 0;

        if (isFlex) {
          const isRow = !parentCs.flexDirection || parentCs.flexDirection.startsWith('row');
          const colGap = parseFloat(parentCs.columnGap || parentCs.gap) || 0;
          const rowGap = parseFloat(parentCs.rowGap || parentCs.gap) || 0;

          const items = Array.from(el.children).map((child, idx) => {
            const cCs = window.getComputedStyle(child);
            const cOrder = parseInt(cCs.order, 10) || 0;
            return { isPseudo: false, order: cOrder, sourceIndex: idx, rect: child.getBoundingClientRect(), cs: cCs };
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
              const prevMarginRight = prev.cs ? (parseFloat(prev.cs.marginRight) || 0) : 0;
              pseudoRect.x = prev.rect.right + prevMarginRight + colGap + pMarginLeft + scrollX;
            } else {
              let startX = parentRect.x + (parseFloat(parentCs.paddingLeft) || 0) + pMarginLeft;
              if (items.length === 1 && !isNaN(pseudoRect.width)) {
                if (parentCs.justifyContent === 'center') {
                  startX = parentRect.x + (parentRect.width - pseudoRect.width) / 2;
                } else if (parentCs.justifyContent === 'flex-end' || parentCs.justifyContent === 'right') {
                  startX = parentRect.x + parentRect.width - pseudoRect.width - (parseFloat(parentCs.paddingRight) || 0) - pMarginRight;
                }
              }
              pseudoRect.x = startX;
            }

            if (next) {
              const nextMarginLeft = next.cs ? (parseFloat(next.cs.marginLeft) || 0) : 0;
              const nextLeft = next.rect.left - nextMarginLeft + scrollX;
              const availableW = Math.max(0, nextLeft - colGap - pMarginRight - pseudoRect.x);
              pseudoRect.width = (!isNaN(w) && cs.width !== 'auto') ? w : availableW;
            } else if (isNaN(w) || cs.width === 'auto') {
              pseudoRect.width = Math.max(0, parentRect.x + parentRect.width - pseudoRect.x - (parseFloat(parentCs.paddingRight) || 0) - pMarginRight);
            }

            const align = cs.alignSelf !== 'auto' ? cs.alignSelf : parentCs.alignItems;
            if (align === 'center') {
              pseudoRect.y = parentRect.y + (parentRect.height - pseudoRect.height) / 2 + (pMarginTop - pMarginBottom) / 2;
            } else if (align === 'flex-end') {
              pseudoRect.y = parentRect.y + parentRect.height - pseudoRect.height - (parseFloat(parentCs.paddingBottom) || 0) - pMarginBottom;
            } else if (align === 'flex-start') {
              pseudoRect.y = parentRect.y + (parseFloat(parentCs.paddingTop) || 0) + pMarginTop;
            } else if (prev) {
              pseudoRect.y = prev.rect.y + (prev.rect.height - pseudoRect.height) / 2 + scrollY + (pMarginTop - pMarginBottom) / 2;
            } else {
              pseudoRect.y = parentRect.y + (parentRect.height - pseudoRect.height) / 2 + (pMarginTop - pMarginBottom) / 2;
            }
          } else {
            if (prev) {
              const prevMarginBottom = prev.cs ? (parseFloat(prev.cs.marginBottom) || 0) : 0;
              pseudoRect.y = prev.rect.bottom + prevMarginBottom + rowGap + pMarginTop + scrollY;
            } else {
              let startY = parentRect.y + (parseFloat(parentCs.paddingTop) || 0) + pMarginTop;
              if (items.length === 1 && !isNaN(pseudoRect.height)) {
                if (parentCs.justifyContent === 'center') {
                  startY = parentRect.y + (parentRect.height - pseudoRect.height) / 2;
                } else if (parentCs.justifyContent === 'flex-end' || parentCs.justifyContent === 'bottom') {
                  startY = parentRect.y + parentRect.height - pseudoRect.height - (parseFloat(parentCs.paddingBottom) || 0) - pMarginBottom;
                }
              }
              pseudoRect.y = startY;
            }
            if (next) {
              const nextMarginTop = next.cs ? (parseFloat(next.cs.marginTop) || 0) : 0;
              const nextTop = next.rect.top - nextMarginTop + scrollY;
              const availableH = Math.max(0, nextTop - rowGap - pMarginBottom - pseudoRect.y);
              pseudoRect.height = (!isNaN(h) && cs.height !== 'auto') ? h : availableH;
            } else if (isNaN(h) || cs.height === 'auto') {
              pseudoRect.height = Math.max(0, parentRect.y + parentRect.height - pseudoRect.y - (parseFloat(parentCs.paddingBottom) || 0) - pMarginBottom);
            }
            const align = cs.alignSelf !== 'auto' ? cs.alignSelf : parentCs.alignItems;
            if (align === 'center') {
              pseudoRect.x = parentRect.x + (parentRect.width - pseudoRect.width) / 2 + (pMarginLeft - pMarginRight) / 2;
            } else if (align === 'flex-end') {
              pseudoRect.x = parentRect.x + parentRect.width - pseudoRect.width - (parseFloat(parentCs.paddingRight) || 0) - pMarginRight;
            } else {
              pseudoRect.x = parentRect.x + (parseFloat(parentCs.paddingLeft) || 0) + pMarginLeft;
            }
          }
        } else {
          const isCenteredText = parentCs.textAlign === 'center' || cs.textAlign === 'center';
          const isIconContainer = isIconPseudo || (parentRect.width > 0 && parentRect.width <= 64 && Math.abs(parentRect.width - parentRect.height) <= 6);
          
          if (pseudo === '::before') {
            if (isCenteredText || (isIconContainer && !el.childNodes?.length)) {
              pseudoRect.x = parentRect.x + (parentRect.width - pseudoRect.width) / 2;
            } else {
              pseudoRect.x = parentRect.x + (parseFloat(parentCs.paddingLeft) || 0) + pMarginLeft;
            }

            const parentLineH = parseFloat(parentCs.lineHeight);
            const isMiddleAlign = parentCs.verticalAlign === 'middle' || cs.verticalAlign === 'middle' ||
                                  (!isNaN(parentLineH) && parentLineH >= parentRect.height * 0.8 && parentRect.height > 0);
            if (isMiddleAlign || (isIconContainer && !el.childNodes?.length)) {
              pseudoRect.y = parentRect.y + (parentRect.height - pseudoRect.height) / 2;
            } else {
              pseudoRect.y = parentRect.y + (parseFloat(parentCs.paddingTop) || 0) + pMarginTop;
            }
          } else if (pseudo === '::after') {
            if (el.lastChild) {
              const r = document.createRange();
              try {
                r.selectNodeContents(el.lastChild);
                const lastR = r.getBoundingClientRect();
                if (lastR.width > 0 || lastR.height > 0) {
                  pseudoRect.x = lastR.right + scrollX + pMarginLeft;
                  pseudoRect.y = lastR.top + scrollY + (lastR.height - pseudoRect.height) / 2;
                } else if (el.lastElementChild) {
                  const lastR = el.lastElementChild.getBoundingClientRect();
                  pseudoRect.x = lastR.right + scrollX + pMarginLeft;
                  pseudoRect.y = lastR.top + scrollY + (lastR.height - pseudoRect.height) / 2;
                } else {
                  pseudoRect.x = parentRect.x + parentRect.width - pseudoRect.width - (parseFloat(parentCs.paddingRight) || 0) - pMarginRight;
                }
              } catch (e) {
                if (el.lastElementChild) {
                  const lastR = el.lastElementChild.getBoundingClientRect();
                  pseudoRect.x = lastR.right + scrollX + pMarginLeft;
                  pseudoRect.y = lastR.top + scrollY + (lastR.height - pseudoRect.height) / 2;
                }
              }
            } else {
              pseudoRect.x = parentRect.x + parentRect.width - pseudoRect.width - (parseFloat(parentCs.paddingRight) || 0) - pMarginRight;
              pseudoRect.y = parentRect.y + (parseFloat(parentCs.paddingTop) || 0) + pMarginTop;
            }
          }
        }
      }

      if (styles.backgroundImage && styles.backgroundImage !== 'none') {
        const w = Math.max(1, Math.round(pseudoRect.width || 100));
        const h = Math.max(1, Math.round(pseudoRect.height || 100));
        if (isPatternGradient(styles.backgroundImage, styles.backgroundSize, styles.backgroundRepeat)) {
          const dataUrl = await renderPatternToDataUrl(styles.backgroundImage, styles.backgroundSize, styles.backgroundRepeat, w, h);
          if (dataUrl) {
            if (assets) assets.addDataUrl(dataUrl);
            styles.backgroundImage = `url("${dataUrl}")`;
            styles.backgroundSize = 'cover';
          }
        } else {
          const bgs = splitByTopLevelCommas(styles.backgroundImage);
          let changed = false;
          const newBgs = [];
          for (const bg of bgs) {
            if (bg.includes('conic-gradient')) {
              const dataUrl = renderConicGradientToDataUrl(bg, w, h);
              if (dataUrl) {
                if (assets) assets.addDataUrl(dataUrl);
                newBgs.push(`url("${dataUrl}")`);
                changed = true;
                continue;
              }
            }
            if (isPatternGradient(bg, styles.backgroundSize, styles.backgroundRepeat)) {
              const dataUrl = await renderPatternToDataUrl(bg, styles.backgroundSize, styles.backgroundRepeat, w, h);
              if (dataUrl) {
                if (assets) assets.addDataUrl(dataUrl);
                newBgs.push(`url("${dataUrl}")`);
                styles.backgroundSize = 'cover';
                changed = true;
                continue;
              }
            }
            newBgs.push(bg);
          }
          if (changed) styles.backgroundImage = newBgs.join(', ');
        }
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
          let tx = 0, ty = 0, sx = 1, sy = 1;
          if (vals.length === 16) {
            const sxVal = vals[0]; const syVal = vals[5];
            if (Math.abs(sxVal) < 0.001 || Math.abs(syVal) < 0.001) return null;
            sx = sxVal; sy = syVal;
            tx = vals[12]; ty = vals[13];
          } else {
            const [a, b, c, d] = vals;
            if ((Math.abs(a) < 0.001 && Math.abs(b) < 0.001) || (Math.abs(c) < 0.001 && Math.abs(d) < 0.001)) return null;
            sx = Math.sqrt(a * a + b * b);
            sy = Math.sqrt(c * c + d * d);
            tx = vals[4]; ty = vals[5];
          }
          pseudoRect.x += tx;
          pseudoRect.y += ty;
          pseudoRect.width *= Math.abs(sx);
          pseudoRect.height *= Math.abs(sy);
          if (Math.abs(sx) !== 1 || Math.abs(sy) !== 1) {
            const currentFontSize = parseFloat(styles.fontSize) || 16;
            styles.fontSize = `${currentFontSize * Math.abs(sy)}px`;
          }
        }
      }

      // Handle the individual CSS `translate` property (Tailwind v3.3+ uses this for pseudo-elements
      // instead of the compound `transform`, so cs.transform stays 'none' even with -translate-y-1/2 etc.)
      if (cs.translate && cs.translate !== 'none') {
        const resolveCssLen = (val, ref) => {
          if (!val) return 0;
          if (val.endsWith('%')) return (parseFloat(val) / 100) * ref;
          return parseFloat(val) || 0;
        };
        const tParts = cs.translate.trim().split(/\s+/);
        const tx = resolveCssLen(tParts[0], pseudoRect.width);
        const ty = resolveCssLen(tParts[1] || '0', pseudoRect.height);
        pseudoRect.x += tx;
        pseudoRect.y += ty;
      }

      const chars = Array.from(text);
      const isIcon = isIconElementOrFont(text, cs.fontFamily, el.className);
      if (isIcon) {
        let fontData = null;
        if (chars.length === 1) {
          fontData = await getFontSvgPath(cs.fontFamily, text, styles.fontSize || cs.fontSize, cs.fontWeight, cs.fontStyle);
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
        const iconW = Math.ceil(pseudoRect.width) || parseFloat(styles.fontSize || cs.fontSize) || 16;
        const iconH = Math.ceil(pseudoRect.height) || parseFloat(styles.fontSize || cs.fontSize) || 16;
        const dataUrl = renderGlyphToImage(text, { ...cs, fontSize: styles.fontSize || cs.fontSize }, iconW, iconH);
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
   * If the node has z-index: auto and does not establish an isolated stacking
   * context (via opacity, transform, filter, etc.), any positive or negative
   * z-index from descendant nodes (such as inner copy or CTA buttons) bubbles up.
   */
  function getNodeEffectiveZIndex(node) {
    if (!node) return 0;
    const z = node.styles?.zIndex && node.styles.zIndex !== 'auto' ? parseInt(node.styles.zIndex, 10) : null;
    if (z !== null && !isNaN(z)) {
      return z;
    }
    const s = node.styles || {};
    const isIsolated = (
      (s.opacity && parseFloat(s.opacity) < 0.999) ||
      (s.transform && s.transform !== 'none') ||
      (s.filter && s.filter !== 'none') ||
      (s.isolation === 'isolate') ||
      (s.mixBlendMode && s.mixBlendMode !== 'normal')
    );
    if (isIsolated) return 0;

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

  async function serializeNode(node, assets, fonts, parentStyles) {
    if (captureTimedOut) return null;
    if (node.nodeType === TEXT_NODE) {
      if (node.parentElement) {
        const pTag = node.parentElement.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'LINK', 'TEMPLATE'].includes(pTag)) return null;
      }
      const rawText = node.textContent || '';
      if (!rawText.trim()) return null;
      const ws = parentStyles?.whiteSpace || 'normal';
      const collapseWs = (str) => {
        if (!str) return '';
        if (ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces') return str;
        if (ws === 'pre-line') return str.replace(/[ \t\f\v]+/g, ' ');
        return str.replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/ +/g, ' ');
      };

      const formatInlineText = (str) => {
        let text = collapseWs(str);
        if (ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces') return text;
        if (!node.previousSibling) {
          text = text.trimStart();
        } else if (text.startsWith(' ')) {
          text = ' ' + text.trimStart();
        }
        if (!node.nextSibling) {
          text = text.trimEnd();
        } else if (text.endsWith(' ')) {
          text = text.trimEnd() + ' ';
        }
        return text;
      };

      const isParentQ = node.parentElement && node.parentElement.tagName === 'Q';
      const isFirstTextInQ = isParentQ && (!node.previousSibling || (node.previousSibling.nodeType !== TEXT_NODE && !node.previousElementSibling));
      const isLastTextInQ = isParentQ && (!node.nextSibling || (node.nextSibling.nodeType !== TEXT_NODE && !node.nextElementSibling));

      const r = document.createRange();
      r.selectNodeContents(node);
      const rect = r.getBoundingClientRect();
      const clientRects = r.getClientRects();
      r.detach();
      if (rect.width === 0 && rect.height === 0) return null;
      const isFixed = isElementOrAncestorFixed(node.parentElement, parentStyles);

      // If single line or small inline token (like '$', '13', 'Popular Package'), preserve exact position
      
      // Check if it's an icon font character
      const charStr = collapseWs(rawText).trim() || rawText;
      const isIcon = isIconElementOrFont(charStr, parentStyles?.fontFamily, node.parentElement?.className);
      if (isIcon) {
        let scaledFontSize = parseFloat(parentStyles?.fontSize) || 16;
        if (parentStyles?.transform && parentStyles.transform.includes('matrix')) {
          const parts = parentStyles.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
          if (parts) {
            const vals = parts[1].split(',').map(parseFloat);
            let sy = 1;
            if (vals.length === 16) {
              sy = vals[5];
            } else {
              const c = vals[2], d = vals[3];
              sy = Math.sqrt(c * c + d * d);
            }
            if (Math.abs(sy) !== 1 && Math.abs(sy) > 0.001) {
              scaledFontSize = scaledFontSize * Math.abs(sy);
            }
          }
        }
        
        let fontData = null;
        if (Array.from(charStr).length === 1) {
          fontData = await getFontSvgPath(parentStyles?.fontFamily, charStr, `${scaledFontSize}px`, parentStyles?.fontWeight, parentStyles?.fontStyle);
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
          const iconW = Math.ceil(rect.width) || scaledFontSize || 16;
          const iconH = Math.ceil(rect.height) || scaledFontSize || 16;
          const dataUrl = renderGlyphToImage(charStr, { ...parentStyles, fontSize: `${scaledFontSize}px` }, iconW, iconH);
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

        const iconW = Math.ceil(symbolR.width) || scaledFontSize || parseFloat(parentStyles?.fontSize) || 16;
        const iconH = Math.ceil(symbolR.height) || scaledFontSize || parseFloat(parentStyles?.fontSize) || 16;
        let iconChild = null;
        const dataUrl = renderGlyphToImage(symbolPart, { ...parentStyles, fontSize: scaledFontSize ? `${scaledFontSize}px` : parentStyles?.fontSize }, iconW, iconH);
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
        let text = formatInlineText(rawText);
        let textX = rect.x + (isFixed ? 0 : window.scrollX);
        let textW = Math.ceil(rect.width);

        if (isParentQ) {
          const qMarks = getQuoteMarks(node.parentElement);
          if (isFirstTextInQ && !text.startsWith(qMarks.open)) {
            text = qMarks.open + text;
            const parentRect = node.parentElement.getBoundingClientRect();
            const parentLeft = parentRect.x + (isFixed ? 0 : window.scrollX);
            if (parentLeft < textX) {
              textW += Math.ceil(textX - parentLeft);
              textX = parentLeft;
            }
          }
          if (isLastTextInQ && !text.endsWith(qMarks.close)) {
            text = text + qMarks.close;
            const parentRect = node.parentElement.getBoundingClientRect();
            const parentRight = parentRect.right + (isFixed ? 0 : window.scrollX);
            if (parentRight > textX + textW) {
              textW = Math.ceil(parentRight - textX);
            }
          }
        }

        return {
          nodeType: TEXT_NODE,
          id: getNodeId('text'),
          text,
          rect: {
            x: textX,
            y: rect.y + (isFixed ? 0 : window.scrollY),
            width: textW,
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
          let lineText = collapseWs(rawText.slice(lineStart, i)).trim();
          let lineX = lineBox.x + (isFixed ? 0 : window.scrollX);
          let lineW = Math.ceil(lineBox.width);

          if (segments.length === 0 && isFirstTextInQ) {
            const qMarks = getQuoteMarks(node.parentElement);
            if (!lineText.startsWith(qMarks.open)) {
              lineText = qMarks.open + lineText;
              const parentRect = node.parentElement.getBoundingClientRect();
              const parentLeft = parentRect.x + (isFixed ? 0 : window.scrollX);
              if (parentLeft < lineX) {
                lineW += Math.ceil(lineX - parentLeft);
                lineX = parentLeft;
              }
            }
          }

          if (lineText) {
            segments.push({
              nodeType: TEXT_NODE,
              id: getNodeId('text-line'),
              text: lineText,
              rect: {
                x: lineX,
                y: lineBox.y + (isFixed ? 0 : window.scrollY),
                width: lineW,
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
      let finalLineText = collapseWs(rawText.slice(lineStart)).trim();
      let finalX = finalBox.x + (isFixed ? 0 : window.scrollX);
      let finalW = Math.ceil(finalBox.width);

      if (segments.length === 0 && isFirstTextInQ) {
        const qMarks = getQuoteMarks(node.parentElement);
        if (!finalLineText.startsWith(qMarks.open)) {
          finalLineText = qMarks.open + finalLineText;
          const parentRect = node.parentElement.getBoundingClientRect();
          const parentLeft = parentRect.x + (isFixed ? 0 : window.scrollX);
          if (parentLeft < finalX) {
            finalW += Math.ceil(finalX - parentLeft);
            finalX = parentLeft;
          }
        }
      }

      if (isLastTextInQ) {
        const qMarks = getQuoteMarks(node.parentElement);
        if (!finalLineText.endsWith(qMarks.close)) {
          finalLineText = finalLineText + qMarks.close;
          const parentRect = node.parentElement.getBoundingClientRect();
          const parentRight = parentRect.right + (isFixed ? 0 : window.scrollX);
          if (parentRight > finalX + finalW) {
            finalW = Math.ceil(parentRight - finalX);
          }
        }
      }

      if (finalLineText) {
        segments.push({
          nodeType: TEXT_NODE,
          id: getNodeId('text-line'),
          text: finalLineText,
          rect: {
            x: finalX,
            y: finalBox.y + (isFixed ? 0 : window.scrollY),
            width: finalW,
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
        text: formatInlineText(rawText),
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
    let tag = el.tagName.toUpperCase();
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'LINK', 'TEMPLATE'].includes(tag)) return null;

    const styles = getElementStyles(el);
    let isHidden = (styles.display === 'none' || styles.visibility === 'hidden' || parseFloat(styles.opacity) < 0.02);
    
    // Exception for scroll-animated elements and background graphics
    if (isHidden && styles.display !== 'none') {
      const cls = (el.className && typeof el.className === 'string') ? el.className : '';
      const isAnimTarget = /wow|animated|fadeIn|title-anim|text-anim|-anim|aos|hero-wave|hero-section|developers-wave/i.test(cls) ||
        el.hasAttribute('data-wow-delay') || el.hasAttribute('data-aos') || el.hasAttribute('data-sal') ||
        el.closest('.title-anim, .text-anim, .hero-text-anim, .hero-wave-animation, .developers-wave-animation, .developers-scale-subsection, .hero-section__background, .wow, [data-wow-delay], [data-aos]');
      
      if (isAnimTarget) {
        styles.visibility = 'visible';
        styles.opacity = '1';
        isHidden = false;
      }
    }

    if (isHidden) return null;

    // Filter out visually-hidden / screen-reader-only elements (.sr-only, .visually-hidden)
    const isClipHidden = (styles.clip && /rect\(\s*0px[,\s]+0px[,\s]+0px[,\s]+0px\s*\)/.test(styles.clip)) ||
                         (styles.clip && /rect\(\s*1px[,\s]+1px[,\s]+1px[,\s]+1px\s*\)/.test(styles.clip)) ||
                         (styles.clipPath && /inset\(\s*(?:50%|100%|0px)\s*\)/.test(styles.clipPath));
    const isTinyHidden = (styles.overflow === 'hidden' || styles.overflowX === 'hidden' || styles.overflowY === 'hidden') &&
                         (parseFloat(styles.width) <= 1 || parseFloat(styles.height) <= 1) &&
                         (styles.position === 'absolute' || styles.position === 'fixed');
    const isSrOnlyClass = typeof el.className === 'string' && /\b(?:sr-only|visually-hidden|screen-reader-text|screen-reader-only)\b/i.test(el.className);

    if (isClipHidden || isTinyHidden || isSrOnlyClass) return null;

    const clientRect = el.getBoundingClientRect();

    // Filter out position:fixed elements that are completely outside the viewport
    // (e.g. closed offcanvas menus, hidden slide-out drawers, bottom sheets, modals)
    if (styles.position === 'fixed') {
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (clientRect.width > 0 && clientRect.height > 0 && (clientRect.bottom <= 0 || clientRect.top >= vh || clientRect.right <= 0 || clientRect.left >= vw)) {
        return null;
      }
    }

    // Filter out elements positioned completely offscreen (e.g. left: -9999px, top: -9999px)
    if (clientRect.width > 0 && clientRect.height > 0 && (clientRect.right <= 0 || clientRect.bottom <= 0)) {
      return null;
    }

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
      const sources = el.querySelectorAll('source');
      for (const s of sources) {
        if (s.srcset) {
          const firstUrl = s.srcset.split(',')[0].trim().split(' ')[0];
          if (firstUrl) assets.addImage(firstUrl);
        }
      }
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
    const STRIPE_DEV_WAVE_URL = 'https://images.stripeassets.com/fzn2n1nzq965/1lk5Hfstc9dnE8xVFz1HeC/0dec8f2dde7f904eade36d8390d81c69/developer-wave-wide_2x.png';
    const isDevWaveEl = (el.className && typeof el.className === 'string' && el.className.includes('developers-wave')) ||
                        (el.closest && (el.closest('.developers-wave-animation') || el.closest('.developers-scale-subsection')));
    if (isDevWaveEl) {
      assets.addFadedImage(STRIPE_DEV_WAVE_URL, 0.18, 0.18);
    }
    if (el instanceof HTMLCanvasElement) {
      if (isDevWaveEl) {
        placeholderUrl = STRIPE_DEV_WAVE_URL;
      } else {
        placeholderUrl = assets.addCanvas(el);
      }
    } else if (el instanceof HTMLVideoElement) {
      if (el.poster) {
        assets.addImage(el.poster);
        styles.backgroundImage = `url("${el.poster}")`;
        styles.backgroundSize = 'cover';
      } else {
        placeholderUrl = assets.addVideo(el);
      }
    } else if (isDevWaveEl && el.classList && el.classList.contains('developers-wave-animation')) {
      if (!el.querySelector('canvas, img, picture')) {
        placeholderUrl = STRIPE_DEV_WAVE_URL;
      }
    }

    const isFixed = isElementOrAncestorFixed(el, styles);
    
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

    if (styles.backgroundImage && styles.backgroundImage !== 'none') {
      const w = Math.max(1, Math.round(docRect.width || el.offsetWidth || 100));
      const h = Math.max(1, Math.round(docRect.height || el.offsetHeight || 100));
      if (isPatternGradient(styles.backgroundImage, styles.backgroundSize, styles.backgroundRepeat)) {
        const dataUrl = await renderPatternToDataUrl(styles.backgroundImage, styles.backgroundSize, styles.backgroundRepeat, w, h);
        if (dataUrl) {
          if (assets) assets.addDataUrl(dataUrl);
          styles.backgroundImage = `url("${dataUrl}")`;
          styles.backgroundSize = 'cover';
        }
      } else {
        const bgs = splitByTopLevelCommas(styles.backgroundImage);
        let changed = false;
        const newBgs = [];
        for (const bg of bgs) {
          if (bg.includes('conic-gradient')) {
            const dataUrl = renderConicGradientToDataUrl(bg, w, h);
            if (dataUrl) {
              if (assets) assets.addDataUrl(dataUrl);
              newBgs.push(`url("${dataUrl}")`);
              changed = true;
              continue;
            }
          }
          if (isPatternGradient(bg, styles.backgroundSize, styles.backgroundRepeat)) {
            const dataUrl = await renderPatternToDataUrl(bg, styles.backgroundSize, styles.backgroundRepeat, w, h);
            if (dataUrl) {
              if (assets) assets.addDataUrl(dataUrl);
              newBgs.push(`url("${dataUrl}")`);
              styles.backgroundSize = 'cover';
              changed = true;
              continue;
            }
          }
          newBgs.push(bg);
        }
        if (changed) styles.backgroundImage = newBgs.join(', ');
      }
    }

    let svgContent = null;
    let svgTexts = null;
    if (tag === 'SVG' || el instanceof SVGElement) {
      svgTexts = extractSvgTexts(el);
      const rawSvg = serializeSVG(el);
      if (rawSvg) {
        const vRes = await vectorizeEmbeddedSvgImages(rawSvg);
        if (vRes && vRes.dataUri && !vRes.isVector) {
          placeholderUrl = vRes.dataUri;
          if (assets) assets.addDataUrl(vRes.dataUri);
          tag = 'IMG';
          svgContent = null;
        } else if (vRes && vRes.isVector) {
          svgContent = vRes.svg;
        } else {
          svgContent = rawSvg;
        }
      }
    } else if (el instanceof HTMLImageElement) {
      const rawSrc = el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original') || el.getAttribute('src') || '';
      if (rawSrc.includes('.svg') || rawSrc.startsWith('data:image/svg+xml')) {
        try {
          let svgText = null;
          if (rawSrc.startsWith('data:image/svg+xml')) {
            const commaIdx = rawSrc.indexOf(',');
            const raw = rawSrc.slice(commaIdx + 1);
            svgText = rawSrc.includes(';base64') ? atob(raw) : decodeURIComponent(raw);
          } else {
            let absoluteUrl = rawSrc;
            try { absoluteUrl = new URL(rawSrc, document.baseURI).href; } catch {}
            try {
              const res = await fetch(absoluteUrl);
              if (res.ok) {
                const text = await res.text();
                if (text.includes('<svg') || text.includes('<?xml')) svgText = text;
              }
            } catch {}
            if (!svgText && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
              try {
                const bgRes = await new Promise((res) => {
                  chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: absoluteUrl }, (resp) => {
                    if (chrome.runtime.lastError) res(null);
                    else res(resp);
                  });
                });
                if (bgRes && bgRes.data) {
                  const commaIdx = bgRes.data.indexOf(',');
                  const raw = commaIdx >= 0 ? bgRes.data.slice(commaIdx + 1) : bgRes.data;
                  const decoded = bgRes.data.includes(';base64') ? atob(raw) : decodeURIComponent(raw);
                  if (decoded.includes('<svg') || decoded.includes('<?xml')) svgText = decoded;
                }
              } catch {}
            }
          }
          if (svgText) {
            const vRes = await vectorizeEmbeddedSvgImages(svgText);
            if (vRes && vRes.dataUri && !vRes.isVector) {
              placeholderUrl = vRes.dataUri;
              if (assets) assets.addDataUrl(vRes.dataUri);
              tag = 'IMG';
              svgContent = null;
            } else if (vRes && vRes.isVector) {
              svgContent = vRes.svg;
              tag = 'SVG';
            } else {
              svgContent = svgText;
              tag = 'SVG';
            }
          }
        } catch {}
      }
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
                  const maxShapes = 200;
                  let count = 0;
                  if (isHorizontal) {
                    for (let x = 0; x < svgW + gapEnd && count < maxShapes; x += gapEnd, count++) {
                      shapes += `<rect x="${Number(x.toFixed(2))}" y="0" width="${Number(tickThickness.toFixed(2))}" height="${svgH}" fill="${color}" />`;
                    }
                  } else {
                    for (let y = 0; y < svgH + gapEnd && count < maxShapes; y += gapEnd, count++) {
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
      const sourceNodes = el.shadowRoot ? el.shadowRoot.childNodes : el.childNodes;
      for (const child of sourceNodes) {
        const sChild = await serializeNode(child, assets, fonts, styles);
        if (sChild) childNodes.push(sChild);
      }

      // Sort child nodes according to CSS stacking order rules while preserving DOM order
      // CSS rules: position:absolute/fixed/relative with z-index:auto stacks ABOVE position:static siblings
      const hasBackdropChild = childNodes.some(child => {
        const backdrop = child.styles?.backdropFilter || child.styles?.webkitBackdropFilter || '';
        return backdrop !== 'none' && backdrop.includes('blur');
      });
      if (childNodes.length > 1 && !hasBackdropChild) {
        childNodes.forEach((child, idx) => {
          child._originalIdx = idx;
          child._effectiveZIndex = getEffectiveZIndex(child);
        });
        childNodes.sort((a, b) => {
          const diff = a._effectiveZIndex - b._effectiveZIndex;
          return diff !== 0 ? diff : a._originalIdx - b._originalIdx;
        });
        for (const child of childNodes) {
          delete child._effectiveZIndex;
          delete child._originalIdx;
        }
      }
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || tag === 'INPUT' || tag === 'TEXTAREA') {
      const inputType = (el.getAttribute('type') || el.type || 'text').toLowerCase();
      const isTextual = ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(inputType) || tag === 'TEXTAREA';
      const isButtonInput = ['button', 'submit', 'reset'].includes(inputType);
      const val = isButtonInput
        ? (el.value || el.getAttribute('value') || '')
        : (isTextual ? (el.value || el.placeholder || el.getAttribute('placeholder') || '') : '');
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
    } else if (el instanceof HTMLSelectElement || tag === 'SELECT') {
      // Clear any invisible/detached <option> child nodes captured from DOM
      childNodes.length = 0;
      let selectedText = '';
      if (el.options && el.selectedIndex >= 0 && el.options[el.selectedIndex]) {
        selectedText = el.options[el.selectedIndex].text || el.options[el.selectedIndex].label || '';
      } else {
        selectedText = el.value || '';
      }
      if (selectedText) {
        const padLeft = parseFloat(styles.paddingLeft) || 0;
        const padTop = parseFloat(styles.paddingTop) || 0;
        const padRight = parseFloat(styles.paddingRight) || 0;
        const padBottom = parseFloat(styles.paddingBottom) || 0;

        childNodes.push({
          nodeType: TEXT_NODE,
          id: getNodeId('select-text'),
          text: selectedText,
          rect: {
            x: docRect.x + padLeft,
            y: docRect.y + padTop,
            width: Math.max(1, docRect.width - padLeft - padRight),
            height: Math.max(1, docRect.height - padTop - padBottom)
          },
          styles: { ...styles },
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
      svgTexts: svgTexts || undefined,
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

  async function captureRaw() {
    let restorePage = null;
    let savedImageAttrs = [];
    const CAPTURE_TIMEOUT = 90000;
    const captureTimer = setTimeout(() => { captureTimedOut = true; }, CAPTURE_TIMEOUT);

    try {
      await initFontMap();

      // 1. Scroll through page to activate lazy-loaded elements & image sources
      restorePage = await prepareAndScrollPage();

      // 2. Decode all visible and lazy-loaded images (save original attributes for restoration)
      const images = Array.from(document.images || []);
      savedImageAttrs = images.map(img => ({ img, decoding: img.decoding, loading: img.loading }));
      images.forEach(img => {
        if (img.decoding !== 'sync') img.decoding = 'sync';
        if (img.loading !== 'eager') img.loading = 'eager';
      });
      await Promise.allSettled(images.map(img => {
        return Promise.race([
          img.decode().catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
      }));

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

      clearTimeout(captureTimer);

      return {
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
    } finally {
      clearTimeout(captureTimer);
      captureTimedOut = false;
      try { if (restorePage) restorePage(); } catch {}
      for (const s of savedImageAttrs) {
        try { s.img.decoding = s.decoding; s.img.loading = s.loading; } catch {}
      }
    }
  }

  async function startCapture() {
    if (window.__html2FigRunning) return;
    window.__html2FigRunning = true;

    let toast = null;
    try {
      try { await navigator.clipboard.writeText(' '); } catch (e) {}
      toast = showToast('⏳ Pre-rendering full webpage…');

      let payload = await captureRaw();

      // Splice all iframes (same-origin and cross-origin) into the captured tree
      if (typeof window.__e2fSpliceFrames === 'function') {
        try {
          payload = await window.__e2fSpliceFrames(payload);
        } catch (spliceErr) {
          console.warn('[HTML-2-Fig] Splice frames warning:', spliceErr);
        }
      }

      window.__capturedPayload = payload;
      const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const ok = await writeClipboard(json);

      try { if (toast) toast.remove(); } catch {}

      if (ok) {
        showToast('✅ Full page captured! Paste into Figma plugin (Ctrl+V)', 6000);
      } else {
        showToast('⚠️ Capture complete. Please allow clipboard access.', 6000);
      }
    } catch (err) {
      console.error('[HTML-2-Fig] Capture error:', err);
      try { if (toast) toast.remove(); } catch {}
      showToast('❌ Capture failed: ' + (err.message || err), 8000);
    } finally {
      window.__html2FigRunning = false;
    }
  }

  window.html2Fig = {
    startCapture,
    captureRaw
  };
})();
