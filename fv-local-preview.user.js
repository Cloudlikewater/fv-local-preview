// ==UserScript==
// @name         ChromeXt 接口探测器 v2（增强版·只读）
// @namespace    com.example.fv
// @version      2.0
// @description  带完整 grant 的只读探测：GM API 家族、GM 命名空间、ChromeXt 对象本体、window Symbol、FV 的 globalfooviewobject、存储读写实测、环境信息。列出方法但绝不调用未知 action。
// @match        *://*/*
// @match        file:///*
// @run-at       document-start
// @grant        GM.ChromeXt
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_getResourceText
// @grant        GM_getResourceURL
// @grant        GM_addElement
// @grant        GM_cookie
// @grant        GM_webRequest
// @grant        GM_info
// @grant        window.close
// @grant        window.focus
// ==/UserScript==

(function () {
  'use strict';

  if (window.__cxProbe2Loaded) return;
  window.__cxProbe2Loaded = true;

  var RESULT = { env: {}, gm: {}, ns: {}, chromeXt: null, symbols: [], fooview: null, storage: {}, extra: [] };

  /* 写入类关键词（高亮 + 重点提示） */
  var WRITE_HINTS = ['install', 'insert', 'add', 'set', 'save', 'write', 'update', 'create', 'new', 'put', 'store', 'apply', 'register', 'import', 'delete', 'remove', 'edit', 'modify'];
  var KEYWORDS = ['command', 'script', 'install', 'insert', 'dispatch', 'post', 'parse', 'db', 'database', 'local', 'chrome', 'xt', 'gm', 'user', 'menu', 'storage', 'value', 'save', 'add', 'remove', 'delete', 'update'];

  function t(v) {
    try {
      if (v === null) return 'null';
      var ty = typeof v;
      if (ty === 'string') return 'string:' + v.slice(0, 50);
      if (ty === 'number' || ty === 'boolean') return ty + ':' + v;
      if (ty === 'function') return 'function';
      if (ty === 'symbol') return 'symbol ' + String(v);
      if (ty === 'object') {
        if (Array.isArray(v)) return 'array(' + v.length + ')';
        var c = v.constructor && v.constructor.name ? v.constructor.name : 'Object';
        return 'object:' + c;
      }
      return ty;
    } catch (e) { return '?'; }
  }

  function keysOf(obj) {
    var out = [];
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return out;
    try {
      Object.getOwnPropertyNames(obj).forEach(function (n) {
        var v; try { v = obj[n]; } catch (e) { v = undefined; }
        out.push({ k: n, v: t(v), fn: typeof v === 'function' });
      });
    } catch (e) {}
    try {
      Object.getOwnPropertySymbols(obj).forEach(function (s) {
        var v; try { v = obj[s]; } catch (e) { v = undefined; }
        out.push({ k: 'Symbol(' + String(s).replace(/^Symbol\(|\)$/g, '') + ')', v: t(v), fn: typeof v === 'function' });
      });
    } catch (e) {}
    return out;
  }

  /* ---------- 1. 环境信息 ---------- */
  function probeEnv() {
    var e = {};
    try { e.href = location.href; } catch (err) { e.href = '?'; }
    try { e.hostname = location.hostname; } catch (err) { e.hostname = '?'; }
    try { e.protocol = location.protocol; } catch (err) { e.protocol = '?'; }
    try { e.origin = location.origin; } catch (err) { e.origin = '?'; }
    e.isErrorPage = (String(e.protocol).toLowerCase() === 'chrome-error:' || /chromewebdata|neterror/i.test(e.href));
    // 文本兜底：错误页正文会写 ERR_XXX
    try {
      if (!e.isErrorPage) {
        var tx = (document.documentElement && document.documentElement.innerText) || (document.body && document.body.innerText) || (document.body && document.body.textContent) || '';
        if (/ERR_[A-Z_]+/.test(tx)) { e.isErrorPage = true; e.errorText = String(tx).trim().slice(0, 120); }
      }
    } catch (err) {}
    e.readyState = document.readyState;
    e.ua = navigator.userAgent;
    e.time = new Date().toLocaleString();
    return e;
  }

  /* ---------- 2. GM API 家族 ---------- */
  var GM_LIST = [
    'GM_setValue', 'GM_getValue', 'GM_deleteValue', 'GM_listValues', 'GM_getValues', 'GM_setValues',
    'GM_xmlhttpRequest', 'GM_download', 'GM_registerMenuCommand', 'GM_unregisterMenuCommand',
    'GM_addStyle', 'GM_addElement', 'GM_openInTab', 'GM_closeTab', 'GM_notification',
    'GM_setClipboard', 'GM_getResourceText', 'GM_getResourceURL', 'GM_cookie', 'GM_webRequest',
    'GM_info', 'GM_log', 'GM_getTab', 'GM_saveTab', 'GM_getTabs'
  ];
  function probeGM() {
    var g = {};
    GM_LIST.forEach(function (name) {
      var ok = false, ty = 'undefined';
      try {
        var v = window[name];
        if (typeof v === 'function') { ok = true; ty = 'function'; }
        else if (v !== undefined) { ok = true; ty = t(v); }
      } catch (e) { ty = 'error'; }
      g[name] = { available: ok, type: ty };
    });
    // 直接作用域里的（用户脚本作用域，window 上可能没有）
    ['GM_setValue', 'GM_getValue', 'GM_xmlhttpRequest'].forEach(function (name) {
      try {
        // eslint-disable-next-line no-eval
        var v = eval('typeof ' + name);
        if (g[name]) g[name].scope = v;
      } catch (e) {}
    });
    return g;
  }

  /* ---------- 3. GM.* 命名空间 ---------- */
  function probeNamespace() {
    var ns = { exists: false, keys: [] };
    try {
      if (typeof GM === 'undefined') return ns;
      ns.exists = true;
      ns.type = t(GM);
      ns.keys = keysOf(GM);
    } catch (e) { ns.error = String(e); }
    return ns;
  }

  /* ---------- 4. ChromeXt 对象本体 ---------- */
  function probeChromeXt() {
    var found = [];
    // 4.1 直接作用域（grant GM.ChromeXt 解锁后）
    try {
      if (typeof ChromeXt !== 'undefined' && ChromeXt) {
        found.push({ src: 'ChromeXt (脚本作用域)', type: t(ChromeXt), keys: keysOf(ChromeXt) });
      }
    } catch (e) {}
    // 4.2 window.ChromeXt
    try {
      if (window.ChromeXt) {
        var dup = found.length && found[0].src.indexOf('脚本作用域') >= 0;
        if (!dup) found.push({ src: 'window.ChromeXt', type: t(window.ChromeXt), keys: keysOf(window.ChromeXt) });
      }
    } catch (e) {}
    // 4.3 window 上的 Symbol 属性（找带 commands / dispatch 的）
    try {
      Object.getOwnPropertySymbols(window).forEach(function (s) {
        var v; try { v = window[s]; } catch (e) { return; }
        if (!v || (typeof v !== 'object' && typeof v !== 'function')) return;
        var sName = String(s);
        // 浏览器内置的构造函数注册表，纯噪音，跳过
        if (/webidl2js|constructor registry/i.test(sName)) return;
        var ks = keysOf(v);
        var txt = ks.map(function (x) { return x.k; }).join(' ').toLowerCase();
        var hit = /command|dispatch|script|xt|chrome/.test(txt);
        if (hit) {
          found.push({ src: 'window[Symbol(' + String(s).replace(/^Symbol\(|\)$/g, '') + ')]', type: t(v), keys: ks });
        }
      });
    } catch (e) {}
    return found;
  }

  /* ---------- 5. FV 的 globalfooviewobject 深挖 ---------- */
  function probeFooView() {
    var out = null;
    try {
      var fv = window.globalfooviewobject;
      if (!fv) return null;
      out = { type: t(fv), methods: [] };
      keysOf(fv).forEach(function (k) {
        out.methods.push({ name: k.k, type: k.v, fn: k.fn });
      });
      // 顺带找其他 fooview 相关
      out.others = [];
      try {
        Object.getOwnPropertyNames(window).forEach(function (n) {
          if (/fooview/i.test(n)) out.others.push({ name: n, type: t(window[n]) });
        });
      } catch (e) {}
    } catch (e) { out = { error: String(e) }; }
    return out;
  }

  /* ---------- 6. 存储能力实测 ---------- */
  function probeStorage() {
    var s = {};
    var TEST_KEY = '__cx_probe_test__';
    var TEST_VAL = 'ok_' + Date.now();
    // GM
    s.gm = { write: false, read: false, match: false, err: '' };
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(TEST_KEY, TEST_VAL);
        s.gm.write = true;
        var back = GM_getValue(TEST_KEY, null);
        s.gm.read = back !== null;
        s.gm.match = back === TEST_VAL;
        try { GM_deleteValue(TEST_KEY); } catch (e) {}
      } else { s.gm.err = 'GM_setValue 未定义'; }
    } catch (e) { s.gm.err = String(e); }
    // localStorage
    s.ls = { write: false, read: false, match: false, err: '' };
    try {
      localStorage.setItem(TEST_KEY, TEST_VAL);
      s.ls.write = true;
      var b2 = localStorage.getItem(TEST_KEY);
      s.ls.read = b2 !== null;
      s.ls.match = b2 === TEST_VAL;
      try { localStorage.removeItem(TEST_KEY); } catch (e) {}
    } catch (e) { s.ls.err = String(e).slice(0, 80); }
    return s;
  }

  /* ---------- 汇总 ---------- */
  function collect() {
    RESULT.env = probeEnv();
    RESULT.gm = probeGM();
    RESULT.ns = probeNamespace();
    RESULT.chromeXt = probeChromeXt();
    RESULT.fooview = probeFooView();
    RESULT.storage = probeStorage();
    return RESULT;
  }

  window.__cxProbe2 = collect;

  /* ================= UI ================= */
  function hl(text) {
    var out = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    WRITE_HINTS.forEach(function (w) {
      try {
        out = out.replace(new RegExp('(' + w + ')', 'gi'), '<span class="cxp-hit">$1</span>');
      } catch (e) {}
    });
    return out;
  }
  function line(s) { return String(s); }

  function buildText() {
    var L = [];
    L.push('======== ChromeXt 接口探测 v2 ========');
    L.push('时间: ' + RESULT.env.time);
    L.push('');
    L.push('【1. 环境】');
    L.push('  地址: ' + RESULT.env.href);
    L.push('  hostname: ' + RESULT.env.hostname);
    L.push('  protocol: ' + RESULT.env.protocol);
    L.push('  origin: ' + RESULT.env.origin);
    L.push('  是否错误页: ' + RESULT.env.isErrorPage);
    L.push('  UA: ' + RESULT.env.ua);
    L.push('');
    L.push('【2. GM API 家族】');
    Object.keys(RESULT.gm).forEach(function (k) {
      var it = RESULT.gm[k];
      if (it.available) L.push('  ✅ ' + k + '  [' + it.type + ']' + (it.scope ? ' scope=' + it.scope : ''));
    });
    var miss = Object.keys(RESULT.gm).filter(function (k) { return !RESULT.gm[k].available; });
    if (miss.length) L.push('  ❌ 不可用: ' + miss.join(', '));
    L.push('');
    L.push('【3. GM.* 命名空间】');
    L.push('  存在: ' + RESULT.ns.exists + '  类型: ' + (RESULT.ns.type || '-'));
    if (RESULT.ns.keys && RESULT.ns.keys.length) {
      L.push('  成员:');
      RESULT.ns.keys.forEach(function (k) { L.push('    ' + (k.fn ? 'ƒ ' : '  ') + k.k + ' = ' + k.v); });
    }
    L.push('');
    L.push('【4. ChromeXt 对象】');
    if (!RESULT.chromeXt.length) L.push('  ⚠️ 未找到（可能 grant 未解锁，或本页未注入）');
    RESULT.chromeXt.forEach(function (c) {
      L.push('  --- ' + c.src + '  [' + c.type + ']');
      c.keys.forEach(function (k) { L.push('    ' + (k.fn ? 'ƒ ' : '  ') + k.k + ' = ' + k.v); });
    });
    L.push('');
    L.push('【5. FV globalfooviewobject】');
    if (!RESULT.fooview) L.push('  ⚠️ 未找到（非 FV 浏览器）');
    else if (RESULT.fooview.error) L.push('  错误: ' + RESULT.fooview.error);
    else {
      L.push('  类型: ' + RESULT.fooview.type);
      L.push('  方法 (' + RESULT.fooview.methods.length + '):');
      RESULT.fooview.methods.forEach(function (m) { L.push('    ' + (m.fn ? 'ƒ ' : '  ') + m.name + ' = ' + m.type); });
      if (RESULT.fooview.others && RESULT.fooview.others.length) {
        L.push('  其他 fooview 对象:');
        RESULT.fooview.others.forEach(function (o) { L.push('    ' + o.name + ' = ' + o.type); });
      }
    }
    L.push('');
    L.push('【6. 存储能力实测】');
    L.push('  GM_setValue: 写=' + RESULT.storage.gm.write + ' 读=' + RESULT.storage.gm.read + ' 一致=' + RESULT.storage.gm.match + (RESULT.storage.gm.err ? ' 错误=' + RESULT.storage.gm.err : ''));
    L.push('  localStorage: 写=' + RESULT.storage.ls.write + ' 读=' + RESULT.storage.ls.read + ' 一致=' + RESULT.storage.ls.match + (RESULT.storage.ls.err ? ' 错误=' + RESULT.storage.ls.err : ''));
    L.push('');
    L.push('======== 结束 ========');
    return L.join('\n');
  }

  function buildUI() {
    var st = document.createElement('style');
    st.textContent =
      '#cx2-fab{position:fixed;right:0;top:30%;transform:translateY(-50%);z-index:2147483647;width:34px;height:56px;' +
      'background:#5a4b8f;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;' +
      'font:bold 12px system-ui;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:.93}' +
      '#cx2-panel{position:fixed;inset:0;z-index:2147483647;background:#fff;display:none;flex-direction:column;font:13px/1.6 system-ui}' +
      '#cx2-head{padding:10px 12px;background:#f5f6fa;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:none}' +
      '#cx2-head .t{font-weight:700;color:#5a4b8f}' +
      '#cx2-head button{padding:6px 12px;border:0;border-radius:6px;background:#5a4b8f;color:#fff;font:600 12px system-ui;cursor:pointer}' +
      '#cx2-head button.g{background:#eef2f5;color:#333;border:1px solid #ccd0d6}' +
      '#cx2-body{flex:1;overflow:auto;padding:10px;white-space:pre-wrap;word-break:break-all;font:11px/1.7 Consolas,monospace;color:#333}' +
      '.cxp-hit{color:#c0392b;font-weight:700}';
    document.head.appendChild(st);

    var fab = document.createElement('div');
    fab.id = 'cx2-fab'; fab.textContent = 'CX2'; fab.title = 'ChromeXt 接口探测 v2';

    var panel = document.createElement('div');
    panel.id = 'cx2-panel';
    panel.innerHTML =
      '<div id="cx2-head">' +
        '<span class="t">🔍 ChromeXt 探测 v2（只读）</span>' +
        '<button id="cx2-copy">📋 复制全部</button>' +
        '<button id="cx2-again">🔄 重新探测</button>' +
        '<button class="g" id="cx2-close">✕ 关闭</button>' +
      '</div>' +
      '<div id="cx2-body"></div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var body = panel.querySelector('#cx2-body');
    function paint() { body.innerHTML = hl(buildText()); }
    paint();

    fab.onclick = function () {
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    };
    panel.querySelector('#cx2-close').onclick = function () { panel.style.display = 'none'; };
    panel.querySelector('#cx2-again').onclick = function () { collect(); paint(); alert('已重新探测'); };
    panel.querySelector('#cx2-copy').onclick = function () {
      var text = buildText();
      function fb() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          alert(ok ? '已复制到剪贴板' : '复制失败，请长按选择文本手动复制');
        } catch (e) { alert('复制失败'); }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { alert('已复制到剪贴板'); }, fb);
        } else fb();
      } catch (e) { fb(); }
    };
  }

  function boot() {
    try {
      if (!document.body) { document.documentElement.appendChild(document.createElement('body')); }
      collect();
      buildUI();
      console.log('[CX探测v2] 完成。完整报告见 window.__cxProbe2() 或点右侧 CX2 按钮。');
      console.log('[CX探测v2] GM 可用数:', Object.keys(RESULT.gm).filter(function (k) { return RESULT.gm[k].available; }).length);
      console.log('[CX探测v2] ChromeXt 对象:', RESULT.chromeXt.length ? RESULT.chromeXt.map(function (c) { return c.src; }).join(' | ') : '未找到');
    } catch (e) {
      console.log('[CX探测v2] 失败', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }
})();
