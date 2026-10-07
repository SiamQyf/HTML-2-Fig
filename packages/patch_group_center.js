const fs = require('fs');
const path = require('path');
const files = [
  path.resolve(__dirname, '../packages/figma-plugin/src/code.js'),
  path.resolve(__dirname, '../HTML To Figma Perfect/packages/figma-plugin/src/code.js'),
];

const OLD_RE = /let minX = Infinity, maxX = -Infinity;\r?\n(\s*)for \(const c of rowChildren\) \{\r?\n\s*minX = Math\.min\(minX, c\.figmaNode\.x \|\| 0\);\r?\n\s*maxX = Math\.max\(maxX, \(c\.figmaNode\.x \|\| 0\) \+ \(c\.figmaNode\.width \|\| 0\)\);\r?\n\s*\}\r?\n\s*const groupW = maxX - minX;\r?\n\s*if \(groupW > 0 && groupW < frame\.width\) \{\r?\n\s*const targetStartX = Math\.round\(\(frame\.width - groupW\) \/ 2\);\r?\n\s*const shiftX = targetStartX - minX;\r?\n\s*if \(Math\.abs\(shiftX\) >= 1\) \{\r?\n\s*for \(const c of rowChildren\) \{\r?\n\s*c\.figmaNode\.x \+= shiftX;\r?\n\s*\}\r?\n\s*\}\r?\n\s*\}/;

const NEW = `// The group being centered must include the frame's own text nodes (e.g. "Submit" next to an arrow icon),
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
        }`;

for (const f of files) {
  if (!fs.existsSync(f)) { console.log('skip', f); continue; }
  const t = fs.readFileSync(f, 'utf8');
  if (!OLD_RE.test(t)) { console.log('marker missing', f); continue; }
  fs.writeFileSync(f, t.replace(OLD_RE, () => NEW));
  console.log('patched', f);
}
