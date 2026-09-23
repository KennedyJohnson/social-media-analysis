/* Charts for the likes data story. Plain SVG, no dependencies. Reads window.DATA. */
(function () {
  const D = window.DATA;
  const NS = "http://www.w3.org/2000/svg";
  const MAX_COLORS = 8;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const fmt = new Intl.NumberFormat("en-US");
  const pct = (v, d = 0) => (v * 100).toFixed(d) + "%";
  const signed = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const hourLabel = (h) => (h % 12 || 12) + (h < 12 ? "am" : "pm");
  const $ = (id) => document.getElementById(id);

  // ---- theme toggle -------------------------------------------------------
  const themeBtn = $("theme");
  const setTheme = (t) => {
    document.documentElement.setAttribute("data-theme", t);
    themeBtn.textContent = t === "dark" ? "Light mode" : "Dark mode";
    try { localStorage.setItem("theme", t); } catch (e) { /* storage unavailable */ }
  };
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { /* storage unavailable */ }
  setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  themeBtn.onclick = () => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

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

  // Top categories get fixed colour slots; the rest fold into Other.
  // One shared set of coloured categories for every chart, so a colour means the same thing everywhere:
  // the two biggest categories, then the ones that shifted most (by volume), up to the 8 palette slots.
  const sy0 = D.share_year;
  const shifted = (c) => {
    const i = D.categories.indexOf(c), first = sy0.values[0][i], last = sy0.values[sy0.values.length - 1][i];
    return (Math.abs(last - first) >= 0.02 && (last >= first * 2 || last <= first / 2)) || c === "Sports";  // Sports: 2022 spike
  };
  const topCats = D.categories.slice(0, 2).concat(D.categories.slice(2).filter(shifted)).slice(0, MAX_COLORS);
  const colorOf = (c) => (topCats.includes(c) ? `var(--s${topCats.indexOf(c) + 1})` : "var(--other)");

  // ---- hero tiles -----------------------------------------------------------
  function tiles(id, items) {
    $(id).innerHTML = items.map(([v, l]) => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  }
  const peakRow = D.algorithm.reduce((b, r) => (r.growth > b.growth ? r : b));
  tiles("tiles", [
    [D.totals.first, "year of my first like"],
    [Math.round(peakRow.growth) + "×", "more likes at the peak than before Reels"],
    [D.totals.categories, "interest categories"],
    [peakRow.year, "peak year for likes"],
  ]);

  // ---- 01 stacked share by quarter --------------------------------------------
  (function stack() {
    const q = D.share_year;
    const cats = D.categories;
    // Only categories that reached 10% of likes in at least one year; smaller ones fold into Other.
    const stackCats = topCats.filter((c) => Math.max(...q.values.map((r) => r[cats.indexOf(c)])) >= 0.10);
    const rows = q.values.map((row) => {
      const top = stackCats.map((c) => row[cats.indexOf(c)]);
      return top.concat([1 - top.reduce((a, b) => a + b, 0)]);
    });
    const names = stackCats.concat(["Other"]);
    const colors = names.map(colorOf);
    $("stack-legend").innerHTML = names.map((n, i) => `<span><i style="background:${colors[i]}"></i>${n}</span>`).join("");

    const W = 900, H = 340, L = 44, R = 8, T = 8, B = 28;
    const s = svg("stack", W, H);
    const bw = (W - L - R) / rows.length;
    const y = linear(0, 1, H - B, T);
    yAxis(s, y, [0, 0.25, 0.5, 0.75, 1], L, W - R, (t) => pct(t));
    rows.forEach((row, i) => {
      const x = L + i * bw + 1;
      let acc = 0;
      const g = el("g", {}, s);
      row.forEach((v, j) => {
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        el("rect", { x, y: y1 + 1, width: Math.max(1, bw - 2), height: Math.max(0, y0 - y1 - 2), fill: colors[j] }, g);
      });
      const hit = el("rect", { x: L + i * bw, y: T, width: bw, height: H - B - T, fill: "transparent" }, s);
      hover(hit, () => `<b>${q.index[i]}</b><br>` +
        names.map((n, j) => ({ n, v: row[j], c: colors[j] })).sort((a, b) => b.v - a.v)
          .map((d) => `<span class="chip" style="background:${d.c}"></span>${d.n} <span class="m">${pct(d.v)}</span>`).join("<br>"));
      text(s, x + bw / 2, H - 8, String(q.index[i]), { "text-anchor": "middle" });
    });
  })();

  // ---- 01 small multiples ------------------------------------------------------
  (function multiples() {
    const sy = D.share_year;
    const wrap = $("multiples");
    D.categories.forEach((c, ci) => {
      const vals = sy.values.map((r) => r[ci]);
      const first = vals[0], last = vals[vals.length - 1];
      if (!shifted(c) || !topCats.includes(c)) return;
      const div = document.createElement("div");
      div.className = "m";
      div.innerHTML = `<h4><span class="chip" style="background:${colorOf(c)}"></span>${c}</h4><div class="d">${pct(first, 1)} in ${sy.index[0]} → ${pct(last, 1)} in ${sy.index[sy.index.length - 1]}</div><div></div>`;
      wrap.appendChild(div);
      const W = 200, H = 70, P = 4;
      const s = el("svg", { viewBox: `0 0 ${W} ${H}` }, div.lastChild);
      const x = linear(0, vals.length - 1, P, W - P);
      const y = linear(0, Math.max(...vals) * 1.1, H - P, P);
      el("line", { x1: P, x2: W - P, y1: H - P, y2: H - P, stroke: "var(--grid)" }, s);
      el("path", { d: vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(""), fill: "none", stroke: colorOf(c) === "var(--other)" ? "var(--text-muted)" : colorOf(c), "stroke-width": 2, "stroke-linejoin": "round" }, s);
      vals.forEach((v, i) => {
        const hit = el("rect", { x: x(i) - W / vals.length / 2, y: 0, width: W / vals.length, height: H, fill: "transparent" }, s);
        hover(hit, () => `<b>${c}</b><br>${sy.index[i]}: ${pct(v, 1)} of likes`);
      });
    });
  })();

  // ---- 02 heatmap -----------------------------------------------------------
  (function timeOfDay() {
    const t = D.time_of_day;
    const W = 900, H = 200, L = 8, R = 8, T = 28, B = 44;
    const s = svg("heat", W, H);
    const max = Math.max(...t.map((d) => d.share));
    const bw = (W - L - R) / t.length;
    t.forEach((d, i) => {
      const x = L + i * bw + 12, w = bw - 24, h = ((H - T - B) * d.share) / max, top = H - B - h;
      const r = Math.min(4, h / 2);
      el("path", { d: `M${x},${H - B}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${H - B}Z`, fill: "var(--s1)" }, s);
      text(s, x + w / 2, top - 8, pct(d.share), { "text-anchor": "middle", class: "lbl" });
      text(s, x + w / 2, H - 24, d.label, { "text-anchor": "middle", class: "lbl" });
      text(s, x + w / 2, H - 8, d.hours, { "text-anchor": "middle" });
    });
  })();

  // ---- 03 sessions ---------------------------------------------------------------
  (function sessions() {
    const S = D.sessions;
    tiles("sess-tiles", [
      [S.median_likes, "likes in a typical session"],
      [S.p90_likes, "likes in a top-10% session"],
      [pct(S.binge_share), "of likes came in sessions of 20+"],
    ]);
    const bins = ["1", "2", "3–4", "5–9", "10–19", "20–39", "40+"];
    barChart("sess-hist", bins, S.size_hist, (v) => pct(v, 1) + " of sessions", "var(--s1)", 1, (t) => pct(t));
  })();

  function barChart(id, labels, vals, tipFmt, color, labelEvery = 1, axisFmt = null) {
    const W = 440, H = 220, L = 40, R = 4, T = 8, B = 24;
    const s = svg(id, W, H);
    const max = niceMax(Math.max(...vals));
    const y = linear(0, max, H - B, T);
    yAxis(s, y, [0, max / 2, max], L, W - R, axisFmt || ((t) => max < 10 ? String(+t.toFixed(2)) : fmt.format(Math.round(t))));
    const bw = (W - L - R) / vals.length;
    vals.forEach((v, i) => {
      const x = L + i * bw + 1, top = y(v), base = H - B, w = bw - 2;
      const r = Math.min(4, (base - top) / 2, w / 2);
      el("path", { d: `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`, fill: color }, s);
      const hit = el("rect", { x: L + i * bw, y: T, width: bw, height: H - B - T, fill: "transparent" }, s);
      hover(hit, () => `<b>${labels[i]}</b><br>${tipFmt(v)}`);
      if (i % labelEvery === 0) text(s, x + w / 2, H - 6, labels[i], { "text-anchor": "middle" });
    });
  }

  // ---- 04 comment section -------------------------------------------------------------
  (function comments() {
    const C = D.comments;
    tiles("com-tiles", [
      [pct(C.lag.values[1]), "of comment likes happen the same minute I like the post"],
      [pct(C.comment_only_share), "of those posts I never liked myself"],
    ]);
    const q = C.quarter;
    const ratios = q.ratio;
    barChart("com-q", q.index.map((s) => s.replace("Q", " Q")), ratios, (v) => v.toFixed(2) + " comment likes per post like", "var(--s2)", 4);
  })();

  // ---- 05 sentiment ------------------------------------------------------------------
  (function sentiment() {
    const sm = D.sentiment.month;
    const W = 900, H = 260, L = 44, R = 8, T = 10, B = 24;
    const s = svg("sent-month", W, H);
    // Zoom to the data's range: the story is the trend, not the distance from zero.
    const lo = Math.floor(Math.min(...sm.values) * 20) / 20, hi = Math.ceil(Math.max(...sm.values) * 20) / 20;
    const y = linear(lo, hi, H - B, T);
    const x = linear(0, sm.values.length - 1, L + 4, W - R - 4);
    const ticks = [];
    for (let t = lo; t <= hi + 1e-9; t += 0.05) ticks.push(+t.toFixed(2));
    yAxis(s, y, ticks, L, W - R, signed);
    el("path", { d: sm.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(""), fill: "none", stroke: "var(--s1)", "stroke-width": 1.5, opacity: 0.45, "stroke-linejoin": "round" }, s);
    // Yearly averages as bold steps with labels.
    const years = [...new Set(sm.index.map((m) => m.slice(0, 4)))];
    years.forEach((yr) => {
      const idx = sm.index.map((m, i) => (m.startsWith(yr) ? i : -1)).filter((i) => i >= 0);
      const avg = idx.reduce((t, i) => t + sm.values[i], 0) / idx.length;
      const x0 = x(idx[0]), x1 = x(idx[idx.length - 1]);
      el("line", { x1: x0, x2: x1, y1: y(avg), y2: y(avg), stroke: "var(--s1)", "stroke-width": 3, "stroke-linecap": "round" }, s);
      text(s, (x0 + x1) / 2, y(avg) - 8, `${yr}: ${signed(avg)}`, { "text-anchor": "middle", class: "lbl" });
    });
    sm.index.forEach((m, i) => { if (m.endsWith("-01")) text(s, x(i), H - 6, m.slice(0, 4), { "text-anchor": "middle" }); });
    const dot = el("circle", { r: 5, fill: "var(--s1)", stroke: "var(--surface-1)", "stroke-width": 2, opacity: 0 }, s);
    const hit = el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" }, s);
    hit.addEventListener("mousemove", (e) => {
      const b = s.getBoundingClientRect();
      const px = ((e.clientX - b.left) / b.width) * W;
      const i = Math.max(0, Math.min(sm.values.length - 1, Math.round(((px - L - 4) / (W - R - L - 8)) * (sm.values.length - 1))));
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(sm.values[i])); dot.setAttribute("opacity", 1);
      const d = new Date(sm.index[i] + "-15");
      showTip(e, `<b>${d.toLocaleString("en-US", { month: "long", year: "numeric" })}</b><br>mean sentiment ${signed(sm.values[i])}`);
    });
    hit.addEventListener("mouseleave", () => { hideTip(); dot.setAttribute("opacity", 0); });

    divergingBars("sent-cat", D.sentiment.category.index, D.sentiment.category.values, D.sentiment.category.n);
  })();

  function divergingBars(id, labels, vals, ns) {
    const sorted = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
    const order = sorted.length > 6 ? sorted.slice(0, 3).concat(sorted.slice(-3)) : sorted;
    const W = 900, rowH = 28, L = 260, R = 60, H = order.length * rowH + 20;
    const s = svg(id, W, H);
    const ext = Math.max(...vals.map(Math.abs));
    const x = linear(Math.min(0, ...vals), ext, L, W - R);
    el("line", { x1: x(0), x2: x(0), y1: 0, y2: H, stroke: "var(--text-muted)" }, s);
    order.forEach((i, r) => {
      const v = vals[i], yy = r * rowH + 4 + (r >= 3 && order.length === 6 ? 12 : 0);
      text(s, L - 8, yy + 12, labels[i], { "text-anchor": "end", class: "lbl" });
      el("rect", { x: Math.min(x(0), x(v)), y: yy + 3, width: Math.abs(x(v) - x(0)), height: rowH - 8, rx: 3, fill: v >= 0 ? "var(--pos)" : "var(--neg)" }, s);
      text(s, v >= 0 ? x(v) + 4 : x(v) - 4, yy + 12, signed(v), { "text-anchor": v >= 0 ? "start" : "end" });
      const hit = el("rect", { x: 0, y: yy, width: W, height: rowH, fill: "transparent" }, s);
      hover(hit, () => `<b>${labels[i]}</b><br>mean sentiment ${signed(v)}<br><span class="m">${fmt.format(ns[i])} captions</span>`);
    });
  }

  function barChartSigned(id, labels, vals) {
    const W = 440, H = 220, L = 40, R = 4, T = 8, B = 24;
    const s = svg(id, W, H);
    const ext = niceMax(Math.max(...vals.map(Math.abs)) * 1.05);
    const lo = Math.min(0, ...vals) < 0 ? -ext : 0;
    const y = linear(lo, ext, H - B, T);
    yAxis(s, y, lo ? [lo, 0, ext] : [0, ext / 2, ext], L, W - R, signed);
    const bw = (W - L - R) / vals.length;
    vals.forEach((v, i) => {
      const x = L + i * bw + 1;
      el("rect", { x, y: Math.min(y(0), y(v)), width: bw - 2, height: Math.abs(y(v) - y(0)), rx: 2, fill: v >= 0 ? "var(--pos)" : "var(--neg)" }, s);
      const hit = el("rect", { x: L + i * bw, y: T, width: bw, height: H - B - T, fill: "transparent" }, s);
      hover(hit, () => `<b>${labels[i]}</b><br>mean sentiment ${signed(v)}`);
      if (i % 3 === 0) text(s, x + bw / 2, H - 6, labels[i], { "text-anchor": "middle" });
    });
  }

  // ---- 06 algorithm ------------------------------------------------------------------
  (function algorithm() {
    const A = D.algorithm;
    const panels = [
      ["Likes per year, vs. before Reels (2019–21 = 1×)", "growth", (v) => v.toFixed(1) + "×", false],
      ["Share of likes on Reels", "reel_share", pct, true],
      ["Share of likes on accounts I follow", "followed_share", pct, true],
      ["Share of likes going to my top 10 accounts", "top10_share", pct, true],
    ];
    const wrap = $("algo");
    panels.forEach(([title, key, f, isShare], pi) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h3>${title}</h3><p class="sub">${A[0].year}: ${f(A[0][key])} → ${A[A.length - 1].year}: ${f(A[A.length - 1][key])}</p><div id="algo-${pi}"></div>`;
      wrap.appendChild(card);
      const vals = A.map((d) => d[key]);
      const W = 440, H = 180, L = 48, R = 12, T = 10, B = 24;
      const s = svg(`algo-${pi}`, W, H);
      const max = isShare ? 1 : niceMax(Math.max(...vals));
      const y = linear(0, max, H - B, T);
      const x = linear(0, vals.length - 1, L + 8, W - R - 8);
      yAxis(s, y, [0, max / 2, max], L, W - R, (t) => (isShare ? pct(t) : +t.toFixed(1) + "×"));
      if (key === "reel_share") {
        // Reels launched in the U.S. in August 2020.
        const i2020 = A.findIndex((d) => d.year === 2020);
        if (i2020 >= 0) {
          const lx = x(i2020 + 7 / 12);
          el("line", { x1: lx, x2: lx, y1: T, y2: H - B, stroke: "var(--text-muted)", "stroke-dasharray": "4 4" }, s);
          text(s, lx + 6, T + 12, "Reels launch, Aug 2020", { class: "lbl" });
        }
      }
      el("path", { d: vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(""), fill: "none", stroke: "var(--s1)", "stroke-width": 2 }, s);
      vals.forEach((v, i) => {
        const c = el("circle", { cx: x(i), cy: y(v), r: 4, fill: "var(--s1)", stroke: "var(--surface-1)", "stroke-width": 2 }, s);
        const hit = el("rect", { x: x(i) - 16, y: T, width: 32, height: H - B - T, fill: "transparent" }, s);
        hover(hit, () => `<b>${A[i].year}</b><br>${title}: ${f(v)}`);
        text(s, x(i), H - 6, "'" + String(A[i].year).slice(2), { "text-anchor": "middle" });
      });
    });
  })();
})();
