// ==UserScript==
// @name         FV 本地文件网页预览器（完整修复版）
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

  // ========== 样式 ==========
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
    .fv-bar label { color: #9aa; font-size: 12px; display: flex; align-items: center; gap: 4px; }
    #fv-frame {
      flex: 1; width: 100%; border: 0; background: #fff;
      min-height: 0; /* 防止 flex 子项溢出 */
    }
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
    .fv-tip {
      position: fixed; left: 50%; bottom: 60px; transform: translateX(-50%);
      background: #a33; color: #fff; padding: 8px 16px; border-radius: 6px;
      font-size: 13px; z-index: 2147483647; display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,.4);
    }
  `;
  document.head.appendChild(style);

  // ========== DOM 结构 ==========
  const fab = document.createElement('button');
  fab.id = 'fv-fab';
  fab.textContent = '📂';
  fab.title = 'FV 本地文件预览';

  const panel = document.createElement('div');
  panel.id = 'fv-panel';
  panel.innerHTML = `
    <div class="fv-bar">
      <input id="fv-file" type="file" accept=".html,.htm,.json,.txt">
      <button id="fv-fullscreen" title="如果 iframe 空白，用整页模式打开">全屏模式</button>
      <label><input type="checkbox" id="fv-auto" checked> iframe空白自动全屏</label>
      <button id="fv-reload">重载</button>
      <button class="fv-close" id="fv-close">关闭</button>
    </div>
    <div id="fv-info">选择 html/json 文件，将以网页/高亮形式打开</div>
    <iframe id="fv-frame" style="display:none"></iframe>
    <pre id="fv-json" style="display:none"></pre>
  `;

  const tip = document.createElement('div');
  tip.className = 'fv-tip';
  tip.id = 'fv-tip';

  document.body.appendChild(fab);
  document.body.appendChild(panel);
  document.body.appendChild(tip);

  // ========== 变量 ==========
  const fileInput = panel.querySelector('#fv-file');
  const iframe = panel.querySelector('#fv-frame');
  const jsonPre = panel.querySelector('#fv-json');
  const info = panel.querySelector('#fv-info');
  const autoCheck = panel.querySelector('#fv-auto');
  const fullscreenBtn = panel.querySelector('#fv-fullscreen');
  const reloadBtn = panel.querySelector('#fv-reload');
  const closeBtn = panel.querySelector('#fv-close');

  let lastText = '';
  let lastName = '';
  let lastIsJson = false;

  // ========== 工具函数 ==========
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
    lastIsJson = true;
    iframe.style.display = 'none';
    jsonPre.style.display = 'block';

    // 强制显示原文，保证不会空白
    jsonPre.textContent = text;
    info.textContent = `已导入：${lastName}（JSON）`;

    // 尝试高亮，失败不影响原文
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
      showTip('JSON 不是标准格式，显示原文');
    }
  }

  // ========== HTML 渲染：iframe+srcdoc ==========
  function renderHtmlIframe(text) {
    lastIsJson = false;
    jsonPre.style.display = 'none';
    iframe.style.display = 'block';

    // 去掉 sandbox，避免安全限制导致空白
    iframe.removeAttribute('sandbox');
    // 先显示再赋值，避免 hidden 导致的渲染问题
    iframe.srcdoc = text;
    info.textContent = `已导入：${lastName}（HTML iframe 模式）`;

    // 自动检测空白并全屏
    if (autoCheck.checked) {
      setTimeout(() => {
        try {
          const doc = iframe.contentDocument;
          const bodyLen = doc && doc.body ? doc.body.innerHTML.length : 0;
          console.log('[FV] iframe body 长度:', bodyLen);
          if (bodyLen === 0 && text.trim().length > 0) {
            showTip('iframe 空白，已自动切换全屏模式');
            fullscreenRender(text);
          }
        } catch (e) {
          // 跨域读不到，跳过自动检测
          console.warn('[FV] 无法读取 iframe 内容，跳过自动检测', e);
        }
      }, 600);
    }
  }

  // ========== HTML 渲染：全屏 document.write ==========
  function renderHtmlFullscreen(text) {
    lastIsJson = false;
    iframe.style.display = 'none';
    jsonPre.style.display = 'none';
    info.textContent = `已导入：${lastName}（HTML 全屏模式）`;

    // 保存中转页 URL，方便返回（虽然 document.write 后历史可能丢失，但尽量试试）
    // 用 setTimeout 确保渲染完整
    setTimeout(() => {
      document.open();
      document.write(text);
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

  // ========== 事件绑定 ==========
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

  fullscreenBtn.onclick = () => {
    if (lastText) renderHtmlFullscreen(lastText);
    else showTip('请先选择文件');
  };

  closeBtn.onclick = () => {
    panel.classList.remove('show');
    // 如果之前全屏替换了页面，关闭按钮就不存在了，这里仅用于中转页关闭
  };

  fab.onclick = () => panel.classList.add('show');

  // 窗口关闭前清理（中转页模式）
  window.addEventListener('beforeunload', () => {
    if (iframe.srcdoc) iframe.srcdoc = '';
  });

  console.log('[FV] 本地文件预览器已启动');
})();
