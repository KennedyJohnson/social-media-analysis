"""Parse Google Takeout YouTube activity into a slim, gitignored table in data/.

Usage: python youtube/scripts/parse_export.py <Takeout folder> [<Takeout folder> ...]

Reads every "My Activity/YouTube/MyActivity.html" and "YouTube and YouTube Music/history/*.html"
under the given folders (Takeout splits across several zips). Titles and channels are kept only
locally so channels can be counted; build_site_data.py publishes aggregates only.
"""
import html
import re
import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data"
CELL = re.compile(r'content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">(.*?)</div>', re.S)
DATE = re.compile(r"([A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2}\s[AP]M)\s([A-Z]{2,4})")


def parse(path):
    rows = []
    for body in CELL.findall(path.read_text(encoding="utf-8")):
        m = DATE.search(body.replace(" ", " "))
        if not m:
            continue
        action = html.unescape(re.sub(r"<.*", "", body, flags=re.S)).strip().split("\n")[0].strip()
        links = re.findall(r'<a href="([^"]+)">(.*?)</a>', body)
        url = links[0][0] if links else ""
        channel = links[1][0] if len(links) > 1 and "/channel/" in links[1][0] else ""
        title = html.unescape(links[0][1]) if links else ""
        rows.append({"ts": m.group(1).replace(" ", " "), "tz": m.group(2), "action": action,
                     "url": url, "title": title, "channel": channel, "src": path.parent.name})
    return rows


def main(folders):
    rows = []
    for f in folders:
        for p in Path(f).rglob("*.html"):
            if (p.parent.name == "YouTube" and p.parent.parent.name == "My Activity") or p.parent.name == "history":
                rows += parse(p)
                print(p, len(rows))
    df = pd.DataFrame(rows)
    # Timestamps carry CDT/CST; parse as naive local (US Central) time.
    df["ts"] = pd.to_datetime(df.ts, format="%b %d, %Y, %I:%M:%S %p")
    df = df.drop_duplicates(["ts", "action", "url"]).sort_values("ts")
    OUT.mkdir(exist_ok=True)
    df.to_pickle(OUT / "events.pkl")
    print(df.action.value_counts().head(10))


if __name__ == "__main__":
    main(sys.argv[1:])
