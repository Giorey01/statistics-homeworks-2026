const welfordStart = () => ({ k: 0, mean: 0, ss: 0 });

function welfordPush(w, x) {
  w.k += 1;
  const d = x - w.mean;
  w.mean += d / w.k;
  w.ss += d * (x - w.mean);
}

const sampleVariance = (w) => (w.k > 1 ? w.ss / (w.k - 1) : NaN);
const populationVariance = (w) => (w.k > 0 ? w.ss / w.k : NaN);

function welfordVarianceDirect(xs) {
  let mean = 0,
    v = 0,
    s2 = 0;
  const steps = [];
  xs.forEach((x, i) => {
    const k = i + 1;
    const d = x - mean;
    mean += d / k;
    const e = x - mean;
    v += (d * e - v) / k;
    if (k > 1) s2 += (d * e - s2) / (k - 1);
    steps.push({ k, x, mean, v, s2 });
  });
  return steps;
}

function naiveVariance(xs) {
  let s = 0,
    s2 = 0;
  for (const x of xs) {
    s += x;
    s2 += x * x;
  }
  return (s2 - (s * s) / xs.length) / (xs.length - 1);
}

function twoPassVariance(xs) {
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

const choose = (n, k) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
};

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const binomialPmf = SCORES.map((k) => choose(10, k) * 0.3 ** k * 0.7 ** (10 - k));

const DIST = {
  name: "Binomial(10, 0.3)",
  mu: 3,
  sigma2: 2.1,
  mu4: 12.684,
  probs: binomialPmf,
  sample: () => {
    let k = 0;
    for (let i = 0; i < 10; i++) if (Math.random() < 0.3) k++;
    return k;
  },
};

const excessKurtosis = (d) => d.mu4 / (d.sigma2 * d.sigma2) - 3;
const varOfS2 = (d, n) => (d.mu4 - (d.sigma2 * d.sigma2 * (n - 3)) / (n - 1)) / n;

function hacker(n) {
  const w = welfordStart();
  for (let i = 0; i < n; i++) welfordPush(w, DIST.sample());
  return { mean: w.mean, s2: sampleVariance(w), v: populationVariance(w) };
}

function experiment(n, m) {
  const means = new Float64Array(m),
    s2 = new Float64Array(m),
    v = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const h = hacker(n);
    means[j] = h.mean;
    s2[j] = h.s2;
    v[j] = h.v;
  }
  return { means, s2, v };
}

function summary(values) {
  const w = welfordStart();
  for (const x of values) welfordPush(w, x);
  return { mean: w.mean, variance: sampleVariance(w) };
}

function runningTrajectory(n) {
  const w = welfordStart(),
    M = new Float64Array(n),
    V = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    welfordPush(w, DIST.sample());
    M[i] = w.mean;
    V[i] = sampleVariance(w);
  }
  return { M, V };
}

const T975 = { 2: 12.706, 5: 2.776, 10: 2.262, 30: 2.045, 100: 1.984, 1000: 1.962 };
const NS = [2, 5, 10, 30, 100, 1000];

const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const head = (cells) => `<tr>${cells.map((c) => `<th>${c}</th>`).join("")}</tr>`;
const fmt = (v, digits = 3) =>
  !Number.isFinite(v)
    ? "–"
    : Math.abs(v) >= 1000
      ? Math.round(v).toString()
      : Number(v.toPrecision(digits)).toString();
const repaint = () => new Promise((resolve) => setTimeout(resolve, 0));

function runWelfordDemo() {
  const xs = $("wData")
    .value.split(/[\s,;]+/)
    .filter((s) => s !== "")
    .map(Number)
    .filter(Number.isFinite);
  if (xs.length < 2) {
    $("wTable").innerHTML = "";
    $("wNote").textContent = "Enter at least two numbers.";
    return;
  }
  const w = welfordStart();
  const direct = welfordVarianceDirect(xs);
  let rows = head([
    "k",
    "x<sub>k</sub>",
    "d = x<sub>k</sub> − M<sub>k−1</sub>",
    "M<sub>k</sub>",
    "x<sub>k</sub> − M<sub>k</sub>",
    "S<sub>k</sub>",
    "s²<sub>k</sub> = S<sub>k</sub>/(k−1)",
    "s²<sub>k</sub> direct",
    "V<sub>k</sub> = S<sub>k</sub>/k",
  ]);
  xs.forEach((x, i) => {
    const d = x - w.mean;
    welfordPush(w, x);
    rows += row([
      w.k,
      fmt(x, 6),
      fmt(d, 6),
      fmt(w.mean, 6),
      fmt(x - w.mean, 6),
      fmt(w.ss, 6),
      fmt(sampleVariance(w), 6),
      w.k > 1 ? fmt(direct[i].s2, 6) : "–",
      fmt(populationVariance(w), 6),
    ]);
  });
  $("wTable").innerHTML = rows;
  $("wNote").innerHTML =
    `n = ${xs.length}: mean <b>${fmt(w.mean, 8)}</b>, sum of squares <b>${fmt(w.ss, 8)}</b>, ` +
    `sample variance <b>${fmt(sampleVariance(w), 8)}</b>. Two-pass check: ${fmt(twoPassVariance(xs), 8)}. ` +
    `The column "direct" is the recurrence on s² itself, without S: same numbers.`;
}

function runStability() {
  const base = [4, 7, 13, 16];
  let rows = head([
    "offset c",
    "data",
    "naive (Σx² − (Σx)²/n)/(n−1)",
    "two-pass",
    "Welford",
  ]);
  for (const c of [0, 1e6, 1e8, 1e9, 1e10]) {
    const xs = base.map((x) => x + c);
    const w = welfordStart();
    for (const x of xs) welfordPush(w, x);
    const naive = naiveVariance(xs);
    rows += row([
      c === 0 ? "0" : `10<sup>${Math.log10(c)}</sup>`,
      c === 0 ? "4, 7, 13, 16" : "c + (4, 7, 13, 16)",
      `<b class="${Math.abs(naive - 30) > 1e-6 ? "text-rose-600" : ""}">${fmt(naive, 8)}</b>`,
      fmt(twoPassVariance(xs), 8),
      `<b>${fmt(sampleVariance(w), 8)}</b>`,
    ]);
  }
  $("stabTable").innerHTML = rows;
}

$("wRun").onclick = runWelfordDemo;
runWelfordDemo();
runStability();

function drawDist() {
  const draws = 20000;
  const X = (x) => 40 + 56 * x,
    H = 220;
  const counts = new Array(11).fill(0);
  for (let i = 0; i < draws; i++) counts[DIST.sample()]++;
  const sampled = counts.map((c) => c / draws);
  const top = Math.max(...sampled, ...DIST.probs) * 1.15;
  const Y = (p) => 250 - (H * p) / top;

  let svg = "";
  for (let k = 0; k <= 4; k++) {
    const v = (top * k) / 4;
    svg +=
      `<line x1="40" x2="620" y1="${Y(v)}" y2="${Y(v)}" stroke="#f1f5f9"/>` +
      `<text x="34" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">${fmt(v, 2)}</text>`;
  }
  for (let x = 0; x <= 10; x++)
    svg += `<text x="${X(x)}" y="270" font-size="11" text-anchor="middle" fill="#94a3b8">${x}</text>`;

  sampled.forEach((p, x) => {
    svg += `<rect x="${X(x) - 14}" y="${Y(p)}" width="28" height="${250 - Y(p)}" fill="#a5b4fc"><title>sampled ${pct(p)}</title></rect>`;
    svg += `<line x1="${X(x) - 18}" x2="${X(x) + 18}" y1="${Y(DIST.probs[x])}" y2="${Y(DIST.probs[x])}" stroke="#334155" stroke-width="2"><title>theory ${pct(DIST.probs[x])}</title></line>`;
  });
  svg += `<line x1="${X(DIST.mu)}" x2="${X(DIST.mu)}" y1="20" y2="250" stroke="#e11d48" stroke-dasharray="4 3"/>`;
  svg += `<text x="${X(DIST.mu) + 6}" y="30" font-size="11" fill="#e11d48">μ = ${fmt(DIST.mu)}</text>`;
  $("distChart").innerHTML = svg;
}

function drawRunning() {
  const n = Math.max(2, Math.min(100000, Number($("runN").value) || 1000)),
    shown = Math.max(1, Math.min(200, Number($("runM").value) || 20));
  const trajs = Array.from({ length: shown }, () => runningTrajectory(n));
  const sigma = Math.sqrt(DIST.sigma2);

  const lk1 = Math.log10(n);
  const X = (k) => 60 + (560 * Math.log10(k)) / lk1;
  const idx = [];
  for (let k = 1; k <= n; k = Math.max(k + 1, Math.round(k * 1.02))) idx.push(k);
  if (idx[idx.length - 1] !== n) idx.push(n);

  const panel = (el, key, center, halfWidth, label, kStart) => {
    const lo = Math.max(0, center - 1.2 * halfWidth(5)),
      hi = Math.min(key === "M" ? 10 : 50, center + 1.2 * halfWidth(5));
    const Y = (v) => 260 - (240 * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo);
    let svg = "";
    for (let t = 0; t <= 4; t++) {
      const v = lo + ((hi - lo) * t) / 4;
      svg +=
        `<line x1="60" x2="620" y1="${Y(v)}" y2="${Y(v)}" stroke="#f1f5f9"/>` +
        `<text x="54" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">${fmt(v, 3)}</text>`;
    }
    for (let e = 0; e <= Math.floor(lk1); e++)
      svg += `<text x="${X(10 ** e)}" y="282" font-size="11" text-anchor="middle" fill="#94a3b8">k = ${10 ** e}</text>`;
    for (const t of trajs) {
      const pts = idx
        .filter((k) => k >= kStart)
        .map((k) => `${X(k).toFixed(1)},${Y(t[key][k - 1]).toFixed(1)}`)
        .join(" ");
      svg += `<polyline points="${pts}" fill="none" stroke="#818cf8" stroke-width="1" opacity="0.55"/>`;
    }
    for (const sgn of [-1, 1]) {
      const pts = idx
        .filter((k) => k >= Math.max(kStart, 2))
        .map((k) => `${X(k).toFixed(1)},${Y(center + sgn * halfWidth(k)).toFixed(1)}`)
        .join(" ");
      svg += `<polyline points="${pts}" fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }
    svg +=
      `<line x1="60" x2="620" y1="${Y(center)}" y2="${Y(center)}" stroke="#e11d48" stroke-width="1.5"/>` +
      `<text x="66" y="${Y(center) - 5}" font-size="11" fill="#e11d48">${label}</text>`;
    el.innerHTML = svg;
  };

  panel($("runMean"), "M", DIST.mu, (k) => (2 * sigma) / Math.sqrt(k), `μ = ${fmt(DIST.mu)}`, 1);
  panel(
    $("runVar"),
    "V",
    DIST.sigma2,
    (k) => 2 * Math.sqrt(varOfS2(DIST, Math.max(2, k))),
    `σ² = ${fmt(DIST.sigma2)}`,
    2,
  );

  const finalM = trajs.map((t) => t.M[n - 1]),
    finalV = trajs.map((t) => t.V[n - 1]);
  const inside = (arr, c, h) => arr.filter((v) => Math.abs(v - c) <= h).length / arr.length;
  $("runNote").innerHTML =
    `${DIST.name}, ${shown} attackers, n = ${n} systems. ` +
    `Dashed lines show μ ± 2σ/√k and σ² ± 2·sd(s²<sub>k</sub>). ` +
    `At k = n, <b>${pct(inside(finalM, DIST.mu, (2 * sigma) / Math.sqrt(n)), 0)}</b> of sample means and ` +
    `<b>${pct(inside(finalV, DIST.sigma2, 2 * Math.sqrt(varOfS2(DIST, n))), 0)}</b> of sample variances lie inside the theoretical band.`;
}

$("runRun").onclick = drawRunning;

let lastRun = null;

function histogram(values, lo, hi, mark, title, bins = 30) {
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins || 1;
  let out = 0;
  for (const v of values) {
    const b = Math.floor((v - lo) / w);
    if (b < 0 || b >= bins) out++;
    else counts[b]++;
  }
  const top = Math.max(1, ...counts);
  const bw = 200 / bins;
  let svg = "";
  counts.forEach((c, k) => {
    const h = (100 * c) / top;
    svg += `<rect x="${k * bw}" y="${110 - h}" width="${bw}" height="${h}" fill="#818cf8"><title>${pct(c / values.length)}</title></rect>`;
  });
  const xm = (200 * (mark - lo)) / (hi - lo);
  svg +=
    `<line x1="${xm}" x2="${xm}" y1="5" y2="110" stroke="#e11d48" stroke-width="1.5" stroke-dasharray="3 2"/>` +
    `<line x1="0" x2="200" y1="110" y2="110" stroke="#cbd5e1"/>` +
    `<text x="0" y="124" font-size="10" fill="#94a3b8">${fmt(lo, 2)}</text>` +
    `<text x="200" y="124" font-size="10" text-anchor="end" fill="#94a3b8">${fmt(hi, 2)}</text>`;
  return `<div><p class="text-xs text-slate-500">${title}${out ? ` <span class="text-slate-400">(${pct(out / values.length, 1)} off scale)</span>` : ""}</p><svg viewBox="0 0 200 128" class="w-full">${svg}</svg></div>`;
}

const zCell = (avg, theory, se) => {
  const z = (avg - theory) / se;
  return (
    `<b>${fmt(avg, 4)}</b> <span class="text-slate-400">(${fmt(theory, 4)})</span> ` +
    `<span class="${Math.abs(z) <= 2 ? "text-emerald-600" : "text-rose-600"}">z = ${z.toFixed(1)}</span>`
  );
};

async function runExperiment() {
  const m = Number($("expM").value);
  $("expRun").disabled = true;
  const results = [];
  for (const n of NS) {
    $("expRun").textContent = `Running… n = ${n}`;
    await repaint();
    const r = experiment(n, m);
    results.push({ n, ...r, sm: summary(r.means), ss2: summary(r.s2), sv: summary(r.v) });
  }
  $("expRun").textContent = "Run";
  $("expRun").disabled = false;
  lastRun = { m, results };

  let rows = head([
    "n",
    "average of the m sample means (μ)",
    "average of the m sample variances s² (σ²)",
    "average of the m variances ÷ n ((n−1)/n·σ²)",
    "average ÷ n against σ²",
  ]);
  for (const { n, sm, ss2, sv } of results) {
    const seMean = Math.sqrt(DIST.sigma2 / n / m),
      seS2 = Math.sqrt(varOfS2(DIST, n) / m),
      seV = ((n - 1) / n) * seS2;
    rows += row([
      n,
      zCell(sm.mean, DIST.mu, seMean),
      zCell(ss2.mean, DIST.sigma2, seS2),
      zCell(sv.mean, ((n - 1) / n) * DIST.sigma2, seV),
      `<span class="${n <= 10 ? "text-rose-600 font-medium" : "text-slate-500"}">${pct(sv.mean / DIST.sigma2 - 1, 1)}</span>`,
    ]);
  }
  $("expTable").innerHTML = rows;
  $("expNote").innerHTML =
    `${DIST.name}: μ = ${fmt(DIST.mu, 4)}, σ² = ${fmt(DIST.sigma2, 4)}, m = ${m} attackers across each sample size n. ` +
    `Theoretical benchmarks are shown in grey; z measures distance in standard errors of the ensemble average ` +
    `(σ/√(nm) for means, √(Var(s²)/m) for variances), where |z| ≤ 2 is expected simulation variation. ` +
    `Both sample means and Bessel-corrected sample variances (divided by n − 1) match theoretical values across all sample sizes, including n = 2. ` +
    `Dividing by n introduces a downward bias of (n − 1)/n: −50% at n = 2, −10% at n = 10, and negligible at n = 1000.`;

  let spread = head([
    "n",
    "Var of the sample means (σ²/n)",
    "sd of the sample means (σ/√n)",
    "Var of the sample variances (Var(s²))",
    "sd of the sample variances",
    "hackers with s² = 0",
  ]);
  for (const { n, sm, ss2, s2 } of results) {
    let zeros = 0;
    for (const v of s2) if (v === 0) zeros++;
    spread += row([
      n,
      `<b>${fmt(sm.variance, 4)}</b> <span class="text-slate-400">(${fmt(DIST.sigma2 / n, 4)})</span>`,
      `${fmt(Math.sqrt(sm.variance), 4)} <span class="text-slate-400">(${fmt(Math.sqrt(DIST.sigma2 / n), 4)})</span>`,
      `<b>${fmt(ss2.variance, 4)}</b> <span class="text-slate-400">(${fmt(varOfS2(DIST, n), 4)})</span>`,
      `${fmt(Math.sqrt(ss2.variance), 4)} <span class="text-slate-400">(${fmt(Math.sqrt(varOfS2(DIST, n)), 4)})</span>`,
      pct(zeros / m, 1),
    ]);
  }
  $("spreadTable").innerHTML = spread;

  const meanLo = Math.max(0, DIST.mu - 4 * Math.sqrt(DIST.sigma2)),
    meanHi = Math.min(10, DIST.mu + 4 * Math.sqrt(DIST.sigma2));
  $("histMeans").innerHTML = results
    .map((r) => histogram(r.means, meanLo, meanHi, DIST.mu, `n = ${r.n}`))
    .join("");
  const varHi = DIST.sigma2 + 4 * Math.sqrt(varOfS2(DIST, 5));
  $("histVars").innerHTML = results
    .map((r) => histogram(r.s2, 0, varHi, DIST.sigma2, `n = ${r.n}`))
    .join("");

  drawSpreadChart();
  const k = excessKurtosis(DIST);
  $("spreadNote").innerHTML =
    `Each row summarizes m = ${m} attackers, with theoretical values shown in grey. ` +
    `Variance of sample means follows σ²/n: each tenfold increase in n reduces variance by a factor of 10 (standard error by √10 ≈ 3.2). ` +
    `Variance of sample variances follows Var(s²) = (μ₄ − σ⁴(n − 3)/(n − 1))/n ≈ σ⁴(2/(n − 1) + κ/n), ` +
    `with excess kurtosis κ = ${fmt(k, 3)}. ` +
    `With increasing n, distributions concentrate around the red markers; sample means become Gaussian via the CLT, while sample variances stabilize asymptotically.`;

  runCoverage();
}

function drawSpreadChart() {
  const { results } = lastRun;
  const ns = results.map((r) => r.n);
  const series = [
    {
      name: "Var of the sample means",
      color: "#4f46e5",
      theory: (n) => DIST.sigma2 / n,
      sim: (r) => r.sm.variance,
    },
    {
      name: "Var of the sample variances",
      color: "#059669",
      theory: (n) => varOfS2(DIST, n),
      sim: (r) => r.ss2.variance,
    },
  ];
  const all = series.flatMap((s) => ns.map(s.theory)).filter((v) => v > 0);
  const ly0 = Math.floor(Math.log10(Math.min(...all))) - 0.3,
    ly1 = Math.ceil(Math.log10(Math.max(...all))) + 0.3;
  const lx0 = Math.log10(ns[0]),
    lx1 = Math.log10(ns[ns.length - 1]);
  const X = (n) => 70 + (530 * (Math.log10(n) - lx0)) / (lx1 - lx0),
    Y = (v) => 260 - (240 * (Math.log10(v) - ly0)) / (ly1 - ly0);

  let svg = "";
  for (let e = Math.ceil(ly0); e <= ly1; e++)
    svg +=
      `<line x1="70" x2="600" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" stroke="#f1f5f9"/>` +
      `<text x="62" y="${Y(10 ** e) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">10<tspan baseline-shift="super" font-size="8">${e}</tspan></text>`;
  for (const n of ns)
    svg += `<text x="${X(n)}" y="282" font-size="11" text-anchor="middle" fill="#94a3b8">${n}</text>`;

  const slopes = [];
  series.forEach((s, k) => {
    let line = "";
    for (let lx = lx0; lx <= lx1 + 1e-9; lx += (lx1 - lx0) / 60) {
      const n = 10 ** lx;
      line += `${X(n).toFixed(1)},${Y(s.theory(n)).toFixed(1)} `;
    }
    svg += `<polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>`;
    const pts = results.map((r) => [r.n, s.sim(r)]).filter(([, v]) => v > 0);
    for (const [n, v] of pts)
      svg += `<circle cx="${X(n)}" cy="${Y(v)}" r="4" fill="${s.color}"><title>${fmt(v, 4)}</title></circle>`;
    svg +=
      `<rect x="${90 + 230 * k}" y="10" width="12" height="12" rx="2" fill="${s.color}"/>` +
      `<text x="${108 + 230 * k}" y="20" font-size="12" fill="#334155">${s.name}</text>`;
    const big = pts.filter(([n]) => n >= 10);
    const lx = big.map(([n]) => Math.log10(n)),
      lv = big.map(([, v]) => Math.log10(v));
    const mx = lx.reduce((a, x) => a + x, 0) / lx.length,
      mv = lv.reduce((a, x) => a + x, 0) / lv.length;
    const num = lx.reduce((a, x, i) => a + (x - mx) * (lv[i] - mv), 0),
      den = lx.reduce((a, x) => a + (x - mx) ** 2, 0);
    slopes.push(`${s.name.toLowerCase()}: <b>${(num / den).toFixed(3)}</b>`);
  });
  $("spreadChart").innerHTML = svg;
  $("spreadChartNote").innerHTML =
    `Log-log scaling: a power law c·n<sup>a</sup> appears as a straight line with slope a. ` +
    `Fitted slopes for n ≥ 10: ${slopes.join(", ")} (theoretical value is −1 for both series). ` +
    `A tenfold increase in sample size reduces variance by a factor of 10, narrowing histogram spreads by √10 ≈ 3.2.`;
}

function runCoverage() {
  if (!lastRun) return;
  const { m, results } = lastRun;
  let rows = head([
    "n",
    "standard error σ/√n",
    "average estimated SE s/√n",
    "coverage x̄ ± 1.96·s/√n",
    "coverage x̄ ± t<sub>n−1</sub>·s/√n",
    "t<sub>0.975, n−1</sub>",
  ]);
  for (const { n, means, s2 } of results) {
    let inZ = 0,
      inT = 0,
      seSum = 0;
    const t = T975[n];
    for (let j = 0; j < m; j++) {
      const se = Math.sqrt(s2[j] / n);
      seSum += se;
      const gap = Math.abs(means[j] - DIST.mu);
      if (gap <= 1.96 * se) inZ++;
      if (gap <= t * se) inT++;
    }
    const cov = (c) => {
      const f = c / m;
      return `<b class="${Math.abs(f - 0.95) <= 0.02 ? "text-emerald-600" : "text-rose-600"}">${pct(f, 1)}</b>`;
    };
    rows += row([
      n,
      fmt(Math.sqrt(DIST.sigma2 / n), 4),
      fmt(seSum / m, 4),
      cov(inZ),
      cov(inT),
      t,
    ]);
  }
  $("covTable").innerHTML = rows;
  $("covNote").innerHTML =
    `Each attacker constructs a nominal 95% confidence interval for μ solely from their observed sample. ` +
    `For large n, coverage converges toward 95% as x̄ becomes approximately normal (CLT) and s approaches σ (LLN). ` +
    `For small sample sizes, the standard 1.96 multiplier under-covers because s/√n underestimates σ/√n on average. ` +
    `Student-t critical values widen intervals to offset sample variance variability.`;
}

$("expRun").onclick = runExperiment;
drawDist();
drawRunning();
runExperiment();
