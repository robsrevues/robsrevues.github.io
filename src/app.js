(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const full = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const compact = (n) => {
    if (n == null) return '—';
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    if (n < 1e6) return Math.round(n / 1000) + 'K';
    return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  };
  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16L16 8"/><path d="M9 8h7v7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  // YouTube Shorts thumbnails: fall back to the standard one if the vertical one is missing.
  const fallback = (img) => {
    if (!img.dataset.fallback) return;
    const f = img.dataset.fallback;
    img.removeAttribute('data-fallback');
    img.src = f;
    const box = img.parentElement;
    if (box && box.classList.contains('rr-thumb')) {
      // No vertical thumbnail exists, so this is a landscape video: show it whole.
      box.classList.add('rr-thumb--wide');
      img.classList.add('fit');
      const bg = img.cloneNode(); bg.className = 'bg'; bg.setAttribute('aria-hidden', 'true');
      box.insertBefore(bg, img);
    }
  };
  document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') fallback(e.target); }, true);
  document.addEventListener('load', (e) => { const i = e.target; if (i.tagName === 'IMG' && i.naturalWidth && i.naturalWidth <= 120) fallback(i); }, true);

  // Click-to-play players (review pages and the sheet). Nothing loads from YouTube/TikTok until asked.
  function wirePlayer(el) {
    const btn = el.querySelector('button.player__play');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const src = el.dataset.embed;
      if (!src) { const a = document.createElement('a'); a.href = el.dataset.href; a.target = '_blank'; a.rel = 'noopener'; a.click(); return; }
      el.innerHTML = '<iframe src="' + esc(src) + '" title="Video player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      // TikTok sometimes throttles its embedded player ("ratelimit triggered") and the page can't see that
      // inside the iframe, so always offer a way out under TikTok players.
      if (/tiktok\.com/.test(src) && !(el.nextElementSibling && el.nextElementSibling.classList.contains('player__help'))) {
        el.insertAdjacentHTML('afterend', '<p class="player__help">Video not loading? <a href="' + esc(el.dataset.href) + '" target="_blank" rel="noopener">Watch on TikTok</a></p>');
      }
    });
  }
  document.querySelectorAll('.player').forEach(wirePlayer);

  // Brand pitch video: clean poster with one big "Watch" button; native controls once it plays.
  const pv = document.getElementById('pitch-video');
  const pb = document.querySelector('.pitch__play');
  if (pv && pb) {
    pv.removeAttribute('controls');
    pb.hidden = false;
    const start = () => { pb.hidden = true; pv.setAttribute('controls', ''); pv.play().catch(() => {}); pv.focus(); };
    pb.addEventListener('click', start);
    pv.addEventListener('click', () => { if (!pv.hasAttribute('controls')) start(); });
    pv.addEventListener('play', () => { pb.hidden = true; pv.setAttribute('controls', ''); });
  }

  const dataEl = document.getElementById('rr-data');
  if (!dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const bySlug = new Map(D.reviews.map((r) => [r.slug, r]));

  // ---------- Filter, search, sort, paging ----------
  const grid = document.getElementById('grid');
  if (grid) {
    const cards = Array.from(grid.children);
    const more = document.getElementById('more');
    const none = document.getElementById('no-results');
    const q = document.getElementById('q');
    const sort = document.getElementById('sort');
    const segs = document.querySelectorAll('.rr-seg [data-platform]');
    const tabs = document.querySelectorAll('.tabs [data-tab]');
    const state = { tab: 'reviews', platform: 'all', q: '', sort: 'new', limit: D.initial };
    const keyFor = { new: 'date', views: 'views', week: 'week', likes: 'likes' };

    const apply = () => {
      const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = cards.filter((c) =>
        c.dataset.tab === state.tab &&
        (state.platform === 'all' || c.dataset.platforms.split(' ').includes(state.platform)) &&
        words.every((w) => c.dataset.q.includes(w)));
      const k = keyFor[state.sort];
      list.sort((a, b) => (+b.dataset[k] - +a.dataset[k]) || (+b.dataset.date - +a.dataset.date));
      const shown = new Set(list.slice(0, state.limit));
      cards.forEach((c) => { c.hidden = !shown.has(c); });
      list.forEach((c) => grid.appendChild(c));
      const rest = list.length - state.limit;
      more.hidden = rest <= 0;
      more.textContent = 'Show ' + Math.min(D.size, Math.max(rest, 0)) + ' more';
      none.hidden = list.length > 0;
    };
    const setPlatform = (pf) => {
      state.platform = pf; state.limit = D.initial;
      segs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.platform === pf)));
      apply();
    };
    const setTab = (tab) => {
      state.tab = tab; state.limit = D.initial;
      tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
      apply();
    };
    const syncHash = () => {
      const parts = [state.tab === 'extras' ? 'extras' : '', state.platform === 'all' ? '' : state.platform].filter(Boolean);
      try { history.replaceState(null, '', parts.length ? '#' + parts.join('-') : location.pathname); } catch (_) {}
    };
    segs.forEach((b) => b.addEventListener('click', () => { setPlatform(b.dataset.platform); syncHash(); }));
    tabs.forEach((b) => b.addEventListener('click', () => { setTab(b.dataset.tab); syncHash(); }));
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value; state.limit = D.initial; apply(); }, 120); });
    sort.addEventListener('change', () => { state.sort = sort.value; state.limit = D.initial; apply(); });
    more.addEventListener('click', () => { state.limit += D.size; apply(); });
    const h = location.hash.slice(1).split('-');
    if (h.includes('extras') && tabs.length > 1) { state.tab = 'extras'; tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === 'extras'))); }
    const hp = h.find((x) => [...segs].some((b) => b.dataset.platform === x));
    if (hp) setPlatform(hp); else apply();
  }

  // ---------- Review sheet ----------
  const sheet = document.getElementById('sheet');
  const inner = document.getElementById('sheet-inner');
  let current = null, pushed = false, returnFocus = null;

  function playerHtml(r, pf) {
    const vertical = pf.vertical ? ' player--vertical' : '';
    const img = r.thumb ? '<img src="' + esc(r.thumb) + '" alt=""' + (r.thumbFallback ? ' data-fallback="' + esc(r.thumbFallback) + '"' : '') + '>' : '';
    const play = D.embeds && pf.embedUrl
      ? '<button class="player__play" type="button" aria-label="Play on ' + esc(pf.name) + '">' + ICON.play + '</button>'
      : '<a class="player__play" href="' + esc(pf.url) + '" target="_blank" rel="noopener" aria-label="Watch on ' + esc(pf.name) + '">' + ICON.play + '</a>';
    return '<div class="player' + vertical + '" data-embed="' + esc(D.embeds ? pf.embedUrl || '' : '') + '" data-href="' + esc(pf.url) + '">' + img + play + '</div>';
  }

  function render(r, pfIndex) {
    const pf = r.platforms[pfIndex];
    const multi = r.platforms.length > 1;
    const row = (x) => '<tr><td><span class="rr-chip rr-chip--bare rr-chip--' + x.platform + '">' + esc(x.name) + '</span></td><td>' + full(x.views) + '</td><td>' + full(x.likes) + '</td><td>' + full(x.comments) + '</td><td class="up">' + (x.week ? '+' + compact(x.week) : '—') + '</td></tr>';
    inner.innerHTML =
      '<div class="sheet__grip" aria-hidden="true"></div>' +
      '<div class="sheet__head"><div><span class="rr-label">Review · ' + esc(r.date) + '</span><h2 id="sheet-title">' + esc(r.title) + '</h2></div>' +
      '<button class="rr-btn rr-btn--ghost" type="button" data-close aria-label="Close" style="min-width:44px">' + ICON.close + '</button></div>' +
      (multi ? '<div class="row" role="group" aria-label="Watch on">' + r.platforms.map((x, i) => '<button class="rr-chip rr-chip--' + x.platform + '" type="button" data-pf="' + i + '" aria-pressed="' + (i === pfIndex) + '">' + esc(x.name) + '</button>').join('') + '</div>' : '') +
      playerHtml(r, pf) +
      '<div class="table-wrap"><table class="rr-table"><thead><tr><th scope="col">Platform</th><th scope="col">Views</th><th scope="col">Likes</th><th scope="col">Cmts</th><th scope="col">7 days</th></tr></thead><tbody>' +
      r.platforms.map(row).join('') + '</tbody>' +
      (multi ? '<tfoot><tr><td>Total</td><td>' + full(r.views) + '</td><td>' + full(r.likes) + '</td><td>' + full(r.comments) + '</td><td class="up">' + (r.week ? '+' + compact(r.week) : '—') + '</td></tr></tfoot>' : '') +
      '</table></div>' +
      (r.description ? '<p class="sheet__desc">' + esc(r.description) + '</p>' : '') +
      '<div class="row">' +
      (r.productUrl ? '<a class="rr-btn rr-btn--primary rr-btn--sm" href="' + esc(r.productUrl) + '" rel="sponsored nofollow noopener" target="_blank">See on Amazon' + ICON.out + '</a>' : '') +
      r.platforms.map((x) => '<a class="rr-btn rr-btn--secondary rr-btn--sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + (x.name === 'Full review' ? 'Watch full review' : 'Watch on ' + esc(x.name)) + '</a>').join('') + '</div>' +
      (r.productUrl ? '<p class="rr-disclosure" style="margin:0">Affiliate link: as an Amazon Associate I earn from qualifying purchases, at no extra cost to you.</p>' : '') +
      (r.pitch ? '<p class="video-pitch"><strong>Brands &amp; businesses:</strong> want a video like this for your product? <a href="' + esc(r.pitch) + '">Work with me</a></p>' : '');
    wirePlayer(inner.querySelector('.player'));
  }

  function open(slug, push) {
    const r = bySlug.get(slug);
    if (!r || !sheet) return;
    current = r;
    returnFocus = document.activeElement;
    render(r, 0);
    if (!sheet.open) { try { sheet.showModal(); } catch (_) { sheet.setAttribute('open', ''); } }
    inner.scrollTop = 0;
    if (push) { try { history.pushState({ sheet: slug }, '', '#r-' + slug); pushed = true; } catch (_) { pushed = false; } }
  }
  function close(fromPop) {
    if (!sheet || !sheet.open) return;
    inner.innerHTML = '';
    sheet.close();
    current = null;
    if (!fromPop) {
      if (pushed) { pushed = false; try { history.back(); } catch (_) {} }
      else if (location.hash.startsWith('#r-')) { try { history.replaceState(null, '', location.pathname); } catch (_) {} }
    }
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  if (sheet) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-open]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      e.preventDefault();
      open(a.dataset.open, true);
    });
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) return close(false);
      if (e.target.closest('[data-close]')) return close(false);
      const pf = e.target.closest('[data-pf]');
      if (pf && current) { render(current, +pf.dataset.pf); return; }
      if (e.target.closest('[data-copy]') && current) {
        const url = location.origin + '/reviews/' + current.slug + '/';
        const msg = inner.querySelector('[data-copy-msg]');
        const btn = e.target.closest('[data-copy]');
        const done = () => { btn.textContent = 'Copied'; };
        const fail = () => { msg.hidden = false; msg.textContent = url; };
        try { navigator.clipboard.writeText(url).then(done, fail); } catch (_) { fail(); }
      }
    });
    sheet.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    window.addEventListener('popstate', () => { pushed = false; if (sheet.open) close(true); else if (location.hash.startsWith('#r-')) open(location.hash.slice(3), false); });
    if (location.hash.startsWith('#r-')) open(location.hash.slice(3), false);
  }
})();

// Light/dark switch: follows the device until the visitor picks one, then remembers it (when storage allows).
(function () {
  const btn = document.querySelector('.theme-btn');
  if (!btn) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const current = () => document.documentElement.dataset.theme || (mq.matches ? 'dark' : 'light');
  const label = () => btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  label();
  mq.addEventListener?.('change', label);
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rr-theme', next); } catch (_) {}
    label();
  });
})();
// Hover preview: on desktop, resting on a card for a moment plays a few silent seconds of the YouTube video
// in place. Skipped on touch screens, with reduced motion or data saver, and for TikTok-only cards
// (TikTok throttles its embedded player).
(function () {
  const ok = window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !(navigator.connection && navigator.connection.saveData);
  const dataEl = document.getElementById('rr-data');
  if (!ok || !dataEl) return;
  const bySlug = {};
  JSON.parse(dataEl.textContent).reviews.forEach((r) => { bySlug[r.slug] = r; });
  const ytId = (u) => { const m = /[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})|shorts\/([\w-]{11})/.exec(u || ''); return m && (m[1] || m[2] || m[3]); };
  let cur = null, timer = 0, seq = 0;
  const stop = () => {
    clearTimeout(timer);
    if (!cur) return;
    const f = cur.frame; f.classList.remove('on');
    setTimeout(() => f.remove(), 250);
    clearTimeout(cur.end); cur = null;
  };
  const start = (thumb) => {
    const card = thumb.closest('.rr-card'); const r = card && bySlug[card.dataset.slug];
    if (!r) return;
    const wide = thumb.classList.contains('rr-thumb--wide');
    const yts = r.platforms.filter((p) => p.platform === 'youtube');
    const pick = (wide ? yts.find((p) => !p.vertical) : yts.find((p) => p.vertical)) || yts[0];
    const id = pick && ytId(pick.url);
    if (!id) return;
    const n = ++seq;
    const f = document.createElement('iframe');
    f.className = 'rr-preview' + (wide && !pick.vertical ? ' rr-preview--wide' : '');
    f.title = 'Preview'; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
    f.allow = 'autoplay; encrypted-media';
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=' + id +
      '&rel=0&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    f.addEventListener('load', () => {
      try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: n, channel: 'widget' }), '*'); } catch (_) {}
    });
    thumb.appendChild(f);
    cur = { frame: f, n, end: 0 };
  };
  window.addEventListener('message', (e) => {
    if (!cur || !/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
    let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (_) { return; }
    if (!d || d.id !== cur.n) return;
    const st = d.info && d.info.playerState;
    if (st === 1 && !cur.frame.classList.contains('on')) {
      cur.frame.classList.add('on');
      const mine = cur; mine.end = setTimeout(() => { if (cur === mine) stop(); }, 6000);
    }
  });
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('#grid .rr-thumb');
    if (!t || (cur && cur.frame.parentNode === t)) return;
    stop();
    timer = setTimeout(() => start(t), 450);
  });
  document.addEventListener('mouseout', (e) => {
    const t = e.target.closest && e.target.closest('#grid .rr-thumb');
    if (t && !t.contains(e.relatedTarget)) stop();
  });
  document.addEventListener('click', stop, true);
})();
