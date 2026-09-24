"""Aggregate the labelled tables into docs/data.js.

Only counts and shares by category and year are written.
Before saving, every string in the output is checked against an allowlist
(category names/descriptions and fixed labels), and the export's account
name is checked for, so no subreddit or username can slip through.

Usage: python scripts/build_site_data.py "path/to/export_folder"
"""
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

from classify import CATEGORIES

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TZ = "America/Chicago"
FIRST_YEAR = 2017
MIN_OWN = 10  # own posts/comments in a category before it's shown separately
CATS = list(CATEGORIES)


def r(x, n=4):
    return [round(float(v), n) for v in x]


def main(export):
    items = pd.read_csv(DATA / "items_labelled.csv.gz")
    items["year"] = pd.to_datetime(items.est, format="ISO8601").dt.year
    items = items[items.year >= FIRST_YEAR]
    years = sorted(items.year.dropna().astype(int).unique())
    votes = items[items.source.str.endswith("votes")]
    ups = votes[votes.direction == "up"]
    downs = votes[votes.direction == "down"]

    own = pd.read_csv(DATA / "own_activity.csv.gz")
    own["t"] = pd.to_datetime(own.t, format="ISO8601").dt.tz_convert(TZ)
    own["year"] = own.t.dt.year
    labels = items.drop_duplicates("sub").set_index("sub").category
    own["category"] = own["sub"].map(labels).fillna("Other")

    # 1. What I upvote, by year (share of labelled upvotes)
    known = ups[ups.category.isin(CATS)]
    share_year = pd.crosstab(known.year, known.category, normalize="index").reindex(columns=CATS, fill_value=0)

    # 2. Lurking: upvotes per thing I wrote
    per_year = pd.DataFrame({
        "upvotes": ups.groupby("year").size(),
        "downvotes": downs.groupby("year").size(),
        "written": own.groupby("year").size(),
    }).reindex(years).fillna(0).astype(int)

    # 2b. Subscribed vs not: share of upvotes in subreddits I'm subscribed to now
    subscribed = set(pd.read_csv(DATA / "subscribed.csv")["sub"])
    ups_sub = ups.assign(sub_=ups["sub"].isin(subscribed)).groupby("year").sub_.mean()

    # 3. Upvote vs write: category mix
    def mix(df):
        s = df[df.category.isin(CATS)].category.value_counts(normalize=True)
        return r(s.reindex(CATS, fill_value=0))
    own_counts = own.category.value_counts()
    own_cats = [c for c in CATS if own_counts.get(c, 0) >= MIN_OWN]
    own_mix = own.category.where(own.category.isin(own_cats), "Other").value_counts(normalize=True)

    out = {
        "generated": date.today().isoformat(),
        "categories": CATS,
        "descriptions": list(CATEGORIES.values()),
        "totals": {
            "upvotes": int(len(ups)), "downvotes": int(len(downs)),
            "written": int(len(own)), "subreddits": int(items["sub"].nunique()),
            "labelled": round(float(items.category.isin(CATS).mean()), 3),
            "withheld": round(float((items.category == "Withheld").mean()), 4),
            "first": FIRST_YEAR, "last": int(years[-1]),
        },
        "share_year": {"index": [int(y) for y in share_year.index], "values": [r(row) for row in share_year.values]},
        "per_year": {"index": [int(y) for y in per_year.index], **{c: per_year[c].tolist() for c in per_year}},
        "subscribed": {"index": [int(y) for y in ups_sub.index], "share": r(ups_sub.values, 3)},
        "mix": {"upvotes": mix(ups), "written": r(own_mix.reindex(CATS, fill_value=0))},
    }

    check_privacy(out, export)
    (ROOT.parent / "docs" / "data_reddit.js").write_text("window.RD = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print("wrote docs/data_reddit.js", out["totals"])


def check_privacy(out, export):
    allowed = set(CATS) | set(CATEGORIES.values()) | {out["generated"]}
    strings = []

    def walk(x):
        if isinstance(x, str):
            strings.append(x)
        elif isinstance(x, dict):
            for k, v in x.items():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(out)
    leaked = set(strings) - allowed
    assert not leaked, f"unexpected strings in output: {sorted(leaked)[:5]}"

    stats = pd.read_csv(Path(export) / "statistics.csv").set_index("statistic").value
    text = json.dumps(out).lower()
    for key in ("account name", "email address"):
        val = str(stats.get(key, "")).lower()
        assert not val or val not in text, f"{key} found in output"


if __name__ == "__main__":
    main(sys.argv[1])
