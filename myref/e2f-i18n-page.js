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
// e2f-i18n-page.js — language resolution for PRIVILEGED EXTENSION PAGES.
//
// THE PROBLEM: chrome.i18n.getMessage() always follows the BROWSER UI language. It cannot see
// the Settings-panel override the picker writes to chrome.storage.local under 'e2f_locale'.
// background.js resolves that override itself (e2fBuildI18nBundle); a page cannot import from
// the service worker, so this is the page-side equivalent.
//
// NO LOCALE LIST LIVES HERE, deliberately. background.js's E2F_LOCALES is gated by i18n-check
// C2 against package.json and the _locales/ directory listing; a second copy would sit outside
// that check and drift in silence. It is not needed, because the two cases split cleanly:
//
//   · 'auto' / unset  -> chrome.i18n IS the answer. Chrome matches exact -> base ->
//                        default_locale against OUR OWN _locales/, which is the same rule
//                        e2fNormalizeLocale implements. No fetch, no list, no flicker.
//   · explicit code   -> chrome.i18n is blind to it, so read that one catalog over en. The
//                        code came from our own picker, so the fetch always hits: we never
//                        probe for locales that might not exist.
//
// C2 has a fourth leg that FAILS THE BUILD if any root .js other than background.js declares
// a locale array — that is what keeps this file honest.
//
// Contract: window.__e2fPageI18n() -> Promise<{ lang, stored, native, m, t }>, memoised and
// already in flight by the time this script finishes. It NEVER rejects: on any failure `t`
// returns the caller's inline English default, i.e. exactly today's behaviour.
//   t(key, englishDefault[, params])  — same signature as MAIN world's window.__e2fT.
(function () {
  'use strict';

  // Chrome locale directory grammar. We never build a URL from an unvalidated storage value.
  var CODE = /^[a-z]{2,3}(_[A-Za-z0-9]{2,8})?$/;

  function nativeBundle() {
    var lang = 'en';
    try { lang = String(chrome.i18n.getUILanguage() || 'en').replace('-', '_'); } catch (_) {}
    return {
      lang: lang,      // the BROWSER tag; Chrome already picked the best catalog for it
      // BCP-47 form of the same locale. Kept in lockstep with background.js's bundle so any
      // future Intl.* or toLocale*Case consumer on these pages has a valid tag to hand:
      // `lang` carries the _locales underscore ('pt_BR') and those APIs throw RangeError on
      // it. That mistake cost the settings panel outright in pt_BR and zh_CN — see C20.
      bcp: lang.replace('_', '-'),
      stored: 'auto',
      native: true,    // consumers skip their re-render: phase 0 already produced this text
      m: null,
      t: function (k, d) { try { return chrome.i18n.getMessage(k) || d; } catch (_) { return d; } }
    };
  }

  async function readCatalog(loc) {
    if (!CODE.test(String(loc))) return null;
    try {
      // Concatenated on purpose. A complete path literal would make release/derive.mjs stage
      // ONE hardcoded locale and hide the rest; the bare '_locales/' prefix this leaks is
      // dropped by derive's trailing-slash rule, and the locale DIMENSION is expanded from
      // manifest.default_locale instead. Identical to background.js's e2fReadCatalog.
      var res = await fetch(chrome.runtime.getURL('_locales/' + loc + '/messages.json'));
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function overlay(cat, into) {
    for (var k in (cat || {})) {
      if (cat[k] && typeof cat[k].message === 'string') into[k] = cat[k].message;
    }
    return into;
  }

  async function build() {
    var stored = null;
    try { stored = (await chrome.storage.local.get(['e2f_locale'])).e2f_locale; } catch (_) {}
    if (!stored || stored === 'auto') return nativeBundle();

    var cat = await readCatalog(stored);
    if (!cat) return nativeBundle();   // stale or unknown override -> behave exactly like 'auto',
                                       // matching background.js's E2F_LOCALES.includes() fallback

    // en is the BASE, always. A key a translator has not reached yet then renders English
    // instead of blank — the same reason every call site keeps its inline English default.
    var m = overlay(cat, overlay(await readCatalog('en'), {}));

    return {
      lang: stored,
      bcp: String(stored).replace('_', '-'),   // see nativeBundle() — never hand `lang` to Intl
      stored: stored,
      native: false,
      m: m,
      // Same shape as window.__e2fT so the two accessors are interchangeable. No Intl number
      // formatting here: extension pages have no numeric strings, and pulling it in would be a
      // second copy of a rule that already lives in e2fInstallI18n.
      t: function (k, d, p) {
        var s = (m[k] != null) ? m[k] : d;
        if (!p) return s;
        return String(s).replace(/\{(\w+)\}/g, function (whole, key) {
          return (key in p) ? String(p[key]) : whole;
        });
      }
    };
  }

  // Started AT LOAD, not on first call, so the storage read and the catalog reads overlap the
  // parse of everything after this <script>. Load this file FIRST on the page.
  var promise = build().catch(nativeBundle);

  window.__e2fPageI18n = function () { return promise; };
})();
