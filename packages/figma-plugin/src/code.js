/*
 * HTML 2 Fig — Plugin Canvas Renderer
 * Translates serialized DOM payloads into editable native Figma layers,
 * vector SVG nodes, high-fidelity typography, and image fills.
 */

figma.showUI(__html__, { width: 360, height: 480, themeColors: true });

/* ======================================================================
 *  1.  COLOR & GRADIENT PARSING
 * ====================================================================== */
const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 0.502, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 }
};

function parseColor(css) {
  if (!css || css === 'none' || css === 'initial' || css === 'inherit') return null;
  css = css.trim().toLowerCase();
  if (NAMED_COLORS[css]) return { ...NAMED_COLORS[css] };

  // rgb/rgba
  let m = css.match(/^rgba?\(\s*([\d.]+)[,%\s]+([\d.]+)[,%\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/);
  if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] !== undefined ? +m[4] : 1 };

  // hex
  m = css.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3) return { r: parseInt(h[0] + h[0], 16) / 255, g: parseInt(h[1] + h[1], 16) / 255, b: parseInt(h[2] + h[2], 16) / 255, a: 1 };
    if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
  }
  return null;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/* ======================================================================
 *  2.  BASE64 IMAGE DECODING
 * ====================================================================== */
function decodeBase64Image(base64Obj) {
  if (!base64Obj) return null;
  try {
    let dataStr = typeof base64Obj === 'string' ? base64Obj : (base64Obj.data || base64Obj.base64Blob || '');
    if (!dataStr) return null;
    const commaIdx = dataStr.indexOf(',');
    const raw = commaIdx >= 0 ? dataStr.slice(commaIdx + 1) : dataStr;
    return figma.base64Decode(raw.trim());
  } catch (e) {
    return null;
  }
}

/* ======================================================================
 *  3.  FONT LOADER WITH FALLBACK
 * ====================================================================== */
const FONT_WEIGHT_MAP = {
  '100': 'Thin', '200': 'ExtraLight', '300': 'Light',
  '400': 'Regular', '500': 'Medium', '600': 'SemiBold',
  '700': 'Bold', '800': 'ExtraBold', '900': 'Black'
};

async function loadFont(family, weight, italic) {
  const cleanFamily = (family || 'Inter').replace(/['"]/g, '').split(',')[0].trim();
  const styleName = (FONT_WEIGHT_MAP[weight] || 'Regular') + (italic ? ' Italic' : '');

  const candidates = [
    { family: cleanFamily, style: styleName },
    { family: cleanFamily, style: italic ? 'Italic' : 'Regular' },
    { family: 'Inter', style: styleName },
    { family: 'Inter', style: 'Regular' },
    { family: 'Roboto', style: 'Regular' }
  ];

  for (const font of candidates) {
    try {
      await figma.loadFontAsync(font);
      return font;
    } catch {}
  }
  return { family: 'Inter', style: 'Regular' };
}

/* ======================================================================
 *  4.  STYLE APPLIERS
 * ====================================================================== */
function applyFills(node, styles, assets) {
  const fills = [];

  // Background color
  const bg = parseColor(styles.backgroundColor);
  if (bg && bg.a > 0.005) {
    fills.push({ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: clamp01(bg.a) });
  }

  // Background image fill
  if (styles.backgroundImage && styles.backgroundImage !== 'none') {
    const m = styles.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    if (m && m[1]) {
      const asset = assets?.[m[1]];
      const blobObj = asset?.blob || asset?.base64Blob || asset;
      if (blobObj) {
        const bytes = decodeBase64Image(blobObj);
        if (bytes) {
          try {
            const img = figma.createImage(bytes);
            fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' });
          } catch {}
        }
      }
    }
  }

  if (fills.length > 0) node.fills = fills;
  else if (node.type === 'FRAME' && !styles.backgroundColor) node.fills = [];
}

function applyCornerRadius(node, styles) {
  const r = parseFloat(styles.borderRadius || styles.borderTopLeftRadius) || 0;
  if (r > 0) node.cornerRadius = r;
}

function applyOpacity(node, styles) {
  const op = parseFloat(styles.opacity);
  if (!isNaN(op) && op < 1) node.opacity = clamp01(op);
}

/* ======================================================================
 *  5.  NODE RENDERERS
 * ====================================================================== */
let totalNodes = 0;
let renderedNodes = 0;

function reportProgress(label) {
  renderedNodes++;
  const pct = totalNodes > 0 ? Math.round((renderedNodes / totalNodes) * 100) : 0;
  if (renderedNodes % 15 === 0 || renderedNodes === totalNodes) {
    figma.ui.postMessage({ type: 'progress', percent: pct, label: label || `Rendering... ${renderedNodes}/${totalNodes}` });
  }
}

async function renderNode(sNode, parentFrame, parentX, parentY, assets, inheritedStyles) {
  if (!sNode) return;

  if (sNode.nodeType === 3 /* TEXT */) {
    await renderTextNode(sNode, parentFrame, parentX, parentY, inheritedStyles);
    reportProgress();
    return;
  }

  const s = sNode.styles || inheritedStyles || {};
  const x = Math.round((sNode.rect?.x || 0) - parentX);
  const y = Math.round((sNode.rect?.y || 0) - parentY);
  const w = Math.max(1, Math.round(sNode.rect?.width || 0));
  const h = Math.max(1, Math.round(sNode.rect?.height || 0));

  // Pseudo-element ::before
  if (sNode.pseudoElementNodes?.before) {
    await renderNode(sNode.pseudoElementNodes.before, parentFrame, parentX, parentY, assets, s);
  }

  // SVG Vector element
  if (sNode.content && (sNode.tag === 'SVG' || sNode.content.includes('<svg'))) {
    try {
      const svgNode = figma.createNodeFromSvg(sNode.content);
      svgNode.name = sNode.tag.toLowerCase();
      parentFrame.appendChild(svgNode);
      svgNode.x = x; svgNode.y = y;
      if (w > 0 && h > 0) svgNode.resize(w, h);
      applyOpacity(svgNode, s);
      reportProgress();
      return;
    } catch {}
  }

  // IMG element
  if (sNode.tag === 'IMG') {
    const attrs = sNode.attributes || {};
    const imgUrl = attrs.currentSrc || attrs.src || attrs['data-src'];
    const assetData = imgUrl ? (assets?.[imgUrl] || assets?.[attrs.src]) : null;
    const blobObj = assetData?.blob || assetData?.base64Blob || assetData;
    if (blobObj) {
      const bytes = decodeBase64Image(blobObj);
      if (bytes) {
        try {
          const rect = figma.createRectangle();
          rect.name = 'img';
          parentFrame.appendChild(rect);
          rect.x = x; rect.y = y;
          rect.resize(w, h);
          const img = figma.createImage(bytes);
          rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
          applyCornerRadius(rect, s);
          applyOpacity(rect, s);
          reportProgress();
          return;
        } catch {}
      }
    }
  }

  // Canvas / Video placeholder element
  if (sNode.placeholderUrl) {
    const assetData = assets?.[sNode.placeholderUrl];
    const blobObj = assetData?.blob || assetData?.base64Blob || assetData;
    if (blobObj) {
      const bytes = decodeBase64Image(blobObj);
      if (bytes) {
        try {
          const rect = figma.createRectangle();
          rect.name = sNode.tag.toLowerCase();
          parentFrame.appendChild(rect);
          rect.x = x; rect.y = y;
          rect.resize(w, h);
          const img = figma.createImage(bytes);
          rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
          applyCornerRadius(rect, s);
          applyOpacity(rect, s);
          reportProgress();
          return;
        } catch {}
      }
    }
  }

  // Frame container
  const frame = figma.createFrame();
  frame.name = sNode.tag.toLowerCase() + (sNode.attributes?.id ? `#${sNode.attributes.id}` : '');
  parentFrame.appendChild(frame);
  frame.x = x;
  frame.y = y;
  frame.resize(w, h);
  frame.clipsContent = (s.overflow === 'hidden' || s.overflowX === 'hidden');

  applyFills(frame, s, assets);
  applyCornerRadius(frame, s);
  applyOpacity(frame, s);

  if (sNode.childNodes) {
    for (const child of sNode.childNodes) {
      await renderNode(child, frame, sNode.rect?.x || 0, sNode.rect?.y || 0, assets, s);
    }
  }

  // Pseudo-element ::after
  if (sNode.pseudoElementNodes?.after) {
    await renderNode(sNode.pseudoElementNodes.after, frame, sNode.rect?.x || 0, sNode.rect?.y || 0, assets, s);
  }

  reportProgress();
}

async function renderTextNode(sNode, parentFrame, parentX, parentY, inheritedStyles) {
  const text = (sNode.text || '').trim();
  if (!text) return;

  const s = sNode.styles || inheritedStyles || parentFrame.styles || {};
  const textNode = figma.createText();

  const fontName = await loadFont(s.fontFamily, s.fontWeight || '400', s.fontStyle === 'italic');
  textNode.fontName = fontName;

  let finalText = text;
  if (s.textTransform === 'uppercase') finalText = text.toUpperCase();
  else if (s.textTransform === 'lowercase') finalText = text.toLowerCase();
  textNode.characters = finalText;

  const fontSize = parseFloat(s.fontSize) || 16;
  textNode.fontSize = fontSize;

  if (s.lineHeight && s.lineHeight !== 'normal') {
    const lh = parseFloat(s.lineHeight);
    if (!isNaN(lh)) textNode.lineHeight = { value: lh, unit: 'PIXELS' };
  }

  if (s.letterSpacing && s.letterSpacing !== 'normal' && s.letterSpacing !== '0px') {
    const ls = parseFloat(s.letterSpacing);
    if (!isNaN(ls)) textNode.letterSpacing = { value: ls, unit: 'PIXELS' };
  }

  const alignMap = { 'left': 'LEFT', 'start': 'LEFT', 'center': 'CENTER', 'right': 'RIGHT', 'end': 'RIGHT', 'justify': 'JUSTIFIED' };
  textNode.textAlignHorizontal = alignMap[s.textAlign] || 'LEFT';

  const color = parseColor(s.webkitTextFillColor || s.color || '#000000');
  if (color) {
    textNode.fills = [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: clamp01(color.a) }];
  }

  parentFrame.appendChild(textNode);
  textNode.x = Math.round((sNode.rect?.x || 0) - parentX);
  textNode.y = Math.round((sNode.rect?.y || 0) - parentY);

  const w = sNode.rect?.width || 0;
  if (w > 0) {
    textNode.textAutoResize = 'NONE';
    textNode.resize(Math.ceil(w) + 4, Math.max(1, textNode.height));
    textNode.textAutoResize = 'HEIGHT';
  }
}

function countNodes(node) {
  if (!node) return 0;
  let c = 1;
  if (node.childNodes) for (const ch of node.childNodes) c += countNodes(ch);
  return c;
}

async function renderTree(data) {
  const startTime = Date.now();
  totalNodes = countNodes(data.root);
  renderedNodes = 0;

  const rootFrame = figma.createFrame();
  rootFrame.name = data.documentTitle || 'HTML 2 Fig Import';

  const dw = Math.round(data.documentRect?.width || data.viewportRect?.width || 1440);
  const dh = Math.round(data.documentRect?.height || data.viewportRect?.height || 900);
  rootFrame.resize(dw, dh);
  rootFrame.x = figma.viewport.center.x - dw / 2;
  rootFrame.y = figma.viewport.center.y - dh / 2;
  rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  rootFrame.clipsContent = false;

  figma.currentPage.appendChild(rootFrame);

  if (data.root?.childNodes) {
    for (const child of data.root.childNodes) {
      await renderNode(child, rootFrame, data.root.rect?.x || 0, data.root.rect?.y || 0, data.assets, data.root.styles);
    }
  }

  figma.currentPage.selection = [rootFrame];
  figma.viewport.scrollAndZoomIntoView([rootFrame]);

  figma.ui.postMessage({
    type: 'complete',
    duration: Date.now() - startTime
  });
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import' && msg.data) {
    try {
      await renderTree(msg.data);
    } catch (e) {
      figma.ui.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }
};
