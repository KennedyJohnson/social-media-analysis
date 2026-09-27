# social-media-analysis

Data story on 14 years of my Instagram, Reddit, YouTube (+ Snapchat, iMessage, health) activity: how recommendation algorithms/AI changed my scrolling. Static site in `docs/` (GitHub Pages: kennedyjohnson.github.io/social-media-analysis). Local folder was formerly `instagram-likes-analysis`.

## Privacy (hard rule)
Publish only aggregates (counts/shares by year, hour, category). Never names of accounts/channels/subreddits, captions, titles, searches, messages, or individual timestamps. Raw exports and per-item data live in each platform's gitignored `data/`. Reddit/YouTube builds fail if unexpected strings reach page data — keep those guards.

## Layout
- `<platform>/scripts/` for instagram, reddit, youtube, snapchat, imessage, health: `parse_export.py` → (`classify.py`, `signals.py`) → `build_site_data.py` → `docs/data_<platform>.js` (JS globals, not JSON).
- `scripts/cross_platform.py` → `docs/data_trends.js`.
- `docs/index.html`, `docs/app.js`, `docs/style.css`.
- Pipeline inputs are manual data exports (paths passed as args), so there's no automated refresh. See README "Pipeline" for exact commands.
