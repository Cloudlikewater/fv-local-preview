// ==UserScript==
// @name         ChromeXt 接口探测器 v3（scripts 深挖·含可逆活性测试）
// @namespace    com.example.fv
// @version      3.0
// @description  深挖 ChromeXt.scripts：脚本对象完整结构、属性描述符、原型链、活性测试（push 后立即还原）、FV 命令函数探测。除活性测试外全程只读。
// @match        *://*/*
// @match        file:///*
// @run-at       document-start
// @grant        GM.ChromeXt
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_info
// ==/UserScript==

(function () {
  'use strict';

  if (window.__cxProbe3Loaded) return;
  window.__cxProbe3Loaded = true;

  var R = { env: {}, chromeXt: null, scripts: null, descriptor: null, proto: null, liveness: null, fv: null, gmScope: null, text: '' };

  /* ---------------- 通用工具 ---------------- */
  function tn(v) {
    try {
      if (v === null) return 'null';
      var ty = typeof v;
      if (ty === 'undefined') return 'undefined';
      if (ty === 'string') return 'string:' + v.slice(0, 60);
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

  function safeKeys(obj) {
    var out = [];
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return out;
    try {
      Object.getOwnPropertyNames(obj).forEach(function (n) {
        var v; try { v = obj[n]; } catch (e) { v = undefined; }
        out.push({ k: n, v: tn(v), fn: typeof v === 'function' });
      });
    } catch (e) {}
    try {
      Object.getOwnPropertySymbols(obj).forEach(function (s) {
        var v; try { v = obj[s]; } catch (e) { v = undefined; }
        out.push({ k: 'Symbol(' + String(s).replace(/^Symbol\(|\)$/g, '') + ')', v: tn(v), fn: typeof v === 'function' });
      });
    } catch (e) {}
    return out;
  }

  /* 深挖：带循环检测 + 深度限制，返回文本行数组 */
  function deepDump(obj, path, depth, seen, lines, maxDepth, maxItems) {
    if (depth > maxDepth) { lines.push(path + ' = ...(深度限制)'); return; }
    if (obj === null || obj === undefined) { lines.push(path + ' = ' + tn(obj)); return; }
    var ty = typeof obj;
    if (ty !== 'object' && ty !== 'function') { lines.push(path + ' = ' + tn(obj)); return; }
    if (seen.has(obj)) { lines.push(path + ' = <循环引用>'); return; }
    seen.add(obj);

    lines.push(path + '  [' + tn(obj) + ']');
    var ks = safeKeys(obj);
    if (!ks.length) lines.push(path + '.# = (无自有键)');
    ks.slice(0, maxItems).forEach(function (k) {
      var child;
      try { child = obj[k.k]; } catch (e) { child = undefined; }
      var childPath = path + '.' + k.k;
      if (child === null || child === undefined) {
        lines.push(childPath + ' = ' + tn(child));
      } else if (typeof child === 'function') {
        lines.push(childPath + ' = ƒ function');
      } else if (typeof child === 'object') {
        if (Array.isArray(child)) {
          lines.push(childPath + ' = array(' + child.length + ')');
          child.slice(0, 10).forEach(function (it, i) {
            if (it !== null && typeof it === 'object') {
              deepDump(it, childPath + '[' + i + ']', depth + 1, seen, lines, maxDepth, maxItems);
            } else {
              lines.push(childPath + '[' + i + '] = ' + tn(it));
            }
          });
          if (child.length > 10) lines.push(childPath + '... (共' + child.length + '项)');
        } else {
          deepDump(child, childPath, depth + 1, seen, lines, maxDepth, maxItems);
        }
      } else {
        lines.push(childPath + ' = ' + tn(child));
      }
    });
    if (ks.length > maxItems) lines.push(path + '... (共' + ks.length + '个键)');
    seen.delete(obj);
  }

  /* ---------------- 1. 环境 ---------------- */
  function probeEnv() {
    var e = {};
    try { e.href = location.href; } catch (err) { e.href = '?'; }
    try { e.hostname = location.hostname; } catch (err) { e.hostname = '?'; }
    try { e.protocol = location.protocol; } catch (err) { e.protocol = '?'; }
    e.isErrorPage = String(e.protocol).toLowerCase() === 'chrome-error:' || /chromewebdata|neterror/i.test(e.href);
    try {
      if (!e.isErrorPage) {
        var tx = (document.documentElement && document.documentElement.innerText) ||
                 (document.body && document.body.innerText) ||
                 (document.body && document.body.textContent) || '';
        if (/ERR_[A-Z_]+/.test(tx)) e.isErrorPage = true;
      }
    } catch (err) {}
    e.time = new Date().toLocaleString();
    e.ua = navigator.userAgent;
    return e;
  }

  /* ---------------- 2. 拿到 ChromeXt 对象 ---------------- */
  function getChromeXt() {
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

  /* ---------------- 3. scripts 结构 ---------------- */
  function probeScripts(cxObj, cxSrc) {
    var out = { src: cxSrc, cxKeys: null, scriptCount: null, items: [] };
    out.cxKeys = safeKeys(cxObj);

    var scripts = null;
    try { scripts = cxObj.scripts; } catch (e) { out.error = String(e); }
    if (!Array.isArray(scripts)) {
      out.scriptCount = '非数组: ' + tn(scripts);
      return out;
    }
    out.scriptCount = scripts.length;

    // 逐个脚本对象深挖
    scripts.forEach(function (s, i) {
      var lines = [];
      deepDump(s, 'scripts[' + i + ']', 0, new WeakSet(), lines, 3, 40);
      out.items.push({ index: i, type: tn(s), dump: lines });
    });
    return out;
  }

  /* ---------------- 4. 属性描述符 ---------------- */
  function probeDescriptor(cxObj) {
    var d = {};
    ['scripts', 'commands', 'cspRules', 'filters'].forEach(function (name) {
      var info = { name: name };
      try {
        var own = Object.getOwnPropertyDescriptor(cxObj, name);
        if (own) {
          info.own = true;
          info.hasGet = !!own.get;
          info.hasSet = !!own.set;
          info.writable = own.writable;
          info.enumerable = own.enumerable;
          info.configurable = own.configurable;
          info.valueType = tn(own.value);
        } else {
          info.own = false;
          // 可能在原型上
          var p = Object.getPrototypeOf(cxObj);
          var level = 0;
          while (p && level < 4) {
            var pd = Object.getOwnPropertyDescriptor(p, name);
            if (pd) {
              info.protoLevel = level;
              info.hasGet = !!pd.get;
              info.hasSet = !!pd.set;
              info.writable = pd.writable;
              break;
            }
            p = Object.getPrototypeOf(p);
            level++;
          }
        }
      } catch (e) { info.error = String(e); }
      d[name] = info;
    });
    return d;
  }

  /* ---------------- 5. 原型链 ---------------- */
  function probeProto(cxObj) {
    var chain = [];
    var p = cxObj;
    var level = 0;
    try {
      while (p && level < 6) {
        var isProto = level > 0;
        var keys = safeKeys(p);
        chain.push({
          level: level,
          type: tn(p),
          ctor: (p && p.constructor && p.constructor.name) ? p.constructor.name : '-',
          keys: keys.map(function (k) { return (k.fn ? 'ƒ ' : '') + k.k; })
        });
        p = Object.getPrototypeOf(p);
        level++;
      }
    } catch (e) { chain.push({ level: level, type: 'error: ' + String(e) }); }
    return chain;
  }

  /* ---------------- 6. 活性测试（可逆） ---------------- */
  function probeLiveness(cxObj) {
    var res = { done: false, note: '' };
    var scripts;
    try { scripts = cxObj.scripts; } catch (e) { res.note = '无法读取 scripts: ' + String(e); return res; }
    if (!Array.isArray(scripts)) { res.note = 'scripts 非数组，跳过'; return res; }

    var before = scripts.length;
    var marker = { __cxProbeMarker: true, name: '__PROBE_TEST__', code: '//probe', enabled: false };

    try {
      scripts.push(marker);
      res.pushOk = true;
    } catch (e) {
      res.pushOk = false;
      res.pushErr = String(e);
      res.note = 'push 抛错，可能是冻结数组或 getter 副本';
      return res;
    }

    // 重新从 cxObj 读一次，看是否反映出来
    var after;
    try { after = cxObj.scripts.length; } catch (e) { after = -1; }
    res.before = before;
    res.after = after;
    res.lengthChanged = (after === before + 1);
    res.isLive = res.lengthChanged;

    // 立刻还原（无论结果如何）
    try {
      var cur = cxObj.scripts;
      var idx = -1;
      for (var i = 0; i < cur.length; i++) {
        if (cur[i] && cur[i].__cxProbeMarker) { idx = i; break; }
      }
      if (idx >= 0) { cur.splice(idx, 1); res.restored = true; }
      else {
        // 可能 push 进了副本，原数组没变，无需还原
        res.restored = true;
        res.note += ' (标记未出现在原数组，判定为副本)';
      }
      var finalLen = cxObj.scripts.length;
      res.finalLength = finalLen;
      res.clean = (finalLen === before);
    } catch (e) {
      res.restored = false;
      res.restoreErr = String(e);
    }
    res.done = true;
    if (res.isLive) res.note += ' ★ scripts 是活引用，push 可改变真实脚本列表！';
    else res.note += ' scripts 很可能是 getter 返回的副本，push 无效。';
    return res;
  }

  /* ---------------- 7. FV 命令函数 ---------------- */
  function probeFV() {
    var out = { found: [], execInfo: null };
    try {
      Object.getOwnPropertyNames(window).forEach(function (n) {
        if (/fooview/i.test(n)) {
          var v; try { v = window[n]; } catch (e) { v = undefined; }
          var info = { name: n, type: tn(v) };
          if (v && typeof v === 'object') {
            info.keys = safeKeys(v).map(function (k) { return (k.fn ? 'ƒ ' : '') + k.k; });
            if (Array.isArray(v)) info.length = v.length;
          }
          out.found.push(info);
        }
      });
    } catch (e) { out.error = String(e); }

    // fooviewExecCmdFunc 专门看
    try {
      var fn = window.fooviewExecCmdFunc;
      if (typeof fn === 'function') {
        out.execInfo = { type: 'function', length: fn.length, name: fn.name };
      } else if (fn && typeof fn === 'object') {
        out.execInfo = { type: 'object', keys: safeKeys(fn).map(function (k) { return (k.fn ? 'ƒ ' : '') + k.k; }) };
      }
    } catch (e) {}
    return out;
  }

  /* ---------------- 8. GM 作用域实测 ---------------- */
  function probeGMScope() {
    var g = {};
    ['GM_setValue', 'GM_getValue', 'GM_listValues', 'GM_info'].forEach(function (name) {
      var info = { window: false, scope: 'undefined' };
      try { info.window = typeof window[name] === 'function'; } catch (e) {}
      try {
        // eslint-disable-next-line no-eval
        info.scope = eval('typeof ' + name);
      } catch (e) { info.scope = 'error'; }
      g[name] = info;
    });
    // 实测
    var K = '__cx3_test__', V = 'v_' + Date.now();
    g.test = {};
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(K, V);
        g.test.write = true;
        var back = (typeof GM_getValue === 'function') ? GM_getValue(K, null) : null;
        g.test.read = back !== null;
        g.test.match = back === V;
        if (typeof GM_listValues === 'function') {
          var lv = GM_listValues();
          g.test.listWorks = Array.isArray(lv);
          g.test.valueCount = Array.isArray(lv) ? lv.length : -1;
          g.test.keys = Array.isArray(lv) ? lv.slice(0, 30) : [];
        }
        try { eval('GM_deleteValue'); } catch (e) {}
      } else { g.test.err = 'GM_setValue 在作用域不可用'; }
    } catch (e) { g.test.err = String(e); }
    return g;
  }

  /* ---------------- 汇总 ---------------- */
  function collect() {
    R.env = probeEnv();
    var got = getChromeXt();
    if (!got) {
      R.chromeXt = null;
    } else {
      R.chromeXt = { src: got.src, keys: safeKeys(got.obj) };
      R.scripts = probeScripts(got.obj, got.src);
      R.descriptor = probeDescriptor(got.obj);
      R.proto = probeProto(got.obj);
      R.liveness = probeLiveness(got.obj);
    }
    R.fv = probeFV();
    R.gmScope = probeGMScope();
    R.text = buildText();
    return R;
  }

  window.__cxProbe3 = collect;

  /* ---------------- 文本报告 ---------------- */
  function buildText() {
    var L = [];
    L.push('======== ChromeXt 探测 v3（scripts 深挖）========');
    L.push('时间: ' + R.env.time);
    L.push('地址: ' + R.env.href);
    L.push('hostname: ' + R.env.hostname + ' | protocol: ' + R.env.protocol + ' | 错误页: ' + R.env.isErrorPage);
    L.push('UA: ' + R.env.ua);
    L.push('');

    L.push('【1. ChromeXt 对象】');
    if (!R.chromeXt) L.push('  ⚠️ 未找到 ChromeXt 对象');
    else {
      L.push('  来源: ' + R.chromeXt.src);
      L.push('  顶层成员:');
      R.chromeXt.keys.forEach(function (k) { L.push('    ' + (k.fn ? 'ƒ ' : '  ') + k.k + ' = ' + k.v); });
    }
    L.push('');

    L.push('【2. scripts 数组结构】');
    if (!R.scripts) L.push('  (无)');
    else if (R.scripts.error) L.push('  错误: ' + R.scripts.error);
    else {
      L.push('  数量: ' + R.scripts.scriptCount);
      R.scripts.items.forEach(function (it) {
        L.push('  --- ' + 'scripts[' + it.index + ']  [' + it.type + ']');
        it.dump.forEach(function (l) { L.push('    ' + l); });
      });
    }
    L.push('');

    L.push('【3. 属性描述符（关键：判断能否写入）】');
    if (R.descriptor) {
      Object.keys(R.descriptor).forEach(function (n) {
        var d = R.descriptor[n];
        L.push('  ' + n + ':');
        L.push('    自有属性: ' + d.own + (d.protoLevel !== undefined ? ' (原型第' + d.protoLevel + '层)' : ''));
        L.push('    getter: ' + d.hasGet + ' | setter: ' + d.hasSet + ' | writable: ' + d.writable);
        if (d.valueType) L.push('    value 类型: ' + d.valueType);
        if (d.error) L.push('    错误: ' + d.error);
      });
    } else L.push('  (无)');
    L.push('');

    L.push('【4. 原型链】');
    if (R.proto) {
      R.proto.forEach(function (p) {
        L.push('  [层' + p.level + '] ' + p.type + ' ctor=' + p.ctor);
        if (p.keys && p.keys.length) L.push('     成员: ' + p.keys.join(', '));
      });
    } else L.push('  (无)');
    L.push('');

    L.push('【5. ★ 活性测试（已自动还原）★】');
    if (!R.liveness) L.push('  (无)');
    else {
      var lv = R.liveness;
      L.push('  push 是否成功: ' + lv.pushOk + (lv.pushErr ? ' (' + lv.pushErr + ')' : ''));
      L.push('  push 前长度: ' + lv.before + ' → push 后重新读取: ' + lv.after);
      L.push('  长度变化: ' + lv.lengthChanged);
      L.push('  是否活引用: ' + lv.isLive);
      L.push('  已还原: ' + lv.restored + ' | 最终长度: ' + lv.finalLength);
      L.push('  结论: ' + lv.note);
    }
    L.push('');

    L.push('【6. FV 命令函数】');
    if (R.fv) {
      if (R.fv.error) L.push('  错误: ' + R.fv.error);
      if (R.fv.found && R.fv.found.length) {
        L.push('  window 上的 fooview* 对象:');
        R.fv.found.forEach(function (f) {
          L.push('    ' + f.name + ' = ' + f.type + (f.length !== undefined ? ' (长度' + f.length + ')' : ''));
          if (f.keys && f.keys.length) L.push('       成员: ' + f.keys.slice(0, 40).join(', '));
        });
      } else L.push('  未找到 fooview* 对象');
      if (R.fv.execInfo) L.push('  fooviewExecCmdFunc: ' + JSON.stringify(R.fv.execInfo));
    }
    L.push('');

    L.push('【7. GM 作用域实测】');
    if (R.gmScope) {
      Object.keys(R.gmScope).forEach(function (k) {
        if (k === 'test') return;
        var it = R.gmScope[k];
        L.push('  ' + k + ': window上=' + it.window + ' | 脚本作用域=' + it.scope);
      });
      var t = R.gmScope.test || {};
      L.push('  写入测试: 写=' + t.write + ' 读=' + t.read + ' 一致=' + t.match + (t.err ? ' 错误=' + t.err : ''));
      if (t.listWorks) {
        L.push('  GM_listValues 可用，共 ' + t.valueCount + ' 个键:');
        (t.keys || []).forEach(function (k) { L.push('    - ' + k); });
      }
    }
    L.push('');
    L.push('======== 结束 ========');
    return L.join('\n');
  }

  /* ---------------- UI ---------------- */
  function buildUI() {
    var st = document.createElement('style');
    st.textContent =
      '#cx3-fab{position:fixed;right:0;top:22%;transform:translateY(-50%);z-index:2147483647;width:34px;height:56px;' +
      'background:#8e44ad;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;' +
      'font:bold 12px system-ui;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:.93}' +
      '#cx3-panel{position:fixed;inset:0;z-index:2147483647;background:#fff;display:none;flex-direction:column;font:13px/1.6 system-ui}' +
      '#cx3-head{padding:10px 12px;background:#f5f6fa;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:none}' +
      '#cx3-head .t{font-weight:700;color:#8e44ad}' +
      '#cx3-head button{padding:6px 12px;border:0;border-radius:6px;background:#8e44ad;color:#fff;font:600 12px system-ui;cursor:pointer}' +
      '#cx3-head button.g{background:#eef2f5;color:#333;border:1px solid #ccd0d6}' +
      '#cx3-body{flex:1;overflow:auto;padding:10px;white-space:pre-wrap;word-break:break-all;font:11px/1.7 Consolas,monospace;color:#333}' +
      '#cx3-body .life{color:#c0392b;font-weight:700}';
    document.head.appendChild(st);

    var fab = document.createElement('div');
    fab.id = 'cx3-fab'; fab.textContent = 'CX3'; fab.title = 'ChromeXt scripts 深挖';

    var panel = document.createElement('div');
    panel.id = 'cx3-panel';
    panel.innerHTML =
      '<div id="cx3-head">' +
        '<span class="t">🔬 ChromeXt scripts 深挖 v3</span>' +
        '<button id="cx3-copy">📋 复制全部</button>' +
        '<button id="cx3-again">🔄 重新探测</button>' +
        '<button class="g" id="cx3-close">✕ 关闭</button>' +
      '</div>' +
      '<div id="cx3-body"></div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var body = panel.querySelector('#cx3-body');
    function paint() {
      var txt = buildText()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(是否活引用: true)/g, '<span class="life">$1</span>')
        .replace(/(活引用，push 可改变真实脚本列表！)/g, '<span class="life">$1</span>');
      body.innerHTML = txt;
    }
    paint();

    fab.onclick = function () {
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    };
    panel.querySelector('#cx3-close').onclick = function () { panel.style.display = 'none'; };
    panel.querySelector('#cx3-again').onclick = function () { collect(); paint(); alert('已重新探测'); };
    panel.querySelector('#cx3-copy').onclick = function () {
      var text = buildText();
      function fb() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          alert(ok ? '已复制到剪贴板' : '复制失败，请长按手动复制');
        } catch (e) { alert('复制失败'); }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { alert('已复制'); }, fb);
        } else fb();
      } catch (e) { fb(); }
    };
  }

  function boot() {
    try {
      if (!document.body) { document.documentElement.appendChild(document.createElement('body')); }
      collect();
      buildUI();
      console.log('[CX探测v3] 完成，见 window.__cxProbe3() 或点右侧 CX3');
      if (R.liveness) {
        console.log('[CX探测v3] 活性测试: isLive=' + R.liveness.isLive + ' | ' + R.liveness.note);
      }
    } catch (e) {
      console.log('[CX探测v3] 失败', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
  } else {
    setTimeout(boot, 300);
  }
})();
