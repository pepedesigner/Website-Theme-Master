/* Sandcode i18n engine — 9 languages, dictionary-driven, zero HTML edits.
   - The language picker is auto-injected into marketing navs + console topbars.
   - Language follows the browser (the first supported tag in
     navigator.languages wins) until the visitor picks one, after which that
     choice is persisted. The inline bootstrap resolves it the same way
     pre-paint into window.__sandLang, and this file normalises through the same
     base-subtag test so the two can never disagree.
   - One dictionary per language (i18n-<code>.js), lazily loaded on the first
     render in that language, so page loads don't pay for entries nobody reads
     in English. A language with a dictionary is preloaded from the inline
     bootstrap, which also gates the document so the page never paints English
     first. A failed load is not remembered, so the next switch retries instead
     of silently staying English.
   - Static text nodes, placeholder/title/aria-label attrs and <title> swap.
   - The MutationObserver translates only the subtrees a mutation actually
     touched, coalesced on a short trailing debounce. A whole-document re-walk
     would otherwise run continuously: the hero terminal rewrites its DOM every
     ~16ms and the stat counters every frame.
   - The original string is kept on the node itself (GC-friendly — no strong
     registry that keeps detached nodes alive) together with the last value this
     engine wrote, so a write by anyone else is adopted as the new original
     instead of being reverted to a stale one.
   - Unmapped nodes stay English. Persisted in localStorage. */
(function () {
  var KEY = 'sandcode-lang';
  var V = '?v=24'; // same cache-busting convention as the other assets
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  var GATE = 'i18n-pending'; // set by the inline bootstrap, cleared here
  var DEBOUNCE = 120;

  /* The single source of truth for which languages exist. `tag` is what goes on
     <html lang>; `label` is the endonym, which is what a language picker should
     show (a reader looking for their own language recognises "日本語", not
     "Japanese"). Order is the order the picker renders. */
  var LANGS = [
    { c: 'en', tag: 'en', label: 'English' },
    { c: 'zh', tag: 'zh-CN', label: '中文' },
    { c: 'ja', tag: 'ja', label: '日本語' },
    { c: 'ko', tag: 'ko', label: '한국어' },
    { c: 'es', tag: 'es', label: 'Español' },
    { c: 'de', tag: 'de', label: 'Deutsch' },
    { c: 'fr', tag: 'fr', label: 'Français' },
    { c: 'pt', tag: 'pt-BR', label: 'Português' },
    { c: 'ru', tag: 'ru', label: 'Русский' }
  ];
  var BY_CODE = {};
  LANGS.forEach(function (l) { BY_CODE[l.c] = l; });

  var attrState = new WeakMap(); // Element -> {src:{attr:EN}, last:{attr:written}}
  var _origTitle = document.title; // captured at parse time (static EN)
  var applying = false; // suppress observer while this engine writes
  var dictPromise = null;
  var dictFor = null; // which language dictPromise belongs to
  var queued = null; // Set of nodes whose subtree needs (re)translating
  var timer = null;
  var switching = false; // a new dictionary is in flight; hold off translating
  var open = false; // picker state

  function dict() { return window.__I18N || {}; }
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function fileFor(code) { return code === 'en' ? null : 'i18n-' + code + '.js'; }

  /* Anything not English resolves to a supported base subtag: 'zh-Hans-CN' →
     'zh', 'pt-PT' → 'pt', 'de-AT' → 'de'. Unknown languages fall back to
     English rather than to the closest guess. */
  function resolve(src) {
    var base = String(src || '').toLowerCase().split('-')[0];
    return BY_CODE[base] ? base : 'en';
  }

  // One normalisation for every source: an explicit choice wins, then whatever
  // the bootstrap resolved pre-paint, then the browser itself. Cached, because
  // the observer asks on every mutation batch and reading localStorage that
  // often is wasted work while this file is the only writer.
  var curLang = null;
  function lang() {
    if (curLang === null) {
      var src = null;
      try { src = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
      if (!src) src = window.__sandLang;
      if (!src) src = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
      curLang = resolve(src);
    }
    return curLang;
  }

  // dictionaries are only needed off English — load on demand, retry after failure
  function loadDict(code) {
    var file = fileFor(code);
    if (!file) return Promise.resolve();
    if (dictPromise && dictFor === code) return dictPromise;
    dictFor = code;
    dictPromise = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = './' + file + V;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        console.warn('[sandcode] i18n dictionary failed to load:', file);
        dictPromise = null; // do not memoise a failure for the session
        resolve();
      };
      document.head.appendChild(s);
    });
    return dictPromise;
  }

  function setLang(code) {
    code = resolve(code);
    curLang = code; // keep the cache in step, or the observer would use the old language
    try { localStorage.setItem(KEY, code); } catch (e) {}
    document.documentElement.lang = BY_CODE[code].tag;
    observe(); // only installed for languages that need it
    /* A dictionary from a previous switch would mask this language's gaps, so it
       is dropped — but flushes are held off until the new one lands. Otherwise a
       mutation in that window (a toast, the terminal) would translate against the
       emptied object and revert finished text to English. */
    switching = true;
    if (dictFor !== code) window.__I18N = {};
    loadDict(code).then(function () {
      switching = false;
      applyLang(code);
      paintButton();
    }).catch(function (e) {
      switching = false;
      console.warn('[sandcode] i18n apply failed:', e);
    });
  }

  function swapTextNode(node, l) {
    var cur = node.nodeValue;
    // a writer other than this engine changed the node — adopt it as the source
    if (node.__i18nSrc === undefined || (cur !== node.__i18nSrc && cur !== node.__i18nLast)) {
      node.__i18nSrc = cur;
    }
    var src = node.__i18nSrc;
    var m = src.match(/^(\s*)([\s\S]*?)(\s*)$/);
    var key = norm(m[2]);
    if (!key) return;
    var hit = l === 'en' ? undefined : dict()[key];
    var next = hit !== undefined ? m[1] + hit + m[3] : src;
    if (cur !== next) { node.nodeValue = next; node.__i18nLast = next; }
  }

  function swapAttrs(root, l) {
    var els = root.querySelectorAll ? root.querySelectorAll('[' + ATTRS.join('],[') + ']') : [];
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        var st = attrState.get(el) || { src: {}, last: {} };
        ATTRS.forEach(function (a) {
          if (!el.hasAttribute(a)) return;
          var cur = el.getAttribute(a);
          // same rule as text nodes: someone else's write becomes the new source
          if (st.src[a] === undefined || (cur !== st.src[a] && cur !== st.last[a])) st.src[a] = cur;
          var key = norm(st.src[a]);
          var hit = l === 'en' ? undefined : dict()[key];
          var next = hit !== undefined ? hit : st.src[a];
          if (cur !== next) { el.setAttribute(a, next); st.last[a] = next; }
        });
        attrState.set(el, st);
      })(els[i]);
    }
  }

  // text nodes under `root`. A text node root is handled directly: a
  // TreeWalker never returns its own root, so a text node queued by the
  // observer — a toast, an inline form error — would be walked, found empty and
  // skipped, leaving the string untranslated.
  function eachText(root, fn) {
    if (root.nodeType === 3) {
      var parent = root.parentElement;
      if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE'
          && !skipped(parent)) fn(root);
      return;
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      var p = n.parentElement;
      if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
      if (skipped(p)) continue;
      fn(n);
    }
  }
  /* The picker's own labels are endonyms and must stay as authored. Its English
     row reads "English", which is also a dictionary key (the footer's language
     label), so without this the engine relabels that row with the *current*
     language's name — leaving French users with "Français" twice and no way to
     find English. */
  function skipped(el) {
    return !!(el.closest && el.closest('[data-i18n-skip]'));
  }

  // observer callbacks are microtasks — they run before this timer clears the flag
  function unlock() { setTimeout(function () { applying = false; }, 0); }

  function translate(root, l) {
    eachText(root, function (t) { swapTextNode(t, l); });
    if (root.nodeType === 1) swapAttrs(root, l);
  }

  function applyLang(l) {
    applying = true;
    try {
      eachText(document.body, function (t) { swapTextNode(t, l); });
      swapAttrs(document, l); // covers <head> too; swapAttrs(document.body) would repeat this
      var titleKey = norm(_origTitle);
      var titleHit = l === 'en' ? undefined : dict()[titleKey];
      document.title = titleHit !== undefined ? titleHit : _origTitle;
    } finally { unlock(); }
  }

  function flush() {
    timer = null;
    var nodes = queued;
    queued = null;
    var l = lang();
    if (!nodes || l === 'en' || switching) return;
    applying = true;
    try {
      nodes.forEach(function (n) {
        // the terminal replaces its whole subtree every frame — detached nodes
        // are stale, so translating them would only burn time
        if (n.isConnected) translate(n, l);
      });
    } finally { unlock(); }
  }

  /* ---------- language picker ----------
     A listbox rather than a two-state button, so every language is one click
     away and the control scales as languages are added. Focus moves into the
     list on open, which is what makes arrow keys and Escape work for free. */
  function paintButton() {
    var cur = document.querySelector('.lang-cur');
    if (cur) cur.textContent = BY_CODE[lang()].label;
  }

  function closeMenu(restoreFocus) {
    var wrap = document.getElementById('lang');
    if (!wrap || !open) return;
    open = false;
    wrap.querySelector('.lang-menu').hidden = true;
    wrap.querySelector('#lang-btn').setAttribute('aria-expanded', 'false');
    if (restoreFocus) wrap.querySelector('#lang-btn').focus();
  }

  function openMenu() {
    var wrap = document.getElementById('lang');
    if (!wrap || open) return;
    open = true;
    var menu = wrap.querySelector('.lang-menu');
    menu.hidden = false;
    wrap.querySelector('#lang-btn').setAttribute('aria-expanded', 'true');
    var sel = menu.querySelector('[aria-selected="true"]') || menu.firstElementChild;
    if (sel) sel.focus();
  }

  function buildMenu() {
    var wrap = document.createElement('div');
    wrap.className = 'lang';
    wrap.id = 'lang';
    // text inside the picker is authored, not translated — see skipped()
    wrap.setAttribute('data-i18n-skip', '');

    var btn = document.createElement('button');
    btn.id = 'lang-btn';
    btn.type = 'button';
    btn.className = 'lang-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Language');
    btn.title = 'Language / 语言';
    btn.innerHTML = '<span class="lang-cur"></span><span class="lang-caret" aria-hidden="true"></span>';
    btn.addEventListener('click', function () { open ? closeMenu(false) : openMenu(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(); }
    });

    var menu = document.createElement('ul');
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Language');
    menu.hidden = true;

    LANGS.forEach(function (l) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.tabIndex = -1;
      li.dataset.c = l.c;
      li.setAttribute('aria-selected', l.c === lang() ? 'true' : 'false');
      li.setAttribute('lang', l.tag);
      li.textContent = l.label;
      li.addEventListener('click', function () { pick(l.c); });
      menu.appendChild(li);
    });

    menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(menu.children);
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(i - 1, 0)].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (document.activeElement.dataset.c) pick(document.activeElement.dataset.c);
      } else if (e.key === 'Escape' || e.key === 'Tab') { closeMenu(e.key === 'Escape'); }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  function pick(code) {
    closeMenu(true);
    if (code === lang()) return;
    setLang(code);
  }

  function injectMenu() {
    if (document.getElementById('lang')) return;
    // bail out rather than leaving a detached control with a live click handler
    var nav = document.querySelector('.nav-links');
    var top = nav ? null : document.querySelector('.top-actions');
    if (!nav && !top) return;
    var wrap = buildMenu();
    if (nav) nav.insertBefore(wrap, document.getElementById('theme-btn') || null);
    else top.insertBefore(wrap, top.firstChild);
    paintButton();

    document.addEventListener('click', function (e) {
      var w = document.getElementById('lang');
      if (open && w && !w.contains(e.target)) closeMenu(false);
    });
  }

  // keep dynamically added content translated — only the changed subtrees.
  // `applying` means the records came from our own writes, so they are ignored.
  var observer = null;
  function observe() {
    if (observer || !('MutationObserver' in window) || !document.body) return;
    observer = new MutationObserver(function (records) {
      if (applying || lang() === 'en') return;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'characterData') {
          if (!queued) queued = new Set();
          queued.add(r.target);
          continue;
        }
        for (var j = 0; j < r.addedNodes.length; j++) {
          if (!queued) queued = new Set();
          queued.add(r.addedNodes[j]);
        }
      }
      if (!queued) return;
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE);
    });
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
  }

  // the inline bootstrap hides the page until the dictionary lands, so a
  // non-English visitor never sees an English first paint
  function ungated() { document.documentElement.classList.remove(GATE); }

  document.addEventListener('DOMContentLoaded', function () {
    var l = lang();
    injectMenu();
    // An English page has nothing to re-translate, and the hero terminal alone
    // rewrites its subtree every ~16ms — installing the observer there means a
    // callback per frame for the whole first render, all of them no-ops.
    if (l !== 'en') observe();
    document.documentElement.lang = BY_CODE[l].tag;
    if (l === 'en') { ungated(); return; }
    loadDict(l)
      .then(function () { applyLang(l); paintButton(); })
      .catch(function (e) { console.warn('[sandcode] i18n apply failed:', e); })
      .then(ungated); // always un-hide, even if applying threw
  });
})();
