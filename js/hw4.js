const mean = (arr) => arr.reduce((acc, val) => acc + val, 0) / arr.length;

const meanAndVariance = (arr, { sample = true } = {}) => {
  const n = arr.length;
  if (n === 0) return { mean: NaN, variance: NaN };

  let m = 0,
    m2 = 0;
  for (let i = 0; i < n; i++) {
    const delta = arr[i] - m;
    m += delta / (i + 1);
    m2 += delta * (arr[i] - m);
  }

  const denom = sample ? n - 1 : n;
  return { mean: m, variance: denom > 0 ? m2 / denom : NaN };
};

// ---------- the two models of one step X_i ----------

const RADEMACHER = "rademacher";
const BERNOULLI = "bernoulli";

// Bernoulli: the attack on one system succeeds (1) with probability p, otherwise 0.
// Math.random() is uniform in [0, 1), so it falls below p with probability p.
const bernoulliStep = (p) => (Math.random() < p ? 1 : 0);
// Rademacher: +1 or -1 with probability 1/2 each; p is not used.
const rademacherStep = () => (Math.random() < 0.5 ? 1 : -1);

const stepOf = (model, p) =>
  model === BERNOULLI ? () => bernoulliStep(p) : rademacherStep;

// ---------- 2. sample trajectories ----------

// One array per attacker: trajectories[j] = [S_1, S_2, ..., S_n], the running score over the n systems.
function calculateSampleTrajectories(model, p, systems, attackers) {
  const step = stepOf(model, p);
  const trajectories = [];
  for (let j = 0; j < attackers; j++) {
    const S = new Array(systems);
    let s = 0;

    for (let i = 0; i < systems; i++) {
      S[i] = s += step();
    }

    trajectories.push(S);
  }
  return trajectories;
}

// Line chart: system i on the x axis, score S_i on the y axis, one polyline per attacker.
// The dashed curves are the theory: n·p for Bernoulli, ±√i and ±2√i for Rademacher.
function drawTrajectories(trajectories, model, p, n) {
  const ref =
    model === BERNOULLI
      ? [{ f: (i) => p * i, label: "p·i" }]
      : [
          { f: (i) => 2 * Math.sqrt(i), label: "2√i" },
          { f: (i) => Math.sqrt(i), label: "√i" },
          { f: (i) => -Math.sqrt(i), label: "-√i" },
          { f: (i) => -2 * Math.sqrt(i), label: "-2√i" },
        ];

  // al massimo ~600 punti per linea: lo schermo non ha più pixel di così
  const every = Math.max(1, Math.floor(n / 600));
  const idx = [];
  for (let i = every - 1; i < n; i += every) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1); // includi sempre l'ultimo punto

  // min/max in un solo passaggio, solo sui punti disegnati, senza flat()
  let yMin = 0,
    yMax = 0;
  for (const r of ref) {
    const v = r.f(n);
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }
  for (const S of trajectories)
    for (const i of idx) {
      const v = S[i];
      if (v < yMin) yMin = v;
      else if (v > yMax) yMax = v;
    }

  const sx = 570 / n;
  const sy = 240 / (yMax - yMin || 1);
  const r1 = (v) => Math.round(v * 10) / 10; // un decimale basta
  const X = (i) => r1(50 + sx * i);
  const Y = (s) => r1(260 - sy * (s - yMin));

  // le X sono uguali per tutte le traiettorie: calcolale una volta
  const xs = idx.map((i) => X(i + 1));

  let svg = "";
  for (let k = 0; k <= 4; k++) {
    const v = yMin + ((yMax - yMin) * k) / 4;
    svg +=
      `<line x1="50" x2="620" y1="${Y(v)}" y2="${Y(v)}" stroke="#f1f5f9"/>` +
      `<text x="42" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">${Math.round(v)}</text>`;
  }
  for (let k = 0; k <= 4; k++)
    svg += `<text x="${X((n * k) / 4)}" y="282" font-size="11" text-anchor="middle" fill="#94a3b8">${Math.round((n * k) / 4)}</text>`;

  const start = `${X(0)},${Y(0)} `;
  for (const S of trajectories) {
    let points = start;
    for (let j = 0; j < idx.length; j++) points += `${xs[j]},${Y(S[idx[j]])} `;
    svg += `<polyline points="${points}" fill="none" stroke="#818cf8" stroke-width="1" opacity="0.5"/>`;
  }

  for (const r of ref) {
    let points = "";
    for (let i = 0; i <= n; i += every) points += `${X(i)},${Y(r.f(i))} `;
    points += `${X(n)},${Y(r.f(n))}`;
    svg +=
      `<polyline points="${points}" fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 3"/>` +
      `<text x="616" y="${Y(r.f(n)) - 4}" font-size="11" text-anchor="end" fill="#334155">${r.label}</text>`;
  }
  $("trajChart").innerHTML = svg;
}

// Fraction of the attackers whose final score S_n is within ±√n and ±2√n (Rademacher).
function trajNote(trajectories, model, p, n) {
  const last = trajectories.map((S) => S[n - 1]);
  const { mean: mu } = meanAndVariance(last);
  if (model === BERNOULLI) {
    $("trajNote").innerHTML =
      `Final scores: mean <b>${mu.toFixed(1)}</b> against n·p = <b>${(n * p).toFixed(1)}</b>. ` +
      `Every attacker climbs near the line p·i: on average they break ${pct(p, 0)} of the systems.`;
    return;
  }
  const within = (k) =>
    last.filter((s) => Math.abs(s) <= k * Math.sqrt(n)).length / last.length;
  $("trajNote").innerHTML =
    `Final scores: mean <b>${mu.toFixed(1)}</b> (theory 0). ` +
    `Within ±√n: <b>${pct(within(1), 0)}</b> of the attackers (theory ≈ 68%), ` +
    `within ±2√n: <b>${pct(within(2), 0)}</b> (theory ≈ 95%). With few lines these fractions are noisy.`;
}

function runTrajectories() {
  const model = $("trajModel").value,
    p = Number($("trajP").value),
    n = Math.max(1, Number($("trajN").value)),
    m = Math.max(1, Number($("trajM").value));
  const trajectories = calculateSampleTrajectories(model, p, n, m);
  drawTrajectories(trajectories, model, p, n);
  trajNote(trajectories, model, p, n);
}

// p only matters for Bernoulli
$("trajModel").onchange = () => {
  $("trajP").disabled = $("trajModel").value !== BERNOULLI;
  runTrajectories();
};
$("trajRun").onclick = runTrajectories;
$("trajP").disabled = $("trajModel").value !== BERNOULLI;
runTrajectories();

// ---------- 3. the three quantities ----------

const NS = [10, 100, 1000, 10000];

const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const head = (cells) =>
  `<tr>${cells.map((c) => `<th>${c}</th>`).join("")}</tr>`;

// Three significant digits, without the exponent notation of toPrecision for big numbers.
const fmt = (v) =>
  Math.abs(v) >= 1000
    ? Math.round(v).toString()
    : Number(v.toPrecision(3)).toString();

// True mean and variance of one step X_i.
const stepMoments = (model, p) =>
  model === BERNOULLI ? { mu: p, sigma2: p * (1 - p) } : { mu: 0, sigma2: 1 };

// m attackers against n systems: only the final score S_n of each one (no trajectory kept in memory).
// Both models count the successes k (a step is a success with probability q):
// Bernoulli S_n = k, Rademacher S_n = k − (n − k) = 2k − n. Faster than calling a step function n·m times.
function finalScores(model, p, n, m) {
  const q = model === BERNOULLI ? p : 0.5;
  const out = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let k = 0;
    for (let i = 0; i < n; i++) if (Math.random() < q) k++;
    out[j] = model === BERNOULLI ? k : 2 * k - n;
  }
  return out;
}

// Smallest and largest value of several arrays (reduce: spreading millions of values overflows the stack).
const range = (arrays) =>
  arrays.reduce(
    ([lo, hi], a) =>
      a.reduce(([l, h], v) => [Math.min(l, v), Math.max(h, v)], [lo, hi]),
    [Infinity, -Infinity],
  );

// Histogram as an SVG: fraction of the attackers in each of `bins` equal classes of [lo, hi].
// The same [lo, hi] is used for every n, so the plots of one row can be compared by eye.
function histogram(el, values, lo, hi, bins, title) {
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins || 1;
  for (const v of values)
    counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  const top = Math.max(...counts);
  const bw = 200 / bins;
  let svg = "";
  counts.forEach((c, k) => {
    const h = (100 * c) / top;
    svg += `<rect x="${k * bw}" y="${110 - h}" width="${bw}" height="${h}" fill="#818cf8"><title>${pct(c / values.length)}</title></rect>`;
  });
  svg +=
    `<line x1="0" x2="200" y1="110" y2="110" stroke="#cbd5e1"/>` +
    `<text x="0" y="124" font-size="10" fill="#94a3b8">${fmt(lo)}</text>` +
    `<text x="200" y="124" font-size="10" text-anchor="end" fill="#94a3b8">${fmt(hi)}</text>`;
  el.innerHTML += `<div><p class="text-xs text-slate-500">${title}</p><svg viewBox="0 0 200 128" class="w-full">${svg}</svg></div>`;
}

// One table cell: the simulated value, and the theoretical one in grey.
const cell = (sim, theory) =>
  `${fmt(sim)} <span class="text-slate-400">(${fmt(theory)})</span>`;

async function runQuantities() {
  const model = $("simModel").value,
    p = Number($("simP").value),
    m = Number($("simM").value);
  const { mu, sigma2 } = stepMoments(model, p);

  $("simRun").disabled = true;
  const results = [];
  for (const n of NS) {
    $("simRun").textContent = `Running… n = ${n}`;
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the page repaint
    const S = finalScores(model, p, n, m);
    results.push({
      n,
      S,
      avg: S.map((s) => s / n),
      norm: S.map((s) => s / Math.sqrt(n)),
    });
  }
  $("simRun").textContent = "Run";
  $("simRun").disabled = false;

  let rows = head([
    "n",
    "mean S<sub>n</sub>",
    "Var S<sub>n</sub>",
    "mean S<sub>n</sub>/n",
    "Var S<sub>n</sub>/n",
    "mean S<sub>n</sub>/√n",
    "Var S<sub>n</sub>/√n",
  ]);
  for (const { n, S, avg, norm } of results) {
    const a = meanAndVariance(S),
      b = meanAndVariance(avg),
      c = meanAndVariance(norm);
    rows += row([
      n,
      cell(a.mean, n * mu),
      cell(a.variance, n * sigma2),
      cell(b.mean, mu),
      cell(b.variance, sigma2 / n),
      cell(c.mean, Math.sqrt(n) * mu),
      cell(c.variance, sigma2),
    ]);
  }
  $("simTable").innerHTML = rows;

  // one row of histograms per quantity, one column per n, same x range along the row
  for (const [id, key] of [
    ["histS", "S"],
    ["histAvg", "avg"],
    ["histNorm", "norm"],
  ]) {
    const arrays = results.map((r) => r[key]);
    const [lo, hi] = range(arrays);
    $(id).innerHTML = "";
    results.forEach((r, k) =>
      histogram($(id), arrays[k], lo, hi, 40, `n = ${r.n}`),
    );
  }

  $("simNote").innerHTML =
    `Each cell is the simulated value with the theory in grey, from m = ${m} attackers. ` +
    `Var S<sub>n</sub> grows ×10 at each row, Var S<sub>n</sub>/n shrinks ÷10, Var S<sub>n</sub>/√n stays at σ² = ${fmt(sigma2)}. ` +
    `In the histograms the x axis is the same along each row: S<sub>n</sub> spreads out, S<sub>n</sub>/n collapses on μ = ${fmt(mu)}, ` +
    `S<sub>n</sub>/√n keeps its width` +
    (model === BERNOULLI ? ` but its centre √n·p moves to the right.` : `.`) +
    ` With n = 10 the values are few and discrete, so the histogram is a set of spikes.`;

  // Parts 4 and 5 read the same simulation
  lastRun = { model, p, m, mu, sigma2, results };
  runLLN();
  drawVariance();
}

let lastRun = null;

$("simModel").onchange = () => {
  $("simP").disabled = $("simModel").value !== BERNOULLI;
  runQuantities();
};
$("simRun").onclick = runQuantities;
$("simP").disabled = $("simModel").value !== BERNOULLI;
runQuantities();

// ---------- normal distribution ----------

// Standard normal CDF Φ(z) (Abramowitz–Stegun 7.1.26, error below 1.5·10⁻⁷).
function Phi(z) {
  const x = Math.abs(z) / Math.SQRT2,
    t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    t *
      (0.254829592 +
        t *
          (-0.284496736 +
            t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// Standard normal density φ(z), the bell curve.
const phi = (z) => Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);

// Kolmogorov–Smirnov distance between the sample and N(0, 1): the largest gap between the empirical CDF and Φ.
// S_n is discrete (many equal values), so the empirical CDF jumps: check the gap both below and above every jump.
function ksNormal(values) {
  const x = Array.from(values).sort((a, b) => a - b),
    m = x.length;
  let d = 0;
  for (let k = 0; k < m; ) {
    let last = k;
    while (last + 1 < m && x[last + 1] === x[k]) last++; // x[k..last] are all equal
    const F = Phi(x[k]);
    d = Math.max(d, Math.abs(F - k / m), Math.abs((last + 1) / m - F));
    k = last + 1;
  }
  return d;
}

// Fraction of the values that satisfy a condition.
const share = (values, test) => values.filter(test).length / values.length;

// ---------- 4. Law of Large Numbers ----------

function runLLN() {
  if (!lastRun) return;
  const { model, p, m, mu, sigma2, results } = lastRun;
  const eps = Number($("llnEps").value),
    sigma = Math.sqrt(sigma2);

  let rows = head([
    "n",
    "P(|S<sub>n</sub>/n − μ| &gt; ε)",
    "Chebyshev bound σ²/(nε²)",
    "normal approx. 2(1 − Φ(ε√n/σ))",
  ]);
  for (const { n, avg } of results) {
    const far = share(avg, (v) => Math.abs(v - mu) > eps);
    rows += row([
      n,
      `<b>${pct(far)}</b>`,
      sigma2 / (n * eps * eps) >= 1
        ? '<span class="text-slate-400">≥ 100%: no information</span>'
        : pct(sigma2 / (n * eps * eps)),
      pct(2 * (1 - Phi((eps * Math.sqrt(n)) / sigma))),
    ]);
  }
  $("llnTable").innerHTML = rows;

  const name = model === BERNOULLI ? `Bernoulli(${p})` : "Rademacher";
  $("llnNote").innerHTML =
    `${name}, μ = ${fmt(mu)}, ε = ${eps}, m = ${m} attackers. The fraction of attackers whose rate misses μ by more than ε ` +
    `goes to 0 as n grows: this is the convergence in probability. Chebyshev is always above the simulation ` +
    `(it is a bound valid for any distribution, so it is loose, and above 100% it says nothing); ` +
    `the normal approximation from the CLT follows the simulation closely. ` +
    `A smaller ε needs a larger n: the bound scales like 1/(nε²).`;
}

$("llnRun").onclick = runLLN;
$("llnEps").onchange = runLLN;

// ---------- 5. variance against n, log-log ----------

function drawVariance() {
  if (!lastRun) return;
  const { sigma2, results } = lastRun;
  const series = [
    {
      name: "S<sub>n</sub>",
      label: "S<tspan baseline-shift='sub' font-size='9'>n</tspan>",
      slope: 1,
      key: "S",
      color: "#4f46e5",
    },
    {
      name: "S<sub>n</sub>/n",
      label: "S<tspan baseline-shift='sub' font-size='9'>n</tspan>/n",
      slope: -1,
      key: "avg",
      color: "#e11d48",
    },
    {
      name: "S<sub>n</sub>/√n",
      label: "S<tspan baseline-shift='sub' font-size='9'>n</tspan>/√n",
      slope: 0,
      key: "norm",
      color: "#059669",
    },
  ];
  const ns = results.map((r) => r.n);
  const lx0 = Math.log10(ns[0]),
    lx1 = Math.log10(ns[ns.length - 1]);
  // y range: the theory lines at the two ends, one decade of margin
  const ly0 = Math.floor(Math.log10(sigma2 / ns[ns.length - 1])) - 0.5,
    ly1 = Math.ceil(Math.log10(sigma2 * ns[ns.length - 1])) + 0.5;
  const X = (n) => 70 + (530 * (Math.log10(n) - lx0)) / (lx1 - lx0),
    Y = (v) => 260 - (240 * (Math.log10(v) - ly0)) / (ly1 - ly0);

  let svg = "";
  for (let e = Math.ceil(ly0); e <= ly1; e++)
    svg +=
      `<line x1="70" x2="600" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" stroke="#f1f5f9"/>` +
      `<text x="62" y="${Y(10 ** e) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">10<tspan baseline-shift="super" font-size="8">${e}</tspan></text>`;
  for (const n of ns)
    svg += `<text x="${X(n)}" y="282" font-size="11" text-anchor="middle" fill="#94a3b8">n = ${n}</text>`;

  const slopes = [];
  series.forEach((s, k) => {
    const theory = (n) => sigma2 * n ** s.slope;
    svg += `<line x1="${X(ns[0])}" x2="${X(ns[ns.length - 1])}" y1="${Y(theory(ns[0]))}" y2="${Y(theory(ns[ns.length - 1]))}" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6"/>`;
    const pts = results.map((r) => [r.n, meanAndVariance(r[s.key]).variance]);
    for (const [n, v] of pts)
      svg += `<circle cx="${X(n)}" cy="${Y(v)}" r="4" fill="${s.color}"><title>${fmt(v)}</title></circle>`;
    svg +=
      `<rect x="${90 + 120 * k}" y="10" width="12" height="12" rx="2" fill="${s.color}"/>` +
      `<text x="${108 + 120 * k}" y="20" font-size="12" fill="#334155">${s.label}</text>`;
    // least-squares slope of log Var against log n
    const lx = pts.map(([n]) => Math.log10(n)),
      lv = pts.map(([, v]) => Math.log10(v));
    const mx = mean(lx),
      mv = mean(lv);
    const num = lx.reduce((a, x, i) => a + (x - mx) * (lv[i] - mv), 0),
      den = lx.reduce((a, x) => a + (x - mx) ** 2, 0);
    slopes.push(
      `${s.name}: <b>${(num / den).toFixed(3)}</b> (theory ${s.slope})`,
    );
  });
  $("varChart").innerHTML = svg;
  $("varNote").innerHTML =
    `Slopes fitted on the simulated points (least squares on log Var against log n): ${slopes.join(", ")}. ` +
    `Multiplying n by 10 multiplies Var S<sub>n</sub> by 10, divides Var S<sub>n</sub>/n by 10, leaves Var S<sub>n</sub>/√n at σ² = ${fmt(sigma2)}.`;
}

// ---------- 6. Central Limit Theorem ----------

const CLT_M = 5000;

// Histogram as a density (height = fraction / bin width) on [-4, 4], with the bell curve φ on top.
// The bins follow the lattice of the values: S_n/√n takes values 2/√n apart, so a bin holds a whole number of them.
function densityHistogram(el, values, n, title) {
  const step = 2 / Math.sqrt(n);
  const w = step * Math.max(1, Math.round(0.2 / step)); // about 0.2 wide, but a multiple of the lattice step
  const start = -Math.sqrt(n) - step / 2; // the smallest possible value, -n/√n, minus half a step
  const counts = new Map();
  for (const v of values) {
    const b = Math.floor((v - start) / w);
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  const X = (z) => (200 * (z + 4)) / 8,
    Y = (d) => 110 - 220 * d; // density 0.5 at the top
  let svg = "";
  for (const [b, c] of counts) {
    const lo = Math.max(-4, start + b * w),
      hi = Math.min(4, start + (b + 1) * w);
    if (hi <= lo) continue;
    const d = Math.min(0.5, c / values.length / w);
    svg += `<rect x="${X(lo)}" y="${Y(d)}" width="${X(hi) - X(lo)}" height="${110 - Y(d)}" fill="#818cf8"/>`;
  }
  let curve = "";
  for (let z = -4; z <= 4.001; z += 0.1) curve += `${X(z)},${Y(phi(z))} `;
  svg +=
    `<polyline points="${curve}" fill="none" stroke="#334155" stroke-width="1.5"/>` +
    `<line x1="0" x2="200" y1="110" y2="110" stroke="#cbd5e1"/>` +
    `<text x="0" y="124" font-size="10" fill="#94a3b8">−4</text>` +
    `<text x="100" y="124" font-size="10" text-anchor="middle" fill="#94a3b8">0</text>` +
    `<text x="200" y="124" font-size="10" text-anchor="end" fill="#94a3b8">4</text>`;
  el.innerHTML += `<div><p class="text-xs text-slate-500">${title}</p><svg viewBox="0 0 200 128" class="w-full">${svg}</svg></div>`;
}

async function runCLT() {
  $("cltRun").disabled = true;
  $("cltHist").innerHTML = "";
  let rad = head([
    "n",
    "KS distance from N(0, 1)",
    "P(|S<sub>n</sub>/√n| ≤ 1) (68.3%)",
    "P(|S<sub>n</sub>/√n| ≤ 1.96) (95%)",
  ]);
  const ks = [];

  for (const n of NS) {
    $("cltRun").textContent = `Running… n = ${n}`;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const norm = finalScores(RADEMACHER, 0, n, CLT_M).map(
      (s) => s / Math.sqrt(n),
    );
    densityHistogram($("cltHist"), norm, n, `n = ${n}`);
    const d = ksNormal(norm);
    ks.push(d);
    rad += row([
      n,
      `<b>${d.toFixed(3)}</b>`,
      pct(share(norm, (z) => Math.abs(z) <= 1)),
      pct(share(norm, (z) => Math.abs(z) <= 1.96)),
    ]);
  }
  $("cltTable").innerHTML = rad;
  $("cltRun").textContent = "Run again";
  $("cltRun").disabled = false;

  $("cltNote").innerHTML =
    `The KS distance falls from ${ks[0].toFixed(3)} (n = 10) to ${ks[ks.length - 1].toFixed(3)} (n = 10000): ` +
    `the histogram of S<sub>n</sub>/√n sticks to the bell curve and the fractions within ±1 and ±1.96 approach 68.3% and 95%. ` +
    `With n = 10, S<sub>n</sub> takes only 11 values, so the empirical CDF is a staircase far from Φ. ` +
    `With m = ${CLT_M} attackers the KS distance cannot go much below about 1/√m ≈ ${(1 / Math.sqrt(CLT_M)).toFixed(3)}: that is the noise of the sample.`;
}

$("cltRun").onclick = runCLT;
runCLT();

// ---------- 7. how many attackers ----------

const MS = [20, 100, 1000, 10000];

// 7a: Rademacher, n = 100. Each estimate with its 95% band around the true value.
function runPrecision() {
  const n = 100;
  // exact P(|S_100/10| ≤ 1.96) for the discrete walk: S = 2k − 100 with k ~ Binomial(100, 1/2), so 41 ≤ k ≤ 59
  let pmf = 0.5 ** n,
    exact = 0;
  for (let k = 0; k <= n; k++) {
    if (Math.abs(2 * k - n) / Math.sqrt(n) <= 1.96) exact += pmf;
    pmf *= (n - k) / (k + 1); // C(n, k+1) = C(n, k)·(n − k)/(k + 1)
  }
  let rows = head([
    "m",
    "mean S<sub>n</sub>/√n (0 ± 1.96/√m)",
    "Var S<sub>n</sub>/√n (1 ± 1.96·√(2/m))",
    `P(|S<sub>n</sub>/√n| ≤ 1.96) (exact ${pct(exact)})`,
  ]);
  // `top` caps the band of a probability at 1
  const band = (v, center, half, top = Infinity) =>
    `${Math.abs(v - center) <= half ? "<b>" : '<b class="text-rose-600">'}${fmt(v)}</b> ` +
    `<span class="text-slate-400">[${fmt(center - half)}, ${fmt(Math.min(top, center + half))}]</span>`;
  for (const m of MS) {
    const norm = finalScores(RADEMACHER, 0, n, m).map((s) => s / Math.sqrt(n));
    const { mean: mu, variance } = meanAndVariance(norm);
    const inside = share(norm, (z) => Math.abs(z) <= 1.96);
    rows += row([
      m,
      band(mu, 0, 1.96 / Math.sqrt(m)),
      band(variance, 1, 1.96 * Math.sqrt(2 / m)),
      band(inside, exact, 1.96 * Math.sqrt((exact * (1 - exact)) / m), 1),
    ]);
  }
  $("attPrecision").innerHTML = rows;
}

// 7b: Bernoulli, m attackers against n systems: the highest score, and the chance that someone crosses np + 2σ√n.
function runWorst() {
  const n = Math.max(1, Number($("attN").value)),
    p = Number($("attP").value);
  const sigma = Math.sqrt(p * (1 - p)),
    threshold = n * p + 2 * sigma * Math.sqrt(n),
    q = 1 - Phi(2);
  let rows = head([
    "m",
    "highest S<sub>n</sub>",
    "how many σ√n above np",
    "attackers above np + 2σ√n",
    "P(at least one above) = 1 − (1 − q)<sup>m</sup>",
  ]);
  let all = null;
  for (const m of [1, ...MS]) {
    const S = finalScores(BERNOULLI, p, n, m);
    const max = S.reduce((a, v) => Math.max(a, v), -Infinity);
    rows += row([
      m,
      `<b>${max}</b>`,
      ((max - n * p) / (sigma * Math.sqrt(n))).toFixed(2),
      S.filter((s) => s > threshold).length,
      pct(1 - (1 - q) ** m),
    ]);
    all = S;
  }
  $("attWorst").innerHTML = rows;

  // the aggregate score of the last group: a sum of n·m steps
  const m = all.length,
    total = all.reduce((a, v) => a + v, 0);
  $("attNote").innerHTML =
    `n = ${n}, p = ${p}: an average attacker breaks np = ${fmt(n * p)} systems, the threshold is ${fmt(threshold)}. ` +
    `One attacker crosses it with probability q ≈ ${pct(q)}, but with 100 attackers someone almost surely does, ` +
    `and the record tends to rise with m (roughly like σ√n·√(2 ln m), so slowly and with noise).<br/><br/>` +
    `<b>Aggregate score.</b> The ${m} attackers together broke ${total} systems out of n·m = ${n * m}: ` +
    `a rate of ${(total / (n * m)).toFixed(4)} against p = ${p}, with standard deviation √(p(1−p)/(nm)) = ` +
    `${Math.sqrt((p * (1 - p)) / (n * m)).toFixed(5)}. The sum over all attackers is the same random walk with n·m steps, so it is even more concentrated.`;
}

$("attRun").onclick = () => {
  runPrecision();
  runWorst();
};
runPrecision();
runWorst();
