// One-time TikTok login to get the refresh token the daily job uses.
//   1. TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... node scripts/tiktok-auth.mjs
//      -> prints a link. Open it, log in as @robsrevues, approve.
//   2. TikTok sends you to robsrevues.com/tiktok-callback/, which shows a code. Copy it.
//   3. TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... node scripts/tiktok-auth.mjs <code>
//      -> prints the refresh token. Save it as the TIKTOK_REFRESH_TOKEN repo secret.
import { readJSON, p } from './lib.mjs';

const cfg = await readJSON(p('site.config.json'));
const key = process.env.TIKTOK_CLIENT_KEY, secret = process.env.TIKTOK_CLIENT_SECRET;
if (!key || !secret) { console.error('Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET first.'); process.exit(1); }
const redirect = cfg.url.replace(/\/$/, '') + '/tiktok-callback/';
const code = process.argv[2];

if (!code) {
  const url = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
    client_key: key, response_type: 'code', scope: 'user.info.basic,user.info.stats,video.list',
    redirect_uri: redirect, state: Math.random().toString(36).slice(2),
  });
  console.log('Open this link, log in as ' + cfg.platforms.tiktok.handle + ' and approve:\n\n' + url + '\n');
  console.log('Then run this script again with the code shown on the page.');
} else {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: key, client_secret: secret, code: decodeURIComponent(code), grant_type: 'authorization_code', redirect_uri: redirect }),
  });
  const json = await res.json();
  if (!json.refresh_token) { console.error('TikTok said:', json); process.exit(1); }
  console.log('Scopes granted: ' + json.scope);
  console.log('Refresh token (valid ~1 year). Save it as the TIKTOK_REFRESH_TOKEN secret:\n\n' + json.refresh_token + '\n');
}
