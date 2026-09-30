// ==UserScript==
// @name         FV 本地文件预览器（固定网址入口）
// @namespace    com.example.fv
// @match        https://fv-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 只有固定网址才接管，其他页面完全不干扰
  if (location.hostname !== 'fv-preview.invalid') return;

  // 防止重复执行
  if (window.__fvPreviewLoaded) return;
  window.__fvPreviewLoaded = true;

  // ========== 完整页面 ==========
  document.open();
  document.write(`<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FV 本地文件预览器</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 14px/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #f5f7fa;
    color: #333;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* 顶部工具栏 */
  .bar {
    background: #ffffff;
    border-bottom: 1px solid #e0e4e8;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    z-index: 10;
  }
  .bar .logo {
    font-size: 16px;
    font-weight: 700;
    color: #2f7d63;
    margin-right: 6px;
    white-space: nowrap;
  }
  .bar input[type=file] {
    flex: 1;
    min-width: 140px;
    padding: 6px 8px;
    background: #f8f9fb;
    border: 1px solid #ccd3dd;
    border-radius: 6px;
    color: #444;
    font-size: 13px;
  }
  .bar button {
    padding: 7px 14px;
    border: 0;
    border-radius: 6px;
    background: #2f7d63;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    transition: background .15s;
  }
  .bar button:hover { background: #256b54; }
  .bar button.secondary {
    background: #eef1f5;
    color: #333;
    border: 1px solid #ccd3dd;
  }
  .bar button.secondary:hover { background: #e0e6ed; }

  /* 提示信息 */
  .info {
    padding: 6px 14px;
    background: #eef7f3;
    color: #2f7d63;
    font-size: 13px;
    border-bottom: 1px solid #d8ece4;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .info.error { background: #fdeeee; color: #c0392b; border-bottom-color: #f5c6c6; }

  /* 内容区 */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
  }
  #frame {
    flex: 1;
    width: 100%;
    border: 0;
    background: #ffffff;
    min-height: 0;
  }
  #json {
    flex: 1;
    margin: 0;
    padding: 14px 18px;
    overflow: auto;
    background: #ffffff;
    color: #1e293b;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .key { color: #0f766e; }
  .string { color: #b45309; }
  .number { color: #1d4ed8; }
  .boolean, .null { color: #be185d; }

  /* 空状态提示 */
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #9aa7b5;
    font-size: 15px;
    padding: 20px;
    text-align: center;
  }
  .empty .icon { font-size: 48px; margin-bottom: 12px; }
  .empty .small { font-size: 13px; color: #b3bfcc; margin-top: 6px; }

  /* 弹窗提示 */
  .toast {
    position: fixed;
    left: 50%;
    bottom: 40px;
    transform: translateX(-50%);
    background: rgba(30,41,59,.9);
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 9999;
    display: none;
  }

  @media (max-width: 600px) {
    .bar .logo { font-size: 14px; }
    .bar button { padding: 6px 10px; }
  }
</style>
</head>
<body>

  <div class="bar">
    <span class="logo">📄 FV 预览</span>
    <input type="file" id="fileInput" accept=".html,.htm,.json,.txt">
    <button id="fullscreenBtn" title="用整个页面打开 html">全屏模式</button>
    <button id="reloadBtn" class="secondary">重载</button>
  </div>

  <div class="info" id="info">选择一个 HTML 或 JSON 文件，将以网页/高亮形式打开</div>

  <div class="content">
    <div class="empty" id="empty">
      <div class="icon">📂</div>
      <div>点击上方按钮选择文件</div>
      <div class="small">HTML 会以网页形式渲染，JSON 会格式化高亮</div>
    </div>
    <iframe id="frame" style="display:none"></iframe>
    <pre id="json" style="display:none"></pre>
  </div>

  <div class="toast" id="toast"></div>

<script>
(function () {
  'use strict';

  const fileInput = document.getElementById('fileInput');
  const frame = document.getElementById('frame');
  const jsonPre = document.getElementById('json');
  const empty = document.getElementById('empty');
  const info = document.getElementById('info');
  const reloadBtn = document.getElementById('reloadBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const toast = document.getElementById('toast');

  let lastText = '';
  let lastName = '';

  // ===== 工具 =====
  function showToast(msg, duration = 3000) {
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.style.display = 'none', duration);
  }

  function setInfo(msg, isError) {
    info.textContent = msg;
    info.className = 'info' + (isError ? ' error' : '');
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (file.text) {
        file.text().then(resolve).catch(reject);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  // ===== JSON 渲染 =====
  function highlightJson(text) {
    // 先保证原文可见
    jsonPre.textContent = text;
    jsonPre.style.display = 'block';
    frame.style.display = 'none';
    empty.style.display = 'none';

    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      jsonPre.innerHTML = pretty
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(
          /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
          m => /:$/.test(m) ? '<span class="key">' + m + '</span>'
            : /^"/.test(m) ? '<span class="string">' + m + '</span>'
            : /true|false|null/.test(m) ? '<span class="boolean">' + m + '</span>'
            : '<span class="number">' + m + '</span>'
        );
    } catch (e) {
      // 解析失败已显示原文
    }
  }

  // ===== HTML iframe 渲染 =====
  function renderHtmlIframe(text) {
    jsonPre.style.display = 'none';
    frame.style.display = 'block';
    empty.style.display = 'none';

    // 先显示，后赋值，防止 hidden 导致不渲染
    frame.removeAttribute('sandbox');
    frame.srcdoc = text;

    // 自动检测空白，空白则全屏打开
    setTimeout(() => {
      try {
        const doc = frame.contentDocument;
        const bodyLen = doc && doc.body ? doc.body.innerHTML.length : 0;
        if (bodyLen === 0 && text.trim().length > 0) {
          showToast('iframe 空白，已自动切换全屏模式');
          renderHtmlFullscreen(text);
        }
      } catch (e) {
        // 跨域读不到，忽略
      }
    }, 600);
  }

  // ===== HTML 全屏渲染 =====
  function renderHtmlFullscreen(text) {
    jsonPre.style.display = 'none';
    frame.style.display = 'none';
    empty.style.display = 'none';
    setInfo('已用全屏模式打开：' + lastName);
    document.open();
    document.write(text);
    document.close();
  }

  // ===== 统一入口 =====
  function render(text) {
    const trimmed = text.trim();
    if (/\.json$/i.test(lastName) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      setInfo('已导入：' + lastName + '（JSON 高亮）');
      highlightJson(text);
    } else {
      setInfo('已导入：' + lastName + '（HTML 网页模式）');
      renderHtmlIframe(text);
    }
  }

  // ===== 事件 =====
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastName = file.name;
    try {
      lastText = await readFile(file);
      render(lastText);
    } catch (err) {
      console.error('读取失败:', err);
      setInfo('读取失败：' + err.message, true);
    }
  });

  reloadBtn.addEventListener('click', () => {
    if (lastText) render(lastText);
    else setInfo('请先选择文件', true);
  });

  fullscreenBtn.addEventListener('click', () => {
    if (lastText) renderHtmlFullscreen(lastText);
    else setInfo('请先选择文件', true);
  });
})();
</script>
</body>
</html>`);
  document.close();
})();
