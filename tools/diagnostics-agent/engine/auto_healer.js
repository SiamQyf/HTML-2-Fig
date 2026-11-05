/**
 * Autonomous Healing Engine for HTML-to-Figma Payloads
 * Automatically cures identified invariants:
 *  - Elevates buried overlays so they render above images/media in Figma
 *  - Resolves animated in-viewport styleIn backgrounds
 *  - Restores crisp images from data-src / lazy attributes
 *  - Unifies fragmented heading baselines to prevent diagonal staircases
 */

const { normalizeNode, isElementFadeOverlay } = require('./analyzer');

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function healPayload(rawPayload) {
  const payload = deepClone(rawPayload);
  const fixesApplied = [];

  const rootCandidate = payload.frame || payload.doc || payload.nodes || payload;

  function healNode(rawNode) {
    if (!rawNode) return;

    const n = normalizeNode(rawNode);
    if (!n) return;

    // Fix 1: In-viewport styleIn dynamic background restoration
    const pluginOptions = n.attrs['data-plugin-options'] || n.attrs['data-inviewport-style'] || '';
    if (pluginOptions && /styleIn/i.test(pluginOptions)) {
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

      if (targetColor) {
        if (!rawNode.styles) rawNode.styles = {};
        rawNode.styles.backgroundColor = targetColor;
        rawNode.styles['background-color'] = targetColor;
        if (rawNode.style) {
          rawNode.style.backgroundColor = targetColor;
          rawNode.style['background-color'] = targetColor;
        }
        fixesApplied.push({
          type: 'INVIEWPORT_STYLE_HEALED',
          target: `${n.tag}.${n.classes.replace(/\s+/g, '.')}`,
          action: `Applied animated styleIn background color "${targetColor}". White text will now be visible.`
        });
      }
    }

    // Fix 2: Lazy image placeholder resolution
    if (n.tag === 'img') {
      const src = rawNode.src || n.attrs.src || '';
      const dataSrc = n.attrs['data-src'] || n.attrs['data-lazy-src'] || n.attrs['data-original'] || '';
      if (dataSrc && /placeholder|blank\.gif|data:image\/svg\+xml|100x126/i.test(src)) {
        rawNode.src = dataSrc;
        if (rawNode.attr) rawNode.attr.src = dataSrc;
        if (rawNode.attributes) rawNode.attributes.src = dataSrc;
        fixesApplied.push({
          type: 'LAZY_IMAGE_RESOLVED',
          target: `img[src="${dataSrc.slice(0, 40)}..."]`,
          action: `Replaced low-res placeholder image with full-resolution data-src.`
        });
      }
    }

    // Fix 3: Stacking order repair for buried gradient/fade overlays
    const rawChildren = rawNode.children || rawNode.childNodes;
    if (rawChildren && rawChildren.length > 1) {
      let hasMedia = false;
      let hasOverlay = false;

      rawChildren.forEach(cRaw => {
        const c = normalizeNode(cRaw);
        if (!c) return;

        const isMedia = c.tag === 'img' || c.tag === 'video' || /thumb|image|photo|slide/i.test(c.classes);
        const isOverlay = isElementFadeOverlay(c);

        if (isMedia) hasMedia = true;
        if (isOverlay) hasOverlay = true;
      });

      if (hasMedia && hasOverlay) {
        const nonOverlays = [];
        const overlays = [];

        rawChildren.forEach(cRaw => {
          const c = normalizeNode(cRaw);
          const isOverlay = isElementFadeOverlay(c);

          if (isOverlay) {
            overlays.push(cRaw);
          } else {
            nonOverlays.push(cRaw);
          }
        });

        // Reassemble: nonOverlays first, overlays on top!
        if (rawNode.children) {
          rawNode.children = [...nonOverlays, ...overlays];
        } else if (rawNode.childNodes) {
          rawNode.childNodes = [...nonOverlays, ...overlays];
        }

        fixesApplied.push({
          type: 'BURIED_OVERLAY_ELEVATED',
          target: `${n.tag}.${n.classes.replace(/\s+/g, '.')}`,
          action: `Elevated ${overlays.length} fading/gradient overlay(s) above image layer stack for native Figma rendering.`
        });
      }
    }

    // Fix 4: Heading diagonal staircase alignment
    if (/^h[1-6]$/i.test(n.tag) || /headline|title|heading/i.test(n.classes)) {
      if (rawChildren && rawChildren.length > 1) {
        const inlineSpans = rawChildren.map(c => ({ raw: c, norm: normalizeNode(c) }))
                                       .filter(x => x.norm && (x.norm.tag === 'span' || x.norm.tag === 'strong' || x.norm.tag === 'a'));
        if (inlineSpans.length > 1) {
          const firstX = inlineSpans[0].norm.bounds ? inlineSpans[0].norm.bounds.x : null;
          if (firstX !== null) {
            inlineSpans.forEach((sp, idx) => {
              if (idx > 0 && sp.norm.bounds) {
                const prev = inlineSpans[idx - 1].norm;
                if (prev.bounds && Math.abs(sp.norm.bounds.y - prev.bounds.y) > 10) {
                  if (sp.raw.rect) sp.raw.rect.x = firstX;
                  if (sp.raw.bounds) sp.raw.bounds.x = firstX;
                  if (sp.raw.x !== undefined) sp.raw.x = firstX;
                  fixesApplied.push({
                    type: 'STAIRCASE_HEADLINE_ALIGNED',
                    target: `${n.tag} child span ${idx}`,
                    action: `Aligned multiline headline span back to starting column (x=${firstX}px) to eliminate diagonal step.`
                  });
                }
              }
            });
          }
        }
      }
    }

    // Recurse children
    if (rawChildren) {
      for (const child of rawChildren) {
        healNode(child);
      }
    }
  }

  if (Array.isArray(rootCandidate)) {
    rootCandidate.forEach(n => healNode(n));
  } else {
    healNode(rootCandidate);
  }

  return {
    healedPayload: payload,
    fixesApplied,
    fixesCount: fixesApplied.length
  };
}

module.exports = {
  healPayload
};
