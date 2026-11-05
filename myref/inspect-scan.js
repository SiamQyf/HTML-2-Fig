/*

                        .-''-.
       __.....__      .' .-.  )
   .-''         '.   / .'  / /      _.._
  /     .-''"'-.  `.(_/   / /     .' .._|
 /     /________\   \    / /      | '
 |                  |   / /     __| |__
 \    .-------------'  . '     |__   __|
  \    '-.____...---. / /    _.-')| |
   `.             .'.' '  _.'.-'' | |
     `''-...... -' /  /.-'_.'     | |
                  /    _.'        | |
                 ( _.-'           |_|


   _____ __  ______  __  ___   __
  / ___// / / / __ \/ / / / | / /
  \__ \/ /_/ / / / / / / /  |/ /
 ___/ / __  / /_/ / /_/ / /|  /
/____/_/ /_/\____/\____/_/ |_/


  Eftikharul Alam Shoun
  justlogoz@gmail.com
  hello@exporttofigma.com
  https://exporttofigma.com

  Copyright (c) 2026 Eftikharul Alam Shoun — Export to Figma. All rights reserved.
  Proprietary & confidential. Unauthorized copying, modification, reverse-
  engineering, redistribution, or republication is prohibited.

  NO AI / ML TRAINING OR DATA MINING: No part of this software, its source, or
  its output may be used to train, fine-tune, evaluate, or develop any AI/ML
  model, large language model, or dataset, nor be ingested by any scraping,
  indexing, or retrieval system, in whole or in part, by any party, for any
  purpose, without prior written consent.

  Build identifier: v1.3.0-eas-cmcm

*/
/* ============================================================================
 *  Export to Figma — inspect-scan.js
 *  Per-frame page scanners for the Inspect detection panels (Colors / Fonts /
 *  Images / Overview / design.md).
 *
 *  Runs in EVERY frame (injected world:'MAIN', allFrames:true). Each frame
 *  scans ONLY its own document; the cross-frame gather machinery
 *  (e2fInstallInspectScan in background.js) merges results from sub-frames so
 *  the panels can see inside cross-origin iframes (e.g. Claude Design's
 *  *.claudeusercontent.com frame), which top-frame DOM walks cannot reach.
 *
 *  This file owns the SCAN logic only (pure, UI-free, structured-clonable
 *  output). The messaging/transport lives in background.js. All scan output is
 *  plain arrays/objects so it survives postMessage — the only exception is the
 *  live `element` reference kept on top-frame inline-SVG entries for render
 *  fidelity, which `wireSafe()` strips before any cross-frame hop.
 *
 *  Contact: hello@exporttofigma.com
 * ========================================================================== */
(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────────
  // Color helpers (mirror background.js)
  // ──────────────────────────────────────────────────────────────────────────
  function parseColor(str) {
    if (!str) return null;
    var m = /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*([\d.]+))?\s*\)/.exec(str);
    if (m) return { r: +m[1] | 0, g: +m[2] | 0, b: +m[3] | 0, a: m[4] === undefined ? 1 : +m[4] };
    var h = /^#([0-9a-fA-F]{3,8})$/.exec(str.trim());
    if (h) {
      var hex = h[1];
      if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
      if (hex.length === 4) hex = hex.split('').map(function (c) { return c + c; }).join('');
      if (hex.length === 6) hex += 'ff';
      return {
        r: parseInt(hex.substr(0, 2), 16),
        g: parseInt(hex.substr(2, 2), 16),
        b: parseInt(hex.substr(4, 2), 16),
        a: parseInt(hex.substr(6, 2), 16) / 255
      };
    }
    return null;
  }

  function splitGradients(bg) {
    if (!bg || bg === 'none') return [];
    var parts = [], depth = 0, start = 0;
    for (var i = 0; i < bg.length; i++) {
      var ch = bg[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { parts.push(bg.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(bg.slice(start).trim());
    return parts.filter(function (p) {
      return /^(repeating-)?(linear|radial|conic)-gradient/i.test(p);
    });
  }
  function getGradientKind(s) {
    var m = /^(repeating-)?(linear|radial|conic)-gradient/i.exec(s);
    if (!m) return 'Gradient';
    var k = m[2].charAt(0).toUpperCase() + m[2].slice(1);
    return (m[1] ? 'Repeating ' : '') + k + ' Gradient';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Colors — scan this frame's own document
  // ──────────────────────────────────────────────────────────────────────────
  function colors() {
    var counts = new Map();
    var grads = new Map();
    function add(str) {
      var p = parseColor(str);
      if (!p || p.a === 0) return;
      var key = p.r + ',' + p.g + ',' + p.b + ',' + p.a;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    var nodes = document.body ? document.body.querySelectorAll('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.offsetParent && n.tagName !== 'BODY' && n.tagName !== 'HTML') continue;
      var s = window.getComputedStyle(n);
      add(s.color); add(s.backgroundColor);
      add(s.borderTopColor); add(s.borderRightColor);
      add(s.borderBottomColor); add(s.borderLeftColor);
      add(s.outlineColor);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        var gs = splitGradients(s.backgroundImage);
        for (var g = 0; g < gs.length; g++) {
          var key = gs[g].replace(/\s+/g, ' ');
          grads.set(key, (grads.get(key) || 0) + 1);
        }
        var matches = s.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
        if (matches) for (var j = 0; j < matches.length; j++) add(matches[j]);
      }
    }
    var out = [];
    counts.forEach(function (count, key) {
      var parts = key.split(',');
      out.push({ type: 'color', r: +parts[0], g: +parts[1], b: +parts[2], a: +parts[3], count: count });
    });
    out.sort(function (a, b) { return b.count - a.count; });
    var gradients = [];
    grads.forEach(function (count, css) {
      gradients.push({ type: 'gradient', kind: getGradientKind(css), css: css, count: count });
    });
    gradients.sort(function (a, b) { return b.count - a.count; });
    return { colors: out, gradients: gradients };
  }

  function mergeColors(a, b) {
    var cmap = {}, gmap = {};
    function ingest(o) {
      if (!o) return;
      (o.colors || []).forEach(function (c) {
        var k = c.r + ',' + c.g + ',' + c.b + ',' + c.a;
        if (!cmap[k]) cmap[k] = { type: 'color', r: c.r, g: c.g, b: c.b, a: c.a, count: 0 };
        cmap[k].count += c.count || 0;
      });
      (o.gradients || []).forEach(function (gr) {
        var k = (gr.css || '').replace(/\s+/g, ' ');
        if (!k) return;
        if (!gmap[k]) gmap[k] = { type: 'gradient', kind: gr.kind || getGradientKind(gr.css || ''), css: gr.css, count: 0 };
        gmap[k].count += gr.count || 0;
      });
    }
    ingest(a); ingest(b);
    var colorsArr = Object.keys(cmap).map(function (k) { return cmap[k]; });
    colorsArr.sort(function (x, y) { return y.count - x.count; });
    var gradArr = Object.keys(gmap).map(function (k) { return gmap[k]; });
    gradArr.sort(function (x, y) { return y.count - x.count; });
    return { colors: colorsArr, gradients: gradArr };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fonts — scan this frame; returns RAW tallies (winners chosen post-merge in
  // finalizeFonts so cross-frame merges stay accurate).
  // ──────────────────────────────────────────────────────────────────────────
  function firstFamily(stack) {
    if (!stack) return '';
    var first = stack.split(',')[0] || '';
    return first.trim().replace(/^["']+|["']+$/g, '');
  }
  function hasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.replace(/\s+/g, '').length > 0) return true;
    }
    return false;
  }
  function tagToRole(tag) {
    if (!tag) return 'Text';
    if (/^h[1-6]$/.test(tag)) return 'Heading ' + tag[1];
    if (tag === 'p') return 'Paragraph';
    if (tag === 'button') return 'Button';
    if (tag === 'a') return 'Link';
    if (tag === 'code' || tag === 'pre' || tag === 'kbd' || tag === 'samp') return 'Code';
    if (tag === 'label') return 'Label';
    if (tag === 'input' || tag === 'textarea') return 'Input';
    if (tag === 'li') return 'List item';
    if (tag === 'blockquote') return 'Quote';
    if (tag === 'figcaption' || tag === 'caption') return 'Caption';
    if (tag === 'small') return 'Small text';
    if (tag === 'strong' || tag === 'b') return 'Strong';
    if (tag === 'em' || tag === 'i') return 'Emphasis';
    if (tag === 'span' || tag === 'div') return 'Body';
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
  function roleFromTagsObj(tagsObj) {
    var winner = null, max = 0;
    Object.keys(tagsObj || {}).forEach(function (t) { if (tagsObj[t] > max) { max = tagsObj[t]; winner = t; } });
    return tagToRole(winner);
  }
  function genericFromStack(stack) {
    var generic = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-serif', 'ui-sans-serif', 'ui-rounded'];
    var parts = (stack || '').split(',');
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i].trim().replace(/^["']+|["']+$/g, '').toLowerCase();
      if (generic.indexOf(p) !== -1) return p;
    }
    return null;
  }

  function fonts() {
    var fams = {};
    var nodes = document.body ? document.body.querySelectorAll('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') continue;
      if (!hasDirectText(el)) continue;
      var cs = window.getComputedStyle(el);
      var stack = cs.fontFamily || '';
      var family = firstFamily(stack);
      if (!family) continue;
      var weight = cs.fontWeight || '400';
      var size = cs.fontSize || '';
      var line = cs.lineHeight || '';
      var style = cs.fontStyle || 'normal';
      if (!fams[family]) fams[family] = { stack: stack, count: 0, variants: {} };
      var entry = fams[family];
      entry.count++;
      var key = weight + '|' + size + '|' + line + '|' + style;
      var variant = entry.variants[key];
      if (!variant) {
        variant = entry.variants[key] = {
          weight: weight, size: size, line: line, style: style,
          count: 0, tags: {}, colors: {}, letterSpacings: {}
        };
      }
      variant.count++;
      var tag = el.tagName.toLowerCase();
      variant.tags[tag] = (variant.tags[tag] || 0) + 1;
      var col = cs.color;
      variant.colors[col] = (variant.colors[col] || 0) + 1;
      var ls = cs.letterSpacing || 'normal';
      variant.letterSpacings[ls] = (variant.letterSpacings[ls] || 0) + 1;
    }
    var out = [];
    Object.keys(fams).forEach(function (family) {
      var f = fams[family];
      var isWeb = false;
      try { isWeb = !!(document.fonts && document.fonts.check && document.fonts.check('16px "' + family + '"')); } catch (_) {}
      var variants = Object.keys(f.variants).map(function (k) { return f.variants[k]; });
      out.push({ family: family, stack: f.stack, count: f.count, isWeb: isWeb, variants: variants });
    });
    return out;
  }

  function mergeTally(dst, src) {
    if (!src) return;
    Object.keys(src).forEach(function (k) { dst[k] = (dst[k] || 0) + src[k]; });
  }
  function mergeFonts(a, b) {
    var fams = {};
    function ingest(list) {
      (list || []).forEach(function (f) {
        if (!f || !f.family) return;
        var ex = fams[f.family];
        if (!ex) ex = fams[f.family] = { family: f.family, stack: f.stack || '', count: 0, isWeb: false, variants: {} };
        if (!ex.stack && f.stack) ex.stack = f.stack;
        ex.count += f.count || 0;
        ex.isWeb = ex.isWeb || !!f.isWeb;
        (f.variants || []).forEach(function (v) {
          var key = v.weight + '|' + v.size + '|' + v.line + '|' + v.style;
          var ev = ex.variants[key];
          if (!ev) ev = ex.variants[key] = { weight: v.weight, size: v.size, line: v.line, style: v.style, count: 0, tags: {}, colors: {}, letterSpacings: {} };
          ev.count += v.count || 0;
          mergeTally(ev.tags, v.tags);
          mergeTally(ev.colors, v.colors);
          mergeTally(ev.letterSpacings, v.letterSpacings);
        });
      });
    }
    ingest(a); ingest(b);
    return Object.keys(fams).map(function (name) {
      var f = fams[name];
      return {
        family: f.family, stack: f.stack, count: f.count, isWeb: f.isWeb,
        variants: Object.keys(f.variants).map(function (k) { return f.variants[k]; })
      };
    });
  }

  // Collapse RAW (possibly cross-frame-merged) font tallies into the exact shape
  // the Fonts panel renders: per-variant winners + sorting + weightsCount.
  function finalizeFonts(raw) {
    var out = (raw || []).map(function (f) {
      var variants = (f.variants || []).map(function (x) {
        var role = roleFromTagsObj(x.tags);
        var mainColor = null, maxC = 0;
        Object.keys(x.colors || {}).forEach(function (k) { if (x.colors[k] > maxC) { maxC = x.colors[k]; mainColor = k; } });
        var mainLetterSpacing = 'normal', maxL = 0;
        Object.keys(x.letterSpacings || {}).forEach(function (k) { if (x.letterSpacings[k] > maxL) { maxL = x.letterSpacings[k]; mainLetterSpacing = k; } });
        return {
          weight: x.weight, size: x.size, line: x.line, style: x.style,
          count: x.count, role: role, mainColor: mainColor, mainLetterSpacing: mainLetterSpacing
        };
      });
      variants.sort(function (a, b) {
        var sa = parseFloat(a.size), sb = parseFloat(b.size);
        if (sb !== sa) return sb - sa;
        return parseFloat(b.weight) - parseFloat(a.weight);
      });
      var weightsSet = {};
      variants.forEach(function (x) { weightsSet[x.weight] = 1; });
      return {
        family: f.family, stack: f.stack, variants: variants,
        count: f.count, isWeb: f.isWeb,
        weightsCount: Object.keys(weightsSet).length,
        generic: genericFromStack(f.stack)
      };
    });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Images — scan this frame (mirror background.js scanPageImages)
  // ──────────────────────────────────────────────────────────────────────────
  function extFromSrc(src) {
    var m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(src || '');
    return m ? m[1].toLowerCase() : '';
  }
  function isOurOverlay(el) {
    var OURS = { __h2f_p1_host__: 1, __h2f_inspect_overlay_host__: 1, __figma_capture_toolbar_host__: 1 };
    var n = el;
    while (n) {
      if (n.id && OURS[n.id]) return true;
      n = n.parentNode || n.host;
    }
    return false;
  }
  var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'apng', 'bmp', 'ico', 'tiff', 'tif'];
  var SVG_EXTS = ['svg'];
  var LOTTIE_EXTS = ['lottie'];
  function classifyExt(src, hint) {
    if (hint === 'svg') return { type: 'svg', ext: 'svg' };
    if (src && src.startsWith('data:image/svg+xml')) return { type: 'svg', ext: 'svg' };
    if (src && /^data:image\/gif/.test(src)) return { type: 'image', ext: 'gif' };
    var ext = extFromSrc(src);
    if (SVG_EXTS.indexOf(ext) !== -1) return { type: 'svg', ext: 'svg' };
    if (LOTTIE_EXTS.indexOf(ext) !== -1) return { type: 'lottie', ext: 'lottie' };
    if (IMAGE_EXTS.indexOf(ext) !== -1) return { type: 'image', ext: ext };
    return { type: 'image', ext: ext || 'img' };
  }
  function forEachElementDeep(root, fn) {
    if (!root) return;
    var nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      fn(n);
      if (n.shadowRoot) forEachElementDeep(n.shadowRoot, fn);
    }
  }
  function parseSrcset(srcset) {
    if (!srcset) return [];
    var out = [];
    srcset.split(',').forEach(function (part) {
      var t = part.trim();
      if (!t) return;
      var bits = t.split(/\s+/);
      var url = bits[0];
      if (!url) return;
      var score = 1;
      for (var i = 1; i < bits.length; i++) {
        var mw = /^(\d+)w$/.exec(bits[i]);
        var mx = /^([\d.]+)x$/.exec(bits[i]);
        if (mw) score = Math.max(score, parseInt(mw[1], 10));
        else if (mx) score = Math.max(score, parseFloat(mx[1]) * 1000);
      }
      out.push({ url: url, score: score });
    });
    return out;
  }
  function pickBestSrc(el) {
    var best = null, bestScore = -1;
    function consider(srcset) {
      if (!srcset) return;
      parseSrcset(srcset).forEach(function (c) {
        if (c.score > bestScore) { bestScore = c.score; best = c.url; }
      });
    }
    consider(el.getAttribute && el.getAttribute('srcset'));
    consider(el.getAttribute && el.getAttribute('data-srcset'));
    var pic = el.closest && el.closest('picture');
    if (pic) {
      var sources = pic.querySelectorAll('source');
      for (var i = 0; i < sources.length; i++) {
        consider(sources[i].getAttribute('srcset'));
        consider(sources[i].getAttribute('data-srcset'));
      }
    }
    if (best) return best;
    if (el.currentSrc) return el.currentSrc;
    if (el.src) return el.src;
    var lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-image-src', 'data-original-src'];
    for (var a = 0; a < lazyAttrs.length; a++) {
      var v = el.getAttribute(lazyAttrs[a]);
      if (v) return v;
    }
    return '';
  }
  function imageResourceUrls() {
    try {
      var entries = performance.getEntriesByType('resource') || [];
      var urls = [];
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (e.initiatorType === 'img') { urls.push(e.name); continue; }
        if (e.initiatorType === 'video' && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(e.name)) { urls.push(e.name); continue; }
        if (/\.(png|jpe?g|webp|avif|gif|apng|bmp|ico|tiff?|svg)(\?|#|$)/i.test(e.name)) { urls.push(e.name); }
      }
      return urls;
    } catch (_) { return []; }
  }
  function pageMetaImageUrls() {
    var urls = [];
    var metaSel =
      'meta[property="og:image"], meta[name="og:image"], ' +
      'meta[property="og:image:secure_url"], ' +
      'meta[property="og:image:url"], ' +
      'meta[name="twitter:image"], meta[property="twitter:image"], ' +
      'meta[name="twitter:image:src"]';
    document.querySelectorAll(metaSel).forEach(function (m) {
      var c = m.getAttribute('content');
      if (c) urls.push(c);
    });
    document.querySelectorAll('link[rel="preload"][as="image"], link[rel="image_src"], link[rel="apple-touch-icon"], link[rel="icon"]').forEach(function (l) {
      var h = l.getAttribute('href');
      if (h) urls.push(h);
    });
    return urls;
  }

  function images() {
    var map = new Map();
    function add(key, item) {
      if (!map.has(key)) map.set(key, Object.assign({ count: 0 }, item));
      map.get(key).count++;
    }
    function addUrl(url, hint) {
      if (!url) return;
      var resolved;
      try { resolved = new URL(url, location.href).href; } catch (_) { resolved = url; }
      if (resolved.startsWith('data:image/svg+xml')) {
        add(resolved, { type: 'svg', src: resolved, ext: 'svg', width: null, height: null });
        return;
      }
      var c = classifyExt(resolved, hint);
      add(resolved, { type: c.type, src: resolved, ext: c.ext, width: null, height: null });
    }

    forEachElementDeep(document, function (el) {
      if (!el || el.tagName !== 'IMG') return;
      if (isOurOverlay(el)) return;
      var src = pickBestSrc(el);
      if (!src) return;
      var resolved;
      try { resolved = new URL(src, location.href).href; } catch (_) { resolved = src; }
      var c = classifyExt(resolved);
      add(resolved, {
        type: c.type, src: resolved, alt: el.alt || '',
        width: el.naturalWidth || null, height: el.naturalHeight || null, ext: c.ext
      });
    });

    forEachElementDeep(document, function (el) {
      if (!el || el.tagName !== 'VIDEO') return;
      if (isOurOverlay(el)) return;
      var poster = el.poster || el.getAttribute('poster');
      if (poster) addUrl(poster);
      var vsrc = el.currentSrc || el.src;
      if (!vsrc) {
        var firstSource = el.querySelector('source');
        if (firstSource) vsrc = firstSource.src || firstSource.getAttribute('src');
      }
      if (vsrc) {
        try { vsrc = new URL(vsrc, location.href).href; } catch (_) {}
        var vext = extFromSrc(vsrc) || 'mp4';
        add(vsrc, { type: 'video', src: vsrc, ext: vext, width: el.videoWidth || null, height: el.videoHeight || null });
      }
    });

    forEachElementDeep(document, function (el) {
      if (!el || el.tagName !== 'svg' && el.tagName !== 'SVG') return;
      if (isOurOverlay(el)) return;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      var serialized;
      try { serialized = new XMLSerializer().serializeToString(el); } catch (_) { return; }
      if (!/xmlns=/.test(serialized)) {
        serialized = serialized.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      add(serialized, {
        type: 'svg', svg: serialized,
        element: el, // live ref — top-frame cloneNode at render time (strict-CSP fidelity); stripped before any cross-frame hop by wireSafe()
        width: Math.round(rect.width), height: Math.round(rect.height),
        ext: 'svg', inline: true
      });
    });

    forEachElementDeep(document, function (el) {
      if (!el || el.tagName !== 'image' && el.tagName !== 'IMAGE') return;
      var href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href) addUrl(href);
    });

    forEachElementDeep(document, function (el) {
      if (!el || !el.tagName) return;
      var tag = el.tagName.toLowerCase();
      var isLottie = tag === 'dotlottie-player' || tag === 'lottie-player' || tag === 'dotlottie-wc';
      var lazyAttr = el.getAttribute && (el.getAttribute('data-lottie-src') || el.getAttribute('data-anim-path'));
      if (!isLottie && !lazyAttr) return;
      if (isOurOverlay(el)) return;
      var lsrc = (el.getAttribute && (el.getAttribute('src') || el.getAttribute('data-src'))) || lazyAttr;
      if (!lsrc) return;
      try { lsrc = new URL(lsrc, location.href).href; } catch (_) {}
      var lExt = /\.lottie(\?|$)/i.test(lsrc) ? 'lottie' : 'json';
      add(lsrc, { type: 'lottie', src: lsrc, ext: lExt, width: null, height: null });
    });

    var bgEls = document.body ? document.body.querySelectorAll('*') : [];
    for (var b = 0; b < bgEls.length; b++) {
      var bel = bgEls[b];
      var bcs = window.getComputedStyle(bel);
      if (bcs.display === 'none' || bcs.visibility === 'hidden') continue;
      if (isOurOverlay(bel)) continue;
      var sources = [bcs.backgroundImage, bcs.maskImage, bcs.webkitMaskImage, bcs.borderImageSource, bcs.listStyleImage, bcs.cursor];
      sources.forEach(function (srcCss) {
        if (!srcCss || srcCss === 'none') return;
        var matches = srcCss.match(/url\((["']?)([^"')]+)\1\)/g);
        if (!matches) return;
        matches.forEach(function (mm) {
          var x = /url\((["']?)([^"')]+)\1\)/.exec(mm);
          if (!x) return;
          var bgSrc = x[2];
          if (bgSrc.startsWith('data:image/svg+xml')) return;
          var resolved;
          try { resolved = new URL(bgSrc, location.href).href; } catch (_) { resolved = bgSrc; }
          var bc = classifyExt(resolved);
          add(resolved, { type: bc.type, src: resolved, ext: bc.ext, source: 'background', width: null, height: null });
        });
      });
    }

    imageResourceUrls().forEach(function (u) { addUrl(u); });
    pageMetaImageUrls().forEach(function (u) { addUrl(u); });

    var out = [];
    map.forEach(function (v) { out.push(v); });
    var typeOrder = { svg: 0, image: 1, lottie: 2, video: 3 };
    out.sort(function (a, b) {
      var ao = typeOrder[a.type] || 9, bo = typeOrder[b.type] || 9;
      if (ao !== bo) return ao - bo;
      return b.count - a.count;
    });
    return out;
  }

  function mergeImages(a, b) {
    var map = {};
    var typeOrder = { svg: 0, image: 1, lottie: 2, video: 3 };
    function keyOf(it) { return it.inline ? ('svg:' + (it.svg || '')) : ('url:' + (it.src || it.svg || '')); }
    function ingest(list) {
      (list || []).forEach(function (it) {
        if (!it) return;
        var k = keyOf(it);
        var ex = map[k];
        if (!ex) { map[k] = Object.assign({}, it); return; }
        ex.count = (ex.count || 0) + (it.count || 0);
        if ((ex.width == null || ex.height == null) && it.width != null) { ex.width = it.width; ex.height = it.height; }
        if (!ex.alt && it.alt) ex.alt = it.alt;
        if (!ex.element && it.element) ex.element = it.element; // keep top-frame live ref
      });
    }
    ingest(a); ingest(b);
    var out = Object.keys(map).map(function (k) { return map[k]; });
    out.sort(function (x, y) {
      var xo = typeOrder[x.type] || 9, yo = typeOrder[y.type] || 9;
      if (xo !== yo) return xo - yo;
      return (y.count || 0) - (x.count || 0);
    });
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Overview / design.md — element-derived raw page metrics for this frame.
  // Structured-clonable (no live nodes): the contrast samples keep only the
  // fields design.md consumes ({color,bg,pass}); layout is raw (pre-bucket) so it
  // can be merged across frames and bucketed once at the end by the generator.
  // Page-PERFORMANCE metrics (weight, load time, stylesheet bytes) are NOT here —
  // those stay top-frame (they're host-page network stats, not element data).
  // ──────────────────────────────────────────────────────────────────────────
  function wcagLuminance(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function contrastRatio(c1, c2) {
    var l1 = wcagLuminance(c1), l2 = wcagLuminance(c2);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function visible(el) { return el.offsetParent || el.tagName === 'BODY'; }
  function parseDurations(str, into) {
    if (!str || str === '0s' || str === 'none') return;
    str.split(',').forEach(function (p) {
      p = p.trim();
      var ms = /ms$/.test(p) ? parseFloat(p) : (/s$/.test(p) ? parseFloat(p) * 1000 : NaN);
      if (isFinite(ms) && ms > 0 && ms < 5000) into.push(Math.round(ms));
    });
  }
  // ── One CSSOM walk: breakpoints + hover patterns + keyframes + reduced-motion ──
  // This REPLACES the old breakpoints-only walk, which was uncapped. Everything that needs
  // to read stylesheet rules rides this single pass, and every limit below is a cap the old
  // version did not have — so the worst case here is strictly cheaper than before.
  //
  // Cross-origin sheets throw on .cssRules; so does CSSImportRule.styleSheet.cssRules,
  // separately. Both are caught, and blocked sheets are COUNTED so the generator can say
  // "couldn't read the CSS" instead of silently reporting "no hover patterns".
  var CSSOM_MAX_SHEETS = 60;
  var CSSOM_MAX_RULES = 8000;
  var CSSOM_MAX_DEPTH = 3;
  var CSSOM_MAX_HOVER = 400;

  // Which visual channel a hovered property changes. Read off rule.style, which enumerates
  // ONLY the properties the rule actually declares — exactly "what hover changes".
  function hoverCategory(prop) {
    if (prop === 'color') return 'Color';
    if (prop.indexOf('background') === 0) return 'Background';
    if (prop.indexOf('text-decoration') === 0 || prop === 'letter-spacing' ||
        prop === 'font-weight' || prop === 'text-underline-offset') return 'Text';
    if (prop === 'fill' || prop === 'stroke' || prop === 'stroke-width') return 'Stroke';
    if (prop === 'transform' || prop === 'translate' || prop === 'scale' || prop === 'rotate') return 'Transform';
    if (prop === 'opacity') return 'Opacity';
    if (prop === 'box-shadow' || prop === 'text-shadow' || prop === 'filter' ||
        prop === 'backdrop-filter') return 'Shadow';
    if (prop.indexOf('border') === 0 || prop.indexOf('outline') === 0) return 'Border';
    return null;
  }

  function scanCssomRaw() {
    var out = {
      breakpoints: [], hover: {}, hoverRules: 0, hoverCapped: false,
      keyframes: 0, reducedMotion: false, sheetsBlocked: 0
    };
    var bps = {}, rulesSeen = 0;

    function walk(rules, depth) {
      if (!rules || depth > CSSOM_MAX_DEPTH) return;
      for (var j = 0; j < rules.length; j++) {
        if (++rulesSeen > CSSOM_MAX_RULES) return;
        var r = rules[j];
        // Media queries: breakpoints + the reduced-motion opt-in.
        if (r.media && r.media.mediaText) {
          var mt = r.media.mediaText;
          var m = mt.match(/(?:min|max)-width\s*:\s*([\d.]+)px/g);
          if (m) {
            for (var k = 0; k < m.length; k++) {
              var v = parseFloat(m[k].match(/([\d.]+)/)[1]);
              if (v > 0) bps[Math.round(v)] = 1;
            }
          }
          if (mt.indexOf('prefers-reduced-motion') >= 0) out.reducedMotion = true;
        }
        // @keyframes — a rough proxy for "how much bespoke animation is here".
        if (r.type === 7 || (r.constructor && r.constructor.name === 'CSSKeyframesRule')) out.keyframes++;
        // :hover style rules — record WHICH channels change.
        if (r.selectorText && r.selectorText.indexOf(':hover') >= 0 && r.style) {
          if (out.hoverRules < CSSOM_MAX_HOVER) {
            out.hoverRules++;
            for (var p = 0; p < r.style.length; p++) {
              var cat = hoverCategory(r.style[p]);
              if (cat) out.hover[cat] = (out.hover[cat] || 0) + 1;
            }
          } else { out.hoverCapped = true; }
        }
        // Nested containers: @media, @supports, @layer, and native CSS nesting.
        if (r.cssRules) { try { walk(r.cssRules, depth + 1); } catch (_) { out.sheetsBlocked++; } }
      }
    }

    try {
      var sheets = document.styleSheets, n = Math.min(sheets.length, CSSOM_MAX_SHEETS);
      for (var i = 0; i < n; i++) {
        var rules;
        try { rules = sheets[i].cssRules; } catch (_) { out.sheetsBlocked++; continue; }
        if (!rules) continue;
        walk(rules, 0);
        if (rulesSeen > CSSOM_MAX_RULES) break;
      }
    } catch (_) {}
    out.breakpoints = Object.keys(bps).map(Number).sort(function (a, b) { return a - b; });
    return out;
  }
  // Split a CSS list on TOP-LEVEL commas only. parseDurations' naive .split(',') would shred
  // `cubic-bezier(0.4, 0, 0.2, 1)` into four garbage entries, so easings need this instead.
  function splitTop(str) {
    var out = [], depth = 0, cur = '', ch;
    for (var i = 0; i < str.length; i++) {
      ch = str[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  var EASING_CAP = 60;
  function tallyEasings(str, into) {
    if (!str) return;
    var parts = splitTop(str);
    for (var i = 0; i < parts.length; i++) {
      var e = parts[i];
      if (!e) continue;
      if (into[e] === undefined && Object.keys(into).length >= EASING_CAP) continue;
      into[e] = (into[e] || 0) + 1;
    }
  }

  // Scroll/animation libraries. Each probe is individually try/caught: sites define throwing
  // getters and Proxies on window, and one bad property must not kill the whole table.
  // Runs per-frame because these globals are frame-local.
  function scrollLibsRaw() {
    var libs = {}, scripts = {}, markers = {};
    function probe(name, fn) { try { if (fn()) libs[name] = 1; } catch (_) { /* hostile global */ } }
    function q(sel) { try { return !!document.querySelector(sel); } catch (_) { return false; } }
    probe('GSAP', function () { return !!(window.gsap || window.TweenMax || window.TweenLite); });
    probe('ScrollTrigger', function () { return !!window.ScrollTrigger || q('.gsap-marker-start'); });
    probe('Framer Motion', function () { return q('[data-framer-name],[data-projection-id]'); });
    probe('Lenis', function () { return !!(window.Lenis || window.lenis) || q('.lenis,[data-lenis]'); });
    probe('Locomotive Scroll', function () { return !!window.LocomotiveScroll || q('[data-scroll-container]'); });
    probe('AOS', function () { return !!window.AOS || q('[data-aos]'); });
    probe('ScrollMagic', function () { return !!window.ScrollMagic; });
    probe('Motion One', function () { return !!window.Motion; });
    probe('ScrollReveal', function () { return !!(window.ScrollReveal || window.sr); });
    probe('Swiper', function () { return !!window.Swiper || q('.swiper,.swiper-container'); });
    // Bundlers rename globals, so also fingerprint the network: a src match is evidence even
    // when the library never touches window.
    var PATTERNS = [
      ['GSAP', /gsap|tweenmax|scrolltrigger/i], ['Framer Motion', /framer-motion|framerusercontent/i],
      ['Lenis', /lenis/i], ['Locomotive Scroll', /locomotive/i], ['AOS', /\baos[.\-]/i],
      ['ScrollMagic', /scrollmagic/i], ['ScrollReveal', /scrollreveal/i], ['Swiper', /swiper/i],
      ['Lottie', /lottie/i], ['Rive', /\brive[.\-]/i], ['Barba', /barba/i]
    ];
    try {
      var srcs = document.querySelectorAll('script[src], link[href]');
      for (var i = 0; i < srcs.length && i < 250; i++) {
        var u = srcs[i].getAttribute('src') || srcs[i].getAttribute('href') || '';
        if (!u) continue;
        for (var j = 0; j < PATTERNS.length; j++) if (PATTERNS[j][1].test(u)) scripts[PATTERNS[j][0]] = 1;
      }
    } catch (_) {}
    // Marker density: how much of the page opts into scroll animation, not merely whether the
    // library is loaded. querySelectorAll only for these two — the rest are existence checks.
    try { markers['data-aos'] = document.querySelectorAll('[data-aos]').length; } catch (_) {}
    try { markers['data-scroll'] = document.querySelectorAll('[data-scroll]').length; } catch (_) {}
    return { libs: libs, scripts: scripts, markers: markers };
  }

  // ── Icons: library, drawing style, optical size ───────────────────────────────
  // ⚠ ALWAYS getAttribute('class'). On <svg>/<use> the .className property is an
  // SVGAnimatedString, and .match() on it silently returns null — a whole detection table
  // would no-op with no error.
  var ICON_LIBS = [
    ['Iconify', /(^|\s)iconify(\s|$)|iconify--/], ['Lucide', /(^|\s)lucide(-|\s|$)/],
    ['Feather', /(^|\s)feather(-|\s|$)/], ['Bootstrap Icons', /(^|\s)bi(\s+bi-|-)/],
    ['Font Awesome', /(^|\s)fa[srlbd]?(\s+fa-|-)/], ['Material Symbols', /material-symbols/],
    ['Material Icons', /material-icons/], ['Heroicons', /heroicon/],
    ['Remix Icon', /(^|\s)ri-/], ['Phosphor', /(^|\s)ph(\s+ph-|-)/],
    ['Tabler', /tabler-icon|(^|\s)ti(\s+ti-|-)/], ['Boxicons', /(^|\s)bx(\s+bx-|-)/],
    ['Ionicons', /(^|\s)ion-/]
  ];
  var ICON_SVG_CAP = 200;
  function iconsRaw() {
    var out = {
      libs: {}, sets: {}, scripts: {}, sprite: 0,
      style: { linear: 0, filled: 0, duotone: 0 },
      strokeWidths: {}, sizes: {}, svgCount: 0, examined: 0, capped: false
      // NO `sample` FIELD ANY MORE. This used to carry the geometry of the FIRST square-ish
      // svg in DOM order so the panel could redraw it — and redrawing cannot work. It dropped
      // `transform` (the shape's AND every ancestor group's), `fill`, `fill-rule`, `clip-path`
      // and every non-leaf node, capped attributes at 400 chars, and happily collected shapes
      // out of <clipPath>/<defs> that the page never paints. On google.com the winner was the
      // search box's loading-spinner ARC, which is why the card drew an empty ring.
      // The panel now clones the real elements out of the images scan instead.
    };
    function clsOf(el) { try { return el.getAttribute('class') || ''; } catch (_) { return ''; } }
    function noteLib(cls) {
      for (var i = 0; i < ICON_LIBS.length; i++) {
        if (ICON_LIBS[i][1].test(cls)) out.libs[ICON_LIBS[i][0]] = (out.libs[ICON_LIBS[i][0]] || 0) + 1;
      }
    }
    // Iconify-style sets: data-icon="solar:arrow-right-linear" -> the "solar" prefix is the set.
    // This is where a label like "Solar Linear" comes from.
    try {
      var tagged = document.querySelectorAll('[data-icon], iconify-icon[icon]');
      for (var t = 0; t < tagged.length && t < 400; t++) {
        var v = tagged[t].getAttribute('data-icon') || tagged[t].getAttribute('icon') || '';
        var c = v.indexOf(':');
        if (c > 0) { var set = v.slice(0, c); out.sets[set] = (out.sets[set] || 0) + 1; }
        noteLib(clsOf(tagged[t]));
      }
    } catch (_) {}
    try { if (document.querySelector('script[src*="iconify"]')) out.scripts['Iconify'] = 1; } catch (_) {}
    try {
      var uses = document.querySelectorAll('use');
      for (var u = 0; u < uses.length && u < 400; u++) {
        var href = uses[u].getAttribute('href') || uses[u].getAttribute('xlink:href') || '';
        if (/^#(icon|sprite|i)[-_]/i.test(href)) out.sprite++;
      }
    } catch (_) {}
    // forEachElementDeep, not document.querySelectorAll: every other scan in this file already
    // pierces shadow roots, and this one did not — so web-component sites (YouTube, Reddit,
    // any Lit/Shoelace app) reported zero icons.
    var svgs = [];
    try {
      forEachElementDeep(document, function (n) {
        if (n.tagName === 'svg' || n.tagName === 'SVG') svgs.push(n);
      });
    } catch (_) { return out; }
    out.svgCount = svgs.length;
    for (var i = 0; i < svgs.length; i++) {
      if (out.examined >= ICON_SVG_CAP) { out.capped = true; break; }
      var el = svgs[i], r;
      // isOurOverlay: five other scans guard with this and this one did not. It was safe only
      // because our shadow root happened to be opaque to querySelectorAll — and the deep walk
      // above just removed that accident.
      try { if (isOurOverlay(el)) continue; } catch (_) {}
      try { r = el.getBoundingClientRect(); } catch (_) { continue; }
      if (!r || r.width < 8 || r.width > 96 || Math.abs(r.width - r.height) > 4) continue;  // square-ish only
      // Hidden things were eligible before, so a closed menu's icons and an idle spinner both
      // counted toward the style tally that labels the card.
      try {
        var vs = window.getComputedStyle(el);
        if (vs.display === 'none' || vs.visibility === 'hidden' || parseFloat(vs.opacity) < 0.05) continue;
      } catch (_) {}
      out.examined++;
      noteLib(clsOf(el));
      // Two fingerprints that live in attributes nobody was reading, and which resolve "Custom"
      // on a large slice of the web. Both are present on google.com right now.
      try {
        var vb = el.getAttribute('viewBox') || '';
        // The -960 origin is unique to Material Symbols' 960-unit grid.
        if (/^0\s+-960\s+960\s+960$/.test(vb.trim())) out.libs['Material Symbols'] = (out.libs['Material Symbols'] || 0) + 1;
        // The classic Material Icons Illustrator export marker.
        if (el.hasAttribute('enable-background')) out.libs['Material Icons'] = (out.libs['Material Icons'] || 0) + 1;
      } catch (_) {}
      var size = String(Math.round(r.width));
      out.sizes[size] = (out.sizes[size] || 0) + 1;
      // Read the SHAPE CHILDREN, not the <svg> root: the root's computed fill/stroke is
      // usually just the inherited default and says nothing about how the icon is drawn.
      var shapes;
      try { shapes = el.querySelectorAll('path, circle, rect, polygon, line, polyline, ellipse'); } catch (_) { continue; }
      var hasStroke = false, hasFill = false, fillOpacities = {}, nOp = 0;
      for (var k = 0; k < shapes.length && k < 3; k++) {
        var ss;
        try { ss = window.getComputedStyle(shapes[k]); } catch (_) { continue; }
        var sw = parseFloat(ss.strokeWidth) || 0;
        var strokeSet = ss.stroke && ss.stroke !== 'none' && !/rgba?\([^)]*,\s*0\)$/.test(ss.stroke);
        var fillSet = ss.fill && ss.fill !== 'none' && !/rgba?\([^)]*,\s*0\)$/.test(ss.fill);
        if (strokeSet && sw > 0) {
          hasStroke = true;
          var swk = String(Math.round(sw * 4) / 4);
          out.strokeWidths[swk] = (out.strokeWidths[swk] || 0) + 1;
        }
        if (fillSet) {
          hasFill = true;
          var fo = ss.fillOpacity === undefined ? '1' : String(ss.fillOpacity);
          if (!fillOpacities[fo]) { fillOpacities[fo] = 1; nOp++; }
        }
      }
      var duotone = nOp >= 2 || /duotone/i.test(clsOf(el));
      if (duotone) out.style.duotone++;
      else if (hasStroke && !hasFill) out.style.linear++;
      else out.style.filled++;

    }
    return out;
  }

  // Column count from a RESOLVED gridTemplateColumns. getComputedStyle returns used track
  // sizes ("240px 240px 240px"), not the authored "repeat(3, 1fr)", so counting top-level
  // tokens is enough — but split on whitespace OUTSIDE parens so minmax(200px, 1fr) stays one.
  function trackCount(v) {
    if (!v || v === 'none') return 0;
    // A value still containing repeat() was NOT resolved (rare, but some engines pass the
    // authored value through for `display:none` subtrees). Counting tokens would report 1.
    var rep = /repeat\(\s*(\d+)\s*,/.exec(v);
    if (rep) return parseInt(rep[1], 10) || 0;
    var n = 0, depth = 0, inTok = false;
    for (var i = 0; i < v.length; i++) {
      var c = v[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth === 0 && (c === ' ' || c === '\t')) { inTok = false; continue; }
      if (!inTok) { inTok = true; n++; }
    }
    return n;
  }

  // ── Page-shape probes: content width, framing, column alignment ───────────────
  // ⚠ ALL THREE ARE PER-FRAME AND MUST NOT MERGE ACROSS FRAMES. An ad iframe's innerWidth of
  // 300 would otherwise become "the page's content width". mergeOverview keeps the TOP frame's
  // value (first non-null wins) and background.js's emptyOf seeds them null for that reason.
  function sectionCandidates() {
    var out = [], seen = [];
    try {
      var kids = document.body ? document.body.children : [];
      for (var i = 0; i < kids.length; i++) out.push(kids[i]);
      var tagged = document.querySelectorAll('main, section, header, footer, article');
      for (var j = 0; j < tagged.length && out.length < 200; j++) {
        if (out.indexOf(tagged[j]) < 0) out.push(tagged[j]);
      }
    } catch (_) {}
    void seen;
    return out.slice(0, 200);
  }

  function widthRaw(cands) {
    var vw = window.innerWidth || 0;
    var maxWidths = {}, sectionW = [], innerW = [], bodyPadX = 0;
    try { bodyPadX = parseFloat(window.getComputedStyle(document.body).paddingLeft) || 0; } catch (_) {}
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i], w = 0;
      try { w = el.offsetWidth || 0; } catch (_) { continue; }
      if (w < vw * 0.5) continue;                 // not a page-level section
      if (sectionW.length < 60) sectionW.push(w);
      // Walk down to the widest descendant (<=4 levels) — that is the content measure.
      var node = el, widest = el, wWidest = 0;
      for (var d = 0; d < 4 && node; d++) {
        var kids = node.children, best = null, bestW = -1;
        for (var k = 0; k < kids.length; k++) {
          var kw = kids[k].offsetWidth || 0;
          if (kw > bestW) { bestW = kw; best = kids[k]; }
        }
        if (!best || bestW <= 0) break;
        // The DECLARED max-width is the robust signal: it survives a browser window narrower
        // than the design measure, where the USED width would under-report.
        try {
          var mw = parseFloat(window.getComputedStyle(best).maxWidth);
          if (isFinite(mw) && mw >= 480 && mw <= 2000) {
            var key = String(Math.round(mw));
            maxWidths[key] = (maxWidths[key] || 0) + 1;
          }
        } catch (_) {}
        if (bestW > wWidest) { wWidest = bestW; widest = best; }
        node = best;
      }
      void widest;
      if (wWidest > 0 && innerW.length < 60) innerW.push(wWidest);
    }
    return { vw: vw, maxWidths: maxWidths, sectionW: sectionW, innerW: innerW, bodyPadX: bodyPadX };
  }

  function framingRaw(cands) {
    var vw = window.innerWidth || 0, framedN = 0, sectionN = 0;
    var bodyBg = '', htmlBg = '', bodyMarginX = 0, bodyRadius = 0;
    try {
      var bs = window.getComputedStyle(document.body);
      bodyBg = bs.backgroundColor; bodyMarginX = parseFloat(bs.marginLeft) || 0;
      bodyRadius = parseFloat(bs.borderTopLeftRadius) || 0;
      htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
    } catch (_) {}
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i], s;
      try {
        if ((el.offsetWidth || 0) < vw * 0.5) continue;
        s = window.getComputedStyle(el);
      } catch (_) { continue; }
      sectionN++;
      var bordered = parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderBottomWidth) > 0 &&
                     parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderRightWidth) > 0;
      var bg = s.backgroundColor;
      var ownBg = !!bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== bodyBg;
      var shadowed = !!s.boxShadow && s.boxShadow !== 'none';
      if (bordered || ownBg || shadowed) framedN++;
    }
    var htmlBgDiff = !!htmlBg && !!bodyBg && htmlBg !== bodyBg &&
                     htmlBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'rgba(0, 0, 0, 0)';
    return { framedN: framedN, sectionN: sectionN, htmlBgDiff: htmlBgDiff,
             bodyMarginX: bodyMarginX, bodyRadius: bodyRadius };
  }

  // Left-edge histogram over section children. A strong grid makes many rows start at the
  // same few x positions; a free-form page scatters them.
  function edgesRaw(cands) {
    var buckets = {}, total = 0;
    for (var i = 0; i < cands.length && total < 400; i++) {
      var kids;
      try { kids = cands[i].children; } catch (_) { continue; }
      for (var k = 0; k < kids.length && total < 400; k++) {
        var r;
        try { r = kids[k].getBoundingClientRect(); } catch (_) { continue; }
        if (!r || r.width < 40 || r.height < 8) continue;
        var key = String(Math.round(r.left / 4) * 4);
        buckets[key] = (buckets[key] || 0) + 1;
        total++;
      }
    }
    return { buckets: buckets, total: total };
  }

  function sampleTextRaw() {
    try {
      var bits = [];
      var hs = document.querySelectorAll('h1, h2, nav a, [role="navigation"] a');
      for (var i = 0; i < hs.length && bits.length < 40; i++) {
        var t = (hs[i].textContent || '').trim(); if (t) bits.push(t);
      }
      return bits.join(' ');
    } catch (_) { return ''; }
  }

  function overview() {
    var nodes = document.body ? document.body.querySelectorAll('*') : [];
    var nodeCount = nodes.length;
    var i;
    var truncated = nodeCount > 30000;
    var cssom = scanCssomRaw();
    var cands = sectionCandidates();   // shared by the three page-shape probes below

    // ── Contrast samples (wire-safe: only {color,bg,pass}; the live element used
    //    by the top-frame drill-down is intentionally not serialized) ──────────
    var samples = [], pass = 0, fail = 0;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.offsetParent && el.tagName !== 'BODY') continue;
      if (!hasDirectText(el)) continue;
      var cs = window.getComputedStyle(el);
      var color = parseColor(cs.color);
      if (!color || color.a === 0) continue;
      var p = el, bg = parseColor(cs.backgroundColor);
      while (p && p.parentElement && (!bg || bg.a === 0)) {
        p = p.parentElement;
        bg = parseColor(window.getComputedStyle(p).backgroundColor);
      }
      if (!bg || bg.a === 0) bg = { r: 255, g: 255, b: 255, a: 1 };
      var ratio = contrastRatio(color, bg);
      var size = parseFloat(cs.fontSize) || 16;
      var weight = parseInt(cs.fontWeight, 10) || 400;
      var large = size >= 24 || (size >= 18.66 && weight >= 700);
      var ok = ratio >= (large ? 3 : 4.5);
      ok ? pass++ : fail++;
      samples.push({ color: color, bg: bg, pass: ok });
    }

    // ── Layout raw (bucketed/sorted later by design.md's generator) ────────────
    // padding / margin / gap are collected SEPARATELY (they used to be one `space` array).
    // The generator still derives the old union for its space.* tokens, so the wire payload
    // is the same size — these are the same 11 property reads, just routed into three
    // buckets. The split matters because the three answer different questions: gaps reveal
    // the rhythm between siblings, padding the rhythm inside a component, and margins are
    // mostly noise (auto-centring produces odd values that pollute a base-unit estimate).
    var padding = [], margin = [], gap = [], cardPadding = [];
    var radius = [], durations = [];
    var shadows = {}, borders = {}, easings = {};
    var animatedCount = 0;
    var display = { grid: 0, flexRow: 0, flexCol: 0, stack: 0, multicol: 0, tracks: {} };
    var vwHalf = (window.innerWidth || 0) * 0.5;
    var comp = { buttons: 0, inputs: 0, cards: 0, links: 0, headings: 0, images: 0, icons: 0, navigation: 0 };
    var padProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
    var marProps = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'];
    var gapProps = ['gap', 'rowGap', 'columnGap'];
    var radiusProps = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
    var borderProps = [['borderTopWidth', 'borderTopColor'], ['borderRightWidth', 'borderRightColor'],
      ['borderBottomWidth', 'borderBottomColor'], ['borderLeftWidth', 'borderLeftColor']];
    for (i = 0; i < nodes.length; i++) {
      var e2 = nodes[i];
      if (!visible(e2)) continue;
      var s = window.getComputedStyle(e2), v, q;
      for (q = 0; q < padProps.length; q++) { v = parseFloat(s[padProps[q]]); if (!isNaN(v) && v > 0 && v < 500) padding.push(v); }
      for (q = 0; q < marProps.length; q++) { v = parseFloat(s[marProps[q]]); if (!isNaN(v) && v > 0 && v < 500) margin.push(v); }
      for (q = 0; q < gapProps.length; q++) { v = parseFloat(s[gapProps[q]]); if (!isNaN(v) && v > 0 && v < 500) gap.push(v); }
      for (q = 0; q < radiusProps.length; q++) { v = parseFloat(s[radiusProps[q]]); if (!isNaN(v) && v > 0) radius.push(v); }
      var bs = s.boxShadow;
      if (bs && bs !== 'none') { var nb = bs.replace(/\s+/g, ' ').trim(); shadows[nb] = (shadows[nb] || 0) + 1; }
      parseDurations(s.transitionDuration, durations);
      parseDurations(s.animationDuration, durations);
      // Easings, gated on a NON-ZERO duration. Without that guard every element on the page
      // reports its initial `ease` value and drowns the real signal — the tally would say
      // "this site uses ease" for a site that uses cubic-bezier everywhere.
      var td = s.transitionDuration, ad = s.animationDuration, anim = false;
      if (td && td !== '0s') { tallyEasings(s.transitionTimingFunction, easings); anim = true; }
      if (ad && ad !== '0s') { tallyEasings(s.animationTimingFunction, easings); anim = true; }
      if (anim) animatedCount++;
      for (q = 0; q < borderProps.length; q++) {
        if (parseFloat(s[borderProps[q][0]]) > 0) {
          var bc = s[borderProps[q][1]];
          if (bc && !/rgba?\([^)]*,\s*0\)$/.test(bc) && bc !== 'transparent') borders[bc] = (borders[bc] || 0) + 1;
        }
      }
      // Layout mode tally. Gated to containers that are BOTH page-width-ish and have real
      // children — without that filter, 400 tiny flex chips outvote the six actual sections.
      // display/childElementCount are free; offsetWidth is only read for the few that qualify.
      if (e2.childElementCount >= 3) {
        var disp = s.display;
        var isGrid = disp === 'grid' || disp === 'inline-grid';
        var isFlex = disp === 'flex' || disp === 'inline-flex';
        var multi = s.columnCount && s.columnCount !== 'auto';
        if (isGrid || isFlex || multi) {
          if ((e2.offsetWidth || 0) >= vwHalf) {
            if (multi) display.multicol++;
            else if (isGrid) {
              var tracks = trackCount(s.gridTemplateColumns);
              if (tracks >= 2) { display.grid++; display.tracks[tracks] = (display.tracks[tracks] || 0) + 1; }
              else display.stack++;
            } else if (/^row/.test(s.flexDirection)) display.flexRow++;
            else display.flexCol++;
          }
        } else if (disp === 'block' || disp === 'flow-root') {
          if ((e2.offsetWidth || 0) >= vwHalf) display.stack++;
        }
      }
      var tag = e2.tagName.toLowerCase();
      if (tag === 'button' || e2.getAttribute('role') === 'button') comp.buttons++;
      else if (tag === 'input' || tag === 'textarea' || tag === 'select') comp.inputs++;
      else if (tag === 'a' && e2.hasAttribute('href')) comp.links++;
      else if (/^h[1-6]$/.test(tag)) comp.headings++;
      else if (tag === 'img') comp.images++;
      else if (tag === 'svg') comp.icons++;
      else if (tag === 'nav' || e2.getAttribute('role') === 'navigation') comp.navigation++;
      else if (tag === 'div' || tag === 'article' || tag === 'section') {
        if (parseFloat(s.borderTopLeftRadius) > 2 && s.boxShadow && s.boxShadow !== 'none') {
          var texts = 0, kids = e2.querySelectorAll('*');
          for (var j = 0; j < kids.length && texts < 2; j++) {
            var chn = kids[j].childNodes;
            for (var k = 0; k < chn.length; k++) { if (chn[k].nodeType === 3 && chn[k].textContent.trim()) { texts++; break; } }
          }
          if (texts >= 2) {
            comp.cards++;
            // Card padding rides the EXISTING card predicate so comp.cards keeps its exact
            // meaning. Vertical + horizontal only (right/bottom are near-always mirrors and
            // would just double-weight the same value in the bucket).
            var cpT = parseFloat(s.paddingTop), cpL = parseFloat(s.paddingLeft);
            if (!isNaN(cpT) && cpT > 0 && cpT < 200) cardPadding.push(cpT);
            if (!isNaN(cpL) && cpL > 0 && cpL < 200) cardPadding.push(cpL);
          }
        }
      }
    }

    return {
      nodeCount: nodeCount,
      contrast: { samples: samples, pass: pass, fail: fail },
      layout: {
        padding: padding, margin: margin, gap: gap, cardPadding: cardPadding,
        radius: radius, durations: durations, shadows: shadows, borders: borders, comp: comp,
        // From the single CSSOM walk above — motion signals that live in the stylesheets
        // rather than on any element.
        hover: cssom.hover, hoverRules: cssom.hoverRules, hoverCapped: cssom.hoverCapped,
        keyframes: cssom.keyframes, reducedMotion: cssom.reducedMotion,
        sheetsBlocked: cssom.sheetsBlocked,
        easings: easings, animatedCount: animatedCount,
        scroll: scrollLibsRaw(),
        display: display,
        // Skipped on spreadsheet-class DOMs: this pass adds its own getComputedStyle calls on
        // top of the element loop, and on a 30k-node page that is the difference between a
        // slow scan and an unusable one. `truncated` surfaces in the generated doc so a
        // partial scan never reads as a complete one.
        icons: truncated ? null : iconsRaw(),
        truncated: truncated,
        // PER-FRAME ONLY — see the note on the probes. mergeOverview keeps the top frame's.
        width: widthRaw(cands), framing: framingRaw(cands), edges: edgesRaw(cands)
      },
      breakpoints: cssom.breakpoints,
      sampleText: sampleTextRaw()
    };
  }

  function mergeIcons(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    function sum(x, y) { var o = {}; [x || {}, y || {}].forEach(function (m) { Object.keys(m).forEach(function (k) { o[k] = (o[k] || 0) + m[k]; }); }); return o; }
    return {
      libs: sum(a.libs, b.libs), sets: sum(a.sets, b.sets), scripts: sum(a.scripts, b.scripts),
      sprite: (a.sprite || 0) + (b.sprite || 0),
      style: sum(a.style, b.style),
      strokeWidths: sum(a.strokeWidths, b.strokeWidths), sizes: sum(a.sizes, b.sizes),
      svgCount: (a.svgCount || 0) + (b.svgCount || 0),
      examined: (a.examined || 0) + (b.examined || 0),
      capped: !!(a.capped || b.capped)
    };
  }

  function mergeOverview(a, b) {
    a = a || {}; b = b || {};
    var ca = a.contrast || {}, cb = b.contrast || {};
    var la = a.layout || {}, lb = b.layout || {};
    function sumInto(dst, src) { src = src || {}; Object.keys(src).forEach(function (k) { dst[k] = (dst[k] || 0) + src[k]; }); return dst; }
    // For frame-local values: keep the first one that exists. `a` is the frame nearer the top.
    function firstOf(x, y) { return (x === undefined || x === null) ? (y === undefined ? null : y) : x; }
    var bpSet = {};
    (a.breakpoints || []).concat(b.breakpoints || []).forEach(function (v) { bpSet[v] = 1; });
    var st = [a.sampleText || '', b.sampleText || ''].filter(Boolean).join(' ');
    if (st.length > 4000) st = st.slice(0, 4000);
    return {
      nodeCount: (a.nodeCount || 0) + (b.nodeCount || 0),
      contrast: {
        samples: (ca.samples || []).concat(cb.samples || []),
        pass: (ca.pass || 0) + (cb.pass || 0),
        fail: (ca.fail || 0) + (cb.fail || 0)
      },
      layout: {
        // `space` is legacy: a frame injected before an extension reload can still emit the
        // old merged array. Carry it through so finalizeLayout can fall back to it.
        space: (la.space || []).concat(lb.space || []),
        padding: (la.padding || []).concat(lb.padding || []),
        margin: (la.margin || []).concat(lb.margin || []),
        gap: (la.gap || []).concat(lb.gap || []),
        cardPadding: (la.cardPadding || []).concat(lb.cardPadding || []),
        radius: (la.radius || []).concat(lb.radius || []),
        durations: (la.durations || []).concat(lb.durations || []),
        shadows: sumInto(sumInto({}, la.shadows), lb.shadows),
        borders: sumInto(sumInto({}, la.borders), lb.borders),
        comp: sumInto(sumInto({}, la.comp), lb.comp),
        // Motion signals: tallies sum, counters sum, booleans OR. An iframe honouring
        // prefers-reduced-motion does not make the parent page honour it, but for a
        // page-level "is reduced motion respected anywhere" signal, OR is the useful answer.
        hover: sumInto(sumInto({}, la.hover), lb.hover),
        hoverRules: (la.hoverRules || 0) + (lb.hoverRules || 0),
        hoverCapped: !!(la.hoverCapped || lb.hoverCapped),
        keyframes: (la.keyframes || 0) + (lb.keyframes || 0),
        reducedMotion: !!(la.reducedMotion || lb.reducedMotion),
        sheetsBlocked: (la.sheetsBlocked || 0) + (lb.sheetsBlocked || 0),
        easings: sumInto(sumInto({}, la.easings), lb.easings),
        animatedCount: (la.animatedCount || 0) + (lb.animatedCount || 0),
        // A library loaded inside an iframe IS on the page, so union the detections.
        scroll: {
          libs: sumInto(sumInto({}, (la.scroll || {}).libs), (lb.scroll || {}).libs),
          scripts: sumInto(sumInto({}, (la.scroll || {}).scripts), (lb.scroll || {}).scripts),
          markers: sumInto(sumInto({}, (la.scroll || {}).markers), (lb.scroll || {}).markers)
        },
        display: {
          grid: ((la.display || {}).grid || 0) + ((lb.display || {}).grid || 0),
          flexRow: ((la.display || {}).flexRow || 0) + ((lb.display || {}).flexRow || 0),
          flexCol: ((la.display || {}).flexCol || 0) + ((lb.display || {}).flexCol || 0),
          stack: ((la.display || {}).stack || 0) + ((lb.display || {}).stack || 0),
          multicol: ((la.display || {}).multicol || 0) + ((lb.display || {}).multicol || 0),
          tracks: sumInto(sumInto({}, (la.display || {}).tracks), (lb.display || {}).tracks)
        },
        // FIRST NON-NULL WINS, and `a` is always the frame nearer the top (gatherScan folds
        // local-then-sub). This is the guard against an ad iframe's 300px viewport becoming
        // the page's reported content width — these three are frame-local by nature and must
        // never be summed or averaged. background.js's emptyOf seeds them null so the accumulator
        // cannot shadow a real child value either.
        width: firstOf(la.width, lb.width),
        framing: firstOf(la.framing, lb.framing),
        edges: firstOf(la.edges, lb.edges),
        // Buttons: regroup by signature across frames, re-sort, re-cap. A design system used
        // in both the page and an embedded app SHOULD collapse to one style, not two.
        icons: mergeIcons(la.icons, lb.icons),
        truncated: !!(la.truncated || lb.truncated)
      },
      breakpoints: Object.keys(bpSet).map(Number).sort(function (x, y) { return x - y; }),
      sampleText: st
    };
  }

  // Strip non-clonable live DOM refs before a cross-frame postMessage hop.
  function wireSafe(kind, data) {
    if (kind !== 'images' || !data) return data;
    return data.map(function (it) {
      if (it && it.element) {
        var c = {};
        for (var p in it) { if (p !== 'element' && Object.prototype.hasOwnProperty.call(it, p)) c[p] = it[p]; }
        return c;
      }
      return it;
    });
  }

  window.__h2fScan = {
    colors: colors,
    fonts: fonts,            // RAW tallies; collapse with finalizeFonts after merge
    images: images,
    overview: overview,      // RAW element metrics; design.md buckets layout after merge
    finalizeFonts: finalizeFonts,
    wireSafe: wireSafe,
    merge: { colors: mergeColors, fonts: mergeFonts, images: mergeImages, overview: mergeOverview }
  };
})();
