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
      // Injecting in default ISOLATED world so chrome.runtime is available
      files: ['opentype.min.js', 'capture.js']
    });
  } catch (err) {
    console.error('[HTML-2-Fig] Failed to inject capture script:', err);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INJECT_INTO_FRAME') {
    // Inject capture script into a specific cross-origin iframe by frameId
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [request.frameId] },
      files: ['opentype.min.js', 'capture.js']
    }).catch(err => {
      console.error('[HTML-2-Fig] Failed to inject into frame:', err);
    });
    sendResponse({ ok: true });
    return false;
  }

  if (request.type === 'INJECT_INTO_FRAME_BY_URL') {
    // Find the frame matching the given URL and inject into it
    chrome.webNavigation.getAllFrames({ tabId: sender.tab.id }, (frames) => {
      if (!frames) return;
      const targetFrame = frames.find(f => f.url === request.url || f.url.startsWith(request.url));
      if (targetFrame) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id, frameIds: [targetFrame.frameId] },
          func: () => { window.__html2FigInFrame = true; }
        }).then(() => {
          return chrome.scripting.executeScript({
            target: { tabId: sender.tab.id, frameIds: [targetFrame.frameId] },
            files: ['opentype.min.js', 'capture.js']
          });
        }).catch(err => {
          console.error('[HTML-2-Fig] Failed to inject into cross-origin frame:', err);
        });
      }
    });
    sendResponse({ ok: true });
    return false;
  }

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
    return true; // Keep channel open for async response
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
    return true; // Keep channel open for async response
  }

  if (request.type === 'FETCH_FONT') {
    fetch(request.url)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(buffer => {
        // Convert ArrayBuffer to Base64
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        sendResponse({ data: btoa(binary), error: null });
      })
      .catch(err => {
        sendResponse({ data: null, error: err.message });
      });
    return true; // Keep channel open for async response
  }
});
