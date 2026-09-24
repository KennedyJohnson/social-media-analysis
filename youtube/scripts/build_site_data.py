"""Aggregate data/events.pkl into docs/data_youtube.js.

Only counts and shares by year / hour leave data/. No titles, channels, URLs, searches or
individual timestamps. The build fails if any string other than the fixed keys below is written.
"""
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
AI = re.compile(r"\b(ai|a\.i\.|chatgpt|gpt-?\d?|openai|llm|claude|gemini|midjourney|sora|deepfake|copilot|artificial intelligence)\b", re.I)
SHORT = re.compile(r"#shorts?\b", re.I)


def sessions(ts, gap_min):
    new = ts.diff().dt.total_seconds().fillna(1e9) > gap_min * 60
    return new.cumsum()


def main():
    d = pd.read_pickle(ROOT / "data" / "events.pkl")
    d["year"] = d.ts.dt.year
    likes = d[d.action == "Liked"].copy()
    years = list(range(2013, int(likes.year.max()) + 1))

    # Subscribed at the time of the like: the activity log dates each subscription.
    subs = d[d.action == "Subscribed to"].groupby("url").ts.min()
    first_sub = likes.channel.map(subs)
    likes["subscribed"] = first_sub.notna() & (first_sub <= likes.ts)
    likes["short"] = likes.title.str.contains(SHORT)
    likes["ai"] = likes.title.str.contains(AI)
    seen = likes[likes.channel != ""].groupby("channel").ts.transform("min")
    likes["new_channel"] = (likes.channel != "") & seen.reindex(likes.index).eq(likes.ts)
    likes["sess"] = sessions(likes.ts, 10)
    size = likes.groupby("sess").size()
    likes["sess_size"] = likes.sess.map(size)

    per_year = []
    for y in years:
        l = likes[likes.year == y]
        known = l[l.channel != ""]
        top10 = known.channel.value_counts().head(10).sum() / max(len(known), 1)
        ss = size[l.sess.unique()]
        per_year.append({
            "year": y, "likes": len(l),
            "dislikes": int((d.year.eq(y) & d.action.eq("Disliked")).sum()),
            "not_interested": int((d.year.eq(y) & d.action.str.startswith("Dismissed")).sum()),
            "subscribed_n": int((d.year.eq(y) & d.action.eq("Subscribed to")).sum()),
            "short_share": round(l.short.mean(), 4),
            "ai_share": round(l.ai.mean(), 4),
            "subscribed_share": round(known.subscribed.mean(), 4),
            "new_channel_share": round(known.new_channel.mean(), 4),
            "top10_share": round(top10, 4),
            "late_share": round(l.ts.dt.hour.between(0, 3).mean(), 4),
            "median_session": float(ss.median()),
            "binge_share": round((l.sess_size >= 20).mean(), 4),
        })

    recent = likes[likes.year >= years[-1] - 3]
    hours = (recent.ts.dt.hour.value_counts(normalize=True).reindex(range(24), fill_value=0)).round(4).tolist()

    # The export's watch history only covers the most recent months.
    w = d[d.action == "Watched"].copy()
    watch = None
    if len(w):
        w["sess"] = sessions(w.ts, 30)
        g = w.groupby("sess").ts
        mins = ((g.max() - g.min()).dt.total_seconds() / 60)
        days = (w.ts.max() - w.ts.min()).days + 1
        wf = w.channel.map(subs)
        watch = {
            "n": len(w), "days": days, "per_day": round(len(w) / days, 1),
            "median_session_min": round(float(mins.median()), 1),
            "long_session_share": round(float((mins >= 60).mean()), 3),
            "subscribed_share": round(float((wf.notna() & (wf <= w.ts)).mean()), 3),
            "late_share": round(float(w.ts.dt.hour.between(0, 3).mean()), 3),
            "hours": w.ts.dt.hour.value_counts(normalize=True).reindex(range(24), fill_value=0).round(4).tolist(),
        }

    out = {"generated": pd.Timestamp.now().strftime("%Y-%m-%d"),
           "totals": {"likes": len(likes), "first": int(likes.year.min()), "subscriptions": int(len(subs)),
                      "not_interested": int(d.action.str.startswith("Dismissed").sum()),
                      "dislikes": int((d.action == "Disliked").sum())},
           "per_year": per_year, "hours": hours, "hours_years": f"{years[-1] - 3}-{years[-1]}", "watch": watch}

    # Privacy check: every string in the output must be a key or one of these values.
    allowed = {out["generated"], out["hours_years"]}
    def strings(o):
        if isinstance(o, dict):
            for v in o.values(): yield from strings(v)
        elif isinstance(o, list):
            for v in o: yield from strings(v)
        elif isinstance(o, str):
            yield o
    leaked = [s for s in strings(out) if s not in allowed]
    assert not leaked, f"unexpected strings in output: {leaked[:5]}"

    (ROOT.parent / "docs" / "data_youtube.js").write_text("window.YT = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(json.dumps(out, indent=1)[:4000])


if __name__ == "__main__":
    main()
