/**
 * verify-minesweeper.js
 * 校验 games/minesweeper.html 的布雷逻辑（genBoard）：
 *  1) 每关雷数 === LEVELS[li].mines
 *  2) 首点及其 8 邻域无雷（首点安全）
 *  3) 每个非雷格 nums 值 = 实际邻雷数（独立计数校验）
 * 并对 reveal 做冒烟：首点 flood-fill 返回集合、不含雷格。
 * 用法: node tools/verify-minesweeper.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'minesweeper.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到内联 <script>'); process.exit(1); }
const js = m[1];

// ---- DOM 桩（共享 _dom_stub，跳过 save.js 与内联脚本的 DOM 调用） ----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

// 独立计数：格 i 的邻雷数（与游戏内 nums 计算相互印证）
function neighborMineCount(mineSet, r, c, i) {
  const rr = Math.floor(i / c), cc = i % c;
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = rr + dr, nc = cc + dc;
      if (nr < 0 || nr >= r || nc < 0 || nc >= c) continue;
      if (mineSet.has(nr * c + nc)) n++;
    }
  }
  return n;
}

let ok = true;
const LEVELS = api.LEVELS;
for (let li = 0; li < LEVELS.length; li++) {
  const cfg = LEVELS[li];
  const fr = Math.floor(cfg.r / 2), fc = Math.floor(cfg.c / 2);
  const board = api.genBoard(cfg.r, cfg.c, cfg.mines, cfg.seed, fr, fc);

  // 1) 雷数一致
  const mineCountOk = board.mines.size === cfg.mines;

  // 2) 首点 + 8 邻域无雷
  let firstSafe = true;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = fr + dr, nc = fc + dc;
      if (nr < 0 || nr >= cfg.r || nc < 0 || nc >= cfg.c) continue;
      if (board.mines.has(nr * cfg.c + nc)) firstSafe = false;
    }
  }

  // 3) 每个非雷格 nums = 实际邻雷数；雷格 nums = -1
  let numsOk = true;
  let badIdx = -1;
  for (let i = 0; i < cfg.r * cfg.c; i++) {
    if (board.mines.has(i)) {
      if (board.nums[i] !== -1) { numsOk = false; badIdx = i; break; }
    } else {
      const expect = neighborMineCount(board.mines, cfg.r, cfg.c, i);
      if (board.nums[i] !== expect) { numsOk = false; badIdx = i; break; }
    }
  }

  // 冒烟：首点 reveal flood-fill 返回 Set 且不含雷
  const firstIdx = fr * cfg.c + fc;
  const res = api.reveal(board, firstIdx);
  const revealOk = !!res && res.mine === undefined && res instanceof Set && res.has(firstIdx);
  let revealNoMine = true;
  if (revealOk) for (const i of res) if (board.mines.has(i)) { revealNoMine = false; break; }

  console.log(
    `L${li + 1}: ${cfg.r}x${cfg.c} 雷=${cfg.mines} 实际=${board.mines.size} ` +
    `首点安全=${firstSafe} nums正确=${numsOk}${!numsOk ? ' (坏格 ' + badIdx + ')' : ''} ` +
    `reveal=${revealOk && revealNoMine ? 'OK' : 'FAIL'}`
  );
  if (!mineCountOk || !firstSafe || !numsOk || !revealOk || !revealNoMine) ok = false;
}

console.log('');
console.log(ok ? '✅ verify-minesweeper 通过' : '❌ verify-minesweeper 失败');
process.exit(ok ? 0 : 1);
