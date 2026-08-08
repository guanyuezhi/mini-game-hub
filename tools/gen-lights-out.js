/**
 * gen-lights-out.js
 * 离线生成「熄灯（Lights Out）」关卡表（10 关，尺寸递增 3/3/3/4/4/5/5/5/6/7）。
 *
 * 玩法：size×size 网格，点击一格翻转它自己 + 上下左右四邻（十字），目标全灭。
 * 核心思路：
 *  - 从全灭态随机按 k 个不同格子 → 必然可解的盘面（board 为 size² 位串，1=亮 0=灭，行优先）。
 *  - GF(2) 高斯消元求 optimal（最少按次数）：盘面为 n² 位向量 b，按下 i 的翻转向量为列
 *    构造 n²×n² 矩阵 A，解 A·p = b (mod 2)：求特解 p0 + 零空间基，遍历 2^nullity 种组合
 *    取最小 popcount（nullity 对这些尺寸很小）。
 *  - 拒绝采样：optimal >= 该关门槛才接受，否则换 seed 重试（每关预算 ~2000）。
 *  - 门槛随尺寸递增，保证难度平滑上升。
 *
 * 用法: node tools/gen-lights-out.js
 * 产出: tools/_levels_out.js（一段 `const LEVELS = [...]`，粘贴进 games/lights-out.html）
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ================= PRNG：标准 mulberry32（与 gen-water-sort-levels.js 一致） ================= */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= 熄灯纯逻辑（与 games/lights-out.html 保持一致） ================= */

// 翻转 idx 及上下左右邻（越界忽略），返回新盘面串
function toggle(board, idx, size) {
  const arr = board.split("");
  const r = Math.floor(idx / size), c = idx % size;
  arr[idx] = arr[idx] === "1" ? "0" : "1";
  if (r > 0) { const j = idx - size; arr[j] = arr[j] === "1" ? "0" : "1"; }
  if (r < size - 1) { const j = idx + size; arr[j] = arr[j] === "1" ? "0" : "1"; }
  if (c > 0) { const j = idx - 1; arr[j] = arr[j] === "1" ? "0" : "1"; }
  if (c < size - 1) { const j = idx + 1; arr[j] = arr[j] === "1" ? "0" : "1"; }
  return arr.join("");
}

function isAllOff(board) { return board.indexOf("1") === -1; }

/**
 * GF(2) 求 optimal（最少按次数）。
 * 盘面为 n² 位向量 b；按格 i 的翻转向量为列，构造 n²×n² 矩阵 A（按下 i 翻转 i 及上下左右邻）。
 * 解 A·p = b (mod 2)：高斯消元（RREF）求特解 p0 + 零空间基（自由列），
 * 遍历 2^nullity 种组合求 min popcount(p0 ⊕ combo)。
 * 返回最小按次数；无解返回 null。
 */
function optimalOf(board, size) {
  const m = size * size;
  // 行 i 的系数位：按下哪些格会翻转格 i；第 m 位为 RHS（board[i]）
  const row = [];
  for (let i = 0; i < m; i++) {
    let mask = 0n;
    const r = Math.floor(i / size), c = i % size;
    const cells = [i];
    if (r > 0) cells.push(i - size);
    if (r < size - 1) cells.push(i + size);
    if (c > 0) cells.push(i - 1);
    if (c < size - 1) cells.push(i + 1);
    for (const j of cells) mask |= (1n << BigInt(j));
    if (board[i] === "1") mask |= (1n << BigInt(m));
    row.push(mask);
  }

  // Gauss-Jordan 消元 → RREF
  const pivotRowForCol = new Array(m).fill(-1);
  let rank = 0;
  for (let col = 0; col < m; col++) {
    let pivot = -1;
    for (let r = rank; r < m; r++) {
      if ((row[r] >> BigInt(col)) & 1n) { pivot = r; break; }
    }
    if (pivot < 0) continue; // 自由列
    const tmp = row[rank]; row[rank] = row[pivot]; row[pivot] = tmp;
    for (let r = 0; r < m; r++) {
      if (r !== rank && ((row[r] >> BigInt(col)) & 1n)) row[r] ^= row[rank];
    }
    pivotRowForCol[col] = rank;
    rank++;
  }

  // 无解判定：全 0 系数但 RHS=1 的行
  const coeffMask = (1n << BigInt(m)) - 1n;
  for (let r = rank; r < m; r++) {
    if ((row[r] & coeffMask) === 0n && ((row[r] >> BigInt(m)) & 1n)) return null;
  }

  // 特解（自由变量置 0）
  const x = new Array(m).fill(0);
  for (let col = 0; col < m; col++) {
    if (pivotRowForCol[col] >= 0) {
      const r = pivotRowForCol[col];
      x[col] = Number((row[r] >> BigInt(m)) & 1n);
    }
  }

  // 零空间基：每个自由列一个基向量
  const nullBasis = [];
  for (let f = 0; f < m; f++) {
    if (pivotRowForCol[f] >= 0) continue;
    const v = new Array(m).fill(0);
    v[f] = 1;
    for (let p = 0; p < m; p++) {
      if (pivotRowForCol[p] >= 0) {
        const r = pivotRowForCol[p];
        if ((row[r] >> BigInt(f)) & 1n) v[p] = 1;
      }
    }
    nullBasis.push(v);
  }

  // 遍历零空间组合求最小重量
  const nullity = nullBasis.length;
  const totalCombos = 1 << nullity;
  let best = Infinity;
  for (let combo = 0; combo < totalCombos; combo++) {
    const p = x.slice();
    for (let bi = 0; bi < nullity; bi++) {
      if ((combo >> bi) & 1) {
        for (let j = 0; j < m; j++) p[j] ^= nullBasis[bi][j];
      }
    }
    let w = 0;
    for (let j = 0; j < m; j++) w += p[j];
    if (w < best) best = w;
  }
  return best;
}

/* ================= 关卡配方 ================= */
// 尺寸递增（10 关）
const SIZES = [3, 3, 3, 4, 4, 5, 5, 5, 6, 7];
// optimal 门槛（单调非降；每关保证 optimal >= 门槛）
// 注：按 GF(2) 实测可达上限校准——4×4 nullity=4，任意盘面 optimal ≤ 6；
//     5×5 nullity=2，optimal 可到 14；6×6/7×7 nullity=0，optimal = 按格数 k。
const THRESHOLDS = [3, 4, 5, 5, 6, 8, 10, 12, 14, 16];

const ATTEMPT_BUDGET = 2000;

// 生成单关：全灭态随机按 k 个不同格 → 盘面必然可解；拒绝采样直到 optimal >= 门槛 且 >= minOpt。
// minOpt 用于串联难度：保证全局 optimal 单调非降（避免大尺寸关卡反而更简单）。
function genLevel(size, threshold, minOpt, seedBase) {
  const n = size * size;
  // 3×3 nullity=0、optimal=k：k 固定 = 门槛，让入门关正好 3/4/5 次，
  // 且不超出 4×4（可达上限 6），保证全局难度单调。
  const kLow = threshold;
  const kHigh = size === 3 ? threshold : Math.min(20, threshold + 4);
  for (let attempt = 0; attempt < ATTEMPT_BUDGET; attempt++) {
    const seed = seedBase + attempt * 101;
    const rng = mulberry32(seed);
    const k = kLow + Math.floor(rng() * (kHigh - kLow + 1));
    const set = new Set();
    while (set.size < k) set.add(Math.floor(rng() * n));
    let b = "0".repeat(n);
    for (const idx of set) b = toggle(b, idx, size);
    if (isAllOff(b)) continue;
    const opt = optimalOf(b, size);
    if (opt !== null && opt >= threshold && opt >= minOpt) {
      return { board: b, optimal: opt, k, seed };
    }
  }
  return null;
}

/* ================= 主流程 ================= */
function run() {
  const LEVELS = [];
  let prevOpt = 0;
  for (let li = 0; li < SIZES.length; li++) {
    const size = SIZES[li];
    const threshold = THRESHOLDS[li];
    const seedBase = 1000 + li * 700;
    const lv = genLevel(size, threshold, prevOpt, seedBase);
    if (!lv) {
      console.error(`[关卡失败] L${li + 1}: size=${size} 门槛=${threshold}: ${ATTEMPT_BUDGET} 次重试未达标，请调低门槛。`);
      process.exit(1);
    }
    LEVELS.push({ size, optimal: lv.optimal, board: lv.board });
    prevOpt = lv.optimal;
    console.log(`L${li + 1}: size=${size} 门槛=${threshold} optimal=${lv.optimal} k=${lv.k} seed=${lv.seed} board=${lv.board}`);
  }

  const opts = LEVELS.map(l => l.optimal);
  console.log('\noptimal 序列: ' + opts.join(','));
  console.log('总关数: ' + LEVELS.length);

  const lines = LEVELS.map(l => `  { size:${l.size}, optimal:${l.optimal}, board:"${l.board}" }`);
  const code = 'const LEVELS = [\n' + lines.join(',\n') + '\n];';
  fs.writeFileSync(path.join(__dirname, '_levels_out.js'), code);
  console.log('✅ 已写入 tools/_levels_out.js');
}

module.exports = { mulberry32, toggle, isAllOff, optimalOf, SIZES, THRESHOLDS, genLevel };
if (require.main === module) run();
