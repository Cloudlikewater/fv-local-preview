// ==UserScript==
// @name         FV 本地预览器 2.0（全格式/悬浮球/安全全屏）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ENTRY_HOST = 'fv-local-preview.invalid';
  if (location.hostname !== ENTRY_HOST) return;
  if (document.documentElement && document.documentElement.getAttribute('data-fv-app')) return;

  // ===== 立即接管空白错误页，避免固定网址打不开 =====
  document.open();
  document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FV 预览器</title></head><body style="margin:0"></body></html>');
  document.close();

  // ===== 浅色样式 =====
  const style = document.createElement('style');
  style.textContent = `
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;font:14px/1.6 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6fa;color:#333}
    .fv-head{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04)}
    .fv-title{font-weight:600;color:#2f7d63;margin-right:6px;white-space:nowrap}
    .fv-file{flex:1;min-width:140px;font-size:13px;color:#555;background:#fff;border:1px solid #ccd0d6;border-radius:6px;padding:6px 8px}
    .fv-btn{padding:7px 12px;border:0;border-radius:6px;font-size:13px;cursor:pointer;background:#2f7d63;color:#fff;white-space:nowrap}
    .fv-btn.sec{background:#607d8b}
    .fv-btn.ghost{background:#eef2f5;color:#333;border:1px solid #ccd0d6}
    .fv-info{padding:6px 12px;font-size:12px;color:#777;background:#fff;border-bottom:1px solid #f0f0f0}
    #fv-frame{width:100%;height:calc(100vh - 54px);border:0;background:#fff;display:none}
    #fv-json,#fv-xml,#fv-text{margin:0;padding:12px;width:100%;height:calc(100vh - 54px);overflow:auto;white-space:pre-wrap;background:#fafafa;color:#333;font:13px/1.6 "SFMono-Regular",Consolas,monospace;display:none}
    .fv-jk{color:#0077aa}.fv-js{color:#d14}.fv-jn{color:#c18401}.fv-jb{color:#8250df}
    #fv-md{width:100%;height:calc(100vh - 54px);overflow:auto;padding:18px 22px;background:#fff;display:none}
    #fv-md h1,#fv-md h2,#fv-md h3,#fv-md h4{color:#1f2d3d;line-height:1.3;margin:18px 0 10px}
    #fv-md h1{border-bottom:1px solid #eee;padding-bottom:6px}
    #fv-md p{margin:8px 0}#fv-md a{color:#2f7d63}
    #fv-md code{background:#f0f2f5;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:13px;color:#c0341d}
    #fv-md pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}
    #fv-md pre code{background:transparent;color:inherit;padding:0}
    #fv-md blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #2f7d63;background:#f0f7f4;color:#555}
    #fv-md ul,#fv-md ol{margin:8px 0 8px 22px}
    #fv-md img{max-width:100%;border-radius:6px}
    #fv-md hr{border:0;border-top:1px solid #eee;margin:16px 0}
    #fv-js{width:100%;height:calc(100vh - 54px);overflow:auto;padding:0;background:#fff;display:none}
    #fv-js pre{margin:0;padding:14px;white-space:pre-wrap;font:13px/1.6 Consolas,monospace;color:#333}
    .fv-jsk{color:#c792ea}.fv-jss{color:#a5e075}.fv-jsc{color:#7a8290}.fv-jsn{color:#f0a45c}.fv-jsfn{color:#82aaff}
    #fv-console{position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow:auto;background:#1e1e1e;color:#d4d4d4;font:12px/1.5 Consolas,monospace;z-index:1000;display:none;border-top:2px solid #2f7d63}
    #fv-console .bar{position:sticky;top:0;background:#2b2b2b;padding:6px 10px;display:flex;justify-content:space-between;align-items:center}
    #fv-console .log{padding:4px 10px;white-space:pre-wrap;border-bottom:1px solid #333}
    #fv-tip{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:999;display:none;box-shadow:0 4px 12px rgba(0,0,0,.15)}

    /* 返回悬浮球 - 仿 ChromeXt 提取器样式 */
    #fv-float{position:fixed;top:50%;right:0;transform:translateY(-50%);width:32px;height:50px;background:#0078d4;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font:bold 11px system-ui;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:2147483647;user-select:none;touch-action:none;border:1px solid rgba(255,255,255,.25);border-right:none;transition:all .3s ease}
    #fv-float:hover{width:44px;background:#2f7d63}
    #fv-float .arr{font-size:16px;transform:rotate(180deg);line-height:1}
  `;
  document.head.appendChild(style);

  // ===== 基础 UI =====
  document.body.innerHTML = `
    <div class="fv-head">
      <span class="fv-title">📄 FV 预览</span>
      <input id="fv-file" class="fv-file" type="file" accept=".html,.htm,.xhtml,.xht,.mhtml,.mht,.pdf,.svg,.xml,.xsl,.xslt,.json,.md,.markdown,.js,.mjs,.txt">
      <button class="fv-btn sec" id="fv-full">全屏模式</button>
      <button class="fv-btn sec" id="fv-reload">重载</button>
      <button class="fv-btn ghost" id="fv-clearconsole">清空控制台</button>
    </div>
    <div class="fv-info" id="fv-info">支持 html/xhtml/mhtml/pdf/svg/xml/xsl/js/json/md/txt，所有格式均可全屏</div>
    <iframe id="fv-frame"></iframe>
    <pre id="fv-json"></pre>
    <pre id="fv-xml"></pre>
    <pre id="fv-text"></pre>
    <div id="fv-md"></div>
    <div id="fv-js"><pre id="fv-js-code"></pre></div>
    <div id="fv-console">
      <div class="bar"><span>JS 运行输出</span><button id="fv-closeconsole" style="background:none;border:none;color:#ddd;cursor:pointer">✕</button></div>
      <div id="fv-console-logs"></div>
    </div>
    <div id="fv-float" title="返回浏览器/退出全屏"><span class="arr">→</span></div>
    <div id="fv-tip"></div>
  `;

  const $ = id => document.getElementById(id);
  const fileInput = $('fv-file');
  const iframe = $('fv-frame');
  const jsonPre = $('fv-json');
  const xmlPre = $('fv-xml');
  const txtPre = $('fv-text');
  const mdBox = $('fv-md');
  const jsBox = $('fv-js');
  const jsCode = $('fv-js-code');
  const info = $('fv-info');
  const tip = $('fv-tip');
  const consoleBox = $('fv-console');
  const consoleLogs = $('fv-console-logs');

  let lastText = '';
  let lastRaw = null;
  let lastName = '';
  let lastType = '';
  let lastMime = '';

  // ===== 工具 =====
  function showTip(msg, duration = 2600) {
    tip.textContent = msg;
    tip.style.display = 'block';
    clearTimeout(tip._t);
    tip._t = setTimeout(() => tip.style.display = 'none', duration);
  }

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      if (file.text) { file.text().then(resolve).catch(reject); return; }
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function hideAll() {
    iframe.style.display = 'none';
    jsonPre.style.display = 'none';
    xmlPre.style.display = 'none';
    txtPre.style.display = 'none';
    mdBox.style.display = 'none';
    jsBox.style.display = 'none';
  }

  // ===== 控制台 =====
  function showConsole() {
    consoleBox.style.display = 'block';
  }
  function logToConsole(...args) {
    const line = document.createElement('div');
    line.className = 'log';
    line.textContent = args.map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a, null, 2); }
      catch(e){ return String(a); }
    }).join(' ');
    consoleLogs.appendChild(line);
    consoleLogs.parentElement.scrollTop = consoleLogs.parentElement.scrollHeight;
  }
  function clearConsole() {
    consoleLogs.innerHTML = '';
  }
  $('fv-clearconsole').onclick = clearConsole;
  $('fv-closeconsole').onclick = () => consoleBox.style.display = 'none';

  // ===== JSON =====
  function renderJson(text) {
    lastType = 'json';
    hideAll();
    jsonPre.style.display = 'block';
    jsonPre.textContent = text;
    info.textContent = '已导入：' + lastName + '（JSON 原文）';
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      jsonPre.innerHTML = esc(pretty).replace(/(&quot;.*?&quot;(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)/g, m => {
        if (/^&quot;.*?&quot;:/.test(m)) return '<span class="fv-jk">' + m + '</span>';
        if (/^&quot;/.test(m)) return '<span class="fv-js">' + m + '</span>';
        if (/true|false|null/.test(m)) return '<span class="fv-jb">' + m + '</span>';
        return '<span class="fv-jn">' + m + '</span>';
      });
      info.textContent = '已导入：' + lastName + '（JSON 高亮）';
    } catch (e) { showTip('JSON 解析失败，显示原文'); }
  }

  // ===== XML/XSL/SVG =====
  function renderXml(text) {
    lastType = 'xml';
    hideAll();
    xmlPre.style.display = 'block';
    xmlPre.textContent = text;
    info.textContent = '已导入：' + lastName + '（XML 原文高亮）';
    try {
      const pretty = text.replace(/>\s*</g, '>\n<').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      xmlPre.innerHTML = pretty.replace(/(&lt;\/?[^&]+?&gt;)/g, '<span class="fv-jk">$1</span>');
    } catch(e){}
  }

  // ===== 纯文本 =====
  function renderText(text) {
    lastType = 'txt';
    hideAll();
    txtPre.style.display = 'block';
    txtPre.textContent = text;
    info.textContent = '已导入：' + lastName + '（文本）';
  }

  // ===== Markdown =====
  function mdInline(s) {
    s = s.replace(/`([^`]+)`/g, (m,c) => '<code>'+esc(c)+'</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m,t,u) => '<img alt="'+esc(t)+'" src="'+esc(u)+'">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m,t,u) => '<a href="'+esc(u)+'" target="_blank">'+t+'</a>');
    return s;
  }
  function mdToHtml(md) {
    const lines = md.replace(/\r\n/g,'\n').split('\n');
    let out = [], i = 0;
    while (i < lines.length) {
      let line = lines[i];
      if (/^```/.test(line)) {
        let buf=[], lang=(line.match(/^```(\w*)/)||[])[1]||''; i++;
        while(i<lines.length&&!/^```/.test(lines[i])){buf.push(lines[i]);i++;}
        i++; out.push('<pre><code class="lang-'+esc(lang)+'">'+esc(buf.join('\n'))+'</code></pre>'); continue;
      }
      if (/^\s*>\s?/.test(line)) {
        let buf=[];
        while(i<lines.length&&/^\s*>\s?/.test(lines[i])){buf.push(lines[i].replace(/^\s*>\s?/,''));i++;}
        out.push('<blockquote>'+mdInline(buf.join('<br>'))+'</blockquote>'); continue;
      }
      let h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push('<h'+h[1].length+'>'+mdInline(h[2])+'</h'+h[1].length+'>'); i++; continue; }
      if (/^\s*([-*+])\s+/.test(line)) {
        let buf=[];
        while(i<lines.length&&/^\s*([-*+])\s+/.test(lines[i])){buf.push('<li>'+mdInline(lines[i].replace(/^\s*([-*+])\s+/,''))+'</li>');i++;}
        out.push('<ul>'+buf.join('')+'</ul>'); continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        let buf=[];
        while(i<lines.length&&/^\s*\d+\.\s+/.test(lines[i])){buf.push('<li>'+mdInline(lines[i].replace(/^\s*\d+\.\s+/,''))+'</li>');i++;}
        out.push('<ol>'+buf.join('')+'</ol>'); continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (line.trim()==='') { i++; continue; }
      let para=[];
      while(i<lines.length&&lines[i].trim()!==''&&!/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])){para.push(lines[i]);i++;}
      out.push('<p>'+mdInline(para.join('<br>'))+'</p>');
    }
    return out.join('\n');
  }
  function renderMd(text) {
    lastType = 'md';
    hideAll(); mdBox.style.display = 'block';
    mdBox.innerHTML = mdToHtml(text);
    info.textContent = '已导入：' + lastName + '（Markdown）';
  }

  // ===== JS =====
  function jsHighlight(code) {
    let s = esc(code);
    s = s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="fv-jsc">$1</span>');
    s = s.replace(/(&quot;[^&]*?&quot;|'[^']*?'|`[^`]*?`)/g, '<span class="fv-jss">$1</span>');
    s = s.replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|import|export|default|delete|void)\b/g, '<span class="fv-jsk">$1</span>');
    s = s.replace(/\b(true|false|null|undefined|NaN)\b/g, '<span class="fv-jb">$1</span>');
    s = s.replace(/\b(0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/g, '<span class="fv-jsn">$1</span>');
    s = s.replace(/\b([A-Za-z_$][\w$]*)(?=\s*\()/g, '<span class="fv-jsfn">$1</span>');
    return s;
  }
  function renderJs(text) {
    lastType = 'js';
    hideAll(); jsBox.style.display = 'block';
    jsCode.innerHTML = jsHighlight(text);
    info.textContent = '已导入：' + lastName + '（JS 高亮）';
    showConsole();
    showTip('执行“全屏模式”可运行 JS 网页，或点击“JS注入”按钮在预览页运行');
  }

  // ===== HTML iframe =====
  function renderHtmlIframe(text) {
    lastType = 'html';
    hideAll(); iframe.style.display = 'block';
    iframe.removeAttribute('sandbox');
    iframe.srcdoc = text;
    info.textContent = '已导入：' + lastName + '（网页预览）';
    setTimeout(() => {
      try {
        const n = iframe.contentDocument && iframe.contentDocument.body ? iframe.contentDocument.body.innerHTML.length : 0;
        if (n < 10 && text.trim().length > 50) {
          showTip('空白检测，已切换全屏');
          renderHtmlFull(text);
        }
      } catch(e){}
    }, 700);
  }

  // ===== 全屏 Document.write（文本类通用） =====
  function fullscreenText(content, mimeFallback) {
    hideAll();
    info.textContent = '已导入：' + lastName + '（全屏模式）';
    let safeContent = content.replace(/<\/script/gi, '<\\/script');
    setTimeout(() => {
      document.open();
      document.write('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;margin:0;font:14px/1.6 system-ui}#fv-float{position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:#2f7d63;color:#fff;border:0;border-radius:20px;cursor:pointer}</style></head><body><button id="fv-float" onclick="location.href=\'https://fv-local-preview.invalid/\'">← 返回预览器</button>' + safeContent + '</body></html>');
      document.close();
    }, 30);
  }

  // ===== 二进制/特殊格式用 iframe 全屏 =====
  function fullscreenBinary
