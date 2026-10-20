const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..');

// 1. Figma Plugin files to patch
const codeFiles = [
  path.join(rootDir, 'packages/figma-plugin/src/code.js'),
  path.join(rootDir, 'HTML To Figma Perfect/packages/figma-plugin/src/code.js')
];

// Target 1: FONT_WEIGHT_MAP and WEIGHT_FALLBACK_SEQUENCE
const target1 = 'const FONT_WEIGHT_MAP={100:["Thin","Hairline"],200:["Extra Light","ExtraLight","Ultra Light","UltraLight","Extraleicht"],300:["Light","Leicht"],400:["Regular","Normal","Book","Roman","Buch","Plain","Standard"],500:["Medium","Kraftig","Kräftig","Médium","Mezzo"],600:["Semi Bold","SemiBold","Semibold","Demi Bold","DemiBold","Demi","Halbfett"],700:["Bold","Fett","Dreiviertelfett"],800:["Extra Bold","ExtraBold","Ultra Bold","UltraBold","Extrafett","Heavy"],900:["Black","Heavy","Extra Black","Ultra Black","Super","Poster","Fat"],normal:["Regular","Normal","Book","Roman","Buch"],bold:["Bold","Fett"],bolder:["Extra Bold","ExtraBold","Ultra Bold","UltraBold","Black","Heavy"],lighter:["Light","Extra Light","Thin"]},WEIGHT_FALLBACK_SEQUENCE={100:["100","200","300","400","500"],200:["200","100","300","400","500"],300:["300","400","200","500","100"],400:["400","500","300","600","700"],500:["500","400","600","300","700"],600:["600","700","800","500","400"],700:["700","800","600","900","500","400"],800:["800","900","700","600","500","400"],900:["900","800","700","600","500","400"]};';

const repl1 = 'function isLightOrThinStyle(e){return/thin|hairline|extra\\s*light|ultra\\s*light|extraleicht|light|leicht/i.test(String(e||""))}const FONT_WEIGHT_MAP={100:["Regular","Normal","Book","Roman","Buch","Plain","Standard"],200:["Regular","Normal","Book","Roman","Buch","Plain","Standard"],300:["Regular","Normal","Book","Roman","Buch","Plain","Standard"],400:["Regular","Normal","Book","Roman","Buch","Plain","Standard"],500:["Medium","Kraftig","Kräftig","Médium","Mezzo"],600:["Semi Bold","SemiBold","Semibold","Demi Bold","DemiBold","Demi","Halbfett"],700:["Bold","Fett","Dreiviertelfett"],800:["Extra Bold","ExtraBold","Ultra Bold","UltraBold","Extrafett","Heavy"],900:["Black","Heavy","Extra Black","Ultra Black","Super","Poster","Fat"],normal:["Regular","Normal","Book","Roman","Buch"],bold:["Bold","Fett"],bolder:["Extra Bold","ExtraBold","Ultra Bold","UltraBold","Black","Heavy"],lighter:["Regular","Normal","Book","Roman","Buch"]},WEIGHT_FALLBACK_SEQUENCE={100:["400","500","600","700"],200:["400","500","600","700"],300:["400","500","600","700"],400:["400","500","600","700"],500:["500","400","600","700"],600:["600","700","800","500","400"],700:["700","800","600","900","500","400"],800:["800","900","700","600","500","400"],900:["900","800","700","600","500","400"]};';

// Target 2: findBestStyle
const target2 = 'function findBestStyle(e,t,r,n){if(!e||0===e.length)return null;const o=!!(n&&n.isCondensed),i=!!(n&&n.isExpanded);let a=null,s=1/0;for(const l of e){const e=l.style||"",d=parseWeightFromStyleOrName(e)||400,c=isItalicStyle(e),u=isCondensedStyle(e),g=isExpandedStyle(e);let p=0;(t>=600&&d<t||t<=300&&d>t)&&(p+=50),o!==u&&(p+=2e3),i!==g&&(p+=2e3);const f=Math.abs(d-t)+(c===r?0:5e3)+(d===t?-20:0)+p;f<s&&(s=f,a=l)}return a}';

const repl2 = 'function findBestStyle(e,t,r,n){if(!e||0===e.length)return null;const o=!!(n&&n.isCondensed),i=!!(n&&n.isExpanded);const targetWeight=Math.max(400,t||400);const eligible=e.filter(s=>!isLightOrThinStyle(s.style)&&(parseWeightFromStyleOrName(s.style)||400)>=400);if(0===eligible.length)return null;let a=null,s=1/0;for(const l of eligible){const e=l.style||"",d=Math.max(400,parseWeightFromStyleOrName(e)||400),c=isItalicStyle(e),u=isCondensedStyle(e),g=isExpandedStyle(e);let p=0;(targetWeight>=600&&d<targetWeight)&&(p+=50),o!==u&&(p+=2e3),i!==g&&(p+=2e3);const f=Math.abs(d-targetWeight)+(c===r?0:5e3)+(d===targetWeight?-20:0)+p;f<s&&(s=f,a=l)}return a}';

// Target 3: resolveTargetWeight
const target3 = 'function resolveTargetWeight(e,t){const r=parseWeightFromStyleOrName(t);if(null!==r)return r;let n=400;if("number"==typeof e)n=e;else if("string"==typeof e){const t=e.toLowerCase().trim();if("normal"===t)n=400;else if("bold"===t)n=700;else if("bolder"===t)n=800;else if("lighter"===t)n=300;else{const e=parseInt(t,10);if(!isNaN(e)&&e>0)n=e;else{const e=parseWeightFromStyleOrName(t);e&&(n=e)}}}return n}';

const repl3 = 'function resolveTargetWeight(e,t){const r=parseWeightFromStyleOrName(t);if(null!==r)return Math.max(400,r);let n=400;if("number"==typeof e)n=e;else if("string"==typeof e){const t=e.toLowerCase().trim();if("normal"===t)n=400;else if("bold"===t)n=700;else if("bolder"===t)n=800;else if("lighter"===t)n=400;else{const e=parseInt(t,10);if(!isNaN(e)&&e>0)n=e;else{const e=parseWeightFromStyleOrName(t);e&&(n=e)}}}return Math.max(400,n)}';

// Target 4: getCandidatesForFamily
const target4 = 'function getCandidatesForFamily(e,t,r,n=!1){const o=[],i=WEIGHT_FALLBACK_SEQUENCE[t]||[t,"400"];for(const t of i){const i=FONT_WEIGHT_MAP[t]||["Regular"];for(const a of i)n?(r?(o.push({family:e,style:a+" Condensed Italic"}),o.push({family:e,style:"Condensed "+a+" Italic"}),o.push({family:e+" Condensed",style:a+" Italic"})):(o.push({family:e,style:a+" Condensed"}),o.push({family:e,style:"Condensed "+a}),o.push({family:e+" Condensed",style:a})),r?(o.push({family:e,style:a+" Italic"}),o.push({family:e,style:a+"Italic"}),o.push({family:e,style:a+" Oblique"})):o.push({family:e,style:a})):r?(o.push({family:e,style:a+" Italic"}),o.push({family:e,style:a+"Italic"}),o.push({family:e,style:a+" Oblique"})):o.push({family:e,style:a})}return n&&(parseInt(t)>=600&&(o.push({family:e,style:r?"Bold Condensed Italic":"Bold Condensed"}),o.push({family:e+" Condensed",style:r?"Bold Italic":"Bold"})),o.push({family:e,style:r?"Condensed Italic":"Condensed"}),o.push({family:e+" Condensed",style:r?"Italic":"Regular"})),parseInt(t)>=600&&o.push({family:e,style:r?"Bold Italic":"Bold"}),o.push({family:e,style:r?"Italic":"Regular"}),o}';

const repl4 = 'function getCandidatesForFamily(e,t,r,n=!1){const targetWeight=Math.max(400,parseInt(t)||400);const o=[],i=WEIGHT_FALLBACK_SEQUENCE[targetWeight]||["400"];for(const t of i){const i=FONT_WEIGHT_MAP[t]||["Regular"];for(const a of i)n?(r?(o.push({family:e,style:a+" Condensed Italic"}),o.push({family:e,style:"Condensed "+a+" Italic"}),o.push({family:e+" Condensed",style:a+" Italic"})):(o.push({family:e,style:a+" Condensed"}),o.push({family:e,style:"Condensed "+a}),o.push({family:e+" Condensed",style:a})),r?(o.push({family:e,style:a+" Italic"}),o.push({family:e,style:a+"Italic"}),o.push({family:e,style:a+" Oblique"})):o.push({family:e,style:a})):r?(o.push({family:e,style:a+" Italic"}),o.push({family:e,style:a+"Italic"}),o.push({family:e,style:a+" Oblique"})):o.push({family:e,style:a})}return n&&(parseInt(targetWeight)>=600&&(o.push({family:e,style:r?"Bold Condensed Italic":"Bold Condensed"}),o.push({family:e+" Condensed",style:r?"Bold Italic":"Bold"})),o.push({family:e,style:r?"Condensed Italic":"Condensed"}),o.push({family:e+" Condensed",style:r?"Italic":"Regular"})),parseInt(targetWeight)>=600&&o.push({family:e,style:r?"Bold Italic":"Bold"}),o.push({family:e,style:r?"Italic":"Regular"}),o.filter(c=>!isLightOrThinStyle(c.style))}';

// Target 5: Font Awesome Light removal in loadFont
const target5 = 'c.includes("brands")?t.push({family:d,style:"Regular"}):e?(t.push({family:d,style:"Solid"}),t.push({family:"Font Awesome 5 Free",style:"Solid"}),t.push({family:"Font Awesome 6 Free",style:"Solid"}),t.push({family:d,style:"Regular"}),t.push({family:"Font Awesome 5 Free",style:"Regular"})):(t.push({family:d,style:"Regular"}),t.push({family:d,style:"Light"}),t.push({family:"Font Awesome 5 Free",style:"Regular"}),t.push({family:"Font Awesome 6 Free",style:"Regular"}),t.push({family:d,style:"Solid"}),t.push({family:"Font Awesome 5 Free",style:"Solid"}));';

const repl5 = 'c.includes("brands")?t.push({family:d,style:"Regular"}):e?(t.push({family:d,style:"Solid"}),t.push({family:"Font Awesome 5 Free",style:"Solid"}),t.push({family:"Font Awesome 6 Free",style:"Solid"}),t.push({family:d,style:"Regular"}),t.push({family:"Font Awesome 5 Free",style:"Regular"})):(t.push({family:d,style:"Regular"}),t.push({family:"Font Awesome 5 Free",style:"Regular"}),t.push({family:"Font Awesome 6 Free",style:"Regular"}),t.push({family:d,style:"Solid"}),t.push({family:"Font Awesome 5 Free",style:"Solid"}));';

// Target 6: parseWeightFromStyleOrName(e)||p in loadFont family loop
const target6 = 'const o=getBaseFamilyName(e),i=parseWeightFromStyleOrName(e)||p,fn1=normalizeFamilyKey(e)';
const repl6 = 'const o=getBaseFamilyName(e),i=Math.max(400,parseWeightFromStyleOrName(e)||p),fn1=normalizeFamilyKey(e)';

// Target 7: b sort and fallback loop in loadFont
const target7 = 'const t=[...b].sort((e,t)=>{const wt1=parseWeightFromStyleOrName(e.style)||400,wt2=parseWeightFromStyleOrName(t.style)||400;const it1=isItalicStyle(e.style)===!r?0:1,it2=isItalicStyle(t.style)===!r?0:1;return(it1-it2)||(Math.abs(wt1-i)-Math.abs(wt2-i))});for(const e of t){const t=`${e.family}::${e.style}`;if(!FAILED_FONTS.has(t))try{return await figma.loadFontAsync({family:e.family,style:e.style}),a(e)}catch{FAILED_FONTS.add(t)}}';

const repl7 = 'const validB=b.filter(s=>!isLightOrThinStyle(s.style)&&(parseWeightFromStyleOrName(s.style)||400)>=400),t=[...validB].sort((e,t)=>{const wt1=Math.max(400,parseWeightFromStyleOrName(e.style)||400),wt2=Math.max(400,parseWeightFromStyleOrName(t.style)||400);const it1=isItalicStyle(e.style)===!r?0:1,it2=isItalicStyle(t.style)===!r?0:1;return(it1-it2)||(Math.abs(wt1-i)-Math.abs(wt2-i))});for(const e of t){const t=`${e.family}::${e.style}`;if(!FAILED_FONTS.has(t))try{return await figma.loadFontAsync({family:e.family,style:e.style}),a(e)}catch{FAILED_FONTS.add(t)}}';

// Target 8: variable font wght in loadFont
const target8 = 'variationSettings:{wght:p,wdth:e}';
const repl8 = 'variationSettings:{wght:Math.max(400,p),wdth:e}';

// Target 9: loadFontSafely
const target9 = 'let cachedAvailableFonts=null;async function loadFontSafely(e){if(e&&e.family&&e.style){try{return await figma.loadFontAsync(e),e}catch(e){}const t=["Regular","Medium","Bold","SemiBold","Light","Book","Roman","Italic"];for(const r of t)try{const t={family:e.family,style:r};return await figma.loadFontAsync(t),t}catch(e){}try{if(cachedAvailableFonts||(cachedAvailableFonts=await figma.listAvailableFontsAsync()),Array.isArray(cachedAvailableFonts)&&cachedAvailableFonts.length>0){const t=cachedAvailableFonts.find(t=>t.fontName&&t.fontName.family.toLowerCase()===e.family.toLowerCase());if(t)try{return await figma.loadFontAsync(t.fontName),t.fontName}catch(e){}}}catch(e){}}const t=[{family:"Inter",style:"Regular"},{family:"Roboto",style:"Regular"},{family:"Arial",style:"Regular"}];for(const e of t)try{return await figma.loadFontAsync(e),e}catch(e){}try{if(cachedAvailableFonts||(cachedAvailableFonts=await figma.listAvailableFontsAsync()),Array.isArray(cachedAvailableFonts)&&cachedAvailableFonts.length>0)return await figma.loadFontAsync(cachedAvailableFonts[0].fontName),cachedAvailableFonts[0].fontName}catch(e){}return null}';

const repl9 = 'let cachedAvailableFonts=null;async function loadFontSafely(e){if(e&&e.family&&e.style){let styleToTry=e.style;if(isLightOrThinStyle(styleToTry)||(parseWeightFromStyleOrName(styleToTry)||400)<400){styleToTry=isItalicStyle(styleToTry)?"Italic":"Regular"}try{return await figma.loadFontAsync({family:e.family,style:styleToTry}),{family:e.family,style:styleToTry}}catch(e){}const t=["Regular","Medium","Bold","SemiBold","Book","Roman","Italic"];for(const r of t)try{const t={family:e.family,style:r};return await figma.loadFontAsync(t),t}catch(e){}try{if(cachedAvailableFonts||(cachedAvailableFonts=await figma.listAvailableFontsAsync()),Array.isArray(cachedAvailableFonts)&&cachedAvailableFonts.length>0){const t=cachedAvailableFonts.find(t=>t.fontName&&t.fontName.family.toLowerCase()===e.family.toLowerCase()&&!isLightOrThinStyle(t.fontName.style)&&(parseWeightFromStyleOrName(t.fontName.style)||400)>=400);if(t)try{return await figma.loadFontAsync(t.fontName),t.fontName}catch(e){}}}catch(e){}}const t=[{family:"Inter",style:"Regular"},{family:"Roboto",style:"Regular"},{family:"Arial",style:"Regular"}];for(const e of t)try{return await figma.loadFontAsync(e),e}catch(e){}try{if(cachedAvailableFonts||(cachedAvailableFonts=await figma.listAvailableFontsAsync()),Array.isArray(cachedAvailableFonts)&&cachedAvailableFonts.length>0){const safeFont=cachedAvailableFonts.find(f=>!isLightOrThinStyle(f.fontName.style)&&(parseWeightFromStyleOrName(f.fontName.style)||400)>=400);const chosen=safeFont?safeFont.fontName:{family:cachedAvailableFonts[0].fontName.family,style:"Regular"};return await figma.loadFontAsync(chosen),chosen}}catch(e){}return null}';

for (const file of codeFiles) {
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }
  let code = fs.readFileSync(file, 'utf8');
  let patchCount = 0;

  const patches = [
    [target1, repl1, 'FONT_WEIGHT_MAP & WEIGHT_FALLBACK_SEQUENCE'],
    [target2, repl2, 'findBestStyle (filter light/thin, min 400)'],
    [target3, repl3, 'resolveTargetWeight (min 400)'],
    [target4, repl4, 'getCandidatesForFamily (filter light/thin, min 400)'],
    [target5, repl5, 'Font Awesome (removed Light style)'],
    [target6, repl6, 'loadFont family target weight i (min 400)'],
    [target7, repl7, 'loadFont available fonts b sort/filter (min 400)'],
    [target8, repl8, 'loadFont variable font wght (min 400)'],
    [target9, repl9, 'loadFontSafely (filter light/thin, min 400)']
  ];

  for (const [target, repl, desc] of patches) {
    if (code.includes(target)) {
      code = code.replace(target, repl);
      patchCount++;
      console.log(`  ✓ Patched [${desc}] in ${file}`);
    } else if (code.includes(repl)) {
      console.log(`  - Already patched [${desc}] in ${file}`);
    } else {
      console.error(`  ❌ Target not found for [${desc}] in ${file}`);
      process.exit(1);
    }
  }

  // Validate syntax with acorn
  try {
    acorn.parse(code, { ecmaVersion: 2022 });
    console.log(`✓ ${file} syntax 100% valid with acorn!`);
  } catch (err) {
    console.error(`❌ Acorn syntax error in ${file}:`, err.message, 'at pos', err.pos);
    process.exit(1);
  }

  fs.writeFileSync(file, code, 'utf8');
  console.log(`✓ Successfully updated ${file} with ${patchCount} patches.\n`);
}

console.log('All Figma plugin files successfully updated and validated!');
