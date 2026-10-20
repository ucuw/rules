// ==UserScript==
// @name         禁用输入框自动缩放 v2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  防止 Safari 移动端点击输入框时自动放大页面
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = true; // 确认生效后改成 false 去掉小标记
  const SEL = 'input, textarea, select, [contenteditable]';

  function apply(el) {
    try {
      if (parseFloat(getComputedStyle(el).fontSize) < 16) {
        el.style.setProperty('font-size', '16px', 'important');
      }
    } catch (e) {}
  }

  function fixNode(node) {
    if (node.nodeType !== 1) return;
    if (node.matches(SEL)) apply(node);
    node.querySelectorAll(SEL).forEach(apply);
  }

  // 方案一：全局样式表（不受内联 style 标签限制）
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('input, textarea, select { font-size: 16px !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch (e) {}

  // 方案二：逐个元素写入字号，并监听之后新增的元素
  new MutationObserver((list) => {
    list.forEach((m) => m.addedNodes.forEach(fixNode));
  }).observe(document.documentElement, { childList: true, subtree: true });

  // 点击瞬间再补一次，覆盖漏网的元素
  document.addEventListener('touchstart', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches(SEL)) apply(t);
  }, true);

  // 方案三：viewport 设置（辅助）
  function fixViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      if (!meta.content.includes('maximum-scale')) {
        meta.content += ', maximum-scale=1.0, user-scalable=no';
      }
    } else if (document.head) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(meta);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    fixViewport();
    document.querySelectorAll(SEL).forEach(apply);
    if (DEBUG) {
      const d = document.createElement('div');
      d.textContent = '✓ 防缩放脚本已运行';
      d.style.cssText = 'position:fixed;top:60px;right:8px;z-index:2147483647;background:#1a7f37;color:#fff;padding:4px 8px;border-radius:6px;font:12px sans-serif;';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    }
  });
})();
