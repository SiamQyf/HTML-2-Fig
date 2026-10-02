document.addEventListener('DOMContentLoaded', () => {
  const btnCapture = document.getElementById('btnCapture');
  const btnText = document.getElementById('btnText');
  const statusBox = document.getElementById('statusBox');

  function setButtonState(loading, text) {
    btnCapture.disabled = loading;
    if (btnText) {
      btnText.textContent = text;
    } else {
      btnCapture.textContent = text;
    }
  }

  function showStatus(text, type = 'success') {
    statusBox.textContent = text;
    statusBox.className = `status-box ${type}`;
    statusBox.style.display = 'block';
  }

  function isRestricted(url) {
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

  // Capture Button Action
  btnCapture.addEventListener('click', async () => {
    setButtonState(true, 'Capturing…');
    statusBox.style.display = 'none';

    try {
      let targetTab = null;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        try {
          let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tabs || !tabs.length) {
            tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          }
          if (!tabs || !tabs.length) {
            tabs = await chrome.tabs.query({ active: true });
          }
          targetTab = tabs && tabs.find(t => t.url && !isRestricted(t.url));
          if (!targetTab && tabs && tabs[0]) {
            targetTab = tabs[0];
          }
        } catch (e) {}
      }

      if (targetTab && isRestricted(targetTab.url)) {
        setButtonState(false, 'Capture Page');
        showStatus('⚠️ Cannot capture Chrome system or store pages. Please open a regular website tab.', 'error');
        return;
      }

      chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
        tabId: targetTab ? targetTab.id : null
      }, (response) => {
        setButtonState(false, 'Capture Page');

        if (chrome.runtime.lastError) {
          showStatus(chrome.runtime.lastError.message || 'Capture failed', 'error');
          return;
        }

        if (response && !response.success) {
          showStatus(response.error || 'Capture failed', 'error');
          return;
        }

        showStatus('✅ Capture started!', 'success');
        setTimeout(() => {
          window.close();
        }, 800);
      });
    } catch (err) {
      setButtonState(false, 'Capture Page');
      showStatus(err.message || 'Failed to start capture', 'error');
    }
  });
});
