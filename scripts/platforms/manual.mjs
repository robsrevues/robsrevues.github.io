// Posts you enter by hand in data/manual-posts.json: TikTok until its API is approved,
// or any platform without an API (Instagram, Facebook...). Same shape as the API adapters.
import { readJSON, p } from '../lib.mjs';

function idFromUrl(platform, url = '') {
  const m =
    url.match(/\/video\/(\d+)/) || url.match(/[?&]v=([\w-]{6,})/) || url.match(/\/shorts\/([\w-]{6,})/) ||
    url.match(/youtu\.be\/([\w-]{6,})/) || url.match(/\/(?:reel|p)\/([\w-]+)/);
  return m ? m[1] : url.replace(/[^a-z0-9]+/gi, '').slice(-24);
}

export async function fetchManual() {
  const file = await readJSON(p('data/manual-posts.json'), { channels: {}, posts: [] });
  const posts = (file.posts || []).filter((m) => m.platform && m.url).map((m) => {
    const id = m.id || idFromUrl(m.platform, m.url);
    return {
      key: `${m.platform}:${id}`,
      platform: m.platform,
      id,
      url: m.url,
      embedUrl: m.platform === 'tiktok' ? `https://www.tiktok.com/embed/v2/${id}` : m.platform === 'youtube' ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null,
      title: m.title || '',
      description: m.description || '',
      publishedAt: new Date(m.date || Date.now()).toISOString(),
      durationSec: m.durationSec ?? null,
      thumb: m.thumb || null,
      vertical: m.vertical ?? true,
      stats: { views: m.views ?? 0, likes: m.likes ?? null, comments: m.comments ?? null, shares: m.shares ?? null },
      manual: true,
    };
  });
  const channels = Object.entries(file.channels || {}).map(([platform, c]) => ({ platform, ...c }));
  return { channels, posts };
}
