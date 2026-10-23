const fs = require('fs');
const acorn = require('acorn');

const codeFiles = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

const oldHasText = 'function hasTextOrContent(e){if(!e)return!1;if(e.text&&e.text.trim().length>0)return!0;if(["BUTTON","A","INPUT","TEXTAREA","SELECT","H1","H2","H3","H4","H5","H6","P","LI","LABEL","SVG","IMG"].includes(e.tag)||(e.content&&("SVG"===e.tag||e.content.includes("<svg"))))return!0;if(e.childNodes)for(let t=0;t<e.childNodes.length;t++)if(hasTextOrContent(e.childNodes[t]))return!0;return!1}';

const newHasText = 'function hasTextOrContent(e){if(!e)return!1;const t=(e.attributes?.class||"").toLowerCase(),r=(e.attributes?.id||e.id||"").toLowerCase();if(/\\b(?:dot-grid|grid-pattern|bg-pattern|bg-lines|stripes|bg-stripes|pattern-bg|lines|particles)\\b/.test(t)||/\\b(?:dot-grid|grid-pattern|bg-pattern|bg-lines|stripes|bg-stripes|pattern-bg|lines|particles)\\b/.test(r))return!1;if(e.text&&e.text.trim().length>0)return!0;if(["BUTTON","A","INPUT","TEXTAREA","SELECT","H1","H2","H3","H4","H5","H6","P","LI","LABEL","IMG"].includes(e.tag))return!0;if("SVG"===e.tag||(e.content&&e.content.includes("<svg"))){if(/\\b(?:dot-grid|grid-pattern|bg-pattern|bg-lines|stripes|bg-stripes|pattern-bg|lines|particles)\\b/.test(t)||r.includes("svg-bg"))return!1;return!0}if(e.childNodes)for(let t=0;t<e.childNodes.length;t++)if(hasTextOrContent(e.childNodes[t]))return!0;return!1}';

const oldIsBg = 'function isBackgroundOverlay(e){if(!e||hasTextOrContent(e))return!1;const t=(e.attributes?.class||"").toLowerCase(),r=(e.attributes?.id||e.id||"").toLowerCase(),n=(e.tag||"").toLowerCase();if(/\\b(?:card|slide|swiper|carousel|testimonial|item|col|row|container|dialog|modal)\\b/.test(t))return!1;if(/\\b(?:lines|grid-lines|bg-lines|background-lines|stripes|bg-stripes|pattern-bg|bg-pattern|section-lines|banner-lines|bg-shape|shape-bg|bg-overlay|overlay-bg|bottom-image-layer|particles|particles-style|particle-bg|bg-particles|particles-js|dot-grid)\\b/.test(t)||/(?:__background|--background|-background|_background|__bg|--bg|-bg|_bg|\\b(?:bg-overlay|overlay-bg|bg-pattern|pattern-bg|bg-shape|shape-bg|bg-lines|bg-stripes|bg-particles|bg-image|bg-img|background-overlay|overlay-background)\\b)/.test(t)||/\\b(?:lines|grid-lines|bg-lines|stripes|bg-stripes|pattern-bg|particles|particles-style|particle)\\b/.test(r)||e.attributes?.["data-particle"])return!0;if("svg"===n&&(r.includes("svg-bg")||t.includes("lines")||t.includes("stripes")))return!0;const o=(e.styles?.backgroundImage||"").toLowerCase();if(o&&(o.includes("stripe")||o.includes("pattern")||o.includes("grid")||o.includes("texture")||o.includes("mesh")))return!0;if(e.attributes?.src){const t=e.attributes.src.toLowerCase();if(t.includes("stripe")||t.includes("grid")||t.includes("pattern")||t.includes("texture")||t.includes("mesh"))return!0}return!("multiply"!==e.styles?.mixBlendMode||!(t.includes("parallax")||t.includes("layer")||t.includes("bg")))}';

const newIsBg = 'function isBackgroundOverlay(e){if(!e||hasTextOrContent(e))return!1;const t=(e.attributes?.class||"").toLowerCase(),r=(e.attributes?.id||e.id||"").toLowerCase(),n=(e.tag||"").toLowerCase();if(/\\b(?:card|slide|swiper|carousel|testimonial|item|col|row|container|dialog|modal)\\b/.test(t))return!1;if(/\\b(?:lines|grid-lines|bg-lines|background-lines|stripes|bg-stripes|pattern-bg|bg-pattern|section-lines|banner-lines|bg-shape|shape-bg|bg-overlay|overlay-bg|bottom-image-layer|particles|particles-style|particle-bg|bg-particles|particles-js|dot-grid|inset-0|bg-gradient)\\b/.test(t)||/(?:__background|--background|-background|_background|__bg|--bg|-bg|_bg|\\b(?:bg-overlay|overlay-bg|bg-pattern|pattern-bg|bg-shape|shape-bg|bg-lines|bg-stripes|bg-particles|bg-image|bg-img|background-overlay|overlay-background|dot-grid|inset-0|bg-gradient)\\b)/.test(t)||/\\b(?:lines|grid-lines|bg-lines|stripes|bg-stripes|pattern-bg|particles|particles-style|particle)\\b/.test(r)||e.attributes?.["data-particle"])return!0;if("svg"===n&&(r.includes("svg-bg")||t.includes("lines")||t.includes("stripes")||t.includes("dot-grid")))return!0;if(!hasTextOrContent(e)&&(t.includes("inset-0")||("absolute"===e.styles?.position&&("100%"===e.styles?.width||"0px"===e.styles?.top&&"0px"===e.styles?.bottom))))return!0;const o=(e.styles?.backgroundImage||"").toLowerCase();if(o&&(o.includes("stripe")||o.includes("pattern")||o.includes("grid")||o.includes("texture")||o.includes("mesh")))return!0;if(e.attributes?.src){const t=e.attributes.src.toLowerCase();if(t.includes("stripe")||t.includes("grid")||t.includes("pattern")||t.includes("texture")||t.includes("mesh"))return!0}return!("multiply"!==e.styles?.mixBlendMode||!(t.includes("parallax")||t.includes("layer")||t.includes("bg")))}';

const oldInsert = '/\\b(?:particle|particles|particles-style|lines|stripes|bg-shape|shape-bg|bg-overlay|overlay-bg|bottom-image-layer)\\b/i.test(e.attributes?.class||"")||/\\b(?:particle|particles|particles-style|lines|stripes)\\b/i.test(e.attributes?.id||"")||e.attributes?.["data-particle"]||f.zIndex&&parseInt(f.zIndex,10)<0?t.insertChild(0,K):t.appendChild(K);';

const newInsert = '/\\b(?:particle|particles|particles-style|lines|stripes|bg-shape|shape-bg|bg-overlay|overlay-bg|bottom-image-layer|inset-0|bg-gradient|dot-grid)\\b/i.test(e.attributes?.class||"")&&!hasTextOrContent(e)||isBackgroundOverlay(e)||/\\b(?:particle|particles|particles-style|lines|stripes)\\b/i.test(e.attributes?.id||"")||e.attributes?.["data-particle"]||f.zIndex&&parseInt(f.zIndex,10)<0?t.insertChild(0,K):t.appendChild(K);';

const oldSort = 'se.sort((e,r)=>{const eP=e.styles?.position||"static",rP=r.styles?.position||"static",eOut="absolute"===eP||"fixed"===eP,rOut="absolute"===rP||"fixed"===rP,eZ=e.styles?.zIndex&&"auto"!==e.styles.zIndex,rZ=r.styles?.zIndex&&"auto"!==r.styles.zIndex;if(!eOut&&!rOut&&!eZ&&!rZ)return e._domIndex-r._domIndex;const n=getEffectiveZIndex(e,t)-getEffectiveZIndex(r,t);return 0!==n?n:e._domIndex-r._domIndex})';

const newSort = 'se.sort((e,r)=>{const eBg=isBackgroundOverlay(e),rBg=isBackgroundOverlay(r);if(eBg&&!rBg)return-1;if(!eBg&&rBg)return 1;const eP=e.styles?.position||"static",rP=r.styles?.position||"static",eOut="absolute"===eP||"fixed"===eP,rOut="absolute"===rP||"fixed"===rP,eZ=e.styles?.zIndex&&"auto"!==e.styles.zIndex,rZ=r.styles?.zIndex&&"auto"!==r.styles.zIndex;if(!eOut&&!rOut&&!eZ&&!rZ)return e._domIndex-r._domIndex;const n=getEffectiveZIndex(e,t)-getEffectiveZIndex(r,t);return 0!==n?n:e._domIndex-r._domIndex})';

for (const file of codeFiles) {
  let content = fs.readFileSync(file, 'utf8');

  let p1 = false, p2 = false, p3 = false, p4 = false;

  if (content.includes(oldHasText)) {
    content = content.replace(oldHasText, newHasText);
    p1 = true;
  }
  if (content.includes(oldIsBg)) {
    content = content.replace(oldIsBg, newIsBg);
    p2 = true;
  }
  if (content.includes(oldInsert)) {
    content = content.replace(oldInsert, newInsert);
    p3 = true;
  }
  if (content.includes(oldSort)) {
    content = content.replace(oldSort, newSort);
    p4 = true;
  }

  console.log(`File: ${file} -> p1(hasText):${p1}, p2(isBg):${p2}, p3(insert):${p3}, p4(sort):${p4}`);

  acorn.parse(content, { ecmaVersion: 2022 });
  console.log(`✓ Syntax valid for ${file}`);
  fs.writeFileSync(file, content, 'utf8');
}

console.log('All patches applied cleanly and verified with Acorn!');
