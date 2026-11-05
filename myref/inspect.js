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
// inspect.js — Inspect Mode runtime (Figma Dev-Mode-style measurements)
// MAIN-world script. Exposes window.__h2fInspect.

(function () {
  if (window.__h2fInspect) return;

  // i18n accessor — CALL-TIME lookup, deliberately not a captured reference.
  //
  // This script is idempotent (the guard above), so its body runs exactly ONCE per page.
  // e2fInstallI18n REPLACES window.__e2fT on every language change, so `var __t =
  // window.__e2fT` here would pin these labels to whichever language was active at first
  // injection and never update. background.js can capture safely only because its injected
  // bodies are re-serialized on every render; this file cannot.
  function __t(k, d, p) { var f = window.__e2fT; return f ? f(k, d, p) : d; }

  var OVERLAY_HOST_ID = '__h2f_inspect_overlay_host__';
  var TOOLBAR_HOST_ID = '__h2f_p1_host__';
  var CAPTURE_TOOLBAR_HOST_ID = '__figma_capture_toolbar_host__';

  // Palette
  var BLUE        = '#0d99ff';                // selection outline
  var PINK        = '#ec4899';                // distance to viewport edges / inter-element gap pills
  var GREEN       = '#22c55e';                // padding pills (solid)
  var GREEN_LINE  = 'rgba(34,197,94,0.65)';   // padding stripes
  var ORANGE      = '#f97316';                // margin pills (solid)
  var ORANGE_LINE = 'rgba(249,115,22,0.6)';   // margin stripes
  var PURPLE      = '#9333ea';                // element tag + dimensions
  var FONT_STACK = '"Inter",ui-sans-serif,system-ui,-apple-system,sans-serif';

  var state = {
    mode: null,
    host: null,
    shadow: null,
    L: null,             // overlay layers
    selected: null,
    hovered: null,
    listeners: [],
    rafPending: false,
    lastX: 0,
    lastY: 0,
    bridgeNonce: null,   // cross-frame bridge (set by installBridge)
    bridgeAttached: false
  };

  function el(tag, cssText) {
    var n = document.createElement(tag);
    if (cssText) n.style.cssText = cssText;
    return n;
  }
  function striped(color) {
    // 2px diagonal line every 6px.
    return 'repeating-linear-gradient(-45deg,' +
      'transparent 0px,transparent 4px,' +
      color + ' 4px,' + color + ' 6px)';
  }
  function dashedV(color) {
    // 4px dash + 4px gap, vertical
    return 'repeating-linear-gradient(to bottom,' +
      color + ' 0px,' + color + ' 4px,transparent 4px,transparent 8px)';
  }
  function dashedH(color) {
    return 'repeating-linear-gradient(to right,' +
      color + ' 0px,' + color + ' 4px,transparent 4px,transparent 8px)';
  }
  function pill(color) {
    return el('div',
      'position:fixed;background:' + color + ';color:#fff;' +
      'font:600 10px/1 ' + FONT_STACK + ';' +
      'padding:3px 5px;border-radius:3px;pointer-events:none;display:none;' +
      'left:0;top:0;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.25);' +
      'z-index:10');
  }
  function band(bg) {
    return el('div',
      'position:fixed;background:' + bg + ';pointer-events:none;display:none;' +
      'left:0;top:0;width:0;height:0');
  }
  function lineV(color) {
    return el('div',
      'position:fixed;background:' + dashedV(color) + ';' +
      'pointer-events:none;display:none;left:0;top:0;width:1.5px;height:0');
  }
  function lineH(color) {
    return el('div',
      'position:fixed;background:' + dashedH(color) + ';' +
      'pointer-events:none;display:none;left:0;top:0;width:0;height:1.5px');
  }

  function liftToolbarAboveOverlay() {
    // Our overlay is a top-layer popover (so it paints above page modals). The
    // extension's toolbar + CSS panel — also a top-layer popover, shown earlier —
    // must stay ABOVE the overlay. Top-layer order follows the most-recent
    // showPopover(), so re-promote the toolbar after the overlay.
    try {
      var tb = document.getElementById(TOOLBAR_HOST_ID);
      if (tb && typeof tb.showPopover === 'function' && tb.matches(':popover-open')) {
        tb.hidePopover();
        tb.showPopover();
      }
    } catch (_) {}
  }

  function ensureOverlay() {
    if (state.host && state.host.isConnected) return;
    var host = el('div',
      'position:fixed;inset:0;pointer-events:none;z-index:2147483646;' +
      'margin:0;padding:0;border:0;background:transparent');
    host.id = OVERLAY_HOST_ID;
    var shadow = host.attachShadow({ mode: 'open' });

    var L = {
      // bands (hairline diagonal stripes)
      paddingBands:      [band(striped(GREEN_LINE)),  band(striped(GREEN_LINE)),
                          band(striped(GREEN_LINE)),  band(striped(GREEN_LINE))],
      hoverPaddingBands: [band(striped(GREEN_LINE)),  band(striped(GREEN_LINE)),
                          band(striped(GREEN_LINE)),  band(striped(GREEN_LINE))],
      marginBands:       [band(striped(ORANGE_LINE)), band(striped(ORANGE_LINE)),
                          band(striped(ORANGE_LINE)), band(striped(ORANGE_LINE))],
      hoverMarginBands:  [band(striped(ORANGE_LINE)), band(striped(ORANGE_LINE)),
                          band(striped(ORANGE_LINE)), band(striped(ORANGE_LINE))],
      // outlines
      selectedOutline: el('div',
        'position:fixed;border:1.5px solid ' + BLUE + ';box-sizing:border-box;' +
        'pointer-events:none;display:none;left:0;top:0;width:0;height:0'),
      hoverOutline: el('div',
        'position:fixed;border:1px solid ' + BLUE + ';' +
        'background:rgba(13,153,255,0.05);box-sizing:border-box;' +
        'pointer-events:none;display:none;left:0;top:0;width:0;height:0'),
      // inter-element gap pills (pink) + lines
      gapPillTop:    pill(PINK),
      gapPillRight:  pill(PINK),
      gapPillBottom: pill(PINK),
      gapPillLeft:   pill(PINK),
      gapLineTop:    lineV(PINK),
      gapLineRight:  lineH(PINK),
      gapLineBottom: lineV(PINK),
      gapLineLeft:   lineH(PINK),
      // padding pills (green) — one per side that has padding
      padPillTop:    pill(GREEN),
      padPillRight:  pill(GREEN),
      padPillBottom: pill(GREEN),
      padPillLeft:   pill(GREEN),
      hoverPadPillTop:    pill(GREEN),
      hoverPadPillRight:  pill(GREEN),
      hoverPadPillBottom: pill(GREEN),
      hoverPadPillLeft:   pill(GREEN),
      // margin pills (orange)
      marPillTop:    pill(ORANGE),
      marPillRight:  pill(ORANGE),
      marPillBottom: pill(ORANGE),
      marPillLeft:   pill(ORANGE),
      hoverMarPillTop:    pill(ORANGE),
      hoverMarPillRight:  pill(ORANGE),
      hoverMarPillBottom: pill(ORANGE),
      hoverMarPillLeft:   pill(ORANGE),
      // tag + dimensions (purple)
      tagPill: pill(PURPLE),
      dimPill: pill(PURPLE),
      hoverTagPill: pill(PURPLE),
      hoverDimPill: pill(PURPLE),
      // hover tooltip (dark) — shown on hover when nothing is selected
      tooltip: el('div',
        'position:fixed;background:#2c2c2c;color:rgba(255,255,255,0.92);' +
        'font:500 11px/1.2 ' + FONT_STACK + ';' +
        'padding:5px 8px;border-radius:4px;pointer-events:none;display:none;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.35);white-space:nowrap;' +
        'left:0;top:0;max-width:60vw;overflow:hidden;text-overflow:ellipsis'),
      // fonts-mode tooltip — multi-line card with family + metrics
      fontTooltip: el('div',
        'position:fixed;background:#2c2c2c;color:rgba(255,255,255,0.92);' +
        'padding:8px 10px;border-radius:6px;pointer-events:none;display:none;' +
        'box-shadow:0 6px 18px rgba(0,0,0,0.4);' +
        'border:1px solid rgba(255,255,255,0.08);' +
        'left:0;top:0;min-width:120px;max-width:60vw;' +
        'font-family:' + FONT_STACK)
    };

    // z-order (back → front)
    L.marginBands.forEach(function (b) { shadow.appendChild(b); });
    L.hoverMarginBands.forEach(function (b) { shadow.appendChild(b); });
    L.paddingBands.forEach(function (b) { shadow.appendChild(b); });
    L.hoverPaddingBands.forEach(function (b) { shadow.appendChild(b); });
    shadow.appendChild(L.selectedOutline);
    shadow.appendChild(L.hoverOutline);
    shadow.appendChild(L.gapLineTop); shadow.appendChild(L.gapLineRight);
    shadow.appendChild(L.gapLineBottom); shadow.appendChild(L.gapLineLeft);
    [L.gapPillTop, L.gapPillRight, L.gapPillBottom, L.gapPillLeft,
     L.padPillTop, L.padPillRight, L.padPillBottom, L.padPillLeft,
     L.hoverPadPillTop, L.hoverPadPillRight, L.hoverPadPillBottom, L.hoverPadPillLeft,
     L.marPillTop, L.marPillRight, L.marPillBottom, L.marPillLeft,
     L.hoverMarPillTop, L.hoverMarPillRight, L.hoverMarPillBottom, L.hoverMarPillLeft,
     L.tagPill, L.dimPill, L.hoverTagPill, L.hoverDimPill, L.tooltip, L.fontTooltip]
     .forEach(function (n) { shadow.appendChild(n); });

    document.documentElement.appendChild(host);

    // Promote into the browser top layer so the inspect highlights paint above
    // page modals/dialogs (which may sit in the top layer themselves), and shed
    // any inert/aria-hidden a focus-trap library applies. The host box is
    // already neutralized inline (inset:0, no border/bg, pointer-events:none),
    // so children pass clicks through to the page as before.
    try {
      if (typeof host.showPopover === 'function') {
        host.setAttribute('popover', 'manual');
        host.showPopover();
      }
    } catch (_) { try { host.removeAttribute('popover'); } catch (__) {} }
    liftToolbarAboveOverlay();
    try {
      state.guardObs = new MutationObserver(function () {
        if (host.hasAttribute('inert')) host.removeAttribute('inert');
        if (host.getAttribute('aria-hidden') === 'true') host.removeAttribute('aria-hidden');
        if (host.hasAttribute('popover') && typeof host.showPopover === 'function') {
          try { if (!host.matches(':popover-open')) host.showPopover(); } catch (_) {}
        }
        liftToolbarAboveOverlay();
      });
      state.guardObs.observe(host, { attributes: true, attributeFilter: ['inert', 'aria-hidden', 'popover'] });
    } catch (_) {}

    state.host = host;
    state.shadow = shadow;
    state.L = L;
  }

  function isOurNode(n) {
    var c = n;
    while (c) {
      if (c.id === TOOLBAR_HOST_ID || c.id === OVERLAY_HOST_ID || c.id === CAPTURE_TOOLBAR_HOST_ID) return true;
      c = c.parentNode;
      if (c && c.host) c = c.host;
    }
    return false;
  }

  function describe(node) {
    if (!node || !node.tagName) return '';
    var tag = node.tagName.toLowerCase();
    var id = node.id ? '#' + node.id : '';
    var cls = '';
    if (node.classList && node.classList.length) {
      cls = '.' + Array.prototype.slice.call(node.classList, 0, 3).join('.');
    }
    return '<' + tag + '>' + id + cls;
  }

  function px(v) { return parseFloat(v) || 0; }

  function setBox(n, l, t, w, h) {
    var s = n.style;
    if (w <= 0 || h <= 0) { s.display = 'none'; return; }
    s.left = l + 'px'; s.top = t + 'px';
    s.width = w + 'px'; s.height = h + 'px';
    s.display = 'block';
  }

  function setPill(p, text, x, y) {
    p.textContent = text;
    p.style.display = 'block';
    // Measure after content
    var w = p.offsetWidth, h = p.offsetHeight;
    // Clamp to viewport
    var px2 = Math.max(2, Math.min(window.innerWidth  - w - 2, x - w / 2));
    var py2 = Math.max(2, Math.min(window.innerHeight - h - 2, y - h / 2));
    p.style.left = px2 + 'px';
    p.style.top  = py2 + 'px';
  }

  function hide(n) { if (n) n.style.display = 'none'; }

  // ── Paint helpers ───────────────────────────────────────────────────────
  function paintMargin(rect, cs, bands, pills) {
    var mt = px(cs.marginTop), mr = px(cs.marginRight);
    var mb = px(cs.marginBottom), ml = px(cs.marginLeft);
    setBox(bands[0], rect.left - ml, rect.top - mt, rect.width + ml + mr, mt);
    setBox(bands[1], rect.right, rect.top, mr, rect.height);
    setBox(bands[2], rect.left - ml, rect.bottom, rect.width + ml + mr, mb);
    setBox(bands[3], rect.left - ml, rect.top, ml, rect.height);

    if (mt > 0) setPill(pills[0], Math.round(mt) + 'px', rect.left + rect.width / 2, rect.top - mt / 2);
    else hide(pills[0]);
    if (mr > 0) setPill(pills[1], Math.round(mr) + 'px', rect.right + mr / 2, rect.top + rect.height / 2);
    else hide(pills[1]);
    if (mb > 0) setPill(pills[2], Math.round(mb) + 'px', rect.left + rect.width / 2, rect.bottom + mb / 2);
    else hide(pills[2]);
    if (ml > 0) setPill(pills[3], Math.round(ml) + 'px', rect.left - ml / 2, rect.top + rect.height / 2);
    else hide(pills[3]);
  }

  function paintPadding(rect, cs, bands, pills) {
    var bt = px(cs.borderTopWidth), br = px(cs.borderRightWidth);
    var bb = px(cs.borderBottomWidth), bl = px(cs.borderLeftWidth);
    var pt = px(cs.paddingTop), pr = px(cs.paddingRight);
    var pb = px(cs.paddingBottom), pl = px(cs.paddingLeft);
    var innerL = rect.left + bl, innerT = rect.top + bt;
    var innerW = rect.width - bl - br, innerH = rect.height - bt - bb;
    setBox(bands[0], innerL, innerT, innerW, pt);
    setBox(bands[1], innerL + innerW - pr, innerT + pt, pr, innerH - pt - pb);
    setBox(bands[2], innerL, innerT + innerH - pb, innerW, pb);
    setBox(bands[3], innerL, innerT + pt, pl, innerH - pt - pb);

    if (pt > 0) setPill(pills[0], Math.round(pt) + 'px', innerL + innerW / 2, innerT + pt / 2);
    else hide(pills[0]);
    if (pr > 0) setPill(pills[1], Math.round(pr) + 'px', innerL + innerW - pr / 2, innerT + innerH / 2);
    else hide(pills[1]);
    if (pb > 0) setPill(pills[2], Math.round(pb) + 'px', innerL + innerW / 2, innerT + innerH - pb / 2);
    else hide(pills[2]);
    if (pl > 0) setPill(pills[3], Math.round(pl) + 'px', innerL + pl / 2, innerT + innerH / 2);
    else hide(pills[3]);
  }

  function paintFocus(node, outlineEl, opts) {
    // opts: padBands, padPills, marBands, marPills, tagPill, dimPill.
    var rect = node.getBoundingClientRect();
    var cs = window.getComputedStyle(node);
    paintPadding(rect, cs, opts.padBands, opts.padPills);
    paintMargin(rect, cs, opts.marBands, opts.marPills);
    setBox(outlineEl, rect.left, rect.top, rect.width, rect.height);

    var tp = opts.tagPill;
    tp.textContent = describe(node);
    tp.style.display = 'block';
    var tw = tp.offsetWidth, th = tp.offsetHeight;
    var tagY = rect.top - th - 4;
    if (tagY < 4) tagY = rect.top + 4;
    tp.style.left = Math.max(2, Math.min(window.innerWidth - tw - 2, rect.left)) + 'px';
    tp.style.top  = tagY + 'px';

    var dp = opts.dimPill;
    dp.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height);
    dp.style.display = 'block';
    var dw = dp.offsetWidth, dh = dp.offsetHeight;
    var dimY = rect.bottom + 4;
    if (dimY + dh > window.innerHeight - 4) dimY = rect.bottom - dh - 4;
    dp.style.left = Math.max(2, Math.min(window.innerWidth - dw - 2, rect.right - dw)) + 'px';
    dp.style.top  = dimY + 'px';
  }

  function paintInterElement(aRect, bRect) {
    // Figma/DevTools-style spacing. Per axis: separated → single gap in the empty
    // space; overlapping/nested → the two edge offsets.
    var L = state.L;

    // Anchor the perpendicular ruler lines at the centre of the overlap (or the
    // midpoint of the two boxes when they don't overlap on that axis).
    var ox1 = Math.max(aRect.left, bRect.left), ox2 = Math.min(aRect.right, bRect.right);
    var anchorX = (ox2 > ox1) ? (ox1 + ox2) / 2
      : (Math.max(aRect.left, bRect.left) + Math.min(aRect.right, bRect.right)) / 2;
    var oy1 = Math.max(aRect.top, bRect.top), oy2 = Math.min(aRect.bottom, bRect.bottom);
    var anchorY = (oy2 > oy1) ? (oy1 + oy2) / 2
      : (Math.max(aRect.top, bRect.top) + Math.min(aRect.bottom, bRect.bottom)) / 2;

    // ── Horizontal axis (uses the two horizontal lines: gapLineLeft/Right) ──
    var hGap = Math.max(bRect.left - aRect.right, aRect.left - bRect.right);
    if (hGap >= 1) {                                   // separated → one gap
      var gx1 = Math.min(aRect.right, bRect.right);    // inner edge of left box
      var gx2 = Math.max(aRect.left, bRect.left);      // inner edge of right box
      setBox(L.gapLineLeft, gx1, anchorY, gx2 - gx1, 1.5);
      setPill(L.gapPillLeft, Math.round(hGap) + 'px', (gx1 + gx2) / 2, anchorY);
      hide(L.gapLineRight); hide(L.gapPillRight);
    } else {                                           // overlapping → edge offsets
      var leftOff = Math.abs(aRect.left - bRect.left);
      if (leftOff >= 1) {
        var lx1 = Math.min(aRect.left, bRect.left), lx2 = Math.max(aRect.left, bRect.left);
        setBox(L.gapLineLeft, lx1, anchorY, lx2 - lx1, 1.5);
        setPill(L.gapPillLeft, Math.round(leftOff) + 'px', (lx1 + lx2) / 2, anchorY);
      } else { hide(L.gapLineLeft); hide(L.gapPillLeft); }
      var rightOff = Math.abs(aRect.right - bRect.right);
      if (rightOff >= 1) {
        var rx1 = Math.min(aRect.right, bRect.right), rx2 = Math.max(aRect.right, bRect.right);
        setBox(L.gapLineRight, rx1, anchorY, rx2 - rx1, 1.5);
        setPill(L.gapPillRight, Math.round(rightOff) + 'px', (rx1 + rx2) / 2, anchorY);
      } else { hide(L.gapLineRight); hide(L.gapPillRight); }
    }

    // ── Vertical axis (uses the two vertical lines: gapLineTop/Bottom) ──
    var vGap = Math.max(bRect.top - aRect.bottom, aRect.top - bRect.bottom);
    if (vGap >= 1) {
      var gy1 = Math.min(aRect.bottom, bRect.bottom);  // inner edge of top box
      var gy2 = Math.max(aRect.top, bRect.top);        // inner edge of bottom box
      setBox(L.gapLineTop, anchorX, gy1, 1.5, gy2 - gy1);
      setPill(L.gapPillTop, Math.round(vGap) + 'px', anchorX, (gy1 + gy2) / 2);
      hide(L.gapLineBottom); hide(L.gapPillBottom);
    } else {
      var topOff = Math.abs(aRect.top - bRect.top);
      if (topOff >= 1) {
        var ty1 = Math.min(aRect.top, bRect.top), ty2 = Math.max(aRect.top, bRect.top);
        setBox(L.gapLineTop, anchorX, ty1, 1.5, ty2 - ty1);
        setPill(L.gapPillTop, Math.round(topOff) + 'px', anchorX, (ty1 + ty2) / 2);
      } else { hide(L.gapLineTop); hide(L.gapPillTop); }
      var botOff = Math.abs(aRect.bottom - bRect.bottom);
      if (botOff >= 1) {
        var by1 = Math.min(aRect.bottom, bRect.bottom), by2 = Math.max(aRect.bottom, bRect.bottom);
        setBox(L.gapLineBottom, anchorX, by1, 1.5, by2 - by1);
        setPill(L.gapPillBottom, Math.round(botOff) + 'px', anchorX, (by1 + by2) / 2);
      } else { hide(L.gapLineBottom); hide(L.gapPillBottom); }
    }
  }

  function hideInterElement() {
    var L = state.L;
    [L.gapLineTop, L.gapLineRight, L.gapLineBottom, L.gapLineLeft,
     L.gapPillTop, L.gapPillRight, L.gapPillBottom, L.gapPillLeft].forEach(hide);
  }

  function hidePadding() {
    var L = state.L;
    L.paddingBands.forEach(hide);
    [L.padPillTop, L.padPillRight, L.padPillBottom, L.padPillLeft].forEach(hide);
  }

  function hideMargin() {
    var L = state.L;
    L.marginBands.forEach(hide);
    [L.marPillTop, L.marPillRight, L.marPillBottom, L.marPillLeft].forEach(hide);
  }

  function hideHoverFocus() {
    var L = state.L;
    L.hoverPaddingBands.forEach(hide);
    L.hoverMarginBands.forEach(hide);
    [L.hoverPadPillTop, L.hoverPadPillRight, L.hoverPadPillBottom, L.hoverPadPillLeft,
     L.hoverMarPillTop, L.hoverMarPillRight, L.hoverMarPillBottom, L.hoverMarPillLeft,
     L.hoverTagPill, L.hoverDimPill].forEach(hide);
  }

  function hideSelected() {
    var L = state.L;
    hide(L.selectedOutline);
    hide(L.tagPill);
    hide(L.dimPill);
    hidePadding();
    hideMargin();
    hideInterElement();
    hideHoverFocus();
  }

  function pickElementAt(x, y) {
    state.host.style.display = 'none';
    var n = document.elementFromPoint(x, y);
    state.host.style.display = '';
    if (!n || isOurNode(n)) return null;
    return n;
  }

  function repaintAll() {
    var L = state.L;
    var selectedOpts = {
      padBands: L.paddingBands,
      padPills: [L.padPillTop, L.padPillRight, L.padPillBottom, L.padPillLeft],
      marBands: L.marginBands,
      marPills: [L.marPillTop, L.marPillRight, L.marPillBottom, L.marPillLeft],
      tagPill: L.tagPill, dimPill: L.dimPill
    };
    var hoverOpts = {
      padBands: L.hoverPaddingBands,
      padPills: [L.hoverPadPillTop, L.hoverPadPillRight, L.hoverPadPillBottom, L.hoverPadPillLeft],
      marBands: L.hoverMarginBands,
      marPills: [L.hoverMarPillTop, L.hoverMarPillRight, L.hoverMarPillBottom, L.hoverMarPillLeft],
      tagPill: L.hoverTagPill, dimPill: L.hoverDimPill
    };

    if (state.selected) {
      paintFocus(state.selected, L.selectedOutline, selectedOpts);
      var sRect = state.selected.getBoundingClientRect();
      if (state.hovered && state.hovered !== state.selected) {
        var hRect = state.hovered.getBoundingClientRect();
        setBox(L.hoverOutline, hRect.left, hRect.top, hRect.width, hRect.height);
        paintInterElement(sRect, hRect);
        // Show hovered element's own internal info too (padding/tag/dim).
        paintFocus(state.hovered, L.hoverOutline, hoverOpts);
      } else {
        hide(L.hoverOutline);
        hideInterElement();
        hideHoverFocus();
      }
    } else if (state.hovered) {
      // No selection — just highlight the hovered element. No distance numbers.
      hide(L.selectedOutline);
      hide(L.tooltip);
      paintFocus(state.hovered, L.hoverOutline, selectedOpts);
      hideHoverFocus();
      hideInterElement();
    } else {
      hideSelected();
      hide(L.hoverOutline);
      hide(L.tooltip);
    }
  }

  function onMouseMove(e) {
    state.lastX = e.clientX; state.lastY = e.clientY;
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(function () {
      state.rafPending = false;
      var n = pickElementAt(state.lastX, state.lastY);
      state.hovered = n;
      repaintAll();
    });
  }

  function onClick(e) {
    var n = pickElementAt(e.clientX, e.clientY);
    if (!n) return;
    e.preventDefault();
    e.stopPropagation();
    state.selected = n;
    state.hovered = null;
    repaintAll();
    dispatchSelect(n);
    // Cross-frame: a top-frame pick clears any sub-frame selection; a sub-frame
    // pick reports its element up so the top-frame CSS panel can show it.
    if (state.bridgeNonce) {
      if (window === window.top) broadcastToChildren({ __h2fInsp: 'clear', nonce: state.bridgeNonce });
      else postSelectionToParent(n);
    }
  }

  function clearSelection() {
    state.selected = null;
    state.hovered = null;
    hideSelected();
    hide(state.L.hoverOutline);
    hide(state.L.tooltip);
    dispatchSelect(null);
    // Top frame: also clear any selection living inside a sub-frame.
    if (state.bridgeNonce && window === window.top) {
      broadcastToChildren({ __h2fInsp: 'clear', nonce: state.bridgeNonce });
    }
  }

  function dispatchSelect(n) {
    try {
      window.dispatchEvent(new CustomEvent('h2f-inspect-select', { detail: { hasSelection: !!n } }));
    } catch (_) {}
  }

  function onScrollOrResize() { if (state.selected) repaintAll(); }

  function elementHasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.replace(/\s+/g, '').length > 0) return true;
    }
    return false;
  }

  // Pick the actual rendered family: walk the stack and return the first
  // family that `document.fonts.check` confirms is loaded (so we don't
  // mislabel "Inter Display, Inter, sans-serif" as "Inter Display" when
  // only Inter is actually loaded). Falls back to the first item.
  function actualFamily(stack) {
    var parts = (stack || '').split(',');
    var cleaned = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim().replace(/^["']+|["']+$/g, '');
      if (p) cleaned.push(p);
    }
    if (!cleaned.length) return '';
    try {
      if (document.fonts && document.fonts.check) {
        for (var j = 0; j < cleaned.length; j++) {
          if (document.fonts.check('16px "' + cleaned[j] + '"')) return cleaned[j];
        }
      }
    } catch (_) {}
    return cleaned[0];
  }

  function onFontsMouseMove(e) {
    state.lastX = e.clientX; state.lastY = e.clientY;
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(function () {
      state.rafPending = false;
      var t = state.L.fontTooltip;
      var n = pickElementAt(state.lastX, state.lastY);
      // Only show when the cursor is truly over a text-bearing element.
      if (!n || !elementHasDirectText(n)) { hide(t); return; }

      var cs = window.getComputedStyle(n);
      var family = actualFamily(cs.fontFamily);
      if (!family) { hide(t); return; }

      var size = Math.round(parseFloat(cs.fontSize) * 10) / 10;
      var weight = cs.fontWeight;
      var style = cs.fontStyle;
      var line = cs.lineHeight;

      function rgbToHex(rgb) {
        var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgb || '');
        if (!m) return '';
        return '#' + [m[1], m[2], m[3]].map(function (n) {
          var h = parseInt(n, 10).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('').toUpperCase();
      }

      t.replaceChildren();

      var fam = document.createElement('div');
      fam.textContent = family;
      fam.style.cssText =
        'font-family:' + cs.fontFamily + ';' +
        'font-size:14px;font-weight:600;color:#fff;line-height:1.2;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;' +
        'margin-bottom:7px';
      t.appendChild(fam);

      // Labeled metric rows so each value is clearly named.
      function addRow(label, value) {
        var row = document.createElement('div');
        row.style.cssText =
          'display:flex;align-items:center;justify-content:space-between;gap:16px;' +
          'font-family:' + FONT_STACK + ';line-height:1.6';
        var l = document.createElement('span');
        l.textContent = label;
        l.style.cssText = 'color:rgba(255,255,255,0.45);font-size:10px;font-weight:500';
        var v = document.createElement('span');
        v.style.cssText =
          'color:rgba(255,255,255,0.92);font-size:10px;font-weight:600;' +
          'font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:5px';
        if (typeof value === 'string') v.textContent = value;
        else v.appendChild(value);
        row.appendChild(l);
        row.appendChild(v);
        t.appendChild(row);
      }

      addRow(__t('inspFontSize', 'Font size'), size + 'px');
      addRow(__t('inspFontWeight', 'Font weight'), style && style !== 'normal' ? weight + ' ' + style : String(weight));
      if (line && line !== 'normal') {
        var lineNum = parseFloat(line);
        addRow(__t('inspLineHeight', 'Line height'), isNaN(lineNum) ? line : Math.round(lineNum) + 'px');
      }

      // Color row — swatch + hex.
      var colorVal = document.createElement('span');
      colorVal.style.cssText = 'display:inline-flex;align-items:center;gap:5px';
      var sw = document.createElement('span');
      sw.style.cssText =
        'width:11px;height:11px;border-radius:3px;flex-shrink:0;' +
        'border:1px solid rgba(255,255,255,0.25);background:' + cs.color;
      var hexLabel = document.createElement('span');
      hexLabel.textContent = rgbToHex(cs.color) || cs.color;
      colorVal.appendChild(sw);
      colorVal.appendChild(hexLabel);
      addRow(__t('inspColor', 'Color'), colorVal);

      t.style.display = 'block';
      var tw = t.offsetWidth, th = t.offsetHeight;
      var px = state.lastX + 14, py = state.lastY + 14;
      if (px + tw > window.innerWidth - 4) px = state.lastX - tw - 14;
      if (py + th > window.innerHeight - 4) py = state.lastY - th - 14;
      if (px < 4) px = 4;
      if (py < 4) py = 4;
      t.style.left = px + 'px';
      t.style.top = py + 'px';
    });
  }

  function attachFonts() {
    document.addEventListener('mousemove', onFontsMouseMove, true);
    state.listeners = [
      ['mousemove', onFontsMouseMove, true, document]
    ];
  }

  function attachCursor() {
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, true);
    state.listeners = [
      ['mousemove', onMouseMove, true, document],
      ['click', onClick, true, document],
      ['scroll', onScrollOrResize, true, window],
      ['resize', onScrollOrResize, true, window]
    ];
  }

  function detachAll() {
    state.listeners.forEach(function (r) { r[3].removeEventListener(r[0], r[1], r[2]); });
    state.listeners = [];
  }

  function applyMode(mode) {
    detachAll();
    var hadSel = !!state.selected;
    state.selected = null;
    state.hovered = null;
    if (state.L) {
      hideSelected();
      hide(state.L.hoverOutline);
      hide(state.L.tooltip);
      hide(state.L.fontTooltip);
    }
    if (hadSel) dispatchSelect(null);
    state.mode = mode || null;
    if (mode === 'cursor') attachCursor();
    else if (mode === 'fonts') attachFonts();
  }

  // ── Cross-frame bridge (one nesting level) ───────────────────────────────
  // inspect.js runs in EVERY frame (injected allFrames). The top frame drives
  // mode + owns the CSS panel; sub-frames draw their own overlay and report a
  // clicked element's serialized data up to the top frame (which can't read a
  // cross-origin element). Nonce-gated: mode/clear commands flow DOWN from the
  // parent, selections flow UP to the top. v1 = one nesting level.
  function describeForPanel(node) {
    if (!node || !node.tagName) return '';
    var tag = node.tagName.toLowerCase();
    var id = node.id ? '#' + node.id : '';
    var cls = '';
    if (node.classList && node.classList.length) {
      cls = '.' + Array.prototype.slice.call(node.classList, 0, 3).join('.');
    }
    return tag + id + cls;
  }
  function effectiveBg(node) {
    var p = node;
    while (p) {
      var c = '';
      try { c = window.getComputedStyle(p).backgroundColor; } catch (_) {}
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      p = p.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }
  // Serialize everything the top-frame CSS panel (renderCssPanel/buildCssBlock)
  // reads off a live element, since it can't reach a cross-origin one.
  function buildSelectionSnapshot(node) {
    try {
      var cs = window.getComputedStyle(node);
      var rect = node.getBoundingClientRect();
      var CAMEL = ['display', 'position', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderTopWidth', 'borderRightWidth',
        'borderBottomWidth', 'borderLeftWidth', 'border', 'borderRadius', 'fontFamily', 'fontSize',
        'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'backgroundImage'];
      var csObj = {};
      for (var i = 0; i < CAMEL.length; i++) csObj[CAMEL[i]] = cs[CAMEL[i]];
      var KEBAB = ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'width', 'height',
        'min-width', 'max-width', 'min-height', 'max-height', 'margin', 'padding', 'border', 'border-radius',
        'background-color', 'background-image', 'color', 'font-family', 'font-size', 'font-weight',
        'line-height', 'letter-spacing', 'text-align', 'opacity', 'box-shadow', 'overflow', 'flex',
        'flex-direction', 'justify-content', 'align-items', 'gap', 'grid-template-columns',
        'grid-template-rows', 'transform', 'transition'];
      var props = {};
      for (var j = 0; j < KEBAB.length; j++) props[KEBAB[j]] = cs.getPropertyValue(KEBAB[j]);
      return {
        __snap: true,
        describe: describeForPanel(node),
        rect: { width: rect.width, height: rect.height },
        cs: csObj,
        props: props,
        hasText: elementHasDirectText(node),
        effBg: effectiveBg(node)
      };
    } catch (_) { return null; }
  }
  function childFrameWindows() {
    var out = [];
    try {
      var ifr = document.querySelectorAll('iframe');
      for (var i = 0; i < ifr.length; i++) { if (ifr[i].contentWindow) out.push(ifr[i].contentWindow); }
    } catch (_) {}
    return out;
  }
  function broadcastToChildren(msg, exceptWin) {
    var wins = childFrameWindows();
    for (var i = 0; i < wins.length; i++) {
      if (exceptWin && wins[i] === exceptWin) continue;
      try { wins[i].postMessage(msg, '*'); } catch (_) {}
    }
  }
  function postSelectionToParent(node) {
    if (window === window.top || !state.bridgeNonce) return;
    try {
      window.parent.postMessage({ __h2fInsp: 'selected', nonce: state.bridgeNonce, snap: node ? buildSelectionSnapshot(node) : null }, '*');
    } catch (_) {}
  }
  function clearLocalSelectionVisual() {
    state.selected = null;
    state.hovered = null;
    if (state.L) { hideSelected(); hide(state.L.hoverOutline); hide(state.L.tooltip); }
  }
  function onBridgeMessage(ev) {
    var d = ev.data;
    if (!d || d.nonce == null || d.nonce !== state.bridgeNonce) return;
    if (d.__h2fInsp === 'mode') {
      if (ev.source !== window.parent) return;
      ensureOverlay(); applyMode(d.mode || null);
      return;
    }
    if (d.__h2fInsp === 'clear') {
      if (ev.source !== window.parent) return;
      if (state.selected || state.hovered) clearLocalSelectionVisual();
      return;
    }
    if (d.__h2fInsp === 'selected') {
      // From a child frame: the deeper selection wins. Drop our own, clear the
      // sibling frames, then either show the panel (top) or bubble up.
      clearLocalSelectionVisual();
      broadcastToChildren({ __h2fInsp: 'clear', nonce: state.bridgeNonce }, ev.source);
      if (window === window.top) {
        try { window.dispatchEvent(new CustomEvent('h2f-inspect-xselect', { detail: { snap: d.snap } })); } catch (_) {}
      } else {
        try { window.parent.postMessage({ __h2fInsp: 'selected', nonce: state.bridgeNonce, snap: d.snap }, '*'); } catch (_) {}
      }
      return;
    }
  }

  window.__h2fInspect = {
    start: function (mode) { ensureOverlay(); applyMode(mode || 'cursor'); },
    setMode: function (mode) { ensureOverlay(); applyMode(mode || 'cursor'); },
    selectElement: function (node) {
      if (!node) return;
      ensureOverlay();
      if (state.mode !== 'cursor') applyMode('cursor');
      state.selected = node;
      state.hovered = null;
      repaintAll();
      dispatchSelect(node);
    },
    stop: function () {
      detachAll();
      state.mode = null;
      var hadSel = !!state.selected;
      state.selected = null;
      state.hovered = null;
      if (state.guardObs) { try { state.guardObs.disconnect(); } catch (_) {} state.guardObs = null; }
      if (state.host) {
        state.host.remove();
        state.host = null;
        state.shadow = null;
        state.L = null;
      }
      if (hadSel) dispatchSelect(null);
    },
    clearSelection: clearSelection,
    getMode: function () { return state.mode; },
    getSelected: function () { return state.selected; },
    // Cross-frame bridge: wire the nonce-gated postMessage listener (all frames).
    installBridge: function (nonce) {
      state.bridgeNonce = nonce;
      if (!state.bridgeAttached) {
        window.addEventListener('message', onBridgeMessage, true);
        state.bridgeAttached = true;
      }
    },
    // Top frame: push the active mode down to every child frame.
    broadcastMode: function (mode) {
      if (state.bridgeNonce) broadcastToChildren({ __h2fInsp: 'mode', nonce: state.bridgeNonce, mode: mode || null });
    }
  };
})();
