/* Charts for the combined social media data story. Plain SVG, no dependencies. Reads window.IG, window.RD, window.YT. */
(function () {
  const IG = window.IG, RD = window.RD, YT = window.YT, TR = window.TR;
  const NS = "http://www.w3.org/2000/svg";
  const fmt = new Intl.NumberFormat("en-US");
  const pct = (v, d = 0) => (v * 100).toFixed(d) + "%";
  const signed = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const hourLabel = (h) => (h % 12 || 12) + (h < 12 ? "am" : "pm");
  const $ = (id) => document.getElementById(id);
  const COL = { ig: "var(--ig)", rd: "var(--rd)", yt: "var(--yt)" };

  // ---- helpers --------------------------------------------------------------
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function svg(container, w, h) {
    const s = el("svg", { viewBox: `0 0 ${w} ${h}`, role: "img" });
    $(container).replaceChildren(s);
    return s;
  }
  function text(parent, x, y, str, attrs = {}) {
    const t = el("text", Object.assign({ x, y }, attrs), parent);
    t.textContent = str;
    return t;
  }
  const tip = $("tip");
  function showTip(e, html) {
    tip.innerHTML = html;
    tip.style.opacity = 1;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  const hideTip = () => (tip.style.opacity = 0);
  function hover(node, html) {
    node.addEventListener("mousemove", (e) => showTip(e, html()));
    node.addEventListener("mouseleave", hideTip);
  }
  const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  function yAxis(s, y, ticks, x0, x1, f) {
    ticks.forEach((t) => {
      el("line", { x1: x0, x2: x1, y1: y(t), y2: y(t), stroke: "var(--grid)" }, s);
      text(s, x0 - 6, y(t) + 4, f(t), { "text-anchor": "end" });
    });
  }
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
  }
  function legend(id, series) {
    $(id).innerHTML = series.map((d) => `<span><i style="background:${d.color}"></i>${d.name}</span>`).join("");
  }
  function tiles(id, items) {
    $(id).innerHTML = items.map(([v, l]) => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  }
  const byYear = (years, vals) => Object.fromEntries(years.map((y, i) => [y, vals[i]]));

  // Line chart over years. series: [{name, color, data: {year: value}}]. events: [[fractional year, label]].
  function lines(id, series, { f = pct, max = null, events = [], y0 = 2013, H = 300 } = {}) {
    const all = series.flatMap((d) => Object.keys(d.data).map(Number));
    const lo = Math.max(y0, Math.min(...all)), hi = Math.max(...all);
    const W = 900, L = 48, R = 16, T = 12, B = 28;
    const s = svg(id, W, H);
    const x = linear(lo, hi, L + 12, W - R - 12);
    const vmax = max || niceMax(Math.max(...series.flatMap((d) => Object.values(d.data))));
    const y = linear(0, vmax, H - B, T);
    yAxis(s, y, [0, vmax / 4, vmax / 2, (3 * vmax) / 4, vmax], L, W - R, f);
    for (let yr = lo; yr <= hi; yr++) text(s, x(yr), H - 8, (hi - lo > 10 ? "'" + String(yr).slice(2) : String(yr)), { "text-anchor": "middle" });
    events.forEach(([t, label], i) => {
      el("line", { x1: x(t), x2: x(t), y1: T, y2: H - B, stroke: "var(--text-muted)", "stroke-dasharray": "4 4" }, s);
      text(s, x(t) + 6, T + 12 + i * 16, label, { class: "lbl" });
    });
    series.forEach((d) => {
      const pts = Object.entries(d.data).map(([k, v]) => [+k, v]).filter(([k]) => k >= lo).sort((a, b) => a[0] - b[0]);
      el("path", { d: pts.map(([k, v], i) => `${i ? "L" : "M"}${x(k)},${y(v)}`).join(""), fill: "none", stroke: d.color, "stroke-width": 2.5, "stroke-linejoin": "round" }, s);
      pts.forEach(([k, v]) => el("circle", { cx: x(k), cy: y(v), r: 3.5, fill: d.color, stroke: "var(--surface-1)", "stroke-width": 1.5 }, s));
    });
    const step = (x(hi) - x(lo)) / Math.max(1, hi - lo);
    for (let yr = lo; yr <= hi; yr++) {
      const hit = el("rect", { x: x(yr) - step / 2, y: T, width: step, height: H - T - B, fill: "transparent" }, s);
      hover(hit, () => `<b>${yr}</b><br>` + series.filter((d) => d.data[yr] != null)
        .map((d) => `<span class="chip" style="background:${d.color}"></span>${d.name} <span class="m">${f(d.data[yr])}</span>`).join("<br>"));
    }
    legend(id.replace(/-chart$/, "") + "-legend", series);
  }

  function bars(id, labels, vals, tipFmt, color, { labelEvery = 1, axisFmt = pct, W = 900, H = 220 } = {}) {
    const L = 44, R = 4, T = 8, B = 24;
    const s = svg(id, W, H);
    const max = niceMax(Math.max(...vals));
    const y = linear(0, max, H - B, T);
    yAxis(s, y, [0, max / 2, max], L, W - R, axisFmt);
    const bw = (W - L - R) / vals.length;
    vals.forEach((v, i) => {
      const x = L + i * bw + 2, top = y(v), base = H - B, w = bw - 4;
      const r = Math.min(4, (base - top) / 2, w / 2);
      el("path", { d: `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`, fill: color }, s);
      const hit = el("rect", { x: L + i * bw, y: T, width: bw, height: H - B - T, fill: "transparent" }, s);
      hover(hit, () => `<b>${labels[i]}</b><br>${tipFmt(v)}`);
      if (i % labelEvery === 0) text(s, x + w / 2, H - 6, labels[i], { "text-anchor": "middle" });
    });
  }

  // ---- data shaping -----------------------------------------------------------
  const Y = YT.per_year, A = IG.algorithm, RY = RD.per_year;
  const yt = (k) => Object.fromEntries(Y.map((d) => [d.year, d[k]]));
  const ig = (k) => Object.fromEntries(A.map((d) => [d.year, d[k]]));
  const ytFull = Y.filter((d) => d.year < new Date().getFullYear() || d.likes > 2000);  // drop a partial current year from per-year counts
  const relPeak = (o) => { const m = Math.max(...Object.values(o)); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / m])); };
  const lastYT = Y[Y.length - 1], firstYT = Y[0];
  const rdSub = byYear(RD.subscribed.index, RD.subscribed.share);
  const catShare = (D, name) => byYear(D.share_year.index, D.share_year.values.map((r) => r[D.categories.indexOf(name)]));

  // ---- hero --------------------------------------------------------------------
  const igPeak = A.reduce((b, r) => (r.growth > b.growth ? r : b));
  tiles("tiles", [
    [fmt.format(RD.totals.upvotes), "Reddit upvotes since 2017"],
    [fmt.format(YT.totals.likes), `YouTube likes since ${YT.totals.first}`],
    [Math.round(igPeak.growth) + "×", "more Instagram likes at the peak than before Reels"],
    [pct(A[A.length - 1].reel_share), "of this year's Instagram likes are Reels"],
  ]);

  // ---- 01 habit ------------------------------------------------------------------
  lines("habit-chart", [
    { name: "Reddit upvotes", color: COL.rd, data: relPeak(byYear(RY.index, RY.upvotes)) },
    { name: "YouTube likes", color: COL.yt, data: relPeak(Object.fromEntries(ytFull.map((d) => [d.year, d.likes]))) },
    { name: "Instagram likes", color: COL.ig, data: relPeak(ig("growth")) },
  ], { max: 1, y0: 2013 });
  const rdPeakI = RY.upvotes.indexOf(Math.max(...RY.upvotes));
  $("f-habit").innerHTML = `<b>Reddit faded as Reels arrived.</b> My Reddit upvotes peaked in ${RY.index[rdPeakI]} (${fmt.format(RY.upvotes[rdPeakI])}) and fell to ${fmt.format(RY.upvotes[RY.index.indexOf(2025)])} in 2025. Instagram went the other way: my likes jumped ${Math.round(igPeak.growth)}× in ${igPeak.year}, the year after Reels took over my feed. YouTube held steady through it all. Reddit is the one platform here where, for most of my time on it, I picked the communities and the ranking was the same for everyone. Instagram's Reels feed is the most personalized. I didn't plan the switch, but my attention ended up there.`;

  const rdW = byYear(RY.index, RY.written);
  lines("talk", [
    { name: "Reddit posts & comments", color: COL.rd, data: rdW },
    { name: "YouTube comments & chats", color: COL.yt, data: Object.fromEntries(Y.map((d) => [d.year, d.comments + d.live_chats])) },
  ], { f: (v) => fmt.format(Math.round(v)) });
  const ytTalkPeak = Y.reduce((b, r) => (r.comments > b.comments ? r : b));
  const ytLate = Y.filter((d) => d.year >= 2022), talkLate = ytLate.reduce((t, d) => t + d.comments + d.live_chats, 0), likeLate = ytLate.reduce((t, d) => t + d.likes, 0);
  $("f-talk").innerHTML = `<b>I went from participant to audience.</b> I wrote ${fmt.format(ytTalkPeak.comments)} YouTube comments in ${ytTalkPeak.year} and ${fmt.format(Y.find((d) => d.year === 2025).comments)} in 2025. On Reddit I wrote ${rdW[2017]} posts and comments in 2017 and ${rdW[2025]} in 2025. Since 2022 I've liked about ${fmt.format(Math.round(likeLate / Math.max(1, talkLate)))} YouTube videos for every comment or chat message I've written. Algorithmic feeds don't need me to say anything; a like, or just watching, is enough signal.`;

  const LQ = TR.lockdown.youtube, lq = Object.keys(LQ);
  bars("lockdown", lq.map((k) => k.replace("Q", " Q")), lq.map((k) => LQ[k]), (v) => fmt.format(v) + " likes", COL.yt, { labelEvery: 2, axisFmt: (v) => fmt.format(Math.round(v)) });
  (function markLockdown() {
    const s = $("lockdown").querySelector("svg"), i = lq.indexOf("2020Q1"), bw = (900 - 44 - 4) / lq.length, x = 44 + (i + 0.67) * bw;
    el("line", { x1: x, x2: x, y1: 8, y2: 196, stroke: "var(--text-muted)", "stroke-dasharray": "4 4" }, s);
  })();
  const sum = (o, y) => Object.entries(o).filter(([k]) => k.startsWith(y)).reduce((t, [, v]) => t + v, 0);
  $("f-lockdown").innerHTML = `<b>The pandemic went to YouTube and Reddit, not Instagram.</b> I liked ${fmt.format(sum(LQ, "2019"))} YouTube videos in 2019 and ${fmt.format(sum(LQ, "2020"))} in 2020, peaking at ${fmt.format(LQ["2021Q1"])} in the first quarter of 2021. My Reddit upvotes also hit their all-time high in 2020. Instagram barely moved (${fmt.format(sum(TR.lockdown.instagram, "2019"))} likes in 2019, ${fmt.format(sum(TR.lockdown.instagram, "2020"))} in 2020). The big Instagram jump came two years later with Reels, so it was the feed that pulled me in, not the extra free time.`;

  // ---- 02 algorithm ---------------------------------------------------------------
  lines("top10", [
    { name: "YouTube", color: COL.yt, data: yt("top10_share") },
    { name: "Instagram", color: COL.ig, data: ig("top10_share") },
  ], { max: 1 });
  legend("top10-legend", [{ name: "YouTube", color: COL.yt }, { name: "Instagram", color: COL.ig }]);
  lines("subs", [
    { name: "Reddit (subscribed subreddits)", color: COL.rd, data: rdSub },
    { name: "YouTube (subscribed channels)", color: COL.yt, data: yt("subscribed_share") },
    { name: "Instagram (followed accounts)", color: COL.ig, data: ig("followed_share") },
  ], { max: 1 });
  legend("subs-legend", [{ name: "Reddit (subscribed subreddits)", color: COL.rd }, { name: "YouTube (subscribed channels)", color: COL.yt }, { name: "Instagram (followed accounts)", color: COL.ig }]);
  const yt25 = Y.find((d) => d.year === 2025);
  $("f-algo").innerHTML = `<b>On every platform, my favorites stopped mattering.</b> My top 10 YouTube channels fell from ${pct(firstYT.top10_share)} of my likes (${firstYT.year}) to ${pct(yt25.top10_share)} (2025); my top 10 Instagram accounts from ${pct(A[0].top10_share)} to ${pct(A[A.length - 1].top10_share)}. Only ${pct(A[A.length - 1].followed_share)} of this year's Instagram likes went to accounts I follow. Reddit held out, until I mostly stopped using it.`;

  const NA = TR.never_again;
  lines("once", [
    { name: "Instagram accounts", color: COL.ig, data: NA.instagram },
    { name: "YouTube channels", color: COL.yt, data: NA.youtube },
  ], { max: 1, y0: 2016 });
  $("f-once").innerHTML = `<b>Creators became disposable.</b> Of the Instagram accounts I first liked in 2019, ${pct(NA.instagram[2019])} never got a second like. For accounts I found in 2025, it's ${pct(NA.instagram[2025])}. YouTube went from ${pct(NA.youtube[2016])} in 2016 to ${pct(NA.youtube[2025])} in 2025. The feed keeps pulling in new creators, and it's the feed I come back to, not any one person on it.`;

  // ---- 03 short-form ---------------------------------------------------------------
  lines("short-chart", [
    { name: "Instagram: Reels", color: COL.ig, data: ig("reel_share") },
    { name: "YouTube: tagged #shorts", color: COL.yt, data: Object.fromEntries(Y.filter((d) => d.year >= 2017).map((d) => [d.year, d.short_share])) },
  ], { max: 1, events: [[2020 + 7 / 12, "Reels"], [2021 + 2 / 12, "Shorts"]] });
  const ytShortPeak = Y.reduce((b, r) => (r.short_share > b.short_share ? r : b));
  $("f-short").innerHTML = `<b>The short-video switch happened within two years on both apps.</b> Reels were ${pct(A.find((d) => d.year === 2020).reel_share)} of my Instagram likes in 2020, ${pct(A.find((d) => d.year === 2022).reel_share)} in 2022 and ${pct(A[A.length - 1].reel_share)} in ${A[A.length - 1].year}. On YouTube, liked videos tagged #shorts went from zero before 2021 to ${pct(ytShortPeak.short_share)} in ${ytShortPeak.year}, and that's a floor, since most Shorts carry no tag. Short video is the format where the app picks every single item for you.`;

  lines("style", [
    { name: "Emoji in title", color: COL.yt, data: TR.emoji.youtube },
    { name: "ALL-CAPS word in title", color: "var(--other)", data: TR.caps.youtube },
  ], { max: 0.5, y0: 2016 });
  $("f-style").innerHTML = `<b>What gets my like looks different now.</b> In 2016–17, about ${pct(TR.caps.youtube[2017])} of the YouTube videos I liked shouted a word in ALL CAPS, the classic clickbait title. By 2025 that fell to ${pct(TR.caps.youtube[2025])}, while titles with an emoji went from almost none to ${pct(TR.emoji.youtube[2025])}. That's the Shorts style: a short caption, an emoji and hashtags written for a swipe feed rather than a search result or thumbnail grid. Emoji in the Instagram captions I liked peaked the same year Reels took over (${pct(TR.emoji.instagram[2022])} in 2022, up from ${pct(TR.emoji.instagram[2019])} in 2019).`;

  // ---- 04 doomscrolling ----------------------------------------------------------------
  const W8 = YT.watch;
  tiles("doom-tiles", [
    [pct(IG.sessions.binge_share), "of Instagram likes came in sessions of 20+"],
    [pct(yt25.binge_share), "of 2025 YouTube likes came in sessions of 20+"],
  ].concat(W8 ? [[W8.per_day, `YouTube videos watched per day (last ${W8.days} days)`], [pct(1 - W8.subscribed_share), "of those from channels I don't subscribe to"]] : []));
  $("ig-binge").textContent = pct(IG.sessions.binge_share);
  const by = Y.filter((d) => d.year >= 2016);
  bars("binge", by.map((d) => String(d.year)), by.map((d) => d.binge_share), (v) => pct(v, 1) + " of likes in 20+ like sessions", COL.yt);
  $("hours-sub").textContent = `Share of likes, ${YT.hours_years.replace("-", "–")}`;
  // Same four parts of the day as the Instagram chart.
  const parts = [["Morning", 6, 12], ["Afternoon", 12, 17], ["Evening", 17, 22], ["Night", 22, 30]];
  const ytParts = parts.map(([, a, b]) => { let s = 0; for (let h = a; h < b; h++) s += YT.hours[h % 24]; return s; });
  bars("yt-hours", parts.map((p) => p[0]), ytParts, (v) => pct(v, 1) + " of likes", COL.yt, { W: 440 });
  bars("ig-heat", IG.time_of_day.map((d) => d.label), IG.time_of_day.map((d) => d.share), (v) => pct(v, 1) + " of likes", COL.ig, { W: 440 });
  const early = Y.filter((d) => d.year <= 2019), eBinge = early.reduce((t, d) => t + d.binge_share * d.likes, 0) / early.reduce((t, d) => t + d.likes, 0);
  $("f-doom").innerHTML = `<b>My scrolling went from checking in to sinking in.</b> Up to 2019, ${pct(eBinge, 1)} of my YouTube likes came in long runs of 20 or more; by 2025 it was ${pct(yt25.binge_share)}, the same year short video became a steady part of what I liked. On Instagram, ${pct(IG.sessions.binge_share)} of all my likes came in sessions like that. It isn't a late-night habit either: on both apps my activity is spread through the whole day.` +
    (W8 ? ` My recent YouTube watch history, the only stretch the export keeps, averages ${W8.per_day} videos a day, and ${pct(1 - W8.subscribed_share)} of them came from channels I don't subscribe to.` : "");

  // ---- 05 feedback ---------------------------------------------------------------------
  lines("neg", [
    { name: "Dislikes", color: COL.yt, data: yt("dislikes") },
    { name: '"Not interested"', color: "var(--s7)", data: yt("not_interested") },
  ], { f: (v) => fmt.format(Math.round(v)), events: [[2021 + 10 / 12, "Dislike counts hidden"]] });
  const dPeak = Y.reduce((b, r) => (r.dislikes > b.dislikes ? r : b));
  const niPeak = Y.reduce((b, r) => (r.not_interested > b.not_interested ? r : b));
  $("f-feedback").innerHTML = `<b>My feed hears almost nothing but "yes".</b> I disliked ${fmt.format(dPeak.dislikes)} YouTube videos in ${dPeak.year}, and ${fmt.format(yt25.dislikes)} in 2025, while still liking thousands. "Not interested" peaked at ${niPeak.not_interested} in ${niPeak.year} and fell to ${yt25.not_interested}. On Instagram I've tapped "Not interested" 407 times ever, against tens of thousands of likes. Hiding public dislike counts made the button feel pointless, and short video makes it easier to swipe past something than to reject it. Either way, the model learns mostly from what I engage with.`;

  // ---- 06 AI ------------------------------------------------------------------------
  lines("ai-chart", [
    { name: "Instagram: Tech & AI", color: COL.ig, data: catShare(IG, "Tech & AI") },
    { name: "Reddit: Science, Tech & Data", color: COL.rd, data: catShare(RD, "Science, Tech & Data") },
    { name: "YouTube: AI in title", color: COL.yt, data: Object.fromEntries(Y.filter((d) => d.year >= 2017).map((d) => [d.year, d.ai_share])) },
  ], { f: (v) => pct(v, 1) });
  const igT = catShare(IG, "Tech & AI"), rdT = catShare(RD, "Science, Tech & Data");
  $("f-ai").innerHTML = `<b>More of my feed is about tech and AI.</b> Tech &amp; AI rose from ${pct(igT[2019], 1)} of my Instagram likes in 2019 to ${pct(igT[2026], 1)} in 2026. On Reddit, science and tech went from ${pct(rdT[2017], 1)} of upvotes in 2017 to ${pct(rdT[2026], 1)} in 2026. YouTube videos with AI in the title are still rare, but ${lastYT.year} is the high point so far at ${pct(lastYT.ai_share, 1)}. None of this means the apps pushed AI content on me. Part of it is my own interests (I study data science). What it does show is that the systems ranking my feed and the topic I'm reading about have become the same thing.`;

  $("yt-ni").textContent = fmt.format(YT.totals.not_interested);

  // ---- 08 platforms ------------------------------------------------------------------
  lines("ig-cat-chart", [
    { name: "Pets & Animals", color: COL.ig, data: catShare(IG, "Pets & Animals") },
    { name: "Friends & Life Updates", color: "var(--other)", data: catShare(IG, "Friends & Life Updates") },
  ], { max: 0.25 });
  lines("rd-cat-chart", [
    { name: "Interesting & Viral", color: COL.rd, data: catShare(RD, "Interesting & Viral") },
    { name: "Memes & Humor", color: "var(--other)", data: catShare(RD, "Memes & Humor") },
  ], { max: 0.5 });
  (function sentiment() {
    const sm = IG.sentiment.month;
    const yrs = [...new Set(sm.index.map((m) => +m.slice(0, 4)))];
    const avg = Object.fromEntries(yrs.map((yr) => {
      const v = sm.values.filter((_, i) => sm.index[i].startsWith(yr));
      return [yr, v.reduce((a, b) => a + b, 0) / v.length];
    }));
    bars("sent", yrs.map(String), yrs.map((y) => avg[y]), (v) => "mean sentiment " + signed(v), "var(--pos)", { axisFmt: signed });
  })();

  // ---- 09 · iMessage ----------------------------------------------------------
  (function () {
    const IM = window.IM;
    if (!IM || !$("im-tiles")) return;
    const T = IM.totals;
    tiles("im-tiles", [
      [fmt.format(T.sent), "texts I sent in a year"],
      [T.per_day, "texts per day"],
      [fmt.format(T.tapbacks_given), "tapbacks I gave"],
      [IM.reply_minutes.median + " min", "median time to reply"],
    ]);
    // Two-platform comparison: horizontal bars, each in its platform's color, labelled directly.
    const igTop = IG.algorithm[IG.algorithm.length - 1];
    const rows = [["Instagram: top 10 accounts", igTop.top10_share, COL.ig], ["iMessage: top 10 conversations", IM.concentration.top10, "var(--im)"]].concat(window.SC ? [["Snapchat: top 10 conversations", window.SC.totals.top10, "var(--sc)"]] : []);
    const W = 900, rowH = 44, L = 250, s = svg("im-conc", W, rows.length * rowH + 8);
    rows.forEach(([label, v, color], i) => {
      const y = 8 + i * rowH, w = (W - L - 70) * v;
      text(s, 0, y + 20, label);
      el("path", { d: `M${L},${y + 6}H${L + w - 4}Q${L + w},${y + 6} ${L + w},${y + 10}V${y + 24}Q${L + w},${y + 28} ${L + w - 4},${y + 28}H${L}Z`, fill: color }, s);
      text(s, L + w + 8, y + 22, pct(v));
      hover(el("rect", { x: 0, y, width: W, height: rowH, fill: "transparent" }, s), () => `<b>${label}</b><br>${pct(v, 1)} of my activity`);
    });
    // Same four parts of the day as the YouTube and Instagram charts.
    const imParts = parts.map(([, a, b]) => { let s = 0; for (let h = a; h < b; h++) s += IM.hours[h % 24]; return s; });
    bars("im-hours", parts.map((p) => p[0]), imParts, (v) => pct(v, 1) + " of texts sent", "var(--im)");
    const taps = IM.tapbacks.slice().sort((a, b) => b.n - a.n);
    const tapTotal = taps.reduce((a, d) => a + d.n, 0);
    bars("im-taps", taps.map((d) => d.type), taps.map((d) => d.n / tapTotal), (v) => pct(v, 1) + " of tapbacks", "var(--im)");
    const full = IM.months.slice(1, -1);  // first and last months are partial
    const mlabel = (m) => new Date(m + "-15").toLocaleString("en-US", { month: "short", year: "2-digit" });
    $("im-months-sub").textContent = `${mlabel(full[0].month)} – ${mlabel(full[full.length - 1].month)} (full months only)`;
    bars("im-months", full.map((d) => mlabel(d.month)), full.map((d) => d.sent), (v) => fmt.format(v) + " texts", "var(--im)", { axisFmt: (v) => fmt.format(v) });
    const top = taps[0];
    $("f-texts").innerHTML = `<b>The opposite of a feed.</b> My top 10 Instagram accounts got ${pct(igTop.top10_share)} of my likes this year; my top 10 conversations got ${pct(IM.concentration.top10)} of my texts${window.SC ? ` (${pct(window.SC.totals.top10)} on Snapchat)` : ""}. I reply in a median of ${IM.reply_minutes.median} minutes, and my go-to tapback is ${top.type}.`;
  })();

  // ---- 10 · Apple Health -------------------------------------------------------
  (function () {
    const HL = window.HL, IM = window.IM;
    if (!HL || !$("hl-tiles")) return;
    const S = HL.steps, SL = HL.sleep;
    tiles("hl-tiles", [
      [fmt.format(S.per_day), "steps per day since 2023"],
      [pct(S.weekend / S.weekday - 1), "more steps on weekends"],
      [pct(S.over_10k), "of days over 10,000 steps"],
      [SL.hours.toFixed(1) + " h", "median time in bed (2023–24)"],
    ]);
    // Grouped bars: parts of the day x activity. Legend + a direct label on the tallest bar in each group.
    const series = [
      // Order checked for colorblind separation between neighbors.
      { name: "Texts sent", color: "var(--im)", vals: IM ? parts.map(([, a, b]) => { let t = 0; for (let h = a; h < b; h++) t += IM.hours[h % 24]; return t; }) : null },
      { name: "Steps", color: "var(--hl)", vals: S.parts.map((d) => d.share) },
      { name: "YouTube likes", color: COL.yt, vals: ytParts },
      { name: "Instagram likes", color: COL.ig, vals: IG.time_of_day.map((d) => d.share) },
    ].filter((d) => d.vals);
    legend("hl-parts-legend", series);
    const W = 900, H = 240, L = 44, R = 4, T = 8, B = 24, s = svg("hl-parts", W, H);
    const max = niceMax(Math.max(...series.flatMap((d) => d.vals)));
    const y = linear(0, max, H - B, T);
    yAxis(s, y, [0, max / 2, max], L, W - R, pct);
    const gw = (W - L - R) / parts.length, bw = Math.min(40, (gw - 24) / series.length);
    parts.forEach(([label], i) => {
      const x0 = L + i * gw + (gw - bw * series.length) / 2;
      series.forEach((d, j) => {
        const v = d.vals[i], x = x0 + j * bw + 1, w = bw - 2, top = y(v), base = H - B, r = Math.min(4, (base - top) / 2, w / 2);
        el("path", { d: `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`, fill: d.color }, s);
        text(s, x + w / 2, top - 4, pct(v), { "text-anchor": "middle", class: "val" });
        hover(el("rect", { x: x - 1, y: T, width: bw, height: H - B - T, fill: "transparent" }, s), () => `<b>${label} · ${d.name}</b><br>${pct(v, 1)} of the day's total`);
      });
      text(s, L + i * gw + gw / 2, H - 6, label, { "text-anchor": "middle" });
    });
    const mlabel = (m) => new Date(m + "-15").toLocaleString("en-US", { month: "short", year: "2-digit" });
    $("hl-months-sub").textContent = `${mlabel(S.months[0].month)} – ${mlabel(S.months[S.months.length - 1].month)}, full months only`;
    bars("hl-months", S.months.map((d) => mlabel(d.month)), S.months.map((d) => d.per_day), (v) => fmt.format(v) + " steps a day", "var(--hl)", { labelEvery: 6, axisFmt: (v) => fmt.format(v) });
    const night = (name) => series.find((d) => d.name === name).vals[3];
    const nv = series.filter((d) => d.name !== "Steps").map((d) => d.vals[3]), others = `${pct(Math.min(...nv))}–${pct(Math.max(...nv))}`;
    $("f-health").innerHTML = `<b>Night is the one time the phone has me to itself.</b> Only ${pct(night("Steps"))} of my steps happen after 10pm, against ${others} of my texts and likes. Steps have held near ${fmt.format(S.per_day)} a day for three years, with ${pct(S.weekend / S.weekday - 1)} more on weekends.`;
  })();

  // ---- Snapchat (sections 07 and 09) --------------------------------------------
  (function () {
    const SC = window.SC;
    if (!SC) return;
    const st = SC.stats;
    $("sc-tag-n").textContent = st.tags_weighted;
    bars("sc-years", SC.years.map((d) => String(d.year)), SC.years.map((d) => d.snaps + d.chats),
      (v) => fmt.format(v) + " snaps + chat messages", "var(--sc)", { axisFmt: (v) => fmt.format(v) });
  })();
})();
