// ==UserScript==
// @name         FV 本地预览器（浅色·完整版）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 样式 ====================
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
    #fv-json{margin:0;padding:12px;width:100%;height:calc(100vh - 54px);overflow:auto;white-space:pre-wrap;background:#fafafa;color:#333;font:13px/1.6 "SFMono-Regular",Consolas,monospace;display:none}
    .fv-jk{color:#0077aa}
    .fv-js{color:#d14}
    .fv-jn{color:#c18401}
    .fv-jb{color:#8250df}
    #fv-md{width:100%;height:calc(100vh - 54px);overflow:auto;padding:18px 22px;background:#fff;display:none}
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
    #fv-js{width:100%;height:calc(100vh - 54px);overflow:auto;padding:0;background:#fff;display:none}
    #fv-js pre{margin:0;padding:14px;white-space:pre-wrap;font:13px/1.6 Consolas,monospace;color:#333}
    .fv-jsk{color:#c792ea}
    .fv-jss{color:#a5e075}
    .fv-jsc{color:#7a8290}
    .fv-jsn{color:#f0a45c}
    .fv-jsfn{color:#82aaff}
    #fv-tip{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:999;display:none;box-shadow:0 4px 12px rgba(0,0,0,.15)}
  `;
  document.head.appendChild(style);

  // ==================== DOM ====================
  document.body.innerHTML = `
    <div class="fv-head">
      <span class="fv-title">📄 FV 本地预览</span>
      <input id="fv-file" class="fv-file" type="file" accept=".html,.htm,.md,.markdown,.json,.js,.mjs,.txt">
      <button class="fv-btn sec" id="fv-mdbtn" style="display:none">MD网页</button>
      <button class="fv-btn sec" id="fv-jsrun" style="display:none">JS注入运行</button>
      <button class="fv-btn sec" id="fv-jsfull" style="display:none">JS全屏运行</button>
      <button class="fv-btn sec" id="fv-reload">重载</button>
      <button class="fv-btn ghost" id="fv-back">返回</button>
    </div>
    <div class="fv-info" id="fv-info">支持 html/json/md/js：html网页、json高亮、md渲染、js代码/运行</div>
    <iframe id="fv-frame"></iframe>
    <pre id="fv-json"></pre>
    <div id="fv-md"></div>
    <div id="fv-js"><pre id="fv-js-code"></pre></div>
    <div id="fv-tip"></div>
  `;

  // ==================== 引用 ====================
  const $ = id => document.getElementById(id);
  const fileInput = $('fv-file');
  const iframe = $('fv-frame');
  const jsonPre = $('fv-json');
  const mdBox = $('fv-md');
  const jsBox = $('fv-js');
  const jsCode = $('fv-js-code');
  const info = $('fv-info');
  const tip = $('fv-tip');

  let lastText = '';
  let lastName = '';

  // ==================== 工具 ====================
  function showTip(msg, duration = 2600) {
    tip.textContent = msg;
    tip.style.display = 'block';
    clearTimeout(tip._t);
    tip._t = setTimeout(() => tip.style.display = 'none', duration);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (file.text) {
        file.text().then(resolve).catch(reject);
        return;
      }
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ==================== JSON ====================
  function renderJson(text) {
    hideAll();
    jsonPre.style.display = 'block';
    jsonPre.textContent = text;
    info.textContent = '已导入：' + lastName + '（JSON 原文）';

    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      jsonPre.innerHTML = esc(pretty).replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        m => /:$/.test(m) ? '<span class="fv-jk">' + m + '</span>'
          : /^"/.test(m) ? '<span class="fv-js">' + m + '</span>'
          : /true|false|null/.test(m) ? '<span class="fv-jb">' + m + '</span>'
          : '<span class="fv-jn">' + m + '</span>'
      );
      info.textContent = '已导入：' + lastName + '（JSON 高亮）';
    } catch (e) {
      showTip('JSON 解析失败，显示原文');
    }
  }

  // ==================== HTML ====================
  function renderHtmlIframe(text) {
    hideAll();
    iframe.style.display = 'block';
    iframe.removeAttribute('sandbox');
    iframe.srcdoc = text;
    info.textContent = '已导入：' + lastName + '（iframe 网页）';

    setTimeout(() => {
      try {
        const doc = iframe.contentDocument;
        const len = doc && doc.body ? doc.body.innerHTML.length : 0;
        if (len < 10 && text.trim().length > 50) {
          showTip('iframe 疑似空白，切全屏');
          renderHtmlFull(text);
        }
      } catch (e) {}
    }, 700);
  }

  function renderHtmlFull(text) {
    hideAll();
    info.textContent = '已导入：' + lastName + '（全屏网页）';
    setTimeout(() => {
      document.open();
      document.write('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff}#fvret{position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;font:14px system-ui;cursor:pointer}</style></head><body><button id="fvret" onclick="location.href=\'https://fv-local-preview.invalid/\'">← 返回预览器</button>' + text + '</body></html>');
      document.close();
    }, 30);
  }

  // ==================== Markdown ====================
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
        let buf = [];
        let lang = (line.match(/^```(\w*)/) || [])[1] || '';
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
      if (h) {
        out.push('<h' + h[1].length + '>' + mdInline(h[2]) + '</h' + h[1].length + '>');
        i++;
        continue;
      }
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
    hideAll();
    mdBox.style.display = 'block';
    mdBox.innerHTML = mdToHtml(text);
    info.textContent = '已导入：' + lastName + '（Markdown 网页）';
  }

  // ==================== JS ====================
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

  function renderJsView(text) {
    hideAll();
    jsBox.style.display = 'block';
    jsBox.innerHTML = '<pre>' + jsHighlight(text) + '</pre>';
    info.textContent = '已导入：' + lastName + '（JS 只读高亮）';
    $('fv-jsrun').style.display = 'inline-block';
    $('fv-jsfull').style.display = 'inline-block';
  }

  function runJsInPreview(text) {
    try {
      const fn = new Function(text);
      fn();
      showTip('已在预览页注入执行（可访问本页 DOM）');
    } catch (e) {
      showTip('执行出错：' + e.message);
    }
  }

  function runJsFull(text) {
    hideAll();
    info.textContent = '已导入：' + lastName + '（JS 全屏运行）';
    const safeJs = text.replace(/<\/script>/gi, '<\\/script>');
    setTimeout(() => {
      document.open();
      document.write('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;font:14px/1.6 system-ui;padding:16px}#fvret{position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;cursor:pointer}</style></head><body><button id="fvret" onclick="location.href=\'https://fv-local-preview.invalid/\'">← 返回预览器</button><div id="fv-js-app"></div><script>try{\n' + safeJs + '\n}catch(e){document.body.insertAdjacentHTML("beforeend","<pre style=color:red>Error: "+e.message+"</pre>");}<\/script></body></html>');
      document.close();
    }, 30);
  }

  // ==================== 路由 ====================
  function hideAll() {
    iframe.style.display = 'none';
    jsonPre.style.display = 'none';
    mdBox.style.display = 'none';
    jsBox.style.display = 'none';
    $('fv-mdbtn').style.display = 'none';
    $('fv-jsrun').style.display = 'none';
    $('fv-jsfull').style.display = 'none';
  }

  function route(text) {
    const lower = lastName.toLowerCase();
    const trimmed = text.trim();

    if (lower.endsWith('.json') || /^\s*[[{]/.test(trimmed)) {
      renderJson(text);
      return;
    }
    if (lower.endsWith('.md') || lower.endsWith('.markdown') || /^#{1,6}\s|^\s*>\s|```|^[-*+]\s/m.test(trimmed)) {
      renderMd(text);
      return;
    }
    if (lower.endsWith('.js') || lower.endsWith('.mjs') || /^\s*(const|let|var|function|class|async|import|export)\s/.test(trimmed)) {
      renderJsView(text);
      return;
    }
    renderHtmlIframe(text);
  }

  // ==================== 事件 ====================
  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    lastName = file.name;
    try {
      lastText = await readFile(file);
      route(lastText);
    } catch (err) {
      showTip('读取失败：' + err);
    }
  });

  $('fv-reload').onclick = () => { if (lastText) route(lastText); else showTip('请先选择文件'); };
  $('fv-mdbtn').onclick = () => { if (lastText) renderMd(lastText); };
  $('fv-jsrun').onclick = () => { if (lastText) runJsInPreview(lastText); };
  $('fv-jsfull').onclick = () => { if (lastText) runJsFull(lastText); };
  $('fv-back').onclick = () => location.href = 'https://fv-local-preview.invalid/';

  console.log('[FV] 浅色完整版已启动');
})();
