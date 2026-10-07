const fs = require('fs');
const path = require('path');
const files = [
  path.resolve(__dirname, '../packages/figma-plugin/src/code.js'),
  path.resolve(__dirname, '../HTML To Figma Perfect/packages/figma-plugin/src/code.js'),
];

// Center branch (single-line text): don't snap to the parent's centre when the text has inline siblings
const CENTER_OLD = "if (parentFrame && parentFrame.width > figmaW && (Math.abs(parentDomW - w) <= 8 || isFlexCenter || isDomSymmetricCenter || Math.abs(parentFrame.width - w) <= 8)) {";
const CENTER_NEW = "if (hasSiblings) {\r\n          // Text shares its line with inline siblings (icon, link...): keep its DOM position\r\n          textNode.x = posX;\r\n        } else if (parentFrame && parentFrame.width > figmaW && (Math.abs(parentDomW - w) <= 8 || isFlexCenter || isDomSymmetricCenter || Math.abs(parentFrame.width - w) <= 8)) {";

const RIGHT_OLD = "if (parentFrame && parentFrame.width > figmaW && (Math.abs(parentDomW - w) <= 8 || Math.abs(parentFrame.width - w) <= 8 || domLeftPad > 10)) {";
const RIGHT_NEW = "if (hasSiblings) {\r\n          // Keep the right edge of the text at its DOM right edge so it never runs into the following inline sibling\r\n          textNode.x = posX + w - figmaW;\r\n        } else if (parentFrame && parentFrame.width > figmaW && (Math.abs(parentDomW - w) <= 8 || Math.abs(parentFrame.width - w) <= 8 || domLeftPad > 10)) {";

for (const f of files) {
  if (!fs.existsSync(f)) { console.log('skip', f); continue; }
  let t = fs.readFileSync(f, 'utf8');
  if (!t.includes(CENTER_OLD) || !t.includes(RIGHT_OLD)) { console.log('markers missing', f, t.includes(CENTER_OLD), t.includes(RIGHT_OLD)); continue; }
  t = t.replace(CENTER_OLD, () => CENTER_NEW).replace(RIGHT_OLD, () => RIGHT_NEW);
  fs.writeFileSync(f, t);
  console.log('patched', f);
}
