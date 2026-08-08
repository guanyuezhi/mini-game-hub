/**
 * verify-pipes.js
 * 校验 games/pipes.html 内固化的关卡表（12 关）：
 *  1) 结构：t/s/init 长度 === r*c，字符合法（t∈0-2，s/init∈0-3），直管 s/init 只含 0/1
 *  2) s 解 isSolved === true（全连通）
 *  3) init 未通关（isSolved(types, init) === false）
 *  4) t 与 s 一致：由 s 的开口集合推导的类型 === t
 * 用法: node tools/verify-pipes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'pipes.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script'); process.exit(1); }
const js = m[1];

// ---- DOM/Canvas 桩（共享 _dom_stub） ----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

function parseStr(s) { return s.replace(/\s+/g, '').split('').map(Number); }

// 由开口集合推导类型（0直 1弯 2丁）
function deriveFromOpenings(op) {
  const dirs = [];
  for (let d = 0; d < 4; d++) if (op[d]) dirs.push(d);
  if (dirs.length === 2) {
    if ((dirs[0] === 0 && dirs[1] === 2) || (dirs[0] === 1 && dirs[1] === 3)) return 0;
    return 1;
  }
  if (dirs.length === 3) return 2;
  return -1;
}

let ok = true;
for (let li = 0; li < api.LEVELS.length; li++) {
  const L = api.LEVELS[li];
  const r = L.r, c = L.c, n = r * c;
  const t = parseStr(L.t), s = parseStr(L.s), init = parseStr(L.init);

  const lenOk = t.length === n && s.length === n && init.length === n;
  const tOk = t.every(x => x === 0 || x === 1 || x === 2);
  const sOk = s.every(x => x >= 0 && x <= 3);
  const initOk = init.every(x => x >= 0 && x <= 3);
  const straightOk = t.every((typ, i) => typ !== 0 || (s[i] <= 1 && init[i] <= 1));
  const solved = api.isSolved(t, s, r, c);
  const initUnsolved = !api.isSolved(t, init, r, c);

  let typeOk = true;
  for (let i = 0; i < n; i++) {
    if (deriveFromOpenings(api.openingsOf(t[i], s[i])) !== t[i]) { typeOk = false; break; }
  }

  console.log(
    'L' + (li + 1) + ': ' + r + 'x' + c + ' ' +
    '长度=' + (lenOk ? '✓' : '✗') +
    ' 类型集=' + (tOk ? '✓' : '✗') +
    ' 旋转集=' + ((sOk && initOk) ? '✓' : '✗') +
    ' 直管0/1=' + (straightOk ? '✓' : '✗') +
    ' 解连通=' + (solved ? '✓' : '✗') +
    ' 开局未解=' + (initUnsolved ? '✓' : '✗') +
    ' t↔s一致=' + (typeOk ? '✓' : '✗')
  );
  if (!lenOk || !tOk || !sOk || !initOk || !straightOk || !solved || !initUnsolved || !typeOk) ok = false;
}

// 附带：rotatable 行为正确性（直 0↔1；弯/丁 +1 mod 4）
let rotOk = true;
for (let t = 0; t < 3; t++) {
  const max = t === 0 ? 2 : 4;
  for (let ro = 0; ro < max; ro++) {
    const next = api.rotatable(t, ro);
    if (t === 0) { if (next !== (ro + 1) % 2) rotOk = false; }
    else { if (next !== (ro + 1) % 4) rotOk = false; }
  }
}
console.log('rotatable 正确=' + (rotOk ? '✓' : '✗'));
if (!rotOk) ok = false;

console.log(ok ? '✅ verify-pipes 通过' : '❌ verify-pipes 未通过');
process.exit(ok ? 0 : 1);
