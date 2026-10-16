// Posts you enter by hand in data/manual-posts.json: TikTok until its API is approved,
// or any platform without an API (Instagram, Facebook...). Same shape as the API adapters.
// TikTok covers are downloaded automatically through TikTok's public oEmbed endpoint.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { readJSON, p } from '../lib.mjs';

function idFromUrl(url = '') {
  const m =
    url.match(/\/(?:video|photo)\/(\d+)/) || url.match(/[?&]v=([\w-]{6,})/) || url.match(/\/shorts\/([\w-]{6,})/) ||
    url.match(/youtu\.be\/([\w-]{6,})/) || url.match(/\/(?:reel|p)\/([\w-]+)/);
  return m ? m[1] : url.replace(/[^a-z0-9]+/gi, '').slice(-24);
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }

async function tiktokCover(id, url) {
  const rel = `/thumbs/tiktok/${id}.jpg`;
  const file = p('public', rel);
  if (await exists(file)) return rel;
  try {
    const meta = await (await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url))).json();
    if (!meta.thumbnail_url) return null;
    const img = await fetch(meta.thumbnail_url);
    if (!img.ok) return null;
    await mkdir(p('public/thumbs/tiktok'), { recursive: true });
    await writeFile(file, Buffer.from(await img.arrayBuffer()));
    return rel;
  } catch (err) {
    console.warn(`Could not fetch TikTok cover for ${id}: ${err.message}`);
    return null;
  }
}

export async function fetchManual() {
  const file = await readJSON(p('data/manual-posts.json'), { channels: {}, posts: [] });
  const posts = [];
  for (const m of (file.posts || []).filter((x) => x.platform && x.url)) {
    const id = m.id || idFromUrl(m.url);
    const thumb = m.thumb || (m.platform === 'tiktok' ? await tiktokCover(id, m.url) : null);
    posts.push({
      key: `${m.platform}:${id}`,
      platform: m.platform,
      id,
      url: m.url,
      embedUrl: m.platform === 'tiktok' ? `https://www.tiktok.com/embed/v2/${id}` : m.platform === 'youtube' ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null,
      title: m.title || '',
      description: m.description || '',
      publishedAt: new Date(m.date || Date.now()).toISOString(),
      durationSec: m.durationSec ?? null,
      thumb,
      vertical: m.vertical ?? true,
      stats: { views: m.views ?? 0, likes: m.likes ?? null, comments: m.comments ?? null, shares: m.shares ?? null },
      manual: true,
    });
  }
  const channels = Object.entries(file.channels || {}).map(([platform, c]) => ({ platform, ...c }));
  return { channels, posts };
}
