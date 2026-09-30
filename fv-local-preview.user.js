// ==UserScript==
// @name         FV 打开网页专用注入
// @namespace    com.example.fv
// @match        https://fv-local-preview.invalid/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function(){
  // 只在“全屏运行/打开网页”场景做处理，避免影响预览器UI
  if(document.getElementById('fv-file')) return; // 预览器主页跳过
  console.log('FV 网页注入生效', location.href);
  // 例：给所有网页加个浅色返回条
  const b=document.createElement('button');
  b.textContent='← 返回预览器';b.style.cssText='position:fixed;top:10px;right:10px;z-index:9999999;padding:8px 14px;background:#2f7d63;color:#fff;border:0;border-radius:20px';
  b.onclick=()=>location.href='https://fv-local-preview.invalid/';
  document.addEventListener('DOMContentLoaded',()=>document.body&&document.body.appendChild(b));
})();
