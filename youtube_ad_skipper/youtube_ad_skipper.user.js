// ==UserScript==
// @name         YouTube Ad Auto Skipper
// @namespace    https://github.com/sammrai
// @version      4.1.1
// @description  YouTube広告を自動スキップ（seek + ボタンクリック併用）+ 広告ブロッカー警告ダイアログ自動閉じ
// @author       sammrai
// @match        https://www.youtube.com/*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/youtube_ad_skipper/youtube_ad_skipper.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/youtube_ad_skipper/youtube_ad_skipper.user.js
// ==/UserScript==

(function () {
  'use strict';

  const POLL_MS = 300;

  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
  ];

  function dismissEnforcementDialog() {
    const dialog = document.querySelector('ytd-enforcement-message-view-model');
    if (!dialog) return;
    const btn = dialog.querySelector('#dismiss-button button');
    if (btn) btn.click();
  }

  function trySkip() {
    dismissEnforcementDialog();

    const player = document.querySelector('#movie_player');
    if (!player || !player.classList.contains('ad-showing')) return;

    const video = document.querySelector('video');

    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (!btn) continue;
      const s = window.getComputedStyle(btn);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;

      btn.click();

      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
        btn.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: cx, clientY: cy, button: 0,
          pointerId: 1, pointerType: 'mouse', isPrimary: true,
        }));
      }

      btn.focus();
      for (const type of ['keydown', 'keypress', 'keyup']) {
        btn.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13,
          bubbles: true, cancelable: true,
        }));
      }
      break;
    }

    setTimeout(() => {
      if (!document.querySelector('#movie_player.ad-showing')) return;
      if (video && isFinite(video.duration) && video.duration > 0) {
        if (video.duration > 300) return;
        video.currentTime = video.duration - 0.1;
        video.play().catch(() => {});
      }
    }, 200);
  }

  if (window.__adSkipperInterval) clearInterval(window.__adSkipperInterval);
  window.__adSkipperInterval = setInterval(trySkip, POLL_MS);
})();
