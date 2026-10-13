const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function validateJS(content, name) {
  try {
    acorn.parse(content, { ecmaVersion: 2022 });
    console.log(`✓ ${name} syntax valid (acorn ECMAScript 2022)`);
    return true;
  } catch (err) {
    console.error(`❌ ${name} parse error:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// PATCH CODE.JS
// -------------------------------------------------------------
function patchCodeJS(content) {
  // 1. Add color-mix to _parseColorInternal
  const colorMixCode = `if(e.startsWith("color-mix(")){const t=e.slice(10,-1).trim().match(/^in\\s+([\\w-]+)\\s*,\\s*(.*?)$/i);if(t){const r=splitByTopLevelCommas(t[2]);if(r&&r.length>=2){const e=r[0].trim(),t=r[1].trim(),n=e.match(/^(.*?)\\s+([\\d.]+)%$/),o=n?n[1].trim():e,i=n?parseFloat(n[2]):null,a=t.match(/^(.*?)\\s+([\\d.]+)%$/),s=a?a[1].trim():t,l=a?parseFloat(a[2]):null;let d=.5,c=.5;null!==i&&null!==l?d=(i+l)>0?i/(i+l):.5:null!==i?d=clamp01(i/100):null!==l&&(d=clamp01(1-l/100)),c=1-d;const u=parseColor(o)||("transparent"===o.toLowerCase()?{r:0,g:0,b:0,a:0}:null),g=parseColor(s)||("transparent"===s.toLowerCase()?{r:0,g:0,b:0,a:0}:null);if(u&&g)return{r:clamp01(u.r*d+g.r*c),g:clamp01(u.g*d+g.g*c),b:clamp01(u.b*d+g.b*c),a:clamp01((u.a??1)*d+(g.a??1)*c)}}}}`;
  
  if (!content.includes('color-mix(')) {
    const target = 'function _parseColorInternal(e){';
    content = content.replace(target, target + colorMixCode);
  }

  // 2. Replace gradient subsystem between splitStopTokens and parseBoxShadows
  const startMarker = 'function splitStopTokens(';
  const endMarker = 'function parseBoxShadows(';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Could not find gradient subsystem markers in code.js: ${startIdx}, ${endIdx}`);
  }

  const newSubsystem = `function splitStopTokens(e){const t=e=>/^(?:calc\\([^)]*(?:\\([^)]*\\)[^)]*)*\\)|-?[\\d.]+(?:%|px|rem|em|deg|turn|rad|grad)?|0)$/i.test(e);let r=0,n=[],o="";for(let t=0;t<e.length;t++){const i=e[t];"("===i?(r++,o+=i):")"===i?(r--,o+=i):/\\s/.test(i)&&0===r?o&&(n.push(o),o=""):o+=i}if(o&&n.push(o),n.length<=1)return{colorStr:e,pos1:null,pos2:null};let i=null,a=null;return n.length>=3&&t(n[n.length-1])&&t(n[n.length-2])?(i=n.pop(),a=n.pop()):n.length>=2&&t(n[n.length-1])&&(a=n.pop()),{colorStr:n.join(" "),pos1:a,pos2:i}}function resolveStopPosition(e,t,r){if(!e)return null;if("0"===(e=e.trim()))return 0;for(;e.toLowerCase().startsWith("calc(")&&e.endsWith(")");)e=e.slice(5,-1).trim();const n=e.match(/^(.+?)\\s+([+-])\\s+(.+)$/);if(n){const e=resolveStopPosition(n[1],t,r),o=n[2],i=resolveStopPosition(n[3],t,r);if(null!==e&&null!==i)return"-"===o?e-i:e+i}const o=e.match(/^(.+?)\\s*[*]\\s*(-?[\\d.]+)$/);if(o){const e=resolveStopPosition(o[1],t,r);if(null!==e)return e*parseFloat(o[2])}const i=e.match(/^(.+?)\\s*[/]\\s*(-?[\\d.]+)$/);if(i){const e=resolveStopPosition(i[1],t,r),n=parseFloat(i[2]);if(null!==e&&0!==n)return e/n}if(e.endsWith("%"))return parseFloat(e)/100;if(e.endsWith("px"))return t>0?parseFloat(e)/t:0;if(e.endsWith("rem"))return t>0?16*parseFloat(e)/t:0;if(e.endsWith("em"))return t>0?parseFloat(e)*(r||16)/t:0;if(e.endsWith("deg"))return parseFloat(e)/360;if(e.endsWith("turn"))return parseFloat(e);if(e.endsWith("rad"))return parseFloat(e)/(2*Math.PI);if(e.endsWith("grad"))return parseFloat(e)/400;const a=parseFloat(e);return isNaN(a)?null:a<=1&&a>=0?a:t>0?a/t:0}function fixPremultipliedStops(e){if(!e||e.length<=1)return e;const t=[];for(let r=0;r<e.length;r++){const n=e[r];if(n.color.a>.001){t.push(n);continue}let o=null;for(let t=r-1;t>=0;t--)if(e[t].color.a>.001){o=e[t];break}let i=null;for(let t=r+1;t<e.length;t++)if(e[t].color.a>.001){i=e[t];break}if(o&&!i)t.push({position:n.position,color:{r:o.color.r,g:o.color.g,b:o.color.b,a:n.color.a}});else if(!o&&i)t.push({position:n.position,color:{r:i.color.r,g:i.color.g,b:i.color.b,a:n.color.a}});else if(o&&i){const e=n.position-o.position,r=e+(i.position-n.position),a=r>0?e/r:.5;t.push({position:n.position,color:{r:o.color.r+(i.color.r-o.color.r)*a,g:o.color.g+(i.color.g-o.color.g)*a,b:o.color.b+(i.color.b-o.color.b)*a,a:n.color.a}})}else t.push(n)}return t}function parseGradientColorStops(e,t=100,r=16){if(!e)return[];const n=splitByTopLevelCommas(e);if(!n||0===n.length)return[];const o=[];for(let e=0;e<n.length;e++){const i=n[e].trim();if(!i)continue;if(i.match(/^(?:calc\\([^)]*(?:\\([^)]*\\)[^)]*)*\\)|-?[\\d.]+(?:%|px|rem|em|deg|turn|rad|grad)?|0)$/i)){const e=resolveStopPosition(i,t,r);o.push({isHint:!0,position:e});continue}const a=splitStopTokens(i),s=a.colorStr,l=parseColor(s)||("transparent"===s.toLowerCase()?{r:0,g:0,b:0,a:0}:null);if(l)if(null!==a.pos2){const e=resolveStopPosition(a.pos1,t,r),n=resolveStopPosition(a.pos2,t,r);o.push({isHint:!1,color:l,position:e}),o.push({isHint:!1,color:{...l},position:n})}else if(null!==a.pos1){const e=resolveStopPosition(a.pos1,t,r);o.push({isHint:!1,color:l,position:e})}else o.push({isHint:!1,color:l,position:null})}if(0===o.length)return[];const i=[];for(let e=0;e<o.length;e++){const t=o[e];if(t.isHint){const r=i[i.length-1];let n=null;for(let t=e+1;t<o.length;t++)if(!o[t].isHint){n=o[t];break}if(r&&n&&r.color&&n.color&&null!==t.position){const e={r:(r.color.r+n.color.r)/2,g:(r.color.g+n.color.g)/2,b:(r.color.b+n.color.b)/2,a:(r.color.a+n.color.a)/2};i.push({color:e,position:t.position})}}else i.push(t)}if(0===i.length)return[];1===i.length&&(i.push({color:{...i[0].color},position:1}),null===i[0].position&&(i[0].position=0)),null===i[0].position&&(i[0].position=0),null===i[i.length-1].position&&(i[i.length-1].position=1);let a=0;for(;a<i.length;)if(null===i[a].position){const e=a-1,t=i[e].position;let r=a;for(;r<i.length&&null===i[r].position;)r++;const n=r<i.length&&null!==i[r].position?i[r].position:1,o=r-e;for(let s=a;s<r;s++){const r=(s-e)/o;i[s].position=t+(n-t)*r}a=r}else a++;let s=0;for(let e=0;e<i.length;e++)i[e].position<s?i[e].position=s:s=i[e].position;const l=i.map(e=>({position:clamp01(e.position),color:{...e.color,a:clamp01(e.color.a??1)}}));return l[0].position>0&&l.unshift({position:0,color:{...l[0].color}}),l[l.length-1].position<1&&l.push({position:1,color:{...l[l.length-1].color}}),fixPremultipliedStops(l)}function safeGradientFallback(e){if(!e||"string"!=typeof e)return null;const t=e.match(/(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^)]+\)|#[0-9a-fA-F]{3,8}\\b|\\b(?:transparent|black|white|red|green|blue|yellow|purple|cyan|magenta|orange|pink|gray|grey)\\b/gi);if(!t||0===t.length)return null;const r=[];for(const e of t){const t=parseColor(e)||("transparent"===e.toLowerCase()?{r:0,g:0,b:0,a:0}:null);t&&r.push(t)}if(0===r.length)return null;const n=r[0],o=r[r.length-1];return{type:"GRADIENT_LINEAR",gradientTransform:[[0,-1,1],[1,0,0]],gradientStops:[{position:0,color:{...n,a:clamp01(n.a??1)}},{position:1,color:{...o,a:clamp01(o.a??1)}}]}}function parseLinearGradient(e,t=null,r=100,n=100){if(!e)return null;const o=e.includes("repeating-linear-gradient");if(!e.includes("linear-gradient"))return null;try{const i=e.indexOf("linear-gradient(");if(-1===i)return null;let a=0,s="";for(let t=i+15;t<e.length;t++)if("("===e[t])a++;else if(")"===e[t]&&(a--,0===a)){s=e.substring(i+16,t).trim();break}if(!s)return safeGradientFallback(e);s=s.replace(/\\bin\\s+(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz(?:-d50|-d65)?|hsl|hwb|lch|oklch)\\b/gi,"").trim();const W=Math.max(1,r||100),H=Math.max(1,n||100);let l=180,d=s;const c=s.match(/^((?:to\\s+(?:top|bottom|left|right)(?:\\s+(?:top|bottom|left|right))?)|(?:-?[\\d.]+(?:deg|rad|turn|grad)?)|(?:top|bottom|left|right)(?:\\s+(?:top|bottom|left|right))?)\\s*,\\s*(.*)$/is);if(c){const e=c[1].toLowerCase().trim();if(d=c[2],e.includes("deg"))l=parseFloat(e);else if(e.includes("rad"))l=180*parseFloat(e)/Math.PI;else if(e.includes("turn"))l=360*parseFloat(e);else if(e.includes("grad"))l=360*parseFloat(e)/400;else if("to top"===e||"bottom"===e)l=0;else if("to right"===e||"left"===e)l=90;else if("to bottom"===e||"top"===e)l=180;else if("to left"===e||"right"===e)l=270;else{const t=Math.atan2(W,H)*(180/Math.PI);"to top right"===e||"to right top"===e?l=t:"to bottom right"===e||"to right bottom"===e?l=180-t:"to bottom left"===e||"to left bottom"===e?l=180+t:"to top left"!==e&&"to left top"!==e||(l=360-t)}}l=(l%360+360)%360;const g=l*Math.PI/180,u=parseGradientColorStops(d,Math.max(1,Math.abs(W*Math.sin(g))+Math.abs(H*Math.cos(g))),t&&parseFloat(t.fontSize)||16);if(!u||0===u.length)return safeGradientFallback(e);if(o&&u.length>=2){const e=u[0].position,t=u[u.length-1].position-e;if(t>.005&&t<.95){const r=[],n=Math.min(30,Math.ceil(1/t));for(let o=0;o<n;o++)for(const n of u){const i=o*t+(n.position-e);i<=1.001&&r.push({position:clamp01(i),color:{...n.color}})}r.length>=2&&(u.length=0,u.push(...r),u[0].position>0&&u.unshift({position:0,color:{...u[0].color}}),u[u.length-1].position<1&&u.push({position:1,color:{...u[u.length-1].color}}))}}if(t&&t.backgroundSize){const e=t.backgroundSize.trim().split(/\\s+/);let r=1,n=1;e[0]&&e[0].endsWith("%")&&(r=parseFloat(e[0])/100),e[1]&&e[1].endsWith("%")&&(n=parseFloat(e[1])/100);let o=0,i=0;if(t.backgroundPosition){const e=t.backgroundPosition.trim().split(/\\s+/);e[0]&&e[0].endsWith("%")?o=parseFloat(e[0])/100:"right"===e[0]?o=1:"center"===e[0]&&(o=.5),e[1]&&e[1].endsWith("%")?i=parseFloat(e[1])/100:"bottom"===e[1]?i=1:"center"===e[1]&&(i=.5)}const a=Math.abs(Math.sin(l*Math.PI/180))>=Math.abs(Math.cos(l*Math.PI/180)),s=a?r:n;let d=a?o:i;if(isBackgroundClipText(t)&&(d=0),s>1.05){const e=1/s,t=clamp01(d*(1-e)),r=clamp01(t+e),n=e=>{if(e<=u[0].position)return u[0].color;if(e>=u[u.length-1].position)return u[u.length-1].color;for(let t=0;t<u.length-1;t++){const r=u[t],n=u[t+1];if(e>=r.position&&e<=n.position){const t=n.position-r.position,o=t>0?(e-r.position)/t:0;return{r:r.color.r+(n.color.r-r.color.r)*o,g:r.color.g+(n.color.g-r.color.g)*o,b:r.color.b+(n.color.b-r.color.b)*o,a:r.color.a+(n.color.a-r.color.a)*o}}}return u[0].color},o=[];o.push({position:0,color:n(t)});for(const e of u)e.position>t+.001&&e.position<r-.001&&o.push({position:clamp01((e.position-t)/(r-t)),color:{...e.color}});o.push({position:1,color:n(r)}),u.length=0,u.push(...o)}}const p=(l-90)*Math.PI/180,f=Math.cos(p),m=-Math.sin(p),v=Math.sin(p),w=Math.cos(p);return{type:"GRADIENT_LINEAR",gradientTransform:[[f,m,.5-.5*(f+m)],[v,w,.5-.5*(v+w)]],gradientStops:u}}catch(t){return safeGradientFallback(e)}}function parseRadialGradient(e,t=100,r=100,n=null){if(!e)return null;const o=e.includes("repeating-radial-gradient");if(!e.includes("radial-gradient"))return null;try{const i=e.indexOf("radial-gradient(");if(-1===i)return null;let a=0,s="";for(let t=i+15;t<e.length;t++)if("("===e[t])a++;else if(")"===e[t]&&(a--,0===a)){s=e.substring(i+16,t).trim();break}if(!s)return safeGradientFallback(e);s=s.replace(/\\bin\\s+(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz(?:-d50|-d65)?|hsl|hwb|lch|oklch)\\b/gi,"").trim();const l=Math.max(1,t||100),d=Math.max(1,r||100),c=n&&parseFloat(n.fontSize)||16;let g=.5,u=.5,p=.5,f=.5,m=s;const h=s.indexOf(",");if(-1!==h){const e=s.substring(0,h).trim();if(e.includes("at ")||e.includes("circle")||e.includes("ellipse")||e.includes("closest-")||e.includes("farthest-")||/^[\\d.]+(?:%|px|rem|em)\\s+[\\d.]+(?:%|px|rem|em)(\\s+at\\s.*)?$/i.test(e)){m=s.substring(h+1).trim();const t=e.indexOf(" at ");let r=-1!==t?e.substring(0,t).trim():e;const n=-1!==t?e.substring(t+4).trim():"",o=/\\bcircle\\b/i.test(r);if(r=r.replace(/^(circle|ellipse)\\s*/i,"").trim(),n){const e=(e,t)=>e?"center"===(e=e.toLowerCase().trim())?.5:"left"===e?0:"right"===e?1:"top"===e?0:"bottom"===e?1:e.endsWith("%")?parseFloat(e)/100:e.endsWith("px")?parseFloat(e)/(t?l:d):e.endsWith("rem")?16*parseFloat(e)/(t?l:d):e.endsWith("em")?parseFloat(e)*c/(t?l:d):.5:.5,t=n.trim().split(/\\s+/);t.length>=2?["top","bottom"].includes(t[0].toLowerCase())&&["left","right","center"].includes(t[1].toLowerCase())?(g=e(t[1],!0),u=e(t[0],!1)):(g=e(t[0],!0),u=e(t[1],!1)):1===t.length&&("top"===t[0].toLowerCase()||"bottom"===t[0].toLowerCase()?(g=.5,u=e(t[0],!1)):(g=e(t[0],!0),u=.5))}const i=Math.hypot||((e,t)=>Math.sqrt(e*e+t*t)),a=i(g*l,u*d),y=i((1-g)*l,u*d),b=i(g*l,(1-u)*d),x=i((1-g)*l,(1-u)*d),v=Math.max(a,y,b,x),w=Math.min(a,y,b,x);if(r&&!/^(circle|ellipse)$/i.test(r)){const e=r.trim().split(/\\s+/);if(r.includes("closest-side")){const e=Math.min(g,1-g)*l,t=Math.min(u,1-u)*d;if(o){const r=Math.min(e,t);p=r/l,f=r/d}else p=e/l,f=t/d}else if(r.includes("farthest-side")){const e=Math.max(g,1-g)*l,t=Math.max(u,1-u)*d;if(o){const r=Math.max(e,t);p=r/l,f=r/d}else p=e/l,f=t/d}else if(r.includes("closest-corner"))p=w/l,f=w/d;else if(r.includes("farthest-corner"))p=v/l,f=v/d;else if(e.length>=2){const t=(e,t)=>e.endsWith("%")?parseFloat(e)/100:e.endsWith("px")?parseFloat(e)/(t?l:d):e.endsWith("rem")?16*parseFloat(e)/(t?l:d):.5;p=t(e[0],!0),f=t(e[1],!1)}else if(1===e.length){const t=e[0];if(t.endsWith("%"))p=parseFloat(t)/100,f=p;else if(t.endsWith("px")){const e=parseFloat(t);p=e/l,f=e/d}}}else p=v/l,f=v/d}}(!isFinite(p)||p<=0)&&(p=.5),(!isFinite(f)||f<=0)&&(f=.5);const y=parseGradientColorStops(m,Math.max(l*p,d*f),c);if(!y||0===y.length)return safeGradientFallback(e);if(o&&y.length>=2){const e=y[0].position,t=y[y.length-1].position-e;if(t>.005&&t<.95){const r=[],n=Math.min(30,Math.ceil(1/t));for(let o=0;o<n;o++)for(const n of y){const i=o*t+(n.position-e);i<=1.001&&r.push({position:clamp01(i),color:{...n.color}})}r.length>=2&&(y.length=0,y.push(...r),y[0].position>0&&y.unshift({position:0,color:{...y[0].color}}),y[y.length-1].position<1&&y.push({position:1,color:{...y[y.length-1].color}}))}}const b=2*p,x=2*f,tx=g-p,ty=u-f;return{type:"GRADIENT_RADIAL",gradientTransform:[[b,0,tx],[0,x,ty]],gradientStops:y}}catch(t){return safeGradientFallback(e)}}function parseAngularGradient(e,t=100,r=100,n=null){if(!e)return null;const o=e.includes("repeating-conic-gradient");if(!e.includes("conic-gradient"))return null;try{const i=e.indexOf("conic-gradient(");if(-1===i)return null;let a=0,s="";for(let t=i+14;t<e.length;t++)if("("===e[t])a++;else if(")"===e[t]&&(a--,0===a)){s=e.substring(i+15,t).trim();break}if(!s)return safeGradientFallback(e);s=s.replace(/\\bin\\s+(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|lab|oklab|xyz(?:-d50|-d65)?|hsl|hwb|lch|oklch)\\b/gi,"").trim();const l=Math.max(1,t||100),d=Math.max(1,r||100),c=n&&parseFloat(n.fontSize)||16;let g=0,u=.5,p=.5,f=s;const m=s.match(/^((?:from\\s+[^,]+|\\s*at\\s+[^,]+)+)\\s*,\\s*(.*)$/is);if(m){const e=m[1].trim();f=m[2].trim();const t=e.match(/from\\s+(?:calc\\(\\s*)?(-?[\\d.]+)(deg|rad|turn|grad)?(?:\\s*\\))?/i);if(t){const e=parseFloat(t[1]),r=(t[2]||"deg").toLowerCase();"deg"===r?g=e:"rad"===r?g=180*e/Math.PI:"turn"===r?g=360*e:"grad"===r&&(g=360*e/400)}g=((g%360)+360)%360;const r=e.match(/at\\s+(.+)$/i);if(r){const e=r[1].trim().split(/\\s+/),t=(e,t)=>e&&"center"!==e?"left"===e?0:"right"===e?1:"top"===e?0:"bottom"===e?1:e.endsWith("%")?parseFloat(e)/100:e.endsWith("px")?parseFloat(e)/(t?l:d):e.endsWith("rem")?16*parseFloat(e)/(t?l:d):.5:.5;e.length>=2?["top","bottom"].includes(e[0].toLowerCase())&&["left","right","center"].includes(e[1].toLowerCase())?(u=t(e[1],!0),p=t(e[0],!1)):(u=t(e[0],!0),p=t(e[1],!1)):1===e.length&&("top"===t[0].toLowerCase()||"bottom"===t[0].toLowerCase()?(u=.5,p=t(e[0],!1)):(u=t(e[0],!0),p=.5))}}const h=parseGradientColorStops(f,360,c);if(!h||0===h.length)return safeGradientFallback(e);if(o&&h.length>=2){const e=h[0].position,t=h[h.length-1].position-e;if(t>.005&&t<.95){const r=[],n=Math.min(30,Math.ceil(1/t));for(let o=0;o<n;o++)for(const n of h){const i=o*t+(n.position-e);i<=1.001&&r.push({position:clamp01(i),color:{...n.color}})}r.length>=2&&(h.length=0,h.push(...r),h[0].position>0&&h.unshift({position:0,color:{...h[0].color}}),h[h.length-1].position<1&&h.push({position:1,color:{...h[h.length-1].color}}))}}const y=(g-90)*Math.PI/180,b=Math.cos(y),x=-Math.sin(y),v=Math.sin(y),w=Math.cos(y),tx=u-(b*.5+x*.5),ty=p-(v*.5+w*.5);return{type:"GRADIENT_ANGULAR",gradientTransform:[[b,x,tx],[v,w,ty]],gradientStops:h}}catch(t){return safeGradientFallback(e)}}`;

  content = content.substring(0, startIdx) + newSubsystem + content.substring(endIdx);

  // 3. Stroke & Fill border-box gradient integration in applyStrokes
  const strokeBorderSearch = 'const d=t.borderImageSource&&"none"!==t.borderImageSource?t.borderImageSource:t.borderImage&&"none"!==t.borderImage&&t.borderImage.includes("gradient")?t.borderImage:null;';
  const strokeBorderReplace = `let d=t.borderImageSource&&"none"!==t.borderImageSource?t.borderImageSource:t.borderImage&&"none"!==t.borderImage&&t.borderImage.includes("gradient")?t.borderImage:null;const bwMax=Math.max(parseFloat(t.borderTopWidth)||0,parseFloat(t.borderRightWidth)||0,parseFloat(t.borderBottomWidth)||0,parseFloat(t.borderLeftWidth)||0);if(!d&&bwMax>0){const e=t.backgroundImage||t.background||"";if(e.includes("gradient")){const r=splitByTopLevelCommas(e),n=(t.backgroundClip||t.webkitBackgroundClip||"").toLowerCase(),o=splitByTopLevelCommas(n),i=o.some(e=>e.includes("padding-box")||e.includes("content-box"));for(let e=0;e<r.length;e++){const t=r[e];if(!t.includes("gradient"))continue;const a=o[e]||o[o.length-1]||"";if((a.includes("border-box")||t.includes("border-box"))&&i){d=t;break}}if(!d&&r.length>=2&&(!o||"transparent"===t.borderColor||"rgba(0, 0, 0, 0)"===t.borderColor)){const e=r[r.length-1];e.includes("gradient")&&(d=e)}}}`;
  
  if (content.includes(strokeBorderSearch)) {
    content = content.replace(strokeBorderSearch, strokeBorderReplace);
  } else {
    // If already modified by earlier version
    const prevStrokeSearch = `let d=t.borderImageSource&&"none"!==t.borderImageSource?t.borderImageSource:t.borderImage&&"none"!==t.borderImage&&t.borderImage.includes("gradient")?t.borderImage:null;if(!d&&(parseFloat(t.borderTopWidth)>0||parseFloat(t.borderRightWidth)>0)){const e=t.backgroundImage||t.background||"";if(e.includes("gradient")){const t=splitByTopLevelCommas(e);for(const r of t)if(r.includes("border-box")&&r.includes("gradient")){d=r;break}if(!d&&t.length>=2&&(!o||"transparent"===t.borderColor)){const e=t[t.length-1];e.includes("gradient")&&(d=e)}}}`;
    if (content.includes(prevStrokeSearch)) {
      content = content.replace(prevStrokeSearch, strokeBorderReplace);
    }
  }

  // 4. In applyFills, skip border-box gradient from fills if border width > 0
  const fillsSearch = 'for(let Ve=Xe.length-1;Ve>=0;Ve--){const Ye=Xe[Ve];';
  const fillsReplace = `const bwMax=Math.max(parseFloat(t.borderTopWidth)||0,parseFloat(t.borderRightWidth)||0,parseFloat(t.borderBottomWidth)||0,parseFloat(t.borderLeftWidth)||0),clipStr=(t.backgroundClip||t.webkitBackgroundClip||"").toLowerCase(),clipsList=splitByTopLevelCommas(clipStr),hasPadLayer=clipsList.some(e=>e.includes("padding-box")||e.includes("content-box"));for(let Ve=Xe.length-1;Ve>=0;Ve--){const Ye=Xe[Ve],layerClip=clipsList[Ve]||clipsList[clipsList.length-1]||"";if(bwMax>0&&hasPadLayer&&(layerClip.includes("border-box")||Ye.includes("border-box")))continue;if(bwMax>0&&clipsList.length>=2&&Ve===Xe.length-1&&(!t.borderTopColor||"rgba(0, 0, 0, 0)"===t.borderTopColor||"transparent"===t.borderTopColor))continue;`;
  
  const prevFillsSearch = 'for(let Ve=Xe.length-1;Ve>=0;Ve--){const Ye=Xe[Ve];if(Ye.includes("border-box")&&(parseFloat(t.borderTopWidth)>0||parseFloat(t.borderRightWidth)>0))continue;';
  if (content.includes(prevFillsSearch)) {
    content = content.replace(prevFillsSearch, fillsReplace);
  } else if (content.includes(fillsSearch)) {
    content = content.replace(fillsSearch, fillsReplace);
  }

  // 5. Uniform stroke weight when gradient stroke is used on rounded pill
  const strokeAssignSearch = 'if(c===g&&g===u&&u===p){e.strokes=[b],e.strokeAlign="INSIDE",e.strokeWeight=c;';
  const strokeAssignReplace = 'if(l&&bwMax>0&&c+g+u+p>0){e.strokes=[b],e.strokeAlign="INSIDE",e.strokeWeight=bwMax;return}if(c===g&&g===u&&u===p){e.strokes=[b],e.strokeAlign="INSIDE",e.strokeWeight=c;';
  if (content.includes(strokeAssignSearch)) {
    content = content.replace(strokeAssignSearch, strokeAssignReplace);
  }

  // 5b. Allow gradient masks to preserve pattern fills in applyFills
  const maskFillClearSearch = '(u||l&&!i)&&(a=[])';
  const maskFillClearReplace = '(u||(!((t.maskImage||"").includes("gradient")||(t.webkitMaskImage||"").includes("gradient"))&&l&&!i))&&(a=[])';
  if (content.includes(maskFillClearSearch)) {
    content = content.replace(maskFillClearSearch, maskFillClearReplace);
  }

  // 6. Suppress unwanted -50deg shimmer hover overlay, preserving authentic radar dot patterns
  const pseudoRenderSearch = 'const n=await renderNode(t,K,R,B,o,f,y,$,e,_,v,m);n&&le.push({domNode:t,figmaNode:n})';
  const pseudoRenderReplace = `const isPseudoChild=(t.isPseudo||t.id?.includes("pseudo")||t._domIndex===-1||t._domIndex===999999999);const childZ=parseInt(t.styles?.zIndex,10);const parentHasOpaqueBg=(K.fills&&K.fills.length>0&&K.fills.some(f=>f.type==="SOLID"?(f.opacity||1)>0.8:f.type?.startsWith("GRADIENT")));if(isPseudoChild&&childZ<0&&parentHasOpaqueBg&&((t.styles?.animation||"").includes("shimmer")||(t.styles?.backgroundImage||"").includes("-50deg"))){continue;}const n=await renderNode(t,K,R,B,o,f,y,$,e,_,v,m);n&&le.push({domNode:t,figmaNode:n})`;
  
  const prevPseudoRender = `const isPseudoChild=(t.isPseudo||t.id?.includes("pseudo")||t._domIndex===-1||t._domIndex===999999999);const childZ=parseInt(t.styles?.zIndex,10);const parentHasOpaqueBg=(K.fills&&K.fills.length>0&&K.fills.some(f=>f.type==="SOLID"?(f.opacity||1)>0.8:f.type?.startsWith("GRADIENT")));if(isPseudoChild&&childZ<0&&parentHasOpaqueBg&&((t.styles?.maskImage&&t.styles.maskImage.includes("gradient"))||(t.styles?.animation||"").includes("shimmer")||(t.styles?.animationPlayState||"").includes("paused"))){continue;}const n=await renderNode(t,K,R,B,o,f,y,$,e,_,v,m);n&&le.push({domNode:t,figmaNode:n})`;
  if (content.includes(prevPseudoRender)) {
    content = content.replace(prevPseudoRender, pseudoRenderReplace);
  } else if (content.includes(pseudoRenderSearch)) {
    content = content.replace(pseudoRenderSearch, pseudoRenderReplace);
  }

  return content;
}

// -------------------------------------------------------------
// PATCH SRC_ORIGINAL/CAPTURE.JS
// -------------------------------------------------------------
function patchSrcOriginalCaptureJS(content) {
  // 1. Upgrade isPatternGradient
  const isPatSearch = `function isPatternGradient(bgStr, bgSize, bgRepeat) {
    if (!bgStr || bgStr === 'none') return false;
    const lower = bgStr.toLowerCase();
    if (lower.includes('repeating-linear-gradient') ||
        lower.includes('repeating-radial-gradient') ||
        lower.includes('repeating-conic-gradient')) {
      return true;
    }
    const repeat = (bgRepeat || '').toLowerCase();
    const isRepeating = repeat.includes('repeat') && !repeat.includes('no-repeat');
    if (bgSize && bgSize !== 'auto' && bgSize !== 'cover' && bgSize !== 'contain') {
      const parts = bgSize.trim().split(/\\s+/);
      const isPercent = parts[0].endsWith('%');
      const w = parseFloat(parts[0]);
      if (!isPercent && w > 0 && (isRepeating || w <= 160) && (lower.includes('radial-gradient') || lower.includes('linear-gradient'))) {
        return true;
      }
    }
    return false;
  }`;

  const isPatReplace = `function isPatternGradient(bgStr, bgSize, bgRepeat) {
    if (!bgStr || bgStr === 'none') return false;
    const lower = bgStr.toLowerCase();
    if (lower.includes('repeating-linear-gradient') ||
        lower.includes('repeating-radial-gradient') ||
        lower.includes('repeating-conic-gradient')) {
      return true;
    }
    const repeat = (bgRepeat || '').toLowerCase();
    const isRepeating = (repeat.includes('repeat') || repeat === 'space' || repeat === 'round') && !repeat.includes('no-repeat');
    if (bgSize && bgSize !== 'auto' && bgSize !== 'cover' && bgSize !== 'contain') {
      const parts = bgSize.trim().split(/\\s+/);
      const isPercent = parts[0].endsWith('%');
      const w = parseFloat(parts[0]);
      if (isPercent && w < 99 && (isRepeating || lower.includes('gradient'))) {
        return true;
      }
      if (!isPercent && w > 0 && (isRepeating || w <= 180) && lower.includes('gradient')) {
        return true;
      }
    }
    if (isRepeating && lower.includes('gradient')) {
      return true;
    }
    return false;
  }`;

  if (content.includes(isPatSearch)) {
    content = content.replace(isPatSearch, isPatReplace);
  }

  // 2. Upgrade renderPatternToDataUrl to high-DPI with bgPos and borderRadius
  const renderPatSearch = `async function renderPatternToDataUrl(bgStr, bgSize, bgRepeat, width, height) {
    try {
      const w = Math.min(2048, Math.max(1, Math.round(width || 100)));
      const h = Math.min(2048, Math.max(1, Math.round(height || 100)));
      const sizeStr = bgSize || 'auto';
      const repeatStr = bgRepeat || 'repeat';

      const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${w}" height="\${h}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:\${w}px;height:\${h}px;background-image:\${bgStr};background-size:\${sizeStr};background-repeat:\${repeatStr};background-color:transparent;"></div>
        </foreignObject>
      </svg>\`;

      const img = new Image();
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.src = svgUrl;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0);

      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }`;

  const renderPatReplace = `async function renderPatternToDataUrl(bgStr, bgSize, bgRepeat, width, height, bgPos, borderRadius) {
    try {
      const w = Math.min(2048, Math.max(1, Math.round(width || 100)));
      const h = Math.min(2048, Math.max(1, Math.round(height || 100)));
      const sizeStr = bgSize || 'auto';
      const repeatStr = bgRepeat || 'repeat';
      const posCss = bgPos ? \`background-position:\${bgPos};\` : '';
      const radCss = borderRadius ? \`border-radius:\${borderRadius};\` : '';
      const safeBg = (bgStr || '').replace(/"/g, "'");

      const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${w}" height="\${h}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:\${w}px;height:\${h}px;background-image:\${safeBg};background-size:\${sizeStr};background-repeat:\${repeatStr};\${posCss}\${radCss}background-color:transparent;"></div>
        </foreignObject>
      </svg>\`;

      const img = new Image();
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.src = svgUrl;
      await img.decode();

      const canvas = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0);

      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }`;

  if (content.includes(renderPatSearch)) {
    content = content.replace(renderPatSearch, renderPatReplace);
  }

  // 3. Remove destructive convertMultipleBackgroundsToSvg in pseudo-elements
  const pseudoMultiSearch = `if (bgs.length > 1 && bgs.every(b => b.includes('linear-gradient'))) {
        const svgStr = convertMultipleBackgroundsToSvg(cs, pseudoRect.width, pseudoRect.height, cs.color);
        if (svgStr) {
          return {
            nodeType: ELEMENT_NODE,
            id: getNodeId('svg-bg-pseudo'),
            tag: 'SVG',
            content: svgStr,
            styles: styles,
            rect: pseudoRect
          };
        }
      }`;

  if (content.includes(pseudoMultiSearch)) {
    content = content.replace(pseudoMultiSearch, `/* preserved multi-gradient pseudo-element for Figma */`);
  }

  // 4. Remove destructive convertMultipleBackgroundsToSvg in elements
  const elMultiSearch = `else if (!isInline && !isRoot && bgs.length > 1 && bgs.every(b => b.includes('linear-gradient'))) {
        const fallbackSvg = convertMultipleBackgroundsToSvg(cs, docRect.width, docRect.height, cs.color || styles.color);
        if (fallbackSvg) {
          svgContent = fallbackSvg;
          styles.backgroundImage = 'none'; // Clear bg to prevent double rendering in code.js
        }
      }`;

  if (content.includes(elMultiSearch)) {
    content = content.replace(elMultiSearch, `/* preserved multi-gradient element for Figma */`);
  }

  return content;
}

// -------------------------------------------------------------
// EXECUTE
// -------------------------------------------------------------
const codeFiles = [
  'packages/figma-plugin/src/code.js',
  'HTML To Figma Perfect/packages/figma-plugin/src/code.js'
];

console.log('--- 1. Patching code.js files ---');
for (const relPath of codeFiles) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) continue;
  const original = fs.readFileSync(fullPath, 'utf8');
  const patched = patchCodeJS(original);
  validateJS(patched, relPath);
  fs.writeFileSync(fullPath, patched, 'utf8');
  console.log(`Successfully patched: ${relPath}`);
}

console.log('\n--- 2. Patching packages/chrome-extension/src_original/capture.js ---');
const srcOrigPath = path.resolve('packages/chrome-extension/src_original/capture.js');
const origCode = fs.readFileSync(srcOrigPath, 'utf8');
const patchedOrig = patchSrcOriginalCaptureJS(origCode);
validateJS(patchedOrig, 'src_original/capture.js');
fs.writeFileSync(srcOrigPath, patchedOrig, 'utf8');
console.log('Successfully patched src_original/capture.js');

console.log('\n--- 3. Running protect_extension.js to compile CWS-compliant capture.js ---');
require('./protect_extension.js');

// Also update webstore package
const webstoreCapture = path.resolve('packages/chrome-extension-webstore/capture.js');
if (fs.existsSync(webstoreCapture)) {
  const compCapture = fs.readFileSync('packages/chrome-extension/capture.js', 'utf8');
  fs.writeFileSync(webstoreCapture, compCapture, 'utf8');
  console.log('Synchronized packages/chrome-extension-webstore/capture.js');
}

console.log('\n--- 4. Building Figma Plugin dist ---');
require('./package_figma_plugin.js');

console.log('\n--- 5. Packaging Webstore Extension ---');
require('./package_webstore.js');

console.log('\n🎉 ALL UNIVERSAL GRADIENT FIXES COMPILED & PACKAGED SUCCESSFULLY!');
