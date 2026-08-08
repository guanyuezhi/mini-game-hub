/**
 * gen-nonogram.js
 * 离线生成「数织（Nonogram/Picross）」关卡表（12 关，尺寸 5/5/6/6/7/7/8/8/9/9/10/10，
 * 同尺寸内填充密度交替 0.5/0.6 —— 前者稀疏后者密）。
 *
 * 玩法：size×size 网格，行/列左侧/上方数字提示（如 2 1 = 2 连涂、空 1 格、1 连涂），
 * 玩家涂黑推理出隐藏图案。胜利 = 涂黑格子集合 === 标准解 sol 的集合。
 *
 * 核心思路：
 *  - mulberry32(seed) 随机生成二进制网格：grid[r][c] = rng() < targetDensity。
 *  - cluesOf(line) 逐行 run-length 编码（空行/空列返回 [0]），但生成时拒绝全空行/全空列棋盘。
 *  - 唯一解验证（DFS 计数到 limit=2 剪枝）：genLineCandidates 枚举每行满足提示的位掩码，
 *    逐行 DFS 维护每列当前允许的候选位集 colAllowed[c]，任一行候选导致某列候选集为空则剪枝。
 *  - 拒绝采样：不唯一则换 seed 重试（每关预算 200）。
 *
 * 用法: node tools/gen-nonogram.js
 * 产出: tools/_levels_out.js（一段 `const LEVELS = [...]`，粘贴进 games/nonogram.html）
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ================= PRNG：标准 mulberry32（与其它 gen-*.js 一致） ================= */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= 纯逻辑（与 games/nonogram.html 完全一致） ================= */

/** run-length 编码：1=涂黑。空行/空列返回 [0]。 */
function cluesOf(line) {
  const res = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    const v = line[i] === 1 || line[i] === '1' ? 1 : 0;
    if (v === 1) run++;
    else if (run > 0) { res.push(run); run = 0; }
  }
  if (run > 0) res.push(run);
  if (res.length === 0) res.push(0);
  return res;
}

/**
 * 枚举长度为 n 的所有满足提示 clues 的位掩码（Set<number>，bit i 表示第 i 格，1=涂黑）。
 * 块之间至少 1 空格；[0] 表示空行，仅全 0 掩码。
 */
function genLineCandidates(n, clues) {
  const res = new Set();
  if (clues.length === 1 && clues[0] === 0) { res.add(0); return res; }
  const totalRun = clues.reduce((a, b) => a + b, 0);
  const numRuns = clues.length;
  const minLen = totalRun + (numRuns - 1);
  if (minLen > n) return res;
  const extra = n - minLen; // 需要摊分到 (numRuns+1) 个空隙的多余空格
  const gaps = new Array(numRuns + 1).fill(0);
  for (let i = 1; i < numRuns; i++) gaps[i] = 1; // 块间至少 1 空
  function distribute(gapIdx, rem) {
    if (gapIdx === numRuns) {
      gaps[gapIdx] += rem;
      let mask = 0, pos = 0;
      for (let k = 0; k < numRuns; k++) {
        pos += gaps[k];
        for (let b = 0; b < clues[k]; b++) mask |= (1 << (pos + b));
        pos += clues[k];
      }
      res.add(mask);
      gaps[gapIdx] -= rem;
      return;
    }
    for (let add = 0; add <= rem; add++) {
      gaps[gapIdx] += add;
      distribute(gapIdx + 1, rem - add);
      gaps[gapIdx] -= add;
    }
  }
  distribute(0, extra);
  return res;
}

/**
 * 求解器：对提示 (rows, cols) 逐行 DFS 计数解数，达到 limit 立即停（>limit 结果不精确但足够判唯一）。
 * 维护每列当前允许的候选位集 colAllowed[c]；对每个行候选 rb 过滤各列候选集，
 * 任一列候选集为空则剪枝。返回解数（>= limit 时为 limit）。
 */
function countSolutions(size, rows, cols, limit) {
  const rowCands = rows.map(clues => genLineCandidates(size, clues));
  for (const s of rowCands) if (s.size === 0) return 0;
  const colCands = cols.map(clues => genLineCandidates(size, clues));
  for (const s of colCands) if (s.size === 0) return 0;

  const colAllowed = colCands.map(s => new Set(s));
  let count = 0;

  function dfs(r) {
    if (count >= limit) return;
    if (r === size) { count++; return; }
    for (const rb of rowCands[r]) {
      const newSets = [];
      let ok = true;
      for (let c = 0; c < size; c++) {
        const bit = (rb >> c) & 1; // 本行第 c 格
        const ns = new Set();
        for (const cm of colAllowed[c]) {
          if (((cm >> r) & 1) === bit) ns.add(cm); // 列掩码第 r 位对应同一格
        }
        if (ns.size === 0) { ok = false; break; }
        newSets.push(ns);
      }
      if (!ok) continue;
      const old = colAllowed.slice();
      for (let c = 0; c < size; c++) colAllowed[c] = newSets[c];
      dfs(r + 1);
      for (let c = 0; c < size; c++) colAllowed[c] = old[c];
      if (count >= limit) return;
    }
  }

  dfs(0);
  return count;
}

function arrEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** sol（size² 位串，行优先，1=涂黑）推导出的行列提示是否严格等于 rows/cols。 */
function matchesClues(size, rows, cols, sol) {
  const grid = [];
  for (let r = 0; r < size; r++) {
    grid.push(sol.slice(r * size, r * size + size).split('').map(Number));
  }
  for (let r = 0; r < size; r++) {
    if (!arrEq(cluesOf(grid[r]), rows[r])) return false;
  }
  for (let c = 0; c < size; c++) {
    const col = [];
    for (let r = 0; r < size; r++) col.push(grid[r][c]);
    if (!arrEq(cluesOf(col), cols[c])) return false;
  }
  return true;
}

/* ================= 关卡配方 ================= */
// 尺寸（12 关）与同尺寸内填充密度交替：0.5 稀疏 / 0.6 密。
const SIZES = [5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];
const DENSITIES = [0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6];
const BUDGET = 200;

/** 生成单关：拒绝采样直到恰好 1 个解。返回 {size, rows, cols, sol, density, seed} 或 null。 */
function genLevel(size, density, seedBase) {
  for (let attempt = 0; attempt < BUDGET; attempt++) {
    const seed = seedBase + attempt;
    const rng = mulberry32(seed);
    const grid = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(rng() < density ? 1 : 0);
      grid.push(row);
    }

    // 拒绝全空行/全空列（否则候选重复且无聊）
    let bad = false;
    for (let r = 0; r < size && !bad; r++) {
      if (grid[r].every(v => v === 0)) bad = true;
    }
    if (!bad) {
      for (let c = 0; c < size && !bad; c++) {
        let allZero = true;
        for (let r = 0; r < size; r++) if (grid[r][c] === 1) { allZero = false; break; }
        if (allZero) bad = true;
      }
    }
    if (bad) continue;

    const rows = grid.map(row => cluesOf(row));
    const cols = [];
    for (let c = 0; c < size; c++) {
      const col = [];
      for (let r = 0; r < size; r++) col.push(grid[r][c]);
      cols.push(cluesOf(col));
    }

    if (countSolutions(size, rows, cols, 2) === 1) {
      const sol = grid.map(row => row.join('')).join('');
      return { size, rows, cols, sol, density, seed };
    }
  }
  return null;
}

/* ================= 主流程 ================= */
function run() {
  const LEVELS = [];
  for (let li = 0; li < SIZES.length; li++) {
    const size = SIZES[li];
    const density = DENSITIES[li];
    const seedBase = 1000 + li * 700;
    const lv = genLevel(size, density, seedBase);
    if (!lv) {
      console.error(`[关卡失败] L${li + 1}: size=${size} density=${density}: ${BUDGET} 次重试未命中唯一解，请放宽。`);
      process.exit(1);
    }
    LEVELS.push({ size, rows: lv.rows, cols: lv.cols, sol: lv.sol });
    console.log(
      `L${li + 1}: size=${size} density=${density} seed=${lv.seed} ` +
      `rows=${JSON.stringify(lv.rows)} cols=${JSON.stringify(lv.cols)}`
    );
  }

  console.log('\n尺寸序列: ' + LEVELS.map(l => l.size).join(','));
  console.log('密度序列: ' + DENSITIES.join(','));
  console.log('总关数: ' + LEVELS.length);

  const lines = LEVELS.map(l =>
    `  { size:${l.size}, rows:${JSON.stringify(l.rows)}, cols:${JSON.stringify(l.cols)}, sol:"${l.sol}" }`
  );
  const code = 'const LEVELS = [\n' + lines.join(',\n') + '\n];';
  fs.writeFileSync(path.join(__dirname, '_levels_out.js'), code);
  console.log('✅ 已写入 tools/_levels_out.js');
}

module.exports = { mulberry32, cluesOf, genLineCandidates, countSolutions, matchesClues, SIZES, DENSITIES, BUDGET, genLevel };
if (require.main === module) run();
