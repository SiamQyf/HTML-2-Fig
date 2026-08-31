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
// transmitter.js - Content Script
// Listens for a message from the landing page and saves the auth token to extension storage.

console.log('[Export to Figma] Auth transmitter active on this page');

// Clamp and strip a display name coming from Supabase user_metadata.
// Array.from before slicing, NOT String.slice: slice counts UTF-16 code units and can cut an
// emoji or astral character in half, which renders as U+FFFD in the profile card.
// The stripped ranges are C0/C1 controls plus the bidi overrides and isolates (U+202A-202E,
// U+2066-2069) — those can visually reorder surrounding UI text, so they never reach the DOM.
function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  var s = raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  return Array.from(s).slice(0, 40).join('');
}

window.addEventListener('message', (event) => {
  // Security: Ensure the message comes from our expected domains
  const trustedOrigins = [
    'http://localhost:3000',
    'https://www.exporttofigma.com',
    'https://figma-landing-seven.vercel.app',
    'https://figma-landing-coloratives-projects.vercel.app'
  ];

  if (!trustedOrigins.includes(event.origin)) return;

  const data = event.data;

  // We are looking for a specific message type we'll define later in the Next.js app
  if (data && data.type === 'H2F_AUTH_TOKEN' && data.token) {
    console.log('[Export to Figma] Received auth token from website!');

    // Save to local storage so the background script can use it
    const toStore = {
      'e2f_supabase_token': data.token,
      'e2f_user_email': data.email
    };
    if (data.refresh_token) toStore['e2f_supabase_refresh_token'] = data.refresh_token;
    if (data.plan) toStore['e2f_plan'] = data.plan;
    // Display name for the settings profile card. Comes from Supabase user_metadata, which is
    // USER-WRITABLE, so it is untrusted text even though the origin is trusted — sanitise here
    // rather than at every render site. Absent for email/password signups (no user_metadata),
    // in which case the card falls back to the email.
    const cleanName = sanitizeName(data.name);
    if (cleanName) toStore['e2f_user_name'] = cleanName;
    chrome.storage.local.set(toStore, () => {
      console.log('[Export to Figma] Authentication synced.');
    });
  }
  
  // Also handle logout
  if (data && data.type === 'H2F_AUTH_LOGOUT') {
    chrome.storage.local.remove(['e2f_supabase_token', 'e2f_user_email', 'e2f_user_name', 'e2f_supabase_refresh_token', 'e2f_exports_remaining', 'e2f_exports_total', 'e2f_plan', 'e2f_plan_expires_at'], () => {
      console.log('[Export to Figma] Logged out.');
    });
  }
});
