"""Extract the ranking signals beyond likes that the export does contain, as aggregates only.

- Shares: reels and posts I sent in DMs (the account owner is detected as the sender present
  in the most threads; no names or message text are kept).
- Scrolled past: the one week of "videos watched" / "posts viewed" the export includes, compared
  with what I liked in the same window.
- Negative feedback: posts I marked "Not interested".
- Ads: how many advertisers uploaded audience lists matched to my profile (a count, no names).

Writes data/signals.json (merged into docs/data.js by build_site_data.py).

Usage: python scripts/signals.py "C:/path/to/instagram-export"
"""
import html
import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classify import CATEGORIES, MIN_SIM  # noqa: E402
from parse_export import ENTRY_END, parse_time  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
PRIVATE = {"Relationships & Dating"}
MSG = re.compile(r'<h2 class="[^"]*_a6-h[^"]*">([^<]+)</h2><div class="_3-95 _a6-p">(.*?)</div><div class="_3-94 _a6-o">'
                 r'([A-Z][a-z]{2} \d\d, \d{4} \d+:\d\d [ap]m)</div>', re.S)
CODE = re.compile(r'instagram\.com/(?:reel|p)/([A-Za-z0-9_-]+)')
TAGS = re.compile(r"<[^>]+>")


def text_of(fragment):
    t = html.unescape(TAGS.sub(" ", fragment))
    t = re.sub(r"https?://\S+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def categorise(texts):
    model = SentenceTransformer("all-MiniLM-L6-v2")
    emb = model.encode(texts, batch_size=128, normalize_embeddings=True)
    cat = model.encode(list(CATEGORIES.values()), normalize_embeddings=True)
    sims = emb @ cat.T
    names = np.array(list(CATEGORIES))
    out = np.where((sims.max(1) >= MIN_SIM) & np.array([len(t) > 3 for t in texts]), names[sims.argmax(1)], "Unclear")
    return pd.Series(out).replace({c: "Unclear" for c in PRIVATE})


def shares(root):
    files = sorted((root / "your_instagram_activity/messages/inbox").glob("*/message_*.html"))
    presence = Counter()
    msgs = []
    for f in files:
        t = f.read_text(encoding="utf-8")
        found = MSG.findall(t)
        presence.update({s for s, _, _ in found})
        msgs.extend(found)
    me = presence.most_common(1)[0][0]
    rows = []
    for sender, body, when in msgs:
        code = CODE.search(body)
        if sender == me and code and "sent an attachment" in body:
            rows.append({"ts": parse_time(when), "code": code.group(1),
                         "text": text_of(body.split("sent an attachment.", 1)[-1])})
    return pd.DataFrame(rows)


def entries(path):
    s = path.read_text(encoding="utf-8")
    s = s[s.find("<main"):]
    out, start = [], 0
    for m in ENTRY_END.finditer(s):
        block = s[start:m.start()]
        start = m.end()
        code = CODE.search(block)
        cap = re.search(r'>Caption</td><td class="_2piu _a6_r">(.*?)</td>', block, re.S)
        out.append({"ts": parse_time(m.group(1)), "code": code.group(1) if code else None,
                    "text": text_of(cap.group(1)) if cap else ""})
    return pd.DataFrame(out)


def mix(series):
    known = series[series != "Unclear"]
    return (known.value_counts(normalize=True).round(4)).to_dict()


if __name__ == "__main__":
    root = Path(sys.argv[1])
    likes = pd.read_pickle(DATA / "likes.pkl").join(pd.read_pickle(DATA / "classified.pkl"))
    likes.loc[likes.category.isin(PRIVATE), "category"] = "Unclear"
    out = {}

    # Shares: per year, sends per 100 likes, and what I share vs what I like.
    sent = shares(root)
    sent["category"] = categorise(sent.text.tolist()).to_numpy()
    sent_y = sent.groupby(sent.ts.dt.year).size()
    likes_y = likes.groupby(likes.ts.dt.year).size()
    years = [y for y in sent_y.index if y >= 2019 and likes_y.get(y, 0) >= 100]
    recent = sent[sent.ts.dt.year >= 2023]
    out["shares"] = {
        "per_100_likes": {"index": [int(y) for y in years], "values": [round(100 * sent_y[y] / likes_y[y], 1) for y in years]},
        "shared_also_liked": round(float(recent.code.isin(set(likes.code)).mean()), 3),
        "shared_mix": mix(recent.category),
        "liked_mix": mix(likes[likes.ts.dt.year >= 2023].category),
    }

    # Scrolled past: the export's one-week window of viewing, vs likes in that window.
    watched = entries(root / "ads_information/ads_and_topics/videos_watched.html")
    viewed = entries(root / "ads_information/ads_and_topics/posts_viewed.html")
    lo, hi = min(watched.ts.min(), viewed.ts.min()), max(watched.ts.max(), viewed.ts.max())
    liked_codes = set(likes[(likes.ts >= lo) & (likes.ts <= hi + pd.Timedelta(days=1))].code)
    seen = pd.concat([watched, viewed]).dropna(subset=["code"]).drop_duplicates("code")
    out["seen_week"] = {"days": int((hi - lo).days) + 1, "items": int(len(pd.concat([watched, viewed]))),
                        "liked_share": round(float(seen.code.isin(liked_codes).mean()), 3)}

    # Negative feedback: "Not interested".
    ni_path = root / "ads_information/ads_and_topics/posts_you're_not_interested_in.html"
    ni = entries(ni_path)
    ni["category"] = categorise(ni.text.tolist()).to_numpy()
    out["not_interested"] = {"count": int(len(ni)), "first": int(ni.ts.dt.year.min()), "last": int(ni.ts.dt.year.max()),
                             "mix": mix(ni.category)}

    # Ads: advertisers with audience lists matched to me (count only).
    adv = (root / "ads_information/instagram_ads_and_businesses/advertisers_using_your_activity_or_information.html").read_text(encoding="utf-8")
    adv = adv[adv.find("<main"):]
    names = [n for n in re.findall(r'<div class="_a6-p">([^<]{1,120})</div>', adv) if n.strip()]
    out["advertisers"] = {"count": len(names)}

    (DATA / "signals.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(out, indent=1))
