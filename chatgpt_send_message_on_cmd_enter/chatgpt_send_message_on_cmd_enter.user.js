// ==UserScript==
// @name         ChatGPT Send Message on Cmd+Enter User Script
// @namespace    https://github.com/sammrai
// @version      0.1
// @description  Allows users to send messages on the chat.openai.com website by pressing Cmd+Enter (or Ctrl+Enter) instead of Enter alone, preventing accidental form submission when confirming Japanese input with Enter on Safari.
// @author       sammrai
// @match        https://chat.openai.com/*
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/chatgpt_send_message_on_cmd_enter.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/chatgpt_send_message_on_cmd_enter.user.js
// ==/UserScript==

(function() {
    'use strict';

    function addEnterKeyListener(textarea) {
        if (!textarea.dataset.enterKeyListenerAdded) {
            textarea.dataset.enterKeyListenerAdded = 'true';
            textarea.addEventListener('keydown', (e) => {
                if (e.code == "Enter" && !e.metaKey) {
                    e.stopPropagation();
                }
            }, { capture: true });
        }
    }

    function checkAndAddListenersToTextareas() {
        document.querySelectorAll('textarea').forEach(addEnterKeyListener);
        requestAnimationFrame(checkAndAddListenersToTextareas);
    }

    function init() {
        checkAndAddListenersToTextareas();
    }

    document.readyState === "loading"
        ? document.addEventListener("DOMContentLoaded", init)
        : init();
})();
