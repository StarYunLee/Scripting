// tools/check-syntax.js —— 用法: npx --yes -p typescript@5 node tools/check-syntax.js "AI Usage"
// npm 12 的 npx -p 不再把包装进 require 路径，所以从 npx 缓存兜底解析
const fs = require('fs'), path = require('path');
function loadTs() {
  try { return require('typescript'); } catch { /* fall through */ }
  const cache = path.join(require('os').homedir(), '.npm', '_npx');
  let dirs = [];
  try { dirs = fs.readdirSync(cache); } catch { /* fall through */ }
  for (const dir of dirs) {
    const cand = path.join(cache, dir, 'node_modules', 'typescript');
    try {
      if (fs.existsSync(path.join(cand, 'package.json'))) return require(cand);
    } catch { /* 该缓存副本可能不完整，试下一个 */ }
  }
  console.error('找不到 typescript 包，请先运行: npx --yes -p typescript@5 tsc --version');
  process.exit(2);
}
const ts = loadTs();
const root = process.argv[2] || 'AI Usage';
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};
let bad = 0;
const files = walk(root);
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.ESNext, true,
    f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const d of sf.parseDiagnostics || []) {
    if (!bad++) console.log('');
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
    console.log(`${path.relative(root, f)}:${line + 1}:${character + 1}  TS${d.code}  ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
}
console.log(`\n${files.length} files parsed, ${bad} syntax error(s)`);
process.exit(bad ? 1 : 0);
