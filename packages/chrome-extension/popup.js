document.addEventListener('DOMContentLoaded', () => {
  const hoverToggle = document.getElementById('hoverToggle');
  const toggleRow = document.getElementById('toggleRow');
  const hoverDesc = document.getElementById('hoverDesc');
  const infoMsg = document.getElementById('infoMsg');
  const btnCapture = document.getElementById('btnCapture');
  const statusBox = document.getElementById('statusBox');

  function updateUI(withHover) {
    if (withHover) {
      hoverDesc.textContent = 'With hover (revealed)';
      hoverDesc.classList.add('active');
      infoMsg.textContent = 'Captures active hover states, secondary hover icons, and overlay cards.';
    } else {
      hoverDesc.textContent = 'Without hover (default)';
      hoverDesc.classList.remove('active');
      infoMsg.textContent = 'Captures clean baseline design — hover states & animations suppressed.';
    }
  }

  // Load saved preference (default to false = without hover)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['withHover'], (res) => {
      const withHover = res && typeof res.withHover === 'boolean' ? res.withHover : false;
      hoverToggle.checked = withHover;
      updateUI(withHover);
    });
  } else {
    hoverToggle.checked = false;
    updateUI(false);
  }

  // Switch change listener
  hoverToggle.addEventListener('change', () => {
    const isChecked = hoverToggle.checked;
    updateUI(isChecked);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ withHover: isChecked });
    }
  });

  // Clicking row toggles the switch
  toggleRow.addEventListener('click', (e) => {
    if (e.target !== hoverToggle && !e.target.closest('.apple-switch')) {
      hoverToggle.checked = !hoverToggle.checked;
      hoverToggle.dispatchEvent(new Event('change'));
    }
  });

  function showStatus(text, type = 'success') {
    statusBox.textContent = text;
    statusBox.className = `status-box ${type}`;
    statusBox.style.display = 'block';
  }

  // Capture Button Action
  btnCapture.addEventListener('click', async () => {
    btnCapture.disabled = true;
    btnCapture.textContent = 'Capturing…';
    statusBox.style.display = 'none';

    const withHover = hoverToggle.checked;

    try {
      let targetTabId = null;
      if (chrome.tabs && chrome.tabs.query) {
        try {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          const validTab = tabs && tabs.find(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
          if (validTab && validTab.id) targetTabId = validTab.id;
        } catch (e) {}
      }

      chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
        tabId: targetTabId,
        withHover: withHover
      }, (response) => {
        btnCapture.disabled = false;
        btnCapture.textContent = 'Capture Page';

        if (chrome.runtime.lastError) {
          showStatus(chrome.runtime.lastError.message || 'Capture failed', 'error');
          return;
        }

        if (response && !response.success) {
          showStatus(response.error || 'Capture failed', 'error');
          return;
        }

        showStatus('✅ Capture started! See webpage banner.', 'success');
        setTimeout(() => {
          window.close();
        }, 800);
      });
    } catch (err) {
      btnCapture.disabled = false;
      btnCapture.textContent = 'Capture Page';
      showStatus(err.message || 'Failed to start capture', 'error');
    }
  });
});
