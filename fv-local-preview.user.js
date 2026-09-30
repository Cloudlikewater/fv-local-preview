// ==UserScript==
// @name         FV 本地文件网页预览器（网址+文件选择）
// @namespace    com.example.fv
// @match        *://*/*
// @match        file:///*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
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
    .fv-bar input[type=text] {
      flex: 1; min-width: 120px; padding: 6px 8px;
      background: #262626; color: #fff; border: 1px solid #444;
      border-radius: 4px; font-size: 13px;
    }
    .fv-bar input[type=file] { color: #ccc; flex: 1; min-width: 120px; }
    .fv-bar button {
      padding: 6px 10px; border: 0; border-radius: 4px;
      background: #376; color: #fff; cursor: pointer;
    }
    .fv-bar button.fv-close { background: #a33; }
    #fv-frame {
      flex: 1; width: 100%; border: 0; background: #fff;
      min-height: 0;
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
      background: #333; color: #fff; padding: 8px 16px; border-radius: 6px;
      font-size: 13px; z-index: 2147483647; display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,.4);
    }
    .fv-hint { font-size: 11px; color: #888; padding: 2px 8px; }
  `;
  document.head.appendChild(style);

  // ========== DOM ==========
  const fab = document.createElement('button');
  fab.id = 'fv-fab';
  fab.textContent = '📂';
  fab.title = 'FV 本地文件预览';

  const panel = document.createElement('div');
  panel.id = 'fv-panel';
  panel.innerHTML = `
    <div class="fv-bar">
      <input type="text" id="fv-url" placeholder="输入 file:// 或 content:// 地址，如 file:///sdcard/test.html">
      <button id="fv-urlopen">打开网址</button>
    </div>
    <div class="fv-bar">
      <input type="file" id="fv-file" accept=".html,.htm,.json,.txt">
      <button id="fv-fullscreen">全屏模式</button>
      <label><input type="checkbox" id="fv-auto" checked> 自动全屏</label>
      <button id="fv-reload">重载</button>
      <button class="fv-close" id="fv-close">关闭</button>
    </div>
    <div class="fv-hint">提示：网址方式读取 content:// 可能失败，建议用文件选择器；file:// 大部分可用。</div>
    <div id="fv-info">选择文件或输入网址</div>
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
  const urlInput = panel.querySelector('#fv-url');
  const urlOpenBtn = panel.querySelector('#fv-urlopen');
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

  function fetchUrl(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'text',
        overrideMimeType: 'text/plain; charset=utf-8',
        onload: (res) => {
          if (res.status >= 200 && res.status < 300 || res.status === 0) {
            resolve(res.responseText);
          } else {
            reject(new Error('HTTP ' + res.status));
          }
        },
        onerror: (err) => reject(err)
      });
    });
  }

  // ========== 渲染 ==========
  function renderJson(text) {
    iframe.style.display = 'none';
    jsonPre.style.display = 'block';
    jsonPre.textContent = text;
    info.textContent = `已加载：${lastName}（JSON）`;

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
      showTip('JSON 格式不标准，已显示原文');
    }
  }

  function renderHtmlIframe(text) {
    iframe.style.display = 'none';
    jsonPre.style.display = 'none';
    iframe.removeAttribute('sandbox');
    iframe.style.display = 'block';
    iframe.srcdoc = text;
    info.textContent = `已加载：${lastName}（HTML）`;

    if (autoCheck.checked) {
      setTimeout(() => {
        try {
          const doc = iframe.contentDocument;
          const bodyLen = doc && doc.body ? doc.body.innerHTML.length : 0;
          if (bodyLen === 0 && text.trim().length > 0) {
            showTip('iframe 空白，自动切换全屏');
            renderHtmlFullscreen(text);
          }
        } catch (e) { /* 跨域忽略 */ }
      }, 600);
    }
  }

  function renderHtmlFullscreen(text) {
    iframe.style.display = 'none';
    jsonPre.style.display = 'none';
    info.textContent = `已加载：${lastName}（全屏模式）`;
    setTimeout(() => {
      document.open();
      document.write(text);
      document.close();
    }, 50);
  }

  function render(text) {
    if (/\.json$/i.test(lastName) || /^\s*[[{]/.test(text.trim())) {
      renderJson(text);
    } else {
      renderHtmlIframe(text);
    }
  }

  // ========== 事件 ==========
  // 文件选择
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    lastName = file.name;
    try {
      lastText = await readFile(file);
      render(lastText);
    } catch (err) {
      alert('读取失败：' + err);
    }
  });

  // 网址打开
  urlOpenBtn.onclick = async () => {
    let url = urlInput.value.trim();
    if (!url) return;

    // 如果输入的是 /sdcard/xxx.html 自动补全为 file:///sdcard/xxx.html
    if (!/^(file|content|https?):\/\//i.test(url)) {
      url = 'file://' + url;
    }

    showTip('正在读取地址…');
    try {
      lastText = await fetchUrl(url);
      lastName = url.split('/').pop() || 'url';
      render(lastText);
      showTip('读取成功');
    } catch (err) {
      console.error('[FV] 网址读取失败', err);
      showTip('读取失败：' + err.message + '，请改用文件选择器', 5000);
    }
  };

  // 回车键触发打开网址
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') urlOpenBtn.click();
  });

  // 重载
  reloadBtn.onclick = () => {
    if (lastText) render(lastText);
    else showTip('请先选择文件或输入网址');
  };

  // 全屏
  fullscreenBtn.onclick = () => {
    if (lastText) renderHtmlFullscreen(lastText);
    else showTip('请先选择文件或输入网址');
  };

  // 关闭
  closeBtn.onclick = () => panel.classList.remove('show');

  // 悬浮球
  fab.onclick = () => panel.classList.add('show');

  // 清理
  window.addEventListener('beforeunload', () => {
    if (iframe.srcdoc) iframe.srcdoc = '';
  });

  console.log('[FV] 优化版已启动');
})();
