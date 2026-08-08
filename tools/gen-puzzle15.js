/**
 * gen-puzzle15.js
 * 离线生成「15 拼图（Sliding Puzzle）」关卡表（10 关，尺寸 3/3/3/4/4/4/4/4/4/4）。
 *
 * 玩法：size×size 网格，0=空格；点击空格相邻方块，方块滑入空格。
 *       数字按 1..size²-1 顺序排列（空格在末尾）即过关，计步 moves。
 *
 * 核心思路：
 *  - 从已解态做「随机走法洗牌」K 步 → 必然可解，无需奇偶校验。
 *  - A* 求 optimal（曼哈顿距离 + 线性冲突启发式），nodeLimit 200000：
 *        open 集扩展超限（A* 太慢）返回 null，换 seed 重洗。
 *  - 拒绝采样：optimal ∈ [门槛, 门槛+SLACK] 且 >= 上一关 optimal（保证单调递增）
 *    才接受，否则换 seed 重试（每关预算 ~500）。
 *  - 预过滤：曼哈顿距离 > 门槛+SLACK 时 optimal 必然出界，直接跳过 A*，省时间。
 *
 * 用法: node tools/gen-puzzle15.js
 * 产出: tools/_levels_out.js
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

/* ================= 15 拼图纯逻辑（与 games/puzzle-15.html 保持一致） ================= */

function goalTiles(size) {
  const n = size * size;
  const t = [];
  for (let i = 1; i < n; i++) t.push(i);
  t.push(0);
  return t;
}

function isSolved(tiles, size) {
  const n = size * size;
  for (let i = 0; i < n - 1; i++) if (tiles[i] !== i + 1) return false;
  return tiles[n - 1] === 0;
}

// 曼哈顿距离：每个非空格子到其目标位置（值 v 的目标索引 = v-1）的曼哈顿距离之和
function manhattan(tiles, size) {
  let d = 0;
  const n = size * size;
  for (let i = 0; i < n; i++) {
    const v = tiles[i];
    if (v === 0) continue;
    const tr = Math.floor((v - 1) / size), tc = (v - 1) % size;
    const r = Math.floor(i / size), c = i % size;
    d += Math.abs(r - tr) + Math.abs(c - tc);
  }
  return d;
}

// 线性冲突：同行（或同列）内、目标也在同行（或同列）、但相对次序颠倒的格子对，每对 +2
function linearConflict(tiles, size) {
  let conflicts = 0;
  // 行冲突
  for (let r = 0; r < size; r++) {
    for (let a = 0; a < size; a++) {
      const va = tiles[r * size + a];
      if (va === 0) continue;
      const tra = Math.floor((va - 1) / size);
      if (tra !== r) continue;
      const tca = (va - 1) % size;
      for (let b = a + 1; b < size; b++) {
        const vb = tiles[r * size + b];
        if (vb === 0) continue;
        const trb = Math.floor((vb - 1) / size);
        if (trb !== r) continue;
        const tcb = (vb - 1) % size;
        if (tca > tcb) conflicts++;
      }
    }
  }
  // 列冲突
  for (let c = 0; c < size; c++) {
    for (let a = 0; a < size; a++) {
      const va = tiles[a * size + c];
      if (va === 0) continue;
      const tca = (va - 1) % size;
      if (tca !== c) continue;
      const tra = Math.floor((va - 1) / size);
      for (let b = a + 1; b < size; b++) {
        const vb = tiles[b * size + c];
        if (vb === 0) continue;
        const tcb = (vb - 1) % size;
        if (tcb !== c) continue;
        const trb = Math.floor((vb - 1) / size);
        if (tra > trb) conflicts++;
      }
    }
  }
  return conflicts * 2;
}

function heuristic(tiles, size) {
  return manhattan(tiles, size) + linearConflict(tiles, size);
}

// 从已解态随机走法洗牌 K 步 → 必然可解（不做奇偶校验）。prevD 避免空格立即回退。
function shuffleSolved(size, steps, rng) {
  const n = size * size;
  const tiles = goalTiles(size);
  let empty = n - 1;
  let prevD = 0;
  for (let i = 0; i < steps; i++) {
    const r = Math.floor(empty / size), c = empty % size;
    const dirs = [];
    if (r > 0) dirs.push(-size);
    if (r < size - 1) dirs.push(size);
    if (c > 0) dirs.push(-1);
    if (c < size - 1) dirs.push(1);
    const cands = dirs.filter(d => d !== -prevD);
    const d = cands[Math.floor(rng() * cands.length)];
    const j = empty + d;
    tiles[empty] = tiles[j];
    tiles[j] = 0;
    prevD = d;
    empty = j;
  }
  return tiles;
}

/* ================= A* 求解器（与 verify-puzzle15.js 算法一致） ================= */

// 最小二叉堆：f 小者优先；f 相同时 g 大者优先（更深节点先扩展，加速收敛）
class MinHeap {
  constructor() { this.arr = []; }
  size() { return this.arr.length; }
  push(node) {
    const a = this.arr;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) { const t = a[i]; a[i] = a[p]; a[p] = t; i = p; }
      else break;
    }
  }
  pop() {
    const a = this.arr;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let m = i;
        if (l < n && this.less(a[l], a[m])) m = l;
        if (r < n && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        const t = a[i]; a[i] = a[m]; a[m] = t;
        i = m;
      }
    }
    return top;
  }
  less(x, y) {
    if (x.f !== y.f) return x.f < y.f;
    return x.g > y.g;
  }
}

const NODE_LIMIT = 200000;

// A* 求从 tiles 到目标态（[1..size²-1, 0]）的最少步数；open 集扩展超限返回 null。
// 允许重开（gScore 更新），配合可采纳启发式保证首次弹出目标态即为最优。
function solveOptimal(tiles, size, nodeLimit) {
  nodeLimit = nodeLimit || NODE_LIMIT;
  const n = size * size;
  const goalKey = goalTiles(size).join(',');
  const startKey = tiles.join(',');
  if (startKey === goalKey) return 0;

  const open = new MinHeap();
  const gScore = new Map();
  const h0 = heuristic(tiles, size);
  open.push({ f: h0, g: 0, key: startKey, tiles: tiles.slice() });
  gScore.set(startKey, 0);

  let expanded = 0;
  while (open.size() > 0) {
    const cur = open.pop();
    if (cur.key === goalKey) return cur.g;
    if (gScore.get(cur.key) !== cur.g) continue; // 过期节点
    expanded++;
    if (expanded > nodeLimit) return null;

    let empty = -1;
    for (let i = 0; i < n; i++) if (cur.tiles[i] === 0) { empty = i; break; }
    const r = Math.floor(empty / size), c = empty % size;
    const nbs = [];
    if (r > 0) nbs.push(empty - size);
    if (r < size - 1) nbs.push(empty + size);
    if (c > 0) nbs.push(empty - 1);
    if (c < size - 1) nbs.push(empty + 1);
    for (const j of nbs) {
      const nt = cur.tiles.slice();
      nt[empty] = nt[j];
      nt[j] = 0;
      const nk = nt.join(',');
      const ng = cur.g + 1;
      const old = gScore.get(nk);
      if (old !== undefined && old <= ng) continue;
      gScore.set(nk, ng);
      open.push({ f: ng + heuristic(nt, size), g: ng, key: nk, tiles: nt });
    }
  }
  return null;
}

/* ================= 关卡配方 ================= */
// 每关：尺寸 / optimal 门槛 / 洗牌步数 K 范围。
// K 范围按门槛实测校准（见下注释），使 optimal 落进 [门槛, 门槛+SLACK] 的概率足够高：
//   - 3x3 状态空间小：随机走约门槛步即可稳定达到对应最优（8/10/12）。
//   - 4x4 随机走 K 步：K≈20~95 时 optimal 大致 20~50，且 A* 不超 nodeLimit；
//     K 越大 optimal 越高，但 K≥100 开始偶发 nodeLimit，故封顶 95。
const SLACK = 8; // optimal 允许超出门槛的最大余量，控制难度递进不过快
const LEVEL_CFG = [
  { size: 3, threshold: 8,  k: [8, 12] },
  { size: 3, threshold: 10, k: [10, 15] },
  { size: 3, threshold: 12, k: [12, 18] },
  { size: 4, threshold: 20, k: [20, 30] },
  { size: 4, threshold: 24, k: [24, 36] },
  { size: 4, threshold: 28, k: [30, 45] },
  { size: 4, threshold: 32, k: [36, 55] },
  { size: 4, threshold: 36, k: [48, 70] },
  { size: 4, threshold: 40, k: [60, 85] },
  { size: 4, threshold: 45, k: [75, 100] },
];

const ATTEMPT_BUDGET = 500;

// 生成单关：随机走法洗牌 → A* 求 optimal；拒绝采样直到
//   optimal ∈ [门槛, 门槛+SLACK] 且 > 上一关 optimal（严格单调递增）。
function genLevel(li, cfg, minOpt) {
  const threshold = cfg.threshold;
  const [kLow, kHigh] = cfg.k;
  const cap = threshold + SLACK;
  for (let attempt = 0; attempt < ATTEMPT_BUDGET; attempt++) {
    const seed = 1000 + li * 5000 + attempt * 131;
    const rng = mulberry32(seed);
    const K = kLow + Math.floor(rng() * (kHigh - kLow + 1));
    const tiles = shuffleSolved(cfg.size, K, rng);
    if (isSolved(tiles, cfg.size)) continue;
    // 预过滤：曼哈顿距离已超上限，optimal 必然出界，跳过 A*。
    if (manhattan(tiles, cfg.size) > cap) continue;
    const opt = solveOptimal(tiles, cfg.size);
    if (opt !== null && opt >= threshold && opt > minOpt && opt <= cap) {
      return { tiles, optimal: opt, K, seed, attempts: attempt + 1 };
    }
  }
  return null;
}

/* ================= 主流程 ================= */
function run() {
  const LEVELS = [];
  let prevOpt = 0;
  for (let li = 0; li < LEVEL_CFG.length; li++) {
    const cfg = LEVEL_CFG[li];
    const lv = genLevel(li, cfg, prevOpt);
    if (!lv) {
      console.error(
        `[关卡失败] L${li + 1}: size=${cfg.size} 门槛=${cfg.threshold}: ${ATTEMPT_BUDGET} 次重试未达标，` +
        `请加大 K 范围或 SLACK。`
      );
      process.exit(1);
    }
    LEVELS.push({ size: cfg.size, optimal: lv.optimal, tiles: lv.tiles });
    prevOpt = lv.optimal;
    console.log(
      `L${li + 1}: size=${cfg.size} 门槛=${cfg.threshold} optimal=${lv.optimal} K=${lv.K} ` +
      `seed=${lv.seed} 尝试=${lv.attempts} tiles=[${lv.tiles.join(',')}]`
    );
  }

  const opts = LEVELS.map(l => l.optimal);
  console.log('\noptimal 序列: ' + opts.join(','));
  console.log('总关数: ' + LEVELS.length);

  const lines = LEVELS.map(l => `  { size:${l.size}, optimal:${l.optimal}, tiles:[${l.tiles.join(',')}] }`);
  const code = 'const LEVELS = [\n' + lines.join(',\n') + '\n];';
  fs.writeFileSync(path.join(__dirname, '_levels_out.js'), code);
  console.log('✅ 已写入 tools/_levels_out.js');
}

module.exports = {
  mulberry32, goalTiles, isSolved, manhattan, linearConflict, heuristic,
  shuffleSolved, MinHeap, solveOptimal,
  SLACK, LEVEL_CFG, NODE_LIMIT, ATTEMPT_BUDGET, genLevel
};
if (require.main === module) run();
