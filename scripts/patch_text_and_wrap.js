const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..');

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

  // Let's find:
  // if(e.id&&(e.id.includes("input-text")||e.id.includes("select-text"))&&U>0&&H>0){...}else if(C&&U>0){...}
  const needle = 'else if(C&&U>0){f.textAutoResize="HEIGHT";';
  const idx1 = code.indexOf(needle);
  if (idx1 === -1) {
    console.error('Needle not found in:', file);
    process.exit(1);
  }

  // Find the end of this multiline handling before const _isClampedText
  const idx2 = code.indexOf('const _isClampedText=', idx1);
  if (idx2 === -1) {
    console.error('_isClampedText not found in:', file);
    process.exit(1);
  }

  const existingBlock = code.slice(idx1, idx2);
  // existingBlock is: else if(C&&U>0){f.textAutoResize="HEIGHT";...}

  // We want:
  // else if(Boolean(h&&h.includes("\n"))&&U>0){
  //   f.textAutoResize="WIDTH_AND_HEIGHT";
  //   if(_rotationRoot||e._localRect){
  //     f.x=O;f.y=z;
  //   }else if("center"===G){
  //     try{f.textAlignHorizontal="CENTER"}catch{}
  //     f.x=Math.round(O-(f.width-U)/2);f.y=z;
  //   }else if("right"===G||"end"===G){
  //     try{f.textAlignHorizontal="RIGHT"}catch{}
  //     f.x=Math.round(O-(f.width-U));f.y=z;
  //   }else{
  //     try{f.textAlignHorizontal="LEFT"}catch{}
  //     f.x=O;f.y=z;
  //   }
  // }
  // followed by existingBlock!
  const newExplicitNewlineBranch = `else if(Boolean(h&&h.includes("\\n"))&&U>0){f.textAutoResize="WIDTH_AND_HEIGHT";if(_rotationRoot||e._localRect){f.x=O;f.y=z}else if("center"===G){try{f.textAlignHorizontal="CENTER"}catch{}f.x=Math.round(O-(f.width-U)/2);f.y=z}else if("right"===G||"end"===G){try{f.textAlignHorizontal="RIGHT"}catch{}f.x=Math.round(O-(f.width-U));f.y=z}else{try{f.textAlignHorizontal="LEFT"}catch{}f.x=O;f.y=z}}`;

  const replacement = newExplicitNewlineBranch + existingBlock;

  code = code.slice(0, idx1) + replacement + code.slice(idx2);

  try {
    acorn.parse(code, { ecmaVersion: 2022 });
    console.log('✓ Acorn parse valid:', file);
  } catch (err) {
    console.error('❌ Acorn syntax error in:', file, err.message);
    process.exit(1);
  }

  fs.writeFileSync(file, code, 'utf8');
  console.log('✓ Successfully patched:', file);
}
