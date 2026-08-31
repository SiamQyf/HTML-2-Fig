# ⚡ HTML 2 Fig (HTML to Figma)

> **Convert any live webpage into fully editable, pixel-accurate native Figma layers, Auto-Layout frames, typography, and vectors in seconds.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-success.svg)](packages/chrome-extension)
[![Figma Plugin API](https://img.shields.io/badge/Figma%20Plugin-API%201.0-purple.svg)](packages/figma-plugin)

---

## 🌟 Key Features

* 🚀 **Full Page & Element Capture**: Traverses live DOM hierarchies, computed styles, responsive viewports, and CSS layouts.
* 🎨 **Pixel-Accurate Figma Layers**:
  * **Auto-Layout conversion**: Maps CSS Flexbox (`flex-direction`, `gap`, `justify-content`, `align-items`, `flex-wrap`) directly to Figma Auto-Layout.
  * **Images & Modern Formats**: Automatic rasterization of AVIF, WebP, SVG, Canvas, and Base64 into Figma-supported PNG/JPEG image fills.
  * **SVG Vector Imports**: Parses inline and embedded SVGs directly into native vector node shapes.
  * **Typography & Fonts**: Automatic font loading with fallback mapping, handling `lineHeight`, `letterSpacing`, `fontStyle`, and `textTransform`.
  * **Pseudo-Elements**: Accurately renders `::before` and `::after` content and decorative styling.
  * **Effects & Styling**: Background gradients (`linear-gradient`, `radial-gradient`), box shadows, border radiuses, and opacities.
* 🛡️ **Sandbox-Resistant Paste Fallback**: Handles browser clipboard API permissions gracefully with dual automated and manual paste modes.

---

## 📁 Repository Structure

```
HTML-2-Fig/
├── packages/
│   ├── chrome-extension/         # Chrome MV3 Extension (Capture Engine)
│   │   ├── manifest.json
│   │   ├── background.js         # Service worker & tab script injector
│   │   ├── capture.js            # DOM crawler, style extractor & asset encoder
│   │   └── icons/                # Extension toolbar & store icons
│   │
│   ├── figma-plugin/             # Figma Plugin (Canvas Builder)
│   │   ├── manifest.json         # Figma plugin manifest
│   │   ├── code.js               # Canvas tree generator & layout builder
│   │   └── ui.html               # Plugin dark-mode UI with clipboard bridge
│   │
│   └── shared/                   # Shared types, protocols & constants
│       ├── types.d.ts
│       └── constants.js
│
├── README.md
├── package.json
└── LICENSE
```

---

## 🚀 Getting Started

### 1. Install the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `packages/chrome-extension` directory from this repository.

### 2. Install the Figma Plugin
1. Open the **Figma Desktop** application.
2. Open any design file.
3. Navigate to **Plugins** → **Development** → **Import plugin from manifest...**.
4. Select `packages/figma-plugin/manifest.json`.

---

## 📖 How to Use

1. **Capture Webpage**:
   - Open any webpage in Chrome.
   - Click the **HTML 2 Fig** extension icon in your Chrome toolbar.
   - Wait for the capture toast notification (`✅ Captured!`).
2. **Import into Figma**:
   - In Figma, launch **Plugins** → **Development** → **HTML 2 Fig**.
   - Click **Import from Clipboard** (or paste with <kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd> into the paste box).
   - Your webpage is instantly generated as editable Figma layers on the canvas!

---

## 🛠️ Development & Building

```bash
# Clone the repository
git clone https://github.com/SiamQyf/HTML-2-Fig.git
cd HTML-2-Fig

# Install dependencies (if needed)
npm install
```

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more details.
