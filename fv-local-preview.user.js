// ==UserScript==
// @name         ChromeXt 内部接口探测器（只读，不改任何东西）
// @namespace    com.example.fv
// @version      1.0
// @description  扫描 window 上的自有属性 / Symbol 属性 / 嵌套对象，找出 ChromeXt 暴露的内部接口并 dump 出所有方法与字段，便于确认是否存在写入脚本库的入口。全程只读。
// @match        *://*/*
// @match        file:///*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__cxProbeLoaded) return;
  window.__cxProbeLoaded = true;

  // 关心的关键词：命中即高亮
  var KEYWORDS = [
    'command', 'script', 'install', 'insert', 'dispatch', 'post',
    'parse', 'db', 'database', 'local', 'chrome', 'xt', 'gm',
    'user', 'menu', 'storage', 'value', 'save', 'add', 'remove', 'delete', 'update'
  ];
  // 明确想找的「写入类」方法名
  var WRITE_HINTS = [
    'install', 'insert', 'add', 'set', 'save', 'write', 'update', 'create', 'new', 'put', 'store', 'apply', 'register', 'import'
  ];

  // Window / Location 之类的全局对象噪声很大，直接排除
  function isGlobalNoise(v) {
    try {
      if (!v) return false;
      if (typeof Window !== 'undefined' && v instanceof Window) return true;
      var cn = v.constructor && v.constructor.name ? v.constructor.name : '';
      if (cn === 'Window' || cn === 'Location' || cn === 'History' || cn === 'Navigator') return true;
    } catch (e) {}
    return false;
  }

  function safeName(v) {
    try {
      if (v === null) return 'null';
      var t = typeof v;
      if (t === 'string' || t === 'number' || t === 'boolean') return t + ':' + String(v).slice(0, 60);
      if (t === 'function') return 'function';
      if (t === 'symbol') return 'symbol ' + String(v);
      if (t === 'object') {
        var ctor = v.constructor && v.constructor.name ? v.constructor.name : 'Object';
        if (Array.isArray(v)) return 'array(' + v.length + ')';
        return 'object:' + ctor;
      }
      return t;
    } catch (e) { return 'unknown'; }
  }

  // 列出一个对象的所有键（字符串 + Symbol），不做深递归，避免死循环
  function listKeys(obj, depth) {
    var out = [];
    if (!obj || depth > 2) return out;
    try {
      var names = Object.getOwnPropertyNames(obj);
      for (var i = 0; i < names.length; i++) {
        var n = names[i];
        var val;
        try { val = obj[n]; } catch (e) { val = undefined; }
        out.push({ k: n, v: safeName(val), isFn: typeof val === 'function' });
      }
    } catch (e) {}
    try {
      var syms = Object.getOwnPropertySymbols(obj);
      for (var j = 0; j < syms.length; j++) {
        var s = syms[j];
        var sv;
        try { sv = obj[s]; } catch (e) { sv = undefined; }
        out.push({ k: 'Symbol(' + String(s).replace(/^Symbol\(|\)$/g, '') + ')', v: safeName(sv), isFn: typeof sv === 'function' });
      }
    } catch (e) {}
    return out;
  }

  // 判断这个对象是否值得关注
  function scoreOf(keysText, keyName) {
    var s = 0;
    var low = (keyName + ' ' + keysText).toLowerCase();
    for (var i = 0; i < KEYWORDS.length; i++) {
      if (low.indexOf(KEYWORDS[i]) >= 0) s++;
    }
    for (var j = 0; j < WRITE_HINTS.length; j++) {
      if (low.indexOf(WRITE_HINTS[j]) >= 0) s += 3;
    }
    return s;
  }

  function collect() {
    var items = [];

    // 1) window 自有字符串属性
    try {
      var own = Object.getOwnPropertyNames(window);
      for (var i = 0; i < own.length; i++) {
        var n = own[i];
        if (n === 'window' || n === 'self' || n === 'top' || n === 'parent' || n === 'document' || n === 'location') continue;
        var v;
        try { v = window[n]; } catch (e) { continue; }
        if (v === null || (typeof v !== 'object' && typeof v !== 'function')) continue;
        if (isGlobalNoise(v)) continue;
        var keys = listKeys(v, 0);
        var txt = keys.map(function (x) { return x.k; }).join(' ');
        var sc = scoreOf(txt, n);
        if (sc > 0 || /chrome|xt|gm|script|symbol/i.test(n)) {
          items.push({ src: 'window.' + n, name: n, type: safeName(v), score: sc, keys: keys });
        }
      }
    } catch (e) {}

    // 2) window 上的 Symbol 属性（菜单提取器就是这么找到 commands 的）
    try {
      var syms = Object.getOwnPropertySymbols(window);
      for (var j = 0; j < syms.length; j++) {
        var s = syms[j];
        var sv;
        try { sv = window[s]; } catch (e) { continue; }
        if (sv === null || (typeof sv !== 'object' && typeof sv !== 'function')) continue;
        if (isGlobalNoise(sv)) continue;
        var keys2 = listKeys(sv, 1);
        var txt2 = keys2.map(function (x) { return x.k; }).join(' ');
        var sc2 = scoreOf(txt2, String(s)) + 5; // Symbol 属性默认加分
        items.push({
          src: 'window[Symbol(' + String(s).replace(/^Symbol\(|\)$/g, '') + ')]',
          name: String(s), type: safeName(sv), score: sc2, keys: keys2
        });
      }
    } catch (e) {}

    // 3) 嵌套一层：对象里的对象（找 commands / dispatch 之类）
    try {
      var roots = [];
      try { roots = Object.getOwnPropertyNames(window); } catch (e) {}
      for (var r = 0; r < roots.length; r++) {
        var rn = roots[r];
        if (rn === 'window' || rn === 'self' || rn === 'top' || rn === 'parent' || rn === 'document' || rn === 'location') continue;
        var rv;
        try { rv = window[rn]; } catch (e) { continue; }
        if (rv === null || (typeof rv !== 'object' && typeof rv !== 'function')) continue;
        if (isGlobalNoise(rv)) continue;
        var k1 = listKeys(rv, 0);
        for (var k = 0; k < k1.length; k++) {
          var subName = k1[k].k;
          var sub;
          try { sub = rv[subName]; } catch (e) { continue; }
          if (sub === null || (typeof sub !== 'object' && typeof sub !== 'function')) continue;
          if (Array.isArray(sub)) continue;
          var ks = listKeys(sub, 0);
          var ts = ks.map(function (x) { return x.k; }).join(' ');
          var ss = scoreOf(ts, subName);
          if (ss >= 4) {
            items.push({ src: 'window.' + rn + '.' + subName, name: subName, type: safeName(sub), score: ss, keys: ks });
          }
        }
      }
    } catch (e) {}

    // 去重 + 排序
    var seen = {};
    var uniq = [];
    items.forEach(function (it) {
      if (seen[it.src]) return;
      seen[it.src] = 1;
      uniq.push(it);
    });
    uniq.sort(function (a, b) { return b.score - a.score; });
    return uniq.slice(0, 120);
  }

  // 全局直接访问，方便在 Eruda 控制台里查看
  window.__cxProbe = function () { return collect(); };

  /* ---------------- UI ---------------- */
  function buildUI(data) {
    var st = document.createElement('style');
    st.textContent =
      '#cxp-fab{position:fixed;right:0;top:38%;transform:translateY(-50%);z-index:2147483647;width:32px;height:52px;' +
      'background:#5a4b8f;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;' +
      'font:bold 12px system-ui;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:.92}' +
      '#cxp-panel{position:fixed;inset:0;z-index:2147483647;background:#fff;display:none;flex-direction:column;font:13px/1.6 system-ui}' +
      '#cxp-head{padding:10px 12px;background:#f5f6fa;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:none}' +
      '#cxp-head .t{font-weight:700;color:#5a4b8f}' +
      '#cxp-head button{padding:6px 12px;border:0;border-radius:6px;background:#5a4b8f;color:#fff;font:600 12px system-ui;cursor:pointer}' +
      '#cxp-head button.g{background:#eef2f5;color:#333;border:1px solid #ccd0d6}' +
      '#cxp-list{flex:1;overflow:auto;padding:8px}' +
      '.cxp-item{margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}' +
      '.cxp-title{padding:8px 10px;background:#fafafa;font:600 12px Consolas,monospace;color:#333;cursor:pointer;word-break:break-all}' +
      '.cxp-title .sc{float:right;background:#5a4b8f;color:#fff;border-radius:8px;padding:0 6px;font-size:11px}' +
      '.cxp-body{display:none;padding:8px 10px;background:#fff;white-space:pre-wrap;word-break:break-all;font:11px/1.7 Consolas,monospace;color:#444;max-height:320px;overflow:auto}' +
      '.cxp-body.open{display:block}' +
      '.cxp-hit{color:#c0392b;font-weight:700}';
    document.head.appendChild(st);

    var fab = document.createElement('div');
    fab.id = 'cxp-fab';
    fab.textContent = 'CX?';
    fab.title = 'ChromeXt 接口探测';

    var panel = document.createElement('div');
    panel.id = 'cxp-panel';
    panel.innerHTML =
      '<div id="cxp-head">' +
        '<span class="t">🔍 ChromeXt 接口探测（只读）</span>' +
        '<button id="cxp-copy">📋 复制全部</button>' +
        '<button id="cxp-expand">📖 全部展开</button>' +
        '<button class="g" id="cxp-close">✕ 关闭</button>' +
      '</div>' +
      '<div id="cxp-list"></div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var list = panel.querySelector('#cxp-list');

    function hl(text) {
      var out = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      WRITE_HINTS.forEach(function (w) {
        var re = new RegExp('(' + w + ')', 'gi');
        out = out.replace(re, '<span class="cxp-hit">$1</span>');
      });
      return out;
    }

    data.forEach(function (it) {
      var box = document.createElement('div');
      box.className = 'cxp-item';
      var head = document.createElement('div');
      head.className = 'cxp-title';
      head.innerHTML = '<span class="sc">' + it.score + '</span>' + hl(it.src) + '  →  ' + hl(it.type);
      var body = document.createElement('div');
      body.className = 'cxp-body';
      var lines = it.keys.map(function (x) {
        return (x.isFn ? 'ƒ ' : '  ') + x.k + '  =  ' + x.v;
      });
      body.innerHTML = hl(lines.join('\n'));
      if (!it.keys.length) body.textContent = '(无可枚举键)';
      head.onclick = function () { body.classList.toggle('open'); };
      box.appendChild(head);
      box.appendChild(body);
      list.appendChild(box);
    });

    if (!data.length) {
      list.innerHTML = '<div style="padding:20px;color:#888;text-align:center">' +
        '未发现可疑对象。可能 ChromeXt 未在此页面注入，或接口未挂在 window 上。</div>';
    }

    fab.onclick = function () {
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    };
    panel.querySelector('#cxp-close').onclick = function () { panel.style.display = 'none'; };
    panel.querySelector('#cxp-expand').onclick = function () {
      var all = list.querySelectorAll('.cxp-body');
      for (var i = 0; i < all.length; i++) all[i].classList.add('open');
    };
    panel.querySelector('#cxp-copy').onclick = function () {
      var text = data.map(function (it) {
        return '=== ' + it.src + '  [' + it.type + ']  score=' + it.score + '\n' +
          it.keys.map(function (x) { return (x.isFn ? 'ƒ ' : '  ') + x.k + ' = ' + x.v; }).join('\n');
      }).join('\n\n');
      function fb() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          alert(ok ? '已复制，可粘贴发给分析' : '复制失败，请长按选择文本手动复制');
        } catch (e) { alert('复制失败'); }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { alert('已复制，可粘贴发给分析'); }, fb);
        } else fb();
      } catch (e) { fb(); }
    };
  }

  function boot() {
    try {
      if (!document.body) { document.documentElement.appendChild(document.createElement('body')); }
      var data = collect();
      window.__cxProbeData = data;
      buildUI(data);
      console.log('[CX探测] 找到 ' + data.length + ' 个可疑对象，详细信息见 window.__cxProbeData 或点右侧 CX? 按钮');
      console.log('[CX探测] 重点看 score 高的、以及带 install/insert/set/save/add 等写入类方法的条目');
    } catch (e) {
      console.log('[CX探测] 失败', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }
})();
