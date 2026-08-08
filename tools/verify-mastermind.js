/**
 * verify-mastermind.js
 * 校验 games/mastermind.html 内固化的关卡表（10 关）：
 *  1) 结构：secret 长度 === pegs、值域 0..colors-1、dup=0 时各位置互异
 *  2) feedback(secret, secret, pegs) === {black:pegs, white:0}
 *  3) 用 HTML 内导出的 solveGreedy 重算 <= maxGuesses 且 === LEVELS[li].optimal
 *  4) 交叉校验：gen-mastermind.js 的求解器与 HTML 同实现（结果一致）
 * 用法: node tools/verify-mastermind.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'mastermind.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no inline script'); process.exit(1); }
const js = m[1];

// ---- DOM 桩（共享 _dom_stub）----
const stub = require('./_dom_stub');

const fn = new Function('document', 'window', 'requestAnimationFrame', 'performance', 'location', 'localStorage',
  js + '; return window.__game;');
const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance, stub.location, stub.localStorage);

// ---- 与 gen 同实现的求解器（交叉校验，防漂移）----
const gen = require('./gen-mastermind');

let ok = true;
for (let li = 0; li < api.LEVELS.length; li++) {
  const cfg = api.LEVELS[li];
  const { pegs, colors, dup, maxGuesses, secret, optimal } = cfg;

  const lenOk = secret.length === pegs;
  const rangeOk = secret.every(v => v >= 0 && v < colors);
  const dupOk = dup === 1 || new Set(secret).size === secret.length;

  const self = api.feedback(secret, secret, pegs);
  const selfOk = self.black === pegs && self.white === 0;

  const steps = api.solveGreedy(secret, pegs, colors, dup, maxGuesses);
  const stepOk = steps !== null && steps <= maxGuesses && steps === optimal;

  const genSteps = gen.solveGreedy(secret, pegs, colors, dup, maxGuesses);
  const genOk = genSteps === steps;

  const pass = lenOk && rangeOk && dupOk && selfOk && stepOk && genOk;
  if (!pass) ok = false;

  console.log(
    `L${li + 1}: pegs=${pegs} colors=${colors} dup=${dup} max=${maxGuesses} ` +
    `len=${lenOk} range=${rangeOk} dup0=${dupOk} self=${selfOk} ` +
    `optimal=${optimal} recompute=${steps} genMatch=${genOk} → ${pass ? '✅' : '❌'}`
  );
}

console.log(ok ? '✅ verify-mastermind 通过' : '❌ 存在关卡问题');
process.exit(ok ? 0 : 1);
