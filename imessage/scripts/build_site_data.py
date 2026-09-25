"""Aggregate data/imessage/sms.db into docs/data_imessage.js.

Only counts and shares by month / hour / reaction type leave data/. No names, numbers, chat
names, message text or individual timestamps. The build fails if any string other than the
fixed keys below is written.
"""
import json
import sqlite3
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "imessage" / "sms.db"
TZ = "America/Chicago"
GAP = pd.Timedelta(hours=4)  # a reply has to come within this window to count as a reply
TAPBACKS = {2000: "Love", 2001: "Like", 2002: "Dislike", 2003: "Laugh", 2004: "Emphasize", 2005: "Question", 2006: "Emoji"}


def load():
    c = sqlite3.connect(DB)
    d = pd.read_sql("""
        select m.date, m.is_from_me me, m.associated_message_type atype, m.handle_id hid, cmj.chat_id chat,
               (select count(*) from chat_handle_join chj where chj.chat_id = cmj.chat_id) members
        from message m join chat_message_join cmj on cmj.message_id = m.ROWID""", c)
    d["ts"] = (pd.Timestamp("2001-01-01", tz="UTC") + pd.to_timedelta(d.date, unit="ns")).dt.tz_convert(TZ)
    return d


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
    d = load()
    # Only conversations I actually take part in: drops verification codes, shipping alerts, etc.
    mine = d[d.me == 1].chat.unique()
    d = d[d.chat.isin(mine)]
    texts = d[d.atype == 0]
    sent, recv = texts[texts.me == 1], texts[texts.me == 0]
    taps = d[(d.me == 1) & d.atype.between(2000, 2006)]
    start, end = texts.ts.min(), texts.ts.max()

    per_chat = sent.groupby("chat").size().sort_values(ascending=False)
    group = sent[sent.members > 1]

    # reply speed: my first text after someone else's, within the gap
    t = texts.sort_values(["chat", "ts"])
    prev_me, prev_ts, same_chat = t.me.shift(), t.ts.shift(), t.chat.eq(t.chat.shift())
    mine_reply = same_chat & (t.me == 1) & (prev_me == 0) & ((t.ts - prev_ts) < GAP)
    reply_min = ((t.ts - prev_ts)[mine_reply].dt.total_seconds() / 60)

    months = pd.period_range(start.tz_localize(None).to_period("M"), end.tz_localize(None).to_period("M"), freq="M")
    by_month = sent.ts.dt.tz_localize(None).dt.to_period("M").value_counts().reindex(months, fill_value=0)
    hours = sent.ts.dt.hour.value_counts(normalize=True).reindex(range(24), fill_value=0)
    tap_counts = taps.atype.map(TAPBACKS).value_counts()

    out = {
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "span": {"start": start.strftime("%Y-%m"), "end": end.strftime("%Y-%m"), "days": int((end - start).days)},
        "totals": {
            "sent": len(sent), "received": len(recv), "tapbacks_given": len(taps),
            "tapbacks_received": int(((d.me == 0) & d.atype.between(2000, 2006)).sum()),
            "conversations": int(per_chat.size), "group_share": round(len(group) / len(sent), 4),
            "per_day": round(len(sent) / max((end - start).days, 1), 1),
        },
        "concentration": {f"top{k}": round(per_chat.head(k).sum() / per_chat.sum(), 4) for k in (1, 5, 10)},
        "reply_minutes": {"median": round(reply_min.median(), 1), "within_5": round((reply_min <= 5).mean(), 4)},
        "hours": [round(v, 4) for v in hours.tolist()],
        "late_share": round(sent.ts.dt.hour.lt(5).mean(), 4),
        "months": [{"month": p.strftime("%Y-%m"), "sent": int(n)} for p, n in by_month.items()],
        "tapbacks": [{"type": k, "n": int(tap_counts.get(k, 0))} for k in TAPBACKS.values()],
    }

    allowed = set(TAPBACKS.values()) | {m["month"] for m in out["months"]} | {out["generated"], out["span"]["start"], out["span"]["end"]} | \
        {"generated", "span", "start", "end", "days", "totals", "sent", "received", "tapbacks_given", "tapbacks_received",
         "conversations", "group_share", "per_day", "concentration", "top1", "top5", "top10", "reply_minutes", "median",
         "within_5", "hours", "late_share", "months", "month", "tapbacks", "type", "n"}
    leaked = [s for s in strings(out) if s not in allowed]
    assert not leaked, f"unexpected strings in output: {leaked[:5]}"

    (ROOT / "docs" / "data_imessage.js").write_text("window.IM = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
