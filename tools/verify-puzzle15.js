/**
 * verify-puzzle15.js
 * 校验 games/puzzle-15.html 内固化的关卡表：
 *  1) tiles 长度 === size²，且是 0..size²-1 的排列（多重集相同）
 *  2) 排列可解（奇偶性正确：size 奇数 → 逆序数为偶；size 偶数 → 逆序数 + 空格从底行数 为偶）
 *  3) 用 gen 脚本同款 A*（曼哈顿距离 + 线性冲突）重算 optimal === LEVELS[li].optimal
 * 用法: node tools/verify-puzzle15.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'puzzle-15.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no inline script block'); process.exit(1); }
const js = m[1];

// ---- DOM 桩（共享 _dom_stub） ----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

if (!api || !Array.isArray(api.LEVELS)) {
  console.error('window.__game 未导出 LEVELS，检查 games/puzzle-15.html 的 window.__game = {...}');
  process.exit(1);
}
if (typeof api.isSolved !== 'function' || typeof api.canSlide !== 'function' || typeof api.slide !== 'function') {
  console.error('window.__game 缺少 isSolved / canSlide / slide 导出');
  process.exit(1);
}

/* ================= 15 拼图 A* 求解器（与 tools/gen-puzzle15.js 算法一致） ================= */

function goalTiles(size) {
  const n = size * size;
  const t = [];
  for (let i = 1; i < n; i++) t.push(i);
  t.push(0);
  return t;
}

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

function linearConflict(tiles, size) {
  let conflicts = 0;
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

function solveOptimal(tiles, size) {
  const NODE_LIMIT = 200000;
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
    if (gScore.get(cur.key) !== cur.g) continue;
    expanded++;
    if (expanded > NODE_LIMIT) return null;

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

/* ================= 校验辅助 ================= */

// 0..size²-1 的排列（多重集相同）
function isPermutation(tiles, size) {
  const n = size * size;
  if (tiles.length !== n) return false;
  const seen = new Array(n).fill(false);
  for (const v of tiles) {
    if (v < 0 || v >= n || seen[v]) return false;
    seen[v] = true;
  }
  return true;
}

// 可解性：奇数 → 逆序数偶；偶数 → 逆序数 + 空格从底行数（0 起）为偶
function isSolvable(tiles, size) {
  const n = size * size;
  let inv = 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i] === 0) continue;
    for (let j = i + 1; j < n; j++) {
      if (tiles[j] === 0) continue;
      if (tiles[i] > tiles[j]) inv++;
    }
  }
  if (size % 2 === 1) return inv % 2 === 0;
  let emptyRow = -1;
  for (let i = 0; i < n; i++) if (tiles[i] === 0) { emptyRow = Math.floor(i / size); break; }
  return (inv + (size - 1 - emptyRow)) % 2 === 0;
}

/* ================= 逐关断言 ================= */
let ok = true;
const seq = [];
for (let li = 0; li < api.LEVELS.length; li++) {
  const lv = api.LEVELS[li];
  const n = lv.size * lv.size;
  const lenOk = Array.isArray(lv.tiles) && lv.tiles.length === n;
  const permOk = lenOk && isPermutation(lv.tiles, lv.size);
  const solvable = permOk && isSolvable(lv.tiles, lv.size);
  const opt = permOk ? solveOptimal(lv.tiles, lv.size) : null;
  const match = solvable && opt !== null && opt === lv.optimal;
  seq.push(opt);

  console.log(
    `L${li + 1}: size=${lv.size} optimal=${lv.optimal} ` +
    `长度=${lenOk ? 'OK' : 'FAIL'} 排列=${permOk ? 'OK' : 'FAIL'} ` +
    `可解=${solvable} 重算=${opt} 一致=${match}`
  );
  if (!lenOk || !permOk || !solvable || !match) ok = false;
}

console.log('\noptimal 序列: ' + seq.join(','));
console.log(ok ? '✅ verify-puzzle15 通过' : '❌ verify-puzzle15 失败');
process.exit(ok ? 0 : 1);
