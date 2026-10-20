// ==UserScript==
// @name         禁用输入框自动缩放
// @namespace    http://tampermonkey.net/
// @description  适配 Safari 页面缩放，防止点击输入框时自动放大，且保持输入框外观不变
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PAGE_ZOOM = 0.5;    // 你的 Safari 页面缩放比例，50% 就填 0.5
  const SCALE_BACK = true;  // true：字号放大后视觉缩回原大小；false：只放大字号

  const MIN_PX = 16 / PAGE_ZOOM; // 50% 时为 32px
  const SEL = 'input, textarea, select';
  const SKIP = '.cm-editor, [contenteditable]';
  const SKIP_TYPES = ['checkbox', 'radio', 'hidden', 'file', 'range', 'color',
                      'button', 'submit', 'reset', 'image'];

  const processed = new Map();
  const px = (v) => parseFloat(v) || 0;

  function apply(el) {
    try {
      if (processed.has(el)) return;
      if (el.closest(SKIP)) return;
      if (el.tagName === 'INPUT' && SKIP_TYPES.includes(el.type)) return;

      const cs = getComputedStyle(el);
      if (cs.display === 'none') return;
      const fs = px(cs.fontSize);
      if (!fs || fs >= MIN_PX) return;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const k = fs / MIN_PX;
      const W = rect.width, H = rect.height;
      const sides = ['Top', 'Right', 'Bottom', 'Left'];
      const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
      const pad = sides.map((d) => px(cs['padding' + d]));
      const bw = sides.map((d) => px(cs['border' + d + 'Width']));
      const rad = corners.map((c) => px(cs['border' + c + 'Radius']));
      const mr = px(cs.marginRight), mb = px(cs.marginBottom);
      const lh = cs.lineHeight === 'normal' ? null : px(cs.lineHeight);

      processed.set(el, el.getAttribute('style'));
      const set = (p, v) => el.style.setProperty(p, v, 'important');

      set('font-size', MIN_PX + 'px');
      if (!SCALE_BACK) return;

      set('box-sizing', 'border-box');
      set('width', W / k + 'px');
      set('height', H / k + 'px');
      set('min-width', '0');
      set('max-width', 'none');
      set('min-height', '0');
      set('max-height', 'none');
      set('flex', 'none');
      set('padding', pad.map((v) => v / k + 'px').join(' '));
      set('border-width', bw.map((v) => v / k + 'px').join(' '));
      set('border-radius', rad.map((v) => v / k + 'px').join(' '));
      if (lh !== null) set('line-height', lh / k + 'px');
      set('transform', 'scale(' + k + ')');
      set('transform-origin', '0 0');
      set('margin-right', mr - (W / k - W) + 'px');
      set('margin-bottom', mb - (H / k - H) + 'px');
    } catch (e) {}
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(SEL)) apply(root);
    root.querySelectorAll(SEL).forEach(apply);
  }

  function reset() {
    processed.forEach((orig, el) => {
      if (orig === null) el.removeAttribute('style');
      else el.setAttribute('style', orig);
    });
    processed.clear();
    scan(document.documentElement);
  }

  new MutationObserver((list) => {
    list.forEach((m) => m.addedNodes.forEach(scan));
  }).observe(document.documentElement, { childList: true, subtree: true });

  const onTouch = (e) => {
    const t = e.target;
    if (t && t.matches && t.matches(SEL)) apply(t);
  };
  document.addEventListener('touchstart', onTouch, true);
  document.addEventListener('focusin', onTouch, true);

  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== lastW) {
      lastW = window.innerWidth;
      reset();
    }
  });

  document.addEventListener('DOMContentLoaded', () => scan(document.documentElement));
})();
