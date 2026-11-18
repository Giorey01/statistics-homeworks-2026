// Homework 7 — Statistical independence: contingency table, expected
// frequencies, the χ² statistic and its p-value.
// The statistical core comes first (pure functions, testable with Node);
// the page code is in initPage() at the bottom.

/* ===================================================================
   Part 0 — a seeded random generator
   =================================================================== */

// mulberry32: a tiny 32-bit generator. Same seed → same numbers, so the
// page shows the same tables every time it is opened (Math.random cannot be seeded).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draw an index from a discrete distribution `probs` (they sum to 1).
function draw(probs, rng) {
  let u = rng(),
    c = 0;
  for (let i = 0; i < probs.length; i++) {
    c += probs[i];
    if (u < c) return i;
  }
  return probs.length - 1;
}

/* ===================================================================
   Part 1 — the datasets (X, F)
   =================================================================== */

// The hacker theme of HW4–HW5: X = level of the hacker, F = outcome on a system.
const LEVELS = ["junior", "mid", "senior"];
const OUTCOMES = ["failed", "partial", "success"];
const P_LEVEL = [0.5, 0.3, 0.2];

// P(F | X) for each model. In the independent model every row is the same.
const P_OUT_INDEP = [0.6, 0.25, 0.15];
const P_OUT_DEP = [
  [0.75, 0.18, 0.07], // junior
  [0.55, 0.3, 0.15], // mid
  [0.35, 0.3, 0.35], // senior
];
const P_OUT_WEAK = [
  [0.62, 0.25, 0.13],
  [0.6, 0.25, 0.15],
  [0.56, 0.25, 0.19],
];

// Generate n units: first X from its marginal, then F from P(F | X = x).
function makeHackers(n, rng, pOutGivenLevel) {
  const xs = new Array(n),
    fs = new Array(n);
  for (let k = 0; k < n; k++) {
    const i = draw(P_LEVEL, rng);
    xs[k] = LEVELS[i];
    fs[k] = OUTCOMES[draw(pOutGivenLevel[i], rng)];
  }
  return { xs, fs };
}

// Titanic, 2201 people on board: class × survived.
// Source: R dataset `datasets::Titanic` (Dawson 1995), summed over sex and age.
const TITANIC = {
  rows: ["1st", "2nd", "3rd", "crew"],
  cols: ["died", "survived"],
  table: [
    [122, 203],
    [167, 118],
    [528, 178],
    [673, 212],
  ],
};

// UC Berkeley graduate admissions, fall 1973, the six largest departments.
// Source: R dataset `datasets::UCBAdmissions` (Bickel, Hammel, O'Connell 1975).
// For each department: [male admitted, male rejected, female admitted, female rejected].
const BERKELEY = {
  A: [512, 313, 89, 19],
  B: [353, 207, 17, 8],
  C: [120, 205, 202, 391],
  D: [138, 279, 131, 244],
  E: [53, 138, 94, 299],
  F: [22, 351, 24, 317],
};

// NSL-KDD (Tavallaee et al. 2009), the "KDDTrain+_20Percent" file: 25192 network connections.
// X = transport protocol, F = traffic class. The 22 attack labels of the file are grouped with the
// standard KDD taxonomy: DoS, Probe and "R2L/U2R" (remote-to-local and user-to-root, rare, merged).
const NSLKDD = {
  rows: ["tcp", "udp", "icmp"],
  cols: ["normal", "DoS", "Probe", "R2L/U2R"],
  table: [
    [10681, 8479, 1147, 219],
    [2507, 188, 315, 1],
    [261, 567, 827, 0],
  ],
};

// Turn a table of counts back into one record per unit, so that the real
// dataset goes through exactly the same code (crossTab) as the synthetic ones.
function expandTable({ rows, cols, table }) {
  const xs = [],
    fs = [];
  table.forEach((line, i) =>
    line.forEach((count, j) => {
      for (let k = 0; k < count; k++) {
        xs.push(rows[i]);
        fs.push(cols[j]);
      }
    })
  );
  return { xs, fs };
}

// Fisher–Yates shuffle (in place), used both to mix the real records and for the permutation test.
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// Real tables go through the same code as the synthetic ones: expand to one pair per unit, then shuffle
// the records together so the preview shows a realistic mix.
function realMake(T) {
  const d = expandTable(T);
  return (n, rng) => {
    const idx = shuffle([...d.xs.keys()], rng);
    return { xs: idx.map((k) => d.xs[k]), fs: idx.map((k) => d.fs[k]) };
  };
}

const DATASETS = [
  {
    id: "indep",
    hidden: true, // not in the menu: §8 uses this model for the type I error experiment
    label: "Synthetic, independent (hackers)",
    xName: "level",
    fName: "outcome",
    rows: LEVELS,
    cols: OUTCOMES,
    make: (n, rng) => makeHackers(n, rng, [P_OUT_INDEP, P_OUT_INDEP, P_OUT_INDEP]),
    truth: "independent",
    about:
      "X = hacker level (junior 50%, mid 30%, senior 20%). F = outcome on the system, drawn from the <b>same</b> distribution (failed 60%, partial 25%, success 15%) whatever the level. X and F are independent by construction: the test should <i>not</i> reject, except about 5% of the time by chance.",
  },
  {
    id: "dep",
    label: "Synthetic, dependent (hackers)",
    xName: "level",
    fName: "outcome",
    rows: LEVELS,
    cols: OUTCOMES,
    make: (n, rng) => makeHackers(n, rng, P_OUT_DEP),
    truth: "dependent",
    about:
      "Same levels, but now the outcome depends on the level: success 7% for juniors, 15% for mids, 35% for seniors. X and F are dependent by construction (and here we also know the cause: skill → outcome). The test should reject.",
  },
  {
    id: "weak",
    hidden: true, // not in the menu: §8 uses this model for the power experiment
    label: "Synthetic, weakly dependent (hackers)",
    xName: "level",
    fName: "outcome",
    rows: LEVELS,
    cols: OUTCOMES,
    make: (n, rng) => makeHackers(n, rng, P_OUT_WEAK),
    truth: "dependent (weak)",
    about:
      "A tiny dependence: success 13%, 15%, 19% for the three levels. Dependent by construction, but with a small n the test usually cannot see it. Try n = 200 and then n = 20000.",
  },
  {
    id: "titanic",
    label: "Real: Titanic, class × survival (n = 2201)",
    xName: "class",
    fName: "survived",
    rows: TITANIC.rows,
    cols: TITANIC.cols,
    make: realMake(TITANIC),
    fixedN: 2201,
        truth: "unknown (real data)",
    about:
      "The 2201 people on board the Titanic (April 1912), classified by class (1st, 2nd, 3rd, crew) and by whether they survived. Counts from the R dataset <span class='mono'>datasets::Titanic</span> (Dawson 1995), summed over sex and age. The value of n is fixed by the data.",
  },
  {
    id: "nslkdd",
    label: "Real: NSL-KDD network traffic, protocol × traffic class (n = 25192)",
    xName: "protocol",
    fName: "traffic class",
    rows: NSLKDD.rows,
    cols: NSLKDD.cols,
    make: realMake(NSLKDD),
    fixedN: 25192,
    truth: "unknown (real data)",
    about:
      "25192 network connections from the NSL-KDD intrusion detection set (the 20% training file), classified by transport protocol (tcp, udp, icmp) and by traffic class: normal, denial of service (DoS), probe, or R2L/U2R (remote-to-local and user-to-root attacks, merged because they are rare). Each of the 22 attack labels of the file is assigned to its class with the standard KDD taxonomy. The value of n is fixed by the data.",
  },
];

/* ===================================================================
   Part 2 — contingency table, marginal and conditional frequencies
   =================================================================== */

// Count the pairs. `rows` / `cols` fix the order of the categories; if they
// are not given, the categories are read from the data in order of appearance.
function crossTab(xs, fs, rows, cols) {
  if (xs.length !== fs.length) throw new Error("xs and fs must have the same length");
  rows = rows || [...new Set(xs)];
  cols = cols || [...new Set(fs)];
  const ri = new Map(rows.map((v, i) => [v, i])),
    ci = new Map(cols.map((v, j) => [v, j]));
  const table = rows.map(() => cols.map(() => 0));
  for (let k = 0; k < xs.length; k++) table[ri.get(xs[k])][ci.get(fs[k])]++;
  return withTotals(rows, cols, table);
}

// Margins of any table (also of a table of probabilities).
function withTotals(rows, cols, table) {
  const rowTot = table.map((line) => line.reduce((s, v) => s + v, 0));
  const colTot = cols.map((_, j) => table.reduce((s, line) => s + line[j], 0));
  const n = rowTot.reduce((s, v) => s + v, 0);
  return { rows, cols, table, rowTot, colTot, n };
}

// Joint relative frequencies f_ij = n_ij / n (they sum to 1 over the whole table).
const relFreq = (ct) => ct.table.map((line) => line.map((v) => v / ct.n));
// Row profiles f(b_j | a_i) = n_ij / n_i· (each row sums to 1).
const rowProfiles = (ct) => ct.table.map((line, i) => line.map((v) => v / ct.rowTot[i]));
// Column profiles f(a_i | b_j) = n_ij / n_·j (each column sums to 1).
const colProfiles = (ct) => ct.table.map((line) => line.map((v, j) => v / ct.colTot[j]));

/* ===================================================================
   Part 3 — expected frequencies and the χ² statistic
   =================================================================== */

// E_ij = n_i· · n_·j / n: "row total times column total over the grand total".
const expected = (ct) => ct.rowTot.map((ri) => ct.colTot.map((cj) => (ri * cj) / ct.n));

function chiSquare(ct) {
  const E = expected(ct);
  const r = ct.rows.length,
    c = ct.cols.length;
  let chi2 = 0,
    sumRatio = 0;
  const contrib = [],
    resid = [];
  for (let i = 0; i < r; i++) {
    contrib.push([]);
    resid.push([]);
    for (let j = 0; j < c; j++) {
      const O = ct.table[i][j],
        e = E[i][j];
      const d = O - e;
      contrib[i].push((d * d) / e);
      resid[i].push(d / Math.sqrt(e));
      chi2 += (d * d) / e;
      sumRatio += (O * O) / (ct.rowTot[i] * ct.colTot[j]);
    }
  }
  // second formula χ² = n·(Σ n_ij² / (n_i· n_·j) − 1): an independent check of the first
  const chi2Alt = ct.n * (sumRatio - 1);
  return { chi2, chi2Alt, df: (r - 1) * (c - 1), E, contrib, resid };
}

// Cramér's V = √(χ² / (n·(min(r, c) − 1))), between 0 and 1: the strength, not the significance.
const cramersV = (chi2, n, r, c) => Math.sqrt(chi2 / (n * (Math.min(r, c) - 1)));

// Cohen's rough guide: 0.1 small, 0.3 medium, 0.5 large for a 2×2 table;
// for bigger tables the thresholds are divided by √(min(r, c) − 1).
function strength(V, r, c) {
  const k = Math.sqrt(Math.min(r, c) - 1);
  return V < 0.1 / k ? "negligible" : V < 0.3 / k ? "small" : V < 0.5 / k ? "medium" : "large";
}

// Cochran's rule for the χ² approximation: no E_ij < 1, at most 20% of the cells with E_ij < 5.
function cochran(E) {
  const all = E.flat();
  const min = Math.min(...all);
  const below5 = all.filter((e) => e < 5).length / all.length;
  return { min, below5, ok: min >= 1 && below5 <= 0.2 };
}

/* ===================================================================
   Part 4 — the p-value: right tail of the χ² distribution
   =================================================================== */

// (a) df = 1. χ²₁ is Z² with Z standard normal, so p = P(|Z| ≥ √x) = 2·Φ(−√x).
//     Φ(−a) is the small normal tail of HW6, computed without ever doing 1 − Φ.
const SQRT2PI = Math.sqrt(2 * Math.PI);
const phi = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;
function normalTail(a) {
  // Q(a) = Φ(−a) for a ≥ 0 (the hybrid method of HW6)
  if (a < 1.4) {
    let term = a,
      sum = a;
    for (let k = 3; k < 200; k += 2) {
      term *= (a * a) / k;
      sum += term;
      if (term < 1e-17 * sum) break;
    }
    return 0.5 - phi(a) * sum;
  }
  const terms = Math.ceil(15 + 500 / (a * a));
  let d = a;
  for (let k = terms; k >= 1; k--) d = a + k / d;
  return phi(a) / d;
}
const chi2SfDf1 = (x) => (x <= 0 ? 1 : 2 * normalTail(Math.sqrt(x)));

// (b) even df = 2m: the tail is a finite sum, p = e^{−x/2} · Σ_{k=0}^{m−1} (x/2)^k / k!.
function chi2SfEven(x, df) {
  const z = x / 2;
  let term = 1,
    sum = 1;
  for (let k = 1; k < df / 2; k++) {
    term *= z / k;
    sum += term;
  }
  return Math.exp(-z) * sum;
}

// (c) any df: p = Q(df/2, x/2), the regularized upper incomplete gamma function.
//     ln Γ(a) by the Lanczos approximation (g = 7, 9 coefficients), ~15 correct digits.
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function lnGamma(a) {
  if (a < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * a))) - lnGamma(1 - a); // reflection
  a -= 1;
  let s = LANCZOS[0];
  for (let k = 1; k < 9; k++) s += LANCZOS[k] / (a + k);
  const t = a + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (a + 0.5) * Math.log(t) - t + Math.log(s);
}

// Lower part P(a, z) by its power series, good for z < a + 1:
//   P(a, z) = e^{−z} z^a / Γ(a + 1) · Σ_k z^k / ((a + 1)(a + 2)…(a + k)).
function gammaPSeries(a, z) {
  let term = 1 / a,
    sum = term;
  for (let k = 1; k < 1000; k++) {
    term *= z / (a + k);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
  }
  return sum * Math.exp(-z + a * Math.log(z) - lnGamma(a));
}

// Upper part Q(a, z) by its continued fraction (modified Lentz), good for z ≥ a + 1.
// Same idea as the normal tail of HW6: the small tail is computed directly, never as 1 − P.
function gammaQContinuedFraction(a, z) {
  const TINY = 1e-300;
  let b = z + 1 - a,
    c = 1 / TINY,
    d = 1 / b,
    h = d;
  for (let k = 1; k < 1000; k++) {
    const an = -k * (k - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-z + a * Math.log(z) - lnGamma(a)) * h;
}

function gammaQ(a, z) {
  if (z <= 0) return 1;
  return z < a + 1 ? 1 - gammaPSeries(a, z) : gammaQContinuedFraction(a, z);
}

// The p-value used everywhere on the page.
const chi2Sf = (x, df) => gammaQ(df / 2, x / 2);

// Density of χ²_df, for the pictures.
const chi2Pdf = (x, df) =>
  x <= 0 ? 0 : Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.log(2) - lnGamma(df / 2));

// Critical value: the x with P(χ²_df ≥ x) = α, by bisection on chi2Sf (which decreases in x).
function chi2Critical(df, alpha = 0.05) {
  let lo = 0,
    hi = df + 20 * Math.sqrt(2 * df) + 20;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (chi2Sf(m, df) > alpha) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// Reference p-values, computed separately in Python 3 (standard library only) with
// the exact recurrences Q(½, z) = erfc(√z), Q(1, z) = e^{−z}, Q(a + 1, z) = Q(a, z) + z^a e^{−z} / Γ(a + 1).
// [x, df, p]
const REF = [
  [1, 1, 0.3173105078629141],
  [3.841, 1, 0.050013683763956714],
  [10, 1, 0.0015654022580025488],
  [50, 1, 1.537459794428035e-12],
  [5.991, 2, 0.05001161502657909],
  [7.815, 3, 0.04999390297488391],
  [0.5, 5, 0.9921232932326297],
  [12.592, 6, 0.049992458189210026],
  [30, 7, 9.495972508134202e-5],
  [100, 10, 5.449701982920556e-17],
  [92.20528041152764, 1, 7.813600388994619e-22], // Berkeley, aggregated 2×2
  [190.40110361683327, 3, 4.999927529868021e-41], // Titanic, class × survived
];

/* ===================================================================
   Part 5 — permutation test and repeated experiments
   =================================================================== */

// χ² from integer codes, used inside the loops (no Maps, no strings).
function chi2FromCodes(xi, fi, r, c) {
  const t = new Float64Array(r * c),
    rt = new Float64Array(r),
    ctot = new Float64Array(c);
  const n = xi.length;
  for (let k = 0; k < n; k++) {
    t[xi[k] * c + fi[k]]++;
    rt[xi[k]]++;
    ctot[fi[k]]++;
  }
  let s = 0;
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++) {
      const e = (rt[i] * ctot[j]) / n;
      if (e > 0) s += (t[i * c + j] - e) ** 2 / e;
    }
  return s;
}

const encode = (values, cats) => {
  const m = new Map(cats.map((v, i) => [v, i]));
  return Int32Array.from(values, (v) => m.get(v));
};

// Shuffle F among the units: any link with X is destroyed, both margins stay the same.
// p ≈ (#{χ²_perm ≥ χ²_obs} + 1) / (B + 1)  (the +1 counts the observed table itself).
function permutationTest(xs, fs, rows, cols, B, rng) {
  const xi = encode(xs, rows),
    fi = encode(fs, cols);
  const obs = chi2FromCodes(xi, fi, rows.length, cols.length);
  const perm = Int32Array.from(fi);
  const sims = new Float64Array(B);
  let hits = 0;
  for (let b = 0; b < B; b++) {
    shuffle(perm, rng);
    sims[b] = chi2FromCodes(xi, perm, rows.length, cols.length);
    if (sims[b] >= obs - 1e-9) hits++;
  }
  return { obs, sims, p: (hits + 1) / (B + 1) };
}

// Repeat the whole experiment `reps` times on fresh data and collect the p-values.
function repeatTest(ds, n, reps, rng) {
  const pvals = [],
    vs = [],
    df = (ds.rows.length - 1) * (ds.cols.length - 1);
  for (let k = 0; k < reps; k++) {
    const { xs, fs } = ds.make(n, rng);
    const chi2 = chi2FromCodes(encode(xs, ds.rows), encode(fs, ds.cols), ds.rows.length, ds.cols.length);
    pvals.push(chi2Sf(chi2, df));
    vs.push(cramersV(chi2, n, ds.rows.length, ds.cols.length));
  }
  return { pvals, vs };
}

// The χ² and V of the model itself (the "population"): the formulas work on a table of probabilities with n = 1.
function populationV(pOut) {
  const table = P_LEVEL.map((pl, i) => pOut[i].map((q) => pl * q));
  const ct = withTotals(LEVELS, OUTCOMES, table);
  return cramersV(chiSquare(ct).chi2, 1, 3, 3);
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/* ===================================================================
   Part 6 — theory demos: uncorrelated ≠ independent, pairwise ≠ mutual,
   Simpson's paradox
   =================================================================== */

// Pearson correlation of two numeric arrays.
function correlation(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n,
    mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0,
    saa = 0,
    sbb = 0;
  for (let k = 0; k < n; k++) {
    sab += (a[k] - ma) * (b[k] - mb);
    saa += (a[k] - ma) ** 2;
    sbb += (b[k] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

// X uniform on {−1, 0, 1} (100 units each), Y = X².
function uncorrelatedDemo() {
  const xs = [],
    ys = [];
  for (const x of [-1, 0, 1])
    for (let k = 0; k < 100; k++) {
      xs.push(x);
      ys.push(x * x);
    }
  const ct = crossTab(xs, ys, [-1, 0, 1], [0, 1]);
  const chi = chiSquare(ct);
  return { ct, r: correlation(xs, ys), ...chi, V: cramersV(chi.chi2, ct.n, 3, 2), p: chi2Sf(chi.chi2, chi.df) };
}

// Two fair coins. A = first is heads, B = second is heads, C = the two coins agree.
// Exact probabilities by enumerating the 4 equally likely outcomes.
function coinsDemo() {
  const outcomes = [
    [1, 1],
    [1, 0],
    [0, 1],
    [0, 0],
  ];
  const A = ([a]) => a === 1,
    B = ([, b]) => b === 1,
    C = ([a, b]) => a === b;
  const P = (ev) => outcomes.filter(ev).length / 4;
  const and = (...evs) => (o) => evs.every((e) => e(o));
  return [
    ["P(A)", P(A), "½"],
    ["P(B)", P(B), "½"],
    ["P(C)", P(C), "½"],
    ["P(A ∩ B) vs P(A)P(B)", [P(and(A, B)), P(A) * P(B)], "¼ = ¼ ✓"],
    ["P(A ∩ C) vs P(A)P(C)", [P(and(A, C)), P(A) * P(C)], "¼ = ¼ ✓"],
    ["P(B ∩ C) vs P(B)P(C)", [P(and(B, C)), P(B) * P(C)], "¼ = ¼ ✓"],
    ["P(A ∩ B ∩ C) vs P(A)P(B)P(C)", [P(and(A, B, C)), P(A) * P(B) * P(C)], "¼ ≠ ⅛ ✗"],
  ];
}

// Synthetic confounder. Z = company size. Large companies buy an IDS much more often
// AND are attacked much more often; inside each size class, the IDS changes nothing.
// Each stratum is built exactly independent (E = O), so χ² = 0 inside it.
// [IDS & incident, IDS & no incident, no IDS & incident, no IDS & no incident]
const SIMPSON = {
  small: [5, 95, 45, 855], // 1000 small companies: 10% have an IDS, 5% have an incident
  large: [270, 630, 30, 70], // 1000 large companies: 90% have an IDS, 30% have an incident
};

const twoByTwo = (q, rows, cols) =>
  withTotals(rows, cols, [
    [q[0], q[1]],
    [q[2], q[3]],
  ]);
const addTables = (qs) => qs.reduce((s, q) => s.map((v, k) => v + q[k]), [0, 0, 0, 0]);

/* ===================================================================
   Page code
   =================================================================== */

const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const head = (cells) => `<tr>${cells.map((c) => `<th>${c}</th>`).join("")}</tr>`;
const fmt = (v, digits = 4) =>
  v === Infinity ? "∞" : !Number.isFinite(v) ? "–" : Number(v.toPrecision(digits)).toString();
const fix = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const sci = (v, digits = 2) => {
  if (v === 0) return "0";
  if (!Number.isFinite(v)) return "–";
  if (v >= 1e-3) return fmt(v, digits + 1);
  return v
    .toExponential(digits)
    .replace("e", "·10^")
    .replace(/\^\+?(-?\d+)/, "<sup>$1</sup>");
};
const repaint = () => new Promise((resolve) => setTimeout(resolve, 0));
const wolfram = (x, df) =>
  "https://www.wolframalpha.com/input?i=" +
  encodeURIComponent(`SurvivalFunction[ChiSquareDistribution[${df}], ${+x.toPrecision(10)}]`);

// One colour per column category (failed / partial / success, or died / survived).
const COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#6366f1", "#0ea5e9"];
const colColors = (cols) =>
  cols.length === 2 ? ["#f43f5e", "#10b981"] : cols.map((_, j) => COLORS[j % COLORS.length]);

const ALPHA = 0.05;
const state = { ds: null, data: null, ct: null, chi: null, seed: 7 };

/* ---------- a generic "table with margins" ---------- */

// cellFn(i, j) → content of a cell; rowEnd(i), colEnd(j), corner → the margins (optional).
function marginTable(ct, cellFn, rowEnd, colEnd, corner, endLabel = "total") {
  const hasRowEnd = !!rowEnd,
    hasColEnd = !!colEnd;
  let html = head([
    `<span class="font-sans">${state.ds ? state.ds.xName : "X"} ↓ / ${state.ds ? state.ds.fName : "F"} →</span>`,
    ...ct.cols,
    ...(hasRowEnd ? [`<b>${endLabel}</b>`] : []),
  ]);
  ct.rows.forEach((rname, i) => {
    html += row([
      `<b class="font-sans">${rname}</b>`,
      ...ct.cols.map((_, j) => cellFn(i, j)),
      ...(hasRowEnd ? [`<b>${rowEnd(i)}</b>`] : []),
    ]);
  });
  if (hasColEnd)
    html += row([
      `<b class="font-sans">${endLabel}</b>`,
      ...ct.cols.map((_, j) => `<b>${colEnd(j)}</b>`),
      ...(hasRowEnd ? [`<b>${corner}</b>`] : []),
    ]);
  return html;
}

/* ---------- 1. dataset ---------- */

function fillDatasets() {
  $("dsPick").innerHTML = DATASETS.filter((d) => !d.hidden).map((d) => `<option value="${d.id}">${d.label}</option>`).join("");
  $("dsPick").onchange = () => {
    const d = DATASETS.find((x) => x.id === $("dsPick").value);
    $("dsN").disabled = !!d.fixedN;
    if (d.fixedN) $("dsN").value = d.fixedN;
    runAll();
  };
}

function runAll() {
  const ds = DATASETS.find((x) => x.id === $("dsPick").value);
  let n = ds.fixedN || Math.max(20, Math.min(200000, Math.round(Number($("dsN").value) || 500)));
  $("dsN").value = n;
  state.seed = Math.max(1, Math.round(Number($("dsSeed").value) || 1));
  const rng = mulberry32(state.seed);
  state.ds = ds;
  state.data = ds.make(n, rng);
  state.ct = crossTab(state.data.xs, state.data.fs, ds.rows, ds.cols);
  state.chi = chiSquare(state.ct);

  showDataset();
  showTable();
  showFrequencies();
  showExpected();
  showChiSquare();
  showPValue();
}

function showDataset() {
  const { ds, data } = state;
  $("dsAbout").innerHTML = ds.about;
  let html = head(["k", `x<sub>k</sub> (${ds.xName})`, `f<sub>k</sub> (${ds.fName})`]);
  for (let k = 0; k < Math.min(8, data.xs.length); k++) html += row([k + 1, data.xs[k], data.fs[k]]);
  html += row(["…", "…", "…"]);
  const last = data.xs.length - 1;
  html += row([last + 1, data.xs[last], data.fs[last]]);
  $("dsPreview").innerHTML = html;
  $("dsCount").textContent = `n = ${data.xs.length} units. The first 8 and the last one are shown: this list is the only input of the code below.`;
}

/* ---------- 2. contingency table ---------- */

function showTable() {
  const ct = state.ct;
  $("ctTable").innerHTML = marginTable(
    ct,
    (i, j) => ct.table[i][j],
    (i) => ct.rowTot[i],
    (j) => ct.colTot[j],
    ct.n
  );
  const sumCells = ct.table.flat().reduce((s, v) => s + v, 0);
  const sumRows = ct.rowTot.reduce((s, v) => s + v, 0),
    sumCols = ct.colTot.reduce((s, v) => s + v, 0);
  const ok = sumCells === state.data.xs.length && sumRows === sumCells && sumCols === sumCells;
  $("ctCheck").innerHTML =
    `Check: Σ<sub>ij</sub> n<sub>ij</sub> = ${sumCells}, Σ<sub>i</sub> n<sub>i·</sub> = ${sumRows}, Σ<sub>j</sub> n<sub>·j</sub> = ${sumCols}, number of records = ${state.data.xs.length} ` +
    (ok ? `<span class="text-emerald-600 font-semibold">✓ all equal</span>` : `<span class="text-rose-600 font-semibold">✗ mismatch</span>`);
}

/* ---------- 3. marginal and conditional frequencies ---------- */

function showFrequencies() {
  const ct = state.ct;
  const f = relFreq(ct),
    rp = rowProfiles(ct),
    cp = colProfiles(ct);
  const fr = ct.rowTot.map((v) => v / ct.n),
    fc = ct.colTot.map((v) => v / ct.n);

  $("relTable").innerHTML = marginTable(
    ct,
    (i, j) => fix(f[i][j]),
    (i) => fix(fr[i]),
    (j) => fix(fc[j]),
    "1.000",
    "marginal"
  );

  // row profiles, with the marginal f_·j as the last row
  let html = head([`<span class="font-sans">f(${state.ds.fName} | ${state.ds.xName})</span>`, ...ct.cols, "<b>sum</b>"]);
  ct.rows.forEach((r, i) => (html += row([`<b class="font-sans">${r}</b>`, ...rp[i].map((v) => fix(v)), "1.000"])));
  html += row([`<b class="font-sans text-indigo-700">marginal f<sub>·j</sub></b>`, ...fc.map((v) => `<b class="text-indigo-700">${fix(v)}</b>`), "1.000"]);
  $("rowProfTable").innerHTML = html;

  // column profiles, with the marginal f_i· as the last column
  html = head([`<span class="font-sans">f(${state.ds.xName} | ${state.ds.fName})</span>`, ...ct.cols, `<b class="text-indigo-700">marginal f<sub>i·</sub></b>`]);
  ct.rows.forEach((r, i) => (html += row([`<b class="font-sans">${r}</b>`, ...cp[i].map((v) => fix(v)), `<b class="text-indigo-700">${fix(fr[i])}</b>`])));
  html += row([`<b class="font-sans">sum</b>`, ...ct.cols.map(() => "1.000"), "1.000"]);
  $("colProfTable").innerHTML = html;

  // the identity f_ij = f(b_j | a_i)·f_i· checked on the first cell
  $("freqCheck").innerHTML =
    `Check on the cell (${ct.rows[0]}, ${ct.cols[0]}): f<sub>11</sub> = ${fix(f[0][0], 4)}, ` +
    `f(${ct.cols[0]} | ${ct.rows[0]})·f<sub>1·</sub> = ${fix(rp[0][0], 4)} × ${fix(fr[0], 4)} = ${fix(rp[0][0] * fr[0], 4)}, ` +
    `f(${ct.rows[0]} | ${ct.cols[0]})·f<sub>·1</sub> = ${fix(cp[0][0], 4)} × ${fix(fc[0], 4)} = ${fix(cp[0][0] * fc[0], 4)}.`;

  drawProfiles(ct, rp, fc);
}

// 100% stacked horizontal bars: one per row profile, plus the marginal of F.
function drawProfiles(ct, rp, fc) {
  const colors = colColors(ct.cols);
  const bars = [...ct.rows.map((r, i) => ({ label: r, p: rp[i], n: ct.rowTot[i] })), { label: "all (marginal)", p: fc, n: ct.n, marginal: true }];
  const top = 40,
    bh = 30,
    gap = 12,
    x0 = 130,
    W = 470;
  const H = top + bars.length * (bh + gap) + 30;
  const svg = $("profChart");
  svg.setAttribute("viewBox", `0 0 640 ${H}`);
  let s = "";
  // legend
  let lx = x0;
  ct.cols.forEach((c, j) => {
    s += `<rect x="${lx}" y="12" width="12" height="12" rx="2" fill="${colors[j]}"/><text x="${lx + 17}" y="22" font-size="12" fill="#475569">${c}</text>`;
    lx += 26 + c.length * 7.5;
  });
  bars.forEach((b, k) => {
    const y = top + k * (bh + gap) + (b.marginal ? 8 : 0);
    s += `<text x="${x0 - 8}" y="${y + bh / 2 + 4}" font-size="12" text-anchor="end" fill="${b.marginal ? "#4338ca" : "#334155"}" font-weight="${b.marginal ? 600 : 400}">${b.label}</text>`;
    let x = x0;
    b.p.forEach((v, j) => {
      const w = v * W;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${bh}" fill="${colors[j]}" opacity="${b.marginal ? 1 : 0.85}"><title>${b.label}: ${ct.cols[j]} ${pct(v)}</title></rect>`;
      if (w > 34) s += `<text x="${x + w / 2}" y="${y + bh / 2 + 4}" font-size="11" text-anchor="middle" fill="white">${pct(v, 0)}</text>`;
      x += w;
    });
    s += `<text x="${x0 + W + 6}" y="${y + bh / 2 + 4}" font-size="10" fill="#94a3b8">n=${b.n}</text>`;
  });
  // dashed lines at the cumulative marginal: under independence every bar should break here
  let cum = 0;
  fc.slice(0, -1).forEach((v) => {
    cum += v;
    s += `<line x1="${x0 + cum * W}" x2="${x0 + cum * W}" y1="${top - 4}" y2="${H - 26}" stroke="#0f172a" stroke-dasharray="4 3" stroke-width="1"/>`;
  });
  s += `<text x="${x0}" y="${H - 8}" font-size="10" fill="#64748b">dashed lines = where each bar would break if every row profile were equal to the marginal (independence)</text>`;
  svg.innerHTML = s;
}

/* ---------- 4. expected frequencies ---------- */

function showExpected() {
  const ct = state.ct,
    E = state.chi.E;
  const eRow = E.map((line) => line.reduce((s, v) => s + v, 0)),
    eCol = ct.cols.map((_, j) => E.reduce((s, line) => s + line[j], 0));
  $("expTable").innerHTML = marginTable(
    ct,
    (i, j) => `${fix(E[i][j], 2)}<br><span class="text-xs text-slate-400">O = ${ct.table[i][j]}</span>`,
    (i) => fix(eRow[i], 2),
    (j) => fix(eCol[j], 2),
    fix(eRow.reduce((s, v) => s + v, 0), 2)
  );
  const i0 = 0,
    j0 = 0;
  $("expWorked").innerHTML =
    `Worked example, cell (${ct.rows[i0]}, ${ct.cols[j0]}): E = n<sub>1·</sub> · n<sub>·1</sub> / n = ${ct.rowTot[i0]} × ${ct.colTot[j0]} / ${ct.n} = <b>${fix(E[i0][j0], 3)}</b>, ` +
    `observed O = ${ct.table[i0][j0]}.`;
  const sameMargins =
    eRow.every((v, i) => Math.abs(v - ct.rowTot[i]) < 1e-9) && eCol.every((v, j) => Math.abs(v - ct.colTot[j]) < 1e-9);
  const co = cochran(E);
  $("expCheck").innerHTML =
    `Margins of E equal to the margins of O: ${sameMargins ? `<span class="text-emerald-600 font-semibold">✓</span>` : `<span class="text-rose-600">✗</span>`}. ` +
    `Cochran's rule: smallest E<sub>ij</sub> = ${fix(co.min, 2)} (must be ≥ 1), cells with E<sub>ij</sub> &lt; 5: ${pct(co.below5, 0)} (must be ≤ 20%) → ` +
    (co.ok
      ? `<span class="text-emerald-600 font-semibold">✓ the χ² approximation of the p-value is reliable</span>`
      : `<span class="text-rose-600 font-semibold">✗ the χ² approximation is doubtful: trust the permutation p-value of §6 more</span>`) +
    ".";
}

/* ---------- 5. chi-square ---------- */

function showChiSquare() {
  const ct = state.ct,
    { chi2, chi2Alt, df, E, contrib, resid } = state.chi;
  const r = ct.rows.length,
    c = ct.cols.length;
  let html = head(["cell (x, f)", "O<sub>ij</sub>", "E<sub>ij</sub>", "O − E", "(O − E)² / E", "residual r<sub>ij</sub> = (O − E)/√E"]);
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++) {
      const res = resid[i][j];
      const cls = Math.abs(res) > 2 ? (res > 0 ? "text-rose-600 font-semibold" : "text-sky-700 font-semibold") : "";
      html += row([
        `<span class="font-sans">${ct.rows[i]}, ${ct.cols[j]}</span>`,
        ct.table[i][j],
        fix(E[i][j], 2),
        fix(ct.table[i][j] - E[i][j], 2),
        fix(contrib[i][j], 3),
        `<span class="${cls}">${fix(res, 2)}</span>`,
      ]);
    }
  html += row(["<b class='font-sans'>sum</b>", ct.n, fix(ct.n, 2), "0.00", `<b>${fix(chi2, 3)}</b> = χ²`, `Σ r² = ${fix(resid.flat().reduce((s, v) => s + v * v, 0), 3)}`]);
  $("chiTable").innerHTML = html;

  const V = cramersV(chi2, ct.n, r, c);
  const crit = chi2Critical(df, ALPHA);
  $("chiTiles").innerHTML = [
    ["χ²", fix(chi2, 3), `second formula n(Σ n²<sub>ij</sub>/(n<sub>i·</sub>n<sub>·j</sub>) − 1) = ${fix(chi2Alt, 3)}`],
    ["df = (r − 1)(c − 1)", `${df}`, `(${r} − 1)(${c} − 1)`],
    ["critical value (α = 0.05)", fix(crit, 3), chi2 > crit ? `χ² &gt; critical → reject H<sub>0</sub>` : `χ² ≤ critical → do not reject H<sub>0</sub>`],
    ["Cramér's V", fix(V, 3), `${strength(V, r, c)} (Cohen's guide for this table size)`],
  ]
    .map(
      ([t, v, sub]) =>
        `<div class="tile"><p class="text-xs text-slate-500">${t}</p><p class="text-2xl font-semibold text-slate-900 mono mt-1">${v}</p><p class="text-xs text-slate-500 mt-1">${sub}</p></div>`
    )
    .join("");
  drawResiduals(ct, resid, E);
}

// Heatmap of the standardized residuals: red = more than expected, blue = fewer.
function drawResiduals(ct, resid, E) {
  const r = ct.rows.length,
    c = ct.cols.length;
  const x0 = 110,
    y0 = 40,
    cw = Math.min(150, 480 / c),
    ch = Math.min(60, 220 / r);
  const H = y0 + r * ch + 50;
  const svg = $("residChart");
  svg.setAttribute("viewBox", `0 0 640 ${H}`);
  let s = "";
  ct.cols.forEach((cn, j) => (s += `<text x="${x0 + j * cw + cw / 2}" y="${y0 - 10}" font-size="12" text-anchor="middle" fill="#334155">${cn}</text>`));
  for (let i = 0; i < r; i++) {
    s += `<text x="${x0 - 10}" y="${y0 + i * ch + ch / 2 + 4}" font-size="12" text-anchor="end" fill="#334155">${ct.rows[i]}</text>`;
    for (let j = 0; j < c; j++) {
      const v = resid[i][j];
      const a = Math.min(1, Math.abs(v) / 4);
      const fill = v >= 0 ? `rgba(225,29,72,${0.08 + 0.85 * a})` : `rgba(2,132,199,${0.08 + 0.85 * a})`;
      const txt = a > 0.55 ? "white" : "#0f172a";
      s += `<rect x="${x0 + j * cw}" y="${y0 + i * ch}" width="${cw - 3}" height="${ch - 3}" rx="4" fill="${fill}"/>`;
      s += `<text x="${x0 + j * cw + cw / 2}" y="${y0 + i * ch + ch / 2}" font-size="13" font-weight="600" text-anchor="middle" fill="${txt}">${v >= 0 ? "+" : ""}${v.toFixed(2)}</text>`;
      s += `<text x="${x0 + j * cw + cw / 2}" y="${y0 + i * ch + ch / 2 + 14}" font-size="9.5" text-anchor="middle" fill="${txt}">O ${ct.table[i][j]} · E ${E[i][j].toFixed(1)}</text>`;
    }
  }
  s += `<text x="${x0}" y="${H - 24}" font-size="10" fill="#64748b">red = more units than expected under independence, blue = fewer; |r| &gt; 2 is notable.</text>`;
  s += `<text x="${x0}" y="${H - 10}" font-size="10" fill="#64748b">χ² = the sum of the squares of these numbers.</text>`;
  svg.innerHTML = s;
}

/* ---------- 6. p-value ---------- */

async function showPValue() {
  const ct = state.ct,
    { chi2, df } = state.chi;
  const pGamma = chi2Sf(chi2, df);
  const special = df === 1 ? ["closed form 2·Φ(−√χ²) (df = 1, HW6's Φ)", chi2SfDf1(chi2)] : df % 2 === 0 ? [`closed form e<sup>−x/2</sup>Σ(x/2)<sup>k</sup>/k! (df = ${df} even)`, chi2SfEven(chi2, df)] : null;
  let html = head(["method", "p-value", "note"]);
  html += row([
    "<span class='font-sans'>incomplete gamma Q(df/2, χ²/2)</span>",
    `<b>${sci(pGamma, 4)}</b>`,
    `<a class="lnk font-sans" target="_blank" href="${wolfram(chi2, df)}">check on Wolfram Alpha ↗</a>`,
  ]);
  if (special)
    html += row([`<span class='font-sans'>${special[0]}</span>`, sci(special[1], 4), `<span class="font-sans">relative difference ${sci(Math.abs(special[1] - pGamma) / Math.max(pGamma, 1e-300), 1)}</span>`]);
  html += row(["<span class='font-sans'>permutation test</span>", `<span id="permP">running…</span>`, `<span class="font-sans" id="permNote"></span>`]);
  $("pTable").innerHTML = html;
  $("pVerdict").innerHTML =
    pGamma < ALPHA
      ? `p = ${sci(pGamma, 3)} &lt; α = 0.05 → <b>reject H<sub>0</sub></b>: if X and F were independent, a table this far from E would almost never happen.`
      : `p = ${sci(pGamma, 3)} ≥ α = 0.05 → <b>do not reject H<sub>0</sub></b>: a deviation like this one is quite common when X and F are independent.`;

  await repaint();
  const B = Math.max(100, Math.min(20000, Math.round(Number($("permB").value) || 2000)));
  $("permB").value = B;
  const t0 = performance.now();
  const res = permutationTest(state.data.xs, state.data.fs, ct.rows, ct.cols, B, mulberry32(state.seed + 1));
  const ms = performance.now() - t0;
  const exceed = Math.round(res.p * (B + 1)) - 1;
  $("permP").innerHTML = `<b>${sci(res.p, 3)}</b>`;
  $("permNote").innerHTML =
    `${exceed} of ${B} shuffled tables had χ² ≥ ${fix(chi2, 2)}; p = (${exceed} + 1)/(${B} + 1)` +
    (exceed === 0 ? `. This is the smallest p that ${B} shuffles can show: the true p is smaller.` : "") +
    ` (${ms.toFixed(0)} ms)`;
  drawPermutation(res, df);
}

// Histogram of the χ² values of the shuffled tables, with the χ²_df density on top.
function drawPermutation(res, df) {
  const sims = res.sims,
    B = sims.length;
  const sorted = Float64Array.from(sims).sort();
  const xMax = Math.max(sorted[Math.floor(0.999 * (B - 1))], chi2Critical(df, 0.001)) * 1.05;
  const bins = 40,
    bw = xMax / bins;
  const counts = new Array(bins).fill(0);
  for (const v of sims) if (v < xMax) counts[Math.floor(v / bw)]++;
  const yMax = Math.max(...counts, B * bw * chi2Pdf(Math.max(df - 2, 0.3), df)) * 1.1;
  const L = 50,
    R = 620,
    T = 20,
    Bot = 260;
  const X = (x) => L + ((R - L) * x) / xMax,
    Y = (y) => Bot - ((Bot - T) * y) / yMax;
  let s = `<line x1="${L}" x2="${R}" y1="${Bot}" y2="${Bot}" stroke="#cbd5e1"/><line x1="${L}" x2="${L}" y1="${T}" y2="${Bot}" stroke="#cbd5e1"/>`;
  counts.forEach((cnt, k) => {
    s += `<rect x="${X(k * bw) + 0.5}" y="${Y(cnt)}" width="${X(bw) - L - 1}" height="${Bot - Y(cnt)}" fill="#c7d2fe"/>`;
  });
  // density, scaled to counts: expected count in a bin ≈ B · bw · pdf
  let d = "";
  for (let k = 0; k <= 200; k++) {
    const x = Math.max(1e-3, (xMax * k) / 200);
    const y = Math.min(yMax, B * bw * chi2Pdf(x, df));
    d += `${k ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
  }
  s += `<path d="${d}" fill="none" stroke="#4f46e5" stroke-width="2"/>`;
  // ticks
  for (let k = 0; k <= 5; k++) {
    const x = (xMax * k) / 5;
    s += `<text x="${X(x)}" y="${Bot + 14}" font-size="10" text-anchor="middle" fill="#94a3b8">${fmt(x, 3)}</text>`;
  }
  const crit = chi2Critical(df, ALPHA);
  s += `<line x1="${X(crit)}" x2="${X(crit)}" y1="${T}" y2="${Bot}" stroke="#94a3b8" stroke-dasharray="3 3"/><text x="${X(crit) + 4}" y="${T + 10}" font-size="10" fill="#64748b">critical ${fmt(crit, 4)}</text>`;
  const obs = res.obs;
  if (obs <= xMax)
    s += `<line x1="${X(obs)}" x2="${X(obs)}" y1="${T}" y2="${Bot}" stroke="#e11d48" stroke-width="2"/><text x="${Math.min(X(obs) + 4, R - 110)}" y="${T + 26}" font-size="11" fill="#e11d48" font-weight="600">observed χ² = ${fmt(obs, 4)}</text>`;
  else
    s += `<text x="${R}" y="${T + 26}" font-size="11" fill="#e11d48" font-weight="600" text-anchor="end">observed χ² = ${fmt(obs, 4)} → far off the right edge</text>`;
  s += `<text x="${R}" y="${T + 42}" font-size="10" fill="#4f46e5" text-anchor="end">curve: χ² density with df = ${df}</text>`;
  s += `<text x="${(L + R) / 2}" y="${Bot + 32}" font-size="11" text-anchor="middle" fill="#64748b">χ² of ${B} tables with F shuffled among the units (H₀ true by construction)</text>`;
  $("permChart").innerHTML = s;
}

// Static tables: our p against the Python references, and the critical values.
function showReferences() {
  let html = head(["χ²", "df", "reference p (Python)", "chi2Sf (this page)", "relative error", ""]);
  for (const [x, df, p] of REF) {
    const mine = chi2Sf(x, df);
    const e = Math.abs(mine - p) / p;
    html += row([
      fmt(x, 8),
      df,
      p.toPrecision(12),
      mine.toPrecision(12),
      `<span class="${e < 1e-12 ? "text-emerald-600" : e < 1e-8 ? "text-amber-600" : "text-rose-600"}">${e === 0 ? "0" : sci(e, 1)}</span>`,
      `<a class="lnk font-sans" target="_blank" href="${wolfram(x, df)}">Wolfram ↗</a>`,
    ]);
  }
  $("refTable").innerHTML = html;

  const known = [3.841, 5.991, 7.815, 9.488, 11.07, 12.592, 14.067, 15.507];
  html = head(["df", ...known.map((_, k) => k + 1)]);
  html += row(["<span class='font-sans'>printed tables</span>", ...known.map((v) => v.toFixed(3))]);
  html += row(["<span class='font-sans'>chi2Critical (this page)</span>", ...known.map((_, k) => `<b>${chi2Critical(k + 1).toFixed(3)}</b>`)]);
  $("critTable").innerHTML = html;
}

/* ---------- 7. theory demos ---------- */

function showTheory() {
  const u = uncorrelatedDemo();
  let html = head(["X ↓ / Y = X² →", "Y = 0", "Y = 1", "total"]);
  u.ct.rows.forEach((x, i) => (html += row([`<b>X = ${x}</b>`, u.ct.table[i][0], u.ct.table[i][1], u.ct.rowTot[i]])));
  html += row(["<b>total</b>", u.ct.colTot[0], u.ct.colTot[1], u.ct.n]);
  $("uncorrTable").innerHTML = html;
  $("uncorrNote").innerHTML =
    `Pearson correlation r = <b>${fix(Math.abs(u.r) < 1e-15 ? 0 : u.r, 3)}</b> (no <i>linear</i> relation), but χ² = <b>${fix(u.chi2, 1)}</b> with df = ${u.df}, p = ${sci(u.p, 2)}, Cramér's V = <b>${fix(u.V, 3)}</b>: ` +
    `Y is a function of X, the strongest possible dependence, yet the correlation is zero. The χ² test looks at the whole table, not only at a straight line, and detects it.`;

  html = head(["quantity", "value", ""]);
  for (const [name, v, note] of coinsDemo())
    html += row([`<span class="font-sans">${name}</span>`, Array.isArray(v) ? `${v[0]} vs ${v[1]}` : v, `<span class="font-sans">${note}</span>`]);
  $("coinsTable").innerHTML = html;
}

/* ---------- 8. interpretation ---------- */

async function showInterpretation() {
  // the verdict on every dataset, at n = 500 for the synthetic ones, fixed seed
  let html = head(["dataset", "truth", "n", "χ²", "df", "p", "V", "verdict at α = 0.05", "correct?"]);
  for (const ds of DATASETS) {
    const n = ds.fixedN || 500;
    const d = ds.make(n, mulberry32(11));
    const ct = crossTab(d.xs, d.fs, ds.rows, ds.cols);
    const { chi2, df } = chiSquare(ct);
    const p = chi2Sf(chi2, df),
      V = cramersV(chi2, n, ds.rows.length, ds.cols.length);
    const reject = p < ALPHA;
    const correct = ds.truth.startsWith("unknown") ? "?" : (ds.truth === "independent") === !reject ? "✓" : "✗ (type II error: missed)";
    html += row([
      `<span class="font-sans">${ds.label}</span>`,
      `<span class="font-sans">${ds.truth}</span>`,
      n,
      fix(chi2, 2),
      df,
      sci(p, 2),
      fix(V, 3),
      `<span class="font-sans ${reject ? "text-rose-600 font-semibold" : "text-emerald-700"}">${reject ? "reject H₀: associated" : "do not reject H₀"}</span>`,
      `<span class="font-sans">${correct}</span>`,
    ]);
  }
  $("interpTable").innerHTML = html;
  await repaint();
  runRejection();
}

async function runRejection() {
  const btn = $("rejRun");
  btn.disabled = true;
  btn.textContent = "Running…";
  await repaint();
  const reps = 5000,
    n = 300;
  const rng = mulberry32(1);
  const indep = DATASETS.find((d) => d.id === "indep");
  const { pvals } = repeatTest(indep, n, reps, rng);
  const rate = pvals.filter((p) => p < ALPHA).length / reps;
  const se = Math.sqrt((ALPHA * (1 - ALPHA)) / reps);
  $("rejNote").innerHTML =
    `${reps} independent datasets of n = ${n}: H<sub>0</sub> was (wrongly) rejected <b>${pvals.filter((p) => p < ALPHA).length}</b> times, a rate of <b>${pct(rate, 2)}</b>. ` +
    `Theory: α = 5%, with a Monte Carlo standard error of ±${pct(se, 2)} for ${reps} repetitions. ` +
    `These are the type I errors (false alarms) that α = 0.05 accepts by definition. The histogram is flat: under H<sub>0</sub> the p-value is uniform on [0, 1].`;
  drawPHist(pvals);

  // dependent and weakly dependent data, n growing
  const NS = [30, 100, 300, 1000, 3000, 10000, 30000];
  const repsN = 200;
  let html = head(["n", "dependent: median p", "rejections", "median V", "weak: median p", "rejections", "median V"]);
  const dep = DATASETS.find((d) => d.id === "dep"),
    weak = DATASETS.find((d) => d.id === "weak");
  const series = { dep: [], weak: [] };
  for (const nn of NS) {
    const a = repeatTest(dep, nn, repsN, rng),
      b = repeatTest(weak, nn, repsN, rng);
    const powA = a.pvals.filter((p) => p < ALPHA).length / repsN,
      powB = b.pvals.filter((p) => p < ALPHA).length / repsN;
    series.dep.push(median(a.pvals));
    series.weak.push(median(b.pvals));
    html += row([nn, sci(median(a.pvals), 2), pct(powA, 0), fix(median(a.vs), 3), sci(median(b.pvals), 2), pct(powB, 0), fix(median(b.vs), 3)]);
    $("pnTable").innerHTML = html;
    await repaint();
  }
  html += row([
    "<span class='font-sans'>model (n = ∞)</span>",
    "0",
    "100%",
    `<b>${fix(populationV(P_OUT_DEP), 3)}</b>`,
    "0",
    "100%",
    `<b>${fix(populationV(P_OUT_WEAK), 3)}</b>`,
  ]);
  $("pnTable").innerHTML = html;
  drawPvsN(NS, series);
  btn.disabled = false;
  btn.textContent = "Run again";
}

function drawPHist(pvals) {
  const bins = 20,
    counts = new Array(bins).fill(0);
  for (const p of pvals) counts[Math.min(bins - 1, Math.floor(p * bins))]++;
  const exp = pvals.length / bins,
    yMax = Math.max(...counts, exp) * 1.25;
  const L = 50,
    R = 620,
    T = 20,
    Bot = 250;
  const X = (x) => L + (R - L) * x,
    Y = (y) => Bot - ((Bot - T) * y) / yMax;
  let s = `<line x1="${L}" x2="${R}" y1="${Bot}" y2="${Bot}" stroke="#cbd5e1"/><line x1="${L}" x2="${L}" y1="${T}" y2="${Bot}" stroke="#cbd5e1"/>`;
  counts.forEach((c, k) => {
    s += `<rect x="${X(k / bins) + 1}" y="${Y(c)}" width="${(R - L) / bins - 2}" height="${Bot - Y(c)}" fill="${k === 0 ? "#f43f5e" : "#a5b4fc"}"><title>${(k / bins).toFixed(2)}–${((k + 1) / bins).toFixed(2)}: ${c}</title></rect>`;
  });
  s += `<line x1="${L}" x2="${R}" y1="${Y(exp)}" y2="${Y(exp)}" stroke="#0f172a" stroke-dasharray="4 3"/><text x="${R}" y="${Y(exp) - 5}" font-size="10" text-anchor="end" fill="#334155">uniform: ${exp} per bin</text>`;
  for (let k = 0; k <= 10; k += 2) s += `<text x="${X(k / 10)}" y="${Bot + 14}" font-size="10" text-anchor="middle" fill="#94a3b8">${(k / 10).toFixed(1)}</text>`;
  s += `<text x="${L + 6}" y="${T + 10}" font-size="10" fill="#e11d48">red bar: p &lt; 0.05, H₀ rejected (wrongly)</text>`;
  s += `<text x="${(L + R) / 2}" y="${Bot + 32}" font-size="11" text-anchor="middle" fill="#64748b">p-values of ${pvals.length} tests on independent data</text>`;
  $("rejChart").innerHTML = s;
}

function drawPvsN(NS, series) {
  const L = 60,
    R = 610,
    T = 20,
    Bot = 250;
  const lx = (n) => Math.log10(n),
    xmin = lx(NS[0]),
    xmax = lx(NS[NS.length - 1]);
  const ymin = -20; // log10 p, clipped
  const X = (n) => L + ((R - L) * (lx(n) - xmin)) / (xmax - xmin),
    Y = (p) => T + ((Bot - T) * -Math.max(ymin, Math.log10(Math.max(p, 1e-300)))) / -ymin;
  let s = `<line x1="${L}" x2="${R}" y1="${Bot}" y2="${Bot}" stroke="#cbd5e1"/><line x1="${L}" x2="${L}" y1="${T}" y2="${Bot}" stroke="#cbd5e1"/>`;
  for (let e = 0; e >= ymin; e -= 5) s += `<text x="${L - 6}" y="${Y(10 ** e) + 3}" font-size="10" text-anchor="end" fill="#94a3b8">10^${e}</text><line x1="${L}" x2="${R}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" stroke="#f1f5f9"/>`;
  s += `<line x1="${L}" x2="${R}" y1="${Y(ALPHA)}" y2="${Y(ALPHA)}" stroke="#e11d48" stroke-dasharray="4 3"/><text x="${R}" y="${Y(ALPHA) - 4}" font-size="10" text-anchor="end" fill="#e11d48">α = 0.05</text>`;
  NS.forEach((n) => (s += `<text x="${X(n)}" y="${Bot + 14}" font-size="10" text-anchor="middle" fill="#94a3b8">${n}</text>`));
  for (const [key, color, label] of [
    ["dep", "#4f46e5", "dependent"],
    ["weak", "#f59e0b", "weakly dependent"],
  ]) {
    const pts = NS.map((n, k) => `${X(n).toFixed(1)},${Y(series[key][k]).toFixed(1)}`);
    s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>`;
    s += NS.map((n, k) => `<circle cx="${X(n)}" cy="${Y(series[key][k])}" r="3" fill="${color}"/>`).join("");
    const lastY = Y(series[key][NS.length - 1]);
    s += `<text x="${R - 4}" y="${Math.min(Bot - 4, lastY + (key === "dep" ? -8 : 14))}" font-size="11" text-anchor="end" fill="${color}" font-weight="600">${label}</text>`;
  }
  s += `<text x="${(L + R) / 2}" y="${Bot + 32}" font-size="11" text-anchor="middle" fill="#64748b">n (log scale) → median p-value (log scale, clipped at 10⁻²⁰)</text>`;
  $("pnChart").innerHTML = s;
}

// The same proportions with every count multiplied by k: χ² scales by k, V does not move.
function showScaling() {
  let html = head(["Titanic table × k", "n", "χ²", "p", "Cramér's V"]);
  for (const k of [0.1, 0.5, 1, 2, 10]) {
    const table = TITANIC.table.map((line) => line.map((v) => v * k));
    const ct = withTotals(TITANIC.rows, TITANIC.cols, table);
    const { chi2, df } = chiSquare(ct);
    html += row([`× ${k}`, fmt(ct.n, 6), fix(chi2, 2), sci(chi2Sf(chi2, df), 2), fix(cramersV(chi2, ct.n, 4, 2), 4)]);
  }
  $("scaleTable").innerHTML = html;
}

/* ---------- 9. causality ---------- */

function showCausality() {
  const rows = ["IDS", "no IDS"],
    cols = ["incident", "no incident"];
  const strata = [
    ["small companies", SIMPSON.small],
    ["large companies", SIMPSON.large],
    ["<b>all companies (aggregated)</b>", addTables([SIMPSON.small, SIMPSON.large])],
  ];
  let html = head(["stratum Z", "IDS: incidents", "no IDS: incidents", "χ²", "p", "V"]);
  for (const [name, q] of strata) {
    const ct = twoByTwo(q, rows, cols);
    const { chi2, df } = chiSquare(ct);
    html += row([
      `<span class="font-sans">${name}</span>`,
      `${q[0]} / ${q[0] + q[1]} = <b>${pct(q[0] / (q[0] + q[1]))}</b>`,
      `${q[2]} / ${q[2] + q[3]} = <b>${pct(q[2] / (q[2] + q[3]))}</b>`,
      fix(chi2, 2),
      sci(chi2Sf(chi2, df), 2),
      fix(cramersV(chi2, ct.n, 2, 2), 3),
    ]);
  }
  $("simpsonTable").innerHTML = html;

  // Berkeley 1973
  html = head(["department", "men: admitted", "women: admitted", "χ²", "p", "who is favoured"]);
  const all = addTables(Object.values(BERKELEY));
  const line = (name, q) => {
    const ct = twoByTwo(q, ["men", "women"], ["admitted", "rejected"]);
    const { chi2, df } = chiSquare(ct);
    const m = q[0] / (q[0] + q[1]),
      w = q[2] / (q[2] + q[3]);
    const p = chi2Sf(chi2, df);
    return row([
      `<span class="font-sans">${name}</span>`,
      `${q[0]} / ${q[0] + q[1]} = <b>${pct(m)}</b>`,
      `${q[2]} / ${q[2] + q[3]} = <b>${pct(w)}</b>`,
      fix(chi2, 2),
      sci(p, 2),
      `<span class="font-sans">${p >= ALPHA ? "no significant difference" : m > w ? "men" : "women"}</span>`,
    ]);
  };
  for (const [d, q] of Object.entries(BERKELEY)) html += line(d, q);
  html += line("<b>all six (aggregated)</b>", all);
  $("berkeleyTable").innerHTML = html;

  // share of applications going to the two easiest departments (A, B)
  const easyM = BERKELEY.A[0] + BERKELEY.A[1] + BERKELEY.B[0] + BERKELEY.B[1],
    easyW = BERKELEY.A[2] + BERKELEY.A[3] + BERKELEY.B[2] + BERKELEY.B[3];
  $("berkeleyNote").innerHTML =
    `Why: ${pct(easyM / (all[0] + all[1]), 0)} of the men applied to departments A and B (admission rates above 60%), against only ${pct(easyW / (all[2] + all[3]), 0)} of the women, ` +
    `who applied mostly to C–F, where almost everybody is rejected. The department is a confounder: it is associated with gender (who applies where) and with admission (how selective it is).`;
}

/* ---------- start ---------- */

function initPage() {
  fillDatasets();
  $("dsPick").value = "dep";
  $("dsRun").onclick = runAll;
  $("permRun").onclick = showPValue;
  $("rejRun").onclick = runRejection;
  runAll();
  showReferences();
  showTheory();
  showScaling();
  showCausality();
  showInterpretation();
}

if (typeof document !== "undefined") initPage();
else
  module.exports = {
    mulberry32,
    DATASETS,
    TITANIC,
    BERKELEY,
    SIMPSON,
    crossTab,
    withTotals,
    relFreq,
    rowProfiles,
    colProfiles,
    expected,
    chiSquare,
    cramersV,
    strength,
    cochran,
    chi2Sf,
    chi2SfDf1,
    chi2SfEven,
    chi2Critical,
    lnGamma,
    REF,
    permutationTest,
    repeatTest,
    populationV,
    uncorrelatedDemo,
    coinsDemo,
    addTables,
    twoByTwo,
  };
