"""Aggregate local data into docs/data.js for the static site.

Only aggregates are published: counts and shares by time and category.
No account names, captions, URLs or individual timestamps leave data/.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA, DOCS = ROOT / "data", ROOT.parent / "docs"
SESSION_GAP = pd.Timedelta(minutes=10)
MIN_YEAR = 2019
PRIVATE_CATEGORIES = {"Relationships & Dating"}  # earlier years have too few likes to say anything


def gini(counts):
    x = np.sort(np.asarray(counts, dtype=float))
    n = len(x)
    return float((2 * np.arange(1, n + 1) - n - 1) @ x / (n * x.sum())) if n else 0.0


def comment_stats(likes, known, n_weeks):
    """Liked comments carry no text, so they are analysed by joining to liked posts."""
    com = pd.read_pickle(DATA / "liked_comments.pkl")
    com = com[com.ts.dt.year >= MIN_YEAR]
    liked_codes = set(likes.code)
    com_codes = set(com.code)

    rate_cat = known.assign(dug=known.code.isin(com_codes)).groupby("category").dug.mean()

    q = lambda ts: ts.dt.to_period("Q").astype(str)
    per_q = pd.DataFrame({"comments": com.groupby(q(com.ts)).size(),
                          "posts": likes.groupby(q(likes.ts)).size()}).fillna(0)
    per_q = per_q[per_q.index >= "2022Q1"]

    c23, l23 = com[com.ts.dt.year >= 2023], likes[likes.year >= 2023]
    heat = c23.groupby([c23.ts.dt.dayofweek, c23.ts.dt.hour]).size().unstack(fill_value=0)
    heat = heat.reindex(index=range(7), columns=range(24), fill_value=0)
    ratio_hour = (c23.groupby(c23.ts.dt.hour).size() / l23.groupby(l23.ts.dt.hour).size()).reindex(range(24)).fillna(0)

    # Order of events on posts where both the post and a comment were liked.
    first_post = likes.groupby("code").ts.min()
    first_com = com.groupby("code").ts.min()
    both = pd.concat([first_post, first_com], axis=1, keys=["post", "com"], join="inner")
    lag = (both.com - both.post).dt.total_seconds() / 60
    bins = [("Comment liked first", lag < 0), ("Same minute", lag == 0), ("Within 5 min", (lag > 0) & (lag <= 5)),
            ("5 to 60 min later", (lag > 5) & (lag <= 60)), ("Over an hour later", lag > 60)]

    per_post = com.groupby("code").size()
    return {
        "total": int(len(com)), "posts": int(len(com_codes)),
        "per_post_median": float(per_post.median()), "per_post_p90": float(per_post.quantile(.9)),
        "comment_only_share": float(1 - len(com_codes & liked_codes) / len(com_codes)),
        "overall_rate": float(known.code.isin(com_codes).mean()),
        "rate_category": {"index": list(rate_cat.index), "values": rate_cat.round(4).tolist(),
                          "n": known.groupby("category").size().astype(int).tolist()},
        "quarter": {"index": list(per_q.index), "comments": per_q.comments.astype(int).tolist(),
                    "posts": per_q.posts.astype(int).tolist()},
        "heatmap": (heat / n_weeks).round(3).values.tolist(),
        "ratio_hour": ratio_hour.round(3).tolist(),
        "lag": {"index": [b for b, _ in bins], "values": [float(m.mean()) for _, m in bins], "n": int(len(both))},
    }


def main():
    likes = pd.read_pickle(DATA / "likes.pkl").join(pd.read_pickle(DATA / "classified.pkl"))
    # Withheld for privacy: treated like uncategorised posts and never published.
    likes.loc[likes.category.isin(PRIVATE_CATEGORIES), "category"] = "Unclear"
    following = set(pd.read_pickle(DATA / "following.pkl").owner)
    likes = likes.sort_values("ts").reset_index(drop=True)
    likes["year"] = likes.ts.dt.year
    likes["month"] = likes.ts.dt.to_period("M").astype(str)
    likes["new_account"] = ~likes.owner.duplicated()  # first time I ever liked this account
    likes["has_hashtag"] = likes.hashtags.map(len) > 0
    recent = likes[likes.year >= MIN_YEAR]

    # Sessions: consecutive likes less than SESSION_GAP apart.
    new_session = likes.ts.diff() > SESSION_GAP
    likes["session"] = new_session.cumsum()
    sess = likes.groupby("session").agg(start=("ts", "first"), end=("ts", "last"), n=("ts", "size"),
                                        sentiment=("sentiment", "mean"))
    sess["minutes"] = (sess.end - sess.start).dt.total_seconds() / 60
    sess["hour"] = sess.start.dt.hour
    sess["year"] = sess.start.dt.year
    sess = sess[sess.year >= MIN_YEAR]

    cats = [c for c in recent.category.value_counts().index if c != "Unclear"]
    known = recent[recent.category != "Unclear"]

    by_year = (known.groupby(["year", "category"]).size().unstack(fill_value=0)[cats])
    share_year = by_year.div(by_year.sum(1), axis=0)
    by_q = known.assign(q=known.ts.dt.to_period("Q").astype(str)).groupby(["q", "category"]).size().unstack(fill_value=0)[cats]
    by_q = by_q[by_q.index >= "2022Q1"]
    share_q = by_q.div(by_q.sum(1), axis=0)

    heat = likes[likes.year >= 2023].groupby([likes.ts.dt.dayofweek, likes.ts.dt.hour]).size().unstack(fill_value=0)
    heat = heat.reindex(index=range(7), columns=range(24), fill_value=0)
    n_weeks = (likes.ts.max() - pd.Timestamp("2023-01-01")).days / 7

    # What you like at each hour: category mix by hour of day.
    hour_cat = known[known.year >= 2023].groupby([known.ts.dt.hour, "category"]).size().unstack(fill_value=0)[cats]
    hour_cat_share = hour_cat.div(hour_cat.sum(1), axis=0)

    scored = recent.dropna(subset=["sentiment"])
    sent_month = scored[scored.year >= 2022].groupby("month").sentiment.mean()
    sent_cat = scored[scored.category != "Unclear"].groupby("category").agg(mean=("sentiment", "mean"), n=("sentiment", "size"))
    sent_hour = scored[scored.year >= 2023].groupby(scored.ts.dt.hour).sentiment.mean()
    sent_mix = scored.groupby("year").sentiment_label.value_counts(normalize=True).unstack(fill_value=0)

    per_year = []
    for y, g in recent.groupby("year"):
        owners = g.owner.value_counts()
        per_year.append({
            "year": int(y), "likes": int(len(g)), "reel_share": float((g.kind == "reel").mean()),
            "followed_share": float(g.owner.isin(following).mean()),
            "new_account_share": float(g.new_account.mean()),
            "hashtag_share": float(g.has_hashtag.mean()),
            "unique_accounts": int(owners.size),
            "top10_share": float(owners.head(10).sum() / len(g)),
            "one_off_share": float((owners == 1).sum() / len(g)),
            "gini": gini(owners.values),
        })

    s23 = sess[sess.year >= 2023]
    out = {
        "generated": str(likes.ts.max().date()),
        "totals": {"likes": int(len(likes)), "first": str(likes.ts.min().date()),
                   "accounts": int(likes.owner.nunique()), "categories": len(cats),
                   "unclear_share": float((recent.category == "Unclear").mean())},
        "categories": cats,
        "share_year": {"index": [int(i) for i in share_year.index], "values": share_year.round(4).values.tolist(),
                       "totals": by_year.sum(1).astype(int).tolist()},
        "share_quarter": {"index": list(share_q.index), "values": share_q.round(4).values.tolist()},
        "heatmap": {"per_week": (heat / n_weeks).round(3).values.tolist(), "since": "2023"},
        "hour_category": {"index": [int(i) for i in hour_cat_share.index],
                          "values": hour_cat_share.round(4).values.tolist(), "n": hour_cat.sum(1).astype(int).tolist()},
        "sentiment": {
            "month": {"index": list(sent_month.index), "values": sent_month.round(4).tolist()},
            "category": {"index": list(sent_cat.index), "values": sent_cat["mean"].round(4).tolist(),
                         "n": sent_cat["n"].astype(int).tolist()},
            "hour": {"index": [int(i) for i in sent_hour.index], "values": sent_hour.round(4).tolist()},
            "mix": {"index": [int(i) for i in sent_mix.index], "columns": list(sent_mix.columns),
                    "values": sent_mix.round(4).values.tolist()},
        },
        "sessions": {
            "count": int(len(s23)), "median_likes": float(s23.n.median()),
            "median_minutes": float(s23.minutes.median()),
            "p90_likes": float(s23.n.quantile(.9)), "max_likes": int(s23.n.max()),
            "binge_share": float(s23[s23.n >= 20].n.sum() / s23.n.sum()),
            "by_hour": s23.groupby("hour").n.mean().round(2).reindex(range(24)).fillna(0).tolist(),
            "size_hist": np.histogram(s23.n.clip(upper=60), bins=[1, 2, 3, 5, 10, 20, 40, 61])[0].tolist(),
            "per_year": s23.groupby("year").agg(sessions=("n", "size"), median=("n", "median")).reset_index().to_dict("records"),
        },
        "algorithm": per_year,
        "comments": comment_stats(likes[likes.year >= MIN_YEAR], known, n_weeks),
    }
    # Publish only what the page shows: drop finer-grained breakdowns (hour-level category mixes,
    # comment heatmaps, extremes) that would reveal more about my routine than the charts do.
    out.pop("hour_category")
    out.pop("share_quarter")
    out["sentiment"].pop("hour")
    out["sentiment"].pop("mix")
    for k in ["by_hour", "max_likes", "per_year"]:
        out["sessions"].pop(k)
    for k in ["rate_category", "heatmap", "ratio_hour", "per_post_median", "per_post_p90"]:
        out["comments"].pop(k)
    for row in out["algorithm"]:
        row.pop("one_off_share")
        row.pop("gini")
    # No absolute volumes: publish shares, ratios and growth relative to the pre-Reels years instead.
    base = np.mean([r["likes"] for r in out["algorithm"] if r["year"] <= 2021])
    for row in out["algorithm"]:
        row["growth"] = round(row.pop("likes") / base, 1)
        row.pop("unique_accounts")
    out["share_year"].pop("totals")
    out["totals"] = {"first": out["totals"]["first"][:4], "categories": out["totals"]["categories"]}
    out["sessions"].pop("count")
    hist = np.array(out["sessions"]["size_hist"], dtype=float)
    out["sessions"]["size_hist"] = (hist / hist.sum()).round(4).tolist()
    cq = out["comments"]["quarter"]
    out["comments"]["quarter"] = {"index": cq["index"],
                                  "ratio": [round(c / p_, 3) if p_ else 0 for c, p_ in zip(cq["comments"], cq["posts"])]}
    for k in ["total", "posts"]:
        out["comments"].pop(k)
    # Broad time-of-day buckets instead of an hour-by-weekday grid, which would map my routine.
    out.pop("heatmap")
    recent_hours = likes[likes.year >= 2023].ts.dt.hour
    buckets = [("Morning", "6am–noon", range(6, 12)), ("Afternoon", "noon–5pm", range(12, 17)),
               ("Evening", "5–10pm", range(17, 22)), ("Night", "10pm–6am", [22, 23, 0, 1, 2, 3, 4, 5])]
    out["time_of_day"] = [{"label": n, "hours": h, "share": round(float(recent_hours.isin(list(r)).mean()), 3)}
                          for n, h, r in buckets]
    DOCS.mkdir(exist_ok=True)
    (DOCS / "data_instagram.js").write_text("window.IG = " + json.dumps(out, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps({k: out[k] for k in ["totals", "time_of_day"]}, indent=1, default=str))
    print([(r["year"], r["growth"]) for r in out["algorithm"]])


if __name__ == "__main__":
    main()
