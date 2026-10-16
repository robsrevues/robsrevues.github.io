# robsrevues.com

Every Rob's Revues video from YouTube and TikTok on one fast page, with views, likes and comments refreshed every morning. Each review also gets its own page so it can show up in Google for "[product] review" searches.

It's a static site: plain HTML built by a small Node script, hosted free on GitHub Pages. A GitHub Action runs daily at about 6:17 AM Central: it pulls the latest numbers, saves a daily snapshot (that's where "+4.8K this week" comes from), rebuilds and redeploys.

## Launch (about 30 minutes)

### 1. Put the code on GitHub
1. Create a free account at github.com if you don't have one.
2. This lives at `github.com/robsrevues/robsrevues.github.io` (public, which GitHub Pages needs to be free). Naming it `<username>.github.io` means the site also works at https://robsrevues.github.io.
3. To work on it from your Mac: `git clone https://github.com/robsrevues/robsrevues.github.io.git` (or use GitHub Desktop). Small edits, like `data/overrides.json` or `site.config.json`, can be made right on github.com.

### 2. Turn on hosting
Repo → **Settings → Pages** → Source: **GitHub Actions**.

### 3. Connect YouTube (5 minutes)
1. Go to console.cloud.google.com → create a project called "robsrevues".
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **Credentials → Create credentials → API key**. Restrict it to YouTube Data API v3.
4. In GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret** → name `YOUTUBE_API_KEY`, paste the key.
5. Repo → **Actions → Update and deploy → Run workflow**. In a minute or two the site is live at https://robsrevues.github.io.

### 4. Point robsrevues.com at it
1. Repo → **Settings → Pages → Custom domain** → `robsrevues.com` → Save.
2. At your domain registrar, set DNS:
   | Type | Host | Value |
   |---|---|---|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | CNAME | www | `robsrevues.github.io` |
   Remove any old A records or "parked page" records for @.
3. Wait for DNS (minutes to a few hours), then tick **Enforce HTTPS** in Settings → Pages.
4. Recommended: GitHub → your profile **Settings → Pages → Add a domain** to verify you own robsrevues.com, so no one else can claim it.

### 5. Tell Google
1. search.google.com/search-console → add property `robsrevues.com` (DNS verification).
2. **Sitemaps** → submit `https://robsrevues.com/sitemap.xml`.

## TikTok

TikTok only shares video stats through an approved developer app. Until then, TikTok posts can be entered by hand (below) and the site still works.

**Get the app approved**
1. developers.tiktok.com → log in → **Manage apps → Connect an app**.
2. App details: name "Rob's Revues", category Entertainment, website `https://robsrevues.com`, Terms of Service `https://robsrevues.com/terms/`, Privacy Policy `https://robsrevues.com/privacy/`. Both pages are built in.
3. Add **Login Kit** with redirect URI `https://robsrevues.com/tiktok-callback/` and scopes `user.info.basic`, `user.info.stats`, `video.list`.
4. Verify the domain if asked (DNS TXT record at your registrar is easiest).
5. Describe the use honestly: "Displays my own TikTok videos and their public view/like/comment counts on my personal review website." Record a short screen capture of the site if they ask for a demo. Submit for review.
6. While waiting, sandbox mode lets you test with your own account added as a target user.

**Connect it (once approved)**
```sh
TIKTOK_CLIENT_KEY=xxx TIKTOK_CLIENT_SECRET=yyy node scripts/tiktok-auth.mjs        # prints a login link
TIKTOK_CLIENT_KEY=xxx TIKTOK_CLIENT_SECRET=yyy node scripts/tiktok-auth.mjs CODE   # prints the refresh token
```
Add three repo secrets: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`. The refresh token lasts about a year; the Action log will warn you if TikTok issues a new one.

**Until then: enter TikTok posts by hand** in `data/manual-posts.json`:
```json
{
  "channels": { "tiktok": { "handle": "@robsrevues", "url": "https://www.tiktok.com/@robsrevues", "followers": 640, "followerLabel": "followers" } },
  "posts": [
    {
      "platform": "tiktok",
      "url": "https://www.tiktok.com/@robsrevues/video/7420000000000000000",
      "title": "This $35 karaoke mic survived family karaoke night",
      "date": "2026-10-15",
      "durationSec": 58,
      "views": 14300, "likes": 911, "comments": 55, "shares": 40,
      "thumb": "/thumbs/tiktok/7420000000000000000.jpg"
    }
  ]
}
```
Save the cover image into `public/thumbs/tiktok/` with that file name. You can edit this file right on github.com; saving it triggers a rebuild. Instagram or Facebook posts work the same way with `"platform": "instagram"`; add the platform to `site.config.json` and a color token to `src/site.css` (`--instagram`, `.rr-dot--instagram`, `.rr-chip--instagram`).

## Editing reviews

Most things are automatic:
- **Cross-posts are merged.** A YouTube video and a TikTok with nearly the same title within 3 days become one review with combined numbers.
- **Product links** come from the first amzn.to / amazon.com link in your YouTube description.
- **Deleted or private videos** drop off at the next refresh.

When the automatic call is wrong, use `data/overrides.json`:
```json
{
  "posts": {
    "tiktok:7420000000000000000": { "review": "karaoke-mic" },
    "youtube:dQw4w9WgXcQ": { "review": "karaoke-mic" },
    "youtube:abc123": { "hidden": true }
  },
  "reviews": {
    "karaoke-mic": { "title": "This $35 karaoke mic survived family karaoke night", "product": "Karaoke mic", "productUrl": "https://amzn.to/xxxx" }
  }
}
```
`review` groups posts under one slug (that slug becomes the page address `/reviews/karaoke-mic/`). Keys are `platform:videoId`.

Site copy (hero line, about, eyebrow) lives in `site.config.json`. Colors, type and components live in `src/site.css` and match the Rob's Revues Design System token for token.

## Local commands
```sh
npm run sample   # build with made-up data into dist/ and dist-preview/
YOUTUBE_API_KEY=xxx npm run update   # real fetch + build
npm run serve    # view dist/ at localhost:3000
```

## Files
- `scripts/fetch.mjs`: pulls from each platform, records daily history
- `scripts/platforms/`: one adapter per platform (YouTube, TikTok, manual)
- `scripts/build.mjs`: renders `dist/`: home, `/reviews/<slug>/`, privacy, terms, sitemap, robots
- `src/site.css`, `src/app.js`: the design system and the page's filter/sort/sheet behavior (no frameworks; the whole home page is one HTML file)
- `data/`: posts, daily history, channel stats, your overrides (committed by the Action each day)
