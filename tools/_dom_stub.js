/**
 * _dom_stub.js —— verify-*.js 共享 DOM/Canvas 桩
 *
 * 在 Node 里执行游戏内联 <script> 时提供最小 DOM 表面，
 * 覆盖：location.search / localStorage / getBoundingClientRect / classList /
 *       style / dataset / createElement / addEventListener / Canvas 2D ctx 等。
 *
 * 用法（与现有 verify-water-sort.js 一致）：
 *   const stub = require('./_dom_stub');
 *   const fn = new Function('document','window','requestAnimationFrame','performance','location','localStorage',
 *     js + '; return {...};');
 *   const api = fn(stub.document, stub.window, stub.requestAnimationFrame, stub.performance,
 *                  stub.location, stub.localStorage);
 *
 * 注意：游戏逻辑必须保持单一内联 <script> 块（<script src="../save.js"> 不受正则影响）。
 */
'use strict';

// ---- Canvas 2D context 桩：任意方法 no-op，渐变/图案返回桩对象 ----
const ctxStub = new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient' || p === 'createPattern') {
      return () => ({ addColorStop() {} });
    }
    return () => {};
  },
  set() { return true; }
});

// ---- 元素桩：任意属性访问返回安全默认 ----
function makeEl() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (p === 'style') return new Proxy({}, { get() { return ''; }, set() { return true; } });
      if (p === 'dataset') return {};
      if (p === 'getContext') return () => ctxStub;
      if (p === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
      if (p === 'addEventListener' || p === 'removeEventListener') return () => {};
      if (p === 'appendChild' || p === 'removeChild' || p === 'insertBefore' || p === 'replaceChild') return () => {};
      if (p === 'setAttribute' || p === 'removeAttribute') return () => {};
      if (p === 'querySelector') return () => null;
      if (p === 'querySelectorAll') return () => [];
      if (p === 'focus' || p === 'blur' || p === 'click') return () => {};
      if (p === 'width') return 800;
      if (p === 'height') return 600;
      if (p === 'value' || p === 'textContent' || p === 'innerHTML' || p === 'className' || p === 'id') return '';
      if (p === 'disabled') return false;
      if (p === 'parentNode' || p === 'firstChild' || p === 'lastChild') return null;
      return undefined;
    },
    set() { return true; }
  });
}

const elStub = makeEl();

// ---- 全局挂载（供 new Function 无参调用时也能解析到） ----
const documentStub = {
  getElementById: () => elStub,
  createElement: () => makeEl(),
  createElementNS: () => makeEl(),
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  body: elStub,
  documentElement: elStub,
  head: elStub
};

const locationStub = { search: '', href: '', pathname: '/index.html', hash: '' };
const localStorageStub = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0
};

const windowStub = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 600,
  addEventListener: () => {},
  removeEventListener: () => {},
  location: locationStub,
  localStorage: localStorageStub,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  performance: { now: () => 1000 },
  matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {}
};

global.document = documentStub;
global.window = windowStub;
global.location = locationStub;
global.localStorage = localStorageStub;
global.requestAnimationFrame = windowStub.requestAnimationFrame;
global.cancelAnimationFrame = windowStub.cancelAnimationFrame;
global.performance = windowStub.performance;
global.setTimeout = windowStub.setTimeout;
global.clearTimeout = windowStub.clearTimeout;
global.setInterval = windowStub.setInterval;
global.clearInterval = windowStub.clearInterval;

module.exports = {
  document: documentStub,
  window: windowStub,
  location: locationStub,
  localStorage: localStorageStub,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  performance: windowStub.performance,
  makeEl,
  ctxStub
};
