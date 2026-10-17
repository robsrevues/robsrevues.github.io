// Render the static site into dist/: the one-page home, a page per review, privacy/terms,
// sitemap and robots. No dependencies. `--sample` builds from data-sample/, `--preview`
// also writes a single-file preview to dist-preview/index.html.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { readJSON, p, today, daysBetween, slugify, compact, clock, isoDuration, esc } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const SAMPLE = args.has('--sample');
const PREVIEW = args.has('--preview');
const DATA = SAMPLE ? 'data-sample' : 'data';
const OUT = p('dist');

const cfg = await readJSON(p('site.config.json'));
const rawPosts = await readJSON(p(DATA, 'posts.json'), []);
const history = await readJSON(p(DATA, 'history.json'), {});
const channels = await readJSON(p(DATA, 'channels.json'), {});
const meta = await readJSON(p(DATA, 'meta.json'), {});
const overrides = await readJSON(p('data/overrides.json'), { posts: {}, reviews: {} });
const css = await readFile(p('src/site.css'), 'utf8');
const js = await readFile(p('src/app.js'), 'utf8');

const NOW = SAMPLE && meta.updated ? new Date(meta.updated) : new Date();
const DAY = today(NOW);
const SITE = cfg.url.replace(/\/$/, '');
const PLATFORM_ORDER = Object.keys(cfg.platforms);
const pname = (k) => cfg.platforms[k]?.name || k[0].toUpperCase() + k.slice(1);
const pshort = (k) => ({ youtube: 'YT', tiktok: 'TT', instagram: 'IG', facebook: 'FB' })[k] || pname(k).slice(0, 2).toUpperCase();

// ---------- helpers ----------
const fmtDate = (iso, opts = { month: 'short', day: 'numeric' }) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...opts }).format(new Date(iso));
const fullDate = (iso) => fmtDate(iso, { month: 'short', day: 'numeric', year: 'numeric' });
const full = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
const statNum = (n) => (n == null ? '—' : n < 10000 ? full(n) : compact(n));
const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
const STOP = new Set('the and for with this that what you your are was its it’s it\'s how why does did from into vs review reviews worth amazon product test honest new my our'.split(' '));
const words = (s) => new Set(String(s).toLowerCase().replace(/#\w+/g, '').match(/[a-z0-9$]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) || []);
const jaccard = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / (A.size + B.size - n); };
const cleanTitle = (s = '') => s.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s{2,}/g, ' ').replace(/[\s|·\-–—:]+$/, '').trim();
const TINTS = ['#ead9a6', '#c9d3de', '#cbd8cc', '#dccfc2', '#cdc8dc', '#dccaca', '#d6d0bd', '#c6d6d6'];
const tintFor = (s) => TINTS[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];

function productLink(text = '') {
  const m = text.match(/https?:\/\/(?:amzn\.to|a\.co|(?:www\.)?amazon\.com)\/[^\s)<>"']+/i);
  if (!m) return null;
  let url = m[0].replace(/[.,]+$/, '');
  if (cfg.amazonTag && /amazon\.com/i.test(url) && !/[?&]tag=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'tag=' + encodeURIComponent(cfg.amazonTag);
  return url;
}

function weekGain(key, post, idx) {
  const h = history[key];
  if (!h || !h.length) return null;
  const latest = h[h.length - 1][idx];
  if (latest == null) return null;
  const cutoff = new Date(NOW.getTime() - 7 * 86400000);
  if (new Date(post.publishedAt) >= cutoff) return latest; // all of it happened this week
  let base = null;
  for (const row of h) if (daysBetween(row[0], DAY) >= 7) base = row; else break;
  if (!base || base[idx] == null) return null;
  return Math.max(0, latest - base[idx]);
}

const icon = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16L16 8"/><path d="M9 8h7v7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
};

// ---------- posts -> reviews ----------
const posts = rawPosts
  .filter((x) => !x.removed && !overrides.posts?.[x.key]?.hidden)
  .map((x) => ({ ...x, ...(overrides.posts?.[x.key]?.title ? { title: overrides.posts[x.key].title } : {}) }))
  .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

const groups = [];
const byId = new Map();
for (const post of posts) {
  const forced = overrides.posts?.[post.key]?.review;
  let g = forced ? byId.get(forced) : null;
  if (!g && !forced) {
    let best = 0;
    for (const cand of groups) {
      if (cand.forced || cand.posts.some((q) => q.platform === post.platform)) continue;
      if (Math.abs(daysBetween(cand.posts[0].publishedAt.slice(0, 10), post.publishedAt.slice(0, 10))) > 3) continue;
      // Titles only: descriptions often share boilerplate (affiliate notes, hashtags) across videos.
      const label = (x) => cleanTitle(x.title) || (x.description || '').split('\n')[0];
      const score = Math.max(...cand.posts.map((q) => jaccard(label(q), label(post))));
      if (score >= 0.5 && score > best) { best = score; g = cand; }
    }
  }
  if (!g) { g = { id: forced || null, forced: !!forced, posts: [] }; groups.push(g); if (forced) byId.set(forced, g); }
  g.posts.push(post);
}

const usedSlugs = new Set();
const reviews = groups.map((g) => {
  g.posts.sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
  const primary = g.posts[0];
  const ovById = (g.id && overrides.reviews?.[g.id]) || {};
  const title = ovById.title || cleanTitle(primary.title) || cleanTitle(g.posts.find((x) => cleanTitle(x.title))?.title) || ovById.product || 'Untitled review';
  let slug = g.id || slugify(ovById.product || title);
  while (usedSlugs.has(slug)) slug += '-' + (usedSlugs.size + 1);
  usedSlugs.add(slug);
  // Overrides can also be keyed by the review's slug (its page address).
  const ov = { ...(overrides.reviews?.[slug] || {}), ...ovById };
  const description = g.posts.map((x) => x.description || '').sort((a, b) => b.length - a.length)[0] || '';
  const productUrl = ov.productUrl || g.posts.map((x) => productLink(x.description)).find(Boolean) || null;
  const published = g.posts.map((x) => x.publishedAt).sort()[0];
  const platforms = g.posts.map((x) => ({
    platform: x.platform, url: x.url, embedUrl: x.embedUrl, vertical: x.vertical !== false,
    views: x.stats.views ?? 0, likes: x.stats.likes, comments: x.stats.comments, shares: x.stats.shares,
    week: weekGain(x.key, x, 1), weekLikes: weekGain(x.key, x, 2), weekComments: weekGain(x.key, x, 3),
    publishedAt: x.publishedAt, durationSec: x.durationSec, title: x.title, thumb: x.thumb, thumbVertical: x.thumbVertical,
  }));
  const weekVals = platforms.map((x) => x.week).filter((x) => x != null);
  const tt = g.posts.find((x) => x.platform === 'tiktok' && x.thumb);
  const yt = g.posts.find((x) => x.platform === 'youtube');
  const thumb = ov.thumb || tt?.thumb || yt?.thumbVertical || yt?.thumbWide || g.posts.find((x) => x.thumb)?.thumb || null;
  const thumbFallback = yt?.thumbVertical && thumb === yt.thumbVertical ? (yt.thumbWide || yt.thumb) : null;
  const wide = !!yt && !ov.thumb && !tt?.thumb && !yt.thumbVertical;
  return {
    slug, title, description, productUrl, product: ov.product || null, published,
    isNew: (NOW - new Date(published)) / 3600000 <= 48,
    durationSec: g.posts.find((x) => x.durationSec)?.durationSec || null,
    thumb, thumbFallback, wide, tint: tintFor(slug), art: ov.product || title.split(/[:?.!]/)[0],
    platforms,
    views: sum(platforms.map((x) => x.views)),
    likes: platforms.some((x) => x.likes != null) ? sum(platforms.map((x) => x.likes)) : null,
    comments: platforms.some((x) => x.comments != null) ? sum(platforms.map((x) => x.comments)) : null,
    shares: platforms.some((x) => x.shares != null) ? sum(platforms.map((x) => x.shares)) : null,
    week: weekVals.length ? sum(weekVals) : null,
    weekLikes: sum(platforms.map((x) => x.weekLikes)), weekComments: sum(platforms.map((x) => x.weekComments)),
    hidden: !!ov.hidden,
    // noindex: stays on the home page, but its own page is kept out of Google (non-review posts).
    noindex: !!ov.noindex,
  };
}).filter((r) => !r.hidden).sort((a, b) => b.published.localeCompare(a.published));

const totals = {
  reviews: reviews.length,
  reviewsWeek: reviews.filter((r) => (NOW - new Date(r.published)) / 86400000 <= 7).length,
  views: sum(reviews.map((r) => r.views)), likes: sum(reviews.map((r) => r.likes)), comments: sum(reviews.map((r) => r.comments)),
  hasWeek: reviews.some((r) => r.week != null),
  viewsWeek: sum(reviews.map((r) => r.week)), likesWeek: sum(reviews.map((r) => r.weekLikes)), commentsWeek: sum(reviews.map((r) => r.weekComments)),
};
const updatedLabel = meta.updated ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(meta.updated)) + ' CT' : null;

// ---------- shared chrome ----------
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap">';
const enabledPlatforms = PLATFORM_ORDER.filter((k) => cfg.platforms[k].enabled);
const follower = (k) => { const c = channels[k]; return c?.followers != null ? `${compact(c.followers)} ${c.followerLabel || 'followers'}` : cfg.platforms[k].handle; };

function header(home) {
  const h = home ? '' : '/';
  return `<header class="site-header"><div class="wrap">
  <a class="rr-wordmark" href="/" aria-label="${esc(cfg.name)} home">Rob's <span class="rr-mark">Revues</span></a>
  <nav aria-label="Site">
    <a class="rr-btn rr-btn--ghost rr-btn--sm" href="${h}#reviews">Reviews</a>
    <a class="rr-btn rr-btn--ghost rr-btn--sm" href="${h}#about">About</a>
    ${enabledPlatforms.map((k) => `<a class="rr-btn rr-btn--secondary rr-btn--sm platform-btn" href="${esc(cfg.platforms[k].url)}" rel="me noopener" target="_blank"><span class="rr-dot rr-dot--${k}"></span>${pname(k)}</a>`).join('\n    ')}
  </nav>
</div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="wrap">
  <a class="rr-wordmark" href="/">Rob's <span class="rr-mark">Revues</span></a>
  <p class="rr-disclosure">As an Amazon Associate I earn from qualifying purchases. Product links on this site are affiliate links.</p>
  <p class="small">${updatedLabel ? `Numbers updated ${esc(updatedLabel)} · ` : ''}© ${NOW.getFullYear()} ${esc(cfg.name)} · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></p>
</div></footer>`;
}

const orgLd = {
  '@type': 'Organization', '@id': SITE + '/#org', name: cfg.name, url: SITE + '/',
  logo: SITE + '/icon-512.png', founder: { '@type': 'Person', '@id': SITE + '/#rob', name: cfg.author },
  sameAs: enabledPlatforms.map((k) => cfg.platforms[k].url),
};
const personLd = { '@type': 'Person', '@id': SITE + '/#rob', name: cfg.author, url: SITE + '/', sameAs: enabledPlatforms.map((k) => cfg.platforms[k].url) };

function doc({ title, description, path, ld, body, ogImage, ogType = 'website', extraHead = '' }) {
  const url = SITE + path;
  const img = ogImage || SITE + '/og.png';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#f3f4f1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1113" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${FONTS}
<style>${css}</style>
${extraHead}
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': ld }).replace(/</g, '\\u003c')}</script>
</head>
<body>
${body}
</body>
</html>
`;
}

// ---------- home ----------
function card(r, i) {
  const q = [r.title, r.product, r.description.slice(0, 300)].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ');
  const load = i < 4 ? 'fetchpriority="high"' : 'loading="lazy"';
  const img = !r.thumb
    ? `<span class="rr-thumb__art" style="background:${r.tint}">${esc(r.art)}</span>`
    : r.wide
      ? `<img class="bg" src="${esc(r.thumb)}" alt="" aria-hidden="true" ${load} decoding="async"><img class="fit" src="${esc(r.thumb)}" alt="" width="640" height="360" ${load} decoding="async">`
      : `<img src="${esc(r.thumb)}" alt="" width="360" height="640" ${load} decoding="async"${r.thumbFallback ? ` data-fallback="${esc(r.thumbFallback)}"` : ''}>`;
  return `<article class="rr-card" data-slug="${r.slug}" data-platforms="${r.platforms.map((x) => x.platform).join(' ')}" data-date="${Date.parse(r.published)}" data-views="${r.views}" data-likes="${r.likes ?? 0}" data-week="${r.week ?? 0}" data-q="${esc(q)}">
  <a class="rr-thumb${r.wide && r.thumb ? ' rr-thumb--wide' : ''}" href="/reviews/${r.slug}/" data-open="${r.slug}" aria-label="${esc(r.title)}">${img}${r.isNew ? '<span class="rr-thumb__new">New</span>' : ''}${r.durationSec ? `<span class="rr-thumb__dur">${clock(r.durationSec)}</span>` : ''}<span class="rr-thumb__views">${icon.play}${compact(r.views)}<span class="sr-only"> views</span></span></a>
  <h3 class="rr-card__title"><a href="/reviews/${r.slug}/" data-open="${r.slug}">${esc(r.title)}</a></h3>
  <div class="rr-card__meta">${r.platforms.map((x) => `<span class="rr-chip rr-chip--bare rr-chip--${x.platform}" title="${pname(x.platform)}">${pshort(x.platform)}</span>`).join('')}<time datetime="${r.published}">${fmtDate(r.published)}</time></div>
  <div class="rr-card__stats">${r.likes != null ? `<span>${icon.heart}${statNum(r.likes)}<span class="sr-only"> likes</span></span>` : ''}${r.comments != null ? `<span>${icon.comment}${statNum(r.comments)}<span class="sr-only"> comments</span></span>` : ''}${r.week ? `<span class="rr-delta">+${compact(r.week)} wk</span>` : ''}</div>
</article>`;
}

function stat(label, value, delta) {
  return `<div class="rr-stat"><span class="rr-label">${label}</span><span class="rr-stat__value">${value}</span><span class="rr-stat__delta">${delta || ''}</span></div>`;
}

const sheetData = reviews.map((r) => ({
  slug: r.slug, title: r.title, date: fullDate(r.published), productUrl: r.productUrl,
  description: r.description.replace(/https?:\/\/\S+/g, '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 700),
  thumb: r.thumb, thumbFallback: r.thumbFallback, wide: r.wide,
  platforms: r.platforms.map((x) => ({ platform: x.platform, name: pname(x.platform), url: x.url, embedUrl: x.embedUrl, vertical: x.vertical, views: x.views, likes: x.likes, comments: x.comments, week: x.week })),
  views: r.views, likes: r.likes, comments: r.comments, week: r.week,
}));

function homeBody({ embeds }) {
  const wk = (n, label = 'this week') => (totals.hasWeek && n ? `+${n < 10000 ? full(n) : compact(n)} ${label}` : '');
  const grid = reviews.length
    ? `<div class="grid" id="grid">\n${reviews.map(card).join('\n')}\n</div>
<p class="empty" id="no-results" hidden><strong>No reviews match that.</strong>Try a different word or platform.</p>
<div class="more"><button class="rr-btn rr-btn--secondary" type="button" id="more" hidden>Show more</button></div>`
    : `<p class="empty"><strong>The first reviews are on their way.</strong>Follow along on ${enabledPlatforms.map(pname).join(' and ')} in the meantime.</p>`;
  return `${header(true)}
<main>
<section class="hero"><div class="wrap">
  <div class="hero__main">
    <span class="rr-label">${esc(cfg.eyebrow)}</span>
    <h1>Rob's <span class="rr-mark">Revues</span></h1>
    <p class="hero__lede">${esc(cfg.lede)}</p>
    <div class="hero__platforms">
      ${enabledPlatforms.map((k) => `<a class="rr-platform" href="${esc(cfg.platforms[k].url)}" rel="me noopener" target="_blank"><span class="rr-dot rr-dot--${k}"></span><span style="min-width:0"><span class="rr-platform__name">${pname(k)}</span><span class="rr-platform__meta">${esc(follower(k))}</span></span></a>`).join('\n      ')}
    </div>
  </div>
  <div class="stats" aria-label="Channel totals">
    ${stat('Reviews', full(totals.reviews), totals.reviewsWeek ? `+${totals.reviewsWeek} this week` : '')}
    ${stat('Total views', statNum(totals.views), wk(totals.viewsWeek))}
    ${stat('Likes', statNum(totals.likes), wk(totals.likesWeek))}
    ${stat('Comments', statNum(totals.comments), wk(totals.commentsWeek))}
  </div>
</div></section>

<section class="reviews" id="reviews" aria-labelledby="reviews-title">
  <div class="toolbar"><div class="wrap">
    <h2 id="reviews-title">All reviews <small>${totals.reviews}</small></h2>
    <label class="rr-field search" for="q">${icon.search}<span class="sr-only">Search reviews</span><input id="q" type="search" placeholder="Search ${totals.reviews} reviews" autocomplete="off"></label>
    <div class="controls">
      <div class="rr-seg" role="group" aria-label="Platform">
        <button type="button" data-platform="all" aria-pressed="true">All</button>
        ${enabledPlatforms.map((k) => `<button type="button" data-platform="${k}" aria-pressed="false">${pname(k)}</button>`).join('\n        ')}
      </div>
      <label class="rr-field" for="sort"><span class="rr-label">Sort</span><select id="sort">
        <option value="new">Newest</option><option value="views">Most viewed</option><option value="week">Hot this week</option><option value="likes">Most liked</option>
      </select></label>
    </div>
  </div></div>
  <div class="wrap">
${grid}
  </div>
</section>

<section class="about" id="about"><div class="wrap">
  <div class="about__head"><span class="rr-label">About</span><h2>${esc(cfg.aboutTitle)}</h2></div>
  <div class="about__body">
    <p>${esc(cfg.about)}</p>
    <div class="row">${enabledPlatforms.map((k) => `<a class="rr-btn rr-btn--secondary" href="${esc(cfg.platforms[k].url)}" rel="me noopener" target="_blank">Follow on ${pname(k)}</a>`).join('')}</div>
  </div>
</div></section>
</main>
${footer()}

<dialog class="sheet" id="sheet" aria-labelledby="sheet-title"><div class="sheet__inner" id="sheet-inner"></div></dialog>
<script type="application/json" id="rr-data">${JSON.stringify({ embeds, size: cfg.pageSize, initial: cfg.initialVisible, reviews: sheetData }).replace(/</g, '\\u003c')}</script>
<script>${js}</script>`;
}

const homeLd = [
  { '@type': 'WebSite', '@id': SITE + '/#site', url: SITE + '/', name: cfg.name, description: cfg.description, publisher: { '@id': SITE + '/#org' } },
  orgLd, personLd,
  { '@type': 'ItemList', name: `${cfg.name}: all reviews`, itemListElement: reviews.filter((r) => !r.noindex).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/reviews/${r.slug}/`, name: r.title })) },
];
const homeTitle = `${cfg.name} · Honest product reviews on ${enabledPlatforms.map(pname).join(' and ')}`;

// ---------- review pages ----------
const absThumb = (r) => { const t = r.thumbFallback || r.thumb; return t ? (t.startsWith('http') ? t : SITE + t) : SITE + '/og.png'; };
function statsTable(r) {
  const cell = (n) => (n == null ? '—' : full(n));
  const rows = r.platforms.map((x) => `<tr><td><span class="rr-chip rr-chip--bare rr-chip--${x.platform}">${pname(x.platform)}</span></td><td>${cell(x.views)}</td><td>${cell(x.likes)}</td><td>${cell(x.comments)}</td><td class="up">${x.week ? '+' + compact(x.week) : '—'}</td></tr>`).join('');
  const foot = r.platforms.length > 1 ? `<tfoot><tr><td>Total</td><td>${cell(r.views)}</td><td>${cell(r.likes)}</td><td>${cell(r.comments)}</td><td class="up">${r.week ? '+' + compact(r.week) : '—'}</td></tr></tfoot>` : '';
  return `<div class="table-wrap"><table class="rr-table"><thead><tr><th scope="col">Platform</th><th scope="col">Views</th><th scope="col">Likes</th><th scope="col">Comments</th><th scope="col">7 days</th></tr></thead><tbody>${rows}</tbody>${foot}</table></div>`;
}
function reviewPage(r) {
  const first = r.platforms[0];
  const desc = sheetData.find((s) => s.slug === r.slug).description;
  const metaDesc = (desc.replace(/\s+/g, ' ').slice(0, 150) || `${cfg.name} reviews ${r.title}.`).trim();
  const thumb = r.thumb ? `<img src="${esc(r.thumb)}" alt=""${r.thumbFallback ? ` data-fallback="${esc(r.thumbFallback)}"` : ''}>` : `<span class="rr-thumb__art" style="background:${r.tint}">${esc(r.art)}</span>`;
  const body = `${header(false)}
<main class="page"><div class="wrap">
  <a class="page__crumb" href="/#reviews">${icon.back}All reviews</a>
  <div class="page__grid">
    <div class="page__media">
      <div class="player${first.vertical ? '' : ' player--wide'}" data-embed="${esc(cfg.embedPlayers ? first.embedUrl || '' : '')}" data-href="${esc(first.url)}">${thumb}<button class="player__play" type="button" aria-label="Play video">${icon.play}</button></div>
    </div>
    <article class="page__body">
      <span class="rr-label">Review · <time datetime="${r.published}">${fullDate(r.published)}</time></span>
      <h1>${esc(r.title)}</h1>
      ${statsTable(r)}
      ${r.productUrl ? `<div style="display:flex;flex-direction:column;gap:8px;max-width:360px"><a class="rr-btn rr-btn--primary" href="${esc(r.productUrl)}" rel="sponsored nofollow noopener" target="_blank">Check price on Amazon${icon.out}</a><p class="rr-disclosure" style="margin:0">Affiliate link. I may earn a commission.</p></div>` : ''}
      ${desc ? `<p class="sheet__desc" style="max-height:none">${esc(desc)}</p>` : ''}
      <div class="row">${r.platforms.map((x) => `<a class="rr-btn rr-btn--secondary rr-btn--sm" href="${esc(x.url)}" target="_blank" rel="noopener">Watch on ${pname(x.platform)}</a>`).join('')}</div>
    </article>
  </div>
</div></main>
${footer()}
<script>${js}</script>`;
  const ld = [
    orgLd,
    ...r.platforms.map((x, i) => ({
      '@type': 'VideoObject', '@id': `${SITE}/reviews/${r.slug}/#video-${x.platform}`,
      name: i === 0 ? r.title : `${r.title} (${pname(x.platform)})`,
      description: metaDesc, thumbnailUrl: [absThumb(r)], uploadDate: x.publishedAt,
      ...(x.durationSec ? { duration: isoDuration(x.durationSec) } : {}),
      ...(x.embedUrl ? { embedUrl: x.embedUrl.split('?')[0] } : {}), url: x.url,
      author: { '@id': SITE + '/#rob' }, publisher: { '@id': SITE + '/#org' },
      interactionStatistic: [
        { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: x.views },
        ...(x.likes != null ? [{ '@type': 'InteractionCounter', interactionType: { '@type': 'LikeAction' }, userInteractionCount: x.likes }] : []),
        ...(x.comments != null ? [{ '@type': 'InteractionCounter', interactionType: { '@type': 'CommentAction' }, userInteractionCount: x.comments }] : []),
      ],
    })),
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: cfg.name, item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: r.title, item: `${SITE}/reviews/${r.slug}/` },
    ] },
  ];
  return doc({ title: `${r.title} · ${cfg.name}`, description: metaDesc, path: `/reviews/${r.slug}/`, ld, body, ogImage: absThumb(r), ogType: 'video.other', extraHead: r.noindex ? '<meta name="robots" content="noindex, follow">' : '' });
}

// ---------- legal pages ----------
const contact = cfg.contactEmail ? `email <strong>${esc(cfg.contactEmail)}</strong>` : 'send a message through YouTube or TikTok (@robsrevues)';
const prosePage = (path, title, html) => doc({
  title: `${title} · ${cfg.name}`, description: `${title} for ${cfg.name}.`, path, ld: [orgLd],
  body: `${header(false)}\n<main class="page"><div class="wrap prose">\n<a class="page__crumb" href="/">${icon.back}Home</a>\n<h1>${title}</h1>\n<p class="rr-label">Last updated ${fullDate(NOW.toISOString())}</p>\n${html}\n</div></main>\n${footer()}`,
});
const privacyHtml = `
<p>${esc(cfg.name)} (robsrevues.com) is run by ${esc(cfg.author)}. This page explains what information the site and its connected apps use.</p>
<h2>What this site collects</h2>
<p>Nothing from you directly. There are no accounts, forms, comments or tracking cookies on robsrevues.com. Our host may keep standard server logs (such as IP address and browser type) for security and reliability.</p>
<h2>Embedded videos</h2>
<p>When you press play, the video loads from YouTube or TikTok, and those services handle data under their own privacy policies. YouTube videos use YouTube's privacy-enhanced mode.</p>
<h2>Affiliate links</h2>
<p>Some links go to Amazon. As an Amazon Associate I earn from qualifying purchases. Amazon may set cookies when you follow those links, under Amazon's privacy notice.</p>
<h2>Connected platform data</h2>
<p>This site uses the YouTube Data API and TikTok's developer APIs to show public information about videos published by @robsrevues: titles, descriptions, thumbnails, publish dates and counts of views, likes, comments and shares. Access to the TikTok account is authorized only by the account owner. The data is used solely to display Rob's own videos and their performance on this site. It is not sold or shared with anyone, and no information about viewers or other TikTok or YouTube users is collected. YouTube data is handled under the <a href="https://www.youtube.com/t/terms" rel="noopener">YouTube Terms of Service</a> and <a href="https://policies.google.com/privacy" rel="noopener">Google Privacy Policy</a>.</p>
<p>Daily snapshots of those public counts are kept so the site can show growth over time. The account owner can revoke access at any time in TikTok's settings, and the stored data is deleted on request.</p>
<h2>Children</h2>
<p>The site does not knowingly collect information from anyone, including children under 13.</p>
<h2>Contact</h2>
<p>Questions or deletion requests: ${contact}.</p>`;
const termsHtml = `
<p>By using robsrevues.com you agree to these terms.</p>
<h2>Reviews are opinions</h2>
<p>Reviews on this site are ${esc(cfg.author)}'s honest opinions based on personal use. They are not professional advice. Prices, availability and products change, so check the seller's page before you buy.</p>
<h2>Affiliate disclosure</h2>
<p>Some product links are affiliate links. As an Amazon Associate I earn from qualifying purchases, at no extra cost to you. Earning a commission doesn't change what I say about a product.</p>
<h2>Content</h2>
<p>The videos, text and design on this site belong to ${esc(cfg.name)} unless noted. Product names and trademarks belong to their owners. Videos are hosted by YouTube and TikTok and are subject to their terms.</p>
<h2>Platform data</h2>
<p>Video statistics are pulled from YouTube and TikTok and may lag behind the platforms by up to a day.</p>
<h2>No warranty</h2>
<p>The site is provided as is. ${esc(cfg.name)} isn't liable for purchases made from third-party sellers or for the content of external sites.</p>
<h2>Contact</h2>
<p>${contact[0].toUpperCase() + contact.slice(1)}.</p>`;

// ---------- sitemap ----------
function sitemap() {
  const x = (s) => esc(s);
  const urls = [
    `<url><loc>${SITE}/</loc><lastmod>${DAY}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...reviews.filter((r) => !r.noindex).map((r) => {
      const v = r.platforms[0];
      const video = v.embedUrl ? `<video:video><video:thumbnail_loc>${x(absThumb(r))}</video:thumbnail_loc><video:title>${x(r.title)}</video:title><video:description>${x((r.description.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim() || r.title).slice(0, 2000))}</video:description><video:player_loc>${x(v.embedUrl.split('?')[0])}</video:player_loc>${v.durationSec ? `<video:duration>${Math.round(v.durationSec)}</video:duration>` : ''}<video:view_count>${r.views}</video:view_count><video:publication_date>${x(r.published)}</video:publication_date><video:family_friendly>yes</video:family_friendly></video:video>` : '';
      return `<url><loc>${SITE}/reviews/${r.slug}/</loc><lastmod>${DAY}</lastmod>${video}</url>`;
    }),
    `<url><loc>${SITE}/privacy/</loc></url>`,
    `<url><loc>${SITE}/terms/</loc></url>`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------- write ----------
async function put(rel, content) { const f = join(OUT, rel); await mkdir(join(f, '..'), { recursive: true }); await writeFile(f, content); }

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(p('public'), OUT, { recursive: true });
await put('index.html', doc({ title: homeTitle, description: cfg.description, path: '/', ld: homeLd, body: homeBody({ embeds: cfg.embedPlayers }) }));
for (const r of reviews) await put(`reviews/${r.slug}/index.html`, reviewPage(r));
await put('privacy/index.html', prosePage('/privacy/', 'Privacy policy', privacyHtml));
await put('terms/index.html', prosePage('/terms/', 'Terms of service', termsHtml));
await put('404.html', doc({ title: `Not found · ${cfg.name}`, description: cfg.description, path: '/404.html', ld: [orgLd], body: `${header(false)}<main class="page"><div class="wrap prose"><h1>That page isn't here.</h1><p>It may have moved. <a href="/">See every review</a>.</p></div></main>${footer()}` }));
await put('tiktok-callback/index.html', doc({
  title: `TikTok connected · ${cfg.name}`, description: 'TikTok login callback.', path: '/tiktok-callback/', ld: [orgLd],
  extraHead: '<meta name="robots" content="noindex">',
  body: `${header(false)}<main class="page"><div class="wrap prose"><h1>Almost connected</h1>
<p id="msg">Copy this code and run <code>node scripts/tiktok-auth.mjs &lt;code&gt;</code> within a few minutes.</p>
<p><code id="code" style="font:500 14px/22px var(--font-mono);word-break:break-all;user-select:all"></code></p></div></main>${footer()}
<script>(function(){var q=new URLSearchParams(location.search);var c=q.get('code');var e=q.get('error_description')||q.get('error');document.getElementById('code').textContent=c||'';if(!c)document.getElementById('msg').textContent=e?('TikTok returned an error: '+e):'No code found. Start the login again from the script.';})();</script>`,
}));
await put('sitemap.xml', sitemap());
await put('robots.txt', `User-agent: *\nAllow: /\nDisallow: /tiktok-callback/\n\nSitemap: ${SITE}/sitemap.xml\n`);
await put('CNAME', new URL(SITE).hostname + '\n');

console.log(`Built ${reviews.length} reviews from ${posts.length} posts into dist/${SAMPLE ? ' (SAMPLE DATA)' : ''}`);

if (PREVIEW) {
  const banner = SAMPLE ? '<div style="background:var(--marker);color:var(--marker-ink);font:600 13px/18px var(--font-sans);padding:8px 16px;text-align:center">Preview with sample videos and numbers. The live site shows your real ones.</div>' : '';
  const html = `<title>Rob's Revues</title>
<meta name="claude:viewport-fit-sides" content="cover">
${FONTS}
<style>${css}</style>
${banner}
${homeBody({ embeds: false })}`;
  await mkdir(p('dist-preview'), { recursive: true });
  await writeFile(p('dist-preview/index.html'), html);
  console.log('Preview written to dist-preview/index.html');
}
