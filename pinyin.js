// ==UserScript==
// @name        Pinyin Terminator
// @description Generate Pinyin ruby for Chinese characters
// @author      tizee
// @license     MIT
// @namespace   https://github.com/tizee
// @homepageURL https://github.com/tizee/pinyin-terminator
// @require     https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.6/dist/index.min.js
// @match       *://*/*
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @version     1.3
// ==/UserScript==

(function () {
    'use strict';

    const CACHED_KEY = "ZHCN_CHAR";
    const MAX_CACHE_SIZE = 500;
    const CHUNK_SIZE = 200;
    let doc = document;
    let queue = {}; // Chinese characters queue to be converted
    let cachedChar = loadCacheChar();

    // Debounce function to limit charToPinyin execution frequency
    function debounce(func, wait, immediate) {
        let timeout;
        return function() {
            const context = this, args = arguments;
            clearTimeout(timeout);
            if (immediate && !timeout) func.apply(context, args);
            timeout = setTimeout(function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            }, wait);
        };
    }

    // Load cached values from storage
    function loadCacheChar() {
        const cacheStr = GM_getValue(CACHED_KEY, "");
        if (cacheStr) {
            try {
                return JSON.parse(cacheStr);
            } catch (e) {
                console.error(e);
                return {};
            }
        }
        return {};
    }

    // Save cached values to storage
    function saveCacheChar(cache) {
        if (Object.keys(cache).length >= MAX_CACHE_SIZE) {
            GM_setValue("chinese-terminator-caches", {});
            return;
        }
        GM_setValue("chinese-terminator-caches", JSON.stringify(cache, null, 4));
    }

    // Initialize MutationObserver to watch DOM changes
    function initMutationObserver() {
        const ob = new MutationObserver(mutationHandler);
        ob.observe(doc.body, {
            childList: true,
            subtree: true,
        });
    }

    // Handles DOM mutations and scans added nodes for Chinese characters
    function mutationHandler(mutationList) {
        mutationList.forEach(function (mutationRecord) {
            mutationRecord.addedNodes.forEach(function (node) {
                scanTextNodes(node);
            });
        });
        throttled_charToPinyin();
    }

    // Scan the DOM for text nodes to add Ruby (Pinyin)
    function scanTextNodes(node) {
        const excludeTags = { ruby: true, script: true, select: true, textarea: true, input: true };
        let currentLevel = [node];

        while (currentLevel.length > 0) {
            let cur_node = currentLevel.pop();
            if (!cur_node.parentNode || !doc.body.contains(cur_node)) return;
            if (cur_node.nodeType === Node.ELEMENT_NODE && !excludeTags[cur_node.tagName.toLowerCase()] && !cur_node.isContentEditable) {
                cur_node.childNodes.forEach(val => currentLevel.push(val));
            }
            if (cur_node.nodeType === Node.TEXT_NODE) {
                addRuby(cur_node);
            }
        }
    }

    // Insert Ruby (Pinyin) for Chinese characters in the text node
    function addRuby(node) {
        const kanji = /[\u3400-\u4DB5\u4E00-\u9FCB\uF900-\uFA6A]+/;
        let match = kanji.exec(node.nodeValue);
        if (!match) return;

        let ruby = doc.createElement("ruby");
        ruby.appendChild(doc.createTextNode(match[0]));
        let rt = doc.createElement("rt");
        rt.classList.add("chinese-terminator-rt");
        ruby.appendChild(rt);

        if (queue[match[0]]) {
            queue[match[0]].push(rt);
        } else {
            queue[match[0]] = [rt];
        }

        let rest = node.splitText(match.index);
        node.parentNode.insertBefore(ruby, rest);
        rest.nodeValue = rest.nodeValue.substring(match[0].length);
    }

    // Convert Chinese characters to Pinyin in batches
    async function charToPinyin() {
        let chunk = [];
        let requestCount = 0;
        let kanjiCount = 0;

        for (let kanji in queue) {
            kanjiCount++;
            if (kanji in cachedChar) {
                updateRubyFromCached(kanji);
                continue;
            }
            chunk.push(kanji);
            if (chunk.length >= CHUNK_SIZE) {
                requestCount++;
                toPinyin(chunk);
                chunk = [];
            }
        }

        if (chunk.length) {
            requestCount++;
            toPinyin(chunk);
        }

        if (kanjiCount) {
            console.debug(`${getElapsedTime()}ms Chinese Terminator: ${kanjiCount} characters converted in ${requestCount} requests`);
        }
        saveCacheChar(cachedChar);
    }

    // Update Ruby elements from cached Pinyin values
    function updateRubyFromCached(char) {
        if (!cachedChar[char]) return;
        (queue[char] || []).forEach(node => {
            node.dataset.rt = cachedChar[char];
        });
        delete queue[char];
    }

    // Convert characters to Pinyin using pinyin-pro
    function toPinyin(chars) {
        chars.forEach(char => {
            cachedChar[char] = pinyinPro.pinyin(char);
            updateRubyFromCached(char);
        });
    }

    // Get elapsed time since last call to charToPinyin
    let currentTime = undefined;
    function getElapsedTime() {
        return Date.now() - currentTime;
    }

    // Main logic for initializing the script
    function main() {
        const supportedLangs = ['zh-CN', 'zh-cmn-Hans', 'zh-Hans'];
        if (!supportedLangs.includes(document.documentElement.lang)) {
            console.debug("[Pinyin-Terminator] Page language not supported.");
            return;
        }

        GM_addStyle("rt.chinese-terminator-rt::before { content: attr(data-rt); }");
        initMutationObserver();
        scanTextNodes(doc.body);
    }

    // Initialize script execution
    main();

    // Throttled version of charToPinyin to avoid excessive execution
    let throttled_charToPinyin = debounce(charToPinyin, 500);

})();

