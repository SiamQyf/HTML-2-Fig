/**
 * Universal Diagnostic Engine for HTML-to-Figma Payloads
 * Supports all extension payload formats (frame-based, node-tree, childNodes, attributes/attr)
 *
 * Checks 6 Universal Visual Invariants:
 *  1. UNRESOLVED_INVIEWPORT_STYLE (animated styleIn background colors left unapplied)
 *  2. BURIED_OVERLAY (gradient/fading overlays rendered underneath photos/media)
 *  3. LAZY_PLACEHOLDER_IMAGE (tiny or placeholder src with rich data-src)
 *  4. INVISIBLE_TEXT (white/light text with transparent or missing background)
 *  5. STAIRCASE_HEADLINE (inline text fragments breaking into stepped diagonals)
 *  6. WARPED_PARALLAX_CONTAINER (containers inflated beyond content bounds)
 */

function parseRgba(colorStr) {
  if (!colorStr) return null;
  const s = String(colorStr).trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const mRgba = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (mRgba) {
    return {
      r: parseFloat(mRgba[1]),
      g: parseFloat(mRgba[2]),
      b: parseFloat(mRgba[3]),
      a: mRgba[4] !== undefined ? parseFloat(mRgba[4]) : 1
    };
  }
  const mHex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (mHex) {
    let hex = mHex[1];
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      };
    }
  }
  return null;
}

function getLuminance(rgb) {
  if (!rgb) return 1;
  const a = [rgb.r, rgb.g, rgb.b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function normalizeNode(node) {
  if (!node) return null;
  const tag = (node.tag || node.tagName || '').toLowerCase();
  let classes = '';
  if (Array.isArray(node.classList)) {
    classes = node.classList.join(' ');
  } else if (typeof node.className === 'string') {
    classes = node.className;
  } else if (node.classes) {
    classes = Array.isArray(node.classes) ? node.classes.join(' ') : String(node.classes);
  }

  const attrs = node.attr || node.attributes || node.attrs || {};
  const styles = node.styles || node.style || node.computedStyle || {};
  const children = node.children || node.childNodes || [];
  const bounds = node.rect || node.bounds || {
    x: node.x || 0,
    y: node.y || 0,
    width: node.width || 0,
    height: node.height || 0
  };

  let text = '';
  if (node.text !== undefined) text = String(node.text);
  else if (node.textContent !== undefined) text = String(node.textContent);
  else if (node.characters !== undefined) text = String(node.characters);
  else if (node.textValue !== undefined) text = String(node.textValue);

  return {
    raw: node,
    id: node.id || node.refId,
    tag,
    classes,
    attrs,
    styles,
    children,
    bounds,
    text
  };
}

function isElementFadeOverlay(c) {
  if (!c) return false;
  const cBg = c.styles.backgroundImage || c.styles['background-image'] || '';
  const parsedBg = parseRgba(c.styles.backgroundColor || c.styles['background-color']);
  const hasSemiTransparentBg = parsedBg && parsedBg.a > 0.05 && parsedBg.a < 0.98;
  const hasOpacity = c.styles.opacity !== undefined && parseFloat(c.styles.opacity) > 0.05 && parseFloat(c.styles.opacity) < 0.98;

  return /gradient|overlay|fade|mask/i.test(c.classes) ||
         /linear-gradient|radial-gradient/i.test(cBg) ||
         (c.styles.position === 'absolute' && (hasOpacity || hasSemiTransparentBg));
}

function auditPayload(payload) {
  const issues = [];
  const stats = {
    totalNodes: 0,
    textNodes: 0,
    imageNodes: 0,
    overlayNodes: 0,
    animatedSections: 0
  };

  const rootCandidate = payload.frame || payload.doc || payload.nodes || payload;

  function traverse(rawNode, ancestors = []) {
    if (!rawNode) return;
    stats.totalNodes++;

    const n = normalizeNode(rawNode);
    if (!n) return;

    // 1. Audit: In-Viewport Animated Styles
    const pluginOptions = n.attrs['data-plugin-options'] || n.attrs['data-inviewport-style'] || '';
    if (pluginOptions && /styleIn/i.test(pluginOptions)) {
      stats.animatedSections++;
      let targetColor = null;
      try {
        const parsed = typeof pluginOptions === 'string' ? JSON.parse(pluginOptions) : pluginOptions;
        if (parsed && parsed.styleIn && parsed.styleIn['background-color']) {
          targetColor = parsed.styleIn['background-color'];
        }
      } catch (e) {
        const match = pluginOptions.match(/["']?background-color["']?\s*:\s*["']([^"']+)["']/i);
        if (match) targetColor = match[1];
      }

      const currentBg = n.styles.backgroundColor || n.styles['background-color'] || '';
      const parsedCurrent = parseRgba(currentBg);
      const isCurrentTransparent = !parsedCurrent || parsedCurrent.a === 0 || currentBg === 'transparent';

      if (targetColor && isCurrentTransparent) {
        issues.push({
          id: n.id || 'node-' + stats.totalNodes,
          type: 'UNRESOLVED_INVIEWPORT_STYLE',
          severity: 'CRITICAL',
          selector: `${n.tag}.${n.classes.replace(/\s+/g, '.')}`,
          message: `Section has animated styleIn background "${targetColor}", but static capture background is transparent. Children white text will render invisible!`,
          details: {
            pluginOptions,
            targetColor,
            currentBg
          },
          autoFixAvailable: true
        });
      }
    }

    // 2. Audit: Buried Gradient / Fade Overlays
    const children = n.children;
    if (children && children.length > 1) {
      let mediaIndices = [];
      let overlayIndices = [];

      children.forEach((cRaw, idx) => {
        const c = normalizeNode(cRaw);
        if (!c) return;

        const isMedia = c.tag === 'img' || c.tag === 'video' || /thumb|image|photo|slide/i.test(c.classes);
        const isFadeOverlay = isElementFadeOverlay(c);

        if (isMedia) mediaIndices.push(idx);
        if (isFadeOverlay) overlayIndices.push({ index: idx, node: c });
      });

      overlayIndices.forEach(ov => {
        // If an overlay is placed BEFORE media in children array, Figma paints media on top!
        const trappedBelowMedia = mediaIndices.some(mIdx => mIdx > ov.index);
        if (trappedBelowMedia) {
          issues.push({
            id: ov.node.id || 'node-' + ov.index,
            type: 'BURIED_OVERLAY',
            severity: 'CRITICAL',
            selector: `${ov.node.tag}.${ov.node.classes.replace(/\s+/g, '.')}`,
            message: `Gradient/fading overlay at index ${ov.index} is ordered UNDERNEATH image/media (Figma layer inversion). The dark fade will be completely buried!`,
            details: {
              overlayIndex: ov.index,
              mediaIndices
            },
            autoFixAvailable: true
          });
        }
      });
    }

    // 3. Audit: Lazy Loaded Placeholders
    if (n.tag === 'img') {
      stats.imageNodes++;
      const src = n.raw.src || n.attrs.src || '';
      const dataSrc = n.attrs['data-src'] || n.attrs['data-lazy-src'] || n.attrs['data-original'] || '';
      const isPlaceholder = /placeholder|blank\.gif|data:image\/svg\+xml|100x126/i.test(src);

      if (isPlaceholder && dataSrc) {
        issues.push({
          id: n.id || 'img-' + stats.totalNodes,
          type: 'LAZY_PLACEHOLDER_IMAGE',
          severity: 'HIGH',
          selector: `img[src*="${src.slice(0, 30)}"]`,
          message: `Image uses low-res placeholder "${src}", while crisp asset exists in data-src "${dataSrc}".`,
          details: { src, dataSrc },
          autoFixAvailable: true
        });
      }
    }

    // 4. Audit: Invisible Text Contrast
    const textContent = n.text.trim();
    if (textContent.length > 0) {
      stats.textNodes++;
      const textColor = parseRgba(n.styles.color || '#000000');
      if (textColor && textColor.a > 0.5) {
        const textLum = getLuminance(textColor);
        if (textLum > 0.7) { // Very light / white text
          let hasDarkBg = false;
          let effectiveBg = null;

          for (let i = ancestors.length - 1; i >= 0; i--) {
            const anc = ancestors[i];
            const ancBg = anc.styles.backgroundColor || anc.styles['background-color'] || '';
            const parsedBg = parseRgba(ancBg);
            if (parsedBg && parsedBg.a > 0.4) {
              effectiveBg = parsedBg;
              const bgLum = getLuminance(parsedBg);
              if (bgLum < 0.5) {
                hasDarkBg = true;
                break;
              }
            }
          }

          if (!hasDarkBg) {
            issues.push({
              id: n.id || 'text-' + stats.totalNodes,
              type: 'INVISIBLE_TEXT',
              severity: 'CRITICAL',
              selector: `${n.tag}: "${textContent.slice(0, 35)}..."`,
              message: `White or light text (${n.styles.color || '#fff'}) placed without an underlying dark container background. Will render invisible white-on-white!`,
              details: {
                text: textContent.slice(0, 50),
                color: n.styles.color,
                effectiveBg: effectiveBg ? `rgba(${effectiveBg.r},${effectiveBg.g},${effectiveBg.b},${effectiveBg.a})` : 'transparent'
              },
              autoFixAvailable: true
            });
          }
        }
      }
    }

    // 5. Audit: Headline Staircase Stepping
    if (/^h[1-6]$/i.test(n.tag) || /headline|title|heading/i.test(n.classes)) {
      if (children.length > 1) {
        const inlineSpans = children.map(c => normalizeNode(c)).filter(c => c && (c.tag === 'span' || c.tag === 'strong' || c.tag === 'a'));
        if (inlineSpans.length > 1) {
          let hasStepping = false;
          for (let i = 1; i < inlineSpans.length; i++) {
            const prev = inlineSpans[i - 1].bounds;
            const curr = inlineSpans[i].bounds;
            if (prev.y !== undefined && curr.y !== undefined && Math.abs(curr.y - prev.y) > 10) {
              if (curr.x > prev.x + 20) {
                hasStepping = true;
                break;
              }
            }
          }
          if (hasStepping) {
            issues.push({
              id: n.id || 'heading-' + stats.totalNodes,
              type: 'STAIRCASE_HEADLINE',
              severity: 'HIGH',
              selector: `${n.tag}.${n.classes.replace(/\s+/g, '.')}`,
              message: `Multi-line heading spans break into diagonal staircase layout due to fractured inline position offsets.`,
              details: { spanCount: inlineSpans.length },
              autoFixAvailable: true
            });
          }
        }
      }
    }

    // 6. Audit: Parallax / Full Page Warp
    const isParallax = n.attrs['data-plugin-parallax'] || /parallax/i.test(n.classes);
    if (isParallax && n.bounds.height > 2000) {
      issues.push({
        id: n.id || 'parallax-' + stats.totalNodes,
        type: 'WARPED_PARALLAX_CONTAINER',
        severity: 'MEDIUM',
        selector: `${n.tag}.${n.classes.replace(/\s+/g, '.')}`,
        message: `Parallax container bounds inflated to ${n.bounds.height}px (likely full viewport height bleed).`,
        details: { height: n.bounds.height },
        autoFixAvailable: true
      });
    }

    // Recurse
    ancestors.push(n);
    for (const child of children) {
      traverse(child, ancestors);
    }
    ancestors.pop();
  }

  if (Array.isArray(rootCandidate)) {
    rootCandidate.forEach(n => traverse(n, []));
  } else {
    traverse(rootCandidate, []);
  }

  return {
    timestamp: new Date().toISOString(),
    stats,
    issuesCount: issues.length,
    criticalCount: issues.filter(i => i.severity === 'CRITICAL').length,
    highCount: issues.filter(i => i.severity === 'HIGH').length,
    mediumCount: issues.filter(i => i.severity === 'MEDIUM').length,
    issues
  };
}

module.exports = {
  auditPayload,
  normalizeNode,
  isElementFadeOverlay,
  parseRgba,
  getLuminance
};
