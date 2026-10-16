// Pull the latest posts + stats from every connected platform, merge into data/,
// and record today's numbers in data/history.json so growth can be shown over time.
import { readJSON, writeJSON, p, today } from './lib.mjs';
import { fetchYouTube } from './platforms/youtube.mjs';
import { fetchTikTok } from './platforms/tiktok.mjs';
import { fetchManual } from './platforms/manual.mjs';

const config = await readJSON(p('site.config.json'));
const env = process.env;
const day = today();

const posts = Object.fromEntries((await readJSON(p('data/posts.json'), [])).map((x) => [x.key, x]));
const history = await readJSON(p('data/history.json'), {});
const channels = await readJSON(p('data/channels.json'), {});

const sources = [];
if (config.platforms.youtube?.enabled && env.YOUTUBE_API_KEY) {
  sources.push(['youtube', () => fetchYouTube({ apiKey: env.YOUTUBE_API_KEY, handle: config.platforms.youtube.handle })]);
}
if (config.platforms.tiktok?.enabled && env.TIKTOK_CLIENT_KEY && env.TIKTOK_REFRESH_TOKEN) {
  sources.push(['tiktok', () => fetchTikTok({ clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET, refreshToken: env.TIKTOK_REFRESH_TOKEN, handle: config.platforms.tiktok.handle })]);
}
const apiPlatforms = new Set(sources.map(([name]) => name));

let failures = 0;
const seen = new Set();
function upsert(post) {
  const prev = posts[post.key] || {};
  posts[post.key] = { ...prev, ...post, firstSeen: prev.firstSeen || day, lastSeen: day };
  seen.add(post.key);
  const s = post.stats;
  const row = [day, s.views ?? null, s.likes ?? null, s.comments ?? null, s.shares ?? null];
  const h = (history[post.key] ||= []);
  if (h.length && h[h.length - 1][0] === day) h[h.length - 1] = row;
  else h.push(row);
}

for (const [name, run] of sources) {
  try {
    const { channel, posts: list } = await run();
    channels[name] = { ...channel, updated: day };
    list.forEach(upsert);
    console.log(`${name}: ${list.length} posts`);
  } catch (err) {
    failures++;
    console.error(`::error::${name}: ${err.message}`);
  }
}

// Hand-entered posts never overwrite a platform that has a working API connection.
const manual = await fetchManual();
for (const post of manual.posts) if (!apiPlatforms.has(post.platform)) upsert(post);
for (const c of manual.channels) if (!apiPlatforms.has(c.platform)) channels[c.platform] = { ...channels[c.platform], ...c, updated: day };
if (manual.posts.length) console.log(`manual: ${manual.posts.length} posts`);

// A post an API stops returning was deleted or made private: mark it so the build hides it.
for (const [key, post] of Object.entries(posts)) {
  const platform = key.split(':')[0];
  if ((apiPlatforms.has(platform) || post.manual) && !seen.has(key) && !failures) post.removed = true;
  else if (seen.has(key)) delete post.removed;
}

await writeJSON(p('data/posts.json'), Object.values(posts).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
await writeJSON(p('data/history.json'), history);
await writeJSON(p('data/channels.json'), channels);
await writeJSON(p('data/meta.json'), { updated: new Date().toISOString() });

if (!sources.length && !manual.posts.length) console.warn('::warning::No platform is connected yet. Add YOUTUBE_API_KEY (and TikTok secrets) to the repo secrets, or add posts to data/manual-posts.json.');
if (failures === sources.length && sources.length) process.exit(1);
