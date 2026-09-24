/* Charts for the combined social media data story. Plain SVG, no dependencies. Reads window.IG, window.RD, window.YT. */
(function () {
  const IG = window.IG, RD = window.RD, YT = window.YT;
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

  // Stacked share per year; categories under 10% in every year fold into Other.
  function stack(id, D, noun) {
    const cats = D.categories, q = D.share_year;
    const big = cats.filter((c, i) => Math.max(...q.values.map((r) => r[i])) >= 0.10).slice(0, 7);
    const names = big.concat(["Other"]);
    const colors = names.map((n, i) => (n === "Other" ? "var(--other)" : `var(--s${i + 1})`));
    const rows = q.values.map((row) => {
      const top = big.map((c) => row[cats.indexOf(c)]);
      return top.concat([Math.max(0, 1 - top.reduce((a, b) => a + b, 0))]);
    });
    legend(id.replace("stack", "legend"), names.map((n, i) => ({ name: n, color: colors[i] })));
    const W = 900, H = 300, L = 44, R = 8, T = 8, B = 28;
    const s = svg(id, W, H);
    const bw = (W - L - R) / rows.length;
    const y = linear(0, 1, H - B, T);
    yAxis(s, y, [0, 0.25, 0.5, 0.75, 1], L, W - R, (t) => pct(t));
    rows.forEach((row, i) => {
      const x = L + i * bw + 1;
      let acc = 0;
      row.forEach((v, j) => {
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        el("rect", { x, y: y1 + 1, width: Math.max(1, bw - 2), height: Math.max(0, y0 - y1 - 2), fill: colors[j] }, s);
      });
      const hit = el("rect", { x: L + i * bw, y: T, width: bw, height: H - B - T, fill: "transparent" }, s);
      hover(hit, () => `<b>${q.index[i]}</b> · share of ${noun}<br>` +
        names.map((n, j) => ({ n, v: row[j], c: colors[j] })).sort((a, b) => b.v - a.v)
          .map((d) => `<span class="chip" style="background:${d.c}"></span>${d.n} <span class="m">${pct(d.v)}</span>`).join("<br>"));
      text(s, x + bw / 2, H - 8, String(q.index[i]), { "text-anchor": "middle" });
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
  const ytSubPeak = Y.reduce((b, r) => (r.subscribed_share > b.subscribed_share ? r : b));
  const yt25 = Y.find((d) => d.year === 2025);
  $("f-algo").innerHTML = `<b>On every platform, my favorites stopped mattering.</b> In ${firstYT.year} my 10 most-liked YouTube channels got ${pct(firstYT.top10_share)} of my likes; in 2025, ${pct(yt25.top10_share)}. On Instagram my top 10 went from ${pct(A[0].top10_share)} (${A[0].year}) to ${pct(A[A.length - 1].top10_share)} (${A[A.length - 1].year}). Subscriptions tell the same story: likes on YouTube channels I was subscribed to peaked at ${pct(ytSubPeak.subscribed_share)} in ${ytSubPeak.year} and fell to ${pct(yt25.subscribed_share)} in 2025, and only ${pct(A[A.length - 1].followed_share)} of this year's Instagram likes went to accounts I follow. About half of my YouTube likes each year now go to a channel I've never liked before (${pct(yt25.new_channel_share)} in 2025, versus ${pct(firstYT.new_channel_share)} in ${firstYT.year}). Reddit is the exception: most of my upvotes stayed in subreddits I chose, until I mostly stopped using it.`;

  // ---- 03 short-form ---------------------------------------------------------------
  lines("short-chart", [
    { name: "Instagram: Reels", color: COL.ig, data: ig("reel_share") },
    { name: "YouTube: tagged #shorts", color: COL.yt, data: Object.fromEntries(Y.filter((d) => d.year >= 2017).map((d) => [d.year, d.short_share])) },
  ], { max: 1, events: [[2020 + 7 / 12, "Reels"], [2021 + 2 / 12, "Shorts"]] });
  const ytShortPeak = Y.reduce((b, r) => (r.short_share > b.short_share ? r : b));
  $("f-short").innerHTML = `<b>The short-video switch happened within two years on both apps.</b> Reels were ${pct(A.find((d) => d.year === 2020).reel_share)} of my Instagram likes in 2020, ${pct(A.find((d) => d.year === 2022).reel_share)} in 2022 and ${pct(A[A.length - 1].reel_share)} in ${A[A.length - 1].year}. On YouTube, liked videos tagged #shorts went from zero before 2021 to ${pct(ytShortPeak.short_share)} in ${ytShortPeak.year}, and that's a floor, since most Shorts carry no tag. Short video is the format where the app picks every single item for you.`;

  // ---- 04 doomscrolling ----------------------------------------------------------------
  const W8 = YT.watch;
  tiles("doom-tiles", [
    [pct(IG.sessions.binge_share), "of Instagram likes came in sessions of 20+"],
    [pct(yt25.binge_share), "of 2025 YouTube likes came in sessions of 20+"],
  ].concat(W8 ? [[W8.per_day, `YouTube videos watched per day (last ${W8.days} days)`], [pct(1 - W8.subscribed_share), "of those from channels I don't subscribe to"]] : []));
  $("ig-binge").textContent = pct(IG.sessions.binge_share);
  const by = Y.filter((d) => d.year >= 2016);
  bars("binge", by.map((d) => String(d.year)), by.map((d) => d.binge_share), (v) => pct(v, 1) + " of likes in 20+ like sessions", COL.yt);
  $("hours-sub").textContent = `Share of likes by hour, ${YT.hours_years}`;
  bars("yt-hours", YT.hours.map((_, h) => hourLabel(h)), YT.hours, (v) => pct(v, 1) + " of likes", COL.yt, { labelEvery: 6, W: 440 });
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

  // ---- 07 platforms ------------------------------------------------------------------
  stack("ig-stack", IG, "likes");
  stack("rd-stack", RD, "upvotes");
  (function sentiment() {
    const sm = IG.sentiment.month;
    const yrs = [...new Set(sm.index.map((m) => +m.slice(0, 4)))];
    const avg = Object.fromEntries(yrs.map((yr) => {
      const v = sm.values.filter((_, i) => sm.index[i].startsWith(yr));
      return [yr, v.reduce((a, b) => a + b, 0) / v.length];
    }));
    bars("sent", yrs.map(String), yrs.map((y) => avg[y]), (v) => "mean sentiment " + signed(v), "var(--pos)", { axisFmt: signed });
  })();
})();
