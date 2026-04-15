// ==UserScript==
// @name         Hide Messages with Stickers in Telegram Web
// @namespace    https://github.com/sammrai
// @version      1.0.0
// @description  Hide entire messages containing stickers in Telegram Web using MutationObserver.
// @author       sammrai
// @match        https://web.telegram.org/*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/telegram_hide_stickers/telegram_hide_stickers.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/telegram_hide_stickers/telegram_hide_stickers.user.js
// ==/UserScript==

(function() {
    'use strict';

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        const sticker = node.querySelector('.Sticker');
                        if (sticker) {
                            const messageElement = sticker.closest('.message-list-item');
                            if (messageElement) {
                                messageElement.style.display = 'none';
                            }
                        }
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
