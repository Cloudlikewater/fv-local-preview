// ==UserScript==
// @name         FV 本地文件网页预览器（专用页优化版）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 只在该专用域名下执行
  if (!location.href.includes('fv-local-preview.invalid')) return;
  // 防止重复写入
  if (document.getElementById('fv-preview-app')) return;

  const appCode = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FV 本地文件网页预览器</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font: 14px/1.5 system-ui, sans-serif;
  background: #141414; color: #ddd;
  display: flex; flex-direction: column;
}
header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: #1e1e1e;
  border-bottom: 1px solid #333; flex-wrap: wrap;
}
header .logo { font-size: 16px; font-weight: 600; margin-right: auto; }
header button, header label {
  background: #2f7d63; color: #fff; border: 0;
  padding: 6px 12px; border-radius: 4px; font-size: 13px;
  cursor: pointer;
}
header label { display: inline-flex; align-items: center; gap: 4px; }
header input[type=file] { display: none; }
#toolbar {
  display: flex; gap: 6px; align-items: center;
  padding: 6px 10px; background: #191919; border-bottom: 1px solid #333;
  flex-wrap: wrap;
}
#fileList {
  width: 100%; font-size: 12px; color: #888;
  padding: 0 10px 4px; max-height: 80px; overflow: auto;
}
#status { font-size: 12px; color: #888; padding: 0 10px 4px; }
#content {
  flex: 1; position: relative; min-height: 0;
  display: flex; flex-direction: column;
}
#frame { flex: 1; width: 100%; border: 0; background: #fff; }
#pre {
  flex: 1; margin: 0; padding: 10px; overflow: auto;
  white-space: pre-wrap; background: #0f1115; color: #d6deeb;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
#pre .k { color: #7fdbca; }
#pre .s { color: #a5e075; }
#pre .n { color: #f0a45c; }
#pre .b { color: #c792ea; }
#empty {
  position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center;
  color: #777; font-size: 15px; text-align: center;
}
.hidden { display: none !important; }
button:active { opacity: .7; }
</style>
</head>
<body>

<header>
  <span class="logo">📂 FV 本地文件网页预览器</span>
  <button id="selectBtn">选择文件</button>
  <button id="openBtn">打开渲染</button>
</header>

<div id="toolbar">
  <label><input type="checkbox" id="inlineCss" checked> 自动内联CSS</label>
  <label><input type="checkbox" id="inlineJs" checked> 自动内联JS</label>
  <label><input type="checkbox" id="useIframe" checked> iframe模式</label>
</div>
<div id="fileList"></div>
<div id="status">尚未选择文件</div>

<div id="content">
  <div id="empty">选择 HTML/JSON 文件<br>HTML 可连同 CSS/JS 一起选择<br>脚本会自动内联资源</div>
  <iframe id="frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" class="hidden"></iframe>
  <pre id="pre" class="hidden"></pre>
</div>

<input type="file" id="fileInput" multiple accept=".html,.htm,.json,.css,.js,.txt" style="display:none">

<script>
(function () {
  const $ = id => document.getElementById(id);
  const fileInput = $('fileInput');
  const frame = $('frame');
  const pre = $('pre');
  const empty = $('empty');
  const fileList = $('fileList');
  const status = $('status');

  let allFiles = [];      // 本次选择的全部 File
  let mainFile = null;    // 主文件（.html 优先）
  let resources = {};     // 文件名 -> 文本内容

  // ===== 工具 =====
  function readText(file) {
    return new Promise((resolve, reject) => {
      if (file.text) return file.text().then(resolve).catch(reject);
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  function isJson(name) {
    return /\.json$/i.test(name);
  }

  function isHtml(name) {
    return /\.html?$/i.test(name);
  }

  function showStatus(msg) {
    status.textContent = msg;
  }

  // ===== 多文件选择 =====
  $('selectBtn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    allFiles = Array.from(fileInput.files);
    if (!allFiles.length) return;

    // 自动选主文件：优先 html
    mainFile = allFiles.find(f => isHtml(f.name)) || allFiles[0];

    // 显示选中文件列表
    fileList.innerHTML = allFiles.map((f, i) => {
      const tag = f === mainFile ? ' 🎯 主' : '';
      return '<span>' + f.name + ' (' + (f.size / 1024).toFixed(1) + 'KB)' + tag + '</span>';
    }).join('<br>');

    showStatus('已选择 ' + allFiles.length + ' 个文件，主文件：' + mainFile.name);
  });

  // ===== 打开渲染 =====
  $('openBtn').addEventListener('click', async () => {
    if (!mainFile) { showStatus('请先选择文件'); return; }

    showStatus('正在读取文件…');
    try {
      // 读取主文件
      const mainText = await readText(mainFile);
      // 读取所有辅助文件
      resources = {};
      for (const f of allFiles) {
        if (f !== mainFile) {
          resources[f.name] = await readText(f);
        }
      }

      if (isJson(mainFile.name) || /^\s*[[{]/.test(mainText.trim())) {
        renderJson(mainText);
      } else {
        let html = mainText;
        if ($('inlineCss').checked) html = inlineCss(html);
        if ($('inlineJs').checked) html = inlineJs(html);
        if (unresolvedList.length) {
          showStatus('未匹配到的资源：' + unresolvedList.join(', ') + '（可手动在HTML内内联）');
        }
        if ($('useIframe').checked) renderIframe(html);
        else renderFullscreen(html);
      }
    } catch (err) {
      alert('读取失败：' + err);
      showStatus('读取失败');
    }
  });

  let unresolvedList = [];

  // ===== CSS 内联 =====
  function inlineCss(html) {
    unresolvedList = [];
    return html.replace(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
      const name = href.split('/').pop().split('?')[0];
      if (resources[name]) {
        return '<style>\n' + resources[name] + '\n</style>';
      }
      unresolvedList.push(name);
      return match;
    });
  }

  // ===== JS 内联 =====
  function inlineJs(html) {
    return html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, (match, src) => {
      const name = src.split('/').pop().split('?')[0];
      if (resources[name]) {
        return '<script>\n' + resources[name] + '\n<\/script>';
      }
      return match;
    });
  }

  // ===== JSON 渲染 =====
  function renderJson(text) {
    empty.classList.add('hidden');
    frame.classList.add('hidden');
    pre.classList.remove('hidden');

    pre.textContent = text; // 先渲染原文保底
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;');
      pre.innerHTML = pretty.replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        m => /:$/.test(m) ? '<span class="k">' + m + '</span>'
          : /^"/.test(m) ? '<span class="s">' + m + '</span>'
          : /true|false|null/.test(m) ? '<span class="b">' + m + '</span>'
          : '<span class="n">' + m + '</span>'
      );
      showStatus('JSON 已渲染');
    } catch (e) {
      showStatus('JSON 非标准格式，显示原文');
    }
  }

  // ===== iframe 渲染 =====
  function renderIframe(html) {
    empty.classList.add('hidden');
    pre.classList.add('hidden');
    frame.classList.remove('hidden');
    frame.removeAttribute('sandbox');
    frame.srcdoc = html;
    showStatus('iframe 渲染完成');
  }

  // ===== 全屏渲染 =====
  function renderFullscreen(html) {
    const backBtn = '<div onclick="location.href=\'https://fv-local-preview.invalid/\'" style="position:fixed;top:10px;right:10px;z-index:99999;background:#2f7d63;color:#fff;padding:8px 12px;border-radius:4px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)">⬅ 返回预览器</div>';
    document.open();
    document.write(html + backBtn);
    document.close();
  }

  // 设置里点“全屏模式”时，可强制切换
  $('useIframe').addEventListener('change', () => {
    showStatus('下次打开渲染时生效');
  });

  // 关闭按钮（如果有）
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '↺';
  closeBtn.title = '重新打开预览器';
  closeBtn.onclick = () => location.href = 'https://fv-local-preview.invalid/';
  document.querySelector('header').appendChild(closeBtn);
})();
<\/script>
</body>
</html>`;

  // 写入页面
  document.open();
  document.write(appCode);
  document.close();
})();
