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
// eyedropper.js — Color eyedropper (native browser EyeDropper API)
// MAIN-world script. Exposes window.__h2fEyedropper = { start, stop }.
//
// The accurate, zoomed magnifier is the browser's own: window.EyeDropper samples
// the real composited screen at the OS level — no screenshot, no devicePixelRatio
// math, no staleness. (This is what the "Peek" extension does too.) start() opens
// it on a user gesture; on pick we copy the hex and flash a branded confirmation
// pill (circle swatch + hex + green Lucide check) at the cursor, which then trails
// the pointer for a moment before fading. The native magnifier eats pointer events
// while it is open, so we reveal on the first move after the pick (cursor's true
// spot) and fall back to the last-known position if the user holds still.
// Contact: justlogoz@gmail.com · hello@exporttofigma.com

(function () {
  if (window.__h2fEyedropper) return;

  // i18n accessor — CALL-TIME lookup, not a captured reference: this script is idempotent
  // (the guard above) so it evaluates once per page, while window.__e2fT is replaced on every
  // language change. See the same note in inspect.js.
  function __t(k, d, p) { var f = window.__e2fT; return f ? f(k, d, p) : d; }

  var OVERLAY_HOST_ID = '__h2f_eyedrop_overlay_host__';
  var TOOLBAR_HOST_ID = '__h2f_p1_host__';
  var EYEDROP_BTN_ID  = '__h2f_eyedrop_btn__';

  var GREEN = '#22c55e';
  var FONT_STACK = '"Inter",ui-sans-serif,system-ui,-apple-system,sans-serif';

  var state = {
    abort: null,        // AbortController for the in-flight native picker
    host: null, shadow: null,
    pill: null, swatch: null, hexLabel: null, checkBox: null,
    hideT: null,        // fade-out timer
    armT: null,         // fallback-reveal timer (user didn't move after pick)
    follow: false,      // trail the cursor while the pill is up
    pendingReveal: false,
    lifeMs: 1700,
    mouse: { x: 0, y: 0, has: false },
    moveBound: null     // the document pointermove listener, while attached
  };

  function el(tag, cssText) {
    var n = document.createElement(tag);
    if (cssText) n.style.cssText = cssText;
    return n;
  }

  // Lucide "check" in green — the pick confirmation.
  function checkSvg() {
    var NS = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', GREEN);
    s.setAttribute('stroke-width', '3');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.style.cssText = 'width:13px;height:13px;flex-shrink:0;display:block';
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M20 6 9 17l-5-5');
    s.appendChild(p);
    return s;
  }

  // The confirm pill lives in its own shadow host so page CSS can't touch it.
  function ensurePill() {
    if (state.host && state.host.isConnected) return;
    var host = el('div',
      'position:fixed;inset:0;pointer-events:none;z-index:2147483646;' +
      'margin:0;padding:0;border:0;background:transparent');
    host.id = OVERLAY_HOST_ID;
    var shadow = host.attachShadow({ mode: 'open' });

    // Pill shape, neutral border (the green lives in the check, not the frame).
    var pill = el('div',
      'position:fixed;left:0;top:0;display:none;align-items:center;gap:7px;' +
      'background:#09090b;color:rgba(255,255,255,0.92);' +
      'border:1px solid rgba(255,255,255,0.12);border-radius:999px;' +
      'padding:5px 11px;font:600 11px/1 ' + FONT_STACK + ';white-space:nowrap;' +
      'pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,0.45);' +
      'opacity:0;transform:translateY(-2px) scale(0.96);' +
      'transition:opacity .12s ease,transform .12s ease');
    var swatch = el('span',
      'display:inline-block;width:12px;height:12px;border-radius:50%;flex-shrink:0;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,0.3);background:#000');
    var hexLabel = el('span', 'font-variant-numeric:tabular-nums;letter-spacing:.3px');
    var checkBox = el('span', 'display:inline-flex;align-items:center');
    checkBox.appendChild(checkSvg());
    pill.appendChild(swatch);
    pill.appendChild(hexLabel);
    pill.appendChild(checkBox);
    shadow.appendChild(pill);
    document.documentElement.appendChild(host);

    // Top-layer promotion so the pill paints above page modals (same as inspect.js).
    try {
      if (typeof host.showPopover === 'function') {
        host.setAttribute('popover', 'manual');
        host.showPopover();
      }
    } catch (_) { try { host.removeAttribute('popover'); } catch (__) {} }

    state.host = host; state.shadow = shadow;
    state.pill = pill; state.swatch = swatch;
    state.hexLabel = hexLabel; state.checkBox = checkBox;
  }

  // Place the pill just below-right of the cursor, flipping to the other side when
  // it would run off-screen, and clamping inside the viewport.
  function positionAtCursor(cx, cy) {
    var pill = state.pill, pw = pill.offsetWidth, ph = pill.offsetHeight;
    var OX = 16, OY = 18;
    var x = cx + OX, y = cy + OY;
    if (x + pw > window.innerWidth - 8) x = cx - pw - OX;   // flip left
    if (y + ph > window.innerHeight - 8) y = cy - ph - OY;  // flip up
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    pill.style.left = x + 'px';
    pill.style.top  = y + 'px';
  }

  // Anchor the pill to the pipette button — used for messages (not pick confirms),
  // centred under it, flipping above when there's no room. Falls back to top-right.
  function positionAtAnchor() {
    var pill = state.pill, pw = pill.offsetWidth, ph = pill.offsetHeight;
    var tb = document.getElementById(TOOLBAR_HOST_ID);
    var anchor = (tb && tb.shadowRoot && tb.shadowRoot.getElementById(EYEDROP_BTN_ID)) || tb;
    var x, y;
    if (anchor) {
      var r = anchor.getBoundingClientRect();
      x = r.left + r.width / 2 - pw / 2;
      y = (r.bottom + 8 + ph > window.innerHeight) ? (r.top - ph - 8) : (r.bottom + 8);
    } else {
      x = window.innerWidth - pw - 16; y = 16;
    }
    if (x < 8) x = 8;
    if (x + pw > window.innerWidth - 8) x = window.innerWidth - pw - 8;
    if (y < 8) y = 8;
    pill.style.left = x + 'px';
    pill.style.top  = y + 'px';
  }

  // Persistent pointer tracking. While a confirm is pending, the first real move
  // after the pick reveals the pill at the true cursor; after that it trails along.
  function onPointerMove(e) {
    state.mouse.x = e.clientX; state.mouse.y = e.clientY; state.mouse.has = true;
    if (!state.pill) return;
    if (state.pendingReveal) { revealAt(e.clientX, e.clientY); return; }
    if (state.follow) positionAtCursor(e.clientX, e.clientY);
  }

  function attachMoveTracking() {
    if (state.moveBound) return;
    state.moveBound = onPointerMove;
    document.addEventListener('pointermove', state.moveBound, { passive: true, capture: true });
  }
  function detachMoveTracking() {
    if (!state.moveBound) return;
    document.removeEventListener('pointermove', state.moveBound, { capture: true });
    state.moveBound = null;
  }

  // Fade the pill in at (cx, cy) and arm the auto-hide.
  function revealAt(cx, cy) {
    if (!state.pill) return;
    state.pendingReveal = false;
    if (state.armT) { clearTimeout(state.armT); state.armT = null; }
    state.pill.style.display = 'inline-flex';
    positionAtCursor(cx, cy);
    requestAnimationFrame(function () {
      if (!state.pill) return;
      state.pill.style.opacity = '1';
      state.pill.style.transform = 'translateY(0) scale(1)';
    });
    if (state.hideT) clearTimeout(state.hideT);
    state.hideT = setTimeout(hideConfirm, state.lifeMs);
  }

  function showConfirm(hex) {
    ensurePill();
    state.swatch.style.display = 'inline-block';
    state.swatch.style.background = hex;
    state.checkBox.style.display = 'inline-flex';
    state.hexLabel.textContent = hex;

    // Lay it out invisibly so offsetWidth/Height are measurable for positioning,
    // then reveal at the cursor (true spot on first move, last-known otherwise).
    state.pill.style.display = 'inline-flex';
    state.pill.style.opacity = '0';
    state.pill.style.transform = 'translateY(-2px) scale(0.96)';
    state.follow = true;
    state.pendingReveal = true;
    state.lifeMs = 1700;
    if (state.armT) clearTimeout(state.armT);
    state.armT = setTimeout(function () {
      if (!state.pendingReveal) return;
      var m = state.mouse;
      revealAt(m.has ? m.x : window.innerWidth / 2, m.has ? m.y : window.innerHeight / 2);
    }, 450);
  }

  function showMessage(text) {
    ensurePill();
    state.swatch.style.display = 'none';
    state.checkBox.style.display = 'none';
    state.hexLabel.textContent = text;
    state.follow = false;
    state.pendingReveal = false;
    if (state.armT) { clearTimeout(state.armT); state.armT = null; }
    state.pill.style.display = 'inline-flex';
    positionAtAnchor();
    requestAnimationFrame(function () {
      if (!state.pill) return;
      state.pill.style.opacity = '1';
      state.pill.style.transform = 'translateY(0) scale(1)';
    });
    if (state.hideT) clearTimeout(state.hideT);
    state.hideT = setTimeout(hideConfirm, 1900);
  }

  function hideConfirm() {
    if (state.hideT) { clearTimeout(state.hideT); state.hideT = null; }
    if (state.armT) { clearTimeout(state.armT); state.armT = null; }
    state.follow = false;
    state.pendingReveal = false;
    if (!state.pill) return;
    state.pill.style.opacity = '0';
    state.pill.style.transform = 'translateY(-2px) scale(0.96)';
  }

  var api = {
    // Open the browser's native eyedropper. MUST be called synchronously from the
    // click handler so the user gesture carries through to open().
    start: function () {
      if (!('EyeDropper' in window)) {
        showMessage(__t('eyedNeedsChrome', 'Color picker needs Chrome 95+'));
        return;
      }
      attachMoveTracking();
      try {
        var ac = new AbortController();
        state.abort = ac;
        new window.EyeDropper().open({ signal: ac.signal }).then(function (res) {
          state.abort = null;
          var hex = (res && res.sRGBHex ? res.sRGBHex : '').toUpperCase();
          if (!hex) return;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(hex).then(function () {}, function () {});
            }
          } catch (_) {}
          showConfirm(hex);
        }, function () {
          state.abort = null; // AbortError / cancel (Esc) — nothing picked
        });
      } catch (_) { state.abort = null; }
    },
    // Abort an in-flight pick and tear down the confirm pill (called on toolbar close).
    stop: function () {
      if (state.abort) { try { state.abort.abort(); } catch (_) {} state.abort = null; }
      if (state.hideT) { clearTimeout(state.hideT); state.hideT = null; }
      if (state.armT) { clearTimeout(state.armT); state.armT = null; }
      detachMoveTracking();
      state.follow = false; state.pendingReveal = false;
      if (state.host) { try { state.host.remove(); } catch (_) {} }
      state.host = null; state.shadow = null;
      state.pill = null; state.swatch = null; state.hexLabel = null; state.checkBox = null;
    }
  };
  window.__h2fEyedropper = api;
})();
