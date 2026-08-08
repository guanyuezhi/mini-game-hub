/**
 * verify-water-sort.js
 * 校验 games/water-sort.html 内固化的关卡表（当前 50 关）：
 *  1) 结构：水量 = colors*capacity、空瓶数 = empty、颜色索引合法
 *  2) 非「开局已通关」
 *  3) BFS 求解可解 + 用游戏自带 doPour 回放解法确能通关
 *  4) 实测最少步数 = LEVELS 记录的 minSteps（离线生成一致性）
 * 用法: node tools/verify-water-sort.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'water-sort.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script'); process.exit(1); }
const js = m[1];

// ---- DOM/Canvas 桩（共享 _dom_stub，补齐 location/localStorage 等） ----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return {LEVELS, topBlock, doPour, isSolved, state};');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

// ---- BFS 求解：返回完整解法路径（null=无解/超限） ----
// 层序 BFS，nodeLimit 在每层结束后检查（与离线 gen 脚本的 solveSteps 语义一致，
// 避免 6 色大状态空间时"解还没到达就先触发上限"的误判）。
function solve(bottles, cap, nodeLimit) {
  const key = b => b.map(x => x.join(',')).join('|');
  const start = bottles.map(x => x.slice());
  if (api.isSolved(start, cap)) return [];
  const seen = new Map([[key(start), null]]);
  let q = [start];
  while (q.length) {
    const next = [];
    for (const cur of q) {
      const curKey = key(cur);
      for (let i = 0; i < cur.length; i++) {
        for (let k = 0; k < cur.length; k++) {
          if (i === k) continue;
          const src = cur[i], dst = cur[k];
          if (!src.length || dst.length >= cap) continue;
          const tb = api.topBlock(src);
          if (dst.length && dst[dst.length - 1] !== tb.color) continue;
          const n = Math.min(tb.size, cap - dst.length);
          const nb = cur.map(x => x.slice());
          const s = nb[i], d = nb[k];
          for (let x = 0; x < n; x++) { s.pop(); d.push(tb.color); }
          const kk = key(nb);
          if (!seen.has(kk)) {
            seen.set(kk, { prev: curKey, i, k, n });
            if (api.isSolved(nb, cap)) {
              const moves = [];
              let node = seen.get(kk);
              while (node) { moves.push(node); node = seen.get(node.prev); }
              return moves.reverse();
            }
            next.push(nb);
          }
        }
      }
    }
    if (seen.size > nodeLimit) return null;
    q = next;
  }
  return null;
}

let ok = true;
const stepSeq = [];
for (let li = 0; li < api.LEVELS.length; li++) {
  const cfg = api.LEVELS[li];
  const bottles = cfg.bottles.map(b => b.slice());
  const cap = cfg.capacity;

  const count = bottles.reduce((a, b) => a + b.length, 0);
  const expected = cfg.colors * cap;
  const emptyCount = bottles.length - cfg.colors;
  const already = api.isSolved(bottles, cap);
  const badColor = bottles.some(b => b.some(c => c < 0 || c >= cfg.colors));

  const moves = solve(bottles, cap, 120000);
  let replayOk = false;
  if (moves) {
    replayOk = true;
    const b = bottles.map(x => x.slice());
    for (const mv of moves) {
      const amount = api.doPour(b, mv.i, mv.k, cap);
      if (amount !== mv.n) replayOk = false;
    }
    if (!api.isSolved(b, cap)) replayOk = false;
  }
  const stepMatch = moves ? moves.length === cfg.minSteps : false;
  stepSeq.push(moves ? moves.length : null);

  console.log(
    `L${li + 1}: 色=${cfg.colors} 空=${cfg.empty} 瓶=${bottles.length} ` +
    `水量=${count}/${expected} 空瓶=${emptyCount} 已通关=${already} 颜色越界=${badColor} ` +
    `可解=${!!moves} 回放通关=${replayOk} 步数=${moves ? moves.length : '-'}/${cfg.minSteps} 一致=${stepMatch}`
  );
  if (already) ok = false;
  if (badColor) ok = false;
  if (!moves || !replayOk) ok = false;
  if (!stepMatch) ok = false;
  if (count !== expected || emptyCount !== cfg.empty) ok = false;
}

console.log('\n步数序列: ' + stepSeq.join(','));
console.log(ok ? '✅ 全部关卡校验通过' : '❌ 存在关卡问题');
process.exit(ok ? 0 : 1);
