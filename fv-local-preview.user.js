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
// ==/UserScript==

(function () {
  'use strict';

  if (typeof window.__fvFixedLoaded === 'undefined') { window.__fvFixedLoaded = false; }

  /* ============================================================
     抢占隐藏，缩短错误页闪烁
     .invalid 必然解析失败，浏览器会先显示一个错误页 document，
     我们再把它替换成工具页。这里在 document-start 就抢先把可见性关掉，
     等构建完成再恢复，让用户几乎看不到那一下错误页。
  ============================================================ */
  var __fvFlashGuard = false;
  function hideNow() {
    if (__fvFlashGuard) return;
    __fvFlashGuard = true;
    try {
      if (document.documentElement) document.documentElement.style.visibility = 'hidden';
      if (document.body) document.body.style.visibility = 'hidden';
      var hs = document.createElement('style');
      hs.setAttribute('data-fv-flash', '1');
      hs.textContent = 'html,body{visibility:hidden!important;background:#f5f6fa!important}';
      (document.head || document.documentElement).appendChild(hs);
    } catch (e) {}
  }
  function showNow() {
    try {
      if (document.documentElement) document.documentElement.style.visibility = '';
      if (document.body) document.body.style.visibility = '';
      var hs = document.querySelector('style[data-fv-flash]');
      if (hs && hs.parentNode) hs.parentNode.removeChild(hs);
    } catch (e) {}
  }

  /* 只在「看起来是入口」时才抢占：
     hostname 正确，或错误页文本含入口域名，或刚访问过入口 */
  var looksLikeEntry = false;
  try { looksLikeEntry = (location.hostname === 'fv-local-preview.invalid'); } catch (e) {}
  if (!looksLikeEntry) {
    try { looksLikeEntry = /fv-local-preview\.invalid/.test(String(location.href)); } catch (e) {}
  }
  if (!looksLikeEntry) {
    try {
      var pt = document.documentElement ? (document.documentElement.innerText || document.documentElement.textContent || '') : '';
      looksLikeEntry = pt.indexOf('fv-local-preview.invalid') >= 0;
    } catch (e) {}
  }
  if (!looksLikeEntry) {
    try { looksLikeEntry = String(location.protocol).toLowerCase() === 'chrome-error:'; } catch (e) {}
  }
  if (looksLikeEntry) hideNow();

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

  /* ============================================================
     入口判定：本脚本只在「预览器入口页」构建工具，
     其它网页一律不改动（脚本本身由 ChromeXt 负责分发）。
  ============================================================ */
  var ENTRY_HOST = 'fv-local-preview.invalid';
  var TS_KEY = 'fv_entry_ts';

  /* ---------- 入口域名访问时间戳（首次 document-start 时记录） ---------- */
  function markEntry() {
    try { window.__fvStore.set(TS_KEY, String(Date.now())); } catch (e) {}
  }
  function recentEntry(ms) {
    try {
      var t = parseInt(window.__fvStore.get(TS_KEY, '0'), 10);
      return t > 0 && (Date.now() - t) < (ms || 30000);
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
      if (recentEntry(30000)) return 'yes';   // 兜底：30 秒内刚访问过入口
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
  var TASK_KEY = 'fv_install_task_v1';
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

  /* ============================================================
     原生抢占：趁浏览器还没提交错误页，直接写出完整页面
     早期版本能「像正常网页一样直接显示」就是靠这招：
     document-start 时 location 仍是入口地址、document 尚未被替换，
     此刻 document.write 会把内容写进「当前这个 document」，
     浏览器就不会再提交 ERR_NAME_NOT_RESOLVED 错误页 —— 没有闪烁。
     若抢占失败（错误页已提交 / write 被拒），自动回退到下面的
     DOM 替换 + 多重重试逻辑。
  ============================================================ */
  function tryNativeWrite() {
    try {
      if (location.hostname !== 'fv-local-preview.invalid') return false;
      if (document.readyState !== 'loading') return false;
      var page = '<!doctype html><html lang="zh"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes">' +
        '<title>FV 本地文件预览</title><style>' + CSS + '</style></head><body>' +
        BODY +
        '<' + 'script>(' + toolScript.toString() + ')();<' + '/script>' +
        '</body></html>';
      document.open();
      document.write(page);
      document.close();
      var okp = !!document.getElementById('fv-file');
      if (okp) { showNow(); }
      return okp;
    } catch (e) {
      return false;
    }
  }

  var decision = shouldBuildPreview();

  if (decision === 'no') {
    // 普通网页：先检查有没有中转安装任务，有就执行；否则直接退出、不改动页面
    tryRelayInstall();
    showNow();   /* 若之前抢占隐藏过，务必恢复，避免页面永久空白 */
    return;
  }

  if (decision === 'maybe') {
    // 错误页刚注入、文本还没渲染：快速轮询确认归属，最多约 1.2 秒
    var probe = [0, 20, 40, 80, 150, 300, 600, 1200], pi = 0;
    (function nextProbe() {
      var d2 = shouldBuildPreview();
      if (d2 === 'yes') { startPreview(); return; }
      if (d2 === 'no') { showNow(); return; }
      if (pi < probe.length) { setTimeout(nextProbe, probe[pi++]); }
      else { showNow(); }   /* 超时放弃，必须恢复可见，否则页面一直是空白 */
    })();
    return;
  }
  // decision === 'yes' → 继续往下构建预览器

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
    function showMd(html) { hideAll(); mdBox.style.display = 'block'; mdBox.innerHTML = html; }
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
    /* mime 必须是合法 MIME；noViewport=true 时跳过 viewport 注入
       （SVG 是 XML 文档，插入 HTML 的 <meta> 会破坏结构导致白屏） */
    function openFull(text, blobUrl, tip, dlName, mime, noViewport) {
      hideAll();
      overlay.style.display = 'flex';
      ovTip.style.display = tip ? 'block' : 'none';
      ovTip.textContent = tip || '';
      ovFrame.style.display = 'block';
      ovDl.style.display = dlName ? 'inline-block' : 'none';
      if (dlName) ovDl.setAttribute('data-name', dlName);
      try { ovFrame.removeAttribute('srcdoc'); } catch (e) {}
      var url = blobUrl;
      if (!url && text) {
        var body = noViewport ? text : withViewport(text);
        url = makeBlobUrl(body, mime || 'text/html');
      }
      if (url) { ovFrame.src = url; }
      else { ovFrame.srcdoc = text || ''; }   // 最终兜底
      ovLast = { mime: mime || 'text/html', len: (text || '').length, url: url || '', srcDoc: !url };
    }
    function closeFull() {
      overlay.style.display = 'none';
      try { ovFrame.removeAttribute('srcdoc'); } catch (e) {}
      try { ovFrame.src = 'about:blank'; } catch (e) {}
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
    var MD_CSS = 'html,body{margin:0}body{background:#fff}' +
      '#fv-md{padding:18px 22px;background:#fff;font:14px/1.6 system-ui;color:#333}' +
      '#fv-md h1,#fv-md h2,#fv-md h3,#fv-md h4{color:#1f2d3d;margin:16px 0 8px}' +
      '#fv-md h1{border-bottom:1px solid #eee;padding-bottom:6px}' +
      '#fv-md p{margin:8px 0}' +
      '#fv-md a{color:#2f7d63}' +
      '#fv-md code{background:#f0f2f5;padding:1px 5px;border-radius:4px;color:#c0341d;font-family:Consolas,monospace}' +
      '#fv-md pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}' +
      '#fv-md pre code{background:transparent;color:inherit}' +
      '#fv-md blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #2f7d63;background:#f0f7f4;color:#555}' +
      '#fv-md img{max-width:100%;border-radius:6px}' +
      '#fv-md hr{border:0;border-top:1px solid #eee;margin:16px 0}';

    /* Markdown 完整文档：全屏与普通预览共用，保证两处显示完全一致 */
    function MD_DOC(inner, title) {
      return '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + esc(title || 'FV预览') + '</title><style>' + MD_CSS + '</style></head><body>' +
        '<div id="fv-md">' + inner + '</div></body></html>';
    }
    function wrapDoc(body, title) {
      return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        esc(title || 'FV预览') + '</title><style>html,body{margin:0}body{background:#fff;font:14px/1.6 system-ui;padding:12px}</style></head><body>' +
        body + '</body></html>';
    }

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
    function renderMd(t) { lastKind = 'md'; showMd(mdToHtml(t)); msg('已渲染：' + lastName); }

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

      if (lastKind === 'image' || lastKind === 'audio' || lastKind === 'video') {
        if (!lastBlob) { msg('当前环境无法全屏预览此媒体'); return; }
        openFull('', lastBlob, '', lastName);
        return;
      }
      if (lastKind === 'pdf') {
        if (!lastBlob) { msg('当前环境无法内嵌 PDF，请用下载按钮保存后打开'); return; }
        openFull('', lastBlob, '若下方空白，说明内核不支持内嵌 PDF。', lastName);
        return;
      }
      /* md：全屏与非全屏用同一套渲染结果，避免两处样式不一致 */
      if (lastKind === 'md') {
        openFull(MD_DOC(mdToHtml(lastText), lastName));
        return;
      }
      if (lastKind === 'csv') {
        openFull(wrapDoc('<div style="overflow:auto">' + preBox.innerHTML + '</div>', lastName));
        return;
      }
      if (lastKind === 'json') {
        var o;
        try { o = JSON.stringify(JSON.parse(lastText), null, 2); } catch (err) { o = lastText; }
        openFull(wrapDoc('<pre style="white-space:pre-wrap;font:13px Consolas,monospace">' + esc(o) + '</pre>', lastName));
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
          'var __logs=[];' +
          'var _c={log:function(){__logs.push([].slice.call(arguments).join(" "))},' +
          'warn:function(){__logs.push("[warn] "+[].slice.call(arguments).join(" "))},' +
          'error:function(){__logs.push("[error] "+[].slice.call(arguments).join(" "))}};' +
          'var __out=[];var _d=document;' +
          'var _w=function(){try{_d.body.insertAdjacentHTML("beforeend","")}catch(e){}};' +
          'try{' + safe +
          '}catch(err){var p=_d.createElement("pre");p.id="er";' +
          'p.textContent="Error: "+(err&&err.message||err);_d.body.appendChild(p);}' +
          'setTimeout(function(){' +
          '  var st=_d.getElementById("fvstate");' +
          '  var n=(_d.getElementById("fv-app")||{}).childNodes?_d.getElementById("fv-app").childNodes.length:0;' +
          '  if(st){st.textContent=(n>0?("已生成 "+n+" 个元素"):"脚本已执行，无可见输出");}' +
          '  if(__logs.length){var o=_d.createElement("div");o.id="fvout";' +
          '    o.textContent="console 输出：\n"+__logs.join("\n");_d.body.appendChild(o);}' +
          '},120);' +
          S2 +
          '</body></html>');
        msg('已全屏运行 JS（顶部有执行状态提示）');
        return;
      }
      /* 其余（txt / 未知扩展名）：按代码高亮转义后全屏。
         之前直接塞 lastText 未转义，源码里的 < > 会被当 HTML 解析导致显示错乱。 */
      openFull(wrapDoc('<pre style="white-space:pre-wrap;font:13px/1.6 Consolas,monospace">' +
        codeHtml(lastText) + '</pre>', lastName));
    }

    /* ---------- 安装为 ChromeXt 脚本 ---------- */
    var installCode = '', installName = '';
    function hasHead(src) { return /^\s*\/\/\s*==UserScript==/.test(src); }
    function buildUserScript(src, name) {
      if (hasHead(src)) return src;
      var base = String(name).replace(/\.(js|mjs|user\.js)$/i, '') || 'fv-script';
      return '// ==UserScript==\n' +
        '// @name         ' + base + '\n' +
        '// @namespace    com.example.fv\n' +
        '// @version      1.0\n' +
        '// @description  由 FV 本地预览器生成（源文件：' + name + '）\n' +
        '// @match        *://*/*\n' +
        '// @run-at       document-idle\n' +
        '// @grant        none\n' +
        '// ==/UserScript==\n\n' + src;
    }
    function copyText(t, cb) {
      function fb() {
        try {
          var ta = document.createElement('textarea');
          ta.value = t; ta.style.position = 'fixed'; ta.style.top = '-1000px';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          document.body.removeChild(ta);
          cb(ok);
        } catch (e) { cb(false); }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(function () { cb(true); }, fb);
        } else fb();
      } catch (e) { fb(); }
    }
    /* 旧的「安装面板」改为：走可编辑的确认对话框（真安装） */
    function openInstall() { openInstallDialog(); }

    /* ============================================================
       ★ 真正的安装：ChromeXt 的 Listener.kt 实现了 "installScript" action，
         会 parseScript(payload) 后 ScriptDbManager.insert(script)，
         即写入 SQLite 数据库 —— 持久化、重启仍在、出现在 ChromeXt 脚本列表。
         已实测成功。payload 必须是含 // ==UserScript== 的完整脚本文本。
    ============================================================ */

    /* ---------- 元数据解析：把已有 UserScript 头读成字段 ---------- */
    function parseMeta(code) {
      var meta = { name: '', namespace: '', version: '', description: '', matches: [], grants: [], runAt: '' };
      var head = code.match(/^\s*\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
      if (!head) return meta;
      var body = head[1];
      var re = /^\s*\/\/\s*@(\w+)(?:\s+([\s\S]*?))?\s*$/gm, m;
      while ((m = re.exec(body)) !== null) {
        var k = m[1].toLowerCase(), v = (m[2] || '').trim();
        if (k === 'match' || k === 'include' || k === 'matches') { if (v) meta.matches.push(v); }
        else if (k === 'grant') { if (v) meta.grants.push(v); }
        else if (k === 'run-at') meta.runAt = v;
        else if (k === 'name') meta.name = v;
        else if (k === 'namespace') meta.namespace = v;
        else if (k === 'version') meta.version = v;
        else if (k === 'description') meta.description = v;
      }
      return meta;
    }

    /* ---------- 智能补全：缺头补头，缺关键字段填默认值 ---------- */
    function autoMeta() {
      var base = String(lastName).replace(/\.(user\.js|js|mjs)$/i, '') || 'script';
      var m = parseMeta(lastText);
      if (!m.name) m.name = base;
      if (!m.namespace) m.namespace = 'com.example.fv';
      if (!m.version) m.version = '1.0';
      if (!m.description) m.description = '由 FV 本地预览器安装（源文件：' + lastName + '）';
      if (!m.matches.length) m.matches = ['*://*/*'];
      if (!m.runAt) m.runAt = 'document-idle';
      m.hadHead = /^\s*\/\/\s*==UserScript==/.test(lastText);
      return m;
    }

    /* ---------- 用字段生成最终脚本文本 ---------- */
    function composeCode(meta) {
      var head = [
        '// ==UserScript==',
        '// @name         ' + meta.name,
        '// @namespace    ' + meta.namespace,
        '// @version      ' + meta.version,
        '// @description  ' + meta.description,
        '// @run-at       ' + meta.runAt
      ];
      meta.matches.forEach(function (u) { head.push('// @match        ' + u); });
      meta.grants.forEach(function (g) { head.push('// @grant        ' + g); });
      head.push('// ==/UserScript==', '');
      return head.join('\n') + '\n' + codeBody();
    }
    /* 去掉原有元数据头后的纯代码体 */
    function codeBody() {
      var t = String(lastText);
      var m = t.match(/^\s*\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
      if (m) return t.slice(m.index + m[0].length).replace(/^\s*\n/, '');
      return t;
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
      var code = composeCode(readDlgMeta());
      $('fv-dlg-code').textContent = code;
      installCode = code;
      installName = (readDlgMeta().name || 'script') + '.user.js';
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

      /* ---- 追加全屏诊断：定位「白屏」到底卡在哪一环 ---- */
      var L = ['', '—— 全屏诊断 ——'];
      try {
        L.push('当前文件: ' + (lastName || '(无)') + '  类型: ' + (lastKind || '-'));
        L.push('内容长度: ' + (lastText ? lastText.length : 0) + ' 字符');
        if (!ovLast) {
          L.push('尚未打开过全屏');
        } else {
          L.push('上次全屏 MIME: ' + ovLast.mime + (ovLast.mime.indexOf(';') >= 0 ? '' : ' (+charset=utf-8)'));
          L.push('上次全屏 文本长度: ' + ovLast.len);
          L.push('使用方式: ' + (ovLast.srcDoc ? 'srcdoc（可能被拦截脚本）' : 'blob URL（正常）'));
          L.push('blob URL: ' + (ovLast.url ? ovLast.url.slice(0, 40) : '(无)'));
          var of = document.getElementById('fv-ov-frame');
          if (of) {
            L.push('iframe src: ' + String(of.src || '(空)').slice(0, 40));
            var bd = null, bl = -1;
            try { bd = of.contentDocument; if (bd && bd.body) bl = bd.body.innerHTML.length; } catch (e) {}
            L.push('iframe body 长度: ' + (bl < 0 ? '无法读取(跨域/未加载)' : bl));
            if (bl === 0) L.push('⚠ body 为空 → 可能是 MIME 错误或文档未渲染');
          }
          L.push('判定：MIME 必须是 text/html 或 image/svg+xml 等合法类型；');
          L.push('      显示 raw;charset=utf-8 之类即为 BUG，浏览器会拒绝渲染。');
        }
        L.push('');
        L.push('提示：js 全屏后顶部有绿色状态条，显示「脚本已执行，无可见输出」属正常。');
      } catch (e) { L.push('全屏诊断出错: ' + e.message); }
      txt += '\n' + L.join('\n');
      instCode.textContent = txt;
      instTip.textContent = '把以上内容复制发给我即可定位。上半看 typeof_ChromeXt（安装能力），下半看全屏 MIME 与 iframe body 长度（白屏原因）。';
      mask.classList.remove('on');
      dlgPanel.style.display = 'none';
      instPanel.style.display = 'flex';
    }

    function installNow() {
      var meta = readDlgMeta();
      if (!meta.name) { msg('脚本名不能为空'); return; }
      if (!meta.matches.length) { msg('至少填一条 @match'); return; }
      var code = composeCode(meta);
      installCode = code;
      installName = meta.name + '.user.js';
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
        msg('已发送安装请求：' + meta.name + '。请到 ChromeXt 脚本列表确认（或打开匹配网页验证）。');
      } catch (e) {
        msg('安装失败：' + e.message);
        return;
      }
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
    function openMenu() {
      if (mask.classList.contains('on')) { mask.classList.remove('on'); return; }
      var items = [
        { t: '📁 选择文件', f: function () { fileInput.click(); } },
        { t: '⚡ 安装脚本（可改 @match）', f: openInstallDialog },
        { t: '🔍 诊断（查为何装不上）', f: showDiag },
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
        lastText = decodeText(buf);
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
    $('fv-copy').onclick = function () {
      copyText(installCode, function (ok) { msg(ok ? '已复制到剪贴板' : '复制失败，请长按代码手动复制'); });
    };
    $('fv-mgr2').onclick = openManager;
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

    preBox.ondblclick = function () { var e = ext(); if (e === 'js' || e === 'mjs') openInstall(); };
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
     样式
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
    '#fv-inst-code{flex:1;overflow:auto;margin:10px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-all;font:12px/1.6 Consolas,monospace;color:#333;-webkit-user-select:text;user-select:text}' +
    '#fv-overlay{position:fixed;inset:0;z-index:2147483644;background:#fff;display:none;flex-direction:column}' +
    '#fv-ov-tip{display:none;padding:8px 12px;background:#fff7e6;color:#8a6d3b;font-size:12px;border-bottom:1px solid #f0e0b0}' +
    '#fv-ov-frame{flex:1;width:100%;border:0;background:#fff}' +
    '#fv-dlg{position:fixed;inset:0;z-index:2147483646;background:#f5f6fa;display:none;flex-direction:column}' +
    '#fv-dlg .ih{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;box-shadow:0 2px 6px rgba(0,0,0,.04);flex:none}' +
    '#fv-dlg-tip{padding:8px 12px;color:#8a6d3b;font-size:12px;background:#fffbe6;border-bottom:1px solid #f0e6c0;line-height:1.7}' +
    '@media(max-width:480px){.head{gap:4px}.pick{min-width:100px}.btn{padding:6px 9px}}';

  var BODY =
    '<div class="head">' +
      '<span class="title">📂 FV 本地预览</span>' +
      '<span class="pick" id="fv-pick"><span id="fv-name">📁 选择文件</span>' +
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
    '<div id="fv-inst">' +
      '<div class="ih">' +
        '<span class="title">📦 安装为 ChromeXt 脚本</span>' +
        '<button class="btn sec" id="fv-mgr2">⚙️ 打开管理页</button>' +
        '<button class="btn" id="fv-copy">📋 仅复制代码</button>' +
        '<button class="btn ghost" id="fv-inst-close">✕ 关闭</button>' +
      '</div>' +
      '<div class="tip" id="fv-inst-tip"></div>' +
      '<div id="fv-inst-code"></div>' +
    '</div>' +
    '<div id="fv-overlay">' +
      '<div class="oh">' +
        '<span class="title">🖥️ 全屏预览</span>' +
        '<button class="btn" id="fv-ov-dl" style="display:none">⬇️ 下载</button>' +
        '<button class="btn ghost" id="fv-ov-close">✕ 退出全屏</button>' +
      '</div>' +
      '<div id="fv-ov-tip"></div>' +
      '<iframe id="fv-ov-frame"></iframe>' +
    '</div>' +
    '<div id="fv-dlg">' +
      '<div class="ih">' +
        '<span class="title">⚡ 安装到 ChromeXt</span>' +
        '<button class="btn" id="fv-dlg-install">✅ 确认安装</button>' +
        '<button class="btn sec" id="fv-dlg-refresh">🔄 刷新预览</button>' +
        '<button class="btn ghost" id="fv-dlg-close">✕ 取消</button>' +
      '</div>' +
      '<div class="tip" id="fv-dlg-tip"></div>' +
      '<div style="flex:1;overflow:auto;display:flex;flex-direction:column">' +
        '<div id="fv-dlg-form" style="padding:12px"></div>' +
        '<div style="padding:0 12px 12px">' +
          '<div style="font:600 12px system-ui;color:#555;margin-bottom:4px">最终安装内容（由上方字段生成）</div>' +
          '<div id="fv-dlg-code" style="max-height:220px;overflow:auto;padding:12px;background:#fff;' +
            'border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-all;' +
            'font:11px/1.6 Consolas,monospace;color:#333;-webkit-user-select:text;user-select:text"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

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
      showNow();   /* 内容已就位，解除隐藏 */

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
    /* 先尝试原生抢占：能成功就没有错误页闪烁，像打开正常网页一样。
       CSS / BODY / toolScript 此刻都已就绪（同步执行到此处仍是 document-start）。 */
    if (tryNativeWrite()) return true;
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
