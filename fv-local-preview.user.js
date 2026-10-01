// ==UserScript==
// @name         FV 本地文件预览器（浅色·完整改进版）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @match        about:blank
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__FV_PREVIEW_LOADED__) return;
  window.__FV_PREVIEW_LOADED__ = true;

  const FIXED_URL = 'https://fv-local-preview.invalid/';
  const isFixedUrl = () =>
    location.href === FIXED_URL ||
    location.href === FIXED_URL.slice(0, -1) ||
    location.href.indexOf(FIXED_URL + '?') === 0 ||
    location.href.indexOf(FIXED_URL + '#') === 0;

  // ===== 兜底：保证固定网址页面至少不是空白 =====
  if (isFixedUrl()) {
    if (!document.body) {
      const b = document.createElement('body');
      document.documentElement.appendChild(b);
    }
    document.documentElement.style.cssText += ';background:#f5f6fa;min-height:100vh;';
    document.body.style.cssText += ';background:#f5f6fa;min-height:100vh;margin:0;';
  }

  // ===== 样式 =====
  const style = document.createElement('style');
  style.textContent = `
    *{box-sizing:border-box}
    html,body{margin:0}
    body{font:14px/1.6 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6fa;color:#333}
    .fv-head{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04)}
    .fv-title{font-weight:600;color:#2f7d63;margin-right:6px;white-space:nowrap}
    .fv-file{flex:1;min-width:140px;font-size:13px;color:#555;background:#fff;border:1px solid #ccd0d6;border-radius:6px;padding:6px 8px}
    .fv-btn{padding:7px 12px;border:0;border-radius:6px;font-size:13px;cursor:pointer;background:#2f7d63;color:#fff;white-space:nowrap}
    .fv-btn.sec{background:#607d8b}
    .fv-btn.ghost{background:#eef2f5;color:#333;border:1px solid #ccd0d6}
    .fv-info{padding:6px 12px;font-size:12px;color:#777;background:#fff;border-bottom:1px solid #f0f0f0}
    .fv-err{padding:12px;color:#b00020;background:#fdecea;border-radius:8px;margin:12px}
    .fv-views>*{display:none}
    #fv-frame{width:100%;height:calc(100vh - 54px);border:0;background:#fff}
    #fv-json{margin:0;padding:12px;width:100%;height:calc(100vh - 54px);overflow:auto;white-space:pre-wrap;background:#fafafa;color:#333;font:13px/1.6 "SFMono-Regular",Consolas,monospace}
    .fv-jk{color:#0077aa}.fv-js{color:#d14}.fv-jn{color:#c18401}.fv-jb{color:#8250df}
    #fv-md{width:100%;height:calc(100vh - 54px);overflow:auto;padding:18px 22px;background:#fff}
    #fv-md h1,#fv-md h2,#fv-md h3,#fv-md h4{color:#1f2d3d;line-height:1.3;margin:18px 0 10px}
    #fv-md h1{border-bottom:1px solid #eee;padding-bottom:6px}
    #fv-md p{margin:8px 0}
    #fv-md a{color:#2f7d63}
    #fv-md code{background:#f0f2f5;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:13px;color:#c0341d}
    #fv-md pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}
    #fv-md pre code{background:transparent;color:inherit;padding:0}
    #fv-md blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #2f7d63;background:#f0f7f4;color:#555}
    #fv-md ul,#fv-md ol{margin:8px 0 8px 22px}
    #fv-md img{max-width:100%;border-radius:6px}
    #fv-md hr{border:0;border-top:1px solid #eee;margin:16px 0}
    #fv-code{width:100%;height:calc(100vh - 54px);overflow:auto;padding:14px;white-space:pre-wrap;font:13px/1.6 Consolas,monospace;background:#fff;color:#333}
    .fv-c-k{color:#c792ea}.fv-c-s{color:#a5e075}.fv-c-c{color:#7a8290}.fv-c-n{color:#f0a45c}.fv-c-fn{color:#82aaff}
    #fv-tip{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:9999;display:none;box-shadow:0 4px 12px rgba(0,0,0,.15)}

    /* 悬浮按钮：借鉴 ChromeXt 脚本菜单提取器款式 */
    #fv-fab{position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:2147483647;user-select:none;touch-action:none;
      --cx-accent:#2f7d63;--cx-idleBg:rgba(0,0,0,.03);--cx-text:#000;
      --cx-shadow:0 8px 32px 0 rgba(0,0,0,.2);--cx-border:rgba(0,0,0,.08)}
    #fv-fab #btn{width:32px;height:50px;background:var(--cx-accent);color:#fff;border-radius:18px 0 0 18px;
      display:flex;align-items:center;justify-content:center;cursor:pointer;font:bold 12px "Segoe UI",system-ui;
      box-shadow:inset 0 1px 1px rgba(255,255,255,.3),var(--cx-shadow);backdrop-filter:blur(15px);
      border:1px solid rgba(255,255,255,.2);border-right:none;transition:all .5s cubic-bezier(.2,.8,.2,1);opacity:1}
    #fv-fab #btn.idle{background:var(--cx-idleBg)!important;color:var(--cx-text)!important;opacity:.25;box-shadow:none;border-color:var(--cx-border)}
    #fv-fab #btn:hover,#fv-fab #btn:active{width:45px;filter:brightness(1.1);opacity:1!important;background:var(--cx-accent)!important;color:#fff!important}
    .fv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px);z-index:2147483646;animation:fvFade .25s ease;touch-action:none}
    .fv-content{width:88%;max-width:440px;max-height:75vh;background:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.2);border-radius:26px;padding:18px;box-shadow:var(--cx-shadow);backdrop-filter:blur(40px) saturate(180%);display:grid;grid-template-columns:1fr;gap:12px;overflow-y:auto;scrollbar-width:none;animation:fvZoom .35s cubic-bezier(.34,1.56,.64,1)}
    @media(min-width:768px){.fv-content{max-width:620px;grid-template-columns:1fr 1fr}}
    .fv-item{padding:16px;background:rgba(255,255,255,.5);color:#333;border-radius:14px;font:600 15px "Segoe UI",system-ui;text-align:center;cursor:pointer;border:1px solid var(--cx-border);box-shadow:0 4px 10px rgba(0,0,0,.05);transition:all .25s ease;display:flex;align-items:center;justify-content:center}
    .fv-item:hover{background:var(--cx-accent);color:#fff;transform:translateY(-4px) scale(1.025);box-shadow:0 10px 20px rgba(0,0,0,.15)}
    .fv-item:active{transform:scale(.95)}
    .fv-close-btn{grid-column:1/-1;position:sticky;bottom:-18px;margin:10px -18px -18px;padding:16px;background:rgba(255,255,255,.75);border-top:1px solid var(--cx-border);text-align:center;color:var(--cx-accent);font:bold 14px system-ui;cursor:pointer;border-radius:0 0 26px 26px}
    @keyframes fvFade{from{opacity:0}}@keyframes fvZoom{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
  `;
  document.head.appendChild(style);

  // ===== DOM =====
  const host = document.createElement('div');
  host.id = 'fv-host';
  host.innerHTML = `
    <div class="fv-head" id="fv-head">
      <span class="fv-title">📄 FV 本地预览</span>
      <input id="fv-file" class="fv-file" type="file" accept=".pdf,.mhtml,.mht,.svg,.xml,.xsl,.xslt,.html,.htm,.xhtml,.xht,.md,.json,.js,.txt,.mjs">
      <button class="fv-btn sec" id="fv-full" style="display:none">全屏打开</button>
      <button class="fv-btn sec" id="fv-reload">重载</button>
      <button class="fv-btn ghost" id="fv-back">返回</button>
    </div>
    <div class="fv-info" id="fv-info">支持 pdf/mhtml/mht/svg/xml/xsl/xslt/html/htm/xhtml/xht/md/json/js/txt</div>
    <div class="fv-views">
      <iframe id="fv-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe>
      <div id="fv-json"></div>
      <div id="fv-md"></div>
      <pre id="fv-code"></pre>
    </div>
    <div id="fv-tip"></div>
    <div id="fv-fab"></div>
  `;
  document.body.appendChild(host);

  const $ = (id) => document.getElementById(id);
  const fileInput = $('fv-file');
  const fullBtn = $('fv-full');
  const iframe = $('fv-frame');
  const jsonBox = $('fv-json');
  const mdBox = $('fv-md');
  const codeBox = $('fv-code');
  const info = $('fv-info');
  const tip = $('fv-tip');

  let lastText = '';
  let lastName = '';
  let lastKind = '';

  // ===== 工具 =====
  function showTip(msg, dur) {
    tip.textContent = msg;
    tip.style.display = 'block';
    clearTimeout(tip._t);
    tip._t = setTimeout(() => tip.style.display = 'none', dur || 2600);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function showView(el) {
    [iframe, jsonBox, mdBox, codeBox].forEach(e => e.style.display = 'none');
    fullBtn.style.display = 'none';
    el.style.display = '';
    if (el === iframe) el.style.display = 'block';
    if (el !== iframe) fullBtn.style.display = 'inline-block';
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (file.text) return file.text().then(resolve).catch(reject);
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('读取失败'));
      r.readAsText(file);
    });
  }
  function ext() { return (lastName.split('.').pop() || '').toLowerCase(); }

  // ===== 返回按钮（注入到被打开的页面） =====
  function backButtonHTML() {
    return '<button id="fvret" style="position:fixed;top:10px;right:10px;z-index:2147483640;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;font:14px system-ui;cursor:pointer" onclick="location.href=\'' + FIXED_URL + '\'">← 返回预览器</button>';
  }

  // ===== 全屏打开：data URI，避免 </script> 与重写问题 =====
  function openFull(html) {
    info.textContent = '已全屏打开：' + lastName;
    const w = window.open('about:blank', '_blank');
    if (!w) { showTip('弹窗被拦截，改用本页全屏'); openFullSelf(html); return; }
    try {
      const doc = w.document;
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body>' + backButtonHTML() + html + '</body></html>');
      doc.close();
    } catch (e) {
      showTip('新窗口打开失败：' + e.message);
    }
  }
  function openFullSelf(html) {
    showView(iframe);
    iframe.removeAttribute('sandbox');
    iframe.src = 'about:blank';
    setTimeout(() => {
      try {
        const d = iframe.contentDocument;
        d.open();
        d.write('<!doctype html><html><head><meta charset="utf-8"></head><body>' + backButtonHTML() + html + '</body></html>');
        d.close();
      } catch (e) { showTip('全屏打开失败：' + e.message); }
    }, 60);
  }

  // ===== 各种格式 =====
  function renderHtml(text) {
    lastKind = 'html';
    showView(iframe);
    iframe.removeAttribute('sandbox');
    iframe.srcdoc = text;
    info.textContent = '已导入：' + lastName + '（HTML 网页）';
    setTimeout(() => {
      try {
        const d = iframe.contentDocument;
        const len = d && d.body ? d.body.innerHTML.length : 0;
        if (len < 10 && text.trim().length > 50) showTip('内容较少，可点“全屏打开”重试');
      } catch (e) {}
    }, 700);
  }

  function renderJson(text) {
    lastKind = 'json';
    showView(jsonBox);
    jsonBox.textContent = text;
    info.textContent = '已导入：' + lastName + '（JSON 原文）';
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      jsonBox.innerHTML = esc(pretty).replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        m => /:$/.test(m) ? '<span class="fv-jk">' + m + '</span>'
          : /^"/.test(m) ? '<span class="fv-js">' + m + '</span>'
          : /true|false|null/.test(m) ? '<span class="fv-jb">' + m + '</span>'
          : '<span class="fv-jn">' + m + '</span>'
      );
      info.textContent = '已导入：' + lastName + '（JSON 高亮）';
    } catch (e) { showTip('JSON 解析失败，显示原文'); }
  }

  // --- Markdown ---
  function mdInline(s) {
    s = s.replace(/`([^`]+)`/g, (m, c) => '<code>' + esc(c) + '</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, t, u) => '<img alt="' + esc(t) + '" src="' + esc(u) + '">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, t, u) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + t + '</a>');
    return s;
  }
  function mdToHtml(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    let out = [], i = 0;
    while (i < lines.length) {
      let line = lines[i];
      if (/^```/.test(line)) {
        let buf = [], lang = (line.match(/^```(\w*)/) || [])[1] || '';
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code class="lang-' + esc(lang) + '">' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        let buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + mdInline(buf.join('<br>')) + '</blockquote>');
        continue;
      }
      let h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push('<h' + h[1].length + '>' + mdInline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^\s*([-*+])\s+\[ \]\s+/.test(line) || /^\s*([-*+])\s+\[x\]\s+/.test(line)) {
        let buf = [];
        while (i < lines.length && /^\s*([-*+])\s+\[[ x]\]\s+/.test(lines[i])) {
          let done = /\[x\]/i.test(lines[i]);
          let t = lines[i].replace(/^\s*([-*+])\s+\[[ x]\]\s+/, '');
          buf.push('<li style="list-style:none;margin-left:-18px"><input type="checkbox" disabled' + (done ? ' checked' : '') + '> ' + mdInline(t) + '</li>');
          i++;
        }
        out.push('<ul>' + buf.join('') + '</ul>');
        continue;
      }
      if (/^\s*([-*+])\s+/.test(line)) {
        let buf = [];
        while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) { buf.push('<li>' + mdInline(lines[i].replace(/^\s*([-*+])\s+/, '')) + '</li>'); i++; }
        out.push('<ul>' + buf.join('') + '</ul>');
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        let buf = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push('<li>' + mdInline(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>'); i++; }
        out.push('<ol>' + buf.join('') + '</ol>');
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (line.trim() === '') { i++; continue; }
      let para = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s|[-*_]\s*[-*_])/.test(lines[i])) { para.push(lines[i]); i++; }
      out.push('<p>' + mdInline(para.join('<br>')) + '</p>');
    }
    return out.join('\n');
  }
  function renderMd(text) {
    lastKind = 'md';
    showView(mdBox);
    mdBox.innerHTML = mdToHtml(text);
    info.textContent = '已导入：' + lastName + '（Markdown 网页）';
  }

  // --- JS / 代码高亮 ---
  function codeHighlight(code, lang) {
    let s = esc(code);
    s = s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="fv-c-c">$1</span>');
    s = s.replace(/(&quot;[^&]*?&quot;|'[^']*?'|`[^`]*?`)/g, '<span class="fv-c-s">$1</span>');
    s = s.replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|import|export|default|delete|void)\b/g, '<span class="fv-c-k">$1</span>');
    s = s.replace(/\b(true|false|null|undefined|NaN)\b/g, '<span class="fv-c-n">$1</span>');
    s = s.replace(/\b(0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/g, '<span class="fv-c-n">$1</span>');
    s = s.replace(/\b([A-Za-z_$][\w$]*)(?=\s*\()/g, '<span class="fv-c-fn">$1</span>');
    return s;
  }
  function renderCode(text) {
    lastKind = 'code';
    showView(codeBox);
    codeBox.innerHTML = codeHighlight(text);
    info.textContent = '已导入：' + lastName + '（代码高亮）';
  }

  // ===== 路由 =====
  function route(text) {
    const e = ext();
    const t = text.trim();
    if (['pdf'].indexOf(e) >= 0) { renderPdf(); return; }
    if (['mhtml', 'mht'].indexOf(e) >= 0) { renderArchive(t); return; }
    if (['svg'].indexOf(e) >= 0) { renderSvg(t); return; }
    if (['md', 'markdown'].indexOf(e) >= 0) { renderMd(t); return; }
    if (['json'].indexOf(e) >= 0 || /^[\s]*[\[{]/.test(t)) { renderJson(t); return; }
    if (['js', 'mjs'].indexOf(e) >= 0 || /^\s*(const|let|var|function|class|async|import|export)\s/.test(t)) {
      // js：默认代码高亮 + 全屏运行；同时保留注入运行能力
      renderCode(t);
      showTip('JS 已高亮，点“全屏打开”以网页模式运行');
      return;
    }
    if (['html', 'htm', 'xhtml', 'xht', 'xml', 'xsl', 'xslt'].indexOf(e) >= 0 || /^\s*<(\?xml|!DOCTYPE|html|svg|xml)/i.test(t)) {
      renderHtml(t);
      return;
    }
    // 无扩展名：按内容猜测
    if (/^\s*<(\?xml|!DOCTYPE|html)/i.test(t)) { renderHtml(t); return; }
    renderCode(t);
  }

  // ===== 特殊格式处理 =====
  function renderPdf() {
    lastKind = 'pdf';
    showView(iframe);
    info.textContent = 'PDF：浏览器若支持可直接预览，否则请用其他 PDF 应用打开';
    const url = URL.createObjectURL(new Blob([lastBytes], { type: 'application/pdf' }));
    iframe.removeAttribute('sandbox');
    iframe.src = url;
  }

  function renderArchive(text) {
    // mhtml/mht 是 multipart，直接交给 iframe，浏览器内核可能能解析
    lastKind = 'archive';
    showView(iframe);
    info.textContent = '已导入：' + lastName + '（MHTML 原始内容，浏览器内核决定是否渲染）';
    const blob = new Blob([text], { type: 'multipart/related; boundary=' + guessBoundary(text) });
    const url = URL.createObjectURL(blob);
    iframe.removeAttribute('sandbox');
    iframe.src = url;
    showTip('MHTML 依赖浏览器内核支持，若空白请尝试其他浏览器');
  }
  function guessBoundary(text) {
    const m = text.match(/boundary="?([^";\s]+)"?/i);
    return m ? m[1] : 'boundary';
  }

  function renderSvg(text) {
    lastKind = 'svg';
    showView(iframe);
    iframe.removeAttribute('sandbox');
    iframe.srcdoc = text;
    info.textContent = '已导入：' + lastName + '（SVG 矢量图）';
  }

  // ===== 全屏按钮行为 =====
  fullBtn.onclick = () => {
    if (!lastText) return showTip('请先选择文件');
    let html = lastText;
    if (lastKind === 'md') html = '<div class="markdown-body">' + mdToHtml(lastText) + '</div>';
    if (lastKind === 'json') {
      try { html = '<pre>' + esc(JSON.stringify(JSON.parse(lastText), null, 2)) + '</pre>'; }
      catch (e) { html = '<pre>' + esc(lastText) + '</pre>'; }
    }
    if (lastKind === 'code') {
      // JS：用 data URI 包裹成网页运行，避免 </script> 问题
      const data = 'data:text/html;charset=utf-8,' + encodeURIComponent(
        '<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;font:14px/1.6 system-ui;padding:16px}#fvret{position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;cursor:pointer}</style></head><body>' +
        backButtonHTML() +
        '<div id="fv-app"></div><script>' + lastText + '<\/script></body></html>'
      );
      info.textContent = '已全屏运行：' + lastName;
      const w = window.open(data, '_blank');
      if (!w) showTip('弹窗被拦截，无法全屏运行');
      return;
    }
    if (lastKind === 'pdf') { openPdfExternal(); return; }
    openFull(html);
  };

  function openPdfExternal() {
    showTip('PDF 请通过系统选择器打开，或使用支持 PDF 的浏览器');
  }

  // ===== JS 注入运行：给出可见反馈 =====
  function injectRunJs(code) {
    try {
      const fn = new Function('document', 'window', 'console', code);
      const logs = [];
      const proxyLog = new Proxy(console, {
        get(target, key) {
          if (typeof target[key] === 'function') {
            return (...args) => { logs.push(args.map(a => typeof a === 'string' ? a : (a && a.toString ? a.toString() : String(a))).join(' ')); target[key](...args); };
          }
          return target[key];
        }
      });
      fn.call(window, document, window, proxyLog);
      if (logs.length) showTip('已注入执行，输出：' + logs.join(' | ').slice(0, 80));
      else showTip('已注入执行（无可见输出，已操作本页 DOM）');
    } catch (e) {
      showTip('执行出错：' + e.message);
    }
  }

  // 双击代码区也可触发注入运行（JS 时）
  codeBox.ondblclick = () => {
    if (lastKind === 'code' && /\.(js|mjs)$/i.test(lastName)) injectRunJs(lastText);
  };

  // ===== 悬浮按钮：借鉴 ChromeXt 菜单提取器款式 =====
  function initFab() {
    if ($('fv-fab-inner')) return;
    const fab = $('fv-fab');
    const shadow = fab.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{--cx-accent:#2f7d63;--cx-idleBg:rgba(0,0,0,.03);--cx-text:#000;--cx-shadow:0 8px 32px 0 rgba(0,0,0,.2);--cx-border:rgba(0,0,0,.08)}
        #btn{width:32px;height:50px;background:var(--cx-accent);color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font:bold 12px "Segoe UI",system-ui;box-shadow:inset 0 1px 1px rgba(255,255,255,.3),var(--cx-shadow);backdrop-filter:blur(15px);border:1px solid rgba(255,255,255,.2);border-right:none;transition:all .5s cubic-bezier(.2,.8,.2,1);opacity:1}
        #btn.idle{background:var(--cx-idleBg)!important;color:var(--cx-text)!important;opacity:.25;box-shadow:none;border-color:var(--cx-border)}
        #btn:hover,#btn:active{width:45px;filter:brightness(1.1);opacity:1!important;background:var(--cx-accent)!important;color:#fff!important}
        .fv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px);z-index:2147483646;animation:fvFade .25s ease;touch-action:none}
        .fv-content{width:88%;max-width:440px;max-height:75vh;background:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.2);border-radius:26px;padding:18px;box-shadow:var(--cx-shadow);backdrop-filter:blur(40px) saturate(180%);display:grid;grid-template-columns:1fr;gap:12px;overflow-y:auto;scrollbar-width:none;animation:fvZoom .35s cubic-bezier(.34,1.56,.64,1)}
        @media(min-width:768px){.fv-content{max-width:620px;grid-template-columns:1fr 1fr}}
        .fv-item{padding:16px;background:rgba(255,255,255,.5);color:#333;border-radius:14px;font:600 15px "Segoe UI",system-ui;text-align:center;cursor:pointer;border:1px solid var(--cx-border);box-shadow:0 4px 10px rgba(0,0,0,.05);transition:all .25s ease;display:flex;align-items:center;justify-content:center}
        .fv-item:hover{background:var(--cx-accent);color:#fff;transform:translateY(-4px) scale(1.025);box-shadow:0 10px 20px rgba(0,0,0,.15)}
        .fv-item:active{transform:scale(.95)}
        .fv-close-btn{grid-column:1/-1;position:sticky;bottom:-18px;margin:10px -18px -18px;padding:16px;background:rgba(255,255,255,.75);border-top:1px solid var(--cx-border);text-align:center;color:var(--cx-accent);font:bold 14px system-ui;cursor:pointer;border-radius:0 0 26px 26px}
        @keyframes fvFade{from{opacity:0}}@keyframes fvZoom{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
      </style>
      <div id="btn">FV</div>
    `;
    const btn = shadow.getElementById('btn');
    let idleTimer;
    const resetIdle = () => {
      btn.classList.remove('idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { if (!shadow.querySelector('.fv-overlay')) btn.classList.add('idle'); }, 3000);
    };
    let isDragging = false, startY, startTop;
    btn.ontouchstart = (e) => {
      isDragging = true; startY = e.touches[0].clientY; startTop = fab.offsetTop;
      btn.style.transition = 'none'; resetIdle();
    };
    window.ontouchmove = (e) => {
      if (!isDragging) return;
      fab.style.top = Math.max(50, Math.min(window.innerHeight - 50, startTop + e.touches[0].clientY - startY)) + 'px';
    };
    window.ontouchend = () => {
      if (!isDragging) return;
      isDragging = false; btn.style.transition = 'all .4s cubic-bezier(.2,.8,.2,1)'; resetIdle();
    };
    btn.onmouseenter = resetIdle;
    btn.onclick = () => {
      if (isDragging) return;
      const menus = [
        { title: '全屏打开当前文件', action: () => fullBtn.click() },
        { title: '重新选择文件', action: () => fileInput.click() },
        { title: '以代码高亮查看', action: () => { if (lastText) renderCode(lastText); } },
        { title: '以网页渲染（HTML）', action: () => { if (lastText) renderHtml(lastText); } },
        { title: '注入运行 JS', action: () => { if (lastText) injectRunJs(lastText); } },
        { title: '返回固定入口', action: () => location.href = FIXED_URL }
      ];
      renderPanel(menus, shadow, resetIdle);
    };
    resetIdle();
  }

  function renderPanel(menus, shadow, onRestore) {
    if (shadow.querySelector('.fv-overlay')) return;
    const htmlEl = document.documentElement;
    const oldOverflow = htmlEl.style.overflow;
    const scrollBarWidth = window.innerWidth - htmlEl.clientWidth;
    const oldMargin = htmlEl.style.marginRight;
    htmlEl.style.overflow = 'hidden';
    if (scrollBarWidth > 0) htmlEl.style.marginRight = scrollBarWidth + 'px';
    const overlay = document.createElement('div');
    overlay.className = 'fv-overlay';
    const content = document.createElement('div');
    content.className = 'fv-content';
    content.onclick = (e) => e.stopPropagation();
    overlay.addEventListener('touchmove', (e) => { if (!content.contains(e.target)) e.preventDefault(); }, { passive: false });
    const closePanel = () => {
      htmlEl.style.overflow = oldOverflow;
      htmlEl.style.marginRight = oldMargin;
      overlay.remove();
      onRestore();
    };
    menus.forEach(m => {
      const item = document.createElement('div');
      item.className = 'fv-item';
      item.innerText = m.title;
      item.onclick = (e) => { e.stopPropagation(); closePanel(); setTimeout(m.action, 50); };
      content.appendChild(item);
    });
    const close = document.createElement('div');
    close.className = 'fv-close-btn';
    close.innerText = '关闭';
    close.onclick = closePanel;
    content.appendChild(close);
    overlay.appendChild(content);
    overlay.onclick = closePanel;
    shadow.appendChild(overlay);
  }

  // ===== 事件 =====
  let lastBytes = null;
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastName = file.name;
    try {
      if (ext() === 'pdf') {
        lastBytes = await file.arrayBuffer();
        renderPdf();
      } else {
        lastText = await readFile(file);
        route(lastText);
      }
    } catch (err) {
      showTip('读取失败：' + (err && err.message ? err.message : err));
      info.textContent = '读取失败：' + lastName;
    }
  });

  $('fv-reload').onclick = () => {
    if (lastText) route(lastText);
    else if (lastBytes) renderPdf();
    else showTip('请先选择文件');
  };
  $('fv-back').onclick = () => location.href = FIXED_URL;

  // ===== 兜底：固定网址加载异常时给提示 =====
  if (isFixedUrl()) {
    info.textContent = '固定入口已就绪，请点击“选择文件”导入本地文件';
    // 如果几秒后页面仍是空的（脚本未跑），给出书签/网络提示
    setTimeout(() => {
      const empty = document.body.children.length <= 1 && !document.getElementById('fv-host');
      if (empty) {
        document.body.innerHTML = '<div style="padding:24px;max-width:520px;margin:40px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.05)">' +
          '<h2 style="color:#2f7d63;margin-top:0">FV 本地预览入口</h2>' +
          '<p>脚本未能自动加载，可能原因：</p>' +
          '<ul style="line-height:1.9">' +
          '<li>ChromeXt 未启用或该脚本被禁用</li>' +
          '<li>书签地址与脚本 @match 不一致</li>' +
          '<li>浏览器未联网，无法解析域名（脚本仍需注入）</li>' +
          '</ul>' +
          '<p style="color:#777">请检查 ChromeXt 中“FV 本地文件预览器”脚本是否已启用，并确认地址栏为：</p>' +
          '<code style="display:block;padding:8px;background:#f5f6fa;border-radius:6px;word-break:break-all">' + FIXED_URL + '</code>' +
          '<p style="margin-top:16px"><button onclick="location.reload()" style="padding:8px 16px;background:#2f7d63;color:#fff;border:0;border-radius:6px;cursor:pointer">重新加载</button></p>' +
          '</div>';
      }
    }, 2500);
  }

  initFab();
  console.log('[FV] 本地文件预览器改进版已启动');
})();
