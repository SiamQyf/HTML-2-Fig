/*
 * HTML 2 Fig — Background Service Worker
 * Listens for toolbar clicks and injects the capture engine.
 */

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('https://chrome.google.com/webstore/') ||
    url.startsWith('https://chromewebstore.google.com/')
  );
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || isRestrictedUrl(tab.url)) {
    console.warn('[HTML-2-Fig] Cannot capture restricted URL:', tab.url);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['opentype.min.js', 'capture.js']
    });
  } catch (err) {
    console.error('[HTML-2-Fig] Failed to inject capture script:', err);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── Open cross-origin iframe URL in a new tab and auto-capture it ──────────
  if (request.type === 'OPEN_AND_CAPTURE') {
    chrome.tabs.create({ url: request.url, active: true }, (newTab) => {
      const onUpdated = (tabId, info) => {
        if (tabId !== newTab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        // Wait 1.5s for JS on the new tab to initialize, then inject capture
        setTimeout(async () => {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              files: ['opentype.min.js', 'capture.js']
            });
          } catch (err) {
            console.error('[HTML-2-Fig] Failed to capture new tab:', err);
          }
        }, 1500);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
    sendResponse({ ok: true });
    return false;
  }

  // ── Background image / font fetchers (bypass CORS) ─────────────────────────
  if (request.type === 'FETCH_IMAGE') {
    fetch(request.url)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ data: reader.result, error: null });
        reader.readAsDataURL(blob);
      })
      .catch(err => {
        sendResponse({ data: null, error: err.message });
      });
    return true;
  }

  if (request.type === 'FETCH_TEXT') {
    fetch(request.url)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(text => {
        sendResponse({ data: text, error: null });
      })
      .catch(err => {
        sendResponse({ data: null, error: err.message });
      });
    return true;
  }

  if (request.type === 'FETCH_FONT') {
    fetch(request.url)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(buffer => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        sendResponse({ data: btoa(binary), error: null });
      })
      .catch(err => {
        sendResponse({ data: null, error: err.message });
      });
    return true;
  }
});
