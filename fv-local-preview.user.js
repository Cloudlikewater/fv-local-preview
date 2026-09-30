// ==UserScript==
// @name         FV 本地预览器（浅色·全屏·CX悬浮·修JS白屏）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ============ 基础样式 ============ */
  const baseStyle = document.createElement('style');
  baseStyle.textContent = `
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;font:14px/1.6 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6fa;color:#333}
    .fv-head{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04)}
    .fv-title{font-weight:600;color:#2f7d63;margin-right:6px;white-space:nowrap}
    .fv-file{flex:1;min-width:140px;font-size:13px;color:#555;background:#fff;border:1px solid #ccd0d6;border-radius:6px;padding:6px 8px}
    .fv-btn{padding:7px 12px;border:0;border-radius:6px;font-size:13px;cursor:pointer;background:#2f7d63;color:#fff;white-space:nowrap}
    .fv-btn.sec{background:#607d8b}
    .fv-btn.ghost{background:#eef2f5;color:#333;border:1px solid #ccd0d6}
    .fv-info{padding:6px 12px;font-size:12px;color:#777;background:#fff;border-bottom:1px solid #f0f0f0}
    #fv-frame{width:100%;height:calc(100vh - 54px);border:0;background:#fff;display:none}
    #fv-json{margin:0;padding:12px;width:100%;height:calc(100vh - 54px);overflow:auto;white-space:pre-wrap;background:#fafafa;color:#333;font:13px/1.6 Consolas,monospace;display:none}
    .fv-jk{color:#0077aa}.fv-js{color:#d14}.fv-jn{color:#c18401}.fv-jb{color:#8250df}
    #fv-md{width:100%;height:calc(100vh - 54px);overflow:auto;padding:18px 22px;background:#fff;display:none}
    #fv-md h1,#fv-md h2,#fv-md h3,#fv-md h4{color:#1f2d3d;line-height:1.3;margin:18px 0 10px}
    #fv-md h1{border-bottom:1px solid #eee;padding-bottom:6px}
    #fv-md p{margin:8px 0}#fv-md a{color:#2f7d63}
    #fv-md code{background:#f0f2f5;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:13px;color:#c0341d}
    #fv-md pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}
    #fv-md pre code{background:transparent;color:inherit;padding:0}
    #fv-md blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #2f7d63;background:#f0f7f4;color:#555}
    #fv-md ul,#fv-md ol{margin:8px 0 8px 22px}#fv-md img{max-width:100%;border-radius:6px}#fv-md hr{border:0;border-top:1px solid #eee;margin:16px 0}
    #fv-jsbox{width:100%;height:calc(100vh - 54px);overflow:auto;padding:12px;background:#0f1115;display:none}
    #fv-jsbox pre{margin:0;white-space:pre-wrap;font:13px/1.6 Consolas,monospace;color:#d6deeb}
    .fv-jsk{color:#c792ea}.fv-jss{color:#a5e075}.fv-jsc{color:#7a8290}.fv-jsn{color:#f0a45c}.fv-jsfn{color:#82aaff}
    #fv-result{width:100%;height:calc(100vh - 54px);overflow:auto;padding:12px;background:#fff;display:none}
    #fv-result .log{font:12px/1.5 Consolas,monospace;white-space:pre-wrap;margin:0 0 8px}
    #fv-result .ok{color:#2f7d63}#fv-result .err{color:#d32f2f}#fv-result .info{color:#607d8b}
    #fv-tip{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:99999;display:none;box-shadow:0 4px 12px rgba(0,0,0,.15)}
  `;
  document.head.appendChild(baseStyle);

  document.body.innerHTML = `
    <div class="fv-head">
      <span class="fv-title">📄 FV 本地预览</span>
      <input id="fv-file" class="fv-file" type="file" accept=".html,.htm,.md,.markdown,.json,.js,.mjs,.txt">
      <button class="fv-btn sec" id="fv-html-full" style="display:none">HTML全屏</button>
      <button class="fv-btn sec" id="fv-js-run" style="display:none">JS注入运行</button>
      <button class="fv-btn sec" id="fv-js-full" style="display:none">JS全屏运行</button>
      <button class="fv-btn sec" id="fv-reload">重载</button>
    </div>
    <div class="fv-info" id="fv-info">html/json/md/js：html可iframe+全屏，js可注入当前页/全屏iframe，右侧CX菜单可返回</div>
    <iframe id="fv-frame"></iframe>
    <pre id="fv-json"></pre>
    <div id="fv-md"></div>
    <div id="fv-jsbox"><pre id="fv-jscode"></pre></div>
    <div id="fv-result"></div>
    <div id="fv-tip"></div>
  `;

  const $ = id => document.getElementById(id);
  const fileInput=$('fv-file'), iframe=$('fv-frame'), jsonPre=$('fv-json'),
        mdBox=$('fv-md'), jsBox=$('fv-jsbox'), jsCode=$('fv-jscode'),
        resultBox=$('fv-result'), info=$('fv-info'), tip=$('fv-tip');
  let lastText='', lastName='';

  function showTip(m,d=2600){tip.textContent=m;tip.style.display='block';clearTimeout(tip._t);tip._t=setTimeout(()=>tip.style.display='none',d);}
  function readFile(file){return new Promise((res,rej)=>{if(file.text){file.text().then(res).catch(rej);return;}const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsText(file);});}
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function hideAll(){iframe.style.display='none';jsonPre.style.display='none';mdBox.style.display='none';jsBox.style.display='none';resultBox.style.display='none';
    $('fv-html-full').style.display='none';$('fv-js-run').style.display='none';$('fv-js-full').style.display='none';}

  /* ---------- JSON ---------- */
  function renderJson(text){
    hideAll();jsonPre.style.display='block';jsonPre.textContent=text;info.textContent='已导入：'+lastName+'（JSON原文）';
    try{const p=JSON.stringify(JSON.parse(text),null,2);
      jsonPre.innerHTML=esc(p).replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        m=>/:$/.test(m)?'<span class="fv-jk">'+m+'</span>':/^"/.test(m)?'<span class="fv-js">'+m+'</span>':/true|false|null/.test(m)?'<span class="fv-jb">'+m+'</span>':'<span class="fv-jn">'+m+'</span>');
      info.textContent='已导入：'+lastName+'（JSON高亮）';
    }catch(e){showTip('JSON解析失败，显示原文');}
  }

  /* ---------- HTML：iframe + 全屏兜底 ---------- */
  function renderHtmlIframe(text){
    hideAll();iframe.style.display='block';$('fv-html-full').style.display='inline-block';
    iframe.removeAttribute('sandbox');
    // 先用 srcdoc；部分 WebView 对 blob 不好，用 srcdoc 最稳
    iframe.srcdoc=text;info.textContent='已导入：'+lastName+'（iframe网页）';
    setTimeout(()=>{
      try{const d=iframe.contentDocument;const n=d&&d.body?d.body.innerHTML.length:0;
        if(n<10&&text.trim().length>50){showTip('iframe疑似空白，切iframe contentDocument写入');renderHtmlIframeDoc(text);}
      }catch(e){}
    },700);
  }
  function renderHtmlIframeDoc(text){
    try{
      const d=iframe.contentDocument;if(!d){renderHtmlFull(text);return;}
      d.open();d.write('<!doctype html><html><head><meta charset="utf-8"></head><body>'+text+'</body></html>');d.close();
      info.textContent='已导入：'+lastName+'（iframe document写入）';
    }catch(e){renderHtmlFull(text);}
  }
  function renderHtmlFull(text){
    hideAll();info.textContent='已导入：'+lastName+'（全屏网页）';
    // 全屏也用同源iframe，避免document.write整页清空导致CX悬浮丢；需要整页再用write
    document.getElementById('fv-frame').style.display='block';
    const f=document.getElementById('fv-frame');f.removeAttribute('sandbox');
    try{const d=f.contentDocument;d.open();d.write('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff}#fvret{position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;cursor:pointer}</style></head><body><button id="fvret" onclick="location.href=\'https://fv-local-preview.invalid/\'">← 返回预览器</button>'+text+'</body></html>');d.close();}
    catch(e){showTip('全屏失败：'+e.message);}
  }

  /* ---------- Markdown（轻量） ---------- */
  function mdInline(s){s=s.replace(/`([^`]+)`/g,(m,c)=>'<code>'+esc(c)+'</code>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>');
    s=s.replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>').s=s.replace(/(^|[^_])_([^_\n]+)_/g,'$1<em>$2</em>');
    s=s.replace(/~~([^~]+)~~/g,'<del>$1</del>');
    s=s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,(m,t,u)=>'<img alt="'+esc(t)+'" src="'+esc(u)+'">');
    s=s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,(m,t,u)=>'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+t+'</a>');return s;}
  function mdToHtml(md){const lines=md.replace(/\r\n/g,'\n').split('\n');let out=[],i=0;
    while(i<lines.length){let line=lines[i];
      if(/^```/.test(line)){let buf=[],lang=(line.match(/^```(\w*)/)||[])[1]||'';i++;while(i<lines.length&&!/^```/.test(lines[i])){buf.push(lines[i]);i++;}i++;out.push('<pre><code class="lang-'+esc(lang)+'">'+esc(buf.join('\n'))+'</code></pre>');continue;}
      if(/^\s*>\s?/.test(line)){let buf=[];while(i<lines.length&&/^\s*>\s?/.test(lines[i])){buf.push(lines[i].replace(/^\s*>\s?/,''));i++;}out.push('<blockquote>'+mdInline(buf.join('<br>'))+'</blockquote>');continue;}
      let h=line.match(/^(#{1,6})\s+(.*)$/);if(h){out.push('<h'+h[1].length+'>'+mdInline(h[2])+'</h'+h[1].length+'>');i++;continue;}
      if(/^\s*([-*+])\s+\[ \]\s+/.test(line)||/^\s*([-*+])\s+\[x\]\s+/.test(line)){let buf=[];while(i<lines.length&&/^\s*([-*+])\s+\[[ x]\]\s+/.test(lines[i])){let done=/\[x\]/i.test(lines[i]);let t=lines[i].replace(/^\s*([-*+])\s+\[[ x]\]\s+/,'');buf.push('<li style="list-style:none;margin-left:-18px"><input type="checkbox" disabled'+(done?' checked':'')+'> '+mdInline(t)+'</li>');i++;}out.push('<ul>'+buf.join('')+'</ul>');continue;}
      if(/^\s*([-*+])\s+/.test(line)){let buf=[];while(i<lines.length&&/^\s*([-*+])\s+/.test(lines[i])){buf.push('<li>'+mdInline(lines[i].replace(/^\s*([-*+])\s+/,''))+'</li>');i++;}out.push('<ul>'+buf.join('')+'</ul>');continue;}
      if(/^\s*\d+\.\s+/.test(line)){let buf=[];while(i<lines.length&&/^\s*\d+\.\s+/.test(lines[i])){buf.push('<li>'+mdInline(lines[i].replace(/^\s*\d+\.\s+/,''))+'</li>');i++;}out.push('<ol>'+buf.join('')+'</ol>');continue;}
      if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){out.push('<hr>');i++;continue;}
      if(line.trim()===''){i++;continue;}
      let para=[];while(i<lines.length&&lines[i].trim()!==''&&!/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s|[-*_]\s*[-*_])/.test(lines[i])){para.push(lines[i]);i++;}out.push('<p>'+mdInline(para.join('<br>'))+'</p>');
    }return out.join('\n');}
  function renderMd(text){hideAll();mdBox.style.display='block';mdBox.innerHTML=mdToHtml(text);info.textContent='已导入：'+lastName+'（Markdown网页）';}

  /* ---------- JS 高亮 ---------- */
  function jsHighlight(code){let s=esc(code);
    s=s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,'<span class="fv-jsc">$1</span>');
    s=s.replace(/(&quot;[^&]*?&quot;|'[^']*?'|`[^`]*?`)/g,'<span class="fv-jss">$1</span>');
    s=s.replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|import|export|default|delete|void)\b/g,'<span class="fv-jsk">$1</span>');
    s=s.replace(/\b(true|false|null|undefined|NaN)\b/g,'<span class="fv-jb">$1</span>');
    s=s.replace(/\b(0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/g,'<span class="fv-jsn">$1</span>');
    s=s.replace(/\b([A-Za-z_$][\w$]*)(?=\s*\()/g,'<span class="fv-jsfn">$1</span>');return s;}

  /* ---------- JS 注入运行（当前预览页，有结果/报错） ---------- */
  function runJsInPage(text){
    hideAll();resultBox.style.display='block';resultBox.innerHTML='';
    const log=(cls,msg)=>{const p=document.createElement('div');p.className='log '+cls;p.textContent=msg;resultBox.appendChild(p);resultBox.scrollTop=resultBox.scrollHeight;};
    log('info','在预览页执行，可访问本页DOM/console。');
    const origConsole={};
    ['log','warn','error','info'].forEach(k=>{origConsole[k]=console[k];console[k]=function(...a){log(k==='error'?'err':(k==='warn'?'info':'ok'),'console.'+k+': '+a.map(x=>typeof x==='object'?JSON.stringify(x):x).join(' '));origConsole[k].apply(console,a);};});
    let ret;
    try{
      // 包一层：支持return；支持异步promise输出
      const fn=new Function('console','document','window','location',text+'\n;return (typeof __fv_ret__!=="undefined")?__fv_ret__:undefined;');
      ret=fn(console,document,window,location);
      if(ret&&typeof ret.then==='function'){ret.then(r=>log('ok','Promise返回值: '+((typeof r==='object')?JSON.stringify(r):r))).catch(e=>log('err','Promise错误: '+e.message));}
      else if(ret!==undefined){log('ok','返回值: '+((typeof ret==='object')?JSON.stringify(ret):ret));}
      log('ok','执行完成（若代码只定义函数/变量，不会改页面；要改页面请操作document，例如插入元素/改样式）');
    }catch(e){log('err','执行错误: '+e.message);}
    finally{setTimeout(()=>{'log,warn,error,info'.split(',').forEach(k=>console[k]=origConsole[k]);},500);}
  }

  /* ---------- JS 全屏运行（同源iframe，修白屏） ---------- */
  function looksFullHtml(text){return /<html[\s>]/i.test(text)||/<body[\s>]/i.test(text)||/<head[\s>]/i.test(text);}
  function runJsFull(text){
    hideAll();iframe.style.display='block';$('fv-js-full').style.display='inline-block';
    iframe.removeAttribute('sandbox');
    // 自动判断：像完整HTML就当网页；像纯JS就包成可运行页面
    let doc;
    if(looksFullHtml(text)){
      doc='<!doctype html><html><head><meta charset="utf-8"><style>#fvret{position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;cursor:pointer}</style></head>'+text.replace(/<\/body>/i,'<button id="fvret" onclick="location.href=\'https://fv-local-preview.invalid/\'">← 返回预览器</button></body>');
    }else{
      doc='<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;font:14px/1.6 system-ui;padding:16px}#fvret{position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;cursor:pointer}pre{background:#0f1115;color:#d6deeb;padding:10px;border-radius:8px;white-space:pre-wrap}</style></head><body><button id="fvret" onclick="location.href=\'https://fv-local-preview.invalid/\'">← 返回预览器</button><div id="app"></div><pre id="err"></pre><script>try{\n'+text+'\n}catch(e){document.getElementById("err").textContent="Error: "+(e&&e.stack||e);}\<\/script></body></html>';
    }
    // 用 contentDocument 写，避免已load后document.write白屏
    setTimeout(()=>{
      try{const d=iframe.contentDocument;if(!d){iframe.srcdoc=doc;return;}d.open();d.write(doc);d.close();info.textContent='已导入：'+lastName+'（JS全屏iframe）';}
      catch(e){iframe.srcdoc=doc;info.textContent='JS全屏回退srcdoc：'+e.message;}
    },30);
  }

  /* ---------- 路由 ---------- */
  function route(text){
    const low=lastName.toLowerCase(),t=text.trim();
    if(low.endsWith('.json')||/^\s*[[{]/.test(t))return renderJson(text);
    if(low.endsWith('.md')||low.endsWith('.markdown')||/^#{1,6}\s|^\s*>\s|```|^[-*+]\s/m.test(t))return renderMd(text);
    if(low.endsWith('.js')||low.endsWith('.mjs')||/^\s*(const|let|var|function|class|async|import|export)\s/.test(t)){
      hideAll();jsBox.style.display='block';jsCode.innerHTML=jsHighlight(text);
      info.textContent='已导入：'+lastName+'（JS高亮）';
      $('fv-js-run').style.display='inline-block';$('fv-js-full').style.display='inline-block';return;
    }
    renderHtmlIframe(text);
  }

  fileInput.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;lastName=f.name;
    try{lastText=await readFile(f);route(lastText);}catch(err){showTip('读取失败：'+err);}});
  $('fv-reload').onclick=()=>{if(lastText)route(lastText);else showTip('请先选择文件');};
  $('fv-html-full').onclick=()=>{if(lastText)renderHtmlFull(lastText);};
  $('fv-js-run').onclick=()=>{if(lastText)runJsInPage(lastText);};
  $('fv-js-full').onclick=()=>{if(lastText)runJsFull(lastText);};

  /* ============ 右侧CX风格悬浮菜单（借鉴提取器UI） ============ */
  function initCX(){
    if(document.getElementById('cx-fv-host'))return;
    const host=document.createElement('div');host.id='cx-fv-host';
    host.style='position:fixed;top:50%;right:0;z-index:2147483647;user-select:none;';
    let shadow;
    try{shadow=host.attachShadow({mode:'open'});}catch(e){shadow=host;host.style.all='initial';}
    document.body.appendChild(host);

    const getTheme=()=>{
      const dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
      return dark
        ?{bg:'rgba(32,32,32,.78)',item:'rgba(55,55,55,.6)',text:'#fff',accent:'#60cdff',border:'rgba(255,255,255,.12)',idle:'rgba(255,255,255,.06)'}
        :{bg:'rgba(255,255,255,.78)',item:'rgba(245,245,245,.6)',text:'#000',accent:'#2f7d63',border:'rgba(0,0,0,.08)',idle:'rgba(0,0,0,.04)'};
    };
    const st=document.createElement('style');
    const paint=()=>{const t=getTheme();st.textContent=`
      :host{all:initial}
      #btn{position:absolute;right:0;transform:translateY(-50%);width:32px;height:50px;background:${t.accent};color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font:bold 12px system-ui;box-shadow:0 2px 10px rgba(0,0,0,.2);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.2);border-right:none;transition:all .4s;opacity:1}
      #btn.idle{background:${t.idle};color:${t.text};opacity:.25;box-shadow:none;border-color:${t.border}}
      #btn:hover{width:44px;opacity:1;background:${t.accent};color:#fff}
      .ov{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
      .ct{width:86%;max-width:420px;max-height:76vh;background:${t.bg};border:1px solid ${t.border};border-radius:22px;padding:16px;display:grid;gap:10px;overflow:auto;backdrop-filter:blur(30px);color:${t.text}}
      .it{padding:14px;background:${t.item};border:1px solid ${t.border};border-radius:12px;font:600 14px system-ui;text-align:center;cursor:pointer}
      .it:hover{background:${t.accent};color:#fff}
      .cl{grid-column:1/-1;text-align:center;padding:12px;color:${t.accent};font:bold 14px system-ui;cursor:pointer;border-top:1px solid ${t.border}}
    `;};
    paint();shadow.appendChild(st);

    const btn=document.createElement('div');btn.id='btn';btn.textContent='CX';shadow.appendChild(btn);
    let idle;const reset=()=>{btn.classList.remove('idle');clearTimeout(idle);idle=setTimeout(()=>{if(!shadow.querySelector('.ov'))btn.classList.add('idle');},3000);};
    btn.onmouseenter=reset;
    let sy=null,startTop=0,drag=false;
    btn.ontouchstart=e=>{drag=true;sy=e.touches[0].clientY;startTop=host.offsetTop;btn.style.transition='none';reset();};
    window.ontouchmove=e=>{if(drag){host.style.top=(startTop+e.touches[0].clientY-sy)+'px';}};
    window.ontouchend=()=>{if(drag){drag=false;btn.style.transition='all .4s';host.style.top=Math.max(50,Math.min(innerHeight-50,host.offsetTop))+'px';reset();}};

    btn.onclick=()=>{
      if(shadow.querySelector('.ov'))return;
      const ov=document.createElement('div');ov.className='ov';
      const ct=document.createElement('div');ct.className='ct';ct.onclick=e=>e.stopPropagation();
      const items=[
        ['返回预览器主页',()=>location.href='https://fv-local-preview.invalid/'],
        ['返回浏览器/上一页',()=>history.length>1?history.back():showTip('无历史可返回'))],
        ['HTML全屏重渲染',()=>{if(lastText)renderHtmlFull(lastText);else showTip('请先选html');}],
        ['JS全屏运行',()=>{if(lastText)runJsFull(lastText);else showTip('请先选js');}],
        ['JS注入当前页',()=>{if(lastText)runJsInPage(lastText);else showTip('请先选js');}],
        ['重载当前文件',()=>{if(lastText)route(lastText);else showTip('请先选文件');}]
      ];
      items.forEach(([label,cb])=>{const d=document.createElement('div');d.className='it';d.textContent=label;d.onclick=()=>{close();try{cb();}catch(err){showTip('菜单操作失败：'+err);}};ct.appendChild(d);});
      const closeBtn=document.createElement('div');closeBtn.className='cl';closeBtn.textContent='关闭';
      const close=()=>{ov.remove();reset();};closeBtn.onclick=close;ct.appendChild(closeBtn);
      ov.onclick=close;ov.appendChild(ct);shadow.appendChild(ov);reset();
    };
    if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paint);
    reset();
  }
  if(document.readyState!=='loading')initCX();else window.addEventListener('DOMContentLoaded',initCX);

  console.log('[FV] 全屏+CX悬浮+JS修复版启动');
})();
