const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.resolve(__dirname, 'figma-plugin/src/ui.html'),
  path.resolve(__dirname, '../packages/figma-plugin/src/ui.html'),
  path.resolve(__dirname, '../HTML To Figma Perfect/packages/figma-plugin/src/ui.html'),
];

const SCROLLBAR_CSS = `
  /* Modern Sleek Custom Scrollbar */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    transition: background 0.2s ease;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(99, 102, 241, 0.55);
  }
  ::-webkit-scrollbar-thumb:active {
    background: rgba(99, 102, 241, 0.85);
  }
  ::-webkit-scrollbar-corner {
    background: transparent;
  }
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
  }
`;

const ANCHOR = '-webkit-font-smoothing: antialiased;\n  }';
const ANCHOR_CRLF = '-webkit-font-smoothing: antialiased;\r\n  }';

for (const f of targetFiles) {
  if (!fs.existsSync(f)) {
    console.log('Skipping (not found):', f);
    continue;
  }
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('::-webkit-scrollbar')) {
    console.log('Already has custom scrollbar:', f);
    continue;
  }
  
  if (content.includes(ANCHOR_CRLF)) {
    content = content.replace(ANCHOR_CRLF, ANCHOR_CRLF + '\r\n' + SCROLLBAR_CSS.replace(/\n/g, '\r\n'));
    fs.writeFileSync(f, content, 'utf8');
    console.log('Patched (CRLF):', f);
  } else if (content.includes(ANCHOR)) {
    content = content.replace(ANCHOR, ANCHOR + '\n' + SCROLLBAR_CSS);
    fs.writeFileSync(f, content, 'utf8');
    console.log('Patched (LF):', f);
  } else {
    console.warn('Could not find anchor in:', f);
  }
}
