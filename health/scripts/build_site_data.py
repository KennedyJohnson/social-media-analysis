"""Aggregate Apple Health (data/iphone/HealthDomain) into docs/data_health.js.

Only steps and time-in-bed, aggregated by year / month / part of the day. No weight, heart rate,
medical records, other people's shared profiles or individual timestamps. The build fails if any
string other than the fixed keys below is written.
"""
import json
import sqlite3
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
HD = ROOT / "data" / "iphone" / "HealthDomain"
TZ = "America/Chicago"
STEPS, SLEEP, IN_BED = 7, 63, 0
PARTS = [("Morning", 6, 12), ("Afternoon", 12, 17), ("Evening", 17, 22), ("Night", 22, 30)]


def load(data_type, value_table):
    h = sqlite3.connect(HD / "Health__healthdb_secure.sqlite")
    h.execute(f"attach '{HD / 'Health__healthdb.sqlite'}' as m")
    val = "q.quantity" if value_table == "quantity_samples" else "q.value"
    # iPhone only: the watch also counts steps, and mixing the two double-counts.
    d = pd.read_sql(f"""
        select s.start_date, s.end_date, {val} v from samples s
        join {value_table} q on q.data_id = s.data_id
        join objects o on o.data_id = s.data_id
        join data_provenances dp on dp.ROWID = o.provenance
        join m.sources src on src.ROWID = dp.source_id
        where s.data_type = ? and src.product_type like 'iPhone%'""", h, params=(data_type,))
    for c in ("start_date", "end_date"):
        d[c] = (pd.Timestamp("2001-01-01", tz="UTC") + pd.to_timedelta(d[c], unit="s")).dt.tz_convert(TZ)
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


def clock(minutes_after_noon):
    return round(float(minutes_after_noon) / 60, 2)  # hours after noon, e.g. 12.5 = 12:30am


def main():
    st = load(STEPS, "quantity_samples")
    st["day"] = st.start_date.dt.date
    daily = st.groupby("day").v.sum()
    daily = daily[daily >= 500]  # days the phone basically stayed home
    daily.index = pd.to_datetime(daily.index)
    first_full = (daily.index.min() + pd.offsets.MonthBegin(1)).to_period("M")
    last_full = (daily.index.max() - pd.offsets.MonthEnd(1)).to_period("M")
    monthly = daily.groupby(daily.index.to_period("M")).mean()
    monthly = monthly[(monthly.index >= first_full) & (monthly.index <= last_full)]
    yearly = daily.groupby(daily.index.year).agg(["mean", "size"])
    hour_share = st.groupby(st.start_date.dt.hour).v.sum()
    hour_share = (hour_share / hour_share.sum()).reindex(range(24), fill_value=0)
    parts = [{"part": n, "share": round(float(sum(hour_share[h % 24] for h in range(a, b))), 4)} for n, a, b in PARTS]
    weekend = daily.index.dayofweek >= 5

    sl = load(SLEEP, "category_samples")
    sl = sl[sl.v == IN_BED].copy()
    sl["night"] = (sl.start_date - pd.Timedelta(hours=12)).dt.date  # a night belongs to the evening it started
    nights = sl.groupby("night").agg(start=("start_date", "min"), end=("end_date", "max"))
    nights["hours"] = (nights.end - nights.start).dt.total_seconds() / 3600
    nights = nights[nights.hours.between(3, 14)]
    nights["bed"] = (nights.start.dt.hour * 60 + nights.start.dt.minute - 720) % 1440  # minutes after noon
    nights["wake"] = nights.end.dt.hour * 60 + nights.end.dt.minute
    nights["year"] = pd.to_datetime(nights.index).year
    sleep_years = [{"year": int(y), "nights": int(len(g)), "hours": round(g.hours.median(), 2),
                    "bed": clock(g.bed.median()), "wake": round(g.wake.median() / 60, 2),
                    "after_1am": round(float((g.bed >= 13 * 60).mean()), 4)}
                   for y, g in nights.groupby("year") if len(g) >= 30]

    out = {
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "steps": {
            "per_day": round(float(daily.mean())),
            "days": int(daily.size),
            "weekday": round(float(daily[~weekend].mean())), "weekend": round(float(daily[weekend].mean())),
            "over_10k": round(float((daily >= 10000).mean()), 4),
            "years": [{"year": int(y), "per_day": round(float(r["mean"])), "days": int(r["size"])} for y, r in yearly.iterrows()],
            "months": [{"month": p.strftime("%Y-%m"), "per_day": round(float(v))} for p, v in monthly.items()],
            "parts": parts,
        },
        "sleep": {"nights": int(len(nights)), "hours": round(nights.hours.median(), 2), "bed": clock(nights.bed.median()),
                  "wake": round(nights.wake.median() / 60, 2), "years": sleep_years},
    }

    allowed = {p for p, _, _ in PARTS} | {m["month"] for m in out["steps"]["months"]} | {out["generated"]} | \
        {"generated", "steps", "per_day", "days", "weekday", "weekend", "over_10k", "years", "year", "months", "month",
         "parts", "part", "share", "sleep", "nights", "hours", "bed", "wake", "after_1am"}
    leaked = [s for s in strings(out) if s not in allowed]
    assert not leaked, f"unexpected strings in output: {leaked[:5]}"

    (ROOT / "docs" / "data_health.js").write_text("window.HL = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
