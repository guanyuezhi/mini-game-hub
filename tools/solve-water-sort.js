/**
 * solve-water-sort.js
 * 求解 games/water-sort.html 内某关的解法步骤（使用游戏自带逻辑）。
 * 关卡布局已离线固化在 LEVELS（含 bottles），本工具直接从 LEVELS[i].bottles 读取，
 * 无需运行时生成。
 * 用法: node tools/solve-water-sort.js [关卡号 1-50]   默认 1
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'water-sort.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no script'); process.exit(1); }
const js = m[1];

// ---- DOM/Canvas 桩 ----
const ctxStub = new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set() { return true; }
});
const elStub = new Proxy({}, {
  get(t, p) {
    if (p === 'classList') return { add() {}, remove() {} };
    if (p === 'style') return {};
    if (p === 'textContent') return '';
    if (p === 'getContext') return () => ctxStub;
    if (p === 'width') return 800;
    if (p === 'height') return 600;
    if (p === 'addEventListener') return () => {};
    return undefined;
  },
  set() { return true; }
});
global.document = { getElementById: () => elStub };
global.window = { devicePixelRatio: 1, innerWidth: 800, innerHeight: 600, addEventListener() {} };
global.requestAnimationFrame = () => {};
global.performance = { now: () => 1000 };

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance',
  js + '; return {LEVELS, topBlock, doPour, isSolved, state};');
const api = fn(global.document, global.window, global.requestAnimationFrame, global.performance);

const CNAME = { 0: '红', 1: '蓝', 2: '绿', 3: '黄', 4: '紫', 5: '橙', 6: '青', 7: '粉' };

// ---- BFS 求解：返回完整解法路径（null=无解/超限） ----
// 层序 BFS（与 verify-water-sort.js 一致），存 prev 链用于回溯输出每步。
function solve(bottles, cap) {
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
        const src = cur[i];
        if (!src.length) continue;
        const tb = api.topBlock(src);
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
          if (!seen.has(kk)) {
            seen.set(kk, { prev: curKey, i, k, n, color: tb.color });
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
    q = next;
  }
  return null;
}

const levelArg = parseInt(process.argv[2], 10);
const li = (levelArg >= 1 && levelArg <= api.LEVELS.length) ? levelArg - 1 : 0;
const cfg = api.LEVELS[li];
const bottles = cfg.bottles.map(b => b.slice());

console.log(
  `=== 第${li + 1}关（配色 ${cfg.colors} 空瓶 ${cfg.empty} 记录最少步数 ${cfg.minSteps}）` +
  `初始局面（瓶号按屏幕上从左到右 1..${bottles.length}）===`
);
bottles.forEach((b, i) => console.log(`  瓶${i + 1}: [ ${b.map(c => CNAME[c]).join(' , ')} ]`));

const moves = solve(bottles, cfg.capacity);
if (!moves) {
  console.log('\n无解?!');
  process.exit(1);
}
console.log(`\n=== 解法（共 ${moves.length} 步）===`);
moves.forEach((mv, idx) => {
  console.log(`  第${idx + 1}步: 瓶${mv.i + 1} → 瓶${mv.k + 1}（把顶部【${CNAME[mv.color]}】${mv.n} 个倒入）`);
});
const b = bottles.map(x => x.slice());
for (const mv of moves) { api.doPour(b, mv.i, mv.k, cfg.capacity); }
console.log('\n回放结果通关: ' + api.isSolved(b, cfg.capacity));
