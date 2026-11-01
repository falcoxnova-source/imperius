const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join('supabase', 'migrations', '20260618360000_military_smart_focus.sql'), 'utf8');
console.log('File length:', content.length);

const stmts = [];
let current = '';
let inDollar = false;
let dollarTag = '';
let inSingleQuote = false;
let i = 0;

while (i < content.length) {
  const ch = content[i];
  
  if (ch === '-' && content[i+1] === '-') {
    if (!inDollar && !inSingleQuote) {
      let end = content.indexOf('\n', i);
      if (end === -1) end = content.length;
      i = end;
      continue;
    }
  }
  
  if (ch === '/' && content[i+1] === '*') {
    if (!inDollar && !inSingleQuote) {
      let end = content.indexOf('*/', i + 2);
      if (end === -1) end = content.length - 2;
      i = end + 2;
      continue;
    }
  }
  
  if (ch === '$' && !inDollar && !inSingleQuote) {
    let endIdx = content.indexOf('$', i + 1);
    if (endIdx !== -1) {
      dollarTag = content.substring(i, endIdx + 1);
      inDollar = true;
      current += ch;
      i++;
      continue;
    }
  }
  
  if (inDollar) {
    current += ch;
    if (content.substring(i - dollarTag.length + 1, i + 1) === dollarTag && current.length > dollarTag.length) {
      inDollar = false;
      dollarTag = '';
    }
    i++;
    continue;
  }
  
  if (ch === "'" && !inDollar) {
    inSingleQuote = !inSingleQuote;
  }
  
  if (ch === ';' && !inDollar && !inSingleQuote) {
    const trimmed = current.trim();
    if (trimmed) stmts.push(trimmed);
    current = '';
    i++;
    continue;
  }
  
  current += ch;
  i++;
}

const trimmed = current.trim();
if (trimmed) stmts.push(trimmed);

console.log('Statements found:', stmts.length);
stmts.forEach((s, idx) => {
  const first = s.substring(0, 100).replace(/\n/g, ' ');
  console.log((idx+1) + ': ' + first + '...');
});
