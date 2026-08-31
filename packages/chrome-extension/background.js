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
      world: 'MAIN',
      files: ['capture.js']
    });
  } catch (err) {
    console.error('[HTML-2-Fig] Failed to inject capture script:', err);
  }
});
