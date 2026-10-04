// ==UserScript==
// @name         ChromeXt 安装能力验证器（独立试验）
// @namespace    com.example.fv
// @version      1.0
// @description  独立验证哪条路径能真正把脚本装进 ChromeXt 脚本库：dispatch(installScript) / push冻结对象 / push+syncData / unlock / userscript action。带可视化结果面板，可复制报告。
// @match        *://*/*
// @match        file:///*
// @run-at       document-idle
// @grant        GM.ChromeXt
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  if (window.__cxInstallProbeLoaded) return;
  window.__cxInstallProbeLoaded = true;

  /* ==================== 待安装的测试脚本 ==================== */
  var TEST_NAME = 'FV_INSTALL_TEST';
  var TEST_NS = 'com.example.fv';
  var TEST_ID = TEST_NS + ':' + TEST_NAME;

  var TEST_SCRIPT = [
    '// ==UserScript==',
    '// @name         ' + TEST_NAME,
    '// @namespace    ' + TEST_NS,
    '// @version      1.0',
    '// @description  ChromeXt 安装能力验证脚本（验证完可安全删除）',
    '// @match        https://example.com/*',
    '// @run-at       document-idle',
    '// @grant        none',
    '// ==/UserScript==',
    '',
    '(function () {',
    '  "use strict";',
    '  console.log("[FV安装验证] 脚本已成功运行");',
    '  try { document.title = "[已装]" + document.title; } catch (e) {}',
    '})();',
    ''
  ].join('\n');

  /* ==================== 结果收集 ==================== */
  var LOG = [];
  function log(sec, text) {
    var line = '[' + sec + '] ' + text;
    LOG.push(line);
    try { console.log('[CX安装验证] ' + line); } catch (e) {}
    paintResult();
  }
  function clearLog() { LOG = []; paintResult(); }

  /* ==================== 取 ChromeXt 对象 ==================== */
  function getCX() {
    try { if (typeof ChromeXt !== 'undefined' && ChromeXt) return { obj: ChromeXt, src: '脚本作用域' }; } catch (e) {}
    try { if (window.ChromeXt) return { obj: window.ChromeXt, src: 'window.ChromeXt' }; } catch (e) {}
    try {
      var syms = Object.getOwnPropertySymbols(window);
      for (var i = 0; i < syms.length; i++) {
        if (/webidl2js|constructor registry/i.test(String(syms[i]))) continue;
        var v; try { v = window[syms[i]]; } catch (e) { continue; }
        if (v && typeof v === 'object' && 'scripts' in v) {
          return { obj: v, src: 'window[Symbol(' + String(syms[i]).replace(/^Symbol\(|\)$/g, '') + ')]' };
        }
      }
    } catch (e) {}
    return null;
  }

  function scriptsLen(cx) {
    try { var s = cx.scripts; return Array.isArray(s) ? s.length : '非数组'; } catch (e) { return '读取失败:' + e.message; }
  }

  function hasId(cx, id) {
    try {
      var s = cx.scripts;
      if (!Array.isArray(s)) return false;
      for (var i = 0; i < s.length; i++) {
        var sc = s[i];
        if (sc && sc.script && sc.script.id === id) return true;
        if (sc && sc.id === id) return true;
      }
    } catch (e) {}
    return false;
  }

  /* ==================== 测试 1：环境与通道 ==================== */
  function testEnv() {
    var got = getCX();
    if (!got) { log('T1', '❌ 未找到 ChromeXt 对象（@grant GM.ChromeXt 可能未生效）'); return null; }
    log('T1', '✅ ChromeXt 来源: ' + got.src);
    var cx = got.obj;

    // 原型层方法
    var proto1 = [];
    try {
      var p = Object.getPrototypeOf(cx);
      proto1 = Object.getOwnPropertyNames(p);
    } catch (e) {}
    log('T1', '原型层1成员: ' + (proto1.length ? proto1.join(', ') : '(无)'));

    ['dispatch', 'post', 'unlock', 'lock', 'isLocked'].forEach(function (m) {
      var ok = false;
      try { ok = typeof cx[m] === 'function'; } catch (e) {}
      log('T1', '  ' + m + ': ' + (ok ? '✅ 可用' : '❌ 不可用'));
    });

    try { log('T1', 'isLocked() = ' + cx.isLocked()); } catch (e) { log('T1', 'isLocked() 调用失败: ' + e.message); }
    log('T1', '当前 scripts 数量: ' + scriptsLen(cx));
    log('T1', '测试脚本是否已存在: ' + hasId(cx, TEST_ID));
    return cx;
  }

  /* ==================== 测试 2：dispatch 通道是否可用 ==================== */
  function testChannel(cx) {
    if (typeof cx.dispatch !== 'function') { log('T2', '❌ dispatch 不可用，跳过'); return; }
    // 用一个无害 action 试探：copy
    try {
      cx.dispatch('copy', { type: 'text', text: 'FV_install_probe_' + Date.now(), label: 'cx-probe' });
      log('T2', '✅ dispatch("copy") 未抛异常 → dispatch 通道可调用');
    } catch (e) {
      log('T2', '❌ dispatch("copy") 抛错: ' + e.message);
    }
    // 再试 notification（可见）
    try {
      cx.dispatch('notification', { id: 'probe', uuid: 0, title: 'FV安装验证', text: 'dispatch 通道测试中', timeout: 2000 });
      log('T2', '✅ dispatch("notification") 未抛异常');
    } catch (e) {
      log('T2', 'dispatch("notification") 抛错: ' + e.message);
    }
  }

  /* ==================== 测试 3：★ dispatch("installScript") ★ ==================== */
  function testInstallScript(cx) {
    if (typeof cx.dispatch !== 'function') { log('T3', '❌ dispatch 不可用'); return; }
    var before = scriptsLen(cx);
    log('T3', '调用前 scripts: ' + before);
    try {
      cx.dispatch('installScript', TEST_SCRIPT);
      log('T3', '✅ dispatch("installScript", text) 调用未抛异常');
    } catch (e) {
      log('T3', '❌ 抛错: ' + e.message);
      return;
    }
    setTimeout(function () {
      var after = scriptsLen(cx);
      var nowHas = hasId(cx, TEST_ID);
      log('T3', '调用后 scripts: ' + after + ' | 数组中已含测试脚本: ' + nowHas);
      log('T3', nowHas
        ? '★ 脚本已进入 ChromeXt.scripts —— 很可能已安装成功'
        : '⚠️ 数组未见变化。可能：① 需刷新页面/重开浏览器才加载 ② 内部异步写入 ③ 未真正入库');
      log('T3', '验证方法：打开 https://example.com/ 看标题是否变成 [已装]... 或到 ChromeXt 脚本列表查看');
    }, 800);
  }

  /* ==================== 测试 4：push 冻结对象 ==================== */
  function testPushFrozen(cx) {
    var before = scriptsLen(cx);
    log('T4', 'push 前 scripts: ' + before);

    var metaStr = [
      '// ==UserScript==',
      '// @name         ' + TEST_NAME + '_PUSH',
      '// @namespace    ' + TEST_NS,
      '// @version      1.0',
      '// @match        https://example.com/*',
      '// @grant        none',
      '// ==/UserScript=='
    ].join('\n');

    var obj = {
      scriptMetaStr: metaStr,
      script: {
        id: TEST_NS + ':' + TEST_NAME + '_PUSH',
        name: TEST_NAME + '_PUSH',
        namespace: TEST_NS,
        version: '1.0',
        description: 'push 验证',
        'run-at': 'document-idle',
        includes: [],
        matches: ['https://example.com/*'],
        exlcudes: [],
        requires: [],
        grants: [],
        connects: [],
        resources: []
      },
      storage: {},
      uuid: Math.random(),
      valueListener: [],
      scriptHandler: 'ChromeXt',
      version: '3.8.2'
    };

    var frozen = Object.freeze(obj);
    log('T4', '对象已 freeze: ' + Object.isFrozen(frozen));

    try {
      cx.scripts.push(frozen);
      log('T4', '✅ push 成功（冻结校验通过）');
    } catch (e) {
      log('T4', '❌ push 失败: ' + e.message);
      return;
    }
    var after = scriptsLen(cx);
    log('T4', 'push 后 scripts: ' + after + (after === before + 1 ? ' (长度+1，是活数组)' : ' (长度未变，可能是副本)'));
    log('T4', '⚠️ 注意：源码显示 scripts 的 sync=false，push 仅内存有效，不会写入数据库/不会持久化');
  }

  /* ==================== 测试 5：push + 强制 syncData ==================== */
  function testPushSync(cx) {
    log('T5', '尝试 push 后再用 dispatch("syncData") 强制同步');
    try {
      if (typeof cx.dispatch !== 'function') { log('T5', '❌ dispatch 不可用'); return; }
      var payload = { origin: location.origin || '', name: 'scripts', data: JSON.stringify([TEST_SCRIPT]) };
      cx.dispatch('syncData', payload);
      log('T5', '✅ dispatch("syncData") 未抛异常（但不代表脚本已入库）');
    } catch (e) {
      log('T5', '❌ 抛错: ' + e.message);
    }
    log('T5', '源码层面 syncData 只负责 filters/cspRules/userAgent，scripts 大概率不受支持');
  }

  /* ==================== 测试 6：unlock ==================== */
  function testUnlock(cx) {
    if (typeof cx.unlock !== 'function') { log('T6', '❌ unlock 不可用'); return; }
    var tries = [
      { label: 'unlock() 无参', arg: undefined },
      { label: 'unlock("")', arg: '' },
      { label: 'unlock(0)', arg: 0 }
    ];
    tries.forEach(function (t) {
      try {
        var r = (t.arg === undefined) ? cx.unlock() : cx.unlock(t.arg);
        log('T6', t.label + ' → 返回: ' + (r === undefined ? 'undefined' : typeof r));
      } catch (e) {
        log('T6', t.label + ' → 抛错: ' + e.message);
      }
    });
    log('T6', '源码结论：unlock 需要 token === initKey（Kotlin 随机生成，JS 中已替换），网页端拿不到 → 不可用');
  }

  /* ==================== 测试 7：userscript action ==================== */
  function testUserscriptAction(cx) {
    if (typeof cx.dispatch !== 'function') { log('T7', '❌ dispatch 不可用'); return; }
    try {
      cx.dispatch('userscript', { type: 'query' });
      log('T7', '✅ dispatch("userscript", {type:"query"}) 未抛异常');
    } catch (e) {
      log('T7', '❌ 抛错: ' + e.message);
    }
    log('T7', '这是前端管理器用的 action，可用于查询/删除/更新脚本');
  }

  /* ==================== UI ==================== */
  var resultBox = null;

  function paintResult() {
    if (!resultBox) return;
    resultBox.textContent = LOG.join('\n');
    resultBox.scrollTop = resultBox.scrollHeight;
  }

  function buildUI() {
    var st = document.createElement('style');
    st.textContent =
      '#cxi-fab{position:fixed;right:0;top:14%;transform:translateY(-50%);z-index:2147483647;width:34px;height:58px;' +
      'background:#c0392b;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;' +
      'font:bold 12px system-ui;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35);opacity:.94}' +
      '#cxi-panel{position:fixed;inset:0;z-index:2147483647;background:#fff;display:none;flex-direction:column;font:13px/1.6 system-ui}' +
      '#cxi-head{padding:10px 12px;background:#f5f6fa;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:none}' +
      '#cxi-head .t{font-weight:700;color:#c0392b}' +
      '#cxi-head button{padding:6px 12px;border:0;border-radius:6px;background:#c0392b;color:#fff;font:600 12px system-ui;cursor:pointer}' +
      '#cxi-head button.g{background:#eef2f5;color:#333;border:1px solid #ccd0d6}' +
      '#cxi-btns{padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #eee;flex:none}' +
      '#cxi-btns button{padding:7px 11px;border:0;border-radius:6px;background:#2f7d63;color:#fff;font:600 12px system-ui;cursor:pointer}' +
      '#cxi-btns button.alt{background:#607d8b}' +
      '#cxi-result{flex:1;overflow:auto;padding:10px;white-space:pre-wrap;word-break:break-all;' +
      'font:11px/1.8 Consolas,monospace;color:#333;background:#fafafa}';
    document.head.appendChild(st);

    var fab = document.createElement('div');
    fab.id = 'cxi-fab'; fab.textContent = '装?'; fab.title = 'ChromeXt 安装能力验证';

    var panel = document.createElement('div');
    panel.id = 'cxi-panel';
    panel.innerHTML =
      '<div id="cxi-head">' +
        '<span class="t">🧪 ChromeXt 安装能力验证器</span>' +
        '<button id="cxi-copy">📋 复制报告</button>' +
        '<button id="cxi-clear">🧹 清空</button>' +
        '<button class="g" id="cxi-close">✕ 关闭</button>' +
      '</div>' +
      '<div id="cxi-btns">' +
        '<button id="cxi-t1">① 环境检查</button>' +
        '<button id="cxi-t2">② dispatch通道</button>' +
        '<button id="cxi-t3">③ ★installScript★</button>' +
        '<button id="cxi-t4">④ push冻结对象</button>' +
        '<button class="alt" id="cxi-t5">⑤ push+syncData</button>' +
        '<button class="alt" id="cxi-t6">⑥ unlock</button>' +
        '<button class="alt" id="cxi-t7">⑦ userscript</button>' +
        '<button id="cxi-all">▶ 全部跑一遍</button>' +
      '</div>' +
      '<div id="cxi-result"></div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    resultBox = panel.querySelector('#cxi-result');

    var cx = null;

    function ensureCX() {
      if (cx) return cx;
      var got = getCX();
      if (got) { cx = got.obj; log('环境', '已获取 ChromeXt（' + got.src + '）'); }
      else log('环境', '❌ 未找到 ChromeXt，请确认脚本头有 @grant GM.ChromeXt 且已重新导入');
      return cx;
    }

    panel.querySelector('#cxi-t1').onclick = function () { clearLog(); cx = null; var c = testEnv(); if (c) cx = c; };
    panel.querySelector('#cxi-t2').onclick = function () { var c = ensureCX(); if (c) testChannel(c); };
    panel.querySelector('#cxi-t3').onclick = function () { var c = ensureCX(); if (c) testInstallScript(c); };
    panel.querySelector('#cxi-t4').onclick = function () { var c = ensureCX(); if (c) testPushFrozen(c); };
    panel.querySelector('#cxi-t5').onclick = function () { var c = ensureCX(); if (c) testPushSync(c); };
    panel.querySelector('#cxi-t6').onclick = function () { var c = ensureCX(); if (c) testUnlock(c); };
    panel.querySelector('#cxi-t7').onclick = function () { var c = ensureCX(); if (c) testUserscriptAction(c); };
    panel.querySelector('#cxi-all').onclick = function () {
      clearLog(); cx = null;
      var c = testEnv();
      if (!c) return;
      cx = c;
      setTimeout(function () { testChannel(c); }, 100);
      setTimeout(function () { testInstallScript(c); }, 300);
      setTimeout(function () { testPushFrozen(c); }, 1400);
      setTimeout(function () { testPushSync(c); }, 1600);
      setTimeout(function () { testUnlock(c); }, 1800);
      setTimeout(function () { testUserscriptAction(c); }, 2000);
      setTimeout(function () {
        log('提示', '全部测试结束。请打开 https://example.com/ 看标题是否变 [已装]，或到 ChromeXt 脚本列表确认。');
        log('提示', '测试脚本名：' + TEST_NAME + ' / ' + TEST_NAME + '_PUSH（验证完可删除）');
      }, 2400);
    };

    fab.onclick = function () {
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    };
    panel.querySelector('#cxi-close').onclick = function () { panel.style.display = 'none'; };
    panel.querySelector('#cxi-clear').onclick = function () { clearLog(); };
    panel.querySelector('#cxi-copy').onclick = function () {
      var text = LOG.join('\n') || '(无结果，请先跑测试)';
      function fb() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          alert(ok ? '已复制报告' : '复制失败，请长按手动复制');
        } catch (e) { alert('复制失败'); }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { alert('已复制报告'); }, fb);
        } else fb();
      } catch (e) { fb(); }
    };

    // 打开就先跑环境检查
    setTimeout(function () {
      var c = testEnv();
      if (c) cx = c;
    }, 200);
  }

  function boot() {
    try {
      if (!document.body) { document.documentElement.appendChild(document.createElement('body')); }
      buildUI();
      console.log('[CX安装验证] 已加载，点右侧红色「装?」按钮开始');
    } catch (e) {
      console.log('[CX安装验证] 启动失败', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }
})();
