// Writes made-up demo data to data-sample/ so the design can be previewed before any
// platform is connected. Never used by the live build.
import { writeJSON, p, today } from './lib.mjs';

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const NOW = new Date('2026-10-16T11:00:00Z');

const ideas = [
  ['This $35 karaoke mic survived family karaoke night', 58, 'yt+tt'],
  ['Is a $40 drum pad worth it for a garage band?', 102, 'yt'],
  ['Cordless stick vacuum vs. a week of kids and a dog', 130, 'yt+tt'],
  ['Kids’ walkie-talkies: how far do they really reach?', 47, 'tt'],
  ['Smart plug 4-pack: setup in under five minutes?', 65, 'yt+tt'],
  ['Magnetic car mount vs. the worst pothole in town', 34, 'tt'],
  ['A 10-watt practice amp for a basement rock band', 88, 'yt+tt'],
  ['Does a $25 ring light fix bad lighting? Honest test', 72, 'yt+tt'],
  ['Volume-limited kids’ headphones after a road trip', 52, 'tt'],
  ['Small air fryer: worth the counter space?', 154, 'yt'],
  ['Bluetooth meat thermometer on a Saturday cookout', 61, 'yt+tt'],
  ['Cheap label maker that the whole house fought over', 39, 'tt'],
  ['Portable power station: one weekend camping', 176, 'yt'],
  ['Clip-on guitar tuner showdown: $8 vs $25', 66, 'yt+tt'],
  ['Robot window cleaner — gimmick or genius?', 81, 'yt+tt'],
  ['The dad joke I promised (it’s about a stapler)', 22, 'tt'],
  ['Wireless lavalier mics for under $30', 94, 'yt+tt'],
  ['Kids’ smartwatch with GPS: a week on the bus route', 118, 'yt'],
  ['Collapsible water bottle at soccer practice', 37, 'tt'],
  ['Desk fan that claims to be whisper quiet', 45, 'yt+tt'],
  ['Wireless karaoke speaker with lights: too much?', 57, 'yt+tt'],
  ['Heated blanket on the first cold night', 49, 'tt'],
  ['A $20 dash cam: can you read the plates?', 109, 'yt'],
  ['Phone tripod with remote: one-person filming test', 63, 'yt+tt'],
];

const posts = [], history = {};
ideas.forEach(([title, dur, plats], i) => {
  const published = new Date(NOW.getTime() - (i * 0.95 + 0.2) * 86400000);
  const ageDays = (NOW - published) / 86400000;
  for (const platform of plats.split('+').map((x) => (x === 'yt' ? 'youtube' : 'tiktok'))) {
    const id = platform === 'youtube' ? 'sample' + i.toString(36).padStart(5, '0') : String(7420000000000000000n + BigInt(i * 7919));
    const scale = (platform === 'tiktok' ? 1.6 : 1) * (0.4 + rand() * 2.2) * (i === 2 ? 3 : 1);
    const final = Math.round(9000 * scale);
    const curve = (d) => Math.round(final * (1 - Math.exp(-d / 3)));
    const key = `${platform}:${id}`;
    const h = [];
    for (let d = Math.max(0, Math.floor(ageDays) - 20); d <= Math.floor(ageDays); d++) {
      const date = today(new Date(published.getTime() + d * 86400000));
      const v = curve(d + 0.5);
      h.push([date, v, Math.round(v * 0.055), Math.round(v * 0.0045), platform === 'tiktok' ? Math.round(v * 0.006) : null]);
    }
    history[key] = h;
    const last = h[h.length - 1];
    posts.push({
      key, platform, id,
      url: platform === 'youtube' ? `https://www.youtube.com/@robsrevues` : `https://www.tiktok.com/@robsrevues`,
      embedUrl: null,
      title: platform === 'tiktok' ? title + ' #review #amazonfinds' : title,
      description: 'Sample description. I used it around the house for a week with my family. Here is what held up and what didn’t.\n\nGet it here: https://amzn.to/example',
      publishedAt: published.toISOString(), durationSec: dur, thumb: null, vertical: true,
      stats: { views: last[1], likes: last[2], comments: last[3], shares: last[4] },
      firstSeen: h[0][0], lastSeen: today(NOW),
    });
  }
});

await writeJSON(p('data-sample/posts.json'), posts);
await writeJSON(p('data-sample/history.json'), history);
await writeJSON(p('data-sample/channels.json'), {
  youtube: { platform: 'youtube', handle: '@robsrevues', followers: 1840, followerLabel: 'subs' },
  tiktok: { platform: 'tiktok', handle: '@robsrevues', followers: 640, followerLabel: 'followers' },
});
await writeJSON(p('data-sample/meta.json'), { updated: NOW.toISOString(), sample: true });
console.log(`Sample data: ${posts.length} posts`);
