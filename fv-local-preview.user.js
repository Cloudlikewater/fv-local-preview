// ==UserScript==
// @name         FV 本地文件预览器（固定网址入口）
// @namespace    www.fv.local
// @version      4.2
// @description  固定网址入口 https://fv-local-preview.invalid/ 本地文件全格式预览
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
'use strict';

if (location.hostname !== 'fv-local-preview.invalid') return;
if (window.__fvToolLoaded) return;
window.__fvToolLoaded = true;

var TOOL = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FV 本地预览</title><style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{background:#f4f5f7;color:#333;font:14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;min-height:100vh;overflow:hidden}' +
'#previewBox{position:fixed;inset:0;padding:0;margin:0}' +
'#placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#aab;font-size:16px;background:#f4f5f7}' +
'#frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;display:none}' +
'#fvFab{position:fixed;right:0;top:50%;transform:translateY(-50%);width:38px;height:60px;background:#2f7d63;color:#fff;border-radius:18px 0 0 18px;box-shadow:-3px 0 12px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;letter-spacing:1px;cursor:pointer;z-index:2147483646;border:1px solid rgba(255,255,255,.4);border-right:0;writing-mode:vertical-lr;opacity:.75;transition:all .25s}' +
'#fvFab:hover{opacity:1;width:46px}' +
'#fvOverlay{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:2147483647;display:none;align-items:center;justify-content:center;padding:16px}' +
'#fvOverlay.show{display:flex}' +
'#fvMenu{background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-radius:26px;box-shadow:0 16px 40px rgba(0,0,0,.25);padding:26px;width:100%;max-width:420px;max-height:80vh;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;border:1px solid rgba(255,255,255,.6)}' +
'.menu-title{grid-column:1/-1;text-align:center;font-size:18px;font-weight:700;color:#2f7d63;padding-bottom:6px}' +
'.menu-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:18px 8px;background:#f0f4f2;border:1px solid #e0e7e4;border-radius:18px;cursor:pointer;font-size:13px;color:#2c3e50;transition:background .2s,transform .15s}' +
'.menu-btn:hover{background:#e0ece6;transform:scale(1.02)}' +
'.menu-btn:active{transform:scale(.96)}' +
'.menu-btn .icon{font-size:24px}' +
'.menu-btn.wide{grid-column:1/-1;background:#2f7d63;color:#fff;font-weight:600}' +
'.menu-btn.wide:hover{background:#286b55}' +
'#fileInput{display:none}' +
'#toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .25s;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.2)}' +
'#toast.show{opacity:1}' +
'@media(max-width:480px){#fvMenu{grid-template-columns:1fr;padding:18px}.menu-btn{padding:14px 8px}.menu-title{font-size:16px}}' +
'</style></head><body>' +
'<div id="previewBox"><div id="placeholder">请打开右侧菜单选择本地文件</div><iframe id="frame"></iframe></div>' +
'<div id="fvFab">FV</div>' +
'<div id="fvOverlay">' +
'<div id="fvMenu">' +
'<div class="menu-title">📂 FV 本地预览</div>' +
'<button class="menu-btn" data-action="choose"><span class="icon">📁</span>选择文件</button>' +
'<button class="menu-btn" data-action="full"><span class="icon">🖥️</span>全屏打开</button>' +
'<button class="menu-btn" data-action="jsrun"><span class="icon">⚡</span>注入运行 JS</button>' +
'<button class="menu-btn" data-action="web"><span class="icon">🌐</span>iframe 网页</button>' +
'<button class="menu-btn" data-action="previous"><span class="icon">↩</span>返回预览器</button>' +
'<button class="menu-btn wide" data-action="close">✕ 关闭</button>' +
'</div></div>' +
'<input type="file" id="fileInput" accept=".html,.htm,.xhtml,.xht,.json,.md,.markdown,.js,.mjs,.pdf,.mhtml,.mht,.svg,.xml,.xsl,.xslt,.txt">' +
'<div id="toast"></div>' +
'</body></html>';

document.open();
document.write(TOOL);
document.close();

var $ = function(id) { return document.getElementById(id); };
var overlay = $('fvOverlay');
var fab = $('fvFab');
var fileInput = $('fileInput');
var frame = $('frame');
var placeholder = $('placeholder');
var toast = $('toast');

var currentFile = null;
var currentText = '';
var currentName = '';
var currentExt = '';
var currentBlobUrl = '';
var toastTimer = null;

function msg(s, ms) {
  toast.textContent = s;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('show'); }, ms || 2500);
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readFileAsText(file) {
  return new Promise(function(resolve, reject) {
    if (file.text) {
      file.text().then(resolve).catch(reject);
      return;
    }
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { reject(r.error); };
    r.readAsText(file);
  });
}

function showFrameSrc(src) {
  frame.style.display = 'block';
  placeholder.style.display = 'none';
  frame.removeAttribute('sandbox');
  frame.srcdoc = src;
}

function showFrameBlob(url) {
  frame.style.display = 'block';
  placeholder.style.display = 'none';
  frame.removeAttribute('sandbox');
  frame.src = url;
}

function showRawText(text) {
  showFrameSrc('<meta charset="utf-8"><body style="background:#fff;color:#333;font:13px/1.6 Consolas,monospace;white-space:pre-wrap;padding:16px">' + esc(text) + '</body>');
}

function fullWindow(html, title) {
  var fullHtml = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title || 'FV预览') + '</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;font:14px/1.6 system-ui}pre{white-space:pre-wrap;padding:16px}</style>' +
    '</head><body>' +
    '<button onclick="history.length>1?history.back():location.reload()" style="position:fixed;top:12px;right:12px;z-index:9999999;padding:8px 16px;background:#2f7d63;color:#fff;border:0;border-radius:20px;cursor:pointer">↩ 返回</button>' +
    html + '</body></html>';
  var url = 'data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml);
  var w = window.open(url, '_blank');
  if (!w) {
    msg('弹窗被拦截，已在 iframe 中打开');
    showFrameSrc(fullHtml);
  } else {
    msg('已在新窗口打开');
  }
}

function renderJson(text) {
  try {
    var pretty = JSON.stringify(JSON.parse(text), null, 2);
    fullWindow('<pre style="background:#fafafa;color:#333;font:13px/1.6 Consolas,monospace;white-space:pre-wrap;padding:16px">' + esc(pretty) + '</pre>', currentName);
  } catch (e) {
    fullWindow('<pre>' + esc(text) + '</pre>', currentName);
    msg('JSON 解析失败，已显示原文', 3000);
  }
}

function renderMarkdown(text) {
  var lines = text.split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^#{1,6}\s+/.test(line)) {
      var level = line.match(/^(#+)/)[1].length;
      out.push('<h' + level + ' style="margin:10px 0 4px">' + esc(line.replace(/^#+\s*/, '')) + '</h' + level + '>');
    } else if (/^\s*>\s?/.test(line)) {
      out.push('<blockquote style="margin:4px 0;padding:6px 12px;border-left:3px solid #2f7d63;background:#f0f7f4">' + esc(line.replace(/^\s*>\s?/, '')) + '</blockquote>');
    } else if (/^\s*[-*+]\s+/.test(line)) {
      out.push('<li>' + esc(line.replace(/^\s*[-*+]\s+/, '')) + '</li>');
    } else if (line.trim() === '') {
      out.push('<br>');
    } else {
      out.push('<p>' + esc(line) + '</p>');
    }
  }
  fullWindow('<article style="max-width:780px;margin:60px auto 20px;padding:0 16px">' + out.join('') + '</article>', currentName);
}

function renderJs(text) {
  fullWindow('<pre style="background:#fff;color:#333;font:13px/1.6 Consolas,monospace;white-space:pre-wrap;padding:16px">' + esc(text) + '</pre>', currentName);
}

function renderPdf(file) {
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = URL.createObjectURL(file);
  showFrameBlob(currentBlobUrl);
  msg('已打开 PDF：' + currentName);
}

function chooseFile(file) {
  if (!file) return;
  currentFile = file;
  currentName = file.name;
  currentExt = (file.name.split('.').pop() || '').toLowerCase();
  overlay.classList.remove('show');

  if (currentExt === 'pdf') {
    renderPdf(file);
    return;
  }
  if (['mhtml', 'mht', 'svg', 'xml', 'xsl', 'xslt', 'xhtml', 'xht'].indexOf(currentExt) >= 0) {
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(file);
    showFrameBlob(currentBlobUrl);
    msg('已打开：' + currentName);
    return;
  }

  readFileAsText(file).then(function(text) {
    currentText = text;
    var trim = text.trim();
    if (currentExt === 'json' || (trim[0] === '[' || trim[0] === '{')) {
      renderJson(text);
      return;
    }
    if (currentExt === 'md' || currentExt === 'markdown' || /^(#|\s*>|```)/m.test(trim)) {
      renderMarkdown(text);
      return;
    }
    if (currentExt === 'js' || currentExt === 'mjs' || /^\s*(const|let|var|function|class)\s/m.test(trim)) {
      renderJs(text);
      return;
    }
    showFrameSrc('<meta charset="utf-8"><body style="background:#fff;font:14px/1.6 system-ui;padding:16px">' + text + '</body>');
    msg('已打开：' + currentName);
  }).catch(function(e) {
    msg('读取文件失败：' + e.message, 3500);
  });
}

function fullscreenCurrent() {
  if (!currentFile && !currentText) {
    msg('请先选择文件');
    return;
  }
  if (currentExt === 'pdf') {
    if (currentBlobUrl) window.open(currentBlobUrl, '_blank');
    else if (currentFile) renderPdf(currentFile);
    return;
  }
  if (currentExt === 'mhtml' || currentExt === 'mht' || currentExt === 'svg' || currentExt === 'xml' || currentExt === 'xsl' || currentExt === 'xslt' || currentExt === 'xhtml' || currentExt === 'xht') {
    if (currentBlobUrl) window.open(currentBlobUrl, '_blank');
    return;
  }
  if (!currentText) {
    readFileAsText(currentFile).then(function(t) {
      currentText = t;
      var trim = t.trim();
      if (currentExt === 'json' || trim[0] === '[' || trim[0] === '{') renderJson(t);
      else if (currentExt === 'md' || currentExt === 'markdown' || /^(#|\s*>|```)/m.test(trim)) renderMarkdown(t);
      else if (currentExt === 'js' || currentExt === 'mjs' || /^\s*(const|let|var|function|class)\s/m.test(trim)) renderJs(t);
      else fullWindow('<body style="background:#fff;font:14px/1.6 system-ui;padding:16px">' + t + '</body>', currentName);
    });
    return;
  }
  var trim = currentText.trim();
  if (currentExt === 'json' || trim[0] === '[' || trim[0] === '{') renderJson(currentText);
  else if (currentExt === 'md' || currentExt === 'markdown' || /^(#|\s*>|```)/m.test(trim)) renderMarkdown(currentText);
  else if (currentExt === 'js' || currentExt === 'mjs' || /^\s*(const|let|var|function|class)\s/m.test(trim)) renderJs(currentText);
  else fullWindow('<body style="background:#fff;font:14px/1.6 system-ui;padding:16px">' + currentText + '</body>', currentName);
}

function runJsInjection() {
  if (!currentText || (currentExt !== 'js' && currentExt !== 'mjs')) {
    msg('当前不是 JS 文件，先选择 .js 文件');
    return;
  }
  overlay.classList.remove('show');
  var lines = [];
  var oldLog = console.log;
  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    lines.push(args.map(function(a) {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
    }).join(' '));
    msg('console.log: ' + lines.join(' | '), 4000);
  };
  try {
    var fn = new Function(currentText);
    fn();
    msg('JS 执行完成，' + (lines.length ? '捕获 ' + lines.length + ' 条日志' : '无 console.log 输出'), 3500);
  } catch (e) {
    msg('JS 执行错误：' + e.message, 4000);
  } finally {
    setTimeout(function() { console.log = oldLog; }, 4000);
  }
}

function closeTool() {
  overlay.classList.remove('show');
  if (window.parent && window.parent !== window) {
    try { window.parent.close(); } catch(e) {}
  }
  window.close();
}

fab.addEventListener('click', function() {
  overlay.classList.toggle('show');
});

overlay.addEventListener('click', function(e) {
  if (e.target === overlay) overlay.classList.remove('show');
});

document.querySelectorAll('.menu-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var action = btn.getAttribute('data-action');
    if (action === 'choose') fileInput.click();
    else if (action === 'full') fullscreenCurrent();
    else if (action === 'jsrun') runJsInjection();
    else if (action === 'web') {
      if (!currentFile && !currentText) { msg('请先选择文件'); return; }
      if (currentExt === 'pdf' || ['mhtml','mht','svg','xml','xsl','xslt','xhtml','xht'].indexOf(currentExt) >= 0) {
        if (currentBlobUrl) { showFrameBlob(currentBlobUrl); overlay.classList.remove('show'); }
        else if (currentFile) { overlay.classList.remove('show'); chooseFile(currentFile); }
      } else {
        if (currentText) { showFrameSrc('<meta charset="utf-8"><body style="background:#fff;font:14px/1.6 system-ui;padding:16px">' + currentText + '</body>'); overlay.classList.remove('show'); }
        else if (currentFile) { overlay.classList.remove('show'); chooseFile(currentFile); }
      }
    }
    else if (action === 'previous') {
      if (window.history.length > 1) { window.history.back(); }
      else { msg('没有上一页'); }
    }
    else if (action === 'close') closeTool();
  });
});

fileInput.addEventListener('change', function(e) {
  if (e.target.files.length) chooseFile(e.target.files[0]);
  fileInput.value = '';
});

})();
