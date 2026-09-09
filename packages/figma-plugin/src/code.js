
figma.showUI(__html__, { width: 360, height: 480, themeColors: true });


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

  let m;
  // rgb/rgba (legacy and space-separated: rgb(255 255 255 / 0.8) or rgba(255, 255, 255, 0.8))
  m = css.match(/^rgba?\(\s*([\d.]+)(%?)[,%\s]+([\d.]+)(%?)[,%\s]+([\d.]+)(%?)(?:[,/\s]+([\d.]+)[%]?\s*)?\)$/);
  if (m) {
    const r = m[2] ? clamp01(+m[1] / 100) : clamp01(+m[1] / 255);
    const g = m[4] ? clamp01(+m[3] / 100) : clamp01(+m[3] / 255);
    const b = m[6] ? clamp01(+m[5] / 100) : clamp01(+m[5] / 255);
    return { r, g, b, a: m[7] !== undefined ? clamp01(+m[7]) : 1 };
  }

  // hsl/hsla
  m = css.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,%\s]+([\d.]+)%?[,%\s]+([\d.]+)%?(?:[,/\s]+([\d.]+)[%]?\s*)?\)$/);
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const a = m[4] !== undefined ? +m[4] : 1;
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
    }
    return { r, g, b, a };
  }

  // hex (#fff, #ffffff, #ffffff80)
  m = css.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3) return { r: parseInt(h[0] + h[0], 16) / 255, g: parseInt(h[1] + h[1], 16) / 255, b: parseInt(h[2] + h[2], 16) / 255, a: 1 };
    if (h.length === 4) return { r: parseInt(h[0] + h[0], 16) / 255, g: parseInt(h[1] + h[1], 16) / 255, b: parseInt(h[2] + h[2], 16) / 255, a: parseInt(h[3] + h[3], 16) / 255 };
    if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
    if (h.length === 8) return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: parseInt(h.slice(6, 8), 16) / 255 };
  }

  // color(display-p3 r g b)
  m = css.match(/^color\([^ ]+\s+([\d.-]+)[,%\s]+([\d.-]+)[,%\s]+([\d.-]+)(?:[,/\s]+([\d.-]+)[%]?\s*)?\)$/);
  if (m) return { r: +m[1] > 1 ? clamp01(+m[1] / 255) : clamp01(+m[1]), g: +m[2] > 1 ? clamp01(+m[2] / 255) : clamp01(+m[2]), b: +m[3] > 1 ? clamp01(+m[3] / 255) : clamp01(+m[3]), a: m[4] !== undefined ? clamp01(+m[4]) : 1 };

  // oklch/oklab/lab/lch extraction fallback (extracts lightness/grey approximation to prevent completely dropping the color)
  m = css.match(/^(?:oklch|oklab|lab|lch)\(\s*([\d.-]+)%?\s+([\d.-]+)%?\s+([\d.-]+)%?(?:\s*\/\s*([\d.-]+)%?)?\s*\)$/);
  if (m) {
    let l = parseFloat(m[1]);
    if (css.includes('ok') || css.includes('%')) {
      if (l > 1) l = l / 100; // oklab/oklch L is usually 0-1, but sometimes 0-100%
    } else {
      l = l / 100; // lab/lch L is 0-100
    }
    return { r: clamp01(l), g: clamp01(l), b: clamp01(l), a: m[4] !== undefined ? clamp01(+m[4]) : 1 };
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
  '100': ['Thin'],
  '200': ['Extra Light', 'ExtraLight', 'UltraLight'],
  '300': ['Light'],
  '400': ['Regular', 'Normal'],
  '500': ['Medium'],
  '600': ['Semi Bold', 'SemiBold', 'DemiBold'],
  '700': ['Bold'],
  '800': ['Extra Bold', 'ExtraBold', 'UltraBold'],
  '900': ['Black', 'Heavy'],
  'normal': ['Regular', 'Normal'],
  'bold': ['Bold'],
  'bolder': ['Extra Bold', 'ExtraBold', 'UltraBold'],
  'lighter': ['Light']
};

async function loadFont(family, weight, italic) {
  const cleanFamily = (family || 'Inter').replace(/['"]/g, '').split(',')[0].trim();
  const weightKey = weight ? String(weight).toLowerCase() : '400';
  const styleNames = FONT_WEIGHT_MAP[weightKey] || ['Regular'];

  const candidates = [];
  
  // Font Awesome Special Handling
  if (cleanFamily.toLowerCase().includes('font awesome')) {
    if (cleanFamily.toLowerCase().includes('brands')) {
      candidates.push({ family: cleanFamily, style: 'Regular' });
    } else {
      const isSolid = weightKey === '900' || weightKey === 'bold' || weightKey === 'bolder';
      candidates.push({ family: cleanFamily, style: isSolid ? 'Solid' : 'Regular' });
      candidates.push({ family: cleanFamily, style: isSolid ? 'Regular' : 'Solid' }); // ultimate fa fallback
    }
    // Also try without version numbers if they fail
    candidates.push({ family: 'Font Awesome 5 Free', style: 'Solid' });
    candidates.push({ family: 'Font Awesome 5 Free', style: 'Regular' });
    candidates.push({ family: 'Font Awesome 6 Free', style: 'Solid' });
    candidates.push({ family: 'Font Awesome 5 Brands', style: 'Regular' });
  }

  // 1. Try exact family with all weight variations
  for (const style of styleNames) {
    candidates.push({ family: cleanFamily, style: style + (italic ? ' Italic' : '') });
    if (italic) candidates.push({ family: cleanFamily, style: style + 'Italic' });
  }
  
  // 2. Try exact family with Regular/Italic fallback
  candidates.push({ family: cleanFamily, style: italic ? 'Italic' : 'Regular' });
  
  // 3. Try Inter with all weight variations
  for (const style of styleNames) {
    candidates.push({ family: 'Inter', style: style + (italic ? ' Italic' : '') });
  }
  
  // 4. Ultimate fallbacks
  candidates.push({ family: 'Inter', style: 'Regular' });
  candidates.push({ family: 'Roboto', style: 'Regular' });

  for (const font of candidates) {
    try {
      await figma.loadFontAsync(font);
      return font;
    } catch {}
  }
  return { family: 'Inter', style: 'Regular' };
}

function splitByTopLevelCommas(str) {
  if (!str) return [];
  let result = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function parseLinearGradient(css) {
  if (!css || !css.includes('linear-gradient(')) return null;
  try {
    const start = css.indexOf('linear-gradient(');
    if (start === -1) return null;
    let depth = 0;
    let inner = '';
    for (let i = start + 15; i < css.length; i++) {
      if (css[i] === '(') depth++;
      else if (css[i] === ')') {
        depth--;
        if (depth === 0) {
          inner = css.substring(start + 16, i).trim();
          break;
        }
      }
    }
    if (!inner) return null;

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
    const rawStops = splitByTopLevelCommas(stopsStr);
    if (!rawStops || rawStops.length === 0) return null;

    const stops = [];
    const n = rawStops.length;
    let maxPos = 0;

    rawStops.forEach((raw, i) => {
      const trimmed = raw.trim();
      const posMatch = trimmed.match(/(.*?)\s+([\d.]+)%$/);
      let colStr = trimmed;
      let pos = n > 1 ? (i / (n - 1)) : i;

      if (posMatch) {
        colStr = posMatch[1].trim();
        pos = parseFloat(posMatch[2]) / 100;
      }

      // CSS Rule: If a color stop's position is less than the specified position 
      // of any stop before it, set its position to the largest position before it.
      pos = Math.max(pos, maxPos);
      maxPos = pos;

      const col = parseColor(colStr);
      if (col) {
        stops.push({
          position: clamp01(pos),
          color: { r: col.r, g: col.g, b: col.b, a: clamp01(col.a) }
        });
      }
    });

    if (stops.length === 0) return null;
    if (stops.length === 1) {
      stops.push({ position: 1, color: { ...stops[0].color } });
    }

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
async function applyFills(node, styles, assets, nodeW, nodeH) {
  const fills = [];
  const isTextClip = styles.backgroundClip === 'text' || styles.webkitBackgroundClip === 'text';

  let isZeroSize = false;
  if (!isTextClip) {
    // Background color
    const bg = parseColor(styles.backgroundColor);
    if (bg && bg.a > 0.005) {
      fills.push({ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: clamp01(bg.a) });
    }

    // Check if background is intentionally hidden via size 0 (e.g., collapsed hover effects)
    const bgSize = (styles.backgroundSize || '').trim();
    if (bgSize && bgSize !== 'auto' && bgSize !== 'cover' && bgSize !== 'contain') {
      const parts = bgSize.split(/\s+/);
      const w = parseFloat(parts[0]);
      const h = parts.length > 1 ? parseFloat(parts[1]) : w; // if only 1 value, height is auto (but sometimes treated as same for 0)
      if (w === 0 || h === 0) isZeroSize = true;
    }
  }

  // Parse images first so they are at the bottom of the fill stack
  const combinedImages = [
    (!isTextClip && !(styles.backgroundSize === '0px') ? styles.backgroundImage : ''),
    styles.maskImage,
    styles.webkitMaskImage
  ].filter(Boolean).join(' ');

  if (combinedImages.includes('url(')) {
    const matches = Array.from(combinedImages.matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g)).reverse();
    for (const match of matches) {
      const imgUrl = match[1]?.trim();
      if (!imgUrl) continue;
      
      let blobObj;
      if (imgUrl.startsWith('data:')) {
        blobObj = imgUrl;
      } else {
        let assetData = assets?.[imgUrl];
        if (!assetData && imgUrl) {
          const filename = imgUrl.split('/').pop()?.split('?')[0];
          if (filename && assets) {
            for (const key of Object.keys(assets)) {
              if (key.includes(filename)) {
                assetData = assets[key];
                break;
              }
            }
          }
        }
        blobObj = assetData?.blob || assetData?.base64Blob || assetData;
      }

      if (blobObj) {
        const bytes = decodeBase64Image(blobObj);
        if (bytes) {
          try {
            const img = figma.createImage(bytes);
            
            const bgSize = (styles.backgroundSize || 'auto').trim();
            const posX = (styles.backgroundPositionX || '0%').trim();
            const posY = (styles.backgroundPositionY || '0%').trim();
            
            if (bgSize !== 'auto' || posX !== '0%' || posY !== '0%') {
              const size = await img.getSizeAsync();
              let imgW = size.width;
              let imgH = size.height;
              
              if (bgSize === 'contain' || bgSize === 'cover') {
                fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: bgSize === 'contain' ? 'FIT' : 'FILL' });
              } else {
                try {
                  const parts = bgSize.split(' ');
                  let wStr = parts[0];
                  let hStr = parts.length > 1 ? parts[1] : wStr;
                  
                  // Convert percentages to pixels based on node size
                  if (wStr.endsWith('%')) imgW = nodeW * (parseFloat(wStr) / 100);
                  else if (wStr.endsWith('px')) imgW = parseFloat(wStr);
                  
                  if (hStr === 'auto') {
                    imgH = imgW * (size.height / size.width);
                  } else if (hStr.endsWith('%')) {
                    imgH = nodeH * (parseFloat(hStr) / 100);
                  } else if (hStr.endsWith('px')) {
                    imgH = parseFloat(hStr);
                  }
                  
                  // Calculate position offsets
                  let ox = 0, oy = 0;
                  if (posX.endsWith('%')) ox = (nodeW - imgW) * (parseFloat(posX) / 100);
                  else if (posX.endsWith('px')) ox = parseFloat(posX);
                  
                  if (posY.endsWith('%')) oy = (nodeH - imgH) * (parseFloat(posY) / 100);
                  else if (posY.endsWith('px')) oy = parseFloat(posY);
                  
                  if (!isFinite(imgW) || !isFinite(imgH) || !isFinite(ox) || !isFinite(oy) || nodeW === 0 || nodeH === 0) {
                    throw new Error('Invalid transform parameters');
                  }

                  const transform = [
                    [imgW / nodeW, 0, ox / nodeW],
                    [0, imgH / nodeH, oy / nodeH]
                  ];
                  fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'CROP', imageTransform: transform });
                } catch (err) {
                  // Fallback to FILL if transform math fails (e.g. division by zero or NaN)
                  fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' });
                }
              }
            } else {
              fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' });
            }
          } catch (e) {
            figma.notify(`Failed to create image: ${e.message}`, { error: true });
          }
        } else {
          figma.notify(`Failed to decode base64 for image: ${imgUrl}`, { error: true });
        }
      } else {
        figma.notify(`Asset not found in payload: ${imgUrl}`, { error: true });
      }
    }
  }

  if (!isTextClip && !isZeroSize) {
    // CSS Gradients go ON TOP of background images in Figma
    if (styles.backgroundImage && styles.backgroundImage.includes('gradient')) {
      const bgs = splitByTopLevelCommas(styles.backgroundImage);
      for (const bg of bgs) {
        if (bg.includes('linear-gradient')) {
          const grad = parseLinearGradient(bg);
          if (grad) {
            fills.push(grad);
            continue;
          }
        }
        // Fallback: If gradient parsing fails (e.g. radial/conic), extract the first valid color and use as solid fill
        const firstColorMatch = bg.match(/(?:rgba?|hsla?|color)\([^)]+\)|#[0-9a-f]{3,8}|\b(?:transparent|black|white|red|green|blue)\b/i);
        if (firstColorMatch) {
          const fallbackBg = parseColor(firstColorMatch[0]);
          if (fallbackBg && fallbackBg.a > 0.005) {
            fills.push({ type: 'SOLID', color: { r: fallbackBg.r, g: fallbackBg.g, b: fallbackBg.b }, opacity: clamp01(fallbackBg.a) });
          }
        }
      }
    }
  }

  if (fills.length > 0) node.fills = fills;
  else if (node.type === 'FRAME') node.fills = [];
}

function applyStrokes(node, styles) {
  const topW = (styles.borderTopStyle && styles.borderTopStyle !== 'none' && styles.borderTopStyle !== 'hidden') ? (parseFloat(styles.borderTopWidth) || 0) : 0;
  const rightW = (styles.borderRightStyle && styles.borderRightStyle !== 'none' && styles.borderRightStyle !== 'hidden') ? (parseFloat(styles.borderRightWidth) || 0) : 0;
  const bottomW = (styles.borderBottomStyle && styles.borderBottomStyle !== 'none' && styles.borderBottomStyle !== 'hidden') ? (parseFloat(styles.borderBottomWidth) || 0) : 0;
  const leftW = (styles.borderLeftStyle && styles.borderLeftStyle !== 'none' && styles.borderLeftStyle !== 'hidden') ? (parseFloat(styles.borderLeftWidth) || 0) : 0;

  const totalBorder = topW + rightW + bottomW + leftW;
  if (totalBorder <= 0) return;

  const borderColor = parseColor(
    (topW > 0 && styles.borderTopColor) ||
    (bottomW > 0 && styles.borderBottomColor) ||
    (leftW > 0 && styles.borderLeftColor) ||
    (rightW > 0 && styles.borderRightColor) ||
    styles.borderColor
  );
  if (!borderColor || borderColor.a <= 0.005) return;

  const strokeColor = {
    type: 'SOLID',
    color: { r: borderColor.r, g: borderColor.g, b: borderColor.b },
    opacity: clamp01(borderColor.a)
  };

  node.strokes = [strokeColor];
  node.strokeAlign = 'INSIDE';

  if (topW === rightW && rightW === bottomW && bottomW === leftW) {
    node.strokeWeight = topW;
  } else {
    try {
      node.strokeTopWeight = topW;
      node.strokeRightWeight = rightW;
      node.strokeBottomWeight = bottomW;
      node.strokeLeftWeight = leftW;
    } catch {
      node.strokeWeight = Math.max(topW, rightW, bottomW, leftW);
    }
  }

  const borderStyle = (topW > 0 && styles.borderTopStyle) ||
                      (bottomW > 0 && styles.borderBottomStyle) ||
                      (leftW > 0 && styles.borderLeftStyle) ||
                      (rightW > 0 && styles.borderRightStyle) ||
                      styles.borderStyle;

  if (borderStyle === 'dashed') {
    const weight = Math.max(topW, rightW, bottomW, leftW) || 1;
    node.dashPattern = [weight * 3, weight * 3];
  } else if (borderStyle === 'dotted') {
    const weight = Math.max(topW, rightW, bottomW, leftW) || 1;
    node.dashPattern = [weight, weight * 2];
    node.strokeCap = 'ROUND';
  }
}

function applyEffects(node, styles) {
  const effects = [];

  if (styles.boxShadow && styles.boxShadow !== 'none') {
    const shadowEffects = parseBoxShadows(styles.boxShadow);
    effects.push(...shadowEffects);
  }

  const bdrop = styles.backdropFilter || styles.webkitBackdropFilter || '';
  if (bdrop.includes('blur')) {
    const m = bdrop.match(/blur\(([\d.]+)px\)/);
    if (m) effects.push({ type: 'BACKGROUND_BLUR', radius: parseFloat(m[1]), visible: true });
  }

  const filter = styles.filter || styles.webkitFilter || '';
  if (filter.includes('blur')) {
    const m = filter.match(/blur\(([\d.]+)px\)/);
    if (m) effects.push({ type: 'LAYER_BLUR', radius: parseFloat(m[1]), visible: true });
  }

  if (effects.length > 0) node.effects = effects;
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

function invertHex(hex) {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  if (c.length !== 6) return hex;
  const num = parseInt(c, 16);
  if (isNaN(num)) return hex;
  const invertedNum = 0xFFFFFF - num;
  return '#' + invertedNum.toString(16).padStart(6, '0');
}

function invertSingleColor(val) {
  if (!val) return val;
  const trimmed = val.trim();
  if (trimmed === 'none' || trimmed === 'transparent' || trimmed.startsWith('url(')) {
    return trimmed;
  }
  if (trimmed.toLowerCase() === 'black') return '#ffffff';
  if (trimmed.toLowerCase() === 'white') return '#000000';

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return invertHex(trimmed);
  }

  const m = trimmed.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i);
  if (m) {
    const r = 255 - Math.round(parseFloat(m[1]));
    const g = 255 - Math.round(parseFloat(m[2]));
    const b = 255 - Math.round(parseFloat(m[3]));
    const hexR = Math.max(0, Math.min(255, r)).toString(16).padStart(2, '0');
    const hexG = Math.max(0, Math.min(255, g)).toString(16).padStart(2, '0');
    const hexB = Math.max(0, Math.min(255, b)).toString(16).padStart(2, '0');
    return `#${hexR}${hexG}${hexB}`;
  }
  return trimmed;
}

function invertSvgColors(svgString) {
  if (!svgString) return svgString;
  let res = svgString;

  // 1. Ensure shapes without fill/stroke get default fill="#000000" so they invert to #ffffff
  res = res.replace(/<(path|circle|rect|polygon|polyline|ellipse)\b([^>]*?)(\/?>)/gi, (m, tag, attrs, close) => {
    if (!/\b(fill|stroke)\s*=/i.test(attrs) && !/\bstyle\s*=\s*["'][^"']*\b(fill|stroke)\b/i.test(attrs)) {
      return `<${tag}${attrs} fill="#000000"${close}`;
    }
    return m;
  });

  // 2. Invert colors in presentation attributes: fill, stroke, stop-color, flood-color, color
  res = res.replace(/\b(fill|stroke|stop-color|flood-color|color)\s*=\s*(["'])([^"']+)\2/gi, (match, attr, quote, val) => {
    const inverted = invertSingleColor(val);
    return `${attr}=${quote}${inverted}${quote}`;
  });

  // 3. Invert colors inside style attributes: style="..."
  res = res.replace(/\bstyle\s*=\s*(["'])([^"']+)\1/gi, (match, quote, styleContent) => {
    const invertedStyle = styleContent.replace(/\b(fill|stroke|stop-color|flood-color|color)\s*:\s*([^;"]+)/gi, (m, prop, val) => {
      return `${prop}: ${invertSingleColor(val)}`;
    });
    return `style=${quote}${invertedStyle}${quote}`;
  });

  return res;
}

function hasInvertFilter(filterStr) {
  if (!filterStr || typeof filterStr !== 'string') return false;
  if (!filterStr.includes('invert')) return false;
  const m = filterStr.match(/invert\s*\(\s*([\d.]+%?)\s*\)/i);
  if (!m) return true;
  const val = m[1];
  const num = val.endsWith('%') ? parseFloat(val) / 100 : parseFloat(val);
  return isNaN(num) || num > 0.4;
}

function prepareSvgString(svgString, isInverted) {
  if (!svgString) return '';
  let clean = svgString;
  // Strip scripts
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Sanitize rgba(...) inside attributes or inline styles
  clean = clean.replace(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/gi, (m, r, g, b, a) => {
    const hexR = Math.round(parseFloat(r)).toString(16).padStart(2, '0');
    const hexG = Math.round(parseFloat(g)).toString(16).padStart(2, '0');
    const hexB = Math.round(parseFloat(b)).toString(16).padStart(2, '0');
    return `#${hexR}${hexG}${hexB}`;
  });
  // Ensure xmlns is present on <svg>
  if (!clean.includes('xmlns=')) {
    clean = clean.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  // Invert colors if CSS filter has invert: inverted hex = 0xFFFFFF - original hex
  if (isInverted) {
    clean = invertSvgColors(clean);
  }
  return clean;
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
      const cleanSvg = prepareSvgString(sNode.content, hasInvertFilter(s.filter));
      const svgNode = figma.createNodeFromSvg(cleanSvg);
      svgNode.name = (sNode.tag || 'node').toLowerCase();
      parentFrame.appendChild(svgNode);
      svgNode.x = x; svgNode.y = y;
      if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
        try { svgNode.resize(w, h); } catch {}
      }
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
    let blobObj;
    if (imgUrl && imgUrl.startsWith('data:')) {
      blobObj = imgUrl;
    } else {
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
      blobObj = assetData?.blob || assetData?.base64Blob || assetData;
    }
    
    if (blobObj) {
      const bytes = decodeBase64Image(blobObj);
      if (bytes) {
        try {
          const header = String.fromCharCode.apply(null, bytes.slice(0, 100)).toLowerCase();
          if (header.includes('<svg') || header.includes('<?xml')) {
            let svgString = '';
            if (typeof TextDecoder !== 'undefined') {
              svgString = new TextDecoder('utf-8').decode(bytes);
            } else {
              for (let i = 0; i < bytes.length; i++) {
                svgString += String.fromCharCode(bytes[i]);
              }
            }
            const cleanSvg = prepareSvgString(svgString, hasInvertFilter(s.filter));
            const svgNode = figma.createNodeFromSvg(cleanSvg);
            svgNode.name = sNode.attributes?.alt || 'img-svg';
            parentFrame.appendChild(svgNode);
            svgNode.x = x; svgNode.y = y;
            if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
              try { svgNode.resize(w, h); } catch {}
            }
            applyOpacity(svgNode, s);
            reportProgress();
            return;
          }

          const rect = figma.createRectangle();
          rect.name = sNode.attributes?.alt || 'img';
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
          const header = String.fromCharCode.apply(null, bytes.slice(0, 100)).toLowerCase();
          if (header.includes('<svg') || header.includes('<?xml')) {
            let svgString = '';
            if (typeof TextDecoder !== 'undefined') {
              svgString = new TextDecoder('utf-8').decode(bytes);
            } else {
              for (let i = 0; i < bytes.length; i++) {
                svgString += String.fromCharCode(bytes[i]);
              }
            }
            const cleanSvg = prepareSvgString(svgString, hasInvertFilter(s.filter));
            const svgNode = figma.createNodeFromSvg(cleanSvg);
            svgNode.name = (sNode.tag || 'node').toLowerCase();
            parentFrame.appendChild(svgNode);
            svgNode.x = x; svgNode.y = y;
            if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
              try { svgNode.resize(w, h); } catch {}
            }
            applyOpacity(svgNode, s);
            reportProgress();
            return;
          }

          const rect = figma.createRectangle();
          rect.name = (sNode.tag || 'node').toLowerCase();
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
  frame.name = (sNode.tag || 'node').toLowerCase() + (sNode.attributes?.id ? `#${sNode.attributes.id}` : '');
  parentFrame.appendChild(frame);
  frame.x = x;
  frame.y = y;

  let rectW = w;
  let rectH = h;

  // Apply CSS transform rotation or vertical writing mode (e.g. rotated ribbons, badges, vertical scroll text)
  let angleDeg = 0;
  if (s.transform && s.transform.includes('matrix')) {
    const parts = s.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (parts) {
      const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
      let a = vals[0], b = vals[1];
      angleDeg = Math.atan2(b, a) * (180 / Math.PI);
    }
  } else if (s.writingMode && (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr')) {
    angleDeg = 90;
  }

  if (Math.abs(angleDeg) > 0.1) {
    const rotDeg = -angleDeg; // Figma rotation is negative of CSS
    const rotRad = rotDeg * (Math.PI / 180);
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);

    if (Math.abs(sin) > Math.abs(cos)) {
      rectW = h;
      rectH = w;
    }

    // Exact axis-aligned bounding box calculation relative to local origin
    const x0 = 0, y0 = 0;
    const x1 = rectW * cos, y1 = rectW * sin;
    const x2 = -rectH * sin, y2 = rectH * cos;
    const x3 = x1 + x2, y3 = y1 + y2;

    const minX = Math.min(x0, x1, x2, x3);
    const minY = Math.min(y0, y1, y2, y3);

    frame.x = x - minX;
    frame.y = y - minY;
    frame.rotation = rotDeg;
  }

  frame.resize(rectW, rectH);
  frame.clipsContent = (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflow === 'clip' || s.overflowX === 'clip');

  await applyFills(frame, s, assets, rectW, rectH);
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

  const dec = (s.textDecorationLine || s.textDecoration || '').toLowerCase();
  if (dec.includes('underline')) {
    try { textNode.textDecoration = 'UNDERLINE'; } catch {}
  } else if (dec.includes('line-through')) {
    try { textNode.textDecoration = 'STRIKETHROUGH'; } catch {}
  }

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

  const isTextClip = s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text';
  if (isTextClip) {
    const textFills = [];
    const bg = parseColor(s.backgroundColor);
    if (bg && bg.a > 0.005) textFills.push({ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: clamp01(bg.a) });
    if (s.backgroundImage && s.backgroundImage.includes('gradient')) {
      const grad = parseLinearGradient(s.backgroundImage);
      if (grad) textFills.push(grad);
    }
    
    if (textFills.length > 0) {
      textNode.fills = textFills;
    } else {
      const color = parseColor(s.webkitTextFillColor || s.color || '#000000');
      if (color) textNode.fills = [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: clamp01(color.a) }];
    }
  } else {
    const color = parseColor(s.webkitTextFillColor || s.color || '#000000');
    if (color) {
      textNode.fills = [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: clamp01(color.a) }];
    }
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


  if (sNode.id && sNode.id.includes('input-text') && w > 0 && h > 0) {
    try {
      textNode.textAutoResize = 'TRUNCATE';
    } catch {
      textNode.textAutoResize = 'NONE';
    }
    textNode.resize(Math.ceil(w), Math.ceil(h));
    textNode.textAlignVertical = 'CENTER';
  } else if (isMultiLine && w > 0) {
    textNode.textAutoResize = 'HEIGHT';
    textNode.resize(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  } else {
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
    // When using WIDTH_AND_HEIGHT, Figma sizes the node exactly to its own font rendering width.
    // If this differs from the browser's bounding box `w`, center/right aligned text will be misaligned.
    // We compensate by shifting `x` so the text remains correctly aligned within the browser's original `w`.
    if (w > 0) {
      if (s.textAlign === 'center') {
        textNode.x = posX + (w - textNode.width) / 2;
      } else if (s.textAlign === 'right' || s.textAlign === 'end') {
        textNode.x = posX + (w - textNode.width);
      }
    }
  }

  // Apply rotation directly to textNode if parentFrame is not already rotated
  let textAngleDeg = 0;
  if (s.transform && s.transform.includes('matrix')) {
    const parts = s.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (parts) {
      const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
      let a = vals[0], b = vals[1];
      textAngleDeg = Math.atan2(b, a) * (180 / Math.PI);
    }
  } else if (s.rotate && s.rotate !== 'none') {
    const r = s.rotate.trim().toLowerCase();
    if (r.includes('deg')) textAngleDeg = parseFloat(r);
    else if (r.includes('rad')) textAngleDeg = (parseFloat(r) * 180) / Math.PI;
    else if (r.includes('turn')) textAngleDeg = parseFloat(r) * 360;
  } else if (s.writingMode && (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr')) {
    textAngleDeg = 90;
  }

  if (Math.abs(textAngleDeg) > 0.1 && Math.abs(parentFrame.rotation || 0) < 0.1) {
    const rotDeg = -textAngleDeg;
    textNode.rotation = rotDeg;
    if (rotDeg === -90) {
      textNode.y = posY + textNode.width;
    } else if (rotDeg === 90) {
      textNode.x = posX + textNode.height;
    } else {
      const rotRad = rotDeg * (Math.PI / 180);
      const cos = Math.cos(rotRad);
      const sin = Math.sin(rotRad);
      const w0 = textNode.width;
      const h0 = textNode.height;
      const x1 = w0 * cos, y1 = w0 * sin;
      const x2 = -h0 * sin, y2 = h0 * cos;
      const minX = Math.min(0, x1, x2, x1 + x2);
      const minY = Math.min(0, y1, y2, y1 + y2);
      textNode.x = posX - minX;
      textNode.y = posY - minY;
    }
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
    await applyFills(rootFrame, data.root.styles, data.assets, dw, dh);
    // Ensure the root frame has a solid fill at the bottom so the Figma canvas doesn't bleed through
    const hasSolidFill = rootFrame.fills && rootFrame.fills.some(f => f.type === 'SOLID' && f.opacity > 0.05);
    if (!hasSolidFill) {
      rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, ...(rootFrame.fills || [])];
    }
  } else {
    rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  }
  rootFrame.clipsContent = true;

  figma.currentPage.appendChild(rootFrame);

  if (data.root?.childNodes) {
    for (const child of data.root.childNodes) {
      await renderNode(child, rootFrame, 0, 0, data.assets, data.root.styles);
    }
  } else if (data.root) {
    await renderNode(data.root, rootFrame, 0, 0, data.assets, data.root.styles);
  }

  // Adjust root frame width as requested by user
  if (rootFrame.width > 16) {
    rootFrame.resize(rootFrame.width - 16, rootFrame.height);
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
