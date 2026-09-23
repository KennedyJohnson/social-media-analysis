"""Assign each liked post a broad interest category and a caption sentiment.

Categories: cosine similarity between a sentence embedding of the post text
(caption + hashtags) and short descriptions of each category.
Sentiment: cardiffnlp/twitter-roberta-base-sentiment-latest, which is trained
on tweets and copes with emoji and slang better than lexicon methods.

Writes data/classified.pkl (local only).
"""
import re
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sentence_transformers import SentenceTransformer
from transformers import pipeline

DATA = Path(__file__).resolve().parent.parent / "data"
MIN_SIM = 0.20  # below this a post is too vague to categorise

CATEGORIES = {
    "Memes & Humor": "funny meme joke comedy skit, hilarious relatable humor",
    "Pets & Animals": "cute cats, dogs, kittens, puppies, pets and wild animals",
    "Cars & Motorsport": "cars, supercars, engines, horsepower, racing, trucks, driving",
    "Sports": "football, basketball, baseball, hockey, soccer, athletes, game highlights",
    "Fitness & Gym": "gym workout, lifting weights, running, training, bodybuilding, exercise",
    "Food & Cooking": "food, recipe, cooking, restaurant, eating, baking, drinks",
    "Music": "music, song, band, concert, rapper, album, singing, guitar",
    "Movies, TV & Pop Culture": "movie, film, tv show, celebrity, actor, anime, cartoon, pop culture",
    "Gaming": "video games, gamer, playstation, xbox, nintendo, minecraft, fortnite, esports",
    "Tech & AI": "technology, AI, software, coding, computers, gadgets, iphone, startup",
    "Money & Business": "finance, investing, stocks, money, business, entrepreneur, real estate, career",
    "Travel & Outdoors": "travel, nature, mountains, beach, hiking, fishing, camping, adventure",
    "Fashion & Style": "fashion, outfit, clothes, sneakers, style, streetwear",
    "Art & Design": "art, painting, drawing, design, photography, architecture",
    "Science & Learning": "science, history, space, facts, education, learning, explained",
    "News & Politics": "news, politics, government, election, world events, reporting",
    "Relationships & Dating": "relationship, girlfriend, boyfriend, dating, crush, couples",
    "College & School Life": "college, university, students, campus, class, exams, school",
    "Motivation & Self-Improvement": "motivation, mindset, discipline, self improvement, success quotes",
    "Friends & Life Updates": "birthday, graduation, celebrating with friends, family, personal life milestone",
}


def post_text(row):
    cap = re.sub(r"https?://\S+|@\w+", " ", row.caption)
    cap = re.sub(r"\s+", " ", cap).strip()
    tags = " ".join("#" + t for t in row.hashtags[:10])
    return f"{cap[:400]} {tags}".strip()


if __name__ == "__main__":
    likes = pd.read_pickle(DATA / "likes.pkl")
    texts = likes.apply(post_text, axis=1).tolist()
    has_text = np.array([len(t) > 3 for t in texts])

    emb_model = SentenceTransformer("all-MiniLM-L6-v2")
    emb = emb_model.encode(texts, batch_size=256, normalize_embeddings=True, show_progress_bar=True)
    cat_emb = emb_model.encode(list(CATEGORIES.values()), normalize_embeddings=True)
    sims = emb @ cat_emb.T
    names = np.array(list(CATEGORIES))
    category = np.where((sims.max(1) >= MIN_SIM) & has_text, names[sims.argmax(1)], "Unclear")
    np.save(DATA / "embeddings.npy", emb)

    torch.set_num_threads(max(1, torch.get_num_threads()))
    clf = pipeline("sentiment-analysis", model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                   truncation=True, max_length=128, top_k=None)
    scores = np.full(len(texts), np.nan)
    labels = np.full(len(texts), None, dtype=object)
    idx = np.flatnonzero(has_text)
    for i in range(0, len(idx), 512):
        chunk = idx[i:i + 512]
        for j, out in zip(chunk, clf([texts[k] for k in chunk], batch_size=64)):
            p = {d["label"]: d["score"] for d in out}
            scores[j] = p["positive"] - p["negative"]
            labels[j] = max(p, key=p.get)
        print(f"sentiment {i + len(chunk)}/{len(idx)}", flush=True)

    pd.DataFrame({"category": category, "cat_sim": sims.max(1), "sentiment": scores,
                  "sentiment_label": labels}, index=likes.index).to_pickle(DATA / "classified.pkl")
    print(pd.Series(category).value_counts().to_string())
