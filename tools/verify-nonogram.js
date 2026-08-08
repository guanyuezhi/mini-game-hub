/**
 * verify-nonogram.js
 * 校验 games/nonogram.html 内固化的关卡表：
 *  1) sol 长度 === size²，字符 ∈ {0,1}
 *  2) matchesClues(size, rows, cols, sol) —— 由 sol 推导出的行列提示 === LEVELS[li].rows/cols
 *  3) countSolutions(size, rows, cols, 2) === 1 —— 唯一解
 *  4) 无全空行/全空列（rows/cols 不含 [0]）
 * 用法: node tools/verify-nonogram.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'nonogram.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('❌ 未找到内联脚本'); process.exit(1); }
const js = m[1];

// ---- DOM 桩（共享 _dom_stub） ----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

if (!api || !Array.isArray(api.LEVELS)) {
  console.error('window.__game 未导出 LEVELS，检查 games/nonogram.html 的 window.__game = {...}');
  process.exit(1);
}
for (const f of ['cluesOf', 'genLineCandidates', 'countSolutions', 'matchesClues']) {
  if (typeof api[f] !== 'function') {
    console.error('window.__game 缺少导出: ' + f);
    process.exit(1);
  }
}

let ok = true;
const sizes = [];
for (let li = 0; li < api.LEVELS.length; li++) {
  const lv = api.LEVELS[li];
  const n = lv.size * lv.size;
  const lenOk = typeof lv.sol === 'string' && lv.sol.length === n;
  const charsOk = typeof lv.sol === 'string' && /^[01]+$/.test(lv.sol);
  const solValid = lenOk && charsOk;
  const match = solValid && api.matchesClues(lv.size, lv.rows, lv.cols, lv.sol);
  const cnt = api.countSolutions(lv.size, lv.rows, lv.cols, 2);
  const unique = cnt === 1;
  const noEmpty = Array.isArray(lv.rows) && Array.isArray(lv.cols) &&
    lv.rows.every(r => !(r.length === 1 && r[0] === 0)) &&
    lv.cols.every(c => !(c.length === 1 && c[0] === 0));
  sizes.push(lv.size);

  console.log(
    `L${li + 1}: size=${lv.size} 长度=${lv.sol.length}/${n} ${lenOk ? 'OK' : 'FAIL'} ` +
    `字符=${charsOk ? 'OK' : 'FAIL'} 提示匹配=${match ? 'OK' : 'FAIL'} ` +
    `解数=${cnt} 唯一=${unique ? 'OK' : 'FAIL'} 无空行列=${noEmpty ? 'OK' : 'FAIL'}`
  );
  if (!lenOk || !charsOk || !match || !unique || !noEmpty) ok = false;
}

console.log('\n尺寸序列: ' + sizes.join(','));
console.log('总关数: ' + api.LEVELS.length);
console.log(ok ? '✅ verify-nonogram 通过' : '❌ verify-nonogram 失败');
process.exit(ok ? 0 : 1);
