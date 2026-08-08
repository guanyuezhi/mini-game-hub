/**
 * gen-pipes.js
 * 离线生成「水管连接」关卡表（12 关）。
 *
 * 核心思路：
 *  - 随机 Kruskal 生成树（边随机洗牌 + DSU 并查集）保证网格图全连通。
 *  - 修度数：目标每格度数 ∈ {2,3}（直/弯/丁，无十字、无源终点）。
 *      度为 1 的叶子 → 随机加边到「当前度数 ≤ 2 且未相连」的邻居，
 *      避免造出度数 4；修不好或出现度数 4 → 换 seed 重试。
 *  - 由每格开口集合推导类型 + 目标旋转 s（s 对应一个全连通解）。
 *  - 打乱：initRot = (s + offset) % (直管 2 / 弯丁 4)，保证至少一格 offset ≠ 0。
 *  - 校验：s 局部一致 + BFS 全连通；init 未通关。
 *  - 输出 tools/_levels_out.js（const LEVELS = [...]，每关单行，粘贴进 pipes.html）。
 *
 * 用法: node tools/gen-pipes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ================= 纯逻辑（与 games/pipes.html 同实现，供 verify 复用） ================= */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 方向：0上 1右 2下 3左
const OPENINGS = [
  [[1, 0, 1, 0], [0, 1, 0, 1]],                        // 直(0)：rot0 上下 / rot1 左右
  [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 1], [1, 0, 0, 1]], // 弯(1)
  [[1, 1, 1, 0], [0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1]]  // 丁(2)
];

// 返回 4 布尔数组（0上 1右 2下 3左）
function openingsOf(type, rot) {
  const arr = OPENINGS[type];
  const m = ((rot % arr.length) + arr.length) % arr.length;
  return arr[m].slice();
}

// 点击旋转后返回新 rot：直管 0↔1，弯/丁 +1 mod 4
function rotatable(type, rot) {
  if (type === 0) return (rot + 1) % 2;
  return (rot + 1) % 4;
}

function dirDelta(d) {
  if (d === 0) return [-1, 0];
  if (d === 1) return [0, 1];
  if (d === 2) return [1, 0];
  return [0, -1];
}

// 胜利：所有相邻格的开口互相连通（局部一致）+ 从 (0,0) 出发 BFS 可达全部格子
function isSolved(types, rots, r, c) {
  const n = r * c;
  for (let i = 0; i < n; i++) {
    const rr = Math.floor(i / c), cc = i % c;
    const op = openingsOf(types[i], rots[i]);
    for (let d = 0; d < 4; d++) {
      if (!op[d]) continue;
      const dr = dirDelta(d)[0], dc = dirDelta(d)[1];
      const nr = rr + dr, nc = cc + dc;
      if (nr < 0 || nr >= r || nc < 0 || nc >= c) return false; // 开口朝向网格外
      const j = nr * c + nc;
      if (!openingsOf(types[j], rots[j])[(d + 2) % 4]) return false;
    }
  }
  const seen = new Uint8Array(n);
  const q = [0]; seen[0] = 1; let head = 0;
  while (head < q.length) {
    const i = q[head++];
    const rr = Math.floor(i / c), cc = i % c;
    const op = openingsOf(types[i], rots[i]);
    for (let d = 0; d < 4; d++) {
      if (!op[d]) continue;
      const dr = dirDelta(d)[0], dc = dirDelta(d)[1];
      const nr = rr + dr, nc = cc + dc;
      if (nr < 0 || nr >= r || nc < 0 || nc >= c) continue;
      const j = nr * c + nc;
      if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return q.length === n;
}

/* ================= 生成器 ================= */

function makeDSU(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return false;
    p[ra] = rb; return true;
  }
  return { find, union };
}

// 随机 Kruskal 生成树 → 全连通（返回邻接表 Set[]）
function spanningTree(r, c, rng) {
  const n = r * c;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const rr = Math.floor(i / c), cc = i % c;
    if (cc + 1 < c) edges.push([i, i + 1]);
    if (rr + 1 < r) edges.push([i, i + c]);
  }
  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = edges[i]; edges[i] = edges[j]; edges[j] = t;
  }
  const dsu = makeDSU(n);
  const adj = Array.from({ length: n }, () => new Set());
  for (let k = 0; k < edges.length; k++) {
    const a = edges[k][0], b = edges[k][1];
    if (dsu.union(a, b)) { adj[a].add(b); adj[b].add(a); }
  }
  return adj;
}

// 修度数：目标每格 ∈ {2,3}。度为 1 的叶子加边到「度数 ≤ 2 且未相连」的邻居。
// 成功返回邻接表，失败返回 null（交给上层换 seed 重试）。
function fixDegrees(adj, r, c, rng) {
  const n = r * c;
  const deg = adj.map(s => s.size);
  let guard = 0;
  while (guard++ < 1000) {
    const leaves = [];
    for (let i = 0; i < n; i++) if (deg[i] === 1) leaves.push(i);
    if (!leaves.length) break;
    const leaf = leaves[Math.floor(rng() * leaves.length)];
    const rr = Math.floor(leaf / c), cc = leaf % c;
    const cands = [];
    for (let d = 0; d < 4; d++) {
      const dr = dirDelta(d)[0], dc = dirDelta(d)[1];
      const nr = rr + dr, nc = cc + dc;
      if (nr < 0 || nr >= r || nc < 0 || nc >= c) continue;
      const j = nr * c + nc;
      if (!adj[leaf].has(j) && deg[j] <= 2) cands.push(j);
    }
    if (!cands.length) return null;               // 无法修好
    let best = [cands[0]];
    for (let k = 1; k < cands.length; k++) {
      const j = cands[k];
      if (deg[j] < deg[best[0]]) best = [j];      // 优先度数最低（1 最佳：一次连两叶）
      else if (deg[j] === deg[best[0]]) best.push(j);
    }
    const nb = best[Math.floor(rng() * best.length)];
    adj[leaf].add(nb); adj[nb].add(leaf);
    deg[leaf]++; deg[nb]++;
  }
  for (let i = 0; i < n; i++) if (deg[i] < 2 || deg[i] > 3) return null; // 出现度 4（十字）→ 失败
  return adj;
}

// 由每格开口方向集合推导 类型 + 目标旋转
function deriveCell(adj, r, c, i) {
  const rr = Math.floor(i / c), cc = i % c;
  const dirs = [];
  for (let d = 0; d < 4; d++) {
    const dr = dirDelta(d)[0], dc = dirDelta(d)[1];
    const nr = rr + dr, nc = cc + dc;
    if (nr >= 0 && nr < r && nc >= 0 && nc < c && adj[i].has(nr * c + nc)) dirs.push(d);
  }
  dirs.sort((a, b) => a - b);
  const key = dirs.join(',');
  switch (key) {
    case '0,2': return { type: 0, rot: 0 };   // 直 上下
    case '1,3': return { type: 0, rot: 1 };   // 直 左右
    case '0,1': return { type: 1, rot: 0 };
    case '1,2': return { type: 1, rot: 1 };
    case '2,3': return { type: 1, rot: 2 };
    case '0,3': return { type: 1, rot: 3 };
    case '0,1,2': return { type: 2, rot: 0 };
    case '1,2,3': return { type: 2, rot: 1 };
    case '0,2,3': return { type: 2, rot: 2 };
    case '0,1,3': return { type: 2, rot: 3 };
    default: return null;
  }
}

// 生成一关：返回 { r, c, types, sol, init, seed } 或 null
function genLevel(size, seed) {
  const r = size, c = size, n = r * c;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = mulberry32(seed + attempt * 7919);
    const adj = spanningTree(r, c, rng);
    const fixed = fixDegrees(adj, r, c, rng);
    if (!fixed) continue;
    const types = [], sol = [];
    let ok = true;
    for (let i = 0; i < n; i++) {
      const d = deriveCell(fixed, r, c, i);
      if (!d) { ok = false; break; }
      types.push(d.type); sol.push(d.rot);
    }
    if (!ok) continue;
    if (!isSolved(types, sol, r, c)) continue;      // s 必须全连通解
    // 打乱：直管仅 2 朝向，弯/丁 4 朝向
    const init = types.map((t, i) => {
      const max = t === 0 ? 2 : 4;
      const offset = Math.floor(rng() * max);
      return (sol[i] + offset) % max;
    });
    let diffCount = 0;
    for (let i = 0; i < n; i++) if (init[i] !== sol[i]) diffCount++;
    if (diffCount === 0) continue;                    // 至少一格 offset ≠ 0，避免开局即解
    if (diffCount < Math.max(2, Math.floor(n / 4))) continue; // 不要太接近解（更耐玩）
    if (isSolved(types, init, r, c)) continue;        // init 未通关
    return { r, c, types, sol, init, seed: seed + attempt * 7919 };
  }
  return null;
}

/* ================= 输出 ================= */

const SIZES = [5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8];

function groupStr(arr, c) {
  const parts = [];
  for (let i = 0; i < arr.length; i += c) parts.push(arr.slice(i, i + c).join(''));
  return parts.join(' ');
}

function run() {
  const LEVELS = [];
  for (let li = 0; li < SIZES.length; li++) {
    const size = SIZES[li];
    let lv = null;
    for (let s = 0; s < 50 && !lv; s++) lv = genLevel(size, 10000 + li * 100 + s);
    if (!lv) { console.error(`[失败] L${li + 1} ${size}x${size}: 50 个 seed 均无法生成，请检查算法`); process.exit(1); }
    const dist = { 0: 0, 1: 0, 2: 0 };
    for (const t of lv.types) dist[t]++;
    const diff = lv.init.filter((x, i) => x !== lv.sol[i]).length;
    console.log(
      `L${li + 1}: ${lv.r}x${lv.c} ` +
      `类型 直=${dist[0]} 弯=${dist[1]} 丁=${dist[2]} ` +
      `打乱=${diff}/${lv.r * lv.c} seed=${lv.seed}`
    );
    LEVELS.push({
      r: lv.r, c: lv.c,
      t: groupStr(lv.types, lv.c),
      s: groupStr(lv.sol, lv.c),
      init: groupStr(lv.init, lv.c)
    });
  }
  const lines = LEVELS.map(L => `  { r:${L.r}, c:${L.c}, t:"${L.t}", s:"${L.s}", init:"${L.init}" }`);
  const code = 'const LEVELS = [\n' + lines.join(',\n') + '\n];';
  fs.writeFileSync(path.join(__dirname, '_levels_out.js'), code);
  console.log('✅ 已写入 tools/_levels_out.js');
}

module.exports = { mulberry32, openingsOf, rotatable, dirDelta, isSolved, spanningTree, fixDegrees, deriveCell, genLevel, SIZES, groupStr };
if (require.main === module) run();
