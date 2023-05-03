// ==UserScript==
// @name         YouTube ad skipper
// @namespace    https://github.com/sammrai
// @version      0.1
// @description  Simple ad skipper for youtube (This is not ad blocker)
// @author       sammrai
// @match        https://www.youtube.com/*
// @grant        none
// @license      MIT
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/youtube_ad_skipper.user.js
// @updateURL	 https://github.com/sammrai/userscripts/raw/main/youtube_ad_skipper.user.js
// ==/UserScript==

(function() {
    'use strict';

    var pbs = document.createElement("INPUT");
    pbs.type="number";
    pbs.style="background-color: black;color: white;background-repeat:no-repeat;border: none;cursor:pointer;overflow: hidden;outline:none;width:8vw;text-align: center;font-size:auto;";
    pbs.step=0.1;
    pbs.min=0;
    pbs.value=1.0;
    pbs.addEventListener("change",function(){if(pbs.value>0){document.getElementsByTagName("video")[0].playbackRate = pbs.value;}else{pbs.value=1;document.getElementsByTagName("video")[0].playbackRate = pbs.value;}});

    function appendPlaybackControl() {
        var centerElement = document.getElementById('movie_player') || document.getElementById('center');
        if (centerElement) {
            centerElement.appendChild(pbs);
        } else {
            setTimeout(appendPlaybackControl, 1000);
        }
    }

    appendPlaybackControl();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
          if (document.contains(document.getElementsByClassName('ytp-ad-skip-button ytp-button')[0])) {
              document.getElementsByClassName('ytp-ad-skip-button ytp-button')[0].click();
          }
          if (document.contains(document.getElementsByClassName('ytp-ad-overlay-close-button')[0])) {
              document.getElementsByClassName('ytp-ad-overlay-close-button')[0].click();
          }
          document.getElementsByTagName("video")[0].playbackRate = pbs.value;
      });
    });
    const config = {childList:true,subtree:true};
    observer.observe(document.body, config);

})();
