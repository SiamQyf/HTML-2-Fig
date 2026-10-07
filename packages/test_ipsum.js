const fs = require('fs');
const t = fs.readFileSync(__dirname + '/figma-plugin/src/code.js', 'utf8');
const a = t.indexOf('const W="lorem');
const b = t.indexOf(',sel=figma.currentPage', a);
const body = t.slice(a, b) + ';';
const fn = new Function(body + 'return ipsum;');
const ipsum = fn();
for (const s of ['conservative', 'Conservative 2024', 'CONSERVATIVE $5.99 a I', 'Hi, 24/7 support!']) {
  const o = ipsum(s);
  console.log(JSON.stringify(s), '->', JSON.stringify(o), s.length === o.length);
}
