// ==UserScript==
// @name         FV 本地文件预览器（固定入口·安装脚本版）
// @namespace    com.example.fv
// @version      5.0
// @description  固定入口 https://fv-local-preview.invalid/ ；支持 html/json/md/js/pdf/mhtml/mht/svg/xml/xsl/xslt/xhtml/xht/txt 预览、全屏打开，并可将 js 生成/导出为 ChromeXt 用户脚本
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (typeof window.__fvFixedLoaded === 'undefined') { window.__fvFixedLoaded = false; }

  /* ============================================================
     工具页脚本（普通函数写法，最后用 toString 注入，避免双重转义）
     注意：函数体内不能出现字面的 </script>
  ============================================================ */
  function toolScript() {
    var $ = function (i) { return document.getElementById(i); };
    var fileInput = $('fv-file'), pick = $('fv-name'), frame = $('fv-frame'),
        preBox = $('fv-pre'), mdBox = $('fv-md'), toast = $('fv-toast'),
        fab = $('fv-fab'), mask = $('fv-mask'), card = $('fv-card');

    var lastText = '', lastName = '', lastKind = '', lastBlob = null;
    var S1 = '<' + 'script>', S2 = '<' + '/script>';

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
    function hideAll() {
      frame.style.display = 'none';
      preBox.style.display = 'none';
      mdBox.style.display = 'none';
    }
    function readFile(f) {
      return new Promise(function (res, rej) {
        if (f.text) { f.text().then(res).catch(rej); return; }
        var r = new FileReader();
        r.onload = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
        r.readAsText(f);
      });
    }
    function ext() {
      var a = lastName.split('.');
      return a.length > 1 ? a.pop().toLowerCase() : '';
    }
    function showFrame() { hideAll(); frame.style.display = 'block'; frame.removeAttribute('sandbox'); }
    function showPre(html) { hideAll(); preBox.style.display = 'block'; preBox.innerHTML = html; }
    function showMd(html) { hideAll(); mdBox.style.display = 'block'; mdBox.innerHTML = html; }

    /* ---------- HTML / XML / SVG / XSL ---------- */
    function renderHtml(t) { lastKind = 'html'; showFrame(); frame.srcdoc = t; msg('已打开：' + lastName); }

    /* ---------- JSON ---------- */
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

    /* ---------- Markdown ---------- */
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

    /* ---------- 代码高亮 ---------- */
    function codeHtml(t) {
      var s = esc(t);
      s = s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="cc">$1</span>');
      s = s.replace(/(&quot;[^&]*?&quot;|'[^']*?'|`[^`]*?`)/g, '<span class="cs">$1</span>');
      s = s.replace(/\b(const|let|var|function|return|if|else|for|while|new|class|async|await|import|export|try|catch)\b/g, '<span class="ck">$1</span>');
      s = s.replace(/\b(true|false|null|undefined)\b/g, '<span class="cn">$1</span>');
      return s;
    }
    function renderCode(t) { lastKind = 'code'; showPre(codeHtml(t)); msg('已高亮：' + lastName + '，可点菜单安装为脚本'); }

    /* ---------- PDF / MHTML ---------- */
    function renderBlob(f) {
      lastKind = 'blob';
      if (lastBlob) { URL.revokeObjectURL(lastBlob); }
      lastBlob = URL.createObjectURL(f);
      showFrame(); frame.src = lastBlob;
      msg('已打开：' + f.name);
    }

    /* ---------- 路由 ---------- */
    function route(f, t) {
      var e = ext(), tr = (t || '').trim();
      if (e === 'pdf') { renderBlob(f); return; }
      if (e === 'mhtml' || e === 'mht') { renderBlob(f); return; }
      if (e === 'svg' || e === 'xml' || e === 'xsl' || e === 'xslt' ||
          e === 'xhtml' || e === 'xht' || e === 'html' || e === 'htm') { renderHtml(t); return; }
      if (e === 'json' || /^\s*[[{]/.test(tr)) { renderJson(t); return; }
      if (e === 'md' || e === 'markdown') { renderMd(t); return; }
      if (e === 'js' || e === 'mjs' || /^\s*(const|let|var|function|class|async|import|export)\s/.test(tr)) { renderCode(t); return; }
      if (/^\s*<(!DOCTYPE|html|\?xml)/i.test(tr)) { renderHtml(t); return; }
      renderCode(t);
    }

    /* ---------- 全屏 ---------- */
    function backBtn() {
      return '<button onclick="history.length>1?history.back():void 0" style="position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;font:14px system-ui;cursor:pointer">← 返回</button>';
    }
    function wrapDoc(body, title) {
      return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
        esc(title || 'FV预览') + '</title><style>body{background:#fff;font:14px/1.6 system-ui;padding:10px}</style></head><body>' +
        backBtn() + body + '</body></html>';
    }
    function openData(html) {
      var u = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      var w = window.open(u, '_blank');
      if (!w) { msg('弹窗被拦截，已在本页 iframe 打开'); showFrame(); frame.srcdoc = html; }
    }
    function fullOpen() {
      if (!lastText && !lastBlob) { msg('请先选择文件'); return; }
      var e = ext();
      if (lastKind === 'blob' && lastBlob) {
        var w = window.open(lastBlob, '_blank');
        if (!w) msg('弹窗被拦截');
        return;
      }
      if (lastKind === 'md') {
        openData(wrapDoc('<article style="max-width:760px;margin:0 auto">' + mdToHtml(lastText) + '</article>', lastName));
        return;
      }
      if (lastKind === 'json') {
        var o;
        try { o = JSON.stringify(JSON.parse(lastText), null, 2); } catch (err) { o = lastText; }
        openData(wrapDoc('<pre style="white-space:pre-wrap;font:13px Consolas,monospace">' + esc(o) + '</pre>', lastName));
        return;
      }
      if (e === 'js' || e === 'mjs') {
        var safe = String(lastText).replace(/<\/script>/gi, '<\\/script>');
        openData('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;font:14px system-ui;padding:16px}</style></head><body>' +
          backBtn() + '<div id="fv-app"></div>' +
          S1 + 'try{' + safe + '}catch(err){document.body.insertAdjacentHTML("beforeend","<pre style=color:red>Error: "+err.message+"</pre>")}' + S2 +
          '</body></html>');
        return;
      }
      openData(wrapDoc(lastText, lastName));
    }

    /* ============================================================
       安装为 ChromeXt 用户脚本（核心）
    ============================================================ */
    var instPanel = $('fv-inst'), instCode = $('fv-inst-code'), instTip = $('fv-inst-tip');
    var installCode = '', installName = '';

    function hasUserScriptHead(src) {
      return /^\s*\/\/\s*==UserScript==/.test(src);
    }
    function buildUserScript(src, name) {
      if (hasUserScriptHead(src)) return src;
      var base = String(name).replace(/\.(js|mjs)$/i, '') || 'fv-script';
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
          ta.value = t;
          ta.style.position = 'fixed'; ta.style.top = '-1000px';
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
    function openInstall() {
      if (!lastText) { msg('请先选择 js 文件'); return; }
      var e = ext();
      if (e !== 'js' && e !== 'mjs' && !hasUserScriptHead(lastText)) {
        msg('当前不是 js 文件，仍可按脚本内容导出');
      }
      installName = (String(lastName).replace(/\.(js|mjs)$/i, '') || 'fv-script') + '.user.js';
      installCode = buildUserScript(lastText, lastName);
      instCode.textContent = installCode;
      instTip.textContent = hasUserScriptHead(lastText)
        ? '检测到标准 UserScript 头，可原样安装。方式①：复制 → ChromeXt 新建脚本粘贴保存。方式②：下载 .user.js → 用 ChromeXt 打开安装。'
        : '已自动补 UserScript 头（@match *://*/*）。建议先改成你要生效的网址再安装。方式①：复制 → ChromeXt 新建脚本粘贴保存。方式②：下载 .user.js → 用 ChromeXt 打开安装。';
      mask.classList.remove('on');
      instPanel.style.display = 'flex';
    }
    function closeInstall() { instPanel.style.display = 'none'; }

    function downloadUserScript() {
      try {
        var b = new Blob([installCode], { type: 'text/javascript;charset=utf-8' });
        var u = URL.createObjectURL(b);
        var a = document.createElement('a');
        a.href = u; a.download = installName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          try { document.body.removeChild(a); } catch (e) {}
          try { URL.revokeObjectURL(u); } catch (e) {}
        }, 800);
        msg('已触发下载：' + installName + '，下载完成后用 ChromeXt 打开该文件即可安装');
      } catch (e) {
        msg('下载失败：' + e.message + '，请改用复制方式');
      }
    }
    function tryOpenInstallLink() {
      try {
        var u = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(installCode);
        var w = window.open(u, '_blank');
        if (!w) location.href = u;
        msg('已尝试打开安装链接；若未出现安装界面，请用复制或下载方式');
      } catch (e) {
        msg('打开失败，请用复制或下载方式');
      }
    }

    /* ---------- 临时试运行（当前页，非安装） ---------- */
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
        if (logs.length) msg('试运行输出：' + logs.join(' | ').slice(0, 90));
        else msg('试运行完成（无 console 输出）');
      } catch (err) { msg('运行出错：' + err.message); }
    }

    /* ---------- 悬浮菜单 ---------- */
    function openMenu() {
      if (mask.classList.contains('on')) { mask.classList.remove('on'); return; }
      var items = [
        { t: '📁 选择文件', f: function () { fileInput.click(); } },
        { t: '🖥️ 全屏打开', f: fullOpen },
        { t: '📦 安装为 ChromeXt 脚本', f: openInstall },
        { t: '🧪 临时试运行（不安装）', f: runJs },
        { t: '🌐 网页模式渲染', f: function () { if (lastText) renderHtml(lastText); else msg('请先选择文件'); } },
        { t: '📝 代码高亮查看', f: function () { if (lastText) renderCode(lastText); else msg('请先选择文件'); } },
        { t: '🏠 回到首页', f: function () { location.href = 'https://fv-local-preview.invalid/'; } },
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
      lastName = f.name;
      pick.textContent = '📄 ' + f.name;
      var e = ext();
      if (e === 'pdf' || e === 'mhtml' || e === 'mht') { route(f, ''); return; }
      readFile(f).then(function (t) { lastText = t; route(f, t); })
        .catch(function () { msg('读取失败'); });
    });

    $('fv-full').onclick = fullOpen;
    $('fv-reload').onclick = function () {
      if (lastText) route({ name: lastName }, lastText);
      else if (lastBlob) { showFrame(); frame.src = lastBlob; }
      else msg('请先选择文件');
    };
    $('fv-home').onclick = function () { location.href = 'https://fv-local-preview.invalid/'; };
    $('fv-inst-btn').onclick = openInstall;
    $('fv-copy').onclick = function () {
      copyText(installCode, function (ok) { msg(ok ? '已复制到剪贴板' : '复制失败，请长按代码手动复制'); });
    };
    $('fv-dl').onclick = downloadUserScript;
    $('fv-openlink').onclick = tryOpenInstallLink;
    $('fv-inst-close').onclick = closeInstall;

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
    '#fv-inst .ih{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;box-shadow:0 2px 6px rgba(0,0,0,.04)}' +
    '#fv-inst .tip{padding:8px 12px;color:#666;font-size:12px;background:#fffbe6;border-bottom:1px solid #f0e6c0;line-height:1.7}' +
    '#fv-inst-code{flex:1;overflow:auto;margin:10px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;white-space:pre-wrap;word-break:break-all;font:12px/1.6 Consolas,monospace;color:#333;-webkit-user-select:text;user-select:text}' +
    '@media(max-width:480px){.head{gap:4px}.pick{min-width:100px}.btn{padding:6px 9px}}';

  var BODY =
    '<div class="head">' +
      '<span class="title">📂 FV 本地预览</span>' +
      '<span class="pick" id="fv-pick"><span id="fv-name">📁 选择文件</span>' +
        '<input type="file" id="fv-file" accept=".html,.htm,.xhtml,.xht,.json,.md,.markdown,.js,.mjs,.user.js,.pdf,.mhtml,.mht,.svg,.xml,.xsl,.xslt,.txt">' +
      '</span>' +
      '<button class="btn" id="fv-inst-btn">📦 安装脚本</button>' +
      '<button class="btn" id="fv-full">🖥️ 全屏打开</button>' +
      '<button class="btn sec" id="fv-reload">重载</button>' +
      '<button class="btn ghost" id="fv-home">首页</button>' +
    '</div>' +
    '<div class="stage">' +
      '<iframe id="fv-frame"></iframe>' +
      '<pre id="fv-pre"></pre>' +
      '<div id="fv-md"></div>' +
    '</div>' +
    '<div id="fv-toast"></div>' +
    '<div id="fv-fab">FV</div>' +
    '<div id="fv-mask"><div id="fv-card"></div></div>' +
    '<div id="fv-inst">' +
      '<div class="ih">' +
        '<span class="title">📦 安装为 ChromeXt 脚本</span>' +
        '<button class="btn" id="fv-copy">📋 复制代码</button>' +
        '<button class="btn sec" id="fv-dl">⬇️ 下载 .user.js</button>' +
        '<button class="btn sec" id="fv-openlink">🔗 打开安装链接</button>' +
        '<button class="btn ghost" id="fv-inst-close">✕ 关闭</button>' +
      '</div>' +
      '<div class="tip" id="fv-inst-tip"></div>' +
      '<div id="fv-inst-code"></div>' +
    '</div>';

  /* ============================================================
     注入：DOM 替换 + 多重重试（错误页会被 WebView 二次提交）
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

  build();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { build(); });
  }
  window.addEventListener('load', function () { build(); });
  schedule([0, 30, 80, 150, 300, 600, 1000, 2000]);

  window.__fvFixedLoaded = true;
})();
