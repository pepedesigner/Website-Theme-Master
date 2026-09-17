/* Sandcode shared chrome — injects nav/footer (marketing) and sidebar/topbar
   (workspace) so the marketing pages and the console don't each duplicate the
   same ~30 lines of markup.
   Loaded before i18n.js so injected text is picked up for translation.
   Active link is derived from the current filename. */
(function () {
  var page = location.pathname.split('/').pop() || 'index.html';
  var REPO = 'https://github.com/pepedesigner/Sand-code';
  var RELEASES = REPO + '/releases';

  // ---- marketing nav + footer ----
  var NAV = [
    { href: REPO, text: 'GitHub', ext: true },
    { href: './index.html', text: 'Home' },
    { href: './docs.html', text: 'Docs' },
    { href: './pricing.html', text: 'Pricing' },
    { href: './zen.html', text: 'Models' },
    { href: './enterprise.html', text: 'Enterprise' },
    { href: './workspace-overview.html', text: 'Console' }
  ];

  function headerHtml() {
    var links = NAV.map(function (l) {
      var attrs = l.ext ? ' target="_blank" rel="noopener"' : '';
      if (!l.ext && l.href.slice(2) === page) attrs += ' class="active" aria-current="page"';
      return '<a href="' + l.href + '"' + attrs + '>' + l.text + '</a>';
    }).join('');
    return '<div class="wrap nav">' +
      '<a class="logo" href="./index.html"><span>Sand</span>Code<i>*</i></a>' +
      '<button class="menu-btn" id="menu-btn" type="button" aria-expanded="false" aria-controls="nav-links">Open menu</button>' +
      '<nav class="nav-links" id="nav-links" aria-label="Main">' + links +
      '<button id="theme-btn" class="theme-btn" type="button" title="Toggle theme" aria-label="Toggle theme">☾</button>' +
      '<a class="btn" href="./download.html">Install SandCode</a></nav></div>';
  }

  var FOOTER_HTML =
    '<div class="wrap fcols">' +
    '<div class="fbrand"><a class="logo" href="./index.html"><span>Sand</span>Code<i>*</i></a><p>Flat-rate coding compute for every agent client — with search, scrape and a local verification harness built in.</p></div>' +
    '<div><b>Products</b><a href="./docs.html">Docs</a><a href="./pricing.html">Pricing</a><a href="./zen.html">Models</a><a href="./download.html">Install</a><a href="./workspace-overview.html">Console</a></div>' +
    '<div><b>Resources</b><a href="./enterprise.html">Enterprise</a><a href="./pricing.html">Plans</a><a href="' + RELEASES + '" target="_blank" rel="noopener">Changelog</a><a href="./docs.html">Get started</a></div>' +
    '<div><b>Connect</b><a href="' + REPO + '" target="_blank" rel="noopener">GitHub</a><a href="' + REPO + '" target="_blank" rel="noopener">Discord</a><a href="' + REPO + '" target="_blank" rel="noopener">X</a></div>' +
    '</div>' +
    '<div class="wrap fbase"><span>©2026 SandCode</span><span>Demo site inspired by opencode.ai. All trademarks belong to their respective owners.</span><span style="margin-left:auto">English</span></div>';

  // ---- identity ----
  // There is no backend, so "signed in" is simply the address the sign-in page
  // stored. The workspace pages gate on it before first paint (each page's
  // inline bootstrap redirects to sign-in when the key is absent), so by the
  // time this menu renders there is always an address to show. Read straight
  // from localStorage rather than via common.js: chrome.js is loaded first on
  // purpose, so the shell is in the DOM before the page scripts run.
  var AUTH_KEY = 'sandcode-auth';
  function signedInAs() {
    try { return localStorage.getItem(AUTH_KEY) || 'alex@techstartup.io'; }
    catch (e) { return 'alex@techstartup.io'; }
  }
  // the address is user input and this menu is assembled as a string, so escape
  // it rather than assuming the sign-in form was the only thing that ever wrote
  // the key
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- workspace sidebar + topbar ----
  // grouped like the console it mirrors: [group label, [[href, text], …]]
  var WS_NAV = [
    ['Workspace', [
      ['workspace-overview.html', 'Overview'],
      ['workspace-plan.html', 'Coding Plan']
    ]],
    ['Spend', [
      ['workspace-usage.html', 'Usage'],
      ['workspace-billing.html', 'Billing']
    ]],
    ['Account', [
      ['workspace-keys.html', 'Keys'],
      ['workspace-members.html', 'Members'],
      ['workspace-settings.html', 'Settings']
    ]]
  ];
  // crumbs keep their own labels ('API keys' reads better than the nav's
  // 'Keys'), and double as the "is this a workspace page" test in mount()
  var WS_CRUMB = {
    'workspace-overview.html': 'Overview',
    'workspace-plan.html': 'Coding Plan',
    'workspace-usage.html': 'Usage',
    'workspace-billing.html': 'Billing',
    'workspace-keys.html': 'API keys',
    'workspace-members.html': 'Members',
    'workspace-settings.html': 'Settings'
  };
  var WS_EXTRA = { 'workspace-plan.html': '<span class="model-badge">Standard · $9.9/mo</span>' };

  function wsSideHtml() {
    var groups = WS_NAV.map(function (g) {
      return '<span>' + g[0] + '</span>' + g[1].map(function (l) {
        var attrs = '';
        if (l[0] === page) attrs += ' class="active" aria-current="page"';
        return '<a href="./' + l[0] + '"' + attrs + '>' + l[1] + '</a>';
      }).join('');
    }).join('');
    return '<div class="side-top">' +
      '<a class="mini-logo" href="./index.html"><span>Sand</span>Code<i>*</i></a>' +
      '<span class="env-pill"><span class="pulse"></span>api.sandbase.ai</span></div>' +
      '<nav class="ws-nav" aria-label="Console">' + groups + '</nav>' +
      '<div class="side-foot"><a class="back-site" href="./index.html">← Back to site</a></div>';
  }

  // The account menu carries what is about who you are rather than where you
  // are: the identity, and signing out. The address is the demo auth value and
  // the avatar shows its first letter, so signing in as someone else is visibly
  // a different account.
  function acctMenuHtml() {
    var email = signedInAs();
    /* role="menu" exposes only its menuitems, so the identity block inside it is
       not announced — the address has to reach the button's own name or a screen
       reader never learns who is signed in. */
    return '<div class="acct">' +
      '<button class="avatar" id="acct-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="' +
      esc('Account — signed in as ' + email) + '">' +
      esc(email.charAt(0).toUpperCase()) + '</button>' +
      '<div class="acct-menu" id="acct-menu" role="menu" aria-labelledby="acct-btn" hidden>' +
      '<div class="acct-head"><b>' + esc(email) + '</b><span>Standard · $9.9/mo</span></div>' +
      '<div class="acct-sep" role="separator"></div>' +
      '<button type="button" role="menuitem" data-signout>Sign out</button>' +
      '</div></div>';
  }

  function wsTopbarHtml() {
    return '<button id="menu-side" type="button" aria-label="Menu" aria-expanded="false" aria-controls="side">☰</button>' +
      '<div class="crumbs"><span>SandCode Console</span><span class="sep" aria-hidden="true">›</span><span id="crumb-sess">' + WS_CRUMB[page] + '</span></div>' +
      '<div class="top-actions">' + (WS_EXTRA[page] || '') +
      '<button id="theme-btn" class="theme-btn" type="button" title="Toggle theme" aria-label="Toggle theme">☾</button>' +
      acctMenuHtml() + '</div>';
  }

  function mount() {
    var header = document.querySelector('header.site-header');
    if (header) header.innerHTML = headerHtml();
    var footer = document.querySelector('footer');
    if (footer) footer.innerHTML = FOOTER_HTML;
    if (WS_CRUMB[page]) {
      var side = document.getElementById('side');
      if (side) side.innerHTML = wsSideHtml();
      var topbar = document.getElementById('topbar');
      if (topbar) topbar.innerHTML = wsTopbarHtml();
    }
  }

  // The auth gate lives in the markup (`html.auth-locked`, hidden by an inline
  // <style> in each console page) and is normally cleared by that page's inline
  // bootstrap. Resolving it again from here — an external file — keeps the gate
  // working when a CSP refuses inline script, which would otherwise leave the
  // page hidden forever with nothing on screen to explain why.
  function enforceGate() {
    var root = document.documentElement;
    if (!root.classList.contains('auth-locked')) return;
    var session = null;
    try { session = localStorage.getItem('sandcode-auth'); } catch (e) { session = null; }
    if (session) root.classList.remove('auth-locked');
    else location.replace('./signin.html');
  }
  enforceGate();

  // Mount synchronously so the chrome (sidebar/topbar/nav) is in the DOM
  // before first paint — otherwise navigating between pages briefly shows a
  // short/empty topbar that grows after load, making cards shift ("jump").
  // Chrome.js is loaded at the end of <body>, so the placeholder containers
  // above are already parsed; if we ever run earlier (e.g., from <head>),
  // fall back to waiting for DOMContentLoaded.
  var placeholders = document.querySelector('header.site-header') ||
    document.querySelector('footer') ||
    document.getElementById('side');
  if (placeholders) {
    try { mount(); } catch (e) { console.warn('[sandcode] chrome mount failed', e); }
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
