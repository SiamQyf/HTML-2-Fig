# Privacy Policy for HTML To Perfect Figma Capture

**Last updated:** October 3, 2026

## Overview
**HTML To Perfect Figma Capture** ("we", "our", or "the extension") is a productivity tool designed to capture webpage elements, styles, fonts, and vector graphics to convert them into native, editable Figma layers.

We are deeply committed to protecting your privacy. This Privacy Policy explains our data collection and usage practices in compliance with Google Chrome Web Store Developer Program Policies.

---

## 1. Single Purpose
The single purpose of HTML To Perfect Figma Capture is to inspect DOM structures, computed CSS, fonts, and images of active webpages and serialize them into a JSON format written to the user's system clipboard for pasting into the companion Figma plugin.

---

## 2. Data Collection and Usage
* **No Personal Data Collected:** We do NOT collect, harvest, log, or transmit any personally identifiable information (PII), such as names, email addresses, passwords, IP addresses, or browsing history.
* **No Server Transmission:** All DOM traversal, styling extraction, and asset parsing are performed **100% locally on your device** inside your web browser. No webpage content or captured data is ever sent to our servers or any third-party analytics servers.
* **No Tracking or Cookies:** The extension does not inject tracking pixels, third-party analytics, advertisements, or cookies.

---

## 3. Permissions Justification

| Permission | Purpose & Justification |
| :--- | :--- |
| `activeTab` | Allows the extension to inspect the current active tab only when the user clicks "Capture Page" or the extension icon. |
| `scripting` | Enables injecting the capture and font-parsing engines (`capture.js`, `woff2.min.js`, etc.) into the active tab to analyze DOM structures and computed styles. |
| `clipboardWrite` | Required to write the serialized Figma HyperNodes data to your system clipboard so you can paste (`Ctrl+V` / `⌘V`) directly into the Figma canvas. |
| `storage` | Used to store user UI preferences locally on the browser. |
| `<all_urls>` | Required because users can use the extension to capture any website across the internet, including cross-origin iframes and embedded media. |

---

## 4. Third-Party Sharing
We do not sell, rent, trade, or transfer any user data to third parties. We do not participate in any data broker networks.

---

## 5. Security
Because all processing takes place locally within your browser sandbox, your captured data never leaves your computer.

---

## 6. Changes to this Policy
If we make any material changes to this policy, we will update this document and the version timestamp.

---

## 7. Contact
For questions or support regarding this Privacy Policy, please reach out via GitHub:
https://github.com/SiamQyf/HTML-2-Fig
