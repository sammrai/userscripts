// ==UserScript==
// @name         X Tweets → Markdown
// @namespace    https://github.com/sammrai
// @version      2.2.0
// @description  表示中のツイートをMarkdown形式でクリップボードにコピー
// @author       sammrai
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setClipboard
// @license      MIT
// @run-at       document-start
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/x_tweets_to_markdown/x_tweets_to_markdown.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/x_tweets_to_markdown/x_tweets_to_markdown.user.js
// ==/UserScript==
(() => {
  // ═══════════════════════════════════════════════════════
  // レートリミット(429)検知 — fetch/XHRを横取りするので document-start で早期に仕込む
  // ═══════════════════════════════════════════════════════
  let rateLimitResetAt = 0;   // epoch ms (0 = 制限中でない)
  let onRateLimit = null;     // UI側から差し込むコールバック

  function notifyRateLimit(resetEpochSec) {
    const resetAt = (resetEpochSec ? resetEpochSec * 1000 : Date.now() + 15 * 60 * 1000) + 3000;
    if (rateLimitResetAt && resetAt <= rateLimitResetAt) return;
    rateLimitResetAt = resetAt;
    onRateLimit?.(resetAt);
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    return origFetch.apply(this, args).then(res => {
      if (res.status === 429) {
        notifyRateLimit(Number(res.headers.get('x-rate-limit-reset')) || 0);
      }
      return res;
    });
  };

  const OrigXHR = window.XMLHttpRequest;
  const origSend = OrigXHR.prototype.send;
  OrigXHR.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (this.status === 429) {
        const reset = Number(this.getResponseHeader('x-rate-limit-reset')) || 0;
        notifyRateLimit(reset);
      }
    });
    return origSend.apply(this, args);
  };

  // ═══════════════════════════════════════════════════════
  // ここから先はDOM操作。bodyができてから実行する
  // ═══════════════════════════════════════════════════════
  const start = () => init();
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  function init() {
    const store = new Map();
    let autoScrolling = false;
    let scrollTimer = null;
    let rateLimitTimer = null;

    const btn = Object.assign(document.createElement('button'), { onclick: copy });
    Object.assign(btn.style, {
      position:'fixed', bottom:'24px', right:'24px', zIndex:'99999',
      background:'#1d9bf0', color:'#fff', border:'none', borderRadius:'50px',
      padding:'10px 18px', fontSize:'14px', fontWeight:'700', cursor:'pointer',
      boxShadow:'0 2px 8px rgba(0,0,0,.3)'
    });
    document.body.appendChild(btn);

    const scrollBtn = Object.assign(document.createElement('button'), { onclick: toggleAutoScroll });
    Object.assign(scrollBtn.style, {
      position:'fixed', bottom:'74px', right:'24px', zIndex:'99999',
      background:'#0f1419', color:'#fff', border:'none', borderRadius:'50px',
      padding:'10px 18px', fontSize:'14px', fontWeight:'700', cursor:'pointer',
      boxShadow:'0 2px 8px rgba(0,0,0,.3)'
    });
    document.body.appendChild(scrollBtn);

    update();
    updateScrollBtn();

    // document-start 側で先に429を検知していた場合に備える
    onRateLimit = (resetAt) => startRateLimitCountdown(resetAt);
    if (rateLimitResetAt) startRateLimitCountdown(rateLimitResetAt);

    // ── プロフィール (JSON-LDスキーマから取得) ──
    function getProfile() {
      const el = document.querySelector('[data-testid="UserProfileSchema-test"]');
      if (!el) return '';
      const { mainEntity: u } = JSON.parse(el.textContent);
      if (!u) return '';
      const stat = (name) => u.interactionStatistic?.find(s => s.name === name)?.userInteractionCount ?? '?';
      return [
        `# ${u.givenName} (@${u.additionalName})`,
        `> ${u.description?.replace(/\n/g, '\n> ')}`,
        `📊 **${stat('Friends')}** フォロー / **${stat('Follows')}** フォロワー / **${stat('Tweets')}** ポスト\n`,
      ].join('\n\n');
    }

    // ── ツイート1件を解析してstoreに格納(既存分も上書きして画像の遅延読込に対応) ──
    function processArticle(el) {
      const time = el.querySelector('time');
      const key = time?.closest('a')?.href;
      if (!key) return;

      const handle = el.querySelector('[data-testid="User-Name"]')?.textContent.match(/@\w+/)?.[0] || '';
      const date = time?.dateTime ? new Date(time.dateTime).toLocaleString('ja-JP') : '';
      const text = el.querySelector('[data-testid="tweetText"]')?.innerText || '';

      // 添付画像
      const images = [...el.querySelectorAll('[data-testid="tweetPhoto"] img')]
        .map(img => img.src)
        .filter(Boolean);

      // リンクカード (note.com などのプレビューカード)
      const cardWrapper = el.querySelector('[data-testid="card.wrapper"]');
      const cardAnchor = cardWrapper?.querySelector('a[href]');
      const cardUrl = cardAnchor?.href || '';
      const cardTitle = cardWrapper?.textContent?.trim() || cardUrl;

      const lines = [`**${handle}** — ${date}`, text];
      images.forEach(src => lines.push(`![image](${src})`));
      if (cardUrl) lines.push(`[${cardTitle}](${cardUrl})`);

      // 画像/カードが後から読み込まれた場合に備え、既存エントリより情報が増えたら上書き
      const entry = lines.join('\n');
      if (!store.has(key) || store.get(key).length < entry.length) {
        store.set(key, entry);
        update();
      }
    }

    // ── ツイート監視 & エラーメッセージ監視 ──
    let fallbackRetryTimer = null;
    new MutationObserver(() => {
      document.querySelectorAll('article[data-testid="tweet"]').forEach(processArticle);

      // 429ヘッダーを取り逃した場合のフォールバック:
      // 「Something went wrong. Try reloading.」が出ていたら一定間隔でRetryを押し続ける
      if (!rateLimitResetAt && findRetryButton() && !fallbackRetryTimer) {
        fallbackRetryTimer = setInterval(() => {
          const retryBtn = findRetryButton();
          if (!retryBtn) {
            clearInterval(fallbackRetryTimer);
            fallbackRetryTimer = null;
            return;
          }
          retryBtn.click();
        }, 30000);
      }
    }).observe(document.body, { childList: true, subtree: true });

    function findRetryButton() {
      return [...document.querySelectorAll('button[role="button"]')]
        .find(b => b.textContent.trim() === 'Retry');
    }

    function update() { btn.textContent = `📋 MD ${store.size}`; }

    function copy() {
      if (!store.size) return;
      const md = getProfile() + '\n---\n\n' + [...store.values()].join('\n\n---\n\n');
      typeof GM_setClipboard === 'function' ? GM_setClipboard(md, 'text') : navigator.clipboard.writeText(md);
      btn.textContent = `✅ ${store.size}件コピー`;
      setTimeout(update, 2000);
    }

    // ── 自動最下部スクロール ──
    function toggleAutoScroll() {
      autoScrolling = !autoScrolling;
      updateScrollBtn();
      if (autoScrolling) {
        scrollTimer = setInterval(() => {
          window.scrollTo(0, document.body.scrollHeight);
        }, 800);
      } else {
        clearInterval(scrollTimer);
        scrollTimer = null;
      }
    }

    function updateScrollBtn() {
      if (rateLimitResetAt) return; // カウントダウン表示中は上書きしない
      scrollBtn.textContent = autoScrolling ? '⏸ 自動スクロール中' : '⬇ 自動スクロール';
    }

    // ── レートリミット解除待ち → 自動リトライ ──
    function startRateLimitCountdown(resetAt) {
      rateLimitResetAt = resetAt;

      const wasScrolling = autoScrolling;
      if (autoScrolling) toggleAutoScroll(); // 制限中はスクロールを止める

      clearInterval(rateLimitTimer);
      rateLimitTimer = setInterval(() => {
        const remain = rateLimitResetAt - Date.now();
        if (remain <= 0) {
          clearInterval(rateLimitTimer);
          rateLimitTimer = null;
          rateLimitResetAt = 0;

          const retryBtn = findRetryButton();
          if (retryBtn) retryBtn.click();
          else location.reload();

          updateScrollBtn();
          if (wasScrolling) setTimeout(() => { if (!autoScrolling) toggleAutoScroll(); }, 1500);
        } else {
          scrollBtn.textContent = `⏳ 制限解除まで ${Math.ceil(remain / 1000)}s`;
        }
      }, 1000);
    }
  }
})();
