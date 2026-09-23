/*
 * HTML 2 Fig — Background Service Worker
 * Listens for toolbar clicks, injects capture engine into all frames,
 * and coordinates cross-frame message splicing without opening new tabs.
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

// ── Cross-frame machinery injected into all frames ───────────────────────────
function installFrameMachinery(nonce) {
  var frameRefs = [];

  function tagIframes() {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      if (iframe.contentWindow) {
        var r = iframe.getBoundingClientRect();
        // Skip invisible or zero-size tracking pixels
        if (r.width <= 2 && r.height <= 2) continue;
        var uuid;
        try {
          uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('h2f-' + i + '-' + Math.random().toString(36).slice(2));
        } catch (e) {
          uuid = 'h2f-' + i + '-' + Date.now();
        }
        try {
          iframe.setAttribute('aria-e2f-frameref', uuid);
        } catch (e) {
          continue;
        }
        frameRefs.push({ uuid: uuid, el: iframe });
      }
    }
  }
  tagIframes();
  window.__e2fFrameRefs = frameRefs;

  function findNodeByRef(node, ref) {
    if (!node || typeof node !== 'object') return null;
    if (node.attributes && node.attributes['aria-e2f-frameref'] === ref) return node;
    var childNodes = node.childNodes;
    if (childNodes) {
      for (var i = 0; i < childNodes.length; i++) {
        var found = findNodeByRef(childNodes[i], ref);
        if (found) return found;
      }
    }
    return null;
  }

  function offsetAndRekey(node, dx, dy, prefix) {
    if (node && typeof node === 'object') {
      if (node.rect) {
        if (typeof node.rect.x === 'number') node.rect.x += dx;
        if (typeof node.rect.y === 'number') node.rect.y += dy;
        if (node.rect.quad) {
          var q = node.rect.quad;
          var pts = [q.p1, q.p2, q.p3, q.p4];
          for (var i = 0; i < pts.length; i++) {
            if (pts[i]) {
              pts[i].x += dx;
              pts[i].y += dy;
            }
          }
        }
      }
      if (node.pseudoElementNodes) {
        if (node.pseudoElementNodes.before) offsetAndRekey(node.pseudoElementNodes.before, dx, dy, prefix);
        if (node.pseudoElementNodes.after) offsetAndRekey(node.pseudoElementNodes.after, dx, dy, prefix);
      }
      if (typeof node.placeholderUrl === 'string' && node.placeholderUrl.startsWith('rasterized:')) {
        node.placeholderUrl = prefix + ':' + node.placeholderUrl;
      }
      if (Array.isArray(node.childNodes)) {
        for (var j = 0; j < node.childNodes.length; j++) {
          offsetAndRekey(node.childNodes[j], dx, dy, prefix);
        }
      }
    }
  }

  function spliceChild(parentPayload, iframeNode, childPayload, iframeEl, uuid) {
    if (childPayload && childPayload.root && iframeNode && iframeNode.rect) {
      var borderLeft = 0, borderTop = 0;
      try {
        var s = getComputedStyle(iframeEl);
        borderLeft = (parseFloat(s.borderLeftWidth) || 0) + (parseFloat(s.paddingLeft) || 0);
        borderTop = (parseFloat(s.borderTopWidth) || 0) + (parseFloat(s.paddingTop) || 0);
      } catch (err) {}

      var childRootRect = childPayload.root.rect || {};
      var childX = typeof childRootRect.x === 'number' ? childRootRect.x : 0;
      var childY = typeof childRootRect.y === 'number' ? childRootRect.y : 0;
      var dx = iframeNode.rect.x + borderLeft - childX;
      var dy = iframeNode.rect.y + borderTop - childY;

      offsetAndRekey(childPayload.root, dx, dy, uuid);

      // Merge assets
      if (childPayload.assets) {
        if (!parentPayload.assets) parentPayload.assets = {};
        for (var k in childPayload.assets) {
          if (Object.prototype.hasOwnProperty.call(childPayload.assets, k)) {
            var rekeyed = k.startsWith('rasterized:') ? (uuid + ':' + k) : k;
            if (!(rekeyed in parentPayload.assets)) {
              parentPayload.assets[rekeyed] = childPayload.assets[k];
            }
          }
        }
      }

      // Merge fonts
      if (childPayload.fonts) {
        if (!parentPayload.fonts) parentPayload.fonts = {};
        for (var fk in childPayload.fonts) {
          if (Object.prototype.hasOwnProperty.call(childPayload.fonts, fk)) {
            if (!(fk in parentPayload.fonts)) {
              parentPayload.fonts[fk] = childPayload.fonts[fk];
            }
          }
        }
      }

      iframeNode.childNodes = [childPayload.root];

      try {
        var docRect = childPayload.documentRect;
        if (docRect) {
          if (typeof docRect.height === 'number' && docRect.height > (iframeNode.rect.height || 0)) {
            iframeNode.rect.height = docRect.height;
            if (iframeNode.rect.cssHeight != null) iframeNode.rect.cssHeight = docRect.height;
          }
          if (typeof docRect.width === 'number' && docRect.width > (iframeNode.rect.width || 0)) {
            iframeNode.rect.width = docRect.width;
            if (iframeNode.rect.cssWidth != null) iframeNode.rect.cssWidth = docRect.width;
          }
        }
      } catch (err) {}

      if (iframeNode.styles) {
        iframeNode.styles.overflow = 'visible';
        iframeNode.styles.overflowX = 'visible';
        iframeNode.styles.overflowY = 'visible';
        iframeNode.styles.maxHeight = 'none';
      }

      // Expand parent document and root rect if iframe extends past it
      if (parentPayload.documentRect && iframeNode.rect) {
        var bottom = iframeNode.rect.y + iframeNode.rect.height;
        if (bottom > parentPayload.documentRect.height) {
          parentPayload.documentRect.height = bottom;
        }
      }
      if (parentPayload.root && parentPayload.root.rect && iframeNode.rect) {
        var bottom = iframeNode.rect.y + iframeNode.rect.height;
        if (bottom > parentPayload.root.rect.height) {
          parentPayload.root.rect.height = bottom;
          if (parentPayload.root.rect.cssHeight != null) parentPayload.root.rect.cssHeight = bottom;
        }
        if (parentPayload.root.styles) {
          parentPayload.root.styles.overflow = 'visible';
          parentPayload.root.styles.overflowX = 'visible';
          parentPayload.root.styles.overflowY = 'visible';
          parentPayload.root.styles.maxHeight = 'none';
        }
      }

      if (iframeNode.attributes) {
        try { delete iframeNode.attributes['aria-e2f-frameref']; } catch (err) {}
      }
    }
  }

  function fillFrames(parentPayload) {
    return new Promise(function(resolve) {
      if (!frameRefs || !frameRefs.length) return resolve(parentPayload);
      var promises = [];
      for (var i = 0; i < frameRefs.length; i++) {
        (function(item) {
          var node = findNodeByRef(parentPayload.root, item.uuid);
          if (node) {
            if (item.el && item.el.contentWindow) {
              var win = item.el.contentWindow;
              var reqId = item.uuid;
              var p = new Promise(function(resolveChild) {
                var ackTimer, doneTimer, isFinished = false, gotAck = false;
                function finish(res) {
                  if (!isFinished) {
                    isFinished = true;
                    try { window.removeEventListener('message', onMsg, true); } catch (e) {}
                    clearTimeout(ackTimer);
                    clearTimeout(doneTimer);
                    resolveChild(res);
                  }
                }
                function onMsg(ev) {
                  var data = ev.data;
                  if (data && data.requestId === reqId && ev.source === win) {
                    if (data.__e2f === 'E2F_FRAME_ACK') {
                      if (!gotAck) {
                        gotAck = true;
                        clearTimeout(ackTimer);
                        doneTimer = setTimeout(function() { finish(null); }, 45000);
                      }
                    } else if (data.__e2f === 'E2F_FRAME_RESULT') {
                      finish(data.payload || null);
                    }
                  }
                }
                ackTimer = setTimeout(function() { finish(null); }, 3000);
                window.addEventListener('message', onMsg, true);
                try {
                  win.postMessage({ __e2f: 'E2F_CAPTURE_FRAME', requestId: reqId, nonce: nonce }, '*');
                } catch (e) {
                  finish(null);
                }
              }).then(function(childObj) {
                return { ref: item, node: node, childObj: childObj };
              });
              promises.push(p);
            } else if (node.attributes) {
              try { delete node.attributes['aria-e2f-frameref']; } catch (e) {}
            }
          }
        })(frameRefs[i]);
      }

      Promise.all(promises).then(function(results) {
        for (var j = 0; j < results.length; j++) {
          var res = results[j];
          if (res.childObj) {
            spliceChild(parentPayload, res.node, res.childObj, res.ref.el, res.ref.uuid);
          } else if (res.node.attributes) {
            try { delete res.node.attributes['aria-e2f-frameref']; } catch (e) {}
          }
        }
        resolve(parentPayload);
      }).catch(function() {
        resolve(parentPayload);
      });
    });
  }

  if (window === window.top) {
    window.__e2fSpliceFrames = function(payload) {
      return new Promise(function(resolve) {
        if (!frameRefs || !frameRefs.length) return resolve(payload);
        var parsed = payload;
        if (typeof payload === 'string') {
          try { parsed = JSON.parse(payload); } catch (e) { return resolve(payload); }
        }
        fillFrames(parsed).then(function(spliced) {
          try {
            resolve(typeof payload === 'string' ? JSON.stringify(spliced) : spliced);
          } catch (e) {
            resolve(payload);
          }
        }).catch(function() {
          resolve(payload);
        });
      });
    };
  } else {
    if (window.__e2fResponder) {
      try { window.removeEventListener('message', window.__e2fResponder, true); } catch (e) {}
    }
    var responder = function(ev) {
      var data = ev.data;
      if (data && data.__e2f === 'E2F_CAPTURE_FRAME' && ev.source === window.parent && data.nonce === nonce) {
        var origin = ev.origin || '*';
        var reqId = data.requestId;
        var sourceWin = ev.source;
        var post = function(msgType, payload) {
          try {
            sourceWin.postMessage({ __e2f: msgType, requestId: reqId, payload: payload }, '*');
          } catch (e) {}
        };
        post('E2F_FRAME_ACK');

        if (window.html2Fig && window.html2Fig.captureRaw) {
          Promise.resolve()
            .then(function() {
              return window.html2Fig.captureRaw();
            })
            .then(function(childPayload) {
              var obj = (typeof childPayload === 'string') ? JSON.parse(childPayload) : childPayload;
              return fillFrames(obj).then(function() { return obj; });
            })
            .then(function(finalObj) {
              post('E2F_FRAME_RESULT', finalObj);
            })
            .catch(function(err) {
              console.error('[HTML-2-Fig] Frame capture failed:', err);
              post('E2F_FRAME_RESULT', null);
            });
        } else {
          post('E2F_FRAME_RESULT', null);
        }
      }
    };
    window.__e2fResponder = responder;
    window.addEventListener('message', responder, true);
  }
}

// ── Toolbar Click Handler ───────────────────────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || isRestrictedUrl(tab.url)) {
    console.warn('[HTML-2-Fig] Cannot capture restricted URL:', tab.url);
    return;
  }

  try {
    // 1. Inject opentype and capture engine into ALL frames (including cross-origin iframes)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['opentype.min.js', 'capture.js']
      });
    } catch (err) {
      // Fallback to top frame if allFrames is blocked
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['opentype.min.js', 'capture.js']
      });
    }

    // 2. Install frame messaging machinery across all frames
    const nonce = 'h2f-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: installFrameMachinery,
        args: [nonce]
      });
    } catch (err) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: installFrameMachinery,
        args: [nonce]
      });
    }

    // 3. Trigger capture ONLY on the top frame
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.html2Fig && window.html2Fig.startCapture) {
          window.html2Fig.startCapture();
        }
      }
    });
  } catch (err) {
    console.error('[HTML-2-Fig] Failed to run capture pipeline:', err);
  }
});

// ── Background image / font fetchers (bypass CORS) ───────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
