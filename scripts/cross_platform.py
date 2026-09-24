"""Cross-platform trends from the local Instagram and YouTube tables into docs/data_trends.js.

Run after the per-platform parse steps. Only yearly/quarterly shares and counts leave data/;
the build fails if any string other than a period label is written.
"""
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CAPS = re.compile(r"\b[A-Z]{3,}\b")


def has_emoji(s):
    return any(ord(ch) >= 0x1F000 for ch in s)


def never_again(df, who):
    """Share of accounts/channels first liked in each year that I never liked a second time."""
    a = df[df[who].fillna("") != ""].groupby(who).ts.agg(["min", "size"])
    return (a["size"] == 1).groupby(a["min"].dt.year).mean()


def main():
    ig = pd.read_pickle(ROOT / "instagram" / "data" / "likes.pkl")
    ig = ig[ig.ts.dt.year >= 2019]
    yt = pd.read_pickle(ROOT / "youtube" / "data" / "events.pkl")
    yt = yt[yt.action == "Liked"]
    last_full = int(yt.ts.dt.year.max()) - 1  # the current year is partial

    def rows(s, lo):
        return {str(k): round(float(v), 4) for k, v in s.items() if lo <= k <= last_full}

    titles = yt.title.astype(object)
    captions = ig.caption.fillna("").astype(object)
    q = lambda ts: ts.dt.to_period("Q").astype(str)
    out = {
        "never_again": {"instagram": rows(never_again(ig, "owner"), 2019), "youtube": rows(never_again(yt, "channel"), 2016)},
        "emoji": {"youtube": rows(titles.map(has_emoji).groupby(yt.ts.dt.year).mean(), 2016),
                  "instagram": rows(captions.map(has_emoji).groupby(ig.ts.dt.year).mean(), 2019)},
        "caps": {"youtube": rows(titles.str.contains(CAPS).groupby(yt.ts.dt.year).mean(), 2016)},
        "lockdown": {"youtube": yt[yt.ts.between("2019-01-01", "2021-12-31 23:59")].pipe(lambda d: q(d.ts)).value_counts().sort_index().to_dict(),
                     "instagram": ig[ig.ts.between("2019-01-01", "2021-12-31 23:59")].pipe(lambda d: q(d.ts)).value_counts().sort_index().to_dict()},
    }
    out["lockdown"] = {k: {p: int(n) for p, n in v.items()} for k, v in out["lockdown"].items()}

    # Privacy check: the only strings allowed are years and quarter labels (dict keys).
    def strings(o):
        if isinstance(o, dict):
            for k, v in o.items():
                yield k
                yield from strings(v)
        elif isinstance(o, str):
            yield o
    names = {"never_again", "instagram", "youtube", "emoji", "caps", "lockdown"}
    leaked = [s for s in strings(out) if s not in names and not re.fullmatch(r"\d{4}(Q[1-4])?", s)]
    assert not leaked, f"unexpected strings in output: {leaked[:5]}"

    (ROOT / "docs" / "data_trends.js").write_text("window.TR = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
