"""Assign each subreddit to a category.

Labels are hand-written in data/sub_labels.txt (one "Category: sub sub ..."
line per category). That file is gitignored: a list of which subreddits I
voted in is exactly what this project doesn't publish. Subreddit names are
too short and cryptic to embed reliably, so there's no automatic fallback;
anything unlabelled counts as Other.

Categories in WITHHELD are counted but never broken out on the site.

Usage: python scripts/classify.py
"""
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "data"
WITHHELD = {"Dating & Relationships", "Health", "Adult"}

# Published category descriptions (no subreddit names).
CATEGORIES = {
    "Memes & Humor": "memes, jokes, shitposts and comedy",
    "Interesting & Viral": "interesting pictures, satisfying and chaotic videos, gifs",
    "Streamers & YouTubers": "Twitch clips and communities around individual creators",
    "Questions & Discussion": "ask-me threads, opinions, stories and advice",
    "Movies, TV & Anime": "shows, films, Star Wars, Marvel, anime and cartoons",
    "Gaming": "games, esports and PC hardware",
    "News & Politics": "news, world events and politics",
    "Cringe & Drama": "public freakouts, cringe and people behaving badly",
    "Animals & Wholesome": "cute animals and feel-good posts",
    "Science, Tech & Data": "science, tech, programming, data and history",
    "Sports & Fitness": "pro sports, running and the gym",
    "Money & Work": "investing, personal finance and jobs",
    "School & College": "high school, college and applying to college",
    "Local (Minnesota)": "Minnesota and Twin Cities communities",
    "Food & Home": "food, style and living spaces",
    "Music & Art": "music, art and books",
}


def load_labels():
    labels = {}
    for line in (DATA / "sub_labels.txt").read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            cat, names = line.split(":", 1)
            labels.update({s: cat.strip() for s in names.split()})
    return labels


def main():
    items = pd.read_csv(DATA / "items.csv.gz")
    labels = load_labels()
    items["category"] = items["sub"].map(labels).fillna("Other")
    items.loc[items.category.isin(WITHHELD), "category"] = "Withheld"
    items.to_csv(DATA / "items_labelled.csv.gz", index=False)
    print(items.category.value_counts(normalize=True).round(3).to_string())


if __name__ == "__main__":
    main()
