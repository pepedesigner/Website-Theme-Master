// Sandcode clone interactions
const cmds = {
  curl: 'curl -fsSL https://sandcode.ai/install | bash',
  npm: 'npm i -g sandbase-ai',
  bun: 'bun add -g sandbase-ai',
  brew: 'brew install sandbase/tap/sandbase',
  paru: 'paru -S sandbase'
};
function initTabs(){
  const btns = document.querySelectorAll('.tabs button');
  const code = document.getElementById('install-cmd');
  if(!btns.length || !code) return;
  btns.forEach(b=>{
    b.addEventListener('click', ()=>{
      btns.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      code.textContent = cmds[b.dataset.k] || cmds.curl;
    });
  });
}
function copyCmd(){
  const code = document.getElementById('install-cmd');
  const btn = document.getElementById('copy-btn');
  if(!code) return;
  const text = code.textContent;
  const done = ()=>{
    if(btn){
      const ok = btn.querySelector('.copy-ok');
      const ico = btn.querySelector('.copy-ico');
      const label = btn.querySelector('.copy-label');
      if(ok) ok.style.display = '';
      if(ico) ico.style.display = 'none';
      if(label) label.textContent = 'Copied';
      setTimeout(()=>{
        if(ok) ok.style.display = 'none';
        if(ico) ico.style.display = '';
        if(label) label.textContent = 'Copy';
      },1200);
    }
  };
  const label = btn && btn.querySelector('.copy-label');
  const fail = ()=>{
    if(!label) return;
    label.textContent = 'Copy failed';
    setTimeout(()=>{ label.textContent = 'Copy'; }, 1600);
  };
  if(!window.Sand || !Sand.copyText){ fail(); return; }
  Sand.copyText(text).then(done).catch(fail);
}
// expose for inline onclick + addEventListener both work
window.copyCmd = copyCmd;
function initMenu(){
  const btn = document.getElementById('menu-btn');
  const links = document.getElementById('nav-links');
  if(!btn || !links) return;
  const setOpen = (open)=>{
    links.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = open ? 'Close menu' : 'Open menu';
    if(btn.textContent !== label) btn.textContent = label;
  };
  btn.addEventListener('click', ()=>setOpen(!links.classList.contains('open')));
  links.addEventListener('click', (e)=>{ if(e.target && e.target.tagName === 'A') setOpen(false); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && links.classList.contains('open')) setOpen(false); });
  document.addEventListener('click', (e)=>{
    if(!links.classList.contains('open')) return;
    if(links.contains(e.target) || btn.contains(e.target)) return;
    setOpen(false);
  });
}
function initWaitlist(){
  const f = document.getElementById('waitlist-form');
  if(!f) return;
  f.addEventListener('submit', (e)=>{
    e.preventDefault();
    const msg = document.getElementById('waitlist-msg');
    if(msg) msg.textContent = '✓ You are on the list — we will be in touch shortly.';
    f.reset();
  });
}
// Sign-in / sign-up (demo). There is no backend, so submitting the form *is*
// the exchange: the address is remembered and the console opens. The checks
// exist so the flow has a real failure state to show, not to model a password
// policy — and the same handler serves both pages, which is why it looks up
// elements rather than assuming one of them.
function initAuth(){
  const f = document.getElementById('auth-form');
  if(!f) return;
  const err = document.getElementById('auth-err');
  const email = document.getElementById('auth-email');
  const pass = document.getElementById('auth-pass');
  const fail = (msg)=>{ if(err){ err.textContent = msg; email.setAttribute('aria-invalid','true'); } };
  const enter = (addr)=>{
    if(window.Sand && Sand.auth) Sand.auth.signIn(addr);
    location.href = './workspace-overview.html';
  };
  f.addEventListener('submit', (e)=>{
    e.preventDefault();
    const a = email ? email.value.trim() : '';
    const p = pass ? pass.value : '';
    if(!a || a.indexOf('@') < 1) return fail('Enter a valid email address.');
    if(p.length < 8) return fail('Your password needs at least 8 characters.');
    enter(a);
  });
  const gh = document.getElementById('auth-github');
  if(gh) gh.addEventListener('click', ()=>enter('alex@techstartup.io'));
  // clear the message as soon as the visitor starts fixing it
  [email, pass].forEach((el)=>{
    if(el) el.addEventListener('input', ()=>{
      if(err) err.textContent = '';
      [email, pass].forEach((i)=>{ if(i) i.removeAttribute('aria-invalid'); });
    });
  });
}
// fake terminal session — one-time type-on, never loops.
// Lines are lists of [cssClass, text] segments, so colour survives the
// animation. Command lines type character by character; output lines stream in
// whole, which keeps the timeline short even though the session is long.
// Under reduced motion the finished session is rendered immediately.
function initTerm(){
  const el = document.getElementById('term-typing');
  if(!el) return;

  const cmd = (seg)=>({ type:true, seg:seg });
  const out = (seg)=>({ type:false, seg:seg });
  const L = [
    cmd([['t-prompt','$ '],['t-cmd','npm i -g sandbase-ai']]),
    cmd([['t-prompt','$ '],['t-cmd','sandbase setup']]),
    out([]),
    out([['t-ok','⏺ '],['t-dim','[1/4] Detecting agent clients']]),
    out([['t-ok','   ✔ '],['t-file','Cursor'],['t-dim','        ~/.cursor']]),
    out([['t-ok','   ✔ '],['t-file','Claude Code'],['t-dim','   ~/.claude.json']]),
    out([['t-ok','   ✔ '],['t-file','OpenCode'],['t-dim','      ~/.config/opencode']]),
    out([['t-ok','⏺ '],['t-dim','[2/4] '],['t-file','alex@techstartup.io'],['t-dim',' · Standard · Active']]),
    out([['t-ok','   ✔ '],['t-dim','This month '],['t-num','$41.60'],['t-dim',' of '],['t-num','$70.00'],['t-dim',' · 6h window free '],['t-num','$10.20']]),
    out([['t-ok','⏺ '],['t-dim','[3/4] Endpoints and MCP tools']]),
    out([['t-ok','   ✔ '],['t-file','Cursor'],['t-dim','        OpenAI endpoint · search + scrape']]),
    out([['t-ok','   ✔ '],['t-file','Claude Code'],['t-dim','   Anthropic endpoint · transpiler on']]),
    out([['t-ok','   ✔ '],['t-file','Local harness'],['t-dim','   syntax check · pytest/jest · git rollback']]),
    out([['t-ok','⏺ '],['t-dim','[4/4] Rules & Skills Sync']]),
    out([['t-ok','   ✔ '],['t-file','.sandbase/rules.md'],['t-dim',' → '],['t-file','.cursorrules'],['t-dim',', '],['t-file','CLAUDE.md']]),
    out([]),
    out([['t-key','🎉 '],['t-strong','Ready'],['t-dim',' — code in Cursor or Claude Code now.']])
  ];

  const segLen = (line)=> line.seg.reduce((n, s)=> n + s[1].length, 0);

  // one line, clipped to `budget` characters (null = the whole line)
  function lineDom(line, budget){
    const d = document.createElement('div');
    d.className = 't-line';
    let left = budget === null ? Infinity : budget;
    for(const seg of line.seg){
      if(left <= 0) break;
      const take = Math.min(left, seg[1].length);
      if(take > 0){
        const s = document.createElement('span');
        s.className = seg[0];
        s.textContent = seg[1].slice(0, take);
        d.appendChild(s);
        left -= take;
      }
      if(take < seg[1].length) break;
    }
    return d;
  }
  // Only the in-progress line is rewritten. Rebuilding the whole block on every
  // keystroke re-created every finished line and the caret with them — which
  // restarted the caret's blink animation on each character, so the caret never
  // actually blinked while the command was typing.
  let committed = 0;   // lines already finalised in the DOM
  let cur = null;      // the in-progress line element (or null)
  let curCaret = null; // its caret, kept as a stable child
  function commitCur(){
    if(!cur) return;
    if(curCaret){ curCaret.remove(); curCaret = null; }
    cur = null;
    committed++;
  }
  function render(full, ci, caret){
    if(full > committed && cur) commitCur();       // the in-progress line is done
    while(committed < Math.min(full, L.length)){   // the caller can also jump ahead
      el.appendChild(lineDom(L[committed], null));
      committed++;
    }
    if(full >= L.length){ commitCur(); return; }
    if(!cur){
      cur = document.createElement('div');
      cur.className = 't-line';
      el.appendChild(cur);
    }
    const next = lineDom(L[full], ci);
    const frag = document.createDocumentFragment();
    while(next.firstChild) frag.appendChild(next.firstChild);
    if(caret && !curCaret){
      curCaret = document.createElement('span');
      curCaret.className = 't-caret';
      cur.appendChild(curCaret);
    } else if(!caret && curCaret){
      curCaret.remove();
      curCaret = null;
    }
    cur.insertBefore(frag, curCaret); // text goes before the caret, never replacing it
  }

  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    render(L.length, 0, false);
    return;
  }

  let li = 0, ci = 0;
  render(0, 0, true);
  function step(){
    if(li >= L.length){ render(L.length, 0, false); return; }
    const len = segLen(L[li]);
    if(len === 0){                        // blank spacer line
      li++; ci = 0; render(li, 0, true);
      setTimeout(step, 70);
    } else if(L[li].type){                // command line: type it out
      ci++; render(li, ci, true);
      if(ci >= len){ li++; ci = 0; render(li, 0, true); setTimeout(step, 280); }
      else setTimeout(step, 16 + Math.random() * 20);
    } else {                              // output line: stream it in whole
      li++; ci = 0; render(li, 0, true);
      setTimeout(step, 120);
    }
  }
  step();
}
document.addEventListener('DOMContentLoaded', ()=>{
  // each init is isolated: one failure must not take the rest of the page with
  // it (common.js missing, an unsupported API, one bad selector …)
  const safe = (fn)=>{ try { fn(); } catch (e) { console.warn('[sandcode] init failed:', fn.name || fn, e); } };
  if(window.Sand && Sand.initTheme) safe(Sand.initTheme);
  [initTabs, initMenu, initWaitlist, initAuth, initTerm, initCopyBtn, initUsecase, initHeroDots,
   initReveal, initScrollAffordances, initCountUp, initMarquee].forEach(safe);
});
// The progress bar and back-to-top button are not decorations — reducing motion
// must not remove them, only the tweened behaviour. No animation library is
// involved: the bar is written on scroll and the button toggles a class.
function initScrollAffordances(){
  var bar = document.querySelector('.progress');
  if(!bar){ bar = document.createElement('div'); bar.className = 'progress'; document.body.prepend(bar); }
  var top = document.querySelector('#toTop');
  if(!top){
    top = document.createElement('button');
    top.id = 'toTop'; top.type = 'button';
    top.setAttribute('aria-label', 'Back to top');
    top.textContent = '↑';
    document.body.appendChild(top);
    top.addEventListener('click', ()=>{ window.scrollTo({ top: 0, behavior: 'auto' }); });
  }
  var header = document.querySelector('.site-header');
  var last = window.scrollY, max = 0, ticking = false;
  // scrollHeight is a layout read: doing it inside the scroll handler forced a
  // synchronous layout on every event. It only changes when the layout does.
  const measure = ()=>{ max = document.documentElement.scrollHeight - window.innerHeight; };
  const onScroll = ()=>{
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(()=>{
      ticking = false;
      const y = window.scrollY;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      top.classList.toggle('show', y > 600);
      // the header retracts while reading downward and comes back the moment you
      // scroll up (the direction test is `y > last`)
      if(header) header.classList.toggle('nav-hidden', y > 160 && y > last);
      last = y;
    });
  };
  const reflow = ()=>{ measure(); onScroll(); };
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', reflow, {passive:true});
  if(window.ResizeObserver) new ResizeObserver(reflow).observe(document.body);
  reflow();
}
// Count the stat figures up once they scroll into view. The markup already
// carries the final value, so a missing IntersectionObserver, reduced motion or
// an element that never intersects all simply leave the number correct.
function initCountUp(){
  const els = document.querySelectorAll('[data-count]');
  if(!els.length || !('IntersectionObserver' in window) || !window.requestAnimationFrame) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const DUR = 1400;
  const io = new IntersectionObserver((entries)=>{
    entries.forEach((e)=>{
      if(!e.isIntersecting) return;
      io.unobserve(e.target);
      const el = e.target;
      const end = parseFloat(el.dataset.count) || 0;
      const suffix = el.dataset.suffix || '';
      const t0 = performance.now();
      const tick = (now)=>{
        const p = Math.min(1, (now - t0) / DUR);
        const eased = 1 - Math.pow(1 - p, 3);   // ease-out cubic
        el.textContent = Math.round(end * eased) + suffix;
        if(p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, {threshold: 0, rootMargin: '0px 0px -10% 0px'});
  els.forEach((el)=>io.observe(el));
}
// The marquee itself is a CSS keyframe (see .logo-row); this only supplies the
// second copy that makes -50% land exactly on one loop. Below 761px the strip
// wraps instead of scrolling, so nothing is duplicated there.
function initMarquee(){
  const row = document.querySelector('.logo-row');
  if(!row || !row.children.length) return;
  if(!(window.matchMedia && window.matchMedia('(min-width: 761px)').matches)) return;
  // the clones are decoration — without this a screen reader reads the client
  // list twice, which is what a plain innerHTML += would have done
  Array.prototype.slice.call(row.children).forEach((el)=>{
    const clone = el.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    row.appendChild(clone);
  });
}
function initCopyBtn(){
  const btn = document.getElementById('copy-btn');
  if(btn) btn.addEventListener('click', copyCmd);
}
// scroll reveal (progressive enhancement: no-JS keeps content visible)
// The hero's own children are animated by the `hero-in` keyframe in style.css
// instead, so they are deliberately absent here — running both would have a
// transition and an animation fighting over the same transform.
function initReveal(){
  const els = document.querySelectorAll('section.block, .card, .feat, .stat, .plan, .zen-banner, .waitlist, .compare, .uc-panel, .quad');
  if(!els.length || !('IntersectionObserver' in window)){
    return;
  }
  els.forEach((el)=>{
    el.classList.add('reveal');
    const sibs = Array.from(el.parentElement ? el.parentElement.children : []).filter((c)=>c.classList && c.classList.contains('reveal'));
    const i = sibs.indexOf(el) % 4;
    el.style.transitionDelay = (i * 70) + 'ms';
  });
  const io = new IntersectionObserver((entries)=>{
    entries.forEach((e)=>{
      if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach((el)=>io.observe(el));
}
// use-case tabs
function initUsecase(){
  const btns = document.querySelectorAll('[data-uctab]');
  if(!btns.length) return;
  const panels = document.querySelectorAll('[data-ucpanel]');
  btns.forEach((b)=>{
    b.addEventListener('click', ()=>{
      btns.forEach((x)=>x.classList.remove('active'));
      b.classList.add('active');
      panels.forEach((p)=>p.classList.toggle('active', p.dataset.ucpanel === b.dataset.uctab));
    });
  });
}
// interactive dot grid behind the hero headline
// (progressive enhancement: no canvas → nothing is added; reduced motion →
// a static grid is drawn and nothing animates)
function initHeroDots(){
  const host = document.querySelector('.hero[data-hero-dots]');
  if(!host || !document.createElement('canvas').getContext) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const GAP = 24;       // grid pitch, px
  const BASE_R = 1.35;  // resting dot radius
  const HOT_R = 3;      // radius at the cursor
  const REACH = 150;    // cursor influence radius
  const TAU = Math.PI * 2;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-dots';
  canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, host.firstChild);

  const ctx = canvas.getContext('2d');
  // static grid lives in an offscreen layer: each frame only the few dots near
  // the cursor are redrawn on top, instead of the whole grid every frame.
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');

  let w = 0, h = 0, cols = 0, rows = 0, ox = 0, oy = 0, dpr = 1;
  let heat = new Float32Array(1);
  let dotColor = '#5D5969', hotColor = '#6A4CFF';
  let px = -1e5, py = -1e5, hovering = false, raf = 0, pending = 0;

  function readColors(){
    const cs = getComputedStyle(document.body);
    dotColor = cs.getPropertyValue('--muted').trim() || dotColor;
    hotColor = cs.getPropertyValue('--accent').trim() || hotColor;
  }

  function drawBase(){
    base.width = canvas.width;
    base.height = canvas.height;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, w, h);
    bctx.fillStyle = dotColor;
    bctx.globalAlpha = 0.46;
    for(let r = 0; r < rows; r++){
      for(let c = 0; c < cols; c++){
        bctx.beginPath();
        bctx.arc(ox + c * GAP, oy + r * GAP, BASE_R, 0, TAU);
        bctx.fill();
      }
    }
    bctx.globalAlpha = 1;
  }

  function measure(){
    const rect = host.getBoundingClientRect();
    // run down to the terminal frame; the mask fades the grid out long before
    // it, so an opaque panel never cuts a hard edge across the dots
    const stop = host.querySelector('.terminal') || host.querySelector('.install');
    let limit = rect.height;
    if(stop){
      // offsetTop is the layout position and transforms never move it, so the
      // card's entrance animation (a 28px translateY) cannot skew this
      limit = (stop.offsetParent === host)
        ? stop.offsetTop
        : stop.getBoundingClientRect().top - rect.top;
    }
    w = document.documentElement.clientWidth;
    h = Math.max(240, Math.round(Math.min(rect.height, limit)));
    canvas.style.left = (-rect.left) + 'px';
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    cols = Math.ceil(w / GAP) + 1;
    rows = Math.ceil(h / GAP) + 1;
    ox = (w - (cols - 1) * GAP) / 2;
    oy = (h - (rows - 1) * GAP) / 2;
    heat = new Float32Array(cols * rows);
    drawBase();
    paint(true);
  }

  // eases each dot toward the cursor's influence, then composites base + lit dots
  function paint(reset){
    const reach2 = REACH * REACH;
    let active = 0;
    for(let r = 0; r < rows; r++){
      const y = oy + r * GAP, row = r * cols;
      for(let c = 0; c < cols; c++){
        const i = row + c;
        let target = 0;
        if(hovering){
          const dx = ox + c * GAP - px, dy = y - py;
          const d2 = dx * dx + dy * dy;
          if(d2 < reach2){
            const t = 1 - Math.sqrt(d2) / REACH;
            target = t * t;
          }
        }
        let v = reset ? target : heat[i] + (target - heat[i]) * 0.16;
        if(target === 0 && v < 0.004) v = 0;
        heat[i] = v;
        if(v > 0.01) active++;
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(base, 0, 0, w, h);
    if(active){
      ctx.fillStyle = hotColor;
      for(let r = 0; r < rows; r++){
        const y = oy + r * GAP, row = r * cols;
        for(let c = 0; c < cols; c++){
          const v = heat[row + c];
          if(v <= 0.01) continue;
          const x = ox + c * GAP, rr = BASE_R + (HOT_R - BASE_R) * v;
          ctx.globalAlpha = 0.09 * v;                       // soft halo
          ctx.beginPath(); ctx.arc(x, y, rr * 3.2, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.9 * v;                        // lit core
          ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    return active;
  }

  // the loop parks itself once the cursor leaves and every dot has faded out
  function tick(){
    raf = 0;
    if(paint(false) || hovering) raf = requestAnimationFrame(tick);
  }
  function kick(){ if(!raf && !reduce) raf = requestAnimationFrame(tick); }

  function onMove(e){
    if(e.pointerType === 'touch') return;
    const rect = host.getBoundingClientRect();
    px = e.clientX;
    py = e.clientY - rect.top;
    hovering = py >= -REACH && py <= h + REACH && px >= -REACH && px <= w + REACH;
    kick();
  }

  function schedule(){
    if(pending) return;
    pending = requestAnimationFrame(()=>{ pending = 0; measure(); });
  }

  readColors();
  measure();
  window.addEventListener('resize', schedule, {passive:true});
  // the hero's height settles late (webfonts, headline wrapping, entrance
  // tweens) — watch the element itself instead of guessing when to re-measure
  if(window.ResizeObserver) new ResizeObserver(schedule).observe(host);
  else if(document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(()=>{});

  if(!reduce){
    host.addEventListener('pointermove', onMove, {passive:true});
    host.addEventListener('pointerleave', ()=>{ hovering = false; kick(); }, {passive:true});
  }
  // theme switches change --muted/--accent under us — rebuild with the new tokens
  if(window.MutationObserver){
    new MutationObserver(()=>{ readColors(); measure(); })
      .observe(document.body, {attributes:true, attributeFilter:['data-theme']});
  }
}
