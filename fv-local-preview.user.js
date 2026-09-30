// ==UserScript==
// @name         FV 本地预览（专用页）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  // 直接重写整个页面
  document.write(`
    <!doctype html>
    <html lang="zh">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>FV 本地文件预览</title>
    <style>
      body{margin:0;font:14px/1.5 system-ui;background:#141414;color:#ddd}
      .bar{padding:8px;background:#1e1e1e;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      input[type=file]{color:#ccc}
      button{padding:7px 12px;border:0;border-radius:4px;background:#2f7d63;color:#fff}
      #info{font-size:12px;color:#888;padding:4px 8px}
      #frame{width:100%;height:calc(100vh - 52px);border:0;background:#fff}
      #json{margin:0;padding:10px;white-space:pre-wrap;background:#0f1115;color:#d6deeb;height:calc(100vh - 52px);overflow:auto}
      .k{color:#7fdbca}.s{color:#a5e075}.n{color:#f0a45c}.b{color:#c792ea}
    </style>
    </head>
    <body>
    <div class="bar">
      <input id="f" type="file" accept=".html,.htm,.json">
      <button id="reload">重载</button>
      <button id="tab">新标签打开</button>
    </div>
    <div id="info">选择 html 会以网页渲染；json 会格式化高亮</div>
    <iframe id="frame" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" hidden></iframe>
    <pre id="json" hidden></pre>
    <script>
      const f=document.getElementById('f'), frame=document.getElementById('frame'), json=document.getElementById('json');
      let blobUrl=null, lastText='', lastName='';
      f.onchange=async()=>{
        const file=f.files[0]; if(!file)return; lastName=file.name;
        lastText = await (file.text?file.text():new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsText(file);}));
        document.getElementById('info').textContent='已导入：'+lastName;
        if(/\\.json$/i.test(lastName)||/^\\s*[[{]/.test(lastText)){
          frame.hidden=true; json.hidden=false;
          const pretty=JSON.stringify(JSON.parse(lastText),null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;');
          json.innerHTML=pretty.replace(/("(?:\\\\u[a-fA-F0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(?:true|false|null)\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)/g,
            m=>/:$/.test(m)?'<span class="k">'+m+'</span>':/^"/.test(m)?'<span class="s">'+m+'</span>':/true|false|null/.test(m)?'<span class="b">'+m+'</span>':'<span class="n">'+m+'</span>');
        } else {
          json.hidden=true; frame.hidden=false;
          if(blobUrl)URL.revokeObjectURL(blobUrl);
          blobUrl=URL.createObjectURL(new Blob([lastText],{type:'text/html;charset=utf-8'}));
          frame.src=blobUrl;
        }
      };
      document.getElementById('reload').onclick=()=>f.onchange();
      document.getElementById('tab').onclick=()=>blobUrl&&open(blobUrl);
    <\/script>
    </body>
    </html>
  `);
  document.close();
})();
