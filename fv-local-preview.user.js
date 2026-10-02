// ==UserScript==
// @name         FV 本地文件预览器（固定入口·浅色完整版）
// @namespace    com.example.fv
// @version      3.1
// @description  固定入口 https://fv-local-preview.invalid/ ，支持 html/json/md/js/pdf/mhtml/mht/svg/xml/xsl/xslt/xhtml/xht/txt 全格式预览与全屏打开
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (location.hostname !== 'fv-local-preview.invalid') return;
  if (window.__fvFixedLoaded) return;
  window.__fvFixedLoaded = true;

  const FIXED_URL = 'https://fv-local-preview.invalid/';

  const PAGE =
'<!doctype html>' +
'<html lang="zh">' +
'<head>' +
'<meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>FV 本地文件预览</title>' +
'<style>' +
'*{box-sizing:border-box}' +
'html,body{margin:0;height:100%}' +
'body{font:14px/1.6 -apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f6fa;color:#333}' +
'.head{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.04)}' +
'.title{font-weight:700;color:#2f7d63;white-space:nowrap}' +
'.pick{flex:1;min-width:130px;position:relative;overflow:hidden;background:#fff;border:1px solid #ccd0d6;border-radius:8px;padding:7px 10px;font-size:13px;color:#555;cursor:pointer;white-space:nowrap;text-overflow:ellipsis}' +
'.pick input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}' +
'.btn{padding:7px 12px;border:0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:#2f7d63;color:#fff;white-space:nowrap}' +
'.btn.sec{background:#607d8b}' +
'.btn.ghost{background:#eef2f5;color:#333;border:1px solid #ccd0d6}' +
'.btn:active{transform:scale(.96)}' +
'.stage{height:calc(100% - 54px);background:#fff}' +
'#frame{width:100%;height:100%;border:0;background:#fff;display:none}' +
'#pre{margin:0;padding:14px;width:100%;height:100%;overflow:auto;white-space:pre-wrap;background:#fafafa;color:#333;font:13px/1.6 "SFMono-Regular",Consolas,monospace;display:none}' +
'#md{padding:18px 22px;width:100%;height:100%;overflow:auto;background:#fff;display:none}' +
'#md h1,#md h2,#md h3,#md h4{color:#1f2d3d;margin:16px 0 8px}' +
'#md h1{border-bottom:1px solid #eee;padding-bottom:6px}' +
'#md p{margin:8px 0}' +
'#md a{color:#2f7d63}' +
'#md code{background:#f0f2f5;padding:1px 5px;border-radius:4px;color:#c0341d;font-family:Consolas,monospace}' +
'#md pre{background:#0f1115;color:#d6deeb;padding:12px;border-radius:8px;overflow:auto}' +
'#md pre code{background:transparent;color:inherit}' +
'#md blockquote{margin:8px 0;padding:6px 12px;border-left:4px solid #2f7d63;background:#f0f7f4;color:#555}' +
'#md img{max-width:100%;border-radius:6px}' +
'#md hr{border:0;border-top:1px solid #eee;margin:16px 0}' +
'.jk{color:#0077aa}.js{color:#d14}.jn{color:#c18401}.jb{color:#8250df}' +
'.ck{color:#c792ea}.cs{color:#0a7d34}.cc{color:#7a8290}.cn{color:#c18401}.cf{color:#8250df}' +
'.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#323232;color:#fff;padding:9px 18px;border-radius:20px;font-size:13px;z-index:9999;opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:0 4px 12px rgba(0,0,0,.15)}' +
'.toast.on{opacity:1}' +
'#fab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483646;width:32px;height:50px;background:#2f7d63;color:#fff;border-radius:18px 0 0 18px;display:flex;align-items:center;justify-content:center;font:bold 12px system-ui;cursor:pointer;box-shadow:0 8px 32px 0 rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.2);border-right:none;transition:width .3s,opacity .3s;opacity:.9}' +
'#fab:active{width:45px;opacity:1}' +
'#mask{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.4);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center}' +
'#mask.on{display:flex}' +
'#card{width:88%;max-width:420px;max-height:78vh;overflow:auto;background:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.4);border-radius:24px;padding:16px;box-shadow:0 8px 32px 0 rgba(0,0,0,.2);display:flex;flex-direction:column;gap:10px;animation:pop .3s cubic-bezier(.34,1.56,.64,1)}' +
'@keyframes pop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}' +
'#card .ct{font-weight:700;color:#2f7d63;text-align:center;font-size:16px;padding:4px 0}' +
'.mi{padding:14px;background:rgba(255,255,255,.75);color:#333;border:1px solid rgba(0,0,0,.08);border-radius:14px;font:600 15px system-ui;text-align:center;cursor:pointer;transition:all .2s}' +
'.mi:hover{background:#2f7d63;color:#fff}' +
'.mi:active{transform:scale(.97)}' +
'.mi.close{background:#fdecec;color:#c0392b}' +
'@media(max-width:480px){.head{gap:4px}.pick{min-width:100px}.btn{padding:6px 9px}}' +
'</style>' +
'</head>' +
'<body>' +
'<div class="head">' +
'<span class="title">📂 FV 本地预览</span>' +
'<span class="pick" id="pick">📁 选择文件<input type="file" id="file" accept=".html,.htm,.xhtml,.xht,.json,.md,.markdown,.js,.mjs,.pdf,.mhtml,.mht,.svg,.xml,.xsl,.xslt,.txt"></span>' +
'<button class="btn" id="fullBtn">🖥️ 全屏打开</button>' +
'<button class="btn sec" id="reloadBtn">重载</button>' +
'<button class="btn ghost" id="homeBtn">首页</button>' +
'</div>' +
'<div class="stage">' +
'<iframe id="frame"></iframe>' +
'<pre id="pre"></pre>' +
'<div id="md"></div>' +
'</div>' +
'<div class="toast" id="toast"></div>' +
'<div id="fab">FV</div>' +
'<div id="mask"><div id="card"></div></div>' +
'<script>' +
'(function(){' +
'var $=function(i){return document.getElementById(i)};' +
'var fileInput=$("file"),pick=$("pick"),frame=$("frame"),pre=$("pre"),mdBox=$("md"),toast=$("toast"),fab=$("fab"),mask=$("mask"),card=$("card");' +
'var lastText="",lastName="",lastKind="",lastBlob=null;' +

'function msg(s,ms){toast.textContent=s;toast.classList.add("on");clearTimeout(window.__ft);window.__ft=setTimeout(function(){toast.classList.remove("on")},ms||2500);}' +
'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}' +
'function hideAll(){frame.style.display="none";pre.style.display="none";mdBox.style.display="none";}' +
'function readFile(f){return new Promise(function(res,rej){if(f.text){f.text().then(res).catch(rej);return;}var r=new FileReader();r.onload=function(){res(r.result)};r.onerror=function(){rej(r.error)};r.readAsText(f);});}' +
'function ext(){var a=lastName.split(".");return a.length>1?a.pop().toLowerCase():"";}' +

'function showFrame(){hideAll();frame.style.display="block";frame.removeAttribute("sandbox");}' +
'function showPre(html){hideAll();pre.style.display="block";pre.innerHTML=html;}' +
'function showMd(html){hideAll();mdBox.style.display="block";mdBox.innerHTML=html;}' +

'function renderHtml(t){lastKind="html";showFrame();frame.srcdoc=t;msg("已打开："+lastName);}' +

'function renderJson(t){lastKind="json";var out;try{out=JSON.stringify(JSON.parse(t),null,2);}catch(e){out=t;msg("JSON 解析失败，显示原文");}' +
'showPre(esc(out).replace(/("(?:\\\\u[a-fA-F0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\\\s*:)?|\\b(?:true|false|null)\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)/g,function(m){return /:$/.test(m)?"<span class=\\"jk\\">"+m+"</span>":/^"/.test(m)?"<span class=\\"js\\">"+m+"</span>":/true|false|null/.test(m)?"<span class=\\"jb\\">"+m+"</span>":"<span class=\\"jn\\">"+m+"</span>";}));}' +

'function mdInline(s){s=s.replace(/`([^`]+)`/g,function(m,c){return "<code>"+esc(c)+"</code>"});' +
's=s.replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>");' +
's=s.replace(/\\*([^*\\n]+)\\*/g,"<em>$1</em>");' +
's=s.replace(/~~([^~]+)~~/g,"<del>$1</del>");' +
's=s.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g,function(m,t,u){return "<a href=\\""+u+"\\" target=\\"_blank\\">"+t+"</a>"});' +
'return s;}' +

'function mdToHtml(text){var lines=text.replace(/\\r\\n/g,"\\n").split("\\n"),out=[],i=0;' +
'while(i<lines.length){var line=lines[i];' +
'if(/^```/.test(line)){var buf=[];i++;while(i<lines.length&&!/^```/.test(lines[i])){buf.push(lines[i]);i++;}i++;out.push("<pre><code>"+esc(buf.join("\\n"))+"</code></pre>");continue;}' +
'if(/^\\s*>\\s?/.test(line)){out.push("<blockquote>"+mdInline(line.replace(/^\\s*>\\s?/,""))+"</blockquote>");i++;continue;}' +
'var h=line.match(/^(#{1,6})\\s+(.*)$/);if(h){out.push("<h"+h[1].length+">"+mdInline(h[2])+"</h"+h[1].length+">");i++;continue;}' +
'if(/^\\s*[-*+]\\s+/.test(line)){out.push("<ul><li>"+mdInline(line.replace(/^\\s*[-*+]\\s+/,""))+"</li></ul>");i++;continue;}' +
'if(/^\\s*\\d+\\.\\s+/.test(line)){out.push("<ol><li>"+mdInline(line.replace(/^\\s*\\d+\\.\\s+/,""))+"</li></ol>");i++;continue;}' +
'if(/^\\s*([-*_])(\\s*\\1){2,}\\s*$/.test(line)){out.push("<hr>");i++;continue;}' +
'if(line.trim()===""){i++;continue;}' +
'out.push("<p>"+mdInline(line)+"</p>");i++;}' +
'return out.join("\\n");}' +

'function renderMd(t){lastKind="md";showMd(mdToHtml(t));msg("已渲染："+lastName);}' +

'function codeHtml(t){var s=esc(t);' +
's=s.replace(/(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)/g,"<span class=\\"cc\\">$1</span>");' +
's=s.replace(/(&quot;[^&]*?&quot;|\'[^\']*?\'|`[^`]*?`)/g,"<span class=\\"cs\\">$1</span>");' +
's=s.replace(/\\b(const|let|var|function|return|if|else|for|while|new|class|async|await|import|export|try|catch)\\b/g,"<span class=\\"ck\\">$1</span>");' +
's=s.replace(/\\b(true|false|null|undefined)\\b/g,"<span class=\\"cn\\">$1</span>");' +
'return s;}' +
'function renderCode(t){lastKind="code";showPre(codeHtml(t));msg("已高亮："+lastName);}' +

'function renderBlob(f,type){lastKind="blob";if(lastBlob){URL.revokeObjectURL(lastBlob);}lastBlob=URL.createObjectURL(f);showFrame();frame.src=lastBlob;msg("已打开："+f.name);}' +

'function route(f,t){var e=ext(),tr=t.trim();' +
'if(e==="pdf"){renderBlob(f,"application/pdf");return;}' +
'if(e==="mhtml"||e==="mht"){renderBlob(f,"multipart/related");return;}' +
'if(e==="svg"||e==="xml"||e==="xsl"||e==="xslt"||e==="xhtml"||e==="xht"||e==="html"||e==="htm"){renderHtml(t);return;}' +
'if(e==="json"||/^\\s*[[{]/.test(tr)){renderJson(t);return;}' +
'if(e==="md"||e==="markdown"){renderMd(t);return;}' +
'if(e==="js"||e==="mjs"||/^\\s*(const|let|var|function|class|async|import|export)\\s/.test(tr)){renderCode(t);return;}' +
'if(/^\\s*<(!DOCTYPE|html|\\?xml)/i.test(tr)){renderHtml(t);return;}' +
'renderCode(t);}' +

'function openData(html){var u="data:text/html;charset=utf-8,"+encodeURIComponent(html);var w=window.open(u,"_blank");if(!w){msg("弹窗被拦截，已在本页 iframe 打开");showFrame();frame.srcdoc=html;}}' +
'function backBtn(){return "<button onclick=\\"history.length>1?history.back():void 0\\" style=\\"position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:rgba(47,125,99,.92);color:#fff;border:0;border-radius:20px;font:14px system-ui;cursor:pointer\\">← 返回</button>";}' +
'function wrapDoc(body,title){return "<!doctype html><html><head><meta charset=\\"utf-8\\"><meta name=\\"viewport\\" content=\\"width=device-width,initial-scale=1\\"><title>"+esc(title||"FV预览")+"</title><style>body{background:#fff;font:14px/1.6 system-ui;padding:10px}</style></head><body>"+backBtn()+body+"</body></html>";}' +

'function fullOpen(){' +
'if(!lastText&&!lastBlob){msg("请先选择文件");return;}' +
'var e=ext();' +
'if(lastKind==="blob"&&lastBlob){var w=window.open(lastBlob,"_blank");if(!w)msg("弹窗被拦截");return;}' +
'if(lastKind==="md"){openData(wrapDoc("<article style=\\"max-width:760px;margin:0 auto\\">"+mdToHtml(lastText)+"</article>",lastName));return;}' +
'if(lastKind==="json"){var o;try{o=JSON.stringify(JSON.parse(lastText),null,2);}catch(err){o=lastText;}openData(wrapDoc("<pre style=\\"white-space:pre-wrap;font:13px Consolas,monospace\\">"+esc(o)+"</pre>",lastName));return;}' +
'if(e==="js"||e==="mjs"){var safe=lastText.replace(/<\\/script>/gi,"<\\\\/script>");openData("<!doctype html><html><head><meta charset=\\"utf-8\\"><style>body{background:#fff;font:14px system-ui;padding:16px}</style></head><body>"+backBtn()+"<div id=\\"app\\"></div><script>try{"+safe+"}catch(err){document.body.insertAdjacentHTML(\\"beforeend\\",\\"<pre style=color:red>Error: \\"+err.message+\\"</pre>\\")}<\\/script></body></html>");return;}' +
'openData(wrapDoc(lastText,lastName));}' +

'function runJs(){if(!lastText){msg("请先选择文件");return;}' +
'var logs=[];var fake={log:function(){logs.push([].slice.call(arguments).map(function(a){return typeof a==="string"?a:String(a)}).join(" "))},warn:function(){logs.push("[warn] "+[].slice.call(arguments).join(" "))},error:function(){logs.push("[error] "+[].slice.call(arguments).join(" "))}};' +
'try{var fn=new Function("console",lastText);fn.call(window,fake);' +
'if(logs.length){msg("已执行，输出："+logs.join(" | ").slice(0,90));}else{msg("已执行完毕（无 console 输出）");}' +
'}catch(err){msg("执行出错："+err.message);}}' +

'fileInput.addEventListener("change",function(ev){var f=ev.target.files[0];if(!f)return;lastName=f.name;pick.textContent="📄 "+f.name;' +
'var e=ext();if(e==="pdf"||e==="mhtml"||e==="mht"){route(f,"");return;}' +
'readFile(f).then(function(t){lastText=t;route(f,t);}).catch(function(err){msg("读取失败");});});' +

'$("fullBtn").onclick=fullOpen;' +
'$("reloadBtn").onclick=function(){if(lastText){route({name:lastName},lastText);}else if(lastBlob){showFrame();frame.src=lastBlob;}else{msg("请先选择文件");}};' +
'$("homeBtn").onclick=function(){location.href="' + FIXED_URL + '";};' +
'pre.ondblclick=function(){var e=ext();if(e==="js"||e==="mjs"){runJs();}};' +

'function openMenu(){' +
'if(mask.classList.contains("on")){mask.classList.remove("on");return;}' +
'var items=[' +
'{t:"📁 选择文件",f:function(){fileInput.click()}},' +
'{t:"🖥️ 全屏打开",f:fullOpen},' +
'{t:"⚡ 注入运行 JS",f:runJs},' +
'{t:"🌐 网页模式渲染",f:function(){if(lastText){renderHtml(lastText)}else{msg("请先选择文件")}}},' +
'{t:"📝 代码高亮查看",f:function(){if(lastText){renderCode(lastText)}else{msg("请先选择文件")}}},' +
'{t:"🏠 回到首页",f:function(){location.href="' + FIXED_URL + '"}},' +
'{t:"✕ 关闭菜单",f:function(){},c:1}' +
'];' +
'card.innerHTML="";' +
'var t=document.createElement("div");t.className="ct";t.textContent="FV 本地预览";card.appendChild(t);' +
'items.forEach(function(it){var b=document.createElement("div");b.className="mi"+(it.c?" close":"");b.textContent=it.t;b.onclick=function(e){e.stopPropagation();mask.classList.remove("on");setTimeout(it.f,60);};card.appendChild(b);});' +
'mask.classList.add("on");}' +

'fab.onclick=function(e){e.stopPropagation();openMenu();};' +
'mask.onclick=function(e){if(e.target===mask){mask.classList.remove("on");}};' +

'var drag=false,sy,st;' +
'fab.addEventListener("touchstart",function(e){drag=true;sy=e.touches[0].clientY;st=fab.offsetTop;fab.style.transition="none";},{passive:true});' +
'window.addEventListener("touchmove",function(e){if(!drag)return;fab.style.top=Math.max(40,Math.min(window.innerHeight-40,st+e.touches[0].clientY-sy))+"px";},{passive:true});' +
'window.addEventListener("touchend",function(){if(!drag)return;drag=false;fab.style.transition="all .3s";});' +

'msg("就绪，请选择文件");' +
'})();' +
'<\/script>' +
'</body>' +
'</html>';

  // 用 document.write 彻底覆盖整页，避免任何错误页残留
  document.open();
  document.write(PAGE);
  document.close();
})();
