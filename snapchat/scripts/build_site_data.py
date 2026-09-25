"""Aggregate the Snapchat export (data/snapchat) into docs/data_snapchat.js.

Only counts and shares by year / part of the day, the friend/follow totals and how many Spotlight
interest hashtags Snapchat has weighted. No usernames, conversation titles, message content, locations or
individual timestamps. The build fails if any string other than the fixed keys below is written.
"""
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "data" / "snapchat"
TZ = "America/Chicago"
PARTS = [("Morning", 6, 12), ("Afternoon", 12, 17), ("Evening", 17, 22), ("Night", 22, 30)]


def frame(name):
    raw = json.loads((D / name).read_text(encoding="utf-8"))
    rows = [dict(m, convo=i) for i, msgs in enumerate(raw.values()) for m in msgs]
    d = pd.DataFrame(rows)
    d["ts"] = pd.to_datetime(d.Created.str.replace(" UTC", ""), utc=True).dt.tz_convert(TZ)
    return d


def part_shares(ts):
    h = ts.dt.hour.value_counts(normalize=True).reindex(range(24), fill_value=0)
    return [{"part": n, "share": round(float(sum(h[x % 24] for x in range(a, b))), 4)} for n, a, b in PARTS]


def strings(o):
    if isinstance(o, dict):
        for k, v in o.items():
            yield k
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)
    elif isinstance(o, str):
        yield o


def main():
    snaps, chats = frame("snap_history.json"), frame("chat_history.json")
    chats = chats[chats["Media Type"].isin(["TEXT", "MEDIA", "STICKER", "SHARE", "NOTE"])]
    rank = json.loads((D / "ranking.json").read_text(encoding="utf-8"))
    stats = rank["Statistics"]
    tags = {k.lstrip("#"): int(v) for k, v in rank["Spotlight"][1].items() if v}
    # Keep plain hashtags only (drops anything that isn't a simple lowercase word).
    tags = {k: v for k, v in tags.items() if re.fullmatch(r"[a-z0-9]+", k)}

    years = sorted(set(snaps.ts.dt.year) | set(chats.ts.dt.year))
    sent_chats = chats[chats.IsSender]
    per_convo = sent_chats.groupby("convo").size().sort_values(ascending=False)
    out = {
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "stats": {"friends": int(float(stats["Your Total Friends"])), "following": int(float(stats["The Number of Accounts You Follow"])),
                  "tags_weighted": len(tags), "tags_total": len(rank["Spotlight"][1])},
        "totals": {"snaps": len(snaps), "snaps_sent_share": round(float(snaps.IsSender.mean()), 4),
                   "video_share": round(float((snaps["Media Type"] == "VIDEO").mean()), 4),
                   "chats": len(chats), "chats_sent": len(sent_chats), "conversations": int(chats.convo.nunique()),
                   "top10": round(float(per_convo.head(10).sum() / per_convo.sum()), 4)},
        "years": [{"year": int(y), "snaps": int((snaps.ts.dt.year == y).sum()), "chats": int((chats.ts.dt.year == y).sum())} for y in years],
        "parts": part_shares(pd.concat([snaps[snaps.IsSender].ts, sent_chats.ts])),
    }

    allowed = {p for p, _, _ in PARTS} | {out["generated"]} | \
        {"generated", "stats", "friends", "following", "tags_weighted", "tags_total", "totals", "snaps",
         "snaps_sent_share", "video_share", "chats", "chats_sent", "conversations", "top10", "years", "year", "parts", "part", "share"}
    leaked = [s for s in strings(out) if s not in allowed]
    assert not leaked, f"unexpected strings in output: {leaked[:5]}"

    (ROOT / "docs" / "data_snapchat.js").write_text("window.SC = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
