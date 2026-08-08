/**
 * gen-water-sort-levels.js
 * 离线生成「分离流沙」关卡表（50 关，为 500 关铺路）。
 *
 * 核心思路：
 *  - 分装算法逐行复刻 games/water-sort.html 的 generateLevel（随机打散全部色块 →
 *    随机分瓶 + 追加空瓶），保证离线校验的布局与游戏逻辑完全一致。
 *  - 对候选布局跑 BFS 求解，得到「最少步数」作为难度质量门槛：
 *      ① 必须可解（BFS 找到解）
 *      ② 步数 ≥ 该阶段 minSteps（杜绝"白送关"）
 *  - minSteps 依据实测步数分布校准（见 STAGES 注释），作为"白送关过滤器"，
 *    真正的难度主轴是 colors（2 → 6 递增）。
 *  - 配方表 9 个阶段：每个色数下"多空瓶热身 → 少空瓶挑战"双档；阶段内按
 *    最少步数升序排列 → 全程平滑递进。
 *  - 输出固化关卡数据（含 bottles 布局），运行时零生成、零 BFS、秒开。
 *
 * 用法: node tools/gen-water-sort-levels.js
 * 产出: tools/_levels_out.js（一段 `const LEVELS = [...]`，粘贴进 water-sort.html）
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ================= 复刻 water-sort.html 的纯逻辑 ================= */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function topBlock(bottle) {
  if (!bottle.length) return { color: -1, size: 0 };
  const color = bottle[bottle.length - 1];
  let size = 0;
  for (let j = bottle.length - 1; j >= 0 && bottle[j] === color; j--) size++;
  return { color, size };
}

function isSolved(bottles, cap) {
  return bottles.every(b => {
    if (!b.length) return true;
    return b.length === cap && b.every(c => c === b[0]);
  });
}

/* ================= 分装（与 HTML generateLevel 的随机分布算法逐行一致） =================
   输入: 已种子的 rng；输出: 前 colors 瓶的色块分布（空瓶由调用方追加） */
function splitUnits(rng, colors, capacity) {
  const units = [];
  for (let c = 0; c < colors; c++) for (let x = 0; x < capacity; x++) units.push(c);
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = units[i]; units[i] = units[j]; units[j] = t;
  }
  const total = colors * capacity;
  const bottles = [];
  let idx = 0;
  for (let b = 0; b < colors; b++) {
    const remBottles = colors - b;
    const min = Math.max(1, total - idx - (remBottles - 1) * capacity);
    const max = Math.min(capacity, total - idx - (remBottles - 1));
    const count = min + Math.floor(rng() * (max - min + 1));
    bottles.push(units.slice(idx, idx + count));
    idx += count;
  }
  return bottles;
}

/* ================= BFS 求解：返回最少步数（null=无解/超限） ================= */
function solveSteps(bottles, cap, nodeLimit) {
  const key = b => b.map(x => x.join(',')).join('|');
  const start = bottles.map(x => x.slice());
  if (isSolved(start, cap)) return 0;
  const seen = new Set([key(start)]);
  let q = [start];
  let steps = 0;
  while (q.length) {
    steps++;
    const next = [];
    for (const cur of q) {
      for (let i = 0; i < cur.length; i++) {
        const src = cur[i];
        if (!src.length) continue;
        const tb = topBlock(src);
        for (let k = 0; k < cur.length; k++) {
          if (i === k) continue;
          const dst = cur[k];
          if (dst.length >= cap) continue;
          if (dst.length && dst[dst.length - 1] !== tb.color) continue;
          const n = Math.min(tb.size, cap - dst.length);
          const nb = cur.map(x => x.slice());
          const s = nb[i], d = nb[k];
          for (let x = 0; x < n; x++) { s.pop(); d.push(tb.color); }
          const kk = key(nb);
          if (seen.has(kk)) continue;
          if (isSolved(nb, cap)) return steps;
          seen.add(kk);
          next.push(nb);
        }
      }
    }
    if (seen.size > nodeLimit) return null;
    q = next;
  }
  return null;
}

/* ================= 配方表（S1–S9，共 50 关） =================
   颜色数 colors：难度主轴（2→6 递增，状态空间指数上升）
   空瓶数 empty：同一色数下"多空瓶=自由热身 → 少空瓶=规划挑战"
   count：本阶段关数
   minSteps：最少步数下限，按实测分布校准（过滤"白送关"，步数低于该值拒绝）
   实测分布参考：2色[3-7] 3色[4-11] 4色[5-14] 5色[9-18] 6色[15-19]
   minSteps 单调递增，保证阶段间不出现明显的"步数回退"。 */
const STAGES = [
  { colors: 2, empty: 2, capacity: 4, count: 4, minSteps: 3 },   // S1 入门（保留教学白送关）
  { colors: 2, empty: 1, capacity: 4, count: 4, minSteps: 5 },   // S2 入门+
  { colors: 3, empty: 2, capacity: 4, count: 6, minSteps: 8 },   // S3 简单
  { colors: 3, empty: 1, capacity: 4, count: 6, minSteps: 10 },  // S4 简单+
  { colors: 4, empty: 2, capacity: 4, count: 7, minSteps: 11 },  // S5 中等
  { colors: 4, empty: 1, capacity: 4, count: 6, minSteps: 12 },  // S6 中等+
  { colors: 5, empty: 2, capacity: 4, count: 7, minSteps: 14 },  // S7 偏难
  { colors: 5, empty: 1, capacity: 4, count: 6, minSteps: 15 },  // S8 难
  { colors: 6, empty: 2, capacity: 4, count: 4, minSteps: 17 },  // S9 很难
];

const NODE_LIMIT = 120000;

/* ================= 生成某阶段 =================
   等价于 HTML generateLevel 的重试语义（seed + attempt*13 换 rng 直到接受），
   但每个候选只跑一次 BFS（solveSteps 同时承担"可解性判定"与"步数"）。 */
function genStage(stage, seedBase) {
  const out = [];
  let seed = seedBase;
  for (let guard = 0; guard < 600 && out.length < stage.count; guard++) {
    const cap = stage.capacity;
    let hit = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const rng = mulberry32(seed + attempt * 13);
      const bottles = splitUnits(rng, stage.colors, cap);
      for (let e = 0; e < stage.empty; e++) bottles.push([]);
      if (isSolved(bottles, cap)) continue;                        // 非"开局已通关"
      const steps = solveSteps(bottles, cap, NODE_LIMIT);          // 可解性 + 最少步数
      if (steps !== null && steps >= stage.minSteps) { hit = { steps, bottles }; break; }
    }
    if (hit) {
      out.push({
        cfg: { colors: stage.colors, capacity: cap, empty: stage.empty, seed },
        steps: hit.steps, bottles: hit.bottles,
      });
    }
    seed++;
  }
  return out;
}

/* ================= 主流程 ================= */
function run() {
  const LEVELS = [];
  const stepSeq = [];
  let seedBase = 5000;

  for (const st of STAGES) {
    const items = genStage(st, seedBase);
    if (items.length < st.count) {
      console.error(
        `[阶段失败] colors=${st.colors} empty=${st.empty}: 仅收集到 ${items.length}/${st.count} 个达标关卡 ` +
        `(minSteps=${st.minSteps} 可能过高)，请调低后重跑。`
      );
      process.exit(1);
    }
    items.sort((a, b) => a.steps - b.steps);                       // 阶段内按最少步数升序
    const range = items.map(i => i.steps);
    console.log(
      `阶段 colors=${st.colors} empty=${st.empty} count=${st.count} ` +
      `步数范围=[${Math.min(...range)}..${Math.max(...range)}]`
    );
    for (const it of items) {
      LEVELS.push({
        colors: st.colors, capacity: st.capacity, empty: st.empty,
        seed: it.cfg.seed, minSteps: it.steps, bottles: it.bottles,
      });
      stepSeq.push(it.steps);
    }
    seedBase += 500;
  }

  console.log('步数序列: ' + stepSeq.join(','));
  console.log('总关数: ' + LEVELS.length);

  const lines = LEVELS.map(L => {
    return `  { colors:${L.colors}, capacity:${L.capacity}, empty:${L.empty}, seed:${L.seed}, minSteps:${L.minSteps}, bottles:${JSON.stringify(L.bottles)} }`;
  });
  const code = 'const LEVELS = [\n' + lines.join(',\n') + '\n];';
  fs.writeFileSync(path.join(__dirname, '_levels_out.js'), code);
  console.log('✅ 已写入 tools/_levels_out.js');
}

module.exports = { mulberry32, topBlock, isSolved, splitUnits, solveSteps, STAGES, NODE_LIMIT, genStage };
if (require.main === module) run();
