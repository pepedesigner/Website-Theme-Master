/* Sandcode shared helpers — theme + clipboard + demo auth, used by both the
   marketing site (script.js) and the workspace app (workspace-pages.js).
   Exposed as window.Sand; Sand.initTheme() must run after chrome.js has
   mounted. */
(function () {
  var KEY = 'sandcode-theme';
  var DARK_MQ = '(prefers-color-scheme: dark)';
  // Mobile browsers tint their own chrome with this. It cannot be a static
  // <meta> pair driven by prefers-color-scheme, because the visitor can pick a
  // theme that disagrees with the OS — so the toggle owns it instead.
  var THEME_COLOR = { light: '#F2F0F3', dark: '#0E0B1A' };

  // theme: follows the OS until the visitor picks one, then that choice wins
  // and is shared across pages. The system is light-first, so light is also the
  // fallback when matchMedia is absent — only an explicit dark preference wins.
  function systemTheme() {
    var mq = window.matchMedia && window.matchMedia(DARK_MQ);
    return (mq && mq.matches) ? 'dark' : 'light';
  }
  function storedTheme() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function paintThemeColor(t) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'theme-color');
      document.head.appendChild(m);
    }
    m.setAttribute('content', THEME_COLOR[t] || THEME_COLOR.light);
  }
  function paint(t) {
    document.body.dataset.theme = t;
    paintThemeColor(t);
    var b = document.getElementById('theme-btn');
    if (b) b.textContent = (t === 'dark') ? '☀' : '☾';
  }
  function current() { return document.body.dataset.theme || 'light'; }
  function setTheme(t) {
    try { localStorage.setItem(KEY, t); } catch (e) {}
    paint(t);
  }
  function initTheme() {
    paint(storedTheme() || systemTheme());
    var b = document.getElementById('theme-btn');
    if (b) b.addEventListener('click', function () {
      setTheme(current() === 'dark' ? 'light' : 'dark');
    });
    // keep following the OS while the visitor has not chosen explicitly
    if (window.matchMedia) {
      var mq = window.matchMedia(DARK_MQ);
      var onChange = function () { if (!storedTheme()) paint(systemTheme()); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // clipboard with execCommand fallback; resolves on success, rejects on failure
  function fallbackCopy(text, resolve, reject) {
    var ta = null;
    try {
      ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      // execCommand reports failure via its return value, not by throwing
      if (document.execCommand('copy')) resolve();
      else reject(new Error('execCommand("copy") returned false'));
    } catch (e) {
      reject(e);
    } finally {
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta); // also on the throw path
    }
  }
  function copyText(text) {
    return new Promise(function (resolve, reject) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(resolve, function () { fallbackCopy(text, resolve, reject); });
          return;
        }
        fallbackCopy(text, resolve, reject);
      } catch (e) { fallbackCopy(text, resolve, reject); }
    });
  }

  // demo auth state. There is no backend: this only decides which surface the
  // visitor is allowed to see, so what is stored is the signed-in email rather
  // than a token. The workspace pages gate on it before first paint — their
  // markup ships locked and the inline bootstrap unlocks it only once this key
  // is there (see each page) — and the account menu reads it to label the
  // avatar. Both read localStorage directly, because neither can wait for the
  // other to load.
  var AUTH_KEY = 'sandcode-auth';
  function user() {
    try { return localStorage.getItem(AUTH_KEY) || null; } catch (e) { return null; }
  }
  function signIn(email) {
    // storing the session is the whole job: the page we navigate to reads the
    // key itself and unlocks. There is nothing to reveal on the sign-in page.
    try { localStorage.setItem(AUTH_KEY, email || 'alex@techstartup.io'); } catch (e) {}
  }
  function signOut() {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  }

  window.Sand = {
    setTheme: setTheme, initTheme: initTheme, copyText: copyText,
    auth: { user: user, signIn: signIn, signOut: signOut }
  };
})();
