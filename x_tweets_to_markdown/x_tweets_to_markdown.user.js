// ==UserScript==
// @name         X Tweets → Markdown
// @namespace    https://github.com/sammrai
// @version      2.0.0
// @description  表示中のツイートをMarkdown形式でクリップボードにコピー
// @author       sammrai
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setClipboard
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/x_tweets_to_markdown/x_tweets_to_markdown.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/x_tweets_to_markdown/x_tweets_to_markdown.user.js
// ==/UserScript==

(() => {
  const store = new Map();

  const btn = Object.assign(document.createElement('button'), {
    onclick: copy
  });
  Object.assign(btn.style, {
    position:'fixed', bottom:'24px', right:'24px', zIndex:'99999',
    background:'#1d9bf0', color:'#fff', border:'none', borderRadius:'50px',
    padding:'10px 18px', fontSize:'14px', fontWeight:'700', cursor:'pointer',
    boxShadow:'0 2px 8px rgba(0,0,0,.3)'
  });
  document.body.appendChild(btn);
  update();

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

  // ── ツイート監視 ──
  new MutationObserver(() => {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(el => {
      const time = el.querySelector('time');
      const key = time?.closest('a')?.href;
      if (!key || store.has(key)) return;
      const handle = el.querySelector('[data-testid="User-Name"]')?.textContent.match(/@\w+/)?.[0] || '';
      const date = time?.dateTime ? new Date(time.dateTime).toLocaleString('ja-JP') : '';
      const text = el.querySelector('[data-testid="tweetText"]')?.innerText || '';
      store.set(key, `**${handle}** — ${date}\n${text}\n[→ 元ツイート](${key})`);
      update();
    });
  }).observe(document.body, { childList: true, subtree: true });

  function update() { btn.textContent = `📋 MD ${store.size}`; }

  function copy() {
    if (!store.size) return;
    const md = getProfile() + '\n---\n\n' + [...store.values()].join('\n\n---\n\n');
    typeof GM_setClipboard === 'function' ? GM_setClipboard(md, 'text') : navigator.clipboard.writeText(md);
    btn.textContent = `✅ ${store.size}件コピー`;
    setTimeout(update, 2000);
  }
})();
