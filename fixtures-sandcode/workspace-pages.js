/* Sandcode Console sub-pages — mock interactions (no backend).
   Every init is guarded by element presence so one file serves all pages.
   Rows are built with DOM APIs (never innerHTML with user input), and the
   keys table uses event delegation so dynamically added rows behave exactly
   like the static ones. Theme/clipboard helpers come from common.js. */
(function () {
  function $(id) { return document.getElementById(id); }
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2000);
  }
  function copyText(t, msg) {
    if (!window.Sand || !Sand.copyText) { toast('Copy failed'); return; }
    Sand.copyText(t).then(
      function () { toast(msg || 'Copied to clipboard.'); },
      function () { toast('Copy failed'); }
    );
  }

  function money(n) { return '$' + n.toFixed(2); }
  function wallet() {
    var el = $('balance-val');
    return el ? (parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0) : 0;
  }
  // a plausible-looking opaque token; nothing here is ever sent anywhere
  function secret() {
    var s = '';
    while (s.length < 28) s += Math.random().toString(36).slice(2);
    return 'sc_live_' + s.slice(0, 28);
  }
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text; // always textContent: names are user input
    return n;
  }

  /* ---------- modal dialogs ----------
     Native <dialog>, so focus trapping, Escape, focus restore and the inert
     background are the platform's rather than ours. One dialog at a time.
     The element is built once and reused: tearing it down on close would mean
     hanging cleanup off the `close` event, and that event is not dependable
     enough to be the only thing standing between the page and a leaked modal
     per interaction. Reusing it also makes the two-step key flow a content
     swap rather than a second element. */
  var dlg = null;
  /* <dialog> is Safari 15.4+. Where showModal/close are missing the element is
     opened non-modally instead of throwing — a degraded dialog beats a button
     that does nothing, and it keeps Escape/backdrop as the only casualties. */
  function closeDialog(el) {
    if (!el) return;
    if (typeof el.close === 'function') el.close();
    else el.removeAttribute('open');
  }
  function openDialog(html) {
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'ws-dialog';
      // the platform reports a backdrop click as a click on the dialog itself, so
      // a click in the dialog's own padding counted as "outside" and closed it —
      // compare the pointer against the box instead of the target
      dlg.addEventListener('click', function (e) {
        var r = dlg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(dlg);
      });
      document.body.appendChild(dlg);
    }
    if (dlg.open) closeDialog(dlg);
    dlg.innerHTML = html;
    // <dialog> takes no accessible name from its contents, so point it at the
    // heading — screen readers announce the dialog by its title
    var h = dlg.querySelector('h2');
    if (h) { h.id = 'dlg-title'; dlg.setAttribute('aria-labelledby', 'dlg-title'); }
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    return dlg;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // common.js can be missing (blocked, offline, or refused by a CSP). Its
    // helpers are the first thing this file touches, and an unguarded throw here
    // used to take every other interaction on the console down with it.
    if (window.Sand && Sand.initTheme) {
      try { Sand.initTheme(); } catch (e) { console.warn('[sandcode] console theme failed:', e); }
    }

    // mobile sidebar
    var menu = $('menu-side'), side = $('side'), scrim = $('side-scrim');
    if (menu && side) {
      menu.addEventListener('click', function () {
        var open = !side.classList.contains('open');
        side.classList.toggle('open', open);
        menu.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (scrim) scrim.hidden = !open;
      });
      if (scrim) scrim.addEventListener('click', function () {
        side.classList.remove('open');
        scrim.hidden = true;
        menu.setAttribute('aria-expanded', 'false');
      });
    }

    // generic data-toast hooks (switches, radios)
    document.querySelectorAll('[data-toast]').forEach(function (el) {
      el.addEventListener('change', function () { toast(el.dataset.toast); });
    });

    // usage: daily columns
    // Values are quantised to a whole number of cells so a column is a stack of
    // discrete blocks rather than a continuous bar — that is what makes the
    // chart readable at a glance against the empty cells behind it, and it means
    // the fill never ends halfway through a cell.
    var bars = $('daily-bars');
    if (bars) {
      var CELLS = 10; // must match the column height / --pitch-v in workspace.css
      var vals = [1.1, 1.7, 1.4, 3.0, 2.5, 4.9, 2.7, 2.1, 4.6, 3.4, 3.6, 2.6, 3.2, 4.8]; // sums to the $41.60 headline
      var max = Math.max.apply(null, vals);
      vals.forEach(function (v) {
        var col = document.createElement('div');
        col.className = 'dcol';
        col.title = '$' + v.toFixed(2);
        var lit = Math.max(1, Math.round((v / max) * CELLS));
        var fill = document.createElement('i');
        fill.style.height = ((lit / CELLS) * 100) + '%';
        col.appendChild(fill);
        bars.appendChild(col);
      });
    }

    // billing: top-up asks how much first, so the amount is a decision rather
    // than a side effect of pressing the button
    var topup = $('topup-btn'), bal = $('balance-val');
    if (topup && bal) {
      topup.addEventListener('click', function () {
        var cur = wallet();
        var d = openDialog(
          '<h2>Top up your wallet</h2>' +
          '<p class="dlg-sub">PAYG covers overflow once your plan quota is spent. It stays separate from the monthly pool, and it does not raise it.</p>' +
          '<div class="dlg-field"><span class="dlg-label" id="dlg-amt-label">Amount</span>' +
          '<div class="amt" role="radiogroup" aria-labelledby="dlg-amt-label">' +
          [20, 50, 100].map(function (n, i) {
            return '<label><input type="radio" name="dlg-amt" value="' + n + '"' + (i ? '' : ' checked') +
              '><span>$' + n + '</span></label>';
          }).join('') +
          '</div></div>' +
          '<div class="urow" style="margin-top:20px"><span>Wallet balance</span><span>' + money(cur) + '</span></div>' +
          '<div class="urow"><span>After top-up</span><span id="dlg-after"></span></div>' +
          '<div class="dlg-actions">' +
          '<button class="wbtn ghost" type="button" data-close>Cancel</button>' +
          '<button class="wbtn" type="button" data-confirm>Add funds</button></div>'
        );
        function pick() { return parseFloat(d.querySelector('input[name="dlg-amt"]:checked').value); }
        var after = d.querySelector('#dlg-after');
        d.querySelectorAll('input[name="dlg-amt"]').forEach(function (r) {
          r.addEventListener('change', function () { after.textContent = money(cur + pick()); });
        });
        after.textContent = money(cur + pick());
        d.querySelector('[data-confirm]').addEventListener('click', function () {
          bal.textContent = money(cur + pick());
          closeDialog(d);
          toast('Funds added to your wallet — overflow is covered.');
        });
      });
    }

    // keys + referral: delegated copy / rotate / revoke — one document-level
    // listener covers static rows, created rows, and the members referral button
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.hasAttribute('data-copy')) {
        copyText(b.getAttribute('data-copy'), 'Key copied.');
      } else if (b.hasAttribute('data-regen')) {
        var row = b.closest('tr');
        var cell = row && row.querySelector('td.mono');
        var tag = Math.random().toString(16).slice(2, 6);
        if (cell) cell.textContent = 'sc_live_••••' + tag;
        b.setAttribute('data-copy', 'sc_live_mock_' + tag + '_key');
        toast('Key rotated. The old value stopped working.');
      } else if (b.hasAttribute('data-revoke')) {
        var dead = b.closest('tr');
        if (dead) dead.remove();
        toast('Key revoked.');
      } else if (b.hasAttribute('data-close')) {
        closeDialog(b.closest('dialog'));
      } else if (b.hasAttribute('data-signout')) {
        closeAcct(false);
        signOutDialog();
      }
    });

    /* ---------- account menu ---------- */
    var acctBtn = $('acct-btn'), acctMenu = $('acct-menu');
    function closeAcct(restore) {
      if (!acctMenu || acctMenu.hidden) return;
      acctMenu.hidden = true;
      acctBtn.setAttribute('aria-expanded', 'false');
      if (restore) acctBtn.focus();
    }
    function openAcct() {
      acctMenu.hidden = false;
      acctBtn.setAttribute('aria-expanded', 'true');
      var first = acctMenu.querySelector('button');
      if (first) first.focus();
    }
    if (acctBtn && acctMenu) {
      acctBtn.addEventListener('click', function () {
        if (acctMenu.hidden) openAcct(); else closeAcct(false);
      });
      acctBtn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openAcct(); }
      });
      // items are real buttons, so Tab order works; arrows just make the menu
      // behave like one for people who reach for them (same as the language list)
      acctMenu.addEventListener('keydown', function (e) {
        var items = Array.prototype.slice.call(acctMenu.querySelectorAll('button'));
        var i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      });
      document.addEventListener('click', function (e) {
        if (acctMenu.hidden) return;
        if (!acctMenu.contains(e.target) && !acctBtn.contains(e.target)) closeAcct(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !acctMenu.hidden) { e.stopPropagation(); closeAcct(true); }
      });
    }

    function signOutDialog() {
      var d = openDialog(
        '<h2>Sign out?</h2>' +
        '<p class="dlg-sub">You will need to sign in again to reach the console.</p>' +
        '<div class="dlg-actions">' +
        '<button class="wbtn ghost" type="button" data-close>Cancel</button>' +
        '<button class="wbtn danger" type="button" data-go>Sign out</button></div>'
      );
      d.querySelector('[data-go]').addEventListener('click', function () {
        if (window.Sand && Sand.auth) Sand.auth.signOut();
        closeDialog(d);
        toast('Signed out.');
        var acct = document.getElementById('acct-btn');
        if (acct) acct.focus();
        // land on sign-in rather than the marketing home: signing out of the
        // console is the start of signing back in, and the console is gated
        setTimeout(function () { location.href = './signin.html'; }, 900);
      });
    }
    // keys: creation is a two-step dialog — name it, then read the value once.
    // That mirrors how a real revocable token works and is the only moment the
    // secret exists client-side.
    function addKeyRow(name, value) {
      var tb = document.querySelector('#keys-table tbody');
      if (!tb) return;
      function cell(cls, text) {
        var c = document.createElement('td');
        if (cls) c.className = cls;
        if (text) c.textContent = text;
        return c;
      }
      function act(label, attr, val, cls) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wbtn ' + cls;
        b.textContent = label;
        b.setAttribute(attr, val === null ? '' : val);
        return b;
      }
      var actions = cell('num');
      actions.append(
        act('Copy', 'data-copy', value, 'ghost'),
        act('Rotate', 'data-regen', null, 'ghost'),
        act('Revoke', 'data-revoke', null, 'danger')
      );
      var tr = document.createElement('tr');
      tr.append(cell(null, name), cell('mono', 'sc_live_••••' + value.slice(-4)), cell(null, 'never'), actions);
      tb.prepend(tr);
    }

    function revealKey(d, value) {
      while (d.firstChild) d.removeChild(d.firstChild);
      var row = node('div', 'd-share');
      var copy = node('button', 'wbtn ghost', 'Copy');
      copy.type = 'button';
      copy.setAttribute('data-copy', value); // the delegated handler owns the copy
      row.append(node('code', null, value), copy);
      var actions = node('div', 'dlg-actions');
      var done = node('button', 'wbtn', 'Done');
      done.type = 'button';
      done.setAttribute('data-close', '');
      actions.append(done);
      var heading = node('h2', null, 'API key created');
      heading.id = 'dlg-title'; // step 1's heading is gone; relabel the dialog
      d.append(heading, node('p', 'dlg-sub', 'Copy it now — this is the only time it is shown.'), row, actions);
      done.focus();
    }

    var create = $('key-create');
    if (create) {
      create.addEventListener('click', function () {
        var d = openDialog(
          '<h2>Create an API key</h2>' +
          '<p class="dlg-sub">You will see the key once. Store it somewhere safe — it cannot be shown again.</p>' +
          '<div class="dlg-field"><label class="dlg-label" for="dlg-key-name">Name</label>' +
          '<input class="winput" id="dlg-key-name" autocomplete="off" placeholder="e.g. CI runner"></div>' +
          '<div class="dlg-actions">' +
          '<button class="wbtn ghost" type="button" data-close>Cancel</button>' +
          '<button class="wbtn" type="button" data-create>Create key</button></div>'
        );
        var input = d.querySelector('#dlg-key-name');
        function submit() {
          var name = input.value.trim();
          if (!name) { toast('Give the key a name first.'); input.focus(); return; }
          var value = secret();
          addKeyRow(name, value);
          revealKey(d, value);
        }
        input.focus();
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        d.querySelector('[data-create]').addEventListener('click', submit);
      });
    }

    // members: invite (DOM-built — user input never goes through innerHTML)
    var invite = $('invite-btn');
    if (invite) {
      invite.addEventListener('click', function () {
        var input = $('invite-email');
        var email = input ? input.value.trim() : '';
        if (!email || email.indexOf('@') < 1) { toast('Enter a valid email.'); return; }
        var tb = document.querySelector('#members-table tbody');
        if (tb) {
          var name = email.split('@')[0];
          var tdName = document.createElement('td');
          var b = document.createElement('b');
          b.textContent = name;
          tdName.appendChild(b);
          tdName.appendChild(document.createTextNode(' · ' + email));
          var tdRole = document.createElement('td');
          tdRole.textContent = 'Invited';
          var tdCap = document.createElement('td');
          tdCap.className = 'num';
          tdCap.textContent = '$3/day';
          var tdWhen = document.createElement('td');
          tdWhen.textContent = 'just now';
          var tr = document.createElement('tr');
          tr.append(tdName, tdRole, tdCap, tdWhen);
          tb.appendChild(tr);
        }
        if (input) input.value = '';
        toast('Invite sent to ' + email + '.');
      });
    }
    document.querySelectorAll('.member-role').forEach(function (s) {
      s.addEventListener('change', function () { toast('Role updated to ' + s.value + '.'); });
    });

    // settings: save + purge + leave
    var save = $('ws-save');
    if (save) save.addEventListener('click', function () { toast('Settings saved (mock — nothing stored).'); });
    var purge = $('ws-purge');
    if (purge) purge.addEventListener('click', function () { toast('Nothing to delete — retention is off.'); });
    var share = $('share-savings');
    if (share) share.addEventListener('click', function () { toast('Share card generated — it contains no code content.'); });
    var leave = $('ws-leave');
    if (leave) leave.addEventListener('click', function () { toast('This is a demo — you are staying.'); });
  });
})();
