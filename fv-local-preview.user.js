// ==UserScript==
// @name         FV 本地文件网页预览器（自包含）
// @namespace    com.example.fv
// @match        *://*/*
// @match        file:///*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 防止重复注入
  if (document.getElementById('fv-preview-root')) return;

  // ====== 样式 ======
  const style = document.createElement('style');
  style.textContent = `
    #fv-preview-root * { box-sizing: border-box; }
    #fv-fab {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 48px; height: 48px; border-radius: 50%;
      background: #2f7d63; color: #fff; border: none; font-size: 20px;
      cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.4);
    }
    #fv-panel {
      position: fixed; inset: 0; z-index: 2147483646;
      background: #141414; color: #ddd; font: 14px/1.5 system-ui;
      display: none; flex-direction: column;
    }
    #fv-panel.show { display: flex; }
    .fv-bar {
      padding: 8px; background: #1e1e1e; border-bottom: 1px solid #333;
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .fv-bar input[type=file] { color: #ccc; flex: 1; min-width: 120px; }
    .fv-bar button {
      padding: 6px 12px; border: 0; border-radius: 4px;
      background: #376; color: #fff; cursor: pointer;
    }
    .fv-bar button.fv-close { background: #a33; }
    #fv-frame { flex: 1; width: 100%; border: 0; background: #fff; }
    #fv-json {
      flex: 1; margin: 0; padding: 10px; overflow: auto;
      white-space: pre-wrap; background: #0f1115; color: #d6deeb;
      font-family: ui-monospace, Menlo, monospace;
    }
    #fv-json .k { color: #7fdbca; }
    #fv-json .s { color: #a5e075; }
    #fv-json .n { color: #f0a45c; }
    #fv-json .b { color: #c792ea; }
    #fv-info { font-size: 12px; color: #888; padding: 4px 8px; }
  `;
  document.head.appendChild(style);

  // ====== UI ======
  const fab = document.createElement('button');
  fab.id = 'fv-fab';
  fab.textContent = '📂';
  fab.title = 'FV 本地文件预览';

  const panel = document.createElement('div');
  panel.id = 'fv-panel';
  panel.innerHTML = `
    <div class="fv-bar">
      <input id="fv-file" type="file" accept=".html,.htm,.json,.txt">
      <button id="fv-reload">重载</button>
      <button id="fv-newtab">新标签</button>
      <button class="fv-close" id="fv-close">关闭</button>
    </div>
    <div id="fv-info">选择 html/json 文件，将以网页/高亮形式打开</div>
    <iframe id="fv-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" style="display:none"></iframe>
    <pre id="fv-json" style="display:none"></pre>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // ====== 逻辑 ======
  const fileInput = panel.querySelector('#fv-file');
  const iframe = panel.querySelector('#fv-frame');
  const jsonPre = panel.querySelector('#fv-json');
  const info = panel.querySelector('#fv-info');
  let blobUrl = null;
  let lastText = '';
  let lastName = '';

  function readFile(file) {
    return new Promise((res, rej) => {
      if (file.text) { file.text().then(res).catch(rej); return; }
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = () => rej(r.error);
      r.readAsText(file);
    });
  }

  function renderJson(text) {
    iframe.style.display = 'none';
    jsonPre.style.display = 'block';
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;');
      jsonPre.innerHTML = pretty.replace(
        /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        m => /:$/.test(m) ? '<span class="k">' + m + '</span>'
          : /^"/.test(m) ? '<span class="s">' + m + '</span>'
          : /true|false|null/.test(m) ? '<span class="b">' + m + '</span>'
          : '<span class="n">' + m + '</span>'
      );
    } catch { jsonPre.textContent = text; }
  }

  function renderHtml(text) {
    jsonPre.style.display = 'none';
    iframe.style.display = 'block';
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }));
    iframe.src = blobUrl;
  }

  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    lastName = file.name;
    try {
      lastText = await readFile(file);
      info.textContent = `已导入：${lastName} (${(file.size / 1024).toFixed(1)} KB)`;
      if (/\.json$/i.test(lastName) || /^\s*[[{]/.test(lastText)) renderJson(lastText);
      else renderHtml(lastText);
    } catch (err) { alert('读取失败：' + err); }
  });

  panel.querySelector('#fv-reload').onclick = () => {
    if (!lastText) return;
    /\.json$/i.test(lastName) || /^\s*[[{]/.test(lastText) ? renderJson(lastText) : renderHtml(lastText);
  };
  panel.querySelector('#fv-newtab').onclick = () => {
    if (blobUrl) { const w = window.open(blobUrl); if (!w) alert('弹窗被拦截'); }
  };
  panel.querySelector('#fv-close').onclick = () => panel.classList.remove('show');
  fab.onclick = () => panel.classList.add('show');

  // 清理
  window.addEventListener('beforeunload', () => { if (blobUrl) URL.revokeObjectURL(blobUrl); });
})();
