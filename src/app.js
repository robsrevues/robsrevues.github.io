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
    });
  }
  document.querySelectorAll('.player').forEach(wirePlayer);

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
    const state = { platform: 'all', q: '', sort: 'new', limit: D.initial };
    const keyFor = { new: 'date', views: 'views', week: 'week', likes: 'likes' };

    const apply = () => {
      const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = cards.filter((c) =>
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
    segs.forEach((b) => b.addEventListener('click', () => {
      setPlatform(b.dataset.platform);
      try { history.replaceState(null, '', b.dataset.platform === 'all' ? location.pathname : '#' + b.dataset.platform); } catch (_) {}
    }));
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value; state.limit = D.initial; apply(); }, 120); });
    sort.addEventListener('change', () => { state.sort = sort.value; state.limit = D.initial; apply(); });
    more.addEventListener('click', () => { state.limit += D.size; apply(); });
    const h = location.hash.slice(1);
    if ([...segs].some((b) => b.dataset.platform === h)) setPlatform(h); else apply();
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
      (r.productUrl ? '<div style="display:flex;flex-direction:column;gap:8px"><a class="rr-btn rr-btn--primary" href="' + esc(r.productUrl) + '" rel="sponsored nofollow noopener" target="_blank">Check price on Amazon' + ICON.out + '</a><p class="rr-disclosure" style="margin:0;text-align:center">Affiliate link. I may earn a commission.</p></div>' : '') +
      (r.description ? '<p class="sheet__desc">' + esc(r.description) + '</p>' : '') +
      '<div class="row">' + r.platforms.map((x) => '<a class="rr-btn rr-btn--secondary rr-btn--sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">Watch on ' + esc(x.name) + '</a>').join('') +
      '<button class="rr-btn rr-btn--ghost rr-btn--sm" type="button" data-copy>Copy link</button></div>' +
      '<p class="rr-disclosure" data-copy-msg hidden style="margin:0"></p>';
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
