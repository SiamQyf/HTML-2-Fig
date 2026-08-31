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

  Original Chrome Web Store extension ID: cmcmimoddnfpdjnbcafnaknhionhknfa
*/
// designmd.js — DESIGN.md + SKILL.md generator
// MAIN-world script. Exposes window.__e2fBuildDesignDocs(bundle) -> { design, skill }.
//
// The toolbar (background.js) gathers a `bundle` using its shared scanners and
// calls the generator below; this file owns all the layout scanning, token
// normalization, page profiling, and markdown templating so background.js stays lean.
//
// Output is a structured design-system spec: mission, brand, tokens, accessibility,
// rules, workflow, and quality gates. All code and prose here are our own; reads the DOM only.
// Contact: justlogoz@gmail.com · hello@exporttofigma.com

(function () {
  if (window.__e2fBuildDesignDocs) return; // idempotent on re-inject

  // ── tiny helpers ──────────────────────────────────────────────────────────
  function toHex(c) {
    function h(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
    return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
  }
  function lum(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; } // 0..255, perceptual-ish
  function rgbKey(c) { return c.r + ',' + c.g + ',' + c.b; }
  function kebab(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
  }
  function visible(el) { return el.offsetParent || el.tagName === 'BODY'; }
  function tok(name, val) { return '`' + name + '=' + val + '`'; }
  // YAML double-quoted scalar. Frontmatter values are built from page-supplied text
  // (document.title), so ':', '#' and quotes all have to survive the round trip.
  function yamlQuote(s) {
    return '"' + String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';
  }

  // ── single layout pass: spacing, radius, shadow, motion, borders, components ─
  function bucket(values, tol) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < sorted.length; i++) {
      var v = sorted[i], last = out[out.length - 1];
      if (last && Math.abs(v - last.rep) <= tol) {
        last.vals.push(v); last.count++;
        last.rep = last.vals[Math.floor(last.vals.length / 2)];
      } else { out.push({ rep: v, vals: [v], count: 1 }); }
    }
    return out.map(function (b) { return { value: Math.round(b.rep), count: b.count }; });
  }
  function parseDurations(str, into) {
    if (!str || str === '0s' || str === 'none') return;
    str.split(',').forEach(function (p) {
      p = p.trim();
      var ms = /ms$/.test(p) ? parseFloat(p) : (/s$/.test(p) ? parseFloat(p) * 1000 : NaN);
      if (isFinite(ms) && ms > 0 && ms < 5000) into.push(Math.round(ms));
    });
  }
  // ── Layout acquisition ──────────────────────────────────────────────────────
  // PREFERRED PATH: delegate to inspect-scan.js's overview(). Both files are injected
  // world:'MAIN' into the SAME top-frame realm (background.js injects designmd.js and
  // inspect-scan.js back to back), so __h2fScan is simply available here.
  //
  // This is what stops the two scanners drifting. They used to be byte-for-byte duplicates
  // maintained in parallel, so every new metric had to be added twice; now there is one
  // collector and scanLayoutInline below is a frozen fallback.
  // overview() is a full-DOM getComputedStyle pass — memoize it, or scanLayout() and
  // extractBreakpoints() would each pay for their own. `false` means "tried and unavailable",
  // distinct from undefined ("not yet tried"), so a failed probe is not retried either.
  var _ovCache;
  function localOverview() {
    if (_ovCache !== undefined) return _ovCache;
    _ovCache = false;
    try {
      var S = window.__h2fScan;
      if (S && typeof S.overview === 'function') _ovCache = S.overview() || false;
    } catch (_) { /* stays false */ }
    return _ovCache;
  }

  function scanLayout() {
    var raw = localOverview();
    // raw.layout is always an object when overview() succeeds, so this cannot recurse back
    // into scanLayout() via finalizeLayout's own `if (!raw)` guard.
    if (raw && raw.layout) return finalizeLayout(raw.layout);
    return scanLayoutInline();
  }

  // LAST-RESORT PATH: a self-contained top-frame scan for when inspect-scan.js never landed
  // (the page rejected that injection). DELIBERATELY FROZEN — do NOT extend it with new
  // metrics. Every consumer below guards on presence, so anything this does not collect
  // simply degrades to absent in the generated markdown, which is the correct behaviour for
  // a page we could not fully scan. New metrics go in inspect-scan.js's overview() ONLY.
  function scanLayoutInline() {
    var space = [], radius = [], durations = [];
    var shadows = new Map(), borders = new Map();
    var comp = { buttons: 0, inputs: 0, cards: 0, links: 0, headings: 0, images: 0, icons: 0, navigation: 0 };
    var spaceProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap'];
    var radiusProps = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
    var borderProps = [['borderTopWidth', 'borderTopColor'], ['borderRightWidth', 'borderRightColor'],
      ['borderBottomWidth', 'borderBottomColor'], ['borderLeftWidth', 'borderLeftColor']];
    var nodes = document.body ? document.body.querySelectorAll('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var cs = window.getComputedStyle(el), v, p;
      for (p = 0; p < spaceProps.length; p++) { v = parseFloat(cs[spaceProps[p]]); if (!isNaN(v) && v > 0 && v < 500) space.push(v); }
      for (p = 0; p < radiusProps.length; p++) { v = parseFloat(cs[radiusProps[p]]); if (!isNaN(v) && v > 0) radius.push(v); }
      var bs = cs.boxShadow;
      if (bs && bs !== 'none') { var nb = bs.replace(/\s+/g, ' ').trim(); shadows.set(nb, (shadows.get(nb) || 0) + 1); }
      parseDurations(cs.transitionDuration, durations);
      parseDurations(cs.animationDuration, durations);
      for (p = 0; p < borderProps.length; p++) {
        if (parseFloat(cs[borderProps[p][0]]) > 0) {
          var bc = cs[borderProps[p][1]];
          if (bc && !/rgba?\([^)]*,\s*0\)$/.test(bc) && bc !== 'transparent') borders.set(bc, (borders.get(bc) || 0) + 1);
        }
      }
      var tag = el.tagName.toLowerCase();
      if (tag === 'button' || el.getAttribute('role') === 'button') comp.buttons++;
      else if (tag === 'input' || tag === 'textarea' || tag === 'select') comp.inputs++;
      else if (tag === 'a' && el.hasAttribute('href')) comp.links++;
      else if (/^h[1-6]$/.test(tag)) comp.headings++;
      else if (tag === 'img') comp.images++;
      else if (tag === 'svg') comp.icons++;
      else if (tag === 'nav' || el.getAttribute('role') === 'navigation') comp.navigation++;
      else if (tag === 'div' || tag === 'article' || tag === 'section') {
        if (parseFloat(cs.borderTopLeftRadius) > 2 && cs.boxShadow && cs.boxShadow !== 'none') {
          var texts = 0, kids = el.querySelectorAll('*');
          for (var j = 0; j < kids.length && texts < 2; j++) {
            var ch = kids[j].childNodes;
            for (var k = 0; k < ch.length; k++) { if (ch[k].nodeType === 3 && ch[k].textContent.trim()) { texts++; break; } }
          }
          if (texts >= 2) comp.cards++;
        }
      }
    }
    var shadowArr = []; shadows.forEach(function (c, kk) { shadowArr.push({ value: kk, count: c }); });
    shadowArr.sort(function (a, b) { return b.count - a.count; });
    var borderArr = []; borders.forEach(function (c, kk) { borderArr.push({ value: kk, count: c }); });
    borderArr.sort(function (a, b) { return b.count - a.count; });
    // Empty arrays for the split-spacing fields: this frozen path does not collect them, and
    // shape parity with finalizeLayout keeps every consumer free of undefined checks. Absent
    // data correctly degrades to "no base unit / no gap scale" in the markdown.
    return {
      space: bucket(space, 1), radius: bucket(radius, 1),
      padding: [], margin: [], gap: [], cardPadding: [],
      shadows: shadowArr, motion: bucket(durations, 8), borders: borderArr, comp: comp,
      easings: {}, animatedCount: 0, hover: {}, hoverRules: 0,
      keyframes: 0, reducedMotion: false, sheetsBlocked: 0,
      scroll: { libs: {}, scripts: {}, markers: {} },
      display: null, width: null, framing: null, edges: null,
      icons: null, truncated: false
    };
  }
  // Same delegation as scanLayout: prefer inspect-scan.js's single CSSOM walk (which also
  // collects hover patterns, keyframes and reduced-motion in the same pass), fall back to
  // this frozen inline copy only when that machinery is absent.
  function extractBreakpoints() {
    var raw = localOverview();
    if (raw && raw.breakpoints) return raw.breakpoints;
    return extractBreakpointsInline();
  }
  function extractBreakpointsInline() {
    var bps = new Set();
    try {
      for (var i = 0; i < document.styleSheets.length; i++) {
        var rules; try { rules = document.styleSheets[i].cssRules; } catch (_) { continue; }
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          var r = rules[j];
          if (r.media && r.media.mediaText) {
            var m = r.media.mediaText.match(/(?:min|max)-width\s*:\s*([\d.]+)px/g);
            if (m) m.forEach(function (mm) { var v = parseFloat(mm.match(/([\d.]+)/)[1]); if (v > 0) bps.add(Math.round(v)); });
          }
        }
      }
    } catch (_) {}
    return Array.from(bps).sort(function (a, b) { return a - b; });
  }

  // Bucket/sort RAW layout tallies (collected per-frame and merged across frames by
  // inspect-scan.js's overview()) into scanLayout()'s exact return shape. Used when the
  // cross-frame bundle supplies `layout`; falls back to a top-frame scanLayout() otherwise.
  function finalizeLayout(raw) {
    if (!raw) return scanLayout();
    var shadowArr = []; Object.keys(raw.shadows || {}).forEach(function (kk) { shadowArr.push({ value: kk, count: raw.shadows[kk] }); });
    shadowArr.sort(function (a, b) { return b.count - a.count; });
    var borderArr = []; Object.keys(raw.borders || {}).forEach(function (kk) { borderArr.push({ value: kk, count: raw.borders[kk] }); });
    borderArr.sort(function (a, b) { return b.count - a.count; });
    // VERSION SKEW: a sub-frame injected before an extension reload still emits the old
    // merged `space` array with no padding/margin/gap. Default every new field and fall back
    // to the legacy union, so a stale frame degrades instead of erroring.
    var pad = raw.padding || [], mar = raw.margin || [], gp = raw.gap || [];
    // The legacy `space` union still drives the existing space.* tokens. Reconstruct it from
    // the split arrays rather than sending it twice over the wire — bucket() sorts its input,
    // so the concat order here cannot change the output.
    var spaceAll = (raw.padding || raw.margin || raw.gap)
      ? pad.concat(mar, gp)
      : (raw.space || []);
    return {
      space: bucket(spaceAll, 1),
      padding: bucket(pad, 1),
      margin: bucket(mar, 1),
      gap: bucket(gp, 1),
      cardPadding: bucket(raw.cardPadding || [], 1),
      radius: bucket(raw.radius || [], 1),
      shadows: shadowArr,
      motion: bucket(raw.durations || [], 8),
      borders: borderArr,
      comp: raw.comp || { buttons: 0, inputs: 0, cards: 0, links: 0, headings: 0, images: 0, icons: 0, navigation: 0 },
      // Motion signals from the CSSOM walk + the element pass. All defaulted: a stale frame
      // or the frozen inline path supplies none of them, and every consumer guards on presence.
      easings: raw.easings || {},
      animatedCount: raw.animatedCount || 0,
      hover: raw.hover || {},
      hoverRules: raw.hoverRules || 0,
      keyframes: raw.keyframes || 0,
      reducedMotion: !!raw.reducedMotion,
      sheetsBlocked: raw.sheetsBlocked || 0,
      scroll: raw.scroll || { libs: {}, scripts: {}, markers: {} },
      display: raw.display || null,
      width: raw.width || null,
      framing: raw.framing || null,
      edges: raw.edges || null,
      icons: raw.icons || null,
      truncated: !!raw.truncated
    };
  }

  // ── normalization → semantic tokens ────────────────────────────────────────
  var SIZE_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  var RADIUS_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  var MOTION_NAMES = ['instant', 'fast', 'normal', 'slow', 'slower'];

  function typographyTokens(fonts) {
    if (!fonts || !fonts.length) return null;
    var primary = fonts[0];
    // collapse all size variants across the primary family, by frequency for "base"
    var sizeCount = new Map(), weightCount = new Map(), lineForBase = new Map();
    primary.variants.forEach(function (v) {
      var px = Math.round(parseFloat(v.size));
      if (isFinite(px) && px > 0) sizeCount.set(px, (sizeCount.get(px) || 0) + v.count);
      var w = parseInt(v.weight, 10) || 400; weightCount.set(w, (weightCount.get(w) || 0) + v.count);
    });
    var baseSize = topKey(sizeCount, 16);
    primary.variants.forEach(function (v) {
      if (Math.round(parseFloat(v.size)) === baseSize) {
        var ln = v.line && v.line !== 'normal' ? Math.round(parseFloat(v.line)) : null;
        if (ln) lineForBase.set(ln, (lineForBase.get(ln) || 0) + v.count);
      }
    });
    var sizes = Array.from(sizeCount.keys()).sort(function (a, b) { return a - b; }).slice(0, SIZE_NAMES.length);
    return {
      family: primary.family, stack: primary.stack,
      baseSize: baseSize, baseWeight: topKey(weightCount, 400),
      baseLine: lineForBase.size ? topKey(lineForBase, Math.round(baseSize * 1.5)) : Math.round(baseSize * 1.5),
      scale: sizes.map(function (px, i) { return { name: SIZE_NAMES[i], px: px }; }),
      familyCount: fonts.length, isWeb: primary.isWeb
    };
  }
  function topKey(map, fallback) {
    var best = fallback, max = -1;
    map.forEach(function (n, k) { if (n > max) { max = n; best = k; } });
    return best;
  }
  function tallyHex(list) {
    // list of {r,g,b} -> [{hex, count, l}] sorted by count desc
    var m = new Map();
    list.forEach(function (c) {
      if (!c || c.a === 0) return;
      var key = rgbKey(c);
      var e = m.get(key); if (e) e.count++; else m.set(key, { hex: toHex(c), count: 1, l: lum(c) });
    });
    var arr = []; m.forEach(function (e) { arr.push(e); });
    arr.sort(function (a, b) { return b.count - a.count; });
    return arr;
  }
  function colorTokens(contrast, borders) {
    var texts = tallyHex(contrast.map(function (e) { return e.color; }));
    var surfaces = tallyHex(contrast.map(function (e) { return e.bg; }));
    var rows = [];
    var roles = ['primary', 'secondary', 'tertiary'];
    texts.slice(0, 3).forEach(function (t, i) { rows.push({ token: 'color.text.' + roles[i], value: t.hex }); });
    // inverse = text colour whose luminance is most opposite the primary text colour
    if (texts.length) {
      var primL = texts[0].l, inv = null, bestGap = -1;
      texts.forEach(function (t) { var g = Math.abs(t.l - primL); if (g > bestGap) { bestGap = g; inv = t; } });
      if (inv && bestGap > 60) rows.push({ token: 'color.text.inverse', value: inv.hex });
    }
    var sRoles = ['base', 'raised', 'strong'];
    surfaces.slice(0, 3).forEach(function (s, i) { rows.push({ token: 'color.surface.' + sRoles[i], value: s.hex }); });
    if (borders && borders.length) {
      // borders arrive as raw CSS strings; keep the most common verbatim
      rows.push({ token: 'color.border.default', value: borders[0].value.replace(/\s+/g, ' ') });
    }
    return { rows: rows, textCount: texts.length, surfaceCount: surfaces.length };
  }
  function scaleTokens(prefix, items, names) {
    // items: [{value}] sorted asc already-ish; assign names or numeric index
    return items.slice(0, names ? names.length : 8).map(function (it, i) {
      var name = names ? names[i] : String(i + 1);
      return { token: prefix + '.' + name, value: it.value + 'px' };
    });
  }
  // ── typography: heading system vs body system ────────────────────────────────
  // Pure derivation from bundle.fonts — no new scanning. scanPageFonts already labels each
  // variant with a role via tagToRole, which is what makes this possible.
  var HEADING_ROLE = /^Heading [1-6]$/;
  var BODY_ROLES = { 'Paragraph': 1, 'Body': 1, 'List item': 1, 'Text': 1, 'Link': 1, 'Small text': 1 };
  function unitless(line, size) {
    var l = parseFloat(line), s = parseFloat(size);
    if (!isFinite(l) || !isFinite(s) || !s) return null;
    return Math.round((l / s) * 100) / 100;
  }
  function emSpacing(ls, size) {
    if (!ls || ls === 'normal') return 'normal';
    var v = parseFloat(ls), s = parseFloat(size);
    if (!isFinite(v) || !isFinite(s) || !s) return 'normal';
    var em = v / s;
    if (Math.abs(em) < 0.001) return '0em';
    return (Math.round(em * 1000) / 1000) + 'em';
  }
  function typeSystems(fonts) {
    if (!fonts || !fonts.length) return null;
    var headPool = [], bodyPool = [];
    fonts.forEach(function (f) {
      (f.variants || []).forEach(function (v) {
        var entry = { f: f, v: v };
        if (HEADING_ROLE.test(v.role || '')) headPool.push(entry);
        else if (BODY_ROLES[v.role]) bodyPool.push(entry);
      });
    });
    function winningFamily(pool) {
      var tally = {}, best = null, bestN = -1;
      pool.forEach(function (e) {
        var k = e.f.family;
        tally[k] = (tally[k] || 0) + (e.v.count || 0);
        if (tally[k] > bestN) { bestN = tally[k]; best = e.f; }
      });
      return best;
    }
    function pack(f, v) {
      if (!f || !v) return null;
      return {
        family: f.family, stack: f.stack, isWeb: !!f.isWeb,
        size: Math.round(parseFloat(v.size)) || 0,
        weight: parseInt(v.weight, 10) || 400,
        line: unitless(v.line, v.size),
        linePx: v.line && v.line !== 'normal' ? Math.round(parseFloat(v.line)) : null,
        tracking: emSpacing(v.mainLetterSpacing, v.size),
        role: v.role || null, count: v.count || 0
      };
    }
    // HEADING representative = the largest size that appears more than once. The single
    // biggest text on a page is often a one-off hero; the display style teams actually reuse
    // is the largest RECURRING one. Falls back to the largest if nothing repeats.
    var hf = winningFamily(headPool), head = null;
    if (hf) {
      var hs = headPool.filter(function (e) { return e.f.family === hf.family; })
        .sort(function (a, b) { return parseFloat(b.v.size) - parseFloat(a.v.size); });
      var pick = null;
      for (var i = 0; i < hs.length; i++) if ((hs[i].v.count || 0) >= 2) { pick = hs[i]; break; }
      if (!pick) pick = hs[0];
      head = pick ? pack(hf, pick.v) : null;
    }
    // BODY representative = the most-used variant of the winning body family.
    var bf = winningFamily(bodyPool), body_ = null;
    if (bf) {
      var bs = bodyPool.filter(function (e) { return e.f.family === bf.family; })
        .sort(function (a, b) { return (b.v.count || 0) - (a.v.count || 0); });
      body_ = bs.length ? pack(bf, bs[0].v) : null;
    }
    // No headings detected: borrow the body family at its largest observed size, so a docs
    // page with only <p> still reports a usable heading spec instead of nothing.
    if (!head && body_ && bf) {
      var all = (bf.variants || []).slice().sort(function (a, b) { return parseFloat(b.size) - parseFloat(a.size); });
      if (all.length) head = pack(bf, all[0]);
    }
    if (!head && !body_) return null;
    return { heading: head, body: body_,
             sameFamily: !!(head && body_ && head.family === body_.family),
             familyCount: fonts.length };
  }

  // ── colour roles ────────────────────────────────────────────────────────────
  // bundle.colors already carries an oklch string (built in background.js), so this only
  // needs a parser — no duplicated colour maths and no dependency on colorToOklch being in
  // scope here.
  function parseOklch(s) {
    var m = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/.exec(s || '');
    return m ? { L: +m[1] / 100, C: +m[2], H: +m[3] } : null;
  }
  function hueDist(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function colorRoles(colors) {
    if (!colors || !colors.length) return null;
    var chromatic = [], neutral = [];
    colors.forEach(function (c) {
      if (!c || c.a === 0) return;
      var o = parseOklch(c.oklch);
      if (!o) return;
      var e = { hex: (c.hex || '').toUpperCase(), count: c.count || 0, L: o.L, C: o.C, H: o.H };
      // 0.035 sits between slate-500 (C~0.033, a neutral) and any real brand hue
      // (blue-500 is C~0.19). Very light/dark chromatics are excluded — near-white and
      // near-black carry no usable hue.
      if (o.C < 0.035) neutral.push(e);
      else if (o.L > 0.12 && o.L < 0.95) chromatic.push(e);
    });
    function byWeight(a, b) { return (b.count * (0.35 + b.C)) - (a.count * (0.35 + a.C)); }
    chromatic.sort(byWeight);
    var out = { primary: null, secondary: null, tertiary: null, neutral: null, monochrome: false };
    if (chromatic.length) {
      out.primary = chromatic[0];
      for (var i = 1; i < chromatic.length; i++) {
        var c = chromatic[i];
        if (!out.secondary && hueDist(c.H, out.primary.H) >= 25) { out.secondary = c; continue; }
        if (out.secondary && !out.tertiary &&
            hueDist(c.H, out.primary.H) >= 25 && hueDist(c.H, out.secondary.H) >= 25) out.tertiary = c;
      }
    }
    neutral.sort(function (a, b) { return b.count - a.count; });
    var mid = neutral.filter(function (n) { return n.L > 0.15 && n.L < 0.85; });
    out.neutral = mid.length ? mid[0] : (neutral.length ? neutral[0] : null);
    if (!out.primary) {
      // Monochrome page: promote the darkest recurring neutral so there is still a "primary".
      var dark = neutral.filter(function (n) { return n.count >= 2; })
        .sort(function (a, b) { return a.L - b.L; });
      out.primary = dark.length ? dark[0] : (neutral[0] || null);
      out.monochrome = true;
      // …then re-pick neutral so the two roles are not the same swatch. Reporting
      // `color.primary` and `color.neutral` as one hex is redundant and reads like a bug.
      if (out.primary && out.neutral && out.neutral.hex === out.primary.hex) {
        var alt = mid.concat(neutral).filter(function (n) { return n.hex !== out.primary.hex; });
        out.neutral = alt.length ? alt[0] : out.neutral;
      }
    }
    return out.primary ? out : null;
  }

  // ── page shape: layout mode, content width, framing, grid strength ───────────
  function median(a) {
    if (!a || !a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.floor(s.length / 2)];
  }
  // Prefer the DECLARED max-width (survives a window narrower than the design measure);
  // fall back to comparing measured inner vs section width.
  function contentWidth(w) {
    if (!w) return null;
    var keys = Object.keys(w.maxWidths || {}), domKey = null, domN = 0;
    for (var i = 0; i < keys.length; i++) {
      var n = w.maxWidths[keys[i]], v = parseFloat(keys[i]);
      if (n > domN && n >= 2 && v >= 480 && v <= 2000) { domN = n; domKey = v; }
    }
    if (domKey) return { mode: 'contained', px: Math.round(domKey), source: 'declared' };
    var mi = median(w.innerW || []), ms = median(w.sectionW || []);
    if (!ms) return null;
    if (mi / ms >= 0.95) return { mode: 'full-bleed', px: null, source: 'measured' };
    return { mode: 'contained', px: Math.round(mi), source: 'measured' };
  }
  function layoutMode(d) {
    if (!d) return null;
    var t = (d.grid || 0) + (d.flexRow || 0) + (d.flexCol || 0) + (d.stack || 0) + (d.multicol || 0);
    if (!t) return null;
    if ((d.grid || 0) / t >= 0.25 || (d.grid || 0) >= 6) return 'Grid';
    if ((d.multicol || 0) >= 2 || (d.flexRow || 0) / t >= 0.45) return 'Columns';
    return 'Stack';
  }
  function gridStrength(d, edges) {
    var tracks = 0, tn = 0, k;
    var tk = (d && d.tracks) || {};
    for (k in tk) if (tk[k] > tn) { tn = tk[k]; tracks = parseInt(k, 10); }
    var align = 0;
    if (edges && edges.total) {
      var counts = [];
      for (k in (edges.buckets || {})) counts.push(edges.buckets[k]);
      counts.sort(function (a, b) { return b - a; });
      align = ((counts[0] || 0) + (counts[1] || 0)) / edges.total;
    }
    var grid = (d && d.grid) || 0;
    if (grid >= 3 && tracks >= 2 && align >= 0.60) return { level: 'Strong', cols: tracks, align: align };
    if (grid >= 1 || align >= 0.45) return { level: 'Subtle', cols: tracks || null, align: align };
    return { level: 'None', cols: null, align: align };
  }
  function framingOf(f) {
    if (!f || !f.sectionN) return null;
    var share = f.framedN / f.sectionN;
    var insetShell = f.htmlBgDiff && ((f.bodyMarginX || 0) >= 8 || (f.bodyRadius || 0) >= 12);
    return (insetShell || share >= 0.5) ? 'Framed' : 'Open';
  }

  // ── motion ──────────────────────────────────────────────────────────────────
  // Give the common cubic-beziers their design-system names. Rounded to 2dp with ±0.03
  // tolerance because build pipelines emit slightly different decimal expansions of the
  // same curve (0.4,0,0.2,1 vs 0.400,0.000,0.200,1.000).
  var NAMED_EASINGS = [
    // `linear` FIRST: cubic-bezier(0,0,1,1) is exactly linear, and build pipelines emit it in
    // that longhand form constantly. Without this entry it fell through and displayed as a raw
    // curve, which is both ugly and actively misleading — it looks bespoke when it is the
    // most ordinary curve there is.
    ['linear', [0, 0, 1, 1]],
    ['standard', [0.4, 0, 0.2, 1]], ['decelerate', [0, 0, 0.2, 1]], ['accelerate', [0.4, 0, 1, 1]],
    ['ease', [0.25, 0.1, 0.25, 1]], ['ease-in', [0.42, 0, 1, 1]], ['ease-out', [0, 0, 0.58, 1]],
    ['ease-in-out', [0.42, 0, 0.58, 1]], ['back-out', [0.34, 1.56, 0.64, 1]],
    ['back-in-out', [0.68, -0.55, 0.265, 1.55]]
  ];
  function easingName(raw) {
    var m = /cubic-bezier\(([^)]+)\)/.exec(raw);
    if (!m) return raw;                       // linear / ease / steps() pass through verbatim
    var n = m[1].split(',').map(function (x) { return parseFloat(x); });
    if (n.length !== 4 || n.some(isNaN)) return raw;
    for (var i = 0; i < NAMED_EASINGS.length; i++) {
      var t = NAMED_EASINGS[i][1], ok = true;
      for (var j = 0; j < 4; j++) if (Math.abs(n[j] - t[j]) > 0.03) { ok = false; break; }
      if (ok) return NAMED_EASINGS[i][0];
    }
    return raw;
  }
  function topEasings(map, limit) {
    var arr = [];
    Object.keys(map || {}).forEach(function (k) { arr.push({ raw: k, name: easingName(k), count: map[k] }); });
    arr.sort(function (a, b) { return b.count - a.count; });
    // Collapse duplicates that normalized to the same name (two spellings of one curve).
    var seen = {}, out = [];
    for (var i = 0; i < arr.length && out.length < (limit || 4); i++) {
      if (seen[arr[i].name]) continue;
      seen[arr[i].name] = 1; out.push(arr[i]);
    }
    return out;
  }
  // How much motion the page actually has. Weighted so no single signal dominates: a page
  // with one long transition is not "expressive", and a page with a scroll library but no
  // element-level animation still is not "none".
  function motionLevel(m) {
    var animShare = m.nodeCount ? m.animatedCount / m.nodeCount : 0;
    if (!m.animatedCount && !m.keyframes && !m.scrollLibCount) return 'None';
    var score = 0;
    score += Math.min(35, animShare * 120);
    score += Math.min(20, m.keyframes * 2);
    score += Math.min(20, m.scrollLibCount * 10);
    score += m.hasTransformHover ? 10 : 0;
    score += m.medianDur >= 400 ? 8 : m.medianDur >= 250 ? 5 : 0;
    score += m.durSpread >= 500 ? 7 : m.durSpread >= 250 ? 4 : 0;
    // 'Subtle' is the floor, not 'None'. The guard above already returned 'None' for a page
    // with genuinely zero motion, so anything scoring here HAS animation — a handful of
    // `transition: color .2s` links is a low score but it is still not "no motion".
    return score >= 60 ? 'Expressive' : score >= 35 ? 'Moderate' : 'Subtle';
  }
  // p10/p90 spread over the bucketed durations, weighted by how often each bucket occurs.
  function durationStats(buckets) {
    var flat = [];
    for (var i = 0; i < buckets.length; i++) {
      for (var j = 0; j < buckets[i].count && flat.length < 20000; j++) flat.push(buckets[i].value);
    }
    if (!flat.length) return { median: 0, spread: 0 };
    flat.sort(function (a, b) { return a - b; });
    var at = function (p) { return flat[Math.min(flat.length - 1, Math.floor(flat.length * p))]; };
    return { median: at(0.5), spread: at(0.9) - at(0.1) };
  }

  // ── base spacing unit ───────────────────────────────────────────────────────
  // Finds the largest step size that explains most of the spacing values, e.g. "4.8px base"
  // on a page whose scale is derived from 0.3rem. Fed padding + gap only: margins are mostly
  // auto-centring leftovers and odd one-offs that drag the estimate down.
  //
  // Two details carry the whole thing:
  //   · tolU shrinks as u grows (a ±0.6px absolute slop, capped at 0.12) so a large unit
  //     cannot "explain" a value just by being coarse.
  //   · the u/400 term breaks ties toward the LARGEST explaining unit. On a rem-derived page
  //     4.8 and 2.4 both cover everything; without it the loop would report 2.4, which is not
  //     the unit anyone designed with. On a normal 4px page u=8 genuinely loses coverage
  //     (6/8 leaves a 0.25 residual, well over tolU), so 4 still wins.
  // Returns null below 60% coverage — a page with no system should say so, not invent one.
  function baseUnit(buckets) {
    var total = 0, i;
    for (i = 0; i < buckets.length; i++) {
      if (buckets[i].value >= 2 && buckets[i].value <= 160) total += buckets[i].count;
    }
    if (!total) return null;
    var best = null;
    for (var u10 = 20; u10 <= 160; u10++) {
      var u = u10 / 10;
      var tolU = Math.min(0.12, 0.6 / u), hit = 0;
      for (i = 0; i < buckets.length; i++) {
        var b = buckets[i];
        if (b.value < 2 || b.value > 160) continue;
        var k = b.value / u;
        if (Math.round(k) >= 1 && Math.abs(k - Math.round(k)) <= tolU) hit += b.count;
      }
      var cov = hit / total, score = cov + u / 400;
      if (!best || score > best.score + 1e-9) best = { unit: u, cov: cov, score: score };
    }
    if (!best || best.cov < 0.6) return null;
    // Trim 4.0 -> "4", keep 4.8 -> "4.8".
    return { unit: best.unit, label: String(Math.round(best.unit * 10) / 10), coverage: Math.round(best.cov * 100) };
  }

  function motionTokens(items) {
    return items.slice(0, MOTION_NAMES.length).map(function (it, i) {
      return { token: 'motion.duration.' + MOTION_NAMES[i], value: it.value + 'ms' };
    });
  }

  // ── page profiling (lightweight, keyword-based) ─────────────────────────────
  function profile(meta, type, colorInfo, sampleStr) {
    var brand = (meta.title || '').replace(/\s*[|–—\-·].*$/, '').trim();
    if (!brand || brand.length > 48) {
      var host = (meta.host || 'site').replace(/^www\./, '').split('.')[0];
      brand = host.charAt(0).toUpperCase() + host.slice(1);
    }
    var hay = ((meta.url || '') + ' ' + (meta.title || '') + ' ' + (sampleStr || sampleText())).toLowerCase();
    function hits(words) { var n = 0; words.forEach(function (w) { if (hay.indexOf(w) >= 0) n++; }); return n; }
    var score = {
      docs: hits(['docs', 'documentation', 'api reference', 'guide']),
      app: hits(['dashboard', 'console', 'settings', 'account', 'workspace', 'sign out', 'log out']),
      marketing: hits(['pricing', 'get started', 'sign up', 'features', 'book a demo', 'free trial']),
      content: hits(['blog', 'article', 'read more', 'newsletter', 'stories'])
    };
    var surface = 'web app', audience = 'product users and operators';
    var top = 'app', topN = score.app;
    ['docs', 'marketing', 'content'].forEach(function (k) { if (score[k] > topN) { topN = score[k]; top = k; } });
    if (topN === 0) { top = 'app'; }
    if (top === 'docs') { surface = 'documentation site'; audience = 'developers and technical readers'; }
    else if (top === 'marketing') { surface = 'marketing site'; audience = 'prospects and new visitors'; }
    else if (top === 'content') { surface = 'content site'; audience = 'readers and subscribers'; }
    var darkBase = colorInfo && colorInfo.baseDark;
    var visualStyle = (darkBase ? 'dark, ' : '') + 'structured, tokenized, component-first';
    return { brand: brand, slug: kebab(brand), url: meta.url || '—', audience: audience, surface: surface, visualStyle: visualStyle };
  }
  function sampleText() {
    try {
      var bits = [];
      var hs = document.querySelectorAll('h1, h2, nav a, [role="navigation"] a');
      for (var i = 0; i < hs.length && bits.length < 40; i++) {
        var t = (hs[i].textContent || '').trim(); if (t) bits.push(t);
      }
      return bits.join(' ');
    } catch (_) { return ''; }
  }

  // ── markdown assembly (our own prose; structured section order) ──────────────
  function joinToks(rows) { return rows.map(function (r) { return tok(r.token, r.value); }).join(', '); }

  function foundations(t, prof) {
    var L = ['## Style Foundations', ''];
    L.push('- Visual style: ' + prof.visualStyle);
    // Every block below is presence-guarded: a page we could not fully scan emits fewer
    // lines rather than lines full of nulls.
    var s = t.shape;
    if (s && (s.mode || s.width || s.framing || (s.grid && s.grid.level !== 'None'))) {
      var lay = [];
      if (s.mode) lay.push(tok('layout.mode', s.mode));
      if (s.width) lay.push(tok('layout.contentWidth', s.width.mode === 'full-bleed' ? 'full-bleed' : s.width.px + 'px'));
      if (s.framing) lay.push(tok('layout.framing', s.framing));
      if (s.grid && s.grid.level !== 'None') {
        lay.push(tok('layout.grid', s.grid.level));
        if (s.grid.cols) lay.push(tok('layout.columns', String(s.grid.cols)));
      }
      L.push('- Layout: ' + lay.join(', '));
    }
    if (t.typeSys && t.typeSys.heading) {
      var h = t.typeSys.heading;
      L.push('- Heading system: ' + tok('font.family.heading', h.family) + ', ' +
        tok('font.size.heading', h.size + 'px') + ', ' + tok('font.weight.heading', String(h.weight)) +
        (h.line ? ', ' + tok('font.lineHeight.heading', String(h.line)) : '') +
        (h.tracking !== 'normal' ? ', ' + tok('font.letterSpacing.heading', h.tracking) : ''));
    }
    if (t.typeSys && t.typeSys.body) {
      var bd = t.typeSys.body;
      L.push('- Body system: ' + tok('font.family.body', bd.family) + ', ' +
        tok('font.size.body', bd.size + 'px') + ', ' + tok('font.weight.body', String(bd.weight)) +
        (bd.line ? ', ' + tok('font.lineHeight.body', String(bd.line)) : '') +
        (bd.tracking !== 'normal' ? ', ' + tok('font.letterSpacing.body', bd.tracking) : '') +
        (t.typeSys.sameFamily ? ' _(single-family system)_' : ''));
    }
    if (t.type) {
      L.push('- Primary font: ' + tok('font.family.primary', t.type.family) + ', ' +
        tok('font.size.base', t.type.baseSize + 'px') + ', ' +
        tok('font.weight.base', String(t.type.baseWeight)) + ', ' +
        tok('font.lineHeight.base', t.type.baseLine + 'px') +
        (t.type.isWeb ? '' : ' _(system stack)_'));
      if (t.type.scale.length) {
        L.push('- Type scale: ' + t.type.scale.map(function (s) { return tok('font.size.' + s.name, s.px + 'px'); }).join(', '));
      }
    } else {
      L.push('- Typography: no reliable text styles detected; define type tokens manually.');
    }
    if (t.roles) {
      var rr = [];
      ['primary', 'secondary', 'tertiary', 'neutral'].forEach(function (k) {
        if (t.roles[k]) rr.push(tok('color.' + k, t.roles[k].hex));
      });
      if (rr.length) L.push('- Colour roles: ' + rr.join(', ') +
        (t.roles.monochrome ? ' _(monochrome palette — no chromatic brand colour detected)_' : ''));
    }
    if (t.color.rows.length) L.push('- Color palette: ' + joinToks(t.color.rows));
    else L.push('- Color palette: insufficient signal; define semantic colour tokens manually.');
    if (t.space.length) L.push('- Spacing scale: ' + joinToks(t.space));
    if (t.base) {
      L.push('- Base unit: ' + tok('space.base', t.base.label + 'px') +
        ' _(' + t.base.coverage + '% of spacing values are multiples)_');
    }
    var comp = [];
    if (t.padBase) comp.push(tok('space.padding.base', t.padBase + 'px'));
    if (t.gapBase) comp.push(tok('space.gap.base', t.gapBase + 'px'));
    if (t.cardPad) comp.push(tok('space.card', t.cardPad + 'px'));
    if (comp.length) L.push('- Component spacing: ' + comp.join(', '));
    var rsm = [];
    if (t.radius.length) rsm.push(joinToks(t.radius));
    if (t.shadow.length) rsm.push(t.shadow.map(function (s) { return tok(s.token, s.value); }).join(', '));
    if (t.motion.length) rsm.push(t.motion.map(function (s) { return tok(s.token, s.value); }).join(', '));
    if (rsm.length) L.push('- Radius / shadow / motion: ' + rsm.join(' | '));
    // A bare `motion.level=None` line is noise on a static page — emit the Motion line only
    // when there is something to say beyond "there is no motion".
    if (t.mo && (t.mo.level !== 'None' || t.mo.easings.length || t.mo.hover.length || t.mo.libs.length)) {
      var mm = [tok('motion.level', t.mo.level)];
      // The VALUE must be the actual curve an implementer can paste; the friendly name is
      // the token suffix, not the value. `motion.easing.standard=standard` says nothing.
      if (t.mo.easings.length) {
        var e0 = t.mo.easings[0];
        mm.push(tok('motion.easing.standard', e0.raw));
        if (t.mo.easings.length > 1) {
          mm.push(tok('motion.easing.secondary', t.mo.easings[1].raw));
        }
      }
      if (t.mo.hover.length) mm.push(tok('motion.hover', t.mo.hover.join(', ')));
      if (t.mo.libs.length) mm.push(tok('motion.scroll', t.mo.libs.join(', ')));
      if (t.mo.reducedMotion) mm.push(tok('motion.reducedMotion', 'honoured'));
      L.push('- Motion: ' + mm.join(', '));
    }
    if (t.ico) {
      var ic = [];
      if (t.ico.library) ic.push(tok('icon.library', t.ico.library));
      if (t.ico.style) ic.push(tok('icon.style', t.ico.style));
      if (t.ico.size) ic.push(tok('icon.size', t.ico.size + 'px'));
      if (t.ico.strokeWidth) ic.push(tok('icon.strokeWidth', t.ico.strokeWidth + 'px'));
      if (ic.length) L.push('- Icons: ' + ic.join(', '));
    }
    L.push('');
    return L;
  }

  function body(t, prof, b, isSkill) {
    var c = b.comp, bp = b.breakpoints, L = [];
    L.push('# ' + prof.brand, '');
    L.push('## Mission', '');
    if (isSkill) L.push('Deliver implementation-ready design-system guidance for ' + prof.brand + ' that applies consistently across the ' + prof.surface + '.');
    else L.push('Provide implementation-ready, token-driven UI guidance for ' + prof.brand + ' so teams can ship ' + prof.surface + ' interfaces that stay consistent, accessible, and fast to build.');
    L.push('');
    L.push('## Brand', '');
    L.push('- Product / brand: ' + prof.brand);
    L.push('- URL: ' + prof.url);
    L.push('- Audience: ' + prof.audience);
    L.push('- Product surface: ' + prof.surface);
    L.push('');
    L = L.concat(foundations(t, prof));
    // ── Layout System — only when the page-shape probes actually produced something ──
    var sh = t.shape;
    if (sh && (sh.mode || sh.width || sh.framing)) {
      L.push('## Layout System', '');
      if (sh.mode) {
        L.push('- Page layout: ' + sh.mode + (sh.mode === 'Grid'
          ? ' — sections stack vertically; content inside them sits on a grid.'
          : sh.mode === 'Columns'
            ? ' — sections divide horizontally into columns.'
            : ' — sections stack vertically in a single column.'));
      }
      if (sh.width) {
        L.push(sh.width.mode === 'full-bleed'
          ? '- Content width: full-bleed — sections span the viewport; set an explicit measure for text blocks so long lines stay readable.'
          : '- Content width: contained to ' + tok('layout.contentWidth', sh.width.px + 'px') +
            '; full-bleed sections must still align their inner content to that measure.');
      }
      if (sh.framing) {
        L.push('- Framing: ' + sh.framing + (sh.framing === 'Open'
          ? ' — sections bleed to the viewport edge; do not frame page-level regions as cards.'
          : ' — page-level regions are framed (border, surface or shadow); keep that treatment consistent.'));
      }
      if (sh.grid && sh.grid.level !== 'None') {
        L.push('- Grid strength: ' + sh.grid.level +
          (sh.grid.cols ? ' on a ' + sh.grid.cols + '-column track' : '') +
          ' — ' + Math.round(sh.grid.align * 100) + '% of section children share two column edges.');
      }
      if (t.base) L.push('- Base spacing unit: ' + tok('space.base', t.base.label + 'px') + '; every spacing value must be a multiple.');
      if (bp && bp.length) L.push('- Breakpoints: ' + bp.join(', ') + ' (px).');
      L.push('');
    }
    L.push('## Accessibility', '');
    L.push('- Target: WCAG 2.2 AA.');
    L.push('- Keyboard-first interaction is required for every control.');
    L.push('- A visible focus indicator (focus-visible) is required and must not be removed.');
    L.push('- Text and essential UI must meet AA contrast minimums.');
    L.push('- Measured on this page: ' + (b.contrastPass + b.contrastFail) + ' text samples, ' +
      b.contrastPass + ' pass / ' + b.contrastFail + ' fail at AA.');
    // Falls out of the CSSOM walk for free and is a genuine accessibility signal, so it
    // belongs here as well as in the component rules.
    if (t.mo) {
      L.push(t.mo.reducedMotion
        ? '- `prefers-reduced-motion` IS respected in the page CSS; keep that guarantee for any new motion.'
        : '- No `prefers-reduced-motion` media query was found; add one before shipping animation.');
    }
    L.push('');
    L.push('## Writing Tone', '');
    L.push('Clear, confident, and implementation-focused.');
    L.push('');
    L.push('## Rules: Do', '');
    L.push('- Reference semantic tokens, never raw hex or pixel values, in component guidance.');
    L.push('- Define every interactive state: default, hover, focus-visible, active, disabled, loading, and error.');
    L.push('- Specify responsive behaviour and edge cases for each component family.');
    L.push('- Document keyboard, pointer, and touch interaction for interactive components.');
    L.push('- Write accessibility acceptance criteria that are testable in implementation.');
    L.push('');
    L.push('## Rules: Don\'t', '');
    L.push('- Don\'t ship low-contrast text or hidden focus indicators.');
    L.push('- Don\'t introduce one-off spacing, radius, or typography values outside the scale.');
    L.push('- Don\'t use ambiguous labels or non-descriptive actions.');
    L.push('- Don\'t document a component without explicit state coverage.');
    L.push('');
    L.push('## Guideline Authoring Workflow', '');
    L.push('1. Restate the design intent in one sentence.');
    L.push('2. Define the foundations and semantic tokens in play.');
    L.push('3. Define component anatomy, variants, interactions, and state behaviour.');
    L.push('4. Add accessibility acceptance criteria with pass/fail checks.');
    L.push('5. Note anti-patterns, migration notes, and edge cases.');
    L.push('6. Close with a QA checklist.');
    L.push('');
    L.push('## Required Output Structure', '');
    L.push('- Context and goals.');
    L.push('- Design tokens and foundations.');
    L.push('- Component rules: anatomy, variants, states, responsive behaviour.');
    L.push('- Accessibility requirements with testable acceptance criteria.');
    L.push('- Content and tone standards with examples.');
    L.push('- Anti-patterns and prohibited implementations.');
    L.push('- QA checklist.');
    L.push('');
    L.push('## Component Rule Expectations', '');
    L.push('- Cover keyboard, pointer, and touch behaviour.');
    L.push('- State the spacing and typography tokens each component uses.');
    L.push('- Handle long content, overflow, and empty states.');
    var density = [];
    if (c.buttons) density.push('buttons (' + c.buttons + ')');
    if (c.links) density.push('links (' + c.links + ')');
    if (c.cards) density.push('cards (' + c.cards + ')');
    if (c.inputs) density.push('inputs (' + c.inputs + ')');
    if (c.headings) density.push('headings (' + c.headings + ')');
    if (c.icons) density.push('icons (' + c.icons + ')');
    if (c.navigation) density.push('navigation (' + c.navigation + ')');
    if (density.length) L.push('- Detected component density on this page: ' + density.join(', ') + '.');
    // The breakpoints line moved into ## Layout System, where it belongs; keep it here only
    // when that section was not emitted, so it is never lost and never duplicated.
    if (bp && bp.length && !(sh && (sh.mode || sh.width || sh.framing))) {
      L.push('- Honour the detected breakpoints: ' + bp.join(', ') + ' (px).');
    }
    if (t.ico && (t.ico.library || t.ico.style)) {
      L.push('- Icons' + (t.ico.library ? ' come from ' + t.ico.library : '') +
        (t.ico.style ? ', drawn ' + t.ico.style : '') +
        (t.ico.size ? ' at ' + t.ico.size + 'px' : '') +
        (t.ico.strokeWidth ? ' with a ' + t.ico.strokeWidth + 'px stroke' : '') +
        '; new icons must match the set, style and optical size.');
    }
    if (t.mo && t.mo.level !== 'None') {
      L.push('- Motion level is ' + t.mo.level + '; use ' +
        (t.mo.easings.length ? '`motion.easing.standard`' + (t.mo.easings[0].name !== t.mo.easings[0].raw ? ' (the ' + t.mo.easings[0].name + ' curve)' : '') : 'a single shared easing') +
        ' with the `motion.duration.*` tokens for every state change.');
      if (t.mo.hover.length) {
        L.push('- Hover changes ' + t.mo.hover.join(', ') + ' on this page; keep hover affordances ' +
          'in those channels rather than inventing new ones.');
      }
    }
    if (t.mo && t.mo.reducedMotion) {
      L.push('- `prefers-reduced-motion` is honoured in the page CSS; every new animation must ship a reduced-motion fallback.');
    }
    L.push('');
    L.push('## Quality Gates', '');
    L.push('- Every non-negotiable rule uses "must".');
    L.push('- Every recommendation uses "should".');
    L.push('- Every accessibility rule is testable in implementation.');
    L.push('- Prefer system consistency over one-off visual exceptions.');
    L.push('');
    return L;
  }

  function footer(b, prof) {
    var diag = 'Sampled ' + b.nodeCount + ' DOM nodes · ' + b.colorCount + ' colours · ' +
      (b.typeScale || 0) + ' type sizes';
    if (b.hoverRules) diag += ' · ' + b.hoverRules + ' hover rules';
    if (b.motionLibs) diag += ' · ' + b.motionLibs + ' motion libraries';
    // Say so when the scan was partial. A truncated scan that reads as a complete one is
    // worse than no scan: it turns "we did not look" into "there is nothing there".
    if (b.truncated) diag += ' · PARTIAL SCAN (large DOM — button and icon detection skipped)';
    if (b.sheetsBlocked) diag += ' · ' + b.sheetsBlocked + ' cross-origin stylesheet(s) unreadable';
    return ['---', '',
      '_Generated by [Export to Figma](https://www.exporttofigma.com)._', '',
      '_' + diag + '._'];
  }

  // ── derivation ──────────────────────────────────────────────────────────────
  // ONE implementation of "what is this page's design system", shared by the markdown
  // generator and the Overview panel's cards. Two derivations would let the panel and the
  // exported DESIGN.md disagree about the same page, which is the bug this prevents.
  function deriveSignals(bundle, layout) {
    var t = {
      type: typographyTokens(bundle.fonts),
      color: colorTokens(bundle.contrast || [], layout.borders),
      space: scaleTokens('space', layout.space, null),
      radius: scaleTokens('radius', layout.radius, RADIUS_NAMES),
      shadow: layout.shadows.slice(0, 3).map(function (s, i) { return { token: 'shadow.' + (i + 1), value: s.value }; }),
      motion: motionTokens(layout.motion)
    };

    // ── Derived signals (all null-safe: absent data simply omits its markdown line) ──
    t.typeSys = typeSystems(bundle.fonts);
    t.roles = colorRoles(bundle.colors);
    // padding/gap arrive ALREADY BUCKETED as {value,count} from finalizeLayout — merge the
    // two bucket lists by value (summing counts) rather than re-bucketing, which would throw
    // the counts away and let a value used once outweigh one used two hundred times.
    t.base = baseUnit((function () {
      var by = {}, out = [];
      [layout.padding || [], layout.gap || []].forEach(function (list) {
        list.forEach(function (bk) { by[bk.value] = (by[bk.value] || 0) + bk.count; });
      });
      Object.keys(by).forEach(function (k) { out.push({ value: parseFloat(k), count: by[k] }); });
      return out;
    })());
    var topOf = function (arr) {
      if (!arr || !arr.length) return null;
      var best = arr[0];
      for (var i = 1; i < arr.length; i++) if (arr[i].count > best.count) best = arr[i];
      return best.value;
    };
    t.padBase = topOf(layout.padding);
    t.gapBase = topOf(layout.gap);
    t.cardPad = topOf(layout.cardPadding);

    // Page shape
    var gridS = gridStrength(layout.display, layout.edges);
    t.shape = {
      mode: layoutMode(layout.display),
      width: contentWidth(layout.width),
      framing: framingOf(layout.framing),
      grid: gridS
    };

    // Motion
    var scrollLibs = Object.keys((layout.scroll && layout.scroll.libs) || {});
    Object.keys((layout.scroll && layout.scroll.scripts) || {}).forEach(function (k) {
      if (scrollLibs.indexOf(k) < 0) scrollLibs.push(k);
    });
    var dstat = durationStats(layout.motion || []);
    var hoverList = Object.keys(layout.hover || {}).sort(function (a, b) { return layout.hover[b] - layout.hover[a]; });
    t.mo = {
      level: motionLevel({
        nodeCount: (bundle.meta && bundle.meta.nodeCount) || 0,
        animatedCount: layout.animatedCount || 0,
        keyframes: layout.keyframes || 0,
        scrollLibCount: scrollLibs.length,
        hasTransformHover: !!(layout.hover && layout.hover.Transform),
        medianDur: dstat.median, durSpread: dstat.spread
      }),
      easings: topEasings(layout.easings, 3),
      hover: hoverList.slice(0, 4),
      libs: scrollLibs.slice(0, 4),
      reducedMotion: !!layout.reducedMotion,
      medianDur: dstat.median
    };

    // Icons — library, drawing style, optical size.
    var ic = layout.icons;
    if (ic && ic.examined) {
      var topKeyOf = function (m) {
        var best = null, n = -1;
        Object.keys(m || {}).forEach(function (k) { if (m[k] > n) { n = m[k]; best = k; } });
        return best;
      };
      var set = topKeyOf(ic.sets), lib = topKeyOf(ic.libs);
      var st = ic.style || {};
      var styleName = (st.duotone >= st.linear && st.duotone >= st.filled && st.duotone > 0) ? 'Duotone'
        : (st.linear >= st.filled ? 'Linear' : 'Filled');
      t.ico = {
        // An Iconify SET name (solar, mdi, …) is more specific than the generic "Iconify"
        // wrapper class, so it wins when both are present. Capitalised for display.
        library: set ? (set.charAt(0).toUpperCase() + set.slice(1)) : lib,
        style: styleName,
        size: topKeyOf(ic.sizes) ? parseInt(topKeyOf(ic.sizes), 10) : null,
        strokeWidth: styleName === 'Linear' ? topKeyOf(ic.strokeWidths) : null,
        count: ic.examined,
        sprite: ic.sprite || 0
      };
    }
    t.scrollLibs = scrollLibs;
    return t;
  }

  // ── public entry ────────────────────────────────────────────────────────────
  window.__e2fBuildDesignDocs = function (bundle) {
    var layout = bundle.layout ? finalizeLayout(bundle.layout) : scanLayout();
    var breakpoints = bundle.breakpoints || extractBreakpoints();
    var pass = 0, fail = 0;
    (bundle.contrast || []).forEach(function (e) { (e.pass ? pass++ : fail++); });

    var surfaces = tallyHex((bundle.contrast || []).map(function (e) { return e.bg; }));
    var baseDark = surfaces.length ? surfaces[0].l < 110 : false;

    var t = deriveSignals(bundle, layout);
    var scrollLibs = t.scrollLibs || [];
    var prof = profile(bundle.meta || {}, t, { baseDark: baseDark }, bundle.sampleText);

    var b = {
      comp: layout.comp, breakpoints: breakpoints,
      contrastPass: pass, contrastFail: fail,
      nodeCount: (bundle.meta && bundle.meta.nodeCount) || 0,
      colorCount: (bundle.colors || []).length,
      typeScale: t.type ? t.type.scale.length : 0,
      hoverRules: layout.hoverRules || 0,
      motionLibs: scrollLibs.length,
      truncated: !!layout.truncated,
      sheetsBlocked: layout.sheetsBlocked || 0
    };

    var core = body(t, prof, b, false).concat(footer(b, prof)).join('\n');

    // prof.brand is derived from document.title, which routinely contains ':'.
    // An unquoted YAML scalar breaks on ': ' ("mapping values are not allowed in
    // this context"), so every frontmatter description below is a quoted scalar.
    var desc = 'Implementation-ready design-system guidance for ' + prof.brand +
      ' — tokens, component states, and accessibility rules. Use when creating or ' +
      'updating UI specs, component rules, or design-system docs.';

    var skillBody = body(t, prof, b, true).join('\n');
    var fm = ['---',
      'name: design-system-' + prof.slug,
      'description: ' + yamlQuote(desc),
      '---', ''].join('\n');
    var skill = fm + '<!-- E2F_MANAGED_START -->\n\n' + skillBody + '\n' +
      footer(b, prof).join('\n') + '\n\n<!-- E2F_MANAGED_END -->\n';

    // Cursor project rule (.cursor/rules/*.mdc). Same body as DESIGN.md with
    // Cursor's own frontmatter. Empty `globs` + alwaysApply:false makes it a
    // manually-attachable rule — right for a reference this long, which should be
    // pulled in when UI work starts rather than pinned into every request.
    // No E2F_MANAGED_* markers: those are a SKILL.md-only convention.
    var cursor = ['---',
      'description: ' + yamlQuote(desc),
      'globs:',
      'alwaysApply: false',
      '---', ''].join('\n') + core;

    return { design: core, skill: skill, cursor: cursor };
  };

  // Design signals WITHOUT the markdown — for the Overview panel's cards. Same derivation
  // the generator uses, so a card and the exported DESIGN.md can never disagree about the
  // same page. Takes a lighter bundle (no contrast samples needed) and returns null rather
  // than throwing, because the panel must still render its other cards if this fails.
  window.__e2fDesignSignals = function (bundle) {
    try {
      var layout = bundle && bundle.layout ? finalizeLayout(bundle.layout) : scanLayout();
      var t = deriveSignals(bundle || {}, layout);
      t.layout = layout;                                    // raw buckets for the chip rows
      t.breakpoints = (bundle && bundle.breakpoints) || [];
      return t;
    } catch (_) { return null; }
  };

  // Tint/shade ramp for a role colour, in OKLCH. L is absolute, C is a multiplier on the
  // base chroma; step 500 keeps the source colour verbatim so the ramp always contains the
  // real brand value rather than an approximation of it.
  var RAMP = [
    [50, 0.97, 0.30], [100, 0.94, 0.45], [200, 0.88, 0.60], [300, 0.80, 0.80],
    [400, 0.70, 0.95], [500, null, 1.00], [600, 0.52, 1.00], [700, 0.44, 0.92],
    [800, 0.36, 0.78], [900, 0.28, 0.62], [950, 0.20, 0.45]
  ];
  window.__e2fColorRamp = function (role) {
    if (!role) return [];
    return RAMP.map(function (r) {
      if (r[1] === null) return { step: r[0], css: role.hex, base: true };
      return { step: r[0], base: false,
               css: 'oklch(' + Math.round(r[1] * 100) + '% ' +
                    (Math.round(role.C * r[2] * 1000) / 1000) + ' ' + Math.round(role.H) + ')' };
    });
  };
})();
