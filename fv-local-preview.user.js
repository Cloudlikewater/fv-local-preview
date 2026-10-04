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

  /* 捕获 ChromeXt.dispatch 引用 */
  try {
    window.__fvCX = (typeof ChromeXt !== 'undefined' && ChromeXt && typeof ChromeXt.dispatch === 'function')
      ? ChromeXt : null;
  } catch (e) { window.__fvCX = null; }

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

  function parseMatches(code) {
    var out = [], re = /^\s*\/\/\s*@match\s+(\S+)\s*$/gm, m;
    while ((m = re.exec(code)) !== null) out.push(m[1]);
    return out.length ? out : ['*://*/*'];
  }
  function patternHit(pattern, url) {
    if (pattern === '*' || pattern === '*://*/*') return true;
    var p = String(pattern).replace(/[.+^${}()|[\]\\?]/g, function (c) { return '\\' + c; });
    p = p.replace(/\*/g, '[\\s\\S]*');
    try { return new RegExp('^' + p + '$', 'i').test(url); } catch (e) { return false; }
  }
  var decision = shouldBuildPreview();

  if (decision === 'no') {
    // 普通网页：不构建、不改动，直接退出
    return;
  }

  if (decision === 'maybe') {
    // 错误页刚注入、文本还没渲染：轮询等待确认归属，最多约 3 秒
    var probe = [50, 100, 200, 400, 800, 1500, 3000], pi = 0;
    (function nextProbe() {
      var d2 = shouldBuildPreview();
      if (d2 === 'yes') { startPreview(); return; }
      if (d2 === 'no') { return; }
      if (pi < probe.length) { setTimeout(nextProbe, probe[pi++]); }
      // 超时仍未确认 → 放弃，不改动页面
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

    var lastText = '', lastName = '', lastKind = '', lastFile = null, lastBlob = null;
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
    function getOvSrc() {
      var p = document.getElementById('fv-ov-src');
      if (!p) {
        p = document.createElement('pre');
        p.id = 'fv-ov-src';
        p.style.cssText = 'flex:1;overflow:auto;margin:0;padding:12px;background:#fff;color:#333;' +
          'font:12px/1.6 Consolas,monospace;white-space:pre-wrap;word-break:break-all;' +
          '-webkit-user-select:text;user-select:text';
        overlay.appendChild(p);
      }
      return p;
    }
    function showOvSrc(on) { getOvSrc().style.display = on ? 'block' : 'none'; ovFrame.style.display = on ? 'none' : 'block'; }
    function openFull(html, blobUrl, tip, dlName) {
      hideAll();
      overlay.style.display = 'flex';
      ovTip.style.display = tip ? 'block' : 'none';
      ovTip.textContent = tip || '';
      showOvSrc(false);
      if (blobUrl) {
        ovDl.style.display = dlName ? 'inline-block' : 'none';
        if (dlName) { ovDl.setAttribute('data-name', dlName); }
        try { ovFrame.removeAttribute('srcdoc'); } catch (e) {}
        ovFrame.src = blobUrl;
      } else {
        ovDl.style.display = 'none';
        try { ovFrame.removeAttribute('src'); } catch (e) {}
        ovFrame.srcdoc = html || '';
      }
    }
    function closeFull() {
      overlay.style.display = 'none';
      try { ovFrame.removeAttribute('srcdoc'); } catch (e) {}
      try { ovFrame.src = 'about:blank'; } catch (e) {}
      // 若地址被改成 .user.js 结尾，退出时还原，避免残留
      try {
        if (location.href.indexOf('.user.js') >= 0) history.replaceState(null, '', '/');
      } catch (e) {}
    }
    function backBtn() {
      return '<button onclick="(window.parent&&window.parent.__fvClose)?window.parent.__fvClose():history.back()" style="position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;font:14px system-ui;cursor:pointer">← 返回</button>';
    }
    function wrapDoc(body, title) {
      return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        esc(title || 'FV预览') + '</title><style>html,body{margin:0}body{background:#fff;font:14px/1.6 system-ui;padding:12px}</style></head><body>' +
        backBtn() + body + '</body></html>';
    }
    window.__fvClose = closeFull;

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
      if (lastKind === 'md') {
        openFull(wrapDoc('<article style="max-width:760px;margin:0 auto">' + mdToHtml(lastText) + '</article>', lastName));
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
      if (e === 'js' || e === 'mjs') {
        var safe = String(lastText).replace(/<\/script>/gi, '<\\/script>');
        openFull('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;font:14px system-ui;padding:16px}</style></head><body>' +
          backBtn() + '<div id="fv-app"></div>' +
          S1 + 'try{' + safe + '}catch(err){document.body.insertAdjacentHTML("beforeend","<pre style=color:red>Error: "+err.message+"</pre>")}' + S2 +
          '</body></html>');
        msg('已全屏运行 JS');
        return;
      }
      openFull(wrapDoc(lastText, lastName));
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
    var ST = window.__fvStore;   // 外层挂的存储层（仅用于 GitHub 配置等小数据）

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
    function installNow() {
      var meta = readDlgMeta();
      if (!meta.name) { msg('脚本名不能为空'); return; }
      if (!meta.matches.length) { msg('至少填一条 @match'); return; }
      var code = composeCode(meta);
      installCode = code;
      installName = meta.name + '.user.js';
      var CX = window.__fvCX;
      if (!CX || typeof CX.dispatch !== 'function') {
        msg('未拿到 ChromeXt.dispatch，请确认脚本头含 @grant GM.ChromeXt 且已重新导入');
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
    /* ☁️ 一键传 GitHub：直接打开 GitHub「新建文件」页并预填文件名与内容。
       提交后拿到 raw 链接，回 fv 打开即触发 ChromeXt 安装提示 ——
       这是原生安装的快捷通道，把原本十来步压到「点提交 + 复制链接」。 */
    function ghUpload() {
      if (!lastText) { msg('请先选择 js 文件'); return; }
      var code = buildUserScript(lastText, lastName);
      var name = (String(lastName).replace(/\.(js|mjs)$/i, '') || 'script') + '.user.js';

      var repo = '';
      var branch = '';
      try {
        repo = ST.get('fv_gh_repo', '') || '';
        branch = ST.get('fv_gh_branch', 'main') || 'main';
      } catch (e) {}

      if (!repo) {
        try {
          repo = prompt('输入 GitHub 仓库（格式：用户名/仓库名）', '') || '';
        } catch (e) { repo = ''; }
        repo = String(repo).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
        if (!repo) { msg('未填仓库，已取消'); return; }
        try {
          ST.set('fv_gh_repo', repo);
          ST.set('fv_gh_branch', branch || 'main');
        } catch (e) {}
      }
      if (!branch) branch = 'main';

      var url = 'https://github.com/' + repo + '/new/' + branch +
        '?filename=' + encodeURIComponent(name) +
        '&value=' + encodeURIComponent(code);

      if (url.length > 8000) {
        msg('脚本较长（' + code.length + ' 字符），URL 可能被截断，建议改用脚本库');
      } else {
        msg('正在打开 GitHub 新建文件页（内容已预填）');
      }
      setTimeout(function () {
        try { location.href = url; } catch (e) {
          try { window.open(url, '_blank'); } catch (e2) { msg('打开失败，请手动访问 github.com'); }
        }
      }, 400);
    }
    function ghReset() {
      try {
        ST.remove('fv_gh_repo');
        ST.remove('fv_gh_branch');
        msg('已清除仓库配置，下次将重新询问');
      } catch (e) { msg('清除失败'); }
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

    /* ★★ 分享安装（最有希望的一条）：
       ChromeXt 官方 README 明确写了：The application ChromeXt is able to
       received shared texts / open JavaScript files to install them as UserScripts.
       网页可用 Web Share API Level 2 把 .user.js 文件直接分享给 ChromeXt，
       由 ChromeXt 自己完成安装 —— 这是唯一「网页 → App」的真实通道，
       不需要文件管理器、不需要长按菜单、不需要真实导航。 */
    function shareInstall() {
      if (!lastText) { msg('请先选择 js 文件'); return; }
      installCode = buildUserScript(lastText, lastName);
      installName = (String(lastName).replace(/\.(js|mjs)$/i, '') || 'fv-script') + '.user.js';

      var nav = navigator;
      if (!nav.share || !nav.canShare) {
        msg('当前浏览器不支持 Web Share（无法分享文件），请用复制方式');
        return;
      }
      var file;
      try {
        file = new File([installCode], installName, { type: 'text/javascript' });
      } catch (e) {
        try { file = new Blob([installCode], { type: 'text/javascript' }); } catch (e2) { file = null; }
      }
      if (!file) { msg('无法构造文件，请用复制方式'); return; }

      var payload = { files: [file], title: installName, text: installName };
      if (!nav.canShare(payload)) {
        payload = { files: [file] };
        if (!nav.canShare(payload)) {
          msg('系统不允许分享此文件类型，请用复制方式');
          return;
        }
      }
      msg('正在唤起分享面板，请选择 ChromeXt');
      nav.share(payload).then(function () {
        msg('已分享，若 ChromeXt 打开则按其提示安装');
      }).catch(function (err) {
        if (err && err.name === 'AbortError') msg('已取消分享');
        else msg('分享失败：' + (err && err.message || err) + '，请用复制方式');
      });
    }

    /* ★ 直接安装（无确认）—— 复用同一条真安装通道 */
    function installViaChromeXt() {
      if (!lastText) { msg('请先选择 js 文件'); return; }
      var meta = autoMeta();
      var code = composeCode(meta);
      installCode = code;
      installName = meta.name + '.user.js';
      var CX = window.__fvCX;
      if (!CX || typeof CX.dispatch !== 'function') {
        msg('未拿到 ChromeXt.dispatch，请确认脚本头含 @grant GM.ChromeXt 且已重新导入');
        return;
      }
      try {
        CX.dispatch('installScript', code);
        msg('已安装：' + meta.name + '（@match ' + meta.matches.join(', ') + '）');
      } catch (e) {
        msg('安装失败：' + e.message);
      }
    }

    /* 主方案：把当前页变成「脚本源码页」，再用 ChromeXt 的 Install UserScript 菜单安装。
       不需要导航，因此不受 data:/blob: 顶层导航限制，也不会白屏。 */
    function renderInstallSourcePage() {
      if (!installCode) { msg('请先点「安装脚本」生成代码'); return; }
      hideAll();
      overlay.style.display = 'flex';
      ovTip.style.display = 'block';
      ovTip.textContent = '当前页已变成脚本源码页。请长按页面空白处 → ChromeXt 菜单 → ' +
        'Install UserScript（若菜单项是「编辑」，可先在页面里改好再装）。装完点「✕ 退出全屏」返回。';
      ovDl.style.display = 'none';
      showOvSrc(true);
      getOvSrc().textContent = installCode;
      msg('已生成源码页，请长按页面使用 ChromeXt 菜单安装');
    }

    /* ★ 跳转 Install UserScript：用 history.pushState 把地址栏改成 .user.js 结尾，
       页面不刷新（因此不会触发 DNS 失败、不会白屏）。ChromeXt 靠 onUpdateUrl 监听地址变化，
       历史记录变更同样会触发，它看到 .user.js 结尾就会弹安装提示；
       同时页面已渲染成脚本源码供其读取。pushState 不可用时回退到改 hash。 */
    function pushStateInstall() {
      if (!lastText) { msg('请先选择 js 文件'); return; }
      installCode = buildUserScript(lastText, lastName);
      installName = (String(lastName).replace(/\.(js|mjs)$/i, '') || 'fv-script') + '.user.js';

      var changed = false;
      try {
        history.pushState(null, '', '/' + encodeURIComponent(installName));
        changed = location.href.indexOf('.user.js') >= 0;
      } catch (e) { changed = false; }
      if (!changed) {
        try {
          location.hash = encodeURIComponent(installName);
          changed = location.href.indexOf('.user.js') >= 0;
        } catch (e) { changed = false; }
      }

      renderInstallSourcePage();
      if (changed) {
        ovTip.textContent = '地址已改为 .user.js 结尾（页面未刷新）。若 ChromeXt 弹出安装提示，确认即可；' +
          '装完点右上角「✕ 退出全屏」。没弹提示就长按页面空白处用 ChromeXt 菜单安装。';
        msg('地址已切换为 .user.js，等待 ChromeXt 安装提示');
      } else {
        msg('无法修改地址，请长按源码页用 ChromeXt 菜单安装');
      }
    }

    /* 兜底：blob 导航（多数情况无效，仅保留） */
    function tryDirectInstall() {
      if (!installCode) { msg('请先点「安装脚本」生成代码'); return; }
      var nav = null;
      try {
        var b = new Blob([installCode], { type: 'text/plain;charset=utf-8' });
        nav = URL.createObjectURL(b);
      } catch (e) { nav = null; }
      if (!nav) { msg('当前环境无法构造链接，请用源码页或下载方式'); return; }
      var target = nav + '#' + encodeURIComponent(installName || 'script.user.js');
      msg('已尝试跳转（若没反应属正常，请用「源码页」或下载方式）');
      setTimeout(function () {
        try { location.href = target; } catch (e) {
          try { var w2 = window.open(target, '_blank'); if (w2) { msg('已尝试新窗口'); } } catch (e2) { msg('跳转被拦截'); }
        }
      }, 300);
    }

    /* 复制 file:// 路径：给能正常渲染 file:// 的浏览器（如打了补丁的 Chrome）用，
       在地址栏打开这个 URL，ChromeXt 会因 .user.js 后缀弹安装提示。 */
    function copyFilePath() {
      if (!installName) { msg('请先点「安装脚本」生成'); return; }
      var p = 'file:///sdcard/Download/' + installName;
      copyText(p, function (ok) { msg(ok ? '已复制 ' + p : '复制失败，请手动记下：' + p); });
    }

    /* 下载已移除：fv 无法用 ChromeXt 打开下载文件，且 file:// 不弹安装提示 */

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
        { t: '🖥️ 全屏打开', f: fullOpen },
        { t: '☁️ 一键传 GitHub（备用）', f: ghUpload },
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
    $('fv-inst-btn').onclick = openInstallDialog;
    $('fv-copy').onclick = function () {
      copyText(installCode, function (ok) { msg(ok ? '已复制到剪贴板' : '复制失败，请长按代码手动复制'); });
    };
    $('fv-srcpage').onclick = renderInstallSourcePage;
    $('fv-mgr2').onclick = openManager;
    $('fv-inst-close').onclick = function () { instPanel.style.display = 'none'; };
    $('fv-dlg-install').onclick = installNow;
    $('fv-dlg-refresh').onclick = refreshDlgCode;
    $('fv-dlg-close').onclick = closeInstallDialog;
    $('fv-gh').onclick = ghUpload;
    $('fv-gh-reset').onclick = ghReset;
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
    '#fv-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:9px 18px;border-radius:20px;font-size:13px;z-index:2147483645;opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:90%}' +
    '#fv-toast.on{opacity:1}' +
    '#fv-fab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483646;width:32px;height:50px;background:#2f7d63;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;font:bold 12px system-ui;cursor:pointer;box-shadow:0 8px 32px 0 rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.2);border-right:none;transition:width .3s,opacity .3s;opacity:.92}' +
    '#fv-fab:active{width:45px;opacity:1}' +
    '#fv-mask{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.4);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center}' +
    '#fv-mask.on{display:flex}' +
    '#fv-card{width:88%;max-width:420px;max-height:78vh;overflow:auto;background:rgba(255,255,255,.95);border:1px solid rgba(255,255,255,.6);border-radius:24px;padding:16px;box-shadow:0 8px 32px 0 rgba(0,0,0,.2);display:flex;flex-direction:column;gap:10px;animation:pop .3s cubic-bezier(.34,1.56,.64,1)}' +
    '@keyframes pop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}' +
    '#fv-card .ct{font-weight:700;color:#2f7d63;text-align:center;font-size:16px;padding:4px 0}' +
    '.mi{padding:14px;background:rgba(255,255,255,.85);color:#333;border:1px solid rgba(0,0,0,.08);border-radius:14px;font:600 15px system-ui;text-align:center;cursor:pointer;transition:all .2s}' +
    '.mi:hover{background:#2f7d63;color:#fff}' +
    '.mi:active{transform:scale(.97)}' +
    '.mi.close{background:#fdecec;color:#c0392b}' +
    '#fv-inst{position:fixed;inset:0;z-index:2147483647;background:#f5f6fa;display:none;flex-direction:column}' +
    '#fv-inst .ih,#fv-overlay .oh{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;box-shadow:0 2px 6px rgba(0,0,0,.04);flex:none}' +
    '#fv-inst .tip{padding:8px 12px;color:#666;font-size:12px;background:#fffbe6;border-bottom:1px solid #f0e6c0;line-height:1.7}' +
    '#fv-inst-code{flex:1;overflow:auto;margin:10px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-all;font:12px/1.6 Consolas,monospace;color:#333;-webkit-user-select:text;user-select:text}' +
    '#fv-overlay{position:fixed;inset:0;z-index:2147483647;background:#fff;display:none;flex-direction:column}' +
    '#fv-ov-tip{display:none;padding:8px 12px;background:#fff7e6;color:#8a6d3b;font-size:12px;border-bottom:1px solid #f0e0b0}' +
    '#fv-ov-frame{flex:1;width:100%;border:0;background:#fff}' +
    '#fv-dlg{position:fixed;inset:0;z-index:2147483647;background:#f5f6fa;display:none;flex-direction:column}' +
    '#fv-dlg .ih{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;box-shadow:0 2px 6px rgba(0,0,0,.04);flex:none}' +
    '#fv-dlg-tip{padding:8px 12px;color:#8a6d3b;font-size:12px;background:#fffbe6;border-bottom:1px solid #f0e6c0;line-height:1.7}' +
    '@media(max-width:480px){.head{gap:4px}.pick{min-width:100px}.btn{padding:6px 9px}}';

  var BODY =
    '<div class="head">' +
      '<span class="title">📂 FV 本地预览</span>' +
      '<span class="pick" id="fv-pick"><span id="fv-name">📁 选择文件</span>' +
        '<input type="file" id="fv-file" accept=".html,.htm,.xhtml,.xht,.xml,.xsl,.xslt,.svg,.json,.md,.markdown,.js,.mjs,.user.js,.css,.csv,.tsv,.txt,.log,.pdf,.mhtml,.mht,.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp3,.wav,.ogg,.m4a,.mp4,.webm">' +
      '</span>' +
      '<button class="btn" id="fv-inst-btn">⚡ 安装脚本</button>' +
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
        '<button class="btn sec" id="fv-srcpage">📄 源码页查看</button>' +
        '<button class="btn sec" id="fv-gh">☁️ 一键传 GitHub</button>' +
        '<button class="btn ghost" id="fv-gh-reset">🔄 换仓库</button>' +
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
    build();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { build(); });
    }
    window.addEventListener('load', function () { build(); });
    schedule([0, 30, 80, 150, 300, 600, 1000, 2000]);
  }

  startPreview();

  window.__fvFixedLoaded = true;
})();
