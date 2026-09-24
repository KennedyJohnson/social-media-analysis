"""Parse an Instagram HTML data export into local pickle files.

Raw output lands in data/ (gitignored) and never leaves this machine.

Usage: python scripts/parse_export.py "C:/path/to/instagram-export"
"""
import html
import re
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "data"

# Each liked post is a block ending in a timestamp div.
ENTRY_END = re.compile(r'<div class="_3-94 _a6-o">([A-Z][a-z]{2} \d\d, \d{4} \d+:\d\d [ap]m)</div>')
URL = re.compile(r'href="https://www\.instagram\.com/(reel|p|tv)/([^/"]+)')
CAPTION = re.compile(r'>Caption</td><td class="_2piu _a6_r">(.*?)</td>', re.S)
USERNAME = re.compile(r'>Username</td><td class="_2piu _a6_r">([^<]+)<')
HASHTAG_BLOCK = re.compile(r'>Hashtags</h2>(.*)', re.S)
TAG = re.compile(r'>Name</td><td class="_2piu _a6_r">#?([^<]+)<')


# The HTML export shows times at a fixed UTC-8 offset, whatever the account's location
# (verified against login_activity.html, which lists each time next to its UTC timestamp).
# Convert to US Central time, daylight saving included.
EXPORT_TZ = timezone(timedelta(hours=-8))
LOCAL_TZ = ZoneInfo("America/Chicago")


def parse_time(s):
    t = datetime.strptime(s, "%b %d, %Y %I:%M %p").replace(tzinfo=EXPORT_TZ)
    return t.astimezone(LOCAL_TZ).replace(tzinfo=None)


def parse_likes(root):
    s = (root / "your_instagram_activity/likes/liked_posts.html").read_text(encoding="utf-8")
    s = s[s.find("<main"):]
    rows, start = [], 0
    for m in ENTRY_END.finditer(s):
        block = s[start:m.start()]
        start = m.end()
        url = URL.search(block)
        cap = CAPTION.search(block)
        user = USERNAME.search(block)
        tags_html = HASHTAG_BLOCK.search(block)
        tags = TAG.findall(tags_html.group(1)) if tags_html else []
        rows.append({
            "ts": parse_time(m.group(1)),
            "kind": url.group(1) if url else None,
            "code": url.group(2) if url else None,
            "caption": html.unescape(cap.group(1)) if cap else "",
            "owner": user.group(1) if user else None,
            "hashtags": [html.unescape(t).lower() for t in tags],
        })
    return pd.DataFrame(rows)


def parse_liked_comments(root):
    # The export has no comment text, only the commenter, the post and the time.
    s = (root / "your_instagram_activity/likes/liked_comments.html").read_text(encoding="utf-8")
    rows = re.findall(r'_a6-i">([^<]*)</h2>.*?href="https://www\.instagram\.com/(?:reel|p|tv)/([^/"]+)/?"'
                      r'[^>]*>[^<]*</a></div><div>([^<]+)</div>', s, re.S)
    return pd.DataFrame({"commenter": [r[0] for r in rows], "code": [r[1] for r in rows],
                         "ts": [parse_time(r[2]) for r in rows]})


def parse_following(root):
    s = (root / "connections/followers_and_following/following.html").read_text(encoding="utf-8")
    rows = re.findall(r'_a6-i">([^<]+)</h2>.*?<div>([A-Z][a-z]{2} \d\d, \d{4} \d+:\d\d [ap]m)</div>', s, re.S)
    return pd.DataFrame({"owner": [u for u, _ in rows], "followed_at": [parse_time(t) for _, t in rows]})


if __name__ == "__main__":
    root = Path(sys.argv[1])
    OUT.mkdir(exist_ok=True)
    likes = parse_likes(root)
    likes.to_pickle(OUT / "likes.pkl")
    following = parse_following(root)
    following.to_pickle(OUT / "following.pkl")
    comments = parse_liked_comments(root)
    comments.to_pickle(OUT / "liked_comments.pkl")
    print(f"{len(likes)} likes, {len(comments)} liked comments, {len(following)} following -> {OUT}")
