// HTML 2 Fig — WebGL Buffer Preserver
// Injected at document_start in the MAIN world to enable preserveDrawingBuffer on WebGL canvases.
try {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attributes) {
    if (type && typeof type === 'string' && type.toLowerCase().includes('webgl')) {
      attributes = Object.assign({}, attributes, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attributes);
  };

  if (typeof OffscreenCanvas !== 'undefined' && OffscreenCanvas.prototype && OffscreenCanvas.prototype.getContext) {
    const origOffscreenGetContext = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function(type, attributes) {
      if (type && typeof type === 'string' && type.toLowerCase().includes('webgl')) {
        attributes = Object.assign({}, attributes, { preserveDrawingBuffer: true });
      }
      return origOffscreenGetContext.call(this, type, attributes);
    };
  }
} catch (e) {}
