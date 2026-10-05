// ==UserScript==
// @name         FV 本地文件预览器（真·安装版）
// @namespace    com.example.fv
// @version      10.0
// @description  固定入口 https://fv-local-preview.invalid/ 预览本地文件；选 js 后可编辑元数据并一键真正安装进 ChromeXt 脚本库（dispatch installScript，持久化）
// @match        *://*/*
// @match        file:///*
// @run-at       document-start
// @grant        GM.ChromeXt
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_notification
// ==/UserScript==

(function () {
  'use strict';

  if (typeof window.__fvFixedLoaded === 'undefined') { window.__fvFixedLoaded = false; }

  /* 取「页面真实 window」：@grant 非 none 时 GM 会建沙箱，
     本脚本里的 window 是被包装过的影子对象，挂属性页面脚本看不到。
     unsafeWindow 是标准解法，拿不到就退回 window。 */
  var REAL_WIN = null;
  try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) REAL_WIN = unsafeWindow; } catch (e) {}
  if (!REAL_WIN) {
    try { if (window.wrappedJSObject) REAL_WIN = window.wrappedJSObject; } catch (e) {}
  }
  if (!REAL_WIN) {
    try { REAL_WIN = document.defaultView || window; } catch (e) { REAL_WIN = window; }
  }

  /* 捕获 ChromeXt.dispatch 引用
     关键：@grant GM.ChromeXt 解锁后，ChromeXt 只存在于「本用户脚本的作用域」，
     页面脚本访问不到，所以必须在这里抓到并通过真实 window 传过去。
     document-start 时 GM.js 可能尚未注入，所以要做延迟重试。 */
  window.__fvCX = null;
  function grabCX() {
    try {
      if (typeof ChromeXt !== 'undefined' && ChromeXt && typeof ChromeXt.dispatch === 'function') {
        window.__fvCX = ChromeXt;
        // 通过真实 window 传给页面脚本（能成功就能在页面里直接安装）
        try { REAL_WIN.__fvCX = ChromeXt; } catch (e) {}
        try { document.documentElement.setAttribute('data-fv-cx', '1'); } catch (e) {}
        return true;
      }
    } catch (e) {}
    return false;
  }
  grabCX();
  (function retryGrab(times) {
    if (!times || !times.length || window.__fvCX) return;
    var delay = times.shift();
    setTimeout(function () {
      grabCX();
      retryGrab(times);
    }, delay);
  })([0, 30, 80, 150, 300, 600, 1000, 2000]);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', grabCX);
  }
  window.addEventListener('load', grabCX);

  /* 兜底：若脚本作用域拿不到，尝试 window 上的 ChromeXt 或 Symbol 属性 */
  window.__fvFindCX = function () {
    if (window.__fvCX) return window.__fvCX;
    try {
      if (window.ChromeXt && typeof window.ChromeXt.dispatch === 'function') {
        window.__fvCX = window.ChromeXt;
        return window.__fvCX;
      }
    } catch (e) {}
    try {
      var syms = Object.getOwnPropertySymbols(window);
      for (var i = 0; i < syms.length; i++) {
        if (/webidl2js|constructor registry/i.test(String(syms[i]))) continue;
        var v; try { v = window[syms[i]]; } catch (e2) { continue; }
        if (v && typeof v.dispatch === 'function') {
          window.__fvCX = v;
          return v;
        }
      }
    } catch (e) {}
    return null;
  };

  /* ============================================================
     存储层：GM_setValue / GM_getValue 优先
     ChromeXt 把它们存在浏览器进程里，所有 origin 共享 —— 这是唯一能
     让「错误页(预览器) 写入、普通网页(脚本库) 读出」的存储方案。
     localStorage 在错误页是 opaque origin，会直接抛 SecurityError。
     这里在外层（用户脚本作用域）捕获引用并挂到 window，
     供后续注入的页面脚本调用。
  ============================================================ */
  window.__fvStore = {
    get: function (k, d) {
      try {
        if (typeof GM_getValue === 'function') {
          var v = GM_getValue(k, null);
          if (v !== null && v !== undefined) return v;
        }
      } catch (e) {}
      try {
        var s = localStorage.getItem(k);
        if (s !== null && s !== undefined) return s;
      } catch (e) {}
      try {
        if (window.__fvMem && window.__fvMem[k] !== undefined) return window.__fvMem[k];
      } catch (e) {}
      return d;
    },
    set: function (k, v) {
      // ChromeXt 对未实现的 grant 会注入「只 console.error 的空壳函数」，
      // 所以不能靠 typeof 判断，必须写后回读验证。
      var ok = false;
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(k, v);
          var back = null;
          try { back = GM_getValue(k, null); } catch (e) {}
          ok = (back === v);   // 回读到才说明是真实现
        }
      } catch (e) { ok = false; }
      try { localStorage.setItem(k, v); } catch (e) {}
      try {
        if (!window.__fvMem) window.__fvMem = {};
        window.__fvMem[k] = v;
      } catch (e) {}
      return ok;
    },
    remove: function (k) {
      try { if (typeof GM_setValue === 'function') GM_setValue(k, null); } catch (e) {}
      try { localStorage.removeItem(k); } catch (e) {}
      try { if (window.__fvMem) delete window.__fvMem[k]; } catch (e) {}
    }
  };

  /* 尽早记录「本次访问的是入口」：此刻若 hostname 仍是入口（document-start 阶段），
     随后错误页就能凭这个时间戳确认归属（错误页 hostname 会变成 chromewebdata）。
     必须放在 __fvStore 定义之后，否则 set 未定义、记录不到。 */
  try {
    if (location.hostname === 'fv-local-preview.invalid') {
      window.__fvStore.set('fv_entry_ts', String(Date.now()));
    }
  } catch (e) {}

  /* ============================================================
     入口判定：本脚本只在「预览器入口页」构建工具，
     其它网页一律不改动（脚本本身由 ChromeXt 负责分发）。
  ============================================================ */
  var ENTRY_HOST = 'fv-local-preview.invalid';


  var TS_KEY = 'fv_entry_ts';
  /* 入口记忆窗口：首次 document-start 时 hostname 还是入口，会记下时间戳；
     随后错误页用它确认归属。窗口放大到 5 分钟，避免 DNS 重试耗时导致判否。 */
  var ENTRY_REMEMBER_MS = 5 * 60 * 1000;

  /* ---------- 入口域名访问时间戳（首次 document-start 时记录） ---------- */
  function markEntry() {
    try { window.__fvStore.set(TS_KEY, String(Date.now())); } catch (e) {}
  }
  function recentEntry(ms) {
    try {
      var t = parseInt(window.__fvStore.get(TS_KEY, '0'), 10);
      return t > 0 && (Date.now() - t) < (ms || ENTRY_REMEMBER_MS);
    } catch (e) { return false; }
  }

  /* ---------- 错误页识别 ----------
     .invalid 解析失败后，Chrome 会把 document 换成 chrome-error://chromewebdata/，
     原 hostname 丢失，所以不能用 hostname 判断。改用：
       1) location.protocol 为 chrome-error:（最可靠，不依赖文本是否渲染完成）
       2) 页面文本含 ERR_XXX 错误码（兜底）
  */
  /* 页面可见文本：innerText 在部分 WebView 未实现，故三级兜底 */
  function pageText() {
    try {
      var el = document.documentElement || document.body;
      if (!el) return '';
      var t = el.innerText;
      if (!t) t = el.textContent;
      if (!t && document.body) {
        t = document.body.innerText || document.body.textContent || document.body.innerHTML || '';
      }
      return String(t || '');
    } catch (e) { return ''; }
  }

  function isErrorPage() {
    try {
      var p = String(location.protocol || '').toLowerCase();
      if (p === 'chrome-error:' || p === 'chrome:') return true;
      if (/chromewebdata|neterror/i.test(location.href)) return true;
    } catch (e) {}
    if (/ERR_[A-Z_]+/.test(pageText())) return true;
    return false;
  }

  /* ---------- 错误页是否显示的是我们的入口地址 ----------
     Chrome 错误页会原样显示失败的 URL，所以直接找文本里的入口域名，
     不需要跨 document 传递数据（错误页的 localStorage 可能被隔离）。
  */
  function errorPageIsOurs() {
    try { return pageText().indexOf(ENTRY_HOST) >= 0; } catch (e) { return false; }
  }

  /* ---------- 是否应构建预览器 ----------
     返回 'yes'（构建）/ 'no'（不构建，当普通网页）/ 'maybe'（信息不足，稍后重试）
  */
  function shouldBuildPreview() {
    // 情况1：正常加载成功，hostname 就是入口
    try { if (location.hostname === ENTRY_HOST) { markEntry(); return 'yes'; } } catch (e) {}

    // 情况2：错误页精准识别
    if (isErrorPage()) {
      if (errorPageIsOurs()) return 'yes';    // 错误页文本里有入口域名（主信号）
      if (recentEntry(ENTRY_REMEMBER_MS)) return 'yes';  // 兜底：近期访问过入口
      // 文本可能还没渲染、且错误页 localStorage 可能被隔离 → 信息不足，待定
      return 'maybe';
    }
    return 'no';
  }

  /* ============================================================
     精确诊断：把「为什么拿不到 dispatch」的真实状态报出来
  ============================================================ */
  window.__fvDiag = function () {
    var r = {};
    r.href = String(location.href).slice(0, 120);
    r.protocol = location.protocol;
    r.hostname = location.hostname;
    r.isErrorPage = isErrorPage();
    r.readyState = document.readyState;
    try { r.typeof_ChromeXt = (typeof ChromeXt); } catch (e) { r.typeof_ChromeXt = 'throw:' + e.message; }
    try { r.window_ChromeXt = typeof window.ChromeXt; } catch (e) { r.window_ChromeXt = 'throw'; }
    try { r.CX_captured = !!window.__fvCX; } catch (e) { r.CX_captured = false; }
    try { r.unsafeWindow = typeof unsafeWindow; } catch (e) { r.unsafeWindow = 'throw'; }
    try { r.bridge_isRealWin = (REAL_WIN && REAL_WIN !== window) ? 'yes(沙箱)' : 'no(同对象)'; } catch (e) {}
    try { r.bridge_REALWIN_hasCX = !!(REAL_WIN && REAL_WIN.__fvCX); } catch (e) {}
    try { r.pageWin_hasCX = !!(window.__fvCX); } catch (e) {}
    try { r.docAttr_cx = document.documentElement.getAttribute('data-fv-cx') || '(none)'; } catch (e) {}
    ['GM_setValue', 'GM_getValue', 'GM_info', 'GM_addStyle'].forEach(function (n) {
      var v;
      try { v = eval('typeof ' + n); } catch (e) { v = 'eval-error'; }
      r['gm_' + n] = v;
    });
    try { r.GM_dot = (typeof GM !== 'undefined') ? Object.keys(GM).join(',') : 'undefined'; } catch (e) { r.GM_dot = 'throw'; }
    // 扫描 window 上的 Symbol
    var syms = [];
    try {
      Object.getOwnPropertySymbols(window).forEach(function (s) {
        if (/webidl2js|constructor registry/i.test(String(s))) return;
        var v; try { v = window[s]; } catch (e) { return; }
        if (v && typeof v === 'object') {
          syms.push(String(s).replace(/^Symbol\(|\)$/g, '') + ':' + (typeof v.dispatch === 'function' ? 'has-dispatch' : 'obj'));
        }
      });
    } catch (e) {}
    r.symbols = syms.slice(0, 12);
    // GM 存储实测
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue('__fv_diag_t', '1');
        r.gmStoreOk = (typeof GM_getValue === 'function') && GM_getValue('__fv_diag_t', null) === '1';
      } else r.gmStoreOk = 'GM_setValue undefined';
    } catch (e) { r.gmStoreOk = 'throw:' + e.message; }
    try { localStorage.setItem('__fv_t', '1'); r.localStorage = 'ok'; } catch (e) { r.localStorage = 'throw:' + e.message; }
    return r;
  };

  /* ============================================================
     中转安装：错误页上拿不到 ChromeXt.dispatch 时的兜底
     原理：错误页上拿不到 dispatch（GM 作用域未建立）时，
     把脚本 base64 编码进 URL hash，跳到普通网页；
     普通网页上 GM 作用域正常，能拿到 dispatch，装完再跳回入口。
     不依赖任何存储或 window 桥，跨沙箱一定可用。
  ============================================================ */
  var HASH_FLAG = '#fvinstall=';

  function b64dec(b) {
    try { return decodeURIComponent(escape(atob(b))); } catch (e) { return null; }
  }

  function readTask() {
    try {
      var h = location.hash || '';
      if (h.indexOf(HASH_FLAG) === 0) {
        var c = b64dec(h.slice(HASH_FLAG.length));
        if (c) return { code: c, via: 'url' };
      }
    } catch (e) {}
    return null;
  }

  function clearTask() {
    try {
      if ((location.hash || '').indexOf(HASH_FLAG) === 0) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) {}
  }
  function doInstallOnNormalPage(task, done) {
    var CX = null;
    try { if (typeof ChromeXt !== 'undefined' && ChromeXt && typeof ChromeXt.dispatch === 'function') CX = ChromeXt; } catch (e) {}
    if (!CX) {
      try { if (window.ChromeXt && typeof window.ChromeXt.dispatch === 'function') CX = window.ChromeXt; } catch (e) {}
    }
    if (!CX) {
      try {
        Object.getOwnPropertySymbols(window).forEach(function (s) {
          if (CX) return;
          if (/webidl2js|constructor registry/i.test(String(s))) return;
          var v; try { v = window[s]; } catch (e) { return; }
          if (v && typeof v.dispatch === 'function') CX = v;
        });
      } catch (e) {}
    }
    if (!CX) { done(false, '普通网页上也拿不到 dispatch'); return; }
    try {
      CX.dispatch('installScript', task.code);
      try { CX.dispatch('notification', { id: 'fv', uuid: 0, title: 'FV 安装', text: '中转安装已发送', timeout: 2500 }); } catch (e) {}
      done(true, 'ok');
    } catch (e) { done(false, e.message); }
  }

  /* 普通网页上：若存在待安装任务，执行安装后跳回入口 */
  function tryRelayInstall() {
    var task = readTask();
    if (!task) return false;
    clearTask();
    doInstallOnNormalPage(task, function (ok, err) {
      try {
        window.__fvRelayResult = ok ? ('安装成功（' + task.via + '）') : ('安装失败：' + err);
      } catch (e) {}
      setTimeout(function () {
        try { location.href = 'https://fv-local-preview.invalid/'; } catch (e) {}
      }, 1200);
    });
    return true;
  }

  /* 暴露给页面脚本
     注意：GM 沙箱下 window 是包装对象，window.xxx 页面脚本看不到。
     所以改用「DOM 属性」当桥：documentElement 是页面共享的真实节点，
     跨沙箱一定可见。同时仍写一份到 REAL_WIN / window 作为补充。 */
  function diagText() {
    try {
      var r = window.__fvDiag();
      var L = [];
      L.push('—— 诊断 ——');
      Object.keys(r).forEach(function (k) {
        var v = r[k];
        L.push(k + ': ' + (Array.isArray(v) ? v.join(' | ') : v));
      });
      L.push('');
      L.push('判读：');
      L.push('· typeof_ChromeXt = function/object → 已解锁，可直连安装；undefined 则未解锁');
      L.push('· bridge_isRealWin = yes(沙箱) → 已用 unsafeWindow 桥，看 bridge_REALWIN_hasCX');
      L.push('· 两项都是 false 时，用「中转安装」：跳普通网页完成安装');
      return L.join('\n');
    } catch (e) { return '诊断失败：' + e.message; }
  }

  window.__fvDiagText = diagText;

  /* 把诊断结果写进 DOM 属性（最可靠的桥） */
  function pushDiagToDom() {
    try {
      var t = diagText();
      document.documentElement.setAttribute('data-fv-diag', t);
      try { REAL_WIN.__fvDiagText = diagText; } catch (e) {}
      try { REAL_WIN.__fvDiag = window.__fvDiag; } catch (e) {}
    } catch (e) {}
  }
  pushDiagToDom();
  setTimeout(pushDiagToDom, 300);
  setTimeout(pushDiagToDom, 1000);
  setTimeout(pushDiagToDom, 3000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { grabCX(); pushDiagToDom(); });
  }
  window.addEventListener('load', function () { grabCX(); pushDiagToDom(); });


  var decision = shouldBuildPreview();

  if (decision === 'no') {
    // 普通网页：先检查有没有中转安装任务，有就执行；否则直接退出、不改动页面
    tryRelayInstall();
    return;
  }

  if (decision === 'maybe') {
    // 错误页刚注入、文本还没渲染：快速轮询确认归属，最多约 1.2 秒
    var probe = [0, 20, 40, 80, 150, 300, 600, 1200], pi = 0;
    (function nextProbe() {
      var d2 = shouldBuildPreview();
      if (d2 === 'yes') { startPreview(); return; }
      if (d2 === 'no') return;
      if (pi < probe.length) { setTimeout(nextProbe, probe[pi++]); }
      /* 超时：错误页文本始终未渲染。放宽为「近期访问过入口」再确认一次；
         仍判否则退出，让浏览器原本的错误页正常显示（不隐藏、不空白）。 */
      else { if (recentEntry(ENTRY_REMEMBER_MS)) { startPreview(); } return; }
    })();
    return;
  }
  // decision === 'yes' → 继续往下构建预览器

  /* ============================================================
     样式与结构
  ============================================================ */
var CSS =
    '*{box-sizing:border-box}' +
    'html,body{margin:0;height:100%}' +
    'body{font:14px/1.6 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6fa;color:#333}' +
    '.head{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04)}' +
    '.title{font-weight:700;color:#2f7d63;white-space:nowrap}' +
    '.pick{flex:1;min-width:130px;position:relative;overflow:hidden;background:#fff;border:1px solid #ccd0d6;border-radius:8px;padding:7px 10px;font-size:13px;color:#555;cursor:pointer;white-space:nowrap;text-overflow:ellipsis}' +
    '.pick input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}' +
    '.btn{padding:7px 12px;border:0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:#2f7d63;color:#fff;white-space:nowrap}' +
    '.btn.sec{background:#607d8b}' +
    '.btn.ghost{background:#eef2f5;color:#333;border:1px solid #ccd0d6}' +
    '.btn:active{transform:scale(.96)}' +
    '.stage{height:calc(100% - 54px);background:#fff}' +
    '#fv-frame{width:100%;height:100%;border:0;background:#fff;display:none}' +
    '#fv-pre{margin:0;padding:14px;width:100%;height:100%;overflow:auto;white-space:pre-wrap;background:#fafafa;color:#333;font:13px/1.6 "SFMono-Regular",Consolas,monospace;display:none}' +
    '#fv-md{padding:18px 22px;width:100%;height:100%;overflow:auto;background:#fff;display:none}' +
    '#fv-media{width:100%;height:100%;display:none;align-items:center;justify-content:center;background:#fff;padding:12px;overflow:auto}' +
    '#fv-md h1,#fv-md h2,#fv-md h3,#fv-md h4{color:#1f2d3d;margin:16px 0 8px}' +
    '#fv-md h1{border-bottom:1px solid #eee;padding-bottom:6px}' +
    '#fv-md p{margin:8px 0}' +
    '#fv-md a{color:#2f7d63}' +
    '#fv-md code{background:#f0f2f5;padding:1px 5px;border-radius:4px;color:#c0341d;font-family:Consolas,monospace}' +
    '#fv-md pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}' +
    '#fv-md pre code{background:transparent;color:inherit}' +
    '#fv-md blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #2f7d63;background:#f0f7f4;color:#555}' +
    '#fv-md img{max-width:100%;border-radius:6px}' +
    '#fv-md hr{border:0;border-top:1px solid #eee;margin:16px 0}' +
    '.jk{color:#0077aa}.js{color:#d14}.jn{color:#c18401}.jb{color:#8250df}' +
    '.ck{color:#c792ea}.cs{color:#0a7d34}.cc{color:#7a8290}.cn{color:#c18401}' +
    '#fv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:9px 18px;border-radius:20px;font-size:13px;z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:90%}' +
    '#fv-toast.on{opacity:1}' +
    '#fv-fab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483645;width:32px;height:50px;background:#2f7d63;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;font:bold 12px system-ui;cursor:pointer;box-shadow:0 8px 32px 0 rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.2);border-right:none;transition:width .3s,opacity .3s;opacity:.92}' +
    '#fv-fab:active{width:45px;opacity:1}' +
    '#fv-mask{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.4);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center}' +
    '#fv-mask.on{display:flex}' +
    '#fv-card{width:88%;max-width:420px;max-height:78vh;overflow:auto;background:rgba(255,255,255,.95);border:1px solid rgba(255,255,255,.6);border-radius:24px;padding:16px;box-shadow:0 8px 32px 0 rgba(0,0,0,.2);display:flex;flex-direction:column;gap:10px;animation:pop .3s cubic-bezier(.34,1.56,.64,1)}' +
    '@keyframes pop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}' +
    '#fv-card .ct{font-weight:700;color:#2f7d63;text-align:center;font-size:16px;padding:4px 0}' +
    '.mi{padding:14px;background:rgba(255,255,255,.85);color:#333;border:1px solid rgba(0,0,0,.08);border-radius:14px;font:600 15px system-ui;text-align:center;cursor:pointer;transition:all .2s}' +
    '.mi:hover{background:#2f7d63;color:#fff}' +
    '.mi:active{transform:scale(.97)}' +
    '.mi.close{background:#fdecec;color:#c0392b}' +
    '#fv-inst{position:fixed;inset:0;z-index:2147483646;background:#f5f6fa;display:none;flex-direction:column}' +
    '#fv-inst .ih,#fv-overlay .oh{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;box-shadow:0 2px 6px rgba(0,0,0,.04);flex:none}' +
    '#fv-inst .tip{padding:8px 12px;color:#666;font-size:12px;background:#fffbe6;border-bottom:1px solid #f0e6c0;line-height:1.7}' +
    '#fv-inst-code{flex:1;overflow:auto;margin:10px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;font:12px/1.6 Consolas,monospace;color:#333;-webkit-user-select:text;user-select:text;resize:none;min-height:180px}' +
    '#fv-overlay{position:fixed;inset:0;z-index:2147483644;background:#fff;display:none;flex-direction:column}' +
    '#fv-ov-tip{display:none;padding:8px 12px;background:#fff7e6;color:#8a6d3b;font-size:12px;border-bottom:1px solid #f0e0b0}' +
    '#fv-ov-frame{flex:1;width:100%;border:0;background:#fff}' +
    '#fv-ov-inline{flex:1;width:100%;overflow:auto;background:#fff;display:none}' +
          /* 必须限定为「直接子元素」：
         若写成后代选择器 #fv-ov-inline pre，会命中 md 全屏里
         .fvmd 内的代码块 <pre>，而它特异性(1,0,1) 高于 .fvmd pre(0,1,1)，
         于是把代码文字色 #d6deeb(浅) 覆盖成 #333(深灰) ——
         深色代码块配深灰字几乎看不见，就是「全屏后文字变灰」的原因。
         md 的 pre 在 .fvmd 内层，是孙子元素，用 > 即可避开。 */
      '#fv-ov-inline > pre{margin:0;padding:14px;white-space:pre-wrap;font:13px/1.6 Consolas,monospace;color:#333}' +
    /* 自检风险确认层：必须比 fv-dlg 更高，否则会被安装面板盖住看不见 */
    '#fv-cf{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:16px}' +
    '#fv-cf.on{display:flex}' +
    '#fv-cf-box{width:100%;max-width:420px;max-height:82vh;overflow:auto;background:#fff;border-radius:18px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:10px}' +
    '#fv-cf-t{font:700 15px system-ui;color:#b42318}' +
    '#fv-cf-b{font:12px/1.75 ui-monospace,Consolas,monospace;color:#444;white-space:pre-wrap;word-break:break-all;max-height:54vh;overflow:auto;background:#fff5f5;border:1px solid #f3c2c2;border-radius:10px;padding:10px}' +
    '#fv-cf-btns{display:flex;gap:8px}' +
    '#fv-dlg-check{font:12px/1.75 system-ui;padding:8px 12px;white-space:pre-wrap;word-break:break-all;border-bottom:1px solid #e5e7eb}' +
    '#fv-dlg{position:fixed;inset:0;z-index:2147483646;background:#f5f6fa;display:none;flex-direction:column}' +
    '#fv-dlg .ih{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;box-shadow:0 2px 6px rgba(0,0,0,.04);flex:none}' +
    '#fv-dlg-tip{padding:8px 12px;color:#8a6d3b;font-size:12px;background:#fffbe6;border-bottom:1px solid #f0e6c0;line-height:1.7}' +
    '@media(max-width:480px){.head{gap:4px}.pick{min-width:100px}.btn{padding:6px 9px}}';

var BODY =
    '<div class="head">' +
      '<span class="title">📂 FV 本地预览</span>' +
      '<span class="pick"><span id="fv-name">📁 选择文件</span>' +
        '<input type="file" id="fv-file" accept=".html,.htm,.xhtml,.xht,.xml,.xsl,.xslt,.svg,.json,.md,.markdown,.js,.mjs,.user.js,.css,.csv,.tsv,.txt,.log,.pdf,.mhtml,.mht,.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp3,.wav,.ogg,.m4a,.mp4,.webm">' +
      '</span>' +
      '<button class="btn" id="fv-full">🖥️ 全屏打开</button>' +
      '<button class="btn sec" id="fv-reload">重载</button>' +
      '<button class="btn ghost" id="fv-home">首页</button>' +
    '</div>' +
    '<div class="stage">' +
      '<iframe id="fv-frame"></iframe>' +
      '<pre id="fv-pre"></pre>' +
      '<div id="fv-md"></div>' +
      '<div id="fv-media"></div>' +
    '</div>' +
    '<div id="fv-toast"></div>' +
    '<div id="fv-fab">FV</div>' +
    '<div id="fv-mask"><div id="fv-card"></div></div>' +
    /* 本面板现在只用于诊断（安装已改走 fv-dlg 可编辑确认框）。
       标题与按钮必须和用途一致，否则会被误当成「复制安装代码」。 */
    '<div id="fv-inst">' +
      '<div class="ih">' +
        '<span class="title">🔍 诊断信息</span>' +
        '<button class="btn" id="fv-copy">📋 一键复制日志</button>' +
        '<button class="btn ghost" id="fv-inst-close">✕ 关闭</button>' +
      '</div>' +
      '<div class="tip" id="fv-inst-tip"></div>' +
      /* 用 textarea 而不是 div：错误页 origin=null（非安全上下文），
         navigator.clipboard 不存在、execCommand 又不可靠（会复制页面选区）。
         textarea 支持长按 → 全选/复制，是本环境下唯一可靠的路径。 */
      '<textarea id="fv-inst-code" readonly spellcheck="false"></textarea>' +
    '</div>' +
    '<div id="fv-overlay">' +
      /* 顶栏默认隐藏：全屏要像正常网页一样占满，返回改放悬浮球菜单。 */
      '<div class="oh" id="fv-ov-head" style="display:none">' +
        '<span class="title">🖥️ 全屏预览</span>' +
        '<button class="btn" id="fv-ov-dl" style="display:none">⬇️ 下载</button>' +
        '<button class="btn ghost" id="fv-ov-close">✕ 退出全屏</button>' +
      '</div>' +
      '<div id="fv-ov-tip"></div>' +
      '<iframe id="fv-ov-frame"></iframe>' +
      '<div id="fv-ov-inline"></div>' +
    '</div>' +
    '<div id="fv-dlg">' +
      '<div class="ih">' +
        '<span class="title">⚡ 安装到 ChromeXt</span>' +
        '<button class="btn" id="fv-dlg-install">✅ 确认安装</button>' +
        '<button class="btn sec" id="fv-dlg-refresh">🔄 刷新预览</button>' +
        '<button class="btn ghost" id="fv-dlg-close">✕ 取消</button>' +
      '</div>' +
      '<div class="tip" id="fv-dlg-tip"></div>' +
      '<div id="fv-dlg-check"></div>' +
      '<div style="flex:1;overflow:auto;display:flex;flex-direction:column">' +
        '<div id="fv-dlg-form" style="padding:12px"></div>' +
        '<div style="padding:0 12px 12px">' +
          '<div style="font:600 12px system-ui;color:#555;margin-bottom:4px">最终安装内容（由上方字段生成）</div>' +
          '<div id="fv-dlg-code" style="max-height:220px;overflow:auto;padding:12px;background:#fff;' +
            'border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-all;' +
            'font:11px/1.6 Consolas,monospace;color:#333;-webkit-user-select:text;user-select:text"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="fv-cf"><div id="fv-cf-box">' +
      '<div id="fv-cf-t"></div><div id="fv-cf-b"></div><div id="fv-cf-btns"></div>' +
    '</div></div>';

  /* ============================================================
     工具页脚本（普通函数写法，最后 toString 注入，避免双重转义）
     注意：函数体内不能出现字面的 </script>
  ============================================================ */
  function toolScript() {
    var $ = function (i) { return document.getElementById(i); };
    var fileInput = $('fv-file'), pick = $('fv-name'), frame = $('fv-frame'),
        preBox = $('fv-pre'), mdBox = $('fv-md'), mediaBox = $('fv-media'),
        toast = $('fv-toast'), fab = $('fv-fab'), mask = $('fv-mask'), card = $('fv-card'),
        instPanel = $('fv-inst'), instCode = $('fv-inst-code'), instTip = $('fv-inst-tip'),
        overlay = $('fv-overlay'), ovFrame = $('fv-ov-frame'), ovTip = $('fv-ov-tip'),
        ovDl = $('fv-ov-dl');

    var lastText = '', lastName = '', lastKind = '', lastFile = null, lastBlob = null, lastOvUrl = null;
    var ovLast = null;   // 最近一次全屏的信息，供诊断使用
    var lastCheck = null;  // 最近一次安装前自检结果，供诊断显示
    var S1 = '<' + 'script>', S2 = '<' + '/script>';

    /* ---------- 基础 ---------- */
    function msg(s, ms) {
      if (!toast) return;
      toast.textContent = s;
      toast.classList.add('on');
      clearTimeout(window.__fvT);
      window.__fvT = setTimeout(function () { toast.classList.remove('on'); }, ms || 2800);
    }
    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function ext() {
      var a = String(lastName).split('.');
      return a.length > 1 ? a.pop().toLowerCase() : '';
    }
    function hideAll() {
      frame.style.display = 'none';
      preBox.style.display = 'none';
      mdBox.style.display = 'none';
      mediaBox.style.display = 'none';
    }
    function showPre(html) { hideAll(); preBox.style.display = 'block'; preBox.innerHTML = html; }
    function showMd(html) {
      hideAll();
      mdBox.style.display = 'block';
      mdBox.innerHTML = html;
      /* 关键：#fv-md 全局 CSS 自带 padding:18px 22px，
         而 mdRenderHtml() 里内层 .fvmd 也带 padding → 主界面变成 36/44px，
         全屏容器无 padding 只有 18/22px → 两处观感不一样。
         这里把外壳 padding 归零，样式统一由 .fvmd 负责，保证完全一致。 */
      try { mdBox.style.padding = '0'; } catch (e) {}
    }
    /* Markdown 统一渲染：主界面与全屏共用同一份 HTML+CSS，
       避免两处各写一套导致观感不一致（字体/间距/滚动不同）。 */
    function mdRenderHtml(t) {
      return '<style>' + MD_CSS + '</style>' +
        '<div class="fvmd" style="' + MD_INLINE + '">' + mdToHtml(t) + '</div>';
    }
    function showFrameSrc(t) { hideAll(); frame.style.display = 'block'; frame.removeAttribute('sandbox'); frame.srcdoc = t; }
    function showFrameBlob(url) { hideAll(); frame.style.display = 'block'; frame.removeAttribute('sandbox'); frame.src = url; }

    function newBlob(f, type) {
      try {
        if (lastBlob) { try { URL.revokeObjectURL(lastBlob); } catch (e) {} }
        lastBlob = URL.createObjectURL(type ? new Blob([f], { type: type }) : f);
        return lastBlob;
      } catch (e) {
        lastBlob = null;
        return null;
      }
    }

    /* ---------- 读取与编码识别 ---------- */
    function readArrayBuffer(f) {
      return new Promise(function (res, rej) {
        if (f.arrayBuffer) { f.arrayBuffer().then(res).catch(rej); return; }
        var r = new FileReader();
        r.onload = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
        r.readAsArrayBuffer(f);
      });
    }
    function decodeText(buf) {
      var bytes = new Uint8Array(buf);
      // BOM
      if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return td('utf-8', bytes.subarray(3));
      if (bytes[0] === 0xFF && bytes[1] === 0xFE) return td('utf-16le', bytes.subarray(2));
      if (bytes[0] === 0xFE && bytes[1] === 0xFF) return td('utf-16be', bytes.subarray(2));
      // UTF-8 严格
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) {}
      // meta / xml charset
      var probe = '';
      try { probe = new TextDecoder('utf-8').decode(bytes.slice(0, 4096)); } catch (e) {}
      var m = probe.match(/charset\s*=\s*["']?\s*([\w-]+)/i);
      if (m) { try { return td(m[1], bytes); } catch (e) {} }
      // 常见中文编码兜底
      var tries = ['gbk', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'iso-8859-1'];
      for (var i = 0; i < tries.length; i++) { try { return td(tries[i], bytes); } catch (e) {} }
      return td('utf-8', bytes);
    }
    function td(enc, bytes) { return new TextDecoder(enc).decode(bytes); }

    /* ---------- 全屏覆盖层（替代 window.open / data: 顶层导航） ---------- */
    /* 统一用 blob URL 渲染，不再用 srcdoc：
       部分 WebView 对 srcdoc 里的 <script> 支持不完整（js 全屏白屏），
       blob 走的是正常文档加载路径，脚本能执行，且可显式指定 charset。 */
    function makeBlobUrl(text, mime) {
      try {
        if (lastOvUrl) { try { URL.revokeObjectURL(lastOvUrl); } catch (e) {} lastOvUrl = null; }
        var b = new Blob([text], { type: (mime || 'text/html') + ';charset=utf-8' });
        lastOvUrl = URL.createObjectURL(b);
        return lastOvUrl;
      } catch (e) { return null; }
    }
    /* 给原样渲染的 html 智能注入 viewport：没有 viewport 的文档在手机上
       会按 980px 虚拟宽度缩小显示，看起来又小又不清晰。 */
    function withViewport(html) {
      try {
        if (/<meta[^>]+name\s*=\s*["']?viewport/i.test(html)) return html;
        var vp = '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes">';
        var m = html.match(/<head[^>]*>/i);
        if (m) return html.slice(0, m.index + m[0].length) + vp + html.slice(m.index + m[0].length);
        if (/^\s*<!doctype/i.test(html)) {
          var h = html.match(/<html[^>]*>/i);
          if (h) return html.slice(0, h.index + h[0].length) + '<head>' + vp + '</head>' + html.slice(h.index + h[0].length);
        }
        return '<!doctype html><html><head><meta charset="utf-8">' + vp + '</head><body>' + html + '</body></html>';
      } catch (e) { return html; }
    }
    /* 渲染模式：null origin（错误页 / chrome-error）下 blob URL 会变成
       blob:null/xxx，iframe 导航到它被浏览器拒绝 → 白屏。
       而 srcdoc 不依赖 origin，在此环境反而可靠（预览区已验证可用）。
       所以策略改为：srcdoc 优先，load 后检测 body 为空再回退 blob。 */
    /* ============================================================
       全屏渲染（两级模式）
       ① inline 模式：内容直接写进覆盖层 div，不用 iframe。
          用于 md / json / csv / txt / 代码 —— 完全绕开 origin 限制，最可靠。
       ② doc 模式：需要独立文档环境（html/xml/svg/js）时才用 iframe。
          错误页是 opaque origin，在此创建的 blob 是 blob:null/... ，
          Chromium 拒绝 iframe 加载它 → 白屏。所以优先级改为：
            srcdoc（不依赖 origin，最优先）
              ↓ 检测失败
            blob（正常 origin 下可用）
              ↓ 检测失败
            inline 兜底（剥离 script 后塞进 div，至少能看到内容）
    ============================================================ */
    function ovShowInline(html) {
      try {
        ovFrame.style.display = 'none';
        /* 不要用 src='about:blank' 清空：异步导航会覆盖随后设置的 srcdoc（竞态白屏） */
        try { ovFrame.srcdoc = ''; } catch (e) {}
        try { ovFrame.removeAttribute('src'); } catch (e) {}
        var box = $('fv-ov-inline');
        if (!box) return false;
        box.innerHTML = html || '';
        box.style.display = 'block';
        /* 容器本身也锁定字体：避免外层样式影响观感，保证与主界面一致 */
        box.style.fontFamily = MD_FONT;
        box.style.fontSize = '14px';
        box.style.lineHeight = '1.6';
        /* 与主界面 #fv-md 对齐：外壳不加 padding，交给内层容器 */
        box.style.padding = '0';
        ovLast = ovLast || {};
        ovLast.way = 'inline(直接注入)';
        return true;
      } catch (e) { return false; }
    }

    /* 判断 iframe 是否真的渲染出内容。
       关键：区分「确认失败」和「无法确认」。
       null origin（错误页）下即使 srcdoc 渲染成功，也常常读不到 contentDocument
       （跨域限制）。旧版把这当成失败 → 换 blob → blob 在 null origin 必失败 →
       最后降级成 inline 兜底（会剥离所有 script/style）→ 页面变白。
       所以读不到时不能判失败，应视为「无法确认」，保持当前渲染不动。 */
    function ovLoadedOk(cb) {
      var tries = 0, max = 12;
      (function check() {
        var of = $('fv-ov-frame');
        if (!of) { cb('fail'); return; }
        var len = -1, hasNode = false, readable = false;
        try {
          var dd = of.contentDocument;
          if (dd) {
            readable = true;
            if (dd.body) { len = dd.body.innerHTML.length; hasNode = dd.body.childNodes.length > 0; }
            else if (dd.documentElement) { len = dd.documentElement.innerHTML.length; }
          }
        } catch (e) { readable = false; }
        if (len > 0 || hasNode) { cb('ok'); return; }           // 确认渲染成功
        if (!readable) { cb('unknown'); return; }               // 读不到 → 无法确认，不降级
        if (++tries < max) { setTimeout(check, 120); }
        else { cb('fail'); }                                    // 能读但确实空 → 真失败
      })();
    }

    var ovRetryUsed = { srcdoc: false, blob: false };

    function openFullDoc(text, mime, noViewport, tip, dlName) {
      ovRetryUsed = { srcdoc: false, blob: false };
      var body = noViewport ? text : withViewport(text);

      function useFrame(way) {
        var of = $('fv-ov-frame');
        var box = $('fv-ov-inline');
        try { if (box) box.style.display = 'none'; } catch (e) {}
        of.style.display = 'block';
        if (way === 'srcdoc') {
          ovRetryUsed.srcdoc = true;
          try { of.removeAttribute('src'); } catch (e) {}
          of.srcdoc = body;
          ovLast = ovLast || {}; ovLast.way = 'iframe srcdoc';
        } else {
          ovRetryUsed.blob = true;
          try { of.removeAttribute('srcdoc'); } catch (e) {}
          var u = makeBlobUrl(body, mime || 'text/html');
          if (!u) { next('srcdoc'); return; }
          of.src = u;
          ovLast = ovLast || {}; ovLast.way = 'iframe blob'; ovLast.url = u;
        }
        ovLoadedOk(function (okk) {
          if (okk === 'ok') return;
          /* 读不到内容（跨域限制）≠ 渲染失败，保持当前方式不动，避免误降级 */
          if (okk === 'unknown') { ovLast = ovLast || {}; ovLast.way = ovLast.way + '（无法读取校验）'; return; }
          /* 确认失败 → 换下一种；都失败则 inline 兜底 */
          if (way === 'srcdoc' && !ovRetryUsed.blob) { next('blob'); return; }
          if (way === 'blob' && !ovRetryUsed.srcdoc) { next('srcdoc'); return; }
          /* 都试过了还不行 → inline（剥离 script/style 避免污染） */
          var safe = String(body)
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<\/?head[^>]*>/gi, '')
            .replace(/<\/?html[^>]*>/gi, '')
            .replace(/<!doctype[^>]*>/gi, '');
          var bi = safe.indexOf('<body');
          if (bi >= 0) {
            var be = safe.indexOf('>', bi);
            if (be >= 0) safe = safe.slice(be + 1);
          }
          safe = safe.replace(/<\/body>/gi, '');
          ovShowInline('<div style="padding:12px">' + safe + '</div>');
          ovLast = ovLast || {};
          ovLast.way = 'inline 兜底(已剥离脚本)';
          try { if (ovTip) { ovTip.style.display = 'block'; ovTip.textContent = 'iframe 渲染失败（' + way + ' 均无效），已降级为直接注入显示，脚本未执行。'; } } catch (e) {}
        });
      }
      function next(w) { useFrame(w); }

      /* 默认先 srcdoc：错误页 opaque origin 下 blob 会被拒 */
      useFrame('srcdoc');
    }

    /* mime 必须是合法 MIME；noViewport=true 时跳过 viewport 注入
       （SVG 是 XML 文档，插入 HTML 的 <meta> 会破坏结构） */
    /* 媒体 / PDF 全屏：把预览区已渲染好的 HTML 直接搬进全屏层。
       之前调用过 openFullMedia 但从未定义 → 媒体/PDF 点全屏直接抛 ReferenceError。 */
    /* 顶栏显隐：全屏时隐藏，让内容真正占满屏幕；
       仅当需要显示提示条或下载按钮时才露出，退出时恢复。 */
    function ovHeadShow(show) {
      try {
        var h = $('fv-ov-head');
        if (h) h.style.display = show ? 'flex' : 'none';
      } catch (e) {}
    }

    function openFullMedia(html, tip, dlName) {
      hideAll();
      overlay.style.display = 'flex';
      ovTip.style.display = tip ? 'block' : 'none';
      ovTip.textContent = tip || '';
      ovDl.style.display = dlName ? 'inline-block' : 'none';
      if (dlName) ovDl.setAttribute('data-name', dlName);
      ovHeadShow(!!tip || !!dlName);
      ovLast = { mime: '(媒体)', len: (html || '').length, url: '', srcDoc: false, way: '', origin: '' };
      try { ovLast.origin = String(location.origin || '(opaque)'); } catch (e) {}
      return ovShowInline('<div style="padding:12px;display:flex;align-items:center;justify-content:center;' +
        'min-height:100%;font-family:' + MD_FONT + '">' + html + '</div>');
    }

    function openFull(text, blobUrl, tip, dlName, mime, noViewport, inlineHtml) {
      hideAll();
      overlay.style.display = 'flex';
      ovTip.style.display = tip ? 'block' : 'none';
      ovTip.textContent = tip || '';
      ovDl.style.display = dlName ? 'inline-block' : 'none';
      if (dlName) ovDl.setAttribute('data-name', dlName);
      ovHeadShow(!!tip || !!dlName);
      ovLast = {
        mime: mime || 'text/html',
        len: (text || '').length,
        url: blobUrl || '',
        srcDoc: false,
        way: '',
        origin: ''
      };
      try { ovLast.origin = String(location.origin || '(opaque)'); } catch (e) {}

      /* 媒体/PDF 直接用 blob（它们是二进制流，srcdoc 不适用） */
      if (blobUrl) {
        try { $('fv-ov-inline').style.display = 'none'; } catch (e) {}
        ovFrame.style.display = 'block';
        try { ovFrame.removeAttribute('srcdoc'); } catch (e) {}
        ovFrame.src = blobUrl;
        ovLast.way = 'blob(媒体/PDF)';
        ovLast.url = blobUrl;
        return;
      }
      /* 展示类：直接 inline，不用 iframe */
      if (inlineHtml) { ovShowInline(inlineHtml); return; }
      openFullDoc(text, mime, noViewport, tip, dlName);
    }

    function closeFull() {
      overlay.style.display = 'none';
      try { ovHeadShow(false); ovTip.style.display = 'none'; ovTip.textContent = ''; ovDl.style.display = 'none'; } catch (e) {}
      /* 清空 iframe 不要用 src='about:blank'：它会触发一次异步导航，
         若紧接着再设 srcdoc，导航可能覆盖新内容（竞态）→ 连续打开全屏时白屏。
         改成先清空 srcdoc、再延时置空 src，两者都不会抢占后续渲染。 */
      try { ovFrame.srcdoc = ''; } catch (e) {}
      setTimeout(function () {
        try { if (!ovFrame.getAttribute('srcdoc')) ovFrame.src = ''; } catch (e) {}
      }, 0);
      try { var bi = $('fv-ov-inline'); if (bi) { bi.innerHTML = ''; bi.style.display = 'none'; } } catch (e) {}
      try { if (lastOvUrl) { URL.revokeObjectURL(lastOvUrl); lastOvUrl = null; } } catch (e) {}
      // 若地址被改成 .user.js 结尾，退出时还原，避免残留
      try {
        if (location.href.indexOf('.user.js') >= 0) history.replaceState(null, '', '/');
      } catch (e) {}
      // 恢复下方正常预览视图（全屏前 hideAll 把它隐藏了）
      try {
        if (lastText) route(lastFile || { name: lastName }, lastText);
        else if (lastBlob && lastFile) route(lastFile, '');
      } catch (e) {}
    }
    /* Markdown 样式（与外层 CSS 中 #fv-md 的规则一致），供全屏文档内联使用 */
    /* 字体栈必须与全局 body 完全一致。
       注意：光写在 <style> 里可能被其他规则带跑，或在某些 WebView 上
       注入的 <style> 不生效 → 所以要同时用「内联 style」硬写在元素上，
       内联优先级最高，任何选择器都覆盖不了。 */
    var MD_FONT = "-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif";
    var MD_INLINE = 'font-family:' + MD_FONT + ';font-size:14px;line-height:1.6;color:#333;background:#fff;padding:18px 22px';
    /* 不再写 html,body{margin:0}body{background:#fff}：
       这条是全局规则，全屏注入后会把整个文档 body 背景改成白色，
       退出全屏也无法还原。inline 容器本身已有 background:#fff，无需它。 */
    var MD_CSS = '' +
      /* 字体栈必须与全局 body 完全一致（原来是 system-ui，中文解析结果不同，
         导致主界面与全屏观感不一样）。padding/背景也对齐主界面 #fv-md。 */
      '.fvmd{width:100%;box-sizing:border-box}' +
      '.fvmd h1,.fvmd h2,.fvmd h3,.fvmd h4{color:#1f2d3d;margin:16px 0 8px}' +
      '.fvmd h1{border-bottom:1px solid #eee;padding-bottom:6px}' +
      '.fvmd p{margin:8px 0}' +
      '.fvmd a{color:#2f7d63}' +
      '.fvmd code{background:#f0f2f5;padding:1px 5px;border-radius:4px;color:#c0341d;font-family:Consolas,monospace}' +
      '.fvmd pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}' +
      '.fvmd pre code{background:transparent;color:inherit}' +
      '.fvmd blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #2f7d63;background:#f0f7f4;color:#555}' +
      '.fvmd img{max-width:100%;border-radius:6px}' +
      '.fvmd hr{border:0;border-top:1px solid #eee;margin:16px 0}';

    /* ---------- 各类渲染 ---------- */
    function renderHtml(t) { lastKind = 'html'; showFrameSrc(t); msg('已打开：' + lastName + '（相对路径资源可能加载失败）'); }

    function renderXml(t) {
      lastKind = 'xml';
      var isXsl = ext() === 'xsl' || ext() === 'xslt';
      showFrameSrc(t);
      msg('已打开：' + lastName + (isXsl ? '（XSL/XSLT 以源码树显示）' : ''));
    }

    function renderSvg(f, t) {
      lastKind = 'svg';
      var url = newBlob(new Blob([t], { type: 'image/svg+xml;charset=utf-8' }));
      if (!url) { renderCode(t); msg('无法创建预览链接，已按源码显示'); return; }
      showFrameBlob(url);
      msg('已打开：' + lastName);
    }

    function renderJson(t) {
      lastKind = 'json';
      var out;
      try { out = JSON.stringify(JSON.parse(t), null, 2); }
      catch (e) { out = t; msg('JSON 解析失败，显示原文'); }
      showPre(esc(out).replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        function (m) {
          if (/:$/.test(m)) return '<span class="jk">' + m + '</span>';
          if (/^"/.test(m)) return '<span class="js">' + m + '</span>';
          if (/true|false|null/.test(m)) return '<span class="jb">' + m + '</span>';
          return '<span class="jn">' + m + '</span>';
        }));
    }

    function mdInline(s) {
      s = s.replace(/`([^`]+)`/g, function (m, c) { return '<code>' + esc(c) + '</code>'; });
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, t, u) { return '<img alt="' + esc(t) + '" src="' + u + '">'; });
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) { return '<a href="' + u + '" target="_blank">' + t + '</a>'; });
      return s;
    }
    function mdToHtml(text) {
      var lines = text.replace(/\r\n/g, '\n').split('\n'), out = [], i = 0;
      while (i < lines.length) {
        var line = lines[i];
        if (/^```/.test(line)) {
          var buf = []; i++;
          while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
          i++;
          out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
          continue;
        }
        if (/^\s*>\s?/.test(line)) {
          out.push('<blockquote>' + mdInline(line.replace(/^\s*>\s?/, '')) + '</blockquote>'); i++; continue;
        }
        var h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) { out.push('<h' + h[1].length + '>' + mdInline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
        if (/^\s*[-*+]\s+/.test(line)) { out.push('<ul><li>' + mdInline(line.replace(/^\s*[-*+]\s+/, '')) + '</li></ul>'); i++; continue; }
        if (/^\s*\d+\.\s+/.test(line)) { out.push('<ol><li>' + mdInline(line.replace(/^\s*\d+\.\s+/, '')) + '</li></ol>'); i++; continue; }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
        if (line.trim() === '') { i++; continue; }
        out.push('<p>' + mdInline(line) + '</p>'); i++;
      }
      return out.join('\n');
    }
    function renderMd(t) { lastKind = 'md'; showMd(mdRenderHtml(t)); msg('已渲染：' + lastName); }

    function codeHtml(t) {
      var s = esc(t);
      s = s.replace(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="cc">$1</span>');
      s = s.replace(/(&quot;[^&]*?&quot;|'[^']*?'|`[^`]*?`)/g, '<span class="cs">$1</span>');
      s = s.replace(/\b(const|let|var|function|return|if|else|for|while|new|class|async|await|import|export|try|catch|public|private|static|void|int|string)\b/g, '<span class="ck">$1</span>');
      s = s.replace(/\b(true|false|null|undefined)\b/g, '<span class="cn">$1</span>');
      return s;
    }
    function renderCode(t) { lastKind = 'code'; showPre(codeHtml(t)); msg('已高亮：' + lastName); }

    function renderCsv(t) {
      lastKind = 'csv';
      var delim = ext() === 'tsv' ? '\t' : ',';
      var rows = t.replace(/\r\n/g, '\n').split('\n').filter(function (r) { return r.length; });
      var html = '<table style="border-collapse:collapse;font:13px system-ui;width:100%">';
      rows.slice(0, 500).forEach(function (r, ri) {
        var cells = r.split(delim);
        html += '<tr>' + cells.map(function (c) {
          var st = 'border:1px solid #e5e7eb;padding:6px 8px;' + (ri === 0 ? 'background:#f0f4f8;font-weight:600;' : '');
          return '<td style="' + st + '">' + esc(c) + '</td>';
        }).join('') + '</tr>';
      });
      html += '</table>';
      if (rows.length > 500) html += '<p style="color:#888">仅显示前 500 行</p>';
      hideAll();
      preBox.style.display = 'block';
      preBox.innerHTML = html;
      msg('已渲染表格：' + lastName + '（' + rows.length + ' 行）');
    }

    /* ---------- 媒体 ---------- */
    function renderMedia(f, kind) {
      lastKind = kind;
      hideAll();
      mediaBox.style.display = 'flex';
      mediaBox.innerHTML = '';
      var url = newBlob(f);
      if (!url) {
        mediaBox.innerHTML = '<div style="color:#a33;font:14px system-ui">无法创建预览链接（浏览器不支持 Blob URL）</div>';
        msg('无法预览此媒体文件');
        return;
      }
      var el;
      if (kind === 'image') {
        el = document.createElement('img');
        el.src = url;
        el.style.maxWidth = '100%'; el.style.maxHeight = '100%';
      } else if (kind === 'audio') {
        el = document.createElement('audio');
        el.src = url; el.controls = true; el.style.width = '80%';
      } else {
        el = document.createElement('video');
        el.src = url; el.controls = true;
        el.style.maxWidth = '100%'; el.style.maxHeight = '100%';
      }
      mediaBox.appendChild(el);
      msg('已打开：' + lastName);
    }

    /* ---------- PDF ---------- */
    function renderPdf(f) {
      lastKind = 'pdf';
      hideAll();
      mediaBox.style.display = 'flex';
      mediaBox.innerHTML = '';
      var url = newBlob(f, 'application/pdf');
      if (!url) {
        mediaBox.innerHTML = '<div style="color:#a33;font:14px system-ui">无法创建预览链接</div>';
        msg('无法预览此 PDF');
        return;
      }
      var box = document.createElement('div');
      box.style.cssText = 'text-align:center;color:#555;font:14px system-ui;padding:20px';
      box.innerHTML = '<div style="font-size:40px">📕</div>' +
        '<div style="margin:10px 0">' + esc(f.name) + '</div>' +
        '<div style="color:#888;font-size:13px;margin-bottom:14px">' + (f.size / 1024).toFixed(1) + ' KB</div>';
      var a = document.createElement('a');
      a.href = url; a.download = f.name;
      a.textContent = '⬇️ 下载此 PDF';
      a.style.cssText = 'display:inline-block;padding:8px 16px;background:#2f7d63;color:#fff;border-radius:8px;text-decoration:none;margin:4px';
      var b = document.createElement('button');
      b.textContent = '🖥️ 尝试内嵌预览';
      b.style.cssText = 'padding:8px 16px;background:#607d8b;color:#fff;border:0;border-radius:8px;margin:4px';
      b.onclick = function () {
        openFull('', url, '若下方空白，说明当前浏览器内核不支持内嵌 PDF，请用系统 PDF 应用打开下载的文件。', f.name);
      };
      box.appendChild(a); box.appendChild(b);
      mediaBox.appendChild(box);
      msg('PDF 已就绪：多数 WebView 不支持内嵌预览，建议下载后打开');
    }

    /* ---------- MHTML 解析（关键：Chromium 已不再自动渲染 MHTML） ---------- */
    function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function qpDecode(s) {
      return s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, function (m, h) {
        return String.fromCharCode(parseInt(h, 16));
      });
    }
    function b64ToBytes(b64) {
      var bin = atob(b64.replace(/\s/g, ''));
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    function parseMhtml(text) {
      var m = text.match(/boundary\s*=\s*"?([^";\r\n]+)"?/i);
      if (!m) return null;
      var b = m[1].replace(/^["']|["']$/g, '');
      var parts = text.split(new RegExp('--' + escapeRe(b)));
      var best = null;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!p || p.trim().indexOf('--') === 0) continue;
        var idx = p.search(/\r?\n\r?\n/);
        if (idx < 0) continue;
        var head = p.slice(0, idx), body = p.slice(idx).replace(/^\r?\n\r?\n/, '');
        if (!/content-type\s*:\s*text\/html/i.test(head)) continue;
        var cte = (head.match(/content-transfer-encoding\s*:\s*(\S+)/i) || [])[1] || '';
        var cs = (head.match(/charset\s*=\s*"?([^";\r\n]+)"?/i) || [])[1] || 'utf-8';
        var out;
        try {
          if (/base64/i.test(cte)) out = td(cs, b64ToBytes(body));
          else if (/quoted-printable/i.test(cte)) out = qpDecode(body);
          else out = body;
        } catch (e) { out = body; }
        if (out && out.length > (best ? best.length : 0)) best = out;
      }
      return best;
    }
    function renderMhtml(t) {
      var html = parseMhtml(t);
      if (html) {
        lastKind = 'html';
        lastText = html;
        showFrameSrc(html);
        msg('已解析 MHTML 并渲染网页（资源仍可能缺失）');
      } else {
        lastKind = 'code';
        showPre(esc(t).slice(0, 60000));
        msg('MHTML 解析失败（未找到 HTML 主体），显示原文');
      }
    }

    /* ---------- 路由 ---------- */
    var IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'heic'];
    var AUD = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    var VID = ['mp4', 'webm', 'm4v', '3gp', 'ogv'];

    function route(f, t) {
      var e = ext(), tr = (t || '').trim();
      if (IMG.indexOf(e) >= 0) { renderMedia(f, 'image'); return; }
      if (AUD.indexOf(e) >= 0) { renderMedia(f, 'audio'); return; }
      if (VID.indexOf(e) >= 0) { renderMedia(f, 'video'); return; }
      if (e === 'pdf') { renderPdf(f); return; }
      if (e === 'mhtml' || e === 'mht') { renderMhtml(t); return; }
      if (e === 'svg') { renderSvg(f, t); return; }
      if (e === 'xml' || e === 'xsl' || e === 'xslt') { renderXml(t); return; }
      if (e === 'json' || /^\s*[[{]/.test(tr)) { renderJson(t); return; }
      if (e === 'md' || e === 'markdown') { renderMd(t); return; }
      if (e === 'csv' || e === 'tsv') { renderCsv(t); return; }
      if (e === 'js' || e === 'mjs' || /^\s*(const|let|var|function|class|async|import|export)\s/.test(tr)) { renderCode(t); return; }
      if (e === 'html' || e === 'htm' || e === 'xhtml' || e === 'xht' || /^\s*<(!DOCTYPE|html|\?xml)/i.test(tr)) { renderHtml(t); return; }
      renderCode(t);
    }

    /* ---------- 全屏（统一入口） ---------- */
    function fullOpen() {
      if (!lastFile) { msg('请先选择文件'); return; }
      var e = ext();

      /* 媒体 / PDF：null origin 下 blob iframe 会被拒，故不再新建 iframe，
         直接把预览区已渲染好的内容搬进全屏层。 */
      if (lastKind === 'image' || lastKind === 'audio' || lastKind === 'video') {
        if (!mediaBox.innerHTML) { msg('当前环境无法全屏预览此媒体'); return; }
        /* 不传 dlName：图片/音视频直接可见，不需要下载按钮，
           顶栏保持隐藏，做到真正的全屏。 */
        openFullMedia(mediaBox.innerHTML, '');
        return;
      }
      if (lastKind === 'pdf') {
        if (!mediaBox.innerHTML) { msg('PDF 无法内嵌预览，请先返回用下载按钮保存'); return; }
        openFullMedia(mediaBox.innerHTML, '若下方空白，说明内核不支持内嵌 PDF，请用「⬇️ 下载」保存后打开。', lastName);
        return;
      }
      /* md：全屏与非全屏用同一套渲染结果，避免两处样式不一致。
         改用 inline 模式（不经过 iframe/blob），彻底绕开 opaque origin 限制。 */
      if (lastKind === 'md') {
        openFull(lastText, null, '', null, null, false,
          /* 与主界面完全共用 mdRenderHtml()，保证渲染一模一样。
             （不能用 id="fv-md"：会撞上全局 #fv-md{display:none} 导致白屏） */
          mdRenderHtml(lastText));
        return;
      }
      if (lastKind === 'csv') {
        openFull(lastText, null, '', null, null, false,
          '<div style="padding:12px;overflow:auto">' + preBox.innerHTML + '</div>');
        return;
      }
      if (lastKind === 'json') {
        var o;
        try { o = JSON.stringify(JSON.parse(lastText), null, 2); } catch (err) { o = lastText; }
        openFull(lastText, null, '', null, null, false,
          '<pre style="margin:0;padding:14px;white-space:pre-wrap;font:13px/1.6 Consolas,monospace">' + esc(o) + '</pre>');
        return;
      }
      /* html/htm/xhtml/xml/xsl：原文原样渲染，绝不包裹（嵌套标签会破坏结构）。
         withViewport 会智能补 viewport，避免手机上按 980px 缩小。 */
      if (e === 'html' || e === 'htm' || e === 'xhtml' || e === 'xht' ||
          e === 'xml' || e === 'xsl' || e === 'xslt' ||
          /^\s*<(!DOCTYPE|html|\?xml)/i.test(String(lastText).trim())) {
        openFull(lastText, null, '', null, 'text/html', false);
        return;
      }
      /* svg：用 image/svg+xml 的 blob 渲染，而不是当 html 塞进去 */
      if (e === 'svg') {
        openFull(lastText, null, '', null, 'image/svg+xml', true);
        return;
      }
      /* js：全屏运行。用 blob 而非 srcdoc，脚本才会真正执行（srcdoc 白屏的修复点）。
         顶部固定提示条说明执行状态，并把 console 输出回显，
         避免「脚本其实执行了但没有任何可见内容」被误判为白屏。 */
      if (e === 'js' || e === 'mjs') {
        var safe = String(lastText).replace(/<\/script>/gi, '<\\/script>');
        openFull('<!doctype html><html><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<style>html,body{margin:0}body{background:#fff;font:14px/1.6 system-ui;padding:16px}' +
          '#fvbar{position:fixed;top:0;left:0;right:0;z-index:9999998;background:#2f7d63;color:#fff;' +
          'font:13px system-ui;padding:8px 12px;box-shadow:0 2px 6px rgba(0,0,0,.15)}' +
          '#fvbar b{font-weight:700}#er{color:#c00;white-space:pre-wrap;margin-top:12px}' +
          '#fvout{white-space:pre-wrap;background:#f5f6fa;border:1px solid #e5e7eb;border-radius:8px;' +
          'padding:10px;margin-top:12px;font:12px/1.6 Consolas,monospace}</style></head><body>' +
          '<div id="fvbar"><b>JS 已执行</b> · <span id="fvstate">运行中…</span></div>' +
          '<div id="fv-app" style="margin-top:44px"></div>' +
          S1 +
          'var __logs=[];var _d=document;' +
          /* 临时接管 console，捕获脚本的 console.log/warn/error 输出。
             之前只定义了假 console 却没挂上去，等于没捕获（死代码）。 */
          '(function(){var _c=console;' +
          '["log","warn","error","info","debug"].forEach(function(k){' +
          'var o=_c[k]?_c[k].bind(_c):function(){};' +
          '_c[k]=function(){try{__logs.push("["+k+"] "+[].slice.call(arguments).join(" "))}catch(e){}' +
          'try{o.apply(null,arguments)}catch(e){}};});})();' +
          'try{' + safe +
          '}catch(err){var p=_d.createElement("pre");p.id="er";' +
          'p.textContent="Error: "+(err&&err.message||err);_d.body.appendChild(p);}' +
          'setTimeout(function(){' +
          '  var st=_d.getElementById("fvstate");' +
          '  var n=(_d.getElementById("fv-app")||{}).childNodes?_d.getElementById("fv-app").childNodes.length:0;' +
          '  if(st){st.textContent=(n>0?("已生成 "+n+" 个元素"):"脚本已执行，无可见输出");}' +
          '  if(__logs.length){var o=_d.createElement("div");o.id="fvout";' +
          '    o.textContent="console 输出："+__logs.join(" | ");_d.body.appendChild(o);}' +
          '},120);' +
          S2 +
          '</body></html>');
        msg('已全屏运行 JS（页内有状态提示条，退出点悬浮球）');
        return;
      }
      /* 其余（txt / 未知扩展名）：按代码高亮转义后全屏。
         之前直接塞 lastText 未转义，源码里的 < > 会被当 HTML 解析导致显示错乱。 */
      openFull(lastText, null, '', null, null, false,
        '<pre style="margin:0;padding:14px;white-space:pre-wrap;font:13px/1.6 Consolas,monospace">' +
        codeHtml(lastText) + '</pre>');
    }

    /* ---------- 安装为 ChromeXt 脚本 ---------- */
    var installCode = '', installName = '';
    /* 复制策略（重要）：
       本页是错误页（origin=null，非安全上下文），navigator.clipboard 通常不存在；
       而 document.execCommand('copy') 复制的是「页面选区」而非目标文本，
       且常常仍返回 true → 曾导致「一点复制就复制出脚本源码」。
       正解：借 ChromeXt 的 dispatch 调 Android 原生剪贴板，不受 origin 限制。 */
    /* ChromeXt 的 copy action（Listener.kt）要求 payload 是 JSON 字符串：
         { "type": "text"|"html", "text": "...", "label": "..." }
       原生侧做 JSONObject(payload) 解析。
       若直接传纯文本字符串 → 原生解析抛异常 → 但异常在 Kotlin 层，
       JS 的 dispatch 不报错、正常返回 → 就会「提示已复制却什么都没复制」。
       这就是之前失败的根因，务必用 JSON.stringify。 */
    function cxCopy(text) {
      try {
        var CX = (window.__fvFindCX && window.__fvFindCX()) || window.__fvCX;
        if (CX && typeof CX.dispatch === 'function') {
          var payload = JSON.stringify({ type: 'text', text: String(text), label: 'FV日志' });
          CX.dispatch('copy', payload);
          return true;
        }
      } catch (e) {}
      return false;
    }
    function copyText(t, cb) {
      var done = false;
      function finish(ok, way) { if (done) return; done = true; cb(!!ok, way || ''); }
      // ① ChromeXt 原生剪贴板（本环境最可靠）
      if (cxCopy(t)) { finish(true, 'ChromeXt 原生剪贴板'); return; }
      // ② GM.setClipboard
      try {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(t); finish(true, 'GM.setClipboard'); return;
        }
        if (typeof GM !== 'undefined' && GM && typeof GM.setClipboard === 'function') {
          GM.setClipboard(t); finish(true, 'GM.setClipboard'); return;
        }
      } catch (e) {}
      // ③ clipboard API（需安全上下文，错误页通常没有）
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(
            function () { finish(true, 'clipboard API'); },
            function () { finish(false); });
          return;
        }
      } catch (e) {}
      finish(false);
    }

    /* 选中日志文本，便于手动长按 → 复制（错误页下最可靠的路径） */
    function selectLogText() {
      try {
        var ta = $('fv-inst-code');
        if (!ta) return false;
        ta.focus();
        ta.select();
        try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
        return true;
      } catch (e) { return false; }
    }

    /* 旧的「安装面板」改为：走可编辑的确认对话框（真安装） */

    /* ============================================================
       ★ 真正的安装：ChromeXt 的 Listener.kt 实现了 "installScript" action，
         会 parseScript(payload) 后 ScriptDbManager.insert(script)，
         即写入 SQLite 数据库 —— 持久化、重启仍在、出现在 ChromeXt 脚本列表。
         已实测成功。payload 必须是含 // ==UserScript== 的完整脚本文本。
    ============================================================ */

    /* ---------- 元数据解析：把已有 UserScript 头读成字段 ---------- */
    /* 定位 UserScript 元数据块。
       旧实现的正则要求头必须紧贴文件开头（只允许前面有空白），
       于是「顶部带说明注释的脚本」会被判成无头 →
       ① 元数据全部丢失、回退成文件名；② 原头被当成代码体保留，
       装出来的脚本元数据无效。这是导入功能的真实 bug。
       现在改为：在文件前部查找第一个头块，并兼容斜杠星号形式的写法。 */
    /* 判定：一段文本是否只含空白与注释（不含实质代码）。
       用于确认「头块之前没有代码」。 */
    function onlyComments(t) {
      var x = String(t || '');
      try {
        x = x.replace(/\/\*[\s\S]*?\*\//g, ' ');          /* 块注释 */
        x = x.replace(/(^|\n)[ \t]*\/\/[^\n\r]*/g, '$1'); /* 行首行注释 */
      } catch (e) {}
      return x.replace(/\s+/g, '') === '';
    }

    function metaBlock(code) {
      var src = String(code || '');
      /* ★ 不能只用「前若干字符」去找头块：
         实测「自动无缝翻页」头块 8116 字符（含 base64 @icon）、
         「自动展开全文」8190 字符（近 200 条 @match），
         一旦截断窗口就匹配不到 ==/UserScript==，整份元数据被判为无头，
         211 条指令全部丢失、脚本被装成默认通配 —— 最严重的一个 bug。
         头块只会紧跟在文件开头，正则非贪婪遇到第一个结束标记即停，无性能问题。 */
      var re = /(\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==|\/\*\s*==UserScript==[\s\S]*?==\/UserScript==\s*\*\/)/;
      var m = src.match(re);
      if (!m) return null;
      /* ★ 关键：头块必须在文件开头，前面只允许空白/注释。
         否则「脚本代码里的 ==UserScript== 字面量」会被误判成元数据头，
         codeBody 会把它从中间切掉 —— 实测 var s='// ==UserScript==';
         被截成 var s='  → 生成语法错误的脚本。 */
      if (!onlyComments(src.slice(0, m.index))) return null;
      return { text: m[0], index: m.index, len: m[0].length, style: m[0].charAt(1) === '*' ? 'block' : 'line' };
    }

    function parseMeta(code) {
      /* hasRule：原头是否已有任何匹配规则（@match/@include/@exclude/@exclude-match）。
         有就绝不自动补默认通配规则，否则脚本会在所有网站运行。 */
      var meta = { name: '', namespace: '', version: '', description: '', matches: [], grants: [], runAt: '', hasRule: false };
      var blk = metaBlock(code);
      if (!blk) return meta;
      var body = blk.text;
      /* ★ 关键修复：指令名必须允许连字符。
         旧写法是 @(\w+)，而 \w 不含 '-'，于是 @run-at 永远匹配不到，
         导致：原脚本的 @run-at document-start 被当成「不存在」，
         被 autoMeta 强制写成 document-idle —— 依赖 document-start 抢先劫持
         的脚本（如菜单提取器）就再也抓不到菜单了。 */
      /* 值必须限定在单行内：用 [^\n\r] 而不是 [\s\S]，
         否则 \s+ 会吃掉换行符，把下一行当成当前指令的值
         （实测 @noframes 后面没有值时，会吞掉整行 @match）。 */
      /* ★ (?=[ \t]|$) 必须加：否则 @name:zh-CN / @description:zh-CN 这类
         带语种后缀的指令会被当成 @name / @description，
         把真正的脚本名覆盖成 ":zh-CN 自动无缝翻页"。
         加了前瞻后这些行不参与字段解析（但仍在 rawHeadItems 中原样保留）。 */
      var re = /^[ \t]*\/\/[ \t]*@([\w.-]+)(?=[ \t]|$)(?:[ \t]+([^\n\r]*?))?[ \t]*$/gm, m;
      while ((m = re.exec(body)) !== null) {
        var k = m[1].toLowerCase().replace(/[-_]/g, ''), v = (m[2] || '').trim();
        /* ★ @include / @exclude / @exclude-match 语义与 @match 不同
           （include 支持正则，如 /^https?:\/\/x/），绝不能改写成 @match，
           它们一律靠 raw 原样保留。这里只把真正的 @match 收进可编辑列表。 */
        if (k === 'match') { if (v) { meta.matches.push(v); meta.hasRule = true; } }
        else if (k === 'include' || k === 'exclude' || k === 'excludematch') { meta.hasRule = true; }
        else if (k === 'grant') { if (v) meta.grants.push(v); }
        else if (k === 'runat') meta.runAt = v;
        else if (k === 'name') meta.name = v;
        else if (k === 'namespace') meta.namespace = v;
        else if (k === 'version') meta.version = v;
        else if (k === 'description') meta.description = v;
      }
      return meta;
    }

    /* 读取原头块的全部指令行（保序），用于「忠实还原」：
       除对话框里改的字段外，其余指令（@require / @connect / @icon /
       @author / @noframes / @resource ...）必须原样保留，否则脚本功能受损。 */
    function rawHeadItems() {
      return headItemsOf(lastText);
    }

    /* 提取任意脚本文本的头块指令行（保序），供生成与自检共用。
       必须「宽松」匹配 @name:zh-CN 这类带语种后缀的行，
       否则它们不会进入 items，就会在输出时被丢弃。
       key 只用于归类判断，这些行的输出一律走 raw 原样保留。 */
    function headItemsOf(text) {
      var blk = metaBlock(String(text || ''));
      if (!blk) return null;
      var re = /^[ \t]*\/\/?[ \t]*\*?[ \t]*@([\w.:+-]+)(?:[ \t]+([^\n\r]*?))?[ \t]*(?:\*\/)?[ \t]*$/gm;
      var items = [], m;
      while ((m = re.exec(blk.text)) !== null) {
        items.push({
          key: m[1].toLowerCase().replace(/[-_]/g, ''),
          val: (m[2] || '').trim(),
          /* 保留原始行文本：未知指令原样输出，连空格格式都不变，最忠实 */
          raw: m[0].trim()
        });
      }
      return items;
    }

    /* ---------- 智能补全：缺头补头，缺关键字段填默认值 ---------- */
    function autoMeta() {
      var base = String(lastName).replace(/\.(user\.js|js|mjs)$/i, '') || 'script';
      var m = parseMeta(lastText);
      if (!m.name) m.name = base;
      if (!m.namespace) m.namespace = 'com.example.fv';
      if (!m.version) m.version = '1.0';
      if (!m.description) m.description = '由 FV 本地预览器安装（源文件：' + lastName + '）';
      m.matches = m.matches.map(function (x) { return String(x).replace(/\r/g, '').trim(); }).filter(function (x) { return !!x; });
      if (!m.matches.length && !m.hasRule) m.matches = ['*://*/*'];
      if (!m.runAt) m.runAt = 'document-idle';
      m.hadHead = !!metaBlock(lastText);
      return m;
    }

    /* ---------- 用字段生成最终脚本文本 ---------- */
    /* 生成最终安装内容。
       ★ 有原头时必须「忠实还原」：以原头块为基础，只替换对话框里改过的字段，
       其余指令（@grant / @require / @connect / @icon / @author / @noframes ...）
       一律原样保留。旧实现只保留 6 个字段，其余全丢，会直接破坏脚本功能。 */
    function composeCode(meta) {
      var EDIT = ['name', 'namespace', 'version', 'description', 'runat'];
      var items = rawHeadItems();
      if (!items) {
        var head = [
          '// ==UserScript==',
          '// @name         ' + meta.name,
          '// @namespace    ' + meta.namespace,
          '// @version      ' + meta.version,
          '// @description  ' + meta.description,
          '// @run-at       ' + (meta.runAt || 'document-idle')
        ];
        meta.matches.forEach(function (u) { head.push('// @match        ' + u); });
        meta.grants.forEach(function (g) { head.push('// @grant        ' + g); });
        head.push('// ==/UserScript==');
        var b = codeBody();
        if (b.charAt(0) !== '\n') b = '\n\n' + b;
        return head.join('\n') + b;
      }
      var out = [], done = {}, matchDone = false;
      function line(k, v) { return v ? ('// @' + k + ' ' + v) : ('// @' + k); }
      /* 保留原始空格对齐：原文件多用 // @run-at______document-start 这种
         对齐写法，统一成单空格虽不影响解析，但会让产物与原文件不一致。 */
      function gapOf(raw) {
        var m = String(raw || '').match(/^[ \t]*\/\/?[ \t]*\*?[ \t]*@[\w.:+-]+([ \t]+)/);
        return (m && m[1]) ? m[1] : ' ';
      }
      function emitEditable(k, origRaw) {
        var v = (k === 'runat') ? meta.runAt : meta[k];
        if (v === undefined || v === null) return;
        var keyName = (k === 'runat') ? 'run-at' : k;
        out.push(v ? ('// @' + keyName + gapOf(origRaw) + v) : ('// @' + keyName));
      }
      function emitMatches() {
        meta.matches.forEach(function (u) { out.push('// @match ' + u); });
      }
      items.forEach(function (it) {
        if (it.key === 'match') {
          if (!matchDone) { emitMatches(); matchDone = true; }
          return;
        }
        if (EDIT.indexOf(it.key) >= 0) {
          if (!done[it.key]) { emitEditable(it.key, it.raw); done[it.key] = 1; }
          return;
        }
        /* 未知/其他指令：原样保留原始行（连空格格式都不改，最忠实） */
        out.push(it.raw || line(it.key, it.val));
      });
      if (!matchDone && meta.matches.length) emitMatches();
      EDIT.forEach(function (k) { if (!done[k]) emitEditable(k, null); });
      var b = codeBody();
      if (b.charAt(0) !== '\n') b = '\n\n' + b;
      return ['// ==UserScript=='].concat(out, ['// ==/UserScript==']).join('\n') + b;
    }
    /* 去掉原有元数据头后的纯代码体 */
    function codeBody() {
      return bodyOfText(lastText);
    }
    function bodyOfText(text) {
      var t = String(text || '');
      var blk = metaBlock(t);
      if (!blk) return t;
      /* 精确移除头块本身，保留块前后的内容（块前的说明注释属于代码）。
         前导换行原样保留：有的脚本头后无空行，有的有，统一改写会差一个字符。 */
      return t.slice(0, blk.index) + t.slice(blk.index + blk.len);
    }

    /* ============================================================
       安装前自检
       比对「原文件」与「即将安装的内容」，把差异分成三档：
         严重：丢失指令 / 代码体不一致 / 生成体语法错误 / 头块数量异常 → 必须二次确认
         补全：原文件没有、由安装器补的默认字段                      → 仅提示
         新增：非补全却多出来的指令                                  → 仅提示
       目的：以后遇到任何新脚本都能自动兜底，不必逐个人工核对。
    ============================================================ */
    /* 这六个字段在确认面板里可编辑，且缺了会被自动补默认值。
       它们产生的差异来自「用户主动修改」或「正常补全」，不是安装器的 bug，
       因此单独归入 edited / filled 两档提示，不计入严重问题。
       真正需要拦下的是 grant / require / connect / icon / author 等
       不可编辑指令的丢失 —— 那才是会破坏脚本功能的问题。 */
    var FILL_KEYS = { name: 1, namespace: 1, version: 1, description: 1, runat: 1, match: 1 };

    function selfCheck(origText, out) {
      var r = { ok: true, lost: [], added: [], filled: [], edited: [], editedFrom: [], editedTo: [], bodyDiff: false, parseErr: '', heads: 1, bodyLen: 0 };
      var A = headItemsOf(origText) || [], B = headItemsOf(out) || [];
      var cnt = function (arr) {
        var c = {};
        arr.forEach(function (it) { var k = it.key + '|' + it.val; c[k] = (c[k] || 0) + 1; });
        return c;
      };
      var ca = cnt(A), cb = cnt(B), hasKey = {};
      A.forEach(function (it) { hasKey[it.key] = 1; });
      Object.keys(ca).forEach(function (k) {
        var miss = ca[k] - (cb[k] || 0);
        var key = k.split('|')[0];
        for (var i = 0; i < miss; i++) { if (FILL_KEYS[key]) { r.edited.push(k); r.editedFrom.push(k); } else r.lost.push(k); }
      });
      Object.keys(cb).forEach(function (k) {
        var extra = cb[k] - (ca[k] || 0);
        var key = k.split('|')[0];
        for (var i = 0; i < extra; i++) {
          if (!hasKey[key] && FILL_KEYS[key]) r.filled.push(k);
          else if (FILL_KEYS[key]) { r.edited.push(k); r.editedTo.push(k); }
          else r.added.push(k);
        }
      });
      /* ★ 两头都要去掉首尾空白：
         无头脚本的原文本整体就是代码体，而生成时会在头块后补 '\n\n' 前缀，
         只 trim 尾部会把它误判成「代码体不一致」，导致每个无头文件都被拦下。 */
      var bo = String(bodyOfText(origText)).replace(/^\s+|\s+$/g, '');
      var bn = String(bodyOfText(out)).replace(/^\s+|\s+$/g, '');
      r.bodyDiff = (bo !== bn);
      r.bodyLen = bn.length;
      /* 只在原代码体本身能解析时才判定：原脚本自带语法错误不该算到安装器头上 */
      var origOk = true;
      try { new Function(bo); } catch (e) { origOk = false; }
      if (origOk) { try { new Function(bn); } catch (e2) { r.parseErr = String(e2.message || e2); } }
      r.heads = (String(out).match(/^[ \t]*\/\/[ \t]*==UserScript==[ \t]*$/gm) || []).length;
      r.ok = !r.lost.length && !r.bodyDiff && !r.parseErr && r.heads === 1;
      return r;
    }

    function shortItem(k) {
      var p = String(k).split('|');
      return '@' + p[0] + (p[1] ? ' ' + p[1] : '').slice(0, 40);
    }

    /* 把「改字段」配对成「旧 → 新」：
       改一个字段在集合上等于「删掉旧值 + 加入新值」，不配对会显示成两条，看不出是改动。 */
    function editedPairs(r) {
      return (r.editedTo || []).map(function (k) {
        var key = k.split('|')[0], old = '';
        (r.editedFrom || []).forEach(function (x) { if (!old && x.split('|')[0] === key) old = x; });
        return old ? (shortItem(old) + ' → ' + shortItem(k)) : shortItem(k);
      });
    }

    function checkSummary(r) {
      if (r.ok && !r.added.length && !r.filled.length) {
        return '✅ 自检通过：元数据与代码体与原文件一致（' + (r.heads ? '' : '') + '代码体 ' + r.bodyLen + ' 字符）';
      }
      var s = [];
      if (r.ok) s.push('✅ 无丢失、代码体一致（' + r.bodyLen + ' 字符）');
      if (r.lost.length) s.push('❌ 丢失 ' + r.lost.length + ' 条：' + r.lost.slice(0, 5).map(shortItem).join(' | ') + (r.lost.length > 5 ? ' …' : ''));
      if (r.bodyDiff) s.push('❌ 代码体与原文件不一致');
      if (r.parseErr) s.push('❌ 生成的代码体语法错误：' + r.parseErr.slice(0, 60));
      if (r.heads !== 1) s.push('❌ 头块数量异常：' + r.heads + '（应为 1）');
      if (r.filled.length) s.push('➕ 自动补全 ' + r.filled.length + ' 条：' + r.filled.slice(0, 4).map(shortItem).join(' | ') + (r.filled.length > 4 ? ' …' : ''));
      var pairs = editedPairs(r);
      if (pairs.length) s.push('✏ 已按你的修改调整 ' + pairs.length + ' 处：' + pairs.slice(0, 4).join(' | ') + (pairs.length > 4 ? ' …' : ''));
      if (r.added.length) s.push('⚠ 新增 ' + r.added.length + ' 条：' + r.added.slice(0, 4).map(shortItem).join(' | ') + (r.added.length > 4 ? ' …' : ''));
      return s.join('\n');
    }

    function updateCheck(code) {
      var el = $('fv-dlg-check');
      if (!el) return;
      var r = selfCheck(String(lastText || ''), code);
      lastCheck = r;
      el.textContent = checkSummary(r);
      el.style.background = r.ok ? '#f0fdf4' : '#fff5f5';
      el.style.color = r.ok ? '#166534' : '#b42318';
    }

    /* 自检发现严重问题时的二次确认（层要高于安装面板，否则看不见） */
    function confirmRisky(chk, onYes) {
      var cf = $('fv-cf');
      if (!cf) { onYes(); return; }
      var lines = [];
      if (chk.lost.length) {
        lines.push('丢失指令 ' + chk.lost.length + ' 条：');
        chk.lost.slice(0, 20).forEach(function (x) { lines.push('  · ' + shortItem(x)); });
        if (chk.lost.length > 20) lines.push('  …共 ' + chk.lost.length + ' 条');
      }
      if (chk.bodyDiff) lines.push('代码体与原文件不一致（可能被截断，或旧头被当成代码保留）');
      if (chk.parseErr) lines.push('生成的代码体存在语法错误：' + chk.parseErr);
      if (chk.heads !== 1) lines.push('头块数量异常：' + chk.heads + '（应为 1）');
      $('fv-cf-t').textContent = '⚠ 自检发现问题';
      $('fv-cf-b').textContent = lines.join('\n') + '\n\n继续安装可能得到一个残缺的脚本。';
      var box = $('fv-cf-btns');
      box.innerHTML = '';
      var mk = function (t, bg, fg, fn) {
        var b = document.createElement('button');
        b.textContent = t;
        b.style.cssText = 'flex:1;padding:12px;border:none;border-radius:10px;font:600 14px system-ui;background:' + bg + ';color:' + fg + ';cursor:pointer';
        b.onclick = function () { cf.classList.remove('on'); setTimeout(fn, 40); };
        box.appendChild(b);
      };
      mk('✕ 取消', '#f3f4f6', '#333', function () {});
      mk('仍然安装', '#b42318', '#fff', onYes);
      cf.classList.add('on');
    }

    /* ---------- 安装确认面板（字段可编辑） ---------- */
    var dlgPanel = $('fv-dlg'), dlgForm = $('fv-dlg-form'), dlgTip = $('fv-dlg-tip');
    var FIELD_KEYS = ['name', 'namespace', 'version', 'description', 'runAt', 'matches'];
    var FIELD_LABEL = {
      name: '脚本名 @name（必填）',
      namespace: '命名空间 @namespace',
      version: '版本 @version',
      description: '描述 @description',
      runAt: '执行时机 @run-at',
      matches: '匹配网址 @match（每行一条）'
    };

    function openInstallDialog() {
      if (!lastText) { msg('请先选择 js 文件'); return; }
      var meta = autoMeta();
      dlgForm.innerHTML = '';
      FIELD_KEYS.forEach(function (k) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:10px';
        var lb = document.createElement('div');
        lb.textContent = FIELD_LABEL[k];
        lb.style.cssText = 'font:600 12px system-ui;color:#555;margin-bottom:4px';
        var inp = document.createElement(k === 'matches' ? 'textarea' : 'input');
        inp.id = 'fv-dlg-' + k;
        inp.value = (k === 'matches') ? meta.matches.join('\n') : meta[k];
        inp.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #ccd0d6;border-radius:8px;' +
          'font:13px system-ui;color:#333;background:#fff' + (k === 'matches' ? ';min-height:70px;resize:vertical' : '');
        wrap.appendChild(lb); wrap.appendChild(inp);
        dlgForm.appendChild(wrap);
      });
      dlgTip.textContent = meta.hadHead
        ? '检测到标准 UserScript 头，字段已自动填入。可修改后安装。'
        : '原文件没有 UserScript 头，已自动补全。★ 请务必确认 @match，默认的 *://*/* 会在所有网页运行。';
      mask.classList.remove('on');
      instPanel.style.display = 'none';
      dlgPanel.style.display = 'flex';
      refreshDlgCode();
    }
    function closeInstallDialog() { dlgPanel.style.display = 'none'; }

    function readDlgMeta() {
      var m = { grants: autoMeta().grants };
      FIELD_KEYS.forEach(function (k) {
        var el = $('fv-dlg-' + k);
        var v = el ? String(el.value || '') : '';
        if (k === 'matches') {
          m.matches = v.split(/\n+/).map(function (x) { return x.trim(); }).filter(function (x) { return !!x; });
        } else {
          m[k] = v.trim();
        }
      });
      return m;
    }
    function refreshDlgCode() {
      var meta = readDlgMeta();
      var code = composeCode(meta);
      $('fv-dlg-code').textContent = code;
      installCode = code;
      installName = (meta.name || 'script') + '.user.js';
      /* 每次刷新预览都重跑自检：改了字段也能立刻看到是否引入问题 */
      updateCheck(code);
    }

    /* ---------- 真正安装 ---------- */
    /* ---------- 诊断：显示为什么拿不到 ChromeXt.dispatch ---------- */
    function showDiag() {
      var txt = '';
      // ① DOM 属性桥（跨沙箱最可靠）
      try {
        var el = document.documentElement;
        if (el) txt = el.getAttribute('data-fv-diag') || '';
      } catch (e) {}
      // ② window 上的函数
      if (!txt) { try { txt = window.__fvDiagText ? window.__fvDiagText() : ''; } catch (e) {} }
      if (!txt) txt = '(诊断未生成：外层脚本未执行到挂载点，或 DOM 桥不可用)';

      /* ---- 追加安装自检结论：确认当前脚本装下去是否完整 ---- */
      var L = ['', '—— 安装自检 ——'];
      if (!lastCheck) {
        L.push('尚未运行（打开「安装脚本」面板即会自动自检）');
      } else {
        L.push('结论: ' + (lastCheck.ok ? '✅ 通过' : '❌ 发现问题'));
        L.push('代码体长度: ' + lastCheck.bodyLen);
        L.push('丢失指令: ' + (lastCheck.lost.length ? lastCheck.lost.length + ' 条 → ' + lastCheck.lost.slice(0, 5).map(shortItem).join(' | ') : '无'));
        L.push('代码体一致: ' + (lastCheck.bodyDiff ? '否（异常）' : '是'));
        L.push('语法检查: ' + (lastCheck.parseErr ? '失败 ' + lastCheck.parseErr : '通过'));
        L.push('头块数量: ' + lastCheck.heads);
        var nf = lastCheck.filled.length, na = lastCheck.added.length, ne = lastCheck.edited.length;
        if (nf) L.push('自动补全: ' + nf + ' 条（' + lastCheck.filled.slice(0, 4).map(shortItem).join(' | ') + '）');
        if (ne) L.push('按修改调整: ' + editedPairs(lastCheck).slice(0, 4).join(' | '));
        if (na) L.push('新增: ' + na + ' 条（' + lastCheck.added.slice(0, 4).map(shortItem).join(' | ') + '）');
      }

      /* ---- 追加全屏诊断：定位「白屏」到底卡在哪一环 ---- */
      L.push('', '—— 全屏诊断 ——');
      try {
        L.push('当前文件: ' + (lastName || '(无)') + '  类型: ' + (lastKind || '-'));
        L.push('内容长度: ' + (lastText ? lastText.length : 0) + ' 字符');
        L.push('页面 origin: ' + (function(){ try { return location.origin || '(opaque/null)'; } catch (e) { return '(读取失败)'; } })());
        if (!ovLast) {
          L.push('尚未打开过全屏');
        } else {
          L.push('上次全屏 MIME: ' + ovLast.mime + (ovLast.mime.indexOf(';') >= 0 ? '' : ' (+charset=utf-8)'));
          L.push('上次全屏 文本长度: ' + ovLast.len);
          L.push('★ 渲染方式: ' + (ovLast.way || '-') + '   记录origin: ' + (ovLast.origin || '-'));
          L.push('地址/来源: ' + String(ovLast.url || '(未用 blob)').slice(0, 46));
          if (String(ovLast.url || '').indexOf('blob:null/') === 0) {
            L.push('⚠ 检测到 blob:null/ → 页面处于 opaque(null) origin，');
            L.push('  Chromium 拒绝 iframe 加载此类 blob，必然白屏。');
            L.push('  已修复：展示类改 inline 直注，文档类优先 srcdoc，不再依赖 blob。');
          }
          var of = document.getElementById('fv-ov-frame');
          if (of) {
            L.push('iframe src: ' + String(of.src || '(空/srcdoc)').slice(0, 40));
            var bl = -1, cn = -1;
            try { var dd2 = of.contentDocument; if (dd2 && dd2.body) { bl = dd2.body.innerHTML.length; cn = dd2.body.childNodes.length; } } catch (e) {}
            L.push('iframe body 长度: ' + (bl < 0 ? '无法读取' : bl) + '  子节点: ' + (cn < 0 ? '-' : cn));
          }
          var ib2 = document.getElementById('fv-ov-inline');
          if (ib2) L.push('inline 容器: display=' + (ib2.style.display || '-') + '  内容长度=' + ib2.innerHTML.length);
          L.push('判读：先看「★ 渲染方式」。inline / srcdoc 为正常；');
          L.push('      带「无法读取校验」= iframe 内容读不到（跨域限制），未必是白屏；');
          L.push('      若仍是 iframe blob 且 URL 以 blob:null 开头 → 该环境不支持 blob。');
        }
        L.push('');
        L.push('提示：js 全屏后顶部有绿色状态条，显示「脚本已执行，无可见输出」属正常。');
      } catch (e) { L.push('全屏诊断出错: ' + e.message); }
      txt += '\n' + L.join('\n');
      instCode.value = txt;
      instTip.textContent = '点「📋 一键复制日志」即可复制；若提示失败再手动长按文本区复制。上半看 typeof_ChromeXt（安装能力），下半看「渲染方式」（白屏原因）。';
      try { var cb = $('fv-copy'); if (cb) cb.textContent = '📋 一键复制日志'; } catch (e) {}
      mask.classList.remove('on');
      dlgPanel.style.display = 'none';
      instPanel.style.display = 'flex';
    }

    function installNow() {
      var meta = readDlgMeta();
      if (!meta.name) { msg('脚本名不能为空'); return; }
      if (!meta.matches.length && !/^[ \t]*\/\/[ \t]*@(include|exclude|exclude-match)(?=[ \t]|$)/m.test(String(lastText || ''))) {
        msg('至少填一条 @match（或用 @include 等匹配规则）');
        return;
      }
      var code = composeCode(meta);
      installCode = code;
      installName = meta.name + '.user.js';
      /* 安装前自检：发现严重问题先拦下并列出差异，确认后才真正写入 */
      var chk = selfCheck(String(lastText || ''), code);
      lastCheck = chk;
      if (!chk.ok) { confirmRisky(chk, function () { doInstall(meta, code); }); return; }
      doInstall(meta, code);
    }

    function doInstall(meta, code) {
      var CX = (window.__fvFindCX && window.__fvFindCX()) || window.__fvCX;
      if (!CX || typeof CX.dispatch !== 'function') {
        /* 错误页上拿不到 dispatch（GM 作用域未建立）→ 走中转：
           把脚本存起来，跳到一个普通网页，在那里装完再跳回来。 */
        /* 中转完全不依赖桥：直接把代码编码进 URL hash 跳转，
           目标网页上的外层脚本读到 hash 后执行安装。 */
        var b = null;
        try { b = btoa(unescape(encodeURIComponent(code))); } catch (e) { b = null; }
        if (b && b.length < 60000) {
          msg('本页无法直连 ChromeXt，改用中转：正在跳转…');
          setTimeout(function () {
            try { location.href = 'https://example.com/#fvinstall=' + b; }
            catch (e) { msg('跳转失败，请手动打开任意网页完成安装'); }
          }, 900);
          return;
        }
        msg('未拿到 dispatch 且中转失败（脚本过长），请用菜单「🔍 诊断」');
        return;
      }
      try {
        CX.dispatch('installScript', code);
      } catch (e) {
        msg('安装失败：' + e.message);
        return;
      }
      /* best-effort 校验：Kotlin 侧 insert 后会把脚本加进 scripts 数组，
         若 JS 侧能看到同名脚本，说明确实入库了（看不到不代表失败，
         因为该数组可能是页面加载时的快照）。 */
      var confirmed = false;
      try {
        var list = CX.scripts;
        if (list && list.length) {
          for (var i = 0; i < list.length; i++) {
            var it = list[i] || {};
            var nm = String(it.name || (it.meta && it.meta.name) || '');
            if (nm === meta.name) { confirmed = true; break; }
          }
        }
      } catch (e) {}
      msg(confirmed
        ? '已安装并确认入库：' + meta.name
        : '已发送安装请求：' + meta.name + '。请到 ChromeXt 脚本列表确认。');
      // 顺便用 notification 给个可见反馈
      try {
        CX.dispatch('notification', { id: 'fv-install', uuid: 0, title: 'FV 安装', text: '已安装：' + meta.name, timeout: 2500 });
      } catch (e) {}
      setTimeout(function () { closeInstallDialog(); }, 600);
    }

    /* 管理前端：只能管理「已安装」的脚本（开关/编辑/删除），没有新建按钮；
       且作者明确说过：至少要装过一个脚本，管理页才会显示内容。
       所以这里只负责打开它，不假装能新建。 */
    var MANAGER_URL = 'https://jingmatrix.github.io/ChromeXt/';
    function openManager() {
      msg('正在打开 ChromeXt 管理页（仅能管理已装脚本，无新建功能）');
      setTimeout(function () {
        try { location.href = MANAGER_URL; } catch (e) {
          try { window.open(MANAGER_URL, '_blank'); } catch (e2) { msg('请手动访问 ' + MANAGER_URL); }
        }
      }, 300);
    }




    function runJs() {
      if (!lastText) { msg('请先选择文件'); return; }
      var logs = [];
      var fake = {
        log: function () { logs.push([].slice.call(arguments).map(function (a) { return typeof a === 'string' ? a : String(a); }).join(' ')); },
        warn: function () { logs.push('[warn] ' + [].slice.call(arguments).join(' ')); },
        error: function () { logs.push('[error] ' + [].slice.call(arguments).join(' ')); }
      };
      try {
        var fn = new Function('console', lastText);
        fn.call(window, fake);
        msg(logs.length ? '试运行输出：' + logs.join(' | ').slice(0, 90) : '试运行完成（无 console 输出）');
      } catch (err) { msg('运行出错：' + err.message); }
    }

    /* ---------- 菜单 ---------- */
    function isFull() {
      try { return overlay.style.display === 'flex'; } catch (e) { return false; }
    }

    function openMenu() {
      if (mask.classList.contains('on')) { mask.classList.remove('on'); return; }
      /* 全屏时顶栏已隐藏，返回只能从悬浮球走 → 菜单首项给「退出全屏」。 */
      if (isFull()) {
        card.innerHTML = '';
        var ft = document.createElement('div');
        ft.className = 'ct'; ft.textContent = 'FV 全屏';
        card.appendChild(ft);
        [{ t: '✕ 退出全屏', f: closeFull, c: 1 },
         { t: '⚡ 安装脚本（可改 @match）', f: openInstallDialog },
         { t: '🔍 诊断（查白屏）', f: showDiag },
         { t: '✕ 关闭菜单', f: function () {} }].forEach(function (it) {
          var b = document.createElement('div');
          b.className = 'mi' + (it.c ? ' close' : '');
          b.textContent = it.t;
          b.onclick = function (e) { e.stopPropagation(); mask.classList.remove('on'); setTimeout(it.f, 60); };
          card.appendChild(b);
        });
        mask.classList.add('on');
        return;
      }
      var items = [
        { t: '📁 选择文件', f: function () { fileInput.click(); } },
        { t: '⚡ 安装脚本（可改 @match）', f: openInstallDialog },
        { t: '🔍 诊断（随时可点，查安装/白屏）', f: showDiag },
        { t: '🖥️ 全屏打开', f: fullOpen },
        { t: '⚙️ 打开 ChromeXt 管理页', f: openManager },
        { t: '🧪 临时试运行（不安装）', f: runJs },
        { t: '🌐 网页模式渲染', f: function () { if (lastText) renderHtml(lastText); else msg('请先选择文件'); } },
        { t: '📝 代码高亮查看', f: function () { if (lastText) renderCode(lastText); else msg('请先选择文件'); } },
        { t: '↩ 返回首页', f: function () { location.href = 'https://fv-local-preview.invalid/'; } },
        { t: '✕ 关闭菜单', f: function () {}, c: 1 }
      ];
      card.innerHTML = '';
      var t = document.createElement('div');
      t.className = 'ct'; t.textContent = 'FV 本地预览';
      card.appendChild(t);
      items.forEach(function (it) {
        var b = document.createElement('div');
        b.className = 'mi' + (it.c ? ' close' : '');
        b.textContent = it.t;
        b.onclick = function (e) { e.stopPropagation(); mask.classList.remove('on'); setTimeout(it.f, 60); };
        card.appendChild(b);
      });
      mask.classList.add('on');
    }

    /* ---------- 绑定 ---------- */
    fileInput.addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      lastFile = f; lastName = f.name;
      pick.textContent = '📄 ' + f.name;
      var e = ext();
      if (IMG.indexOf(e) >= 0 || AUD.indexOf(e) >= 0 || VID.indexOf(e) >= 0) {
        renderMedia(f, IMG.indexOf(e) >= 0 ? 'image' : (AUD.indexOf(e) >= 0 ? 'audio' : 'video'));
        return;
      }
      if (e === 'pdf') { renderPdf(f); return; }
      if (f.size > 12 * 1024 * 1024) { msg('文件较大（' + (f.size / 1048576).toFixed(1) + 'MB），读取可能较慢'); }
      readArrayBuffer(f).then(function (buf) {
        /* 统一换行：CRLF/CR 归一为 LF。JS 不区分换行符，
           但元数据正则按行匹配，残留的 \r 会让指令行匹配失败。 */
        lastText = decodeText(buf).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        route(f, lastText);
      }).catch(function () { msg('读取失败'); });
    });

    $('fv-full').onclick = fullOpen;
    $('fv-reload').onclick = function () {
      if (lastText) route(lastFile, lastText);
      else if (lastFile) route(lastFile, '');
      else msg('请先选择文件');
    };
    $('fv-home').onclick = function () { location.href = 'https://fv-local-preview.invalid/'; };
    /* 只复制诊断日志。
       旧版有 `instCode.value ? instCode.value : installCode` 的兜底，
       一旦日志为空就会把「待安装脚本源码」复制出去 —— 用户看到的
       「复制日志出来是脚本源码」就是这个兜底造成的。已彻底移除。 */
    /* 只复制诊断日志。
       旧版有 `: installCode` 兜底，会把「待安装脚本源码」复制出去；已彻底移除。
       这里先尝试 clipboard API；不可用则全选文本并提示手动长按复制，
       绝不用 execCommand（它会复制页面选区，导致复制出错误内容）。 */
    $('fv-copy').onclick = function () {
      var txt = (instCode && instCode.value) ? instCode.value : '';
      if (!txt) { msg('还没有日志内容，请先稍等或重新点一次诊断'); return; }
      copyText(txt, function (ok, way) {
        if (ok) msg('已复制（' + way + '，' + txt.length + ' 字符）');
        else { selectLogText(); msg('复制失败，已全选 ' + txt.length + ' 字符，请手动复制'); }
      });
    };
    $('fv-inst-close').onclick = function () { instPanel.style.display = 'none'; };
    $('fv-dlg-install').onclick = installNow;
    $('fv-dlg-refresh').onclick = refreshDlgCode;
    $('fv-dlg-close').onclick = closeInstallDialog;
    $('fv-ov-close').onclick = closeFull;
    ovDl.onclick = function () {
      try {
        var a = document.createElement('a');
        a.href = lastBlob; a.download = ovDl.getAttribute('data-name') || lastName || 'file';
        a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(function () { try { document.body.removeChild(a); } catch (e) {} }, 500);
      } catch (e) { msg('下载失败'); }
    };

    preBox.ondblclick = function () { var e = ext(); if (e === 'js' || e === 'mjs') openInstallDialog(); };
    fab.onclick = function (e) { e.stopPropagation(); openMenu(); };
    mask.onclick = function (e) { if (e.target === mask) mask.classList.remove('on'); };

    var drag = false, sy, st;
    fab.addEventListener('touchstart', function (e) {
      drag = true; sy = e.touches[0].clientY; st = fab.offsetTop; fab.style.transition = 'none';
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (!drag) return;
      fab.style.top = Math.max(40, Math.min(window.innerHeight - 40, st + e.touches[0].clientY - sy)) + 'px';
    }, { passive: true });
    window.addEventListener('touchend', function () {
      if (!drag) return;
      drag = false; fab.style.transition = 'all .3s';
    });

    msg('就绪，请选择文件');
  }


  /* ============================================================
     注入：DOM 替换 + 多重重试
  ============================================================ */
  function build() {
    try {
      var doc = document;
      if (!doc.documentElement) return false;
      if (doc.getElementById('fv-file')) return true;

      if (!doc.head) { doc.documentElement.appendChild(doc.createElement('head')); }
      if (!doc.body) { doc.documentElement.appendChild(doc.createElement('body')); }

      try { doc.head.innerHTML = ''; } catch (e) {}
      try { doc.body.innerHTML = ''; } catch (e) {}
      try { doc.body.removeAttribute('style'); } catch (e) {}
      try { doc.title = 'FV 本地文件预览'; } catch (e) {}
      try { doc.documentElement.style.cssText = 'background:#f5f6fa;min-height:100vh;'; } catch (e) {}

      /* 关键：补 viewport。错误页 document 没有 viewport meta，
         手机上会按 980px 虚拟宽度缩小，导致界面又小又糊。 */
      try {
        var oldVp = doc.querySelector('meta[name="viewport"]');
        if (oldVp && oldVp.parentNode) oldVp.parentNode.removeChild(oldVp);
        var vp = doc.createElement('meta');
        vp.setAttribute('name', 'viewport');
        vp.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes');
        doc.head.appendChild(vp);
      } catch (e) {}

      var st = doc.createElement('style');
      st.textContent = CSS;
      doc.head.appendChild(st);

      doc.body.innerHTML = BODY;

      var sc = doc.createElement('script');
      sc.textContent = '(' + toolScript.toString() + ')();';
      doc.body.appendChild(sc);

      return !!doc.getElementById('fv-file');
    } catch (e) {
      return false;
    }
  }

  function schedule(times) {
    if (!times || !times.length) return;
    var delay = times.shift();
    setTimeout(function () {
      var ok = build();
      if (!ok) schedule(times);
    }, delay);
  }

  /* 统一入口：构建预览器（错误页会被 WebView 二次提交，故多重重试） */
  function startPreview() {
    /* 直接填充当前 document（不是 document.open/write）。
       document-start 阶段 document 还是空的，填充后用户第一眼看到的就是工具页，
       和打开正常网页一样，不存在错误页闪烁。
       相比 document.write 的好处：不清空文档、不移除监听器，失败也能安全重试。 */
    build();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { build(); });
    }
    window.addEventListener('load', function () { build(); });
    schedule([0, 20, 50, 100, 200, 400, 800, 1500]);
  }

  startPreview();

  window.__fvFixedLoaded = true;
})();
