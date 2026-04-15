// ==UserScript==
// @name         ふるさと納税 自治体別合計サイドパネル
// @namespace    https://github.com/sammrai
// @version      2.5.0
// @description  自治体ごとの合計寄付金額と内訳をサイドパネルで表示
// @author       sammrai
// @match        https://www.furusato-tax.jp/donation/list*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @downloadURL  https://github.com/sammrai/userscripts/raw/main/furusato_summary_panel/furusato_summary_panel.user.js
// @updateURL    https://github.com/sammrai/userscripts/raw/main/furusato_summary_panel/furusato_summary_panel.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ========================================
    // 去年の購入量（kg）- ここを編集
    // ========================================
    const LAST_YEAR = {
        'ぶどう': 3.5,
        '梨': 2.2,
        '桃': 7.5,
    };

    // カテゴリ判定用キーワード
    const CATEGORY_KEYWORDS = {
        'ぶどう': ['ぶどう', 'ピオーネ', 'シャインマスカット', 'ナガノパープル', '巨峰'],
        '梨': ['梨', 'なし', '幸水', '豊水', '二十世紀'],
        '桃': ['桃', 'もも', 'モモ', 'あかつき', '白桃', '黄桃'],
        'みかん': ['みかん', 'ミカン', '柑橘', 'せとか', '甘平', '紅まどんな', '不知火', '愛果'],
        'マンゴー': ['マンゴー', 'mango'],
        'さくらんぼ': ['さくらんぼ', 'サクランボ', '紅秀峰', '佐藤錦'],
    };
    // ========================================

    function toHalfWidth(str) {
        return str
            .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/[ａ-ｚＡ-Ｚ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/．/g, '.');
    }

    function detectCategory(name) {
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some(kw => name.includes(kw))) return category;
        }
        return null;
    }

    function parseWeight(name) {
        const normalized = toHalfWidth(name);
        const kgMatch = normalized.match(/(\d+(?:\.\d+)?)\s*[kK][gG]/);
        if (kgMatch) return parseFloat(kgMatch[1]);
        const gMatch = normalized.match(/(\d+(?:\.\d+)?)\s*[gG](?![a-zA-Z])/);
        if (gMatch) return parseFloat(gMatch[1]) / 1000;
        return 0;
    }

    function cleanProductName(name) {
        return name
            .replace(/^【[^】]*】\s*/g, '')
            .replace(/^＜[^＞]*＞\s*/g, '')
            .replace(/^<[^>]*>\s*/g, '')
            .replace(/^【[^】]*】\s*/g, '')
            .replace(/^＜[^＞]*＞\s*/g, '')
            .trim();
    }

    function formatWeight(kg) {
        if (kg === 0) return '';
        if (kg < 0.1) return `${kg.toFixed(2)}kg`;
        return `${kg % 1 === 0 ? kg : kg.toFixed(1)}kg`;
    }

    function getDonationSummary() {
        const sections = document.querySelectorAll('.cart_detail');
        const summary = [];
        let grandTotal = 0;
        const categoryTotals = {};

        sections.forEach(section => {
            const cityNameEl = section.querySelector('.js-braze-cityname');
            const totalAmountEl = section.querySelector('.total_amount');

            if (cityNameEl && totalAmountEl) {
                const cityName = cityNameEl.textContent.trim();
                const amount = parseInt(totalAmountEl.textContent.replace(/,/g, ''), 10) || 0;

                const items = [];
                section.querySelectorAll('.goods--kifu').forEach(product => {
                    const nameEl = product.querySelector('.goods--kifu_name');
                    const priceEl = product.querySelector('.goods--kifu_price');
                    const quantityEl = product.querySelector('.goods--kifu_amount');

                    if (nameEl && priceEl) {
                        const fullName = nameEl.textContent.trim();
                        const cleanedName = cleanProductName(fullName);
                        const name = cleanedName.length > 30 ? cleanedName.substring(0, 30) + '...' : cleanedName;
                        const quantity = quantityEl ? parseInt(quantityEl.value, 10) || 1 : 1;
                        const unitPrice = parseInt(priceEl.textContent.replace(/,/g, ''), 10) || 0;
                        const unitWeight = parseWeight(fullName);
                        const totalWeight = unitWeight * quantity;
                        const category = detectCategory(fullName);

                        if (category && totalWeight > 0) {
                            categoryTotals[category] = (categoryTotals[category] || 0) + totalWeight;
                        }

                        items.push({ name, quantity, unitPrice, unitWeight, category });
                    }
                });

                summary.push({ cityName, amount, items });
                grandTotal += amount;
            }
        });

        return { summary, grandTotal, categoryTotals };
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'donation-panel';
        document.body.appendChild(panel);

        const style = document.createElement('style');
        style.textContent = `
            #donation-panel {
                position: fixed;
                top: 80px;
                right: 0;
                width: 560px;
                max-height: calc(100vh - 100px);
                overflow-y: auto;
                background: #fff;
                border-left: 1px solid #e0e0e0;
                box-shadow: -2px 0 12px rgba(0,0,0,0.06);
                font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", sans-serif;
                font-size: 13px;
                z-index: 99999;
            }
            #donation-panel::-webkit-scrollbar { width: 6px; }
            #donation-panel::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }
            .dp-items { padding: 12px 16px; }
            .dp-items table { width: 100%; border-collapse: collapse; }
            .dp-items td { padding: 8px 6px; vertical-align: middle; border-bottom: 1px solid #f0f0f0; }
            .dp-items tr:last-child td { border-bottom: none; }
            .dp-items .col-city { width: 90px; color: #333; font-weight: 600; font-size: 12px; }
            .dp-items .col-category { width: 65px; color: #888; font-size: 11px; }
            .dp-items .col-name { color: #444; }
            .dp-items .col-weight { width: 50px; text-align: right; }
            .dp-items .col-price { width: 70px; text-align: right; color: #666; font-size: 12px; }
            .dp-items .col-qty { width: 30px; text-align: right; color: #999; font-size: 12px; }
            .dp-weight-badge { display: inline-block; background: #4a9; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 500; }
            .dp-summary { background: #fafafa; padding: 14px 16px; border-top: 1px solid #eee; }
            .dp-summary table { width: 100%; border-collapse: collapse; }
            .dp-summary th { padding: 4px 8px; text-align: right; color: #999; font-weight: 500; font-size: 11px; }
            .dp-summary th:first-child { text-align: left; }
            .dp-summary td { padding: 5px 8px; font-size: 12px; }
            .dp-summary td:first-child { font-weight: 600; color: #555; }
            .dp-summary td:nth-child(2), .dp-summary td:nth-child(3) { text-align: right; }
            .dp-summary td:nth-child(4) { text-align: right; font-weight: 600; }
            .dp-grand-total { background: #333; color: #fff; padding: 14px; text-align: center; font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }
            .dp-diff-plus { color: #4a9; }
            .dp-diff-minus { color: #e55; }
            .dp-diff-zero { color: #aaa; }
        `;
        document.head.appendChild(style);
        return panel;
    }

    function updatePanel() {
        let panel = document.getElementById('donation-panel');
        if (!panel) panel = createPanel();

        const { summary, grandTotal, categoryTotals } = getDonationSummary();

        if (summary.length === 0) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = 'block';

        const allCategories = [...new Set([...Object.keys(LAST_YEAR), ...Object.keys(categoryTotals)])];
        const categoryRows = allCategories.map(cat => {
            const last = LAST_YEAR[cat] || 0;
            const now = categoryTotals[cat] || 0;
            const diff = now - last;
            const diffClass = diff > 0 ? 'dp-diff-plus' : diff < 0 ? 'dp-diff-minus' : 'dp-diff-zero';
            const diffSign = diff > 0 ? '+' : '';
            return `
                <tr>
                    <td>${cat}</td>
                    <td style="color:#666;">${last > 0 ? formatWeight(last) : '-'}</td>
                    <td style="color:#080;">${now > 0 ? formatWeight(now) : '-'}</td>
                    <td class="${diffClass}">${diff !== 0 ? diffSign + formatWeight(diff) : '±0'}</td>
                </tr>
            `;
        }).join('');

        const allItems = [];
        summary.forEach(city => {
            const shortCity = city.cityName.replace(/^.+?\s/, '');
            city.items.forEach(item => {
                allItems.push({ ...item, city: shortCity });
            });
        });

        const itemsHtml = allItems.map(item => `
            <tr>
                <td class="col-city">${item.city}</td>
                <td class="col-category">${item.category || '-'}</td>
                <td class="col-name">${item.name}</td>
                <td class="col-weight">${item.unitWeight > 0 ? `<span class="dp-weight-badge">${formatWeight(item.unitWeight)}</span>` : ''}</td>
                <td class="col-price">${item.unitPrice.toLocaleString()}円</td>
                <td class="col-qty">×${item.quantity}</td>
            </tr>
        `).join('');

        panel.innerHTML = `
            <div class="dp-items">
                <table>
                    ${itemsHtml}
                </table>
            </div>
            <div class="dp-summary">
                <table>
                    <tr>
                        <th></th>
                        <th>去年</th>
                        <th>今年</th>
                        <th>差</th>
                    </tr>
                    ${categoryRows}
                </table>
            </div>
            <div class="dp-grand-total">合計 ${grandTotal.toLocaleString()}円</div>
        `;
    }

    setTimeout(updatePanel, 500);
    setTimeout(updatePanel, 1500);

    const observer = new MutationObserver(() => setTimeout(updatePanel, 100));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('change', (e) => {
        if (e.target.matches('.goods--kifu_amount')) setTimeout(updatePanel, 500);
    });

})();
