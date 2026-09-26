// ==UserScript==
// @name         禁用输入框自动缩放
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  防止 Safari 移动端点击输入框时自动放大页面
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function fixViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      if (!meta.content.includes('maximum-scale')) {
        meta.content = meta.content + ', maximum-scale=1.0, user-scalable=no';
      }
    } else if (document.head) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(meta);
    }
  }

  // 页面加载完成后先修一次
  fixViewport();

  // 监听 DOM 变化，防止 SPA 站点（如 GitHub）动态改写 viewport
  const observer = new MutationObserver(() => fixViewport());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // 兜底：强制所有 input/textarea 字体不小于16px，防止 iOS 触发自动放大
  const style = document.createElement('style');
  style.textContent = `
    input, textarea, select {
      font-size: 16px !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
})();
