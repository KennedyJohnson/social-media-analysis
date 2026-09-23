# instagram-likes-analysis

A data story built from eleven years of my Instagram likes and liked comments: what I've been into, when I scroll, how long sessions run, how much I read the comments, the mood of my feed, and how much of it the recommendation algorithm chose.

**Live site:** https://kennedyjohnson.github.io/instagram-likes-analysis/ (a static page in `docs/`, no build step)

## Privacy

Only aggregates are published, and one sensitive category (relationships and dating) is withheld entirely. The raw export and everything derived from it per post (captions, account names, timestamps) live in `data/`, which is gitignored. `docs/data.js` holds counts and shares by category and time, nothing else.

## Pipeline

```bash
pip install pandas scikit-learn sentence-transformers transformers torch

# 1. Parse the HTML export (Settings → Your activity → Download your information, HTML format)
python scripts/parse_export.py "path/to/instagram-export"

# 2. Categorise each liked post and score caption sentiment (slow on CPU)
python scripts/classify.py

# 3. Aggregate into docs/data.js
python scripts/build_site_data.py

# Preview
python -m http.server -d docs 8000
```

## Methods

- **Categories:** each post's caption + hashtags are embedded with `all-MiniLM-L6-v2` and assigned to the nearest of 20 hand-written category descriptions (cosine similarity). Posts with too little text or weak similarity are labelled *Unclear* and excluded from shares. An unsupervised TF-IDF + NMF topic model was tried first, but captions are dominated by generic filler ("tag a friend", "credit to owner"), so its topics were incoherent.
- **Sentiment:** `cardiffnlp/twitter-roberta-base-sentiment-latest`, score = P(positive) − P(negative).
- **Time zone:** the HTML export shows times at a fixed UTC−8 offset (checked against the UTC timestamps in `login_activity.html`); they're converted to US Central time.
- **Liked comments:** the export has no comment text, so they're joined to liked posts by post URL.
- **Sessions:** consecutive likes less than 10 minutes apart. Scrolling without liking is invisible, so this undercounts time spent.
- **Algorithm signals:** per year, the share of likes on Reels, on accounts I currently follow (the export only lists current follows), on accounts liked once, and on my top 10 accounts.
