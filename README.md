# social-media-analysis

A data story built from fourteen years of my Instagram, Reddit and YouTube activity: how recommendation algorithms and AI reshaped the way I scroll, and why doomscrolling works for the companies behind the feeds.

**Live site:** https://kennedyjohnson.github.io/social-media-analysis/ (a static page in `docs/`, no build step)

This repo merges the former `instagram-likes-analysis` and `reddit-activity-analysis` projects and adds Google Takeout (YouTube).

## Privacy

Only aggregates are published: counts and shares by year, hour and category. No account, channel or subreddit names, captions, titles, searches, messages or individual timestamps. Raw exports and everything derived per item live in each platform's `data/` folder, which is gitignored. The Reddit and YouTube builds fail if any unexpected string reaches the page data.

## Layout

```
docs/                 the site (index.html, app.js, style.css, data_*.js)
instagram/scripts/    parse → classify → signals → build  → docs/data_instagram.js
reddit/scripts/       parse → classify → build             → docs/data_reddit.js
youtube/scripts/      parse → build                        → docs/data_youtube.js
```

## Pipeline

```bash
pip install pandas scikit-learn sentence-transformers transformers torch

# Instagram (Download your information, HTML format)
python instagram/scripts/parse_export.py "path/to/instagram-export"
python instagram/scripts/classify.py
python instagram/scripts/signals.py "path/to/instagram-export"
python instagram/scripts/build_site_data.py

# Reddit (reddit.com/settings/data-request); hand labels in reddit/data/sub_labels.txt
python reddit/scripts/parse_export.py "path/to/reddit-export"
python reddit/scripts/classify.py
python reddit/scripts/build_site_data.py "path/to/reddit-export"

# YouTube (Google Takeout; pass every extracted Takeout folder)
python youtube/scripts/parse_export.py "path/to/Takeout" ["path/to/Takeout-2" ...]
python youtube/scripts/build_site_data.py

# Cross-platform trends (after the parse steps)
python scripts/cross_platform.py

python -m http.server -d docs 8000
```

## Methods

- **Reddit dates:** votes aren't dated in the export. Reddit IDs are sequential base-36 numbers, so each voted item is dated by interpolating between my own dated posts and comments (this dates the content, not the vote).
- **Instagram categories:** caption + hashtags embedded with `all-MiniLM-L6-v2` and matched to 20 hand-written category descriptions; sentiment from `cardiffnlp/twitter-roberta-base-sentiment-latest`. Reddit subreddits with 20+ votes are hand-labelled.
- **YouTube:** the activity log keeps likes, dislikes, subscriptions and "Not interested" back to 2012, but watch history only for recent months. Shorts aren't marked, so the Shorts share counts liked titles tagged `#shorts` (a lower bound). "Subscribed" means subscribed before the like, using dated subscription events.
- **Sessions:** consecutive likes less than 10 minutes apart. Scrolling without liking is invisible, so this undercounts.
- **Algorithm signals:** per year, share of likes on my top 10 accounts/channels, on accounts or communities I follow, on new accounts, and on short-form video.
- Sensitive categories (dating, health, adult) are withheld.
