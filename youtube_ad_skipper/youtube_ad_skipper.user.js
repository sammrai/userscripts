// ==UserScript==
// @name         YouTube ad skipper
// @namespace    https://github.com/sammrai
// @version      0.2
// @description  Simple ad skipper for youtube (This is not ad blocker)
// @author       sammrai
// @match        https://www.youtube.com/*
// @grant        none
// @license      MIT
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/youtube_ad_skipper/youtube_ad_skipper.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/youtube_ad_skipper/youtube_ad_skipper.user.js
// ==/UserScript==

// Based on the original work by Vyasdev217 (https://github.com/Vyasdev217/userscripts)
// Licensed under the MIT License

(function() {
    'use strict';

    function createPlaybackSpeedControl() {
        const playbackSpeedControl = document.createElement("input");
        playbackSpeedControl.type = "number";
        playbackSpeedControl.style = "background-color: black;color: white;background-repeat:no-repeat;border: none;cursor:pointer;overflow: hidden;outline:none;width:8vw;text-align: center;font-size:auto;";
        playbackSpeedControl.step = 0.1;
        playbackSpeedControl.min = 0;
        playbackSpeedControl.value = 1.0;

        playbackSpeedControl.addEventListener("change", function() {
            const videoElement = document.getElementsByTagName("video")[0];
            videoElement.playbackRate = Math.max(0.1, playbackSpeedControl.value);
        });

        return playbackSpeedControl;
    }

    function appendPlaybackControl(control) {
        const centerElement = document.getElementById('movie_player') || document.getElementById('center');

        if (centerElement) {
            centerElement.appendChild(control);
        } else {
            setTimeout(() => appendPlaybackControl(control), 1000);
        }
    }

    function observeAndSkipAds() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(() => {
                const adSkipButton = document.querySelector('.ytp-ad-skip-button.ytp-button');
                if (adSkipButton) {
                    adSkipButton.click();
                }
                const adOverlayCloseButton = document.querySelector('.ytp-ad-overlay-close-button');
                if (adOverlayCloseButton) {
                    adOverlayCloseButton.click();
                }
            });
        });

        const config = { childList: true, subtree: true };
        observer.observe(document.body, config);
    }

    const playbackSpeedControl = createPlaybackSpeedControl();
    appendPlaybackControl(playbackSpeedControl);
    observeAndSkipAds();

})();
