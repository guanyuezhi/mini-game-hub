/**
 * gen-rush-hour.js
 * 离线生成「华容道·塞车（Rush Hour）」关卡表（12 关，6×6）。
 *
 * 玩法：6×6 网格。车辆横向(v=0)或纵向(v=1)占 len=2/3 个连续格。
 *       红车(red=1)横向停在出口行；玩家拖拽车辆沿其轴滑动任意距离 = 1 步。
 *       红车右移到最右列（c 到达 N-2，len2 占最后两列）即过关，计步 moves。
 *
 * 核心思路：
 *  - 初始态：红车 (2,0) + 随机补车（占用 23~27/36 格）→ 后向游走 K 步洗牌
 *    （每步随机选车沿轴滑到任意合法位置，与游戏计步一致；走法可逆 → 必然可解）。
 *  - BFS 求 minMoves（状态 key = cars 按数组序 r*N+c 拼接；邻居 = 每车所有合法落点）。
 *  - 拒绝采样：minMoves ∈ [门槛, 上限] 且开局未过才接受；难档命中不了就放宽门槛。
 *  - 输出 tools/_levels_out.js：`const LEVELS = [...];` 每关单行。
 *
 * 用法: node tools/gen-rush-hour.js
 * 产出: tools/_levels_out.js（粘贴进 games/rush-hour.html）
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ================= PRNG：标准 mulberry32（与其他生成器一致） ================= */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= 纯逻辑（与 games/rush-hour.html 保持一致） ================= */

// 车是否已到最右出口（红车 len2 占列 N-2, N-1）
function isWin(cars, size) {
  const red = cars.find(c => c.red === 1);
  if (!red) return false;
  return red.c === size - 2;
}

// 车 idx 放到 (nr, nc) 是否与其他车重叠（不查越界）
function overlaps(cars, idx, nr, nc) {
  const c = cars[idx];
  const len = c.len, v = c.v;
  for (let j = 0; j < cars.length; j++) {
    if (j === idx) continue;
    const jc = cars[j];
    for (let a = 0; a < jc.len; a++) {
      const jr = jc.v === 0 ? jc.r : jc.r + a;
      const jcC = jc.v === 0 ? jc.c + a : jc.c;
      for (let b = 0; b < len; b++) {
        const cr = v === 0 ? nr : nr + b;
        const cc = v === 0 ? nc + b : nc;
        if (cr === jr && cc === jcC) return true;
      }
    }
  }
  return false;
}

// 候选新车是否与现有 cars 重叠（placeBoard 用，idx 不在数组内）
function candidateOverlaps(cars, nr, nc, len, v) {
  for (const jc of cars) {
    for (let a = 0; a < jc.len; a++) {
      const jr = jc.v === 0 ? jc.r : jc.r + a;
      const jcC = jc.v === 0 ? jc.c + a : jc.c;
      for (let b = 0; b < len; b++) {
        const cr = v === 0 ? nr : nr + b;
        const cc = v === 0 ? nc + b : nc;
        if (cr === jr && cc === jcC) return true;
      }
    }
  }
  return false;
}

// 车 idx 所有合法落点（沿轴滑动任意距离 = 1 步，各落点互不相同，排除原位）
// 合法落点沿轴连续：最近障碍/边界即为 min/max，故遇非法直接 break。
function slideCars(cars, size, carIdx) {
  const c = cars[carIdx];
  const out = [];
  if (c.v === 0) {
    for (let dc = 1; c.c - dc >= 0; dc++) {
      if (!overlaps(cars, carIdx, c.r, c.c - dc)) out.push({ r: c.r, c: c.c - dc });
      else break;
    }
    for (let dc = 1; ; dc++) {
      if (c.c + dc + c.len <= size && !overlaps(cars, carIdx, c.r, c.c + dc)) {
        out.push({ r: c.r, c: c.c + dc });
      } else break;
    }
  } else {
    for (let dr = 1; c.r - dr >= 0; dr++) {
      if (!overlaps(cars, carIdx, c.r - dr, c.c)) out.push({ r: c.r - dr, c: c.c });
      else break;
    }
    for (let dr = 1; ; dr++) {
      if (c.r + dr + c.len <= size && !overlaps(cars, carIdx, c.r + dr, c.c)) {
        out.push({ r: c.r + dr, c: c.c });
      } else break;
    }
  }
  return out;
}

// 移动车 idx 到 (newC, newR)，返回新 cars 数组（不改原数组）
function moveCar(cars, size, carIdx, newC, newR) {
  return cars.map((x, i) => {
    if (i !== carIdx) return Object.assign({}, x);
    return Object.assign({}, x, { r: newR, c: newC });
  });
}

// 车 idx 的合法落点连续区间（含原位），供游戏拖拽 clamp 用
function carRange(cars, size, carIdx) {
  const c = cars[carIdx];
  let min = c.v === 0 ? c.c : c.r;
  let max = min;
  for (const p of slideCars(cars, size, carIdx)) {
    if (c.v === 0) { if (p.c < min) min = p.c; if (p.c > max) max = p.c; }
    else { if (p.r < min) min = p.r; if (p.r > max) max = p.r; }
  }
  return { min, max };
}

/* ================= BFS 求解器（与 verify 同实现） =================
   返回最少步数；无解 / 超 nodeLimit / 超出 maxSteps 均返回 null。
   maxSteps 供生成器剪枝：仅当 minMoves ≤ 上限时返回精确值，否则 null（拒绝该盘）。 */
function solveBFS(cars, size, nodeLimit, maxSteps) {
  if (nodeLimit === undefined || nodeLimit === null) nodeLimit = 300000;
  const key = cs => cs.map(x => x.r * size + x.c).join('|');
  const start = cars.map(x => Object.assign({}, x));
  if (isWin(start, size)) return 0;
  const seen = new Set([key(start)]);
  let q = [start];
  let steps = 0;
  while (q.length) {
    steps++;
    if (maxSteps !== undefined && steps > maxSteps) return null;
    const next = [];
    for (let si = 0; si < q.length; si++) {
      const cur = q[si];
      for (let i = 0; i < cur.length; i++) {
        const opts = slideCars(cur, size, i);
        for (let oi = 0; oi < opts.length; oi++) {
          const p = opts[oi];
          const nb = moveCar(cur, size, i, p.c, p.r);
          const k = key(nb);
          if (seen.has(k)) continue;
          if (isWin(nb, size)) return steps;
          seen.add(k);
          next.push(nb);
        }
      }
    }
    if (seen.size > nodeLimit) return null;
    q = next;
  }
  return null;
}

/* ================= 初始态 + 后向游走 ================= */

// 随机放车：红车固定 (2,0,len2,v0)，其余 len 2/3、横/竖随机，不重叠。
// 目标总占用 23~27/36；不足继续补车，超过目标则整盘作废（换 seed）。
function placeBoard(rng) {
  const size = 6;
  const cars = [{ red: 1, r: 2, c: 0, len: 2, v: 0 }];
  let occ = 2;
  const low = 23, high = 27;
  for (let tries = 0; tries < 2000; tries++) {
    if (occ >= low) return occ <= high ? cars : null;
    const len = rng() < 0.5 ? 2 : 3;
    const v = rng() < 0.5 ? 0 : 1;
    const maxR = v === 1 ? size - len : size - 1;
    const maxC = v === 0 ? size - len : size - 1;
    const r = Math.floor(rng() * (maxR + 1));
    const c = Math.floor(rng() * (maxC + 1));
    if (candidateOverlaps(cars, r, c, len, v)) continue;
    cars.push({ r, c, len, v });
    occ += len;
  }
  return null;
}

// 后向游走 K 步：每步随机选车沿轴滑到任意合法位置（与游戏计步一致）
function scramble(cars, size, K, rng) {
  let cur = cars;
  for (let i = 0; i < K; i++) {
    const idx = Math.floor(rng() * cur.length);
    const opts = slideCars(cur, size, idx);
    if (!opts.length) continue;
    const p = opts[Math.floor(rng() * opts.length)];
    cur = moveCar(cur, size, idx, p.c, p.r);
  }
  return cur;
}

/* ================= 关卡配方 =================
   门槛为 BFS 最少步数区间（实测 6×6 随机盘 minMoves 实用区间 1~12）。
   L1-3 目标 1~2 步；L4-6 目标 3~4；L7-9 目标 5~6；L10-11 目标 7~9；L12 目标 9~12。
   K = 后向游走步数（易 80 / 中 200 / 难 500）。budget = 每关换 seed 重试预算。
   relax：难档（L12）长时间命中不了 ≥9 时放宽到 6~12。 */
const LEVEL_CFG = [
  { threshold: 1, cap: 2, K: 80,  budget: 150 },   // L1
  { threshold: 1, cap: 2, K: 80,  budget: 150 },   // L2
  { threshold: 1, cap: 2, K: 80,  budget: 150 },   // L3
  { threshold: 3, cap: 4, K: 200, budget: 400 },   // L4
  { threshold: 3, cap: 4, K: 200, budget: 400 },   // L5
  { threshold: 3, cap: 4, K: 200, budget: 400 },   // L6
  { threshold: 5, cap: 6, K: 500, budget: 3000 },  // L7
  { threshold: 5, cap: 6, K: 500, budget: 3000 },  // L8
  { threshold: 5, cap: 6, K: 500, budget: 3000 },  // L9
  { threshold: 7, cap: 9, K: 500, budget: 3500 },  // L10
  { threshold: 7, cap: 9, K: 500, budget: 3500 },  // L11
  { threshold: 9, cap: 12, K: 500, budget: 3000,
    relax: { threshold: 6, cap: 12 } },            // L12
];

const NODE_LIMIT = 300000;

// 单档尝试：严格按 [thr, cap] 且 minSteps >= prevMin（保证难度不回落）拒绝采样
function tryPass(thr, cap, K, budget, seedBase, size, prevMin) {
  for (let attempt = 0; attempt < budget; attempt++) {
    const seed = seedBase + attempt * 131;
    const rng = mulberry32(seed);
    const board = placeBoard(rng);
    if (!board) continue;
    const scrambled = scramble(board, size, K, rng);
    if (isWin(scrambled, size)) continue;
    const m = solveBFS(scrambled, size, NODE_LIMIT, cap);
    if (m !== null && m >= thr && m <= cap && m >= prevMin) {
      return { cars: scrambled, minSteps: m, seed, attempts: attempt + 1 };
    }
  }
  return null;
}

// 生成单关：先严格档，失败再走 relax 档；prevMin 保证全局 minSteps 非降
function genLevel(cfg, seedBase, prevMin) {
  const size = 6;
  const hit = tryPass(cfg.threshold, cfg.cap, cfg.K, cfg.budget, seedBase, size, prevMin);
  if (hit) return hit;
  if (cfg.relax) {
    const rel = tryPass(cfg.relax.threshold, cfg.relax.cap, cfg.K, cfg.budget, seedBase + 1000000, size, prevMin);
    if (rel) return Object.assign(rel, { relaxed: true });
  }
  return null;
}

/* ================= 主流程 ================= */
function carToStr(c) {
  const parts = [];
  if (c.red) parts.push('red:1');
  parts.push('r:' + c.r, 'c:' + c.c, 'len:' + c.len, 'v:' + c.v);
  return '{' + parts.join(',') + '}';
}
function levelLine(l, size) {
  return '  { size:' + size + ', minSteps:' + l.minSteps + ', seed:' + l.seed +
    ', cars:[' + l.cars.map(carToStr).join(',') + '] }';
}

function run() {
  const size = 6;
  const LEVELS = [];
  const t0 = Date.now();

  let prevMin = 0;
  for (let li = 0; li < LEVEL_CFG.length; li++) {
    const cfg = LEVEL_CFG[li];
    const seedBase = 5000 + li * 100000;
    const lv = genLevel(cfg, seedBase, prevMin);
    if (!lv) {
      console.error(
        `[关卡失败] L${li + 1}: 门槛 [${cfg.threshold}..${cfg.cap}] 预算 ${cfg.budget} 未命中` +
        (cfg.relax ? `（放宽档 [${cfg.relax.threshold}..${cfg.relax.cap}] 也失败）` : '')
      );
      process.exit(1);
    }
    LEVELS.push(lv);
    prevMin = lv.minSteps;
    console.log(
      `L${li + 1}: minSteps=${lv.minSteps} 门槛=[${cfg.threshold}..${cfg.cap}]` +
      (lv.relaxed ? ' (放宽)' : '') + ` seed=${lv.seed} 尝试=${lv.attempts} 车数=${lv.cars.length}`
    );
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\nminSteps 序列: ' + LEVELS.map(l => l.minSteps).join(','));
  console.log('生成耗时: ' + elapsed + 's');

  const code = 'const LEVELS = [\n' + LEVELS.map(l => levelLine(l, size)).join(',\n') + '\n];';
  fs.writeFileSync(path.join(__dirname, '_levels_out.js'), code);
  console.log('✅ 已写入 tools/_levels_out.js');
}

module.exports = {
  mulberry32, isWin, overlaps, candidateOverlaps, slideCars, moveCar, carRange, solveBFS,
  placeBoard, scramble, tryPass, genLevel, LEVEL_CFG, NODE_LIMIT
};
if (require.main === module) run();
