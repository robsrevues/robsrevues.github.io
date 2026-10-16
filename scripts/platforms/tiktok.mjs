// TikTok Display API v2 (Login Kit + scopes user.info.basic, user.info.stats, video.list).
// Needs an approved TikTok developer app and a refresh token from logging in once (see README).
import { mkdir, writeFile, access } from 'node:fs/promises';
import { p } from '../lib.mjs';

const OPEN = 'https://open.tiktokapis.com/v2/';
const FIELDS = 'id,title,video_description,create_time,cover_image_url,share_url,duration,height,width,like_count,comment_count,share_count,view_count';

async function refresh({ clientKey, clientSecret, refreshToken }) {
  const res = await fetch(OPEN + 'oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`TikTok token refresh failed: ${JSON.stringify(json).slice(0, 300)}`);
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    console.warn('::warning::TikTok issued a new refresh token. Update the TIKTOK_REFRESH_TOKEN secret before the old one expires.');
  }
  return json.access_token;
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }

export async function fetchTikTok({ clientKey, clientSecret, refreshToken, handle }) {
  if (!clientKey || !clientSecret || !refreshToken) throw new Error('TikTok secrets are not set');
  const token = await refresh({ clientKey, clientSecret, refreshToken });
  const auth = { Authorization: `Bearer ${token}` };

  const userRes = await fetch(OPEN + 'user/info/?fields=display_name,follower_count,likes_count,video_count', { headers: auth });
  const user = (await userRes.json()).data?.user || {};

  const posts = [];
  let cursor;
  for (let page = 0; page < 50; page++) {
    const res = await fetch(OPEN + 'video/list/?fields=' + FIELDS, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
    });
    const json = await res.json();
    if (json.error && json.error.code !== 'ok') throw new Error(`TikTok video list failed: ${json.error.code} ${json.error.message}`);
    for (const v of json.data?.videos || []) {
      // Cover URLs expire after ~6 hours, so keep our own copy.
      const thumbPath = `/thumbs/tiktok/${v.id}.jpg`;
      const file = p('public', thumbPath);
      if (v.cover_image_url && !(await exists(file))) {
        try {
          const img = await fetch(v.cover_image_url);
          if (img.ok) {
            await mkdir(p('public/thumbs/tiktok'), { recursive: true });
            await writeFile(file, Buffer.from(await img.arrayBuffer()));
          }
        } catch (err) { console.warn(`Could not save TikTok cover ${v.id}: ${err.message}`); }
      }
      const desc = v.video_description || '';
      posts.push({
        key: `tiktok:${v.id}`,
        platform: 'tiktok',
        id: v.id,
        url: v.share_url || `https://www.tiktok.com/${handle}/video/${v.id}`,
        embedUrl: `https://www.tiktok.com/embed/v2/${v.id}`,
        title: v.title || desc.split('\n')[0],
        description: desc,
        publishedAt: new Date(v.create_time * 1000).toISOString(),
        durationSec: v.duration || null,
        thumb: (await exists(file)) ? thumbPath : null,
        vertical: !v.width || v.height >= v.width,
        stats: { views: v.view_count ?? 0, likes: v.like_count ?? null, comments: v.comment_count ?? null, shares: v.share_count ?? null },
      });
    }
    if (!json.data?.has_more) break;
    cursor = json.data.cursor;
  }

  return {
    channel: {
      platform: 'tiktok',
      name: user.display_name || handle,
      handle,
      url: `https://www.tiktok.com/${handle}`,
      followers: user.follower_count ?? null,
      followerLabel: 'followers',
    },
    posts,
  };
}
