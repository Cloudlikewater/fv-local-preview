// ==UserScript==
// @name         FV 本地HTML/JSON中转台（单脚本）
// @namespace    com.fv.localpreview
// @version      1.0
// @description   触发页注入中转UI，GM_xhr读file/content，HTML渲染、JSON高亮
// @match        https://wy.3601.com/*
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_openInTab
// @run-at       document_idle
// ==/UserScript==

(function () {
  'use strict';

  // 避免重复注入
  if (document.getElementById('fv_local_panel')) return;

  GM_addStyle(`
    #fv_local_panel{position:fixed;top:0;left:0;right:0;z-index:2147483647;
      background:#0f0f0f;color:#ddd;font:14px/1.5 system-ui,sans-serif;
      border-bottom:1px solid #333;padding:8px;box-sizing:border-box}
    #fv_local_panel .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    #fv_local_panel input{flex:1;min-width:220px;background:#1c1c1c;color:#fff;
      border:1px solid #444;padding:8px;border-radius:4px}
    #fv_local_panel button{background:#277c7c;color:#fff;border:0;
      padding:8px 12px;border-radius:4px;cursor:pointer}
    #fv_local_panel button.alt{background:#444}
    #fv_local_panel iframe{width:100%;height:60vh;background:#fff;border:0;margin-top:8px;display:none}
    #fv_local_panel pre{white-space:pre-wrap;background:#000;color:#eee;
      padding:8px;border:1px solid #333;margin-top:8px;max-height:60vh;overflow:auto;display:none}
    #fv_local_panel .tip{color:#9aa;font-size:12px;margin-top:6px}
    .fv-j-key{color:#79e}.fv-j-str{color:#8f8}.fv-j-num{color:#f89}
    .fv-j-bool{color:#d7f}.fv-j-null{color:#c9f}
  `);

  const panel = document.createElement('div');
  panel.id = 'fv_local_panel';
  panel.innerHTML = `
    <div class="row">
      <input id="fv_path" placeholder="如 /sdcard/a.html、file:///sdcard/a.json、content://..." />
      <button id="fv_read">读并打开</button>
      <button id="fv_pick" class="alt">选本地文件</button>
      <button id="fv_hide" class="alt">收起</button>
    </div>
    <div class="row" style="margin-top:6px">
      <input id="fv_search" placeholder="文件名搜索（仅扫预设目录，逗号分隔多个）" />
      <input id="fv_dirs" value="/sdcard" style="flex:1;min-width:160px" placeholder="搜索根目录" />
      <button id="fv_dosearch">搜索</button>
    </div>
    <div id="fv_result_html" style="display:none"></div>
    <iframe id="fv_html"></iframe>
    <pre id="fv_json"></pre>
    <div id="fv_text" class="tip"></div>
    <div class="tip">file:// 走GM_xhr；content:// 先试GM_xhr，失败可用“选本地文件”。fv若把html/json抢成文本编辑器，请在fv浏览器地址栏打开本触发页。</div>
  `;
  document.body.appendChild(panel);

  const $ = id => document.getElementById(id);
  const pathEl = $('fv_path'), htmlBox = $('fv_html'), jsonBox = $('fv_json'),
        textBox = $('fv_text'), resultHtmlHolder = $('fv_result_html');

  function hideAll() {
    htmlBox.style.display = 'none';
    jsonBox.style.display = 'none';
    textBox.textContent = '';
    resultHtmlHolder.style.display = 'none';
    resultHtmlHolder.innerHTML = '';
  }

  function showHtml(text, mime) {
    hideAll();
    htmlBox.style.display = 'block';
    const blob = new Blob([text], { type: mime || 'text/html' });
    htmlBox.src = URL.createObjectURL(blob);
  }

  function jsonHighlight(obj) {
    return JSON.stringify(obj, null, 2)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/"(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
        m => {
          let cls = 'fv-j-num';
          if (/^"/.test(m)) cls = /:$/.test(m) ? 'fv-j-key' : 'fv-j-str';
          else if (/true|false/.test(m)) cls = 'fv-j-bool';
          else if (/null/.test(m)) cls = 'fv-j-null';
          return '<span class="' + cls + '">' + m + '</span>';
        });
  }

  function showJson(text) {
    hideAll();
    jsonBox.style.display = 'block';
    try { jsonBox.innerHTML = jsonHighlight(JSON.parse(text)); }
    catch (e) { jsonBox.textContent = text; }
  }

  function showText(t) { hideAll(); textBox.textContent = t; }

  // 统一用GM_xhr读
  function gmRead(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'text',
        overrideMimeType: 'text/plain; charset=utf-8',
        onload: r => {
          if (r.status >= 200 && r.status < 400) resolve(r.responseText);
          else reject(new Error('HTTP ' + r.status));
        },
        onerror: e => reject(new Error('GM_xhr错误:' + (e && e.error || e))
      });
    });
  }

  function normalizeUrl(input) {
    let s = input.trim();
    if (!s) return '';
    if (/^file:\/\//.test(s)) return s;
    if (/^content:\/\//.test(s)) return s;
    if (s.startsWith('/')) return 'file://' + s;
    // 相对或不带根：默认当sdcard
    return 'file:///sdcard/' + s.replace(/^\/+/, '');
  }

  async function openInput() {
    const url = normalizeUrl(pathEl.value);
    if (!url) { showText('请输入路径'); return; }
    try {
      const txt = await gmRead(url);
      if (/\.json$/i.test(url) || /^\s*[[{]/.test(txt)) showJson(txt);
      else if (/\.(html?|htm)$/i.test(url) || /<html[\s>]/i.test(txt)) showHtml(txt);
      else showText(txt);
    } catch (err) {
      showText('读取失败：' + err.message +
        '\ncontent://可能不被GM_xhr支持；可点“选本地文件”，或先把文件放到/sdcard再用file://。');
    }
  }

  // 文件选择器：不受file/content跨域限制，用户主动选
  $('fv_pick').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.html,.htm,.json,.txt,*/*';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const t = rd.result;
        if (/\.json$/i.test(f.name) || /^\s*[[{]/.test(t)) showJson(t);
        else if (/\.html?$/.test(f.name) || /<html[\s>]/i.test(t)) showHtml(t, 'text/html');
        else showText(t);
      };
      rd.readAsText(f);
    };
    inp.click();
  };

  $('fv_read').onclick = openInput;
  pathEl.addEventListener('keydown', e => { if (e.key === 'Enter') openInput(); });

  $('fv_hide').onclick = () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };

  // 简单“搜索”：WebView/脚本不能枚举目录时基本会失败，这里用GM_xhr尝试常见列表不可用；
  // 更现实做法是只支持“已知文件名直接打开”。下面做个提示版，不假装有全量搜索。
  $('fv_dosearch').onclick = () => {
    showText('纯ChromeXt脚本在WebView里通常无法安全枚举/content目录。' +
      '可用法：直接填完整file://路径打开；或用“选本地文件”按系统文件器挑。' +
      '若fv内核给了存储权限且你愿意列目录，再单独做file列表脚本。');
  };

  // 支持通过URL参数自动打开：触发页?fvopen=file:///sdcard/a.json
  try {
    const q = new URLSearchParams(location.search);
    const auto = q.get('fvopen') || q.get('path');
    if (auto) { pathEl.value = auto; openInput(); }
  } catch (e) {}
})();
