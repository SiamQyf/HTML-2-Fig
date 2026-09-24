
figma.showUI(__html__, { width: 360, height: 480, themeColors: true });


const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 0.502, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 }
};

// Safe conversion of byte arrays to strings — avoids V8's 65534 argument limit
function bytesToString(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.slice(i, i + 8192);
    result += String.fromCharCode.apply(null, chunk);
  }
  return result;
}

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
    const meta = commaIdx >= 0 ? dataStr.slice(0, commaIdx).toLowerCase() : '';
    let raw = commaIdx >= 0 ? dataStr.slice(commaIdx + 1) : dataStr;

    // Check if it is explicitly base64 encoded
    if (meta.includes(';base64')) {
      return figma.base64Decode(raw.trim());
    }

    // Support UTF-8 or URL-encoded SVG/image data URIs
    if (meta.startsWith('data:') || raw.trim().startsWith('<svg') || raw.trim().startsWith('%3csvg')) {
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {}
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(decoded);
      }
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i) & 0xff;
      }
      return bytes;
    }

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

async function loadFont(family, weight, italic, fontStretch, visualDensity, visualStretch) {
  const familyRaw = (family || 'Inter').replace(/['"]/g, '');
  const fontList = familyRaw.split(',').map(f => f.trim());
  const cleanFamily = fontList[0];
  
  // 1. Determine the CSS weight key first
  const familyLower = cleanFamily.toLowerCase();
  let cssWeightKey = '400';
  if (familyLower.includes('thin') || familyLower.includes('hairline')) cssWeightKey = '100';
  else if (familyLower.includes('extra light') || familyLower.includes('extralight') || familyLower.includes('ultra light')) cssWeightKey = '200';
  else if (familyLower.includes('light')) cssWeightKey = '300';
  else if (familyLower.includes('medium')) cssWeightKey = '500';
  else if (familyLower.includes('semi bold') || familyLower.includes('semibold') || familyLower.includes('demi bold')) cssWeightKey = '600';
  else if (familyLower.includes('extra bold') || familyLower.includes('extrabold') || familyLower.includes('ultra bold')) cssWeightKey = '800';
  else if (familyLower.includes('bold')) cssWeightKey = '700';
  else if (familyLower.includes('black') || familyLower.includes('heavy')) cssWeightKey = '900';
  else cssWeightKey = weight ? String(weight).toLowerCase() : '400';

  // 2. Determine visual density weight key (used ONLY if font family is NOT installed / not in Figma library / not Google Font)
  let visualWeightKey = cssWeightKey;
  if (visualDensity !== undefined && visualDensity !== null) {
    if (visualDensity > 0.35) visualWeightKey = '900';
    else if (visualDensity > 0.29) visualWeightKey = '800';
    else if (visualDensity > 0.24) visualWeightKey = '700';
    else if (visualDensity > 0.20) visualWeightKey = '600';
    else if (visualDensity > 0.17) visualWeightKey = '500';
    else if (visualDensity > 0.12) visualWeightKey = '400';
    else if (visualDensity > 0.08) visualWeightKey = '300';
    else if (visualDensity > 0.05) visualWeightKey = '200';
    else visualWeightKey = '100';
  }

  // Extract stretch from font family name if present
  let stretchLower = (fontStretch || '').toLowerCase();
  if (familyLower.includes('condensed') || familyLower.includes('compressed') || familyLower.includes('narrow') || familyLower.includes('extracond')) {
    stretchLower = 'condensed';
  }

  if (visualStretch !== undefined && visualStretch !== null) {
    if (visualStretch < 0.53) {
      stretchLower = 'condensed';
    } else if (visualStretch > 0.70) {
      stretchLower = 'expanded';
    }
  }

  // Remove the weight/stretch descriptors from the family name to get the true base family
  let baseFamily = cleanFamily.replace(/\b(Thin|Hairline|Extra\s?Light|Ultra\s?Light|Light|Medium|Semi\s?Bold|Demi\s?Bold|Extra\s?Bold|Ultra\s?Bold|Bold|Black|Heavy|Condensed|Compressed|Narrow|ExtraCond)\b/gi, '').trim();
  if (!baseFamily) baseFamily = cleanFamily;
  
  const WEIGHT_FALLBACK_SEQUENCE = {
    '100': ['100', '200', '300', '400'],
    '200': ['200', '100', '300', '400'],
    '300': ['300', '400', '200', '500'],
    '400': ['400', '500', '300', '600'],
    '500': ['500', '600', '400', '700'],
    '600': ['600', '700', '500', '800'],
    '700': ['700', '800', '600', '900'],
    '800': ['800', '900', '700', '600'],
    '900': ['900', '800', '700', '600']
  };

  function getCandidatesForFamily(fam, targetWeightKey) {
    const list = [];
    const seq = WEIGHT_FALLBACK_SEQUENCE[targetWeightKey] || [targetWeightKey, '400'];
    for (const wKey of seq) {
      const styleNames = FONT_WEIGHT_MAP[wKey] || ['Regular'];
      for (const style of styleNames) {
        list.push({ family: fam, style: style + (italic ? ' Italic' : '') });
        if (italic) list.push({ family: fam, style: style + 'Italic' });
      }
    }
    list.push({ family: fam, style: italic ? 'Italic' : 'Regular' });
    return list;
  }

  // Font Awesome Special Handling
  const lowerFamily = cleanFamily.toLowerCase();
  if (lowerFamily.includes('font awesome') || lowerFamily === 'fontawesome') {
    const isSolid = cssWeightKey === '900' || cssWeightKey === 'bold' || cssWeightKey === 'bolder' || parseInt(cssWeightKey) >= 700;
    const faCandidates = [];
    if (lowerFamily.includes('brands')) {
      faCandidates.push({ family: cleanFamily, style: 'Regular' });
    } else if (isSolid) {
      faCandidates.push({ family: cleanFamily, style: 'Solid' });
      faCandidates.push({ family: 'Font Awesome 5 Free', style: 'Solid' });
      faCandidates.push({ family: 'Font Awesome 6 Free', style: 'Solid' });
      faCandidates.push({ family: cleanFamily, style: 'Regular' });
      faCandidates.push({ family: 'Font Awesome 5 Free', style: 'Regular' });
    } else {
      faCandidates.push({ family: cleanFamily, style: 'Regular' });
      faCandidates.push({ family: cleanFamily, style: 'Light' });
      faCandidates.push({ family: 'Font Awesome 5 Free', style: 'Regular' });
      faCandidates.push({ family: 'Font Awesome 6 Free', style: 'Regular' });
      faCandidates.push({ family: cleanFamily, style: 'Solid' });
      faCandidates.push({ family: 'Font Awesome 5 Free', style: 'Solid' });
    }
    for (const font of faCandidates) {
      try {
        await figma.loadFontAsync({ family: font.family, style: font.style });
        return font;
      } catch {}
    }
  }

  // STEP A: If the font family is in Figma (Google Fonts, Figma Library, or Installed Locally on the user's OS),
  // try loading it with the exact CSS font-weight!
  const directCandidates = [];
  directCandidates.push(...getCandidatesForFamily(cleanFamily, cssWeightKey));
  if (baseFamily !== cleanFamily) {
    directCandidates.push(...getCandidatesForFamily(baseFamily, cssWeightKey));
  }

  for (const font of directCandidates) {
    try {
      await figma.loadFontAsync({ family: font.family, style: font.style });
      return font; // Successfully loaded from Google Fonts / installed font / Figma library with CSS weight!
    } catch {}
  }

  // STEP B: The font family is NOT in Google Fonts, NOT in Figma's library, and NOT installed locally.
  // Now and ONLY now do we use visual density guessing and variable fallback fonts.
  const candidates = [];

  // 3. Try to fall back to a Google Font based on the font category/type
  let fallbackGoogleFont = null;
  const fullFamilyString = familyRaw.toLowerCase();
  const isCondensed = stretchLower.includes('condensed') || stretchLower.includes('compressed') || (parseFloat(stretchLower) < 100);

  if (isCondensed) {
    fallbackGoogleFont = 'Roboto Condensed';
  } else if (fullFamilyString.includes('serif') && !fullFamilyString.includes('sans-serif')) {
    fallbackGoogleFont = 'Lora';
  } else if (fullFamilyString.includes('monospace')) {
    fallbackGoogleFont = 'Roboto Mono';
  } else if (fullFamilyString.includes('cursive')) {
    fallbackGoogleFont = 'Caveat';
  } else if (fullFamilyString.includes('fantasy')) {
    fallbackGoogleFont = 'Cinzel';
  } else {
    // For modern sans-serifs, Plus Jakarta Sans or Inter
    fallbackGoogleFont = 'Inter';
  }

  // 4. Try the calculated Google Font Fallback using visual weight
  if (fallbackGoogleFont && fallbackGoogleFont !== cleanFamily && fallbackGoogleFont !== baseFamily) {
    candidates.push(...getCandidatesForFamily(fallbackGoogleFont, visualWeightKey));
  }
  
  // 5. Ultimate Variable Font Fallback (Roboto Flex)
  // Maps the exact stroke width (pixel density) and letter width (aspect ratio) dynamically
  if (visualDensity || visualStretch) {
    // Calibrated Math: Normal sans-serif fonts have a density around 0.17 to 0.19.
    let wght = 400;
    if (visualDensity) {
       wght = 400 + ((visualDensity - 0.18) * 3500); 
       wght = Math.max(100, Math.min(1000, Math.round(wght)));
    } else {
       wght = parseInt(visualWeightKey) || 400;
    }
    
    // Calibrated Math: Normal fonts have a stretch ratio around 0.60 to 0.62.
    let wdth = 100;
    if (visualStretch) {
       wdth = 100 + ((visualStretch - 0.60) * 200);
       wdth = Math.max(25, Math.min(151, Math.round(wdth)));
    } else {
       wdth = isCondensed ? 75 : 100;
    }
    
    candidates.push({ 
      family: 'Roboto Flex', 
      style: 'Regular',
      variationSettings: { wght, wdth }
    });
  }

  // 6. Final safety fallbacks
  if (fallbackGoogleFont !== 'Inter') candidates.push({ family: 'Inter', style: 'Regular' });
  if (fallbackGoogleFont !== 'Roboto') candidates.push({ family: 'Roboto', style: 'Regular' });

  for (const font of candidates) {
    try {
      await figma.loadFontAsync({ family: font.family, style: font.style });
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
      const posMatch = trimmed.match(/(.*?)\s+(?:calc\([^)]+\)|-?[\d.]+(?:[a-zA-Z%]+)?|0)$/i);
      let colStr = trimmed;
      let pos = n > 1 ? (i / (n - 1)) : i;

      if (posMatch) {
        colStr = posMatch[1].trim();
        const pctMatch = trimmed.match(/(-?[\d.]+)%$/);
        if (pctMatch) pos = parseFloat(pctMatch[1]) / 100;
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
    if (stops[0].position > 0) {
      stops.unshift({ position: 0, color: { ...stops[0].color } });
    }
    if (stops[stops.length - 1].position < 1) {
      stops.push({ position: 1, color: { ...stops[stops.length - 1].color } });
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

function parseRadialGradient(css, width, height) {
  if (!css || !css.includes('radial-gradient(')) return null;
  try {
    const start = css.indexOf('radial-gradient(');
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

    let stopsStr = inner;
    let rx = 0.5;
    let ry = 0.5;
    let cx = 0.5;
    let cy = 0.5;

    // Check if first argument is shape / size / position (e.g. '50% 96%', 'circle at center', 'at center')
    const firstCommaIdx = inner.indexOf(',');
    if (firstCommaIdx !== -1) {
      const firstArg = inner.substring(0, firstCommaIdx).trim();
      const firstToken = firstArg.split(/[\s,]+/)[0];
      if (!parseColor(firstToken)) {
        stopsStr = inner.substring(firstCommaIdx + 1).trim();

        if (firstArg.includes('at ')) {
          const atParts = firstArg.split('at ')[1].trim().split(/\s+/);
          if (atParts[0]) {
            if (atParts[0].endsWith('%')) cx = parseFloat(atParts[0]) / 100;
            else if (atParts[0].endsWith('px') && width) cx = parseFloat(atParts[0]) / width;
            else if (atParts[0] === 'left') cx = 0;
            else if (atParts[0] === 'right') cx = 1;
            else if (atParts[0] === 'center') cx = 0.5;
          }
          if (atParts[1]) {
            if (atParts[1].endsWith('%')) cy = parseFloat(atParts[1]) / 100;
            else if (atParts[1].endsWith('px') && height) cy = parseFloat(atParts[1]) / height;
            else if (atParts[1] === 'top') cy = 0;
            else if (atParts[1] === 'bottom') cy = 1;
            else if (atParts[1] === 'center') cy = 0.5;
          }
        }

        const shapePart = (firstArg.includes('at ') ? firstArg.split('at ')[0].trim() : firstArg).trim();
        const dimTokens = shapePart.split(/\s+/).filter(t => t.endsWith('%') || t.endsWith('px') || !isNaN(parseFloat(t)));
        if (dimTokens.length >= 2) {
          if (dimTokens[0].endsWith('%')) rx = parseFloat(dimTokens[0]) / 100;
          else if (dimTokens[0].endsWith('px') && width) rx = parseFloat(dimTokens[0]) / width;

          if (dimTokens[1].endsWith('%')) ry = parseFloat(dimTokens[1]) / 100;
          else if (dimTokens[1].endsWith('px') && height) ry = parseFloat(dimTokens[1]) / height;
        } else if (dimTokens.length === 1) {
          if (dimTokens[0].endsWith('%')) {
            rx = parseFloat(dimTokens[0]) / 100;
            ry = (width && height) ? (rx * width / height) : rx;
          } else if (dimTokens[0].endsWith('px') && width && height) {
            const px = parseFloat(dimTokens[0]);
            rx = px / width;
            ry = px / height;
          }
        } else if (shapePart.includes('circle')) {
          rx = 0.5;
          ry = (width && height) ? (0.5 * width / height) : 0.5;
        }
      }
    }

    const rawStops = splitByTopLevelCommas(stopsStr);
    if (!rawStops || rawStops.length === 0) return null;

    const stops = [];
    const n = rawStops.length;
    let maxPos = 0;

    rawStops.forEach((raw, i) => {
      const trimmed = raw.trim();
      const posMatch = trimmed.match(/(.*?)\s+(?:calc\([^)]+\)|-?[\d.]+(?:[a-zA-Z%]+)?|0)$/i);
      let colStr = trimmed;
      let pos = n > 1 ? (i / (n - 1)) : i;

      if (posMatch) {
        colStr = posMatch[1].trim();
        const pctMatch = trimmed.match(/([\d.]+)%$/);
        if (pctMatch) pos = parseFloat(pctMatch[1]) / 100;
      }

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
    if (stops[0].position > 0) {
      stops.unshift({ position: 0, color: { ...stops[0].color } });
    }
    if (stops[stops.length - 1].position < 1) {
      stops.push({ position: 1, color: { ...stops[stops.length - 1].color } });
    }

    rx = Math.max(0.001, Math.abs(rx));
    ry = Math.max(0.001, Math.abs(ry));

    // Figma's gradientTransform is an affine transform matrix:
    // [[scaleX, 0, tx], [0, scaleY, ty]]
    // that maps canonical gradient space [0, 1] x [0, 1] to normalized object space.
    // In canonical gradient space:
    // Center is at (0.5, 0.5)
    // Horizontal radius endpoint (stop 1.0) is at (1.0, 0.5) -> distance 0.5
    // Vertical radius endpoint (stop 1.0) is at (0.5, 1.0) -> distance 0.5
    //
    // To position center at (cx, cy) with radii rx and ry:
    // scaleX = rx / 0.5 = 2 * rx
    // scaleY = ry / 0.5 = 2 * ry
    // tx = cx - 0.5 * scaleX = cx - rx
    // ty = cy - 0.5 * scaleY = cy - ry
    const scaleX = 2 * rx;
    const scaleY = 2 * ry;
    const tx = cx - rx;
    const ty = cy - ry;

    return {
      type: 'GRADIENT_RADIAL',
      gradientTransform: [
        [scaleX, 0, tx],
        [0, scaleY, ty]
      ],
      gradientStops: stops
    };
  } catch {
    return null;
  }
}

function parseAngularGradient(css) {
  if (!css || !css.includes('conic-gradient(')) return null;
  try {
    const start = css.indexOf('conic-gradient(');
    if (start === -1) return null;
    let depth = 0;
    let inner = '';
    for (let i = start + 14; i < css.length; i++) {
      if (css[i] === '(') depth++;
      else if (css[i] === ')') {
        depth--;
        if (depth === 0) {
          inner = css.substring(start + 15, i).trim();
          break;
        }
      }
    }
    if (!inner) return null;

    let fromAngle = 0;
    let stopsStr = inner;

    const headerMatch = inner.match(/^((?:from\s+[^,]+|\s*at\s+[^,]+)+)\s*,\s*(.*)$/is);
    if (headerMatch) {
      const header = headerMatch[1].trim();
      stopsStr = headerMatch[2].trim();

      const fromMatch = header.match(/from\s+(-?[\d.]+)(deg|rad|turn|grad)?/i);
      if (fromMatch) {
        const val = parseFloat(fromMatch[1]);
        const unit = (fromMatch[2] || 'deg').toLowerCase();
        if (unit === 'deg') fromAngle = val;
        else if (unit === 'rad') fromAngle = (val * 180) / Math.PI;
        else if (unit === 'turn') fromAngle = val * 360;
        else if (unit === 'grad') fromAngle = (val * 360) / 400;
      }
    }

    const rawStops = splitByTopLevelCommas(stopsStr);
    if (!rawStops || rawStops.length === 0) return null;

    const stops = [];
    const n = rawStops.length;
    let maxPos = 0;

    rawStops.forEach((raw, i) => {
      const trimmed = raw.trim();
      const match = trimmed.match(/^(.*?)\s+([\d.]+)(%|deg|turn|rad|grad)?$/i);
      let colStr = trimmed;
      let pos = n > 1 ? (i / (n - 1)) : i;

      if (match) {
        colStr = match[1].trim();
        const num = parseFloat(match[2]);
        const unit = (match[3] || '').toLowerCase();
        if (unit === '%') pos = num / 100;
        else if (unit === 'deg') pos = num / 360;
        else if (unit === 'turn') pos = num;
        else if (unit === 'rad') pos = num / (2 * Math.PI);
        else if (unit === 'grad') pos = num / 400;
        else if (num > 1) pos = num / 360;
        else pos = num;
      }

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

    // In Figma, GRADIENT_ANGULAR rotates around center (0.5, 0.5)
    // CSS conic-gradient 0deg points UP (-PI/2)
    const rad = ((fromAngle - 90) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      type: 'GRADIENT_ANGULAR',
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
        if ((x === 0 && y === 0 && radius === 0 && spread === 0) || !col || col.a <= 0.005) {
          continue;
        }
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

function isBackgroundClipText(styles) {
  if (!styles) return false;
  const bc = styles.backgroundClip || '';
  const wbc = styles.webkitBackgroundClip || '';
  return bc.includes('text') || wbc.includes('text');
}

/* ======================================================================
 *  4.  STYLE APPLIERS
 * ====================================================================== */
async function applyFills(node, styles, assets, nodeW, nodeH, hasChildren = false) {
  let fills = [];
  const isTextClip = isBackgroundClipText(styles);

  let isZeroSize = false;
  if (!isTextClip) {
    if (styles.clipPath && styles.clipPath.includes('path(')) {
      const match = styles.clipPath.match(/path\(['"]?(.*?)['"]?\)/);
      if (match) {
        const d = match[1];
        let hexCol = '#000000';
        let a = 1;
        const bg = parseColor(styles.backgroundColor);
        if (bg && bg.a > 0.005) {
          const r = Math.round(bg.r * 255).toString(16).padStart(2, '0');
          const g = Math.round(bg.g * 255).toString(16).padStart(2, '0');
          const b = Math.round(bg.b * 255).toString(16).padStart(2, '0');
          hexCol = `#${r}${g}${b}`;
          a = clamp01(bg.a);
        }
        const svgStr = `<svg><path d="${d}" fill="${hexCol}" opacity="${a}"/></svg>`;
        try {
          const svgNode = figma.createNodeFromSvg(svgStr);
          svgNode.name = 'clip-path-shape';
          svgNode.x = 0;
          svgNode.y = 0;
          node.insertChild(0, svgNode);
          styles.backgroundColor = 'transparent';
        } catch (e) {}
      }
    }

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

  let hasMaskSvg = false;
  if (combinedImages.includes('url(')) {
    const matches = Array.from(combinedImages.matchAll(/url\(\s*["']?(.*?)["']?\s*\)/g)).reverse();
    for (const match of matches) {
      const imgUrl = match[1]?.trim();
      if (!imgUrl) continue;
      
      const isMask = (styles.maskImage && styles.maskImage !== 'none' && (styles.maskImage.includes(imgUrl) || styles.maskImage.includes('data:') || styles.maskImage.includes('url('))) ||
                     (styles.webkitMaskImage && styles.webkitMaskImage !== 'none' && (styles.webkitMaskImage.includes(imgUrl) || styles.webkitMaskImage.includes('data:') || styles.webkitMaskImage.includes('url(')));
      
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
        // Check if image is an SVG (data URI, raw string, or SVG asset)
        let isSvg = false;
        let svgContent = '';

        if (typeof blobObj === 'string') {
          const lower = blobObj.trim().toLowerCase();
          if (lower.startsWith('data:image/svg+xml') || lower.startsWith('<svg') || lower.startsWith('<?xml') || lower.includes('%3csvg')) {
            isSvg = true;
            const commaIdx = blobObj.indexOf(',');
            const meta = commaIdx >= 0 ? blobObj.slice(0, commaIdx).toLowerCase() : '';
            const raw = commaIdx >= 0 ? blobObj.slice(commaIdx + 1) : blobObj;
            if (meta.includes(';base64')) {
              try {
                const bytes = figma.base64Decode(raw.trim());
                svgContent = bytesToString(bytes);
              } catch {}
            } else {
              try {
                svgContent = decodeURIComponent(raw);
              } catch {
                svgContent = raw;
              }
            }
            if (svgContent) {
              svgContent = svgContent.replace(/\\"/g, '"').replace(/\\'/g, "'");
            }
          }
        }

        if (!isSvg) {
          const testBytes = decodeBase64Image(blobObj);
          if (testBytes) {
            const header = bytesToString(testBytes.slice(0, 100)).toLowerCase();
            if (header.includes('<svg') || header.includes('<?xml')) {
              isSvg = true;
              svgContent = bytesToString(testBytes);
            }
          }
        }

        if (isSvg && svgContent) {
          try {
            const bgCol = parseColor(styles.backgroundColor);
            let fillHex = null;
            if (bgCol && bgCol.a > 0.005) {
              const r = Math.round(bgCol.r * 255).toString(16).padStart(2, '0');
              const g = Math.round(bgCol.g * 255).toString(16).padStart(2, '0');
              const b = Math.round(bgCol.b * 255).toString(16).padStart(2, '0');
              fillHex = `#${r}${g}${b}`;
            }

            let preparedSvg = svgContent;
            if (isMask && hasChildren) {
              // Container mask: requires an opaque shape fill to mask child layers in Figma
              preparedSvg = preparedSvg.replace(/<(path|rect|polygon|circle|ellipse)\b([^>]*?)(\/?>)/gi, (m, tag, attrs, close) => {
                if (!/\bfill\s*=/i.test(attrs) || /\bfill\s*=\s*["']none["']/i.test(attrs)) {
                  return `<${tag}${attrs.replace(/\bfill\s*=\s*["']none["']/gi, '')} fill="#000000"${close}`;
                }
                return m;
              });
            } else if (isMask) {
              // Standalone mask shape (e.g. ::before card background shape with mask + backgroundColor)
              const targetFill = fillHex || '#ffffff';
              preparedSvg = preparedSvg.replace(/<(path|rect|polygon|circle|ellipse)\b([^>]*?)(\/?>)/gi, (m, tag, attrs, close) => {
                if (/\bfill\s*=\s*["']none["']/i.test(attrs)) {
                  return m;
                }
                const cleanedAttrs = attrs.replace(/\bfill\s*=\s*["'][^"']*["']/gi, '');
                return `<${tag}${cleanedAttrs} fill="${targetFill}"${close}`;
              });
            } else {
              // Regular background-image SVG
              let textColHex = '#000000';
              const textCol = parseColor(styles.color);
              if (textCol && textCol.a > 0.005) {
                const r = Math.round(textCol.r * 255).toString(16).padStart(2, '0');
                const g = Math.round(textCol.g * 255).toString(16).padStart(2, '0');
                const b = Math.round(textCol.b * 255).toString(16).padStart(2, '0');
                textColHex = `#${r}${g}${b}`;
              }
              const targetFill = fillHex || textColHex;
              preparedSvg = preparedSvg.replace(/<(path|rect|polygon|circle|ellipse)\b([^>]*?)(\/?>)/gi, (m, tag, attrs, close) => {
                // If shape already has stroke and fill is explicitly none, keep it stroke-only (e.g. dropdown chevrons)
                if (/\bfill\s*=\s*["']none["']/i.test(attrs) && /\bstroke\s*=/i.test(attrs) && !/\bstroke\s*=\s*["']none["']/i.test(attrs)) {
                  return m;
                }
                if (!/\bfill\s*=/i.test(attrs) || /\bfill\s*=\s*["']none["']/i.test(attrs)) {
                  return `<${tag}${attrs.replace(/\bfill\s*=\s*["']none["']/gi, '')} fill="${targetFill}"${close}`;
                }
                return m;
              });
            }

            const cleanSvg = preparedSvg;
            const svgNode = figma.createNodeFromSvg(cleanSvg);
            hydrateSvgPatterns(svgNode, cleanSvg);
            svgNode.name = (isMask && hasChildren) ? 'mask-svg' : 'bg-svg';
            node.insertChild(0, svgNode);

            const rawBgSize = ((isMask ? (styles.maskSize || styles.webkitMaskSize) : null) || styles.backgroundSize || 'auto').split(',')[0].trim();
            const rawPosX = ((isMask ? (styles.maskPositionX || styles.webkitMaskPositionX) : null) || styles.backgroundPositionX || '0%').split(',')[0].trim();
            const rawPosY = ((isMask ? (styles.maskPositionY || styles.webkitMaskPositionY) : null) || styles.backgroundPositionY || '0%').split(',')[0].trim();

            const origW = svgNode.width || 1;
            const origH = svgNode.height || 1;
            let targetW = nodeW;
            let targetH = nodeH;

            if (rawBgSize === 'cover') {
              const scale = Math.max(nodeW / origW, nodeH / origH);
              targetW = origW * scale;
              targetH = origH * scale;
            } else if (rawBgSize === 'contain') {
              const scale = Math.min(nodeW / origW, nodeH / origH);
              targetW = origW * scale;
              targetH = origH * scale;
            } else if (rawBgSize && rawBgSize !== 'auto') {
              const parts = rawBgSize.split(/\s+/);
              let wStr = parts[0];
              let hStr = parts.length > 1 ? parts[1] : 'auto';
              if (wStr.endsWith('%')) targetW = nodeW * (parseFloat(wStr) / 100);
              else if (wStr.endsWith('px')) targetW = parseFloat(wStr);

              if (hStr === 'auto') targetH = targetW * (origH / origW);
              else if (hStr.endsWith('%')) targetH = nodeH * (parseFloat(hStr) / 100);
              else if (hStr.endsWith('px')) targetH = parseFloat(hStr);
            } else {
              targetW = nodeW;
              targetH = nodeH;
            }

            // Parse CSS backgroundPositionX/Y with support for percentages, px, and 3/4-value CSS offsets (e.g. 'right 12px')
            function parseBgCoord(posStr, containerDim, targetDim) {
              if (!posStr) return 0;
              const p = posStr.trim();
              const tokens = p.split(/\s+/);
              if (tokens.length >= 2) {
                const keyword = tokens[0].toLowerCase();
                const offsetVal = parseFloat(tokens[1]) * (tokens[1].endsWith('rem') ? 16 : 1);
                if (keyword === 'right' || keyword === 'bottom') {
                  return containerDim - targetDim - (isNaN(offsetVal) ? 0 : offsetVal);
                }
                if (keyword === 'left' || keyword === 'top') {
                  return isNaN(offsetVal) ? 0 : offsetVal;
                }
              }
              if (p === 'center') return (containerDim - targetDim) / 2;
              if (p === 'left' || p === 'top') return 0;
              if (p === 'right' || p === 'bottom') return containerDim - targetDim;
              if (p.endsWith('%')) return (containerDim - targetDim) * (parseFloat(p) / 100);
              if (p.endsWith('px')) return parseFloat(p);
              if (p.endsWith('rem')) return parseFloat(p) * 16;
              const num = parseFloat(p);
              return isNaN(num) ? 0 : num;
            }

            let ox = parseBgCoord(rawPosX, nodeW, targetW);
            let oy = parseBgCoord(rawPosY, nodeH, targetH);

            svgNode.x = Math.round(ox);
            svgNode.y = Math.round(oy);
            try {
              svgNode.resize(Math.max(1, Math.round(targetW)), Math.max(1, Math.round(targetH)));
            } catch {}
            applyOpacity(svgNode, styles);
            node.clipsContent = true;

            if (isMask) {
              if (hasChildren) {
                svgNode.isMask = true;
                try { svgNode.maskType = 'ALPHA'; } catch {}
              }
              hasMaskSvg = true;
            }
            continue;
          } catch (e) {
            figma.notify(`SVG Error: ${e.message}`, { error: true });
            continue; // Do not fall through to raster decode for SVGs
          }
        }

        const bytes = decodeBase64Image(blobObj);
        if (bytes) {
          try {
            const img = figma.createImage(bytes);
            
            const bgSize = ((isMask ? (styles.maskSize || styles.webkitMaskSize) : null) || styles.backgroundSize || 'auto').toLowerCase().trim();
            const posX = ((isMask ? (styles.maskPositionX || styles.webkitMaskPositionX) : null) || styles.backgroundPositionX || '0%').trim();
            const posY = ((isMask ? (styles.maskPositionY || styles.webkitMaskPositionY) : null) || styles.backgroundPositionY || '0%').trim();
            
            // In Figma, background images are almost exclusively meant to proportionally cover or fit the frame:
            // 1. contain -> 'FIT' (proportional, whole image visible)
            // 2. cover, auto, 100%, or any standard background -> 'FILL' (proportional crop-to-fill, NEVER distort or squeeze)
            // Custom CROP matrix should ONLY be attempted for genuine CSS sprite sheets (explicit px size with negative offsets)
            let isContain = bgSize.includes('contain');
            let isCover = bgSize.includes('cover');
            let isAuto = bgSize === 'auto' || bgSize === '';
            // If it's a specific size like 100%, we treat it as sprite logic to calculate exact px
            const isSprite = !isContain && !isCover && !isAuto;

            try {
              const size = await img.getSizeAsync();
              let imgW = size.width;
              let imgH = size.height;
              
              if (isContain || isCover || isAuto) {
                const imgRatio = size.width / size.height;
                const nodeRatio = nodeW / nodeH;
                if (isContain) {
                  if (imgRatio > nodeRatio) {
                    imgW = nodeW;
                    imgH = nodeW / imgRatio;
                  } else {
                    imgH = nodeH;
                    imgW = nodeH * imgRatio;
                  }
                } else if (isCover) {
                  if (imgRatio > nodeRatio) {
                    imgH = nodeH;
                    imgW = nodeH * imgRatio;
                  } else {
                    imgW = nodeW;
                    imgH = nodeW / imgRatio;
                  }
                }
                // for isAuto, we just leave imgW and imgH as the original size!
              } else if (isSprite) {
                const parts = bgSize.split(/\s+/);
                let wStr = parts[0];
                let hStr = parts.length > 1 ? parts[1] : wStr;
                
                if (wStr.endsWith('%')) imgW = nodeW * (parseFloat(wStr) / 100);
                else if (wStr.endsWith('px')) imgW = parseFloat(wStr);
                
                if (hStr === 'auto') {
                  imgH = imgW * (size.height / size.width);
                } else if (hStr.endsWith('%')) {
                  imgH = nodeH * (parseFloat(hStr) / 100);
                } else if (hStr.endsWith('px')) {
                  imgH = parseFloat(hStr);
                }
              }

              let pX = posX;
              let pY = posY;
              if (pX === 'center') pX = '50%';
              if (pY === 'center') pY = '50%';
              if (pX === 'left') pX = '0%';
              if (pX === 'right') pX = '100%';
              if (pY === 'top') pY = '0%';
              if (pY === 'bottom') pY = '100%';

              let ox = 0, oy = 0;
              if (pX.endsWith('%')) ox = (nodeW - imgW) * (parseFloat(pX) / 100);
              else if (pX.endsWith('px')) ox = parseFloat(pX);
              
              if (pY.endsWith('%')) oy = (nodeH - imgH) * (parseFloat(pY) / 100);
              else if (pY.endsWith('px')) oy = parseFloat(pY);
              
              const transform = [
                [nodeW / imgW, 0, -ox / imgW],
                [0, nodeH / imgH, -oy / imgH]
              ];
              
              if (transform.flat().some(val => !isFinite(val))) {
                throw new Error('Invalid transform parameters (Infinity or NaN)');
              }

              fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'CROP', imageTransform: transform });
            } catch (err) {
              // Fallback if sizing fails
              fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: isContain ? 'FIT' : 'FILL' });
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

  if (hasMaskSvg) {
    fills = [];
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
        } else if (bg.includes('radial-gradient')) {
          const grad = parseRadialGradient(bg, nodeW, nodeH);
          if (grad) {
            fills.push(grad);
            continue;
          }
        } else if (bg.includes('conic-gradient')) {
          const grad = parseAngularGradient(bg);
          if (grad) {
            fills.push(grad);
            continue;
          }
        }
      }
    }
  }

  if (fills.length > 0) node.fills = fills;
  else if (node.type === 'FRAME') node.fills = [];
}

function applyStrokes(node, styles) {
  const isColorVisible = (c) => {
    if (!c || c === 'transparent' || c === 'none') return false;
    const p = parseColor(c);
    return p && p.a > 0.01;
  };

  const getBorderColor = (c1, c2) => {
    if (c1 && isColorVisible(c1)) return c1;
    if (c2 && isColorVisible(c2)) return c2;
    if (c1 === undefined && c2 === undefined) return '#000000';
    return null;
  };

  const topColor = getBorderColor(styles.borderTopColor, styles.borderColor);
  const bottomColor = getBorderColor(styles.borderBottomColor, styles.borderColor);
  const leftColor = getBorderColor(styles.borderLeftColor, styles.borderColor);
  const rightColor = getBorderColor(styles.borderRightColor, styles.borderColor);

  let gradientStroke = null;
  if (styles.borderImageSource && styles.borderImageSource !== 'none') {
    const parsedGrad = parseLinearGradient(styles.borderImageSource);
    if (parsedGrad) gradientStroke = parsedGrad;
  }

  const topW = (styles.borderTopStyle && styles.borderTopStyle !== 'none' && styles.borderTopStyle !== 'hidden' && (topColor || gradientStroke)) ? (parseFloat(styles.borderTopWidth) || 0) : 0;
  const rightW = (styles.borderRightStyle && styles.borderRightStyle !== 'none' && styles.borderRightStyle !== 'hidden' && (rightColor || gradientStroke)) ? (parseFloat(styles.borderRightWidth) || 0) : 0;
  const bottomW = (styles.borderBottomStyle && styles.borderBottomStyle !== 'none' && styles.borderBottomStyle !== 'hidden' && (bottomColor || gradientStroke)) ? (parseFloat(styles.borderBottomWidth) || 0) : 0;
  const leftW = (styles.borderLeftStyle && styles.borderLeftStyle !== 'none' && styles.borderLeftStyle !== 'hidden' && (leftColor || gradientStroke)) ? (parseFloat(styles.borderLeftWidth) || 0) : 0;

  const totalBorder = topW + rightW + bottomW + leftW;
  
  // Outline handling
  const outlineW = parseFloat(styles.outlineWidth) || 0;
  const outlineStyle = styles.outlineStyle;
  if (outlineW > 0 && outlineStyle && outlineStyle !== 'none' && outlineStyle !== 'hidden' && node.type === 'FRAME') {
    const oColor = parseColor(styles.outlineColor);
    if (oColor && oColor.a > 0.005) {
      const outlineRect = figma.createRectangle();
      outlineRect.name = 'outline';
      const offset = parseFloat(styles.outlineOffset) || 0;
      
      const ow = Math.max(1, (node.width || 0) + (offset * 2));
      const oh = Math.max(1, (node.height || 0) + (offset * 2));
      const ox = -offset;
      const oy = -offset;
      
      try { outlineRect.resize(ow, oh); } catch {}
      outlineRect.fills = [];
      outlineRect.strokes = [{
        type: 'SOLID',
        color: { r: oColor.r, g: oColor.g, b: oColor.b },
        opacity: clamp01(oColor.a)
      }];
      outlineRect.strokeWeight = outlineW;
      // outline is drawn center-aligned by default, or inside if needed. Center provides best visual match for outline.
      outlineRect.strokeAlign = 'CENTER'; 
      
      if (outlineStyle === 'dashed') {
         outlineRect.dashPattern = [outlineW * 3, outlineW * 3];
      } else if (outlineStyle === 'dotted') {
         outlineRect.dashPattern = [outlineW, outlineW * 2];
         try { outlineRect.strokeCap = 'ROUND'; } catch {}
      }
      
      try {
        if (typeof node.cornerRadius === 'number') {
          outlineRect.cornerRadius = Math.max(0, node.cornerRadius + offset);
        } else {
          outlineRect.topLeftRadius = Math.max(0, node.topLeftRadius + offset);
          outlineRect.topRightRadius = Math.max(0, node.topRightRadius + offset);
          outlineRect.bottomLeftRadius = Math.max(0, node.bottomLeftRadius + offset);
          outlineRect.bottomRightRadius = Math.max(0, node.bottomRightRadius + offset);
        }
      } catch {}
      
      node.appendChild(outlineRect);
      try { outlineRect.layoutPositioning = 'ABSOLUTE'; } catch {}
      outlineRect.x = ox;
      outlineRect.y = oy;
      try { outlineRect.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' }; } catch {}
    }
  }

  if (totalBorder <= 0) return;

  // Prevent duplicate bottom border if an ancestor frame already draws a bottom-only border
  if (bottomW > 0 && topW === 0 && leftW === 0 && rightW === 0) {
    let p = node.parent;
    let d = 0;
    while (p && p.type === 'FRAME' && d < 3) {
      try {
        if (p.strokes && p.strokes.length > 0 && p.strokeBottomWeight > 0 && p.strokeTopWeight === 0 && p.strokeLeftWeight === 0 && p.strokeRightWeight === 0) {
          return;
        }
      } catch (e) {}
      p = p.parent;
      d++;
    }
  }

  const activeColorStr = (topW > 0 && topColor) ||
                         (bottomW > 0 && bottomColor) ||
                         (leftW > 0 && leftColor) ||
                         (rightW > 0 && rightColor) ||
                         topColor || bottomColor || leftColor || rightColor;

  let strokeColor = null;
  if (gradientStroke) {
    strokeColor = gradientStroke;
  } else {
    const borderColor = parseColor(activeColorStr);
    if (!borderColor || borderColor.a <= 0.005) return;

    strokeColor = {
      type: 'SOLID',
      color: { r: borderColor.r, g: borderColor.g, b: borderColor.b },
      opacity: clamp01(borderColor.a)
    };
  }

  const hasDashOrDot = [styles.borderTopStyle, styles.borderRightStyle, styles.borderBottomStyle, styles.borderLeftStyle, styles.borderStyle]
    .some(s => s === 'dashed' || s === 'dotted');

  const isUniform = topW === rightW && rightW === bottomW && bottomW === leftW;

  // If uniform, we can use native Figma dashPattern and strokes
  if (isUniform) {
    node.strokes = [strokeColor];
    node.strokeAlign = 'INSIDE';
    node.strokeWeight = topW;
    const borderStyle = styles.borderStyle || styles.borderTopStyle || 'solid';
    if (borderStyle === 'dashed') {
      const weight = topW || 1;
      node.dashPattern = [weight * 3, weight * 3];
    } else if (borderStyle === 'dotted') {
      const weight = topW || 1;
      node.dashPattern = [weight, weight * 2];
      try { node.strokeCap = 'ROUND'; } catch {}
    }
    return;
  }

  // If non-uniform AND it has dashed/dotted, we must render absolute vector lines to bypass Figma's limitation,
  // and we clear the native strokes to prevent overlapping lines.
  if (node.type === 'FRAME' && hasDashOrDot) {
    node.strokes = []; // Clear native strokes

    const w = node.width || 1;
    const h = node.height || 1;

    const drawEdge = (style, weight, colorStr, x, y, len, isVertical, cHorizontal, cVertical) => {
      if (weight <= 0) return;
      try {
        let edgeStrokeColor = gradientStroke;
        if (!edgeStrokeColor) {
          const edgeBorderColor = parseColor(colorStr || activeColorStr);
          if (!edgeBorderColor || edgeBorderColor.a <= 0.005) return;
          edgeStrokeColor = {
            type: 'SOLID',
            color: { r: edgeBorderColor.r, g: edgeBorderColor.g, b: edgeBorderColor.b },
            opacity: clamp01(edgeBorderColor.a)
          };
        }

        const vec = figma.createVector();
        vec.name = style + '-border';
        
        if (isVertical) {
          vec.vectorPaths = [{ windingRule: 'NONE', data: `M 0 0 L 0 ${len}` }];
        } else {
          vec.vectorPaths = [{ windingRule: 'NONE', data: `M 0 0 L ${len} 0` }];
        }
        
        vec.strokes = [edgeStrokeColor];
        vec.strokeWeight = weight;
        
        if (style === 'dotted') {
          try { vec.dashPattern = [0.01, weight * 2.5]; } catch {}
          try { vec.strokeCap = 'ROUND'; } catch {}
        } else if (style === 'dashed') {
          try { vec.dashPattern = [weight * 3, weight * 3]; } catch {}
        }

        node.appendChild(vec);
        try { vec.layoutPositioning = 'ABSOLUTE'; } catch {}
        
        vec.x = x;
        vec.y = y;
        try { vec.constraints = { horizontal: cHorizontal, vertical: cVertical }; } catch {}
      } catch (e) {
        console.warn('Failed to draw dashed edge:', e);
      }
    };

    drawEdge(styles.borderTopStyle || 'solid', topW, topColor, 0, topW / 2, w, false, 'STRETCH', 'MIN');
    drawEdge(styles.borderBottomStyle || 'solid', bottomW, bottomColor, 0, h - bottomW / 2, w, false, 'STRETCH', 'MAX');
    drawEdge(styles.borderLeftStyle || 'solid', leftW, leftColor, leftW / 2, 0, h, true, 'MIN', 'STRETCH');
    drawEdge(styles.borderRightStyle || 'solid', rightW, rightColor, w - rightW / 2, 0, h, true, 'MAX', 'STRETCH');
    
    return;
  }

  // Otherwise, it's non-uniform but solid. Try using individual native stroke weights.
  node.strokes = [strokeColor];
  node.strokeAlign = 'INSIDE';
  try {
    node.strokeTopWeight = topW;
    node.strokeRightWeight = rightW;
    node.strokeBottomWeight = bottomW;
    node.strokeLeftWeight = leftW;
  } catch {
    // Fallback if individual stroke weights are unsupported
    node.strokeWeight = Math.max(topW, rightW, bottomW, leftW);
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

function isBackdropNode(node) {
  const styles = node?.styles || {};
  const backdrop = styles.backdropFilter || styles.webkitBackdropFilter || '';
  return backdrop !== 'none' && backdrop.includes('blur');
}

function parseRadiusValue(raw, refDim) {
  if (!raw) return 0;
  const str = String(raw).trim();
  const part = str.split(/[\s/]+/)[0];
  if (part.endsWith('%')) {
    const pct = parseFloat(part);
    if (!isNaN(pct)) {
      return (pct / 100) * (refDim || 0);
    }
  }
  return parseFloat(part) || 0;
}

function applyCornerRadius(node, styles) {
  const refDim = Math.min(node.width || 0, node.height || 0);
  const rawTL = styles.borderTopLeftRadius || styles.borderRadius;
  const rawTR = styles.borderTopRightRadius || styles.borderRadius;
  const rawBR = styles.borderBottomRightRadius || styles.borderRadius;
  const rawBL = styles.borderBottomLeftRadius || styles.borderRadius;

  const tl = parseRadiusValue(rawTL, refDim);
  const tr = parseRadiusValue(rawTR, refDim);
  const br = parseRadiusValue(rawBR, refDim);
  const bl = parseRadiusValue(rawBL, refDim);

  if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
    if (Math.abs(tl - tr) < 0.01 && Math.abs(tr - br) < 0.01 && Math.abs(br - bl) < 0.01) {
      node.cornerRadius = Math.round(tl);
    } else {
      node.topLeftRadius = Math.round(tl);
      node.topRightRadius = Math.round(tr);
      node.bottomRightRadius = Math.round(br);
      node.bottomLeftRadius = Math.round(bl);
    }
  } else if (styles.clipPath && styles.clipPath !== 'none') {
    const cp = styles.clipPath.toLowerCase();
    if (cp.includes('circle') || cp.includes('ellipse')) {
      node.cornerRadius = Math.round(refDim / 2);
      try { node.clipsContent = true; } catch {}
    }
  }
}

function applyOpacity(node, styles) {
  const op = parseFloat(styles.opacity);
  if (!isNaN(op) && op < 1) node.opacity = clamp01(op);
}

const CSS_TO_FIGMA_BLEND_MODES = {
  'multiply': 'MULTIPLY',
  'screen': 'SCREEN',
  'overlay': 'OVERLAY',
  'darken': 'DARKEN',
  'lighten': 'LIGHTEN',
  'color-dodge': 'COLOR_DODGE',
  'color-burn': 'COLOR_BURN',
  'hard-light': 'HARD_LIGHT',
  'soft-light': 'SOFT_LIGHT',
  'difference': 'DIFFERENCE',
  'exclusion': 'EXCLUSION',
  'hue': 'HUE',
  'saturation': 'SATURATION',
  'color': 'COLOR',
  'luminosity': 'LUMINOSITY'
};

function applyBlendMode(node, styles) {
  const mode = styles.mixBlendMode || styles['mix-blend-mode'];
  if (mode && CSS_TO_FIGMA_BLEND_MODES[mode.toLowerCase()]) {
    try {
      node.blendMode = CSS_TO_FIGMA_BLEND_MODES[mode.toLowerCase()];
    } catch {}
  }
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
    figma.ui.postMessage({ type: 'progress', percent: pct, label: label || `Painting... ${renderedNodes}/${totalNodes}` });
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

function parseCssTransformMatrix(transformStr) {
  if (!transformStr || !transformStr.includes('matrix')) return null;
  const parts = transformStr.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!parts) return null;
  const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
  let a = 1, b = 0, c = 0, d = 1;
  if (vals.length === 6) {
    [a, b, c, d] = vals;
  } else if (vals.length === 16) {
    a = vals[0];
    b = vals[1];
    c = vals[4];
    d = vals[5];
  }
  const det = a * d - b * c;
  let flipX = false;
  let flipY = false;

  if (det < 0) {
    if (a < 0 && d > 0 && Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4) {
      flipX = true;
      a = -a;
    } else if (a > 0 && d < 0 && Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4) {
      flipY = true;
      d = -d;
    } else {
      flipX = true;
      a = -a;
      b = -b;
    }
  }
  const angleDeg = Math.atan2(b, a) * (180 / Math.PI);
  return { angleDeg, flipX, flipY };
}

function applySvgFlip(svgStr, flipX, flipY) {
  if (!flipX && !flipY) return svgStr;
  const vbMatch = svgStr.match(/viewBox=["']\s*([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)\s*["']/i);
  let minX = 0, minY = 0, vbW = 100, vbH = 100;
  if (vbMatch) {
    minX = parseFloat(vbMatch[1]) || 0;
    minY = parseFloat(vbMatch[2]) || 0;
    vbW = parseFloat(vbMatch[3]) || 100;
    vbH = parseFloat(vbMatch[4]) || 100;
  }
  const tx = flipX ? (2 * minX + vbW) : 0;
  const ty = flipY ? (2 * minY + vbH) : 0;
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  const groupTransform = `translate(${tx} ${ty}) scale(${sx} ${sy})`;

  return svgStr.replace(/(<svg\b[^>]*>)([\s\S]*?)(<\/svg>)/i, (m, start, inner, end) => {
    return `${start}<g transform="${groupTransform}">${inner}</g>${end}`;
  });
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
  // Collect IDs of <pattern> tags that Figma's SVG parser crashes on
  const patternIds = new Set();
  const patMatches = clean.matchAll(/<pattern\b[^>]*?\bid=["']([^"']+)["']/gi);
  for (const m of patMatches) {
    patternIds.add(m[1]);
  }
  // Strip pattern tags that Figma's SVG parser crashes on
  clean = clean.replace(/<pattern[\s\S]*?<\/pattern>/gi, '');
  // Strip direct image tags inside SVG that Figma's parser crashes on
  clean = clean.replace(/<image[\s\S]*?\/?>/gi, '');
  // Only replace fills referencing pattern IDs with fill="none", NEVER linear/radial gradients!
  if (patternIds.size > 0) {
    clean = clean.replace(/fill=["']url\(#([^"']+)["']\)/gi, (m, id) => {
      return patternIds.has(id) ? 'fill="none"' : m;
    });
  }
  // If SVG has textPath or text elements that are extracted and rendered via Figma text nodes,
  // strip <defs>, <text>, and <use> so Figma's parser doesn't crash or render guide circles
  if (/<textPath\b/i.test(clean)) {
    clean = clean.replace(/<defs[\s\S]*?<\/defs>/gi, '');
    clean = clean.replace(/<text[\s\S]*?<\/text>/gi, '');
    clean = clean.replace(/<use\b[^>]*>(?:<\/use>)?|<use\b[^>]*\/>/gi, '');
  } else {
    // Strip <use ... fill="none"> or guide paths safely
    clean = clean.replace(/<use\b[^>]*?\bfill=["']none["'][^>]*>(?:<\/use>)?|<use\b[^>]*?\bfill=["']none["'][^>]*\/>/gi, '');
  }
  // Remove xmlns:xlink
  clean = clean.replace(/\s*xmlns:xlink=["'][^"']*["']/gi, '');
  // Fix number formats without leading zero (e.g. scale(.0104167) -> scale(0.0104167))
  clean = clean.replace(/([(\s,])-?\.(\d+)/g, '$10.$2');
  // Ensure xmlns is present on <svg>
  if (!clean.includes('xmlns=')) {
    clean = clean.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  // Invert colors if CSS filter has invert: inverted hex = 0xFFFFFF - original hex
  if (isInverted) {
    clean = invertSvgColors(clean);
  }
  // Convert style transforms with transform-origin into native SVG transform attributes
  clean = clean.replace(/<([a-zA-Z0-9]+)\b([^>]*?)>/g, (m, tag, attrs) => {
    const styleMatch = attrs.match(/style\s*=\s*["']([^"']*)["']/i);
    if (!styleMatch || !styleMatch[1].includes('rotate(')) return m;
    const styleContent = styleMatch[1];
    const rotMatch = styleContent.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/i);
    if (!rotMatch) return m;
    const deg = parseFloat(rotMatch[1]);
    const origMatch = styleContent.match(/transform-origin:\s*([\d.]+)px\s+([\d.]+)px/i);
    let nativeTransform = '';
    if (origMatch) {
      const ox = parseFloat(origMatch[1]);
      const oy = parseFloat(origMatch[2]);
      nativeTransform = `rotate(${deg} ${ox} ${oy})`;
    } else {
      nativeTransform = `rotate(${deg})`;
    }
    let newAttrs = attrs;
    if (/\btransform\s*=/i.test(newAttrs)) {
      newAttrs = newAttrs.replace(/\btransform\s*=\s*["'][^"']*["']/i, `transform="${nativeTransform}"`);
    } else {
      newAttrs = `${newAttrs} transform="${nativeTransform}"`;
    }
    return `<${tag}${newAttrs}>`;
  });

  return clean;
}

function hydrateSvgPatterns(svgNode, svgString) {
  if (!svgNode || !svgString) return;
  const hasPattern = svgString.includes('<pattern');
  const hasImage = svgString.includes('<image');
  if (!hasPattern && !hasImage) return;

  const patternImageMap = {};
  const patternMatches = Array.from(svgString.matchAll(/<pattern\b[^>]*?\bid=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/pattern>/gi));
  for (const m of patternMatches) {
    const id = m[1];
    const content = m[2];
    const imgMatch = content.match(/(?:xlink:)?href=["'](data:image\/[^"']+)["']/i);
    if (imgMatch) {
      const bytes = decodeBase64Image(imgMatch[1]);
      if (bytes) {
        try {
          const img = figma.createImage(bytes);
          patternImageMap[id] = img.hash;
        } catch {}
      }
    }
  }

  // Restore fills on vector children whose fill was dropped by Figma due to url(#pattern)
  const patternIds = Object.keys(patternImageMap);
  if (patternIds.length > 0) {
    const refMatches = Array.from(svgString.matchAll(/<(?:path|rect|circle|polygon|ellipse)\b[^>]*?\bfill=["']url\(#([^"')]+)\)["']/gi));
    function traverseAndFill(node) {
      if (node.fills && node.fills.length === 0) {
        const refId = refMatches[0]?.[1];
        const hash = (refId && patternImageMap[refId]) ? patternImageMap[refId] : patternImageMap[patternIds[0]];
        if (hash) {
          node.fills = [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FILL' }];
        }
      }
      if (node.children) {
        for (const child of node.children) traverseAndFill(child);
      }
    }
    traverseAndFill(svgNode);
  }

  // Handle direct <image> tags inside the SVG (which Figma's createNodeFromSvg completely drops)
  if (hasImage && !hasPattern) {
    const directImageMatches = Array.from(svgString.matchAll(/<image\b([^>]*?)\/?>/gi));
    for (const m of directImageMatches) {
      const attrs = m[1];
      const srcMatch = attrs.match(/(?:xlink:)?href=["'](data:image\/[^"']+)["']/i);
      if (srcMatch) {
        const bytes = decodeBase64Image(srcMatch[1]);
        if (bytes) {
          try {
            const img = figma.createImage(bytes);
            const rect = figma.createRectangle();
            rect.name = 'image';
            const xVal = parseFloat(attrs.match(/\bx=["']([\d.-]+)["']/i)?.[1] || 0);
            const yVal = parseFloat(attrs.match(/\by=["']([\d.-]+)["']/i)?.[1] || 0);
            const wVal = parseFloat(attrs.match(/\bwidth=["']([\d.-]+)["']/i)?.[1] || svgNode.width || 40);
            const hVal = parseFloat(attrs.match(/\bheight=["']([\d.-]+)["']/i)?.[1] || svgNode.height || 40);
            rect.x = xVal;
            rect.y = yVal;
            rect.resize(Math.max(1, wVal), Math.max(1, hVal));
            rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
            svgNode.appendChild(rect);
          } catch {}
        }
      }
    }
  }
}

async function renderSvgTexts(svgNode, sNode) {
  if (!svgNode || !sNode || !Array.isArray(sNode.svgTexts) || !sNode.svgTexts.length) return;
  try {
    const vbMatch = (sNode.content || '').match(/viewBox=["']\s*([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)\s*["']/i);
    const vbW = vbMatch ? parseFloat(vbMatch[3]) : (svgNode.width || 300);
    const vbH = vbMatch ? parseFloat(vbMatch[4]) : (svgNode.height || 300);
    const targetW = sNode._localRect ? sNode._localRect.width : (sNode.rect?.width || svgNode.width || 300);
    const targetH = sNode._localRect ? sNode._localRect.height : (sNode.rect?.height || svgNode.height || 300);
    const scaleX = vbW > 0 ? targetW / vbW : 1;
    const scaleY = vbH > 0 ? targetH / vbH : 1;

    for (const item of sNode.svgTexts) {
      const char = item.char;
      if (!char || !char.trim()) continue;

      const fontObj = await loadFont(item.fontFamily, item.fontWeight || '400', item.fontStyle === 'italic', item.fontStretch, item.visualDensity, item.visualStretch);
      const textNode = figma.createText();
      textNode.fontName = { family: fontObj.family, style: fontObj.style };
      textNode.characters = char;

      if (fontObj.variationSettings && typeof textNode.setRangeFontVariationAxes === 'function') {
        try {
          const axes = Object.entries(fontObj.variationSettings).map(([tag, value]) => ({ tag, value: Number(value) }));
          if (axes.length > 0) textNode.setRangeFontVariationAxes(0, textNode.characters.length, axes);
        } catch (e) {}
      }

      const fSize = Math.max(1, (item.fontSize || 16) * scaleY);
      textNode.fontSize = fSize;

      const fillColor = parseColor(item.fill || '#000000');
      if (fillColor && fillColor.a > 0.005) {
        textNode.fills = [{ type: 'SOLID', color: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, opacity: clamp01(fillColor.a * (item.opacity ?? 1)) }];
      } else {
        textNode.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }];
      }

      textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
      svgNode.appendChild(textNode);

      const fAdvance = (item.advance || fSize * 0.6) * scaleX;
      const svgRad = (item.rot || 0) * (Math.PI / 180);

      const sx = item.x * scaleX;
      const sy = item.y * scaleY;
      const cx_local = fAdvance / 2;
      const cy_local = -fSize * 0.35;

      const cX = sx + cx_local * Math.cos(svgRad) - cy_local * Math.sin(svgRad);
      const cY = sy + cx_local * Math.sin(svgRad) + cy_local * Math.cos(svgRad);

      const rotDeg = -item.rot;
      if (Math.abs(rotDeg) > 0.1) {
        textNode.rotation = rotDeg;
        const rotRad = rotDeg * (Math.PI / 180);
        const charW = textNode.width || fAdvance;
        const charH = textNode.height || fSize;
        const halfCharW = charW / 2;
        const halfCharH = charH / 2;
        const deltaX = halfCharW * Math.cos(rotRad) + halfCharH * Math.sin(rotRad);
        const deltaY = -halfCharW * Math.sin(rotRad) + halfCharH * Math.cos(rotRad);
        textNode.x = Math.round(cX - deltaX);
        textNode.y = Math.round(cY - deltaY);
      } else {
        textNode.x = Math.round(cX - (textNode.width || fAdvance) / 2);
        textNode.y = Math.round(cY - (textNode.height || fSize) / 2);
      }
    }
  } catch (err) {
    console.warn('[HTML-2-Fig] Failed to render SVG texts:', err);
  }
}

function establishesStackingContext(node) {
  if (!node) return false;
  const s = node.styles || {};
  if (s.zIndex && s.zIndex !== 'auto' && (s.position === 'absolute' || s.position === 'relative' || s.position === 'fixed' || s.position === 'sticky')) return true;
  if (s.opacity !== undefined && parseFloat(s.opacity) < 1) return true;
  if (s.transform && s.transform !== 'none') return true;
  if (s.filter && s.filter !== 'none') return true;
  if (s.perspective && s.perspective !== 'none') return true;
  if (s.clipPath && s.clipPath !== 'none') return true;
  if (s.mask && s.mask !== 'none') return true;
  if (s.isolation === 'isolate') return true;
  if (s.contain && (s.contain.includes('paint') || s.contain.includes('layout'))) return true;
  return false;
}

function getEffectiveZIndex(node) {
  if (!node) return 0;
  const s = node.styles || {};
  const zRaw = s.zIndex;
  let selfZ = 0;
  if (zRaw && zRaw !== 'auto') {
    const z = parseInt(zRaw, 10);
    if (!isNaN(z)) selfZ = z * 2; // scale by 2 to leave room for the positioned-auto slot (1)
  } else {
    // CSS spec: positioned elements (absolute/fixed/relative/sticky) with z-index:auto
    // participate in stacking ABOVE non-positioned (static) siblings at the same level.
    const isPositioned = s.position === 'absolute' || s.position === 'fixed' || s.position === 'relative' || s.position === 'sticky';
    if (isPositioned) selfZ = 1;
  }

  // If this element establishes its own stacking context, its children cannot bubble up past it
  if (establishesStackingContext(node)) {
    return selfZ;
  }

  // Non-stacking-context element: check if any child/pseudo raises the effective z-index per CSS stacking rules
  let maxZ = selfZ;
  let minZ = selfZ;
  if (node.pseudoElementNodes?.before) {
    const bZ = getEffectiveZIndex(node.pseudoElementNodes.before);
    if (bZ > maxZ) maxZ = bZ;
    if (bZ < minZ) minZ = bZ;
  }
  if (node.pseudoElementNodes?.after) {
    const aZ = getEffectiveZIndex(node.pseudoElementNodes.after);
    if (aZ > maxZ) maxZ = aZ;
    if (aZ < minZ) minZ = aZ;
  }
  if (node.childNodes && node.childNodes.length > 0) {
    for (const child of node.childNodes) {
      const cZ = getEffectiveZIndex(child);
      if (cZ > maxZ) maxZ = cZ;
      if (cZ < minZ) minZ = cZ;
    }
  }
  return maxZ !== 0 ? maxZ : minZ;
}

async function renderNode(sNode, parentFrame, parentX, parentY, assets, inheritedStyles, inheritedTextClip = null) {
  if (!sNode) return;

  if (sNode.nodeType === 3 /* TEXT */) {
    await renderTextNode(sNode, parentFrame, parentX, parentY, inheritedStyles, inheritedTextClip);
    reportProgress();
    return;
  }

  const s = sNode.styles || inheritedStyles || {};
  let currentTextClip = inheritedTextClip;
  if (isBackgroundClipText(s)) {
    currentTextClip = s;
  }

  if (sNode.id && (sNode.id.includes('text-symbol-wrap') || sNode.id.includes('text-wrap'))) {
    s.borderTopWidth = '0px';
    s.borderRightWidth = '0px';
    s.borderBottomWidth = '0px';
    s.borderLeftWidth = '0px';
    s.borderTopStyle = 'none';
    s.borderRightStyle = 'none';
    s.borderBottomStyle = 'none';
    s.borderLeftStyle = 'none';
    s.boxShadow = 'none';
    s.textDecoration = 'none';
    s.textDecorationLine = 'none';
  }
  const x = sNode._localRect ? sNode._localRect.x : Math.round((sNode.rect?.x || 0) - parentX);
  const y = sNode._localRect ? sNode._localRect.y : Math.round((sNode.rect?.y || 0) - parentY);
  const w = Math.max(1, sNode._localRect ? sNode._localRect.width : Math.round(sNode.rect?.width || 0));
  const h = Math.max(1, sNode._localRect ? sNode._localRect.height : Math.round(sNode.rect?.height || 0));

  // SVG Vector element
  if (sNode.content && (sNode.tag === 'SVG' || sNode.content.includes('<svg'))) {
    try {
      let angleDeg = 0;
      let flipX = false;
      let flipY = false;
      if (s.transform && s.transform.includes('matrix')) {
        const mat = parseCssTransformMatrix(s.transform);
        if (mat) {
          angleDeg = mat.angleDeg;
          flipX = mat.flipX;
          flipY = mat.flipY;
        }
      }

      let cleanSvg = prepareSvgString(sNode.content, hasInvertFilter(s.filter));
      if (flipX || flipY) {
        cleanSvg = applySvgFlip(cleanSvg, flipX, flipY);
      }
      const svgNode = figma.createNodeFromSvg(cleanSvg);
      svgNode.name = (sNode.tag || 'node').toLowerCase();
      hydrateSvgPatterns(svgNode, sNode.content);
      if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
        try { svgNode.resize(w, h); } catch {}
      }
      if (s.position === 'absolute' || s.position === 'fixed') {
        try { svgNode.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
      }
      parentFrame.appendChild(svgNode);
      try {
        await renderSvgTexts(svgNode, sNode);
      } catch (e) {
        console.warn('[HTML-2-Fig] SVG text rendering error:', e);
      }
      if (Math.abs(angleDeg) > 0.1 && Math.abs(parentFrame.rotation || 0) < 0.1) {
        const rotDeg = -angleDeg;
        svgNode.rotation = rotDeg;
        const rad = rotDeg * (Math.PI / 180);
        const nodeW = svgNode.width;
        const nodeH = svgNode.height;
        const halfW = nodeW / 2;
        const halfH = nodeH / 2;
        const cX = x + halfW;
        const cY = y + halfH;
        const dx = halfW * Math.cos(rad) + halfH * Math.sin(rad);
        const dy = -halfW * Math.sin(rad) + halfH * Math.cos(rad);
        svgNode.x = Math.round(cX - dx);
        svgNode.y = Math.round(cY - dy);
      } else {
        svgNode.x = x;
        svgNode.y = y;
      }
      applyOpacity(svgNode, s);

      const hasBg = (s.backgroundColor && s.backgroundColor !== 'transparent' && s.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
                    (s.backgroundImage && s.backgroundImage !== 'none');
      const hasBorder = (s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') ||
                        (s.borderRightWidth && parseFloat(s.borderRightWidth) > 0 && s.borderRightStyle !== 'none') ||
                        (s.borderBottomWidth && parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none') ||
                        (s.borderLeftWidth && parseFloat(s.borderLeftWidth) > 0 && s.borderLeftStyle !== 'none');
      const hasRadius = (s.borderRadius && s.borderRadius !== '0px' && s.borderRadius !== '0');

      if (hasBg || hasBorder || hasRadius) {
        const bgFrame = figma.createFrame();
        bgFrame.name = (sNode.tag || 'svg-wrap').toLowerCase();
        if (s.position === 'absolute' || s.position === 'fixed') {
          try { bgFrame.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
        }
        parentFrame.appendChild(bgFrame);
        bgFrame.x = svgNode.x;
        bgFrame.y = svgNode.y;
        bgFrame.resize(Math.max(1, w), Math.max(1, h));
        bgFrame.clipsContent = true;
        await applyFills(bgFrame, s, assets, w, h, true);
        applyStrokes(bgFrame, s);
        applyEffects(bgFrame, s);
        applyCornerRadius(bgFrame, s);
        applyOpacity(bgFrame, s);
        
        // Move svgNode inside the bgFrame centered
        bgFrame.appendChild(svgNode);
        svgNode.x = Math.round((w - svgNode.width) / 2);
        svgNode.y = Math.round((h - svgNode.height) / 2);
      }

      reportProgress();
      return;
    } catch (err) {
      console.warn('[HTML-2-Fig] Svg vector parse failed, creating fallback frame:', err);
      const svgFrame = figma.createFrame();
      svgFrame.name = (sNode.tag || 'svg').toLowerCase();
      parentFrame.appendChild(svgFrame);
      svgFrame.x = x; svgFrame.y = y;
      svgFrame.resize(w, h);
      reportProgress();
      return;
    }
  }

  // IMG element
  if (sNode.tag === 'IMG') {
    const attrs = sNode.attributes || {};
    const hasRasterPlaceholder = sNode.placeholderUrl && !sNode.placeholderUrl.includes('image/svg+xml');
    const imgUrl = hasRasterPlaceholder
      ? sNode.placeholderUrl
      : (attrs.currentSrc || attrs.src || attrs['data-src'] || attrs['data-lazy-src'] || attrs['data-original'] || '');
    const isSvg = !hasRasterPlaceholder && (
      (imgUrl && (imgUrl.includes('.svg') || imgUrl.startsWith('data:image/svg+xml'))) ||
      (attrs.src && attrs.src.includes('.svg')) ||
      (attrs.currentSrc && attrs.currentSrc.includes('.svg'))
    );
    let blobObj;
    if (imgUrl && imgUrl.startsWith('data:')) {
      blobObj = imgUrl;
    } else if (hasRasterPlaceholder) {
      blobObj = sNode.placeholderUrl;
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
              if (key.includes(filename) || (filename.includes('wave') && key.includes('wave'))) {
                assetData = assets[key];
                break;
              }
            }
          }
        }
        if (!assetData && assets) {
          // If direct match failed, grab first wave-fallback asset if tag/class suggests hero wave
          const isWave = (attrs.class && attrs.class.includes('wave')) || (imgUrl && imgUrl.includes('wave'));
          if (isWave) {
            for (const key of Object.keys(assets)) {
              if (key.includes('wave-fallback') || key.includes('wave')) {
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
        const header = bytesToString(bytes.slice(0, 100)).toLowerCase();
        if (isSvg || header.includes('<svg') || header.includes('<?xml')) {
          try {
            const svgString = bytesToString(bytes);

            const cleanSvg = prepareSvgString(svgString, hasInvertFilter(s.filter));
            const svgNode = figma.createNodeFromSvg(cleanSvg);
            svgNode.name = sNode.attributes?.alt || 'img-svg';
            hydrateSvgPatterns(svgNode, svgString);
            if (s.position === 'absolute' || s.position === 'fixed') {
              try { svgNode.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
            }
            parentFrame.appendChild(svgNode);
            svgNode.x = x; svgNode.y = y;
            if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
              try { svgNode.resize(w, h); } catch {}
            }
            applyOpacity(svgNode, s);

            const hasBg = (s.backgroundColor && s.backgroundColor !== 'transparent' && s.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
                          (s.backgroundImage && s.backgroundImage !== 'none');
            const hasBorder = (s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') ||
                              (s.borderRightWidth && parseFloat(s.borderRightWidth) > 0 && s.borderRightStyle !== 'none') ||
                              (s.borderBottomWidth && parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none') ||
                              (s.borderLeftWidth && parseFloat(s.borderLeftWidth) > 0 && s.borderLeftStyle !== 'none');
            const hasRadius = (s.borderRadius && s.borderRadius !== '0px' && s.borderRadius !== '0');

            if (hasBg || hasBorder || hasRadius) {
              const bgFrame = figma.createFrame();
              bgFrame.name = (sNode.attributes?.alt || 'img-svg-wrap').toLowerCase();
              if (s.position === 'absolute' || s.position === 'fixed') {
                try { bgFrame.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
              }
              parentFrame.appendChild(bgFrame);
              bgFrame.x = svgNode.x;
              bgFrame.y = svgNode.y;
              bgFrame.resize(Math.max(1, w), Math.max(1, h));
              bgFrame.clipsContent = true;
              await applyFills(bgFrame, s, assets, w, h, true);
              applyStrokes(bgFrame, s);
              applyEffects(bgFrame, s);
              applyCornerRadius(bgFrame, s);
              applyOpacity(bgFrame, s);

              // Move svgNode inside bgFrame centered
              bgFrame.appendChild(svgNode);
              svgNode.x = Math.round((w - svgNode.width) / 2);
              svgNode.y = Math.round((h - svgNode.height) / 2);
            }

            reportProgress();
            return;
          } catch (svgErr) {
            console.warn('[HTML-2-Fig] SVG import failed, creating SVG frame fallback:', svgErr);
            const svgFrame = figma.createFrame();
            svgFrame.name = sNode.attributes?.alt || 'img-svg';
            parentFrame.appendChild(svgFrame);
            svgFrame.x = x; svgFrame.y = y;
            svgFrame.resize(w, h);
            reportProgress();
            return;
          }
        }

          const hasMask = (s.maskImage && s.maskImage !== 'none') || (s.webkitMaskImage && s.webkitMaskImage !== 'none');
          if (hasMask) {
            const imgFrame = figma.createFrame();
            imgFrame.name = sNode.attributes?.alt || 'img-masked';
            parentFrame.appendChild(imgFrame);
            imgFrame.x = x; imgFrame.y = y;
            imgFrame.resize(w, h);
            imgFrame.clipsContent = true;
            await applyFills(imgFrame, s, assets, w, h, true);
            const rect = figma.createRectangle();
            rect.name = sNode.attributes?.alt || 'img';
            if (s.position === 'absolute' || s.position === 'fixed') {
              try { rect.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
            }
            imgFrame.appendChild(rect);
            rect.x = 0; rect.y = 0;
            rect.resize(w, h);
            const img = figma.createImage(bytes);
            const objFit = (s.objectFit || 'fill').toLowerCase().trim();
            let fillScaleMode = 'CROP';
            let fillTransform = [[1, 0, 0], [0, 1, 0]];
            if (objFit === 'cover') {
              fillScaleMode = 'FILL';
              fillTransform = undefined;
            } else if (objFit === 'contain' || objFit === 'scale-down') {
              fillScaleMode = 'FIT';
              fillTransform = undefined;
            } else if (objFit === 'none') {
              fillScaleMode = 'FIT'; // fallback
              fillTransform = undefined;
            }
            const fillDef = { type: 'IMAGE', imageHash: img.hash, scaleMode: fillScaleMode };
            if (fillTransform) fillDef.imageTransform = fillTransform;
            rect.fills = [fillDef];
            applyStrokes(imgFrame, s);
            applyEffects(imgFrame, s);
            applyCornerRadius(imgFrame, s);
            applyOpacity(imgFrame, s);
            reportProgress();
            return;
          }

          const rect = figma.createRectangle();
          rect.name = sNode.attributes?.alt || 'img';
          if (s.position === 'absolute' || s.position === 'fixed') {
            try { rect.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
          }
          parentFrame.appendChild(rect);
          rect.x = x; rect.y = y;
          rect.resize(w, h);
          const img = figma.createImage(bytes);
          const objFit = (s.objectFit || 'fill').toLowerCase().trim();
          const isIconImg = (sNode.id && sNode.id.includes('icon')) || sNode.attributes?.alt === 'icon';
          let fillScaleMode = isIconImg ? 'FIT' : 'CROP';
          let fillTransform = isIconImg ? undefined : [[1, 0, 0], [0, 1, 0]];
          if (objFit === 'cover') {
            fillScaleMode = 'FILL';
            fillTransform = undefined;
          } else if (objFit === 'contain' || objFit === 'scale-down') {
            fillScaleMode = 'FIT';
            fillTransform = undefined;
          } else if (objFit === 'none') {
            fillScaleMode = 'FIT';
            fillTransform = undefined;
          }
          const fillDef = { type: 'IMAGE', imageHash: img.hash, scaleMode: fillScaleMode };
          if (fillTransform) fillDef.imageTransform = fillTransform;
          rect.fills = [];
          await applyFills(rect, s, assets, w, h, true);
          let currentFills = [];
          if (rect.fills && Array.isArray(rect.fills)) {
            currentFills = [...rect.fills];
          }
          currentFills.push(fillDef);
          rect.fills = currentFills;
          applyStrokes(rect, s);
          applyEffects(rect, s);
          applyCornerRadius(rect, s);
          
          let angleDeg = 0;
          if (s.transform && s.transform.includes('matrix') && Math.abs(parentFrame.rotation || 0) < 0.1) {
            const parts = s.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
            if (parts) {
              const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
              angleDeg = Math.atan2(vals[1], vals[0]) * (180 / Math.PI);
            }
          }
          if (Math.abs(angleDeg) > 0.1) {
            const rotDeg = -angleDeg;
            rect.rotation = rotDeg;
            const rad = rotDeg * (Math.PI / 180);
            const halfW = w / 2;
            const halfH = h / 2;
            const cX = x + halfW;
            const cY = y + halfH;
            const dx = halfW * Math.cos(rad) + halfH * Math.sin(rad);
            const dy = -halfW * Math.sin(rad) + halfH * Math.cos(rad);
            rect.x = Math.round(cX - dx);
            rect.y = Math.round(cY - dy);
          } else {
            rect.x = x;
            rect.y = y;
          }
          
          applyOpacity(rect, s);
          reportProgress();
          return;
        }
      }
    }

  // Canvas / Video placeholder element
  if (sNode.placeholderUrl) {
    let assetData = assets?.[sNode.placeholderUrl];
    if (!assetData && assets) {
      const filename = sNode.placeholderUrl.split('/').pop()?.split('?')[0];
      for (const key of Object.keys(assets)) {
        if ((filename && key.includes(filename)) ||
            (sNode.placeholderUrl.includes('developer-wave') && (key.includes('developer-wave') || key.includes('wave-wide')))) {
          assetData = assets[key];
          break;
        }
      }
    }
    const blobObj = assetData?.blob || assetData?.base64Blob || assetData;
    if (blobObj) {
      const bytes = decodeBase64Image(blobObj);
      if (bytes) {
        try {
          const header = bytesToString(bytes.slice(0, 100)).toLowerCase();
          if (header.includes('<svg') || header.includes('<?xml')) {
            const svgString = bytesToString(bytes);
            const cleanSvg = prepareSvgString(svgString, hasInvertFilter(s.filter));
            const svgNode = figma.createNodeFromSvg(cleanSvg);
            svgNode.name = (sNode.tag || 'node').toLowerCase();
            if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
              try { svgNode.resize(w, h); } catch {}
            }
            await renderSvgTexts(svgNode, sNode);
            parentFrame.appendChild(svgNode);
            svgNode.x = x; svgNode.y = y;
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

  // Detect elements that are purely horizontal/vertical dotted/dashed line separators.
  // Common CSS pattern: height:0 (or ≤4px, or flex spacer with no children/text), border-bottom/top: 1px dotted/dashed, no left/right borders.
  // These MUST be Figma Vector nodes (not Frames or Rectangles) so dashPattern and strokeCap work correctly without 4-sided borders.
  if (w > 0) {
    const bTop   = (s.borderTopStyle   && s.borderTopStyle   !== 'none' && s.borderTopStyle   !== 'hidden') ? (parseFloat(s.borderTopWidth)   || 0) : 0;
    const bBot   = (s.borderBottomStyle && s.borderBottomStyle !== 'none' && s.borderBottomStyle !== 'hidden') ? (parseFloat(s.borderBottomWidth) || 0) : 0;
    const bLeft  = (s.borderLeftStyle  && s.borderLeftStyle  !== 'none' && s.borderLeftStyle  !== 'hidden') ? (parseFloat(s.borderLeftWidth)  || 0) : 0;
    const bRight = (s.borderRightStyle && s.borderRightStyle !== 'none' && s.borderRightStyle !== 'hidden') ? (parseFloat(s.borderRightWidth) || 0) : 0;

    const topDotted  = bTop  > 0 && (s.borderTopStyle   === 'dotted' || s.borderTopStyle   === 'dashed');
    const botDotted  = bBot  > 0 && (s.borderBottomStyle === 'dotted' || s.borderBottomStyle === 'dashed');
    const leftDotted = bLeft > 0 && (s.borderLeftStyle   === 'dotted' || s.borderLeftStyle   === 'dashed');
    const rightDotted= bRight> 0 && (s.borderRightStyle  === 'dotted' || s.borderRightStyle  === 'dashed');

    const isSpacer = (!sNode.childNodes || sNode.childNodes.length === 0) &&
                     (!sNode.text || !sNode.text.trim()) &&
                     (!s.backgroundColor || s.backgroundColor === 'transparent' || s.backgroundColor === 'rgba(0, 0, 0, 0)') &&
                     (!s.backgroundImage || s.backgroundImage === 'none');

    const isHorizDash = (h <= 4 || isSpacer) && (topDotted || botDotted) && bLeft === 0 && bRight === 0;
    const isVertDash  = (w <= 4 || isSpacer) && (leftDotted || rightDotted) && bTop === 0 && bBot === 0;

    const isRadialDash = (h <= 6 || isSpacer) && (
      (s.backgroundImage && (s.backgroundImage.includes('radial-gradient') || s.backgroundImage.includes('repeating-linear-gradient'))) ||
      (s.background && (s.background.includes('radial-gradient') || s.background.includes('repeating-linear-gradient')))
    ) && (!sNode.childNodes || sNode.childNodes.length === 0) && (!sNode.text || !sNode.text.trim());

    if (isHorizDash || isVertDash || isRadialDash) {
      try {
        let borderW  = 1;
        let styleStr = 'dotted';
        let colorStr = s.color || '#000000';
        let dashPattern = [3, 3];
        let strokeCap = 'NONE';

        if (isRadialDash) {
          const bgStr = s.backgroundImage || s.background || '';
          const mColor = bgStr.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})/i);
          if (mColor) colorStr = mColor[1];

          let step = 5;
          const bgSize = (s.backgroundSize || '').trim();
          const sizeM = bgSize.match(/([\d.]+)px/);
          if (sizeM) {
            step = Math.max(2, parseFloat(sizeM[1]));
          } else {
            const radM = bgStr.match(/([\d.]+)px/);
            if (radM) step = Math.max(2, parseFloat(radM[1]) * 4);
          }

          const radM2 = bgStr.match(/([\d.]+)px/);
          const dotRadius = radM2 ? parseFloat(radM2[1]) : 1;
          borderW = Math.max(1, Math.min(Math.round(h) || 1, Math.round(dotRadius * 2)));

          dashPattern = [0.01, Math.max(2, step)];
          styleStr = 'dotted';
          strokeCap = 'ROUND';
        } else {
          borderW = isHorizDash ? Math.max(bTop, bBot) : Math.max(bLeft, bRight);
          styleStr = isHorizDash
            ? (topDotted ? s.borderTopStyle : s.borderBottomStyle)
            : (leftDotted ? s.borderLeftStyle : s.borderRightStyle);
          colorStr = isHorizDash
            ? (topDotted ? s.borderTopColor : s.borderBottomColor)
            : (leftDotted ? s.borderLeftColor : s.borderRightColor);

          if (styleStr === 'dashed') {
            dashPattern = [borderW * 3, borderW * 3];
            strokeCap = 'NONE';
          } else if (styleStr === 'dotted') {
            dashPattern = [0.01, borderW * 2.5];
            strokeCap = 'ROUND';
          }
        }

        const dashColor = parseColor(colorStr || s.color || '#000000');
        if (dashColor && dashColor.a > 0.005) {
          const vecNode = figma.createVector();
          vecNode.name = (sNode.attributes?.class || sNode.tag || 'div').toLowerCase() + '-' + styleStr;
          parentFrame.appendChild(vecNode);

          const lineW = Math.max(1, borderW);
          if (isHorizDash || isRadialDash) {
            vecNode.vectorPaths = [{ windingRule: 'NONE', data: `M 0 0 L ${Math.max(1, w)} 0` }];
            vecNode.x = x;
            vecNode.y = isRadialDash ? Math.round(y + h / 2) : (isSpacer && h > 4 ? y + h / 2 : y + (topDotted ? 0 : h));
          } else {
            vecNode.vectorPaths = [{ windingRule: 'NONE', data: `M 0 0 L 0 ${Math.max(1, h)}` }];
            vecNode.x = isSpacer && w > 4 ? x + w / 2 : x + (leftDotted ? 0 : w);
            vecNode.y = y;
          }

          vecNode.strokes = [{ type: 'SOLID', color: { r: dashColor.r, g: dashColor.g, b: dashColor.b }, opacity: clamp01(dashColor.a) }];
          vecNode.strokeWeight = lineW;
          vecNode.dashPattern = dashPattern;
          try { vecNode.strokeCap = strokeCap; } catch {}

          applyOpacity(vecNode, s);
          reportProgress();
          return;
        }
      } catch {}
    }
  }

  // Frame container
  const frame = figma.createFrame();
  if (s.position === 'absolute' || s.position === 'fixed') {
    try { frame.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
  }
  frame.name = sNode.tag ? sNode.tag.toLowerCase() : 'div';
  if (sNode.attributes && sNode.attributes.class) {
    frame.name += `.${sNode.attributes.class.replace(/\s+/g, '.')}`;
  }
  parentFrame.appendChild(frame);
  frame.x = x;
  frame.y = y;

  let rectW = w;
  let rectH = h;

  // Apply CSS transform rotation (e.g. rotated ribbons, badges, polaroid cards)
  let angleDeg = 0;
  const isVerticalFlow = (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr');
  if (s.transform && s.transform.includes('matrix')) {
    const parts = s.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (parts) {
      const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
      let a = vals[0], b = vals[1];
      const tAngle = Math.atan2(b, a) * (180 / Math.PI);
      // If the container has vertical text flow, vertical-rl already defines its vertical layout box.
      // A 180deg transform on it is the standard web pattern to invert text direction to bottom-to-top.
      // The frame itself must remain axis-aligned; the rotation is applied to the text inside.
      if (isVerticalFlow && Math.abs(Math.abs(tAngle) - 180) < 1) {
        angleDeg = 0;
      } else {
        angleDeg = tAngle;
      }
    }
  } else if (!isVerticalFlow && s.rotate && s.rotate !== 'none') {
    const r = s.rotate.trim().toLowerCase();
    if (r.includes('deg')) angleDeg = parseFloat(r);
    else if (r.includes('rad')) angleDeg = (parseFloat(r) * 180) / Math.PI;
    else if (r.includes('turn')) angleDeg = parseFloat(r) * 360;
  }

  if (Math.abs(angleDeg) > 0.1) {
    const rotDeg = -angleDeg; // Figma rotation is negative of CSS
    const rotRad = rotDeg * (Math.PI / 180);

    // Compute true unrotated dimensions (CSS transforms do not alter offsetWidth/Height)
    let unrotatedW = sNode.rect?.offsetWidth || 0;
    let unrotatedH = sNode.rect?.offsetHeight || 0;
    if (unrotatedW <= 0 || unrotatedH <= 0) {
      const rad = Math.abs(angleDeg) * (Math.PI / 180);
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      const det = cosA * cosA - sinA * sinA;
      if (Math.abs(det) > 0.05 && Math.abs(angleDeg) < 45) {
        unrotatedW = (w * cosA - h * sinA) / det;
        unrotatedH = (h * cosA - w * sinA) / det;
      } else if (Math.abs(Math.abs(angleDeg) - 90) < 1) {
        unrotatedW = h;
        unrotatedH = w;
      } else {
        unrotatedW = w;
        unrotatedH = h;
      }
    }
    rectW = Math.max(1, Math.round(unrotatedW));
    rectH = Math.max(1, Math.round(unrotatedH));

    // Element's center in parentFrame's coordinate space
    const centerInParentX = sNode._localRect
      ? (sNode._localRect.x + sNode._localRect.width / 2)
      : (Math.round((sNode.rect?.x || 0) - parentX) + (sNode.rect?.width || 0) / 2);
    const centerInParentY = sNode._localRect
      ? (sNode._localRect.y + sNode._localRect.height / 2)
      : (Math.round((sNode.rect?.y || 0) - parentY) + (sNode.rect?.height || 0) / 2);

    // In Figma, node.rotation rotates around its top-left corner.
    // Place frame.x and frame.y so the center of the rotated frame matches the element center:
    const halfW = rectW / 2;
    const halfH = rectH / 2;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const deltaX = halfW * cosR + halfH * sinR;
    const deltaY = -halfW * sinR + halfH * cosR;

    frame.x = Math.round(centerInParentX - deltaX);
    frame.y = Math.round(centerInParentY - deltaY);
    frame.rotation = rotDeg;

    // Map children from global screen coordinates into this frame's unrotated local coordinate system
    const mapToLocal = (childNode) => {
      if (!childNode || !childNode.rect) return;
      const childGX = (childNode.rect.x || 0) + (childNode.rect.width || 0) / 2;
      const childGY = (childNode.rect.y || 0) + (childNode.rect.height || 0) / 2;
      const globalCenterX = (sNode.rect?.x || 0) + (sNode.rect?.width || 0) / 2;
      const globalCenterY = (sNode.rect?.y || 0) + (sNode.rect?.height || 0) / 2;
      const dX = childGX - globalCenterX;
      const dY = childGY - globalCenterY;
      const localDX = dX * cosR - dY * sinR;
      const localDY = dX * sinR + dY * cosR;

      // If parent is a flex container centering its items or has single child/pseudo, check if child is centered in parent
      const pDisplay = (sNode.styles?.display || '');
      const pAlign = (sNode.styles?.alignItems || '');
      const pJustify = (sNode.styles?.justifyContent || '');
      const isCenteredParent = (pDisplay.includes('flex') && (pAlign === 'center' || pAlign === '') && (pJustify === 'center' || pJustify === '')) ||
                               (sNode.styles?.textAlign === 'center');
      
      let childLCX = halfW + localDX;
      let childLCY = halfH + localDY;
      if (isCenteredParent && (!sNode.childNodes || sNode.childNodes.length === 0)) {
        childLCX = halfW;
        childLCY = halfH;
      }

      let cW = Math.round(childNode.rect.width || 0);
      let cH = Math.round(childNode.rect.height || 0);

      childNode._localRect = {
        x: Math.round(childLCX - cW / 2),
        y: Math.round(childLCY - cH / 2),
        width: cW,
        height: cH
      };
    };

    if (sNode.pseudoElementNodes?.before) mapToLocal(sNode.pseudoElementNodes.before);
    if (sNode.pseudoElementNodes?.after) mapToLocal(sNode.pseudoElementNodes.after);
    if (sNode.childNodes) {
      for (const child of sNode.childNodes) {
        mapToLocal(child);
      }
    }
  } else {
    // Unrotated container: center single child or pseudo if parent is an icon container or centers alignment
    const isIconContainer = (rectW <= 64 && rectH <= 64 && Math.abs(rectW - rectH) <= 6 && (parseFloat(s.borderRadius) >= 4 || s.borderRadius === '50%' || s.borderRadius === '500px')) ||
                            (sNode.name && sNode.name.includes('icon')) ||
                            (sNode.id && sNode.id.includes('icon'));
    const isCentered = isIconContainer || s.textAlign === 'center' ||
                       (s.display && s.display.includes('flex') && s.alignItems === 'center' && (s.justifyContent === 'center' || s.justifyContent === 'normal'));

    const directChildren = [];
    if (sNode.pseudoElementNodes?.before) directChildren.push(sNode.pseudoElementNodes.before);
    if (sNode.childNodes) { for (let i = 0; i < sNode.childNodes.length; i++) directChildren.push(sNode.childNodes[i]); }
    if (sNode.pseudoElementNodes?.after) directChildren.push(sNode.pseudoElementNodes.after);

    if (isCentered && directChildren.length === 1) {
      const onlyChild = directChildren[0];
      const cW = Math.max(1, Math.round(onlyChild.rect?.width || 0));
      const cH = Math.max(1, Math.round(onlyChild.rect?.height || 0));
      const isChildIcon = (onlyChild.tag === 'I' || onlyChild.tag === 'SVG' || (onlyChild.id && onlyChild.id.includes('icon')) || (onlyChild.attributes?.alt === 'icon'));

      if (isIconContainer || isChildIcon) {
        onlyChild._localRect = {
          x: Math.round((rectW - cW) / 2),
          y: Math.round((rectH - cH) / 2),
          width: cW,
          height: cH
        };
      }
    }
  }

  // If this is a zero-height (or zero-width) element that has visible border strokes
  // (a common CSS pattern for dotted/dashed leader lines: height:0 + border-bottom),
  // expand the frame to at least the stroke weight so Figma can render the stroke.
  if (rectH < 1) {
    const bTop = (s.borderTopStyle && s.borderTopStyle !== 'none') ? (parseFloat(s.borderTopWidth) || 0) : 0;
    const bBot = (s.borderBottomStyle && s.borderBottomStyle !== 'none') ? (parseFloat(s.borderBottomWidth) || 0) : 0;
    const maxB = Math.max(bTop, bBot);
    if (maxB > 0) rectH = Math.max(1, maxB);
  }
  if (rectW < 1) {
    const bLeft = (s.borderLeftStyle && s.borderLeftStyle !== 'none') ? (parseFloat(s.borderLeftWidth) || 0) : 0;
    const bRight = (s.borderRightStyle && s.borderRightStyle !== 'none') ? (parseFloat(s.borderRightWidth) || 0) : 0;
    const maxB = Math.max(bLeft, bRight);
    if (maxB > 0) rectW = Math.max(1, maxB);
  }

  frame.resize(rectW, rectH);
  const clipValues = ['hidden', 'clip', 'auto', 'scroll'];
  const isPageLevelWrapper = sNode.attributes?.id === 'smooth-wrapper' ||
                             sNode.attributes?.id === 'smooth-content' ||
                             (sNode.attributes?.class && /dialog-off-canvas|my-app|page-wrapper|main-wrapper|site-wrapper|root-wrapper/i.test(sNode.attributes.class));
  frame.clipsContent = !isPageLevelWrapper && (clipValues.includes(s.overflow) || clipValues.includes(s.overflowX) || clipValues.includes(s.overflowY));

  const hasChildren = (sNode.childNodes && sNode.childNodes.length > 0) || (sNode.pseudoElementNodes?.after != null);
  await applyFills(frame, s, assets, rectW, rectH, hasChildren);
  applyStrokes(frame, s);
  applyEffects(frame, s);
  applyCornerRadius(frame, s);
  applyOpacity(frame, s);
  applyBlendMode(frame, s);

  const allChildren = [];
  if (sNode.pseudoElementNodes?.before) allChildren.push(sNode.pseudoElementNodes.before);
  if (sNode.childNodes) { for (let i = 0; i < sNode.childNodes.length; i++) allChildren.push(sNode.childNodes[i]); }
  if (sNode.pseudoElementNodes?.after) allChildren.push(sNode.pseudoElementNodes.after);

  const hasBackdropChild = allChildren.some(isBackdropNode);
  if (!hasBackdropChild && allChildren.length > 1) {
    allChildren.forEach((child, idx) => { child._origIdx = idx; });
    allChildren.sort((a, b) => {
      const zA = getEffectiveZIndex(a);
      const zB = getEffectiveZIndex(b);
      const diff = zA - zB;
      return diff !== 0 ? diff : a._origIdx - b._origIdx;
    });
  }

  for (const child of allChildren) {
    await renderNode(child, frame, sNode.rect?.x || 0, sNode.rect?.y || 0, assets, s, currentTextClip);
  }

  if (sNode.text && sNode.text.trim()) {
    await renderTextNode(sNode, frame, sNode.rect?.x || 0, sNode.rect?.y || 0, s, currentTextClip);
  }

  reportProgress();
}

async function renderTextNode(sNode, parentFrame, parentX, parentY, inheritedStyles, inheritedTextClip = null) {
  const s = sNode.styles || inheritedStyles || parentFrame.styles || {};
  let text = (sNode.text || '');
  const ws = s.whiteSpace || 'normal';
  if (ws === 'normal' || ws === 'nowrap') {
    text = text.replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/ +/g, ' ');
  } else if (ws === 'pre-line') {
    text = text.replace(/[ \t\f\v]+/g, ' ').replace(/[\u2028\u2029]/g, '\n');
  }
  text = text.trim();
  if (!text) return;

  const textNode = figma.createText();
  if (s.position === 'absolute' || s.position === 'fixed') {
    try { textNode.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
  }
  const fontObj = await loadFont(s.fontFamily, s.fontWeight || '400', s.fontStyle === 'italic', s.fontStretch, s.visualDensity, s.visualStretch);
  textNode.fontName = { family: fontObj.family, style: fontObj.style };

  let finalText = text;
  if (s.textTransform === 'uppercase') finalText = text.toUpperCase();
  else if (s.textTransform === 'lowercase') finalText = text.toLowerCase();
  // Append Unicode Variation Selector-15 (\uFE0E - text presentation) to symbol and arrow characters
  // so text layout engines don't fall back to colorful OS emoji fonts (like Segoe UI Emoji / Apple Color Emoji)
  finalText = finalText.replace(/([\u2190-\u21FF\u25A0-\u27BF\u2B00-\u2BFF])(?!\uFE0E)/g, '$1\uFE0E');
  textNode.characters = finalText;

  const fontSize = parseFloat(s.fontSize) || 16;
  textNode.fontSize = fontSize;

  // Apply variable font variation settings (such as wght and wdth for Roboto Flex) if present
  if (fontObj.variationSettings && typeof textNode.setRangeFontVariationAxes === 'function') {
    try {
      const axes = [];
      for (const [axis, val] of Object.entries(fontObj.variationSettings)) {
        axes.push({ tag: axis, value: Number(val) });
      }
      if (axes.length > 0) {
        textNode.setRangeFontVariationAxes(0, textNode.characters.length, axes);
      }
    } catch (e) {}
  }

  const dec = (s.textDecorationLine || s.textDecoration || '').toLowerCase();
  
  let ancestorHasBorderBottom = false;
  let curr = parentFrame;
  let depth = 0;
  while (curr && curr.type !== 'PAGE' && curr.type !== 'DOCUMENT' && depth < 4) {
    try {
      if (curr.strokes && curr.strokes.length > 0) {
        if (curr.strokeBottomWeight > 0 && curr.strokeTopWeight === 0 && curr.strokeLeftWeight === 0 && curr.strokeRightWeight === 0) {
          ancestorHasBorderBottom = true;
          break;
        }
      }
    } catch (e) {}
    if (curr.children) {
      const borderLines = curr.children.filter(c => c.type === 'VECTOR' && c.name && c.name.endsWith('-border'));
      if (borderLines.length === 1 && borderLines[0].y >= curr.height / 2) {
        ancestorHasBorderBottom = true;
        break;
      }
    }
    curr = curr.parent;
    depth++;
  }

  if (dec.includes('underline') && !ancestorHasBorderBottom) {
    try { textNode.textDecoration = 'UNDERLINE'; } catch {}
  } else if (dec.includes('line-through')) {
    try { textNode.textDecoration = 'STRIKETHROUGH'; } catch {}
  }

  const isMultiLine = sNode.lineCount && sNode.lineCount > 1;
  let figmaLineHeight = null;
  if (s.lineHeight && s.lineHeight !== 'normal') {
    const lh = parseFloat(s.lineHeight);
    if (!isNaN(lh)) {
      textNode.lineHeight = { value: lh, unit: 'PIXELS' };
      figmaLineHeight = lh;
    }
  }

  if (s.letterSpacing && s.letterSpacing !== 'normal' && s.letterSpacing !== '0px') {
    const rawLs = String(s.letterSpacing).trim();
    if (rawLs.endsWith('em')) {
      const emVal = parseFloat(rawLs);
      if (!isNaN(emVal)) {
        textNode.letterSpacing = { value: emVal * 100, unit: 'PERCENT' };
      }
    } else {
      const pxVal = parseFloat(rawLs);
      if (!isNaN(pxVal)) {
        textNode.letterSpacing = { value: pxVal, unit: 'PIXELS' };
      }
    }
  }

  const alignMap = { 'left': 'LEFT', 'start': 'LEFT', 'center': 'CENTER', 'right': 'RIGHT', 'end': 'RIGHT', 'justify': 'JUSTIFIED' };
  const isSlicedLine = !!(sNode.id && sNode.id.includes('text-line'));
  textNode.textAlignHorizontal = isSlicedLine ? 'LEFT' : (alignMap[s.textAlign] || 'LEFT');

  let isTextClip = isBackgroundClipText(s);
  let clipStyle = s;
  if (!isTextClip && inheritedTextClip) {
    isTextClip = true;
    clipStyle = inheritedTextClip;
  }

  // Determine if this is outline-only text (transparent fill + webkit-text-stroke)
  const hasTextStroke = s.webkitTextStrokeWidth && parseFloat(s.webkitTextStrokeWidth) > 0;
  const fillColorRaw = s.webkitTextFillColor || s.color || '#000000';
  const fillColor = parseColor(fillColorRaw);
  const fillIsTransparent = !fillColor || fillColor.a < 0.005;

  if (isTextClip) {
    const textFills = [];
    const bg = parseColor(clipStyle.backgroundColor);
    if (bg && bg.a > 0.005) textFills.push({ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: clamp01(bg.a) });
    if (clipStyle.backgroundImage && clipStyle.backgroundImage.includes('gradient')) {
      const bgs = splitByTopLevelCommas(clipStyle.backgroundImage);
      for (const bg of bgs) {
        if (bg.includes('linear-gradient')) {
          const grad = parseLinearGradient(bg);
          if (grad) textFills.push(grad);
        } else if (bg.includes('radial-gradient')) {
          const grad = parseRadialGradient(bg, textNode.width, textNode.height);
          if (grad) textFills.push(grad);
        } else if (bg.includes('conic-gradient')) {
          const grad = parseAngularGradient(bg);
          if (grad) textFills.push(grad);
        }
      }
    }

    if (textFills.length > 0) {
      textNode.fills = textFills;
    } else {
      if (fillColor && fillColor.a > 0.005) {
        textNode.fills = [{ type: 'SOLID', color: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, opacity: clamp01(fillColor.a) }];
      } else {
        // Fallback to black if background-clip text fails to parse and text-fill-color is transparent
        textNode.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }];
      }
    }
  } else if (hasTextStroke && fillIsTransparent) {
    // Outline-only text: no fill, stroke only (e.g. large decorative outlined numerals)
    textNode.fills = [];
  } else {
    if (fillColor) {
      textNode.fills = [{ type: 'SOLID', color: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, opacity: clamp01(fillColor.a) }];
    }
  }

  // Apply -webkit-text-stroke as a Figma stroke on the text node
  if (hasTextStroke) {
    const strokeW = parseFloat(s.webkitTextStrokeWidth);
    const strokeColor = parseColor(s.webkitTextStrokeColor || s.color || '#000000');
    if (!isNaN(strokeW) && strokeW > 0 && strokeColor) {
      try {
        textNode.strokes = [{ type: 'SOLID', color: { r: strokeColor.r, g: strokeColor.g, b: strokeColor.b }, opacity: clamp01(strokeColor.a) }];
        textNode.strokeWeight = strokeW;
        textNode.strokeAlign = 'CENTER';
      } catch {}
    }
  }

  applyOpacity(textNode, s);

  parentFrame.appendChild(textNode);
  const posX = sNode._localRect ? sNode._localRect.x : ((sNode.rect?.x || 0) - parentX);
  let posY = sNode._localRect ? sNode._localRect.y : ((sNode.rect?.y || 0) - parentY);

  const w = sNode._localRect ? sNode._localRect.width : (sNode.rect?.width || 0);
  const h = sNode._localRect ? sNode._localRect.height : (sNode.rect?.height || 0);

  // Remove Figma's top half-leading compensation because we use exact centering
  // if (!isMultiLine && h > 0) {
  //   const effectiveLh = figmaLineHeight || (fontSize * 1.2);
  //   posY -= (effectiveLh - h) / 2;
  // }

  textNode.x = posX;
  textNode.y = posY;
  const textStr = finalText.trim();

  if (sNode.id && (sNode.id.includes('input-text') || sNode.id.includes('select-text')) && w > 0 && h > 0) {
    try { textNode.textAutoResize = 'TRUNCATE'; } catch { textNode.textAutoResize = 'NONE'; }
    textNode.resize(Math.ceil(w), Math.ceil(h));
    textNode.textAlignVertical = 'CENTER';
  } else if (isMultiLine && w > 0) {
    textNode.textAutoResize = 'HEIGHT';
    textNode.resize(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    textNode.x = posX;
    textNode.y = posY;
  } else {
    // Single line text: Let the font be its natural width/height so it never wraps
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
    const isVert = (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr');
    if (w > 0 && h > 0 && !isVert) {
      
      // Vertical Alignment:
      // Center the Figma text node vertically relative to the original DOM node's height.
      const figmaH = textNode.height;
      const domCenterY = posY + (h / 2);
      textNode.y = domCenterY - (figmaH / 2);

      // Horizontal Alignment:
      // Guarantee that if the website aligned text to center, it is mathematically centered
      // around the DOM node's center, even if the fallback font width differs from the original!
      const figmaW = textNode.width;
      if (s.textAlign === 'center') {
        textNode.x = posX + (w / 2) - (figmaW / 2);
      } else if (s.textAlign === 'right' || s.textAlign === 'end') {
        textNode.x = posX + w - figmaW;
      } else {
        textNode.x = posX;
      }
    }
  }

  // Apply rotation directly to textNode if parentFrame is not already rotated
  let textAngleDeg = 0;
  const isVerticalText = (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr');

  let transformAngle = 0;
  if (s.transform && s.transform.includes('matrix')) {
    const parts = s.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (parts) {
      const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
      let a = vals[0], b = vals[1];
      transformAngle = Math.atan2(b, a) * (180 / Math.PI);
    }
  } else if (s.rotate && s.rotate !== 'none') {
    const r = s.rotate.trim().toLowerCase();
    if (r.includes('deg')) transformAngle = parseFloat(r);
    else if (r.includes('rad')) transformAngle = (parseFloat(r) * 180) / Math.PI;
    else if (r.includes('turn')) transformAngle = parseFloat(r) * 360;
  }

  if (isVerticalText) {
    // In CSS, writing-mode: vertical-rl flows top-to-bottom.
    // Combined with rotate(180deg), it flows bottom-to-top (reading upwards).
    // In Figma, rotDeg = 90 makes the text read upwards from bottom to top,
    // positioned at x = posX + height and y = posY (top of frame).
    const is180 = Math.abs(Math.abs(transformAngle) - 180) < 1;
    textAngleDeg = is180 ? -90 : 90;
  } else {
    textAngleDeg = transformAngle;
  }

  if (Math.abs(textAngleDeg) > 0.1 && Math.abs(parentFrame.rotation || 0) < 0.1) {
    const rotDeg = -textAngleDeg;
    textNode.rotation = rotDeg;
    if (rotDeg === 90) {
      textNode.x = Math.max(0, posX);
      textNode.y = Math.max(0, posY) + textNode.width;
    } else if (rotDeg === -90) {
      textNode.x = Math.max(0, posX);
      textNode.y = Math.max(0, posY) + textNode.width;
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
    const rootChildren = Array.from(data.root.childNodes);
    rootChildren.forEach((child, idx) => { child._origIdx = idx; });
    rootChildren.sort((a, b) => {
      const zA = getEffectiveZIndex(a);
      const zB = getEffectiveZIndex(b);
      const diff = zA - zB;
      return diff !== 0 ? diff : a._origIdx - b._origIdx;
    });
    for (const child of rootChildren) {
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


