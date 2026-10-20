// ==UserScript==
// @name         禁用输入框自动缩放
// @namespace    http://tampermonkey.net/
// @description  适配 Safari 页面缩放，防止点击输入框时自动放大
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PAGE_ZOOM = 0.5;   // 你的 Safari 页面缩放比例，50% 就填 0.5
  const DEBUG = true;      // 确认生效后改成 false
  const MIN_PX = 16 / PAGE_ZOOM; // 需要达到的 CSS 字号，50% 时为 32px
  const SEL = 'input, textarea, select, [contenteditable]';

  function apply(el) {
    try {
      if (parseFloat(getComputedStyle(el).fontSize) < MIN_PX) {
        el.style.setProperty('font-size', MIN_PX + 'px', 'important');
      }
    } catch (e) {}
  }

  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      'input, textarea, select { font-size: ' + MIN_PX + 'px !important; }'
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch (e) {}

  new MutationObserver((list) => {
    list.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches(SEL)) apply(n);
      n.querySelectorAll(SEL).forEach(apply);
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('touchstart', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches(SEL)) apply(t);
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
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
