#!/usr/bin/env node
/**
 * 撕胶带关卡校验工具
 *
 * 从 games/tape-peel.html 中提取 LEVELS，用与游戏完全相同的几何判定
 * （旋转矩形 SAT 相交检测）模拟"只撕最上层"过程，验证：
 *   1. 每关可解（能全部撕完）
 *   2. 每关至少 1 根被压住（不是全裸露，否则没有谜题性）
 *   3. 第 1 关严格链条（初始只有 1 根可撕，教学预期）
 *   4. 至少一关初始有 ≥2 根可撕（策略自由度）
 *   5. 所有胶带完整落在棋盘范围内
 *
 * 用法：node tools/verify-tape-peel.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TAPE_H = 20;
const BOARD = { w: 480, h: 520 };
const htmlPath = path.join(__dirname, '..', 'games', 'tape-peel.html');

/* ---------- 提取 LEVELS（括号配对，容忍任意 JSON 布局） ---------- */
const html = fs.readFileSync(htmlPath, 'utf8');
const marker = 'const LEVELS = ';
const start = html.indexOf(marker) + marker.length;
const open = html.indexOf('[', start);
if (open < 0) { console.error('未找到 LEVELS'); process.exit(1); }
let depth = 0, end = -1;
for (let i = open; i < html.length; i++) {
  if (html[i] === '[') depth++;
  else if (html[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
// 剥离整行注释后再解析（LEVELS 允许保留 `//` 注释，便于维护）
const rawJson = html.slice(open, end + 1)
  .split('\n')
  .filter(line => !/^\s*\/\//.test(line))
  .join('\n');
const levels = JSON.parse(rawJson);

/* ---------- 与游戏一致的几何 ---------- */
function corners(t) {
  const rad = t.a * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
  const hw = t.L / 2, hh = TAPE_H / 2;
  return [
    { x: t.x - hw * c + hh * s, y: t.y - hw * s - hh * c },
    { x: t.x + hw * c + hh * s, y: t.y + hw * s - hh * c },
    { x: t.x + hw * c - hh * s, y: t.y + hw * s + hh * c },
    { x: t.x - hw * c - hh * s, y: t.y - hw * s + hh * c }
  ];
}
function overlapOnAxis(a, b, ax) {
  const pa = corners(a).map(p => p.x * ax.x + p.y * ax.y);
  const pb = corners(b).map(p => p.x * ax.x + p.y * ax.y);
  return Math.min(...pa) <= Math.max(...pb) && Math.min(...pb) <= Math.max(...pa);
}
function rectsOverlap(a, b) {
  const ra = a.a * Math.PI / 180, rb = b.a * Math.PI / 180;
  const axes = [
    { x: Math.cos(ra), y: Math.sin(ra) },
    { x: -Math.sin(ra), y: Math.cos(ra) },
    { x: Math.cos(rb), y: Math.sin(rb) },
    { x: -Math.sin(rb), y: Math.cos(rb) }
  ];
  return axes.every(ax => overlapOnAxis(a, b, ax));
}
function isFree(t, tapes) {
  return !tapes.some(u => u.z > t.z && rectsOverlap(t, u));
}

/* ---------- 校验 ---------- */
let pass = true;
function check(ok, msg) {
  if (!ok) { pass = false; console.error('  ❌ ' + msg); }
  else console.log('  ✅ ' + msg);
}

console.log('共 ' + levels.length + ' 关\n');
let hasMultiFree = false;

levels.forEach((tapes, li) => {
  const lv = tapes.map((td, i) => Object.assign({}, td, { z: i }));
  console.log('第 ' + (li + 1) + ' 关 · ' + tapes.length + ' 根胶带');

  // 范围检查
  let outOfBounds = false;
  lv.forEach(t => {
    corners(t).forEach(p => {
      const pad = 8;
      if (p.x < -pad || p.x > BOARD.w + pad || p.y < -pad || p.y > BOARD.h + pad) outOfBounds = true;
    });
  });
  check(!outOfBounds, '所有胶带都在棋盘范围内（480×520）');

  // 模拟撕取
  const remaining = lv.slice();
  const freeCount = remaining.filter(t => isFree(t, remaining)).length;
  let batches = [];
  let moves = 0;
  while (remaining.length) {
    const free = remaining.filter(t => isFree(t, remaining));
    if (free.length === 0) break; // 死锁（理论不可能，除非几何 bug）
    batches.push(free.map(t => t.z));
    const freeSet = new Set(free.map(t => t.z));
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (freeSet.has(remaining[i].z)) { remaining.splice(i, 1); moves++; }
    }
  }

  check(remaining.length === 0, '可解：撕 ' + moves + ' 次全部清空');
  if (freeCount > 1) hasMultiFree = true;
  if (li === 0) {
    check(freeCount === 1, '教学关初始只有 1 根可撕（严格链条）');
  } else {
    check(freeCount < tapes.length, '初始有 ' + freeCount + ' 根可撕，至少 ' + (tapes.length - freeCount) + ' 根被压住');
  }
  const orderStr = batches.map((b, i) =>
    '  批次' + (i + 1) + '：撕 z=' + b.join(',')
  ).join('\n');
  console.log(orderStr);
  console.log('');
});

check(hasMultiFree, '至少一关初始有 ≥2 根可撕（策略自由度）');
check(levels.length === 5, '共 5 关');
console.log(pass ? '\n🎉 全部校验通过' : '\n❌ 存在不通过项，请调整 LEVELS');
process.exit(pass ? 0 : 1);
