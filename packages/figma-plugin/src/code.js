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
  if (!css || css === 'none' || css === 'initial' || css === 'inherit' || css === 'transparent') return null;
  css = css.trim().toLowerCase();
  if (NAMED_COLORS[css]) return { ...NAMED_COLORS[css] };

  // rgb/rgba
  let m = css.match(/^rgba?\(\s*([\d.]+)[,%\s]+([\d.]+)[,%\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/);
  if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] !== undefined ? +m[4] : 1 };

  // hsl/hsla
  m = css.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,%\s]+([\d.]+)%[,%\s]+([\d.]+)%(?:[,/\s]+([\d.]+))?\s*\)$/);
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const a = m[4] !== undefined ? +m[4] : 1;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r, g, b, a };
  }

  // hex (#fff, #ffffff, #ffffff80)
  m = css.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3) return { r: parseInt(h[0] + h[0], 16) / 255, g: parseInt(h[1] + h[1], 16) / 255, b: parseInt(h[2] + h[2], 16) / 255, a: 1 };
    if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
    if (h.length === 8) return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: parseInt(h.slice(6, 8), 16) / 255 };
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

function parseLinearGradient(css) {
  if (!css || !css.includes('linear-gradient')) return null;
  try {
    const contentMatch = css.match(/linear-gradient\((.*)\)$/s);
    if (!contentMatch) return null;
    const inner = contentMatch[1].trim();

    // Determine angle
    let angleDeg = 180;
    let stopsStr = inner;

    const angleMatch = inner.match(/^((?:to\s+(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?)|(?:-?[\d.]+(?:deg|rad|turn)))\s*,\s*(.*)$/is);
    if (angleMatch) {
      const angleExpr = angleMatch[1].toLowerCase().trim();
      stopsStr = angleMatch[2];

      if (angleExpr.includes('deg')) {
        angleDeg = parseFloat(angleExpr);
      } else if (angleExpr.includes('rad')) {
        angleDeg = (parseFloat(angleExpr) * 180) / Math.PI;
      } else if (angleExpr.includes('turn')) {
        angleDeg = parseFloat(angleExpr) * 360;
      } else if (angleExpr === 'to top') angleDeg = 0;
      else if (angleExpr === 'to right') angleDeg = 90;
      else if (angleExpr === 'to bottom') angleDeg = 180;
      else if (angleExpr === 'to left') angleDeg = 270;
      else if (angleExpr === 'to top right' || angleExpr === 'to right top') angleDeg = 45;
      else if (angleExpr === 'to bottom right' || angleExpr === 'to right bottom') angleDeg = 135;
      else if (angleExpr === 'to bottom left' || angleExpr === 'to left bottom') angleDeg = 225;
      else if (angleExpr === 'to top left' || angleExpr === 'to left top') angleDeg = 315;
    }

    // Split stops safely
    const rawStops = stopsStr.split(/,(?![^(]*\))/);
    if (!rawStops || rawStops.length < 2) return null;

    const stops = [];
    const n = rawStops.length;
    rawStops.forEach((raw, i) => {
      const trimmed = raw.trim();
      const posMatch = trimmed.match(/(.*?)\s+([\d.]+)%$/);
      let colStr = trimmed;
      let pos = i / (n - 1);
      if (posMatch) {
        colStr = posMatch[1].trim();
        pos = parseFloat(posMatch[2]) / 100;
      }
      const col = parseColor(colStr);
      if (col) {
        stops.push({
          position: clamp01(pos),
          color: { r: col.r, g: col.g, b: col.b, a: clamp01(col.a) }
        });
      }
    });

    if (stops.length < 2) return null;

    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      type: 'GRADIENT_LINEAR',
      gradientTransform: [
        [cos, sin, 0.5 - 0.5 * (cos + sin)],
        [-sin, cos, 0.5 - 0.5 * (-sin + cos)]
      ],
      gradientStops: stops
    };
  } catch {
    return null;
  }
}

function parseBoxShadows(css) {
  if (!css || css === 'none' || css === 'initial' || css === 'inherit') return [];
  const effects = [];
  try {
    // Match each individual shadow
    const shadows = css.split(/,(?![^(]*\))/);
    for (const s of shadows) {
      const isInset = s.includes('inset');
      const clean = s.replace('inset', '').trim();
      const m = clean.match(/(.*?)\s*(-?[\d.]+px)\s+(-?[\d.]+px)(?:\s+([\d.]+px))?(?:\s+([\d.]+px))?/);
      if (m) {
        const col = parseColor(m[1]) || parseColor(clean.slice(clean.lastIndexOf(' ')).trim()) || { r: 0, g: 0, b: 0, a: 0.25 };
        const x = parseFloat(m[2]) || 0;
        const y = parseFloat(m[3]) || 0;
        const radius = parseFloat(m[4]) || 0;
        const spread = parseFloat(m[5]) || 0;
        effects.push({
          type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
          color: { r: col.r, g: col.g, b: col.b, a: clamp01(col.a) },
          offset: { x, y },
          radius,
          spread,
          visible: true,
          blendMode: 'NORMAL'
        });
      }
    }
  } catch {}
  return effects;
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

  // CSS Gradients
  if (styles.backgroundImage && styles.backgroundImage.includes('gradient')) {
    const grad = parseLinearGradient(styles.backgroundImage);
    if (grad) fills.push(grad);
  }

  // Background image fill
  if (styles.backgroundImage && styles.backgroundImage.includes('url(')) {
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
  else if (node.type === 'FRAME') node.fills = [];
}

function applyStrokes(node, styles) {
  const borderWidth = parseFloat(styles.borderTopWidth || styles.borderWidth || styles.borderLeftWidth) || 0;
  if (borderWidth <= 0) return;
  const borderColor = parseColor(styles.borderTopColor || styles.borderColor || styles.borderLeftColor);
  if (!borderColor || borderColor.a <= 0.005) return;

  node.strokes = [{
    type: 'SOLID',
    color: { r: borderColor.r, g: borderColor.g, b: borderColor.b },
    opacity: clamp01(borderColor.a)
  }];
  node.strokeWeight = borderWidth;
  node.strokeAlign = 'INSIDE';
}

function applyEffects(node, styles) {
  if (styles.boxShadow && styles.boxShadow !== 'none') {
    const effects = parseBoxShadows(styles.boxShadow);
    if (effects.length > 0) node.effects = effects;
  }
}

function applyCornerRadius(node, styles) {
  const tl = parseFloat(styles.borderTopLeftRadius || styles.borderRadius) || 0;
  const tr = parseFloat(styles.borderTopRightRadius || styles.borderRadius) || 0;
  const br = parseFloat(styles.borderBottomRightRadius || styles.borderRadius) || 0;
  const bl = parseFloat(styles.borderBottomLeftRadius || styles.borderRadius) || 0;

  if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
    if (tl === tr && tr === br && br === bl) {
      node.cornerRadius = tl;
    } else {
      node.topLeftRadius = tl;
      node.topRightRadius = tr;
      node.bottomRightRadius = br;
      node.bottomLeftRadius = bl;
    }
  }
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

  // SVG Vector element
  if (sNode.content && (sNode.tag === 'SVG' || sNode.content.includes('<svg'))) {
    try {
      let cleanSvg = sNode.content;
      // Strip potentially problematic script tags or broken entities inside SVG
      cleanSvg = cleanSvg.replace(/<script[\s\S]*?<\/script>/gi, '');
      const svgNode = figma.createNodeFromSvg(cleanSvg);
      svgNode.name = sNode.tag.toLowerCase();
      parentFrame.appendChild(svgNode);
      svgNode.x = x; svgNode.y = y;
      if (w > 0 && h > 0) svgNode.resize(w, h);
      applyOpacity(svgNode, s);
      reportProgress();
      return;
    } catch {
      // If strict vector parsing fails, fall through so it still creates a positioned frame container
    }
  }

  // IMG element
  if (sNode.tag === 'IMG') {
    const attrs = sNode.attributes || {};
    const imgUrl = attrs.currentSrc || attrs.src || attrs['data-src'] || attrs['data-lazy-src'] || attrs['data-original'];
    let assetData = null;
    if (assets) {
      assetData = (imgUrl && assets[imgUrl]) ||
                  (attrs.currentSrc && assets[attrs.currentSrc]) ||
                  (attrs.src && assets[attrs.src]) ||
                  (attrs['data-src'] && assets[attrs['data-src']]) ||
                  (attrs['data-lazy-src'] && assets[attrs['data-lazy-src']]);
      if (!assetData && imgUrl) {
        // Fallback: match by filename or partial URL
        const filename = imgUrl.split('/').pop()?.split('?')[0];
        if (filename) {
          for (const key of Object.keys(assets)) {
            if (key.includes(filename)) {
              assetData = assets[key];
              break;
            }
          }
        }
      }
    }
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
          applyStrokes(rect, s);
          applyEffects(rect, s);
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
          applyStrokes(rect, s);
          applyEffects(rect, s);
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
  applyStrokes(frame, s);
  applyEffects(frame, s);
  applyCornerRadius(frame, s);
  applyOpacity(frame, s);

  // If node itself has direct text (like pseudo elements with content: "Logo #3")
  if (sNode.text && sNode.text.trim()) {
    await renderTextNode(sNode, frame, sNode.rect?.x || 0, sNode.rect?.y || 0, s);
  }

  // Pseudo-element ::before (rendered inside this frame)
  if (sNode.pseudoElementNodes?.before) {
    await renderNode(sNode.pseudoElementNodes.before, frame, sNode.rect?.x || 0, sNode.rect?.y || 0, assets, s);
  }

  if (sNode.childNodes) {
    for (const child of sNode.childNodes) {
      // Child coordinate offset is relative to this frame
      await renderNode(child, frame, sNode.rect?.x || 0, sNode.rect?.y || 0, assets, s);
    }
  }

  // Pseudo-element ::after (rendered inside this frame)
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

  // Only apply lineHeight for multi-line text. For single-line text, the browser's
  // Range.getBoundingClientRect() gives tight glyph coordinates; adding lineHeight
  // in Figma would push glyphs down via half-leading, misaligning with adjacent icons.
  const isMultiLine = sNode.lineCount && sNode.lineCount > 1;
  if (isMultiLine && s.lineHeight && s.lineHeight !== 'normal') {
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
  applyOpacity(textNode, s);

  parentFrame.appendChild(textNode);
  const posX = (sNode.rect?.x || 0) - parentX;
  const posY = (sNode.rect?.y || 0) - parentY;

  textNode.x = posX;
  textNode.y = posY;

  const w = sNode.rect?.width || 0;
  const h = sNode.rect?.height || 0;
  const textStr = finalText.trim();

  // If short token/number/single line, let Figma compute exact natural bounds
  if ((!sNode.lineCount || sNode.lineCount <= 1) && (!textStr.includes('\n') || textStr.length < 40)) {
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
  } else if (w > 0 && h > 0) {
    // Fixed dimensions from browser — no re-wrapping to avoid overlap with inline elements
    textNode.textAutoResize = 'NONE';
    textNode.resize(Math.ceil(w), Math.ceil(h));
  } else {
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
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
  
  if (data.root?.styles) {
    applyFills(rootFrame, data.root.styles, data.assets);
    if (!rootFrame.fills || !rootFrame.fills.length) {
      rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    }
  } else {
    rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  }
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
