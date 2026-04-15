// ==UserScript==
// @name         Etherscanの日付を日本時間に変換
// @namespace    https://github.com/sammrai
// @version      1.0.0
// @description  Etherscanの特定の要素の日付を日本時間に変換し、ツールチップを更新します
// @author       sammrai
// @match        *://*etherscan.io/*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/etherscan_jst/etherscan_jst.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/etherscan_jst/etherscan_jst.user.js
// ==/UserScript==

(function() {
    'use strict';

    function convertDateToJST(dateString) {
        const dateMatch = dateString.match(/(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (dateMatch) {
            const utcDate = new Date(Date.UTC(
                parseInt(dateMatch[1], 10),
                parseInt(dateMatch[2], 10) - 1,
                parseInt(dateMatch[3], 10),
                parseInt(dateMatch[4], 10),
                parseInt(dateMatch[5], 10),
                parseInt(dateMatch[6], 10)
            ));
            return utcDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + ' (JST)';
        }
        return dateString;
    }

    window.addEventListener('load', () => {
        const elements = document.querySelectorAll('.showAge span[rel="tooltip"]');
        elements.forEach(element => {
            const originalDate = element.getAttribute('data-bs-title');
            if (originalDate) {
                const convertedDate = convertDateToJST(originalDate);
                element.setAttribute('data-bs-title', convertedDate);

                if (bootstrap && bootstrap.Tooltip.getInstance(element)) {
                    const tooltipInstance = bootstrap.Tooltip.getInstance(element);
                    tooltipInstance.dispose();
                    element.setAttribute('title', convertedDate);
                    new bootstrap.Tooltip(element);
                }
            }
        });
    });
})();
