/**
 * verify-lights-out.js
 * 校验 games/lights-out.html 内固化的关卡表：
 *  1) board 长度 === size²，字符 ∈ {0,1}
 *  2) optimalOf(board, size) 重算 === LEVELS[li].optimal（与离线生成器算法一致）
 *  3) board 确实可解（optimalOf 返回非 null）
 * 用法: node tools/verify-lights-out.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'lights-out.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no inline script block'); process.exit(1); }
const js = m[1];

// ---- DOM 桩（共享 _dom_stub） ----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

if (!api || !Array.isArray(api.LEVELS)) {
  console.error('window.__game 未导出 LEVELS，检查 games/lights-out.html 的 window.__game = {...}');
  process.exit(1);
}
if (typeof api.optimalOf !== 'function' || typeof api.toggle !== 'function' || typeof api.isAllOff !== 'function') {
  console.error('window.__game 缺少 toggle / isAllOff / optimalOf 导出');
  process.exit(1);
}

let ok = true;
const seq = [];
for (let li = 0; li < api.LEVELS.length; li++) {
  const lv = api.LEVELS[li];
  const n = lv.size * lv.size;
  const lenOk = typeof lv.board === 'string' && lv.board.length === n;
  const charsOk = typeof lv.board === 'string' && /^[01]+$/.test(lv.board);
  const opt = api.optimalOf(lv.board, lv.size);
  const solvable = opt !== null;
  const match = solvable && opt === lv.optimal;
  seq.push(opt);

  console.log(
    `L${li + 1}: size=${lv.size} optimal=${lv.optimal} 长度=${lv.board.length}/${n} ${lenOk ? 'OK' : 'FAIL'} ` +
    `字符=${charsOk ? 'OK' : 'FAIL'} 可解=${solvable} 重算=${opt} 一致=${match}`
  );
  if (!lenOk || !charsOk || !solvable || !match) ok = false;
}

console.log('\noptimal 序列: ' + seq.join(','));
console.log(ok ? '✅ verify-lights-out 通过' : '❌ verify-lights-out 失败');
process.exit(ok ? 0 : 1);
