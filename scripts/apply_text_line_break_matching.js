const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..');

// =========================================================================
// 1. Patch Figma Plugin code.js files to preserve \n line breaks
// =========================================================================
const codeFiles = [
  path.join(rootDir, 'packages/figma-plugin/src/code.js'),
  path.join(rootDir, 'HTML To Figma Perfect/packages/figma-plugin/src/code.js')
];

for (const file of codeFiles) {
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }
  let code = fs.readFileSync(file, 'utf8');

  const idx1 = code.indexOf('const p=g.whiteSpace');
  const idx2 = code.indexOf(',!u||!u.trim())return;', idx1);

  if (idx1 !== -1 && idx2 !== -1) {
    const targetSlice = code.slice(idx1, idx2 + 22);
    const replSlice = 'const p=g.whiteSpace||"normal";if("nowrap"===p){u=u.replace(/[\\r\\n\\t\\u2028\\u2029]+/g," ").replace(/ +/g," ")}else{u=u.replace(/[ \\t\\f\\v]+/g," ").replace(/[\\r\\u2028\\u2029]/g,"\\n").replace(/ \\n/g,"\\n").replace(/\\n /g,"\\n")}if(!u||!u.trim())return;';
    code = code.replace(targetSlice, replSlice);
    console.log(`✓ Preserved \\n in ${file}`);
  } else if (code.includes('if("nowrap"===p)')) {
    console.log(`- Already preserved \\n in ${file}`);
  } else {
    console.error(`❌ targetCodeWs not found in ${file}`);
    process.exit(1);
  }

  try {
    acorn.parse(code, { ecmaVersion: 2022 });
    console.log(`✓ Acorn valid: ${file}`);
  } catch (err) {
    console.error(`❌ Acorn syntax error in ${file}:`, err.message);
    process.exit(1);
  }

  fs.writeFileSync(file, code, 'utf8');
}

// =========================================================================
// 2. Patch Chrome Extension src_original/capture.js
// =========================================================================
const captureFile = path.join(rootDir, 'packages/chrome-extension/src_original/capture.js');
let captureCode = fs.readFileSync(captureFile, 'utf8');
const hadCRLF = captureCode.includes('\r\n');
if (hadCRLF) {
  captureCode = captureCode.replace(/\r\n/g, '\n');
}

// Helper functions to insert right before buildUnifiedTextNode
const helperFns = `
  function isElementOnNewLine(currNode, prevEl) {
    if (!currNode || !prevEl) return false;
    try {
      let currTop = 0;
      let currH = 0;
      if (currNode.nodeType === 3) {
        const rng = document.createRange();
        rng.selectNodeContents(currNode);
        const cr = rng.getBoundingClientRect();
        rng.detach();
        currTop = cr.top;
        currH = cr.height;
      } else if (currNode.nodeType === 1) {
        const cr = currNode.getBoundingClientRect();
        currTop = cr.top;
        currH = cr.height;
      }
      const prevRect = prevEl.getBoundingClientRect();
      if (currH <= 0 || prevRect.height <= 0) return false;
      return currTop > prevRect.top + prevRect.height * 0.45;
    } catch (_) {
      return false;
    }
  }

  function insertRenderedLineBreaks(textNode, formattedText) {
    if (!textNode || textNode.nodeType !== 3 || !formattedText || formattedText.length < 4) {
      return formattedText;
    }
    if (formattedText.includes('\\n')) {
      return formattedText;
    }
    try {
      const rng = document.createRange();
      rng.selectNodeContents(textNode);
      const clientRects = rng.getClientRects();
      if (clientRects.length <= 1) {
        rng.detach();
        return formattedText;
      }

      const lines = [];
      for (let i = 0; i < clientRects.length; i++) {
        const cr = clientRects[i];
        if (cr.width <= 0 || cr.height <= 0) continue;
        const existing = lines.find(l => Math.abs(l.top - cr.top) < Math.max(4, cr.height * 0.35));
        if (!existing) {
          lines.push({ top: cr.top, bottom: cr.bottom });
        } else {
          existing.top = Math.min(existing.top, cr.top);
          existing.bottom = Math.max(existing.bottom, cr.bottom);
        }
      }

      if (lines.length <= 1) {
        rng.detach();
        return formattedText;
      }
      lines.sort((a, b) => a.top - b.top);

      const raw = textNode.textContent;
      if (!raw) {
        rng.detach();
        return formattedText;
      }

      const spaceRegex = /\\s+/g;
      let m;
      let currentLineIdx = 0;
      const breakIndicesInRaw = new Set();

      while ((m = spaceRegex.exec(raw)) !== null) {
        const nextCharIdx = m.index + m[0].length;
        if (nextCharIdx >= raw.length) break;

        rng.setStart(textNode, nextCharIdx);
        rng.setEnd(textNode, nextCharIdx + 1);
        const charRect = rng.getBoundingClientRect();
        if (charRect.width > 0 && charRect.height > 0) {
          const midY = charRect.top + charRect.height / 2;
          if (midY > lines[currentLineIdx].bottom - 3) {
            breakIndicesInRaw.add(m.index);
            for (let li = currentLineIdx + 1; li < lines.length; li++) {
              if (midY >= lines[li].top - 4 && midY <= lines[li].bottom + 4) {
                currentLineIdx = li;
                break;
              }
            }
          }
        }
      }
      rng.detach();

      if (breakIndicesInRaw.size === 0) {
        return formattedText;
      }

      const words = formattedText.split(' ');
      if (words.length <= 1) return formattedText;

      const newWords = [];
      let cumRaw = 0;

      for (let w = 0; w < words.length; w++) {
        newWords.push(words[w]);
        if (w < words.length - 1) {
          const wordInRaw = raw.indexOf(words[w], cumRaw);
          if (wordInRaw !== -1) {
            cumRaw = wordInRaw + words[w].length;
            let hasBreak = false;
            for (const bp of breakIndicesInRaw) {
              if (bp >= cumRaw - 1 && bp <= cumRaw + 4) {
                hasBreak = true;
                break;
              }
            }
            if (hasBreak) {
              newWords.push('\\n');
              continue;
            }
          }
          newWords.push(' ');
        }
      }

      return newWords.join('');
    } catch (_) {
      return formattedText;
    }
  }
`;

// Insert helperFns before buildUnifiedTextNode if not already there
if (!captureCode.includes('function insertRenderedLineBreaks(')) {
  const targetBeforeBuild = '  function buildUnifiedTextNode(el, containerStyles, fonts) {';
  if (!captureCode.includes(targetBeforeBuild)) {
    console.error('❌ targetBeforeBuild not found in capture.js');
    process.exit(1);
  }
  captureCode = captureCode.replace(targetBeforeBuild, helperFns + '\n' + targetBeforeBuild);
  console.log('✓ Inserted helper functions into capture.js');
} else {
  console.log('- Helper functions already in capture.js');
}

// Patch buildUnifiedTextNode walk
const targetWalk1 = `        if (fullText.length > 0 && !fullText.endsWith(' ') && !fullText.endsWith('\\n') && !t.startsWith(' ')) {
          if (lastTextElement && lastTextElement !== node.parentElement) {
            const word1 = lastTextElement.closest?.('.word');
            const word2 = node.parentElement?.closest?.('.word');
            const inSameWord = word1 && word2 && word1 === word2;
            const isChar1 = lastTextElement.classList?.contains('char') || lastTextElement.hasAttribute?.('data-char');
            const isChar2 = node.parentElement?.classList?.contains('char') || node.parentElement?.hasAttribute?.('data-char');
            const isCharInsideWord = inSameWord || (!word1 && !word2 && isChar1 && isChar2);
            if (!isCharInsideWord) {
              fullText += ' ';
            }
          }
        }
        lastTextElement = node.parentElement;
        const start = fullText.length;
        fullText += t;
        const end = fullText.length;`;

const replWalk1 = `        if (fullText.length > 0 && !fullText.endsWith(' ') && !fullText.endsWith('\\n') && !t.startsWith(' ') && !t.startsWith('\\n')) {
          if (lastTextElement && lastTextElement !== node.parentElement) {
            const word1 = lastTextElement.closest?.('.word');
            const word2 = node.parentElement?.closest?.('.word');
            const inSameWord = word1 && word2 && word1 === word2;
            const isChar1 = lastTextElement.classList?.contains('char') || lastTextElement.hasAttribute?.('data-char');
            const isChar2 = node.parentElement?.classList?.contains('char') || node.parentElement?.hasAttribute?.('data-char');
            const isCharInsideWord = inSameWord || (!word1 && !word2 && isChar1 && isChar2);
            if (!isCharInsideWord) {
              const isNewLine = isElementOnNewLine(node, lastTextElement);
              fullText += isNewLine ? '\\n' : ' ';
            }
          }
        }
        lastTextElement = node.parentElement;
        t = insertRenderedLineBreaks(node, t);
        const start = fullText.length;
        fullText += t;
        const end = fullText.length;`;

if (captureCode.includes(targetWalk1)) {
  captureCode = captureCode.replace(targetWalk1, replWalk1);
  console.log('✓ Patched walk in buildUnifiedTextNode');
} else if (captureCode.includes(replWalk1)) {
  console.log('- Already patched walk in buildUnifiedTextNode');
} else {
  console.error('❌ targetWalk1 not found in capture.js');
  process.exit(1);
}

// Patch lineCount in buildUnifiedTextNode
const targetLineCount1 = `lineCount: Math.max(1, Math.round((contentHeight || rect.height) / (parseFloat(effectiveStyles.lineHeight) || (parseFloat(effectiveStyles.fontSize) || 16) * 1.4))),`;
const replLineCount1 = `lineCount: Math.max(1, fullText.split('\\n').length),`;

if (captureCode.includes(targetLineCount1)) {
  captureCode = captureCode.replace(targetLineCount1, replLineCount1);
  console.log('✓ Patched lineCount in buildUnifiedTextNode');
} else if (captureCode.includes(replLineCount1)) {
  console.log('- Already patched lineCount in buildUnifiedTextNode');
} else {
  console.error('❌ targetLineCount1 not found in capture.js');
  process.exit(1);
}

// Patch buildUnifiedTextFromRun walk
const targetWalk2 = `        if (fullText.length > 0 && !fullText.endsWith(' ') && !fullText.endsWith('\\n') && !t.startsWith(' ')) {
          if (lastTextElement && lastTextElement !== node.parentElement) {
            fullText += ' ';
          }
        }
        lastTextElement = node.parentElement;
        const start = fullText.length;
        fullText += t;
        const end = fullText.length;`;

const replWalk2 = `        if (fullText.length > 0 && !fullText.endsWith(' ') && !fullText.endsWith('\\n') && !t.startsWith(' ') && !t.startsWith('\\n')) {
          if (lastTextElement && lastTextElement !== node.parentElement) {
            const isNewLine = isElementOnNewLine(node, lastTextElement);
            fullText += isNewLine ? '\\n' : ' ';
          }
        }
        lastTextElement = node.parentElement;
        t = insertRenderedLineBreaks(node, t);
        const start = fullText.length;
        fullText += t;
        const end = fullText.length;`;

if (captureCode.includes(targetWalk2)) {
  captureCode = captureCode.replace(targetWalk2, replWalk2);
  console.log('✓ Patched walk in buildUnifiedTextFromRun');
} else if (captureCode.includes(replWalk2)) {
  console.log('- Already patched walk in buildUnifiedTextFromRun');
} else {
  console.error('❌ targetWalk2 not found in capture.js');
  process.exit(1);
}

// Patch lineCount in buildUnifiedTextFromRun
const targetLineCount2 = `lineCount: Math.max(1, Math.round(runH / (parseFloat(effectiveStyles.lineHeight) || (parseFloat(effectiveStyles.fontSize) || 16) * 1.4))),`;
const replLineCount2 = `lineCount: Math.max(1, fullText.split('\\n').length),`;

if (captureCode.includes(targetLineCount2)) {
  captureCode = captureCode.replace(targetLineCount2, replLineCount2);
  console.log('✓ Patched lineCount in buildUnifiedTextFromRun');
} else if (captureCode.includes(replLineCount2)) {
  console.log('- Already patched lineCount in buildUnifiedTextFromRun');
} else {
  console.error('❌ targetLineCount2 not found in capture.js');
  process.exit(1);
}

// Patch serializeTextNode
const targetSerText = `      if (clientRects.length <= 1 || isRotated || !parentHasMultipleChildren || lastTextNode !== node) {
        let text = formatInlineText(rawText);`;
const replSerText = `      if (clientRects.length <= 1 || isRotated || !parentHasMultipleChildren || lastTextNode !== node) {
        let text = formatInlineText(rawText);
        if (clientRects.length > 1 && !isRotated) {
          text = insertRenderedLineBreaks(node, text);
        }`;

if (captureCode.includes(targetSerText)) {
  captureCode = captureCode.replace(targetSerText, replSerText);
  console.log('✓ Patched serializeTextNode with insertRenderedLineBreaks');
} else if (captureCode.includes(replSerText)) {
  console.log('- Already patched serializeTextNode');
} else {
  console.error('❌ targetSerText not found in capture.js');
  process.exit(1);
}

// Restore CRLF if needed
if (hadCRLF) {
  captureCode = captureCode.replace(/\n/g, '\r\n');
}

try {
  acorn.parse(captureCode, { ecmaVersion: 2022 });
  console.log('✓ Acorn valid: capture.js');
} catch (err) {
  console.error('❌ Acorn syntax error in capture.js:', err.message);
  process.exit(1);
}

fs.writeFileSync(captureFile, captureCode, 'utf8');
console.log('✓ capture.js successfully updated!\n');
