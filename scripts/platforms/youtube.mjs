// YouTube Data API v3. Needs only an API key (public data). ~3 quota units per 50 videos per run.
import { parseIsoDuration } from '../lib.mjs';

const BASE = 'https://www.googleapis.com/youtube/v3/';

export async function fetchYouTube({ apiKey, handle }) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set');
  const api = async (path, params) => {
    const res = await fetch(BASE + path + '?' + new URLSearchParams({ ...params, key: apiKey }));
    if (!res.ok) throw new Error(`YouTube ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };

  const ch = await api('channels', { part: 'snippet,contentDetails,statistics', forHandle: handle });
  const c = ch.items?.[0];
  if (!c) throw new Error(`No YouTube channel found for ${handle}`);

  const ids = [];
  let pageToken;
  do {
    const page = await api('playlistItems', {
      part: 'contentDetails', maxResults: '50',
      playlistId: c.contentDetails.relatedPlaylists.uploads,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of page.items || []) ids.push(it.contentDetails.videoId);
    pageToken = page.nextPageToken;
  } while (pageToken);

  // A video is a Short only if youtube.com/shorts/<id> serves it directly; regular
  // videos redirect to /watch. Only checked for videos 3 minutes or shorter.
  const isShort = async (id) => {
    try {
      const r = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual' });
      return r.status === 200;
    } catch { return false; }
  };

  const posts = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = await api('videos', { part: 'snippet,statistics,contentDetails,status', id: ids.slice(i, i + 50).join(',') });
    for (const v of batch.items || []) {
      if (v.status?.privacyStatus !== 'public') continue;
      if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none') continue;
      const durationSec = parseIsoDuration(v.contentDetails.duration);
      const t = v.snippet.thumbnails || {};
      const best = t.maxres || t.standard || t.high || t.medium || t.default || {};
      const short = durationSec <= 180 && (await isShort(v.id));
      posts.push({
        key: `youtube:${v.id}`,
        platform: 'youtube',
        id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1`,
        title: v.snippet.title,
        description: v.snippet.description || '',
        publishedAt: v.snippet.publishedAt,
        durationSec,
        // Shorts get a true vertical thumbnail; landscape videos use the 16:9 one with no letterbox bars.
        thumbVertical: short ? `https://i.ytimg.com/vi/${v.id}/oardefault.jpg` : null,
        thumbWide: (t.maxres && t.maxres.url) || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        thumb: best.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        vertical: short,
        stats: {
          views: +v.statistics.viewCount || 0,
          likes: v.statistics.likeCount != null ? +v.statistics.likeCount : null,
          comments: v.statistics.commentCount != null ? +v.statistics.commentCount : null,
          shares: null,
        },
      });
    }
  }

  return {
    channel: {
      platform: 'youtube',
      name: c.snippet.title,
      handle,
      url: `https://www.youtube.com/${handle}`,
      followers: c.statistics.hiddenSubscriberCount ? null : +c.statistics.subscriberCount,
      followerLabel: 'subs',
    },
    posts,
  };
}
