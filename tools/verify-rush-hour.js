/**
 * verify-rush-hour.js
 * 校验 games/rush-hour.html 内固化的关卡表：
 *  1) 结构合法：6×6 内、车不重叠、len ∈ {2,3}、横车/竖车不越界、恰好一辆红车
 *  2) 红车规格：r===2、v===0（横向）、len===2
 *  3) 开局未过（isWin 为 false）
 *  4) 用游戏内同款 BFS（nodeLimit 300000）重算 minMoves === LEVELS[li].minSteps
 * 用法: node tools/verify-rush-hour.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'rush-hour.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到内联 <script> 块（注意：save.js 的 src 标签不受影响）'); process.exit(1); }
const js = m[1];

// ---- DOM 桩（共享 _dom_stub） ----
const stub = require('./_dom_stub');
const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

if (!api || !Array.isArray(api.LEVELS)) {
  console.error('window.__game 未导出 LEVELS，检查 games/rush-hour.html 的 window.__game = {...}');
  process.exit(1);
}
for (const f of ['slideCars', 'moveCar', 'isWin', 'solveBFS']) {
  if (typeof api[f] !== 'function') {
    console.error('window.__game 缺少导出 ' + f);
    process.exit(1);
  }
}

const SIZE = 6;

// 车占用的格子列表 [[r,c], ...]
function carCells(car) {
  const cells = [];
  for (let i = 0; i < car.len; i++) {
    if (car.v === 0) cells.push([car.r, car.c + i]);
    else cells.push([car.r + i, car.c]);
  }
  return cells;
}

function checkLevel(lv, li) {
  const probs = [];
  if (lv.size !== SIZE) probs.push('size=' + lv.size);
  if (!Array.isArray(lv.cars) || lv.cars.length === 0) probs.push('cars 为空');
  if (typeof lv.minSteps !== 'number') probs.push('minSteps 缺失');

  if (Array.isArray(lv.cars)) {
    const reds = lv.cars.filter(c => c && c.red === 1);
    if (reds.length !== 1) probs.push('红车数量=' + reds.length);
    if (reds.length === 1) {
      const red = reds[0];
      if (red.r !== 2) probs.push('红车 r=' + red.r + '（应为 2）');
      if (red.v !== 0) probs.push('红车 v=' + red.v + '（应为 0 横向）');
      if (red.len !== 2) probs.push('红车 len=' + red.len + '（应为 2）');
    }
    for (let i = 0; i < lv.cars.length; i++) {
      const c = lv.cars[i];
      if (!c || typeof c.r !== 'number' || typeof c.c !== 'number' ||
          typeof c.len !== 'number' || typeof c.v !== 'number') {
        probs.push('车' + i + ' 字段缺失'); continue;
      }
      if (c.len !== 2 && c.len !== 3) probs.push('车' + i + ' len=' + c.len);
      if (c.r < 0 || c.c < 0) probs.push('车' + i + ' 负坐标(' + c.r + ',' + c.c + ')');
      if (c.v === 0) {
        if (c.c + c.len > SIZE) probs.push('车' + i + ' 横越界 c=' + c.c + ' len=' + c.len);
        if (c.r >= SIZE) probs.push('车' + i + ' 行越界 r=' + c.r);
      } else if (c.v === 1) {
        if (c.r + c.len > SIZE) probs.push('车' + i + ' 竖越界 r=' + c.r + ' len=' + c.len);
        if (c.c >= SIZE) probs.push('车' + i + ' 列越界 c=' + c.c);
      } else {
        probs.push('车' + i + ' v=' + c.v + '（应 0/1）');
      }
    }
    // 重叠检查
    const seen = new Set();
    for (const c of lv.cars) {
      for (const [r, cc] of carCells(c)) {
        const k = r * SIZE + cc;
        if (seen.has(k)) { probs.push('格子重叠于(' + r + ',' + cc + ')'); break; }
        seen.add(k);
      }
    }
    // 开局未过
    if (api.isWin(lv.cars, SIZE)) probs.push('开局已过关（红车已在最右）');
    // BFS 重算
    const mm = api.solveBFS(lv.cars, SIZE, 300000);
    if (mm === null) probs.push('solveBFS 无解/超限');
    else if (mm !== lv.minSteps) probs.push('solveBFS=' + mm + ' !== minSteps=' + lv.minSteps);
  }
  return probs;
}

let ok = true;
const seq = [];
for (let li = 0; li < api.LEVELS.length; li++) {
  const lv = api.LEVELS[li];
  const probs = checkLevel(lv, li);
  const pass = probs.length === 0;
  if (!pass) ok = false;
  seq.push(lv.minSteps);
  console.log(
    'L' + (li + 1) + ': minSteps=' + lv.minSteps + ' 车数=' + (lv.cars ? lv.cars.length : '-') +
    ' ' + (pass ? 'OK' : 'FAIL  [' + probs.join('; ') + ']')
  );
}

console.log('\nminSteps 序列: ' + seq.join(','));
console.log(ok ? '✅ verify-rush-hour 通过' : '❌ verify-rush-hour 失败');
process.exit(ok ? 0 : 1);
