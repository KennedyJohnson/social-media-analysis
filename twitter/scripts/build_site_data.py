"""Aggregate the X/Twitter archive (data/twitter) into docs/data_twitter.js.

Inputs: like.js, tweets.js, personalization.js, account.js from the archive's data/ folder.
Liked tweets and X's inferred interests are embedded with all-MiniLM-L6-v2 and matched to the same
category descriptions the Instagram pipeline uses, so "what I liked" and "what X decided I'm into" sit
on one scale. Advertisers are published only as counts per sector.

Only counts and shares. No tweet text, account names, interest names, advertiser names or timestamps.
The build fails if any string other than the fixed keys and category names below is written.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "data" / "twitter"
sys.path.insert(0, str(ROOT / "instagram" / "scripts"))
from classify import CATEGORIES, MIN_SIM  # noqa: E402

WITHHELD = {"Relationships & Dating"}  # sensitive categories stay off the page
EPOCH = 1288834974657  # Twitter snowflake epoch (ms)

# Hand-labelled sectors for the advertisers X says targeted me.
SECTORS = {
    "Politics & advocacy": "1776ProjectPac 4TobaccoRights ForGoodGov Heritage IWF IWV NewDemocracy TomKlingenstein VoiceVotePhilly VoteYes35 theuprisingmov TXRstAlliance KeepParamount plasticmakers PipeTradesUSA OfficialWSPA ACC_National BizRoundtable BuildAmericanAI realtors PhilanthropyRnd DeclareNews",
    "Government & public health": "CA_EDD CISecurity DHSBlueCampaign DHSgov FLDFS GaDPH NebraskaSOS ScreenForType1 IcangotoCollege patientssah",
    "Finance & trading": "CharlesSchwab Chase Citi Citibank FisherInvestNO FisherInvestSE fisherinvest Kalshi Plus500 capitalcom eToro",
    "Tech & telecom": "ATT ATTBusiness AirbyteHQ AlibabaGroup DatabridgeG DellTech FirstNet HPE SamsungMobileUS Starlink socialdatabase instagram RishabhAdvert voxsup TestGhost3 PowersInteract",
    "Entertainment & sports": "CallofDuty Cricketnation DisneyAulani DisneyCruise Disneyland FOXSports Fanatics MonSportsNet PlayApex Street_Fighter T2Interactive T2InteractiveUS TheAthletic Univision WaltDisneyWorld disneystore nbc paramountplus sensemovie IMVU mattsportsX eaglennsworld WBCI3",
    "Retail, food & consumer": "Gatorade HomeDepot Lowes McDonalds UberEats Walmart pepsi tylenol astepro_us thesolesupplier wearesoworthy starrylemonlime",
    "Cars & energy": "Lexus Toyota Chevron Exelon",
}
SECTOR_OF = {h.lower(): s for s, hs in SECTORS.items() for h in hs.split()}


def load(name):
    t = (D / name).read_text(encoding="utf-8")
    return json.loads(t[t.index("["):])


def clean(t):
    t = re.sub(r"https?://\S+|@\w+", " ", t or "")
    return re.sub(r"\s+", " ", t).strip()[:400]


def categorize(model, texts, cat_emb, names):
    emb = model.encode(texts, batch_size=256, normalize_embeddings=True, show_progress_bar=True)
    sims = emb @ cat_emb.T
    ok = (sims.max(1) >= MIN_SIM) & np.array([len(t) > 3 for t in texts])
    return np.where(ok, names[sims.argmax(1)], "Unclear")


def shares(cats):
    c = Counter(x for x in cats if x != "Unclear" and x not in WITHHELD)
    n = sum(c.values())
    return {k: round(v / n, 4) for k, v in c.items()}, n


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
    likes = pd.DataFrame([x["like"] for x in load("like.js")])
    likes["text"] = likes.get("fullText", "").fillna("").map(clean)
    likes["year"] = pd.to_datetime(likes.tweetId.map(lambda i: (int(i) >> 22) + EPOCH), unit="ms").dt.year
    tweets = [x["tweet"] for x in load("tweets.js")]
    p = load("personalization.js")[0]["p13nData"]
    interests = [i["name"] for i in p["interests"]["interests"] if not i.get("isDisabled")]
    shows = p["interests"]["shows"]
    advertisers = p["interests"]["audienceAndAdvertisers"]["advertisers"]
    created = pd.Timestamp(load("account.js")[0]["account"]["createdAt"])

    model = SentenceTransformer("all-MiniLM-L6-v2")
    names = np.array(list(CATEGORIES))
    cat_emb = model.encode(list(CATEGORIES.values()), normalize_embeddings=True)
    likes["category"] = categorize(model, likes.text.tolist(), cat_emb, names)
    int_cats = categorize(model, interests, cat_emb, names)

    like_sh, like_n = shares(likes.category)
    int_sh, int_n = shares(int_cats)
    cats = sorted(set(like_sh) | set(int_sh), key=lambda k: -(like_sh.get(k, 0) + int_sh.get(k, 0)))
    compare = [{"cat": k, "likes": like_sh.get(k, 0), "interests": int_sh.get(k, 0)} for k in cats]

    # How many of X's inferred interests literally appear in something I liked.
    blob = "\n".join(likes.text.str.lower())
    def seen(name):
        n = re.sub(r"^[$#]", "", name.lower())
        return len(n) > 2 and re.search(r"(?<![a-z0-9])" + re.escape(n) + r"(?![a-z0-9])", blob) is not None
    matched = sum(seen(i) for i in interests)

    years = likes[likes.year >= 2010].groupby("year").size()
    sec = Counter(SECTOR_OF.get(a.lstrip("@").lower(), "Other") for a in advertisers)
    t_years = Counter(pd.to_datetime(t["created_at"], format="%a %b %d %H:%M:%S %z %Y").year for t in tweets)

    out = {
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "totals": {"likes": len(likes), "likes_text": int((likes.text.str.len() > 3).sum()), "tweets": len(tweets),
                   "tweets_rt": sum(t["full_text"].startswith("RT @") for t in tweets),
                   "interests": len(interests), "interests_seen": int(matched), "shows": len(shows),
                   "advertisers": len(advertisers), "audiences": int(p["interests"]["audienceAndAdvertisers"]["numAudiences"]),
                   "account_year": int(created.year), "likes_categorized": like_n, "interests_categorized": int_n},
        "like_years": [{"year": int(y), "likes": int(n)} for y, n in years.items()],
        "tweet_years": [{"year": int(y), "tweets": int(n)} for y, n in sorted(t_years.items())],
        "compare": compare,
        "sectors": [{"sector": s, "n": n} for s, n in sec.most_common()],
    }

    allowed = set(CATEGORIES) | set(SECTORS) | {"Other", out["generated"]} | \
        {"generated", "totals", "likes", "likes_text", "tweets", "tweets_rt", "interests", "interests_seen", "shows",
         "advertisers", "audiences", "account_year", "likes_categorized", "interests_categorized", "like_years", "year",
         "tweet_years", "compare", "cat", "sectors", "sector", "n"}
    leaked = [s for s in strings(out) if s not in allowed]
    assert not leaked, f"unexpected strings in output: {leaked[:5]}"

    (ROOT / "docs" / "data_twitter.js").write_text("window.TW = " + json.dumps(out, separators=(",", ":")) + ";\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
