// ==UserScript==
// @name         X Tweets → Markdown
// @namespace    https://github.com/sammrai
// @version      2.4.0
// @description  表示中のツイートをMarkdown形式でクリップボードにコピー
// @author       sammrai
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @sandbox      JavaScript
// @inject-into  auto
// @license      MIT
// @run-at       document-start
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/x_tweets_to_markdown/x_tweets_to_markdown.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/x_tweets_to_markdown/x_tweets_to_markdown.user.js
// ==/UserScript==
(() => {
  // サンドボックスの window を差し替えてもページの通信には当たらないので、ページ側の window を使う
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // ═══════════════════════════════════════════════════════
  // fetch/XHR横取り — document-start で早期に仕込む
  //   1) 429 (レートリミット) の検知
  //   2) タイムラインAPIが「カーソルのみ・ツイート無し」を返す“静かな足止め”の検知
  //   3) 「さらに表示」で畳まれた長文の全文を拾う
  // ═══════════════════════════════════════════════════════
  let rateLimitResetAt = 0;   // epoch ms (0 = 制限中でない)
  let onRateLimit = null;     // UI側から差し込むコールバック

  function notifyRateLimit(resetEpochSec) {
    const resetAt = (resetEpochSec ? resetEpochSec * 1000 : Date.now() + 15 * 60 * 1000) + 3000;
    if (rateLimitResetAt && resetAt <= rateLimitResetAt) return;
    rateLimitResetAt = resetAt;
    onRateLimit?.(resetAt);
  }

  let consecutiveStalls = 0;
  let onStallChange = null;     // UI側から差し込むコールバック(count)
  let onLongText = null;        // 長文が届いたときのコールバック
  const longTexts = new Map();  // ツイートID → 全文 (note_tweet)

  // レスポンスJSONの中から { type: "TimelineAddEntries", entries: [...] } を再帰的に探す
  function extractAddEntries(json) {
    const found = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (Array.isArray(node.instructions)) {
        node.instructions.forEach(instr => {
          if (instr?.type === 'TimelineAddEntries' && Array.isArray(instr.entries)) {
            found.push(...instr.entries);
          }
        });
      }
      for (const k in node) walk(node[k]);
    })(json);
    return found;
  }

  // ツイート本体 ({ rest_id, legacy: { full_text } }) を数え、長文があれば全文を控える
  function collectTweets(node) {
    let count = 0;
    (function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.rest_id && typeof n.legacy?.full_text === 'string') {
        count++;
        const note = n.note_tweet?.note_tweet_results?.result;
        if (note?.text) {
          let text = note.text;
          (note.entity_set?.urls || []).forEach(u => {
            if (u.url && u.expanded_url) text = text.split(u.url).join(u.expanded_url);
          });
          longTexts.set(n.rest_id, text);
        }
      }
      for (const k in n) walk(n[k]);
    })(node);
    return count;
  }

  function inspectTimelineJson(json) {
    const before = longTexts.size;
    const entries = extractAddEntries(json);
    if (!entries.length) {
      collectTweets(json); // 詳細画面などタイムライン以外でも長文は拾う
    } else {
      // おすすめユーザーの枠などツイートを含まない項目は数えない
      const hasTweet = collectTweets(entries) > 0;
      consecutiveStalls = hasTweet ? 0 : consecutiveStalls + 1;
      onStallChange?.(consecutiveStalls);
    }
    if (longTexts.size > before) onLongText?.();
  }

  const isApi = (url) => /\/graphql\/|\/i\/api\//.test(String(url || ''));

  const origFetch = W.fetch;
  W.fetch = function (...args) {
    return origFetch.apply(this, args).then(res => {
      if (res.status === 429) {
        notifyRateLimit(Number(res.headers.get('x-rate-limit-reset')) || 0);
      } else if (res.ok && isApi(res.url)) {
        res.clone().json().then(inspectTimelineJson).catch(() => {});
      }
      return res;
    });
  };

  const origSend = W.XMLHttpRequest.prototype.send;
  W.XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (this.status === 429) {
        notifyRateLimit(Number(this.getResponseHeader('x-rate-limit-reset')) || 0);
      } else if (this.status >= 200 && this.status < 300 && isApi(this.responseURL)) {
        try {
          const json = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          inspectTimelineJson(json);
        } catch (_) { /* JSON以外は無視 */ }
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
    const STALL_THRESHOLD = 2;               // 何回連続で「空ページ」が来たら足止めとみなすか
    const STALL_COOLDOWN_MS = 3 * 60 * 1000; // 足止め時のクールダウン時間
    const STORAGE_PREFIX = 'x2md:';

    // X は画面を読み直さずにページを切り替えるので、集めたツイートはページ (URL) ごとに分けて持つ。
    // sessionStorage に退避するので、レートリミット後の再読み込みでも消えない
    let pageKey = currentPageKey() || location.pathname;
    let store = loadStore(pageKey);
    let saveTimer = null;

    let autoScrolling = false;
    let scrollTimer = null;
    let rateLimitTimer = null;
    let stallCooldownTimer = null;
    let inStallCooldown = false;

    const baseStyle = {
      position:'fixed', right:'24px', zIndex:'99999',
      color:'#fff', border:'none', borderRadius:'50px',
      padding:'10px 18px', fontSize:'14px', fontWeight:'700', cursor:'pointer',
      boxShadow:'0 2px 8px rgba(0,0,0,.3)'
    };

    const btn = Object.assign(document.createElement('button'), { onclick: copy });
    Object.assign(btn.style, baseStyle, { bottom:'24px', background:'#1d9bf0' });
    document.body.appendChild(btn);

    const scrollBtn = Object.assign(document.createElement('button'), { onclick: toggleAutoScroll });
    Object.assign(scrollBtn.style, baseStyle, { bottom:'74px', background:'#0f1419' });
    document.body.appendChild(scrollBtn);

    const clearBtn = Object.assign(document.createElement('button'), { onclick: clearStore, textContent: '🗑' });
    Object.assign(clearBtn.style, baseStyle, { bottom:'124px', background:'#536471', padding:'10px 14px' });
    clearBtn.title = 'このページで集めたツイートを消す';
    document.body.appendChild(clearBtn);

    update();
    updateScrollBtn();

    // document-start 側で先に検知していた場合に備える
    onRateLimit = (resetAt) => startRateLimitCountdown(resetAt);
    if (rateLimitResetAt) startRateLimitCountdown(rateLimitResetAt);

    onStallChange = (count) => {
      if (inStallCooldown || rateLimitResetAt) return;
      if (count >= STALL_THRESHOLD && autoScrolling) startStallCooldown();
    };

    onLongText = () => scheduleScan();

    // ── ページの切り替え ──
    // 画像の拡大や投稿の画面は一覧の上に重なるだけなので、直前のページのまま集める
    function currentPageKey() {
      const p = location.pathname.replace(/\/+$/, '') || '/';
      if (/\/(photo|video)\/\d+$/.test(p) || p.startsWith('/compose/') || p.startsWith('/i/display')) return null;
      return p.toLowerCase();
    }

    function checkNavigation() {
      const key = currentPageKey();
      if (!key || key === pageKey) return;
      saveStore();
      pageKey = key;
      store = loadStore(key);
      update();
    }

    function loadStore(key) {
      try {
        const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
        return new Map(raw ? JSON.parse(raw) : []);
      } catch (_) {
        return new Map();
      }
    }

    function saveStore() {
      clearTimeout(saveTimer);
      saveTimer = null;
      const data = JSON.stringify([...store]);
      try {
        sessionStorage.setItem(STORAGE_PREFIX + pageKey, data);
      } catch (_) {
        // 容量切れ: 他のページの分を捨てて入れ直す
        Object.keys(sessionStorage)
          .filter(k => k.startsWith(STORAGE_PREFIX) && k !== STORAGE_PREFIX + pageKey)
          .forEach(k => sessionStorage.removeItem(k));
        try { sessionStorage.setItem(STORAGE_PREFIX + pageKey, data); } catch (_) { /* 諦める */ }
      }
    }

    function scheduleSave() {
      if (!saveTimer) saveTimer = setTimeout(saveStore, 1000);
    }

    function clearStore() {
      store.clear();
      sessionStorage.removeItem(STORAGE_PREFIX + pageKey);
      update();
    }

    // ── プロフィール (JSON-LDスキーマから取得、無ければ画面から) ──
    function getProfile() {
      let u = null;
      try {
        const el = document.querySelector('[data-testid="UserProfileSchema-test"]');
        u = el ? JSON.parse(el.textContent).mainEntity : null;
      } catch (_) { /* 壊れたJSONは無視 */ }

      const domName = document.querySelector('[data-testid="UserName"]')?.innerText.split('\n') || [];
      const handle = u?.additionalName
        || domName.find(s => s.startsWith('@'))?.slice(1)
        || location.pathname.split('/')[1] || '';
      if (!handle) return '';

      const desc = u?.description ?? document.querySelector('[data-testid="UserDescription"]')?.innerText ?? '';
      const stat = (key) => u?.interactionStatistic?.find(s => s.name === key)?.userInteractionCount ?? '?';
      return [
        `# @${handle}`,
        desc ? `> ${desc.replace(/\n/g, '\n> ')}` : '',
        `📊 **${stat('Friends')}** フォロー / **${stat('Follows')}** フォロワー / **${stat('Tweets')}** ポスト`,
      ].filter(Boolean).join('\n\n') + '\n';
    }

    const pad = (n) => String(n).padStart(2, '0');
    function formatDate(iso) {
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    const origImage = (src) => /[?&]name=/.test(src) ? src.replace(/([?&]name=)[^&]+/, '$1orig') : src;

    // 本文の要素を文字にする。innerText だと短縮URLの隠れた部分で改行が入るので、
    // リンクは隠れた部分も含めた全体 (末尾の … は除く)、絵文字の画像は alt を使う
    function richText(node) {
      if (!node) return '';
      let out = '';
      (function walk(n) {
        if (n.nodeType === Node.TEXT_NODE) { out += n.nodeValue; return; }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        if (n.getAttribute('aria-hidden') === 'true' && n.textContent === '…') return; // 短縮表示の印
        if (n.tagName === 'IMG') { out += n.alt || ''; return; }
        if (n.tagName === 'BR') { out += '\n'; return; }
        if (n.tagName === 'A') { out += n.textContent.replace(/…$/, ''); return; }
        n.childNodes.forEach(walk);
      })(node);
      return out.trim();
    }

    // X の記事 (Article) の表題と冒頭。表紙の画像の近くで文字のある枠を探す
    function articleText(cover, root) {
      if (!cover) return '';
      let box = cover.parentElement;
      const strip = (s) => s.split('\n').map(l => l.trim()).filter(l => l && !/^(Article|記事)$/.test(l));
      while (box && box !== root && !strip(box.innerText).length) box = box.parentElement;
      const lines = box && box !== root ? strip(box.innerText) : [];
      return lines.length ? `📰 **${lines[0]}**\n${lines.slice(1).join('\n')}`.trim() : '';
    }

    // リポスト・固定などの見出し
    function contextLine(text) {
      if (!text) return '';
      const icon = /repost|retweet|リポスト/i.test(text) ? '🔁' : /pinned|固定/i.test(text) ? '📌' : '💬';
      return `*${icon} ${text}*`;
    }

    // 本文・画像・動画・カード・記事を Markdown の行にする (メインと引用で共通)
    function bodyLines(pick, root) {
      const lines = [];
      const text = richText(pick('[data-testid="tweetText"]')[0]);
      if (text) lines.push(text);

      pick('[data-testid="tweetPhoto"] img')
        .map(img => img.src)
        .filter(Boolean)
        .forEach(src => lines.push(`![image](${origImage(src)})`));
      if (pick('[data-testid="videoPlayer"]').length) lines.push('🎞 動画あり');

      // リンクカード (note.com などのプレビューカード)
      const cardWrapper = pick('[data-testid="card.wrapper"]')[0];
      const cardUrl = cardWrapper?.querySelector('a[href]')?.href || '';
      if (cardUrl) {
        const cardTitle = cardWrapper.textContent.trim().replace(/\s+/g, ' ') || cardUrl;
        lines.push(`[${cardTitle}](${cardUrl})`);
      }

      const article = articleText(pick('[data-testid="article-cover-image"]')[0], root);
      if (article) lines.push(article);
      return lines;
    }

    // ── ツイート1件を解析してstoreに格納(既存分も上書きして画像の遅延読込に対応) ──
    function processArticle(el) {
      // 引用ツイートは記事の中の div[role="link"] の枠に入っている。本文と混ぜないよう分ける
      const quote = [...el.querySelectorAll('div[role="link"]')]
        .find(q => q.querySelector('[data-testid="User-Name"]'));
      const own = (sel) => [...el.querySelectorAll(sel)].filter(n => !quote?.contains(n));
      const inQuote = (sel) => [...quote.querySelectorAll(sel)];

      const time = own('time')[0];
      const key = time?.closest('a')?.href;
      if (!key) return;
      const id = key.match(/\/status\/(\d+)/)?.[1];

      // リポストではここが元の投稿者になる (誰がリポストしたかは見出しの行に出る)
      const handle = own('[data-testid="User-Name"]')[0]?.textContent.match(/@\w+/)?.[0] || '';
      const date = time.dateTime ? formatDate(time.dateTime) : '';

      const lines = [];
      const context = contextLine(own('[data-testid="socialContext"]')[0]?.innerText.trim());
      if (context) lines.push(context);
      lines.push(`**${handle}** — [${date}](${key})`);

      const body = bodyLines(own, el);
      if (own('[data-testid="tweet-text-show-more-link"]').length) {
        const full = id && longTexts.get(id);
        if (full && own('[data-testid="tweetText"]').length) body[0] = full;
        else if (body.length) body[0] += '…（省略あり）';
      }
      lines.push(...body);

      // 引用ツイート
      if (quote) {
        const qHandle = inQuote('[data-testid="User-Name"]')[0]?.textContent.match(/@\w+/)?.[0] || '';
        const qTime = inQuote('time')[0]?.dateTime;
        const qHead = `🗨 **${qHandle}**` + (qTime ? ` — ${formatDate(qTime)}` : '');
        const qLines = [qHead, ...bodyLines(inQuote, quote)];
        lines.push(qLines.join('\n').replace(/^/gm, '> '));
      }

      // 画像/カード/全文が後から読み込まれた場合に備え、既存エントリより情報が増えたら上書き
      const entry = lines.join('\n');
      if (!store.has(key) || store.get(key).length < entry.length) {
        store.set(key, entry);
        update();
        scheduleSave();
      }
    }

    function scan() {
      checkNavigation();
      document.querySelectorAll('article[data-testid="tweet"]').forEach(processArticle);
    }

    let scanTimer = null;
    function scheduleScan() {
      if (!scanTimer) scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 100);
    }

    // ── ツイート監視 & エラーメッセージ監視 ──
    let fallbackRetryTimer = null;
    new MutationObserver(() => {
      scheduleScan();

      // 429ヘッダーを取り逃した場合のフォールバック:
      // 「Something went wrong. Try reloading.」が出ていたら一定間隔でRetryを押し続ける
      if (!rateLimitResetAt && !fallbackRetryTimer && findRetryButton()) {
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
    window.addEventListener('beforeunload', saveStore);
    scan();

    function findRetryButton() {
      return [...document.querySelectorAll('button[role="button"]')]
        .find(b => ['Retry', 'やりなおす', '再試行'].includes(b.textContent.trim()));
    }

    function update() { btn.textContent = `📋 MD ${store.size}`; }

    function copy() {
      if (!store.size) return;
      const md = getProfile() + '\n---\n\n' + [...store.values()].join('\n\n---\n\n') + '\n';
      typeof GM_setClipboard === 'function' ? GM_setClipboard(md, 'text') : navigator.clipboard.writeText(md);
      btn.textContent = `✅ ${store.size}件コピー`;
      setTimeout(update, 2000);
    }

    // ── 自動最下部スクロール (間隔にランダム性を持たせてBot的な一定間隔を避ける) ──
    function scrollLoop() {
      window.scrollTo(0, document.body.scrollHeight);
      scrollTimer = setTimeout(scrollLoop, 1200 + Math.random() * 1000);
    }

    function toggleAutoScroll() {
      autoScrolling = !autoScrolling;
      updateScrollBtn();
      if (autoScrolling) scrollLoop();
      else {
        clearTimeout(scrollTimer);
        scrollTimer = null;
      }
    }

    function updateScrollBtn() {
      if (rateLimitResetAt || inStallCooldown) return; // カウントダウン表示中は上書きしない
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
          else { saveStore(); location.reload(); } // 集めた分は sessionStorage から戻る

          updateScrollBtn();
          if (wasScrolling) setTimeout(() => { if (!autoScrolling) toggleAutoScroll(); }, 1500);
        } else {
          scrollBtn.textContent = `⏳ 制限解除まで ${Math.ceil(remain / 1000)}s`;
        }
      }, 1000);
    }

    // ── 「カーソルのみ・ツイート無し」の足止め検知 → 一定時間休んで自動再開 ──
    function startStallCooldown() {
      inStallCooldown = true;
      const wasScrolling = autoScrolling;
      if (autoScrolling) toggleAutoScroll();

      const resumeAt = Date.now() + STALL_COOLDOWN_MS;
      clearInterval(stallCooldownTimer);
      stallCooldownTimer = setInterval(() => {
        if (rateLimitResetAt) return; // 429待ちが優先
        const remain = resumeAt - Date.now();
        if (remain <= 0) {
          clearInterval(stallCooldownTimer);
          stallCooldownTimer = null;
          inStallCooldown = false;
          consecutiveStalls = 0;
          updateScrollBtn();
          if (wasScrolling) toggleAutoScroll();
        } else {
          scrollBtn.textContent = `⏳ 読み込み停滞中 ${Math.ceil(remain / 1000)}s`;
        }
      }, 1000);
    }
  }
})();
