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
// unsupported.js — tailors the popup copy based on the ?reason query param.
//
// Loaded as an external file (not inline) because MV3 extension-page CSP
// (script-src 'self') blocks inline <script>. It's a same-origin popup
// subresource, so it needs no web_accessible_resources entry.
//
// Default (no/other reason): the static "Page not supported" copy is left as-is
// (chrome://, web store, etc.). reason=file: swap in file-access instructions.
(function () {
  // ── i18n: TWO PHASES, on purpose ────────────────────────────────────────────
  // Phase 0 is SYNCHRONOUS and runs before the first paint, using chrome.i18n — which follows
  // the BROWSER language, i.e. exactly what the default 'auto' setting resolves to. For every
  // user who has NOT overridden their language, phase 0 is already the final answer and phase 1
  // short-circuits, so there is no flicker at all on the common path.
  //
  // Phase 1 is ASYNC and only matters when the Settings picker wrote an explicit 'e2f_locale'.
  // chrome.i18n is structurally blind to that value (a Chrome limitation, not ours), so
  // e2f-i18n-page.js reads the catalog itself and we re-render in place.
  //
  // We deliberately do NOT await before the first render, including on the ?reason=file path.
  // The English in the HTML is the crash-proof fallback AND what gate C8 compares against
  // _locales/en; awaiting first would blank the popup, or — worse on ?reason=file — paint the
  // WRONG COPY ("Page not supported") for a frame. Render the right copy in the best language
  // available synchronously, then upgrade the language only.
  function nativeT(k, d) {
    try { return chrome.i18n.getMessage(k) || d; } catch (_) { return d; }
  }

  render(nativeT);   // `render` is a hoisted function declaration — see below

  var pending = window.__e2fPageI18n && window.__e2fPageI18n();
  if (pending) pending.then(function (b) {
    if (!b || b.native) return;   // phase 0 already produced this exact text — no re-render
    // The HTML lang attribute is BCP-47, so it takes b.bcp — the bundle now carries that form
    // ready-made instead of every consumer re-deriving it.
    try { document.documentElement.lang = b.bcp || String(b.lang).replace('_', '-'); } catch (_) {}
    render(b.t);
  }, function () { /* the helper never rejects; belt-and-suspenders */ });

  // Renders the WHOLE popup from ONE accessor, so the two phases can never disagree about
  // structure — only about language. Must stay idempotent, and must sweep [data-i18n] BEFORE
  // the ?reason=file branch: .title carries data-i18n="unsupTitle" and that branch overwrites
  // it, so the reverse order would restore the wrong headline on the second pass. Both calls
  // are synchronous, so nothing paints between the sweep and the rebuild.
  function render(__t) {
  // Static copy: the English in the HTML is the crash-proof fallback AND what gate C8
  // compares against _locales/en, so leave it in place.
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var v = __t(el.dataset.i18n, null);
    if (v) el.textContent = v;
  });

  var params = new URLSearchParams(location.search);
  if (params.get('reason') !== 'file') return;

  var title = document.querySelector('.title');
  var sub = document.querySelector('.sub');
  if (title) title.textContent = __t('unsupFileTitle', 'Enable file access to use this');
  if (sub) {
    sub.style.whiteSpace = 'normal'; // override the nowrap so the copy wraps

    // Built as DOM nodes rather than innerHTML. The bold setting name used to be literal
    // <b> markup inside the sentence, which forces every translation to keep English word
    // order; as a {setting} placeholder each language can put it where it belongs.
    var strong = document.createElement('b');
    strong.textContent = __t('unsupFileSettingName', 'Allow access to file URLs');

    var btn = document.createElement('button');
    btn.className = 'e2f-btn';
    btn.id = 'e2f-open-settings';
    btn.type = 'button';
    btn.textContent = __t('unsupFileBtn', 'Open extension settings');

    var note = document.createElement('div');
    note.style.cssText = 'margin-top:11px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:rgba(255,255,255,0.4);line-height:1.55;';
    note.textContent = __t('unsupFileNote', 'Good to know: images saved on your computer won’t be captured — that’s a Chrome limitation. Everything else works fine.');

    sub.replaceChildren();
    sub.appendChild(document.createTextNode(__t('unsupFileStep1', 'To capture local files, Chrome needs one permission:')));
    sub.appendChild(btn);
    // Split the sentence around {setting} and drop the bold element into the gap.
    var step2 = __t('unsupFileStep2', 'On that page, turn on {setting}, then reload this page and click the icon again.');
    var parts = String(step2).split('{setting}');
    sub.appendChild(document.createTextNode(parts[0]));
    sub.appendChild(strong);
    sub.appendChild(document.createTextNode(parts.length > 1 ? parts[1] : ''));
    sub.appendChild(note);

    // Jump straight to OUR details page, where the file-access toggle lives.
    // A <a href="chrome://…"> is blocked from a popup, but chrome.tabs.create
    // can open it — and creating a tab needs no "tabs" permission. We can't flip
    // the toggle ourselves (Chrome has no API for it, by design); this is the
    // closest we can get to one-click.
    // (btn is the element built above — no re-lookup needed now that it is constructed
    // here rather than parsed out of an innerHTML string.)
    btn.addEventListener('click', function () {
      try {
        chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
      } catch (_) {}
    });
  }
  }
})();
