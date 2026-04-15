// ==UserScript==
// @name         YouTube IINA Button
// @namespace    https://github.com/sammrai
// @version      0.1.0
// @description  Add IINA open button to YouTube video page with current time
// @author       sammrai
// @match        https://www.youtube.com/*
// @icon         https://upload.wikimedia.org/wikipedia/commons/1/12/IINA-v1.1-icon.png
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/youtube_iina_button/youtube_iina_button.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/youtube_iina_button/youtube_iina_button.user.js
// ==/UserScript==

(function() {
    'use strict';

    let buttonInserted = false;

    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    function getCurrentTime() {
        const video = document.querySelector('video');
        if (video) {
            return Math.floor(video.currentTime);
        }
        return 0;
    }

    function pauseVideo() {
        const video = document.querySelector('video');
        if (video) {
            video.pause();
        }
    }

    function createIINAButton() {
        const videoId = getVideoId();
        if (!videoId) return null;

        // yt-button-view-modelを作成（他のボタンと同じ構造）
        const buttonContainer = document.createElement('yt-button-view-model');
        buttonContainer.className = 'ytd-menu-renderer';
        buttonContainer.setAttribute('style', 'margin-left: 8px;');
        buttonContainer.setAttribute('data-iina-button', 'true');

        // button-view-modelを作成
        const buttonViewModel = document.createElement('button-view-model');
        buttonViewModel.className = 'ytSpecButtonViewModelHost style-scope ytd-menu-renderer';

        // ボタン要素を作成
        const button = document.createElement('button');
        button.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--enable-backdrop-filter-experiment';
        button.setAttribute('aria-label', 'IINAで開く');
        button.setAttribute('aria-disabled', 'false');

        // クリックイベントを追加
        button.addEventListener('click', function(e) {
            e.preventDefault();

            // 現在の再生位置を取得
            const currentTime = getCurrentTime();
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const urlWithTime = `${videoUrl} ${currentTime}`;
            const iinaUrl = `shortcuts://run-shortcut?name=iina.shortcut&input=${encodeURIComponent(urlWithTime)}`;

            // 動画を一時停止
            pauseVideo();

            // IINAに遷移
            window.location.href = iinaUrl;
        });

        // アイコン部分を作成
        const iconDiv = document.createElement('div');
        iconDiv.className = 'yt-spec-button-shape-next__icon';
        iconDiv.setAttribute('aria-hidden', 'true');

        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'ytIconWrapperHost';
        iconWrapper.setAttribute('style', 'width: 24px; height: 24px;');

        const iconShape = document.createElement('span');
        iconShape.className = 'yt-icon-shape ytSpecIconShapeHost';

        const iconContainer = document.createElement('div');
        iconContainer.setAttribute('style', 'width: 100%; height: 100%; display: block; fill: currentcolor;');

        // SVGアイコンをDOM APIで作成
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '24');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('style', 'pointer-events: none; display: inherit; width: 100%; height: 100%;');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M8 5v14l11-7L8 5z');

        svg.appendChild(path);
        iconContainer.appendChild(svg);
        iconShape.appendChild(iconContainer);
        iconWrapper.appendChild(iconShape);
        iconDiv.appendChild(iconWrapper);

        // テキスト部分を作成
        const textDiv = document.createElement('div');
        textDiv.className = 'yt-spec-button-shape-next__button-text-content';

        const textSpan = document.createElement('span');
        textSpan.className = 'yt-core-attributed-string yt-core-attributed-string--white-space-no-wrap';
        textSpan.setAttribute('role', 'text');
        textSpan.textContent = 'IINA';

        textDiv.appendChild(textSpan);

        // タッチフィードバック
        const touchFeedback = document.createElement('yt-touch-feedback-shape');
        touchFeedback.className = 'yt-spec-touch-feedback-shape yt-spec-touch-feedback-shape--touch-response';
        touchFeedback.setAttribute('aria-hidden', 'true');

        const stroke = document.createElement('div');
        stroke.className = 'yt-spec-touch-feedback-shape__stroke';

        const fill = document.createElement('div');
        fill.className = 'yt-spec-touch-feedback-shape__fill';

        touchFeedback.appendChild(stroke);
        touchFeedback.appendChild(fill);

        // ボタンに要素を追加
        button.appendChild(iconDiv);
        button.appendChild(textDiv);
        button.appendChild(touchFeedback);

        buttonViewModel.appendChild(button);
        buttonContainer.appendChild(buttonViewModel);

        return buttonContainer;
    }

    function insertButton() {
        if (buttonInserted) return true;

        const existingButton = document.querySelector('[data-iina-button="true"]');
        if (existingButton) {
            buttonInserted = true;
            return true;
        }

        const topLevelButtons = document.querySelector('#top-level-buttons-computed');

        if (topLevelButtons) {
            const iinaButton = createIINAButton();
            if (iinaButton) {
                const flexibleItemButtons = topLevelButtons.querySelector('#flexible-item-buttons');
                if (flexibleItemButtons) {
                    topLevelButtons.insertBefore(iinaButton, flexibleItemButtons);
                } else {
                    topLevelButtons.appendChild(iinaButton);
                }
                buttonInserted = true;
                return true;
            }
        }
        return false;
    }

    function init() {
        buttonInserted = false;

        let attempts = 0;
        const maxAttempts = 30;
        const interval = setInterval(() => {
            attempts++;
            const success = insertButton();
            if (success || attempts >= maxAttempts) clearInterval(interval);
        }, 200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    document.addEventListener('yt-navigate-finish', () => setTimeout(init, 300));

    let lastUrl = location.href;
    setInterval(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            setTimeout(init, 300);
        }
    }, 1000);

})();
