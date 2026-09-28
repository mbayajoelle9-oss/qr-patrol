// Vérifie la syntaxe de tous les fichiers JS (node --check)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (f === 'node_modules') continue;
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(__dirname, '..', 'src')), ...walk(__dirname)];
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed += 1;
    console.error(`✖ ${f}\n${e.stderr}`);
  }
}
console.log(`${files.length - failed}/${files.length} fichiers OK`);
process.exit(failed ? 1 : 0);
