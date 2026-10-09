let currentPluginView = 'html2fig';
figma.showUI(__html__, { width: 380, height: 726, themeColors: true });

const MAX_FREE_EXPORTS = 8;

async function checkLicenseAndUsage() {
  const [lic, count] = await Promise.all([
    figma.clientStorage.getAsync('gumroad_license').catch(() => null),
    figma.clientStorage.getAsync('free_exports_count').catch(() => 0)
  ]);
  const isPro = Boolean(lic && lic.key);
  const freeUsed = typeof count === 'number' ? count : 0;
  return {
    isPro,
    key: lic?.key || '',
    email: lic?.email || '',
    freeUsed,
    maxFree: MAX_FREE_EXPORTS
  };
}

// Check saved license state and usage count on launch
checkLicenseAndUsage().then((info) => {
  figma.ui.postMessage({ type: 'license_info', ...info });
}).catch(() => {
  figma.ui.postMessage({ type: 'license_info', isPro: false, freeUsed: 0, maxFree: MAX_FREE_EXPORTS });
});


const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  red: { r: 1, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 0.502, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 1, a: 1 }
};

const sharedTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
const sharedTextEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

// Safe conversion of byte arrays to strings — avoids V8's 65534 argument limit
function bytesToString(bytes) {
  if (sharedTextDecoder) {
    return sharedTextDecoder.decode(bytes);
  }
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.slice(i, i + 8192);
    result += String.fromCharCode.apply(null, chunk);
  }
  return result;
}

const COLOR_CACHE = new Map();
const MAX_COLOR_CACHE = 2500;

function parseColor(css) {
  if (!css || css === 'none' || css === 'initial' || css === 'inherit' || css === 'transparent') return null;
  const cached = COLOR_CACHE.get(css);
  if (cached !== undefined) return cached ? { ...cached } : null;

  let result = _parseColorInternal(css);
  if (result && typeof figma !== 'undefined' && figma.root && figma.root.documentColorProfile === 'DISPLAY_P3') {
    const p3 = srgbToDisplayP3(result.r, result.g, result.b);
    result.r = p3.r;
    result.g = p3.g;
    result.b = p3.b;
  }

  if (COLOR_CACHE.size >= MAX_COLOR_CACHE) {
    COLOR_CACHE.clear();
  }
  COLOR_CACHE.set(css, result ? { ...result } : null);
  return result ? { ...result } : null;
}

function _parseColorInternal(css) {
  css = css.trim().toLowerCase();
  if (NAMED_COLORS[css]) return { ...NAMED_COLORS[css] };

  let m;
  // rgb/rgba (legacy and space-separated: rgb(255 255 255 / 0.8) or rgba(255, 255, 255, 0.8) or rgb(255 0 0 / 50%))
  m = css.match(/^rgba?\(\s*([\d.]+)(%?)[,%\s]+([\d.]+)(%?)[,%\s]+([\d.]+)(%?)(?:[,/\s]+([\d.]+)(%?)\s*)?\)$/);
  if (m) {
    const r = m[2] ? clamp01(+m[1] / 100) : clamp01(+m[1] / 255);
    const g = m[4] ? clamp01(+m[3] / 100) : clamp01(+m[3] / 255);
    const b = m[6] ? clamp01(+m[5] / 100) : clamp01(+m[5] / 255);
    let a = 1;
    if (m[7] !== undefined) {
      a = (m[8] === '%' || (typeof m[7] === 'string' && m[7].endsWith('%'))) ? parseFloat(m[7]) / 100 : parseFloat(m[7]);
    }
    return { r, g, b, a: clamp01(a) };
  }

  // hsl/hsla
  m = css.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,%\s]+([\d.]+)%?[,%\s]+([\d.]+)%?(?:[,/\s]+([\d.]+)(%?)\s*)?\)$/);
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    let a = 1;
    if (m[4] !== undefined) {
      a = (m[5] === '%' || (typeof m[4] === 'string' && m[4].endsWith('%'))) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    }
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
    return { r, g, b, a: clamp01(a) };
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

// sRGB -> display-p3
function srgbToDisplayP3(r, g, b) {
  const toLin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const rL = toLin(r), gL = toLin(g), bL = toLin(b);
  const rLin =  0.8224621 * rL + 0.1775380 * gL + 0.0000000 * bL;
  const gLin =  0.0331942 * rL + 0.9668058 * gL + 0.0000000 * bL;
  const bLin =  0.0170827 * rL + 0.0723974 * gL + 0.9105199 * bL;
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
      if (sharedTextEncoder) {
        return sharedTextEncoder.encode(decoded);
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
 *  3.  FONT LOADER WITH FUZZY FOUNDRY MATCHING & OPTICAL WEIGHT RESOLUTION
 * ====================================================================== */
const FONT_WEIGHT_MAP = {
  '100': ['Thin', 'Hairline'],
  '200': ['Extra Light', 'ExtraLight', 'Ultra Light', 'UltraLight', 'Extraleicht'],
  '300': ['Light', 'Leicht'],
  '400': ['Regular', 'Normal', 'Book', 'Roman', 'Buch', 'Plain', 'Standard'],
  '500': ['Medium', 'Kraftig', 'Kräftig', 'Médium', 'Mezzo'],
  '600': ['Semi Bold', 'SemiBold', 'Semibold', 'Demi Bold', 'DemiBold', 'Demi', 'Halbfett'],
  '700': ['Bold', 'Fett', 'Dreiviertelfett'],
  '800': ['Extra Bold', 'ExtraBold', 'Ultra Bold', 'UltraBold', 'Extrafett', 'Heavy'],
  '900': ['Black', 'Heavy', 'Extra Black', 'Ultra Black', 'Super', 'Poster', 'Fat'],
  'normal': ['Regular', 'Normal', 'Book', 'Roman', 'Buch'],
  'bold': ['Bold', 'Fett'],
  'bolder': ['Extra Bold', 'ExtraBold', 'Ultra Bold', 'UltraBold', 'Black', 'Heavy'],
  'lighter': ['Light', 'Extra Light', 'Thin']
};

const WEIGHT_FALLBACK_SEQUENCE = {
  '100': ['100', '200', '300', '400', '500'],
  '200': ['200', '100', '300', '400', '500'],
  '300': ['300', '400', '200', '500', '100'],
  '400': ['400', '500', '300', '600', '700'],
  '500': ['500', '400', '600', '300', '700'],
  '600': ['600', '700', '800', '500', '400'],
  '700': ['700', '800', '600', '900', '500', '400'],
  '800': ['800', '900', '700', '600', '500', '400'],
  '900': ['900', '800', '700', '600', '500', '400']
};

function parseWeightFromStyleOrName(str) {
  if (!str) return null;
  const s = String(str).toLowerCase();
  
  if (/extra\s*light|ultra\s*light|extraleicht/i.test(s)) return 200;
  if (/extra\s*bold|ultra\s*bold|dreiviertelfett/i.test(s)) return 800;
  if (/semi\s*bold|demi\s*bold|demi\b|halbfett/i.test(s)) return 600;
  if (/extra\s*black|ultra\s*black|extrafett/i.test(s)) return 950;
  
  if (/\b(thin|hairline)\b/i.test(s)) return 100;
  if (/\b(light|leicht)\b/i.test(s)) return 300;
  if (/\b(regular|normal|book|roman|buch|plain|standard)\b/i.test(s)) return 400;
  if (/\b(medium|kraftig|kräftig|médium|mezzo)\b/i.test(s)) return 500;
  if (/\b(bold|fett)\b/i.test(s)) return 700;
  if (/\b(black|heavy|poster|super|fat)\b/i.test(s)) return 900;

  const numMatch = s.match(/\b([1-9]00)\b/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return null;
}

function isItalicStyle(str) {
  if (!str) return false;
  return /italic|oblique|slanted|kursiv/i.test(String(str));
}

function getBaseFamilyName(fam) {
  if (!fam) return fam;
  let base = fam
    .replace(/[-_]?(Thin|Hairline|Extra\s?Light|Ultra\s?Light|Extraleicht|Light|Leicht|Medium|Semi\s?Bold|Demi\s?Bold|Demi|Extra\s?Bold|Ultra\s?Bold|Bold|Black|Heavy|Super|Poster|Condensed|Compressed|Narrow|ExtraCond|Buch|Roman|Regular|Normal|Halbfett|Dreiviertelfett|Fett|Extrafett|Italic|Oblique|Slanted)[-_]?/gi, ' ')
    .trim();
  base = base.replace(/[-_\s]+$/, '').replace(/^[-_\s]+/, '').trim();
  return base || fam;
}

function normalizeFamilyKey(fam) {
  if (!fam) return '';
  return fam.toLowerCase().replace(/['"]/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function compactFamilyKey(fam) {
  if (!fam) return '';
  return fam.toLowerCase().replace(/['"]/g, '').replace(/[\s-_]/g, '').trim();
}

let AVAILABLE_FONTS_MAP = null;
let AVAILABLE_FONTS_PROMISE = null;

async function getAvailableFontsMap() {
  if (AVAILABLE_FONTS_MAP) return AVAILABLE_FONTS_MAP;
  if (AVAILABLE_FONTS_PROMISE) return AVAILABLE_FONTS_PROMISE;
  
  AVAILABLE_FONTS_PROMISE = (async () => {
    const map = new Map();
    try {
      if (typeof figma !== 'undefined' && typeof figma.listAvailableFontsAsync === 'function') {
        const fonts = await figma.listAvailableFontsAsync();
        for (let i = 0; i < fonts.length; i++) {
          const font = fonts[i].fontName || fonts[i];
          if (!font || !font.family) continue;
          
          const normKey = normalizeFamilyKey(font.family);
          const compKey = compactFamilyKey(font.family);
          
          let listNorm = map.get(normKey);
          if (!listNorm) {
            listNorm = [];
            map.set(normKey, listNorm);
          }
          listNorm.push(font);
          
          if (compKey !== normKey) {
            let listComp = map.get(compKey);
            if (!listComp) {
              listComp = [];
              map.set(compKey, listComp);
            }
            if (!listComp.includes(font)) listComp.push(font);
          }
        }
      }
    } catch (e) {
      console.warn('figma.listAvailableFontsAsync error:', e);
    }
    AVAILABLE_FONTS_MAP = map;
    return map;
  })();
  
  return AVAILABLE_FONTS_PROMISE;
}

function findBestStyle(availableFontsForFamily, targetWeight, targetItalic) {
  if (!availableFontsForFamily || availableFontsForFamily.length === 0) return null;
  
  let bestFont = null;
  let bestScore = Infinity;
  
  for (const font of availableFontsForFamily) {
    const styleName = font.style || '';
    const styleWeight = parseWeightFromStyleOrName(styleName) || 400;
    const styleItalic = isItalicStyle(styleName);
    
    let weightDiff = Math.abs(styleWeight - targetWeight);
    let italicPenalty = (styleItalic === targetItalic) ? 0 : 5000;
    let exactBonus = (styleWeight === targetWeight) ? -20 : 0;
    
    let directionPenalty = 0;
    if (targetWeight >= 600 && styleWeight < targetWeight) {
      directionPenalty += 50;
    } else if (targetWeight <= 300 && styleWeight > targetWeight) {
      directionPenalty += 50;
    }

    const totalScore = weightDiff + italicPenalty + exactBonus + directionPenalty;
    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestFont = font;
    }
  }
  
  return bestFont;
}

function resolveTargetWeight(cssWeightInput, familyName, visualDensity) {
  // 1. If family name explicitly encodes a weight cut (e.g. PorscheNext-SemiBold, GT-Super-Book)
  //    web fonts almost always have a separate @font-face per cut — trust the name.
  const nameWeight = parseWeightFromStyleOrName(familyName);
  if (nameWeight !== null) {
    return nameWeight;
  }

  let cssW = 400;
  if (typeof cssWeightInput === 'number') {
    cssW = cssWeightInput;
  } else if (typeof cssWeightInput === 'string') {
    const s = cssWeightInput.toLowerCase().trim();
    if (s === 'normal') cssW = 400;
    else if (s === 'bold') cssW = 700;
    else if (s === 'bolder') cssW = 800;
    else if (s === 'lighter') cssW = 300;
    else {
      const parsed = parseInt(s, 10);
      if (!isNaN(parsed) && parsed > 0) cssW = parsed;
      else {
        const kw = parseWeightFromStyleOrName(s);
        if (kw) cssW = kw;
      }
    }
  }

  // 2. Visual density matching — calibrated against empirical Inter measurements:
  //    Inter 300 = 0.18, 400 = 0.23, 500 = 0.28, 600 = 0.32, 700 = 0.36
  //    This finds the Inter weight that LOOKS closest to the actual rendered font.
  //    Works for Söhne/Graphik/Circular where CSS 300 = optically ~Medium (0.25).
  if (visualDensity !== undefined && visualDensity !== null && visualDensity > 0) {
    // Inter calibration table (empirical, measured from rendered glyphs)
    const CALIBRATION = [
      { weight: 100, density: 0.07 },
      { weight: 200, density: 0.11 },
      { weight: 300, density: 0.18 },
      { weight: 400, density: 0.23 },
      { weight: 500, density: 0.28 },
      { weight: 600, density: 0.32 },
      { weight: 700, density: 0.36 },
      { weight: 800, density: 0.40 },
      { weight: 900, density: 0.45 }
    ];
    let best = CALIBRATION[0];
    let bestDiff = Math.abs(best.density - visualDensity);
    for (const entry of CALIBRATION) {
      const diff = Math.abs(entry.density - visualDensity);
      if (diff < bestDiff) { bestDiff = diff; best = entry; }
    }
    // Only override if density meaningfully disagrees with CSS weight.
    // e.g. CSS says 300 but density is 0.25 → Inter 500
    // e.g. CSS says 400 but density is 0.36 → Inter 700
    // e.g. CSS says 700 and density is 0.36 → keep 700 (agree)
    // Don't override if density and CSS are within 1 step (~100) — minor rounding differences
    if (Math.abs(best.weight - cssW) > 100) {
      return best.weight;
    }
  }

  return cssW;
}

function getCandidatesForFamily(fam, targetWeightKey, italic) {
  const list = [];
  const seq = WEIGHT_FALLBACK_SEQUENCE[targetWeightKey] || [targetWeightKey, '400'];
  for (const wKey of seq) {
    const styleNames = FONT_WEIGHT_MAP[wKey] || ['Regular'];
    for (const style of styleNames) {
      if (italic) {
        list.push({ family: fam, style: style + ' Italic' });
        list.push({ family: fam, style: style + 'Italic' });
        list.push({ family: fam, style: style + ' Oblique' });
      } else {
        list.push({ family: fam, style: style });
      }
    }
  }
  const isTargetBold = parseInt(targetWeightKey) >= 600;
  if (isTargetBold) {
    list.push({ family: fam, style: italic ? 'Bold Italic' : 'Bold' });
  }
  list.push({ family: fam, style: italic ? 'Italic' : 'Regular' });
  return list;
}

const FONT_CACHE = new Map();
const FAILED_FONTS = new Set();

async function loadFont(family, weight, italic, fontStretch, visualDensity, visualStretch) {
  const cacheKey = `${family || 'Inter'}|${weight || ''}|${!!italic}|${fontStretch || ''}|${visualDensity ?? ''}|${visualStretch ?? ''}`;
  if (FONT_CACHE.has(cacheKey)) {
    return FONT_CACHE.get(cacheKey);
  }

  const cacheAndReturn = (f) => {
    FONT_CACHE.set(cacheKey, f);
    return f;
  };

  const familyRaw = (family || 'Inter').replace(/['"]/g, '');
  const fontList = familyRaw.split(',').map(f => f.trim()).filter(Boolean);
  const cleanFamily = fontList[0] || 'Inter';
  const fullFamilyString = familyRaw.toLowerCase();
  const familyLower = cleanFamily.toLowerCase();

  // 1. Resolve target numeric weight intelligently
  const targetWeight = resolveTargetWeight(weight, cleanFamily, visualDensity);
  const targetWeightKey = String(targetWeight);

  // 2. Extract stretch
  let stretchLower = (fontStretch || '').toLowerCase();
  if (
    familyLower.includes('condensed') ||
    familyLower.includes('compressed') ||
    familyLower.includes('narrow') ||
    familyLower.includes('extracond')
  ) {
    stretchLower = 'condensed';
  }

  if (visualStretch !== undefined && visualStretch !== null) {
    if (visualStretch < 0.58) {
      stretchLower = 'condensed';
    } else if (visualStretch > 0.72) {
      if (!stretchLower.includes('condensed') && !stretchLower.includes('narrow')) {
        stretchLower = 'expanded';
      }
    }
  }

  const isCondensed = stretchLower.includes('condensed') ||
                      stretchLower.includes('compressed') ||
                      stretchLower.includes('narrow') ||
                      (parseFloat(stretchLower) < 100);

  // Font Awesome Special Handling
  if (fullFamilyString.includes('font awesome') || fullFamilyString.includes('fontawesome')) {
    const isSolid = targetWeight >= 700;
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
      const failureKey = `${font.family}::${font.style}`;
      if (FAILED_FONTS.has(failureKey)) continue;
      try {
        await figma.loadFontAsync({ family: font.family, style: font.style });
        return cacheAndReturn(font);
      } catch {
        FAILED_FONTS.add(failureKey);
      }
    }
  }

  // Fetch all fonts available in Figma (local OS fonts + Google fonts)
  const availableFontsMap = await getAvailableFontsMap();

  // STEP A: Iterate over each font family in the CSS font stack!
  const genericKeywords = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system', 'blinkmacsystemfont', 'inherit', 'initial', 'unset']);
  for (const rawFam of fontList) {
    if (genericKeywords.has(rawFam.toLowerCase())) continue;
    const isGenericWide = /^(arial|helvetica|tahoma|verdana|segoe ui|trebuchet)$/i.test(rawFam.trim());
    const thisEntryIsNarrow = /narrow|condensed/i.test(rawFam);

    if (isCondensed && isGenericWide && !thisEntryIsNarrow) {
      continue;
    }
    if (!isCondensed && thisEntryIsNarrow) {
      continue;
    }

    const baseFam = getBaseFamilyName(rawFam);
    const famSpecificWeight = parseWeightFromStyleOrName(rawFam) || targetWeight;

    // Check if family is in Figma's available fonts map (by normalized key or compact key)
    const normRaw = normalizeFamilyKey(rawFam);
    const compRaw = compactFamilyKey(rawFam);
    const normBase = normalizeFamilyKey(baseFam);
    const compBase = compactFamilyKey(baseFam);

    const availableFonts = availableFontsMap.get(normRaw) ||
                           availableFontsMap.get(compRaw) ||
                           availableFontsMap.get(normBase) ||
                           availableFontsMap.get(compBase) ||
                           null;

    if (availableFonts && availableFonts.length > 0) {
      // Intelligently find the closest style in the foundry's actual style set!
      const bestFont = findBestStyle(availableFonts, famSpecificWeight, !!italic);
      if (bestFont) {
        const failureKey = `${bestFont.family}::${bestFont.style}`;
        if (!FAILED_FONTS.has(failureKey)) {
          try {
            await figma.loadFontAsync({ family: bestFont.family, style: bestFont.style });
            return cacheAndReturn(bestFont);
          } catch {
            FAILED_FONTS.add(failureKey);
          }
        }
      }

      // If best font failed, try remaining available styles sorted by closest match
      const sortedStyles = [...availableFonts].sort((a, b) => {
        const wA = parseWeightFromStyleOrName(a.style) || 400;
        const wB = parseWeightFromStyleOrName(b.style) || 400;
        return Math.abs(wA - famSpecificWeight) - Math.abs(wB - famSpecificWeight);
      });
      for (const font of sortedStyles) {
        const failureKey = `${font.family}::${font.style}`;
        if (FAILED_FONTS.has(failureKey)) continue;
        try {
          await figma.loadFontAsync({ family: font.family, style: font.style });
          return cacheAndReturn(font);
        } catch {
          FAILED_FONTS.add(failureKey);
        }
      }
    }

    // Direct fallback probes if not found in availableFontsMap (or map was unavailable)
    const directCandidates = [];
    directCandidates.push(...getCandidatesForFamily(rawFam, String(famSpecificWeight), !!italic));
    if (baseFam !== rawFam) {
      directCandidates.push(...getCandidatesForFamily(baseFam, String(famSpecificWeight), !!italic));
    }

    if (/arial/i.test(rawFam) && thisEntryIsNarrow) {
      const isBold = famSpecificWeight >= 600;
      if (isBold) {
        directCandidates.push({ family: 'Arial Narrow', style: italic ? 'Bold Italic' : 'Bold' });
        directCandidates.push({ family: 'Arial', style: italic ? 'Narrow Bold Italic' : 'Narrow Bold' });
      } else {
        directCandidates.push({ family: 'Arial Narrow', style: italic ? 'Italic' : 'Regular' });
        directCandidates.push({ family: 'Arial', style: italic ? 'Narrow Italic' : 'Narrow' });
      }
    }

    for (const font of directCandidates) {
      const failureKey = `${font.family}::${font.style}`;
      if (FAILED_FONTS.has(failureKey)) continue;
      try {
        await figma.loadFontAsync({ family: font.family, style: font.style });
        return cacheAndReturn(font);
      } catch {
        FAILED_FONTS.add(failureKey);
      }
    }
  }

  // STEP B: The font family is NOT installed locally or in Figma. Fall back to standard Google Fonts!
  let fallbackGoogleFont = 'Inter';
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
  }

  // Try Google Font with the resolved target weight
  const googleCandidates = [];
  const googleAvailable = availableFontsMap.get(normalizeFamilyKey(fallbackGoogleFont));
  if (googleAvailable && googleAvailable.length > 0) {
    const bestG = findBestStyle(googleAvailable, targetWeight, !!italic);
    if (bestG) googleCandidates.push(bestG);
  }
  googleCandidates.push(...getCandidatesForFamily(fallbackGoogleFont, targetWeightKey, !!italic));

  for (const font of googleCandidates) {
    const failureKey = `${font.family}::${font.style}`;
    if (FAILED_FONTS.has(failureKey)) continue;
    try {
      await figma.loadFontAsync({ family: font.family, style: font.style });
      return cacheAndReturn(font);
    } catch {
      FAILED_FONTS.add(failureKey);
    }
  }

  // STEP C: Variable Font Fallback (Roboto Flex)
  if (visualDensity || visualStretch) {
    let wght = targetWeight;
    if (visualDensity && isNaN(wght)) {
      wght = 400 + ((visualDensity - 0.18) * 3500); 
      wght = Math.max(100, Math.min(1000, Math.round(wght)));
    }
    
    let wdth = 100;
    if (visualStretch) {
       wdth = 100 + ((visualStretch - 0.60) * 200);
       wdth = Math.max(25, Math.min(151, Math.round(wdth)));
    } else {
       wdth = isCondensed ? 75 : 100;
    }
    
    const flexCandidate = { 
      family: 'Roboto Flex', 
      style: 'Regular',
      variationSettings: { wght, wdth }
    };
    try {
      await figma.loadFontAsync({ family: flexCandidate.family, style: flexCandidate.style });
      return cacheAndReturn(flexCandidate);
    } catch {}
  }

  // STEP D: Final safety fallbacks with resolved weight preservation
  const isFinalBold = targetWeight >= 600;
  const finalStyle = isFinalBold ? (italic ? 'Bold Italic' : 'Bold') : (italic ? 'Italic' : 'Regular');
  const finalFallbacks = [
    { family: 'Inter', style: finalStyle },
    { family: 'Roboto', style: finalStyle },
    { family: 'Inter', style: 'Regular' }
  ];

  for (const font of finalFallbacks) {
    const failureKey = `${font.family}::${font.style}`;
    if (FAILED_FONTS.has(failureKey)) continue;
    try {
      await figma.loadFontAsync({ family: font.family, style: font.style });
      return cacheAndReturn(font);
    } catch {
      FAILED_FONTS.add(failureKey);
    }
  }

  return cacheAndReturn({ family: 'Inter', style: 'Regular' });
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

function splitStopTokens(raw) {
  const isPosToken = (t) => /^(?:calc\([^)]+\)|-?[\d.]+(?:%|px|rem|em|deg|turn|rad|grad)?|0)$/i.test(t);
  let depth = 0;
  let tokens = [];
  let cur = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (/\s/.test(ch) && depth === 0) {
      if (cur) { tokens.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);

  if (tokens.length <= 1) {
    return { colorStr: raw, pos1: null, pos2: null };
  }

  let pos2 = null;
  let pos1 = null;

  if (tokens.length >= 3 && isPosToken(tokens[tokens.length - 1]) && isPosToken(tokens[tokens.length - 2])) {
    pos2 = tokens.pop();
    pos1 = tokens.pop();
  } else if (tokens.length >= 2 && isPosToken(tokens[tokens.length - 1])) {
    pos1 = tokens.pop();
  }

  return { colorStr: tokens.join(' '), pos1, pos2 };
}

function resolveStopPosition(token, totalLength, fontSize) {
  if (!token) return null;
  token = token.trim();
  if (token === '0') return 0;
  if (token.endsWith('%')) return parseFloat(token) / 100;
  if (token.endsWith('px')) return totalLength > 0 ? parseFloat(token) / totalLength : 0;
  if (token.endsWith('rem')) return totalLength > 0 ? (parseFloat(token) * 16) / totalLength : 0;
  if (token.endsWith('em')) return totalLength > 0 ? (parseFloat(token) * (fontSize || 16)) / totalLength : 0;
  if (token.endsWith('deg')) return parseFloat(token) / 360;
  if (token.endsWith('turn')) return parseFloat(token);
  if (token.endsWith('rad')) return parseFloat(token) / (2 * Math.PI);
  if (token.endsWith('grad')) return parseFloat(token) / 400;

  if (token.startsWith('calc(')) {
    const inner = token.slice(5, -1).trim();
    const m = inner.match(/(-?[\d.]+)%\s*([+-])\s*(-?[\d.]+)(px|rem)?/i);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const op = m[2];
      let offset = parseFloat(m[3]);
      if (m[4] === 'rem') offset *= 16;
      const offsetNorm = totalLength > 0 ? offset / totalLength : 0;
      return op === '-' ? (pct - offsetNorm) : (pct + offsetNorm);
    }
  }

  const num = parseFloat(token);
  if (!isNaN(num)) {
    if (num <= 1 && num >= 0) return num;
    return totalLength > 0 ? num / totalLength : 0;
  }
  return null;
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

    let prevOpaque = null;
    for (let p = i - 1; p >= 0; p--) {
      if (stops[p].color.a > 0.001) { prevOpaque = stops[p]; break; }
    }
    let nextOpaque = null;
    for (let n = i + 1; n < stops.length; n++) {
      if (stops[n].color.a > 0.001) { nextOpaque = stops[n]; break; }
    }

    if (prevOpaque && !nextOpaque) {
      result.push({ position: s.position, color: { r: prevOpaque.color.r, g: prevOpaque.color.g, b: prevOpaque.color.b, a: s.color.a } });
    } else if (!prevOpaque && nextOpaque) {
      result.push({ position: s.position, color: { r: nextOpaque.color.r, g: nextOpaque.color.g, b: nextOpaque.color.b, a: s.color.a } });
    } else if (prevOpaque && nextOpaque) {
      const pSpan = s.position - prevOpaque.position;
      const nSpan = nextOpaque.position - s.position;
      const totalSpan = pSpan + nSpan;
      const factor = totalSpan > 0 ? pSpan / totalSpan : 0.5;
      result.push({
        position: s.position,
        color: {
          r: prevOpaque.color.r + (nextOpaque.color.r - prevOpaque.color.r) * factor,
          g: prevOpaque.color.g + (nextOpaque.color.g - prevOpaque.color.g) * factor,
          b: prevOpaque.color.b + (nextOpaque.color.b - prevOpaque.color.b) * factor,
          a: s.color.a
        }
      });
    } else {
      result.push(s);
    }
  }
  return result;
}

function parseGradientColorStops(stopsStr, totalLength = 100, fontSize = 16) {
  if (!stopsStr) return [];
  const rawList = splitByTopLevelCommas(stopsStr);
  if (!rawList || rawList.length === 0) return [];

  const parsedItems = [];

  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i].trim();
    if (!raw) continue;

    const hintMatch = raw.match(/^(?:calc\([^)]+\)|-?[\d.]+(?:%|px|rem|em|deg|turn|rad|grad)?|0)$/i);
    if (hintMatch) {
      const hintPos = resolveStopPosition(raw, totalLength, fontSize);
      parsedItems.push({ isHint: true, position: hintPos });
      continue;
    }

    const tokens = splitStopTokens(raw);
    const colStr = tokens.colorStr;
    const col = parseColor(colStr);
    const finalCol = col || (colStr.toLowerCase() === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : null);
    if (!finalCol) continue;

    if (tokens.pos2 !== null) {
      const p1 = resolveStopPosition(tokens.pos1, totalLength, fontSize);
      const p2 = resolveStopPosition(tokens.pos2, totalLength, fontSize);
      parsedItems.push({ isHint: false, color: finalCol, position: p1 });
      parsedItems.push({ isHint: false, color: { ...finalCol }, position: p2 });
    } else if (tokens.pos1 !== null) {
      const p1 = resolveStopPosition(tokens.pos1, totalLength, fontSize);
      parsedItems.push({ isHint: false, color: finalCol, position: p1 });
    } else {
      parsedItems.push({ isHint: false, color: finalCol, position: null });
    }
  }

  if (parsedItems.length === 0) return [];

  const colorStops = [];
  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    if (item.isHint) {
      const prev = colorStops[colorStops.length - 1];
      let next = null;
      for (let j = i + 1; j < parsedItems.length; j++) {
        if (!parsedItems[j].isHint) { next = parsedItems[j]; break; }
      }
      if (prev && next && prev.color && next.color && item.position !== null) {
        const midColor = {
          r: (prev.color.r + next.color.r) / 2,
          g: (prev.color.g + next.color.g) / 2,
          b: (prev.color.b + next.color.b) / 2,
          a: (prev.color.a + next.color.a) / 2
        };
        colorStops.push({ color: midColor, position: item.position });
      }
    } else {
      colorStops.push(item);
    }
  }

  if (colorStops.length === 0) return [];
  if (colorStops.length === 1) {
    colorStops.push({ color: { ...colorStops[0].color }, position: 1 });
    if (colorStops[0].position === null) colorStops[0].position = 0;
  }

  if (colorStops[0].position === null) colorStops[0].position = 0;
  if (colorStops[colorStops.length - 1].position === null) colorStops[colorStops.length - 1].position = 1;

  let idx = 0;
  while (idx < colorStops.length) {
    if (colorStops[idx].position === null) {
      const startIdx = idx - 1;
      const startPos = colorStops[startIdx].position;
      let endIdx = idx;
      while (endIdx < colorStops.length && colorStops[endIdx].position === null) {
        endIdx++;
      }
      const endPos = (endIdx < colorStops.length && colorStops[endIdx].position !== null) ? colorStops[endIdx].position : 1;
      const count = endIdx - startIdx;
      for (let k = idx; k < endIdx; k++) {
        const factor = (k - startIdx) / count;
        colorStops[k].position = startPos + (endPos - startPos) * factor;
      }
      idx = endIdx;
    } else {
      idx++;
    }
  }

  let maxPos = 0;
  for (let i = 0; i < colorStops.length; i++) {
    if (colorStops[i].position < maxPos) {
      colorStops[i].position = maxPos;
    } else {
      maxPos = colorStops[i].position;
    }
  }

  const finalStops = colorStops.map(s => ({
    position: clamp01(s.position),
    color: { ...s.color, a: clamp01(s.color.a ?? 1) }
  }));

  if (finalStops[0].position > 0) {
    finalStops.unshift({ position: 0, color: { ...finalStops[0].color } });
  }
  if (finalStops[finalStops.length - 1].position < 1) {
    finalStops.push({ position: 1, color: { ...finalStops[finalStops.length - 1].color } });
  }

  return fixPremultipliedStops(finalStops);
}

function safeGradientFallback(css) {
  if (!css || typeof css !== 'string') return null;
  const colorMatches = css.match(/(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^)]+\)|#[0-9a-fA-F]{3,8}\b|\b(?:transparent|black|white|red|green|blue|yellow|purple|cyan|magenta|orange|pink|gray|grey)\b/gi);
  if (!colorMatches || colorMatches.length === 0) return null;
  const validColors = [];
  for (const cStr of colorMatches) {
    const col = parseColor(cStr) || (cStr.toLowerCase() === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : null);
    if (col) validColors.push(col);
  }
  if (validColors.length === 0) return null;
  const firstCol = validColors[0];
  const lastCol = validColors[validColors.length - 1];
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0, 1, 0], [-1, 0, 1]],
    gradientStops: [
      { position: 0, color: { ...firstCol, a: clamp01(firstCol.a ?? 1) } },
      { position: 1, color: { ...lastCol, a: clamp01(lastCol.a ?? 1) } }
    ]
  };
}

function parseLinearGradient(css, styles = null, nodeW = 100, nodeH = 100) {
  if (!css) return null;
  const isRepeating = css.includes('repeating-linear-gradient');
  const isLinear = css.includes('linear-gradient');
  if (!isLinear) return null;

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
    if (!inner) return safeGradientFallback(css);

    // Modern CSS Color 4 color-interpolation-method: in srgb, in oklch, etc.
    inner = inner.replace(/\bin\s+(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz(?:-d50|-d65)?|hsl|hwb|lch|oklch)\b/gi, '').trim();

    let angleDeg = 180;
    let stopsStr = inner;

    const angleMatch = inner.match(/^((?:to\s+(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?)|(?:-?[\d.]+(?:deg|rad|turn|grad))|(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?)\s*,\s*(.*)$/is);
    if (angleMatch) {
      const angleExpr = angleMatch[1].toLowerCase().trim();
      stopsStr = angleMatch[2];

      if (angleExpr.includes('deg')) {
        angleDeg = parseFloat(angleExpr);
      } else if (angleExpr.includes('rad')) {
        angleDeg = (parseFloat(angleExpr) * 180) / Math.PI;
      } else if (angleExpr.includes('turn')) {
        angleDeg = parseFloat(angleExpr) * 360;
      } else if (angleExpr.includes('grad')) {
        angleDeg = (parseFloat(angleExpr) * 360) / 400;
      } else if (angleExpr === 'to top' || angleExpr === 'bottom') {
        angleDeg = 0;
      } else if (angleExpr === 'to right' || angleExpr === 'left') {
        angleDeg = 90;
      } else if (angleExpr === 'to bottom' || angleExpr === 'top') {
        angleDeg = 180;
      } else if (angleExpr === 'to left' || angleExpr === 'right') {
        angleDeg = 270;
      } else {
        const cornerAngle = Math.atan2(nodeW || 100, nodeH || 100) * (180 / Math.PI);
        if (angleExpr === 'to top right' || angleExpr === 'to right top') {
          angleDeg = cornerAngle;
        } else if (angleExpr === 'to bottom right' || angleExpr === 'to right bottom') {
          angleDeg = 180 - cornerAngle;
        } else if (angleExpr === 'to bottom left' || angleExpr === 'to left bottom') {
          angleDeg = 180 + cornerAngle;
        } else if (angleExpr === 'to top left' || angleExpr === 'to left top') {
          angleDeg = 360 - cornerAngle;
        }
      }
    }

    angleDeg = ((angleDeg % 360) + 360) % 360;

    const radLen = (angleDeg * Math.PI) / 180;
    const totalLength = Math.max(1, Math.abs((nodeW || 100) * Math.sin(radLen)) + Math.abs((nodeH || 100) * Math.cos(radLen)));
    const fontSize = styles ? (parseFloat(styles.fontSize) || 16) : 16;

    const stops = parseGradientColorStops(stopsStr, totalLength, fontSize);
    if (!stops || stops.length === 0) return safeGradientFallback(css);

    // Repeating linear gradient: unroll across 0..1 range
    if (isRepeating && stops.length >= 2) {
      const minPos = stops[0].position;
      const maxPos = stops[stops.length - 1].position;
      const period = maxPos - minPos;
      if (period > 0.005 && period < 0.95) {
        const unrolled = [];
        const numCycles = Math.min(30, Math.ceil(1 / period));
        for (let cycle = 0; cycle < numCycles; cycle++) {
          for (const s of stops) {
            const newPos = cycle * period + (s.position - minPos);
            if (newPos <= 1.001) {
              unrolled.push({ position: clamp01(newPos), color: { ...s.color } });
            }
          }
        }
        if (unrolled.length >= 2) {
          stops.length = 0;
          stops.push(...unrolled);
          if (stops[0].position > 0) stops.unshift({ position: 0, color: { ...stops[0].color } });
          if (stops[stops.length - 1].position < 1) stops.push({ position: 1, color: { ...stops[stops.length - 1].color } });
        }
      }
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
      gradientStops: stops
    };
  } catch (err) {
    return safeGradientFallback(css);
  }
}

function parseRadialGradient(css, nodeW = 100, nodeH = 100, styles = null) {
  if (!css) return null;
  const isRepeating = css.includes('repeating-radial-gradient');
  const isRadial = css.includes('radial-gradient');
  if (!isRadial) return null;

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
    if (!inner) return safeGradientFallback(css);

    // Modern CSS Color 4 color-interpolation-method
    inner = inner.replace(/\bin\s+(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz(?:-d50|-d65)?|hsl|hwb|lch|oklch)\b/gi, '').trim();

    const nw = Math.max(1, nodeW || 100);
    const nh = Math.max(1, nodeH || 100);
    const fontSize = styles ? (parseFloat(styles.fontSize) || 16) : 16;

    let cx = 0.5, cy = 0.5;
    let rx = 0.5, ry = 0.5;
    let stopsStr = inner;

    const firstCommaIdx = inner.indexOf(',');
    if (firstCommaIdx !== -1) {
      const firstArg = inner.substring(0, firstCommaIdx).trim();
      const isShapeArg = firstArg.includes('at ') ||
                         firstArg.includes('circle') ||
                         firstArg.includes('ellipse') ||
                         firstArg.includes('closest-') ||
                         firstArg.includes('farthest-') ||
                         /^[\d.]+(?:%|px|rem|em)\s+[\d.]+(?:%|px|rem|em)(\s+at\s.*)?$/i.test(firstArg);

      if (isShapeArg) {
        stopsStr = inner.substring(firstCommaIdx + 1).trim();

        const atIdx = firstArg.indexOf(' at ');
        let sizeStr = atIdx !== -1 ? firstArg.substring(0, atIdx).trim() : firstArg;
        const posStr = atIdx !== -1 ? firstArg.substring(atIdx + 4).trim() : '';

        const isCircle = /\bcircle\b/i.test(sizeStr);
        sizeStr = sizeStr.replace(/^(circle|ellipse)\s*/i, '').trim();

        if (posStr) {
          const parsePosCoord = (token, isX) => {
            if (!token) return 0.5;
            token = token.toLowerCase().trim();
            if (token === 'center') return 0.5;
            if (token === 'left') return 0;
            if (token === 'right') return 1;
            if (token === 'top') return 0;
            if (token === 'bottom') return 1;
            if (token.endsWith('%')) return parseFloat(token) / 100;
            if (token.endsWith('px')) return parseFloat(token) / (isX ? nw : nh);
            if (token.endsWith('rem')) return (parseFloat(token) * 16) / (isX ? nw : nh);
            if (token.endsWith('em')) return (parseFloat(token) * fontSize) / (isX ? nw : nh);
            return 0.5;
          };

          const posParts = posStr.trim().split(/\s+/);
          if (posParts.length >= 2) {
            cx = parsePosCoord(posParts[0], true);
            cy = parsePosCoord(posParts[1], false);
          } else if (posParts.length === 1) {
            cx = parsePosCoord(posParts[0], true);
            cy = 0.5;
          }
        }

        const hypot = Math.hypot || ((x, y) => Math.sqrt(x * x + y * y));
        const dTL = hypot(cx * nw, cy * nh);
        const dTR = hypot((1 - cx) * nw, cy * nh);
        const dBL = hypot(cx * nw, (1 - cy) * nh);
        const dBR = hypot((1 - cx) * nw, (1 - cy) * nh);
        const maxCornerDist = Math.max(dTL, dTR, dBL, dBR);
        const minCornerDist = Math.min(dTL, dTR, dBL, dBR);

        if (sizeStr && !/^(circle|ellipse)$/i.test(sizeStr)) {
          const sizeParts = sizeStr.trim().split(/\s+/);
          if (sizeStr.includes('closest-side')) {
            const minX = Math.min(cx, 1 - cx) * nw;
            const minY = Math.min(cy, 1 - cy) * nh;
            if (isCircle) {
              const r = Math.min(minX, minY);
              rx = r / nw; ry = r / nh;
            } else {
              rx = minX / nw; ry = minY / nh;
            }
          } else if (sizeStr.includes('farthest-side')) {
            const maxX = Math.max(cx, 1 - cx) * nw;
            const maxY = Math.max(cy, 1 - cy) * nh;
            if (isCircle) {
              const r = Math.max(maxX, maxY);
              rx = r / nw; ry = r / nh;
            } else {
              rx = maxX / nw; ry = maxY / nh;
            }
          } else if (sizeStr.includes('closest-corner')) {
            rx = minCornerDist / nw;
            ry = minCornerDist / nh;
          } else if (sizeStr.includes('farthest-corner')) {
            rx = maxCornerDist / nw;
            ry = maxCornerDist / nh;
          } else if (sizeParts.length >= 2) {
            const parseLen = (s, isX) => {
              if (s.endsWith('%')) return parseFloat(s) / 100;
              if (s.endsWith('px')) return parseFloat(s) / (isX ? nw : nh);
              if (s.endsWith('rem')) return (parseFloat(s) * 16) / (isX ? nw : nh);
              return 0.5;
            };
            rx = parseLen(sizeParts[0], true);
            ry = parseLen(sizeParts[1], false);
          } else if (sizeParts.length === 1) {
            const val = sizeParts[0];
            if (val.endsWith('%')) {
              rx = parseFloat(val) / 100;
              ry = rx;
            } else if (val.endsWith('px')) {
              const r = parseFloat(val);
              rx = r / nw;
              ry = r / nh;
            }
          }
        } else {
          rx = maxCornerDist / nw;
          ry = maxCornerDist / nh;
        }
      }
    }

    if (!isFinite(rx) || rx <= 0) rx = 0.5;
    if (!isFinite(ry) || ry <= 0) ry = 0.5;

    const totalLength = Math.max(nw * rx, nh * ry);
    const stops = parseGradientColorStops(stopsStr, totalLength, fontSize);
    if (!stops || stops.length === 0) return safeGradientFallback(css);

    // Repeating radial gradient: unroll across 0..1 range
    if (isRepeating && stops.length >= 2) {
      const minPos = stops[0].position;
      const maxPos = stops[stops.length - 1].position;
      const period = maxPos - minPos;
      if (period > 0.005 && period < 0.95) {
        const unrolled = [];
        const numCycles = Math.min(30, Math.ceil(1 / period));
        for (let cycle = 0; cycle < numCycles; cycle++) {
          for (const s of stops) {
            const newPos = cycle * period + (s.position - minPos);
            if (newPos <= 1.001) {
              unrolled.push({ position: clamp01(newPos), color: { ...s.color } });
            }
          }
        }
        if (unrolled.length >= 2) {
          stops.length = 0;
          stops.push(...unrolled);
          if (stops[0].position > 0) stops.unshift({ position: 0, color: { ...stops[0].color } });
          if (stops[stops.length - 1].position < 1) stops.push({ position: 1, color: { ...stops[stops.length - 1].color } });
        }
      }
    }

    // Build Figma gradientTransform for GRADIENT_RADIAL.
    // Figma's gradientTransform maps FROM node space TO gradient space:
    //   gx = a*nx + b*ny + c,  gy = d*nx + e*ny + f
    // Ellipse boundary maps to unit circle in gradient space.
    // a = 0.5/rx, c = 0.5 - a*cx; e = 0.5/ry, f = 0.5 - e*cy
    const a = 0.5 / rx, b = 0,          c = 0.5 - a * cx;
    const d = 0,        e = 0.5 / ry,   f = 0.5 - e * cy;

    return {
      type: 'GRADIENT_RADIAL',
      gradientTransform: [
        [a, b, c],
        [d, e, f]
      ],
      gradientStops: stops
    };
  } catch (err) {
    return safeGradientFallback(css);
  }
}

function parseAngularGradient(css, nodeW = 100, nodeH = 100, styles = null) {
  if (!css) return null;
  const isRepeating = css.includes('repeating-conic-gradient');
  const isConic = css.includes('conic-gradient');
  if (!isConic) return null;

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
    if (!inner) return safeGradientFallback(css);

    // Modern CSS Color 4 color-interpolation-method
    inner = inner.replace(/\bin\s+(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz(?:-d50|-d65)?|hsl|hwb|lch|oklch)\b/gi, '').trim();

    const nw = Math.max(1, nodeW || 100);
    const nh = Math.max(1, nodeH || 100);
    const fontSize = styles ? (parseFloat(styles.fontSize) || 16) : 16;

    let fromAngle = 0;
    let cx = 0.5, cy = 0.5;
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

      const atMatch = header.match(/at\s+(.+)$/i);
      if (atMatch) {
        const posParts = atMatch[1].trim().split(/\s+/);
        const parseCoord = (token, isX) => {
          if (!token || token === 'center') return 0.5;
          if (token === 'left') return 0;
          if (token === 'right') return 1;
          if (token === 'top') return 0;
          if (token === 'bottom') return 1;
          if (token.endsWith('%')) return parseFloat(token) / 100;
          if (token.endsWith('px')) return parseFloat(token) / (isX ? nw : nh);
          if (token.endsWith('rem')) return (parseFloat(token) * 16) / (isX ? nw : nh);
          return 0.5;
        };
        if (posParts.length >= 2) {
          cx = parseCoord(posParts[0], true);
          cy = parseCoord(posParts[1], false);
        } else if (posParts.length === 1) {
          cx = parseCoord(posParts[0], true);
          cy = 0.5;
        }
      }
    }

    const stops = parseGradientColorStops(stopsStr, 360, fontSize);
    if (!stops || stops.length === 0) return safeGradientFallback(css);

    // Repeating conic gradient: unroll across 0..1 range
    if (isRepeating && stops.length >= 2) {
      const minPos = stops[0].position;
      const maxPos = stops[stops.length - 1].position;
      const period = maxPos - minPos;
      if (period > 0.005 && period < 0.95) {
        const unrolled = [];
        const numCycles = Math.min(30, Math.ceil(1 / period));
        for (let cycle = 0; cycle < numCycles; cycle++) {
          for (const s of stops) {
            const newPos = cycle * period + (s.position - minPos);
            if (newPos <= 1.001) {
              unrolled.push({ position: clamp01(newPos), color: { ...s.color } });
            }
          }
        }
        if (unrolled.length >= 2) {
          stops.length = 0;
          stops.push(...unrolled);
          if (stops[0].position > 0) stops.unshift({ position: 0, color: { ...stops[0].color } });
          if (stops[stops.length - 1].position < 1) stops.push({ position: 1, color: { ...stops[stops.length - 1].color } });
        }
      }
    }

    // In Figma, GRADIENT_ANGULAR rotates around (cx, cy)
    // CSS conic-gradient 0deg points UP (-PI/2)
    const rad = ((fromAngle - 90) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      type: 'GRADIENT_ANGULAR',
      gradientTransform: [
        [cos, sin, cx - cx * cos - cy * sin],
        [-sin, cos, cy + cx * sin - cy * cos]
      ],
      gradientStops: stops
    };
  } catch (err) {
    return safeGradientFallback(css);
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
  const isMaskProp = !!((styles.maskImage && styles.maskImage !== 'none') || (styles.webkitMaskImage && styles.webkitMaskImage !== 'none'));
  const isMaskOnly = isMaskProp && !hasChildren;

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
    if (!isMaskOnly) {
      const bg = parseColor(styles.backgroundColor);
      if (bg && bg.a > 0.005) {
        fills.push({ type: 'SOLID', color: { r: bg.r, g: bg.g, b: bg.b }, opacity: clamp01(bg.a) });
      }
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

        let dataStr = typeof blobObj === 'string' ? blobObj : (blobObj?.data || blobObj?.base64Blob || blobObj?.url || '');
        if (typeof dataStr === 'string' && dataStr.length > 0) {
          const lower = dataStr.trim().toLowerCase();
          if (lower.startsWith('data:image/svg+xml') || lower.startsWith('<svg') || lower.startsWith('<?xml') || lower.includes('%3csvg')) {
            isSvg = true;
            const commaIdx = dataStr.indexOf(',');
            const meta = commaIdx >= 0 ? dataStr.slice(0, commaIdx).toLowerCase() : '';
            const raw = commaIdx >= 0 ? dataStr.slice(commaIdx + 1) : dataStr;
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
                svgNode.fills = []; // Root SVG frame must NEVER have a background fill!
                const maskFillColor = parseColor(styles.backgroundColor || styles.color);
                if (maskFillColor && maskFillColor.a > 0) {
                  function applyMaskFill(n) {
                    if (n !== svgNode && 'fills' in n && Array.isArray(n.fills)) {
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

  if (hasMaskSvg || (isMaskProp && !hasChildren)) {
    fills = [];
  }

  if (!isTextClip && !isZeroSize) {
    // CSS Gradients go ON TOP of background images in Figma.
    // In CSS, the first gradient in the comma-separated list is the top-most layer.
    // In Figma, fills are drawn from back to front (fills[0] is bottom, last fill is on top).
    // Therefore, we iterate from bottom to top (last to first) so the first CSS layer is on top in Figma!
    const bgGradientSrc = (styles.backgroundImage && styles.backgroundImage.includes('gradient'))
      ? styles.backgroundImage
      : ((styles.background && styles.background.includes('gradient')) ? styles.background : null);

    if (bgGradientSrc) {
      const bgs = splitByTopLevelCommas(bgGradientSrc);
      const gradFills = [];
      for (let i = bgs.length - 1; i >= 0; i--) {
        const bg = bgs[i];
        if (bg.includes('linear-gradient')) {
          const grad = parseLinearGradient(bg, styles, nodeW, nodeH);
          if (grad) gradFills.push(grad);
        } else if (bg.includes('radial-gradient')) {
          const grad = parseRadialGradient(bg, nodeW, nodeH, styles);
          if (grad) gradFills.push(grad);
        } else if (bg.includes('conic-gradient')) {
          const grad = parseAngularGradient(bg, nodeW, nodeH, styles);
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
  const borderGradSrc = (styles.borderImageSource && styles.borderImageSource !== 'none') ? styles.borderImageSource
    : ((styles.borderImage && styles.borderImage !== 'none' && styles.borderImage.includes('gradient')) ? styles.borderImage : null);
  if (borderGradSrc) {
    const bW = node.width || 100;
    const bH = node.height || 100;
    if (borderGradSrc.includes('linear-gradient')) {
      gradientStroke = parseLinearGradient(borderGradSrc, styles, bW, bH);
    } else if (borderGradSrc.includes('radial-gradient')) {
      gradientStroke = parseRadialGradient(borderGradSrc, bW, bH, styles);
    } else if (borderGradSrc.includes('conic-gradient')) {
      gradientStroke = parseAngularGradient(borderGradSrc, bW, bH, styles);
    }
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
    const isWordOrChar = /\b(?:word|char|chars|words|splitting|split-text|reveal-text|scroll-text|scrub-text|anime-text|text-anim|hero-text-anim|title-anim|fade_anim)\b/i.test(cls) ||
                         /\b(?:text-anim|split-text|reveal-text)\b/i.test(id);
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
    figma.ui.postMessage({ type: 'progress', percent: pct, label: 'Painting.....' });
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
  const scaleX = Math.sqrt(a * a + b * b);
  const scaleY = Math.sqrt(c * c + d * d);
  const angleDeg = Math.atan2(b, a) * (180 / Math.PI);
  return { angleDeg, flipX, flipY, scaleX, scaleY };
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
      if (item.text) {
        const textContent = item.text.trim();
        if (!textContent) continue;

        const fontObj = await loadFont(item.fontFamily, item.fontWeight || '400', item.fontStyle === 'italic', item.fontStretch, item.visualDensity, item.visualStretch);
        const textNode = figma.createText();
        textNode.fontName = { family: fontObj.family, style: fontObj.style };
        textNode.characters = textContent;

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

        // Precise positioning:
        // Calculate center or top-left from the browser's exact SVG getBBox()
        let posX = item.x * scaleX;
        let posY = item.y * scaleY;

        // If text was centered horizontally in SVG (textAnchor middle or x=50%), center it
        if (item.textAnchor === 'middle' || (item.width && Math.abs((item.x + item.width / 2) - vbW / 2) < 3)) {
          const centerX = (item.x + (item.width || 0) / 2) * scaleX;
          posX = centerX - (textNode.width / 2);
        }

        // If text was vertically centered in SVG (dominantBaseline central or y=50%), center it
        if (item.dominantBaseline === 'central' || item.dominantBaseline === 'middle' || (item.height && Math.abs((item.y + item.height / 2) - vbH / 2) < 3)) {
          const centerY = (item.y + (item.height || 0) / 2) * scaleY;
          posY = centerY - (textNode.height / 2);
        }

        textNode.x = Math.round(posX);
        textNode.y = Math.round(posY);
        continue;
      }

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
  const cls = (node.attributes?.class || '');
  const id = (node.attributes?.id || node.id || '');
  if (/\b(?:accordion|card|modal|table|post|comment|widget|box|checkout|graphic|demo|mockup|preview|device|window|panel|dialog|sheet|item|tab)-header\b/i.test(cls) ||
      /\b(?:checkout|graphic|demo|mockup|preview|device|browser-card)\b/i.test(cls) ||
      /\b(?:checkout|graphic|demo|mockup|preview|device|browser-card)\b/i.test(id)) {
    return false;
  }
  if (tag === 'HEADER' || tag === 'NAV') {
    return !/\b(?:checkout|graphic|demo|mockup|card|panel)\b/i.test(cls);
  }
  const role = (node.attributes?.role || '');
  if (role === 'banner' || role === 'navigation') return true;
  if (/\b(?:navbar|site-header|main-header|header-wrapper|top-header|sticky-header|fixed-header)\b/i.test(cls)) {
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

let lastYieldTime = Date.now();
async function yieldIfNeeded() {
  if (Date.now() - lastYieldTime > 30) {
    await new Promise(resolve => setTimeout(resolve, 0));
    lastYieldTime = Date.now();
  }
}

async function renderNode(sNode, parentFrame, parentX, parentY, assets, inheritedStyles, inheritedTextClip = null, activeRotation = null, parentNode = null, isVerticalInverted = false, parentUnrotOrigin = { x: 0, y: 0 }, inheritedBgColor = null) {
  if (!sNode) return null;
  const sNodeId = (sNode.id || sNode.attributes?.id || '').toLowerCase();
  const sNodeCls = (sNode.attributes?.class || '').toLowerCase();
  if (sNodeId.includes('h2f-edge-lighting') || sNodeCls.includes('h2f-edge-wrapper') || sNodeCls.includes('halo-stroke') || sNodeCls.includes('halo-ambient-glow') || sNodeCls.includes('notification-pill') || sNode.attributes?.['data-h2f-ignore']) {
    return null;
  }
  // If element is 100% clipped out in CSS (e.g. clip-path: inset(0px 0px 100%) on collapsed accordions/tabs)
  if (sNode.styles?.clipPath && /inset\([^)]*100%[^)]*\)/.test(sNode.styles.clipPath)) {
    return null;
  }
  await yieldIfNeeded();

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
  // If this is a 0-height container (e.g. <astro-island>, custom elements, display: contents)
  // or a header/nav wrapper whose height is 0 or less than its visible children,
  // expand its bounding rect to properly encompass its children so it doesn't distort child coordinates.
  const isZeroHeightContainer = (!sNode.rect || !sNode.rect.height || sNode.rect.height === 0) || (s.display === 'contents');
  if ((isZeroHeightContainer || isNavOrHeader(sNode)) && sNode.childNodes && sNode.childNodes.length > 0) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let hasValidChild = false;
    for (const c of sNode.childNodes) {
      if (c.rect && (c.rect.width > 0 || c.rect.height > 0)) {
        minX = Math.min(minX, c.rect.x);
        minY = Math.min(minY, c.rect.y);
        maxX = Math.max(maxX, c.rect.x + (c.rect.width || 0));
        maxY = Math.max(maxY, c.rect.y + (c.rect.height || 0));
        hasValidChild = true;
      }
    }
    if (hasValidChild) {
      const curY = sNode.rect?.y != null ? sNode.rect.y : minY;
      const targetY = isZeroHeightContainer ? minY : Math.min(curY, minY);
      const targetH = Math.max(sNode.rect?.height || 0, maxY - targetY);
      const targetW = isZeroHeightContainer ? Math.max(sNode.rect?.width || 0, maxX - minX) : Math.max(sNode.rect?.width || 0, maxX - minX);
      sNode.rect = {
        ...sNode.rect,
        x: (isZeroHeightContainer && sNode.rect?.x === 0 && minX !== 0) ? minX : (sNode.rect?.x ?? minX),
        y: targetY,
        width: targetW,
        height: targetH
      };
    }
  }

  // For unrotated elements, rect.width and rect.height reflect the true visual bounding box (including CSS scale).
  // offsetWidth/offsetHeight only represent unscaled layout dimensions, which must NOT override visual size unless rotated.
  let isRotated = false;
  let scaleX = 1;
  let scaleY = 1;
  if (s.transform && s.transform.includes('matrix')) {
    const mat = parseCssTransformMatrix(s.transform);
    if (mat) {
      isRotated = Math.abs(mat.angleDeg) > 0.5;
      if (mat.scaleX) scaleX = mat.scaleX;
      if (mat.scaleY) scaleY = mat.scaleY;
    }
  } else if (s.rotate && s.rotate !== 'none') {
    isRotated = true;
  }
  const isScaled = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01 || (s.transform && /scale/i.test(s.transform));

  const origW = Math.round((!isRotated || isScaled) ? (sNode.rect?.width || sNode.rect?.offsetWidth || 0) : (sNode.rect?.offsetWidth || sNode.rect?.width || 0));
  const origH = Math.round((!isRotated || isScaled) ? (sNode.rect?.height || sNode.rect?.offsetHeight || 0) : (sNode.rect?.offsetHeight || sNode.rect?.height || 0));
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

  // Pure Text Element Optimization:
  // If this element has no visible container styling (no background, border, shadow, pseudo-elements, clip-path, or controls)
  // and contains only a single text child (or direct text), render it directly as a Figma TEXT node!
  // This eliminates redundant wrapper Frames that leave trailing gaps and break inline flow.
  const hasBg = (s.backgroundColor && s.backgroundColor !== 'transparent' && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && (parseColor(s.backgroundColor)?.a || 0) > 0.01) ||
                (s.backgroundImage && s.backgroundImage !== 'none');
  const hasBorder = ((parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle && s.borderTopStyle !== 'none') ||
                     (parseFloat(s.borderRightWidth) > 0 && s.borderRightStyle && s.borderRightStyle !== 'none') ||
                     (parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle && s.borderBottomStyle !== 'none') ||
                     (parseFloat(s.borderLeftWidth) > 0 && s.borderLeftStyle && s.borderLeftStyle !== 'none') ||
                     (s.borderImageSource && s.borderImageSource !== 'none'));
  const hasShadow = (s.boxShadow && s.boxShadow !== 'none');
  const hasPseudo = !!(sNode.pseudoElementNodes?.before || sNode.pseudoElementNodes?.after);
  const hasClip = (s.clipPath && s.clipPath !== 'none') || (s.maskImage && s.maskImage !== 'none');
  const isSpecial = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SVG', 'CANVAS', 'IFRAME', 'VIDEO', 'IMG', 'BODY', 'HTML', 'MAIN', 'SECTION', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM'].includes(sNode.tag);
  const hasSvg = !!(sNode.content && (sNode.tag === 'SVG' || sNode.content.includes('<svg')));
  const hasSingleTextChild = sNode.childNodes && sNode.childNodes.length === 1 && (sNode.childNodes[0].nodeType === 3 || sNode.childNodes[0].text);
  const hasDirectText = sNode.text && (!sNode.childNodes || sNode.childNodes.length === 0);

  if (!hasBg && !hasBorder && !hasShadow && !hasPseudo && !hasClip && !isSpecial && !hasSvg && (hasSingleTextChild || hasDirectText)) {
    const textChild = hasSingleTextChild ? sNode.childNodes[0] : sNode;
    const mergedStyles = { ...s, ...(textChild.styles || {}) };
    const nodeToRender = {
      ...textChild,
      id: sNode.id || textChild.id,
      tag: sNode.tag,
      attributes: sNode.attributes,
      styles: mergedStyles,
      rect: sNode.rect || textChild.rect,
      contentRect: textChild.rect,
      lineCount: textChild.lineCount || sNode.lineCount || 1,
      text: textChild.text || sNode.text,
      _isDirectTextNode: true
    };
    const tNode = await renderTextNode(nodeToRender, parentFrame, parentX, parentY, mergedStyles, currentTextClip, activeRotation, parentNode, isVerticalInverted, myUnrotOrigin, currentBgColor);
    if (tNode) {
      if (sNode.tag) {
        let name = sNode.tag.toLowerCase();
        if (sNode.attributes?.class) name += '.' + sNode.attributes.class.trim().replace(/\s+/g, '.');
        tNode.name = name;
      }
      reportProgress();
      return tNode;
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
  const isBgOverlay = /\b(?:particle|particles|particles-style|lines|stripes|bg-shape|shape-bg|bg-overlay|overlay-bg|bottom-image-layer)\b/i.test(sNode.attributes?.class || '') ||
                      /\b(?:particle|particles|particles-style|lines|stripes)\b/i.test(sNode.attributes?.id || '') ||
                      !!sNode.attributes?.['data-particle'] ||
                      (s.zIndex && parseInt(s.zIndex, 10) < 0);
  if (isBgOverlay) {
    parentFrame.insertChild(0, frame);
  } else {
    parentFrame.appendChild(frame);
  }

  // If a marquee / ticker slider was captured mid-flight with a large negative translate,
  // normalize it so the wrapper starts at x=0 inside its parent and child slides flow properly
  const isMarqueeWrapper = sNode.attributes?.class && /swiper-wrapper|marquee|ticker/i.test(sNode.attributes.class);
  if (isMarqueeWrapper && x < -100) {
    const shiftX = -x;
    x = 0;
    if (sNode.rect) sNode.rect.x = (sNode.rect.x || 0) + shiftX;
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
  const isCarouselSlide = sNode.attributes?.class && /\b(?:swiper-slide|slick-slide|owl-item|splide__slide|carousel-item|embla__slide)\b/i.test(sNode.attributes.class);
  const hasClipPath = s.clipPath && s.clipPath !== 'none' && s.clipPath.includes('inset');
  frame.clipsContent = isCarouselSlide || hasClipPath || (!isPageLevelWrapper && (clipValues.includes(s.overflow) || clipValues.includes(s.overflowX) || clipValues.includes(s.overflowY)));

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
    const isTextEntry = !/^(?:checkbox|radio|hidden|range|color|file|image|button|submit|reset)$/i.test(inputType);
    if (!isTextEntry) {
      const isChecked = sNode.attributes?.checked === 'true' || sNode.attributes?.checked === 'checked' || sNode.attributes?.checked === true;
      if (inputType === 'checkbox') {
        if (!frame.strokes || frame.strokes.length === 0) {
          frame.strokes = [{ type: 'SOLID', color: { r: 118 / 255, g: 118 / 255, b: 118 / 255 } }];
          frame.strokeWeight = 1;
        }
        if (!frame.fills || frame.fills.length === 0) {
          if (isChecked) {
            const acc = parseColor(s.accentColor);
            frame.fills = [{ type: 'SOLID', color: acc || { r: 0.08, g: 0.38, b: 0.89 } }];
          } else {
            frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          }
        }
        if (!frame.cornerRadius || frame.cornerRadius === 0) {
          frame.cornerRadius = 3;
        }
        if (isChecked) {
          try {
            const checkIcon = figma.createVector();
            checkIcon.name = 'checkmark';
            checkIcon.vectorPaths = [{
              windingRule: 'NONZERO',
              data: 'M 3 8 L 6.5 11.5 L 13 4'
            }];
            const checkCol = (frame.fills && frame.fills.length > 0) ? { r: 1, g: 1, b: 1 } : (parseColor(s.color || '#ffffff') || { r: 1, g: 1, b: 1 });
            checkIcon.strokes = [{ type: 'SOLID', color: checkCol }];
            checkIcon.strokeWeight = 2;
            checkIcon.strokeCap = 'ROUND';
            checkIcon.strokeJoin = 'ROUND';
            checkIcon.x = Math.max(0, Math.round((rectW - 14) / 2));
            checkIcon.y = Math.max(0, Math.round((rectH - 14) / 2));
            frame.appendChild(checkIcon);
          } catch (_) {}
        }
      } else if (inputType === 'radio') {
        if (!frame.strokes || frame.strokes.length === 0) {
          frame.strokes = [{ type: 'SOLID', color: { r: 118 / 255, g: 118 / 255, b: 118 / 255 } }];
          frame.strokeWeight = 1;
        }
        if (!frame.fills || frame.fills.length === 0) {
          frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        }
        frame.cornerRadius = 999;
        if (isChecked) {
          try {
            const dot = figma.createEllipse();
            dot.name = 'radio-dot';
            const dotSize = Math.max(4, Math.round(Math.min(rectW, rectH) * 0.5));
            dot.resize(dotSize, dotSize);
            dot.x = Math.round((rectW - dotSize) / 2);
            dot.y = Math.round((rectH - dotSize) / 2);
            const dotCol = parseColor(s.accentColor || s.color || '#000000') || { r: 0, g: 0, b: 0 };
            dot.fills = [{ type: 'SOLID', color: dotCol }];
            frame.appendChild(dot);
          } catch (_) {}
        }
      }
      // Non-text inputs (checkbox, radio, etc.) must NEVER display their internal value (e.g. "on") as text!
    } else {
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
  }

    // Floated / right-aligned pseudo-elements (e.g. accordion chevron or float: right)
  for (const pKey of ['before', 'after']) {
    const pseudoNode = sNode.pseudoElementNodes?.[pKey];
    if (pseudoNode) {
      const pStyles = pseudoNode.styles || {};
      const isFloatRight = pStyles.float === 'right' || pStyles.cssFloat === 'right';
      if (isFloatRight) {
        const iconW = Math.round(pseudoNode.rect?.width || 24);
        const iconH = Math.round(pseudoNode.rect?.height || 24);
        const padRight = parseFloat(s.paddingRight) || 0;
        const marginR = parseFloat(pStyles.marginRight) || 0;
        let rightOffset = 0;
        if (pStyles.position === 'relative' && !isNaN(parseFloat(pStyles.right))) {
          rightOffset = parseFloat(pStyles.right);
        }
        const targetX = Math.round(rectW - iconW - padRight - marginR - rightOffset);
        pseudoNode._localRect = {
          x: targetX,
          y: Math.round((rectH - iconH) / 2),
          width: iconW,
          height: iconH
        };
      }
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

  // Helper: collect text content from a subtree for deduplication comparison
  function collectText(node) {
    if (!node) return '';
    if (node.nodeType === 3) return (node.text || '').trim();
    let out = '';
    if (node.childNodes) for (const c of node.childNodes) out += collectText(c);
    return out;
  }

  // Helper: apply CSS blend mode math to pre-compute final visual color
  // Returns a blended rgb string like "rgb(65, 102, 141)"
  function cssBlend(bgColor, fgColor, blendMode, fgAlpha) {
    function parseRGB(str) {
      if (!str) return null;
      const m = str.match(/rgba?\((\d+\.?\d*),\s*(\d+\.?\d*),\s*(\d+\.?\d*)(?:,\s*(\d+\.?\d*))?\)/);
      if (!m) return null;
      return { r: parseFloat(m[1])/255, g: parseFloat(m[2])/255, b: parseFloat(m[3])/255, a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    }
    const bg = parseRGB(bgColor);
    const fg = parseRGB(fgColor);
    if (!bg || !fg) return null;
    const alpha = fgAlpha !== undefined ? fgAlpha : fg.a;
    function ch(bgC, fgC, mode) {
      switch (mode) {
        case 'hard-light': return fgC <= 0.5 ? 2*fgC*bgC : 1-2*(1-fgC)*(1-bgC);
        case 'multiply': return fgC * bgC;
        case 'screen': return 1-(1-fgC)*(1-bgC);
        case 'overlay': return bgC <= 0.5 ? 2*fgC*bgC : 1-2*(1-fgC)*(1-bgC);
        case 'soft-light': return bgC <= 0.5 ? bgC-(1-2*fgC)*bgC*(1-bgC) : bgC+(2*fgC-1)*(Math.sqrt(bgC)-bgC);
        case 'darken': return Math.min(fgC, bgC);
        case 'lighten': return Math.max(fgC, bgC);
        case 'color-dodge': return bgC === 0 ? 0 : Math.min(1, bgC/(1-fgC));
        case 'color-burn': return bgC === 1 ? 1 : Math.max(0, 1-(1-bgC)/fgC);
        case 'difference': return Math.abs(fgC - bgC);
        case 'exclusion': return fgC+bgC-2*fgC*bgC;
        default: return fgC; // normal
      }
    }
    const r = ch(bg.r, fg.r, blendMode) * alpha + bg.r * (1-alpha);
    const g = ch(bg.g, fg.g, blendMode) * alpha + bg.g * (1-alpha);
    const b = ch(bg.b, fg.b, blendMode) * alpha + bg.b * (1-alpha);
    return `rgb(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)})`;
  }

  // Helper: patch color properties on a subtree node using pre-computed blend result
  // Maps each background-layer node's color -> blended color based on its FG counterpart's color
  function applyBlendedColors(bgNode, fgNode, blendMode) {
    if (!bgNode || !fgNode) return;
    const fgAlpha = fgNode.styles?.opacity !== undefined ? parseFloat(fgNode.styles.opacity) : 1;
    // Use FG's color to compute blend; fall back to FG node's color if fg child color is different alpha
    const fgColor = fgNode.styles?.color || fgNode.styles?.webkitTextFillColor;
    const bgColor = bgNode.styles?.color || bgNode.styles?.webkitTextFillColor;
    if (bgColor && fgColor) {
      // Parse FG alpha from rgba if present
      const fgRGBA = fgColor.match(/rgba?\((\d+\.?\d*),\s*(\d+\.?\d*),\s*(\d+\.?\d*)(?:,\s*(\d+\.?\d*))?\)/);
      const resolvedFgAlpha = (fgRGBA && fgRGBA[4] !== undefined) ? parseFloat(fgRGBA[4]) : fgAlpha;
      // Use parent node's fgAlpha for inherited opacity
      const blended = cssBlend(bgColor, fgColor, blendMode, resolvedFgAlpha);
      if (blended) {
        bgNode.styles = bgNode.styles || {};
        bgNode.styles.color = blended;
        bgNode.styles.webkitTextFillColor = blended;
      }
    }
    // Recurse into children - pair them by index
    if (bgNode.childNodes && fgNode.childNodes) {
      const len = Math.min(bgNode.childNodes.length, fgNode.childNodes.length);
      for (let i = 0; i < len; i++) {
        applyBlendedColors(bgNode.childNodes[i], fgNode.childNodes[i], blendMode);
      }
    }
  }

  // Track rendered nodes for blend-mode deduplication
  const blendSkipIds = new Set();

  for (const child of allChildren) {
    if (blendSkipIds.has(child.id)) continue;

    // === Blend-mode duplicate detection ===
    // Pattern: two siblings at the exact same rect, one is a mix-blend-mode overlay of the other
    // (e.g. Stripe hero: hero-section__title--background + hero-section__title--foreground)
    // CSS blend modes can't be reproduced faithfully in Figma for text, so instead:
    // 1. Pre-compute the final blended colors by applying CSS blend math to the background layer
    // 2. Skip the overlay to prevent duplicate text from appearing
    const childBlend = child.styles?.mixBlendMode;
    if (childBlend && childBlend !== 'normal' && child.rect) {
      const cr = child.rect;
      const dupPair = renderedChildren.find(({ domNode: prev }) => {
        if (!prev.rect) return false;
        const pr = prev.rect;
        const rectsMatch = Math.abs(pr.x - cr.x) < 2 &&
                           Math.abs(pr.y - cr.y) < 2 &&
                           Math.abs(pr.width - cr.width) < 4 &&
                           Math.abs(pr.height - cr.height) < 4;
        if (!rectsMatch) return false;
        const prevText = collectText(prev);
        const childText = collectText(child);
        return prevText.length > 0 && childText.length > 0 &&
               prevText.slice(0, 40) === childText.slice(0, 40);
      });
      if (dupPair) {
        // Strategy: pre-bake the blend result onto the BG node's colors, then re-render BG.
        // This produces the correct final visual colors without needing Figma blend modes.
        // e.g. BG lime-green + FG blue at hard-light → blended teal/slate-blue directly in color values.
        applyBlendedColors(dupPair.domNode, child, childBlend);
        // Remove the already-rendered BG figma node (it used the un-blended lime green color)
        try { dupPair.figmaNode.remove(); } catch(_) {}
        const idx = renderedChildren.indexOf(dupPair);
        if (idx >= 0) renderedChildren.splice(idx, 1);
        // Re-render BG node with patched (blended) colors — skip the FG overlay entirely
        const fNode = await renderNode(dupPair.domNode, frame, trueGlobalX, trueGlobalY, assets, s, currentTextClip, nextRotation, sNode, nextVerticalInverted, myUnrotOrigin, currentBgColor);
        if (fNode) renderedChildren.push({ domNode: dupPair.domNode, figmaNode: fNode });
        continue; // skip rendering the blend-mode overlay
      }
    }

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

    // Single-line text nodes have Range ink height in DOM (~19px) vs line-height in Figma (~29px).
    // This is CSS half-leading, not multiline expansion, so do not push siblings or resize container.
    const isSingleLineText = curr.domNode.nodeType === 3 && (!curr.domNode.lineCount || curr.domNode.lineCount <= 1);
    if (isSingleLineText) continue;

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

  // Sibling Horizontal Flow Push:
  // In HTML document flow, when an inline element's text expands in Figma (due to fallback font metrics),
  // subsequent siblings on the same horizontal row (e.g. adjacent icons, badges, buttons, spans, dividers)
  // must be shifted to the right to preserve the DOM gap and prevent horizontal collisions / overlaps.
  for (let i = 0; i < renderedChildren.length - 1; i++) {
    const curr = renderedChildren[i];
    if (!curr.domNode || !curr.figmaNode) continue;
    const currPos = curr.domNode.styles?.position || '';
    if (currPos === 'absolute' || currPos === 'fixed') continue;

    const currDomH = curr.domNode.rect?.height || 16;
    if (currDomH > 60) continue;
    const isCurrSlide = curr.domNode.attributes?.class && /\b(?:swiper-slide|slick-slide|owl-item|splide__slide|carousel-item|embla__slide)\b/i.test(curr.domNode.attributes.class);
    if (isCurrSlide) continue;

    const currDomX = curr.domNode.rect?.x || 0;
    const currDomY = curr.domNode.rect?.y || 0;
    const currDomW = curr.domNode._origDomW || curr.domNode.rect?.offsetWidth || curr.domNode.rect?.width || 0;
    const origCurrDomRight = currDomX + currDomW;

    const currFigmaW = curr.figmaNode.width || 0;
    const currFigmaRight = curr.figmaNode.x + currFigmaW;

    for (let j = i + 1; j < renderedChildren.length; j++) {
      const next = renderedChildren[j];
      if (!next.domNode || !next.figmaNode) continue;
      const nextPos = next.domNode.styles?.position || '';
      if (nextPos === 'absolute' || nextPos === 'fixed') continue;

      const nextDomH = next.domNode.rect?.height || 16;
      if (nextDomH > 60) continue;
      const isNextSlide = next.domNode.attributes?.class && /\b(?:swiper-slide|slick-slide|owl-item|splide__slide|carousel-item|embla__slide)\b/i.test(next.domNode.attributes.class);
      if (isNextSlide) continue;

      const nextDomX = next.domNode.rect?.x || 0;
      const nextDomY = next.domNode.rect?.y || 0;

      const sameRow = Math.abs(nextDomY - currDomY) <= Math.min(16, Math.max(6, currDomH * 0.45));
      const isToRight = nextDomX >= origCurrDomRight - 6;

      const fontSz = parseFloat(curr.domNode.styles?.fontSize || next.domNode.styles?.fontSize || 16);
      const spaceWidth = Math.max(4, Math.round(fontSz * 0.25));
      const domGap = Math.max(0, nextDomX - origCurrDomRight);
      const isCurrInline = curr.domNode.styles?.display === 'inline' || (!curr.domNode.styles?.display && ['SPAN', 'A', 'EM', 'STRONG', 'B', 'I'].includes(curr.domNode.tag)) || (curr.domNode.id && curr.domNode.id.includes('inline-line-frag')) || curr.domNode.nodeType === 3;
      const isNextInline = next.domNode.styles?.display === 'inline' || (!next.domNode.styles?.display && ['SPAN', 'A', 'EM', 'STRONG', 'B', 'I'].includes(next.domNode.tag)) || (next.domNode.id && next.domNode.id.includes('inline-line-frag')) || next.domNode.nodeType === 3;
      const bothInline = isCurrInline && isNextInline;
      const textExpanded = currFigmaW > currDomW + 1;
      const textContracted = bothInline && (currFigmaW < currDomW - 1);

      if (sameRow && isToRight && (textExpanded || textContracted)) {
        const minNextX = currFigmaRight + Math.max(domGap, bothInline ? spaceWidth : 0);
        if (textExpanded && next.figmaNode.x < minNextX) {
          const shiftX = Math.round(minNextX - next.figmaNode.x);
          next.figmaNode.x += shiftX;
          if (next.domNode.rect) {
            next.domNode.rect.x += shiftX;
          }
        } else if (textContracted && next.figmaNode.x > minNextX) {
          const shiftX = Math.round(minNextX - next.figmaNode.x);
          next.figmaNode.x += shiftX;
          if (next.domNode.rect) {
            next.domNode.rect.x += shiftX;
          }
        }
      }
    }
  }

  // Symmetrical Flow Centering for Buttons / Pills / Badges / Center-aligned containers:
  if (renderedChildren.length > 0 && !isPageLevelWrapper) {
    const alignVal = s.textAlign || '';
    const pFlexDir = s.flexDirection || 'row';
    const isFlexCol = pFlexDir.includes('column');
    const isFlexHorizCenter = s.display && s.display.includes('flex') && (
      isFlexCol ? (s.alignItems === 'center') : (s.justifyContent === 'center')
    );
    const isExplicitLeft = alignVal === 'left' || alignVal === 'start';
    const isExplicitRight = alignVal === 'right' || alignVal === 'end';

    // Check if children are positioned on a single horizontal row
    const rowChildren = renderedChildren.filter(c => c.figmaNode && (!c.domNode || (c.domNode.styles?.position !== 'absolute' && c.domNode.styles?.position !== 'fixed')));
    
    // Check DOM symmetry: a button/pill or container should only be centered if its DOM children were actually centered!
    let minDomX = Infinity, maxDomX = -Infinity;
    for (const c of rowChildren) {
      if (c.domNode && c.domNode.rect) {
        minDomX = Math.min(minDomX, c.domNode.rect.x);
        maxDomX = Math.max(maxDomX, c.domNode.rect.x + (c.domNode.rect.width || 0));
      }
    }
    const hasDomRects = isFinite(minDomX) && isFinite(maxDomX) && sNode.rect && sNode.rect.width > 0;
    const domLeftPad = hasDomRects ? (minDomX - sNode.rect.x) : 0;
    const domRightPad = hasDomRects ? ((sNode.rect.x + sNode.rect.width) - maxDomX) : 0;
    const isDomSymmetricCenter = hasDomRects && domLeftPad > 2 && Math.abs(domLeftPad - domRightPad) <= Math.max(6, sNode.rect.width * 0.06);

    const isButtonOrPill = (sNode.tag === 'BUTTON' || (sNode.tag === 'A' && sNode.attributes?.class && /\b(?:btn|button|tag|badge|pill)\b/i.test(sNode.attributes.class)));

    const shouldCenterHoriz = alignVal === 'center' || (!isExplicitLeft && !isExplicitRight && (isFlexHorizCenter || (isButtonOrPill && isDomSymmetricCenter)));

    if (rowChildren.length > 0 && shouldCenterHoriz) {
      let minRowY = Infinity, maxRowY = -Infinity;
      for (const c of rowChildren) {
        const cY = c.domNode?.rect?.y != null ? c.domNode.rect.y : 0;
        const cH = c.domNode?.rect?.height || 0;
        minRowY = Math.min(minRowY, cY);
        maxRowY = Math.max(maxRowY, cY + cH);
      }
      const isSingleRow = (maxRowY - minRowY) <= Math.max(20, (sNode.rect?.height || 60) * 0.7);
      if (isSingleRow) {
        // The group being centered must include the frame's own text nodes (e.g. "Submit" next to an arrow icon),
        // otherwise the icon alone gets centered and lands on top of the text.
        const centerNodes = rowChildren.map(c => c.figmaNode);
        if (frame.children) {
          for (const n of frame.children) {
            if (n && n.type === 'TEXT' && n.visible !== false && !centerNodes.includes(n)) centerNodes.push(n);
          }
        }
        let minX = Infinity, maxX = -Infinity;
        for (const n of centerNodes) {
          minX = Math.min(minX, n.x || 0);
          maxX = Math.max(maxX, (n.x || 0) + (n.width || 0));
        }
        const groupW = maxX - minX;
        if (groupW > 0 && groupW < frame.width) {
          const targetStartX = Math.round((frame.width - groupW) / 2);
          const shiftX = targetStartX - minX;
          if (Math.abs(shiftX) >= 1) {
            for (const n of centerNodes) {
              n.x += shiftX;
            }
          }
        }
      }
    }
  }

  // Expand or hug inline container frames so they fit rendered content without artificial trailing gaps
  if (frame.children && frame.children.length > 0 && !isPageLevelWrapper) {
    const isCardOrSlide = (sNode.rect?.height > 80) || (sNode.attributes?.class && /\b(?:card|slide|col|column|item|box)\b/i.test(sNode.attributes.class));
    const isInlineOrRow = (s.display === 'inline' || s.display === 'inline-flex' || s.display === 'inline-block' || (sNode.rect?.height <= 60 && !isCardOrSlide) || (!s.display && (sNode.tag === 'SPAN' || sNode.tag === 'P' || sNode.tag === 'A')));
    if (isInlineOrRow && !isCarouselSlide && !isCardOrSlide) {
      let maxChildRight = 0;
      for (const c of frame.children) {
        maxChildRight = Math.max(maxChildRight, (c.x || 0) + (c.width || 0));
      }
      const padR = parseFloat(s.paddingRight) || 0;
      const targetW = Math.max(1, Math.round(maxChildRight + padR));
      const isPureInline = s.display === 'inline' || (!s.display && (sNode.tag === 'SPAN' || sNode.tag === 'A'));
      if (maxChildRight > frame.width || (isPureInline && targetW < frame.width)) {
        frame.resize(targetW, frame.height);
        if (sNode.rect) {
          if (!sNode._origDomW) sNode._origDomW = sNode.rect.width || 0;
          sNode.rect.width = targetW;
        }
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
      maskFill = parseLinearGradient(maskGradientStr, s, rectW, rectH);
    } else if (maskGradientStr.includes('radial-gradient')) {
      maskFill = parseRadialGradient(maskGradientStr, rectW, rectH, s);
    } else if (maskGradientStr.includes('conic-gradient')) {
      maskFill = parseAngularGradient(maskGradientStr, rectW, rectH, s);
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
  // Preserve full gradient color integrity and all stops exactly as defined in CSS
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

  const SUPERSCRIPT_MAP = {
    '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074',
    '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
    '+': '\u207A', '-': '\u207B', '=': '\u207C', '(': '\u207D', ')': '\u207E',
    'n': '\u207F', 'i': '\u2071'
  };
  const SUBSCRIPT_MAP = {
    '0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083', '4': '\u2084',
    '5': '\u2085', '6': '\u2086', '7': '\u2087', '8': '\u2088', '9': '\u2089',
    '+': '\u208A', '-': '\u208B', '=': '\u208C', '(': '\u208D', ')': '\u208E'
  };

  const isSup = s.verticalAlign === 'super' || sNode.tag === 'SUP' || parentNode?.tag === 'SUP' ||
                (s.fontFeatureSettings && s.fontFeatureSettings.includes('sups')) ||
                (s.fontVariantPosition === 'super') || (s.fontVariant === 'super');
  const isSub = s.verticalAlign === 'sub' || sNode.tag === 'SUB' || parentNode?.tag === 'SUB' ||
                (s.fontFeatureSettings && s.fontFeatureSettings.includes('subs')) ||
                (s.fontVariantPosition === 'sub') || (s.fontVariant === 'sub');

  if (isSup && /[0-9+\-=()ni]/.test(finalText)) {
    finalText = finalText.replace(/[0-9+\-=()ni]/g, ch => SUPERSCRIPT_MAP[ch] || ch);
  } else if (isSub && /[0-9+\-=()]/.test(finalText)) {
    finalText = finalText.replace(/[0-9+\-=()]/g, ch => SUBSCRIPT_MAP[ch] || ch);
  }

  // Append Unicode Variation Selector-15 (\uFE0E - text presentation) to symbol and arrow characters
  // so text layout engines don't fall back to colorful OS emoji fonts (like Segoe UI Emoji / Apple Color Emoji)
  finalText = finalText.replace(/([\u2190-\u21FF\u25A0-\u27BF\u2B00-\u2BFF])(?!\uFE0E)/g, '$1\uFE0E');
  textNode.characters = finalText;

  let fontSize = parseFloat(s.fontSize) || 16;
  if ((isSup || isSub) && !/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(finalText)) {
    fontSize = Math.max(8, Math.round(fontSize * 0.72));
  }
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

  const isMultiLine = (sNode.lineCount && sNode.lineCount > 1) || (sNode.text && sNode.text.includes('\n')) || (sNode.rect && sNode.rect.height > (parseFloat(s.fontSize) || 16) * 1.4 && sNode.text && sNode.text.length > 25);
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
    const clipBgSrc = (clipStyle.backgroundImage && clipStyle.backgroundImage.includes('gradient')) ? clipStyle.backgroundImage
      : ((clipStyle.background && clipStyle.background.includes('gradient')) ? clipStyle.background : null);
    if (clipBgSrc) {
      const textW = sNode.rect?.width || textNode.width || 100;
      const textH = sNode.rect?.height || textNode.height || 100;
      const bgs = splitByTopLevelCommas(clipBgSrc);
      for (let i = bgs.length - 1; i >= 0; i--) {
        const bg = bgs[i];
        if (bg.includes('linear-gradient')) {
          const grad = parseLinearGradient(bg, clipStyle, textW, textH);
          if (grad) textFills.push(brightenGradientForText(grad, resolvedBgColor));
        } else if (bg.includes('radial-gradient')) {
          const grad = parseRadialGradient(bg, textW, textH, clipStyle);
          if (grad) textFills.push(brightenGradientForText(grad, resolvedBgColor));
        } else if (bg.includes('conic-gradient')) {
          const grad = parseAngularGradient(bg, textW, textH, clipStyle);
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
      textNode.fills = [{ 
        type: 'SOLID', 
        color: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, 
        opacity: clamp01(fillColor.a) 
      }];
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
  if (sNode._isDirectTextNode || (parentFrame && parentFrame.opacity >= 0.999 && (!parentFrame.parent || parentFrame.parent.type === 'PAGE'))) {
    applyOpacity(textNode, s, sNode);
  }

  parentFrame.appendChild(textNode);
  if (sNode.styles?.mixBlendMode && sNode.styles.mixBlendMode !== 'normal') {
    applyBlendMode(textNode, sNode.styles, sNode);
  }

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
    if (availW > w && w <= 1) {
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

    const pFlexDirMulti = parentNode?.styles?.flexDirection || 'row';
    const isFlexColMulti = pFlexDirMulti.includes('column');
    const hasInlineHorizontalSiblingsMulti = !isFlexColMulti && parentNode && (
      parentNode.pseudoElementNodes?.before ||
      parentNode.pseudoElementNodes?.after ||
      (parentNode.childNodes && parentNode.childNodes.length > 1 && parentNode.childNodes.some(sibling => {
        if (sibling === sNode || sibling.id === sNode.id) return false;
        if (!sibling.rect || !sNode.rect) return false;
        const isBlock = (sNode.styles?.display === 'block' || ['H1','H2','H3','H4','H5','H6','P','DIV','SECTION'].includes(sNode.tag)) &&
                        (sibling.styles?.display === 'block' || ['H1','H2','H3','H4','H5','H6','P','DIV','SECTION'].includes(sibling.tag));
        if (isBlock) return false;
        const sibTop = sibling.rect.y || 0;
        const sibBottom = sibTop + (sibling.rect.height || 0);
        const myTop = sNode.rect.y || 0;
        const myBottom = myTop + (sNode.rect.height || 0);
        const overlapY = Math.min(sibBottom, myBottom) - Math.max(sibTop, myTop);
        return overlapY > 4;
      }))
    );
    const hasSiblings = hasInlineHorizontalSiblingsMulti;

    // For center-aligned multiline text: span parentFrame's content width and anchor at paddingLeft (x=pl)
    // if w spans the container, otherwise span w at posX.
    // In Figma, setting textAlignHorizontal = 'CENTER' with this width ensures every line centers perfectly.
    if (alignVal === 'center') {
      try { textNode.textAlignHorizontal = 'CENTER'; } catch {}
      let pl = parentNode?.styles?.paddingLeft ? (parseFloat(parentNode.styles.paddingLeft) || 0) : 0;
      let pr = parentNode?.styles?.paddingRight ? (parseFloat(parentNode.styles.paddingRight) || 0) : 0;
      let layoutW = Math.max(1, Math.ceil(w));
      let targetX = posX;
      const parentDomW = parentNode?.rect?.width || parentFrame?.width || 0;
      const isSliderOrMarquee = parentFrame && (parentFrame.width > (parentDomW || w) * 1.5);
      if (!isSliderOrMarquee && parentFrame && (Math.abs(parentFrame.width - w) <= 16 || !hasSiblings || Math.abs(parentDomW - w) <= 16 || sNode._isDirectTextNode)) {
        let fullW = Math.max(1, Math.round(parentFrame.width - pl - pr));
        layoutW = fullW;
        targetX = pl;
      }
      try {
        textNode.resize(layoutW, Math.max(1, Math.ceil(h)));
        textNode.x = targetX;
        textNode.y = posY;
      } catch {
        textNode.x = posX;
        textNode.y = posY;
      }
    } else if (alignVal === 'right' || alignVal === 'end') {
      try { textNode.textAlignHorizontal = 'RIGHT'; } catch {}
      let pl = parentNode?.styles?.paddingLeft ? (parseFloat(parentNode.styles.paddingLeft) || 0) : 0;
      let pr = parentNode?.styles?.paddingRight ? (parseFloat(parentNode.styles.paddingRight) || 0) : 0;
      let layoutW = Math.max(1, Math.ceil(w));
      let targetX = posX;
      const parentDomW = parentNode?.rect?.width || parentFrame?.width || 0;
      const isSliderOrMarquee = parentFrame && (parentFrame.width > (parentDomW || w) * 1.5);
      if (!isSliderOrMarquee && parentFrame && (Math.abs(parentFrame.width - w) <= 16 || !hasSiblings || Math.abs(parentDomW - w) <= 16)) {
        let fullW = Math.max(1, Math.round(parentFrame.width - pl - pr));
        layoutW = fullW;
        targetX = pl;
      }
      try {
        textNode.resize(layoutW, Math.max(1, Math.ceil(h)));
        textNode.x = targetX;
        textNode.y = posY;
      } catch {
        textNode.x = posX;
        textNode.y = posY;
      }
    } else {
      let layoutW = Math.max(1, Math.ceil(w)) + 6;
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
      if (parentFrame.clipsContent && parentFrame.height <= 1) {
        textNode.visible = false;
      } else {
        const requiredH = Math.round(textNode.y + textNode.height);
        if (requiredH > parentFrame.height) {
          try {
            parentFrame.resize(Math.max(parentFrame.width, textNode.width), requiredH);
          } catch {}
        }
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
      // 2. CSS Flexbox / Grid centering (justify-content: center for row, align-items: center for column)
      // 3. Symmetrically padded button / pill / tag container in DOM
      const parentDomW = parentNode?.rect?.width || parentFrame?.width || 0;
      const domLeftPad = (sNode.rect?.x || 0) - (parentNode?.rect?.x != null ? parentNode.rect.x : (parentFrame.x || 0));
      const domRightPad = parentDomW - domLeftPad - w;
      const isDomSymmetricCenter = parentDomW > 0 && Math.abs(domLeftPad - domRightPad) <= 4 && domLeftPad > 4;
      const pFlexDir = parentNode?.styles?.flexDirection || 'row';
      const isFlexCol = pFlexDir.includes('column');
      const isFlexCenter = isFlexCol 
        ? (parentNode?.styles?.alignItems === 'center')
        : (parentNode?.styles?.justifyContent === 'center');

      const isExplicitLeft = alignVal === 'left' || alignVal === 'start';
      const isExplicitRight = alignVal === 'right' || alignVal === 'end';

      const hasInlineHorizontalSiblings = !isFlexCol && parentNode && (
        parentNode.pseudoElementNodes?.before ||
        parentNode.pseudoElementNodes?.after ||
        (parentNode.childNodes && parentNode.childNodes.length > 1 && parentNode.childNodes.some(sibling => {
          if (sibling === sNode || sibling.id === sNode.id) return false;
          if (!sibling.rect || !sNode.rect) return false;
          const isBlock = (sNode.styles?.display === 'block' || ['H1','H2','H3','H4','H5','H6','P','DIV','SECTION'].includes(sNode.tag)) &&
                          (sibling.styles?.display === 'block' || ['H1','H2','H3','H4','H5','H6','P','DIV','SECTION'].includes(sibling.tag));
          if (isBlock) return false;
          const sibTop = sibling.rect.y || 0;
          const sibBottom = sibTop + (sibling.rect.height || 0);
          const myTop = sNode.rect.y || 0;
          const myBottom = myTop + (sNode.rect.height || 0);
          const overlapY = Math.min(sibBottom, myBottom) - Math.max(sibTop, myTop);
          return overlapY > 4;
        }))
      );
      const hasSiblings = hasInlineHorizontalSiblings;

      if (alignVal === 'center') {
        try { textNode.textAlignHorizontal = 'CENTER'; } catch {}
        const isSliderOrMarquee = parentFrame && (parentFrame.width > (parentDomW || w) * 1.5);
        if (hasInlineHorizontalSiblings) {
          // Text shares its line with inline siblings (icon, link...): keep its DOM position, adjusting for font metric differences
          if (sNode.contentRect && parentX != null) {
            textNode.x = Math.round((sNode.contentRect.x - parentX) + ((sNode.contentRect.width - figmaW) / 2));
          } else {
            textNode.x = posX + Math.round((w - figmaW) / 2);
          }
        } else if (sNode.contentRect && parentX != null && Math.abs(sNode.contentRect.x - parentX) > 1) {
          // Direct text node or element with explicit contentRect from DOM Range
          textNode.x = Math.round((sNode.contentRect.x - parentX) + ((sNode.contentRect.width - figmaW) / 2));
        } else if (!isSliderOrMarquee && parentFrame && parentFrame.width > figmaW && (Math.abs(parentDomW - w) <= 8 || isFlexCenter || isDomSymmetricCenter || Math.abs(parentFrame.width - w) <= 8 || sNode._isDirectTextNode)) {
          textNode.x = Math.round((parentFrame.width - figmaW) / 2);
        } else if (w > 0) {
          textNode.x = posX + Math.round((w - figmaW) / 2);
        } else {
          textNode.x = posX;
        }
      } else if (isExplicitRight) {
        try { textNode.textAlignHorizontal = 'RIGHT'; } catch {}
        if (hasInlineHorizontalSiblings) {
          textNode.x = posX + w - figmaW;
        } else if (parentFrame && parentFrame.width > figmaW && (Math.abs(parentDomW - w) <= 8 || Math.abs(parentFrame.width - w) <= 8 || domLeftPad > 10 || sNode._isDirectTextNode)) {
          textNode.x = parentFrame.width - figmaW;
        } else if (w > 0) {
          textNode.x = posX + w - figmaW;
        } else {
          textNode.x = posX;
        }
      } else if (!isExplicitLeft && !isExplicitRight && (isFlexCenter || isDomSymmetricCenter) && !hasInlineHorizontalSiblings) {
        try { textNode.textAlignHorizontal = 'CENTER'; } catch {}
        if (!isSliderOrMarquee && parentFrame && parentFrame.width > figmaW) {
          textNode.x = Math.round((parentFrame.width - figmaW) / 2);
        } else {
          textNode.x = posX + Math.round((w - figmaW) / 2);
        }
      } else {
        textNode.x = posX;
      }

      // Vertical Alignment:
      const parentDomH = parentNode?.rect?.height || parentFrame?.height || 0;
      const domTopPad = (sNode.rect?.y || 0) - (parentNode?.rect?.y != null ? parentNode.rect.y : (parentFrame.y || 0));
      const domBottomPad = parentDomH - domTopPad - h;
      const isDomSymmetricVert = parentDomH > 0 && Math.abs(domTopPad - domBottomPad) <= 4;
      const isFlexVertCenter = isFlexCol 
        ? ((parentNode?.styles?.justifyContent === 'center') || (parentFrame?.styles?.justifyContent === 'center'))
        : ((parentNode?.styles?.alignItems === 'center') || (parentFrame?.styles?.alignItems === 'center'));
      const isButtonOrPill = parentNode && (
        parentNode.tag === 'BUTTON' || (parentNode.tag === 'A' && parentNode.attributes?.class && /\b(?:btn|button|tag|badge|pill)\b/i.test(parentNode.attributes.class))
      );

      if (isSup) {
        textNode.y = posY;
      } else if (isSub) {
        textNode.y = posY + Math.round(h * 0.3);
      } else if (parentFrame && parentDomH > 0 && (isFlexVertCenter || isDomSymmetricVert || isButtonOrPill) && !isFlexCol && !hasSiblings) {
        textNode.y = Math.round((parentFrame.height - figmaH) / 2);
      } else {
        const domCenterY = posY + (h / 2);
        textNode.y = Math.round(domCenterY - (figmaH / 2));
      }
      if (posY >= 0 && textNode.y < 0) {
        textNode.y = 0;
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
      const isExcluded = /\b(?:icon|icon-box|feature|box|item|card|modal|table|post|accordion|comment|widget|drawer|checkout|graphic|demo|mockup|preview|device|window)-header\b/i.test(name) ||
        /\b(?:checkout|graphic|demo|mockup|preview|device)\b/i.test(name);
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
      const navAbsX = navNode.absoluteTransform ? navNode.absoluteTransform[0][2] : (navNode.x || 0);
      const navAbsY = navNode.absoluteTransform ? navNode.absoluteTransform[1][2] : (navNode.y || 0);
      const rootAbsX = rootFrame.absoluteTransform ? rootFrame.absoluteTransform[0][2] : (rootFrame.x || 0);
      const rootAbsY = rootFrame.absoluteTransform ? rootFrame.absoluteTransform[1][2] : (rootFrame.y || 0);

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
  lastYieldTime = Date.now();
  totalNodes = countNodes(data.root);
  renderedNodes = 0;

  const rootFrame = figma.createFrame();
  rootFrame.name = data.documentTitle || 'HTML To Perfect Figma Import';

  // Use the exact rendered content width (data.root.rect.width or clientWidth).
  // Never allow documentRect.width to exceed viewport width, which creates a huge white void on the right.
  const contentW = data.root?.rect?.width && data.root.rect.width > 200 ? Math.round(data.root.rect.width) : null;
  const viewportW = data.viewportRect?.width ? Math.round(data.viewportRect.width) : 1440;
  const docW = data.documentRect?.width ? Math.round(data.documentRect.width) : viewportW;
  
  let dw = Math.max(10, Math.round(contentW || Math.min(docW, viewportW) || 1440));
  const dh = Math.max(10, Math.round(data.documentRect?.height || data.viewportRect?.height || 900));
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

  figma.ui.postMessage({
    type: 'progress',
    percent: 10,
    label: 'Painting.....'
  });

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
    const total = rootChildren.length;
    let count = 0;
    for (const child of rootChildren) {
      count++;
      figma.ui.postMessage({
        type: 'progress',
        percent: Math.min(95, Math.round(10 + (count / total) * 85)),
        label: 'Painting.....'
      });
      await renderNode(child, rootFrame, 0, 0, data.assets, data.root.styles);
    }
  } else if (data.root) {
    figma.ui.postMessage({
      type: 'progress',
      percent: 50,
      label: 'Painting.....'
    });
    await renderNode(data.root, rootFrame, 0, 0, data.assets, data.root.styles);
  }

  // Ensure root frame width exactly matches the rendered content width (or trimmed viewport), never leaving trailing whitespace
  const targetW = contentW || (data.viewportRect?.width ? Math.min(dw, Math.round(data.viewportRect.width) - 16) : (dw > 16 ? dw - 16 : dw));
  if (targetW > 100 && rootFrame.width !== targetW) {
    rootFrame.resize(targetW, rootFrame.height);
  }

  // Cut & Paste all Navbars to the absolute top layer of rootFrame
  try { cutAndPasteNavbarsToTop(rootFrame); } catch (e) {}

  figma.currentPage.selection = [rootFrame];
  figma.viewport.scrollAndZoomIntoView([rootFrame]);

  figma.ui.postMessage({
    type: 'complete',
    duration: Date.now() - startTime
  });
}

figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) return;

  if ("detach_text_nodes" === msg.type) {
    const sel = figma.currentPage.selection;
    if (!sel || sel.length === 0) {
      figma.notify("Please select a frame or group first.", { error: true });
      return;
    }

    let detachedTotal = 0;
    const newSelection = [];

    for (const node of sel) {
      if (!("clone" in node)) continue;

      const parent = node.parent || figma.currentPage;
      const copy = node.clone();
      parent.appendChild(copy);
      copy.x = node.x + node.width + 50;
      copy.y = node.y;
      copy.name = node.name + " (Text Detached)";

      if ("clipsContent" in copy) {
        copy.clipsContent = ("clipsContent" in node && node.clipsContent !== undefined) ? node.clipsContent : true;
      }

      const textNodes = [];
      function findTexts(n) {
        if (n.type === "TEXT") {
          textNodes.push(n);
          return;
        }
        if ("children" in n) {
          for (const child of n.children) {
            findTexts(child);
          }
        }
      }
      findTexts(copy);

      const copyAbsX = copy.absoluteTransform[0][2];
      const copyAbsY = copy.absoluteTransform[1][2];

      for (const t of textNodes) {
        // Check if this text node was clipped/hidden by an ancestor frame with clipsContent
        let isClippedByAncestor = false;
        let anc = t.parent;
        while (anc && anc !== copy) {
          if ("clipsContent" in anc && anc.clipsContent) {
            const aX = anc.absoluteTransform[0][2];
            const aY = anc.absoluteTransform[1][2];
            const tX = t.absoluteTransform[0][2];
            const tY = t.absoluteTransform[1][2];
            if (
              tX + t.width <= aX + 1 ||
              tX >= aX + anc.width - 1 ||
              tY + t.height <= aY + 1 ||
              tY >= aY + anc.height - 1
            ) {
              isClippedByAncestor = true;
              break;
            }
          }
          anc = anc.parent;
        }

        const absTransform = t.absoluteTransform;
        const absX = absTransform[0][2];
        const absY = absTransform[1][2];

        // Position relative to copy frame
        const relX = absX - copyAbsX;
        const relY = absY - copyAbsY;

        // Reparent t directly into copy frame (keeping it strictly INSIDE the frame!)
        copy.appendChild(t);

        // Preserve exact transform and rotation
        t.relativeTransform = [
          [absTransform[0][0], absTransform[0][1], relX],
          [absTransform[1][0], absTransform[1][1], relY]
        ];

        // If it was clipped by an ancestor (like an offscreen carousel slide) or is out of bounds,
        // mark it as invisible so it doesn't spill out onto the canvas or overlap content
        if (
          isClippedByAncestor ||
          relX >= copy.width - 1 ||
          relX + t.width <= 1 ||
          relY >= copy.height - 1 ||
          relY + t.height <= 1
        ) {
          t.visible = false;
        }
      }

      detachedTotal += textNodes.length;
      newSelection.push(copy);
    }

    if (newSelection.length > 0) {
      figma.currentPage.selection = newSelection;
      figma.viewport.scrollAndZoomIntoView(newSelection);
      figma.notify(`Detached ${detachedTotal} text node${detachedTotal === 1 ? '' : 's'} successfully!`, { timeout: 2500 });
    } else {
      figma.notify("Selected items could not be cloned or processed.", { error: true });
    }
    return;
  }

  if("lorem_ipsum_replace"===msg.type){const W="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum perspiciatis unde omnis iste natus error voluptatem accusantium doloremque laudantium totam rem aperiam eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta explicabo nemo ipsam quia aspernatur aut odit fugit consequuntur magni dolores eos ratione sequi nesciunt neque porro quisquam numquam eius modi tempora incidunt quaerat voluptatem minima nostrum exercitationem ullam corporis suscipit laboriosam aliquid commodi autem vel eum iure quam nihil molestiae illum dolorem fuga harum quidem rerum facilis expedita distinctio nam libero tempore soluta nobis eligendi optio cumque impedit quo minus quod maxime placeat facere possimus assumenda repellendus temporibus quibusdam officiis debitis necessitatibus saepe eveniet voluptates repudiandae recusandae itaque earum hic tenetur sapiente delectus reiciendis voluptatibus maiores alias perferendis doloribus asperiores repellat".split(" "),B={};W.forEach(w=>{(B[w.length]=B[w.length]||[]).push(w)});let last="";const pick=n=>{const a=B[n];if(a&&a.length){let w,i=0;do{w=a[Math.floor(Math.random()*a.length)]}while(w===last&&a.length>1&&++i<8);return w}if(n<=0)return"";if(n===1)return"aeiou"[Math.floor(Math.random()*5)];const k=Math.min(n-1,14);let s=pick(k);return n-k>0?(s+pick(n-k)).slice(0,n):s},word=(n,s)=>{let w=pick(n);last=w;return s===2?w.toUpperCase():s===1?w[0].toUpperCase()+w.slice(1):w},ipsum=t=>t.replace(/[A-Za-z\u00C0-\u024F]+/g,m=>{const up=m===m.toUpperCase()&&m.length>1?2:m[0]===m[0].toUpperCase()&&m[0]!==m[0].toLowerCase()?1:0;return word(m.length,up)}),sel=figma.currentPage.selection,roots=sel.length>0?sel:[figma.currentPage];try{await Promise.all(roots.map(function t(r){if("TEXT"===r.type){const c=r.characters;if(!/[A-Za-z\u00C0-\u024F]/.test(c))return Promise.resolve();const n=ipsum(c);try{const f=r.getRangeAllFontNames(0,c.length);return Promise.all(f.map(x=>figma.loadFontAsync(x))).then(()=>{r.characters=n})}catch(x){return Promise.resolve()}}return"children"in r?Promise.all(Array.from(r.children).map(t)):Promise.resolve()})),figma.notify("Text Ipsumed!",{timeout:2e3})}catch(x){figma.notify("Error replacing text: "+x.message,{error:!0})}return}

  if (msg.type === 'switch_to_assets_diary') {
    currentPluginView = 'assets_diary';
    figma.showUI(ASSETS_DIARY_HTML, { width: 400, height: 750, themeColors: true });
    try {
      await initAssetsDiarySession();
    } catch (e) {
      console.error('[Assets Diary init error]', e);
    }
    return;
  }

  if (msg.type === 'switch_to_html2fig') {
    currentPluginView = 'html2fig';
    figma.showUI(__html__, { width: 380, height: 726, themeColors: true });
    checkLicenseAndUsage().then((info) => {
      figma.ui.postMessage({ type: 'license_info', ...info });
    }).catch(() => {
      figma.ui.postMessage({ type: 'license_info', isPro: false, freeUsed: 0, maxFree: MAX_FREE_EXPORTS });
    });
    return;
  }

  if (msg.type === 'import' && msg.data) {
    const { isPro, freeUsed } = await checkLicenseAndUsage();
    if (!isPro && freeUsed >= MAX_FREE_EXPORTS) {
      figma.ui.postMessage({
        type: 'limit_reached',
        freeUsed,
        maxFree: MAX_FREE_EXPORTS,
        message: 'Free export limit reached (8 of 8 used). Please activate a PRO license for lifetime access.'
      });
      return;
    }

    try {
      await renderTree(msg.data);
      if (!isPro) {
        const newCount = freeUsed + 1;
        await figma.clientStorage.setAsync('free_exports_count', newCount);
        figma.ui.postMessage({
          type: 'usage_update',
          freeUsed: newCount,
          maxFree: MAX_FREE_EXPORTS
        });
      }
    } catch (e) {
      figma.ui.postMessage({ type: 'error', message: e.message || String(e) });
    }
  } else if (msg.type === 'save_license') {
    await figma.clientStorage.setAsync('gumroad_license', {
      key: msg.key,
      email: msg.email || '',
      activatedAt: Date.now()
    }).catch(() => {});
    const info = await checkLicenseAndUsage();
    figma.ui.postMessage({ type: 'license_info', ...info });
  } else if (msg.type === 'clear_license') {
    await figma.clientStorage.deleteAsync('gumroad_license').catch(() => {});
    const info = await checkLicenseAndUsage();
    figma.ui.postMessage({ type: 'license_info', ...info });
    } else if (msg.type === 'resize') {
    figma.ui.resize(msg.width || 380, msg.height || 632);
  } else {
    try {
      await handleAssetsDiaryMessage(msg);
    } catch (err) {
      console.error('[Assets Diary Error]', err);
    }
  }
};

// ============================================================================
// ==================== ASSETS DIARY INTEGRATED MODULE ========================
// ============================================================================

const ASSETS_DIARY_HTML = "<!DOCTYPE html>\r\n<html lang=\"en\">\r\n<head>\r\n<meta charset=\"utf-8\">\r\n<style>\r\n*{box-sizing:border-box;margin:0;padding:0;border-radius:5px!important}\r\nbody{font-family:-apple-system,'Inter',sans-serif;background:#F8FAFC;color:#0F172A;font-size:12px;line-height:1.5;overflow-x:hidden;padding:0 20px}\r\n::-webkit-scrollbar{width:4px}\r\n::-webkit-scrollbar-track{background:#F1F5F9}\r\n::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:5px}\r\n\r\n/* ── Header ── */\r\n.header{background:#FFFFFF;padding:14px 20px 12px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:20;box-shadow:0 1px 3px rgba(0,0,0,0.02);margin:0 -20px}\r\n.header-badge{width:32px;height:32px;border-radius:5px!important;background:linear-gradient(135deg,#6366F1,#8B5CF6);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;box-shadow:0 2px 6px rgba(99,102,241,0.2)}\r\n.header h1{font-size:13px;font-weight:700;color:#0F172A}\r\n.header p{font-size:10px;color:#64748B}\r\n.header-breadcrumb{font-size:10px;color:#64748B;font-weight:500}\r\n\r\n/* ── Content ── */\r\n.content{padding:14px 0 88px}\r\n.intro-copy{font-size:11px;color:#475569;line-height:1.55;margin:0 0 16px;padding:10px 32px 10px 12px;background:#FFFFFF;border:1px solid #E2E8F0;border-left:3px solid #6366F1;border-radius:6px;position:relative;opacity:1;transform:translateY(0);transition:opacity 0.4s ease, transform 0.4s ease;box-shadow:0 1px 3px rgba(0,0,0,0.03)}\r\n.intro-copy-close{position:absolute;top:5px;right:5px;width:20px;height:20px;padding:0;border:0;background:transparent;color:#94A3B8;font-size:17px;line-height:20px;cursor:pointer}\r\n.intro-copy-close:hover{color:#475569;background:#F1F5F9}\r\n.section{margin-bottom:18px}\r\n.section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748B;margin-bottom:9px}\r\n\r\n/* ── Folder/Style Cards ── */\r\n.cards-grid{display:grid;grid-template-columns:repeat(1,1fr);gap:10px}\r\n.card{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:5px!important;padding:12px;cursor:pointer;transition:all .15s ease;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.03)}\r\n.card:hover{border-color:#6366F1;background:#FFFFFF;box-shadow:0 4px 12px rgba(99,102,241,0.08), 0 2px 4px rgba(0,0,0,0.02)}\r\n.card.active{border-color:#4F46E5;background:#F8FAFC;box-shadow:0 0 0 2px rgba(79,70,229,0.15)}\r\n.card.archived{opacity:0.6;filter:grayscale(20%);border-style:dashed}\r\n.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}\r\n.card-title{font-size:12.5px;font-weight:700;color:#000000!important;flex:1}\r\n.card-meta{font-size:10px;color:#64748B;margin-top:2px;font-weight:500}\r\n.card-actions{display:flex;gap:4px}\r\n.card-btn{background:#F8FAFC;border:1px solid #CBD5E1;border-radius:5px!important;color:#334155;font-size:10px;font-weight:600;padding:7px 9px;cursor:pointer;transition:all .12s ease}\r\n.card-btn:hover{border-color:#6366F1;color:#4F46E5;background:#FFFFFF}\r\n.icon-edit-btn{background:transparent;border:none;color:#64748B;padding:7px 4px;border-radius:5px!important;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .15s ease;flex-shrink:0}\r\n.icon-edit-btn:hover{color:#4F46E5;background:rgba(99,102,241,0.1)}\r\n.btn-back{display:inline-flex;align-items:center;gap:6px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:5px!important;color:#4F46E5;font-size:11px;font-weight:700;padding:5px 11px;cursor:pointer;transition:all .15s ease;box-shadow:0 1px 2px rgba(99,102,241,0.06)}\r\n.btn-back[style*=\"display: block\"]{display:inline-flex!important}\r\n.btn-back:hover{background:#6366F1;color:#FFFFFF;border-color:#6366F1;box-shadow:0 2px 8px rgba(99,102,241,0.25);transform:translateY(-1px)}\r\n.btn-back:active{transform:translateY(0)}\r\n.preview-box{border-radius:5px!important;margin-bottom:10px;overflow:hidden;position:relative;aspect-ratio:2/1;height:auto;background:#D5D7DD;border:1px solid #E2E8F0;cursor:zoom-in}\r\n.preview-box .thumb{width:100%;height:100%;display:block;object-fit:contain;pointer-events:none;background:transparent;transition:transform 0.25s cubic-bezier(0.25,1,0.5,1),transform-origin 0.05s ease-out;transform-origin:center center}\r\n.preview-box:hover .thumb{transform:scale(2.5)}\r\n\r\n/* ── Inputs ── */\r\n.field{margin-bottom:10px}\r\nlabel.field-label{display:block;font-size:10px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em}\r\ninput[type=\"text\"], input[type=\"password\"], select{width:100%;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:5px!important;color:#0F172A;font-family:inherit;font-size:12px;padding:9px 12px;outline:none;transition:all .15s ease;box-shadow:0 1px 2px rgba(0,0,0,0.02)}\r\ninput[type=\"text\"]:focus, input[type=\"password\"]:focus, select:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,0.15)}\r\ninput.input-error{border-color:#EF4444;box-shadow:0 0 0 3px rgba(239,68,68,0.15)}\r\n\r\n/* ── Divider ── */\r\nhr{border:none;border-top:1px solid #E2E8F0;margin:18px 0}\r\n\r\n/* ── Buttons ── */\r\n.btn-primary{background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#FFFFFF;border:none;border-radius:5px!important;font-family:inherit;font-size:12px;font-weight:700;padding:10px 16px;cursor:pointer;transition:all .15s ease;letter-spacing:.01em;box-shadow:0 2px 6px rgba(99,102,241,0.2)}\r\n.btn-primary:hover{opacity:.93;box-shadow:0 4px 12px rgba(99,102,241,0.3)}\r\n.btn-primary:active{transform:scale(.98)}\r\n.btn-primary:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}\r\n.btn-primary.btn-secondary{background:#FFFFFF;border:1px solid #CBD5E1;color:#334155;box-shadow:0 1px 2px rgba(0,0,0,0.03)}\r\n.btn-primary.btn-secondary:hover{border-color:#6366F1;color:#4F46E5;background:#F8FAFC}\r\n\r\n/* ── Bottom Bar ── */\r\n.bottom-bar{position:fixed;bottom:0;left:0;right:0;padding:12px 20px 16px;background:linear-gradient(to top,#F8FAFC 80%,rgba(248,250,252,0));z-index:30}\r\n.status{text-align:center;font-size:11px;min-height:18px;margin-top:6px;font-weight:600}\r\n.status.ok{color:#059669}\r\n.status.err{color:#DC2626}\r\n\r\n/* ── Modal ── */\r\n.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.4);backdrop-filter:blur(2px);z-index:100;align-items:center;justify-content:center}\r\n.modal-overlay.active{display:flex}\r\n.modal{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:5px!important;padding:22px;max-width:400px;width:90%;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)}\r\n.modal-title{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:10px}\r\n.modal-message{font-size:11.5px;color:#475569;margin-bottom:16px;line-height:1.6}\r\n.modal-buttons{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}\r\n.modal-btn{border:1px solid #CBD5E1;border-radius:5px!important;padding:8px 14px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s ease}\r\n.modal-btn.cancel{color:#475569;background:#F8FAFC}\r\n.modal-btn.cancel:hover{border-color:#6366F1;color:#4F46E5;background:#FFFFFF}\r\n.modal-btn.danger{color:#DC2626;background:#FEF2F2;border-color:#FCA5A5}\r\n.modal-btn.danger:hover{background:#FEE2E2;border-color:#EF4444}\r\n.modal-btn.primary{color:#FFFFFF;background:#6366F1;border-color:#6366F1;box-shadow:0 2px 4px rgba(99,102,241,0.2)}\r\n.modal-btn.primary:hover{background:#4F46E5}\r\n.modal-btn:disabled{opacity:0.5!important;cursor:not-allowed!important;pointer-events:none!important}\r\n\r\n/* ── Pro Upgrade Header Pill Button ── */\r\n.btn-pro-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;font-size:11px;font-weight:700;border-radius:6px;color:#4F46E5;background:linear-gradient(135deg,rgba(99,102,241,0.08) 0%,rgba(139,92,246,0.12) 100%);border:1px solid rgba(99,102,241,0.28);box-shadow:0 1px 2px rgba(99,102,241,0.08),inset 0 1px 0 rgba(255,255,255,0.7);cursor:pointer;transition:all .18s cubic-bezier(0.16,1,0.3,1);letter-spacing:-0.01em}\r\n.btn-pro-pill:hover{background:linear-gradient(135deg,rgba(99,102,241,0.16) 0%,rgba(139,92,246,0.22) 100%);border-color:rgba(99,102,241,0.45);box-shadow:0 2px 8px rgba(99,102,241,0.22);transform:translateY(-0.5px);color:#4338CA}\r\n.btn-pro-pill:active{transform:translateY(0)}\r\n\r\n/* ── Pro Active Header Badge (Obsidian Luxury Pill) ── */\r\n.badge-pro-active{display:inline-flex;align-items:center;gap:4.5px;padding:3.5px 9px;font-size:10px;font-weight:800;letter-spacing:0.08em;border-radius:9999px;background:#0F172A;color:#FFFFFF;border:1px solid rgba(255,255,255,0.18);box-shadow:0 1px 3px rgba(15,23,42,0.18),inset 0 1px 0 rgba(255,255,255,0.18);cursor:pointer;transition:all .16s cubic-bezier(0.16,1,0.3,1);user-select:none}\r\n.badge-pro-active:hover{background:#1E293B;border-color:rgba(255,255,255,0.3);box-shadow:0 2px 8px rgba(15,23,42,0.25),inset 0 1px 0 rgba(255,255,255,0.28);transform:translateY(-0.5px)}\r\n.badge-pro-active:active{transform:translateY(0)}\r\n\r\n/* ── Views ── */\r\n.view{display:none}\r\n.view.active{display:block}\r\n\r\n/* ── Universal Toast Notification System ── */\r\n.global-toast{position:fixed;top:12px;left:50%;transform:translateX(-50%) translateY(-60px);max-width:360px;width:calc(100% - 32px);padding:10px 14px;border-radius:8px!important;font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 10px 25px rgba(15,23,42,0.18),0 2px 6px rgba(15,23,42,0.08);z-index:999999;opacity:0;pointer-events:none;transition:all 0.28s cubic-bezier(0.16,1,0.3,1)}\r\n.global-toast.active{transform:translateX(-50%) translateY(0);opacity:1;pointer-events:auto}\r\n.global-toast.success{background:#064E3B;color:#ECFDF5;border:1px solid rgba(52,211,153,0.35)}\r\n.global-toast.error{background:#7F1D1D;color:#FEF2F2;border:1px solid rgba(248,113,113,0.35)}\r\n.global-toast.warning{background:#78350F;color:#FFFBEB;border:1px solid rgba(251,191,36,0.35)}\r\n.global-toast.info{background:#1E1B4B;color:#EEF2FF;border:1px solid rgba(129,140,248,0.35)}\r\n</style>\r\n</head>\r\n<body>\n\n<div class=\"h2f-top-bar\" id=\"h2fTopBar\" style=\"background:#0a0d14;padding:9px 16px;display:flex;align-items:center;justify-content:space-between;margin:0 -20px 0 -20px;border-bottom:1px solid rgba(255,255,255,0.12);position:sticky;top:0;z-index:999999;box-shadow:0 2px 10px rgba(0,0,0,0.5);\">\n  <button id=\"btnBackToHtml2Fig\" type=\"button\" style=\"background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;border:none;border-radius:6px;padding:6px 13px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px;cursor:pointer;box-shadow:0 2px 8px rgba(79,70,229,0.35);transition:all 0.15s ease;\" onmouseover=\"this.style.filter='brightness(1.15)';this.style.transform='translateY(-1px)'\" onmouseout=\"this.style.filter='none';this.style.transform='none'\">\n    <svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n      <line x1=\"19\" y1=\"12\" x2=\"5\" y2=\"12\"></line>\n      <polyline points=\"12 19 5 12 12 5\"></polyline>\n    </svg>\n    Back to HTML to Figma\n  </button>\n  <span style=\"font-size:10.5px;color:#a5b4fc;font-weight:700;letter-spacing:0.3px;\">HTML ➔ Figma Perfect</span>\n</div>\n\r\n<!-- Universal Floating Toast Banner -->\r\n<div id=\"globalToast\" class=\"global-toast\">\r\n  <span id=\"globalToastIcon\" style=\"font-size:13px;flex-shrink:0\">✓</span>\r\n  <span id=\"globalToastText\" style=\"flex:1;line-height:1.4\"></span>\r\n</div>\r\n\r\n<!--\r\n  UI Structure (quick guide)\r\n  - Header: breadcrumb and back button\r\n  - Views: `#folderListView` and `#folderDetailView`\r\n  - Modals: `#confirmModal`\r\n  - Script: state, view navigation, UI updates, modals, API comms, utilities, init\r\n  Edit tips: change labels in the HTML blocks below; tweak default preview/generate options in `DEFAULT_PREVIEW_CONFIG` in the script.\r\n-->\r\n\r\n<!-- License Key Validation Screen Overlay -->\r\n<div id=\"licenseLockScreen\" style=\"display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:#F8FAFC;z-index:9999;align-items:center;justify-content:center;padding:24px\">\r\n  <div style=\"background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px!important;padding:28px 24px;width:100%;max-width:360px;text-align:center;box-shadow:0 12px 32px rgba(0,0,0,0.06)\">\r\n    <div style=\"width:48px;height:48px;border-radius:24px!important;background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#4F46E5\">\r\n      <svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#4F46E5\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n        <path d=\"M21 2l-2 2m-1.5 1.5L16 7l-3-3L4 13l-2 7 7-2 9-9-3-3z\"></path>\r\n        <circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"#4F46E5\"></circle>\r\n      </svg>\r\n    </div>\r\n    <h2 style=\"font-size:16px;font-weight:700;color:#0F172A;margin-bottom:8px\">Activate Assets Diary</h2>\r\n    <p style=\"font-size:11px;color:#475569;line-height:1.6;margin-bottom:20px\">Please enter your Gumroad license key below to unlock all premium features.</p>\r\n    \r\n    <div style=\"margin-bottom:16px;text-align:left\">\r\n      <label style=\"display:block;font-size:9px;font-weight:700;color:#64748B;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em\">License Key</label>\r\n      <input type=\"text\" id=\"licenseKeyInput\" placeholder=\"XXXXXX-XXXXXX-XXXXXX-XXXXXX\" style=\"width:100%;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;font-size:12px;padding:10px 12px;outline:none\" />\r\n    </div>\r\n    \r\n    <button onclick=\"activateLicenseKey()\" id=\"activateBtn\" style=\"width:100%;background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;padding:12px;cursor:pointer;margin-bottom:16px;transition:opacity 0.2s\">Activate License</button>\r\n    \r\n    <div id=\"licenseStatus\" style=\"font-size:11px;min-height:16px;margin-bottom:16px\"></div>\r\n    \r\n    <div style=\"font-size:11px;color:#64748B\">\r\n      Don't have a license? <a href=\"https://gumroad.com\" target=\"_blank\" id=\"gumroadLink\" style=\"color:#4F46E5;text-decoration:none;font-weight:600\">Purchase one on Gumroad</a>\r\n    </div>\r\n  </div>\r\n</div>\r\n\r\n<!-- Pro Upgrade / Paywall Modal -->\r\n<div id=\"proPaywallModal\" class=\"modal-overlay\">\r\n  <div class=\"modal\" style=\"max-width:380px;width:calc(100% - 24px);padding:22px;text-align:left;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px!important;box-shadow:0 25px 50px -12px rgba(15,23,42,0.22), 0 0 0 1px rgba(99,102,241,0.08);position:relative;overflow:hidden\">\r\n    <!-- Top Accent Gradient Line -->\r\n    <div style=\"position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#6366F1,#8B5CF6,#EC4899)\"></div>\r\n\r\n    <!-- Header with Bespoke Vector Icon Badge -->\r\n    <div style=\"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px\">\r\n      <div style=\"display:flex;align-items:center;gap:10px\">\r\n        <div style=\"width:38px;height:38px;border-radius:10px!important;background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 16px -2px rgba(79,70,229,0.35), inset 0 1px 1px rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.2)\">\r\n          <!-- Custom Vector Gem Starburst Icon (Clean, Scalable, No Emoji) -->\r\n          <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n            <path d=\"M12 2L14.6 8.6L21.2 11.2L14.6 13.8L12 20.4L9.4 13.8L2.8 11.2L9.4 8.6L12 2Z\" fill=\"#FFFFFF\"/>\r\n            <path d=\"M18.8 3.2L19.8 5.6L22.2 6.6L19.8 7.6L18.8 10L17.8 7.6L15.4 6.6L17.8 5.6L18.8 3.2Z\" fill=\"#FDE047\"/>\r\n            <circle cx=\"5.6\" cy=\"18.4\" r=\"1.4\" fill=\"#E0E7FF\" opacity=\"0.9\"/>\r\n          </svg>\r\n        </div>\r\n        <div>\r\n          <div style=\"display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:800;letter-spacing:0.06em;color:#6366F1;background:rgba(99,102,241,0.08);padding:2px 6px;border-radius:4px;margin-bottom:2px\">PRO ACCESS</div>\r\n          <div class=\"modal-title\" style=\"font-size:15px;font-weight:800;color:#0F172A;margin:0;letter-spacing:-0.01em\">Assets Diary Pro</div>\r\n        </div>\r\n      </div>\r\n      <button type=\"button\" onclick=\"closeProPaywallModal()\" style=\"width:28px;height:28px;border-radius:50%;background:#F1F5F9;border:none;color:#64748B;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;padding:0\" onmouseover=\"this.style.background='#E2E8F0';this.style.color='#0F172A'\" onmouseout=\"this.style.background='#F1F5F9';this.style.color='#64748B'\">\r\n        <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line></svg>\r\n      </button>\r\n    </div>\r\n\r\n    <!-- Alert / Limit Reason Banner -->\r\n    <div id=\"proPaywallReason\" style=\"font-size:11px;font-weight:600;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;padding:8px 11px;border-radius:8px!important;margin-bottom:14px;display:flex;align-items:center;gap:8px;line-height:1.4\">\r\n      <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#D97706\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"flex-shrink:0\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"16\" x2=\"12.01\" y2=\"16\"></line></svg>\r\n      <span>Upgrade to Pro to unlock unlimited access!</span>\r\n    </div>\r\n\r\n    <div style=\"font-size:10px;font-weight:800;letter-spacing:0.06em;color:#64748B;text-transform:uppercase;margin-bottom:9px\">Everything Unlocked In Pro</div>\r\n    \r\n    <!-- Feature Rows with Vector Emerald Checks -->\r\n    <div style=\"display:flex;flex-direction:column;gap:8px;margin-bottom:15px\">\r\n      <div style=\"display:flex;align-items:flex-start;gap:9px;font-size:11px;color:#1E293B\">\r\n        <div style=\"width:17px;height:17px;border-radius:50%;background:#ECFDF5;border:1px solid #A7F3D0;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px\">\r\n          <svg width=\"9\" height=\"9\" viewBox=\"0 0 12 12\" fill=\"none\"><path d=\"M2.5 6L5 8.5L9.5 3.5\" stroke=\"#059669\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>\r\n        </div>\r\n        <div><strong style=\"color:#0F172A\">Unlimited Collections:</strong> Create unlimited collection folders <span style=\"color:#64748B\">(Free: max 2)</span>.</div>\r\n      </div>\r\n      <div style=\"display:flex;align-items:flex-start;gap:9px;font-size:11px;color:#1E293B\">\r\n        <div style=\"width:17px;height:17px;border-radius:50%;background:#ECFDF5;border:1px solid #A7F3D0;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px\">\r\n          <svg width=\"9\" height=\"9\" viewBox=\"0 0 12 12\" fill=\"none\"><path d=\"M2.5 6L5 8.5L9.5 3.5\" stroke=\"#059669\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>\r\n        </div>\r\n        <div><strong style=\"color:#0F172A\">Unlimited Saved Frames:</strong> Save unlimited frames & components <span style=\"color:#64748B\">(Free: max 5)</span>.</div>\r\n      </div>\r\n      <div style=\"display:flex;align-items:flex-start;gap:9px;font-size:11px;color:#1E293B\">\r\n        <div style=\"width:17px;height:17px;border-radius:50%;background:#ECFDF5;border:1px solid #A7F3D0;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px\">\r\n          <svg width=\"9\" height=\"9\" viewBox=\"0 0 12 12\" fill=\"none\"><path d=\"M2.5 6L5 8.5L9.5 3.5\" stroke=\"#059669\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>\r\n        </div>\r\n        <div><strong style=\"color:#0F172A\">Offline JSON Backups:</strong> Download or restore 100% offline JSON archives.</div>\r\n      </div>\r\n      <div style=\"display:flex;align-items:flex-start;gap:9px;font-size:11px;color:#1E293B\">\r\n        <div style=\"width:17px;height:17px;border-radius:50%;background:#ECFDF5;border:1px solid #A7F3D0;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px\">\r\n          <svg width=\"9\" height=\"9\" viewBox=\"0 0 12 12\" fill=\"none\"><path d=\"M2.5 6L5 8.5L9.5 3.5\" stroke=\"#059669\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>\r\n        </div>\r\n        <div><strong style=\"color:#0F172A\">Lifetime Access & Updates:</strong> Instant activation with all future features included.</div>\r\n      </div>\r\n    </div>\r\n\r\n    <!-- License Activation Card -->\r\n    <div style=\"background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px!important;padding:12px;margin-bottom:14px\">\r\n      <div style=\"display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em\">\r\n        <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#64748B\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 2l-2 2m-1.5 1.5L16 7l-3-3L4 13l-2 7 7-2 9-9-3-3z\"></path></svg>\r\n        <span>Have a License Key?</span>\r\n      </div>\r\n      <div style=\"display:flex;gap:6px\">\r\n        <input type=\"text\" id=\"proModalLicenseInput\" placeholder=\"Paste Gumroad key...\" style=\"flex:1;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px!important;color:#0F172A;font-size:11px;padding:8px 10px;outline:none;transition:border-color 0.15s\" onfocus=\"this.style.borderColor='#6366F1'\" onblur=\"this.style.borderColor='#CBD5E1'\" />\r\n        <button type=\"button\" onclick=\"activateProLicenseFromModal()\" id=\"proModalActivateBtn\" style=\"background:linear-gradient(135deg,#6366F1,#8B5CF6);color:#fff;border:none;border-radius:6px!important;font-size:11px;font-weight:700;padding:8px 13px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 6px rgba(99,102,241,0.25);transition:opacity 0.15s\">Activate</button>\r\n      </div>\r\n      <div id=\"proModalLicenseStatus\" style=\"font-size:10px;margin-top:6px;min-height:14px\"></div>\r\n    </div>\r\n\r\n    <!-- CTA Button -->\r\n    <div style=\"text-align:center\">\r\n      <a href=\"https://gumroad.com\" target=\"_blank\" id=\"proGumroadLink\" style=\"display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#0F172A;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:12px;padding:11px 16px;border-radius:8px!important;box-shadow:0 4px 14px rgba(15,23,42,0.18);transition:all 0.18s\" onmouseover=\"this.style.background='#1E293B';this.style.transform='translateY(-1px)'\" onmouseout=\"this.style.background='#0F172A';this.style.transform='none'\">\r\n        <svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"#FF90E8\" style=\"flex-shrink:0\"><path d=\"M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16h-4.08v2.16h4.08v6.48H12a4.32 4.32 0 1 1 0-8.64h1.44V6H12a6.48 6.48 0 1 0 0 12.96h5.568V8.16z\"/></svg>\r\n        <span>Buy Pro License on Gumroad ↗</span>\r\n      </a>\r\n      <div style=\"font-size:10px;color:#94A3B8;margin-top:7px;display:flex;align-items:center;justify-content:center;gap:4px\">\r\n        <svg width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#94A3B8\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\" ry=\"2\"></rect><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path></svg>\r\n        <span>Instant license key delivery via email</span>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>\r\n\r\n<!-- Header with breadcrumb navigation & user profile controls -->\r\n<div class=\"header\">\r\n  <div style=\"flex:1;min-width:0\">\r\n    <h1 id=\"headerTitle\" style=\"white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">Asset's Diary</h1>\r\n    <p id=\"headerBreadcrumb\" class=\"header-breadcrumb\">Manage Collections</p>\r\n  </div>\r\n  <div style=\"display:flex;gap:6px;align-items:center\">\r\n    <button id=\"adminBtn\" class=\"card-btn\" style=\"display:none;background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.25);color:#7C3AED;font-weight:700;align-items:center;gap:4px\" onclick=\"showAdminView()\">\r\n      <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#7C3AED\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"flex-shrink:0\"><path d=\"M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z\"/></svg>\r\n      <span>Admin</span>\r\n    </button>\r\n    <button id=\"backBtn\" class=\"btn-back\" style=\"display:none\" onclick=\"showFolderList()\">\r\n      <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"19\" y1=\"12\" x2=\"5\" y2=\"12\"></line><polyline points=\"12 19 5 12 12 5\"></polyline></svg>\r\n      Back\r\n    </button>\r\n    <button id=\"licenseStatusBtn\" class=\"btn-pro-pill\" style=\"display:none\" onclick=\"showProPaywallModal('general')\">\r\n      <svg width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" style=\"flex-shrink:0\">\r\n        <path d=\"M8 0.5L9.6 5.6C9.8 6.2 10.3 6.7 10.9 6.9L16 8.5L10.9 10.1C10.3 10.3 9.8 10.8 9.6 11.4L8 16.5L6.4 11.4C6.2 10.8 5.7 10.3 5.1 10.1L0 8.5L5.1 6.9C5.7 6.7 6.2 6.2 6.4 5.6L8 0.5Z\" fill=\"url(#proSparkleGradHeader)\"/>\r\n        <defs>\r\n          <linearGradient id=\"proSparkleGradHeader\" x1=\"0\" y1=\"0\" x2=\"16\" y2=\"16\" gradientUnits=\"userSpaceOnUse\">\r\n            <stop offset=\"0%\" stop-color=\"#6366F1\"/>\r\n            <stop offset=\"100%\" stop-color=\"#EC4899\"/>\r\n          </linearGradient>\r\n        </defs>\r\n      </svg>\r\n      <span>Upgrade to Pro</span>\r\n    </button>\r\n    <button id=\"signOutBtn\" class=\"card-btn\" style=\"display:none;color:#DC2626;border-color:rgba(220,38,38,0.3)\" onclick=\"signOutUser()\">Sign Out</button>\r\n  </div>\r\n</div>\r\n\r\n<!-- Auth Screen (Login / Sign Up) -->\r\n<div id=\"authView\" class=\"view\">\r\n  <div class=\"content\" style=\"padding-top:28px\">\r\n    <div style=\"text-align:center;margin-bottom:24px\">\r\n      <div style=\"width:48px;height:48px;border-radius:14px!important;background:linear-gradient(135deg,#6366F1,#8B5CF6);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;box-shadow:0 4px 12px rgba(99,102,241,0.25)\">\r\n        <svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\" ry=\"2\"></rect><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path></svg>\r\n      </div>\r\n      <h2 style=\"font-size:16px;font-weight:700;color:#0F172A\">Assets Diary Account</h2>\r\n      <div class=\"intro-copy\" id=\"authIntroCopy\" style=\"text-align:left;margin:10px auto 0;max-width:300px\">Assets Diary is your visual library for Figma.<br>Save useful frames and layers into collections, then bring them back to your canvas whenever you need them.<br>Sign in or create an account to keep your collections private.<button type=\"button\" class=\"intro-copy-close\" aria-label=\"Hide introduction\" title=\"Hide introduction\" onclick=\"hideIntroCopy()\">&times;</button></div>\r\n    </div>\r\n\r\n    <!-- Auth Tabs -->\r\n    <div style=\"display:flex;background:#E2E8F0;padding:3px;border-radius:8px!important;margin-bottom:18px;border:1px solid #CBD5E1\">\r\n      <button id=\"tabLogin\" onclick=\"switchAuthTab('login')\" style=\"flex:1;padding:8px;border:none;border-radius:6px!important;background:#6366F1;color:#fff;font-weight:700;font-size:11px;cursor:pointer\">Sign In</button>\r\n      <button id=\"tabSignup\" onclick=\"switchAuthTab('signup')\" style=\"flex:1;padding:8px;border:none;border-radius:6px!important;background:transparent;color:#64748B;font-weight:700;font-size:11px;cursor:pointer\">Create Account</button>\r\n    </div>\r\n\r\n    <!-- Sign In Form Box -->\r\n    <div id=\"loginFormBox\">\r\n      <div class=\"field\">\r\n        <label class=\"field-label\">Email Address</label>\r\n        <input type=\"text\" id=\"authEmail\" placeholder=\"your-email@example.com\" autocomplete=\"off\" onkeydown=\"if(event.key==='Enter') submitLoginForm()\" />\r\n      </div>\r\n      <div class=\"field\" style=\"margin-top:12px\">\r\n        <label class=\"field-label\">Password</label>\r\n        <div style=\"position:relative\">\r\n          <input type=\"password\" id=\"authPassword\" placeholder=\"••••••••\" style=\"width:100%;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;font-size:12px;padding:9px 36px 9px 12px;outline:none\" onkeydown=\"if(event.key==='Enter') submitLoginForm()\" />\r\n          <button type=\"button\" onclick=\"togglePasswordVisibility('authPassword', this)\" style=\"position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#64748B;cursor:pointer;padding:2px;display:flex;align-items:center;justify-content:center\" title=\"Toggle password visibility\">\r\n            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle></svg>\r\n          </button>\r\n        </div>\r\n      </div>\r\n      <button id=\"authLoginBtn\" class=\"btn-primary\" style=\"width:100%;margin-top:16px\" onclick=\"submitLoginForm()\">Sign In</button>\r\n    </div>\r\n\r\n    <!-- Sign Up Form Box -->\r\n    <div id=\"signupFormBox\" style=\"display:none\">\r\n      <div class=\"field\">\r\n        <label class=\"field-label\">Full Name / Display Name</label>\r\n        <input type=\"text\" id=\"signupName\" placeholder=\"e.g. Alex Johnson\" autocomplete=\"off\" onkeydown=\"if(event.key==='Enter') submitSignupForm()\" />\r\n      </div>\r\n      <div class=\"field\" style=\"margin-top:12px\">\r\n        <label class=\"field-label\">Email Address</label>\r\n        <input type=\"text\" id=\"signupEmail\" placeholder=\"new-user@example.com\" autocomplete=\"off\" onkeydown=\"if(event.key==='Enter') submitSignupForm()\" />\r\n      </div>\r\n      <div class=\"field\" style=\"margin-top:12px\">\r\n        <label class=\"field-label\">Create Password</label>\r\n        <div style=\"position:relative\">\r\n          <input type=\"password\" id=\"signupPassword\" placeholder=\"Minimum 6 characters\" style=\"width:100%;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;font-size:12px;padding:9px 36px 9px 12px;outline:none\" onkeydown=\"if(event.key==='Enter') submitSignupForm()\" />\r\n          <button type=\"button\" onclick=\"togglePasswordVisibility('signupPassword', this)\" style=\"position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#64748B;cursor:pointer;padding:2px;display:flex;align-items:center;justify-content:center\" title=\"Toggle password visibility\">\r\n            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle></svg>\r\n          </button>\r\n        </div>\r\n      </div>\r\n      <div class=\"field\" style=\"margin-top:12px\">\r\n        <label class=\"field-label\">Confirm Password</label>\r\n        <div style=\"position:relative\">\r\n          <input type=\"password\" id=\"signupConfirmPassword\" placeholder=\"Re-enter password\" style=\"width:100%;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;font-size:12px;padding:9px 36px 9px 12px;outline:none\" onkeydown=\"if(event.key==='Enter') submitSignupForm()\" />\r\n          <button type=\"button\" onclick=\"togglePasswordVisibility('signupConfirmPassword', this)\" style=\"position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#64748B;cursor:pointer;padding:2px;display:flex;align-items:center;justify-content:center\" title=\"Toggle password visibility\">\r\n            <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle></svg>\r\n          </button>\r\n        </div>\r\n      </div>\r\n      <button id=\"authSignupBtn\" class=\"btn-primary\" style=\"width:100%;margin-top:16px;background:linear-gradient(135deg,#8B5CF6,#6366F1)\" onclick=\"submitSignupForm()\">Create Account</button>\r\n    </div>\r\n\r\n    <div id=\"authStatus\" class=\"status\" style=\"margin-top:12px;min-height:20px\"></div>\r\n  </div>\r\n</div>\r\n\r\n<!-- Admin Dashboard View -->\r\n<div id=\"adminView\" class=\"view\">\r\n  <div class=\"content\">\r\n    <div class=\"section\" style=\"margin-top:14px\">\r\n      <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">\r\n        <div class=\"section-title\" style=\"color:#7C3AED;display:flex;align-items:center;gap:6px\">\r\n          <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#7C3AED\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z\"/></svg>\r\n          <span>Admin Dashboard Overview</span>\r\n        </div>\r\n        <button class=\"card-btn\" onclick=\"saveAsStarterTemplate()\" style=\"font-size:10px;padding:4px 8px;color:#7C3AED;border-color:rgba(124,58,237,0.3);display:inline-flex;align-items:center;gap:4px\">\r\n          <svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"#7C3AED\"><polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"></polygon></svg>\r\n          <span>Save Starter Template</span>\r\n        </button>\r\n      </div>\r\n\r\n      <!-- Stat Badges -->\r\n      <div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px\">\r\n        <div style=\"background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px!important;padding:10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.03)\">\r\n          <div style=\"font-size:18px;font-weight:800;color:#4F46E5\" id=\"adminTotalUsers\">0</div>\r\n          <div style=\"font-size:9px;color:#64748B;text-transform:uppercase;margin-top:2px;font-weight:700\">Users</div>\r\n        </div>\r\n        <div style=\"background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px!important;padding:10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.03)\">\r\n          <div style=\"font-size:18px;font-weight:800;color:#7C3AED\" id=\"adminTotalFolders\">0</div>\r\n          <div style=\"font-size:9px;color:#64748B;text-transform:uppercase;margin-top:2px;font-weight:700\">Collections</div>\r\n        </div>\r\n        <div style=\"background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px!important;padding:10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.03)\">\r\n          <div style=\"font-size:18px;font-weight:800;color:#059669\" id=\"adminTotalStyles\">0</div>\r\n          <div style=\"font-size:9px;color:#64748B;text-transform:uppercase;margin-top:2px;font-weight:700\">Frames</div>\r\n        </div>\r\n      </div>\r\n\r\n      <!-- Filters & Search -->\r\n      <div style=\"display:flex;flex-direction:column;gap:10px;margin-bottom:14px\">\r\n        <div class=\"field\" style=\"margin-bottom:0\">\r\n          <label class=\"field-label\">Filter by User</label>\r\n          <select id=\"adminUserSelect\" style=\"width:100%;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;font-size:11px;padding:8px 10px;outline:none\" onchange=\"renderAdminUserCollections()\">\r\n            <option value=\"ALL\">All Registered Users</option>\r\n          </select>\r\n        </div>\r\n        <div class=\"field\" style=\"margin-bottom:0\">\r\n          <label class=\"field-label\">Search Users or Collections</label>\r\n          <input type=\"text\" id=\"adminSearchInput\" placeholder=\"Type user name, email or collection name...\" style=\"width:100%;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:6px;color:#0F172A;font-size:11px;padding:8px 10px;outline:none\" oninput=\"renderAdminUserCollections()\" />\r\n        </div>\r\n      </div>\r\n\r\n      <!-- Numbered Users & Collections List -->\r\n      <div id=\"adminFoldersGrid\" style=\"display:flex;flex-direction:column;gap:12px\">\r\n        <div style=\"font-size:11px;color:#64748B;padding:14px;text-align:center\">Loading user records…</div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>\r\n\r\n<!-- Trashcan View (Hidden compatibility container) -->\r\n<div id=\"trashView\" class=\"view\"></div>\r\n\r\n<div id=\"folderListView\" class=\"view active\">\r\n  <div class=\"content\">\r\n    <div class=\"intro-copy\" id=\"folderIntroCopy\">Assets Diary is your visual library for Figma.<br>Save useful frames and layers into collections, then bring them back to your canvas whenever you need them.<button type=\"button\" class=\"intro-copy-close\" aria-label=\"Hide introduction\" title=\"Hide introduction\" onclick=\"hideIntroCopy()\">&times;</button></div>\r\n    <div class=\"section\" style=\"margin-top:14px\">\r\n      <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">\r\n        <div class=\"section-title\" style=\"margin-bottom:0\">Created Collections</div>\r\n        <div style=\"display:flex;gap:6px;align-items:center\">\r\n          <button class=\"card-btn\" onclick=\"triggerBulkDeleteCountdown()\" id=\"bulkDeleteBtn\" style=\"font-size:10.5px;padding:4px 10px;color:#DC2626;background:#FEE2E2;border:1px solid #FCA5A5;border-radius:6px;font-weight:600;display:none;align-items:center;gap:5px;cursor:pointer\">\r\n            <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#DC2626\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg>\r\n            <span>Delete (<span id=\"bulkDeleteCount\">0</span>) on count of 3</span>\r\n          </button>\r\n        </div>\r\n      </div>\r\n      \r\n      <div id=\"foldersGrid\" class=\"cards-grid\">\r\n        <div id=\"noFoldersMsg\" style=\"grid-column:1/-1;font-size:11px;color:#64748B;padding:16px;border:1px dashed #CBD5E1;border-radius:6px;text-align:center;background:#FFFFFF\">\r\n          No collections yet. Create one to get started.\r\n        </div>\r\n      </div>\r\n\r\n      <!-- Floating Action Bar for deleting multiple selected collections on count of 3 -->\r\n      <div id=\"bulkActionBar\" style=\"position:sticky;bottom:8px;z-index:99;background:#1E1B4B;color:#FFFFFF;padding:8px 12px;border-radius:8px;display:none;align-items:center;justify-content:space-between;box-shadow:0 8px 20px -3px rgba(0,0,0,0.35);margin-top:10px\">\r\n        <div style=\"display:flex;align-items:center;gap:6px\">\r\n          <span style=\"background:#6366F1;color:#fff;font-weight:700;font-size:10.5px;padding:2px 7px;border-radius:10px\" id=\"bulkBarCount\">0</span>\r\n          <span style=\"font-size:11px;font-weight:600\">collections selected</span>\r\n        </div>\r\n        <div style=\"display:flex;align-items:center;gap:6px\">\r\n          <button type=\"button\" onclick=\"selectedFolderIds.clear(); updateFoldersList();\" style=\"background:transparent;border:none;color:#94A3B8;font-size:11px;cursor:pointer;padding:4px 6px\">Cancel</button>\r\n          <button type=\"button\" onclick=\"triggerBulkDeleteCountdown()\" style=\"background:linear-gradient(135deg, #EF4444, #DC2626);border:none;color:#fff;font-size:11px;font-weight:700;padding:5px 12px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 6px rgba(220,38,38,0.4)\">\r\n            <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg>\r\n            <span>Delete on count of 3</span>\r\n          </button>\r\n        </div>\r\n      </div>\r\n    </div>\r\n    \r\n    <hr>\r\n    \r\n    <div style=\"margin-top:24px\" class=\"field\">\r\n      <label style=\"margin-bottom:14px\" class=\"field-label\">Create New Collection</label>\r\n      <div style=\"display:flex;gap:6px\">\r\n        <input type=\"text\" id=\"newFolderName\" placeholder=\"Collection name...\" onkeydown=\"if(event.key==='Enter') createNewFolder()\" />\r\n        <button class=\"btn-primary btn-secondary\" style=\"flex:0 0 auto;width:auto;padding:8px 14px\" onclick=\"createNewFolder()\">Create</button>\r\n      </div>\r\n    </div>\r\n\r\n    <hr style=\"margin:22px 0 18px\">\r\n\r\n    <!-- Data Protection & Offline Backup Section -->\r\n    <div class=\"section\" style=\"margin-top:20px;background:#FFFFFF;border:1px solid #E2E8F0;padding:12px;border-radius:8px!important;box-shadow:0 1px 3px rgba(0,0,0,0.02)\">\r\n      <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:6px\">\r\n        <div style=\"font-size:10px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.06em;display:flex;align-items:center;gap:5px\">\r\n          <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#4F46E5\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"></path></svg>\r\n          <span>Data Protection & Offline Backup</span>\r\n        </div>\r\n        <span id=\"jsonBackupBadge\" style=\"font-size:9.5px;color:#7C3AED;font-weight:700;background:rgba(124,58,237,0.08);padding:2px 6px;border-radius:4px;border:1px solid rgba(124,58,237,0.2);display:inline-flex;align-items:center;gap:4px\">\r\n          <svg width=\"9\" height=\"9\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#7C3AED\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\" ry=\"2\"></rect><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path></svg>\r\n          <span>Pro Feature</span>\r\n        </span>\r\n      </div>\r\n      <div style=\"font-size:10px;color:#64748B;margin-bottom:10px;line-height:1.4\">Collections are automatically multi-backed up. Download or restore a hard offline copy anytime:</div>\r\n      <div style=\"display:flex;gap:8px\">\r\n        <button class=\"card-btn\" onclick=\"exportBackupJSON()\" style=\"flex:1;color:#4F46E5;border-color:rgba(79,70,229,0.3);background:rgba(79,70,229,0.04);font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:5px\">\r\n          <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"7 10 12 15 17 10\"></polyline><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line></svg>\r\n          <span>Export Backup (.json)</span>\r\n        </button>\r\n        <button class=\"card-btn\" onclick=\"triggerImportBackup()\" style=\"flex:1;color:#059669;border-color:rgba(5,150,105,0.3);background:rgba(5,150,105,0.04);font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:5px\">\r\n          <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path><polyline points=\"17 8 12 3 7 8\"></polyline><line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"15\"></line></svg>\r\n          <span>Import Backup (.json)</span>\r\n        </button>\r\n      </div>\r\n    </div>\r\n\r\n    <hr style=\"margin:22px 0 18px\">\r\n\r\n    <!-- Redesigned Embedded Trashcan Storage Section -->\r\n    <div class=\"section\" id=\"embeddedTrashSection\" style=\"margin-top:20px\">\r\n      <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">\r\n        <div>\r\n          <div class=\"section-title\" style=\"color:#DC2626;margin-bottom:2px;display:flex;align-items:center;gap:5px\">\r\n            <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#DC2626\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg>\r\n            <span>Deleted Backup</span>\r\n          </div>\r\n          <div style=\"font-size:10px;color:#64748B\">Deleted collections, frames & groups can be restored anytime.</div>\r\n        </div>\r\n        <button class=\"card-btn empty-trash-btn\" onclick=\"emptyTrashCan()\" id=\"emptyTrashBtn\" style=\"font-size:10px;padding:4px 9px;color:#DC2626;border-color:rgba(220,38,38,0.3);background:rgba(239,68,68,0.06);display:none\">Empty Trash</button>\r\n      </div>\r\n\r\n      <div id=\"trashGrid\" class=\"cards-grid trash-grid\">\r\n        <div id=\"noTrashMsg\" class=\"no-trash-msg\" style=\"grid-column:1/-1;font-size:11px;color:#64748B;padding:16px;border:1px dashed #CBD5E1;border-radius:5px;text-align:center;background:#FFFFFF\">\r\n          Trashcan is empty. Deleted items will appear here.\r\n        </div>\r\n      </div>\r\n    </div>\r\n\r\n    <div style=\"display:none\">\r\n      <input type=\"text\" id=\"driveFolderId\" value=\"1a2bFDQ9TsLEfxVFX4AvDwW31NwI31WuT\" />\r\n      <input type=\"text\" id=\"refreshToken\" />\r\n      <input type=\"text\" id=\"clientId\" />\r\n      <input type=\"text\" id=\"clientSecret\" />\r\n      <input type=\"text\" id=\"driveToken\" />\r\n      <input type=\"checkbox\" id=\"saveRefreshToken\" checked />\r\n      <input type=\"checkbox\" id=\"saveClientId\" checked />\r\n      <input type=\"checkbox\" id=\"saveClientSecret\" checked />\r\n      <input type=\"checkbox\" id=\"saveToken\" checked />\r\n      <input type=\"checkbox\" id=\"saveDriveSettings\" checked />\r\n      <div id=\"driveStatus\"></div>\r\n    </div>\r\n  </div>\r\n</div>\r\n\r\n<!-- Folder Detail View -->\r\n<div id=\"folderDetailView\" class=\"view\">\r\n  <!-- Sticky Selection Card Container (Zero scroll shift / constant top padding) -->\r\n  <div style=\"position:sticky;top:57px;z-index:15;background:#F8FAFC;padding:14px 0 10px\">\r\n    <div id=\"selectedFrameCard\" style=\"padding:14px;border:1px solid #C7D2FE;border-radius:10px!important;background:linear-gradient(135deg,#EEF2FF 0%,#F5F3FF 100%);box-shadow:0 4px 12px rgba(99,102,241,0.08)\">\r\n      <div style=\"display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap\">\r\n        <div style=\"flex:1;min-width:150px\">\r\n          <div style=\"display:flex;align-items:center;gap:6px;margin-bottom:4px\">\r\n            <span id=\"selectedFrameBadge\" style=\"font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px!important;background:#4F46E5;color:#FFF;text-transform:uppercase\">ELEMENT SELECTION</span>\r\n          </div>\r\n          <div style=\"font-size:13px;font-weight:700;color:#1E1B4B\" id=\"selectedFrameName\">Save Canvas Frame</div>\r\n          <div style=\"font-size:11px;color:#4338CA;margin-top:2px\" id=\"selectedFrameSize\">Select any frame or layer on your Figma canvas, then save it here.</div>\r\n          <div id=\"selectedFramesList\" style=\"margin-top:8px;display:none\">\r\n            <div style=\"font-size:10px;color:#475569;margin-bottom:6px;font-weight:600\">Selected canvas elements:</div>\r\n            <div id=\"frameListItems\" style=\"font-size:10px;color:#334155;max-height:100px;overflow-y:auto\"></div>\r\n          </div>\r\n        </div>\r\n        <div style=\"display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end\">\r\n          <button class=\"btn-primary\" id=\"addSelectedBtn\" style=\"width:auto;padding:8px 16px;font-size:11px;background:linear-gradient(135deg,#6366F1,#8B5CF6);display:flex;align-items:center;gap:4px\">\r\n            Save Frame\r\n          </button>\r\n          <button class=\"btn-primary\" id=\"addSelectedMultiBtn\" style=\"width:auto;padding:8px 16px;font-size:11px;background:linear-gradient(135deg,#6366F1,#8B5CF6);display:none;align-items:center;gap:4px\">\r\n            Save Selected Frames\r\n          </button>\r\n        </div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n\r\n  <div class=\"content\" style=\"padding-top:4px\">\r\n    <div class=\"section\" style=\"margin-top:14px\">\r\n      <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\">\r\n        <div class=\"section-title\">Saved Collections</div>\r\n      </div>\r\n      <div id=\"stylesGrid\" class=\"cards-grid\">\r\n        <div id=\"noStylesMsg\" style=\"grid-column:1/-1;font-size:11px;color:#64748B;padding:16px;border:1px dashed #CBD5E1;border-radius:6px;text-align:center;background:#FFFFFF\">\r\n          No frames in this collection yet.\r\n        </div>\r\n      </div>\r\n    </div>\r\n\r\n    <!-- Embedded Trashcan in Detail View -->\r\n    <div class=\"section\" style=\"margin-top:24px;border-top:1px solid #E2E8F0;padding-top:16px\">\r\n      <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">\r\n        <div>\r\n          <div class=\"section-title\" style=\"color:#DC2626;margin-bottom:2px;display:flex;align-items:center;gap:5px\">\r\n            <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#DC2626\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg>\r\n            <span>Deleted Backup (Trashcan)</span>\r\n          </div>\r\n          <div style=\"font-size:10px;color:#64748B\">Deleted collections, frames & groups can be restored anytime.</div>\r\n        </div>\r\n        <button class=\"card-btn empty-trash-btn\" onclick=\"emptyTrashCan()\" style=\"font-size:10px;padding:4px 9px;color:#DC2626;border-color:rgba(220,38,38,0.3);background:rgba(239,68,68,0.06);display:none\">Empty Trash</button>\r\n      </div>\r\n\r\n      <div class=\"cards-grid trash-grid\">\r\n        <div class=\"no-trash-msg\" style=\"grid-column:1/-1;font-size:11px;color:#64748B;padding:16px;border:1px dashed #CBD5E1;border-radius:5px;text-align:center;background:#FFFFFF\">\r\n          Trashcan is empty. Deleted items will appear here.\r\n        </div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n\r\n  <!-- Import button at the bottom -->\r\n  <div class=\"bottom-bar\">\r\n    <button class=\"btn-primary\" id=\"genBtn\" onclick=\"importStyle()\" style=\"width:100%\">Bring this to canvas ↘</button>\r\n    <div class=\"status\" id=\"status\"></div>\r\n  </div>\r\n</div>\r\n\r\n<!-- Modal for confirmations and input -->\r\n<div id=\"confirmModal\" class=\"modal-overlay\">\r\n  <div class=\"modal\">\r\n    <div class=\"modal-title\" id=\"modalTitle\">Confirm Action</div>\r\n    <div class=\"modal-message\" id=\"modalMessage\">Are you sure?</div>\r\n    <div id=\"modalInputField\" style=\"display:none; margin:12px 0\">\r\n      <label class=\"field-label\">Name</label>\r\n      <input type=\"text\" id=\"modalInput\" placeholder=\"Collection name...\" />\r\n    </div>\r\n    <div class=\"modal-buttons\">\r\n      <button class=\"modal-btn cancel\" onclick=\"closeModal()\">Cancel</button>\r\n      <button class=\"modal-btn primary\" id=\"modalConfirmBtn\" onclick=\"confirmModalAction()\">Confirm</button>\r\n    </div>\r\n  </div>\r\n</div>\r\n\r\n<!-- Delete Confirmation Modal (With 3-Second Countdown) -->\r\n<div id=\"countdownModalOverlay\" class=\"modal-overlay\">\r\n  <div class=\"modal\" style=\"text-align:center;max-width:340px;border-color:rgba(239,68,68,0.3)\">\r\n    <div style=\"width:48px;height:48px;border-radius:50%;background:#FEF2F2;border:1px solid #FECACA;display:inline-flex;align-items:center;justify-content:center;margin:0 auto 10px\">\r\n      <svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#DC2626\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"></line><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line></svg>\r\n    </div>\r\n    <div class=\"modal-title\" id=\"countdownTitle\" style=\"color:#DC2626\">Delete Selected Collections</div>\r\n    <div class=\"modal-message\" id=\"countdownMessage\" style=\"font-size:12px;color:#334155;margin-bottom:8px\">\r\n      Deleting <strong id=\"countdownFolderCount\" style=\"color:#DC2626\">0</strong> selected collection(s)...\r\n    </div>\r\n    <div id=\"countdownTimerBox\" style=\"font-size:12px;color:#DC2626;margin:12px 0;background:rgba(239,68,68,0.08);padding:12px 10px;border-radius:8px;border:1px solid rgba(239,68,68,0.25)\">\r\n      <div style=\"font-size:32px;font-weight:900;color:#DC2626;line-height:1;margin-bottom:4px;transition:transform 0.15s ease\" id=\"countdownSecDisplay\">3</div>\r\n      <div style=\"font-size:11px;color:#475569;font-weight:600\">Deleting automatically on count of 3...</div>\r\n    </div>\r\n    <div class=\"modal-buttons\" style=\"display:flex;gap:8px;margin-top:14px\">\r\n      <button class=\"modal-btn cancel\" onclick=\"cancelBulkDeleteCountdown()\" style=\"flex:1;padding:9px;font-size:12px;font-weight:700;background:#F1F5F9;color:#334155\">Cancel</button>\r\n      <button class=\"modal-btn primary\" id=\"confirmDeleteBtn\" onclick=\"executeBulkDeleteNow()\" style=\"flex:1;padding:9px;font-size:12px;font-weight:700;background:linear-gradient(135deg, #EF4444, #DC2626);border-color:#EF4444;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px\">\r\n        <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"></path></svg>\r\n        <span id=\"confirmDeleteBtnText\">Delete Now (3s)</span>\r\n      </button>\r\n    </div>\r\n  </div>\r\n</div>\r\n\r\n<script>\r\n// ─── GUMROAD LICENSE CONFIGURATION ───\r\nconst GUMROAD_PRODUCT_ID = \"qw7c2Zafsat7gTuUS10qmQ==\"; // Live Gumroad product ID\r\nconst GUMROAD_PRODUCT_PERMALINK = \"mcuisg\"; // Live Gumroad product permalink\r\nconst GUMROAD_BUY_URL = \"https://7566387198230.gumroad.com/l/mcuisg\"; // Live Gumroad purchase link\r\n\r\nfunction initGumroadLinks() {\r\n  const gumroadUrl = GUMROAD_BUY_URL;\r\n  const proLink = document.getElementById('proGumroadLink');\r\n  const mainLink = document.getElementById('gumroadLink');\r\n  if (proLink) proLink.href = gumroadUrl;\r\n  if (mainLink) mainLink.href = gumroadUrl;\r\n}\r\n\r\nlet toastTimeoutTimer = null;\r\nfunction showToast(message, type = 'info', duration = 3500) {\r\n  const toast = document.getElementById('globalToast');\r\n  const textEl = document.getElementById('globalToastText');\r\n  const iconEl = document.getElementById('globalToastIcon');\r\n  if (!toast || !textEl) return;\r\n\r\n  if (toastTimeoutTimer) {\r\n    clearTimeout(toastTimeoutTimer);\r\n    toastTimeoutTimer = null;\r\n  }\r\n\r\n  const icons = {\r\n    success: '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"></polyline></svg>',\r\n    error: '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line></svg>',\r\n    warning: '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"16\" x2=\"12.01\" y2=\"16\"></line></svg>',\r\n    info: '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line></svg>'\r\n  };\r\n\r\n  if (iconEl) iconEl.innerHTML = icons[type] || icons.info;\r\n  textEl.textContent = message;\r\n  toast.className = `global-toast active ${type}`;\r\n\r\n  toastTimeoutTimer = setTimeout(() => {\r\n    toast.classList.remove('active');\r\n  }, duration);\r\n}\r\nconst INTRO_COPY_DISMISSAL_LIMIT = 2;\r\nlet introCopyDismissedThisLaunch = false;\r\nlet introCopyTimer = null;\r\n\r\nfunction scheduleIntroCopyAutoDismiss() {\r\n  if (introCopyTimer) clearTimeout(introCopyTimer);\r\n  introCopyTimer = setTimeout(() => {\r\n    hideIntroCopy();\r\n  }, 4000);\r\n}\r\n\r\nfunction hideIntroCopy() {\r\n  if (introCopyDismissedThisLaunch) return;\r\n  introCopyDismissedThisLaunch = true;\r\n  if (introCopyTimer) {\r\n    clearTimeout(introCopyTimer);\r\n    introCopyTimer = null;\r\n  }\r\n  const elements = document.querySelectorAll('#authIntroCopy, #folderIntroCopy');\r\n  elements.forEach(copy => {\r\n    copy.style.opacity = '0';\r\n    copy.style.transform = 'translateY(-4px)';\r\n  });\r\n  setTimeout(() => {\r\n    elements.forEach(copy => {\r\n      copy.style.display = 'none';\r\n    });\r\n  }, 400);\r\n  try {\r\n    parent.postMessage({ pluginMessage: { type: 'dismiss-intro-copy' } }, '*');\r\n  } catch (e) {}\r\n}\r\n\r\nfunction initIntroCopy() {\r\n  const elements = document.querySelectorAll('#authIntroCopy, #folderIntroCopy');\r\n  elements.forEach(copy => {\r\n    copy.style.display = '';\r\n    copy.style.opacity = '1';\r\n    copy.style.transform = 'translateY(0)';\r\n  });\r\n  scheduleIntroCopyAutoDismiss();\r\n}\r\n\r\ndocument.addEventListener('DOMContentLoaded', initGumroadLinks);\r\ndocument.addEventListener('DOMContentLoaded', initIntroCopy);\r\nsetTimeout(initGumroadLinks, 500);\r\n\r\n// ── State ──────────────────────────────────────────────\r\nlet allFolders = [];\r\nfunction normalizeFolders(folders) {\r\n  if (!Array.isArray(folders)) return [];\r\n  return folders.map(f => {\r\n    if (!f) return f;\r\n    const name = String(f.name || '').trim();\r\n    if (name === 'Example folder 1' || name === 'Example folder 2') return f;\r\n\r\n    const isFolder1 =\r\n      name === 'Button' ||\r\n      name === 'Button (Example Collection)' ||\r\n      /^Button(\\s*\\(Example.*)?$/i.test(name) ||\r\n      f.folderId === 'starter-folder-0' ||\r\n      f.folderId === 'folder-1786309604950-ulust';\r\n\r\n    const isFolder2 =\r\n      name === 'Drop Shadow' ||\r\n      name === 'Drop Shadow (Example Collection)' ||\r\n      /^Drop\\s*Shadow(\\s*\\(Example.*)?$/i.test(name) ||\r\n      f.folderId === 'starter-folder-1' ||\r\n      f.folderId === 'folder-1786309911032-2radu';\r\n\r\n    if (isFolder1) {\r\n      return { ...f, name: 'Example folder 1' };\r\n    }\r\n    if (isFolder2) {\r\n      return { ...f, name: 'Example folder 2' };\r\n    }\r\n    return f;\r\n  });\r\n}\r\nlet currentFolderId = null;\r\nlet selectedStyleId = null;\r\nlet selectedStyleIds = [];\r\nlet isSavingFrame = false;\r\nlet isProUser = false;\r\nlet selectedFrameInfo = null;\r\nlet selectedFramesInfo = [];\r\nlet pendingModalAction = null;\r\nlet modalCountdownTimer = null;\r\n\r\n// Auth & Admin State\r\nlet currentAuthMode = 'login';\r\nlet currentUser = null;\r\nlet cachedAdminData = null;\r\n\r\nfunction switchAuthTab(mode) {\r\n  currentAuthMode = mode;\r\n  const loginTab = document.getElementById('tabLogin');\r\n  const signupTab = document.getElementById('tabSignup');\r\n  const loginBox = document.getElementById('loginFormBox');\r\n  const signupBox = document.getElementById('signupFormBox');\r\n  const status = document.getElementById('authStatus');\r\n  if (status) { status.textContent = ''; status.className = 'status'; }\r\n\r\n  if (mode === 'login') {\r\n    loginTab.style.background = '#6366F1';\r\n    loginTab.style.color = '#FFFFFF';\r\n    signupTab.style.background = 'transparent';\r\n    signupTab.style.color = '#64748B';\r\n    loginBox.style.display = 'block';\r\n    signupBox.style.display = 'none';\r\n  } else {\r\n    signupTab.style.background = '#6366F1';\r\n    signupTab.style.color = '#FFFFFF';\r\n    loginTab.style.background = 'transparent';\r\n    loginTab.style.color = '#64748B';\r\n    loginBox.style.display = 'none';\r\n    signupBox.style.display = 'block';\r\n  }\r\n}\r\n\r\nfunction togglePasswordVisibility(inputId, btn) {\r\n  const input = document.getElementById(inputId);\r\n  if (!input) return;\r\n  const eyeIcon = `<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle></svg>`;\r\n  const eyeOffIcon = `<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24\"></path><line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line></svg>`;\r\n\r\n  if (input.type === 'password') {\r\n    input.type = 'text';\r\n    if (btn) btn.innerHTML = eyeOffIcon;\r\n  } else {\r\n    input.type = 'password';\r\n    if (btn) btn.innerHTML = eyeIcon;\r\n  }\r\n}\r\n\r\nfunction submitLoginForm() {\r\n  const emailInput = document.getElementById('authEmail');\r\n  const passwordInput = document.getElementById('authPassword');\r\n  const email = emailInput ? emailInput.value.trim() : '';\r\n  const password = passwordInput ? passwordInput.value.trim() : '';\r\n  const status = document.getElementById('authStatus');\r\n  const btn = document.getElementById('authLoginBtn');\r\n\r\n  if (!email || !password) {\r\n    if (status) {\r\n      status.textContent = '✗ Please enter email and password';\r\n      status.className = 'status err';\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (btn) { btn.disabled = true; btn.textContent = 'Signing In…'; }\r\n  parent.postMessage({\r\n    pluginMessage: {\r\n      type: 'auth-login',\r\n      email,\r\n      password\r\n    }\r\n  }, '*');\r\n}\r\n\r\nfunction escapeHtml(str) {\r\n  if (str === null || str === undefined) return '';\r\n  return String(str)\r\n    .replace(/&/g, '&amp;')\r\n    .replace(/</g, '&lt;')\r\n    .replace(/>/g, '&gt;')\r\n    .replace(/\"/g, '&quot;')\r\n    .replace(/'/g, '&#039;');\r\n}\r\n\r\nfunction submitSignupForm() {\r\n  const nameInput = document.getElementById('signupName');\r\n  const emailInput = document.getElementById('signupEmail');\r\n  const passwordInput = document.getElementById('signupPassword');\r\n  const confirmInput = document.getElementById('signupConfirmPassword');\r\n  const name = nameInput ? nameInput.value.trim() : '';\r\n  const email = emailInput ? emailInput.value.trim() : '';\r\n  const password = passwordInput ? passwordInput.value.trim() : '';\r\n  const confirmPassword = confirmInput ? confirmInput.value.trim() : '';\r\n  const status = document.getElementById('authStatus');\r\n  const btn = document.getElementById('authSignupBtn');\r\n\r\n  if (!email || !password) {\r\n    if (status) {\r\n      status.textContent = '✗ Please enter email and password';\r\n      status.className = 'status err';\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (!/\\S+@\\S+\\.\\S+/.test(email)) {\r\n    if (status) {\r\n      status.textContent = '✗ Please enter a valid email address';\r\n      status.className = 'status err';\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (password.length < 6) {\r\n    if (status) {\r\n      status.textContent = '✗ Password must be at least 6 characters';\r\n      status.className = 'status err';\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (password !== confirmPassword) {\r\n    if (status) {\r\n      status.textContent = '✗ Passwords do not match';\r\n      status.className = 'status err';\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (btn) { btn.disabled = true; btn.textContent = 'Creating Account…'; }\r\n  parent.postMessage({\r\n    pluginMessage: {\r\n      type: 'auth-signup',\r\n      name,\r\n      email,\r\n      password\r\n    }\r\n  }, '*');\r\n}\r\n\r\nfunction signOutUser() {\r\n  parent.postMessage({ pluginMessage: { type: 'auth-logout' } }, '*');\r\n}\r\n\r\nfunction showAuthView(rememberedCreds) {\r\n  currentUser = null;\r\n  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));\r\n  const authView = document.getElementById('authView');\r\n  if (authView) authView.classList.add('active');\r\n  const signOutBtn = document.getElementById('signOutBtn');\r\n  if (signOutBtn) signOutBtn.style.display = 'none';\r\n  const adminBtn = document.getElementById('adminBtn');\r\n  if (adminBtn) adminBtn.style.display = 'none';\r\n  const backBtn = document.getElementById('backBtn');\r\n  if (backBtn) backBtn.style.display = 'none';\r\n  const breadcrumb = document.getElementById('headerBreadcrumb');\r\n  if (breadcrumb) breadcrumb.textContent = 'Sign In / Register';\r\n  const status = document.getElementById('authStatus');\r\n  if (status) { status.textContent = ''; status.className = 'status'; }\r\n\r\n  const authEmail = document.getElementById('authEmail');\r\n  const authPassword = document.getElementById('authPassword');\r\n  if (authEmail) authEmail.placeholder = 'your-email@example.com';\r\n  if (authPassword) authPassword.placeholder = '••••••••';\r\n\r\n  const isAdminCreds = rememberedCreds && rememberedCreds.email && rememberedCreds.email.toLowerCase() === 'lybonerik@gmail.com';\r\n  if (rememberedCreds && rememberedCreds.email && !isAdminCreds) {\r\n    if (authEmail) authEmail.value = rememberedCreds.email;\r\n    if (authPassword && rememberedCreds.password) authPassword.value = rememberedCreds.password;\r\n  } else {\r\n    if (authEmail) authEmail.value = '';\r\n    if (authPassword) authPassword.value = '';\r\n  }\r\n}\r\n\r\nfunction showAdminView() {\r\n  if (!currentUser || currentUser.role !== 'admin') return;\r\n  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));\r\n  document.getElementById('adminView').classList.add('active');\r\n  document.getElementById('backBtn').style.display = 'block';\r\n  document.getElementById('headerBreadcrumb').textContent = '👑 Admin Panel';\r\n  parent.postMessage({ pluginMessage: { type: 'get-admin-data' } }, '*');\r\n}\r\n\r\nfunction renderAdminUserCollections() {\r\n  if (!cachedAdminData) return;\r\n  const select = document.getElementById('adminUserSelect');\r\n  const searchInput = document.getElementById('adminSearchInput');\r\n  const grid = document.getElementById('adminFoldersGrid');\r\n  const selectedUid = select ? select.value : 'ALL';\r\n  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';\r\n\r\n  grid.innerHTML = '';\r\n  let matchingUsers = cachedAdminData.allUsersData || [];\r\n  if (selectedUid !== 'ALL') {\r\n    matchingUsers = matchingUsers.filter(u => u.user.uid === selectedUid);\r\n  }\r\n\r\n  if (query) {\r\n    matchingUsers = matchingUsers.filter(uData => {\r\n      const emailMatch = (uData.user.email || '').toLowerCase().includes(query);\r\n      const nameMatch = (uData.user.name || '').toLowerCase().includes(query);\r\n      const folderMatch = (uData.folders || []).some(f => (f.name || '').toLowerCase().includes(query));\r\n      return emailMatch || nameMatch || folderMatch;\r\n    });\r\n  }\r\n\r\n  if (!matchingUsers.length) {\r\n    grid.innerHTML = `<div style=\"font-size:11px;color:#64748B;padding:20px;text-align:center;background:#FFFFFF;border:1px dashed #CBD5E1;border-radius:6px\">No users or collections match your filter criteria.</div>`;\r\n    return;\r\n  }\r\n\r\n  matchingUsers.forEach((uData, index) => {\r\n    const userBlock = document.createElement('div');\r\n    userBlock.style.background = '#FFFFFF';\r\n    userBlock.style.border = '1px solid #E2E8F0';\r\n    userBlock.style.borderRadius = '8px';\r\n    userBlock.style.padding = '12px';\r\n    userBlock.style.marginBottom = '12px';\r\n    userBlock.style.transition = 'all 0.15s ease';\r\n    userBlock.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';\r\n\r\n    const displayName = (uData.user.name && uData.user.name.toLowerCase() !== (uData.user.email || '').toLowerCase())\r\n      ? `${escapeHtml(uData.user.name)} (${escapeHtml(uData.user.email)})`\r\n      : escapeHtml(uData.user.email);\r\n\r\n    const isUserAdmin = uData.user.role === 'admin';\r\n    const userBadgeBg = isUserAdmin ? 'rgba(124,58,237,0.08)' : 'rgba(79,70,229,0.08)';\r\n    const userBadgeColor = isUserAdmin ? '#7C3AED' : '#4F46E5';\r\n    const userBadgeBorder = isUserAdmin ? '1px solid rgba(124,58,237,0.25)' : '1px solid rgba(79,70,229,0.25)';\r\n\r\n    userBlock.innerHTML = `\r\n      <div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:10px;border-bottom:1px solid #E2E8F0;margin-bottom:10px\">\r\n        <div style=\"display:flex;align-items:center;gap:10px;min-width:0\">\r\n          <div style=\"width:24px;height:24px;border-radius:6px;background:${isUserAdmin ? 'linear-gradient(135deg,#7C3AED,#EC4899)' : 'linear-gradient(135deg,#6366F1,#8B5CF6)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0\">\r\n            ${index + 1}\r\n          </div>\r\n          <div style=\"min-width:0\">\r\n            <div style=\"font-size:12px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">\r\n              ${index + 1}. ${displayName}\r\n            </div>\r\n            <div style=\"font-size:10px;color:#64748B;margin-top:2px\">\r\n              ${uData.foldersCount} collection folder${uData.foldersCount !== 1 ? 's' : ''} • ${uData.stylesCount} total frame${uData.stylesCount !== 1 ? 's' : ''}\r\n            </div>\r\n          </div>\r\n        </div>\r\n        <div style=\"font-size:9px;font-weight:700;color:${userBadgeColor};background:${userBadgeBg};border:${userBadgeBorder};padding:2px 8px;border-radius:4px;text-transform:uppercase;flex-shrink:0\">\r\n          ${isUserAdmin ? '👑 Admin' : 'User'}\r\n        </div>\r\n      </div>\r\n      <div class=\"user-collections-container\" id=\"user-collections-${uData.user.uid}\">\r\n      </div>\r\n    `;\r\n\r\n    grid.appendChild(userBlock);\r\n\r\n    const collectionsContainer = userBlock.querySelector(`#user-collections-${uData.user.uid}`);\r\n\r\n    if (!uData.folders || !uData.folders.length) {\r\n      const emptyMsg = document.createElement('div');\r\n      emptyMsg.style.fontSize = '10px';\r\n      emptyMsg.style.color = '#64748B';\r\n      emptyMsg.style.padding = '8px 10px';\r\n      emptyMsg.style.background = '#F8FAFC';\r\n      emptyMsg.style.border = '1px dashed #CBD5E1';\r\n      emptyMsg.style.borderRadius = '6px';\r\n      emptyMsg.innerHTML = '📁 No collection folders created by this user yet.';\r\n      collectionsContainer.appendChild(emptyMsg);\r\n    } else {\r\n      const cardsGrid = document.createElement('div');\r\n      cardsGrid.style.display = 'grid';\r\n      cardsGrid.style.gridTemplateColumns = 'repeat(1, 1fr)';\r\n      cardsGrid.style.gap = '8px';\r\n\r\n      uData.folders.forEach(folder => {\r\n        const card = document.createElement('div');\r\n        card.className = 'card';\r\n        card.style.background = '#F8FAFC';\r\n        card.style.border = '1px solid #E2E8F0';\r\n        card.style.borderRadius = '6px';\r\n        card.style.padding = '10px 12px';\r\n        card.style.cursor = 'pointer';\r\n\r\n        const count = folder.styles ? folder.styles.length : 0;\r\n        card.innerHTML = `\r\n          <div class=\"card-header\" style=\"margin-bottom:4px\">\r\n            <div class=\"card-title\" style=\"font-size:12px;font-weight:600;color:#0F172A;display:flex;align-items:center;gap:6px\">\r\n              <span>📁</span> ${escapeHtml(folder.name)}\r\n            </div>\r\n            <button class=\"card-btn\" style=\"font-size:9px;padding:3px 8px;background:rgba(99,102,241,0.08);color:#4F46E5;border-color:rgba(99,102,241,0.25)\">View Frames →</button>\r\n          </div>\r\n          <div class=\"card-meta\" style=\"font-size:10px;color:#64748B;margin-left:22px\">${count} frame${count !== 1 ? 's' : ''} inside this collection</div>\r\n        `;\r\n        card.onclick = () => showFolderDetail(folder.folderId);\r\n        cardsGrid.appendChild(card);\r\n      });\r\n\r\n      collectionsContainer.appendChild(cardsGrid);\r\n    }\r\n  });\r\n}\r\n\r\nfunction saveAsStarterTemplate() {\r\n  parent.postMessage({ pluginMessage: { type: 'set-starter-template' } }, '*');\r\n}\r\n\r\n// Default preview/generate configuration used by `requestPreview` and `generateFooter`.\r\n// Update these values to change the default content used for previews and generated footers.\r\nconst DEFAULT_PREVIEW_CONFIG = {\r\n  company: 'Logo',\r\n  tagline: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',\r\n  accent: '#6C63FF',\r\n  newsletter: false,\r\n  copyright: false,\r\n  socials: [],\r\n  iconStyle: 'circle',\r\n  separatorType: 'none',\r\n  customSvgs: {},\r\n};\r\n\r\n// ── View Navigation ─────────────────────────────────────\r\nlet cachedTrashItems = [];\r\n\r\nfunction showTrashView() {\r\n  showFolderList();\r\n  const trashSec = document.getElementById('embeddedTrashSection');\r\n  if (trashSec) {\r\n    trashSec.scrollIntoView({ behavior: 'smooth', block: 'start' });\r\n  }\r\n  parent.postMessage({ pluginMessage: { type: 'get-trash-items' } }, '*');\r\n}\r\n\r\nfunction renderTrashItems(items) {\r\n  cachedTrashItems = items || [];\r\n  const grids = document.querySelectorAll('.trash-grid');\r\n  const emptyBtns = document.querySelectorAll('.empty-trash-btn');\r\n\r\n  if (!grids || !grids.length) return;\r\n\r\n  grids.forEach(grid => {\r\n    grid.querySelectorAll('.card[data-trash-id]').forEach(c => c.remove());\r\n    const noMsg = grid.querySelector('.no-trash-msg');\r\n\r\n    if (!cachedTrashItems || !cachedTrashItems.length) {\r\n      if (noMsg) noMsg.style.display = 'block';\r\n      emptyBtns.forEach(btn => btn.style.display = 'none');\r\n      return;\r\n    }\r\n\r\n    if (noMsg) noMsg.style.display = 'none';\r\n    emptyBtns.forEach(btn => btn.style.display = 'inline-flex');\r\n\r\n    cachedTrashItems.forEach(item => {\r\n      const card = document.createElement('div');\r\n      card.className = 'card trash-card';\r\n      card.setAttribute('data-trash-id', item.trashId);\r\n      card.style.borderColor = '#E2E8F0';\r\n      card.style.background = '#FFFFFF';\r\n      card.style.padding = '10px 12px';\r\n      card.style.borderRadius = '8px';\r\n      card.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';\r\n      card.style.transition = 'all 0.15s ease';\r\n\r\n      const isFolder = item.itemType === 'folder';\r\n      const title = isFolder\r\n        ? (item.data ? (item.data.name || item.data.title || 'Unnamed Collection') : 'Unnamed Collection')\r\n        : (item.data ? (item.data.title || item.data.name || (item.data.nodeData ? item.data.nodeData.name : '') || 'Unnamed Frame') : 'Unnamed Frame');\r\n\r\n      const frameCount = (isFolder && item.data && item.data.styles && Array.isArray(item.data.styles)) ? item.data.styles.length : 0;\r\n      const folderName = item.originalFolderName || (item.data ? item.data.folderName : '') || 'Collection';\r\n      const nodeType = (item.data && item.data.nodeData && item.data.nodeData.type) ? item.data.nodeData.type : 'FRAME';\r\n\r\n      const icon = isFolder \r\n        ? '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#6366F1\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"></path></svg>'\r\n        : (nodeType === 'GROUP' \r\n          ? '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#8B5CF6\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\"></rect><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\"></rect><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\"></rect><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\"></rect></svg>'\r\n          : '<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#059669\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"></circle><polyline points=\"21 15 16 10 5 21\"></polyline></svg>');\r\n      const metaInfo = isFolder\r\n        ? `${frameCount} item${frameCount !== 1 ? 's' : ''}`\r\n        : `from ${escapeHtml(folderName)}`;\r\n\r\n      const dateStr = item.deletedAt ? new Date(item.deletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';\r\n\r\n      card.innerHTML = `\r\n        <div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px\">\r\n          <div style=\"flex:1;min-width:0\">\r\n            <div style=\"display:flex;align-items:center;gap:6px\">\r\n              <span style=\"display:inline-flex;align-items:center;flex-shrink:0\">${icon}</span>\r\n              <div style=\"font-size:12px;font-weight:600;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">${escapeHtml(title)}</div>\r\n            </div>\r\n            <div style=\"font-size:10px;color:#64748B;margin-top:3px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:19px\">\r\n              <span>${metaInfo}</span>\r\n              ${dateStr ? `<span style=\"margin:0 4px;color:#CBD5E1\">•</span><span>${dateStr}</span>` : ''}\r\n            </div>\r\n          </div>\r\n          <div style=\"display:flex;align-items:center;gap:6px;flex-shrink:0\">\r\n            <button class=\"card-btn\" onclick=\"restoreTrashItem('${item.trashId}')\" style=\"color:#059669;border-color:rgba(5,150,105,0.25);background:rgba(5,150,105,0.06);font-size:10px;padding:4px 8px;font-weight:600;border-radius:5px;display:inline-flex;align-items:center;gap:4px\">\r\n              <svg width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"1 4 1 10 7 10\"></polyline><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"></path></svg>\r\n              <span>Restore</span>\r\n            </button>\r\n            <button class=\"card-btn\" onclick=\"deleteTrashPermanently('${item.trashId}')\" style=\"color:#64748B;border-color:#E2E8F0;background:#F8FAFC;font-size:10px;padding:4px 8px;font-weight:600;border-radius:5px\" onmouseover=\"this.style.color='#DC2626';this.style.borderColor='rgba(220,38,38,0.3)';this.style.background='rgba(239,68,68,0.06)'\" onmouseout=\"this.style.color='#64748B';this.style.borderColor='#E2E8F0';this.style.background='#F8FAFC'\">Delete</button>\r\n          </div>\r\n        </div>\r\n      `;\r\n\r\n      grid.appendChild(card);\r\n    });\r\n  });\r\n}\r\n\r\nfunction restoreTrashItem(trashId) {\r\n  parent.postMessage({ pluginMessage: { type: 'restore-trash-item', trashId } }, '*');\r\n}\r\n\r\nfunction deleteTrashPermanently(trashId) {\r\n  const item = cachedTrashItems ? cachedTrashItems.find(i => i.trashId === trashId) : null;\r\n  const name = item ? (item.itemType === 'folder' ? (item.data ? item.data.name : 'Collection') : (item.data ? item.data.title : 'Frame')) : 'Item';\r\n  showConfirmModal(\r\n    'Permanently Delete Item?',\r\n    `Are you sure you want to permanently delete \"${escapeHtml(name || 'Item')}\"? This action CANNOT be undone!`,\r\n    'Permanently Delete',\r\n    () => {\r\n      parent.postMessage({ pluginMessage: { type: 'delete-trash-permanently', trashId } }, '*');\r\n    },\r\n    true,\r\n    2\r\n  );\r\n}\r\n\r\nfunction emptyTrashCan() {\r\n  if (!cachedTrashItems || cachedTrashItems.length === 0) return;\r\n  const count = cachedTrashItems.length;\r\n  showConfirmModal(\r\n    'Empty Trashcan?',\r\n    `Are you sure you want to permanently delete all ${count} item(s) in the trash? This action CANNOT be undone!`,\r\n    'Empty Trash',\r\n    () => {\r\n      parent.postMessage({ pluginMessage: { type: 'empty-trash' } }, '*');\r\n    },\r\n    true,\r\n    2\r\n  );\r\n}\r\n\r\nfunction exportBackupJSON() {\r\n  if (!isProUser) {\r\n    showProPaywallModal('json-backup');\r\n    return;\r\n  }\r\n  parent.postMessage({ pluginMessage: { type: 'export-backup' } }, '*');\r\n}\r\n\r\nfunction triggerImportBackup() {\r\n  if (!isProUser) {\r\n    showProPaywallModal('json-backup');\r\n    return;\r\n  }\r\n  const input = document.getElementById('importBackupInput');\r\n  if (input) input.click();\r\n}\r\n\r\nfunction handleImportBackupFile(event) {\r\n  const file = event.target.files ? event.target.files[0] : null;\r\n  if (!file) return;\r\n  const reader = new FileReader();\r\n  reader.onload = function(e) {\r\n    try {\r\n      const data = JSON.parse(e.target.result);\r\n      if (data && (Array.isArray(data.folders) || Array.isArray(data.styles) || Array.isArray(data))) {\r\n        const foldersToImport = data.folders || (Array.isArray(data) ? data : []);\r\n        parent.postMessage({\r\n          pluginMessage: {\r\n            type: 'import-backup',\r\n            folders: foldersToImport,\r\n            trash: data.trash || []\r\n          }\r\n        }, '*');\r\n      } else {\r\n        alert('Invalid backup file format.');\r\n      }\r\n    } catch (err) {\r\n      alert('Error parsing backup file: ' + err.message);\r\n    }\r\n    event.target.value = '';\r\n  };\r\n  reader.readAsText(file);\r\n}\r\n\r\nfunction updateHeaderTitle(name) {\r\n  const titleEl = document.getElementById('headerTitle');\r\n  if (!titleEl) return;\r\n  const trimmed = name ? name.trim() : '';\r\n  if (trimmed && trimmed.toLowerCase() !== 'guest' && trimmed.toLowerCase() !== 'local user') {\r\n    const sSuffix = (trimmed.endsWith('s') || trimmed.endsWith('S')) ? \"'\" : \"'s\";\r\n    titleEl.textContent = `${trimmed}${sSuffix} Diary`;\r\n  } else {\r\n    titleEl.textContent = \"Asset's Diary\";\r\n  }\r\n}\r\n\r\nfunction showFolderList() {\r\n  currentFolderId = null;\r\n  selectedStyleId = null;\r\n  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));\r\n  document.getElementById('folderListView').classList.add('active');\r\n  document.getElementById('backBtn').style.display = 'none';\r\n  document.getElementById('headerBreadcrumb').textContent = currentUser ? 'Manage Collections' : 'Account Access';\r\n  updateFoldersList();\r\n  parent.postMessage({ pluginMessage: { type: 'request-styles' } }, '*');\r\n  parent.postMessage({ pluginMessage: { type: 'get-trash-items' } }, '*');\r\n}\r\n\r\nfunction showFolderDetail(folderId) {\r\n  let folder = allFolders.find(f => f.folderId === folderId);\r\n  if (!folder && cachedAdminData && cachedAdminData.allUsersData) {\r\n    for (const uData of cachedAdminData.allUsersData) {\r\n      if (uData.folders) {\r\n        const found = uData.folders.find(f => f.folderId === folderId);\r\n        if (found) { folder = found; break; }\r\n      }\r\n    }\r\n  }\r\n  if (!folder) return;\r\n  \r\n  currentFolderId = folderId;\r\n  selectedStyleIds = [];\r\n  selectedStyleId = null;\r\n  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));\r\n  document.getElementById('folderDetailView').classList.add('active');\r\n  document.getElementById('backBtn').style.display = 'block';\r\n  document.getElementById('headerBreadcrumb').textContent = folder.name;\r\n  updateStylesList();\r\n  updateSelectedFrameCard();\r\n  updateImportBtnLabel();\r\n}\r\n\r\nlet selectedFolderIds = new Set();\r\nlet deleteCountdownTimer = null;\r\nlet deleteCountdownSeconds = 3;\r\n\r\nfunction toggleSelectFolder(folderId, event) {\r\n  if (event) event.stopPropagation();\r\n  if (selectedFolderIds.has(folderId)) {\r\n    selectedFolderIds.delete(folderId);\r\n  } else {\r\n    selectedFolderIds.add(folderId);\r\n  }\r\n  updateFoldersList();\r\n}\r\n\r\nfunction toggleSelectAllFolders() {\r\n  if (selectedFolderIds.size === allFolders.length && allFolders.length > 0) {\r\n    selectedFolderIds.clear();\r\n  } else {\r\n    allFolders.forEach(f => selectedFolderIds.add(f.folderId));\r\n  }\r\n  updateFoldersList();\r\n}\r\n\r\n// Global Ctrl+A / Cmd+A Shortcut Listener\r\nwindow.addEventListener('keydown', (e) => {\r\n  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {\r\n    const activeView = document.querySelector('.view.active');\r\n    if (activeView && activeView.id === 'folderListView') {\r\n      const activeEl = document.activeElement;\r\n      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {\r\n        return;\r\n      }\r\n      e.preventDefault();\r\n      toggleSelectAllFolders();\r\n    }\r\n  }\r\n});\r\n\r\nfunction triggerBulkDeleteCountdown() {\r\n  if (selectedFolderIds.size === 0) return;\r\n  const count = selectedFolderIds.size;\r\n  const modal = document.getElementById('countdownModalOverlay');\r\n  const countEl = document.getElementById('countdownFolderCount');\r\n  const timerDisplay = document.getElementById('countdownSecDisplay');\r\n  const confirmBtnText = document.getElementById('confirmDeleteBtnText');\r\n\r\n  if (countEl) countEl.textContent = count;\r\n\r\n  if (deleteCountdownTimer) {\r\n    clearInterval(deleteCountdownTimer);\r\n    deleteCountdownTimer = null;\r\n  }\r\n\r\n  deleteCountdownSeconds = 3;\r\n  if (timerDisplay) {\r\n    timerDisplay.textContent = '3';\r\n    timerDisplay.style.transform = 'scale(1)';\r\n  }\r\n  if (confirmBtnText) confirmBtnText.textContent = 'Delete Now (3s)';\r\n\r\n  if (modal) modal.classList.add('active');\r\n\r\n  deleteCountdownTimer = setInterval(() => {\r\n    deleteCountdownSeconds -= 1;\r\n    if (timerDisplay) {\r\n      timerDisplay.textContent = String(Math.max(deleteCountdownSeconds, 0));\r\n      timerDisplay.style.transform = 'scale(1.25)';\r\n      setTimeout(() => { if (timerDisplay) timerDisplay.style.transform = 'scale(1)'; }, 150);\r\n    }\r\n    if (confirmBtnText) {\r\n      confirmBtnText.textContent = `Delete Now (${Math.max(deleteCountdownSeconds, 0)}s)`;\r\n    }\r\n\r\n    if (deleteCountdownSeconds <= 0) {\r\n      clearInterval(deleteCountdownTimer);\r\n      deleteCountdownTimer = null;\r\n      executeBulkDeleteNow();\r\n    }\r\n  }, 1000);\r\n}\r\n\r\nfunction executeBulkDeleteNow() {\r\n  if (deleteCountdownTimer) {\r\n    clearInterval(deleteCountdownTimer);\r\n    deleteCountdownTimer = null;\r\n  }\r\n  if (selectedFolderIds.size === 0) return;\r\n  const modal = document.getElementById('countdownModalOverlay');\r\n  if (modal) modal.classList.remove('active');\r\n\r\n  const count = selectedFolderIds.size;\r\n  parent.postMessage({\r\n    pluginMessage: {\r\n      type: 'delete-folders-batch',\r\n      folderIds: Array.from(selectedFolderIds)\r\n    }\r\n  }, '*');\r\n  selectedFolderIds.clear();\r\n  updateFoldersList();\r\n}\r\n\r\nfunction triggerSingleDeleteCountdown(folderId, event) {\r\n  if (event) event.stopPropagation();\r\n  selectedFolderIds.clear();\r\n  selectedFolderIds.add(folderId);\r\n  updateFoldersList();\r\n  triggerBulkDeleteCountdown();\r\n}\r\n\r\nfunction cancelBulkDeleteCountdown() {\r\n  if (deleteCountdownTimer) {\r\n    clearInterval(deleteCountdownTimer);\r\n    deleteCountdownTimer = null;\r\n  }\r\n  const modal = document.getElementById('countdownModalOverlay');\r\n  if (modal) modal.classList.remove('active');\r\n}\r\n\r\n// ── UI Updates ────────────────────────────────────────\r\nfunction updateFoldersList() {\r\n  allFolders = normalizeFolders(allFolders);\r\n  const grid = document.getElementById('foldersGrid');\r\n  const noMsg = document.getElementById('noFoldersMsg');\r\n\r\n  // Clear grid\r\n  grid.querySelectorAll('.card[data-folder-id]').forEach(c => c.remove());\r\n\r\n  if (!allFolders || !allFolders.length) {\r\n    noMsg.style.display = 'block';\r\n    selectedFolderIds.clear();\r\n    const bulkBtn = document.getElementById('bulkDeleteBtn');\r\n    if (bulkBtn) bulkBtn.style.display = 'none';\r\n    const bulkActionBar = document.getElementById('bulkActionBar');\r\n    if (bulkActionBar) bulkActionBar.style.display = 'none';\r\n    return;\r\n  }\r\n\r\n  noMsg.style.display = 'none';\r\n  allFolders.forEach(folder => {\r\n    const card = document.createElement('div');\r\n    const isSelected = selectedFolderIds.has(folder.folderId);\r\n    card.className = 'card' + (isSelected ? ' active' : '');\r\n    card.setAttribute('data-folder-id', folder.folderId);\r\n\r\n    const count = folder.styles ? folder.styles.length : 0;\r\n    card.innerHTML = `\r\n      <div class=\"card-header\">\r\n        <div style=\"display:flex;align-items:center;gap:8px;flex:1;min-width:0\">\r\n          <input type=\"checkbox\" ${isSelected ? 'checked' : ''} onclick=\"toggleSelectFolder('${folder.folderId}', event)\" style=\"cursor:pointer;accent-color:#6C63FF;transform:scale(1.15)\" />\r\n          <div class=\"card-title\" style=\"white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">${escapeHtml(folder.name)}</div>\r\n        </div>\r\n        <div class=\"card-actions\">\r\n          <button class=\"card-btn\" onclick=\"event.stopPropagation(); showRenameFolderModal('${folder.folderId}')\">Rename</button>\r\n          <button class=\"card-btn\" onclick=\"triggerSingleDeleteCountdown('${folder.folderId}', event)\" style=\"color:#DC2626;border-color:rgba(220,38,38,0.3)\">Delete</button>\r\n        </div>\r\n      </div>\r\n      <div class=\"card-meta\" style=\"padding-left:22px\">${count} frame${count !== 1 ? 's' : ''}</div>\r\n    `;\r\n\r\n    card.onclick = (e) => {\r\n      if (e.shiftKey || e.ctrlKey || e.metaKey) {\r\n        toggleSelectFolder(folder.folderId, e);\r\n      } else {\r\n        showFolderDetail(folder.folderId);\r\n      }\r\n    };\r\n    grid.appendChild(card);\r\n  });\r\n\r\n  // Update Toolbar & Sticky Action Bar States\r\n  const bulkBtn = document.getElementById('bulkDeleteBtn');\r\n  const bulkCount = document.getElementById('bulkDeleteCount');\r\n  const bulkActionBar = document.getElementById('bulkActionBar');\r\n  const bulkBarCount = document.getElementById('bulkBarCount');\r\n  const selectAllBtn = document.getElementById('selectAllFoldersBtn');\r\n\r\n  const isMultiple = selectedFolderIds.size > 1;\r\n\r\n  if (bulkBtn && bulkCount) {\r\n    if (isMultiple) {\r\n      bulkBtn.style.display = 'inline-flex';\r\n      bulkCount.textContent = selectedFolderIds.size;\r\n    } else {\r\n      bulkBtn.style.display = 'none';\r\n    }\r\n  }\r\n\r\n  if (bulkActionBar && bulkBarCount) {\r\n    if (isMultiple) {\r\n      bulkActionBar.style.display = 'flex';\r\n      bulkBarCount.textContent = selectedFolderIds.size;\r\n    } else {\r\n      bulkActionBar.style.display = 'none';\r\n    }\r\n  }\r\n\r\n  if (selectAllBtn) {\r\n    selectAllBtn.textContent = (selectedFolderIds.size === allFolders.length && allFolders.length > 0) ? 'Deselect All' : 'Select All (Ctrl+A)';\r\n  }\r\n}\r\n\r\nfunction updateStylesList() {\r\n  let folder = allFolders.find(f => f.folderId === currentFolderId);\r\n  if (!folder && cachedAdminData && cachedAdminData.allUsersData) {\r\n    for (const uData of cachedAdminData.allUsersData) {\r\n      if (uData.folders) {\r\n        const found = uData.folders.find(f => f.folderId === currentFolderId);\r\n        if (found) { folder = found; break; }\r\n      }\r\n    }\r\n  }\r\n  if (!folder) return;\r\n  \r\n  const grid = document.getElementById('stylesGrid');\r\n  const noMsg = document.getElementById('noStylesMsg');\r\n  \r\n  grid.querySelectorAll('.card[data-style-id]').forEach(c => c.remove());\r\n  \r\n  const styles = folder.styles || [];\r\n  if (!styles.length) {\r\n    noMsg.style.display = 'block';\r\n    return;\r\n  }\r\n  \r\n  noMsg.style.display = 'none';\r\n  \r\n  styles.forEach(style => {\r\n    const card = document.createElement('div');\r\n    card.className = 'card';\r\n    card.setAttribute('data-style-id', style.styleId);\r\n    \r\n    const styleTitle = style.title || style.name || 'Saved Element';\r\n    const imgSrc = style.previewData \r\n      ? 'data:image/png;base64,' + style.previewData\r\n      : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';\r\n\r\n    card.innerHTML = `\r\n      <div class=\"preview-box\">\r\n        <img class=\"thumb\" src=\"${imgSrc}\" alt=\"preview-${style.styleId}\" />\r\n      </div>\r\n      <div style=\"display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:2px\">\r\n        <div style=\"display:flex;align-items:center;gap:4px;flex:1;min-width:0\">\r\n          <div style=\"font-size:12px;font-weight:700;color:#000000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\" title=\"${escapeHtml(styleTitle)}\">${escapeHtml(styleTitle)}</div>\r\n          <button type=\"button\" class=\"icon-edit-btn\" title=\"Rename frame\" onclick=\"event.stopPropagation(); showRenameStyleModal('${currentFolderId}', '${style.styleId}')\">\r\n            <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"></path><path d=\"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"></path></svg>\r\n          </button>\r\n        </div>\r\n        <button type=\"button\" class=\"card-btn\" onclick=\"event.stopPropagation(); showDeleteStyleModal('${style.styleId}')\">Delete</button>\r\n      </div>\r\n      <div style=\"font-size:10px;font-weight:600;color:#4F46E5;margin-bottom:6px\">${(style.width && style.height) ? `${Math.round(style.width)} × ${Math.round(style.height)} px` : ''}</div>\r\n      <div style=\"font-size:10px;color:#64748B\">Saved ${style.createdAt ? new Date(style.createdAt).toLocaleDateString() : ''}</div>\r\n    `;\r\n    \r\n    card.classList.toggle('active', selectedStyleIds.includes(style.styleId));\r\n    card.onclick = (e) => pickStyle(style.styleId, card, e);\r\n    grid.appendChild(card);\r\n    \r\n    if (!style.previewData) {\r\n      requestPreview(currentFolderId, style.styleId);\r\n    }\r\n  });\r\n}\r\n\r\nfunction pickStyle(styleId, element, event) {\r\n  const isMultiKey = event && (event.ctrlKey || event.metaKey || event.shiftKey);\r\n\r\n  if (isMultiKey) {\r\n    const idx = selectedStyleIds.indexOf(styleId);\r\n    if (idx !== -1) {\r\n      selectedStyleIds.splice(idx, 1);\r\n    } else {\r\n      selectedStyleIds.push(styleId);\r\n    }\r\n  } else {\r\n    selectedStyleIds = [styleId];\r\n  }\r\n\r\n  selectedStyleId = selectedStyleIds[0] || null;\r\n\r\n  document.querySelectorAll('#stylesGrid .card[data-style-id]').forEach(c => {\r\n    const sid = c.getAttribute('data-style-id');\r\n    c.classList.toggle('active', selectedStyleIds.includes(sid));\r\n  });\r\n\r\n  updateImportBtnLabel();\r\n}\r\n\r\nfunction updateImportBtnLabel() {\r\n  const btn = document.getElementById('genBtn');\r\n  if (!btn) return;\r\n  if (selectedStyleIds.length > 1) {\r\n    btn.textContent = `Bring ${selectedStyleIds.length} frames to canvas ↘`;\r\n  } else {\r\n    btn.textContent = 'Bring this to canvas ↘';\r\n  }\r\n}\r\n\r\nfunction updateSelectedFrameCard() {\r\n  const card = document.getElementById('selectedFrameCard');\r\n  if (!card) return;\r\n  const frameName = document.getElementById('selectedFrameName');\r\n  const frameSize = document.getElementById('selectedFrameSize');\r\n  const addBtn = document.getElementById('addSelectedBtn');\r\n  const addMultiBtn = document.getElementById('addSelectedMultiBtn');\r\n  const framesList = document.getElementById('selectedFramesList');\r\n  const frameListItems = document.getElementById('frameListItems');\r\n  const badge = document.getElementById('selectedFrameBadge');\r\n  \r\n  card.style.display = 'block';\r\n\r\n  if (selectedFramesInfo && selectedFramesInfo.length > 1) {\r\n    // Multiple elements selected\r\n    if (badge) { badge.textContent = `${selectedFramesInfo.length} ELEMENTS READY`; badge.style.background = '#A855F7'; }\r\n    if (frameName) frameName.textContent = `${selectedFramesInfo.length} Canvas Elements Selected`;\r\n    if (frameSize) frameSize.style.display = 'none';\r\n    if (framesList) framesList.style.display = 'block';\r\n    \r\n    if (frameListItems) {\r\n      frameListItems.innerHTML = '';\r\n      selectedFramesInfo.forEach((frame, index) => {\r\n        const item = document.createElement('div');\r\n        item.style.padding = '4px 0';\r\n        const typeLabel = frame.type ? frame.type.replace('_', ' ') : 'ELEMENT';\r\n        item.textContent = `${index + 1}. ${frame.name} (${typeLabel} • ${Math.round(frame.width)} × ${Math.round(frame.height)} px)`;\r\n        frameListItems.appendChild(item);\r\n      });\r\n    }\r\n    \r\n    if (addBtn) addBtn.style.display = 'none';\r\n    if (addMultiBtn) {\r\n      addMultiBtn.style.display = 'flex';\r\n      addMultiBtn.textContent = `＋ Save ${selectedFramesInfo.length} Selected Elements`;\r\n    }\r\n  } else if (selectedFrameInfo) {\r\n    // Single element selected (Component, Group, Frame, Instance, Text, etc.)\r\n    const rawType = selectedFrameInfo.type || 'ELEMENT';\r\n    const typeLabel = rawType.replace('_', ' ');\r\n    if (badge) { badge.textContent = `${typeLabel} READY`; badge.style.background = '#22C55E'; }\r\n    if (frameName) frameName.textContent = selectedFrameInfo.name;\r\n    if (frameSize) {\r\n      frameSize.textContent = `${typeLabel} • ${Math.round(selectedFrameInfo.width)} × ${Math.round(selectedFrameInfo.height)} px`;\r\n      frameSize.style.display = 'block';\r\n    }\r\n    if (framesList) framesList.style.display = 'none';\r\n    \r\n    if (addBtn) {\r\n      addBtn.style.display = 'flex';\r\n      addBtn.textContent = `＋ Save ${typeLabel.toLowerCase()}`;\r\n    }\r\n    if (addMultiBtn) addMultiBtn.style.display = 'none';\r\n  } else {\r\n    // No selection or waiting for selection\r\n    if (badge) { badge.textContent = 'ELEMENT SELECTION'; badge.style.background = '#6C63FF'; }\r\n    if (frameName) frameName.textContent = 'Save Selection to Collection';\r\n    if (frameSize) {\r\n      frameSize.textContent = 'Select any component, group, frame, or element on canvas.';\r\n      frameSize.style.display = 'block';\r\n    }\r\n    if (framesList) framesList.style.display = 'none';\r\n    \r\n    if (addBtn) {\r\n      addBtn.style.display = 'flex';\r\n      addBtn.textContent = '＋ Save Element';\r\n    }\r\n    if (addMultiBtn) addMultiBtn.style.display = 'none';\r\n  }\r\n}\r\n\r\n// ── Import & Actions ──────────────────────────────────\r\nfunction importStyle() {\r\n  const btn = document.getElementById('genBtn');\r\n  const status = document.getElementById('status');\r\n  \r\n  if (!currentFolderId || selectedStyleIds.length === 0) {\r\n    status.textContent = '✗ Select one or more frames to send to canvas';\r\n    status.className = 'status err';\r\n    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);\r\n    return;\r\n  }\r\n  \r\n  btn.disabled = true;\r\n  btn.textContent = selectedStyleIds.length > 1\r\n    ? `Sending ${selectedStyleIds.length} frames to figma canvas…`\r\n    : 'Sending to figma canvas…';\r\n  status.textContent = '';\r\n  status.className = 'status';\r\n  \r\n  parent.postMessage({\r\n    pluginMessage: {\r\n      type: 'generate',\r\n      folderId: currentFolderId,\r\n      styleId: selectedStyleIds[0],\r\n      styleIds: selectedStyleIds,\r\n      config: { ...DEFAULT_PREVIEW_CONFIG }\r\n    }\r\n  }, '*');\r\n}\r\n\r\nlet saveTimeoutTimer = null;\r\n\r\nfunction resetSaveButtons() {\r\n  isSavingFrame = false;\r\n  if (saveTimeoutTimer) {\r\n    clearTimeout(saveTimeoutTimer);\r\n    saveTimeoutTimer = null;\r\n  }\r\n  const addBtn = document.getElementById('addSelectedBtn');\r\n  const addMultiBtn = document.getElementById('addSelectedMultiBtn');\r\n  const genBtn = document.getElementById('genBtn');\r\n  if (addBtn) addBtn.disabled = false;\r\n  if (addMultiBtn) addMultiBtn.disabled = false;\r\n  if (genBtn) {\r\n    genBtn.disabled = false;\r\n    updateImportBtnLabel();\r\n  }\r\n  updateSelectedFrameCard();\r\n}\r\n\r\nfunction addSelectedFooter() {\r\n  if (isSavingFrame) return;\r\n  const targetFolderId = currentFolderId || (allFolders && allFolders[0] ? allFolders[0].folderId : null);\r\n  isSavingFrame = true;\r\n  const addSelectedBtn = document.getElementById('addSelectedBtn');\r\n  if (addSelectedBtn) {\r\n    addSelectedBtn.disabled = true;\r\n    addSelectedBtn.textContent = 'Saving…';\r\n  }\r\n\r\n  if (saveTimeoutTimer) clearTimeout(saveTimeoutTimer);\r\n  saveTimeoutTimer = setTimeout(() => {\r\n    resetSaveButtons();\r\n    const status = document.getElementById('status');\r\n    if (status) {\r\n      status.textContent = '⚠️ Save operation timed out. Please try again.';\r\n      status.className = 'status err';\r\n      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);\r\n    }\r\n  }, 12000);\r\n\r\n  const driveFolderId = (document.getElementById('driveFolderId') || {}).value || '';\r\n  const driveToken = (document.getElementById('driveToken') || {}).value || '';\r\n  const refreshToken = (document.getElementById('refreshToken') || {}).value || '';\r\n  const clientId = (document.getElementById('clientId') || {}).value || '';\r\n  const clientSecret = (document.getElementById('clientSecret') || {}).value || '';\r\n  parent.postMessage({\r\n    pluginMessage: {\r\n      type: 'add-selected-footer',\r\n      folderId: targetFolderId,\r\n      driveFolderId,\r\n      driveToken,\r\n      refreshToken,\r\n      clientId,\r\n      clientSecret\r\n    }\r\n  }, '*');\r\n}\r\n\r\nfunction addSelectedMultipleFooters() {\r\n  if (isSavingFrame) return;\r\n  const targetFolderId = currentFolderId || (allFolders && allFolders[0] ? allFolders[0].folderId : null);\r\n  isSavingFrame = true;\r\n  const addMultiBtn = document.getElementById('addSelectedMultiBtn');\r\n  if (addMultiBtn) {\r\n    addMultiBtn.disabled = true;\r\n    addMultiBtn.textContent = 'Saving…';\r\n  }\r\n\r\n  if (saveTimeoutTimer) clearTimeout(saveTimeoutTimer);\r\n  saveTimeoutTimer = setTimeout(() => {\r\n    resetSaveButtons();\r\n    const status = document.getElementById('status');\r\n    if (status) {\r\n      status.textContent = '⚠️ Save operation timed out. Please try again.';\r\n      status.className = 'status err';\r\n      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);\r\n    }\r\n  }, 15000);\r\n\r\n  const driveFolderId = (document.getElementById('driveFolderId') || {}).value || '';\r\n  const driveToken = (document.getElementById('driveToken') || {}).value || '';\r\n  const refreshToken = (document.getElementById('refreshToken') || {}).value || '';\r\n  const clientId = (document.getElementById('clientId') || {}).value || '';\r\n  const clientSecret = (document.getElementById('clientSecret') || {}).value || '';\r\n  parent.postMessage({\r\n    pluginMessage: {\r\n      type: 'add-selected-footers',\r\n      folderId: targetFolderId,\r\n      driveFolderId,\r\n      driveToken,\r\n      refreshToken,\r\n      clientId,\r\n      clientSecret\r\n    }\r\n  }, '*');\r\n}\r\n\r\nfunction createNewFolder() {\r\n  if (!isProUser && allFolders.length >= 2) {\r\n    showProPaywallModal('folder');\r\n    return;\r\n  }\r\n  console.log('[UI] createNewFolder called');\r\n  const input = document.getElementById('newFolderName');\r\n  if (!input) {\r\n    console.error('[UI] newFolderName input element not found!');\r\n    return;\r\n  }\r\n  const name = input.value.trim();\r\n  console.log('[UI] Input value:', name);\r\n  if (!name) {\r\n    console.warn('[UI] Empty folder name, highlighting input');\r\n    input.classList.add('input-error');\r\n    input.focus();\r\n    setTimeout(() => input.classList.remove('input-error'), 1400);\r\n    return;\r\n  }\r\n  console.log('[UI] Posting create-folder message to backend with name:', name);\r\n  parent.postMessage({\r\n    pluginMessage: { type: 'create-folder', name }\r\n  }, '*');\r\n  input.value = '';\r\n}\r\n\r\n// ── Modal Dialogs ──────────────────────────────────────\r\nfunction showRenameFolderModal(folderId) {\r\n  const folder = allFolders.find(f => f.folderId === folderId);\r\n  if (!folder) return;\r\n  \r\n  pendingModalAction = (newName) => renameFolder(folderId, newName);\r\n  document.getElementById('modalTitle').textContent = 'Rename Collection';\r\n  document.getElementById('modalMessage').textContent = 'Enter a new name:';\r\n  document.getElementById('modalInputField').style.display = 'block';\r\n  const input = document.getElementById('modalInput');\r\n  input.value = folder.name;\r\n  input.focus();\r\n  input.select();\r\n  \r\n  const btn = document.getElementById('modalConfirmBtn');\r\n  btn.textContent = 'Rename';\r\n  btn.className = 'modal-btn primary';\r\n  \r\n  document.getElementById('confirmModal').classList.add('active');\r\n}\r\n\r\nfunction showRenameStyleModal(folderId, styleId) {\r\n  let fId = folderId || currentFolderId;\r\n  let folder = fId ? allFolders.find(f => f.folderId === fId) : null;\r\n  if (!folder) {\r\n    folder = allFolders.find(f => f.styles && f.styles.some(s => s.styleId === styleId));\r\n    if (folder) fId = folder.folderId;\r\n  }\r\n  if (!folder || !folder.styles) return;\r\n  const style = folder.styles.find(s => s.styleId === styleId);\r\n  if (!style) return;\r\n\r\n  pendingModalAction = (newName) => renameStyle(fId, styleId, newName);\r\n  document.getElementById('modalTitle').textContent = 'Rename Frame';\r\n  document.getElementById('modalMessage').textContent = 'Enter a new name for this frame:';\r\n  document.getElementById('modalInputField').style.display = 'block';\r\n  const input = document.getElementById('modalInput');\r\n  input.value = style.title || '';\r\n  input.focus();\r\n  input.select();\r\n  \r\n  const btn = document.getElementById('modalConfirmBtn');\r\n  btn.textContent = 'Rename';\r\n  btn.className = 'modal-btn primary';\r\n  \r\n  document.getElementById('confirmModal').classList.add('active');\r\n}\r\n\r\nfunction showDeleteFolderModal(folderId) {\r\n  const folder = allFolders.find(f => f.folderId === folderId);\r\n  if (!folder) return;\r\n  \r\n  showConfirmModal(\r\n    'Delete Collection?',\r\n    `Are you sure you want to delete \"${folder.name}\" and all its saved frames? This cannot be undone.`,\r\n    'Delete',\r\n    () => deleteFolder(folderId),\r\n    true\r\n  );\r\n}\r\n\r\n\r\n\r\nfunction showDeleteStyleModal(styleId) {\r\n  let fId = currentFolderId;\r\n  let folder = fId ? allFolders.find(f => f.folderId === fId) : null;\r\n  if (!folder) {\r\n    folder = allFolders.find(f => f.styles && f.styles.some(s => s.styleId === styleId));\r\n    if (folder) fId = folder.folderId;\r\n  }\r\n  if (!folder) return;\r\n  \r\n  let targetStyleIds = [];\r\n  if (selectedStyleIds.length > 1) {\r\n    targetStyleIds = [...selectedStyleIds];\r\n    if (!targetStyleIds.includes(styleId)) {\r\n      targetStyleIds.push(styleId);\r\n    }\r\n  } else {\r\n    targetStyleIds = [styleId];\r\n  }\r\n\r\n  if (targetStyleIds.length > 1) {\r\n    showConfirmModal(\r\n      `Delete ${targetStyleIds.length} Frames?`,\r\n      `Are you sure you want to delete ${targetStyleIds.length} selected frames?`,\r\n      `Delete ${targetStyleIds.length} Frames`,\r\n      () => deleteStyles(targetStyleIds),\r\n      true,\r\n      0\r\n    );\r\n  } else {\r\n    const style = folder.styles ? folder.styles.find(s => s.styleId === styleId) : null;\r\n    const titleName = style ? style.title : 'Selected Frame';\r\n    showConfirmModal(\r\n      'Delete Frame?',\r\n      `Are you sure you want to delete \"${escapeHtml(titleName)}\"? It will be moved to Deleted Backup.`,\r\n      'Delete',\r\n      () => deleteStyles(targetStyleIds),\r\n      true,\r\n      0\r\n    );\r\n  }\r\n}\r\n\r\nfunction showConfirmModal(title, message, confirmText, confirmAction, isDanger, countdownSeconds = 0) {\r\n  if (modalCountdownTimer) {\r\n    clearInterval(modalCountdownTimer);\r\n    modalCountdownTimer = null;\r\n  }\r\n\r\n  pendingModalAction = confirmAction;\r\n  document.getElementById('modalTitle').textContent = title;\r\n  document.getElementById('modalMessage').textContent = message;\r\n  const inputField = document.getElementById('modalInputField');\r\n  if (inputField) inputField.style.display = 'none';\r\n  \r\n  const btn = document.getElementById('modalConfirmBtn');\r\n  btn.className = `modal-btn ${isDanger ? 'danger' : 'primary'}`;\r\n\r\n  if (countdownSeconds > 0) {\r\n    let remaining = countdownSeconds;\r\n    btn.disabled = true;\r\n    btn.textContent = `${confirmText} (${remaining}s)`;\r\n    \r\n    modalCountdownTimer = setInterval(() => {\r\n      remaining--;\r\n      if (remaining > 0) {\r\n        btn.textContent = `${confirmText} (${remaining}s)`;\r\n      } else {\r\n        clearInterval(modalCountdownTimer);\r\n        modalCountdownTimer = null;\r\n        btn.disabled = false;\r\n        btn.textContent = confirmText;\r\n      }\r\n    }, 1000);\r\n  } else {\r\n    btn.disabled = false;\r\n    btn.textContent = confirmText;\r\n  }\r\n  \r\n  document.getElementById('confirmModal').classList.add('active');\r\n}\r\n\r\nfunction closeModal() {\r\n  if (modalCountdownTimer) {\r\n    clearInterval(modalCountdownTimer);\r\n    modalCountdownTimer = null;\r\n  }\r\n  const btn = document.getElementById('modalConfirmBtn');\r\n  if (btn) btn.disabled = false;\r\n  document.getElementById('confirmModal').classList.remove('active');\r\n  pendingModalAction = null;\r\n}\r\n\r\nfunction confirmModalAction() {\r\n  if (pendingModalAction) {\r\n    const inputField = document.getElementById('modalInputField');\r\n    if (inputField.style.display !== 'none') {\r\n      // Rename action with input\r\n      const newName = document.getElementById('modalInput').value.trim();\r\n      if (!newName) {\r\n        alert('Please enter a name');\r\n        return;\r\n      }\r\n      pendingModalAction(newName);\r\n    } else {\r\n      // Regular confirmation action\r\n      pendingModalAction();\r\n    }\r\n  }\r\n  closeModal();\r\n}\r\n\r\nasync function activateLicenseKey() {\r\n  const input = document.getElementById('licenseKeyInput');\r\n  const key = input ? input.value.trim() : '';\r\n  const status = document.getElementById('licenseStatus');\r\n  const btn = document.getElementById('activateBtn');\r\n  \r\n  if (!key) {\r\n    status.textContent = '✗ Please enter a license key';\r\n    status.className = 'status err';\r\n    return;\r\n  }\r\n  \r\n  if (btn) {\r\n    btn.disabled = true;\r\n    btn.textContent = 'Verifying key...';\r\n  }\r\n  status.textContent = '';\r\n  \r\n  try {\r\n    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {\r\n      method: 'POST',\r\n      headers: {\r\n        'Content-Type': 'application/x-www-form-urlencoded'\r\n      },\r\n      body: new URLSearchParams({\r\n        product_id: GUMROAD_PRODUCT_ID,\r\n        product_permalink: GUMROAD_PRODUCT_PERMALINK,\r\n        license_key: key\r\n      })\r\n    });\r\n    \r\n    const data = await response.json();\r\n    \r\n    const isRefundedOrDisputed = data.purchase && (\r\n      data.purchase.refunded ||\r\n      data.purchase.chargebacked ||\r\n      data.purchase.disputed\r\n    );\r\n\r\n    if (data.success && !isRefundedOrDisputed && data.uses !== undefined) {\r\n      status.textContent = '✓ License activated successfully!';\r\n      status.className = 'status ok';\r\n      showToast('✓ Pro License Activated! All limits unlocked.', 'success');\r\n      parent.postMessage({ pluginMessage: { type: 'save-license', key } }, '*');\r\n    } else if (isRefundedOrDisputed) {\r\n      status.textContent = '✗ License has been refunded or disputed';\r\n      status.className = 'status err';\r\n      showToast('✗ This license key has been refunded or disputed.', 'error');\r\n    } else {\r\n      status.textContent = '✗ Invalid license key or uses limit reached';\r\n      status.className = 'status err';\r\n      showToast('✗ Invalid license key or uses limit reached.', 'error');\r\n    }\r\n  } catch (error) {\r\n    status.textContent = '✗ Verification failed. Check your connection.';\r\n    status.className = 'status err';\r\n    showToast('✗ Verification failed. Check your network connection.', 'error');\r\n  } finally {\r\n    if (btn) {\r\n      btn.disabled = false;\r\n      btn.textContent = 'Activate License';\r\n    }\r\n  }\r\n}\r\n\r\nfunction deactivateLicense() {\r\n  // Pro license cannot be deactivated once activated\r\n  console.log('[UI] License deactivation disabled.');\r\n}\r\n\r\nfunction updateProLicenseUI(isPro) {\r\n  isProUser = !!isPro;\r\n  const licenseStatusBtn = document.getElementById('licenseStatusBtn');\r\n  const jsonBackupBadge = document.getElementById('jsonBackupBadge');\r\n  \r\n  if (licenseStatusBtn) {\r\n    if (isPro) {\r\n      licenseStatusBtn.className = 'badge-pro-active';\r\n      licenseStatusBtn.removeAttribute('style');\r\n      licenseStatusBtn.style.display = 'inline-flex';\r\n      licenseStatusBtn.innerHTML = `\r\n        <svg width=\"10\" height=\"10\" viewBox=\"0 0 16 16\" fill=\"none\" style=\"flex-shrink:0\">\r\n          <path d=\"M8 0.5L9.6 5.6C9.8 6.2 10.3 6.7 10.9 6.9L16 8.5L10.9 10.1C10.3 10.3 9.8 10.8 9.6 11.4L8 16.5L6.4 11.4C6.2 10.8 5.7 10.3 5.1 10.1L0 8.5L5.1 6.9C5.7 6.7 6.2 6.2 6.4 5.6L8 0.5Z\" fill=\"url(#proBadgeSparkle)\"/>\r\n          <defs>\r\n            <linearGradient id=\"proBadgeSparkle\" x1=\"0\" y1=\"0\" x2=\"16\" y2=\"16\" gradientUnits=\"userSpaceOnUse\">\r\n              <stop offset=\"0%\" stop-color=\"#818CF8\"/>\r\n              <stop offset=\"100%\" stop-color=\"#F472B6\"/>\r\n            </linearGradient>\r\n          </defs>\r\n        </svg>\r\n        <span>PRO</span>\r\n      `;\r\n      licenseStatusBtn.title = 'Assets Diary PRO • Lifetime Access Active';\r\n      licenseStatusBtn.onclick = () => showToast('Assets Diary PRO Active • All features & limits unlocked', 'info');\r\n    } else {\r\n      licenseStatusBtn.className = 'btn-pro-pill';\r\n      licenseStatusBtn.removeAttribute('style');\r\n      licenseStatusBtn.style.display = 'inline-flex';\r\n      licenseStatusBtn.innerHTML = `\r\n        <svg width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" style=\"flex-shrink:0\">\r\n          <path d=\"M8 0.5L9.6 5.6C9.8 6.2 10.3 6.7 10.9 6.9L16 8.5L10.9 10.1C10.3 10.3 9.8 10.8 9.6 11.4L8 16.5L6.4 11.4C6.2 10.8 5.7 10.3 5.1 10.1L0 8.5L5.1 6.9C5.7 6.7 6.2 6.2 6.4 5.6L8 0.5Z\" fill=\"url(#proSparkleGradDynamic)\"/>\r\n          <defs>\r\n            <linearGradient id=\"proSparkleGradDynamic\" x1=\"0\" y1=\"0\" x2=\"16\" y2=\"16\" gradientUnits=\"userSpaceOnUse\">\r\n              <stop offset=\"0%\" stop-color=\"#6366F1\"/>\r\n              <stop offset=\"100%\" stop-color=\"#EC4899\"/>\r\n            </linearGradient>\r\n          </defs>\r\n        </svg>\r\n        <span>Upgrade to Pro</span>\r\n      `;\r\n      licenseStatusBtn.title = 'Upgrade to Pro for unlimited collections and frames';\r\n      licenseStatusBtn.onclick = () => showProPaywallModal('general');\r\n    }\r\n  }\r\n\r\n  if (jsonBackupBadge) {\r\n    jsonBackupBadge.style.display = 'inline-flex';\r\n    jsonBackupBadge.style.alignItems = 'center';\r\n    jsonBackupBadge.style.gap = '4px';\r\n\r\n    if (isPro) {\r\n      jsonBackupBadge.innerHTML = `\r\n        <svg width=\"9\" height=\"9\" viewBox=\"0 0 16 16\" fill=\"none\" style=\"flex-shrink:0\">\r\n          <path d=\"M8 0.5L9.6 5.6C9.8 6.2 10.3 6.7 10.9 6.9L16 8.5L10.9 10.1C10.3 10.3 9.8 10.8 9.6 11.4L8 16.5L6.4 11.4C6.2 10.8 5.7 10.3 5.1 10.1L0 8.5L5.1 6.9C5.7 6.7 6.2 6.2 6.4 5.6L8 0.5Z\" fill=\"#6366F1\"/>\r\n        </svg>\r\n        <span>Pro Unlocked</span>\r\n      `;\r\n      jsonBackupBadge.style.color = '#4F46E5';\r\n      jsonBackupBadge.style.background = 'rgba(99,102,241,0.08)';\r\n      jsonBackupBadge.style.borderColor = 'rgba(99,102,241,0.25)';\r\n    } else {\r\n      jsonBackupBadge.innerHTML = `\r\n        <svg width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#7C3AED\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"flex-shrink:0\"><rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\" ry=\"2\"></rect><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path></svg>\r\n        <span>Pro Feature</span>\r\n      `;\r\n      jsonBackupBadge.style.color = '#7C3AED';\r\n      jsonBackupBadge.style.background = 'rgba(124,58,237,0.08)';\r\n      jsonBackupBadge.style.borderColor = 'rgba(124,58,237,0.2)';\r\n    }\r\n  }\r\n}\r\n\r\nfunction showProPaywallModal(limitType, customMsg) {\r\n  const modal = document.getElementById('proPaywallModal');\r\n  const reason = document.getElementById('proPaywallReason');\r\n  if (!modal) return;\r\n\r\n  let msgText = customMsg || '⚠️ Upgrade to Pro to unlock unlimited access!';\r\n  if (limitType === 'folder') {\r\n    msgText = '⚠️ Free Tier Limit: Maximum 2 collection folders allowed on Free tier. Upgrade to Pro for unlimited collections!';\r\n  } else if (limitType === 'frame') {\r\n    msgText = '⚠️ Free Tier Limit: Maximum 5 frames per collection allowed on Free tier. Upgrade to Pro for unlimited frames!';\r\n  } else if (limitType === 'json-backup') {\r\n    msgText = '🔒 Pro Locked: Offline JSON Export & Import is exclusive to Pro License holders!';\r\n  }\r\n\r\n  if (reason) reason.textContent = msgText;\r\n  modal.classList.add('active');\r\n}\r\n\r\nfunction closeProPaywallModal() {\r\n  const modal = document.getElementById('proPaywallModal');\r\n  if (modal) modal.classList.remove('active');\r\n}\r\n\r\nasync function activateProLicenseFromModal() {\r\n  const input = document.getElementById('proModalLicenseInput');\r\n  const status = document.getElementById('proModalLicenseStatus');\r\n  const btn = document.getElementById('proModalActivateBtn');\r\n  const key = input ? input.value.trim() : '';\r\n\r\n  if (!key) {\r\n    if (status) {\r\n      status.textContent = '✗ Please enter a license key';\r\n      status.style.color = '#DC2626';\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (btn) {\r\n    btn.disabled = true;\r\n    btn.textContent = 'Verifying...';\r\n  }\r\n\r\n  try {\r\n    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {\r\n      method: 'POST',\r\n      headers: {\r\n        'Content-Type': 'application/x-www-form-urlencoded'\r\n      },\r\n      body: new URLSearchParams({\r\n        product_id: GUMROAD_PRODUCT_ID,\r\n        product_permalink: GUMROAD_PRODUCT_PERMALINK,\r\n        license_key: key\r\n      })\r\n    });\r\n\r\n    const data = await response.json();\r\n\r\n    const isRefundedOrDisputed = data.purchase && (\r\n      data.purchase.refunded ||\r\n      data.purchase.chargebacked ||\r\n      data.purchase.disputed\r\n    );\r\n\r\n    if (data.success && !isRefundedOrDisputed && data.uses !== undefined) {\r\n      if (status) {\r\n        status.textContent = '✓ Pro License activated!';\r\n        status.style.color = '#059669';\r\n      }\r\n      showToast('✓ Pro License Activated! All limits unlocked.', 'success');\r\n      parent.postMessage({ pluginMessage: { type: 'save-license', key } }, '*');\r\n      setTimeout(() => {\r\n        closeProPaywallModal();\r\n        if (btn) { btn.disabled = false; btn.textContent = 'Activate Pro'; }\r\n      }, 1000);\r\n    } else if (isRefundedOrDisputed) {\r\n      if (status) {\r\n        status.textContent = '✗ License has been refunded or disputed';\r\n        status.style.color = '#DC2626';\r\n      }\r\n      showToast('✗ This license key has been refunded or disputed.', 'error');\r\n      if (btn) { btn.disabled = false; btn.textContent = 'Activate Pro'; }\r\n    } else {\r\n      if (status) {\r\n        status.textContent = '✗ Invalid license key or max uses reached';\r\n        status.style.color = '#DC2626';\r\n      }\r\n      showToast('✗ Invalid license key or max uses reached.', 'error');\r\n      if (btn) { btn.disabled = false; btn.textContent = 'Activate Pro'; }\r\n    }\r\n  } catch (err) {\r\n    if (status) {\r\n      status.textContent = '✗ Network error verifying license key';\r\n      status.style.color = '#DC2626';\r\n    }\r\n    showToast('✗ Network error verifying license key.', 'error');\r\n    if (btn) { btn.disabled = false; btn.textContent = 'Activate Pro'; }\r\n  }\r\n}\r\n\r\n\r\nfunction deleteFolder(folderId) {\r\n  parent.postMessage({\r\n    pluginMessage: { type: 'delete-folder', folderId }\r\n  }, '*');\r\n  showFolderList();\r\n}\r\n\r\n\r\n\r\nfunction renameFolder(folderId, newName) {\r\n  parent.postMessage({\r\n    pluginMessage: { type: 'rename-folder', folderId, newName }\r\n  }, '*');\r\n}\r\n\r\nfunction renameStyle(folderId, styleId, newName) {\r\n  if (!newName || !newName.trim()) return;\r\n  let fId = folderId || currentFolderId;\r\n  if (!fId) {\r\n    const foundFolder = allFolders.find(f => f.styles && f.styles.some(s => s.styleId === styleId));\r\n    if (foundFolder) fId = foundFolder.folderId;\r\n  }\r\n  parent.postMessage({\r\n    pluginMessage: { type: 'rename-style', folderId: fId, styleId, newName: newName.trim(), newTitle: newName.trim() }\r\n  }, '*');\r\n}\r\n\r\nfunction deleteStyle(styleId) {\r\n  deleteStyles([styleId]);\r\n}\r\n\r\nfunction deleteStyles(targetStyleIds) {\r\n  if (!targetStyleIds || !targetStyleIds.length) return;\r\n\r\n  let fId = currentFolderId;\r\n  if (!fId) {\r\n    const foundFolder = allFolders.find(f => f.styles && f.styles.some(s => targetStyleIds.includes(s.styleId)));\r\n    if (foundFolder) fId = foundFolder.folderId;\r\n  }\r\n\r\n  if (targetStyleIds.length === 1) {\r\n    parent.postMessage({\r\n      pluginMessage: { type: 'delete-footer-style', folderId: fId, styleId: targetStyleIds[0] }\r\n    }, '*');\r\n  } else {\r\n    parent.postMessage({\r\n      pluginMessage: { type: 'delete-multiple-styles', folderId: fId, styleIds: targetStyleIds }\r\n    }, '*');\r\n  }\r\n\r\n  // Filter out deleted IDs from selection state\r\n  selectedStyleIds = selectedStyleIds.filter(id => !targetStyleIds.includes(id));\r\n  selectedStyleId = selectedStyleIds[0] || null;\r\n  updateImportBtnLabel();\r\n}\r\n\r\n// ── API Communication ──────────────────────────────────\r\nfunction requestPreview(folderId, styleId) {\r\n  parent.postMessage({\r\n    pluginMessage: {\r\n      type: 'preview',\r\n      folderId: folderId,\r\n      styleId: styleId,\r\n      config: { ...DEFAULT_PREVIEW_CONFIG }\r\n    }\r\n  }, '*');\r\n}\r\n\r\nfunction connectDrive() {\r\n  const folderId = document.getElementById('driveFolderId').value.trim();\r\n  const token = document.getElementById('driveToken').value.trim();\r\n  const refreshToken = document.getElementById('refreshToken').value.trim();\r\n  const clientId = document.getElementById('clientId').value.trim();\r\n  const clientSecret = document.getElementById('clientSecret').value.trim();\r\n\r\n  if (refreshToken || clientId || clientSecret) {\r\n    document.getElementById('saveDriveSettings').checked = true;\r\n    document.getElementById('saveRefreshToken').checked = true;\r\n    document.getElementById('saveClientId').checked = true;\r\n    document.getElementById('saveClientSecret').checked = true;\r\n  }\r\n  if (token) {\r\n    document.getElementById('saveToken').checked = true;\r\n  }\r\n\r\n  const remember = document.getElementById('saveDriveSettings').checked;\r\n  const rememberToken = document.getElementById('saveToken').checked;\r\n  const rememberRefreshToken = document.getElementById('saveRefreshToken').checked;\r\n  const rememberClientId = document.getElementById('saveClientId').checked;\r\n  const rememberClientSecret = document.getElementById('saveClientSecret').checked;\r\n  const status = document.getElementById('driveStatus');\r\n\r\n  if (!folderId || (!token && !refreshToken)) {\r\n    status.textContent = 'Provide Cloud Sync Refresh credentials (recommended) or an Access Token';\r\n    status.className = 'status err';\r\n    return;\r\n  }\r\n\r\n  if (refreshToken && (!clientId || !clientSecret)) {\r\n    status.textContent = 'To use Refresh Token, please also enter Client ID and Client Secret';\r\n    status.className = 'status err';\r\n    return;\r\n  }\r\n\r\n  status.textContent = 'Verifying & connecting to Cloud Storage…';\r\n  status.className = 'status';\r\n  parent.postMessage({ pluginMessage: { type: 'connect-drive', driveFolderId: folderId, driveToken: token, refreshToken, clientId, clientSecret, rememberDriveSettings: remember, rememberToken, rememberRefreshToken, rememberClientId, rememberClientSecret } }, '*');\r\n}\r\n\r\nlet currentConnectedEmail = '';\r\n\r\nfunction setDatabaseStatus(isConnected, errorMessage, email) {\r\n  const banner = document.getElementById('dbConnectedBanner');\r\n  if (banner) banner.style.display = 'none';\r\n}\r\n\r\n// ── Message Handler ────────────────────────────────────\r\nwindow.addEventListener('message', (e) => {\r\n  const msg = e.data.pluginMessage;\r\n  if (!msg) return;\r\n  console.log('[UI] Received message from backend:', msg.type, msg);\r\n\r\n  if (msg.type === 'intro-copy-state') {\r\n    return;\r\n  }\r\n  \r\n  const btn = document.getElementById('genBtn');\r\n  const status = document.getElementById('status');\r\n\r\n  if (msg.type === 'pro-limit-reached') {\r\n    resetSaveButtons();\r\n    showToast(msg.message || '⚠️ Free Tier Limit reached.', 'warning');\r\n    showProPaywallModal(msg.limitType, msg.message);\r\n    return;\r\n  }\r\n\r\n  if (msg.type === 'license-status') {\r\n    isProUser = !!msg.isPro;\r\n    const lockScreen = document.getElementById('licenseLockScreen');\r\n    if (lockScreen) lockScreen.style.display = 'none';\r\n    updateProLicenseUI(isProUser);\r\n    return;\r\n  }\r\n\r\n  if (msg.type === 'auth-success') {\r\n    currentUser = msg.user;\r\n    if (currentUser && currentUser.name) {\r\n      updateHeaderTitle(currentUser.name);\r\n    }\r\n    if (msg.folders) {\r\n      allFolders = normalizeFolders(msg.folders);\r\n    }\r\n    const loginBtn = document.getElementById('authLoginBtn');\r\n    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign In'; }\r\n    const signupBtn = document.getElementById('authSignupBtn');\r\n    if (signupBtn) { signupBtn.disabled = false; signupBtn.textContent = 'Create Account'; }\r\n    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));\r\n    document.getElementById('folderListView').classList.add('active');\r\n    document.getElementById('signOutBtn').style.display = 'none';\r\n\r\n    const adminBtn = document.getElementById('adminBtn');\r\n    if (adminBtn) adminBtn.style.display = currentUser.role === 'admin' ? 'block' : 'none';\r\n\r\n    updateFoldersList();\r\n    parent.postMessage({ pluginMessage: { type: 'request-styles' } }, '*');\r\n  }\r\n  else if (msg.type === 'user-info') {\r\n    if (msg.user) {\r\n      currentUser = msg.user;\r\n      if (msg.user.name) {\r\n        updateHeaderTitle(msg.user.name);\r\n      }\r\n    }\r\n  }\r\n  else if (msg.type === 'auth-required' || msg.type === 'auth-logout-success') {\r\n    showAuthView(msg.rememberedCreds);\r\n  }\r\n  else if (msg.type === 'admin-data-response') {\r\n    cachedAdminData = msg;\r\n    document.getElementById('adminTotalUsers').textContent = msg.totalUsers || 0;\r\n    document.getElementById('adminTotalFolders').textContent = msg.totalFolders || 0;\r\n    document.getElementById('adminTotalStyles').textContent = msg.totalStyles || 0;\r\n\r\n    const select = document.getElementById('adminUserSelect');\r\n    if (select) {\r\n      select.innerHTML = '<option value=\"ALL\">All Registered Users (' + msg.totalUsers + ')</option>';\r\n      (msg.allUsersData || []).forEach(u => {\r\n        const opt = document.createElement('option');\r\n        opt.value = u.user.uid;\r\n        opt.textContent = `${u.user.email} (${u.foldersCount} collections)`;\r\n        select.appendChild(opt);\r\n      });\r\n    }\r\n    renderAdminUserCollections();\r\n  }\r\n  else if (msg.type === 'trash-items-list') {\r\n    renderTrashItems(msg.items);\r\n  }\r\n  else if (msg.type === 'export-backup-data') {\r\n    const jsonStr = JSON.stringify(msg.payload, null, 2);\r\n    const blob = new Blob([jsonStr], { type: 'application/json' });\r\n    const url = URL.createObjectURL(blob);\r\n    const a = document.createElement('a');\r\n    a.href = url;\r\n    a.download = `assets-diary-backup-${new Date().toISOString().slice(0,10)}.json`;\r\n    document.body.appendChild(a);\r\n    a.click();\r\n    document.body.removeChild(a);\r\n    URL.revokeObjectURL(url);\r\n  }\r\n  else if (msg.type === 'success') {\r\n    if (btn) {\r\n      btn.disabled = false;\r\n      updateImportBtnLabel();\r\n    }\r\n    if (status) {\r\n      status.textContent = msg.message || '✓ Success!';\r\n      status.className = 'status ok';\r\n      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);\r\n    }\r\n    showToast(msg.message || '✓ Success!', 'success');\r\n  }\r\n  else if (msg.type === 'selection-state') {\r\n    selectedFrameInfo = msg.selectedFrame;\r\n    selectedFramesInfo = msg.selectedFrames || [];\r\n    updateSelectedFrameCard();\r\n  }\r\n  else if (msg.type === 'style-state') {\r\n    if (msg.user && msg.user.name) {\r\n      updateHeaderTitle(msg.user.name);\r\n    }\r\n    if (msg.folders) {\r\n      allFolders = normalizeFolders(msg.folders || []);\r\n      updateFoldersList();\r\n      if (currentFolderId) {\r\n        updateStylesList();\r\n      }\r\n    }\r\n    selectedFrameInfo = msg.selectedFrame;\r\n    selectedFramesInfo = msg.selectedFrames || [];\r\n    updateSelectedFrameCard();\r\n    parent.postMessage({ pluginMessage: { type: 'get-trash-items' } }, '*');\r\n    if (msg.driveConfig) {\r\n      document.getElementById('driveFolderId').value = msg.driveConfig.folderId || '';\r\n      document.getElementById('driveToken').value = msg.driveConfig.token || '';\r\n      document.getElementById('refreshToken').value = msg.driveConfig.refreshToken || '';\r\n      document.getElementById('clientId').value = msg.driveConfig.clientId || '';\r\n      document.getElementById('clientSecret').value = msg.driveConfig.clientSecret || '';\r\n      document.getElementById('saveDriveSettings').checked = !!msg.driveConfig.rememberDriveSettings;\r\n      document.getElementById('saveToken').checked = !!msg.driveConfig.rememberToken;\r\n      document.getElementById('saveRefreshToken').checked = !!msg.rememberRefreshToken;\r\n      document.getElementById('saveClientId').checked = !!msg.rememberClientId;\r\n      document.getElementById('saveClientSecret').checked = !!msg.rememberClientSecret;\r\n      if (msg.driveConfig.token || msg.driveConfig.refreshToken) {\r\n        setDatabaseStatus(true, null, msg.driveConfig.userEmail);\r\n      } else {\r\n        setDatabaseStatus(false, 'Database connection error');\r\n      }\r\n    } else {\r\n      setDatabaseStatus(false, 'Database connection error');\r\n    }\r\n    updateSelectedFrameCard();\r\n    updateFoldersList();\r\n    if (currentFolderId) {\r\n      updateStylesList();\r\n    }\r\n    parent.postMessage({ pluginMessage: { type: 'get-trash-items' } }, '*');\r\n  }\r\n  else if (msg.type === 'code-generated') {\r\n    resetSaveButtons();\r\n    btn.disabled = false;\r\n    updateImportBtnLabel();\r\n    const addBtn = document.getElementById('addSelectedBtn');\r\n    const addMultiBtn = document.getElementById('addSelectedMultiBtn');\r\n    if (addBtn) {\r\n      addBtn.disabled = false;\r\n      addBtn.textContent = 'Save Frame';\r\n    }\r\n    if (addMultiBtn) {\r\n      addMultiBtn.disabled = false;\r\n      addMultiBtn.textContent = 'Save Selected Frames';\r\n    }\r\n    status.textContent = msg.message || '✓ Selection saved as a new frame.';\r\n    status.className = 'status ok';\r\n    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);\r\n    showToast(msg.message || '✓ Selection saved to collection!', 'success');\r\n  }\r\n  else if (msg.type === 'save-progress') {\r\n    const status = document.getElementById('status');\r\n    status.textContent = `Saving ${msg.current}/${msg.total}: ${msg.frameName}...`;\r\n    status.className = 'status';\r\n  }\r\n  else if (msg.type === 'drive-connected') {\r\n    setDatabaseStatus(true, null, msg.driveConfig ? msg.driveConfig.userEmail : null);\r\n    const dbBanner = document.getElementById('dbConnectedBanner');\r\n    if (dbBanner) dbBanner.style.display = 'flex';\r\n    const ds = document.getElementById('driveStatus');\r\n    if (ds) {\r\n      ds.textContent = '✓ Drive connected';\r\n      ds.className = 'status ok';\r\n    }\r\n    if (msg.driveConfig) {\r\n      document.getElementById('driveFolderId').value = msg.driveConfig.folderId || '';\r\n      document.getElementById('driveToken').value = msg.driveConfig.token || '';\r\n      document.getElementById('refreshToken').value = msg.driveConfig.refreshToken || '';\r\n      document.getElementById('clientId').value = msg.driveConfig.clientId || '';\r\n      document.getElementById('clientSecret').value = msg.driveConfig.clientSecret || '';\r\n      document.getElementById('saveDriveSettings').checked = !!msg.driveConfig.rememberDriveSettings;\r\n      document.getElementById('saveToken').checked = !!msg.driveConfig.rememberToken;\r\n      document.getElementById('saveRefreshToken').checked = !!msg.driveConfig.rememberRefreshToken;\r\n      document.getElementById('saveClientId').checked = !!msg.driveConfig.rememberClientId;\r\n      document.getElementById('saveClientSecret').checked = !!msg.driveConfig.rememberClientSecret;\r\n    }\r\n    if (ds) setTimeout(() => { ds.textContent = ''; ds.className = 'status'; }, 2500);\r\n  }\r\n  else if (msg.type === 'error') {\r\n    resetSaveButtons();\r\n    let errText = String(msg.message || '').replace(/\\bfooters\\b/gi, 'frames').replace(/\\bfooter\\b/gi, 'frame');\r\n    showToast(errText, 'error');\r\n    const authStatus = document.getElementById('authStatus');\r\n    const authView = document.getElementById('authView');\r\n    const loginBtn = document.getElementById('authLoginBtn');\r\n    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign In'; }\r\n    const signupBtn = document.getElementById('authSignupBtn');\r\n    if (signupBtn) { signupBtn.disabled = false; signupBtn.textContent = 'Create Account'; }\r\n\r\n    if (authView && authView.classList.contains('active') && authStatus) {\r\n      authStatus.textContent = '✗ ' + errText;\r\n      authStatus.className = 'status err';\r\n    } else {\r\n      if (errText.includes('expired') || errText.includes('401') || errText.includes('unauthorized') || errText.includes('token is missing')) {\r\n        setDatabaseStatus(false, 'Database connection error');\r\n      }\r\n      const ds = document.getElementById('driveStatus');\r\n      if (ds && ds.offsetParent !== null) {\r\n        ds.textContent = '✗ ' + errText;\r\n        ds.className = 'status err';\r\n      } else {\r\n        status.textContent = '✗ ' + errText;\r\n        status.className = 'status err';\r\n        setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);\r\n      }\r\n    }\r\n  }\r\n  else if (msg.type === 'preview') {\r\n    const img = document.querySelector(`.preview-box img[alt=\"preview-${msg.styleId}\"]`);\r\n    if (img) {\r\n      img.src = 'data:image/png;base64,' + msg.data;\r\n    }\r\n  }\r\n  else if (msg.type === 'svg-import-failure' || msg.type === 'svg-failures-list') {\r\n    // Internal diagnostic handler for SVG fallbacks\r\n  }\r\n});\r\n\r\n// ── Utilities ──────────────────────────────────────────\r\nfunction escapeHtml(text) {\r\n  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#039;' };\r\n  return (text || '').replace(/[&<>\"']/g, m => map[m]);\r\n}\r\n\r\nfunction attachPreviewBoxPanHandlers() {\r\n  document.addEventListener('mousemove', function(e) {\r\n    const box = e.target.closest('.preview-box');\r\n    if (box) {\r\n      const rect = box.getBoundingClientRect();\r\n      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));\r\n      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));\r\n      const img = box.querySelector('.thumb');\r\n      if (img) {\r\n        img.style.transformOrigin = `${x}% ${y}%`;\r\n      }\r\n    }\r\n  });\r\n}\r\nattachPreviewBoxPanHandlers();\r\n\r\n// ── Init ───────────────────────────────────────────────\r\n// Attach events safely — the element may not exist in some views.\r\nconst addSelectedBtn = document.getElementById('addSelectedBtn');\r\nif (addSelectedBtn) addSelectedBtn.addEventListener('click', addSelectedFooter);\r\n\r\nconst addSelectedMultiBtn = document.getElementById('addSelectedMultiBtn');\r\nif (addSelectedMultiBtn) addSelectedMultiBtn.addEventListener('click', addSelectedMultipleFooters);\r\n\r\n// Check license key first on startup\r\nparent.postMessage({ pluginMessage: { type: 'check-license' } }, '*');\r\n// Check authentication session on startup\r\nparent.postMessage({ pluginMessage: { type: 'check-auth' } }, '*');\r\n</script>\r\n\n<script>\n  (function() {\n    function wireBackBtn() {\n      const btn = document.getElementById('btnBackToHtml2Fig');\n      if (btn && !btn._h2fBound) {\n        btn._h2fBound = true;\n        btn.addEventListener('click', function(e) {\n          e.preventDefault();\n          e.stopPropagation();\n          parent.postMessage({ pluginMessage: { type: 'switch_to_html2fig' } }, '*');\n        });\n      }\n    }\n    if (document.readyState === 'loading') {\n      document.addEventListener('DOMContentLoaded', wireBackBtn);\n    } else {\n      wireBackBtn();\n    }\n    setTimeout(wireBackBtn, 200);\n    setTimeout(wireBackBtn, 800);\n  })();\n</script>\n\n</body>\r\n</html>\r\n";

// Asset's Diary — Commercial Release
// [Merged] Initial showUI suppressed - managed by root plugin controller

const DRIVE_SETTINGS_STORAGE_KEY = 'assets-diary-drive-settings';
const LOCAL_FOLDERS_STORAGE_KEY = 'assets-diary-local-folders';
const FIXED_DRIVE_FOLDER_ID = null;
const DEFAULT_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
const DEFAULT_CLIENT_SECRET = 'YOUR_GOOGLE_CLIENT_SECRET';
const DEFAULT_REFRESH_TOKEN = 'YOUR_GOOGLE_REFRESH_TOKEN';
const DEFAULT_FOLDER_ID = '1_Ix6ouGX73QEjNk13Bckjifwywiskc04';
const INTRO_COPY_DISMISSAL_LIMIT = 2;

function getFigmaCurrentUserSafely() {
  try {
    return figma.currentUser || null;
  } catch (e) {
    return null;
  }
}

function getIntroCopyDismissalKey() {
  const fUser = getFigmaCurrentUserSafely();
  const userId = fUser && fUser.id;
  return userId ? `assets-diary-intro-copy-dismissals-${userId}` : 'assets-diary-intro-copy-dismissals-guest';
}

let footerFolders = [];
let driveConfig = {
  folderId: DEFAULT_FOLDER_ID,
  token: null,
  refreshToken: DEFAULT_REFRESH_TOKEN,
  clientId: DEFAULT_CLIENT_ID,
  clientSecret: DEFAULT_CLIENT_SECRET,
  tokenExpiresAt: 0,
  indexFileId: null,
  rememberDriveSettings: true,
  rememberToken: true,
  rememberRefreshToken: true,
  rememberClientId: true,
  rememberClientSecret: true
};

function hasConnectedDrive() {
  if (driveConfig.token) return true;
  if (driveConfig.refreshToken && driveConfig.refreshToken !== DEFAULT_REFRESH_TOKEN && driveConfig.clientId && driveConfig.clientId !== DEFAULT_CLIENT_ID) {
    return true;
  }
  return false;
}

const USER_SESSION_KEY = 'assets-diary-user-session';
const USERS_REGISTRY_KEY = 'assets-diary-users-registry';
const USERS_REGISTRY_BACKUP_KEY = 'assets-diary-users-registry-backup';
const REMEMBERED_CREDS_KEY = 'assets-diary-remembered-creds';
const LICENSE_KEY_STORAGE_KEY = 'assets-diary-license-key';

let currentUser = null; // { uid, email, role }
const initialFigmaUser = getFigmaCurrentUserSafely();
if (initialFigmaUser) {
  const isAdmin = initialFigmaUser.name === 'lybonerik' || initialFigmaUser.id === '1129375176527581566';
  currentUser = {
    uid: 'figma_' + initialFigmaUser.id,
    email: (initialFigmaUser.name || 'user') + '@figma.user',
    name: initialFigmaUser.name || 'User',
    role: isAdmin ? 'admin' : 'user'
  };
}
let isProUser = false;

function getStorageKeyForUser(user) {
  if (!user || !user.uid) return 'assets-diary-folders-guest';
  return `assets-diary-folders-${user.uid}`;
}

function getPendingUploadsKeyForUser(user) {
  if (!user || !user.uid) return 'assets-diary-pending-uploads-guest';
  return `assets-diary-pending-uploads-${user.uid}`;
}

function getUserIndexFilename(user) {
  if (!user || !user.uid) return 'assets-diary-index-guest.json';
  return `assets-diary-index-${user.uid}.json`;
}

function getUserBackupIndexFilename(user) {
  if (!user || !user.uid) return 'assets-diary-index-guest-backup.json';
  return `assets-diary-index-${user.uid}-backup.json`;
}

function getTrashKeyForUser(user) {
  if (!user || !user.uid) return 'assets-diary-trash-guest';
  return `assets-diary-trash-${user.uid}`;
}

let trashItems = [];

async function loadLocalTrash() {
  try {
    const key = getTrashKeyForUser(currentUser);
    const backupKey = `${key}-backup`;

    let stored = await figma.clientStorage.getAsync(key);
    if (!Array.isArray(stored) || stored.length === 0) {
      stored = await figma.clientStorage.getAsync(backupKey);
    }
    if (!Array.isArray(stored) || stored.length === 0) {
      const guest = await figma.clientStorage.getAsync('assets-diary-trash-guest');
      if (Array.isArray(guest) && guest.length > 0) stored = guest;
    }
    if (!Array.isArray(stored) || stored.length === 0) {
      const legacy = await figma.clientStorage.getAsync('assets-diary-trash');
      if (Array.isArray(legacy) && legacy.length > 0) stored = legacy;
    }

    const fetched = Array.isArray(stored) ? stored : [];

    const combined = [...trashItems, ...fetched];
    const uniqueMap = new Map();
    combined.forEach(item => {
      if (item && item.trashId && !uniqueMap.has(item.trashId)) {
        uniqueMap.set(item.trashId, item);
      }
    });

    trashItems = Array.from(uniqueMap.values());
  } catch (e) {
    if (!Array.isArray(trashItems)) trashItems = [];
  }
  return trashItems;
}

async function saveLocalTrash() {
  try {
    const key = getTrashKeyForUser(currentUser);
    const cleanTrash = JSON.parse(JSON.stringify(trashItems));
    await figma.clientStorage.setAsync(key, cleanTrash);
    await figma.clientStorage.setAsync(`${key}-backup`, cleanTrash);
    await figma.clientStorage.setAsync('assets-diary-trash-guest', cleanTrash);
  } catch (e) {}
  safePostMessage({ type: 'trash-items-list', items: trashItems });
}

let driveIndexSaveTimer = null;
let isProcessingQueue = false;

function scheduleDriveIndexSave() {
  if (!hasConnectedDrive()) return;
  if (driveIndexSaveTimer) clearTimeout(driveIndexSaveTimer);
  driveIndexSaveTimer = setTimeout(() => {
    driveSaveIndex().catch(() => {});
  }, 1500);
}

const DEFAULT_EXAMPLE_COLLECTIONS = [
  {
    "name": "Example folder 1",
    "styles": [
      {
        "title": "Frame 590",
        "width": 181,
        "height": 48,
        "createdAt": "2026-08-09T22:08:14.169Z",
        "nodeData": {
          "type": "FRAME",
          "name": "Frame 590",
          "visible": true,
          "locked": false,
          "opacity": 1,
          "blendMode": "PASS_THROUGH",
          "rotation": 0,
          "x": 3990,
          "y": 3748,
          "width": 181,
          "height": 48,
          "isMask": false,
          "maskType": "ALPHA",
          "constraints": {
            "horizontal": "MIN",
            "vertical": "MIN"
          },
          "cornerRadius": 36,
          "topLeftRadius": 36,
          "topRightRadius": 36,
          "bottomRightRadius": 36,
          "bottomLeftRadius": 36,
          "cornerSmoothing": 0,
          "layoutAlign": "INHERIT",
          "layoutGrow": 0,
          "layoutSizingHorizontal": "HUG",
          "layoutSizingVertical": "FIXED",
          "layoutPositioning": "AUTO",
          "fills": [
            {
              "type": "SOLID",
              "visible": true,
              "opacity": 1,
              "blendMode": "NORMAL",
              "color": {
                "r": 0.040855731815099716,
                "g": 0.1462036371231079,
                "b": 0.37728941440582275,
                "a": 1
              }
            }
          ],
          "relativeTransform": [
            [
              1,
              0,
              3990
            ],
            [
              0,
              1,
              3748
            ]
          ],
          "layoutMode": "HORIZONTAL",
          "clipsContent": false,
          "itemSpacing": 10,
          "paddingLeft": 24,
          "paddingRight": 24,
          "paddingTop": 0,
          "paddingBottom": 0,
          "counterAxisSpacing": 0,
          "primaryAxisAlignItems": "CENTER",
          "counterAxisAlignItems": "CENTER",
          "primaryAxisSizingMode": "AUTO",
          "counterAxisSizingMode": "FIXED",
          "children": [
            {
              "type": "TEXT",
              "name": "New account",
              "visible": true,
              "locked": false,
              "opacity": 1,
              "blendMode": "PASS_THROUGH",
              "rotation": 0,
              "x": 24,
              "y": 18,
              "width": 104,
              "height": 12,
              "isMask": false,
              "maskType": "ALPHA",
              "constraints": {
                "horizontal": "MIN",
                "vertical": "MIN"
              },
              "layoutAlign": "INHERIT",
              "layoutGrow": 0,
              "layoutSizingHorizontal": "HUG",
              "layoutSizingVertical": "HUG",
              "layoutPositioning": "AUTO",
              "characters": "New account",
              "fontSize": 16,
              "fontName": {
                "family": "Inter",
                "style": "Bold"
              },
              "textAlignHorizontal": "LEFT",
              "textAlignVertical": "TOP",
              "textAutoResize": "WIDTH_AND_HEIGHT",
              "letterSpacing": {
                "value": 0.5,
                "unit": "PERCENT"
              },
              "lineHeight": {
                "unit": "AUTO"
              },
              "paragraphSpacing": 28,
              "paragraphIndent": 0,
              "textDecoration": "NONE",
              "textCase": "ORIGINAL",
              "leadingTrim": "CAP_HEIGHT",
              "fills": [
                {
                  "type": "SOLID",
                  "visible": true,
                  "opacity": 1,
                  "blendMode": "NORMAL",
                  "color": {
                    "r": 1,
                    "g": 1,
                    "b": 1,
                    "a": 1
                  }
                }
              ],
              "relativeTransform": [
                [
                  1,
                  0,
                  24
                ],
                [
                  0,
                  1,
                  18
                ]
              ]
            },
            {
              "type": "FRAME",
              "name": "Frame",
              "visible": true,
              "locked": false,
              "opacity": 1,
              "blendMode": "PASS_THROUGH",
              "rotation": 0,
              "x": 138,
              "y": 14.5,
              "width": 19,
              "height": 19,
              "isMask": false,
              "maskType": "ALPHA",
              "constraints": {
                "horizontal": "MIN",
                "vertical": "MIN"
              },
              "cornerRadius": 0,
              "topLeftRadius": 0,
              "topRightRadius": 0,
              "bottomRightRadius": 0,
              "bottomLeftRadius": 0,
              "cornerSmoothing": 0,
              "layoutAlign": "INHERIT",
              "layoutGrow": 0,
              "layoutSizingHorizontal": "FIXED",
              "layoutSizingVertical": "FIXED",
              "layoutPositioning": "AUTO",
              "fills": [
                {
                  "type": "SOLID",
                  "visible": false,
                  "opacity": 1,
                  "blendMode": "NORMAL",
                  "color": {
                    "r": 1,
                    "g": 1,
                    "b": 1,
                    "a": 1
                  }
                }
              ],
              "relativeTransform": [
                [
                  1,
                  0,
                  138
                ],
                [
                  0,
                  1,
                  14.5
                ]
              ],
              "layoutMode": "NONE",
              "clipsContent": true,
              "itemSpacing": 0,
              "paddingLeft": 0,
              "paddingRight": 0,
              "paddingTop": 0,
              "paddingBottom": 0,
              "counterAxisSpacing": 0,
              "primaryAxisAlignItems": "MIN",
              "counterAxisAlignItems": "MIN",
              "primaryAxisSizingMode": "AUTO",
              "counterAxisSizingMode": "FIXED",
              "children": [
                {
                  "type": "GROUP",
                  "name": "Group",
                  "visible": true,
                  "locked": false,
                  "opacity": 1,
                  "blendMode": "PASS_THROUGH",
                  "rotation": 0,
                  "x": 1.5833332538604736,
                  "y": 1.5833332538604736,
                  "width": 15.833333015441895,
                  "height": 15.833333015441895,
                  "isMask": false,
                  "maskType": "ALPHA",
                  "layoutAlign": "INHERIT",
                  "layoutGrow": 0,
                  "layoutSizingHorizontal": "FIXED",
                  "layoutSizingVertical": "FIXED",
                  "layoutPositioning": "AUTO",
                  "relativeTransform": [
                    [
                      1,
                      0,
                      1.5833332538604736
                    ],
                    [
                      0,
                      1,
                      1.5833332538604736
                    ]
                  ],
                  "layoutMode": "NONE",
                  "clipsContent": false,
                  "itemSpacing": 0,
                  "paddingLeft": 0,
                  "paddingRight": 0,
                  "paddingTop": 0,
                  "paddingBottom": 0,
                  "counterAxisSpacing": 0,
                  "primaryAxisAlignItems": "MIN",
                  "counterAxisAlignItems": "MIN",
                  "primaryAxisSizingMode": "FIXED",
                  "counterAxisSizingMode": "FIXED",
                  "children": [
                    {
                      "type": "VECTOR",
                      "name": "Vector",
                      "visible": true,
                      "locked": false,
                      "opacity": 1,
                      "blendMode": "PASS_THROUGH",
                      "rotation": 0,
                      "x": 1.5833332538604736,
                      "y": 1.5833332538604736,
                      "width": 15.833333015441895,
                      "height": 15.833333015441895,
                      "isMask": false,
                      "maskType": "ALPHA",
                      "constraints": {
                        "horizontal": "SCALE",
                        "vertical": "SCALE"
                      },
                      "cornerRadius": 0,
                      "cornerSmoothing": 0,
                      "layoutAlign": "INHERIT",
                      "layoutGrow": 0,
                      "layoutSizingHorizontal": "FIXED",
                      "layoutSizingVertical": "FIXED",
                      "layoutPositioning": "AUTO",
                      "vectorPaths": [
                        {
                          "data": "M 0 7.916666507720947 C 0 3.544291782744722 3.544291782744722 0 7.916666507720947 0 C 12.289041232697173 0 15.833333015441895 3.544291782744722 15.833333015441895 7.916666507720947 C 15.833333015441895 12.289041232697173 12.289041232697173 15.833333015441895 7.916666507720947 15.833333015441895 C 3.544291782744722 15.833333015441895 0 12.289041232697173 0 7.916666507720947 Z M 4.749999904632569 7.124999856948853 C 4.540036846690838 7.124999856948853 4.338673491466168 7.208407508769917 4.190207198573853 7.356873801662232 C 4.0417409056815385 7.505340094554547 3.9583332538604736 7.706703449779217 3.9583332538604736 7.916666507720947 C 3.9583332538604736 8.126629565662679 4.0417409056815385 8.327992920887347 4.190207198573853 8.476459213779663 C 4.338673491466168 8.624925506671978 4.540036846690838 8.708333158493042 4.749999904632569 8.708333158493042 L 9.172250166161849 8.708333158493042 L 7.356958360783255 10.523624963871635 C 7.212749893319136 10.672935007680815 7.132954382007182 10.872911324354742 7.1347581305134105 11.08048377042769 C 7.136561879019639 11.288056216500639 7.219820453806347 11.4866163212552 7.366601875540709 11.633397742989564 C 7.513383297275072 11.780179164723927 7.711943402029636 11.863438494502788 7.919515848102583 11.865242243009016 C 8.12708829417553 11.867045991515244 8.32706461084946 11.78725048020329 8.47637465465864 11.643042012739171 L 11.643042012739171 8.47637465465864 C 11.791456600465827 8.32791523927296 11.87483064333937 8.126588135468337 11.874830643339374 7.916666507720947 C 11.874830643339374 7.706744879973558 11.791456600465827 7.505417776168936 11.643042012739171 7.356958360783255 L 8.47637465465864 4.190291757694877 C 8.403345909442955 4.1146795178107025 8.315989754837718 4.054368497427878 8.219403260828585 4.012878039377552 C 8.122816766819453 3.971387581327225 8.018934123027442 3.949548440099468 7.913817167339312 3.9486350021720003 C 7.808700211651182 3.9477215642445325 7.70445418659739 3.967751910720909 7.607161249970659 4.007557609682431 C 7.509868313343928 4.047363308643953 7.421477447892757 4.106147027090297 7.347145727783754 4.1804787471993 C 7.272814007674752 4.254810467308302 7.214030289228408 4.343201710255549 7.174224590266886 4.44049464688228 C 7.134418891305364 4.537787583509012 7.114387789836836 4.642033986058879 7.115301227764303 4.747150941747009 C 7.11621466569177 4.852267897435139 7.138053806919529 4.956150163731073 7.179544264969855 5.052736657740207 C 7.221034723020181 5.14932315174934 7.281346120899081 5.236679306354576 7.356958360783255 5.309708051570261 L 9.172250166161849 7.124999856948853 L 4.749999904632569 7.124999856948853 Z",
                          "windingRule": "EVENODD"
                        }
                      ],
                      "vectorNetwork": {
                        "vertices": [
                          {
                            "x": 0,
                            "y": 7.916666507720947,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.916666507720947,
                            "y": 0,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 15.833333015441895,
                            "y": 7.916666507720947,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.916666507720947,
                            "y": 15.833333015441895,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 4.749999904632569,
                            "y": 7.124999856948853,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 4.190207198573853,
                            "y": 7.356873801662232,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 3.9583332538604736,
                            "y": 7.916666507720947,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 4.190207198573853,
                            "y": 8.476459213779663,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 4.749999904632569,
                            "y": 8.708333158493042,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 9.172250166161849,
                            "y": 8.708333158493042,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.356958360783255,
                            "y": 10.523624963871635,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.1347581305134105,
                            "y": 11.08048377042769,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.366601875540709,
                            "y": 11.633397742989564,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.919515848102583,
                            "y": 11.865242243009016,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 8.47637465465864,
                            "y": 11.643042012739171,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 11.643042012739171,
                            "y": 8.47637465465864,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 11.874830643339374,
                            "y": 7.916666507720947,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 11.643042012739171,
                            "y": 7.356958360783255,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 8.47637465465864,
                            "y": 4.190291757694877,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 8.219403260828585,
                            "y": 4.012878039377552,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.913817167339312,
                            "y": 3.9486350021720003,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.607161249970659,
                            "y": 4.007557609682431,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.347145727783754,
                            "y": 4.1804787471993,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.174224590266886,
                            "y": 4.44049464688228,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.115301227764303,
                            "y": 4.747150941747009,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.179544264969855,
                            "y": 5.052736657740207,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 7.356958360783255,
                            "y": 5.309708051570261,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          },
                          {
                            "x": 9.172250166161849,
                            "y": 7.124999856948853,
                            "strokeCap": "NONE",
                            "strokeJoin": "MITER",
                            "cornerRadius": 0,
                            "handleMirroring": "NONE"
                          }
                        ],
                        "segments": [
                          {
                            "start": 0,
                            "end": 1,
                            "tangentStart": {
                              "x": 0,
                              "y": -4.3723747249762255
                            },
                            "tangentEnd": {
                              "x": -4.3723747249762255,
                              "y": 0
                            }
                          },
                          {
                            "start": 1,
                            "end": 2,
                            "tangentStart": {
                              "x": 4.3723747249762255,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": -4.3723747249762255
                            }
                          },
                          {
                            "start": 2,
                            "end": 3,
                            "tangentStart": {
                              "x": 0,
                              "y": 4.3723747249762255
                            },
                            "tangentEnd": {
                              "x": 4.3723747249762255,
                              "y": 0
                            }
                          },
                          {
                            "start": 3,
                            "end": 0,
                            "tangentStart": {
                              "x": -4.3723747249762255,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": 4.3723747249762255
                            }
                          },
                          {
                            "start": 4,
                            "end": 5,
                            "tangentStart": {
                              "x": -0.20996305794173084,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0.14846629289231503,
                              "y": -0.14846629289231503
                            }
                          },
                          {
                            "start": 5,
                            "end": 6,
                            "tangentStart": {
                              "x": -0.14846629289231503,
                              "y": 0.14846629289231503
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": -0.20996305794173084
                            }
                          },
                          {
                            "start": 6,
                            "end": 7,
                            "tangentStart": {
                              "x": 0,
                              "y": 0.20996305794173084
                            },
                            "tangentEnd": {
                              "x": -0.14846629289231503,
                              "y": -0.14846629289231503
                            }
                          },
                          {
                            "start": 7,
                            "end": 8,
                            "tangentStart": {
                              "x": 0.14846629289231503,
                              "y": 0.14846629289231503
                            },
                            "tangentEnd": {
                              "x": -0.20996305794173084,
                              "y": 0
                            }
                          },
                          {
                            "start": 8,
                            "end": 9,
                            "tangentStart": {
                              "x": 0,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": 0
                            }
                          },
                          {
                            "start": 9,
                            "end": 10,
                            "tangentStart": {
                              "x": 0,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": 0
                            }
                          },
                          {
                            "start": 10,
                            "end": 11,
                            "tangentStart": {
                              "x": -0.1442084674641201,
                              "y": 0.14931004380918084
                            },
                            "tangentEnd": {
                              "x": -0.0018037485062284198,
                              "y": -0.20757244607294753
                            }
                          },
                          {
                            "start": 11,
                            "end": 12,
                            "tangentStart": {
                              "x": 0.0018037485062284198,
                              "y": 0.20757244607294753
                            },
                            "tangentEnd": {
                              "x": -0.146781421734363,
                              "y": -0.146781421734363
                            }
                          },
                          {
                            "start": 12,
                            "end": 13,
                            "tangentStart": {
                              "x": 0.146781421734363,
                              "y": 0.146781421734363
                            },
                            "tangentEnd": {
                              "x": -0.20757244607294753,
                              "y": -0.0018037485062284198
                            }
                          },
                          {
                            "start": 13,
                            "end": 14,
                            "tangentStart": {
                              "x": 0.20757244607294753,
                              "y": 0.0018037485062284198
                            },
                            "tangentEnd": {
                              "x": -0.14931004380918084,
                              "y": 0.1442084674641201
                            }
                          },
                          {
                            "start": 14,
                            "end": 15,
                            "tangentStart": {
                              "x": 0,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": 0
                            }
                          },
                          {
                            "start": 15,
                            "end": 16,
                            "tangentStart": {
                              "x": 0.1484145877266556,
                              "y": -0.14845941538568042
                            },
                            "tangentEnd": {
                              "x": -2.8125649392482e-15,
                              "y": 0.20992162774739
                            }
                          },
                          {
                            "start": 16,
                            "end": 17,
                            "tangentStart": {
                              "x": 0,
                              "y": -0.20992162774739
                            },
                            "tangentEnd": {
                              "x": 0.1484145877266556,
                              "y": 0.14845941538568042
                            }
                          },
                          {
                            "start": 17,
                            "end": 18,
                            "tangentStart": {
                              "x": 0,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": 0
                            }
                          },
                          {
                            "start": 18,
                            "end": 19,
                            "tangentStart": {
                              "x": -0.07302874521568477,
                              "y": -0.07561223988417468
                            },
                            "tangentEnd": {
                              "x": 0.09658649400913326,
                              "y": 0.041490458050326494
                            }
                          },
                          {
                            "start": 19,
                            "end": 20,
                            "tangentStart": {
                              "x": -0.09658649400913326,
                              "y": -0.041490458050326494
                            },
                            "tangentEnd": {
                              "x": 0.10511695568812983,
                              "y": 0.0009134379274676252
                            }
                          },
                          {
                            "start": 20,
                            "end": 21,
                            "tangentStart": {
                              "x": -0.10511695568812983,
                              "y": -0.0009134379274676252
                            },
                            "tangentEnd": {
                              "x": 0.09729293662673087,
                              "y": -0.03980569896152204
                            }
                          },
                          {
                            "start": 21,
                            "end": 22,
                            "tangentStart": {
                              "x": -0.09729293662673087,
                              "y": 0.03980569896152204
                            },
                            "tangentEnd": {
                              "x": 0.07433172010900257,
                              "y": -0.07433172010900257
                            }
                          },
                          {
                            "start": 22,
                            "end": 23,
                            "tangentStart": {
                              "x": -0.07433172010900257,
                              "y": 0.07433172010900257
                            },
                            "tangentEnd": {
                              "x": 0.03980569896152204,
                              "y": -0.09729293662673087
                            }
                          },
                          {
                            "start": 23,
                            "end": 24,
                            "tangentStart": {
                              "x": -0.03980569896152204,
                              "y": 0.09729293662673087
                            },
                            "tangentEnd": {
                              "x": -0.0009134379274676252,
                              "y": -0.10511695568812983
                            }
                          },
                          {
                            "start": 24,
                            "end": 25,
                            "tangentStart": {
                              "x": 0.0009134379274676252,
                              "y": 0.10511695568812983
                            },
                            "tangentEnd": {
                              "x": -0.041490458050326494,
                              "y": -0.09658649400913326
                            }
                          },
                          {
                            "start": 25,
                            "end": 26,
                            "tangentStart": {
                              "x": 0.041490458050326494,
                              "y": 0.09658649400913326
                            },
                            "tangentEnd": {
                              "x": -0.07561223988417468,
                              "y": -0.07302874521568477
                            }
                          },
                          {
                            "start": 26,
                            "end": 27,
                            "tangentStart": {
                              "x": 0,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": 0
                            }
                          },
                          {
                            "start": 27,
                            "end": 4,
                            "tangentStart": {
                              "x": 0,
                              "y": 0
                            },
                            "tangentEnd": {
                              "x": 0,
                              "y": 0
                            }
                          }
                        ],
                        "regions": [
                          {
                            "windingRule": "EVENODD",
                            "loops": [
                              [
                                0,
                                1,
                                2,
                                3
                              ],
                              [
                                4,
                                5,
                                6,
                                7,
                                8,
                                9,
                                10,
                                11,
                                12,
                                13,
                                14,
                                15,
                                16,
                                17,
                                18,
                                19,
                                20,
                                21,
                                22,
                                23,
                                24,
                                25,
                                26,
                                27
                              ]
                            ],
                            "fills": [
                              {
                                "type": "SOLID",
                                "visible": true,
                                "opacity": 1,
                                "blendMode": "NORMAL",
                                "color": {
                                  "r": 1,
                                  "g": 1,
                                  "b": 1,
                                  "a": 1
                                }
                              }
                            ]
                          }
                        ]
                      },
                      "fills": [
                        {
                          "type": "SOLID",
                          "visible": true,
                          "opacity": 1,
                          "blendMode": "NORMAL",
                          "color": {
                            "r": 1,
                            "g": 1,
                            "b": 1,
                            "a": 1
                          }
                        }
                      ],
                      "relativeTransform": [
                        [
                          1,
                          0,
                          1.5833332538604736
                        ],
                        [
                          0,
                          1,
                          1.5833332538604736
                        ]
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        "previewData": "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"
      },
      {
        "title": "Frame 550",
        "width": 179,
        "height": 48,
        "createdAt": "2026-08-09T22:07:57.136Z",
        "nodeData": {
          "type": "FRAME",
          "name": "Frame 550",
          "visible": true,
          "locked": false,
          "opacity": 1,
          "blendMode": "PASS_THROUGH",
          "rotation": 0,
          "x": 658,
          "y": 3874,
          "width": 179,
          "height": 48,
          "isMask": false,
          "maskType": "ALPHA",
          "constraints": {
            "horizontal": "MIN",
            "vertical": "MIN"
          },
          "cornerRadius": 36,
          "topLeftRadius": 36,
          "topRightRadius": 36,
          "bottomRightRadius": 36,
          "bottomLeftRadius": 36,
          "cornerSmoothing": 0,
          "layoutAlign": "INHERIT",
          "layoutGrow": 0,
          "layoutSizingHorizontal": "HUG",
          "layoutSizingVertical": "FIXED",
          "layoutPositioning": "AUTO",
          "fills": [
            {
              "type": "SOLID",
              "visible": true,
              "opacity": 1,
              "blendMode": "NORMAL",
              "color": {
                "r": 0.040855731815099716,
                "g": 0.1462036371231079,
                "b": 0.37728941440582275,
                "a": 1
              }
            }
          ],
          "relativeTransform": [
            [
              1,
              0,
              658
            ],
            [
              0,
              1,
              3874
            ]
          ],
          "layoutMode": "HORIZONTAL",
          "clipsContent": false,
          "itemSpacing": 10,
          "paddingLeft": 24,
          "paddingRight": 24,
          "paddingTop": 0,
          "paddingBottom": 0,
          "counterAxisSpacing": 0,
          "primaryAxisAlignItems": "CENTER",
          "counterAxisAlignItems": "CENTER",
          "primaryAxisSizingMode": "AUTO",
          "counterAxisSizingMode": "FIXED",
          "children": [
            {
              "type": "TEXT",
              "name": "Our solutions",
              "visible": true,
              "locked": false,
              "opacity": 1,
              "blendMode": "PASS_THROUGH",
              "rotation": 0,
              "x": 24,
              "y": 18,
              "width": 107,
              "height": 12,
              "isMask": false,
              "maskType": "ALPHA",
              "constraints": {
                "horizontal": "MIN",
                "vertical": "MIN"
              },
              "layoutAlign": "INHERIT",
              "layoutGrow": 0,
              "layoutSizingHorizontal": "HUG",
              "layoutSizingVertical": "HUG",
              "layoutPositioning": "AUTO",
              "characters": "Our solutions",
              "fontSize": 16,
              "fontName": {
                "family": "Inter",
                "style": "Bold"
              },
              "textAlignHorizontal": "LEFT",
              "textAlignVertical": "TOP",
              "textAutoResize": "WIDTH_AND_HEIGHT",
              "letterSpacing": {
                "value": 0.5,
                "unit": "PERCENT"
              },
              "lineHeight": {
                "unit": "AUTO"
              },
              "paragraphSpacing": 28,
              "paragraphIndent": 0,
              "textDecoration": "NONE",
              "textCase": "ORIGINAL",
              "leadingTrim": "CAP_HEIGHT",
              "fills": [
                {
                  "type": "SOLID",
                  "visible": true,
                  "opacity": 1,
                  "blendMode": "NORMAL",
                  "color": {
                    "r": 1,
                    "g": 1,
                    "b": 1,
                    "a": 1
                  }
                }
              ],
              "relativeTransform": [
                [
                  1,
                  0,
                  24
                ],
                [
                  0,
                  1,
                  18
                ]
              ]
            },
            {
              "type": "VECTOR",
              "name": "Vector",
              "visible": true,
              "locked": false,
              "opacity": 1,
              "blendMode": "PASS_THROUGH",
              "rotation": 0,
              "x": 141,
              "y": 18,
              "width": 14,
              "height": 12,
              "isMask": false,
              "maskType": "ALPHA",
              "constraints": {
                "horizontal": "MIN",
                "vertical": "MIN"
              },
              "cornerRadius": 0,
              "cornerSmoothing": 0,
              "layoutAlign": "INHERIT",
              "layoutGrow": 0,
              "layoutSizingHorizontal": "FIXED",
              "layoutSizingVertical": "FIXED",
              "layoutPositioning": "AUTO",
              "vectorPaths": [
                {
                  "data": "M 0 6 L 14 6 M 14 6 L 8 0 M 14 6 L 8 12",
                  "windingRule": "NONE"
                }
              ],
              "vectorNetwork": {
                "vertices": [
                  {
                    "x": 0,
                    "y": 6,
                    "strokeCap": "ROUND",
                    "strokeJoin": "ROUND",
                    "cornerRadius": 0,
                    "handleMirroring": "NONE"
                  },
                  {
                    "x": 14,
                    "y": 6,
                    "strokeCap": "ROUND",
                    "strokeJoin": "ROUND",
                    "cornerRadius": 0,
                    "handleMirroring": "NONE"
                  },
                  {
                    "x": 8,
                    "y": 0,
                    "strokeCap": "ROUND",
                    "strokeJoin": "ROUND",
                    "cornerRadius": 0,
                    "handleMirroring": "NONE"
                  },
                  {
                    "x": 8,
                    "y": 12,
                    "strokeCap": "ROUND",
                    "strokeJoin": "ROUND",
                    "cornerRadius": 0,
                    "handleMirroring": "NONE"
                  }
                ],
                "segments": [
                  {
                    "start": 0,
                    "end": 1,
                    "tangentStart": {
                      "x": 0,
                      "y": 0
                    },
                    "tangentEnd": {
                      "x": 0,
                      "y": 0
                    }
                  },
                  {
                    "start": 2,
                    "end": 1,
                    "tangentStart": {
                      "x": 0,
                      "y": 0
                    },
                    "tangentEnd": {
                      "x": 0,
                      "y": 0
                    }
                  },
                  {
                    "start": 1,
                    "end": 3,
                    "tangentStart": {
                      "x": 0,
                      "y": 0
                    },
                    "tangentEnd": {
                      "x": 0,
                      "y": 0
                    }
                  }
                ]
              },
              "relativeTransform": [
                [
                  1,
                  0,
                  141
                ],
                [
                  0,
                  1,
                  18
                ]
              ],
              "strokes": [
                {
                  "type": "SOLID",
                  "visible": true,
                  "opacity": 1,
                  "blendMode": "NORMAL",
                  "color": {
                    "r": 1,
                    "g": 1,
                    "b": 1,
                    "a": 1
                  }
                }
              ],
              "strokeWeight": 2,
              "strokeAlign": "CENTER",
              "strokeCap": "ROUND",
              "strokeJoin": "ROUND"
            }
          ]
        },
        "previewData": "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"
      },
      {
        "title": "Retro rounded corner Button Dark Mode",
        "width": 158,
        "height": 64,
        "createdAt": "2026-08-09T22:07:38.985Z",
        "nodeData": {
          "type": "INSTANCE",
          "name": "Retro rounded corner Button Dark Mode",
          "visible": true,
          "locked": false,
          "opacity": 1,
          "blendMode": "PASS_THROUGH",
          "rotation": 0,
          "x": -2615,
          "y": 4103,
          "width": 158,
          "height": 64,
          "isMask": false,
          "maskType": "ALPHA",
          "constraints": {
            "horizontal": "MIN",
            "vertical": "MIN"
          },
          "cornerRadius": 10,
          "topLeftRadius": 10,
          "topRightRadius": 10,
          "bottomRightRadius": 10,
          "bottomLeftRadius": 10,
          "cornerSmoothing": 0,
          "layoutAlign": "INHERIT",
          "layoutGrow": 0,
          "layoutSizingHorizontal": "HUG",
          "layoutSizingVertical": "HUG",
          "layoutPositioning": "AUTO",
          "fills": [
            {
              "type": "SOLID",
              "visible": true,
              "opacity": 1,
              "blendMode": "NORMAL",
              "color": {
                "r": 1,
                "g": 1,
                "b": 1,
                "a": 1
              }
            }
          ],
          "relativeTransform": [
            [
              1,
              0,
              -2615
            ],
            [
              0,
              1,
              4103
            ]
          ],
          "strokes": [
            {
              "type": "SOLID",
              "visible": true,
              "opacity": 1,
              "blendMode": "NORMAL",
              "color": {
                "r": 0,
                "g": 0,
                "b": 0,
                "a": 1
              }
            }
          ],
          "strokeWeight": 2,
          "strokeAlign": "CENTER",
          "strokeCap": "NONE",
          "strokeJoin": "MITER",
          "effects": [
            {
              "type": "DROP_SHADOW",
              "visible": true,
              "blendMode": "NORMAL",
              "offset": {
                "x": 5,
                "y": 5
              },
              "radius": 0,
              "spread": 0,
              "color": {
                "r": 0,
                "g": 0,
                "b": 0,
                "a": 1
              },
              "showShadowBehindNode": false
            }
          ],
          "layoutMode": "HORIZONTAL",
          "clipsContent": false,
          "itemSpacing": 10,
          "paddingLeft": 35,
          "paddingRight": 35,
          "paddingTop": 15,
          "paddingBottom": 15,
          "counterAxisSpacing": 0,
          "primaryAxisAlignItems": "CENTER",
          "counterAxisAlignItems": "CENTER",
          "primaryAxisSizingMode": "AUTO",
          "counterAxisSizingMode": "AUTO",
          "children": [
            {
              "type": "TEXT",
              "name": "Button",
              "visible": true,
              "locked": false,
              "opacity": 1,
              "blendMode": "PASS_THROUGH",
              "rotation": 0,
              "x": 35,
              "y": 15,
              "width": 88,
              "height": 34,
              "isMask": false,
              "maskType": "ALPHA",
              "constraints": {
                "horizontal": "MIN",
                "vertical": "MIN"
              },
              "layoutAlign": "INHERIT",
              "layoutGrow": 0,
              "layoutSizingHorizontal": "HUG",
              "layoutSizingVertical": "HUG",
              "layoutPositioning": "AUTO",
              "characters": "Button",
              "fontSize": 28,
              "fontName": {
                "family": "Inter",
                "style": "Regular"
              },
              "textAlignHorizontal": "CENTER",
              "textAlignVertical": "CENTER",
              "textAutoResize": "WIDTH_AND_HEIGHT",
              "letterSpacing": {
                "value": 0,
                "unit": "PERCENT"
              },
              "lineHeight": {
                "unit": "AUTO"
              },
              "paragraphSpacing": 0,
              "paragraphIndent": 0,
              "textDecoration": "NONE",
              "textCase": "ORIGINAL",
              "leadingTrim": "NONE",
              "fills": [
                {
                  "type": "SOLID",
                  "visible": true,
                  "opacity": 1,
                  "blendMode": "NORMAL",
                  "color": {
                    "r": 0,
                    "g": 0,
                    "b": 0,
                    "a": 1
                  }
                }
              ],
              "relativeTransform": [
                [
                  1,
                  0,
                  35
                ],
                [
                  0,
                  1,
                  15
                ]
              ]
            }
          ]
        },
        "previewData": "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"
      }
    ]
  },
  {
    "name": "Example folder 2",
    "styles": [
      {
        "title": "Drop2",
        "width": 150,
        "height": 70,
        "createdAt": "2026-08-09T21:15:35.423Z",
        "nodeData": {
          "type": "FRAME",
          "name": "Drop2",
          "visible": true,
          "locked": false,
          "opacity": 1,
          "blendMode": "PASS_THROUGH",
          "rotation": 0,
          "x": -3574,
          "y": 4157,
          "width": 150,
          "height": 70,
          "isMask": false,
          "maskType": "ALPHA",
          "constraints": {
            "horizontal": "MIN",
            "vertical": "MIN"
          },
          "cornerRadius": 0,
          "topLeftRadius": 0,
          "topRightRadius": 0,
          "bottomRightRadius": 0,
          "bottomLeftRadius": 0,
          "cornerSmoothing": 0,
          "layoutAlign": "INHERIT",
          "layoutGrow": 0,
          "layoutSizingHorizontal": "HUG",
          "layoutSizingVertical": "FIXED",
          "layoutPositioning": "AUTO",
          "relativeTransform": [
            [
              1,
              0,
              -3574
            ],
            [
              0,
              1,
              4157
            ]
          ],
          "layoutMode": "VERTICAL",
          "clipsContent": false,
          "itemSpacing": 15,
          "paddingLeft": 0,
          "paddingRight": 0,
          "paddingTop": 0,
          "paddingBottom": 0,
          "counterAxisSpacing": 0,
          "primaryAxisAlignItems": "MIN",
          "counterAxisAlignItems": "MIN",
          "primaryAxisSizingMode": "FIXED",
          "counterAxisSizingMode": "AUTO",
          "children": [
            {
              "type": "RECTANGLE",
              "name": "Rectangle",
              "visible": true,
              "locked": false,
              "opacity": 1,
              "blendMode": "PASS_THROUGH",
              "rotation": 0,
              "x": 0,
              "y": 0,
              "width": 150,
              "height": 70,
              "isMask": false,
              "maskType": "ALPHA",
              "constraints": {
                "horizontal": "MIN",
                "vertical": "MIN"
              },
              "cornerRadius": 16,
              "topLeftRadius": 16,
              "topRightRadius": 16,
              "bottomRightRadius": 16,
              "bottomLeftRadius": 16,
              "cornerSmoothing": 0,
              "layoutAlign": "INHERIT",
              "layoutGrow": 0,
              "layoutSizingHorizontal": "FIXED",
              "layoutSizingVertical": "FIXED",
              "layoutPositioning": "AUTO",
              "fills": [
                {
                  "type": "SOLID",
                  "visible": true,
                  "opacity": 1,
                  "blendMode": "NORMAL",
                  "color": {
                    "r": 0.9529411792755127,
                    "g": 0.95686274766922,
                    "b": 0.9647058844566345,
                    "a": 1
                  }
                }
              ],
              "relativeTransform": [
                [
                  1,
                  0,
                  0
                ],
                [
                  0,
                  1,
                  0
                ]
              ],
              "effects": [
                {
                  "type": "DROP_SHADOW",
                  "visible": true,
                  "blendMode": "NORMAL",
                  "offset": {
                    "x": 0,
                    "y": 25
                  },
                  "radius": 50,
                  "spread": -12,
                  "color": {
                    "r": 0,
                    "g": 0,
                    "b": 0,
                    "a": 0.25
                  },
                  "showShadowBehindNode": false
                }
              ]
            }
          ]
        },
        "previewData": "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"
      },
      {
        "title": "Drop1",
        "width": 150,
        "height": 70,
        "createdAt": "2026-08-09T21:15:32.004Z",
        "nodeData": {
          "type": "FRAME",
          "name": "Drop1",
          "visible": true,
          "locked": false,
          "opacity": 1,
          "blendMode": "PASS_THROUGH",
          "rotation": 0,
          "x": -3738,
          "y": 4157,
          "width": 150,
          "height": 70,
          "isMask": false,
          "maskType": "ALPHA",
          "constraints": {
            "horizontal": "MIN",
            "vertical": "MIN"
          },
          "cornerRadius": 0,
          "topLeftRadius": 0,
          "topRightRadius": 0,
          "bottomRightRadius": 0,
          "bottomLeftRadius": 0,
          "cornerSmoothing": 0,
          "layoutAlign": "INHERIT",
          "layoutGrow": 0,
          "layoutSizingHorizontal": "HUG",
          "layoutSizingVertical": "FIXED",
          "layoutPositioning": "AUTO",
          "relativeTransform": [
            [
              1,
              0,
              -3738
            ],
            [
              0,
              1,
              4157
            ]
          ],
          "layoutMode": "VERTICAL",
          "clipsContent": false,
          "itemSpacing": 15,
          "paddingLeft": 0,
          "paddingRight": 0,
          "paddingTop": 0,
          "paddingBottom": 0,
          "counterAxisSpacing": 0,
          "primaryAxisAlignItems": "MIN",
          "counterAxisAlignItems": "MIN",
          "primaryAxisSizingMode": "FIXED",
          "counterAxisSizingMode": "AUTO",
          "children": [
            {
              "type": "RECTANGLE",
              "name": "Rectangle",
              "visible": true,
              "locked": false,
              "opacity": 1,
              "blendMode": "PASS_THROUGH",
              "rotation": 0,
              "x": 0,
              "y": 0,
              "width": 150,
              "height": 70,
              "isMask": false,
              "maskType": "ALPHA",
              "constraints": {
                "horizontal": "MIN",
                "vertical": "MIN"
              },
              "cornerRadius": 16,
              "topLeftRadius": 16,
              "topRightRadius": 16,
              "bottomRightRadius": 16,
              "bottomLeftRadius": 16,
              "cornerSmoothing": 0,
              "layoutAlign": "INHERIT",
              "layoutGrow": 0,
              "layoutSizingHorizontal": "FIXED",
              "layoutSizingVertical": "FIXED",
              "layoutPositioning": "AUTO",
              "fills": [
                {
                  "type": "SOLID",
                  "visible": true,
                  "opacity": 1,
                  "blendMode": "NORMAL",
                  "color": {
                    "r": 0.9529411792755127,
                    "g": 0.95686274766922,
                    "b": 0.9647058844566345,
                    "a": 1
                  }
                }
              ],
              "relativeTransform": [
                [
                  1,
                  0,
                  0
                ],
                [
                  0,
                  1,
                  0
                ]
              ],
              "effects": [
                {
                  "type": "DROP_SHADOW",
                  "visible": true,
                  "blendMode": "NORMAL",
                  "offset": {
                    "x": 0,
                    "y": 8
                  },
                  "radius": 10,
                  "spread": -6,
                  "color": {
                    "r": 0,
                    "g": 0,
                    "b": 0,
                    "a": 0.10000000149011612
                  },
                  "showShadowBehindNode": false
                },
                {
                  "type": "DROP_SHADOW",
                  "visible": true,
                  "blendMode": "NORMAL",
                  "offset": {
                    "x": 0,
                    "y": 20
                  },
                  "radius": 25,
                  "spread": -5,
                  "color": {
                    "r": 0,
                    "g": 0,
                    "b": 0,
                    "a": 0.10000000149011612
                  },
                  "showShadowBehindNode": false
                }
              ]
            }
          ]
        },
        "previewData": "iVBORw0KGgoAAAANSUhEUgAAAL4AAABuCAYAAACZSqmyAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAJyxJREFUeAHtXUusZUd13efc97r79c8N5mPAn8YBO9gJARElYgTJDEV8pABSiPIRA0vBEwZkkAm2J5CAIitiEAkGQUEgGfKBOCJykIUTRbL4WCD8CQrIaTcGg43t/rjdtvvdW6lVb++6q/apc+595r0JqS2de86p/2ftXbt21anbyR5RCKHDveu6MBUG/rifPXv2ROg33r05m70tvr8pXiej3wlp9EtLsY/PxD4+1Un33cVi/h+LxfZXTpw48bQL0xmGGC94t2d2M3fZJXWrAnBB7H0ss7FCc9inn754st+YfzhW/k8a0BtFHHx2NpPbtra2Tnm/MaytwuQ6Qngl8DkjD2yfeK0ALOFnG4c+KrL4sDRq5Knrbj12ZOu2MYG5G6qNFIPs1o3sE1iHqyzcmTPPXTPbDF+PEU5Ko0YjFIF0anPW/Y6X/hFDwNmkRjGmDo3hs19RlpSQXUgIhTB3KwDdOw2T3S5cuPAbs9ningb6RqsIGLk0D19/5oUX3sQ4EhXQU1LcMMp+HJ4FeE6w6jGRSY3zxJGqN6/tNw7c3UDfaDcU8XJqe/uF340T3/81twrm0qP38zTm1/lAydFJ8xx4tapTjAjnzl041fXdNdKo0S4J4L906fk3R/CfTe8E9PQwYdWZEsbm3ntHjsBqDqk6HfsB6OSeh5jzFy7e0kDf6MVSBNLJjc3NW/J7KHFMWB1Kc6fi2FVoMeZpESijqjpDz92yjOk5TyZ++tMzrz1y9MDD0qjRL0gbs+61hw4degTPlYmrgY5HgKCjwyT1lqA5uEmFkD8D3e6eUeTWW2/tDx9ecmqjRr8IbW/PP3zbbbcNVHLTNgzkpJmIN7Dw3agq8SdMmGZWEuYq4j7ZsdcfeEoaNdoTCmeeevLStVdffdkZvI3MKU3KZ3V7kIrTWrKO7604Xt9X98K85BJO977v3yONGu0ZdScuv/zguwE9Fa4JszanNCkvZFghKb9Mxc1ds6rDUt5s8pyIeVXCuGFI3i6NGu0ldfI2NaLgbWxhyjxZG6mqOaBiAcsZ/pcpOg7i0YDcBLpYP9t4ozRqtIcUwuJNrOc7lZwtjdnsuWr1tq/p9yM6fuc5SVS3Mv1e6aQ0arS3dPKWW24xoZxu+hzMqiOk6pgf3z311VUtso+S3sTvmRlsCAJHauHajstGe0zdCdMovB6vz+lG7p0X4P69H/MgM5Fd1YktW3fWsZ82avRiKJrJq7hTbJppM/CzLOX1QKPZ8DqQ058CqzHdDo0VjG39jRrtKUGb8CZLwqgtoCZ/p54PNrPh3rMuVDFpinsOpPLwFgV53/vet3KnZ6NGL5be//739yb17c6MYELZreIOtjoYbXiH2oKVvYpOcGlCIVSQcOONN0qjRvtBEVsZlxFv3jubLZ3A9gI6p7ERwtpfumTbkCWM7Qnm+eCDDzY1p9G+EfD1xS9+McQJbno3oUw7CZJgZhWd7vWV28q+hhS4W+o3WcqrdLchJzMMc2SjRvtBwKMJWAM8qTIZ8E7dYdPnUo0Pw0+4hCYLBZcQ9xSrYxh6dPjpzj/z7LY0arTHdOzo4c04j0xY/NKXvhQUc4bXLPVZtQF5Y4xhuq/MekUqOpEtFuhztt/HwnQ33HBDdftCo0Z7RQC9aRUsaL0+bxNefSi23rAgr2026xj8St1IYXoUxoafJ554orvzX796SRo12mOKEv/AW97yFjl27Fh4+ctfHkzquxVdr7mMprfh1Blzz3ZQKfffF3oTgx503XXXNYnfaF8IoL/vvvsKyw5dwN0C7t1y3ckfjFCoQBsVY3/toxORUuqD2zpnVjKVp1GjfaG3v/3tcs8990DTyCZNh8OOtHHcB/NTe2c7Pk9meS9O7VMuy6xDIaDi4OX8+fPNstNoX+js2bN9VHPm9o65JTQOxWFgFZ1Xcrvlloak79tCbc97dLr61y0AOW8OSjebVQP04EJcjRrtF735zW8OUbB2kPoQtqDaJFek+hVW/miFHcao81ac7EG5xIL0KIzZ96M583lp1GiP6bd/6zcPbm1thWuvvXYRJ7YJ/CbxSdxDz89q+tTibLFlgQJ2bM+Hn5mJXEbJEdIek4+LFy9Ko0b7QQ899BCk/QIaRsRaF8FvIA+kz3dkzSk2sw3M9uzBiwHJc7kw4BkBG4ayRefhhx+G/hUef/zx/hvf/HaT+I32nEziA2dQeaKFZ6Fe2erIuJXhCSAF8AtzZjeyt54YIk8ceFaNoQdc+MILLzSrTqN9IWALwAfozU11/fQODHbjJ4IMP7bydny3AlZsT+CPAWxSgQugjxwIc6Y0id9oPyguYB2K+ApR5TGrI4O5kPqMXRcmYz3r+E7dCc4emvUlk/QwJ5EZMycsjRrtE0XQp7lkpC6qPJhbBp3kJv+4iuu1lgKTYYcSzje6+l6drNqIWnfsK3daLAgx4071LUj9gLs0arQPdPLkye7w4cMhGlCSymPuUHEM+N5+79Uc1v2ZG4oJrvpltV5XyBIjQNojQ1E1Bw8R9GmLczRnPieNGu0x/fqv3bB16tQpTGizmoONa4pDkXIyy/vwq2dpDvbjcwRzZ9BXvn5JFBlgAa6URo32iV73utd1purgR0HP+n4yutAZPMWHKHzvvKmnZsv3Cr/QZjVI/LiokEaACPz+/gceasb8RntOcXK7JTsAX9CGtQLwtMbkow/wvdG5o5fV039s7r90SXfbNISFK3Dj9nb7BqXR/lAUqrKxkWwx0FIWhj2lbHxhaS9DwC8PmiJHv8rF+n+S9uAoLFqZfo/MMbnFhAMrayhU1PGflUaN9piue/2vHIk0P3DgQMDkNkp8OC8oCH+VFWixFdQ50+bOEYLdcGuyqTfFJn8kbJMJkvZp4SpKfBGRtjuz0b7QY489xiAH/grhzHvzu1LX4W03+d6ziiOkM1X0pLw3B7ZTG2bAfeBCPF955ZVtcttoXwiqzg9/+EPTLAx/wXZqgkziU7ROjTS8NrU8ZcFeXIQEdFqtDe6eCQsLoKiDNYnfaF8ozh+T5FbNQtSMnhdRQbyNRlTH75Tgzjr+hjp4wGbVhzjIEoOOnzNTXatRo30lE6rQLnROyRPcwF9hJYflelSQyly2sONbBNqJmb9f5ETtmAcQTEvYowOOjAsM0qjRfhHWiTCf1P06WRPBgiqH0w/Q7SQQr+Mn8BfnXYbl51nF0q+QmhO5rKPVsjS5xV1B387PbLQv9Pzzz/cRYyHq+cG+7bbvbz2pdlPdO2bM0LvwdnCscUZx8gKGE2wMogQ70++j7gX9ay6NGu0DXX/99WlnAL7482e06hdZhf0+0H9kqfvy20QsYFH8cg+nSntdECi2K0DVwaQCuzKxeKUz7U7a7sxG+0Sw6Dz66KPh8OHDC7MoQsdXCjTvHHw1KMuPVJZ+Oabbx8zbE9zuTAZ4OlIEUh96/rlz52b//f3/aQtYjfac3vCr1x0+fvz4HDo+Jri0Lx+0IIsObnb8TbL9h8phCn7vTV70qn2AgrsdJwKu01k1Fq96FKYBv9F+EYAPyw4kPt519TYoBjMT8JmaRl3tz9/0Hmgj2mAfM5k00zZQzchMSR0mHJED+zgUSaNG+0Hz+bxQo9cxo3cTRwgWk1v8EOj9sq/4Lcm2F9/oVa96VdPxG+0LHTx4cAHLIX3XnYXvrfQ3VLpDcyfAxPmZg23J5u6eC0uOf9admR2A/+9fu7upOo32nLBJDeA3Vcd/ewsVHAfJavCBKZ71/OCOEDQyyc8nKiQ32pmZ7PngNkxq8Q7g33vvvW3LQqN9I78lBhqHfXtroKdDEIo9O16L8X+dMtjKSe6DOzK23Zm6ctudO//MY13XXyaNGu0RRRyePX7syBWie3UwpxQZfHnF2xaqW3D4u5Ok43flH7wlJwP9reX/iyZ/zKT1SJFwzTXXYHKbPJOOH+QRadRoLykEYKrHAhZA/453vMM+QUzEZ2mOJ1GcHxXyXh23Xyf/vy0nZs9QcQB6gP/o0aOJC7FtdDabhRe25/dLo0Z7SNvz+feiUE2qDlTrH/zgB+xtKo7fXVyk4eexvW1TSCm4vTpdeWR40vGNuyD1YVKKbukdehbMmRcvXPhPadRoD+nZCxf+y57NqqPf3Ca82iGydHpy1VjDwj1Pbm2jPn1gPljIAtGX7dlRda7uyiuvlK9+9c47/+ADf/iJpuc32iu6665/uxPahM4j7YgR7NtJfwuEMLxxUpaT2eLj826NY8K7ZZyuZs60e9qyAC5UPX/2yle+snvwwe//1cFDB2+WRo1+QXr+uee+cOONb7gprtTOoeoAZ+4oQVCxZYHBLlL/HLa6jZh3ZNqKLm1Qw23AMNDzo8RPYb/97W/8rTRqtAf0ve9992O4Yw6pX2ElosmtbaDMfzvbVf7i06e7zrk6KRzHwY8uGCTGibPsHhOO5557rsfScixg/8ADD33i8JEjfyaNGr1IOv/Mub989RVXfCxObOdYvFKJH/S4StNCAp2o5o8USbdswySGqP3PbXUDP4i/dNFtoOmjgEceeSTwh+bI4zOf+fuPL8LitDRq9CJoEcLpCPqP4xH6PbYrqJqTjCqwKEY8plVcbJrkj8zNwqPf2GZVnSW//wJL3K42ocR4STgRMlddy77Akle/+tXy85//PHzuc58+87W77n5nA3+j3VLUGn5099fuehee4+QV+/A7E6yYT9pJaiZ8bdMk6fk2sZVAhwCykO+ZC9QzxaFy2LYFTtRMSmKFwTCEDwWwPTkWVp588kl573vfffq+b33zj1ERadRoDZrPFz/65je+9Ucf/OAHH3nZy14W+r4Pb33rW5OpHJNaqDom8TVKMrHT/y0no4uer5NN8kqDLQs7L+UfRHQi1SPCB1YdvNhXWFEfS6PIpUuXZlHy98ePH5996lOfuubd7/n9r8xm/VXSqNEIQUD+0z9++T0f/ehfnIqCdHHhwoXtqMaY3r7QYwTDZZddtgD42ZxJf/0pstyikD8u93llw773pK/TvUkzA9+OELRz8bGUfP/99/cwaeLY8Je+9KWY7M7i6m7/4x//eHbq9Ok/v/ylL/uINGrk6Oy5M5/+609+8pO3337707JzNOAcEn9zc3P+2GOPYQ4phw4dWtjhZTheBHc+Klz365ghkkGfzfOy4xhqk9gp235xt78AwlDzne98J7nj20hIfVh2IuiTKvX0008D/LP43MeKXf1773zXR44fO/5+afT/mhaLxblz58/d8S9f/ufP3HzzzacjRjCR3T579myIoJ8DoFHiQ9IvYMo04JsN376+UgtjSjKUf1KY1fKw/GO48ptb9ewmrDqdVMyaUdVJqo3t0MQzjoLAPXIq7v3VV189O3PmTHfu3LmNI0eOQH3qP/CBPz3xoQ/d9I5XvOIVb42LEzfMNjauipU+Jo1+aSkKwvPbly49GvHxwBNPPnHv39x++1133HHHmWeffXYB0EfsJeBHrCTVJmoOi5/97GeQ9gGgRxoAPk5Z0L/7BNnENvjtCu5LQmMGyfvx3VEMrNYUTECJ5yPC6eRaJhSqtzQi4C0d6G19BP/iC1/47JnPf/7v7oh5/0NMQzAqxMqhLIgXjHlAcZ7QxXcwFL7E4S9wOg3bqXtwYbghOM3kpuFSWaOfuaUASJPimnt20/BJGMDGrGWwsviw2c/yRxiU1adtYan82Z3rou6C/ej6T4CBy25lim1X1FvztDIyKNL/xnKZIsjSSRpWHvjF/LBSn9NC/vGdy2flt75Iz7zvK673LGKfLy5evDgHFuIFgC4s3Ete8hLgIbcBjq55/PHHg+3Tefjhh7kdBmTrT93Iv50Xqk4Y/xdo/o9bNhlZY+YJrpf6cSjrMMnF+1NPPYU7PhxAY0LyS2QCuPUAvgI+jyqxcdJznMik5zHQW2ehgcE4cZjEszFP7kTqXGEAakfx0JjDxvS6mF7yN6AroHoGp+YvsgSurABYbltiFBMWC/ITF9/SMP+g5ciA1foWbpSG9U3hroxRpGV1wEQytkHv0umtvVB+DZPqEdssxP5K4MId75rvHP0c3ZI0j6BfYGIapX2IOEg6/YkTJyD1w+WXX46/9ZzDogMbfrToLLAzQNUcob5K7WJfXwGbOEWtK/+qNvCes8wUUpJNAriBi335dCBnAqbq+SkcTluAjm/Ly7HAmOhCKsyiebOLjABm6FVCQfJ3sdL4Uy/MBXqc0RMbJ1matIHAGAnQQgyhjZnclEFyR6rkSIwEYCAuOkCI63VkSR1sadnEJ7rlv4XXfBlQYCzueKmEs/R66vzsh/KCkUgCduTXWx20njlRbY9cLqRLDFkQ1S+YsDChpm1RK3f2Q5tY+c29UsfURxAyVhcLp9K8hz+eVagu9M/bAPY5SXmJAE/6vLbtApPaCPhFnNgusBMA5+IjHK3aJouOnZspNBLyai27dcvD0bpiP77ei3+O4OHCmYpyovin6Ztuugm6fvpIAMMSPK666irs3UkVixUyTl7ESi4QBxVExaHbQceLDbKtbuB0PKPR5tEyBBCgUdE4aIAUDsMl3GJDb8dwl3CP/tuylEQIi2uh+iEkzrZeSGsbcZAO/GJ4i7+IQ+3c4qjbHHmBKeCOePFCmLmFgb/lh/KaG8Jr2VNeKtW2NazVK+WLumkdg6XNdbALbrijzFQOc7cypXtsy0sIZ/XkS9PK5dH0U1qIx/lbPdF29o470vZhtL+2I9AvaXuk8thdR/uEA2AAqjDwgb6WnZXapNvDdo8RFkJUrTnBjqwkLDIZdm0/fuDdxrK08gwmt36DT+fc/b+iYCGht79gxJD4+te/Pp2niZVcFDiqOsm6A7UnqjsSQWWSf6YFSyoO7rExgk5+vQVJInN0ygyJWSE57Fl2hk77G8hUQfjDAyMI/GMnYFENYdhPPGHUUb/CfIs4sWOgsqV4mn/H8Sg9VqX4LlrOHF7LUrhp+FxWcmddNevlvvz0d5gdvY9Z6wLX0beJAc3cEQaSO/ZHb+1EbZbjqeDMal3sW4l9mwD+zDPPJBDH+UcCfRQGwRabrrjiCrglCa/H1WRhCvDji7+o7y+uvfbaBf/joQlmPTDW/yPKTiD69LAb8chAJzNQ1vH5axd8dG5/s67HN6c/gcO7qjtd1OXyCrEyQFJ1MGmNlcRXXPkPKpQB0EgpWzzjDuBam0ql46ArghGQTnwWhLch1uI8u/yXovSfqUVD0PwGcREW7ph8abychpalAJPFEWVmS1eBIhoXz50Cp7M4Fg/v8I8Lf6Ll6w1o2hdc3oX5g0G43ny3siEOu3XDv34q8rB6aTlT2lEFSfGNIeEey2oMmoQL4qr6mlQZ9B++0tM8syUmYgYLUViZTdoA9HlsdYmm8LQ3B2CH8MRBsboN2dqcD5FiDPjnAscuzHLLQhj+5WfnZsdBKkML9CwMWaTnQ9qncPpVfIjmzAUqhSEMFYRblJ7z+D5/zWtek3S82BALTJLwLDvWH5MYCwVf8oN+iGf44QKYTD1QXTGHh9UAd1xW/siENkxb+LmFlx1JMY9lnVt8gFDzSP4WVvNOqhkuK4eZ5dQ95cX5ww2gwT2mndM0aYgy4d0/a7xcLuSDO9ontv+25rHQ+qdwACaeNe4ijnhQfebWTpRWKr+28ba1rTKj3SHZFzr/SPmhT2VHnTI11dTXnIfsqD+pPdDH2gYJ9FCBzXqDdo7zwfQMvZ7+2C0ZTbA5zbYi20FmFaAbM++Ac0evLww49p5NhjbUdOVfoluEPDFwH/QGKwgKBa60lTUDf5T+4Sc/+UkKC2lPhUySJa7oboPrI3PgeaGNg8bD/AGdao0ZbE6AhkVDQk/EM5hE3XKHIZyBTUGVOgELIni3eQQkEoBunUWjTQoHd8RDXuqfyqBqWVAJB+ZI5YDZTZlX9J7nM3ZHGjS/mRuTwD3GF2NkA4wxJMph9QdQYefGO/K0Omu7iKa9TSrHXNtqzm2kbghvTGv5LoxJTOBQ2YOF134J1j9RjfGMX5gzIezQ3wA9zJYqgLBgJVGvx9pPBheMJPYPKHYqN0gPi03p0eeGA+3F45RHMv8fWMUpVFIOF3nKLBXpb/87igKisLhMz7c4AB2kHMxYcTRI4EDl0RCofHyG1A/aGFiqBiME7YRtAkPSE8EUep/jbh2mnWsTs6CARUelDrLOgxviGnOh0/BuEgzx4CY7k/jkrx0813BziyM7kje5G0A0brosLy3XwvRcWZov0zPAFP0wimZQafnsngFloyLcZWdibOHSJBlbRyy8pRVVCWvPzFxmVeE2NAAT0xXMiwIb2CnOHHo7+gwXwug6A/R2rMCmMsQFqjyJfeMb35hGDmxNQF5YrMKEFnGhzmArMoSpbUcG2f4cKQWx/8TQcB1Y0nes44dxG351NRc6vk1w7RBZLWjaMmpn7ejniGmCiKNHwM34Wh4ruqhIjIdhrceEEWFwfARMWrqAgUbrseJrBcZcAI1lbrExsbhVnJKFdYI4cqS6wM8IfmpKTXVBh2jZ0EnWQWkIZkGAPHTtwdogWJ5IE3MULBJxHKSBeJanhUMe1vDIE/GQFowC3dIM2y2LnCwe6RmAgK0c5UAcXPDD5BBzJWcQsDqlNDQ/nhQHq5Olo2GDr5fmn/pCy8Pu+VkFFurSWRtAoCG92F8QhAv0M67rr78+HTOPvgQGoOKoCpxO6rCDo/jvf/iQWMXawHCghRfvXsOznaszFmigJ9nEFrvhbI8EOBCghzu4koclDFfgdGw0wjvAj4raPn5UXnZ0frPjCpaskefp06cXNvmBewT0PLoF7ZhgjY0ORDh7htqEDu3oHBWkp2HS7j5IIV0kSdLH4gMAutKcCOmo+pWAqqDOkzK4dTv6eErDpB3AQCDKeVp6BhhcKIepmlYXuFn+KB/cMSKKqg3GWKge0ocKoeWYk1qxbWUTZVgwH0yqcLM20jKlNKm9F8pUBmIrT257qzvSRt+Z7i47ej/0d7G8IQTRHrDRU78nLMB0qdhIoIem4E9NUxN4IuBNT1Wo4tawG0IY8+sGk1v2ZO6xRDgzgB9WHZX4rP7YX4AG0/Wx0GXf5IK7sbDFBLfYUGgsW9RIDUb6YAATxYZNo4KZwKwT4GadZnZhpGN3DLVdVxyXgnhppRd3vYKpNgZExDM/PCMi3o04L/UrlufNXGf+WIUU0nlRZqRn+QGUqAvckB8uiw+m1zLnPI35ra4MQEhaCmcqJUZMsfZC/S28tmPuc2tjE0jG8FYGPKNfrHzADPrKnqPJMSUEoQZTMMCO9KLUh8TPUh4E0ENA4hn9DAKGIDCwE9MEqx4XaFjM/YBn2z5vkr+rfHs7EPKmB5mhX91EnzvdosB/A5o2oMVrFrkPNnlcG5ERsP9nU68D8Tqo1yG7oroD+166IgNgJnkkcvFRXFEiQAc5pvfjscEg8vx1WWxwoG9weXd7J/cTLkx6j513Au92Nz+fJvlnP/M3P3PjvEfKdaIWtpY2pc/lP2FUaYua21RbFWXhcvgwI+lx/6S+s76M11G6jqD/CQNbUSBiAeBQBLxhBHg5EIXlJi5gSXGVsaZ3E9yM23zRfHWwhuHP1ckcEdxilkn6jhayjPSTxKznYznZNk7RXwXlMPov1alwxvXQ9fCZmZr4ki0bpPp/LqYuImF0KCoCdw2f8sKQig9hYC7DopndTecVkvxIyywMujMQ+WSpbWVAfFmObDldzdtUKdGyIUxv6VOaKb3olhagXD06Ne/ZYlkup9VbSjNesTRvC2wUVrTOwbVlp+Xy7eAtITlNc/NS1OUpFD7Z5fE1HvqW0jTLTdpjj0UqU2ugHbizMYX1elna44P+D1Yuv5uH8nymWLOQNYgDdWzSlFLiJ6lvl3KmSf0NcGysTOJgvTNnJ24n7j9il44EJiWS1FAJYu/Vy40YNT8bRdK7XUISyvzFSS5K09xYwo3ma5dLdyrOcRenkKTkdqxyz3FGynLcpXuM6+3iHF+nXdkdo7Y4CU99e5iuLeAA/W+4iAYPaAgHZKkxmAaRtAkhSW+Xgpk3OPIIkGkU9KHyz+YKdj6H0A8nGfjKCFbArPLYUKUVOohKGvD1vkVXHgL1bgyQmMDUIXumxj1W86MwebjlDsIzxasNy1PXMZ+/pcH5jpXX31nNG6mDZ/xBGSr5+LIN0mA/vkggrGwLpEGCKgsuVmlxqUqTQS9L9TcJRlH1hnCTsESqdMKZXR70Xt2p4HdJq8Q/T35dwr048HMBrdAyBL/p/anCpt/h0ufMBELzgAojHPGNrddR5z94tneeX/C7pcPvCpBaekc5jZqf1EexoxzWx/fulr/d2d+nbfF9mTkP3yaOYXx7Hp1qR3o/7C/0qevXLPQgBFXaJ+A7iW/4SbiyS7HV25yTrgFmxyj5E6D9BFcowSIDZoAxlccK7ia7GfxU4TzxRQPxKEANxqNAfnYSpRhS4ccM4zuE3Vk6+XQ5HPkdYT9zH8mLwTEoq/k5de/wSHhvFDhcu2p+NQlcab9BGPav1L0oG9xqIOfL+t3uALsCPmOE1OViQktYywKXsciGGSMv8WthikAV8AtbduzZ3XvmTL0XOr8spX5WfUQZwHQ9ccxgjcmNSnMDZo70bO7Ov0jDdZJ15BYNx4c940mFGfm5lh6Xz9IeAaCPV8vPS88tZlRWJSysbzMf17XToA0qbefBveXCeSFWqDQ235PlyG/CkKX8QMUR0usVkwOLTm0Hgj5XTfYDYsnvE6iZj2jYGUh+FN5x8ED6UyNk86cbEfKk2EYE6tRCRaIweQI9ceVhl9LIz5aWn4tY3hZvbCivgK5aJs7bXR68h7ielOZWrfyuTP7Zx8tuVt9KW1fDVgB+aKQPD7o+Z33eS/sC8MAYTWyrZkuimtTvJhlgjCtC+VVWbTLRT6g92cbPTIAhzmy1NOSxrndQnw/6IZJGh2IY5U5gi4EDXjGq+MsBnifiha15zB95VvLzw31RDo7vgaTvNZWwmoYv51h9tRxbvi2tDL49J8p/0MJb31i/UR/y5DWBXt03vGqDdwJ5Bv+IrX5K2o9L+HWGAQO9N2lKZUGLZtq9K3g2dxIDZE73E2BuLGMKGiY9A/BCWe4IGWEYN6mqXhUVrLiYIQ0gtXA8eePwtXC7KdPIdcgLCiFmlOHcamU+2o48Kg/q6up4QEYku1Sku5fwfoFKnNQ3yU3ffBsVOK4YZTLlya1LQCa2MQwykCETZAYgE2dRKXG6HK/Q+UYiCWENOMUQB3jk8Jf5+dFlVZzanSdn4hi19i5uBKuV1aV9YKxOE3mxtD0w1Va+/lIKjwLAY21T6ZNNGVpnfN8WfU/SvabLZ0Fak/aEQ3semOVlimqBCfzJzb+75wx848qa3u9s/bzFAc+bPBrUGEGG84L8zuEdmGvm1Jo0OuBUrsFIZP4cz4Fis8ZIxrzMxI6pN10dvD07u1PZirvl5+o6aLsxEPt8rGyuPcYkeNHOFUtent85g0dNwjNWeDLr55MDBqjo+lWJPwhQcauGCeWe/Zo5qeOFBleJgf7PI4FNhqnx8loALWoU7hNqU03a8H1zLJ4omLxbLb+x+Otelp4BzBi/MhIekPFRcYPvNSnrzYY+3Kq6ujLlfPxqfeXKfevs8bMpae/Ml4OFKVkT9FVVZ13yCXhzp7f48BDlGIBtsoNGIImQG0to0iND82hWl6TUG4sO4ZXA2jO7jb1beq4co2XicC69zbF0puo44p7L5cssJZinyl5tm4l6cntw2w5GcwdsD/K1wF6zMBrRvLOY1NZAv2vJ7/2pEAPQy4jqw/o/MwIaxirLzODXA0glGjCGY5jMLBNMVAy1lUlWDbRF+hSnWKzze0s4H4vHdXOTfc/gPp2Biuh2LU6CVUqLyUYtTW952018X19xI/zI6F+oNLQVoWo6l5Ky8K0BfG27Pb1PTmz53ak7g+fgVtZI/69dvoFqw+FgmBzx504ZC9ePDbuV542R/DcYxKvSkpIJZyukoq/PqP8KFcK79xN+G6vau9Z+tTi+n52A82pwzTSZVRspsZYplB+cFODflUpjkXzifPfhakOMVIYqcis4XEYkADcM4nOn0UjhG76fuvs0/B4Qnx6PShS2SJPK4ecwA4auld+XwZXHz5UG9bartnpOCz9FOHZz5eeyDtpLRhhgpN/WAj/dizmiZ4QRS6KsQ2HVotUaXMI7N7OblCalwYKXmwMUhReaDMu4zjc6TPKqnt1Hwo4NtzOfjwGCwTqW7ogEm1XcZ161q4Wv5efVwan24Piryi5DgTBZL39/EVcWfk4bKDBBOPIqzkojjJR4y3FGwV+bEFDC1aHIgbkoyEjGrO8PONhxfm4cci8a0tKq+Bdha1tZed5RiyMVEPi8a6CQCgP5OQ7lVdwrZeqnLGQV91q9CmlaqxNLWJkQRLV0XX+OfRXlzdxj1wBXYfz72RoTVDFcpbFAa0Uuwcvx/ARYRAamqOqkWIZMxiAfjBRCHeBGltzgFLdQn2QIeHarMV0VQL5Dg7Nsufg160WxMlnLZ6SN+lq7+TxYgHiAr1G20br7Nl+nT+ldPGYMK6ZVMK0QrtX3Sb8pVWcV94wA2cjHG/hVRprqHEFWN+LKsCOgGsR10mYAZp/OGlJsquMHjBwm1kd8Wcb86crt7cOPMbS5U/2lMlKOgn3kudAAQkXNcdK9c+BmXV88cTnXFNhlRP9sGbkGGGMQdioKyYUO6w1btfIMAMMAcACUsTjsTmmISKnGyRBsOU2qV83E29XyWgHQMYAP4nsgSB20VQYJTt1g5p7Ki/qhCt6J9qq2n1T6wfJYA+ArgT0G/qrUnwK1D+PjOeD7gncjhS8A5MOG8e2mXo3y7oPODE56ywRAZdjRY+GlEldqYXw9Xed2YWSCJkPADOoT6sP+oONdX3VTAoXiDMol421QvIdycalz5RiAuIKt3A5jQPZxfT5jfqMJrJNBpWNSQaUEwGThxvII4/ODWvipBq6CcKQMXpJLReLV6slxfGPLWBhf1wkp5e/V0dXXpZJODWRVAHP7O/8iTBjq3YXQqDB6lUm4XCN9KDJeh0nhvCsak/q7iVMpyFQjc5zRCo6l40G5Ir7U0quBMFRGwikG9nUNzioRhipIrjPn59utwvQ1HXxQjjCcQFbfa2mzXwijazVj6dXaZlBHGRm9V7Ttyjz3BPxhYhgZi7MqfKhI0hCKkx2KjgsTw3kI9QW2kXLWmHCqDoPyVtIaAHqq41flSenIbonLQe9FWX151gVJWC29p8pUTc8Lll200ai/F1q7YoIp6TDl5v3XiTfFRFNgnpJ2tUadSsP54VYdnaQyCfPp7VZajQiIbp10x/xGAD+V37rpjoZdx90z5hphVzJarZ93BfZV9GITnQL6qoZ/Mem5Dhv4yS7LO5LnyrDrgHaE1mKoddpx3fhT8Wr3WvxV9d5tO6zKa1181Oj/AOPqEpytvDGpAAAAAElFTkSuQmCC"
      }
    ]
  }
];

function getInitializedKeyForUser(user) {
  if (!user || !user.uid) return 'assets-diary-initialized-guest';
  return `assets-diary-initialized-${user.uid}`;
}

function cloneStarterFolders(folders) {
  if (!Array.isArray(folders)) return [];
  return folders.map((f, fIdx) => {
    const stableFolderId = f.folderId || `starter-folder-${fIdx}`;
    const clonedStyles = (f.styles || []).map((s, sIdx) => ({
      ...s,
      styleId: s.styleId || `starter-style-${fIdx}-${sIdx}`
    }));
    return {
      ...f,
      folderId: stableFolderId,
      styles: clonedStyles
    };
  });
}

function migrateFolderNames(folders) {
  if (!Array.isArray(folders)) return false;
  let changed = false;
  for (const f of folders) {
    if (!f) continue;
    const name = String(f.name || '').trim();
    if (name === 'Example folder 1' || name === 'Example folder 2') continue;

    const isFolder1 =
      name === 'Button' ||
      name === 'Button (Example Collection)' ||
      /^Button(\s*\(Example.*)?$/i.test(name) ||
      f.folderId === 'starter-folder-0' ||
      f.folderId === 'folder-1786309604950-ulust';

    const isFolder2 =
      name === 'Drop Shadow' ||
      name === 'Drop Shadow (Example Collection)' ||
      /^Drop\s*Shadow(\s*\(Example.*)?$/i.test(name) ||
      f.folderId === 'starter-folder-1' ||
      f.folderId === 'folder-1786309911032-2radu';

    if (isFolder1) {
      f.name = 'Example folder 1';
      changed = true;
    } else if (isFolder2) {
      f.name = 'Example folder 2';
      changed = true;
    }
  }
  return changed;
}

function sanitizeFolders(folders) {
  if (!Array.isArray(folders)) return [];
  return folders.filter(f => f && typeof f === 'object').map((f, idx) => {
    const folderId = f.folderId || `folder-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
    return {
      folderId,
      name: f.name || 'Untitled Collection',
      archived: !!f.archived,
      createdAt: f.createdAt || new Date().toISOString(),
      styles: Array.isArray(f.styles) ? f.styles.filter(s => s && typeof s === 'object').map((s, sIdx) => ({
        ...s,
        styleId: s.styleId || `style-${folderId}-${sIdx}-${Math.random().toString(36).substring(2, 6)}`,
        title: s.title || s.name || 'Untitled Frame'
      })) : []
    };
  });
}

function mergeFolders(primaryFolders, secondaryFolders) {
  if (!Array.isArray(primaryFolders) || primaryFolders.length === 0) return secondaryFolders || [];
  if (!Array.isArray(secondaryFolders) || secondaryFolders.length === 0) return primaryFolders || [];

  const folderMap = new Map();

  // First populate secondary folders
  secondaryFolders.forEach(f => {
    if (f && f.folderId) {
      folderMap.set(f.folderId, {
        ...f,
        styles: Array.isArray(f.styles) ? [...f.styles] : []
      });
    }
  });

  // Merge in primary folders (primary styles take precedence)
  primaryFolders.forEach(pf => {
    if (!pf || !pf.folderId) return;
    const existing = folderMap.get(pf.folderId);
    if (!existing) {
      folderMap.set(pf.folderId, { ...pf, styles: Array.isArray(pf.styles) ? [...pf.styles] : [] });
    } else {
      const styleMap = new Map();
      (existing.styles || []).forEach(s => { if (s && s.styleId) styleMap.set(s.styleId, s); });
      (pf.styles || []).forEach(s => { if (s && s.styleId) styleMap.set(s.styleId, s); });
      existing.name = pf.name || existing.name;
      existing.styles = Array.from(styleMap.values());
    }
  });

  return Array.from(folderMap.values());
}

async function saveStarterTemplate(folders) {
  try {
    const templateToSave = folders || footerFolders;
    if (Array.isArray(templateToSave) && templateToSave.length > 0) {
      const cleanTemplate = JSON.parse(JSON.stringify(templateToSave));
      await figma.clientStorage.setAsync(STARTER_TEMPLATE_STORAGE_KEY, cleanTemplate);
    }
  } catch (e) {}
}

const ASSETS_DIARY_STORAGE_KEY = 'assets_diary_collections_v3';

// ── Rock-Solid Chunked Document Storage ───────────────────
// Saves unlimited data inside the Figma document itself without hitting Figma's 100KB per-key limit
function saveDocumentData(key, data) {
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    const CHUNK_SIZE = 80000;
    const count = Math.ceil(str.length / CHUNK_SIZE);
    
    // Save to currentPage (always accessible in any permission mode)
    if (figma.currentPage && typeof figma.currentPage.setPluginData === 'function') {
      figma.currentPage.setPluginData(key + '_chunks', String(count));
      for (let i = 0; i < count; i++) {
        figma.currentPage.setPluginData(key + '_chunk_' + i, str.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
    }

    // Also save to root if available
    try {
      if (figma.root && typeof figma.root.setPluginData === 'function') {
        figma.root.setPluginData(key + '_chunks', String(count));
        for (let i = 0; i < count; i++) {
          figma.root.setPluginData(key + '_chunk_' + i, str.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
        }
      }
    } catch (eRoot) {}
  } catch (e) {
    console.error('[Document Storage] Failed to save:', e);
  }
}

function loadDocumentData(key) {
  // Check currentPage first
  try {
    if (figma.currentPage && typeof figma.currentPage.getPluginData === 'function') {
      const countStr = figma.currentPage.getPluginData(key + '_chunks');
      if (countStr) {
        const count = parseInt(countStr, 10);
        let full = '';
        for (let i = 0; i < count; i++) {
          full += figma.currentPage.getPluginData(key + '_chunk_' + i) || '';
        }
        if (full) return JSON.parse(full);
      }
      const single = figma.currentPage.getPluginData(key);
      if (single) return JSON.parse(single);
    }
  } catch (e) {}

  // Check document root as fallback
  try {
    if (figma.root && typeof figma.root.getPluginData === 'function') {
      const countStr = figma.root.getPluginData(key + '_chunks');
      if (countStr) {
        const count = parseInt(countStr, 10);
        let full = '';
        for (let i = 0; i < count; i++) {
          full += figma.root.getPluginData(key + '_chunk_' + i) || '';
        }
        if (full) return JSON.parse(full);
      }
      const single = figma.root.getPluginData(key);
      if (single) return JSON.parse(single);
    }
  } catch (e) {}

  return null;
}

async function saveLocalFolders() {
  if (!Array.isArray(footerFolders)) {
    return;
  }

  // 1. Clean data with JSON roundtrip to strip any non-serializable symbols/nodes
  const cleanData = JSON.parse(JSON.stringify(footerFolders));

  // 2. ALWAYS save document-level chunked data FIRST (100% permanent, saved in Figma file!)
  saveDocumentData(ASSETS_DIARY_STORAGE_KEY, cleanData);

  // 3. Save to clientStorage for cross-document access (single clean async write)
  try {
    await figma.clientStorage.setAsync(ASSETS_DIARY_STORAGE_KEY, cleanData);
    // Also update legacy key for backward compatibility
    await figma.clientStorage.setAsync(LOCAL_FOLDERS_STORAGE_KEY, cleanData);
  } catch (err) {
    console.warn('[clientStorage] write warning (document copy is safely preserved):', err);
  }

  scheduleDriveIndexSave();
}

async function loadLocalFolders() {
  let loaded = null;

  // 1. Load from document-level chunked storage first (highest fidelity, permanent in Figma file)
  try {
    const docData = loadDocumentData(ASSETS_DIARY_STORAGE_KEY);
    if (Array.isArray(docData)) {
      loaded = docData;
    }
  } catch (e) {}

  // 2. Load from clientStorage v3
  let clientData = null;
  try {
    const cs = await figma.clientStorage.getAsync(ASSETS_DIARY_STORAGE_KEY);
    if (Array.isArray(cs)) {
      clientData = cs;
    }
  } catch (e) {}

  // 3. Fallback to legacy clientStorage keys if neither has data yet
  if (!loaded && !clientData) {
    const legacyKeys = [
      'assets-diary-canonical-collections-v2',
      LOCAL_FOLDERS_STORAGE_KEY,
      'assets-diary-folders-guest',
      'assets-diary-folders'
    ];
    for (const lk of legacyKeys) {
      try {
        const val = await figma.clientStorage.getAsync(lk);
        if (Array.isArray(val) && val.length > 0) {
          clientData = val;
          break;
        }
      } catch (e) {}
    }
  }

  // Combine document data and client data (document takes precedence)
  if (loaded && clientData) {
    loaded = mergeFolders(loaded, clientData);
  } else if (!loaded && clientData) {
    loaded = clientData;
  }

  if (Array.isArray(loaded)) {
    const sanitized = sanitizeFolders(loaded);
    if (Array.isArray(footerFolders) && footerFolders.length > 0) {
      footerFolders = mergeFolders(footerFolders, sanitized);
    } else {
      footerFolders = sanitized;
    }
  } else {
    // If memory already has folders, preserve them and persist immediately!
    if (Array.isArray(footerFolders) && footerFolders.length > 0) {
      await saveLocalFolders();
      return;
    }
    // Brand new file and clean clientStorage: load starter defaults
    footerFolders = cloneStarterFolders(DEFAULT_EXAMPLE_COLLECTIONS);
    await saveLocalFolders();
  }

  if (migrateFolderNames(footerFolders)) {
    await saveLocalFolders();
  }

  processPendingUploadQueue().catch(() => {});
}

async function enqueuePendingUpload(styleItem) {
  try {
    const queueKey = getPendingUploadsKeyForUser(currentUser);
    const queue = (await figma.clientStorage.getAsync(queueKey)) || [];
    if (!queue.some(item => item.styleId === styleItem.styleId)) {
      queue.push({
        styleId: styleItem.styleId,
        folderId: driveConfig.folderId,
        nodeData: styleItem.nodeData,
        previewData: styleItem.previewData,
        timestamp: Date.now()
      });
      await figma.clientStorage.setAsync(queueKey, queue);
    }
    processPendingUploadQueue().catch(() => {});
  } catch (e) {}
}

async function processPendingUploadQueue() {
  if (isProcessingQueue) return;
  if (!hasConnectedDrive()) return;

  try {
    isProcessingQueue = true;
    const queueKey = getPendingUploadsKeyForUser(currentUser);
    let queue = (await figma.clientStorage.getAsync(queueKey)) || [];
    if (!Array.isArray(queue) || queue.length === 0) {
      isProcessingQueue = false;
      return;
    }

    await ensureDriveAccessToken();

    const remainingQueue = [];

    for (const item of queue) {
      try {
        const nodeDataJson = JSON.stringify(item.nodeData || {});
        const nodeDataBytes = stringToUint8Array(nodeDataJson);
        const pngBytes = item.previewData ? decodeBase64(item.previewData) : new Uint8Array(0);

        let driveNodeFileId = null;
        let drivePngFileId = null;
        let driveSvgFileId = null;

        const uploads = [
          driveUploadFile(item.styleId + '.json', 'application/json', nodeDataBytes, item.folderId || driveConfig.folderId).then(id => driveNodeFileId = id)
        ];
        if (pngBytes && pngBytes.length > 0) {
          uploads.push(driveUploadFile(item.styleId + '.png', 'image/png', pngBytes, item.folderId || driveConfig.folderId).then(id => drivePngFileId = id));
        }

        if (item.nodeData && item.nodeData.svgMarkup) {
          const svgBytes = stringToUint8Array(item.nodeData.svgMarkup);
          uploads.push(driveUploadFile(item.styleId + '.svg', 'image/svg+xml', svgBytes, item.folderId || driveConfig.folderId).then(id => driveSvgFileId = id).catch(() => {}));
        }

        await Promise.all(uploads);

        for (const f of footerFolders) {
          if (f.styles) {
            const s = f.styles.find(st => st.styleId === item.styleId);
            if (s) {
              if (driveNodeFileId) s.driveNodeFileId = driveNodeFileId;
              if (drivePngFileId) s.drivePngFileId = drivePngFileId;
              if (driveSvgFileId) s.driveSvgFileId = driveSvgFileId;
            }
          }
        }
      } catch (err) {
        remainingQueue.push(item);
      }
    }

    await figma.clientStorage.setAsync(queueKey, remainingQueue);
    await saveLocalFolders();

    if (queue.length > remainingQueue.length) {
      scheduleDriveIndexSave();
    }
  } catch (e) {
  } finally {
    isProcessingQueue = false;
  }
}


// Key used to store a small sample of SVG import failures for debugging
const SVG_IMPORT_FAILURES_KEY = 'svg-import-failures';

async function recordSvgFailure(svgMarkup, reason) {
  try {
    const existing = (await figma.clientStorage.getAsync(SVG_IMPORT_FAILURES_KEY)) || [];
    existing.push({ svg: typeof svgMarkup === 'string' ? svgMarkup : String(svgMarkup), reason: reason || '', date: new Date().toISOString() });
    // Keep only the most recent 20 failures to avoid unbounded storage
    if (existing.length > 20) existing.splice(0, existing.length - 20);
    await figma.clientStorage.setAsync(SVG_IMPORT_FAILURES_KEY, existing);
    // Notify the UI so the user can inspect failures quickly
    try { safePostMessage({ type: 'svg-import-failure', reason: reason || '', sample: (svgMarkup || '').slice(0, 1024) }); } catch (e) {}
  } catch (e) {}
}

function clearSvgNodeStrokes(node) {
  if (!node) return;
  try {
    const fills = node.fills;
    const hasVisibleFill = Array.isArray(fills) && fills.some(f => f.visible !== false && f.type !== 'IMAGE');
    if (hasVisibleFill) {
      if (node.strokes !== undefined) node.strokes = [];
      if (node.strokeWeight !== undefined) node.strokeWeight = 0;
    }
  } catch (e) {}
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      clearSvgNodeStrokes(child);
    }
  }
}
async function saveDriveSettings() {
  const stored = {
    driveConfig: {
      folderId: driveConfig.folderId,
      token: (driveConfig.rememberDriveSettings && driveConfig.rememberToken !== false) ? driveConfig.token : null,
      refreshToken: (driveConfig.rememberDriveSettings && driveConfig.rememberRefreshToken !== false) ? driveConfig.refreshToken : null,
      clientId: (driveConfig.rememberDriveSettings && driveConfig.rememberClientId !== false) ? driveConfig.clientId : null,
      clientSecret: (driveConfig.rememberDriveSettings && driveConfig.rememberClientSecret !== false) ? driveConfig.clientSecret : null,
      tokenExpiresAt: driveConfig.rememberDriveSettings ? driveConfig.tokenExpiresAt : null,
      rememberDriveSettings: driveConfig.rememberDriveSettings,
      rememberToken: driveConfig.rememberToken,
      rememberRefreshToken: driveConfig.rememberRefreshToken,
      rememberClientId: driveConfig.rememberClientId,
      rememberClientSecret: driveConfig.rememberClientSecret,
      indexFileId: driveConfig.indexFileId || null,
      userEmail: driveConfig.userEmail || null
    }
  };
  await figma.clientStorage.setAsync(DRIVE_SETTINGS_STORAGE_KEY, stored);
}

function getFolderById(folderId) {
  return footerFolders.find(f => f.folderId === folderId);
}

function getStyle(folderId, styleId) {
  if (folderId) {
    const folder = getFolderById(folderId);
    if (folder && folder.styles) {
      const match = folder.styles.find(s => s.styleId === styleId);
      if (match) return match;
    }
  }
  // Fallback: search across all folders globally if folderId is mismatched or missing
  if (Array.isArray(footerFolders)) {
    for (const folder of footerFolders) {
      if (folder && folder.styles) {
        const match = folder.styles.find(s => s.styleId === styleId);
        if (match) return match;
      }
    }
  }
  return null;
}

function getSelectedFrameInfo() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (!node || typeof node.exportAsync !== 'function') return null;
  return {
    name: node.name || 'Selected Element',
    width: node.width || 0,
    height: node.height || 0,
    nodeId: node.id,
    type: node.type
  };
}

function safePostMessage(msg) {
  try {
    if (!msg) return;
    figma.ui.postMessage(msg);
  } catch (err) {
    try {
      const cleanMsg = JSON.parse(JSON.stringify(msg, (key, value) => {
        if (typeof value === 'symbol' || (value && typeof value === 'object' && typeof value.exportAsync === 'function')) {
          return undefined;
        }
        return value;
      }));
      figma.ui.postMessage(cleanMsg);
    } catch (e) {}
  }
}

function getSelectedFramesInfo() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return [];
  const frames = [];
  for (const node of selection) {
    if (node && typeof node.exportAsync === 'function') {
      frames.push({
        name: node.name || 'Selected Element',
        width: node.width || 0,
        height: node.height || 0,
        nodeId: node.id,
        type: node.type
      });
    }
  }
  return frames;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ArrayToBase64(bytes) {
  if (!bytes || bytes.length === 0) return null;
  let base64 = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    let enc3 = ((b2 & 15) << 2) | (b3 >> 6);
    let enc4 = b3 & 63;

    if (i + 1 >= len) {
      enc3 = 64;
      enc4 = 64;
    } else if (i + 2 >= len) {
      enc4 = 64;
    }

    base64 += BASE64_CHARS.charAt(enc1) +
              BASE64_CHARS.charAt(enc2) +
              (enc3 === 64 ? '=' : BASE64_CHARS.charAt(enc3)) +
              (enc4 === 64 ? '=' : BASE64_CHARS.charAt(enc4));
  }
  return base64;
}

function base64ToUint8Array(base64) {
  if (!base64 || typeof base64 !== 'string') return new Uint8Array(0);
  const cleanB64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = cleanB64.length;
  if (len === 0) return new Uint8Array(0);

  const lookup = new Uint8Array(256);
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    lookup[BASE64_CHARS.charCodeAt(i)] = i;
  }

  const placeHolders = base64.charAt(base64.length - 2) === '=' ? 2 : (base64.charAt(base64.length - 1) === '=' ? 1 : 0);
  const arrLen = Math.max(0, Math.floor(len * 3 / 4) - placeHolders);
  const bytes = new Uint8Array(arrLen);

  let cur = 0;
  for (let i = 0; i < len && cur < arrLen; i += 4) {
    const e1 = lookup[cleanB64.charCodeAt(i)];
    const e2 = lookup[cleanB64.charCodeAt(i + 1)];
    const e3 = lookup[cleanB64.charCodeAt(i + 2)];
    const e4 = lookup[cleanB64.charCodeAt(i + 3)];

    bytes[cur++] = (e1 << 2) | (e2 >> 4);
    if (cur < arrLen) bytes[cur++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (cur < arrLen) bytes[cur++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}

async function serializePaint(p) {
  if (!p || !p.type) return null;
  const paint = {
    type: p.type,
    visible: p.visible !== false,
    opacity: p.opacity !== undefined ? p.opacity : 1,
    blendMode: p.blendMode || 'NORMAL'
  };

  if (p.type === 'SOLID') {
    if (p.color) {
      paint.color = {
        r: p.color.r !== undefined ? p.color.r : 0,
        g: p.color.g !== undefined ? p.color.g : 0,
        b: p.color.b !== undefined ? p.color.b : 0,
        a: p.color.a !== undefined ? p.color.a : 1
      };
    }
  } else if (['GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'].includes(p.type)) {
    if (p.gradientStops && Array.isArray(p.gradientStops)) {
      paint.gradientStops = p.gradientStops.map(stop => ({
        position: stop.position !== undefined ? stop.position : 0,
        color: {
          r: (stop.color && stop.color.r !== undefined) ? stop.color.r : 0,
          g: (stop.color && stop.color.g !== undefined) ? stop.color.g : 0,
          b: (stop.color && stop.color.b !== undefined) ? stop.color.b : 0,
          a: (stop.color && stop.color.a !== undefined) ? stop.color.a : 1
        }
      }));
    }
    if (p.gradientTransform && Array.isArray(p.gradientTransform)) {
      paint.gradientTransform = JSON.parse(JSON.stringify(p.gradientTransform));
    }
  } else if (p.type === 'IMAGE') {
    // Skip IMAGE fills completely as requested by user to eliminate image encoding overhead and storage bloat
    return null;
  }

  return paint;
}

function deserializePaint(p) {
  if (!p || !p.type) return null;
  // Ignore invisible or 0% opacity paints so hidden fills/strokes don't render as solid shapes
  if (p.visible === false || (p.opacity !== undefined && p.opacity <= 0)) {
    return null;
  }
  const paint = {
    type: p.type,
    visible: true,
    opacity: p.opacity !== undefined ? p.opacity : 1,
    blendMode: p.blendMode || 'NORMAL'
  };

  if (p.type === 'SOLID') {
    paint.color = {
      r: (p.color && p.color.r !== undefined) ? p.color.r : 0,
      g: (p.color && p.color.g !== undefined) ? p.color.g : 0,
      b: (p.color && p.color.b !== undefined) ? p.color.b : 0,
      a: (p.color && p.color.a !== undefined) ? p.color.a : 1
    };
  } else if (['GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'].includes(p.type)) {
    if (p.gradientStops && Array.isArray(p.gradientStops) && p.gradientStops.length > 0) {
      paint.gradientStops = p.gradientStops.map(stop => ({
        position: stop.position !== undefined ? stop.position : 0,
        color: {
          r: (stop.color && stop.color.r !== undefined) ? stop.color.r : 0,
          g: (stop.color && stop.color.g !== undefined) ? stop.color.g : 0,
          b: (stop.color && stop.color.b !== undefined) ? stop.color.b : 0,
          a: (stop.color && stop.color.a !== undefined) ? stop.color.a : 1
        }
      }));
    }
    if (p.gradientTransform && Array.isArray(p.gradientTransform)) {
      paint.gradientTransform = p.gradientTransform;
    }
  } else if (p.type === 'IMAGE') {
    paint.scaleMode = p.scaleMode || 'FILL';
    if (p.imageTransform && Array.isArray(p.imageTransform)) {
      paint.imageTransform = p.imageTransform;
    }
    if (p.scalingFactor !== undefined) paint.scalingFactor = p.scalingFactor;
    if (p.rotation !== undefined) paint.rotation = p.rotation;

    // Restore Image using Figma's figma.createImage() API
    if (p.imageDataBase64) {
      try {
        const bytes = base64ToUint8Array(p.imageDataBase64);
        if (bytes && bytes.length > 0) {
          const image = figma.createImage(bytes);
          paint.imageHash = image.hash;
        }
      } catch (e) {}
    }
  }

  return paint;
}

function serializeEffect(e) {
  if (!e || !e.type) return null;

  if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
    return {
      type: e.type,
      visible: e.visible !== false,
      radius: e.radius !== undefined ? e.radius : 0
    };
  }

  if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
    const shadow = {
      type: e.type,
      visible: e.visible !== false,
      blendMode: e.blendMode || 'NORMAL',
      offset: e.offset ? { x: e.offset.x || 0, y: e.offset.y || 0 } : { x: 0, y: 0 },
      radius: e.radius !== undefined ? e.radius : 0,
      spread: e.spread !== undefined ? e.spread : 0,
      color: e.color ? {
        r: e.color.r !== undefined ? e.color.r : 0,
        g: e.color.g !== undefined ? e.color.g : 0,
        b: e.color.b !== undefined ? e.color.b : 0,
        a: e.color.a !== undefined ? e.color.a : 1
      } : { r: 0, g: 0, b: 0, a: 0.25 }
    };
    if (e.showShadowBehindNode !== undefined) {
      shadow.showShadowBehindNode = e.showShadowBehindNode;
    }
    return shadow;
  }

  return null;
}

function deserializeEffect(e) {
  if (!e || !e.type) return null;

  if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
    return {
      type: e.type,
      visible: e.visible !== false,
      radius: e.radius !== undefined ? e.radius : 0
    };
  }

  if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
    const shadow = {
      type: e.type,
      visible: e.visible !== false,
      blendMode: e.blendMode || 'NORMAL',
      offset: e.offset ? { x: e.offset.x || 0, y: e.offset.y || 0 } : { x: 0, y: 0 },
      radius: e.radius !== undefined ? e.radius : 0,
      spread: e.spread !== undefined ? e.spread : 0,
      color: e.color ? {
        r: e.color.r !== undefined ? e.color.r : 0,
        g: e.color.g !== undefined ? e.color.g : 0,
        b: e.color.b !== undefined ? e.color.b : 0,
        a: e.color.a !== undefined ? e.color.a : 1
      } : { r: 0, g: 0, b: 0, a: 0.25 }
    };
    if (e.showShadowBehindNode !== undefined) {
      shadow.showShadowBehindNode = e.showShadowBehindNode;
    }
    return shadow;
  }

  return null;
}

// Check if a node has any image fill at all
function hasAnyImageFill(node) {
  if (!node) return false;
  try {
    const fills = node.fills;
    if (fills && typeof fills !== 'symbol' && Array.isArray(fills)) {
      return fills.some(f => f && f.type === 'IMAGE');
    }
  } catch (e) {}
  return false;
}

function replaceImageFillsWithPlaceholder(node) {
  if (!node) return;
  try {
    const fills = node.fills;
    if (fills && typeof fills !== 'symbol' && Array.isArray(fills) && fills.length > 0) {
      let hasImage = false;
      const newFills = fills.map(f => {
        if (f && f.type === 'IMAGE') {
          hasImage = true;
          return {
            type: 'SOLID',
            color: { r: 0.88, g: 0.91, b: 0.94 }, // clean slate neutral placeholder
            opacity: typeof f.opacity === 'number' ? f.opacity : 1,
            blendMode: f.blendMode || 'NORMAL'
          };
        }
        return f;
      });
      if (hasImage) {
        node.fills = newFills;
      }
    }
  } catch (e) {}
}

function stripImageFills(node) {
  replaceImageFillsWithPlaceholder(node);
}

// Clean image fills from cloned tree by replacing with clean neutral placeholders
// Preserves layout, shape bounds, auto-layout flow, and aspect ratios without storing base64 image bloat!
function removeImageNodesFromTree(node) {
  if (!node) return;
  if (node.children && node.children.length > 0) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (!child) continue;
      removeImageNodesFromTree(child);
      if (child.type !== 'TEXT') {
        replaceImageFillsWithPlaceholder(child);
      }
    }
  }
  replaceImageFillsWithPlaceholder(node);
}

// Serialize entire node tree to JSON for faithful restoration
async function serializeNode(node, depth = 0) {
  if (depth > 50) return null; // Prevent infinite recursion
  
  if (depth > 0 && node.type !== 'TEXT' && hasAnyImageFill(node)) {
    replaceImageFillsWithPlaceholder(node);
  }
  
  const data = {
    type: node.type,
    name: node.name,
    visible: node.visible,
    locked: node.locked,
    opacity: node.opacity,
    blendMode: node.blendMode,
    rotation: node.rotation,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };

  // Preserve mask layer properties
  if (node.isMask !== undefined) data.isMask = node.isMask;
  if (node.maskType !== undefined) data.maskType = node.maskType;

  // Preserve layout constraints (horizontal/vertical) for ALL node types
  if (node.constraints) {
    data.constraints = {
      horizontal: node.constraints.horizontal,
      vertical: node.constraints.vertical
    };
  }

  // Preserve rounded corners (uniform and mixed 4-corner radii + smoothing) for all node types
  if (typeof node.cornerRadius === 'number') {
    data.cornerRadius = node.cornerRadius;
  }
  if (typeof node.topLeftRadius === 'number') {
    data.topLeftRadius = node.topLeftRadius;
  }
  if (typeof node.topRightRadius === 'number') {
    data.topRightRadius = node.topRightRadius;
  }
  if (typeof node.bottomRightRadius === 'number') {
    data.bottomRightRadius = node.bottomRightRadius;
  }
  if (typeof node.bottomLeftRadius === 'number') {
    data.bottomLeftRadius = node.bottomLeftRadius;
  }
  if (typeof node.cornerSmoothing === 'number') {
    data.cornerSmoothing = node.cornerSmoothing;
  }

  // Preserve polygon/star geometry for fallback recreation
  if (node.type === 'STAR' || node.type === 'POLYGON') {
    data.pointCount = node.pointCount;
  }
  if (node.type === 'STAR') {
    data.innerRadius = node.innerRadius;
    data.outerRadius = node.outerRadius;
  }

  // Preserve Auto Layout child positioning & sizing properties for ALL node types
  if (node.layoutAlign !== undefined) data.layoutAlign = node.layoutAlign;
  if (node.layoutGrow !== undefined) data.layoutGrow = node.layoutGrow;
  if (node.layoutSizingHorizontal !== undefined) data.layoutSizingHorizontal = node.layoutSizingHorizontal;
  if (node.layoutSizingVertical !== undefined) data.layoutSizingVertical = node.layoutSizingVertical;
  if (node.layoutPositioning !== undefined) data.layoutPositioning = node.layoutPositioning;

  // Text node properties
  if (node.type === 'TEXT') {
    data.characters = node.characters;
    data.fontSize = node.fontSize;
    data.fontName = node.fontName ? { family: node.fontName.family, style: node.fontName.style } : null;
    data.textAlignHorizontal = node.textAlignHorizontal;
    data.textAlignVertical = node.textAlignVertical;
    data.textAutoResize = node.textAutoResize;
    data.letterSpacing = node.letterSpacing ? { value: node.letterSpacing.value, unit: node.letterSpacing.unit } : null;
    data.lineHeight = node.lineHeight ? { value: node.lineHeight.value, unit: node.lineHeight.unit } : null;
    data.paragraphSpacing = node.paragraphSpacing;
    data.paragraphIndent = node.paragraphIndent;
    if (typeof node.textDecoration === 'string') data.textDecoration = node.textDecoration;
    if (typeof node.textTransform === 'string') data.textTransform = node.textTransform;
    if (typeof node.textCase === 'string') data.textCase = node.textCase;
    if (node.leadingTrim !== undefined) data.leadingTrim = node.leadingTrim;
    data.constraints = node.constraints ? {
      horizontal: node.constraints.horizontal,
      vertical: node.constraints.vertical
    } : null;

    // Preserve mixed styles / segments within text (e.g. partial underlines, mixed fonts, colors)
    if (typeof node.getStyledTextSegments === 'function') {
      try {
        const segments = node.getStyledTextSegments([
          'fontSize',
          'fontName',
          'fontWeight',
          'textDecoration',
          'textCase',
          'lineHeight',
          'letterSpacing',
          'fills'
        ]);
        if (Array.isArray(segments) && segments.length > 0) {
          const serializedSegments = [];
          for (const seg of segments) {
            const sSeg = {
              start: seg.start,
              end: seg.end
            };
            if (seg.fontName && seg.fontName.family) sSeg.fontName = { family: seg.fontName.family, style: seg.fontName.style };
            if (typeof seg.fontSize === 'number') sSeg.fontSize = seg.fontSize;
            if (typeof seg.textDecoration === 'string') sSeg.textDecoration = seg.textDecoration;
            if (typeof seg.textCase === 'string') sSeg.textCase = seg.textCase;
            if (seg.lineHeight && typeof seg.lineHeight === 'object') sSeg.lineHeight = seg.lineHeight;
            if (seg.letterSpacing && typeof seg.letterSpacing === 'object') sSeg.letterSpacing = seg.letterSpacing;
            if (Array.isArray(seg.fills) && seg.fills.length > 0) {
              const segFills = [];
              for (const f of seg.fills) {
                const sf = await serializePaint(f);
                if (sf) segFills.push(sf);
              }
              if (segFills.length > 0) sSeg.fills = segFills;
            }
            serializedSegments.push(sSeg);
          }
          if (serializedSegments.length > 0) {
            data.styledSegments = serializedSegments;
          }
        }
      } catch (e) {}
    }
  }

  // Preserve SVG/vector geometry ONLY for BOOLEAN_OPERATION or nodes lacking native vectorNetwork (avoids slow exportAsync overhead)
  const vectorLeafTypes = ['VECTOR', 'STAR', 'POLYGON', 'ELLIPSE', 'BOOLEAN_OPERATION', 'LINE'];
  const needsSvgExport = node.type === 'BOOLEAN_OPERATION' || (vectorLeafTypes.includes(node.type) && (!node.vectorNetwork || !node.vectorNetwork.vertices || node.vectorNetwork.vertices.length === 0));
  if (needsSvgExport && typeof node.exportAsync === 'function') {
    try {
      const svgBytes = await node.exportAsync({ format: 'SVG', svgOutlineText: false });
      data.svgMarkup = new TextDecoder().decode(svgBytes);
    } catch (e) {}
  }

  // Preserve native vector-path and vector-network data for vector shapes
  if (node.vectorPaths && node.vectorPaths.length > 0) {
    try {
      const paths = [];
      for (let i = 0; i < node.vectorPaths.length; i++) {
        const vp = node.vectorPaths[i];
        if (vp && vp.data) {
          paths.push({
            data: vp.data,
            windingRule: vp.windingRule || 'NONZERO'
          });
        }
      }
      if (paths.length > 0) data.vectorPaths = paths;
    } catch (e) {}
  }
  // Serialize vectorNetwork explicitly to avoid issues with native proxy objects
  if (node.vectorNetwork) {
    try {
      const vn = node.vectorNetwork;
      const network = {};

      // Extract vertices
      if (vn.vertices && vn.vertices.length > 0) {
        network.vertices = [];
        for (let i = 0; i < vn.vertices.length; i++) {
          const v = vn.vertices[i];
          const vertex = { x: v.x, y: v.y };
          if (v.strokeCap) vertex.strokeCap = v.strokeCap;
          if (v.strokeJoin) vertex.strokeJoin = v.strokeJoin;
          if (v.cornerRadius !== undefined) vertex.cornerRadius = v.cornerRadius;
          if (v.handleMirroring) vertex.handleMirroring = v.handleMirroring;
          network.vertices.push(vertex);
        }
      }

      // Extract segments
      if (vn.segments && vn.segments.length > 0) {
        network.segments = [];
        for (let i = 0; i < vn.segments.length; i++) {
          const s = vn.segments[i];
          const seg = { start: s.start, end: s.end };
          if (s.tangentStart) seg.tangentStart = { x: s.tangentStart.x, y: s.tangentStart.y };
          if (s.tangentEnd) seg.tangentEnd = { x: s.tangentEnd.x, y: s.tangentEnd.y };
          network.segments.push(seg);
        }
      }

      // Extract regions (defines fill areas)
      if (vn.regions && vn.regions.length > 0) {
        network.regions = [];
        for (let i = 0; i < vn.regions.length; i++) {
          const r = vn.regions[i];
          const region = {};
          if (r.windingRule) region.windingRule = r.windingRule;
          if (r.loops && r.loops.length > 0) {
            region.loops = JSON.parse(JSON.stringify(r.loops));
          }
          if (r.fills && r.fills.length > 0) {
            const rFills = [];
            for (const f of r.fills) {
              const sp = await serializePaint(f);
              if (sp) rFills.push(sp);
            }
            if (rFills.length > 0) region.fills = rFills;
          }
          network.regions.push(region);
        }
      }

      if (network.vertices && network.vertices.length > 0) {
        data.vectorNetwork = network;
      }
    } catch (e) {}
  }

  // Fill properties (including Gradients & Images)
  if (Array.isArray(node.fills) && node.fills.length > 0) {
    const sFills = [];
    for (const f of node.fills) {
      const sp = await serializePaint(f);
      if (sp) sFills.push(sp);
    }
    if (sFills.length > 0) data.fills = sFills;
  } else if (node.type === 'TEXT') {
    try {
      const firstFill = node.getRangeFills(0, Math.min(1, (node.characters || '').length));
      if (Array.isArray(firstFill) && firstFill.length > 0) {
        const sFills = [];
        for (const f of firstFill) {
          const sp = await serializePaint(f);
          if (sp) sFills.push(sp);
        }
        if (sFills.length > 0) data.fills = sFills;
      }
    } catch (e) {}
  }

  // Preserve relativeTransform matrix for flips, shears, and 2D transforms
  if (node.relativeTransform) {
    try { data.relativeTransform = JSON.parse(JSON.stringify(node.relativeTransform)); } catch (e) {}
  }

  // Preserve Figma Arc tool parameters (startingAngle, endingAngle, innerRadius) for Ellipse nodes
  if (node.type === 'ELLIPSE' && node.arcData) {
    try {
      data.arcData = {
        startingAngle: node.arcData.startingAngle,
        endingAngle: node.arcData.endingAngle,
        innerRadius: node.arcData.innerRadius
      };
    } catch (e) {}
  }

  // Preserve stroke dash patterns
  if (Array.isArray(node.dashPattern) && node.dashPattern.length > 0) {
    try { data.dashPattern = JSON.parse(JSON.stringify(node.dashPattern)); } catch (e) {}
  }

  // Stroke properties (including Gradients and Individual Side Weights)
  if (Array.isArray(node.strokes) && node.strokes.length > 0) {
    const sStrokes = [];
    for (const s of node.strokes) {
      const sp = await serializePaint(s);
      if (sp) sStrokes.push(sp);
    }
    if (sStrokes.length > 0) data.strokes = sStrokes;
    if (typeof node.strokeWeight === 'number') data.strokeWeight = node.strokeWeight;
    data.strokeAlign = node.strokeAlign;
    // strokeCap/strokeJoin can be figma.mixed (Symbol) when endpoints differ — only save when string
    if (typeof node.strokeCap === 'string') data.strokeCap = node.strokeCap;
    if (typeof node.strokeJoin === 'string') data.strokeJoin = node.strokeJoin;

    // Preserve individual per-side stroke weights (e.g. bottom-only border/underline)
    if (typeof node.strokeTopWeight === 'number') data.strokeTopWeight = node.strokeTopWeight;
    if (typeof node.strokeBottomWeight === 'number') data.strokeBottomWeight = node.strokeBottomWeight;
    if (typeof node.strokeLeftWeight === 'number') data.strokeLeftWeight = node.strokeLeftWeight;
    if (typeof node.strokeRightWeight === 'number') data.strokeRightWeight = node.strokeRightWeight;
  }

  // Effects
  if (Array.isArray(node.effects) && node.effects.length > 0) {
    data.effects = node.effects.map(e => serializeEffect(e)).filter(Boolean);
  }
  // Container specific (Frame, Group, Component, Instance, Component Set, Section, Boolean Operation)
  const containerTypes = ['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION', 'BOOLEAN_OPERATION'];
  if (containerTypes.includes(node.type)) {
    const isFlex = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(node.type);
    data.layoutMode = isFlex ? (node.layoutMode || 'NONE') : 'NONE';
    data.clipsContent = isFlex ? !!node.clipsContent : false;
    data.itemSpacing = isFlex ? (node.itemSpacing || 0) : 0;
    data.paddingLeft = isFlex ? (node.paddingLeft || 0) : 0;
    data.paddingRight = isFlex ? (node.paddingRight || 0) : 0;
    data.paddingTop = isFlex ? (node.paddingTop || 0) : 0;
    data.paddingBottom = isFlex ? (node.paddingBottom || 0) : 0;
    data.counterAxisSpacing = isFlex ? (node.counterAxisSpacing || 0) : 0;
    data.primaryAxisAlignItems = isFlex ? (node.primaryAxisAlignItems || 'MIN') : 'MIN';
    data.counterAxisAlignItems = isFlex ? (node.counterAxisAlignItems || 'MIN') : 'MIN';
    data.primaryAxisSizingMode = isFlex ? (node.primaryAxisSizingMode || 'FIXED') : 'FIXED';
    data.counterAxisSizingMode = isFlex ? (node.counterAxisSizingMode || 'FIXED') : 'FIXED';
    if (node.type === 'BOOLEAN_OPERATION') {
      data.booleanOperation = node.booleanOperation;
    }

    // Serialize children
    if (node.children && node.children.length > 0) {
      data.children = [];
      for (const child of node.children) {
        const childData = await serializeNode(child, depth + 1);
        if (childData) data.children.push(childData);
      }
    }
  }

  return data;
}

let cachedAvailableFonts = null;

async function loadFontSafely(fontName) {
  if (fontName && fontName.family && fontName.style) {
    try {
      await figma.loadFontAsync(fontName);
      return fontName;
    } catch (e) {}

    // Try alternate styles for the target font family (e.g., 'Regular', 'Medium', 'Bold', 'SemiBold', 'Light', 'Book', 'Roman', 'Italic')
    const stylesToTry = ['Regular', 'Medium', 'Bold', 'SemiBold', 'Light', 'Book', 'Roman', 'Italic'];
    for (const style of stylesToTry) {
      try {
        const candidate = { family: fontName.family, style };
        await figma.loadFontAsync(candidate);
        return candidate;
      } catch (e) {}
    }

    // Search user's installed available fonts in Figma for a family match
    try {
      if (!cachedAvailableFonts) {
        cachedAvailableFonts = await figma.listAvailableFontsAsync();
      }
      if (Array.isArray(cachedAvailableFonts) && cachedAvailableFonts.length > 0) {
        const match = cachedAvailableFonts.find(f => f.fontName && f.fontName.family.toLowerCase() === fontName.family.toLowerCase());
        if (match) {
          try {
            await figma.loadFontAsync(match.fontName);
            return match.fontName;
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // Universal fallbacks guaranteed to exist in Figma
  const fallbacks = [
    { family: 'Inter', style: 'Regular' },
    { family: 'Roboto', style: 'Regular' },
    { family: 'Arial', style: 'Regular' }
  ];

  for (const fallback of fallbacks) {
    try {
      await figma.loadFontAsync(fallback);
      return fallback;
    } catch (e) {}
  }

  // Last resort: pick the very first available font in Figma!
  try {
    if (!cachedAvailableFonts) {
      cachedAvailableFonts = await figma.listAvailableFontsAsync();
    }
    if (Array.isArray(cachedAvailableFonts) && cachedAvailableFonts.length > 0) {
      await figma.loadFontAsync(cachedAvailableFonts[0].fontName);
      return cachedAvailableFonts[0].fontName;
    }
  } catch (e) {}

  return null;
}

function applyTextNodeProperties(node, data) {
  if (!node || node.type !== 'TEXT' || !data) return;

  try {
    if (data.fontSize !== undefined) node.fontSize = data.fontSize;
    if (data.fontName) node.fontName = data.fontName;
    if (data.textAlignHorizontal !== undefined) node.textAlignHorizontal = data.textAlignHorizontal;
    if (data.textAlignVertical !== undefined) node.textAlignVertical = data.textAlignVertical;
    if (data.textAutoResize !== undefined) node.textAutoResize = data.textAutoResize;
    if (data.letterSpacing) node.letterSpacing = data.letterSpacing;
    if (data.lineHeight) node.lineHeight = data.lineHeight;
    if (data.paragraphSpacing !== undefined) node.paragraphSpacing = data.paragraphSpacing;
    if (data.paragraphIndent !== undefined) node.paragraphIndent = data.paragraphIndent;
    if (data.textDecoration !== undefined) node.textDecoration = data.textDecoration;
    if (data.textTransform !== undefined) node.textTransform = data.textTransform;
    if (data.textCase !== undefined) node.textCase = data.textCase;
    if (data.leadingTrim !== undefined) {
      try { node.leadingTrim = data.leadingTrim; } catch (e) {}
    }
    if (data.constraints) {
      node.constraints = data.constraints;
    }
    if (data.layoutAlign !== undefined) node.layoutAlign = data.layoutAlign;
    if (data.layoutGrow !== undefined) node.layoutGrow = data.layoutGrow;
    if (data.layoutSizingHorizontal !== undefined) node.layoutSizingHorizontal = data.layoutSizingHorizontal;
    if (data.layoutSizingVertical !== undefined) node.layoutSizingVertical = data.layoutSizingVertical;
    if (data.layoutPositioning !== undefined) node.layoutPositioning = data.layoutPositioning;
    if (data.resizeHeight !== undefined) node.resizeHeight = data.resizeHeight;
    if (data.resizeWidth !== undefined) node.resizeWidth = data.resizeWidth;

    if (data.width !== undefined && data.height !== undefined) {
      if (data.textAutoResize === 'HEIGHT') {
        node.resize(data.width, node.height);
      } else if (data.textAutoResize === 'WIDTH') {
        node.resize(node.width, data.height);
      } else if (data.textAutoResize === 'NONE' || data.textAutoResize === undefined) {
        node.resize(data.width, data.height);
      }
    }
  } catch (e) {}
}

// Recreate node tree from serialized JSON
async function deserializeNode(data, parent = null) {
  if (!data || !data.type) return null;

  let node;
  let childrenData = data.children || [];
  let importedFromSvg = false;

  // For GROUP nodes, restore children first and only use SVG as a fallback.
  if (data.type === 'GROUP') {
    const children = [];
    if (childrenData.length > 0) {
      for (const childData of childrenData) {
        const child = await deserializeNode(childData, null);
        if (child) children.push(child);
      }
    }

    if (children.length > 0) {
      node = figma.group(children, figma.currentPage);
    } else if (data.svgMarkup) {
      try {
        const importedNode = figma.createNodeFromSvg(data.svgMarkup);
        if (importedNode) {
          node = importedNode;
          importedFromSvg = true;
        }
      } catch (e) {
        try { await recordSvgFailure(data.svgMarkup, e && e.message ? e.message : String(e)); } catch (er) {}
        node = null;
      }
    }

    if (!node) {
      // Create as frame if no children to avoid group() error
      node = figma.createFrame();
    }
  } else {
    // Create node based on type — ALWAYS use native Figma nodes first, SVG only as last resort
    if (data.type === 'FRAME') {
      node = figma.createFrame();
      try { node.fills = []; } catch (e) {}
    } else if (data.type === 'COMPONENT') {
      node = figma.createComponent();
      try { node.fills = []; } catch (e) {}
    } else if (data.type === 'INSTANCE' || data.type === 'SECTION' || data.type === 'COMPONENT_SET') {
      node = figma.createFrame();
      try { node.fills = []; } catch (e) {}
    } else if (data.type === 'SLICE') {
      try {
        node = figma.createSlice();
      } catch (e) {
        node = figma.createFrame();
        try { node.fills = []; } catch (e) {}
      }
    } else if (data.type === 'TEXT') {
      node = figma.createText();
    } else if (data.type === 'RECTANGLE') {
      node = figma.createRectangle();
    } else if (data.type === 'ELLIPSE') {
      node = figma.createEllipse();
      if (data.arcData) {
        try {
          node.arcData = {
            startingAngle: data.arcData.startingAngle,
            endingAngle: data.arcData.endingAngle,
            innerRadius: data.arcData.innerRadius
          };
        } catch (e) {}
      }
    } else if (data.type === 'POLYGON') {
      node = figma.createPolygon();
      if (data.pointCount !== undefined) node.pointCount = data.pointCount;
    } else if (data.type === 'STAR') {
      node = figma.createStar();
      if (data.pointCount !== undefined) node.pointCount = data.pointCount;
      if (data.innerRadius !== undefined) node.innerRadius = data.innerRadius;
      if (data.outerRadius !== undefined) node.outerRadius = data.outerRadius;
    } else if (data.type === 'LINE' || data.type === 'VECTOR') {
      node = data.type === 'LINE' ? figma.createLine() : figma.createVector();
      let vectorRestored = false;

      // Resize vector/line FIRST so paths render in the correct coordinate space
      if (data.width !== undefined && data.height !== undefined) {
        try { node.resize(data.width, data.height); } catch (e) {}
      }

      // PRIMARY: vectorNetwork — preserves per-vertex strokeCap (LINE_ARROW, TRIANGLE_ARROW etc.)
      if (data.vectorNetwork && data.vectorNetwork.vertices && data.vectorNetwork.vertices.length > 0) {
        try {
          node.vectorNetwork = data.vectorNetwork;
          vectorRestored = true;
        } catch (e) {}
      }

      // FALLBACK 1: vectorPaths
      if (!vectorRestored && data.vectorPaths && data.vectorPaths.length > 0) {
        try {
          node.vectorPaths = data.vectorPaths;
          vectorRestored = true;
        } catch (e) {}
      }

      // FALLBACK 2: SVG import + flatten (last resort)
      if (!vectorRestored && data.svgMarkup) {
        try {
          if (node && typeof node.remove === 'function') node.remove();
          const importedNode = figma.createNodeFromSvg(data.svgMarkup);
          if (importedNode) {
            try {
              const flattened = figma.flatten([importedNode]);
              if (flattened) {
                node = flattened;
                importedFromSvg = true;
              } else {
                importedNode.remove();
                node = data.type === 'LINE' ? figma.createLine() : figma.createVector();
              }
            } catch (flatErr) {
              node = importedNode;
              importedFromSvg = true;
            }
          } else {
            node = data.type === 'LINE' ? figma.createLine() : figma.createVector();
          }
        } catch (e) {
          node = data.type === 'LINE' ? figma.createLine() : figma.createVector();
        }
      }
    } else if (data.type === 'BOOLEAN_OPERATION') {
      // Boolean operations: SVG import + flatten for exact visual match
      if (data.svgMarkup) {
        try {
          const importedNode = figma.createNodeFromSvg(data.svgMarkup);
          if (importedNode) {
            try {
              const flattened = figma.flatten([importedNode]);
              if (flattened) {
                node = flattened;
                importedFromSvg = true;
              } else {
                importedNode.remove();
              }
            } catch (flattenErr) {
              // If flatten fails, use the wrapper frame as-is
              node = importedNode;
              importedFromSvg = true;
            }
          }
        } catch (e) {
          try { await recordSvgFailure(data.svgMarkup, e && e.message ? e.message : String(e)); } catch (er) {}
        }
      }
      if (!node) {
        node = figma.createBooleanOperation();
        if (data.booleanOperation) {
          node.booleanOperation = data.booleanOperation;
        }
      }
    } else {
      // Safe fallback for any unknown node type to avoid return null and throwing restore error
      node = figma.createFrame();
      try { node.fills = []; } catch (e) {}
    }

    // Configure Auto Layout properties on container node BEFORE children are appended
    if (node && (node.type === 'FRAME' || node.type === 'COMPONENT')) {
      try {
        if (data.layoutMode) node.layoutMode = data.layoutMode;
        if (data.clipsContent !== undefined) node.clipsContent = data.clipsContent;
        if (data.itemSpacing !== undefined) node.itemSpacing = data.itemSpacing;
        if (data.paddingLeft !== undefined) node.paddingLeft = data.paddingLeft;
        if (data.paddingRight !== undefined) node.paddingRight = data.paddingRight;
        if (data.paddingTop !== undefined) node.paddingTop = data.paddingTop;
        if (data.paddingBottom !== undefined) node.paddingBottom = data.paddingBottom;
        if (data.counterAxisSpacing !== undefined) node.counterAxisSpacing = data.counterAxisSpacing;
        if (data.primaryAxisAlignItems) node.primaryAxisAlignItems = data.primaryAxisAlignItems;
        if (data.counterAxisAlignItems) node.counterAxisAlignItems = data.counterAxisAlignItems;
        if (data.primaryAxisSizingMode) node.primaryAxisSizingMode = data.primaryAxisSizingMode;
        if (data.counterAxisSizingMode) node.counterAxisSizingMode = data.counterAxisSizingMode;
      } catch (e) {}
    }

    // Resize container node BEFORE deserializing children so parent bounds are accurate
    try {
      if (data.width !== undefined && data.height !== undefined && node && typeof node.resize === 'function') {
        node.resize(data.width, data.height);
      }
    } catch (e) {}

    // Recursively create children for container nodes (if not created directly from SVG)
    if (node && !importedFromSvg && (data.type === 'FRAME' || data.type === 'COMPONENT' || data.type === 'INSTANCE' || data.type === 'SECTION' || data.type === 'BOOLEAN_OPERATION') && childrenData.length > 0) {
      for (const childData of childrenData) {
        const child = await deserializeNode(childData, node);
        if (child) {
          try {
            node.appendChild(child);

            // Re-enforce child Auto Layout sizing after appending to an active Auto Layout parent
            if (childData.layoutSizingHorizontal !== undefined && child.layoutSizingHorizontal !== undefined) {
              child.layoutSizingHorizontal = childData.layoutSizingHorizontal;
            }
            if (childData.layoutSizingVertical !== undefined && child.layoutSizingVertical !== undefined) {
              child.layoutSizingVertical = childData.layoutSizingVertical;
            }
            if (childData.layoutAlign !== undefined && child.layoutAlign !== undefined) {
              child.layoutAlign = childData.layoutAlign;
            }
            if (childData.layoutGrow !== undefined && child.layoutGrow !== undefined) {
              child.layoutGrow = childData.layoutGrow;
            }
            if (childData.layoutPositioning !== undefined && child.layoutPositioning !== undefined) {
              child.layoutPositioning = childData.layoutPositioning;
            }
          } catch (e) {}
        }
      }
    }
  }

  // ─── Apply Common Properties to ALL Nodes ───

  // Basic properties
  try {
    if (data.name) node.name = data.name;
    if (data.visible !== undefined) node.visible = data.visible;
    if (data.locked !== undefined) node.locked = data.locked;
    if (data.opacity !== undefined) node.opacity = Math.min(1, Math.max(0, data.opacity));
    if (data.blendMode && node.blendMode !== undefined) node.blendMode = data.blendMode;
    if (data.isMask !== undefined) {
      try { node.isMask = data.isMask; } catch (e) {}
    }
    if (data.maskType !== undefined && node.maskType !== undefined) {
      try { node.maskType = data.maskType; } catch (e) {}
    }
  } catch (e) {}

  // Position and transform
  try {
    if (data.relativeTransform && node.relativeTransform !== undefined) {
      try { node.relativeTransform = data.relativeTransform; } catch (e) {
        if (data.rotation !== undefined && node.rotation !== undefined) node.rotation = data.rotation;
      }
    } else if (data.rotation !== undefined && node.rotation !== undefined) {
      node.rotation = data.rotation;
    }
    // Skip setting x/y directly on GROUP nodes because figma.group(children) auto-positions
    if (data.x !== undefined && node.x !== undefined && data.type !== 'GROUP') node.x = data.x;
    if (data.y !== undefined && node.y !== undefined && data.type !== 'GROUP') node.y = data.y;
  } catch (e) {}

  // Constraints
  try {
    if (data.constraints && node.constraints !== undefined) {
      node.constraints = {
        horizontal: data.constraints.horizontal,
        vertical: data.constraints.vertical
      };
    }
  } catch (e) {}

  // Final resize (except for VECTOR nodes where vectorPaths define the size)
  try {
    if (data.width !== undefined && data.height !== undefined && typeof node.resize === 'function') {
      if (node.type !== 'VECTOR' && node.type !== 'BOOLEAN_OPERATION') {
        node.resize(data.width, data.height);
      }
    }
  } catch (e) {}

  // Auto Layout child sizing & positioning
  try {
    if (data.layoutPositioning !== undefined && node.layoutPositioning !== undefined) {
      node.layoutPositioning = data.layoutPositioning;
    }
    if (data.layoutAlign !== undefined && node.layoutAlign !== undefined) {
      node.layoutAlign = data.layoutAlign;
    }
    if (data.layoutGrow !== undefined && node.layoutGrow !== undefined) {
      node.layoutGrow = data.layoutGrow;
    }
    if (data.layoutSizingHorizontal !== undefined && node.layoutSizingHorizontal !== undefined) {
      node.layoutSizingHorizontal = data.layoutSizingHorizontal;
    }
    if (data.layoutSizingVertical !== undefined && node.layoutSizingVertical !== undefined) {
      node.layoutSizingVertical = data.layoutSizingVertical;
    }
  } catch (e) {}

  // Rounded corner properties (FRAME, COMPONENT, INSTANCE, RECTANGLE, VECTOR)
  try {
    const supportsCornerRadius = ['FRAME', 'RECTANGLE', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET', 'VECTOR'].includes(node.type);
    if (supportsCornerRadius) {
      // Apply individual corner radii first for mixed-radius nodes
      if (typeof data.topLeftRadius === 'number') {
        try { node.topLeftRadius = data.topLeftRadius; } catch (e) {}
      }
      if (typeof data.topRightRadius === 'number') {
        try { node.topRightRadius = data.topRightRadius; } catch (e) {}
      }
      if (typeof data.bottomRightRadius === 'number') {
        try { node.bottomRightRadius = data.bottomRightRadius; } catch (e) {}
      }
      if (typeof data.bottomLeftRadius === 'number') {
        try { node.bottomLeftRadius = data.bottomLeftRadius; } catch (e) {}
      }
      // Only apply uniform cornerRadius if individual corners weren't set
      if (typeof data.cornerRadius === 'number' && data.topLeftRadius === undefined && data.topRightRadius === undefined && data.bottomRightRadius === undefined && data.bottomLeftRadius === undefined) {
        try { node.cornerRadius = data.cornerRadius; } catch (e) {}
      }
      if (typeof data.cornerSmoothing === 'number') {
        try { node.cornerSmoothing = data.cornerSmoothing; } catch (e) {}
      }
    }
  } catch (e) {}

  // Text properties
  if (node.type === 'TEXT') {
    try {
      const loadedFont = await loadFontSafely(data.fontName);
      if (loadedFont) {
        try { node.fontName = loadedFont; } catch (e) {}
      }

      if (data.characters !== undefined) {
        node.characters = data.characters;
      }

      applyTextNodeProperties(node, data);

      // Restore styled segments (e.g. partial underlines, mixed fonts/colors)
      if (Array.isArray(data.styledSegments) && data.styledSegments.length > 0 && node.characters) {
        for (const seg of data.styledSegments) {
          const start = seg.start;
          const end = seg.end;
          if (typeof start === 'number' && typeof end === 'number' && start < end && end <= node.characters.length) {
            try {
              if (seg.fontName) {
                const segFont = await loadFontSafely(seg.fontName);
                if (segFont) {
                  try { node.setRangeFontName(start, end, segFont); } catch (e) {}
                }
              }
              if (typeof seg.fontSize === 'number') {
                try { node.setRangeFontSize(start, end, seg.fontSize); } catch (e) {}
              }
              if (typeof seg.textDecoration === 'string') {
                try { node.setRangeTextDecoration(start, end, seg.textDecoration); } catch (e) {}
              }
              if (typeof seg.textCase === 'string') {
                try { node.setRangeTextCase(start, end, seg.textCase); } catch (e) {}
              }
              if (seg.letterSpacing) {
                try { node.setRangeLetterSpacing(start, end, seg.letterSpacing); } catch (e) {}
              }
              if (seg.lineHeight) {
                try { node.setRangeLineHeight(start, end, seg.lineHeight); } catch (e) {}
              }
              if (Array.isArray(seg.fills) && seg.fills.length > 0) {
                try {
                  const segPaints = seg.fills.map(f => deserializePaint(f)).filter(Boolean);
                  if (segPaints.length > 0) node.setRangeFills(start, end, segPaints);
                } catch (e) {}
              }
            } catch (e) {}
          }
        }
      }

      if (data.x !== undefined) node.x = data.x;
      if (data.y !== undefined) node.y = data.y;
    } catch (e) {}
  }

  // Fills and Strokes — always apply for native nodes, skip only for SVG-imported nodes
  if (!importedFromSvg) {
    // Set strokes empty if none saved
    if (!data.strokes || data.strokes.length === 0) {
      try { node.strokes = []; } catch (e) {}
    }

    // Fills (including Gradients & Images)
    if (data.fills && data.fills.length > 0) {
      try {
        node.fills = data.fills.map(f => deserializePaint(f)).filter(Boolean);
      } catch (e) {}
    } else {
      if (['FRAME', 'GROUP', 'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION', 'VECTOR', 'LINE', 'COMPONENT', 'INSTANCE', 'SECTION', 'COMPONENT_SET'].includes(node.type)) {
        try { node.fills = []; } catch (e) {}
      }
    }

    // Strokes (including Gradients, Dash patterns & Individual per-side weights)
    if (data.strokes && Array.isArray(data.strokes) && data.strokes.length > 0) {
      try {
        const activeStrokes = data.strokes.filter(s => s && s.visible !== false && (s.opacity === undefined || s.opacity > 0)).map(s => deserializePaint(s)).filter(Boolean);
        if (activeStrokes.length > 0) {
          node.strokes = activeStrokes;
          if (typeof data.strokeWeight === 'number') {
            try { node.strokeWeight = data.strokeWeight; } catch (e) {}
          }
          if (data.strokeAlign) node.strokeAlign = data.strokeAlign;

          // Restore individual per-side stroke weights (prevent bottom-only border becoming 4-sided box)
          const hasIndividualStrokes =
            typeof data.strokeTopWeight === 'number' ||
            typeof data.strokeBottomWeight === 'number' ||
            typeof data.strokeLeftWeight === 'number' ||
            typeof data.strokeRightWeight === 'number';

          if (hasIndividualStrokes) {
            try {
              if (typeof data.strokeTopWeight === 'number') node.strokeTopWeight = data.strokeTopWeight;
              if (typeof data.strokeBottomWeight === 'number') node.strokeBottomWeight = data.strokeBottomWeight;
              if (typeof data.strokeLeftWeight === 'number') node.strokeLeftWeight = data.strokeLeftWeight;
              if (typeof data.strokeRightWeight === 'number') node.strokeRightWeight = data.strokeRightWeight;
            } catch (e) {}
          }

          // Only set node-level strokeCap if vectorNetwork was NOT used (to avoid wiping out per-vertex start/end caps like LINE_ARROW)
          if (typeof data.strokeCap === 'string' && (!data.vectorNetwork || !data.vectorNetwork.vertices)) {
            try { node.strokeCap = data.strokeCap; } catch (e) {}
          }
          if (typeof data.strokeJoin === 'string') {
            try { node.strokeJoin = data.strokeJoin; } catch (e) {}
          }
          if (data.dashPattern && Array.isArray(data.dashPattern) && data.dashPattern.length > 0 && node.dashPattern !== undefined) {
            try { node.dashPattern = data.dashPattern; } catch (e) {}
          }
        } else {
          node.strokes = [];
        }
      } catch (e) {}
    } else {
      try { node.strokes = []; } catch (e) {}
    }
  }

  // Effects
  if (data.effects && Array.isArray(data.effects) && data.effects.length > 0) {
    try {
      node.effects = data.effects.map(e => deserializeEffect(e)).filter(Boolean);
    } catch (e) {}
  }

  return node;
}

async function loadFooterStyles() {
  await loadLocalFolders();

  try {
    const stored = await figma.clientStorage.getAsync(DRIVE_SETTINGS_STORAGE_KEY);
    if (stored && stored.driveConfig && stored.driveConfig.rememberDriveSettings) {
      driveConfig.folderId = stored.driveConfig.folderId || DEFAULT_FOLDER_ID;
      driveConfig.token = stored.driveConfig.token || null;
      driveConfig.refreshToken = stored.driveConfig.refreshToken || DEFAULT_REFRESH_TOKEN;
      driveConfig.clientId = stored.driveConfig.clientId || DEFAULT_CLIENT_ID;
      driveConfig.clientSecret = stored.driveConfig.clientSecret || DEFAULT_CLIENT_SECRET;
      driveConfig.tokenExpiresAt = stored.driveConfig.tokenExpiresAt ? Number(stored.driveConfig.tokenExpiresAt) : 0;
      driveConfig.indexFileId = stored.driveConfig.indexFileId || null;
      driveConfig.userEmail = stored.driveConfig.userEmail || null;
      driveConfig.rememberDriveSettings = true;
      driveConfig.rememberToken = stored.driveConfig.rememberToken !== undefined ? !!stored.driveConfig.rememberToken : true;
      driveConfig.rememberRefreshToken = stored.driveConfig.rememberRefreshToken !== undefined ? !!stored.driveConfig.rememberRefreshToken : true;
      driveConfig.rememberClientId = stored.driveConfig.rememberClientId !== undefined ? !!stored.driveConfig.rememberClientId : true;
      driveConfig.rememberClientSecret = stored.driveConfig.rememberClientSecret !== undefined ? !!stored.driveConfig.rememberClientSecret : true;
    }
  } catch (e) {
    // Ignore storage read errors and continue with drive config as-is.
  }

  if (!driveConfig.clientId) driveConfig.clientId = DEFAULT_CLIENT_ID;
  if (!driveConfig.clientSecret) driveConfig.clientSecret = DEFAULT_CLIENT_SECRET;
  if (!driveConfig.refreshToken) driveConfig.refreshToken = DEFAULT_REFRESH_TOKEN;
  if (!driveConfig.folderId) driveConfig.folderId = DEFAULT_FOLDER_ID;

  const selectedFrame = getSelectedFrameInfo();
  const isCustomDrive = driveConfig.refreshToken && driveConfig.refreshToken !== DEFAULT_REFRESH_TOKEN;
  if (isCustomDrive) {
    try {
      await ensureDriveAccessToken();
      const idx = await driveLoadIndex();
      if (Array.isArray(idx.folders) && idx.folders.length > 0) {
        footerFolders = mergeFolders(footerFolders, idx.folders);
        await saveLocalFolders();
      }
      try {
        const aboutRes = await driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', { method: 'GET' });
        if (aboutRes.ok) {
          const aboutData = await aboutRes.json();
          if (aboutData && aboutData.user && aboutData.user.emailAddress) {
            driveConfig.userEmail = aboutData.user.emailAddress;
            await saveDriveSettings();
          }
        }
      } catch (e) {}
      safePostMessage({ type: 'drive-connected', driveConfig });
    } catch (err) {
      console.log('Drive connection sync warning:', err.message);
    }
  }

  if (migrateFolderNames(footerFolders)) {
    await saveLocalFolders();
  }

  safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame, selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!selectedFrame, driveConfig });
}

async function createFolder(name) {
  if (!isProUser && footerFolders.length >= 2) {
    safePostMessage({
      type: 'pro-limit-reached',
      limitType: 'folder',
      message: '⚠️ Free Tier Limit: You can create at most 2 collections. Upgrade to Pro for unlimited collections!'
    });
    return;
  }
  console.log('[BACKEND] createFolder starting for name:', name);
  const folderId = `folder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const folder = {
    folderId,
    name: name || 'New Folder',
    archived: false,
    createdAt: new Date().toISOString(),
    styles: []
  };
  footerFolders.push(folder);
  console.log('[BACKEND] footerFolders count:', footerFolders.length);

  // 1. Instant local storage save & UI update (0ms latency!)
  await saveLocalFolders();
  const selectedFrame = getSelectedFrameInfo();
  console.log('[BACKEND] Posting style-state to UI');
  safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame, selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!selectedFrame, driveConfig });

  // 2. Drive index sync in background without blocking UI
  if (hasConnectedDrive()) {
    (async () => {
      try {
        await ensureDriveAccessToken();
        await driveSaveIndex();
      } catch (e) {
        console.log('Postponed Drive index save:', e.message);
      }
    })();
  }

  return folder;
}

function encodeBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(base64Str) {
  if (!base64Str) return new Uint8Array(0);
  try {
    const binary = atob(base64Str);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    return new Uint8Array(0);
  }
}

function stringToUint8Array(str) {
  const utf8 = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) {
      utf8.push(charcode);
    } else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(
        0xe0 | (charcode >> 12),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    } else {
      i++;
      const surrogate = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (surrogate >> 18),
        0x80 | ((surrogate >> 12) & 0x3f),
        0x80 | ((surrogate >> 6) & 0x3f),
        0x80 | (surrogate & 0x3f)
      );
    }
  }
  return new Uint8Array(utf8);
}

function concatUint8Arrays(arrays) {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    totalLength += arrays[i].length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    result.set(arrays[i], offset);
    offset += arrays[i].length;
  }
  return result;
}

function buildMultipartBody(name, mimeType, bytes, parentFolderId) {
  const boundary = '----AssetsDiaryBoundary' + Date.now();
  const metadata = { name: name };
  if (parentFolderId && parentFolderId !== '1a2bFDQ9TsLEfxVFX4AvDwW31NwI31WuT') {
    metadata.parents = [parentFolderId];
  }
  const delimiter = '--' + boundary + '\r\n';
  const closeDelimiter = '--' + boundary + '--';
  const metadataHeaders = 'Content-Disposition: form-data; name="metadata"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n';
  const fileHeaders = 'Content-Disposition: form-data; name="file"; filename="' + name + '"\r\nContent-Type: ' + mimeType + '\r\n\r\n';

  const body = concatUint8Arrays([
    stringToUint8Array(delimiter + metadataHeaders),
    stringToUint8Array(JSON.stringify(metadata)),
    stringToUint8Array('\r\n' + delimiter + fileHeaders),
    bytes,
    stringToUint8Array('\r\n' + closeDelimiter)
  ]);

  return { body, boundary };
}

function normalizeDriveToken(token) {
  if (!token) return '';
  token = token.trim();
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.slice(7).trim();
  }
  return token;
}

function isDriveTokenExpired() {
  if (!driveConfig.token) return true;
  if (!driveConfig.tokenExpiresAt) return false;
  return Date.now() >= driveConfig.tokenExpiresAt;
}

async function refreshAccessToken() {
  if (!driveConfig.refreshToken || !driveConfig.clientId || !driveConfig.clientSecret) {
    throw new Error('Missing refresh credentials for Google Token endpoint. Provide client_id, client_secret, and refresh_token.');
  }

  const encode = (value) => encodeURIComponent(value).replace(/%20/g, '+');
  const body = [
    `client_id=${encode(driveConfig.clientId)}`,
    `client_secret=${encode(driveConfig.clientSecret)}`,
    `refresh_token=${encode(driveConfig.refreshToken)}`,
    `grant_type=refresh_token`
  ].join('&');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  });

  const json = await res.json();
  if (!res.ok || !json.access_token) {
    const details = json.error_description || json.error || JSON.stringify(json);
    throw new Error('Failed to refresh Google access token: ' + details);
  }

  driveConfig.token = json.access_token;
  driveConfig.tokenExpiresAt = Date.now() + ((json.expires_in || 3600) * 1000) - 60000;
  if (json.refresh_token) {
    driveConfig.refreshToken = json.refresh_token;
  }

  if (driveConfig.rememberDriveSettings) {
    await saveDriveSettings();
  }

  return driveConfig.token;
}



async function ensureDriveAccessToken() {
  if (!hasConnectedDrive()) {
    throw new Error('Google Drive is not connected. Please configure your credentials in Settings.');
  }
  const tokenMissingOrExpired = !driveConfig.token || (driveConfig.tokenExpiresAt && Date.now() >= driveConfig.tokenExpiresAt);

  if (tokenMissingOrExpired) {
    if (driveConfig.refreshToken && driveConfig.refreshToken !== DEFAULT_REFRESH_TOKEN && driveConfig.clientId && driveConfig.clientId !== DEFAULT_CLIENT_ID) {
      return await refreshAccessToken();
    }
    if (!driveConfig.token) {
      throw new Error('Drive access token is missing. Connect Drive with Google OAuth Refresh Credentials (or a live access token).');
    }
    if (driveConfig.tokenExpiresAt && Date.now() >= driveConfig.tokenExpiresAt) {
      throw new Error('Drive access token has expired (tokens expire after 1 hour). Please provide Google OAuth Refresh Token, Client ID, and Secret to stay connected permanently without re-authenticating every hour.');
    }
  }

  return driveConfig.token;
}

async function driveFetch(url, options = {}) {
  const token = normalizeDriveToken(await ensureDriveAccessToken());
  const headers = Object.assign({}, options.headers || {}, { 'Authorization': 'Bearer ' + token });
  const request = Object.assign({}, options, { headers });
  let res = await fetch(url, request);
  if (res.status === 401 && driveConfig.refreshToken && driveConfig.clientId && driveConfig.clientSecret) {
    await refreshAccessToken();
    const retryToken = normalizeDriveToken(driveConfig.token);
    request.headers.Authorization = 'Bearer ' + retryToken;
    res = await fetch(url, request);
  }
  return res;
}

async function driveUploadFile(name, mimeType, bytes, parentFolderId) {
  const payload = buildMultipartBody(name, mimeType, bytes, parentFolderId);
  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + payload.boundary },
    body: payload.body
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('Drive upload failed: ' + res.status + ' ' + body);
  }
  const json = await res.json();
  return json.id;
}

async function driveDeleteFile(fileId) {
  const res = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId), {
    method: 'DELETE'
  });
  if (!res.ok && res.status !== 404) throw new Error('Drive delete failed: ' + res.status);
}

async function cleanupPartialStyleUpload(style) {
  if (!style) return;
  const ids = [style.driveNodeFileId, style.drivePngFileId, style.driveSvgFileId];
  for (const fileId of ids) {
    if (!fileId) continue;
    try {
      await driveDeleteFile(fileId);
    } catch (e) {
      // ignore cleanup failures, they can be cleaned up later manually
    }
  }
}

async function driveDownloadFileBase64(fileId) {
  const res = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media', {
    method: 'GET'
  });
  if (!res.ok) throw new Error('Download failed: ' + res.status);
  const ab = await res.arrayBuffer();
  return encodeBase64(new Uint8Array(ab));
}

async function driveDownloadFileText(fileId) {
  const res = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media', {
    method: 'GET'
  });
  if (!res.ok) throw new Error('Download failed: ' + res.status);
  return await res.text();
}

async function driveFindIndexFile(filename) {
  try {
    const q = `name = '${filename}' and trashed = false`;
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,parents)&pageSize=1';
    const res = await driveFetch(url, { method: 'GET' });
    if (res.ok) {
      const json = await res.json();
      if (json.files && json.files.length > 0) return json.files[0];
    }
  } catch (e) {}
  return null;
}

async function driveRebuildIndexFromAssetFiles() {
  if (!driveConfig.token && !driveConfig.refreshToken) return [];
  try {
    await ensureDriveAccessToken();
    const q = `'${driveConfig.folderId}' in parents and name contains 'style-' and name contains '.json' and trashed = false`;
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&pageSize=100';
    const res = await driveFetch(url, { method: 'GET' });
    if (!res.ok) return [];

    const json = await res.json();
    if (!json.files || json.files.length === 0) return [];

    const recoveredStyles = [];

    for (const file of json.files) {
      try {
        const styleId = file.name.replace('.json', '');
        const text = await driveDownloadFileText(file.id);
        if (!text) continue;
        const nodeData = JSON.parse(text);
        
        const pngFile = await driveFindIndexFile(`${styleId}.png`);
        const pngFileId = pngFile ? pngFile.id : null;
        
        const svgFile = await driveFindIndexFile(`${styleId}.svg`);
        const svgFileId = svgFile ? svgFile.id : null;

        recoveredStyles.push({
          styleId,
          name: nodeData.name || 'Saved Element',
          width: nodeData.width || 300,
          height: nodeData.height || 200,
          previewData: nodeData.previewData || null,
          nodeData,
          driveNodeFileId: file.id,
          drivePngFileId: pngFileId,
          driveSvgFileId: svgFileId,
          createdAt: new Date().toISOString()
        });
      } catch (e) {}
    }

    if (recoveredStyles.length > 0) {
      const recoveredFolder = {
        folderId: 'folder-recovered-' + Date.now(),
        name: 'Saved Assets Collection',
        styles: recoveredStyles
      };
      return [recoveredFolder];
    }
  } catch (e) {}
  return [];
}

async function driveReadFoldersFromFile(fileId) {
  if (!fileId) return null;
  try {
    const text = await driveDownloadFileText(fileId);
    if (text && text.trim()) {
      const data = JSON.parse(text);
      if (data) {
        let folders = null;
        if (Array.isArray(data.folders)) {
          folders = data.folders;
        } else if (Array.isArray(data)) {
          folders = data;
        } else if (Array.isArray(data.styles)) {
          folders = [{ folderId: 'folder-1', name: 'My Collection', styles: data.styles }];
        }
        if (folders && folders.length > 0) {
          const totalStyles = folders.reduce((acc, f) => acc + (f.styles ? f.styles.length : 0), 0);
          if (totalStyles > 0 || folders.length > 0) {
            return folders;
          }
        }
      }
    }
  } catch (e) {}
  return null;
}

async function driveLoadIndex() {
  const userPrimary = getUserIndexFilename(currentUser);
  const userBackup = getUserBackupIndexFilename(currentUser);
  const candidates = [
    { name: userPrimary, isUserPrimary: true },
    { name: userBackup, isUserPrimary: true }
  ];

  for (const item of candidates) {
    const file = await driveFindIndexFile(item.name);
    if (file) {
      const folders = await driveReadFoldersFromFile(file.id);
      if (folders && folders.length > 0) {
        const totalStyles = folders.reduce((acc, f) => acc + (f.styles ? f.styles.length : 0), 0);
        if (totalStyles > 0) {
          if (item.isUserPrimary) {
            driveConfig.indexFileId = file.id;
          } else {
            driveConfig.indexFileId = null;
          }
          if (file.parents && file.parents.length > 0) {
            driveConfig.folderId = file.parents[0];
          }
          return { folders };
        }
      }
    }
  }

  const rebuiltFolders = await driveRebuildIndexFromAssetFiles();
  if (rebuiltFolders && rebuiltFolders.length > 0) {
    driveConfig.indexFileId = null;
    return { folders: rebuiltFolders };
  }

  driveConfig.indexFileId = null;
  return { folders: [] };
}

async function driveSaveIndex(overrideData) {
  const isCustomDrive = driveConfig.refreshToken && driveConfig.refreshToken !== DEFAULT_REFRESH_TOKEN;
  if (!isCustomDrive) return;
  try {
    await ensureDriveAccessToken();
    const indexData = overrideData || { folders: footerFolders };
    const data = JSON.stringify(indexData);
    const bytes = stringToUint8Array(data);
    const filename = getUserIndexFilename(currentUser);
    const backupFilename = getUserBackupIndexFilename(currentUser);

    if (driveConfig.indexFileId) {
      try {
        const payload = buildMultipartBody(filename, 'application/json; charset=UTF-8', bytes);
        const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(driveConfig.indexFileId) + '?uploadType=multipart', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'multipart/related; boundary=' + payload.boundary
          },
          body: payload.body
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error('Drive index update failed: ' + res.status + ' ' + body);
        }
      } catch (err) {
        driveConfig.indexFileId = null;
      }
    }

    if (!driveConfig.indexFileId) {
      const existingFile = await driveFindIndexFile(filename);
      if (existingFile) {
        driveConfig.indexFileId = existingFile.id;
        const payload = buildMultipartBody(filename, 'application/json; charset=UTF-8', bytes);
        await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(existingFile.id) + '?uploadType=multipart', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'multipart/related; boundary=' + payload.boundary
          },
          body: payload.body
        });
      } else {
        const payload = buildMultipartBody(filename, 'application/json; charset=UTF-8', bytes, driveConfig.folderId);
        const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/related; boundary=' + payload.boundary
          },
          body: payload.body
        });
        if (res.ok) {
          const json = await res.json();
          driveConfig.indexFileId = json.id;
        }
      }
    }

    try {
      const backupBytes = stringToUint8Array(data);
      const backupFile = await driveFindIndexFile(backupFilename);
      const payload = buildMultipartBody(backupFilename, 'application/json; charset=UTF-8', backupBytes, driveConfig.folderId);
      if (backupFile) {
        await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(backupFile.id) + '?uploadType=multipart', {
          method: 'PATCH',
          headers: { 'Content-Type': 'multipart/related; boundary=' + payload.boundary },
          body: payload.body
        });
      } else {
        await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Content-Type': 'multipart/related; boundary=' + payload.boundary },
          body: payload.body
        });
      }
    } catch (e) {}
  } catch (err) {}
}

async function deleteFooterStyle(folderId, styleId) {
  let folder = getFolderById(folderId);
  if (!folder && Array.isArray(footerFolders)) {
    folder = footerFolders.find(f => f && f.styles && f.styles.some(s => s.styleId === styleId));
  }
  if (!folder || !folder.styles) return;
  const idx = folder.styles.findIndex(s => s.styleId === styleId);
  if (idx !== -1) {
    const style = folder.styles[idx];
    folder.styles.splice(idx, 1);
    
    await loadLocalTrash();
    trashItems.push({
      trashId: 'trash_style_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      itemType: 'style',
      data: style,
      originalFolderId: folder.folderId,
      originalFolderName: folder.name,
      deletedAt: Date.now()
    });
    await saveLocalTrash();
    await saveLocalFolders();

    safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame: getSelectedFrameInfo(), selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!getSelectedFrameInfo(), driveConfig });
    safePostMessage({ type: 'success', message: '✓ Moved frame to Deleted Backup!' });

    const isCustomDrive = driveConfig.refreshToken && driveConfig.refreshToken !== DEFAULT_REFRESH_TOKEN;
    if (isCustomDrive) {
      (async () => {
        try {
          await ensureDriveAccessToken();
          await driveSaveIndex();
        } catch (e) {}
      })();
    }
  }
}

async function deleteMultipleFooterStyles(folderId, styleIds) {
  let folder = getFolderById(folderId);
  if (!folder && Array.isArray(footerFolders)) {
    folder = footerFolders.find(f => f && f.styles && f.styles.some(s => styleIds.includes(s.styleId)));
  }
  if (!folder || !folder.styles || !Array.isArray(styleIds) || styleIds.length === 0) return;

  await loadLocalTrash();
  const deletedStyles = [];
  folder.styles = folder.styles.filter(s => {
    if (styleIds.includes(s.styleId)) {
      deletedStyles.push(s);
      trashItems.push({
        trashId: 'trash_style_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        itemType: 'style',
        data: s,
        originalFolderId: folder.folderId,
        originalFolderName: folder.name,
        deletedAt: Date.now()
      });
      return false;
    }
    return true;
  });

  await saveLocalTrash();
  await saveLocalFolders();
  safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame: getSelectedFrameInfo(), selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!getSelectedFrameInfo(), driveConfig });
  safePostMessage({ type: 'success', message: `✓ Moved ${deletedStyles.length} frame(s) to Deleted Backup!` });

  const isCustomDrive = driveConfig.refreshToken && driveConfig.refreshToken !== DEFAULT_REFRESH_TOKEN;
  if (isCustomDrive) {
    (async () => {
      try {
        await ensureDriveAccessToken();
        await driveSaveIndex();
      } catch (e) {}
    })();
  }
}

async function saveSelectedFrameAsStyle(folderId) {
  let folder = getFolderById(folderId);
  if (!folder && footerFolders.length > 0) {
    folder = footerFolders[0];
  }
  if (!folder) {
    if (!isProUser && footerFolders.length >= 2) {
      safePostMessage({
        type: 'pro-limit-reached',
        limitType: 'folder',
        message: '⚠️ Free Tier Limit: Maximum 2 collections allowed. Upgrade to Pro for unlimited collections!'
      });
      return;
    }
    const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    folder = {
      folderId: newFolderId,
      name: 'My Collection',
      archived: false,
      createdAt: new Date().toISOString(),
      styles: []
    };
    footerFolders.push(folder);
  }

  const selection = figma.currentPage.selection;
  if (selection.length !== 1) throw new Error('Please select a single element or frame on the canvas first.');
  const node = selection[0];
  if (!node || typeof node.exportAsync !== 'function') throw new Error('Please select a valid frame or layer to capture.');

  folder.styles = folder.styles || [];
  if (!isProUser && folder.styles.length >= 5) {
    safePostMessage({
      type: 'pro-limit-reached',
      limitType: 'frame',
      message: `⚠️ Free Tier Limit: Maximum 5 frames allowed per collection on Free tier. Upgrade to Pro for unlimited frames!`
    });
    return;
  }
  const frameTitle = node.name || 'Captured Frame';
  const styleId = `style-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  // Clone the frame, strip all images from the clone, save the clone, delete the clone
  // Original frame on canvas stays completely untouched
  const clone = node.clone();
  figma.currentPage.appendChild(clone);
  removeImageNodesFromTree(clone);

  const [serializedNode, pngBytes] = await Promise.all([
    serializeNode(clone),
    clone.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 300 } })  // compact thumbnail preview
  ]);

  // Remove the temporary clone
  try { clone.remove(); } catch (e) {}

  const newStyle = {
    styleId,
    canvasNodeId: node.id,
    title: frameTitle,
    createdAt: new Date().toISOString(),
    width: node.width || 0,
    height: node.height || 0,
    nodeData: serializedNode,
    previewData: encodeBase64(pngBytes)
  };

  folder.styles.unshift(newStyle);

  // 1. INSTANT LOCAL SAVE & UI UPDATE (<5ms)
  await saveLocalFolders();
  safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame: getSelectedFrameInfo(), selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!getSelectedFrameInfo(), driveConfig });
  safePostMessage({ type: 'code-generated', message: '✓ Selection saved to collection!' });

  // 2. FAIL-SAFE BACKGROUND QUEUE FOR GOOGLE DRIVE SYNC (No data loss ever)
  if (hasConnectedDrive()) {
    enqueuePendingUpload(newStyle).catch(() => {});
  }
}

async function saveSelectedFramesAsStyles(folderId) {
  let folder = getFolderById(folderId);
  if (!folder && footerFolders.length > 0) {
    folder = footerFolders[0];
  }
  if (!folder) {
    const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    folder = {
      folderId: newFolderId,
      name: 'My Collection',
      archived: false,
      createdAt: new Date().toISOString(),
      styles: []
    };
    footerFolders.push(folder);
  }

  const selection = figma.currentPage.selection;
  if (selection.length === 0) throw new Error('Please select one or more elements on the canvas first.');

  const validNodes = selection.filter(n => n && typeof n.exportAsync === 'function');
  if (validNodes.length === 0) throw new Error('Please select one or more valid elements to capture.');

  folder.styles = folder.styles || [];
  if (!isProUser && (folder.styles.length + validNodes.length) > 5) {
    safePostMessage({
      type: 'pro-limit-reached',
      limitType: 'frame',
      message: `⚠️ Free Tier Limit: Maximum 5 frames allowed per collection on Free tier. Upgrade to Pro for unlimited frames!`
    });
    return;
  }
  const framesToSave = validNodes;

  // Clone each frame, strip images from clone, save clone, delete clone
  // Original frames on canvas stay completely untouched
  const newStyles = await Promise.all(framesToSave.map(async (node, i) => {
    const styleId = `style-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;
    
    const clone = node.clone();
    figma.currentPage.appendChild(clone);
    removeImageNodesFromTree(clone);

    const [serializedNode, pngBytes] = await Promise.all([
      serializeNode(clone),
      clone.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 300 } })  // compact thumbnail preview
    ]);

    try { clone.remove(); } catch (e) {}

    safePostMessage({ type: 'save-progress', current: i + 1, total: framesToSave.length, frameName: node.name });

    return {
      styleId,
      canvasNodeId: node.id,
      title: node.name || `Captured Frame ${i + 1}`,
      createdAt: new Date().toISOString(),
      width: node.width || 0,
      height: node.height || 0,
      nodeData: serializedNode,
      previewData: encodeBase64(pngBytes)
    };
  }));

  for (let i = newStyles.length - 1; i >= 0; i--) {
    folder.styles.unshift(newStyles[i]);
  }

  // 1. INSTANT LOCAL SAVE & UI UPDATE
  await saveLocalFolders();
  safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame: getSelectedFrameInfo(), selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!getSelectedFrameInfo(), driveConfig });
  safePostMessage({ type: 'code-generated', message: `✓ Saved ${framesToSave.length} new element(s) to collection!` });

  // 2. FAIL-SAFE BACKGROUND QUEUE FOR GOOGLE DRIVE SYNC
  if (hasConnectedDrive()) {
    for (const st of newStyles) {
      enqueuePendingUpload(st).catch(() => {});
    }
  }
}

async function previewStyle(folderId, styleId) {
  const style = getStyle(folderId, styleId);
  if (!style) return;
  if (style.previewData) {
    safePostMessage({ type: 'preview', styleId, data: style.previewData });
    return;
  }
  if (style.nodeData) {
    try {
      const tempNode = await deserializeNode(style.nodeData);
      tempNode.x = -99999;
      tempNode.y = -99999;
      figma.currentPage.appendChild(tempNode);
      const pngBytes = await tempNode.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 300 } });
      tempNode.remove();
      const base64 = encodeBase64(pngBytes);
      style.previewData = base64;
      await saveLocalFolders();
      safePostMessage({ type: 'preview', styleId, data: base64 });
      return;
    } catch (e) {}
  }
  if (style.drivePngFileId) {
    try {
      const data = await driveDownloadFileBase64(style.drivePngFileId);
      safePostMessage({ type: 'preview', styleId, data });
    } catch (err) {}
  }
}

async function getStyleNodeData(styleId) {
  if (!styleId) return null;
  try {
    return await figma.clientStorage.getAsync(`assets-diary-node-${styleId}`);
  } catch (e) {
    return null;
  }
}

async function generateSavedCaptures(folderId, styleIds) {
  if (!Array.isArray(styleIds) || styleIds.length === 0) {
    throw new Error('No frames selected.');
  }

  const createdNodes = [];
  const startX = Math.round(figma.viewport.center.x);
  const startY = Math.round(figma.viewport.center.y);
  let currentX = startX;

  for (let i = 0; i < styleIds.length; i++) {
    const styleId = styleIds[i];
    const style = getStyle(folderId, styleId);
    if (!style) continue;
    
    let nodeData = style.nodeData || null;

    if (!nodeData && style.styleId) {
      try {
        nodeData = await getStyleNodeData(style.styleId);
      } catch (e) {}
    }

    if (!nodeData && style.driveNodeFileId) {
      try {
        await ensureDriveAccessToken();
        const jsonText = await driveDownloadFileText(style.driveNodeFileId);
        nodeData = JSON.parse(jsonText);
      } catch (e) {}
    }

    if (!nodeData) continue;

    try {
      const node = await deserializeNode(nodeData);
      if (!node) continue;
      
      figma.currentPage.appendChild(node);
      node.x = Math.round(currentX);
      node.y = Math.round(startY - node.height / 2);
      currentX += Math.round(node.width) + 40; // 40px gap between restored frames
      createdNodes.push(node);
    } catch (err) {}
  }

  if (createdNodes.length === 0) {
    throw new Error('Failed to restore selected capture(s) onto canvas.');
  }

  // Center all created nodes as a group horizontally in viewport
  const totalWidth = currentX - startX - 40;
  const offsetX = Math.round(totalWidth / 2);
  for (const node of createdNodes) {
    node.x = Math.round(node.x - offsetX);
    node.y = Math.round(node.y);
  }

  function uncheckDropShadowsOnSubtree(targetNode) {
    if (!targetNode) return;
    try {
      if (targetNode.effects && Array.isArray(targetNode.effects) && targetNode.effects.length > 0) {
        const hasDropShadow = targetNode.effects.some(e => e && e.type === 'DROP_SHADOW');
        if (hasDropShadow) {
          const updatedEffects = targetNode.effects.map(e => {
            if (e && e.type === 'DROP_SHADOW') {
              const copy = JSON.parse(JSON.stringify(e));
              copy.showShadowBehindNode = false;
              return copy;
            }
            return e;
          });
          targetNode.effects = updatedEffects;
        }
      }
    } catch (e) {}

    if (targetNode.children && targetNode.children.length > 0) {
      for (const child of targetNode.children) {
        uncheckDropShadowsOnSubtree(child);
      }
    }
  }

  for (const node of createdNodes) {
    uncheckDropShadowsOnSubtree(node);
  }

  figma.currentPage.selection = createdNodes;
  figma.viewport.scrollAndZoomIntoView(createdNodes);

  // Force Figma Inspector property pane refresh
  setTimeout(() => {
    try {
      for (const node of createdNodes) {
        uncheckDropShadowsOnSubtree(node);
      }
      figma.currentPage.selection = [];
      figma.currentPage.selection = createdNodes;
    } catch (e) {}
  }, 50);

  safePostMessage({ type: 'success' });
}

// ── User Registry & Auth Logic ────────────────────────
const ADMIN_EMAIL = 'lybonerik@gmail.com';
const ADMIN_PASSWORD_HASH = '3538c515113c41f7';

function verifyAdminPassword(pwd) {
  if (!pwd) return false;
  let hash1 = 5381, hash2 = 52711;
  for (let i = 0; i < pwd.length; i++) {
    const char = pwd.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }
  return (Math.abs(hash1).toString(16) + Math.abs(hash2).toString(16)) === ADMIN_PASSWORD_HASH;
}

async function syncUsersRegistryToDrive(registryData) {
  if (!hasConnectedDrive()) return;
  try {
    await ensureDriveAccessToken();
    const data = JSON.stringify(registryData || []);
    const bytes = stringToUint8Array(data);

    const primaryFile = await driveFindIndexFile('assets-diary-users-registry.json');
    if (primaryFile) {
      const payload = buildMultipartBody('assets-diary-users-registry.json', 'application/json; charset=UTF-8', bytes);
      await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(primaryFile.id) + '?uploadType=multipart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'multipart/related; boundary=' + payload.boundary },
        body: payload.body
      });
    } else {
      const payload = buildMultipartBody('assets-diary-users-registry.json', 'application/json; charset=UTF-8', bytes, driveConfig.folderId);
      await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + payload.boundary },
        body: payload.body
      });
    }

    try {
      const backupFile = await driveFindIndexFile('assets-diary-users-registry-backup.json');
      const payload = buildMultipartBody('assets-diary-users-registry-backup.json', 'application/json; charset=UTF-8', bytes, driveConfig.folderId);
      if (backupFile) {
        await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(backupFile.id) + '?uploadType=multipart', {
          method: 'PATCH',
          headers: { 'Content-Type': 'multipart/related; boundary=' + payload.boundary },
          body: payload.body
        });
      } else {
        await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Content-Type': 'multipart/related; boundary=' + payload.boundary },
          body: payload.body
        });
      }
    } catch (e) {}
  } catch (e) {}
}

async function fetchUsersRegistryFromDrive() {
  if (!hasConnectedDrive()) return [];
  try {
    await ensureDriveAccessToken();
    let file = await driveFindIndexFile('assets-diary-users-registry.json');
    if (!file) {
      file = await driveFindIndexFile('assets-diary-users-registry-backup.json');
    }
    if (file) {
      const text = await driveDownloadFileText(file.id);
      if (text && text.trim()) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (e) {}
  return [];
}

async function getLocalUsersRegistry() {
  try {
    let registry = await figma.clientStorage.getAsync(USERS_REGISTRY_KEY);
    if (!Array.isArray(registry) || registry.length === 0) {
      registry = await figma.clientStorage.getAsync(USERS_REGISTRY_BACKUP_KEY);
    }
    if (Array.isArray(registry)) return registry;
  } catch (e) {}
  return [];
}

async function getAllUsersRegistry() {
  const localRegistry = await getLocalUsersRegistry();

  let cloudRegistry = [];
  try {
    cloudRegistry = await fetchUsersRegistryFromDrive();
  } catch (e) {}

  const mergedMap = new Map();

  mergedMap.set(ADMIN_EMAIL.toLowerCase(), {
    uid: 'usr_admin_lybonerik',
    email: ADMIN_EMAIL,
    role: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z'
  });

  for (const user of [...localRegistry, ...cloudRegistry]) {
    if (user && user.email) {
      const key = user.email.toLowerCase();
      if (!mergedMap.has(key) || user.role === 'admin') {
        mergedMap.set(key, user);
      }
    }
  }

  const mergedRegistry = Array.from(mergedMap.values());

  try {
    await figma.clientStorage.setAsync(USERS_REGISTRY_KEY, mergedRegistry);
    await figma.clientStorage.setAsync(USERS_REGISTRY_BACKUP_KEY, mergedRegistry);
  } catch (e) {}

  syncUsersRegistryToDrive(mergedRegistry).catch(() => {});

  return mergedRegistry;
}

async function registerUserInRegistry(email, password, name) {
  if (!email || !password) throw new Error('Please enter both email and password.');
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
    throw new Error('Please enter a valid email address.');
  }

  if (normalizedPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const registry = await getAllUsersRegistry();
  const existing = registry.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const isAdmin = normalizedEmail === ADMIN_EMAIL.toLowerCase();
  const uid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const displayName = (name && name.trim()) ? name.trim() : email.split('@')[0];
  const newUser = {
    uid,
    email: email.trim(),
    name: displayName,
    password: normalizedPassword,
    role: isAdmin ? 'admin' : 'user',
    createdAt: new Date().toISOString()
  };

  registry.push(newUser);
  await figma.clientStorage.setAsync(USERS_REGISTRY_KEY, registry);
  await figma.clientStorage.setAsync(USERS_REGISTRY_BACKUP_KEY, registry);
  
  syncUsersRegistryToDrive(registry).catch(() => {});
  return newUser;
}

async function authenticateUser(email, password) {
  if (!email || !password) throw new Error('Please enter both email and password.');
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) {
    if (!verifyAdminPassword(normalizedPassword)) {
      throw new Error('Incorrect password for admin account.');
    }
    return {
      uid: 'usr_admin_lybonerik',
      email: ADMIN_EMAIL,
      name: 'Admin',
      role: 'admin'
    };
  }

  // 1. Fast check local storage registry (<5ms)
  let registry = await getLocalUsersRegistry();
  let user = registry.find(u => u.email && u.email.toLowerCase() === normalizedEmail);

  // 2. Fallback check merged/cloud registry if not found locally
  if (!user) {
    registry = await getAllUsersRegistry();
    user = registry.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
  }

  if (!user) {
    throw new Error('No account found with this email. Please click "Create Account" below to register.');
  }

  if (user.password !== normalizedPassword) {
    throw new Error('Incorrect password. Please check your credentials and try again.');
  }

  return {
    uid: user.uid,
    email: user.email,
    name: user.name || user.email.split('@')[0],
    role: user.role || 'user'
  };
}

async function handleGetAdminData() {
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Unauthorized access. Admin privileges required.');
  }

  const registry = await getAllUsersRegistry();
  const allUsersData = [];
  let totalFoldersCount = 0;
  let totalStylesCount = 0;

  for (const user of registry) {
    let userFolders = [];
    if (currentUser && user.uid === currentUser.uid && footerFolders && footerFolders.length > 0) {
      userFolders = footerFolders;
    } else {
      try {
        const key = getStorageKeyForUser(user);
        let stored = await figma.clientStorage.getAsync(key);
        if (!Array.isArray(stored) || stored.length === 0) {
          stored = await figma.clientStorage.getAsync(LOCAL_FOLDERS_STORAGE_KEY);
        }
        if (Array.isArray(stored) && stored.length > 0) {
          userFolders = stored;
        }

        if ((!userFolders || userFolders.length === 0) && hasConnectedDrive()) {
          let userIdxFile = await driveFindIndexFile(getUserIndexFilename(user));
          if (!userIdxFile) {
            userIdxFile = await driveFindIndexFile('assets-diary-index.json');
          }
          if (userIdxFile) {
            const text = await driveDownloadFileText(userIdxFile.id);
            if (text && text.trim()) {
              const data = JSON.parse(text);
              if (data && Array.isArray(data.folders)) {
                userFolders = data.folders;
              }
            }
          }
        }
        if ((!userFolders || userFolders.length === 0) && hasConnectedDrive()) {
          userFolders = await driveRebuildIndexFromAssetFiles();
        }
      } catch (e) {}
    }

    let userStylesCount = 0;
    userFolders.forEach(f => {
      if (f.styles && Array.isArray(f.styles)) userStylesCount += f.styles.length;
    });

    totalFoldersCount += userFolders.length;
    totalStylesCount += userStylesCount;

    allUsersData.push({
      user: {
        uid: user.uid,
        email: user.email,
        name: user.name || (user.email ? user.email.split('@')[0] : 'User'),
        role: user.role || 'user',
        createdAt: user.createdAt
      },
      folders: userFolders,
      foldersCount: userFolders.length,
      stylesCount: userStylesCount
    });
  }

  safePostMessage({
    type: 'admin-data-response',
    totalUsers: registry.length,
    totalFolders: totalFoldersCount,
    totalStyles: totalStylesCount,
    allUsersData
  });
}

async function handleAssetsDiaryMessage(msg) {
  try {
    if (!msg || !msg.type) return;

    if (msg.type === 'get-intro-copy-state') {
      const storedCount = await figma.clientStorage.getAsync(getIntroCopyDismissalKey());
      const dismissalCount = Number.isFinite(storedCount) ? storedCount : parseInt(storedCount || '0', 10);
      safePostMessage({ type: 'intro-copy-state', dismissalCount: Number.isFinite(dismissalCount) ? dismissalCount : 0, limit: INTRO_COPY_DISMISSAL_LIMIT });
      return;
    }
    if (msg.type === 'dismiss-intro-copy') {
      const dismissalKey = getIntroCopyDismissalKey();
      const storedCount = await figma.clientStorage.getAsync(dismissalKey);
      const previousCount = Number.isFinite(storedCount) ? storedCount : parseInt(storedCount || '0', 10);
      const dismissalCount = Number.isFinite(previousCount) ? Math.min(previousCount + 1, INTRO_COPY_DISMISSAL_LIMIT) : 1;
      await figma.clientStorage.setAsync(dismissalKey, dismissalCount);
      safePostMessage({ type: 'intro-copy-state', dismissalCount, limit: INTRO_COPY_DISMISSAL_LIMIT });
      return;
    }

    // License Actions
    if (msg.type === 'check-license') {
      try {
        let storedKey = await figma.clientStorage.getAsync(LICENSE_KEY_STORAGE_KEY);
        isProUser = !!(storedKey && storedKey.trim());
        safePostMessage({ type: 'license-status', active: isProUser, isPro: isProUser, key: storedKey || '' });
      } catch (e) {
        isProUser = false;
        safePostMessage({ type: 'license-status', active: false, isPro: false, key: '' });
      }
      return;
    }
    if (msg.type === 'save-license') {
      try {
        await figma.clientStorage.setAsync(LICENSE_KEY_STORAGE_KEY, msg.key);
        isProUser = true;
        safePostMessage({ type: 'license-status', active: true, isPro: true, key: msg.key });
        safePostMessage({ type: 'success', message: '✓ Pro License Activated! All limits removed.' });
      } catch (e) {}
      return;
    }
    if (msg.type === 'deactivate-license') {
      try {
        let storedKey = await figma.clientStorage.getAsync(LICENSE_KEY_STORAGE_KEY);
        let isPro = !!(storedKey && storedKey.trim());
        if (isPro) {
          safePostMessage({ type: 'license-status', active: true, isPro: true, key: storedKey });
          safePostMessage({ type: 'error', message: 'Once Pro license is activated, it cannot be deactivated.' });
        } else {
          safePostMessage({ type: 'license-status', active: false, isPro: false, key: '' });
        }
      } catch (e) {}
      return;
    }

    // Auth Actions
    if (msg.type === 'check-auth') {
      try {
        let user = null;
        const savedSession = await figma.clientStorage.getAsync(USER_SESSION_KEY);
        const fUser = getFigmaCurrentUserSafely();
        if (savedSession && savedSession.uid) {
          user = savedSession;
        } else if (fUser) {
          const isAdmin = fUser.name === 'lybonerik' || fUser.id === '1129375176527581566';
          user = {
            uid: 'figma_' + fUser.id,
            email: (fUser.name || 'user') + '@figma.user',
            name: fUser.name || 'User',
            role: isAdmin ? 'admin' : 'user'
          };
        } else {
          let localUid = await figma.clientStorage.getAsync('assets-diary-persistent-uid');
          if (!localUid) {
            localUid = 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            await figma.clientStorage.setAsync('assets-diary-persistent-uid', localUid);
          }
          user = {
            uid: localUid,
            email: 'anonymous@local.user',
            name: 'Local User',
            role: 'user'
          };
        }
        currentUser = user;
        await figma.clientStorage.setAsync(USER_SESSION_KEY, currentUser);
        await loadFooterStyles();
        safePostMessage({ type: 'auth-success', user: currentUser, folders: footerFolders });
      } catch (e) {
        console.error('[check-auth error]', e);
        await loadLocalFolders();
        safePostMessage({ type: 'auth-success', user: currentUser || { uid: 'guest', name: 'Guest' }, folders: footerFolders || [] });
      }
      return;
    }
    if (msg.type === 'auth-login') {
      const user = await authenticateUser(msg.email, msg.password);
      currentUser = user;
      footerFolders = [];
      driveConfig.indexFileId = null;
      await figma.clientStorage.setAsync(USER_SESSION_KEY, user);
      if (user.role === 'admin') {
        await figma.clientStorage.setAsync(REMEMBERED_CREDS_KEY, null);
      } else {
        await figma.clientStorage.setAsync(REMEMBERED_CREDS_KEY, { email: msg.email, password: msg.password });
      }
      await loadFooterStyles();
      safePostMessage({ type: 'auth-success', user: currentUser, folders: footerFolders });
      return;
    }
    if (msg.type === 'auth-signup') {
      const user = await registerUserInRegistry(msg.email, msg.password, msg.name);
      currentUser = { uid: user.uid, email: user.email, name: user.name, role: user.role };
      footerFolders = [];
      driveConfig.indexFileId = null;
      await figma.clientStorage.setAsync(USER_SESSION_KEY, currentUser);
      if (user.role === 'admin') {
        await figma.clientStorage.setAsync(REMEMBERED_CREDS_KEY, null);
      } else {
        await figma.clientStorage.setAsync(REMEMBERED_CREDS_KEY, { email: msg.email, password: msg.password });
      }
      await loadFooterStyles();
      safePostMessage({ type: 'auth-success', user: currentUser, folders: footerFolders });
      return;
    }
    if (msg.type === 'auth-logout') {
      const wasAdmin = currentUser && currentUser.role === 'admin';
      currentUser = null;
      footerFolders = [];
      driveConfig.indexFileId = null;
      await figma.clientStorage.setAsync(USER_SESSION_KEY, null);
      let remembered = await figma.clientStorage.getAsync(REMEMBERED_CREDS_KEY);
      if (wasAdmin || (remembered && remembered.email && remembered.email.toLowerCase() === ADMIN_EMAIL.toLowerCase())) {
        remembered = null;
        await figma.clientStorage.setAsync(REMEMBERED_CREDS_KEY, null);
      }
      safePostMessage({ type: 'auth-logout-success', rememberedCreds: remembered });
      return;
    }
    if (msg.type === 'get-admin-data') {
      await handleGetAdminData();
      return;
    }

    // App Actions
    if (msg.type === 'request-styles') {
      if (!footerFolders || footerFolders.length === 0) {
        await loadLocalFolders();
      }
      if (migrateFolderNames(footerFolders)) {
        await saveLocalFolders();
      }
      const selectedFrame = getSelectedFrameInfo();
      safePostMessage({ type: 'style-state', folders: footerFolders, user: currentUser, selectedFrame, selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!selectedFrame, driveConfig });
      return;
    }
    if (msg.type === 'sync-drive-index') {
      await loadFooterStyles();
      safePostMessage({ type: 'success', message: '✓ Scanned & restored collections from Drive!' });
      return;
    }
    if (msg.type === 'get-svg-failures') {
      try {
        const failures = (await figma.clientStorage.getAsync(SVG_IMPORT_FAILURES_KEY)) || [];
        safePostMessage({ type: 'svg-failures-list', failures });
      } catch (e) {
        safePostMessage({ type: 'svg-failures-list', failures: [] });
      }
      return;
    }
    if (msg.type === 'create-folder') {
      console.log('[BACKEND] Received create-folder message:', msg);
      await createFolder(msg.name || 'New Folder');
      return;
    }
    if (msg.type === 'delete-folder') {
      const id = msg.folderId;
      const idx = footerFolders.findIndex(f => f.folderId === id);
      if (idx !== -1) {
        const folder = footerFolders[idx];
        footerFolders.splice(idx, 1);
        
        await loadLocalTrash();
        trashItems.push({
          trashId: 'trash_folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          itemType: 'folder',
          data: folder,
          deletedAt: Date.now()
        });
        await saveLocalTrash();
        await saveLocalFolders();

        const selectedFrame = getSelectedFrameInfo();
        safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame, selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!selectedFrame, driveConfig });
        safePostMessage({ type: 'success', message: '✓ Moved collection to Trashcan!' });

        if (hasConnectedDrive()) {
          (async () => {
            try {
              await ensureDriveAccessToken();
              await driveSaveIndex();
            } catch (e) {}
          })();
        }
      }
      return;
    }
    if (msg.type === 'delete-folders-batch') {
      const idsToDelete = new Set(msg.folderIds || []);
      await loadLocalTrash();
      footerFolders = footerFolders.filter(f => {
        if (idsToDelete.has(f.folderId)) {
          trashItems.push({
            trashId: 'trash_folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            itemType: 'folder',
            data: f,
            deletedAt: Date.now()
          });
          return false;
        }
        return true;
      });

      await saveLocalTrash();
      await saveLocalFolders();
      const selectedFrame = getSelectedFrameInfo();
      safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame, selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!selectedFrame, driveConfig });
      safePostMessage({ type: 'success', message: `✓ Moved ${idsToDelete.size} collection(s) to Trashcan.` });
      if (hasConnectedDrive()) {
        (async () => {
          try {
            await ensureDriveAccessToken();
            await driveSaveIndex();
          } catch (e) {}
        })();
      }
      return;
    }
    if (msg.type === 'get-trash-items') {
      const items = await loadLocalTrash();
      safePostMessage({ type: 'trash-items-list', items });
      return;
    }
    if (msg.type === 'restore-trash-item') {
      await loadLocalTrash();
      const trashId = msg.trashId;
      const idx = trashItems.findIndex(t => t.trashId === trashId);
      if (idx !== -1) {
        const item = trashItems[idx];
        if (item.itemType === 'folder') {
          const existingIdx = footerFolders.findIndex(f => f.folderId === item.data.folderId);
          if (existingIdx !== -1) {
            footerFolders[existingIdx] = item.data;
          } else {
            footerFolders.push(item.data);
          }
        } else if (item.itemType === 'style') {
          let targetFolder = footerFolders.find(f => f.folderId === item.originalFolderId);
          if (!targetFolder) {
            targetFolder = footerFolders.find(f => f.name === 'Restored Items');
            if (!targetFolder) {
              targetFolder = {
                folderId: 'folder_restored_' + Date.now(),
                name: 'Restored Items',
                styles: []
              };
              footerFolders.push(targetFolder);
            }
          }
          if (!targetFolder.styles.some(s => s.styleId === item.data.styleId)) {
            targetFolder.styles.push(item.data);
          }
        }

        trashItems.splice(idx, 1);
        await saveLocalTrash();
        await saveLocalFolders();

        // Synchronously save updated index to Google Drive so driveLoadIndex doesn't overwrite restored items
        if (hasConnectedDrive()) {
          try {
            await ensureDriveAccessToken();
            await driveSaveIndex();
          } catch (e) {}
        }

        safePostMessage({ type: 'trash-items-list', items: trashItems });
        safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame: getSelectedFrameInfo(), selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!getSelectedFrameInfo(), driveConfig });
        safePostMessage({ type: 'success', message: '✓ Restored item from Trashcan!' });
      }
      return;
    }
    if (msg.type === 'empty-trash') {
      await loadLocalTrash();
      trashItems = [];
      await saveLocalTrash();
      safePostMessage({ type: 'trash-items-list', items: trashItems });
      safePostMessage({ type: 'success', message: '✓ Trashcan emptied.' });
      return;
    }
    if (msg.type === 'set-starter-template') {
      await saveStarterTemplate(footerFolders);
      safePostMessage({ type: 'success', message: '✓ Current collections saved as Default Template for new users!' });
      return;
    }
    if (msg.type === 'clear-starter-template') {
      await figma.clientStorage.setAsync(STARTER_TEMPLATE_STORAGE_KEY, null);
      safePostMessage({ type: 'success', message: '✓ Starter Template cleared.' });
      return;
    }
    if (msg.type === 'export-backup' || msg.type === 'import-backup') {
      if (!isProUser) {
        safePostMessage({
          type: 'pro-limit-reached',
          limitType: 'json-backup',
          message: '⚠️ Offline JSON Backup is a Pro feature. Upgrade to Pro to unlock!'
        });
        return;
      }
    }
    if (msg.type === 'export-backup') {
      const payload = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        user: currentUser ? currentUser.email : 'local',
        folders: footerFolders,
        trash: trashItems
      };
      safePostMessage({ type: 'export-backup-data', payload });
      return;
    }
    if (msg.type === 'import-backup') {
      if (Array.isArray(msg.folders) && msg.folders.length > 0) {
        footerFolders = sanitizeFolders(msg.folders);
        await saveLocalFolders();
      }
      if (Array.isArray(msg.trash) && msg.trash.length > 0) {
        trashItems = msg.trash;
        await saveLocalTrash();
      }
      safePostMessage({ type: 'style-state', folders: footerFolders, user: currentUser, selectedFrame: getSelectedFrameInfo(), selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!getSelectedFrameInfo(), driveConfig });
      safePostMessage({ type: 'success', message: '✓ Backup restored successfully!' });
      return;
    }
    if (msg.type === 'delete-trash-permanently') {
      await loadLocalTrash();
      trashItems = trashItems.filter(t => t.trashId !== msg.trashId);
      await saveLocalTrash();
      safePostMessage({ type: 'trash-items-list', items: trashItems });
      safePostMessage({ type: 'success', message: '✓ Permanently deleted from Trashcan.' });
      return;
    }
    if (msg.type === 'rename-folder') {
      const id = msg.folderId;
      const newName = msg.newName || '';
      const folder = getFolderById(id);
      if (folder) {
        folder.name = newName || folder.name;
        await saveLocalFolders();
        const selectedFrame = getSelectedFrameInfo();
        safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame, selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!selectedFrame, driveConfig });
        if (hasConnectedDrive()) {
          (async () => {
            try {
              await ensureDriveAccessToken();
              await driveSaveIndex();
            } catch (e) {}
          })();
        }
      }
      return;
    }
    if (msg.type === 'rename-style') {
      const folderId = msg.folderId;
      const styleId = msg.styleId;
      const newTitle = msg.newName || msg.newTitle || msg.title || '';
      let style = getStyle(folderId, styleId);
      if (!style && Array.isArray(footerFolders)) {
        for (const folder of footerFolders) {
          if (folder && folder.styles) {
            const found = folder.styles.find(s => s.styleId === styleId);
            if (found) { style = found; break; }
          }
        }
      }
      if (style && newTitle.trim()) {
        style.title = newTitle.trim();
        await saveLocalFolders();
        const selectedFrame = getSelectedFrameInfo();
        safePostMessage({ type: 'style-state', folders: footerFolders, selectedFrame, selectedFrames: getSelectedFramesInfo(), canAddSelectedFrame: !!getSelectedFrameInfo(), driveConfig });
        safePostMessage({ type: 'success', message: '✓ Frame renamed!' });

        const isCustomDrive = driveConfig.refreshToken && driveConfig.refreshToken !== DEFAULT_REFRESH_TOKEN;
        if (isCustomDrive) {
          (async () => {
            try {
              await ensureDriveAccessToken();
              await driveSaveIndex();
            } catch (e) {}
          })();
        }
      }
      return;
    }
    if (msg.type === 'add-selected-footer' || msg.type === 'add-selected-footers') {
      if (msg.driveToken) driveConfig.token = normalizeDriveToken(msg.driveToken);
      if (msg.refreshToken) driveConfig.refreshToken = msg.refreshToken.trim();
      if (msg.clientId) driveConfig.clientId = msg.clientId.trim();
      if (msg.clientSecret) driveConfig.clientSecret = msg.clientSecret.trim();
      driveConfig.folderId = driveConfig.folderId || null;
      if (msg.type === 'add-selected-footer') await saveSelectedFrameAsStyle(msg.folderId);
      else await saveSelectedFramesAsStyles(msg.folderId);
      return;
    }
    if (msg.type === 'connect-drive') {
      driveConfig.folderId = driveConfig.folderId || null;
      if (msg.driveToken) driveConfig.token = normalizeDriveToken(msg.driveToken);
      else driveConfig.token = null;
      if (msg.refreshToken) driveConfig.refreshToken = msg.refreshToken.trim();
      if (msg.clientId) driveConfig.clientId = msg.clientId.trim();
      if (msg.clientSecret) driveConfig.clientSecret = msg.clientSecret.trim();
      driveConfig.rememberDriveSettings = !!msg.rememberDriveSettings;
      driveConfig.rememberToken = !!msg.rememberToken;
      driveConfig.rememberRefreshToken = !!msg.rememberRefreshToken;
      driveConfig.rememberClientId = !!msg.rememberClientId;
      driveConfig.rememberClientSecret = !!msg.rememberClientSecret;
      try {
        await ensureDriveAccessToken();
        await driveLoadIndex();
        if (driveConfig.rememberDriveSettings) await saveDriveSettings();
        await loadFooterStyles();
        safePostMessage({ type: 'drive-connected', driveConfig });
      } catch (err) {
        safePostMessage({ type: 'error', message: String(err) });
      }
      return;
    }
    if (msg.type === 'preview') {
      await previewStyle(msg.folderId, msg.styleId);
      return;
    }
    if (msg.type === 'generate') {
      const styleIds = (msg.styleIds && msg.styleIds.length > 0)
        ? msg.styleIds
        : (msg.styleId ? [msg.styleId] : []);
      await generateSavedCaptures(msg.folderId, styleIds);
      return;
    }
    if (msg.type === 'delete-footer-style') {
      await deleteFooterStyle(msg.folderId, msg.styleId);
      return;
    }
    if (msg.type === 'delete-multiple-styles') {
      await deleteMultipleFooterStyles(msg.folderId, msg.styleIds);
      return;
    }
    safePostMessage({ type: 'error', message: 'Unhandled message type: ' + msg.type });
  } catch (err) {
    safePostMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};

// Throttled selectionchange listener (300ms debounce): Zero lag during active canvas dragging
let selectionTimer = null;
figma.on('selectionchange', () => {
  if (currentPluginView !== 'assets_diary') return;
  if (selectionTimer) clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    const selInfo = getSelectedFramesInfo();
    const firstFrame = selInfo.length === 1 ? selInfo[0] : (selInfo.length > 0 ? selInfo[0] : null);
    safePostMessage({
      type: 'selection-state',
      selectedFrame: firstFrame,
      selectedFrames: selInfo,
      canAddSelectedFrame: selInfo.length > 0
    });
  }, 300);
});

// Initialize: load stored user session and user collections
async function initAssetsDiarySession() {
  try {
    let user = null;
    const fUser = getFigmaCurrentUserSafely();
    if (fUser) {
      const isAdmin = fUser.name === 'lybonerik' || fUser.id === '1129375176527581566';
      user = {
        uid: 'figma_' + fUser.id,
        email: (fUser.name || 'user') + '@figma.user',
        name: fUser.name || 'User',
        role: isAdmin ? 'admin' : 'user'
      };
    } else {
      let localUid = await figma.clientStorage.getAsync('assets-diary-persistent-uid');
      if (!localUid) {
        localUid = 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await figma.clientStorage.setAsync('assets-diary-persistent-uid', localUid);
      }
      user = {
        uid: localUid,
        email: 'anonymous@local.user',
        name: 'Local User',
        role: 'user'
      };
    }
    currentUser = user;
    await figma.clientStorage.setAsync(USER_SESSION_KEY, currentUser);
  } catch (e) {}
  safePostMessage({ type: 'user-info', user: currentUser });
  await loadFooterStyles();
  try {
    const items = await loadLocalTrash();
    safePostMessage({ type: 'trash-items-list', items });
  } catch (e) {}
}
