# 🚀 Chrome Web Store Publishing Guide

This guide contains everything you need to publish **HTML To Perfect Figma Capture** on the Google Chrome Web Store.

---

## 1. Quick Build & Zip
Whenever you are ready to upload or update the extension, run:
```bash
npm run build:webstore
```
This generates the compliant, clean archive:
👉 **`dist/html-to-figma-chrome-extension.zip`**

---

## 2. Google Chrome Developer Dashboard Steps

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with your Google account (a one-time $5 developer registration fee applies if you haven't registered before).
3. Click **"New Item"** in the top right.
4. Drag and drop **`dist/html-to-figma-chrome-extension.zip`**.

---

## 3. Copy-Paste Store Listing Metadata

### Extension Name
```
HTML To Perfect Figma Capture
```

### Short Description (Under 132 characters)
```
Capture any webpage into pixel-accurate Figma layers, Auto-Layout, SVGs, and fonts with one click.
```

### Detailed Description
```markdown
Convert any live webpage into fully editable, pixel-accurate native Figma layers in seconds.

⚡ KEY CAPABILITIES:
• One-Click Full Page Capture: Automatically crawls live DOM hierarchies, computed CSS styles, and responsive viewports.
• Native Figma Auto-Layout: Translates CSS Flexbox and Grid layouts directly into Figma Auto-Layout frames.
• Vector & SVG Extraction: Preserves sharp vector icons and SVGs as native Figma vector paths.
• Typography & Font Fidelity: Accurate font families, weights, letter-spacing, line-heights, and fallbacks.
• Canvas & 3D WebGL Preservation: Retains shaders and 3D canvas buffers without blank images.
• Seamless Figma Plugin Companion: Paste directly (Ctrl+V / ⌘V) into the HTML To Perfect Figma plugin to paint onto your canvas.

🔒 100% PRIVATE & LOCAL:
• All DOM analysis and styling serialization occur locally on your machine.
• Zero data transmission to external servers. No ads, tracking, or personal data collection.
```

### Category
* **Developer Tools** (or **Productivity**)

---

## 4. Privacy Practices Tab (Mandatory for Approval)

### Single Purpose Description
```
To inspect DOM structures, computed styles, fonts, and assets of active web pages and serialize them into a clipboard payload for conversion into Figma canvas layers.
```

### Permission Justifications (Copy & Paste)

* **`activeTab`**:
  > "Used to access the currently active tab when the user clicks 'Capture Page' or the toolbar icon to initiate DOM capture."

* **`scripting`**:
  > "Used to inject the capture engine, font decoders, and canvas WebGL buffer hooks into the target page to serialize styling and layout."

* **`clipboardWrite`**:
  > "Required to copy the serialized Figma HyperNodes data to the user's system clipboard so they can paste directly into the Figma canvas plugin."

* **`storage`**:
  > "Used to store local user preferences within the extension popup."

* **Host Permissions (`<all_urls>`)**:
  > "Required so users can capture and convert any public or development webpage across the web into Figma design layers, including cross-origin iframes and embedded media."

### Data Usage Declarations
* Select: **"No, I am not collecting or using any user data."**
* Certify that your extension complies with the Developer Program Policies.

### Privacy Policy URL
Enter the URL to your hosted `PRIVACY_POLICY.md` on GitHub:
```
https://github.com/SiamQyf/HTML-2-Fig/blob/Final/PRIVACY_POLICY.md
```

---

## 5. Visual Assets Required by Google
* **Store Icon:** 128x128 PNG (included in `packages/chrome-extension/icons/icon128.png`).
* **Screenshots:** At least 1 screenshot (1280x800 or 640x400 PNG/JPEG) showing the extension popup or a capture in progress.
* **Small Promo Tile (Optional):** 440x280 PNG.

---

## 6. Submit for Review
Click **"Submit for Review"**. Automated review typically takes between a few hours to 2 business days. Once approved, your extension will be live on the Chrome Web Store!
