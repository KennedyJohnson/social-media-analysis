"""Parse a Reddit data export into slim, gitignored tables in data/.

Only reads the files listed below and only keeps subreddit, vote direction and
dates. IPs, message/chat files, text bodies, titles, permalinks and the account
name are never loaded or written.

Usage: python scripts/parse_export.py "path/to/export_folder"
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data"
SUB_RE = r"/r/([^/]+)/"


def b36(s):
    return int(str(s), 36)


def sub_from(permalink):
    return permalink.str.extract(SUB_RE)[0].str.lower()


def id_to_time(anchors):
    """Map a base-36 Reddit ID to an estimated creation time.

    Reddit IDs are sequential, so our own posts/comments (exact timestamps)
    give anchor points to interpolate between. IDs outside the anchor range
    return NaT and are bucketed separately downstream.
    """
    a = anchors.assign(n=anchors.id.map(b36)).sort_values("n")
    t = (a.t - pd.Timestamp(0, tz="UTC")).dt.total_seconds().cummax().to_numpy()
    n = a.n.to_numpy()

    def f(ids):
        x = ids.map(b36).to_numpy()
        est = np.interp(x, n, t)
        est = pd.to_datetime(est, unit="s", utc=True)
        return pd.Series(est, index=ids.index).where((x >= n[0]) & (x <= n[-1]))
    return f


def main(src):
    src = Path(src)
    OUT.mkdir(exist_ok=True)
    read = lambda name, cols: pd.read_csv(src / f"{name}.csv", usecols=cols)

    comments = read("comments", ["id", "date", "subreddit"])
    posts = read("posts", ["id", "date", "subreddit"])
    for d in (comments, posts):
        d["t"] = pd.to_datetime(d.date, utc=True)
    comment_time = id_to_time(comments)
    post_time = id_to_time(posts)

    own = pd.concat([
        comments.assign(kind="comment"), posts.assign(kind="post"),
    ])[["kind", "subreddit", "t"]].rename(columns={"subreddit": "sub"})
    own["sub"] = own["sub"].str.lower()
    own.to_csv(OUT / "own_activity.csv.gz", index=False)

    rows = []
    for name, thing, timer in [
        ("post_votes", "post", post_time), ("comment_votes", "comment", comment_time),
        ("saved_posts", "post", post_time), ("saved_comments", "comment", comment_time),
    ]:
        cols = ["id", "permalink"] + (["direction"] if "votes" in name else [])
        d = read(name, cols)
        d = d.assign(
            source=name, thing=thing, sub=sub_from(d.permalink),
            est=timer(d.id), direction=d.get("direction", "save"),
        )
        rows.append(d[["source", "thing", "sub", "direction", "est"]])
    items = pd.concat(rows).dropna(subset=["sub"])
    items.to_csv(OUT / "items.csv.gz", index=False)

    subs = read("subscribed_subreddits", ["subreddit"]).subreddit.str.lower()
    subs.to_frame("sub").to_csv(OUT / "subscribed.csv", index=False)

    print(f"items {len(items):,} ({items.est.isna().mean():.1%} outside anchor range), "
          f"own {len(own):,}, subscribed {len(subs)}, distinct subs {items['sub'].nunique():,}")


if __name__ == "__main__":
    main(sys.argv[1])
