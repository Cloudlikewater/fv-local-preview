// ==UserScript==
// @name         FV 本地文件预览器（固定网址应用版）
// @namespace    com.example.fv.app
// @match        https://fv-local-preview.invalid/*
// @match        http://fv-local-preview.invalid/*
// @match        https://example.com/fv*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 防止重复初始化
  if (document.getElementById('fv-app')) return;

  // 把原页面完全清空，改成独立预览工具
  const oldBody = document.body;
  oldBody.innerHTML = '';

  // ========== 构建界面 ==========
  oldBody.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; background: #141414; }
      body { font: 14px/1.5 system-ui, sans-serif; color: #ddd; display: flex; flex-direction: column; }

      #fv-top {
        padding: 8px; background: #1e1e1e; border-bottom: 1px solid #333;
        display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
      }
      #fv-file { color: #ccc; flex: 1; min-width: 120px; }
      .fv-btn {
        padding: 7px 12px; border: 0; border-radius: 4px;
        background: #2f7d63; color: #fff; cursor: pointer; font-size: 13px;
      }
      .fv-btn:hover { background: #3a9a7c; }
      .fv-btn.orange { background: #b66; }
      .fv-btn.orange:hover { background: #c77; }
      .fv-check { font-size: 12px; color: #9aa; display: flex; align-items: center; gap: 4px; }

      #fv-info {
        padding: 4px 10px; font-size: 12px; color: #888;
        background: #1a1a1a; border-bottom: 1px solid #222;
      }
      #fv-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }

      #fv-frame {
        flex: 1; width: 100%; border: 0; background: #fff;
        display: none; min-height: 0;
      }
      #fv-json {
        flex: 1; margin: 0; padding: 10px; overflow: auto;
        white-space: pre-wrap; background: #0f1115; color: #d6deeb;
        font-family: ui-monospace, Menlo, monospace; display: none;
      }
      #fv-json .k { color: #7fdbca; }
      #fv-json .s { color: #a5e075; }
      #fv-json .n { color: #f0a45c; }
      #fv-json .b { color: #c792ea; }

      .fv-tip {
        position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%);
        background: #a33; color: #fff; padding: 8px 16px; border-radius: 6px;
        font-size: 13px; z-index: 2147483647; display: none;
        box-shadow: 0 4px 12px rgba(0,0,0,.4);
      }
    </style>

    <div id="fv-app">
      <div id="fv-top">
        <input id="fv-file" type="file" accept=".html,.htm,.json,.txt">
        <button class="fv-btn" id="fv-reload">重载</button>
        <button class="fv-btn orange" id="fv-fullscreen" title="直接替换整个页面显示html">全屏模式</button>
        <label class="fv-check"><input type="checkbox" id="fv-auto" checked> iframe空白自动全屏</label>
      </div>
      <div id="fv-info">选择 html/json 文件，将以网页/高亮形式打开</div>
      <div id="fv-body">
        <iframe id="fv-frame"></iframe>
        <pre id="fv-json"></pre>
      </div>
    </div>
    <div class="fv-tip" id="fv-tip"></div>
  `;

  // ========== 获取元素 ==========
  const fileInput = document.getElementById('fv-file');
  const iframe = document.getElementById('fv-frame');
  const jsonPre = document.getElementById('fv-json');
  const info = document.getElementById('fv-info');
  const tip = document.getElementById('fv-tip');
  const autoCheck = document.getElementById('fv-auto');
  const fullBtn = document.getElementById('fv-fullscreen');
  const reloadBtn = document.getElementById('fv-reload');

  let lastText = '';
  let lastName = '';

  // ========== 工具 ==========
  function showTip(msg, duration = 3000) {
    tip.textContent = msg;
    tip.style.display = 'block';
    clearTimeout(tip._timer);
    tip._timer = setTimeout(() => tip.style.display = 'none', duration);
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

  // ========== JSON 渲染 ==========
  function renderJson(text) {
    iframe.style.display = 'none';
    jsonPre.style.display = 'block';
    jsonPre.textContent = text;
    info.textContent = `已导入：${lastName}（JSON）`;
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
    } catch (e) {
      showTip('不是标准 JSON，已显示原文');
    }
  }

  // ========== iframe 渲染 ==========
  function renderHtmlIframe(text) {
    jsonPre.style.display = 'none';
    iframe.style.display = 'block';
    iframe.removeAttribute('sandbox');
    iframe.srcdoc = text;
    info.textContent = `已导入：${lastName}（iframe 模式）`;

    if (autoCheck.checked) {
      setTimeout(() => {
        try {
          const doc = iframe.contentDocument;
          const bodyLen = doc && doc.body ? doc.body.innerHTML.length : 0;
          if (bodyLen === 0 && text.trim().length > 0) {
            showTip('iframe 空白，已自动切换全屏模式');
            renderHtmlFull(text);
          }
        } catch (e) {
          console.warn('[FV] 无法读取iframe内容，跳过自动检测', e);
        }
      }, 600);
    }
  }

  // ========== 全屏渲染 ==========
  function renderHtmlFull(text) {
    iframe.style.display = 'none';
    jsonPre.style.display = 'none';
    info.textContent = `已导入：${lastName}（全屏模式）`;

    const backBtn = `
      <style>#fv-back-btn{position:fixed;top:8px;left:8px;z-index:999999;background:#2f7d63;color:#fff;border:0;border-radius:4px;padding:8px 14px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}</style>
      <button id="fv-back-btn" onclick="location.href='https://fv-local-preview.invalid/'">← 返回预览器</button>
    `;

    let fullHtml = text;
    if (/<body[^>]*>/i.test(fullHtml)) {
      fullHtml = fullHtml.replace(/<body[^>]*>/i, match => match + backBtn);
    } else {
      fullHtml = backBtn + fullHtml;
    }

    setTimeout(() => {
      document.open();
      document.write(fullHtml);
      document.close();
    }, 50);
  }

  // ========== 统一入口 ==========
  function render(text) {
    if (/\.json$/i.test(lastName) || /^\s*[[{]/.test(text.trim())) {
      renderJson(text);
    } else {
      renderHtmlIframe(text);
    }
  }

  // ========== 事件 ==========
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastName = file.name;
    try {
      lastText = await readFile(file);
      console.log('[FV] 读取成功:', lastName, '长度:', lastText.length);
      render(lastText);
    } catch (err) {
      console.error('[FV] 读取失败:', err);
      alert('读取失败：' + err);
    }
  });

  reloadBtn.onclick = () => {
    if (lastText) render(lastText);
    else showTip('请先选择文件');
  };

  fullBtn.onclick = () => {
    if (lastText) renderHtmlFull(lastText);
    else showTip('请先选择文件');
  };
})();
