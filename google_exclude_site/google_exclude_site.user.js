// ==UserScript==
// @name         Google Search Exclude Site Button
// @namespace    https://github.com/sammrai
// @version      1.1.0
// @description  Google検索結果のサイト名の横に「除外」ボタンを追加し、押すと検索欄に -site:ドメイン を追記
// @author       sammrai
// @match        https://www.google.com/search*
// @match        https://www.google.co.jp/search*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/google_exclude_site/google_exclude_site.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/google_exclude_site/google_exclude_site.user.js
// ==/UserScript==

(function () {
  'use strict';

  const MARK = 'data-exclude-site-added';

  const style = document.createElement('style');
  style.textContent = `
    .xs-site-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .xs-exclude-btn {
      flex-shrink: 0;
      font: 11px/16px Arial, sans-serif;
      color: #70757a;
      border: 1px solid #dadce0;
      border-radius: 9999px;
      padding: 0 6px;
      cursor: pointer;
      user-select: none;
    }
    .xs-exclude-btn:hover { color: #b3261e; border-color: #b3261e; background: #fce8e6; }
  `;
  document.head.appendChild(style);

  function getDomain(href) {
    try {
      const u = new URL(href, location.href);
      if (!/^https?:$/.test(u.protocol)) return null;
      if (/(^|\.)google\./.test(u.hostname)) return null;
      return u.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  function appendToSearchBox(domain) {
    const box = document.querySelector('form[role="search"] textarea[name="q"], textarea[name="q"], input[name="q"]');
    if (!box) return;
    const term = `-site:${domain}`;
    const tokens = box.value.trim().split(/\s+/).filter(Boolean);
    if (!tokens.includes(term)) tokens.push(term);
    box.value = tokens.join(' ') + ' ';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }

  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function addButtons(root) {
    root.querySelectorAll('a[jsname="UWckNb"]').forEach((link) => {
      if (link.hasAttribute(MARK)) return;
      const domain = getDomain(link.href);
      const siteName = link.querySelector('.VuuXrf');
      if (!domain || !siteName) return;
      link.setAttribute(MARK, '1');

      const row = siteName.parentElement;
      row.classList.add('xs-site-row');

      const btn = document.createElement('span');
      btn.className = 'xs-exclude-btn';
      btn.setAttribute('role', 'button');
      btn.textContent = '除外';
      btn.title = `検索欄に -site:${domain} を追加`;
      btn.addEventListener('mousedown', stop, true);
      btn.addEventListener('click', (e) => {
        stop(e);
        appendToSearchBox(domain);
      }, true);
      row.appendChild(btn);
    });
  }

  addButtons(document);
  new MutationObserver(() => addButtons(document)).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
