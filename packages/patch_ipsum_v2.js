const fs = require('fs');
const path = require('path');
const files = [
  path.resolve(__dirname, 'figma-plugin/src/code.js'),
  path.resolve(__dirname, '../packages/figma-plugin/src/code.js'),
];

const NEW_BLOCK = `if("lorem_ipsum_replace"===e.type){const W="lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum perspiciatis unde omnis iste natus error voluptatem accusantium doloremque laudantium totam rem aperiam eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta explicabo nemo ipsam quia aspernatur aut odit fugit consequuntur magni dolores eos ratione sequi nesciunt neque porro quisquam numquam eius modi tempora incidunt quaerat voluptatem minima nostrum exercitationem ullam corporis suscipit laboriosam aliquid commodi autem vel eum iure quam nihil molestiae illum dolorem fuga harum quidem rerum facilis expedita distinctio nam libero tempore soluta nobis eligendi optio cumque impedit quo minus quod maxime placeat facere possimus assumenda repellendus temporibus quibusdam officiis debitis necessitatibus saepe eveniet voluptates repudiandae recusandae itaque earum hic tenetur sapiente delectus reiciendis voluptatibus maiores alias perferendis doloribus asperiores repellat".split(" "),B={};W.forEach(w=>{(B[w.length]=B[w.length]||[]).push(w)});let last="";const pick=n=>{const a=B[n];if(a&&a.length){let w,i=0;do{w=a[Math.floor(Math.random()*a.length)]}while(w===last&&a.length>1&&++i<8);return w}if(n<=0)return"";if(n===1)return"aeiou"[Math.floor(Math.random()*5)];const k=Math.min(n-1,14);let s=pick(k);return n-k>0?(s+pick(n-k)).slice(0,n):s},word=(n,s)=>{let w=pick(n);last=w;return s===2?w.toUpperCase():s===1?w[0].toUpperCase()+w.slice(1):w},ipsum=t=>t.replace(/[A-Za-z\\u00C0-\\u024F]+/g,m=>{const up=m===m.toUpperCase()&&m.length>1?2:m[0]===m[0].toUpperCase()&&m[0]!==m[0].toLowerCase()?1:0;return word(m.length,up)}),sel=figma.currentPage.selection,roots=sel.length>0?sel:[figma.currentPage];try{await Promise.all(roots.map(function t(r){if("TEXT"===r.type){const c=r.characters;if(!/[A-Za-z\\u00C0-\\u024F]/.test(c))return Promise.resolve();const n=ipsum(c);try{const f=r.getRangeAllFontNames(0,c.length);return Promise.all(f.map(x=>figma.loadFontAsync(x))).then(()=>{r.characters=n})}catch(x){return Promise.resolve()}}return"children"in r?Promise.all(Array.from(r.children).map(t)):Promise.resolve()})),figma.notify("Text Ipsumed!",{timeout:2e3})}catch(x){figma.notify("Error replacing text: "+x.message,{error:!0})}return}`;

for (const f of files) {
  if (!fs.existsSync(f)) { console.log('skip', f); continue; }
  const t = fs.readFileSync(f, 'utf8');
  const a = t.indexOf('if("lorem_ipsum_replace"===e.type){');
  const endMarker = 'if("switch_to_assets_diary"!==e.type)';
  const b = t.indexOf(endMarker, a);
  if (a < 0 || b < 0) { console.log('marker not found', f); continue; }
  fs.writeFileSync(f, t.slice(0, a) + NEW_BLOCK + t.slice(b));
  console.log('patched', f);
}
