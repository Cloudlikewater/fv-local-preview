// ==UserScript==
// @name         FV 本地文件预览器（浅色·固定入口版）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ========== 浅色主题样式 ==========
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font: 14px/1.5 -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: #f5f6fa; color: #333;
    }
    .fv-header {
      position: sticky; top: 0; z-index: 10;
      background: #ffffff; border-bottom: 1px solid #e0e0e0;
      padding: 10px 12px;
      display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    }
    .fv-header .title {
      font-weight: 600; font-size: 15px; color: #2f7d63;
      margin-right: 8px; white-space: nowrap;
    }
    .fv-header input[type=file] {
      flex: 1; min-width: 130px; font-size: 13px; color: #555;
      background: #fff; border: 1px solid #ccc; border-radius: 6px;
      padding: 6px 8px;
    }
    .fv-btn {
      padding: 7px 14px; border: 0; border-radius: 6px;
      font-size: 13px; cursor: pointer; white-space: nowrap;
      background: #2f7d63; color: #fff; transition: opacity .2s;
    }
    .fv-btn.secondary { background: #607d8b; }
    .fv-btn.danger { background: #d32f2f; }
    .fv-btn:hover { opacity: .85; }
    .fv-info {
      padding: 6px 12px; font-size: 12px; color: #777;
      background: #fff; border-bottom: 1px solid #f0f0f0;
    }
    /* iframe 区域 */
    #fv-frame {
      width: 100%; height: calc(100vh - 60px);
      border: 0; background: #ffffff; display: none;
    }
    /* JSON 区域 */
    #fv-json {
      margin: 0; padding: 12px;
      width: 100%; height: calc(100vh - 60px);
      overflow: auto; white-space: pre-wrap;
      background: #fafafa; color: #333;
      font: 13px/1.6 "SFMono-Regular", Consolas, monospace;
      display: none;
    }
    #fv-json .k { color: #0077aa; }   /* key */
    #fv-json .s { color: #d14; }      /* string */
    #fv-json .n { color: #c18401; }   /* number */
    #fv-json .b { color: #8250df; }   /* boolean/null */
    /* 提示气泡 */
    #fv-tip {
      position: fixed; left: 50%; bottom: 30px;
      transform: translateX(-50%);
      background: #333; color: #fff;
      padding: 8px 16px; border-radius: 20px;
      font-size: 13px; z-index: 999;
      display: none; box-shadow: 0 4px 12px rgba(0,0,0,.15);
    }
  `;
  document.head.appendChild(style);

  // ========== 构建 UI ==========
  document.body.innerHTML = `
    <div class="fv-header">
      <span class="title">📂 FV 本地预览</span>
      <input id="fv-file" type="file" accept=".html,.htm,.json,.txt">
      <button class="fv-btn secondary" id="fv-reload">重载</button>
      <button class="fv-btn secondary" id="fv-full">全屏HTML</button>
      <button class="fv-btn danger" id="fv-back">返回工具</button>
    </div>
    <div class="fv-info" id="fv-info">选择 html 文件将以网页渲染，选择 json 文件将格式化高亮</div>
    <iframe id="fv-frame"></iframe>
    <pre id="fv-json"></pre>
    <div id="fv-tip"></div>
  `;

  // ========== 获取元素 ==========
  const fileInput = document.getElementById('fv-file');
  const iframe = document.getElementById('fv-frame');
  const jsonPre = document.getElementById('fv-json');
  const info = document.getElementById('fv-info');
  const tip = document.getElementById('fv-tip');

  let lastText = '';
  let lastName = '';
  let currentMode = ''; // 'iframe' | 'full' | 'json'

  // ========== 工具函数 ==========
  function showTip(msg, duration = 2500) {
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
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  // ========== JSON 渲染 ==========
  function renderJson(text) {
    currentMode = 'json';
    iframe.style.display = 'none';
    jsonPre.style.display = 'block';

    // 先显示原文兜底
    jsonPre.textContent = text;
    info.textContent = `已导入：${lastName}（JSON 原文显示）`;

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
      info.textContent = `已导入：${lastName}（JSON 高亮显示）`;
    } catch (e) {
      showTip('JSON 解析失败，已显示原文');
    }
  }

  // ========== HTML 渲染（iframe 模式） ==========
  function renderHtmlIframe(text) {
    currentMode = 'iframe';
    jsonPre.style.display = 'none';
    iframe.style.display = 'block';

    // 去掉 sandbox 避免限制导致空白
    iframe.removeAttribute('sandbox');
    iframe.srcdoc = text;
    info.textContent = `已导入：${lastName}（iframe 渲染）`;

    // 自动检测空白并切全屏
    setTimeout(() => {
      try {
        const doc = iframe.contentDocument;
        const bodyLen = doc && doc.body ? doc.body.innerHTML.length : 0;
        console.log('[FV] iframe body:', bodyLen);
        if (bodyLen < 10 && text.trim().length > 50) {
          showTip('iframe 可能空白，已切换全屏模式');
          renderHtmlFullscreen(text);
        }
      } catch (e) {
        console.warn('[FV] 无法检查 iframe 内容', e);
      }
    }, 700);
  }

  // ========== HTML 渲染（全屏 document.write） ==========
  function renderHtmlFullscreen(text) {
    currentMode = 'full';
    iframe.style.display = 'none';
    jsonPre.style.display = 'none';
    info.textContent = `已导入：${lastName}（全屏渲染）`;

    // 渲染前写入一个临时返回按钮，隐藏1秒后消失
    setTimeout(() => {
      document.open();
      document.write(`<!doctype html><html><head><meta charset="utf-8">
        <style>
          #fv-return-btn{
            position:fixed!important; top:10px!important; right:10px!important;
            z-index:9999999!important; padding:8px 14px!important;
            background:rgba(47,125,99,.9)!important; color:#fff!important;
            border:none!important; border-radius:20px!important; font:14px system-ui!important;
            cursor:pointer!important; box-shadow:0 2px 8px rgba(0,0,0,.3)!important;
          }
        </style></head><body>
        <button id="fv-return-btn" onclick="location.href='https://fv-local-preview.invalid/'">← 返回预览器</button>
        ${text}
        </body></html>`);
      document.close();
    }, 30);
  }

  // ========== 统一入口 ==========
  function render(text) {
    const t = text.trim();
    if (/\.json$/i.test(lastName) || t.startsWith('{') || t.startsWith('[')) {
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
      showTip('读取失败：' + err);
    }
  });

  document.getElementById('fv-reload').onclick = () => {
    if (lastText) render(lastText);
    else showTip('请先选择文件');
  };

  document.getElementById('fv-full').onclick = () => {
    if (lastText) renderHtmlFullscreen(lastText);
    else showTip('请先选择文件');
  };

  document.getElementById('fv-back').onclick = () => {
    // 全屏模式下按钮是画面里面的返回按钮，这里作为中转页的返回
    location.href = 'https://fv-local-preview.invalid/';
  };

  // 若直接访问固定地址且带 ?path=xx.json，尝试预加载（可选功能）
  const qs = new URLSearchParams(location.search);
  if (qs.get('path')) {
    fetch(qs.get('path')).then(r => r.text()).then(t => {
      lastName = decodeURIComponent(qs.get('path').split('/').pop());
      lastText = t;
      render(t);
    }).catch(() => showTip('路径参数加载失败'));
  }

  console.log('[FV] 本地文件预览器（浅色固定版）已启动');
})();
