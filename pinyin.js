// ==UserScript==
// @name        Chinese Terminator
// @description Generate Pinyin ruby for Chinese characters
// @author      tizee
// @license     MIT
// @namespace   https://github.com/tizee
// @homepageURL https://github.com/tizee/chinese-terminator
// @require     https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js
// @require     https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.6/dist/index.min.js
// @match       *://*/*
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @version     2024.03.12
// ==/UserScript==

let doc = document;
let queue = {}; // Chinese characters queue to be converted
let cachedChar = loadCacheChar();

// load cached values
function loadCacheChar() {
  let cacheStr = GM_getValue("chinese-terminator-caches", null);
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

function saveCacheChar(cache) {
  if (Object.keys(cache).length >= 500) {
    GM_setValue("chinese-terminator-caches", {});
    return;
  }
  let cacheStr = JSON.stringify(cache, null, 4);
  GM_setValue("chinese-terminator-caches", cacheStr);
}

let currentTime = undefined;

function getElapsedTime() {
  return Date.now() - currentTime;
}

function scanTextNodes(node) {
  // Ignore text boxes and echoes
  let excludeTags = {
    ruby: true,
    script: true,
    select: true,
    textarea: true,
    input: true,
  };

  let currentLevel = [node];
  while (currentLevel.length > 0) {
    let cur_node = currentLevel.pop();
    // The node could have been detached from the DOM tree
    if (!cur_node.parentNode || !doc.body.contains(node)) {
      return;
    }
    let text_node = cur_node;
    switch (cur_node.nodeType) {
      case Node.ELEMENT_NODE:
        if (
          cur_node.tagName.toLowerCase() in excludeTags ||
          cur_node.isContentEditable
        ) {
          continue;
        }
        cur_node.childNodes.forEach((val, idx, arr) => {
          currentLevel.push(val);
        });
      case Node.TEXT_NODE:
        while ((text_node = addRuby(text_node)));
    }
  }
}

let throttled_charToPinyin = _.debounce(charToPinyin, 500);

function mutationHandler(mutationList) {
  mutationList.forEach(function (mutationRecord) {
    mutationRecord.addedNodes.forEach(function (node) {
      scanTextNodes(node);
    });
  });
  throttled_charToPinyin();
}

function main() {
  if (
    !(
      doc.documentElement.lang == "zh-CN" ||
      doc.documentElement.lang == "zh-Hans"
    )
  ) {
    return;
  }
  GM_addStyle("rt.chinese-terminator-rt::before { content: attr(data-rt); }");
  let ob = new MutationObserver(mutationHandler);
  ob.observe(doc.body, {
    childList: true,
    subtree: true,
  });

  scanTextNodes(doc.body);
}

// insert Ruby nodes recursively
function addRuby(node) {
  // not a Text Node
  if (!node.nodeValue) {
    return false;
  }
  let kanji = /[\u3400-\u4DB5\u4E00-\u9FCB\uF900-\uFA6A]+/; // unicode range for CJK Chinese characters
  // skip Hiragana and Katakana
  let match = kanji.exec(node.nodeValue);
  if (!match) {
    return false;
  }
  // <span>漢字</span> -> <span><ruby>漢字<rt class="kanji-terminator-rt" data-rt="かんじ"></rt></ruby></span>
  let ruby = doc.createElement("ruby");
  ruby.appendChild(doc.createTextNode(match[0]));
  let rt = doc.createElement("rt");
  rt.classList.add("chinese-terminator-rt");
  ruby.appendChild(rt);

  // pending for conversion from Kanji to Hiragana
  if (queue[match[0]]) {
    queue[match[0]].push(rt);
  } else {
    queue[match[0]] = [rt];
  }

  // rest of text
  let rest = node.splitText(match.index);
  node.parentNode.insertBefore(ruby, rest);
  rest.nodeValue = rest.nodeValue.substring(match[0].length);
  // recursively
  return rest;
}

async function charToPinyin() {
  let chunk = [];
  let chunkSize = 200;
  let requestCount = 0;
  let kanjiCount = 0;
  currentTime = Date.now();

  for (let kanji in queue) {
    kanjiCount++;
    if (kanji in cachedChar) {
      updateRubyFromCached(kanji);
      continue;
    }
    chunk.push(kanji);
    if (chunk.length >= chunkSize) {
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
    console.debug(
      getElapsedTime(),
      "ms Chinese Terminator:",
      kanjiCount,
      "characters converted in",
      requestCount,
      "requests, frame",
      window.location.href
    );
  }
  saveCacheChar(cachedChar);
}

function toPinyin(chars) {
  chars.forEach((char, idx, arr) => {
    cachedChar[char] = pinyinPro.pinyin(char);
    updateRubyFromCached(char);
  });
}

function updateRubyFromCached(char) {
  if (!cachedChar[char]) {
    return;
  }
  (queue[char] || []).forEach(function (node) {
    node.dataset.rt = cachedChar[char];
  });
  delete queue[char];
}

main();
