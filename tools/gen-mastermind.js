/**
 * gen-mastermind.js
 * 离线生成「猜数字（Mastermind）」关卡表（10 关）。
 *
 * 核心思路：
 *  - 每关固化 pegs/colors/dup/maxGuesses 与秘密码 secret，运行时零生成、秒开。
 *  - 贪心 minimax 求解器：每步从当前候选集 S 中选一个猜测 g，
 *    使「按 feedback 分组后最大组的大小」最小（g 取候选集内），
 *    然后按 feedback(secret, g) 过滤 S。
 *  - 拒绝采样：solveGreedy(secret,...) <= maxGuesses 才接受，否则换 seed 重试。
 *  - 首猜与 secret 无关，同一配置只算一次并缓存（maxGuesses 阶梯中同一配置出现多次）；
 *    候选集 / 直方图同样按配置缓存，大幅压缩求解时间。
 *
 * 用法: node tools/gen-mastermind.js
 * 产出: tools/_levels_out.js（一段 `const LEVELS = [...]`，粘贴进 mastermind.html）
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ================= 求解器（与 games/mastermind.html 内联脚本同实现，verify 交叉校验） ================= */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 反馈：black = 位置和颜色都对；white = 颜色对但位置错（= total - black）。 */
function feedback(secret, guess, pegs) {
  var black = 0, maxC = 0, i;
  for (i = 0; i < pegs; i++) {
    if (secret[i] === guess[i]) black++;
    if (secret[i] > maxC) maxC = secret[i];
    if (guess[i] > maxC) maxC = guess[i];
  }
  var sc = new Array(maxC + 1).fill(0);
  var gc = new Array(maxC + 1).fill(0);
  for (i = 0; i < pegs; i++) { sc[secret[i]]++; gc[guess[i]]++; }
  var total = 0;
  for (i = 0; i <= maxC; i++) total += Math.min(sc[i], gc[i]);
  return { black: black, white: total - black };
}

/** 候选全集：所有长度 pegs、取值 0..colors-1 的码；dup=0 时要求各位置互异。 */
function makeCodeSet(pegs, colors, dup) {
  var codes = [], total = 1, i, n;
  for (i = 0; i < pegs; i++) total *= colors;
  for (n = 0; n < total; n++) {
    var x = n, code = new Array(pegs), p;
    for (p = pegs - 1; p >= 0; p--) { code[p] = x % colors; x = Math.floor(x / colors); }
    if (dup === 0) {
      var seen = {}, ok = true, q;
      for (q = 0; q < pegs; q++) { if (seen[code[q]]) { ok = false; break; } seen[code[q]] = 1; }
      if (!ok) continue;
    }
    codes.push(code);
  }
  return codes;
}

function codeHist(code, colors) {
  var h = new Array(colors).fill(0), i;
  for (i = 0; i < code.length; i++) h[code[i]]++;
  return h;
}

function sameCode(a, b, pegs) {
  for (var i = 0; i < pegs; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * 贪心 minimax 选猜：从 S 中选使「按 feedback 分组后最大组大小」最小的猜测。
 * 平手取遍历顺序首个，保证确定性（gen / HTML / verify 三者一致）。
 */
function minimaxPick(S, hist, pegs, colors) {
  var N = S.length;
  var stride = pegs + 1;
  var counts = new Int32Array(stride * stride);
  var used = new Array(stride * stride);
  var bestScore = N;
  var bestGuess = S[0];
  for (var gi = 0; gi < N; gi++) {
    var g = S[gi], hg = hist[gi];
    var localMax = 0, nUsed = 0;
    for (var si = 0; si < N; si++) {
      var s = S[si];
      var b = 0;
      for (var p = 0; p < pegs; p++) if (s[p] === g[p]) b++;
      var hs = hist[si];
      var tot = 0;
      for (var c = 0; c < colors; c++) tot += hs[c] < hg[c] ? hs[c] : hg[c];
      var key = b * stride + (tot - b);
      if (counts[key] === 0) used[nUsed++] = key;
      var v = counts[key] + 1;
      counts[key] = v;
      if (v > localMax) localMax = v;
    }
    for (var u = 0; u < nUsed; u++) counts[used[u]] = 0;
    if (localMax < bestScore) { bestScore = localMax; bestGuess = g; }
  }
  return bestGuess;
}

/* 配置级缓存：候选集 / 直方图 / 首猜（首猜与 secret 无关，同一配置只算一次）。 */
var _codeSetCache = {};
var _histCache = {};
var _firstGuessCache = {};
function _cfgKey(pegs, colors, dup) { return pegs + '|' + colors + '|' + dup; }

/** 求解：返回贪心 minimax 所需猜次（<= maxGuesses），超预算返回 null。 */
function solveGreedy(secret, pegs, colors, dup, maxGuesses) {
  var key = _cfgKey(pegs, colors, dup);
  var S = _codeSetCache[key] || (_codeSetCache[key] = makeCodeSet(pegs, colors, dup));
  var hist = _histCache[key] || (_histCache[key] = S.map(function (c) { return codeHist(c, colors); }));
  var first = _firstGuessCache[key];
  if (first === undefined) { first = minimaxPick(S, hist, pegs, colors); _firstGuessCache[key] = first; }
  var steps = 0;
  while (true) {
    var g = steps === 0 ? first : minimaxPick(S, hist, pegs, colors);
    steps++;
    if (sameCode(g, secret, pegs)) return steps;
    if (steps >= maxGuesses) return null;
    var fb = feedback(secret, g, pegs);
    var nS = [], nHist = [], i;
    for (i = 0; i < S.length; i++) {
      var f = feedback(S[i], g, pegs);
      if (f.black === fb.black && f.white === fb.white) { nS.push(S[i]); nHist.push(hist[i]); }
    }
    S = nS; hist = nHist;
  }
}

/* ================= 随机 secret ================= */

function randomCode(rng, pegs, colors, dup) {
  if (dup === 1) {
    var c = [];
    for (var i = 0; i < pegs; i++) c.push(Math.floor(rng() * colors));
    return c;
  }
  var pool = [];
  for (var i = 0; i < colors; i++) pool.push(i);
  for (var i2 = 0; i2 < pegs; i2++) {
    var j = i2 + Math.floor(rng() * (colors - i2));
    var t = pool[i2]; pool[i2] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, pegs);
}

/* ================= 难度阶梯（10 关） ================= */
const LADDER = [
  { pegs: 4, colors: 6, dup: 1, maxGuesses: 7 },
  { pegs: 4, colors: 6, dup: 1, maxGuesses: 6 },
  { pegs: 4, colors: 7, dup: 1, maxGuesses: 6 },
  { pegs: 4, colors: 8, dup: 1, maxGuesses: 7 },
  { pegs: 4, colors: 7, dup: 0, maxGuesses: 7 },
  { pegs: 4, colors: 8, dup: 0, maxGuesses: 7 },
  { pegs: 5, colors: 6, dup: 0, maxGuesses: 8 },
  { pegs: 5, colors: 7, dup: 0, maxGuesses: 8 },
  { pegs: 5, colors: 8, dup: 0, maxGuesses: 8 },
  { pegs: 5, colors: 8, dup: 0, maxGuesses: 7 }
];

/* ================= 单关生成（拒绝采样） ================= */

function genLevel(cfg, seedBase) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const rng = mulberry32(seedBase + attempt * 13);
    const secret = randomCode(rng, cfg.pegs, cfg.colors, cfg.dup);
    const optimal = solveGreedy(secret, cfg.pegs, cfg.colors, cfg.dup, cfg.maxGuesses);
    if (optimal !== null && optimal <= cfg.maxGuesses) {
      return {
        pegs: cfg.pegs, colors: cfg.colors, dup: cfg.dup,
        maxGuesses: cfg.maxGuesses, secret, optimal
      };
    }
  }
  return null;
}

/* ================= 主流程 ================= */
function run() {
  const LEVELS = [];
  for (let li = 0; li < LADDER.length; li++) {
    const cfg = LADDER[li];
    let level = null;
    // 外圈再换 seed 基数重试（首猜已缓存，重试只跑收窄后的廉价格）
    for (let guard = 0; guard < 40 && !level; guard++) {
      level = genLevel(cfg, 1000 + li * 137 + guard * 500);
    }
    if (!level) {
      console.error(
        `[失败] L${li + 1}: pegs=${cfg.pegs} colors=${cfg.colors} dup=${cfg.dup} maxGuesses=${cfg.maxGuesses} ` +
        `30×40 组 seed 均不达标，请放宽 maxGuesses 或降级配置（如 5×7）。`
      );
      process.exit(1);
    }
    LEVELS.push(level);
    console.log(
      `L${li + 1}: pegs=${level.pegs} colors=${level.colors} dup=${level.dup} ` +
      `maxGuesses=${level.maxGuesses} optimal=${level.optimal} secret=[${level.secret.join(',')}]`
    );
  }

  const lines = LEVELS.map(L => {
    return `  { pegs:${L.pegs}, colors:${L.colors}, dup:${L.dup}, maxGuesses:${L.maxGuesses}, secret:[${L.secret.join(',')}], optimal:${L.optimal} }`;
  });
  const code = 'const LEVELS = [\n' + lines.join(',\n') + '\n];';
  fs.writeFileSync(path.join(__dirname, '_levels_out.js'), code);
  console.log('✅ 已写入 tools/_levels_out.js');
}

module.exports = {
  mulberry32, feedback, makeCodeSet, solveGreedy, randomCode, LADDER, genLevel, run
};
if (require.main === module) run();
