
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

  // lab / lch
  m = css.match(/^(lab|lch)\(\s*([\d.-]+)(%?)\s+([\d.-]+)%?\s+([\d.-]+)(?:deg)?(?:\s*[/,\s]\s*([\d.-]+)%?)?\s*\)$/i);
  if (m) {
    const isLch = m[1].toLowerCase() === 'lch';
    const L = parseFloat(m[2]);
    const aOrC = parseFloat(m[4]);
    const bOrH = parseFloat(m[5]);
    const alpha = m[6] !== undefined ? (m[6].endsWith('%') ? parseFloat(m[6]) / 100 : parseFloat(m[6])) : 1;
    const rgb = isLch ? lchToRgb(L, aOrC, bOrH) : labToRgb(L, aOrC, bOrH);
    return { ...rgb, a: clamp01(alpha) };
  }

  // oklab / oklch
  m = css.match(/^(oklab|oklch)\(\s*([\d.-]+)(%?)\s+([\d.-]+)%?\s+([\d.-]+)(?:deg)?(?:\s*[/,\s]\s*([\d.-]+)%?)?\s*\)$/i);
  if (m) {
    const isOklch = m[1].toLowerCase() === 'oklch';
    let L = parseFloat(m[2]);
    if (m[3] === '%' || L > 1.0) L = L / 100;
    const aOrC = parseFloat(m[4]);
    const bOrH = parseFloat(m[5]);
    const alpha = m[6] !== undefined ? (m[6].endsWith('%') ? parseFloat(m[6]) / 100 : parseFloat(m[6])) : 1;
    const rgb = isOklch ? oklchToRgb(L, aOrC, bOrH) : oklabToRgb(L, aOrC, bOrH);
    return { ...rgb, a: clamp01(alpha) };
  }

  // color(display-p3 ...) or color(srgb ...)
  m = css.match(/^color\(\s*([\w-]+)\s+([\d.-]+)%?\s+([\d.-]+)%?\s+([\d.-]+)%?(?:\s*[/,\s]\s*([\d.-]+)%?)?\s*\)$/i);
  if (m) {
    const space = m[1].toLowerCase();
    const r = parseFloat(m[2]), g = parseFloat(m[3]), b = parseFloat(m[4]);
    const alpha = m[5] !== undefined ? (m[5].endsWith('%') ? parseFloat(m[5]) / 100 : parseFloat(m[5])) : 1;
    if (space === 'display-p3') {
      const rgb = displayP3ToRgb(r, g, b);
      return { ...rgb, a: clamp01(alpha) };
    }
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(alpha) };
  }

  return null;
}

// CIE LAB -> sRGB (D65)
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const eps = 216 / 24389;
  const kap = 24389 / 27;
  const xr = Math.pow(fx, 3) > eps ? Math.pow(fx, 3) : (116 * fx - 16) / kap;
  const yr = L > kap * eps ? Math.pow((L + 16) / 116, 3) : L / kap;
  const zr = Math.pow(fz, 3) > eps ? Math.pow(fz, 3) : (116 * fz - 16) / kap;
  const X = xr * 0.95047, Y = yr * 1.00000, Z = zr * 1.08883;
  const rLin =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gLin = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const bLin =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gamma = (c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
  return { r: clamp01(gamma(rLin)), g: clamp01(gamma(gLin)), b: clamp01(gamma(bLin)) };
}

// CIE LCH -> CIE LAB -> sRGB
function lchToRgb(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  return labToRgb(L, C * Math.cos(hRad), C * Math.sin(hRad));
}

// OKLab -> sRGB
function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const gamma = (c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
  return { r: clamp01(gamma(rLin)), g: clamp01(gamma(gLin)), b: clamp01(gamma(bLin)) };
}

// OKLCH -> OKLab -> sRGB
function oklchToRgb(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(hRad), C * Math.sin(hRad));
}

// display-p3 -> sRGB
function displayP3ToRgb(rP3, gP3, bP3) {
  const toLin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const rL = toLin(rP3), gL = toLin(gP3), bL = toLin(bP3);
  const rLin =  1.2249402 * rL - 0.2249402 * gL;
  const gLin = -0.0420569 * rL + 1.0420569 * gL;
  const bLin = -0.0196375 * rL - 0.0786361 * gL + 1.0982736 * bL;
  const gamma = (c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
  return { r: clamp01(gamma(rLin)), g: clamp01(gamma(gLin)), b: clamp01(gamma(bLin)) };
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
  const fontList = familyRaw.split(',').map(f => f.trim()).filter(Boolean);
  const cleanFamily = fontList[0] || 'Inter';
  
  // 1. Determine the CSS weight key first
  const fullFamilyString = familyRaw.toLowerCase();
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

  // Extract stretch from the PRIMARY font family name or explicit CSS fontStretch.
  // Do NOT check the entire fallback stack — a stack like '"Porsche Next", "Arial Narrow", Arial'
  // has Arial Narrow as a FALLBACK, not because Porsche Next itself is condensed.
  let stretchLower = (fontStretch || '').toLowerCase();
  if (
    familyLower.includes('condensed') ||
    familyLower.includes('compressed') ||
    familyLower.includes('narrow') ||
    familyLower.includes('extracond')
  ) {
    stretchLower = 'condensed';
  }

  // visualStretch is measured from the actual rendered glyphs via canvas.
  // It can only SET condensed (< 0.60) or expanded (> 0.72);
  // the 0.60-0.72 "normal" range does NOT override an already-condensed name detection.
  if (visualStretch !== undefined && visualStretch !== null) {
    if (visualStretch < 0.60) {
      stretchLower = 'condensed';
    } else if (visualStretch > 0.72) {
      // Only set expanded if not already marked condensed by name
      if (!stretchLower.includes('condensed') && !stretchLower.includes('narrow')) {
        stretchLower = 'expanded';
      }
    }
  }

  const isCondensed = stretchLower.includes('condensed') ||
                      stretchLower.includes('compressed') ||
                      stretchLower.includes('narrow') ||
                      (parseFloat(stretchLower) < 100);

  function getBaseFamilyName(fam) {
    let base = fam.replace(/\b(Thin|Hairline|Extra\s?Light|Ultra\s?Light|Light|Medium|Semi\s?Bold|Demi\s?Bold|Extra\s?Bold|Ultra\s?Bold|Bold|Black|Heavy|Condensed|Compressed|Narrow|ExtraCond)\b/gi, '').trim();
    return base || fam;
  }
  let baseFamily = getBaseFamilyName(cleanFamily);
  
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
  if (fullFamilyString.includes('font awesome') || fullFamilyString.includes('fontawesome')) {
    const isSolid = cssWeightKey === '900' || cssWeightKey === 'bold' || cssWeightKey === 'bolder' || parseInt(cssWeightKey) >= 700;
    const faCandidates = [];
    if (fullFamilyString.includes('brands')) {
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

  // STEP A: Iterate over each font family in the CSS font stack!
  // If the font is available in Figma (installed on OS, Google Fonts, or Figma library), load it!
  const genericKeywords = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial', 'unset']);
  for (const rawFam of fontList) {
    if (genericKeywords.has(rawFam.toLowerCase())) continue;
    const rawFamLower = rawFam.toLowerCase().trim();
    const isGenericWide = /^(arial|helvetica|tahoma|verdana|segoe ui|trebuchet)$/i.test(rawFam.trim());
    const thisEntryIsNarrow = /narrow|condensed/i.test(rawFam);

    // If the primary style is condensed, skip plain wide generics (Arial, Helvetica etc.)
    if (isCondensed && isGenericWide && !thisEntryIsNarrow) {
      continue;
    }
    // If the actual rendered font was measured as normal/wide width (visualStretch >= 0.60),
    // skip narrow/condensed font entries in the fallback stack — they would make text look
    // visually narrower than the real site, even if the CSS stack explicitly lists them.
    if (!isCondensed && thisEntryIsNarrow) {
      continue;
    }

    const directCandidates = [];
    const baseFam = getBaseFamilyName(rawFam);

    // If this specific family entry is narrow/condensed by name, probe its narrow styles first
    if (thisEntryIsNarrow) {
      directCandidates.push({ family: rawFam, style: italic ? 'Italic' : 'Regular' });
      directCandidates.push({ family: 'Arial', style: 'Narrow' + (italic ? ' Italic' : '') });
      directCandidates.push({ family: 'Arial', style: 'Narrow' });
      directCandidates.push({ family: 'Arial', style: 'Narrow Bold' });
      directCandidates.push({ family: baseFam, style: 'Narrow' + (italic ? ' Italic' : '') });
      directCandidates.push({ family: baseFam, style: 'Narrow' });
      directCandidates.push({ family: 'Arial Narrow', style: italic ? 'Italic' : 'Regular' });
      directCandidates.push({ family: 'Arial Narrow', style: 'Bold' });
    }

    directCandidates.push(...getCandidatesForFamily(rawFam, cssWeightKey));
    const baseFamDiffers = baseFam !== rawFam;
    if (baseFamDiffers) {
      directCandidates.push(...getCandidatesForFamily(baseFam, cssWeightKey));
    }

    for (const font of directCandidates) {
      try {
        await figma.loadFontAsync({ family: font.family, style: font.style });
        return font; // Successfully loaded from installed system fonts / Google Fonts with CSS weight!
      } catch {}
    }
  }

  // STEP B: The font family is NOT in Google Fonts, NOT in Figma's library, and NOT installed locally.
  // Now and ONLY now do we use visual density guessing and variable fallback fonts.
  const candidates = [];

  // 3. Try to fall back to a Google Font based on the font category/type
  let fallbackGoogleFont = null;

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

  // 4. Try the calculated Google Font Fallback using cssWeightKey first, then visual weight
  if (fallbackGoogleFont) {
    candidates.push(...getCandidatesForFamily(fallbackGoogleFont, cssWeightKey));
    if (visualWeightKey !== cssWeightKey) {
      candidates.push(...getCandidatesForFamily(fallbackGoogleFont, visualWeightKey));
    }
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

function fixPremultipliedStops(stops) {
  if (!stops || stops.length <= 1) return stops;

  const result = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (s.color.a > 0.001) {
      result.push(s);
      continue;
    }

    // Find closest non-transparent stop before i
    let prevOpaque = null;
    for (let p = i - 1; p >= 0; p--) {
      if (stops[p].color.a > 0.001) {
        prevOpaque = stops[p];
        break;
      }
    }

    // Find closest non-transparent stop after i
    let nextOpaque = null;
    for (let n = i + 1; n < stops.length; n++) {
      if (stops[n].color.a > 0.001) {
        nextOpaque = stops[n];
        break;
      }
    }

    if (prevOpaque && !nextOpaque) {
      result.push({
        position: s.position,
        color: { r: prevOpaque.color.r, g: prevOpaque.color.g, b: prevOpaque.color.b, a: s.color.a }
      });
    } else if (!prevOpaque && nextOpaque) {
      result.push({
        position: s.position,
        color: { r: nextOpaque.color.r, g: nextOpaque.color.g, b: nextOpaque.color.b, a: s.color.a }
      });
    } else if (prevOpaque && nextOpaque) {
      result.push({
        position: s.position,
        color: { r: prevOpaque.color.r, g: prevOpaque.color.g, b: prevOpaque.color.b, a: s.color.a }
      });
      result.push({
        position: s.position,
        color: { r: nextOpaque.color.r, g: nextOpaque.color.g, b: nextOpaque.color.b, a: s.color.a }
      });
    } else {
      result.push(s);
    }
  }
  return result;
}

function parseLinearGradient(css, styles = null) {
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

      let col = parseColor(colStr);
      if (!col && colStr.toLowerCase() === 'transparent') {
        col = { r: 0, g: 0, b: 0, a: 0 };
      }
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

    // Adjust stops when background-size and background-position crop or scale the gradient (e.g. background-size: 200% auto)
    if (styles && styles.backgroundSize) {
      const sizeParts = styles.backgroundSize.trim().split(/\s+/);
      let scaleX = 1;
      let scaleY = 1;
      if (sizeParts[0] && sizeParts[0].endsWith('%')) {
        scaleX = parseFloat(sizeParts[0]) / 100;
      }
      if (sizeParts[1] && sizeParts[1].endsWith('%')) {
        scaleY = parseFloat(sizeParts[1]) / 100;
      }

      let posX = 0;
      let posY = 0;
      if (styles.backgroundPosition) {
        const posParts = styles.backgroundPosition.trim().split(/\s+/);
        if (posParts[0] && posParts[0].endsWith('%')) {
          posX = parseFloat(posParts[0]) / 100;
        } else if (posParts[0] === 'right') {
          posX = 1;
        } else if (posParts[0] === 'center') {
          posX = 0.5;
        }
        if (posParts[1] && posParts[1].endsWith('%')) {
          posY = parseFloat(posParts[1]) / 100;
        } else if (posParts[1] === 'bottom') {
          posY = 1;
        } else if (posParts[1] === 'center') {
          posY = 0.5;
        }
      }

      const isHorizontal = Math.abs(Math.sin(angleDeg * Math.PI / 180)) >= Math.abs(Math.cos(angleDeg * Math.PI / 180));
      const scale = isHorizontal ? scaleX : scaleY;
      let pos = isHorizontal ? posX : posY;

      const isTextClip = isBackgroundClipText(styles);
      if (isTextClip) {
        // Text-clip scrub animations use background-size > 100% and background-position: 100%
        // to hide text initially. The final revealed position is ALWAYS 0!
        pos = 0;
      }

      if (scale > 1.05) {
        const wWin = 1 / scale;
        const u0 = clamp01(pos * (1 - wWin));
        const u1 = clamp01(u0 + wWin);

        const getColorAt = (t) => {
          if (t <= stops[0].position) return stops[0].color;
          if (t >= stops[stops.length - 1].position) return stops[stops.length - 1].color;
          for (let si = 0; si < stops.length - 1; si++) {
            const sA = stops[si], sB = stops[si + 1];
            if (t >= sA.position && t <= sB.position) {
              const span = sB.position - sA.position;
              const f = span > 0 ? (t - sA.position) / span : 0;
              return {
                r: sA.color.r + (sB.color.r - sA.color.r) * f,
                g: sA.color.g + (sB.color.g - sA.color.g) * f,
                b: sA.color.b + (sB.color.b - sA.color.b) * f,
                a: sA.color.a + (sB.color.a - sA.color.a) * f
              };
            }
          }
          return stops[0].color;
        };

        const newStops = [];
        newStops.push({ position: 0, color: getColorAt(u0) });
        for (const st of stops) {
          if (st.position > u0 + 0.001 && st.position < u1 - 0.001) {
            newStops.push({
              position: clamp01((st.position - u0) / (u1 - u0)),
              color: { ...st.color }
            });
          }
        }
        newStops.push({ position: 1, color: getColorAt(u1) });
        stops.length = 0;
        stops.push(...newStops);
      }
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
      gradientStops: fixPremultipliedStops(stops)
    };
  } catch {
    return null;
  }
}

function parseRadialGradient(css) {
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

    // Default center and radii (normalized 0-1, relative to node size)
    let cx = 0.5, cy = 0.5; // center
    let rx = 0.5, ry = 0.5; // radii

    let stopsStr = inner;

    // Parse first argument group (shape / size / position)
    // CSS syntax: [[circle|ellipse]||<extent-keyword>] [at <pos>]?
    //           | [<length-pct>{2}] [at <pos>]?
    //           | [at <pos>]
    const firstCommaIdx = inner.indexOf(',');
    if (firstCommaIdx !== -1) {
      const firstArg = inner.substring(0, firstCommaIdx).trim();
      // Detect shape/size/position first arg — includes keywords OR two size values
      const isShapeArg = firstArg.includes('at ') ||
                         firstArg.includes('circle') ||
                         firstArg.includes('ellipse') ||
                         firstArg.includes('closest-') ||
                         firstArg.includes('farthest-') ||
                         /^[\d.]+[%a-z]+\s+[\d.]+[%a-z]+(\s+at\s.*)?$/.test(firstArg);

      if (isShapeArg) {
        stopsStr = inner.substring(firstCommaIdx + 1).trim();

        // Extract position after "at"
        const atIdx = firstArg.indexOf(' at ');
        let sizeStr = atIdx !== -1 ? firstArg.substring(0, atIdx).trim() : firstArg;
        const posStr = atIdx !== -1 ? firstArg.substring(atIdx + 4).trim() : '';

        // Remove shape keyword prefix
        sizeStr = sizeStr.replace(/^(circle|ellipse)\s*/i, '').trim();

        // Parse position
        if (posStr) {
          const parsePosVal = (v, isX) => {
            if (!v) return 0.5;
            if (v === 'center') return 0.5;
            if (v === 'left')   return 0;
            if (v === 'right')  return 1;
            if (v === 'top')    return 0;
            if (v === 'bottom') return 1;
            if (v.endsWith('%')) return parseFloat(v) / 100;
            return 0.5; // px not supported without node size
          };
          const posParts = posStr.trim().split(/\s+/);
          if (posParts.length >= 2) {
            cx = parsePosVal(posParts[0], true);
            cy = parsePosVal(posParts[1], false);
          } else if (posParts.length === 1) {
            cx = parsePosVal(posParts[0], true);
            cy = 0.5;
          }
        }

        // Parse size (extent keyword or two lengths)
        if (sizeStr && !/^(circle|ellipse)$/i.test(sizeStr)) {
          const sizeParts = sizeStr.trim().split(/\s+/);
          if (/closest-side|farthest-side|closest-corner|farthest-corner/.test(sizeStr)) {
            // Use defaults (0.5); for farthest-corner the gradient reaches beyond mid
            // but without node dimensions we approximate as 0.5
            rx = 0.5; ry = 0.5;
          } else if (sizeParts.length >= 2) {
            if (sizeParts[0].endsWith('%')) rx = parseFloat(sizeParts[0]) / 100;
            if (sizeParts[1].endsWith('%')) ry = parseFloat(sizeParts[1]) / 100;
          } else if (sizeParts.length === 1 && sizeParts[0].endsWith('%')) {
            rx = parseFloat(sizeParts[0]) / 100;
            ry = rx;
          }
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

      let col = parseColor(colStr);
      if (!col && colStr.toLowerCase() === 'transparent') {
        col = { r: 0, g: 0, b: 0, a: 0 };
      }
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

    // Build Figma gradientTransform for GRADIENT_RADIAL.
    // Figma's gradientTransform maps FROM node space TO gradient space:
    //   gx = a*nx + b*ny + c,  gy = d*nx + e*ny + f
    // We want: CSS ellipse boundary (at gradient pos=1.0) to map to unit circle in gradient space.
    // CSS ellipse: ((nx-cx)/rx)^2 + ((ny-cy)/ry)^2 = 1
    // Gradient circle: (gx-0.5)^2 + (gy-0.5)^2 = 0.25
    // Solving (b=d=0):
    //   a = 0.5/rx,  c = 0.5 - a*cx
    //   e = 0.5/ry,  f = 0.5 - e*cy
    const a = 0.5 / rx, b = 0,          c = 0.5 - a * cx;
    const d = 0,        e = 0.5 / ry,   f = 0.5 - e * cy;

    return {
      type: 'GRADIENT_RADIAL',
      gradientTransform: [
        [a, b, c],
        [d, e, f]
      ],
      gradientStops: fixPremultipliedStops(stops)
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

      let col = parseColor(colStr);
      if (!col && colStr.toLowerCase() === 'transparent') {
        col = { r: 0, g: 0, b: 0, a: 0 };
      }
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
      gradientStops: fixPremultipliedStops(stops)
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
      const m = clean.match(/(.*?)\s*(-?[\d.]+(?:px)?)\s+(-?[\d.]+(?:px)?)(?:\s+([\d.]+(?:px)?))?(?:\s+([\d.]+(?:px)?))?/);
      if (m) {
        const col = parseColor(m[1]) || parseColor(clean.slice(clean.lastIndexOf(' ')).trim()) || { r: 0, g: 0, b: 0, a: 0.25 };
        const x = parseFloat(m[2]) || 0;
        const y = parseFloat(m[3]) || 0;
        const radius = parseFloat(m[4]) || 0;
        const spread = parseFloat(m[5]) || 0;
        
        if (Math.abs(x) < 0.1 && Math.abs(y) < 0.1 && radius < 0.1 && Math.abs(spread) < 0.1) continue;

        const effect = {
          type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
          color: { r: col.r, g: col.g, b: col.b, a: clamp01(col.a) },
          offset: { x, y },
          radius,
          spread,
          visible: true,
          blendMode: 'NORMAL'
        };
        if (!isInset) {
          effect.showShadowBehindNode = false;
        }
        effects.push(effect);
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

            let ox = parseBgCoord(rawPosX, nodeW, targetW);
            let oy = parseBgCoord(rawPosY, nodeH, targetH);

            svgNode.x = Math.round(ox);
            svgNode.y = Math.round(oy);
            try {
              svgNode.resize(Math.max(1, Math.round(targetW)), Math.max(1, Math.round(targetH)));
            } catch {}
            applyOpacity(svgNode, styles);
            try { svgNode.clipsContent = true; } catch {}

            if (isMask) {
              if (hasChildren) {
                svgNode.isMask = true;
                try { svgNode.maskType = 'ALPHA'; } catch {}
              } else {
                // Monochrome masked SVG (e.g. p-model-signature, icons using mask-image with background-color)
                const maskFillColor = parseColor(styles.backgroundColor || styles.color);
                if (maskFillColor && maskFillColor.a > 0) {
                  function applyMaskFill(n) {
                    if ('fills' in n && Array.isArray(n.fills)) {
                      n.fills = [{ type: 'SOLID', color: { r: maskFillColor.r, g: maskFillColor.g, b: maskFillColor.b }, opacity: maskFillColor.a }];
                    }
                    if ('children' in n && Array.isArray(n.children)) {
                      n.children.forEach(applyMaskFill);
                    }
                  }
                  applyMaskFill(svgNode);
                }
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

            const rawRepeat = (isMask ? (styles.maskRepeat || styles.webkitMaskRepeat) : null) || styles.backgroundRepeat;
            const bgRepeat = (rawRepeat || 'repeat').toLowerCase().trim();
            const isNoRepeat = bgRepeat.includes('no-repeat');
            const isTiling = !isCover && !isContain && !isNoRepeat && (bgRepeat.includes('repeat') || bgRepeat === 'round' || bgRepeat === 'space');

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

              if (isTiling) {
                let scalingFactor = 1;
                if (size.width > 0 && imgW > 0) {
                  scalingFactor = imgW / size.width;
                }
                if (!isFinite(scalingFactor) || scalingFactor <= 0) {
                  scalingFactor = 1;
                }
                fills.push({
                  type: 'IMAGE',
                  imageHash: img.hash,
                  scaleMode: 'TILE',
                  scalingFactor: Number(scalingFactor.toFixed(4))
                });
              } else if (isContain) {
                fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FIT' });
              } else if (isCover) {
                fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' });
              } else if (!isMask && isNoRepeat && typeof node.insertChild === 'function' && (imgW < nodeW || imgH < nodeH || isSprite)) {
                // Non-repeating positioned background image (e.g. corner illustrations, accent graphics, or CSS sprites).
                // Do NOT stretch it to FILL the entire container!
                // Create a dedicated child rectangle node at the exact CSS background-position and size,
                // inserted at index 0 behind frame contents so it preserves the frame's background color and content layout.
                const ox = parseBgCoord(posX, nodeW, imgW);
                const oy = parseBgCoord(posY, nodeH, imgH);
                const bgImgNode = figma.createRectangle();
                bgImgNode.name = 'bg-image';
                bgImgNode.x = Math.round(ox);
                bgImgNode.y = Math.round(oy);
                bgImgNode.resize(Math.max(1, Math.round(imgW)), Math.max(1, Math.round(imgH)));
                bgImgNode.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
                try {
                  node.insertChild(0, bgImgNode);
                } catch {
                  try { node.appendChild(bgImgNode); } catch {
                    fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' });
                  }
                }
                if (ox < 0 || oy < 0 || ox + imgW > nodeW || oy + imgH > nodeH) {
                  try { node.clipsContent = true; } catch {}
                }
              } else {
                fills.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' });
              }
            } catch (err) {
              // Fallback if sizing fails
              fills.push({
                type: 'IMAGE',
                imageHash: img.hash,
                scaleMode: isTiling ? 'TILE' : (isContain ? 'FIT' : 'FILL'),
                ...(isTiling ? { scalingFactor: 1 } : {})
              });
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
    // CSS Gradients go ON TOP of background images in Figma.
    // In CSS, the first gradient in the comma-separated list is the top-most layer.
    // In Figma, fills are drawn from back to front (fills[0] is bottom, last fill is on top).
    // Therefore, we iterate from bottom to top (last to first) so the first CSS layer is on top in Figma!
    if (styles.backgroundImage && styles.backgroundImage.includes('gradient')) {
      const bgs = splitByTopLevelCommas(styles.backgroundImage);
      const gradFills = [];
      for (let i = bgs.length - 1; i >= 0; i--) {
        const bg = bgs[i];
        if (bg.includes('linear-gradient')) {
          const grad = parseLinearGradient(bg, styles);
          if (grad) gradFills.push(grad);
        } else if (bg.includes('radial-gradient')) {
          const grad = parseRadialGradient(bg);
          if (grad) gradFills.push(grad);
        } else if (bg.includes('conic-gradient')) {
          const grad = parseAngularGradient(bg);
          if (grad) gradFills.push(grad);
        }
      }
      fills.push(...gradFills);
    }
  }

  if (fills.length > 0) node.fills = fills;
  else if (node.type === 'FRAME') {
    const bdrop = styles.backdropFilter || styles.webkitBackdropFilter || '';
    if (bdrop.includes('blur') || styles._needsBgBlurFill) {
      node.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.005 }];
    } else {
      node.fills = [];
    }
  }
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

function applyEffects(node, styles, effectiveBgColor = null) {
  const effects = [];

  if (styles.boxShadow && styles.boxShadow !== 'none') {
    const shadowEffects = parseBoxShadows(styles.boxShadow);
    effects.push(...shadowEffects);
  }

  const bdrop = styles.backdropFilter || styles.webkitBackdropFilter || '';
  if (bdrop.includes('blur')) {
    const m = bdrop.match(/blur\(([\d.]+)px\)/);
    if (m) {
      effects.push({ type: 'BACKGROUND_BLUR', radius: parseFloat(m[1]), visible: true });
      try { node.clipsContent = true; } catch {}
    }
  }

  const filter = styles.filter || styles.webkitFilter || '';
  if (filter.includes('blur')) {
    const m = filter.match(/blur\(([\d.]+)px\)/);
    if (m) effects.push({ type: 'LAYER_BLUR', radius: parseFloat(m[1]), visible: true });
  }

  if (effects.length > 0) {
    node.effects = effects;
    const hasDropShadow = effects.some(e => e.type === 'DROP_SHADOW');
    if (hasDropShadow && (!node.fills || node.fills.length === 0 || node.fills.every(f => (f.opacity || 0) <= 0.005))) {
      const bg = effectiveBgColor || parseColor(styles._effectiveBgColor) || { r: 1, g: 1, b: 1 };
      node.fills = [{ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: 1 }];
    }
    const hasBgBlur = effects.some(e => e.type === 'BACKGROUND_BLUR');
    if (hasBgBlur && (!node.fills || node.fills.length === 0 || node.fills.every(f => (f.opacity || 0) <= 0.001))) {
      node.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.005 }];
    }
  }
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
      // Only apply full-circle/ellipse corner radius to small icons/avatars (refDim <= 256)
      if (refDim <= 256 && (w <= 300 && h <= 300)) {
        node.cornerRadius = Math.round(refDim / 2);
        try { node.clipsContent = true; } catch {}
      }
    }
  }
}

function convertClipPathToSvg(cp, w, h) {
  if (!cp || cp === 'none') return null;
  const cpLower = cp.toLowerCase().trim();

  function parseVal(v, ref) {
    if (!v) return 0;
    if (v.includes('%')) return (parseFloat(v) / 100) * ref;
    return parseFloat(v) || 0;
  }

  // Handle path('...')
  if (cpLower.includes('path(')) {
    const match = cp.match(/path\(['"]?(.*?)['"]?\)/);
    if (match && match[1]) {
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${match[1]}" fill="#ffffff" /></svg>`;
    }
  }
  // Handle polygon(...)
  else if (cpLower.includes('polygon(')) {
    const m = cp.match(/polygon\((.*?)\)/i);
    if (m) {
      const pts = m[1].split(',').map(p => p.trim()).filter(Boolean);
      if (pts.length >= 3) {
        const commands = [];
        for (let i = 0; i < pts.length; i++) {
          const parts = pts[i].split(/\s+/).filter(Boolean);
          if (parts.length >= 2) {
            const px = parseVal(parts[0], w);
            const py = parseVal(parts[1], h);
            commands.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(4)} ${py.toFixed(4)}`);
          }
        }
        if (commands.length >= 3) {
          return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${commands.join(' ')} Z" fill="#ffffff" /></svg>`;
        }
      }
    }
  }
  // Handle ellipse(...)
  else if (cpLower.includes('ellipse')) {
    const m = cp.match(/ellipse\(\s*([^,\s]+)\s+([^,\s]+)\s+at\s+([^,\s]+)\s+([^,\s]+)\s*\)/i);
    if (m) {
      const rx = parseVal(m[1], w);
      const ry = parseVal(m[2], h);
      const cx = parseVal(m[3], w);
      const cy = parseVal(m[4], h);
      if (rx > 0 && ry > 0) {
        // Top arc (e.g. at 50% 0%)
        if (cy <= 0.05 * h) {
          const termL = Math.max(0, 1 - Math.pow(cx / rx, 2));
          const termR = Math.max(0, 1 - Math.pow((w - cx) / rx, 2));
          const yLeft = (cy + ry * Math.sqrt(termL)).toFixed(2);
          const yRight = (cy + ry * Math.sqrt(termR)).toFixed(2);
          return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 L ${w} 0 L ${w} ${yRight} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 1 0 ${yLeft} Z" fill="#ffffff" /></svg>`;
        }
        // Bottom arc (e.g. at 50% 100%)
        else if (cy >= 0.95 * h) {
          const termL = Math.max(0, 1 - Math.pow(cx / rx, 2));
          const termR = Math.max(0, 1 - Math.pow((w - cx) / rx, 2));
          const yLeft = (cy - ry * Math.sqrt(termL)).toFixed(2);
          const yRight = (cy - ry * Math.sqrt(termR)).toFixed(2);
          return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="M 0 ${h} L ${w} ${h} L ${w} ${yRight} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 0 0 ${yLeft} Z" fill="#ffffff" /></svg>`;
        }
        // General ellipse
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="#ffffff" /></svg>`;
      }
    }
  }
  // Handle circle(...)
  else if (cpLower.includes('circle')) {
    const m = cp.match(/circle\(\s*([^,\s]+)(?:\s+at\s+([^,\s]+)\s+([^,\s]+))?\s*\)/i);
    if (m) {
      const refDim = Math.sqrt((w * w + h * h) / 2);
      const r = parseVal(m[1], refDim);
      const cx = m[2] ? parseVal(m[2], w) : w / 2;
      const cy = m[3] ? parseVal(m[3], h) : h / 2;
      if (r > 0) {
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="#ffffff" /></svg>`;
      }
    }
  }

  return null;
}

function applyOpacity(node, styles, sNode = null) {
  if (!node || !styles) return;
  let op = parseFloat(styles.opacity);
  if (!isNaN(op)) {
    // If this is an animated text node/word/char whose opacity was dimmed by scroll-scrub, force full opacity:
    const cls = (sNode?.attributes?.class || styles.attributes?.class || '');
    const id = (sNode?.id || styles.id || '');
    const isText = node.type === 'TEXT' || sNode?.nodeType === 3 || (sNode?.text && sNode.text.trim());
    const isWordOrChar = /word|char|split|line|reveal|anim|invert/i.test(cls) || /text-anim|split|reveal/i.test(id) || isText;
    if (isWordOrChar && op < 0.95 && op > 0.01) {
      op = 1;
    }
    if (op < 1) {
      node.opacity = clamp01(op);
      if (op <= 0.01) {
        try { node.visible = false; } catch {}
      }
    }
  }
  if (styles.visibility === 'hidden' || styles.display === 'none') {
    try { node.visible = false; } catch {}
  }
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

function applyBlendMode(node, styles, sNode = null) {
  const mode = styles.mixBlendMode || styles['mix-blend-mode'];
  if (!mode || mode === 'normal') return;

  // In CSS, negative z-index elements (like background videos) inside an isolated stacking context
  // render against a transparent backdrop and do not multiply against ancestor backgrounds.
  // Furthermore, video elements whose poster already bakes the section gradient must not be multiplied in Figma,
  // which would otherwise square the gradient and turn the colors into dark mud.
  if (sNode) {
    const isVideo = sNode.tag === 'VIDEO' || (sNode.attributes?.class && sNode.attributes.class.includes('video'));
    const isNegZ = sNode.styles?.zIndex && parseInt(sNode.styles.zIndex, 10) < 0;
    if (isVideo && (isNegZ || mode.toLowerCase() === 'multiply')) {
      return;
    }
  }

  if (CSS_TO_FIGMA_BLEND_MODES[mode.toLowerCase()]) {
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

function colorObjToHex(c) {
  if (!c) return '#000000';
  const r = Math.round(clamp01(c.r) * 255).toString(16).padStart(2, '0');
  const g = Math.round(clamp01(c.g) * 255).toString(16).padStart(2, '0');
  const b = Math.round(clamp01(c.b) * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function prepareSvgString(svgString, isInverted, styles = null) {
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

  // Resolve effective SVG foreground / icon color from styles
  let targetColorHex = null;
  const isMask = !!(styles && ((styles.maskImage && styles.maskImage !== 'none') || (styles.webkitMaskImage && styles.webkitMaskImage !== 'none')));

  if (isMask) {
    const bgCol = parseColor(styles.backgroundColor);
    if (bgCol && bgCol.a > 0.05) {
      targetColorHex = colorObjToHex(bgCol);
    } else {
      const textCol = parseColor(styles.color);
      if (textCol && textCol.a > 0.05) targetColorHex = colorObjToHex(textCol);
    }
  } else if (styles) {
    if (styles.fill && styles.fill !== 'none' && styles.fill !== 'transparent') {
      const fCol = parseColor(styles.fill);
      if (fCol && fCol.a > 0.05) targetColorHex = colorObjToHex(fCol);
    }
    if (!targetColorHex && styles.color && styles.color !== 'transparent') {
      const cCol = parseColor(styles.color);
      if (cCol && cCol.a > 0.05) targetColorHex = colorObjToHex(cCol);
    }
  }

  // Figma's SVG engine doesn't resolve "currentColor". Convert any remaining currentColor to target color:
  const fallbackCurrentColor = targetColorHex || (isInverted ? '#ffffff' : '#000000');
  clean = clean.replace(/\bfill=["']currentColor["']/gi, `fill="${fallbackCurrentColor}"`);
  clean = clean.replace(/\bstroke=["']currentColor["']/gi, `stroke="${fallbackCurrentColor}"`);

  // Ensure shapes without fill in monochrome/masked SVGs inherit target fill
  if (targetColorHex) {
    clean = clean.replace(/<(path|rect|polygon|circle|ellipse)\b([^>]*?)(\/?>)/gi, (m, tag, attrs, close) => {
      if (/\bfill\s*=/i.test(attrs)) {
        if (isMask && !/\bfill\s*=\s*["']none["']/i.test(attrs)) {
          return `<${tag}${attrs.replace(/\bfill\s*=\s*["'][^"']*["']/gi, `fill="${targetColorHex}"`)}${close}`;
        }
        return m;
      }
      if (!isMask && /\bstroke\s*=/i.test(attrs) && !/\bstroke\s*=\s*["']none["']/i.test(attrs)) {
        return m;
      }
      return `<${tag}${attrs} fill="${targetColorHex}"${close}`;
    });

    if (!/<svg\b[^>]*?\bfill=/i.test(clean)) {
      clean = clean.replace(/<svg\b/i, `<svg fill="${targetColorHex}" `);
    }
  }
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

  // Convert quadratic bezier curves (Q, q, T, t) to cubic bezier curves (C)
  // because Figma's SVG engine does not interpolate quadratic curves and renders them as faceted straight lines
  if (/[QqTt]/.test(clean)) {
    clean = clean.replace(/\bd\s*=\s*(["'])([\s\S]*?)\1/gi, (m, quote, dContent) => {
      if (/[QqTt]/.test(dContent)) {
        return `d=${quote}${convertPathDQuadToCubic(dContent)}${quote}`;
      }
      return m;
    });
  }

  return clean;
}

function convertPathDQuadToCubic(dStr) {
  const cmdRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match;
  let newD = '';
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;
  let lastControlX = 0, lastControlY = 0;
  let lastCmd = '';

  const r3 = v => Math.round(v * 1000) / 1000;

  while ((match = cmdRegex.exec(dStr)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    const nums = [];
    if (argsStr) {
      const numRegex = /[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
      let nMatch;
      while ((nMatch = numRegex.exec(argsStr)) !== null) {
        nums.push(parseFloat(nMatch[0]));
      }
    }

    const isRel = cmd === cmd.toLowerCase();
    const type = cmd.toUpperCase();

    if (type === 'M') {
      for (let i = 0; i < nums.length; i += 2) {
        const x = isRel ? curX + nums[i] : nums[i];
        const y = isRel ? curY + nums[i + 1] : nums[i + 1];
        if (i === 0) {
          curX = x; curY = y;
          startX = x; startY = y;
          newD += `M${r3(x)} ${r3(y)}`;
        } else {
          curX = x; curY = y;
          newD += `L${r3(x)} ${r3(y)}`;
        }
      }
      lastControlX = curX; lastControlY = curY;
      lastCmd = 'M';
    } else if (type === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        curX = isRel ? curX + nums[i] : nums[i];
        curY = isRel ? curY + nums[i + 1] : nums[i + 1];
        newD += `L${r3(curX)} ${r3(curY)}`;
      }
      lastControlX = curX; lastControlY = curY;
      lastCmd = 'L';
    } else if (type === 'H') {
      for (let i = 0; i < nums.length; i++) {
        curX = isRel ? curX + nums[i] : nums[i];
        newD += `H${r3(curX)}`;
      }
      lastControlX = curX; lastControlY = curY;
      lastCmd = 'H';
    } else if (type === 'V') {
      for (let i = 0; i < nums.length; i++) {
        curY = isRel ? curY + nums[i] : nums[i];
        newD += `V${r3(curY)}`;
      }
      lastControlX = curX; lastControlY = curY;
      lastCmd = 'V';
    } else if (type === 'C') {
      for (let i = 0; i < nums.length; i += 6) {
        const x1 = isRel ? curX + nums[i] : nums[i];
        const y1 = isRel ? curY + nums[i + 1] : nums[i + 1];
        const x2 = isRel ? curX + nums[i + 2] : nums[i + 2];
        const y2 = isRel ? curY + nums[i + 3] : nums[i + 3];
        const x = isRel ? curX + nums[i + 4] : nums[i + 4];
        const y = isRel ? curY + nums[i + 5] : nums[i + 5];
        newD += `C${r3(x1)} ${r3(y1)} ${r3(x2)} ${r3(y2)} ${r3(x)} ${r3(y)}`;
        lastControlX = x2;
        lastControlY = y2;
        curX = x; curY = y;
      }
      lastCmd = 'C';
    } else if (type === 'S') {
      for (let i = 0; i < nums.length; i += 4) {
        const x2 = isRel ? curX + nums[i] : nums[i];
        const y2 = isRel ? curY + nums[i + 1] : nums[i + 1];
        const x = isRel ? curX + nums[i + 2] : nums[i + 2];
        const y = isRel ? curY + nums[i + 3] : nums[i + 3];
        newD += `S${r3(x2)} ${r3(y2)} ${r3(x)} ${r3(y)}`;
        lastControlX = x2;
        lastControlY = y2;
        curX = x; curY = y;
      }
      lastCmd = 'S';
    } else if (type === 'Q') {
      for (let i = 0; i < nums.length; i += 4) {
        const qx = isRel ? curX + nums[i] : nums[i];
        const qy = isRel ? curY + nums[i + 1] : nums[i + 1];
        const x = isRel ? curX + nums[i + 2] : nums[i + 2];
        const y = isRel ? curY + nums[i + 3] : nums[i + 3];

        const cx1 = curX + (2 / 3) * (qx - curX);
        const cy1 = curY + (2 / 3) * (qy - curY);
        const cx2 = x + (2 / 3) * (qx - x);
        const cy2 = y + (2 / 3) * (qy - y);

        newD += `C${r3(cx1)} ${r3(cy1)} ${r3(cx2)} ${r3(cy2)} ${r3(x)} ${r3(y)}`;
        lastControlX = qx;
        lastControlY = qy;
        curX = x; curY = y;
      }
      lastCmd = 'Q';
    } else if (type === 'T') {
      for (let i = 0; i < nums.length; i += 2) {
        let qx = curX, qy = curY;
        if (lastCmd === 'Q' || lastCmd === 'T') {
          qx = 2 * curX - lastControlX;
          qy = 2 * curY - lastControlY;
        }
        const x = isRel ? curX + nums[i] : nums[i];
        const y = isRel ? curY + nums[i + 1] : nums[i + 1];

        const cx1 = curX + (2 / 3) * (qx - curX);
        const cy1 = curY + (2 / 3) * (qy - curY);
        const cx2 = x + (2 / 3) * (qx - x);
        const cy2 = y + (2 / 3) * (qy - y);

        newD += `C${r3(cx1)} ${r3(cy1)} ${r3(cx2)} ${r3(cy2)} ${r3(x)} ${r3(y)}`;
        lastControlX = qx;
        lastControlY = qy;
        curX = x; curY = y;
      }
      lastCmd = 'T';
    } else if (type === 'A') {
      for (let i = 0; i < nums.length; i += 7) {
        const rx = nums[i];
        const ry = nums[i + 1];
        const rot = nums[i + 2];
        const laf = nums[i + 3];
        const sf = nums[i + 4];
        const x = isRel ? curX + nums[i + 5] : nums[i + 5];
        const y = isRel ? curY + nums[i + 6] : nums[i + 6];
        newD += `A${r3(rx)} ${r3(ry)} ${rot} ${laf} ${sf} ${r3(x)} ${r3(y)}`;
        curX = x; curY = y;
      }
      lastControlX = curX; lastControlY = curY;
      lastCmd = 'A';
    } else if (type === 'Z') {
      newD += 'Z';
      curX = startX;
      curY = startY;
      lastControlX = curX; lastControlY = curY;
      lastCmd = 'Z';
    }
  }

  return newD;
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

function isNavOrHeader(node) {
  if (!node) return false;
  const tag = node.tag;
  if (tag === 'HEADER' || tag === 'NAV') return true;
  const cls = (node.attributes?.class || '');
  const role = (node.attributes?.role || '');
  if (role === 'banner' || role === 'navigation') return true;
  if (/\b(?:navbar|site-header|main-header|header-wrapper|top-header|sticky-header|fixed-header)\b/i.test(cls)) {
    return true;
  }
  if (/\bheader\b/i.test(cls) && !/\b(?:accordion|card|modal|table|post|comment|widget|box|icon|feature|item)-header\b/i.test(cls)) {
    return true;
  }
  return false;
}

function isNavLogo(node, insideNav = false) {
  if (!node) return false;
  const cls = (node.attributes?.class || '');
  const id = (node.attributes?.id || node.id || '');
  if (/\b(?:navbar-brand|nav-logo|header-logo|brand-logo|site-logo|logo-holder|header-brand)\b/i.test(cls)) return true;
  if (insideNav && /\b(?:brand|logo)\b/i.test(id)) return true;
  if (insideNav && node.tag === 'IMG' && /\blogo\b/i.test(node.attributes?.src || '')) return true;
  return false;
}

function isNavButton(node, insideNav = false) {
  if (!node) return false;
  const cls = (node.attributes?.class || '');
  if (/\b(?:header-button|header-btn|navbar-btn|nav-button|btn-header|navbar-toggler|nav-btn|menu-toggler|menu-btn|hamburger)\b/i.test(cls)) return true;
  if (insideNav && (node.tag === 'BUTTON' || (node.tag === 'A' && /\bbtn\b/i.test(cls)))) return true;
  return false;
}

function containsNavLogo(node, insideNav = false) {
  if (!node) return false;
  const inNav = insideNav || isNavOrHeader(node);
  if (isNavLogo(node, inNav)) return true;
  if (node.childNodes) {
    for (const c of node.childNodes) {
      if (containsNavLogo(c, inNav)) return true;
    }
  }
  return false;
}

function containsNavButton(node, insideNav = false) {
  if (!node) return false;
  const inNav = insideNav || isNavOrHeader(node);
  if (isNavButton(node, inNav)) return true;
  if (node.childNodes) {
    for (const c of node.childNodes) {
      if (containsNavButton(c, inNav)) return true;
    }
  }
  return false;
}

function containsNavOrHeader(node) {
  if (!node) return false;
  if (isNavOrHeader(node)) return true;
  if (node.childNodes) {
    for (const c of node.childNodes) {
      if (containsNavOrHeader(c)) return true;
    }
  }
  return false;
}

function getVisualContentWidth(node) {
  if (!node) return 0;
  if (node.type === 'TEXT' || node.type === 'VECTOR' || node.type === 'RECTANGLE' || node.type === 'INSTANCE') {
    return node.width;
  }
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    if (!node.children || node.children.length === 0) return node.width;
    let maxRight = 0;
    for (const c of node.children) {
      if (c.visible === false) continue;
      if (c.name && (c.name.includes('mask') || c.name.includes('-bg') || c.name.includes('-border'))) continue;
      const cW = getVisualContentWidth(c);
      maxRight = Math.max(maxRight, (c.x || 0) + cW);
    }
    return maxRight > 0 ? maxRight : node.width;
  }
  return node.width;
}

function isInlineFlowElement(domNode) {
  if (!domNode) return false;
  if (domNode.nodeType === 3) return true;
  const disp = (domNode.styles?.display || '').toLowerCase();
  if (['inline', 'inline-block', 'inline-flex', 'contents'].includes(disp)) return true;
  const tag = (domNode.tag || '').toUpperCase();
  const inlineTags = ['SPAN', 'A', 'EM', 'STRONG', 'B', 'I', 'SMALL', 'SUB', 'SUP', 'LABEL', 'CODE', 'TIME', 'ABBR'];
  if (inlineTags.includes(tag) || tag.includes('LINK')) return true;
  return false;
}

function getRawStackingLevel(s) {
  if (!s) return 0;
  const zRaw = s.zIndex;
  const pos = s.position || 'static';
  const isPos = pos === 'absolute' || pos === 'fixed' || pos === 'relative' || pos === 'sticky';

  if (zRaw && zRaw !== 'auto') {
    const parsed = parseInt(zRaw, 10);
    if (!isNaN(parsed)) {
      if (parsed < 0) {
        // Negative z-index: strictly preserved below 0. Scale by 100,000 so -1 is -100,000.
        return parsed * 100000;
      }
      if (parsed === 0) {
        return 1000;
      }
      // Positive z-index: strictly above positioned-auto (1000). e.g. z=1 -> 100,000; z=2 -> 200,000
      return parsed * 100000;
    }
  }

  // Positioned elements with z-index: auto/0 stack above normal in-flow static elements (0)
  if (isPos) {
    const isBackdrop = (s.backdropFilter && s.backdropFilter !== 'none' && s.backdropFilter.includes('blur')) ||
                       (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none' && s.webkitBackdropFilter.includes('blur'));
    if (isBackdrop) return 500;
    return 1000;
  }

  return 0;
}

function createsStackingContext(node) {
  if (!node) return false;
  const s = node.styles || {};
  const zRaw = s.zIndex;
  const pos = s.position || 'static';
  const isPos = pos === 'absolute' || pos === 'fixed' || pos === 'relative' || pos === 'sticky';

  if (node.tag === 'HTML' || node.tag === 'BODY') return true;
  if (isPos && zRaw && zRaw !== 'auto') return true;
  if (pos === 'fixed' || pos === 'sticky') return true;
  if (s.opacity && parseFloat(s.opacity) < 0.999) return true;
  if (s.transform && s.transform !== 'none') return true;
  if (s.filter && s.filter !== 'none') return true;
  if (s.clipPath && s.clipPath !== 'none') return true;
  if ((s.mask && s.mask !== 'none') || (s.maskImage && s.maskImage !== 'none') || (s.webkitMaskImage && s.webkitMaskImage !== 'none')) return true;
  if (s.isolation === 'isolate') return true;
  if (s.mixBlendMode && s.mixBlendMode !== 'normal') return true;

  return false;
}

function getMaxDescendantZ(node) {
  let maxZ = 0;

  function scan(cn) {
    if (!cn) return;
    const all = [];
    if (cn.pseudoElementNodes?.before) all.push(cn.pseudoElementNodes.before);
    if (cn.childNodes) {
      for (let i = 0; i < cn.childNodes.length; i++) all.push(cn.childNodes[i]);
    }
    if (cn.pseudoElementNodes?.after) all.push(cn.pseudoElementNodes.after);

    for (const c of all) {
      const cLevel = getRawStackingLevel(c.styles);
      if (cLevel > maxZ) {
        maxZ = cLevel;
      }
      if (!createsStackingContext(c)) {
        scan(c);
      }
    }
  }

  scan(node);
  return maxZ;
}

function isBackgroundOverlay(node) {
  if (!node) return false;
  const cls = (node.attributes?.class || '').toLowerCase();
  const id = (node.attributes?.id || node.id || '').toLowerCase();
  const tag = (node.tag || '').toLowerCase();

  if (/\b(?:lines|grid-lines|bg-lines|background-lines|stripes|bg-stripes|pattern-bg|bg-pattern|section-lines|banner-lines|bg-shape|shape-bg|bg-overlay|overlay-bg|bottom-image-layer)\b/.test(cls) ||
      /\b(?:lines|grid-lines|bg-lines|stripes|bg-stripes|pattern-bg)\b/.test(id)) {
    return true;
  }
  if (tag === 'svg' && (id.includes('svg-bg') || cls.includes('lines') || cls.includes('stripes'))) {
    return true;
  }
  const bgImg = (node.styles?.backgroundImage || '').toLowerCase();
  if (bgImg && (bgImg.includes('stripe') || bgImg.includes('pattern') || bgImg.includes('grid') || bgImg.includes('texture') || bgImg.includes('mesh'))) {
    return true;
  }
  if (node.attributes?.src) {
    const src = node.attributes.src.toLowerCase();
    if (src.includes('stripe') || src.includes('grid') || src.includes('pattern') || src.includes('texture') || src.includes('mesh')) {
      return true;
    }
  }
  if (node.styles?.mixBlendMode === 'multiply' && (cls.includes('parallax') || cls.includes('layer') || cls.includes('bg'))) {
    return true;
  }
  return false;
}

function getEffectiveZIndex(node, isSectionLevel = false) {
  if (!node) return 0;
  const s = node.styles || {};
  let z = getRawStackingLevel(s);

  // Nav bar / header pinned to top tier
  if (isNavOrHeader(node) || containsNavOrHeader(node)) {
    z = Math.max(z, 1000000000);
  }
  if (containsNavButton(node)) {
    z = Math.max(z, 1000000600);
  } else if (containsNavLogo(node)) {
    z = Math.max(z, 1000000500);
  }

  // Strictly preserve negative z-index: in CSS, elements with negative z-index (e.g. -1)
  // MUST render behind in-flow content and positioned elements. Never clobber to 0!
  if (z < 0) {
    return z;
  }

  // Background overlay / stripes protection:
  // If an element is a background grid/stripes/lines overlay without explicit positive z-index,
  // ensure it never floats above foreground content.
  if (isBackgroundOverlay(node) && z <= 100000) {
    return -500;
  }

  // Top-level page sections (direct children of body/page-wrapper) with default or auto z-index
  // maintain natural DOM order to prevent later sections from jumping over earlier ones
  const isSectionTag = ['SECTION', 'FOOTER', 'MAIN', 'ARTICLE'].includes(node.tag);
  if (isSectionLevel && isSectionTag && (s.zIndex === 'auto' || !s.zIndex) && z < 1000000000) {
    return 0;
  }

  // CSS Stacking Context propagation:
  // If this container does NOT establish an isolated stacking context,
  // bubble up the maximum positive stacking level of its descendants so
  // positioned children (like badges, buttons, foreground cards) are NEVER
  // obscured by sibling background overlays that have lower z-index!
  if (!createsStackingContext(node)) {
    const descZ = getMaxDescendantZ(node);
    if (descZ > z) {
      z = descZ;
    }
  }

  return z;
}


function getUnrotatedRectInRotationRoot(nodeRect, activeRotation, isText = false) {
  if (!nodeRect || !activeRotation || !activeRotation.rootRect) return null;
  const cos = activeRotation.cosR != null ? activeRotation.cosR : Math.cos((activeRotation.rotRad || 0));
  const sin = activeRotation.sinR != null ? activeRotation.sinR : Math.sin((activeRotation.rotRad || 0));

  const rootCenterX = (activeRotation.rootRect.x || 0) + (activeRotation.rootRect.width || 0) / 2;
  const rootCenterY = (activeRotation.rootRect.y || 0) + (activeRotation.rootRect.height || 0) / 2;

  const localCenterX = activeRotation.rootUnrotW / 2;
  const localCenterY = activeRotation.rootUnrotH / 2;

  const nodeCenterX = (nodeRect.x || 0) + (nodeRect.width || 0) / 2;
  const nodeCenterY = (nodeRect.y || 0) + (nodeRect.height || 0) / 2;

  const dx = nodeCenterX - rootCenterX;
  const dy = nodeCenterY - rootCenterY;

  const localDx = dx * cos - dy * sin;
  const localDy = dx * sin + dy * cos;

  const nodeLocalCenterX = localCenterX + localDx;
  const nodeLocalCenterY = localCenterY + localDy;

  let nodeUnrotW = nodeRect.offsetWidth || 0;
  let nodeUnrotH = nodeRect.offsetHeight || 0;
  const is90Or270Deg = Math.abs(Math.abs(activeRotation.angleDeg) - 90) < 1 || Math.abs(Math.abs(activeRotation.angleDeg) - 270) < 1;
  if (isText || (nodeRect.width > 0 && Math.abs(activeRotation.angleDeg) < 45 && nodeUnrotW > nodeRect.width * 1.5)) {
    nodeUnrotW = nodeRect.width;
    nodeUnrotH = nodeRect.height;
  }
  if (nodeUnrotW <= 0) {
    nodeUnrotW = is90Or270Deg ? (nodeRect.height || 0) : (nodeRect.width || 0);
  }
  if (nodeUnrotH <= 0) {
    nodeUnrotH = is90Or270Deg ? (nodeRect.width || 0) : (nodeRect.height || 0);
  }

  return {
    x: Math.round(nodeLocalCenterX - nodeUnrotW / 2),
    y: Math.round(nodeLocalCenterY - nodeUnrotH / 2),
    width: Math.round(nodeUnrotW),
    height: Math.round(nodeUnrotH)
  };
}

async function renderNode(sNode, parentFrame, parentX, parentY, assets, inheritedStyles, inheritedTextClip = null, activeRotation = null, parentNode = null, isVerticalInverted = false, parentUnrotOrigin = { x: 0, y: 0 }, inheritedBgColor = null) {
  if (!sNode) return null;

  if (sNode.nodeType === 3 /* TEXT */) {
    const textNode = await renderTextNode(sNode, parentFrame, parentX, parentY, inheritedStyles, inheritedTextClip, activeRotation, parentNode, isVerticalInverted, parentUnrotOrigin, inheritedBgColor);
    reportProgress();
    return textNode;
  }

  const s = sNode.styles || inheritedStyles || {};
  let currentBgColor = inheritedBgColor;
  const myBg = parseColor(s.backgroundColor);
  if (myBg && myBg.a > 0.05) {
    currentBgColor = { r: myBg.r, g: myBg.g, b: myBg.b };
  } else if (s._effectiveBgColor) {
    const eff = parseColor(s._effectiveBgColor);
    if (eff && eff.a > 0.05) currentBgColor = { r: eff.r, g: eff.g, b: eff.b };
  }
  let currentTextClip = inheritedTextClip;
  if (isBackgroundClipText(s)) {
    currentTextClip = s;
  }

  let activeTextDecoration = inheritedStyles?._activeTextDecoration || null;
  const myDec = (s.textDecorationLine || s.textDecoration || '').toLowerCase();
  if (myDec.includes('underline')) {
    activeTextDecoration = 'underline';
  } else if (myDec.includes('line-through')) {
    activeTextDecoration = 'line-through';
  }
  s._activeTextDecoration = activeTextDecoration;

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

  let myUnrotOrigin = parentUnrotOrigin;
  if (!sNode._localRect && activeRotation) {
    const unrotRect = getUnrotatedRectInRotationRoot(sNode.rect, activeRotation);
    if (unrotRect) {
      sNode._localRect = {
        x: unrotRect.x - (parentUnrotOrigin?.x || 0),
        y: unrotRect.y - (parentUnrotOrigin?.y || 0),
        width: unrotRect.width,
        height: unrotRect.height
      };
      myUnrotOrigin = { x: unrotRect.x, y: unrotRect.y };
    }
  } else if (sNode._localRect && activeRotation) {
    myUnrotOrigin = {
      x: (parentUnrotOrigin?.x || 0) + sNode._localRect.x,
      y: (parentUnrotOrigin?.y || 0) + sNode._localRect.y
    };
  }
  // If this is a header or nav wrapper whose height is 0 or less than its visible children (e.g. static <header> wrapping fixed <nav>),
  // expand its bounding rect to properly encompass its children so it doesn't have 0 height or negative child coordinates.
  if (isNavOrHeader(sNode) && sNode.childNodes && sNode.childNodes.length > 0) {
    let minY = sNode.rect?.y != null ? sNode.rect.y : 0;
    let maxY = (sNode.rect?.y || 0) + (sNode.rect?.height || 0);
    for (const c of sNode.childNodes) {
      if (c.rect && c.rect.height > 0) {
        minY = Math.min(minY, c.rect.y);
        maxY = Math.max(maxY, c.rect.y + c.rect.height);
      }
    }
    const targetH = maxY - minY;
    if (minY < (sNode.rect?.y || 0) || (sNode.rect?.height || 0) < targetH) {
      sNode.rect = {
        ...sNode.rect,
        y: minY,
        height: Math.max(sNode.rect?.height || 0, targetH)
      };
    }
  }

  const origW = Math.round(sNode.rect?.offsetWidth || sNode.rect?.width || 0);
  const origH = Math.round(sNode.rect?.offsetHeight || sNode.rect?.height || 0);
  const boxW = Math.round(sNode.rect?.width || origW);
  const boxH = Math.round(sNode.rect?.height || origH);

  let x, y;
  let trueGlobalX = Math.round(sNode.rect?.x || 0);
  let trueGlobalY = Math.round(sNode.rect?.y || 0);

  if (sNode._localRect) {
    x = sNode._localRect.x;
    y = sNode._localRect.y;
  } else {
    if (origW > 0 && boxW > origW + 1) {
      const centerX = (sNode.rect?.x || 0) + (sNode.rect?.width || 0) / 2;
      x = Math.round(centerX - parentX - origW / 2);
      trueGlobalX = Math.round(centerX - origW / 2);
    } else {
      x = Math.round((sNode.rect?.x || 0) - parentX);
    }
    if (origH > 0 && boxH > origH + 1) {
      const centerY = (sNode.rect?.y || 0) + (sNode.rect?.height || 0) / 2;
      y = Math.round(centerY - parentY - origH / 2);
      trueGlobalY = Math.round(centerY - origH / 2);
    } else {
      y = Math.round((sNode.rect?.y || 0) - parentY);
    }
  }
  const w = Math.max(1, sNode._localRect ? sNode._localRect.width : origW);
  const h = Math.max(1, sNode._localRect ? sNode._localRect.height : origH);

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

      let cleanSvg = prepareSvgString(sNode.content, hasInvertFilter(s.filter), s);
      if (flipX || flipY) {
        cleanSvg = applySvgFlip(cleanSvg, flipX, flipY);
      }
      const svgNode = figma.createNodeFromSvg(cleanSvg);
      svgNode.name = (sNode.tag || 'node').toLowerCase();
      try { svgNode.clipsContent = false; } catch {}
      hydrateSvgPatterns(svgNode, sNode.content);
      let newW = w;
      let newH = h;
      let offsetX = 0;
      let offsetY = 0;
      if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
        try {
          const hasPreserveNone = /preserveAspectRatio\s*=\s*['"]none['"]/i.test(cleanSvg);
          if (hasPreserveNone || svgNode.width <= 0 || svgNode.height <= 0) {
            svgNode.resize(w, h);
          } else {
            const scale = Math.min(w / svgNode.width, h / svgNode.height);
            newW = Math.max(1, svgNode.width * scale);
            newH = Math.max(1, svgNode.height * scale);
            svgNode.resize(newW, newH);
            offsetX = (w - newW) / 2;
            offsetY = (h - newH) / 2;
          }
        } catch {}
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
        const cX = x + Math.round(offsetX) + halfW;
        const cY = y + Math.round(offsetY) + halfH;
        const dx = halfW * Math.cos(rad) + halfH * Math.sin(rad);
        const dy = -halfW * Math.sin(rad) + halfH * Math.cos(rad);
        svgNode.x = Math.round(cX - dx);
        svgNode.y = Math.round(cY - dy);
      } else {
        svgNode.x = x + Math.round(offsetX);
        svgNode.y = y + Math.round(offsetY);
      }
      applyOpacity(svgNode, s);

      const isMask = (s.maskImage && s.maskImage !== 'none') || (s.webkitMaskImage && s.webkitMaskImage !== 'none');
      const hasBg = !isMask && ((s.backgroundColor && s.backgroundColor !== 'transparent' && s.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
                    (s.backgroundImage && s.backgroundImage !== 'none'));
      const hasBorder = (s.borderTopWidth && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') ||
                        (s.borderRightWidth && parseFloat(s.borderRightWidth) > 0 && s.borderRightStyle !== 'none') ||
                        (s.borderBottomWidth && parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none') ||
                        (s.borderLeftWidth && parseFloat(s.borderLeftWidth) > 0 && s.borderLeftStyle !== 'none');
      const hasRadius = !isMask && (s.borderRadius && s.borderRadius !== '0px' && s.borderRadius !== '0');

      let bgFrame = null;
      if (hasBg || hasBorder || hasRadius) {
        bgFrame = figma.createFrame();
        bgFrame.name = (sNode.tag || 'svg-wrap').toLowerCase();
        if (s.position === 'absolute' || s.position === 'fixed') {
          try { bgFrame.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
        }
        parentFrame.appendChild(bgFrame);
        bgFrame.x = x;
        bgFrame.y = y;
        bgFrame.resize(Math.max(1, w), Math.max(1, h));
        bgFrame.clipsContent = true;
        await applyFills(bgFrame, s, assets, w, h, true);
        applyStrokes(bgFrame, s);
        applyEffects(bgFrame, s, currentBgColor);
        applyCornerRadius(bgFrame, s);
        applyOpacity(bgFrame, s);
        
        // Move svgNode inside the bgFrame centered
        bgFrame.appendChild(svgNode);
        svgNode.x = Math.round((w - svgNode.width) / 2);
        svgNode.y = Math.round((h - svgNode.height) / 2);
      }

      reportProgress();
      return bgFrame || svgNode;
    } catch (err) {
      console.warn('[HTML-2-Fig] Svg vector parse failed, creating fallback frame:', err);
      const svgFrame = figma.createFrame();
      svgFrame.name = (sNode.tag || 'svg').toLowerCase();
      svgFrame.fills = [];
      svgFrame.clipsContent = false;
      parentFrame.appendChild(svgFrame);
      svgFrame.x = x; svgFrame.y = y;
      svgFrame.resize(w, h);
      reportProgress();
      return svgFrame;
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

            const cleanSvg = prepareSvgString(svgString, hasInvertFilter(s.filter), s);
            const svgNode = figma.createNodeFromSvg(cleanSvg);
            svgNode.name = sNode.attributes?.alt || 'img-svg';
            hydrateSvgPatterns(svgNode, svgString);
            if (s.position === 'absolute' || s.position === 'fixed') {
              try { svgNode.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
            }
            let newW = w;
            let newH = h;
            let offsetX = 0;
            let offsetY = 0;
            if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
              try {
                const hasPreserveNone = /preserveAspectRatio\s*=\s*['"]none['"]/i.test(cleanSvg);
                if (hasPreserveNone || svgNode.width <= 0 || svgNode.height <= 0) {
                  svgNode.resize(w, h);
                } else {
                  const scale = Math.min(w / svgNode.width, h / svgNode.height);
                  newW = Math.max(1, svgNode.width * scale);
                  newH = Math.max(1, svgNode.height * scale);
                  svgNode.resize(newW, newH);
                  offsetX = (w - newW) / 2;
                  offsetY = (h - newH) / 2;
                }
              } catch {}
            }
            parentFrame.appendChild(svgNode);
            svgNode.x = x + Math.round(offsetX);
            svgNode.y = y + Math.round(offsetY);
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
              bgFrame.x = x;
              bgFrame.y = y;
              bgFrame.resize(Math.max(1, w), Math.max(1, h));
              bgFrame.clipsContent = true;
              await applyFills(bgFrame, s, assets, w, h, true);
              applyStrokes(bgFrame, s);
              applyEffects(bgFrame, s, currentBgColor);
              applyCornerRadius(bgFrame, s);
              applyOpacity(bgFrame, s);

              // Move svgNode inside bgFrame centered
              bgFrame.appendChild(svgNode);
              svgNode.x = Math.round((w - svgNode.width) / 2);
              svgNode.y = Math.round((h - svgNode.height) / 2);
            }

            reportProgress();
            return bgFrame || svgNode;
          } catch (svgErr) {
            console.warn('[HTML-2-Fig] SVG import failed, creating SVG frame fallback:', svgErr);
            const svgFrame = figma.createFrame();
            svgFrame.name = sNode.attributes?.alt || 'img-svg';
            svgFrame.fills = [];
            svgFrame.clipsContent = false;
            parentFrame.appendChild(svgFrame);
            svgFrame.x = x; svgFrame.y = y;
            svgFrame.resize(w, h);
            reportProgress();
            return svgFrame;
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
            applyEffects(imgFrame, s, currentBgColor);
            applyCornerRadius(imgFrame, s);
            applyOpacity(imgFrame, s);
            reportProgress();
            return imgFrame;
          }

          const rect = figma.createRectangle();
          rect.name = sNode.attributes?.alt || 'img';
          if (s.position === 'absolute' || s.position === 'fixed') {
            try { rect.layoutPositioning = 'ABSOLUTE'; } catch(e) {}
          }
          parentFrame.appendChild(rect);

          // Parallax / Jarallax image guard:
          // If an oversized image inside an overflow-clipped container is shifted so far off-axis
          // that it fails to cover the container (e.g. jarallax scroll offset pushing the image up),
          // vertically center it so it fully covers the frame without leaving blank voids.
          const isParallaxImg = (sNode.attributes?.class && sNode.attributes.class.includes('jarallax')) ||
                                (sNode.id && sNode.id.includes('jarallax')) ||
                                (parentFrame.name && (parentFrame.name.includes('jarallax') || parentFrame.name.includes('parallax')));
          if ((isParallaxImg || (parentFrame.clipsContent && h > parentFrame.height)) && parentFrame.height > 10) {
            if (y + h < parentFrame.height || y > 0) {
              y = Math.round((parentFrame.height - h) / 2);
            }
          }

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
          applyEffects(rect, s, currentBgColor);
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
          return rect;
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
            const cleanSvg = prepareSvgString(svgString, hasInvertFilter(s.filter), s);
            const svgNode = figma.createNodeFromSvg(cleanSvg);
            svgNode.name = (sNode.tag || 'node').toLowerCase();
            let newW = w;
            let newH = h;
            let offsetX = 0;
            let offsetY = 0;
            if (w >= 1 && h >= 1 && !isNaN(w) && !isNaN(h) && (Math.abs(svgNode.width - w) > 1 || Math.abs(svgNode.height - h) > 1)) {
              try {
                const hasPreserveNone = /preserveAspectRatio\s*=\s*['"]none['"]/i.test(cleanSvg);
                if (hasPreserveNone || svgNode.width <= 0 || svgNode.height <= 0) {
                  svgNode.resize(w, h);
                } else {
                  const scale = Math.min(w / svgNode.width, h / svgNode.height);
                  newW = Math.max(1, svgNode.width * scale);
                  newH = Math.max(1, svgNode.height * scale);
                  svgNode.resize(newW, newH);
                  offsetX = (w - newW) / 2;
                  offsetY = (h - newH) / 2;
                }
              } catch {}
            }
            await renderSvgTexts(svgNode, sNode);
            parentFrame.appendChild(svgNode);
            svgNode.x = x + Math.round(offsetX);
            svgNode.y = y + Math.round(offsetY);
            applyOpacity(svgNode, s);
            reportProgress();
            return svgNode;
          }

          const rect = figma.createRectangle();
          rect.name = (sNode.tag || 'node').toLowerCase();
          parentFrame.appendChild(rect);
          rect.x = x; rect.y = y;
          rect.resize(w, h);
          const img = figma.createImage(bytes);
          rect.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }];
          applyStrokes(rect, s);
          applyEffects(rect, s, currentBgColor);
          applyCornerRadius(rect, s);
          applyOpacity(rect, s);
          reportProgress();
          return rect;
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
          return vecNode;
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

  // If a marquee / ticker slider was captured mid-flight with a large negative translate,
  // normalize it so the wrapper starts at x=0 inside its parent and child slides flow properly
  const isMarqueeWrapper = sNode.attributes?.class && /swiper-wrapper|marquee|ticker/i.test(sNode.attributes.class);
  if (isMarqueeWrapper && x < -100) {
    const shiftX = -x;
    x = 0;
    trueGlobalX = Math.round(parentX);
    const shiftTreeX = (n) => {
      if (!n) return;
      if (n.rect) n.rect.x = (n.rect.x || 0) + shiftX;
      if (n.childNodes) {
        for (const child of n.childNodes) shiftTreeX(child);
      }
      if (n.pseudoElementNodes?.before) shiftTreeX(n.pseudoElementNodes.before);
      if (n.pseudoElementNodes?.after) shiftTreeX(n.pseudoElementNodes.after);
    };
    if (sNode.childNodes) {
      for (const c of sNode.childNodes) shiftTreeX(c);
    }
  }

  frame.x = x;
  frame.y = y;

  let rectW = w;
  let rectH = h;

  // Apply CSS transform rotation (e.g. rotated ribbons, badges, polaroid cards)
  let angleDeg = 0;
  const isVerticalFlow = (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr');
  let has180 = false;
  if (s.transform && s.transform.includes('matrix')) {
    const parts = s.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (parts) {
      const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
      let a = vals[0], b = vals[1];
      const tAngle = Math.atan2(b, a) * (180 / Math.PI);
      if (Math.abs(Math.abs(tAngle) - 180) < 1) {
        has180 = true;
      }
      // If the container has vertical text flow, vertical-rl already defines its vertical layout box.
      // A 180deg transform on it is the standard web pattern to invert text direction to bottom-to-top.
      // The frame itself must remain axis-aligned; the rotation is applied to the text inside.
      if (isVerticalFlow && has180) {
        angleDeg = 0;
      } else {
        angleDeg = tAngle;
      }
    }
  } else if (!isVerticalFlow && s.rotate && s.rotate !== 'none') {
    const r = s.rotate.trim().toLowerCase();
    let rDeg = 0;
    if (r.includes('deg')) rDeg = parseFloat(r);
    else if (r.includes('rad')) rDeg = (parseFloat(r) * 180) / Math.PI;
    else if (r.includes('turn')) rDeg = parseFloat(r) * 360;
    if (Math.abs(Math.abs(rDeg) - 180) < 1) has180 = true;
    if (isVerticalFlow && has180) {
      angleDeg = 0;
    } else {
      angleDeg = rDeg;
    }
  }

  if (sNode.attributes?.class && /rs-rotate|tp-loop-wrap|loop-wrap/i.test(sNode.attributes.class)) {
    angleDeg = 0;
  }

  const nextVerticalInverted = isVerticalInverted || (isVerticalFlow && has180);

  let nextRotation = activeRotation;
  if (Math.abs(angleDeg) > 0.1 && !activeRotation) {
    const rotDeg = -angleDeg;
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

    // In Figma, node.rotation rotates around its top-left corner via [[cos, sin, tx], [-sin, cos, ty]].
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

    nextRotation = {
      rootNode: sNode,
      angleDeg,
      rotRad,
      cosR,
      sinR,
      rootRect: sNode.rect,
      rootUnrotW: rectW,
      rootUnrotH: rectH
    };
    myUnrotOrigin = { x: 0, y: 0 };

    // Map children from global screen coordinates into this frame's unrotated local coordinate system
    const mapToLocal = (childNode) => {
      if (!childNode || !childNode.rect) return;
      const unrotRect = getUnrotatedRectInRotationRoot(childNode.rect, nextRotation);
      if (unrotRect) {
        // If parent is a flex container centering its items or has single child/pseudo, check if child is centered in parent
        const pDisplay = (sNode.styles?.display || '');
        const pAlign = (sNode.styles?.alignItems || '');
        const pJustify = (sNode.styles?.justifyContent || '');
        const isCenteredParent = (pDisplay.includes('flex') && (pAlign === 'center' || pAlign === '') && (pJustify === 'center' || pJustify === '')) ||
                                 (sNode.styles?.textAlign === 'center');

        let cX = unrotRect.x;
        let cY = unrotRect.y;
        if (isCenteredParent && (!sNode.childNodes || sNode.childNodes.length === 0)) {
          cX = Math.round(halfW - unrotRect.width / 2);
          cY = Math.round(halfH - unrotRect.height / 2);
        }

        childNode._localRect = {
          x: cX,
          y: cY,
          width: unrotRect.width,
          height: unrotRect.height
        };
      }
    };

    if (sNode.pseudoElementNodes?.before) mapToLocal(sNode.pseudoElementNodes.before);
    if (sNode.pseudoElementNodes?.after) mapToLocal(sNode.pseudoElementNodes.after);
    if (sNode.childNodes) {
      for (const child of sNode.childNodes) {
        mapToLocal(child);
      }
    }
  }

  // Concentric pseudo-elements alignment (e.g. pulsing ripple rings, circular badge borders):
  // When a pseudo-element is geometrically concentric with parent (centers within 2.5px),
  // lock its localRect so it remains strictly concentric with the parent frame.
  for (const pKey of ['before', 'after']) {
    const pseudoNode = sNode.pseudoElementNodes?.[pKey];
    if (pseudoNode && pseudoNode.rect) {
      const pCenterX = (sNode.rect?.x || 0) + (sNode.rect?.width || rectW) / 2;
      const pCenterY = (sNode.rect?.y || 0) + (sNode.rect?.height || rectH) / 2;
      const psCenterX = (pseudoNode.rect.x || 0) + (pseudoNode.rect.width || 0) / 2;
      const psCenterY = (pseudoNode.rect.y || 0) + (pseudoNode.rect.height || 0) / 2;
      if (Math.abs(pCenterX - psCenterX) <= 2.5 && Math.abs(pCenterY - psCenterY) <= 2.5) {
        const psW = Math.round(pseudoNode.rect.width || 0);
        const psH = Math.round(pseudoNode.rect.height || 0);
        if (psW > 0 && psH > 0) {
          pseudoNode._localRect = {
            x: Math.round((rectW - psW) / 2),
            y: Math.round((rectH - psH) / 2),
            width: psW,
            height: psH
          };
        }
      }
    }
  }

  // Unrotated container: center single child or pseudo if parent is an icon container or centers alignment
  if (!activeRotation && Math.abs(angleDeg) <= 0.1) {
    const isSmallSquare = (rectW <= 96 && rectH <= 96);
    const isIconContainer = isSmallSquare && (
      (Math.abs(rectW - rectH) <= 12 && (parseFloat(s.borderRadius) >= 4 || s.borderRadius === '50%' || s.borderRadius === '500px')) ||
      (sNode.name && sNode.name.includes('icon')) ||
      (sNode.id && sNode.id.includes('icon')) ||
      (sNode.attributes?.class && /\b(?:btn-icon|social-icon|avatar|badge|rounded-circle|icon-holder|icon-wrap|icon-inner|icon-box-icon)\b/i.test(sNode.attributes.class))
    );
    const isFlexCenter = s.display && s.display.includes('flex') && s.alignItems === 'center' && (s.justifyContent === 'center' || s.justifyContent === 'normal');
    const isCentered = isIconContainer || isFlexCenter;

    const directChildren = [];
    if (sNode.pseudoElementNodes?.before) directChildren.push(sNode.pseudoElementNodes.before);
    if (sNode.childNodes) { for (let i = 0; i < sNode.childNodes.length; i++) directChildren.push(sNode.childNodes[i]); }
    if (sNode.pseudoElementNodes?.after) directChildren.push(sNode.pseudoElementNodes.after);

    const nonAbsoluteChildren = (sNode.childNodes || []).filter(c => {
      const pos = c.styles?.position || '';
      return pos !== 'absolute' && pos !== 'fixed';
    });

    if (isCentered && (directChildren.length === 1 || nonAbsoluteChildren.length === 1)) {
      const onlyChild = nonAbsoluteChildren.length === 1 ? nonAbsoluteChildren[0] : directChildren[0];
      const childPos = onlyChild.styles?.position || '';
      const isAbsoluteChild = childPos === 'absolute' || childPos === 'fixed';
      const cW = Math.max(1, Math.round(onlyChild.rect?.width || 0));
      const cH = Math.max(1, Math.round(onlyChild.rect?.height || 0));
      const isChildIcon = (onlyChild.tag === 'I' || (onlyChild.tag === 'SVG' && cW <= 64 && cH <= 64) || (onlyChild.id && onlyChild.id.includes('icon')) || (onlyChild.attributes?.alt === 'icon'));

      if (!isAbsoluteChild && (isIconContainer || (isFlexCenter && isChildIcon))) {
        onlyChild._localRect = {
          x: Math.round((rectW - cW) / 2),
          y: Math.round((rectH - cH) / 2),
          width: cW,
          height: cH
        };
      }
    }
  }

  // Progressive blur containers: divide child slices vertically into N horizontal bands
  const isProgressiveBlurContainer = (sNode.attributes?.class && /progressive-blur/i.test(sNode.attributes.class)) ||
    (sNode.childNodes && sNode.childNodes.length >= 4 && sNode.childNodes.every(c => (c.styles?.backdropFilter || c.styles?.webkitBackdropFilter || '').includes('blur')));

  if (isProgressiveBlurContainer && sNode.childNodes && sNode.childNodes.length > 1) {
    const isBlurBottom = (sNode.attributes?.class && /blur-bottom/i.test(sNode.attributes.class)) || !(/blur-top/i.test(sNode.attributes?.class || ''));
    const nSlices = sNode.childNodes.length;
    const sliceH = rectH / nSlices;
    sNode.childNodes.forEach((c, idx) => {
      const bandIdx = isBlurBottom ? idx : (nSlices - 1 - idx);
      const bY = Math.round(bandIdx * sliceH);
      const bH = Math.max(1, Math.round(sliceH));
      c._localRect = {
        x: 0,
        y: bY,
        width: rectW,
        height: bH
      };
      if (c.rect) {
        c.rect = { ...c.rect, x: sNode.rect?.x || 0, y: (sNode.rect?.y || 0) + bY, width: rectW, height: bH };
      }
      if (!c.styles) c.styles = {};
      c.styles._needsBgBlurFill = true;
    });
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

  // Expand zero-height/width structural containers (e.g. <header>, <div> wrappers) that contain children
  if (rectH < 1 && sNode.childNodes && sNode.childNodes.length > 0) {
    let maxChildBottom = 0;
    for (const c of sNode.childNodes) {
      if (c.rect) {
        maxChildBottom = Math.max(maxChildBottom, (c.rect.y || 0) + (c.rect.height || 0));
      }
    }
    const childrenSpan = maxChildBottom - (sNode.rect?.y || 0);
    if (childrenSpan > 0) {
      rectH = Math.max(rectH, Math.round(childrenSpan));
    }
  }
  if ((rectW < 1 || isMarqueeWrapper) && sNode.childNodes && sNode.childNodes.length > 0) {
    let maxChildRight = 0;
    for (const c of sNode.childNodes) {
      if (c.rect) {
        maxChildRight = Math.max(maxChildRight, (c.rect.x || 0) + (c.rect.width || 0));
      }
    }
    const childrenSpanW = maxChildRight - (sNode.rect?.x || 0);
    if (childrenSpanW > rectW) {
      rectW = Math.max(rectW, Math.round(childrenSpanW));
    }
  }

  frame.resize(rectW, rectH);
  const clipValues = ['hidden', 'clip', 'auto', 'scroll'];
  const isPageLevelWrapper = sNode.attributes?.id === 'smooth-wrapper' ||
                             sNode.attributes?.id === 'smooth-content' ||
                             (sNode.attributes?.class && /dialog-off-canvas|my-app|page-wrapper|main-wrapper|site-wrapper|root-wrapper/i.test(sNode.attributes.class));
  const isCarouselSlide = sNode.attributes?.class && /swiper-slide|slick-slide|owl-item/i.test(sNode.attributes.class);
  frame.clipsContent = isCarouselSlide || (!isPageLevelWrapper && (clipValues.includes(s.overflow) || clipValues.includes(s.overflowX) || clipValues.includes(s.overflowY)));

  const hasChildren = (sNode.childNodes && sNode.childNodes.length > 0) ||
                      (sNode.pseudoElementNodes?.before != null) ||
                      (sNode.pseudoElementNodes?.after != null) ||
                      (sNode.text && sNode.text.trim().length > 0);
  await applyFills(frame, s, assets, rectW, rectH, hasChildren);
  applyStrokes(frame, s);
  applyEffects(frame, s, currentBgColor);
  applyCornerRadius(frame, s);
  applyOpacity(frame, s, sNode);
  applyBlendMode(frame, s, sNode);
  // For INPUT elements, if no child text node was captured, synthesize text from value / placeholder
  const isInputTag = sNode.tag === 'INPUT' || (sNode.attributes && sNode.attributes.type);
  const hasTextChild = (sNode.childNodes && sNode.childNodes.some(c => c.nodeType === 3 || c.text)) || (sNode.text && sNode.text.trim());
  if (isInputTag && !hasTextChild) {
    const inputType = (sNode.attributes?.type || 'text').toLowerCase();
    const rawVal = sNode.attributes?.value || '';
    let displayVal = '';
    if (rawVal) {
      if (inputType === 'date') {
        const parts = rawVal.split('-');
        if (parts.length === 3) displayVal = `${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}/${parts[0]}`;
        else displayVal = rawVal;
      } else if (inputType === 'time') {
        const parts = rawVal.split(':');
        if (parts.length >= 2) {
          let h = parseInt(parts[0], 10);
          const min = parts[1].padStart(2, '0');
          const ampm = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 || 12;
          displayVal = `${String(h12).padStart(2, '0')}:${min} ${ampm}`;
        } else displayVal = rawVal;
      } else {
        displayVal = rawVal;
      }
    } else {
      displayVal = sNode.attributes?.placeholder || (inputType === 'date' ? 'mm/dd/yyyy' : (inputType === 'time' ? '--:-- --' : ''));
    }
    if (displayVal) {
      const padLeft = parseFloat(s.paddingLeft) || 0;
      const padTop = parseFloat(s.paddingTop) || 0;
      const padRight = parseFloat(s.paddingRight) || 0;
      const padBottom = parseFloat(s.paddingBottom) || 0;
      sNode.childNodes = sNode.childNodes || [];
      sNode.childNodes.unshift({
        nodeType: 3,
        id: (sNode.id || 'input') + '-text',
        text: displayVal,
        rect: {
          x: (sNode.rect?.x || 0) + padLeft,
          y: (sNode.rect?.y || 0) + padTop,
          width: Math.max(1, rectW - padLeft - padRight),
          height: Math.max(1, rectH - padTop - padBottom)
        },
        styles: { ...s },
        lineCount: 1
      });
    }
  }

  // Vertical centering for icon pseudo-elements inside .date-icon and .time-icon
  if (sNode.attributes?.class && /date-icon|time-icon/.test(sNode.attributes.class)) {
    if (sNode.pseudoElementNodes?.after) {
      const afterNode = sNode.pseudoElementNodes.after;
      const iconH = Math.round(afterNode.rect?.height || 34);
      const iconW = Math.round(afterNode.rect?.width || 22);
      const curX = afterNode.rect?.x ? Math.round(afterNode.rect.x - trueGlobalX) : Math.round(rectW - iconW - 28);
      afterNode._localRect = {
        x: curX,
        y: Math.round((rectH - iconH) / 2),
        width: iconW,
        height: iconH
      };
    }
  }

  const allChildren = [];
  if (sNode.pseudoElementNodes?.before) {
    sNode.pseudoElementNodes.before._domIndex = -1;
    allChildren.push(sNode.pseudoElementNodes.before);
  }
  if (sNode.childNodes) {
    for (let i = 0; i < sNode.childNodes.length; i++) {
      if (sNode.childNodes[i]._domIndex === undefined) {
        sNode.childNodes[i]._domIndex = i;
      }
      allChildren.push(sNode.childNodes[i]);
    }
  }
  if (sNode.pseudoElementNodes?.after) {
    sNode.pseudoElementNodes.after._domIndex = 999999999;
    allChildren.push(sNode.pseudoElementNodes.after);
  }

  if (allChildren.length > 1) {
    const isPageLevel = ['BODY', 'HTML'].includes(sNode.tag) || (sNode.attributes?.class && /page-layout|page-wrapper|main-wrapper|site-wrapper/i.test(sNode.attributes.class));
    allChildren.forEach((child, idx) => {
      if (child._domIndex === undefined) {
        child._domIndex = idx;
      }
    });
    allChildren.sort((a, b) => {
      const zA = getEffectiveZIndex(a, isPageLevel);
      const zB = getEffectiveZIndex(b, isPageLevel);
      const diff = zA - zB;
      return diff !== 0 ? diff : a._domIndex - b._domIndex;
    });
  }

  const renderedChildren = [];
  for (const child of allChildren) {
    const fNode = await renderNode(child, frame, trueGlobalX, trueGlobalY, assets, s, currentTextClip, nextRotation, sNode, nextVerticalInverted, myUnrotOrigin, currentBgColor);
    if (fNode) {
      renderedChildren.push({ domNode: child, figmaNode: fNode });
    }
  }

  // Sibling Vertical Flow Push:
  // In HTML document flow, when an element's text wraps or height expands in Figma beyond its captured DOM height,
  // subsequent siblings in vertical flow (elements positioned below it) must be shifted down to preserve the exact DOM gap and prevent vertical collisions.
  for (let i = 0; i < renderedChildren.length - 1; i++) {
    const curr = renderedChildren[i];
    if (!curr.domNode || !curr.figmaNode) continue;
    const currPos = curr.domNode.styles?.position || '';
    if (currPos === 'absolute' || currPos === 'fixed') continue;

    const currDomH = curr.domNode.rect?.height || 0;
    const currActualH = curr.figmaNode.height || 0;
    const extraH = currActualH - currDomH;

    if (currDomH > 0 && extraH > 2) {
      const currDomBottom = (curr.domNode.rect?.y || 0) + currDomH;
      for (let j = i + 1; j < renderedChildren.length; j++) {
        const next = renderedChildren[j];
        if (!next.domNode || !next.figmaNode) continue;
        const nextPos = next.domNode.styles?.position || '';
        if (nextPos === 'absolute' || nextPos === 'fixed') continue;

        // If next is positioned vertically below curr in document flow (not side-by-side on same row)
        if ((next.domNode.rect?.y || 0) >= currDomBottom - 4) {
          next.figmaNode.y += extraH;
          if (next.domNode.rect) {
            next.domNode.rect.y += extraH;
          }
        }
      }
      if (!isPageLevelWrapper) {
        try { frame.resize(frame.width, Math.round(frame.height + extraH)); } catch {}
      }
    }
  }

  if (sNode.text && sNode.text.trim()) {
    await renderTextNode(sNode, frame, trueGlobalX, trueGlobalY, s, currentTextClip, nextRotation, sNode, nextVerticalInverted, myUnrotOrigin, currentBgColor);
  }

  // Handle CSS gradient mask-image (e.g. .feather-shadow left/right text fade)
  const maskGradientStr = (s.maskImage && s.maskImage !== 'none' && s.maskImage.includes('gradient')) ? s.maskImage
    : ((s.webkitMaskImage && s.webkitMaskImage !== 'none' && s.webkitMaskImage.includes('gradient')) ? s.webkitMaskImage
    : ((s.mask && s.mask !== 'none' && s.mask.includes('gradient')) ? s.mask
    : ((s.webkitMask && s.webkitMask !== 'none' && s.webkitMask.includes('gradient')) ? s.webkitMask : null)));

  if (maskGradientStr) {
    let maskFill = null;
    if (maskGradientStr.includes('linear-gradient')) {
      maskFill = parseLinearGradient(maskGradientStr, s);
    } else if (maskGradientStr.includes('radial-gradient')) {
      maskFill = parseRadialGradient(maskGradientStr);
    } else if (maskGradientStr.includes('conic-gradient')) {
      maskFill = parseAngularGradient(maskGradientStr);
    }

    if (maskFill) {
      try {
        const maskRect = figma.createRectangle();
        maskRect.name = 'mask-gradient';
        maskRect.resize(Math.max(1, Math.round(rectW)), Math.max(1, Math.round(rectH)));
        maskRect.x = 0;
        maskRect.y = 0;
        maskRect.fills = [maskFill];
        maskRect.isMask = true;
        try { maskRect.maskType = 'ALPHA'; } catch {}

        if (frame.children && frame.children.length > 0) {
          frame.insertChild(0, maskRect);
          frame.clipsContent = true;
        } else if (frame.fills && frame.fills.length > 0) {
          // Leaf node with fill(s) (e.g. ::before / ::after pseudo-element or styled leaf):
          // In Figma, a mask must be a child that masks other children above it.
          // Move the frame's fills to a child bgRect so Figma's maskRect masks it!
          const bgRect = figma.createRectangle();
          bgRect.name = 'bg-fill';
          bgRect.resize(Math.max(1, Math.round(rectW)), Math.max(1, Math.round(rectH)));
          bgRect.x = 0;
          bgRect.y = 0;
          bgRect.fills = frame.fills;
          frame.fills = [];
          frame.appendChild(maskRect); // child 0: mask
          frame.appendChild(bgRect);   // child 1: masked content
          frame.clipsContent = true;
        }
      } catch (err) {
        console.warn('[HTML-2-Fig] Failed to apply gradient mask:', err);
      }
    }
  }

  // Handle CSS clip-path shapes (ellipse, circle, polygon, path) using figma.createVector + vectorPaths
  // Note: we avoid figma.createNodeFromSvg here because it creates a FrameNode wrapper
  // and extracting/reparenting its child is unreliable. createVector gives us direct control.
  if (s.clipPath && s.clipPath !== 'none') {
    const cp = s.clipPath.trim();
    const cpLower = cp.toLowerCase();
    const isEllipse = cpLower.includes('ellipse');
    const isCircle = cpLower.includes('circle');
    const isPolygon = cpLower.includes('polygon');
    const isPath = cpLower.includes('path');
    const isSmallAvatar = isCircle && (rectW <= 300 && rectH <= 300);

    if (isEllipse || isPolygon || isPath || (isCircle && !isSmallAvatar)) {
      const svgStr = convertClipPathToSvg(cp, Math.round(rectW), Math.round(rectH));
      if (svgStr) {
        try {
          if (frame.fills && Array.isArray(frame.fills) && frame.fills.length > 0) {
            const bgRect = figma.createRectangle();
            bgRect.name = 'bg-fill';
            bgRect.resize(Math.max(1, Math.round(rectW)), Math.max(1, Math.round(rectH)));
            bgRect.x = 0;
            bgRect.y = 0;
            bgRect.fills = frame.fills;
            frame.fills = [];
            frame.appendChild(bgRect);
          }

          let vecNode = null;
          // Strategy 1: Create vector from SVG via Figma's native SVG parser (most robust across all Figma versions)
          try {
            const svgFrame = figma.createNodeFromSvg(svgStr);
            if (svgFrame.children && svgFrame.children.length === 1) {
              vecNode = svgFrame.children[0];
              frame.appendChild(vecNode);
              try { svgFrame.remove(); } catch {}
            } else {
              vecNode = svgFrame;
              frame.appendChild(vecNode);
            }
          } catch (svgErr) {
            console.warn('[HTML-2-Fig] createNodeFromSvg failed:', svgErr);
          }

          if (vecNode) {
            vecNode.name = 'clip-path-mask';
            // Do not override vecNode.x and vecNode.y, they are correctly positioned by the SVG
            vecNode.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }];

            // Unset clipsContent on children so their internal clipping doesn't interfere
            const disableClipsContentDeep = (node, depth = 0) => {
              if (!node || depth > 3) return;
              try { node.clipsContent = false; } catch {}
              if (node.children) {
                for (const child of node.children) disableClipsContentDeep(child, depth + 1);
              }
            };
            for (const c of frame.children) {
              if (c !== vecNode) disableClipsContentDeep(c);
            }

            // Standard Figma masking: bottom-most layer in a frame masks all layers above it
            frame.insertChild(0, vecNode);
            vecNode.isMask = true;
            try { vecNode.maskType = 'ALPHA'; } catch {}

            // Disable parent frame rectangular clipping so it does not override or conflict with the vector mask
            frame.clipsContent = false;
            console.log('[HTML-2-Fig] Applied mask to:', frame.name, 'with svgStr length:', svgStr.length);
          }
        } catch (err) {
          console.warn('[HTML-2-Fig] Failed to apply clip-path mask to:', frame.name, err);
        }
      }
    }
  }

  reportProgress();
  return frame;
}

// Brightens / darkens scroll-reveal / scrub text gradients so text is always captured in its final revealed state
function brightenGradientForText(grad, bgColor = { r: 1, g: 1, b: 1 }) {
  if (!grad || !grad.gradientStops || grad.gradientStops.length === 0) return grad;
  const stops = grad.gradientStops;

  const bg = bgColor || { r: 1, g: 1, b: 1 };
  const bgLum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;

  let maxContrast = -1;
  let targetColor = stops[0].color;

  for (const st of stops) {
    const c = st.color;
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const contrast = Math.abs(lum - bgLum);
    if (contrast > maxContrast) {
      maxContrast = contrast;
      targetColor = c;
    }
  }

  // If Stop 0 has strong contrast against background, prioritize it as the primary intended text color in scrub reveals
  const firstLum = 0.2126 * stops[0].color.r + 0.7152 * stops[0].color.g + 0.0722 * stops[0].color.b;
  const firstContrast = Math.abs(firstLum - bgLum);
  if (firstContrast >= 0.4 && firstContrast >= maxContrast - 0.15) {
    targetColor = stops[0].color;
    maxContrast = firstContrast;
  }

  const hasMutedStop = stops.some(st => {
    const a = (st.color.a !== undefined) ? st.color.a : 1;
    return a < 0.75;
  });
  const hasContrastDifference = stops.some(st => {
    const lum = 0.2126 * st.color.r + 0.7152 * st.color.g + 0.0722 * st.color.b;
    const contrast = Math.abs(lum - bgLum);
    return (maxContrast - contrast) > 0.35;
  });

  if (hasMutedStop || hasContrastDifference) {
    for (const st of stops) {
      st.color.a = 1;
      const lum = 0.2126 * st.color.r + 0.7152 * st.color.g + 0.0722 * st.color.b;
      const contrast = Math.abs(lum - bgLum);
      if ((maxContrast - contrast) > 0.35 || ((st.color.a !== undefined) && st.color.a < 0.75)) {
        st.color.r = targetColor.r;
        st.color.g = targetColor.g;
        st.color.b = targetColor.b;
      }
    }
  }

  const first = stops[0].color;
  const allSame = stops.every(st => 
    Math.abs(st.color.r - first.r) < 0.02 &&
    Math.abs(st.color.g - first.g) < 0.02 &&
    Math.abs(st.color.b - first.b) < 0.02 &&
    Math.abs(st.color.a - first.a) < 0.02
  );
  if (allSame) {
    return { type: 'SOLID', color: { r: first.r, g: first.g, b: first.b }, opacity: clamp01(first.a) };
  }

  return grad;
}

async function renderTextNode(sNode, parentFrame, parentX, parentY, inheritedStyles, inheritedTextClip = null, activeRotation = null, parentNode = null, isVerticalInverted = false, parentUnrotOrigin = { x: 0, y: 0 }, effectiveBgColor = null) {
  const s = sNode.styles || inheritedStyles || parentFrame.styles || {};
  let text = (sNode.text || '');
  const ws = s.whiteSpace || 'normal';
  if (ws === 'normal' || ws === 'nowrap') {
    text = text.replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/ +/g, ' ');
  } else if (ws === 'pre-line') {
    text = text.replace(/[ \t\f\v]+/g, ' ').replace(/[\u2028\u2029]/g, '\n');
  }
  if (!text || !text.trim()) return;

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

  const explicitDec = (s.textDecorationLine || s.textDecoration || '').toLowerCase();
  const inheritedDec = (s._activeTextDecoration || inheritedStyles?._activeTextDecoration || inheritedStyles?.textDecorationLine || inheritedStyles?.textDecoration || '').toLowerCase();
  let dec = explicitDec;
  if (!dec || dec === 'none') {
    dec = inheritedDec;
  }
  
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

  const isMultiLine = (sNode.lineCount && sNode.lineCount > 1) || (sNode.text && sNode.text.includes('\n'));
  let figmaLineHeight = null;
  if (s.lineHeight && s.lineHeight !== 'normal') {
    const lh = parseFloat(s.lineHeight);
    if (!isNaN(lh) && lh > 0) {
      textNode.lineHeight = { value: lh, unit: 'PIXELS' };
      figmaLineHeight = lh;
    }
  } else if (isMultiLine && sNode.lineCount > 1 && sNode.rect?.height) {
    const calcLh = sNode.rect.height / sNode.lineCount;
    if (calcLh > 0 && Math.abs(calcLh - (parseFloat(s.fontSize) || 16)) < 50) {
      textNode.lineHeight = { value: Math.round(calcLh * 10) / 10, unit: 'PIXELS' };
      figmaLineHeight = calcLh;
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

  const resolvedBgColor = effectiveBgColor || 
    (parentFrame && parentFrame.styles?._effectiveBgColor ? parseColor(parentFrame.styles._effectiveBgColor) : null) ||
    (s._effectiveBgColor ? parseColor(s._effectiveBgColor) : null) ||
    { r: 1, g: 1, b: 1 };

  if (isTextClip) {
    const textFills = [];
    const bg = parseColor(clipStyle.backgroundColor);
    if (bg && bg.a > 0.005) textFills.push({ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: clamp01(bg.a) });
    if (clipStyle.backgroundImage && clipStyle.backgroundImage.includes('gradient')) {
      const bgs = splitByTopLevelCommas(clipStyle.backgroundImage);
      for (let i = bgs.length - 1; i >= 0; i--) {
        const bg = bgs[i];
        if (bg.includes('linear-gradient')) {
          const grad = parseLinearGradient(bg, clipStyle);
          if (grad) textFills.push(brightenGradientForText(grad, resolvedBgColor));
        } else if (bg.includes('radial-gradient')) {
          const grad = parseRadialGradient(bg);
          if (grad) textFills.push(brightenGradientForText(grad, resolvedBgColor));
        } else if (bg.includes('conic-gradient')) {
          const grad = parseAngularGradient(bg);
          if (grad) textFills.push(brightenGradientForText(grad, resolvedBgColor));
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
      let finalA = clamp01(fillColor.a);
      const isWordOrChar = (sNode.attributes?.class && /word|char|split|line|reveal|anim|invert/i.test(sNode.attributes.class)) ||
                           (sNode.id && /text-anim|split|reveal/i.test(sNode.id)) ||
                           (parentNode && parentNode.attributes?.class && /split|line|anim|reveal|invert/i.test(parentNode.attributes.class));
      if ((isWordOrChar || finalA < 0.95) && finalA > 0.01) {
        finalA = 1;
      }

      let renderColor = { r: fillColor.r, g: fillColor.g, b: fillColor.b };
      const lum = 0.2126 * renderColor.r + 0.7152 * renderColor.g + 0.0722 * renderColor.b;
      const minC = Math.min(renderColor.r, renderColor.g, renderColor.b);
      const maxC = Math.max(renderColor.r, renderColor.g, renderColor.b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const bgLum = 0.2126 * resolvedBgColor.r + 0.7152 * resolvedBgColor.g + 0.0722 * resolvedBgColor.b;
      const contrast = Math.abs(lum - bgLum);

      // If text color is stuck at a low-contrast muted grey (< 0.25 contrast against bg)
      // on an animated/revealed element, boost to the revealed high-contrast color
      if (isWordOrChar && sat < 0.15 && contrast < 0.25) {
        if (inheritedStyles?.color) {
          const pCol = parseColor(inheritedStyles.color);
          if (pCol && Math.abs(0.2126 * pCol.r + 0.7152 * pCol.g + 0.0722 * pCol.b - bgLum) > contrast + 0.2) {
            renderColor = { r: pCol.r, g: pCol.g, b: pCol.b };
          }
        }
        const curContrast = Math.abs((0.2126 * renderColor.r + 0.7152 * renderColor.g + 0.0722 * renderColor.b) - bgLum);
        if (curContrast < 0.25) {
          renderColor = bgLum > 0.5 ? { r: 0.07, g: 0.06, b: 0.07 } : { r: 1, g: 1, b: 1 };
        }
      }

      textNode.fills = [{ type: 'SOLID', color: renderColor, opacity: finalA }];
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

  // CSS opacity belongs to elements (containers). Each element already creates a Figma frame
  // with applyOpacity(frame, s) applied. If we also apply opacity to the textNode inside that frame,
  // Figma will square the opacity (e.g. 0.3 on frame * 0.3 on textNode = 0.09 / #ebebeb instead of 0.3 / #bbbbbb).
  // Only apply opacity directly to textNode if parentFrame is an unstyled top-level root frame.
  if (parentFrame && parentFrame.opacity >= 0.999 && (!parentFrame.parent || parentFrame.parent.type === 'PAGE')) {
    applyOpacity(textNode, s, sNode);
  }

  parentFrame.appendChild(textNode);

  if (!sNode._localRect && activeRotation) {
    const unrotRect = getUnrotatedRectInRotationRoot(sNode.rect, activeRotation, true);
    if (unrotRect) {
      sNode._localRect = {
        x: unrotRect.x - (parentUnrotOrigin?.x || 0),
        y: unrotRect.y - (parentUnrotOrigin?.y || 0),
        width: unrotRect.width,
        height: unrotRect.height
      };
    }
  }

  let posX = sNode._localRect ? sNode._localRect.x : ((sNode.rect?.x || 0) - parentX);
  let posY = sNode._localRect ? sNode._localRect.y : ((sNode.rect?.y || 0) - parentY);
  if (activeRotation && Math.abs(activeRotation.angleDeg) < 45) {
    if (posX < 0 && posX > -40) posX = 0;
    if (posY < 0 && posY > -40) posY = 0;
  }

  let w = sNode._localRect ? sNode._localRect.width : (sNode.rect?.width || sNode.rect?.offsetWidth || 0);
  const h = sNode._localRect ? sNode._localRect.height : (sNode.rect?.height || sNode.rect?.offsetHeight || 0);

  if (isMultiLine && parentFrame && parentNode && (!parentNode.childNodes || parentNode.childNodes.length <= 1) && !parentNode.pseudoElementNodes?.before && !parentNode.pseudoElementNodes?.after && !activeRotation) {
    let pr = 0;
    if (parentNode.styles && parentNode.styles.paddingRight) {
      pr = parseFloat(parentNode.styles.paddingRight) || 0;
    }
    let effectiveParentFrame = parentFrame;
    let effectivePosX = posX;
    if ((!parentNode.styles?.display || parentNode.styles.display === 'inline' || parentNode.styles.display === 'contents') && parentFrame.parent && parentFrame.parent.type !== 'PAGE' && parentFrame.parent.type !== 'DOCUMENT') {
      effectiveParentFrame = parentFrame.parent;
      effectivePosX = (parentFrame.x || 0) + posX;
    }
    const availW = effectiveParentFrame.width - Math.max(0, effectivePosX) - Math.max(0, pr);
    if (availW > w) {
      w = availW;
      if (parentFrame !== effectiveParentFrame && parentFrame.width < w) {
        try { parentFrame.resize(Math.max(parentFrame.width, Math.ceil(w)), parentFrame.height); } catch {}
      }
    }
  }

  // Remove Figma's top half-leading compensation because we use exact centering
  // if (!isMultiLine && h > 0) {
  //   const effectiveLh = figmaLineHeight || (fontSize * 1.2);
  //   posY -= (effectiveLh - h) / 2;
  // }

  textNode.x = posX;
  textNode.y = posY;
  const textStr = finalText.trim();

  const alignVal = s.textAlign || inheritedStyles?.textAlign || (parentNode && parentNode.styles?.textAlign) || '';
  if (alignVal === 'center') {
    try { textNode.textAlignHorizontal = 'CENTER'; } catch {}
  } else if (alignVal === 'right' || alignVal === 'end') {
    try { textNode.textAlignHorizontal = 'RIGHT'; } catch {}
  } else if (alignVal === 'justify') {
    try { textNode.textAlignHorizontal = 'JUSTIFIED'; } catch {}
  } else {
    try { textNode.textAlignHorizontal = 'LEFT'; } catch {}
  }

  if (sNode.id && (sNode.id.includes('input-text') || sNode.id.includes('select-text')) && w > 0 && h > 0) {
    try { textNode.textAutoResize = 'TRUNCATE'; } catch { textNode.textAutoResize = 'NONE'; }
    textNode.resize(Math.ceil(w), Math.ceil(h));
    textNode.textAlignVertical = 'CENTER';
  } else if (isMultiLine && w > 0) {
    textNode.textAutoResize = 'HEIGHT';

    const hasSiblings = parentNode && (
      (parentNode.childNodes && parentNode.childNodes.length > 1) ||
      parentNode.pseudoElementNodes?.before ||
      parentNode.pseudoElementNodes?.after
    );

    // For center-aligned multiline text: span parentFrame's content width and anchor at paddingLeft (x=pl).
    // A block-level DOM element spans its container fully, and text-align:center centers
    // relative to that full width. In Figma, this ensures every line centers perfectly.
    if (alignVal === 'center' && parentFrame && !hasSiblings) {
      let pl = parentNode?.styles?.paddingLeft ? (parseFloat(parentNode.styles.paddingLeft) || 0) : 0;
      let pr = parentNode?.styles?.paddingRight ? (parseFloat(parentNode.styles.paddingRight) || 0) : 0;
      let fullW = Math.max(1, Math.round(parentFrame.width - pl - pr));
      try {
        textNode.resize(fullW, Math.max(1, Math.ceil(h)));
        textNode.x = pl;
        textNode.y = posY;
      } catch {
        textNode.x = posX;
        textNode.y = posY;
      }
    } else if ((alignVal === 'right' || alignVal === 'end') && parentFrame && !hasSiblings) {
      let pl = parentNode?.styles?.paddingLeft ? (parseFloat(parentNode.styles.paddingLeft) || 0) : 0;
      let pr = parentNode?.styles?.paddingRight ? (parseFloat(parentNode.styles.paddingRight) || 0) : 0;
      let fullW = Math.max(1, Math.round(parentFrame.width - pl - pr));
      try {
        textNode.resize(fullW, Math.max(1, Math.ceil(h)));
        textNode.x = pl;
        textNode.y = posY;
      } catch {
        textNode.x = posX;
        textNode.y = posY;
      }
    } else {
      let layoutW = Math.max(1, Math.ceil(w));
      if (parentFrame && !hasSiblings) {
        let pl = parentNode?.styles?.paddingLeft ? (parseFloat(parentNode.styles.paddingLeft) || 0) : 0;
        let pr = parentNode?.styles?.paddingRight ? (parseFloat(parentNode.styles.paddingRight) || 0) : 0;
        const availParentW = Math.max(1, Math.round(parentFrame.width - pl - pr));
        layoutW = Math.max(layoutW, availParentW);
      }
      layoutW += 6;
      textNode.resize(layoutW, Math.max(1, Math.ceil(h)));
      textNode.x = posX;
      textNode.y = posY;
    }

    // Multiline line-count preservation guard:
    // If Figma's font shaper wrapped words onto more lines than the browser DOM had,
    // give layoutW incremental breathing room (up to +24px) until line count matches the browser DOM
    const targetLines = sNode.lineCount || 0;
    if (targetLines > 0 && !hasSiblings && sNode.rect?.height) {
      let attempts = 0;
      while (attempts < 6 && textNode.height > (sNode.rect.height * 1.15)) {
        const curW = textNode.width;
        textNode.resize(curW + 4, Math.max(1, Math.ceil(h)));
        attempts++;
      }
    }

    // Ensure parentFrame encompasses the text height if it expanded
    if (parentFrame && !hasSiblings) {
      const requiredH = Math.round(textNode.y + textNode.height);
      if (requiredH > parentFrame.height) {
        try {
          parentFrame.resize(Math.max(parentFrame.width, textNode.width), requiredH);
        } catch {}
      }
    }
  } else {
    // Single line text: Let the font be its natural width/height so it never wraps
    textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
    const isVert = (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr') || isVerticalInverted;
    if (w > 0 && h > 0 && !isVert) {
      const figmaW = textNode.width;
      const figmaH = textNode.height;

      // Determine horizontal centering intent:
      // 1. Explicit text-align: center
      // 2. CSS Flexbox / Grid centering (justify-content: center or align-items: center)
      // 3. Symmetrically padded button / pill / tag container in DOM
      const parentDomW = parentNode?.rect?.width || parentFrame?.width || 0;
      const domLeftPad = (sNode.rect?.x || 0) - (parentNode?.rect?.x || (parentFrame.x || 0));
      const domRightPad = parentDomW - domLeftPad - w;
      const isDomSymmetricCenter = parentDomW > 0 && Math.abs(domLeftPad - domRightPad) <= 4 && domLeftPad > 4;
      const isFlexCenter = (parentNode?.styles?.justifyContent === 'center' || parentNode?.styles?.alignItems === 'center') ||
                           (parentFrame?.styles?.justifyContent === 'center' || parentFrame?.styles?.alignItems === 'center');

      const hasSiblings = parentNode && (
        (parentNode.childNodes && parentNode.childNodes.length > 1) ||
        parentNode.pseudoElementNodes?.before ||
        parentNode.pseudoElementNodes?.after
      );

      if ((alignVal === 'center' || isFlexCenter || isDomSymmetricCenter) && !hasSiblings) {
        try { textNode.textAlignHorizontal = 'CENTER'; } catch {}
        if (parentFrame && parentFrame.width > figmaW) {
          textNode.x = Math.round((parentFrame.width - figmaW) / 2);
        } else {
          textNode.x = posX + (w / 2) - (figmaW / 2);
        }
      } else if ((alignVal === 'right' || alignVal === 'end') && !hasSiblings) {
        if (parentFrame && parentFrame.width > figmaW) {
          textNode.x = parentFrame.width - figmaW;
        } else {
          textNode.x = posX + w - figmaW;
        }
      } else {
        textNode.x = posX;
      }

      // Vertical Alignment:
      const parentDomH = parentNode?.rect?.height || parentFrame?.height || 0;
      const domTopPad = (sNode.rect?.y || 0) - (parentNode?.rect?.y || (parentFrame.y || 0));
      const domBottomPad = parentDomH - domTopPad - h;
      const isDomSymmetricVert = parentDomH > 0 && Math.abs(domTopPad - domBottomPad) <= 3;
      const pFlexDir = parentNode?.styles?.flexDirection || parentFrame?.styles?.flexDirection || 'row';
      const isFlexCol = pFlexDir.includes('column');
      const isFlexVertCenter = isFlexCol 
        ? ((parentNode?.styles?.justifyContent === 'center') || (parentFrame?.styles?.justifyContent === 'center'))
        : ((parentNode?.styles?.alignItems === 'center') || (parentFrame?.styles?.alignItems === 'center'));

      if (parentFrame && parentDomH > 0 && (isFlexVertCenter || isDomSymmetricVert) && !hasSiblings) {
        textNode.y = Math.round((parentFrame.height - figmaH) / 2);
      } else {
        const domCenterY = posY + (h / 2);
        textNode.y = domCenterY - (figmaH / 2);
      }
    }
  }

  // Apply rotation directly to textNode if parentFrame is not already rotated
  const isVerticalText = (s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr') || isVerticalInverted;

  let transformAngle = 0;
  let textHas180 = false;
  if (s.transform && s.transform.includes('matrix')) {
    const parts = s.transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (parts) {
      const vals = parts[1].split(',').map(v => parseFloat(v.trim()));
      let a = vals[0], b = vals[1];
      transformAngle = Math.atan2(b, a) * (180 / Math.PI);
      if (Math.abs(Math.abs(transformAngle) - 180) < 1) textHas180 = true;
    }
  } else if (s.rotate && s.rotate !== 'none') {
    const r = s.rotate.trim().toLowerCase();
    if (r.includes('deg')) transformAngle = parseFloat(r);
    else if (r.includes('rad')) transformAngle = (parseFloat(r) * 180) / Math.PI;
    else if (r.includes('turn')) transformAngle = parseFloat(r) * 360;
    if (Math.abs(Math.abs(transformAngle) - 180) < 1) textHas180 = true;
  }

  const is180 = isVerticalInverted || textHas180;

  if (isVerticalText && Math.abs(parentFrame.rotation || 0) < 0.1 && !activeRotation) {
    // In CSS, writing-mode: vertical-rl flows top-to-bottom.
    // Combined with rotate(180deg), it flows bottom-to-top (reading upwards).
    // In Figma API (Cartesian angle):
    // - rotDeg = 90 rotates counter-clockwise: characters flow upwards from bottom to top, with letterheads pointing to the left.
    // - rotDeg = -90 rotates clockwise: characters flow downwards from top to bottom, with letterheads pointing to the right.
    const rotDeg = is180 ? 90 : -90;
    textNode.rotation = rotDeg;
    const extraX = Math.max(0, (w - textNode.height) / 2);
    const extraY = Math.max(0, (h - textNode.width) / 2);
    if (rotDeg === 90) {
      textNode.x = posX + extraX;
      textNode.y = posY + textNode.width + extraY;
    } else {
      textNode.x = posX + textNode.height + extraX;
      textNode.y = posY + extraY;
    }
  } else if (Math.abs(transformAngle) > 0.1 && Math.abs(parentFrame.rotation || 0) < 0.1 && !activeRotation) {
    const rotDeg = -transformAngle;
    textNode.rotation = rotDeg;
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

  return textNode;
}

// Post-render "Cut & Paste" (Ctrl+X / Cmd+X then Ctrl+V / Cmd+V to root):
// Once everything is rendered, lift all navbars out of nested containers and paste them onto the top layer of rootFrame
function cutAndPasteNavbarsToTop(rootFrame) {
  if (!rootFrame) return;

  const navFrames = [];

  function findNavFrames(node) {
    if (!node) return;
    if (node !== rootFrame) {
      const role = node.getPluginData ? (node.getPluginData('h2fRole') || '') : '';
      const name = (node.name || '').toLowerCase();
      const isExcluded = /\b(?:icon|icon-box|feature|box|item|card|modal|table|post|accordion|comment|widget|drawer)-header\b/i.test(name);
      const isNav = !isExcluded && (
        role === 'navbar' ||
        name === 'header' ||
        name.startsWith('header.') ||
        /\b(?:navbar|site-header|main-header|top-header|fixed-header|sticky-header|top-nav|global-nav|app-bar|preview__header|elementor-location-header|elementor-type-header|elementor-header|elementor-nav-menu)\b/i.test(name)
      );

      // Guard: do not treat large page wrappers or whole bodies as navbars (navbars are <= 320px tall)
      if (isNav && node.height <= 320) {
        navFrames.push(node);
        return; // Don't look for nested navbars inside an already detected navbar
      }
    }

    if (node.children) {
      for (const child of node.children) {
        findNavFrames(child);
      }
    }
  }

  findNavFrames(rootFrame);

  if (navFrames.length === 0) return;

  // Cut from nested container and Paste to top of rootFrame
  for (const navNode of navFrames) {
    try {
      // 1. Inside navbar: bring logo and buttons to the top layer
      if (navNode.children && navNode.children.length > 1) {
        const topElements = [];
        for (const child of navNode.children) {
          const role = child.getPluginData ? (child.getPluginData('h2fRole') || '') : '';
          const cName = (child.name || '').toLowerCase();
          const isBtnOrLogo = role === 'button' || role === 'logo' ||
            /\b(?:btn|button|cta|navbar-btn|header-btn|menu-btn|hamburger|nav-btn|logo|brand|navbar-brand|site-logo|header-logo)\b/.test(cName);
          if (isBtnOrLogo) topElements.push(child);
        }
        for (const el of topElements) {
          navNode.appendChild(el);
        }
      }

      // 2. Cut & Paste to top of rootFrame
      const navAbsX = navNode.absoluteTransform[0][2];
      const navAbsY = navNode.absoluteTransform[1][2];
      const rootAbsX = rootFrame.absoluteTransform[0][2];
      const rootAbsY = rootFrame.absoluteTransform[1][2];

      const relX = Math.round(navAbsX - rootAbsX);
      const relY = Math.round(navAbsY - rootAbsY);

      // Re-parent to rootFrame at the very end of children (top layer)
      rootFrame.appendChild(navNode);
      navNode.x = relX;
      navNode.y = relY;
    } catch (e) {
      console.warn('[HTML-2-Fig] Cut & paste navbar error:', e);
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

  // Use the exact rendered content width (data.root.rect.width or clientWidth).
  // Never allow documentRect.width to exceed viewport width, which creates a huge white void on the right.
  const contentW = data.root?.rect?.width && data.root.rect.width > 200 ? Math.round(data.root.rect.width) : null;
  const viewportW = data.viewportRect?.width ? Math.round(data.viewportRect.width) : 1440;
  const docW = data.documentRect?.width ? Math.round(data.documentRect.width) : viewportW;
  
  let dw = contentW || Math.min(docW, viewportW);
  const dh = Math.round(data.documentRect?.height || data.viewportRect?.height || 900);
  rootFrame.resize(dw, dh);
  rootFrame.x = figma.viewport.center.x - dw / 2;
  rootFrame.y = figma.viewport.center.y - dh / 2;
  
  if (data.root?.styles) {
    await applyFills(rootFrame, data.root.styles, data.assets, dw, dh);
    // In web browsers, the viewport always has a solid opaque white base (#FFFFFF).
    // If the root body fill has an alpha/opacity < 1.0 (e.g. Tailwind bg-muted/30),
    // we pre-blend it against solid white so Figma gets an identical 100% solid, opaque
    // background color, preventing the dark Figma canvas from bleeding through!
    const existingFills = Array.isArray(rootFrame.fills) ? [...rootFrame.fills] : [];
    const solidFillIdx = existingFills.findIndex(f => f.type === 'SOLID');
    if (solidFillIdx !== -1) {
      const sf = existingFills[solidFillIdx];
      const op = sf.opacity !== undefined ? sf.opacity : 1;
      if (op < 0.99) {
        // Alpha blend over white (1, 1, 1): c_final = c * alpha + 1.0 * (1 - alpha)
        const blendedR = sf.color.r * op + 1.0 * (1 - op);
        const blendedG = sf.color.g * op + 1.0 * (1 - op);
        const blendedB = sf.color.b * op + 1.0 * (1 - op);
        existingFills[solidFillIdx] = {
          type: 'SOLID',
          color: { r: blendedR, g: blendedG, b: blendedB },
          opacity: 1
        };
        rootFrame.fills = existingFills;
      }
    } else {
      rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, ...existingFills];
    }
  } else {
    rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  }
  rootFrame.clipsContent = true;

  figma.currentPage.appendChild(rootFrame);

  if (data.root?.childNodes) {
    const rootChildren = Array.from(data.root.childNodes);
    rootChildren.forEach((child, idx) => {
      if (child._domIndex === undefined) {
        child._domIndex = idx;
      }
    });
    rootChildren.sort((a, b) => {
      const zA = getEffectiveZIndex(a, true);
      const zB = getEffectiveZIndex(b, true);
      const diff = zA - zB;
      return diff !== 0 ? diff : a._domIndex - b._domIndex;
    });
    for (const child of rootChildren) {
      await renderNode(child, rootFrame, 0, 0, data.assets, data.root.styles);
    }
  } else if (data.root) {
    await renderNode(data.root, rootFrame, 0, 0, data.assets, data.root.styles);
  }

  // Ensure root frame width exactly matches the rendered content width (or trimmed viewport), never leaving trailing whitespace
  const targetW = contentW || (data.viewportRect?.width ? Math.min(dw, Math.round(data.viewportRect.width) - 16) : (dw > 16 ? dw - 16 : dw));
  if (targetW > 100 && rootFrame.width !== targetW) {
    rootFrame.resize(targetW, rootFrame.height);
  }

  // Cut & Paste all Navbars to the absolute top layer of rootFrame
  cutAndPasteNavbarsToTop(rootFrame);

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


