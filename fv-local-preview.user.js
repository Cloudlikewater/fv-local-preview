// ==UserScript==
// @name         FV 本地全格式预览器（浅色·CX悬浮·全屏·JS运行）
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ============ 基础样式 ============ */
  const style = document.createElement('style');
  style.textContent = `
    *{box-sizing:border-box}
    html,body{margin:0;background:#f5f6fa;color:#333;font:14px/1.6 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
    .fv-head{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .fv-title{font-weight:700;color:#2f7d63;margin-right:6px;white-space:nowrap}
    .fv-file{flex:1;min-width:160px;padding:6px 8px;border:1px solid #ccd0d6;border-radius:6px;background:#fff;color:#555;font-size:13px}
    .fv-btn{padding:7px 12px;border:0;border-radius:6px;background:#2f7d63;color:#fff;font-size:13px;cursor:pointer;white-space:nowrap}
    .fv-btn.sec{background:#607d8b}
    .fv-btn.ghost{background:#eef2f5;color:#333;border:1px solid #ccd0d6}
    .fv-info{padding:6px 12px;font-size:12px;color:#777;background:#fff;border-bottom:1px solid #f0f0f0}
    .fv-main{position:relative;height:calc(100vh - 52px)}
    #fv-frame{width:100%;height:100%;border:0;background:#fff;display:none}
    #fv-pre{margin:0;height:100%;overflow:auto;background:#0f1115;color:#d6deeb;padding:14px;white-space:pre-wrap;font:13px/1.6 Consolas,monospace;display:none}
    #fv-md{height:100%;overflow:auto;padding:18px 22px;background:#fff;display:none}
    #fv-md h1,#fv-md h2,#fv-md h3{border-color:#eee;color:#1f2d3d}
    #fv-md h1{border-bottom:1px solid #eee;padding-bottom:6px}
    #fv-md code{background:#f0f2f5;color:#c0341d;padding:1px 5px;border-radius:4px}
    #fv-md pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}
    #fv-md pre code{background:0;color:inherit;padding:0}
    #fv-md blockquote{background:#f0f7f4;border-left:4px solid #2f7d63;margin:8px 0;padding:6px 12px;color:#555}
    #fv-md a{color:#2f7d63}
    #fv-out{height:100%;overflow:auto;padding:14px;background:#fff;display:none}
    #fv-out .row{margin:0 0 10px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa}
    #fv-out pre{white-space:pre-wrap;margin:6px 0 0;font:13px/1.6 Consolas,monospace}
    #fv-pdf{height:100%;display:none;background:#525659}
    #fv-pdf object,#fv-pdf embed{width:100%;height:100%;border:0}
    #fv-tip{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#323232;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;z-index:9999;display:none}

    /* CX 风格悬浮 */
    #fv-cx{position:fixed;top:45%;right:0;z-index:2147483647;user-select:none;touch-action:none;font-family:system-ui}
    #fv-cx #cx-btn{position:absolute;right:0;transform:translateY(-50%);width:34px;height:54px;background:#2f7d63;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;font:bold 12px system-ui;cursor:pointer;opacity:.25;transition:all .4s;box-shadow:0 6px 20px rgba(0,0,0,.18);backdrop-filter:blur(10px)}
    #fv-cx #cx-btn:hover,#fv-cx #cx-btn.active{opacity:1;width:44px}
    #fv-cx .cx-mask{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center}
    #fv-cx .cx-mask.show{display:flex}
    #fv-cx .cx-box{width:90%;max-width:460px;max-height:76vh;overflow:auto;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.08);border-radius:22px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.25);backdrop-filter:blur(30px);display:grid;grid-template-columns:1fr;gap:10px}
    @media(min-width:720px){#fv-cx .cx-box{grid-template-columns:1fr 1fr}}
    #fv-cx .cx-item{padding:14px;border-radius:14px;background:rgba(245,245,245,.7);text-align:center;font-weight:600;color:#222;cursor:pointer;border:1px solid rgba(0,0,0,.06)}
    #fv-cx .cx-item:hover{background:#2f7d63;color:#fff}
    #fv-cx .cx-close{grid-column:1/-1;text-align:center;padding:14px;color:#2f7d63;font-weight:700;cursor:pointer;border-top:1px solid rgba(0,0,0,.06)}
  `;
  document.head.appendChild(style);

  /* ============ 主界面 ============ */
  document.body.innerHTML = `
    <div class="fv-head">
      <span class="fv-title">📄 FV 全格式</span>
      <input id="fv-file" class="fv-file" type="file" accept=".pdf,.mhtml,.mht,.svg,.xml,.xsl,.xslt,.html,.htm,.xhtml,.xht,.md,.json,.js,.mjs,.txt">
      <button class="fv-btn" id="fv-full">全屏打开</button>
      <button class="fv-btn sec" id="fv-reload">重载</button>
      <button class="fv-btn ghost" id="fv-home">首页</button>
    </div>
    <div class="fv-info" id="fv-info">选择文件后自动识别；所有格式均支持“全屏打开”。右侧 CX 悬浮可返回/操作。</div>
    <div class="fv-main">
      <iframe id="fv-frame"></iframe>
      <pre id="fv-pre"></pre>
      <div id="fv-md"></div>
      <div id="fv-out"></div>
      <div id="fv-pdf"></div>
    </div>
    <div id="fv-tip"></div>

    <div id="fv-cx">
      <div id="cx-btn">CX</div>
      <div class="cx-mask" id="cx-mask">
        <div class="cx-box" id="cx-box"></div>
      </div>
    </div>
  `;

  const $ = id => document.getElementById(id);
  const fileInput=$('fv-file'), iframe=$('fv-frame'), pre=$('fv-pre'), md=$('fv-md'),
        out=$('fv-out'), pdfBox=$('fv-pdf'), info=$('fv-info'), tip=$('fv-tip');

  let last={name:'',text:'',binary:null,kind:''};

  function tipMsg(m,d=2600){tip.textContent=m;tip.style.display='block';clearTimeout(tip._t);tip._t=setTimeout(()=>tip.style.display='none',d);}
  function hideAll(){iframe.style.display='none';pre.style.display='none';md.style.display='none';out.style.display='none';pdfBox.style.display='none';pdfBox.innerHTML='';}
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function readFile(file){
    return new Promise((res,rej)=>{
      // 文本类
      if(/\.(pdf|mhtml|mht)$/i.test(file.name)){ // pdf二进制，mhtml先文本也可，但pdf用arraybuffer
        const r=new FileReader();
        if(/\.pdf$/i.test(file.name)){r.onload=()=>res({bin:r.result,text:''});r.onerror=()=>rej(r.error);r.readAsArrayBuffer(file);}
        else{r.onload=()=>res({bin:null,text:r.result});r.onerror=()=>rej(r.error);r.readAsText(file);}
        return;
      }
      const r=new FileReader();
      r.onload=()=>res({bin:null,text:r.result});
      r.onerror=()=>rej(r.error);
      r.readAsText(file);
    });
  }

  /* ============ 各格式识别 ============ */
  function detect(name,text){
    const n=name.toLowerCase();
    if(n.endsWith('.pdf'))return'pdf';
    if(n.endsWith('.mhtml')||n.endsWith('.mht'))return'mhtml';
    if(n.endsWith('.svg'))return'svg';
    if(n.endsWith('.xml'))return'xml';
    if(n.endsWith('.xsl')||n.endsWith('.xslt'))return'xsl';
    if(n.endsWith('.xhtml')||n.endsWith('.xht'))return'xhtml';
    if(n.endsWith('.html')||n.endsWith('.htm'))return'html';
    if(n.endsWith('.md')||n.endsWith('.markdown'))return'md';
    if(n.endsWith('.json'))return'json';
    if(n.endsWith('.js')||n.endsWith('.mjs'))return'js';
    const t=(text||'').trim();
    if(t.startsWith('<?xml')||/^<[\s\S]*?\blxml:/i.test(t))return'xml';
    if(/^<svg[\s>]/i.test(t))return'svg';
    if(/^\s*#+\s|^\s*>\s|```/m.test(t))return'md';
    if(/^\s*[\[{]/.test(t))return'json';
    if(/^\s*(const|let|var|function|class|import|export)\b/.test(t))return'js';
    if(/^\s*</.test(t))return'html';
    return'text';
  }

  /* ============ 渲染：iframe（html/xhtml/svg） ============ */
  function renderFrame(text,mode){
    hideAll();iframe.style.display='block';iframe.removeAttribute('sandbox');
    // svg 补完整文档，html 原样
    let doc=text;
    if(mode==='svg'&&!/<html/i.test(text)&&/^<svg[\s>]/i.test(text.trim())){
      doc='<!doctype html><meta charset="utf-8"><body style="margin:0">'+text;
    }
    iframe.srcdoc=doc;
    info.textContent='已导入：'+last.name+'（'+mode+' · iframe）';
    setTimeout(()=>{
      try{
        const d=iframe.contentDocument;const len=d&&d.body?d.body.innerHTML.length:0;
        if(len<10&&text.trim().length>30){tipMsg(mode+' iframe疑似空白，建议点全屏打开');}
      }catch(e){}
    },700);
  }

  /* ============ 全屏：用容器注入，避免document.write白屏 ============ */
  function fullHtml(text,mode){
    hideAll();
    info.textContent='已导入：'+last.name+'（'+mode+' · 全屏）';
    // 不整体document.write；用主页面容器放返回条+iframe全屏
    iframe.style.display='block';
    iframe.style.height='100%';
    iframe.removeAttribute('sandbox');
    let doc=text;
    if(mode==='svg'&&/^<svg[\s>]/i.test(text.trim())&&!/<html/i.test(text)){
      doc='<!doctype html><meta charset="utf-8"><body style="margin:0">'+text;
    }
    iframe.srcdoc=doc;
    // 返回条用外层悬浮CX即可；这里不再document.write，避免白屏/清空 [7,10](@ref)
  }

  function fullByBlobUrl(blob,mime){
    hideAll();pdfBox.style.display='block';
    const url=URL.createObjectURL(blob);
    pdfBox.innerHTML='<object data="'+url+'#toolbar=1&view=FitH" type="'+mime+'" style="width:100%;height:100%"><embed src="'+url+'" type="'+mime+'" style="width:100%;height:100%"></object>';
    info.textContent='已导入：'+last.name+'（blob全屏，若白屏用系统查看器）';
    setTimeout(()=>tipMsg('PDF/MHTML若白屏：可长按下载或用系统打开',4000),800);
  }

  /* ============ JSON ============ */
  function renderJson(text){
    hideAll();pre.style.display='block';pre.style.background='#fafafa';pre.style.color='#333';
    pre.textContent=text;
    try{
      const p=JSON.stringify(JSON.parse(text),null,2);
      pre.innerHTML=esc(p).replace(/("(?:\\.|[^"\\])*"\s*:)?|(&quot;.*?&quot;)|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?)/g,
        (m,key,str,bool,num)=>key?'<span style="color:#0077aa">'+key+'</span>':str?'<span style="color:#d14">'+str+'</span>':bool?'<span style="color:#8250df">'+bool+'</span>':num?'<span style="color:#c18401">'+num+'</span>':m);
      info.textContent='已导入：'+last.name+'（JSON高亮）';
    }catch(e){info.textContent='已导入：'+last.name+'（JSON原文，解析失败）';}
  }

  /* ============ Markdown 轻量 ============ */
  function mdInline(s){s=s.replace(/`([^`]+)`/g,(m,c)=>'<code>'+esc(c)+'</code>');s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');s=s.replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>');s=s.replace(/~~([^~]+)~~/g,'<del>$1</del>');s=s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,(m,t,u)=>'<img alt="'+esc(t)+'" src="'+esc(u)+'">');s=s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(m,t,u)=>'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+t+'</a>');return s;}
  function mdToHtml(md){
    const L=md.replace(/\r\n/g,'\n').split('\n');let o=[],i=0;
    while(i<L.length){let line=L[i];
      if(/^```/.test(line)){let b=[],lang=(line.match(/^```(\w*)/)||[])[1]||'';i++;while(i<L.length&&!/^```/.test(L[i])){b.push(L[i]);i++;}o.push('<pre><code class="lang-'+esc(lang)+'">'+esc(b.join('\n'))+'</code></pre>');continue;}
      if(/^\s*>\s?/.test(line)){let b=[];while(i<L.length&&/^\s*>\s?/.test(L[i])){b.push(L[i].replace(/^\s*>\s?/,''));i++;}o.push('<blockquote>'+mdInline(b.join('<br>'))+'</blockquote>');continue;}
      let h=line.match(/^(#{1,6})\s+(.*)$/);if(h){o.push('<h'+h[1].length+'>'+mdInline(h[2])+'</h'+h[1].length+'>');i++;continue;}
      if(/^\s*[-*+]\s+\[[ x]\]\s+/.test(line)){let b=[];while(i<L.length&&/^\s*[-*+]\s+\[[ x]\]\s+/.test(L[i])){let d=/\[x\]/i.test(L[i]);let t=L[i].replace(/^\s*[-*+]\s+\[[ x]\]\s+/,'');b.push('<li style="list-style:none;margin-left:-18px"><input type=checkbox disabled '+(d?'checked':'')+'> '+mdInline(t)+'</li>');i++;}o.push('<ul>'+b.join('')+'</ul>');continue;}
      if(/^\s*[-*+]\s+/.test(line)){let b=[];while(i<L.length&&/^\s*[-*+]\s+/.test(L[i])){b.push('<li>'+mdInline(L[i].replace(/^\s*[-*+]\s+/,''))+'</li>');i++;}o.push('<ul>'+b.join('')+'</ul>');continue;}
      if(/^\s*\d+\.\s+/.test(line)){let b=[];while(i<L.length&&/^\s*\d+\.\s+/.test(L[i])){b.push('<li>'+mdInline(L[i].replace(/^\s*\d+\.\s+/,''))+'</li>');i++;}o.push('<ol>'+b.join('')+'</ol>');continue;}
      if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){o.push('<hr>');i++;continue;}
      if(!line.trim()){i++;continue;}
      let p=[];while(i<L.length&&L[i].trim()&&!/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s|[-*_]\s*[-*_])/.test(L[i])){p.push(L[i]);i++;}o.push('<p>'+mdInline(p.join('<br>'))+'</p>');
    }return o.join('\n');
  }
  function renderMd(text){hideAll();md.style.display='block';md.innerHTML=mdToHtml(text);info.textContent='已导入：'+last.name+'（Markdown）';}

  /* ============ XML / XSL / XSLT ============ */
  function renderXml(text){
    hideAll();pre.style.display='block';pre.style.background='#0f1115';pre.style.color='#d6deeb';
    // 尝试找同导入的xsl？这里单文件：若xml引用<?xml-stylesheet href="x.xsl"?>但没同时选，做不到外链；做源码高亮+如内含xsl则尝试转换
    let xslMatch=text.match(/<\?xml-stylesheet[^>]+href=["']([^"']+\.xsl[t]?)["'][^>]*\?>/i);
    pre.innerHTML='<div style="color:#7a8290">XML源码（高亮）</div>'+xmlHi(text);
    info.textContent='已导入：'+last.name+(xslMatch?'（引用'+xslMatch[1]+'，但未同时导入xsl，仅显示源码）':'（XML源码）');
  }
  function xmlHi(s){return esc(s).replace(/(&lt;\/?)([a-zA-Z0-9:_-]+)/g,'$1<span style="color:#82aaff">$2</span>').replace(/([a-zA-Z0-9:_-]+)=/g,'<span style="color:#f0a45c">$1</span>=');}

  // 同时拿到 xml+xsl 文本时调用
  function transformXmlWithXsl(xmlText,xslText){
    try{
      const p=new DOMParser();
      const xdoc=p.parseFromString(xmlText,'application/xml');
      const sdoc=p.parseFromString(xslText,'application/xml');
      if(xdoc.querySelector('parsererror')||sdoc.querySelector('parsererror'))throw new Error('XML/XSL解析错误');
      const proc=new XSLTProcessor();proc.importStylesheet(sdoc);
      const frag=proc.transformToFragment(xdoc,document);
      hideAll();iframe.style.display='block';iframe.removeAttribute('sandbox');
      const tmp=document.createElement('div');tmp.appendChild(frag);
      iframe.srcdoc='<!doctype html><meta charset="utf-8"><body>'+tmp.innerHTML+'</body>';
      info.textContent='XML+XSL 转换完成（全屏iframe）';
    }catch(e){hideAll();pre.style.display='block';pre.style.background='#0f1115';pre.style.color='#d6deeb';pre.textContent='XSLT转换失败：'+e.message+'\n\nXML:\n'+xmlHi(xmlText);}
  }

  /* ============ JS：注入运行（出可视结果） ============ */
  function renderJsView(text){
    hideAll();pre.style.display='block';pre.style.background='#0f1115';pre.style.color='#d6deeb';
    let s=esc(text);
    s=s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,'<span style="color:#7a8290">$1</span>');
    s=s.replace(/('[^']*?'|"[^"]*?"|`[^`]*?`)/g,'<span style="color:#a5e075">$1</span>');
    s=s.replace(/\b(const|let|var|function|return|if|else|for|while|class|async|await|try|catch|new|typeof|instanceof)\b/g,'<span style="color:#c792ea">$1</span>');
    pre.innerHTML=s;
    info.textContent='已导入：'+last.name+'（JS高亮；用CX→注入运行/全屏运行）';
  }

  function runJsInPage(text){
    hideAll();out.style.display='block';out.innerHTML='';
    const log=[];const push=(title,val,color)=>{
      const row=document.createElement('div');row.className='row';
      row.innerHTML='<div style="color:#777;font-size:12px">'+title+'</div>';
      let body;
      try{
        if(val instanceof Node){const tmp=document.createElement('div');tmp.appendChild(val.cloneNode(true));body=tmp.innerHTML;}
        else if(typeof val==='object'){body=esc(JSON.stringify(val,null,2));}
        else body=esc(String(val));
      }catch(e){body=esc('[无法序列化] '+e.message);}
      const pre2=document.createElement('pre');pre2.style.color=color||'#222';pre2.textContent=body;row.appendChild(pre2);out.appendChild(row);
    };
    const origLog=console.log;
    console.log=function(...a){log.push(a);push('console.log',a.map(x=>typeof x==='object'?x:x).join(' '),'#0a7d3c');origLog.apply(console,a);};
    let result;
    try{
      // 包装：把text作为函数体，提供$out辅助；返回最后表达式结果（简单eval）
      const wrapped='"use strict";const $out=(el)=>{document.getElementById("fv-out").appendChild(Object.assign(document.createElement("div"),{className:"row",innerHTML:"<pre>"+String(el).replace(/</g,"&lt;")+"</pre>"}));};\n'+text;
      // 用Function拿返回值：如果原脚本是完整语句，无return则result=undefined属正常
      const fn=new Function(wrapped+'\n;return (typeof __fv_result__!=="undefined")?__fv_result__:undefined;');
      result=fn();
      if(result!==undefined)push('返回值',result,'#c0341d');
      if(log.length===0&&result===undefined)tipMsg('已执行：无返回值。若脚本只声明函数/变量，可调用或在代码末尾加 return 结果');
      else tipMsg('已在预览页执行，结果见下方');
    }catch(e){
      push('执行错误',e.message,'#d32f2f');tipMsg('JS执行出错：'+e.message);
    }finally{
      console.log=origLog;
    }
    info.textContent='已导入：'+last.name+'（注入运行结果）';
  }

  function runJsFull(text){
    hideAll();iframe.style.display='block';iframe.removeAttribute('sandbox');
    const safe=text.replace(/<\/script>/gi,'<\\/script>');
    // 用srcdoc完整文档+错误处理，避免白屏；不整体document.write [7,10](@ref)
    iframe.srcdoc='<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;font:14px/1.6 system-ui;padding:16px}#__err{color:red;white-space:pre-wrap}</style></head><body><div id="app"></div><script>try{\n'+safe+'\n}catch(e){document.body.insertAdjacentHTML("beforeend","<pre id=__err>Error: "+(e&&e.stack||e)+"</pre>");}<\/script></body></html>';
    info.textContent='已导入：'+last.name+'（JS全屏运行）';
    setTimeout(()=>{try{const d=iframe.contentDocument;if(d&&d.body&&d.body.innerHTML.length<10)tipMsg('JS全屏可能空白：检查是否有document.write或报错');}catch(e){}},800);
  }

  /* ============ PDF / MHTML ============ */
  function renderPdf(arrayBuf){
    const blob=new Blob([arrayBuf],{type:'application/pdf'});
    fullByBlobUrl(blob,'application/pdf');
  }
  function renderMhtml(text){
    // 简单兜底：抽取各 part 的 Content-Type 与正文；完整版式做不到
    hideAll();pre.style.display='block';pre.style.background='#0f1115';pre.style.color='#d6deeb';
    let parts=text.split(/--[^\r\n]+/i).slice(1);
    let htmlPart='';
    parts.forEach(p=>{
      const head=p.split(/\r?\n\r?\n/)[0]||'';
      if(/Content-Type:\s*text\/html/i.test(head)&&/charset/i.test(head)||/Content-Type:\s*text\/html/i.test(head)){
        const bodyI=p.indexOf('\n\n');const b=bodyI>0?p.slice(bodyI):p;
        if(b.trim().length>htmlPart.length)htmlPart=b;
      }
    });
    if(htmlPart){
      // 提供“全屏渲染提取HTML”按钮
      pre.innerHTML='<div style="color:#7a8290">MHTML已提取内嵌HTML，点CX→全屏打开可渲染（外部相对资源可能失效）</div>';
      last._mhtmlHtml=htmlPart;
      info.textContent='已导入：'+last.name+'（MHTML提取HTML）';
      tipMsg('MHTML点“全屏打开”渲染提取出的HTML');
    }else{
      pre.textContent=text;info.textContent='已导入：'+last.name+'（MHTML纯文本，未提取到HTML）';
    }
  }

  /* ============ 总路由 ============ */
  function route(){
    const k=last.kind;
    if(k==='pdf'){renderPdf(last.binary);return;}
    if(k==='mhtml'){renderMhtml(last.text);return;}
    if(k==='html'||k==='xhtml'){renderFrame(last.text,k);return;}
    if(k==='svg'){renderFrame(last.text,'svg');return;}
    if(k==='xml'){renderXml(last.text);return;}
    if(k==='xsl'){hideAll();pre.style.display='block';pre.style.background='#0f1115';pre.style.color='#d6deeb';pre.textContent=last.text;info.textContent='已导入：'+last.name+'（XSL源码；同时选XML可转）';tipMsg('同时导入XML+XSL可用CX菜单转换');return;}
    if(k==='json'){renderJson(last.text);return;}
    if(k==='md'){renderMd(last.text);return;}
    if(k==='js'){renderJsView(last.text);return;}
    // text
    hideAll();pre.style.display='block';pre.style.background='#fafafa';pre.style.color='#333';pre.textContent=last.text;info.textContent='已导入：'+last.name+'（纯文本）';
  }

  /* ============ 全屏入口（按格式分派） ============ */
  function fullOpen(){
    const k=last.kind;
    if(k==='pdf'){renderPdf(last.binary);return;}
    if(k==='mhtml'){if(last._mhtmlHtml)fullHtml(last._mhtmlHtml,'html');else fullByBlobUrl(new Blob([last.text],{type:'multipart/related'}),'multipart/related');return;}
    if(k==='html'||k==='xhtml'||k==='svg'){fullHtml(last.text,k);return;}
    if(k==='xml'){hideAll();pre.style.display='block';pre.style.background='#0f1115';pre.style.color='#d6deeb';pre.innerHTML=xmlHi(last.text);tipMsg('纯XML无XSL：如要转HTML，请用CX同时选XML+XSL');return;}
    if(k==='xsl'){tipMsg('单独XSL无法全屏，需配合XML');return;}
    if(k==='json'){hideAll();pre.style.display='block';pre.style.background='#fafafa';pre.style.color='#333';pre.textContent=last.text;return;}
    if(k==='md'){hideAll();md.style.display='block';md.innerHTML=mdToHtml(last.text);return;}
    if(k==='js'){runJsFull(last.text);return;}
    hideAll();pre.style.display='block';pre.style.background='#fafafa';pre.style.color='#333';pre.textContent=last.text;
  }

  /* ============ 文件选择 ============ */
  fileInput.addEventListener('change',async e=>{
    const f=e.target.files[0];if(!f)return;last.name=f.name;
    try{
      const r=await readFile(f);last.binary=r.bin;last.text=r.text||'';last.kind=detect(last.name,last.text);
      // 如果刚选了xml且之前有xsl，或反之，尝试联动
      if(last.kind==='xml'&&window.__fv_xsl'){transformXmlWithXsl(last.text,window.__fv_xsl);return;}
      if(last.kind==='xsl'){window.__fv_xsl=last.text;if(window.__fv_xml){transformXmlWithXsl(window.__fv_xml,last.text);return;}tipMsg('已记XSL，再选XML可自动转换');route();return;}
      if(last.kind==='xml'){window.__fv_xml=last.text;}
      route();
    }catch(err){tipMsg('读取失败：'+err);}
  });

  $('fv-full').onclick=fullOpen;
  $('fv-reload').onclick=()=>{if(last.text||last.binary)route();else tipMsg('请先选择文件');};
  $('fv-home').onclick=()=>location.href='https://fv-local-preview.invalid/';

  /* ============ CX 悬浮（借鉴提取器） ============ */
  const cx=$('fv-cx'),cxBtn=$('cx-btn'),cxMask=$('cx-mask'),cxBox=$('cx-box');
  function cxMenu(){
    const k=last.kind;const items=[['全屏打开',fullOpen],['返回预览器',()=>location.href='https://fv-local-preview.invalid/']];
    if(k==='js'){items.push(['注入运行(出结果)',()=>runJsInPage(last.text)]);items.push(['JS全屏运行',()=>runJsFull(last.text)]);}
    if(k==='xml'||k==='xsl'){items.push(['XML+XSL转换',()=>{if(k==='xml'&&window.__fv_xsl)transformXmlWithXsl(last.text,window.__fv_xsl);else if(k==='xsl'&&window.__fv_xml)transformXmlWithXsl(window.__fv_xml,last.text);else tipMsg('请同时选择XML与XSL两个文件');}]);}
    if(k==='mhtml'){items.push(['渲染提取HTML',()=>{if(last._mhtmlHtml)fullHtml(last._mhtmlHtml,'html');else tipMsg('未提取到HTML');}]);}
    if(k==='pdf'||k==='mhtml'){items.push(['下载原文件',downloadCurrent]);}
    items.push(['重新选择',()=>fileInput.click()]);
    cxBox.innerHTML='';
    items.forEach(it=>{const d=document.createElement('div');d.className='cx-item';d.textContent=it[0];d.onclick=()=>{cxMask.classList.remove('show');cxBtn.classList.remove('active');it[1]();};cxBox.appendChild(d);});
    const close=document.createElement('div');close.className='cx-close';close.textContent='关闭';close.onclick=()=>{cxMask.classList.remove('show');cxBtn.classList.remove('active');};cxBox.appendChild(close);
  }
  function downloadCurrent(){
    let blob,fn=last.name||'file';
    if(last.kind==='pdf')blob=new Blob([last.binary],{type:'application/pdf'});else blob=new Blob([last.text],{type:'application/octet-stream'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fn;a.click();tipMsg('已触发下载：'+fn);
  }
  cxBtn.onclick=()=>{cxMenu();cxMask.classList.add('show');cxBtn.classList.add('active');};
  cxMask.onclick=e=>{if(e.target===cxMask){cxMask.classList.remove('show');cxBtn.classList.remove('active');}};
  // 拖动
  let drag=false,sy=0,oy=0;
  cxBtn.ontouchstart=e=>{drag=true;sy=e.touches[0].clientY;oy=cx.offsetTop;cx.style.transition='none';};
  window.ontouchmove=e=>{if(drag){let y=Math.max(40,Math.min(innerHeight-40,oy+(e.touches[0].clientY-sy)));cx.style.top=y+'px';}};
  window.ontouchend=()=>{if(drag){drag=false;cx.style.transition='top .3s';}};
  cxBtn.ondragstart=()=>false;

  console.log('[FV] 全格式预览器启动');
})();
