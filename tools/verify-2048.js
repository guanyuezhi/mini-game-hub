/**
 * verify-2048.js
 * 校验 games/2048.html 内联脚本的纯逻辑：
 *  1) slideAndMerge 单行滑合并规则
 *  2) canMove 对满盘无合并的盘判 false
 *  3) spawnTile 用固定 rng 只往空格放非 0 值
 *  4) move 整盘移动与加分（附加检查）
 * 用法: node tools/verify-2048.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', '2048.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('❌ 未找到内联脚本'); process.exit(1); }
const js = m[1];

// ---- DOM 桩（共享 _dom_stub） ----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const g = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

let ok = true;
function check(name, cond) {
  console.log((cond ? '✅' : '❌') + ' ' + name);
  if (!cond) ok = false;
}
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ---- 导出存在性 ----
check('window.__game 导出齐全',
  g && typeof g.newBoard === 'function' && typeof g.spawnTile === 'function' &&
  typeof g.slideAndMerge === 'function' && typeof g.move === 'function' &&
  typeof g.canMove === 'function' && typeof g.mulberry32 === 'function');

// ---- slideAndMerge ----
check('slideAndMerge([2,2,0,0]) → [4,0,0,0]',
  deepEq(g.slideAndMerge([2, 2, 0, 0]), [4, 0, 0, 0]));
check('slideAndMerge([2,2,2,2]) → [4,4,0,0]',
  deepEq(g.slideAndMerge([2, 2, 2, 2]), [4, 4, 0, 0]));
check('slideAndMerge([4,2,2,0]) → [4,4,0,0]',
  deepEq(g.slideAndMerge([4, 2, 2, 0]), [4, 4, 0, 0]));
check('slideAndMerge([2,0,2,0]) → [4,0,0,0]',
  deepEq(g.slideAndMerge([2, 0, 2, 0]), [4, 0, 0, 0]));
check('slideAndMerge([0,0,0,0]) → [0,0,0,0]',
  deepEq(g.slideAndMerge([0, 0, 0, 0]), [0, 0, 0, 0]));

// ---- canMove ----
const noMoveBoard = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
check('canMove 满盘无合并 → false', g.canMove(noMoveBoard) === false);

const hasMoveBoard = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 4];
check('canMove 满盘有相邻同值 → true', g.canMove(hasMoveBoard) === true);

const emptyBoard = g.newBoard();
check('canMove 空盘 → true', g.canMove(emptyBoard) === true);

// ---- spawnTile（固定 rng，只往空格放非 0 值） ----
const rng1 = g.mulberry32(42);
const b1 = g.newBoard();
g.spawnTile(b1, rng1);
const placed = b1.filter(function (v) { return v !== 0; });
check('spawnTile 只放 1 个非 0 值', placed.length === 1 && (placed[0] === 2 || placed[0] === 4));

// 多次生成都落在空格上，且值恒为 2 或 4
const rng2 = g.mulberry32(2026);
const b2 = g.newBoard();
let okSpawn = true;
for (let i = 0; i < 8; i++) {
  g.spawnTile(b2, rng2);
  const nonZero = b2.filter(function (v) { return v !== 0; });
  if (nonZero.length !== i + 1) okSpawn = false;
  for (const v of nonZero) if (v !== 2 && v !== 4) okSpawn = false;
}
check('spawnTile 连续 8 次只填空格、值为 2/4', okSpawn);

// 满盘时 spawnTile 不产生变化
const fullBoard = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
const fullAfter = g.spawnTile(fullBoard.slice(), rng1);
check('spawnTile 满盘非零数仍为 16',
  fullAfter.filter(function (v) { return v !== 0; }).length === 16);

// ---- move（附加：整盘移动 + 加分） ----
const mvLeft = g.move([0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3);
check('move 左 [0,2,2,0] → 合并得 4、行变 [4,0,0,0]',
  mvLeft.score === 4 && deepEq(mvLeft.board.slice(0, 4), [4, 0, 0, 0]));

const mvRight = g.move([2, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1);
check('move 右 [2,0,2,2] → 行变 [0,0,2,4]、得分 4',
  mvRight.score === 4 && deepEq(mvRight.board.slice(0, 4), [0, 0, 2, 4]));

const mvDown = g.move([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], 2);
check('move 下 同列 2+2 → 底行得 4、得分 4',
  mvDown.score === 4 && mvDown.board[12] === 4 && mvDown.board[0] === 0);

console.log('');
console.log(ok ? '✅ verify-2048 通过' : '❌ verify-2048 未通过');
process.exit(ok ? 0 : 1);
