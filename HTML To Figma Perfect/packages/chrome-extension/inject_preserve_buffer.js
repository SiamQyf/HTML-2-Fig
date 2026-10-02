// Automatically preserve WebGL drawing buffers so 3D canvases, shaders, and animations
// can be rasterized and imported into Figma without buffer clearing or blank images.
(function() {
  try {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attribs) {
      if (type && typeof type === 'string' && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
        attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
      }
      return origGetContext.call(this, type, attribs);
    };
  } catch (e) {}
})();
