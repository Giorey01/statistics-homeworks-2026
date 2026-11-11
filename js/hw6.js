// Homework 6 — Riemann vs Lebesgue integration, and the normal CDF.
// The numerical core comes first (pure functions, testable with Node);
// the page code is in initPage() at the bottom.

/* ===================================================================
   Part 1 — the functions to integrate
   =================================================================== */

// Each entry: the function, its domain [a, b], the exact integral, and
// `breaks`: points that split [a, b] into pieces where f is monotone.
// The Lebesgue method needs the breaks to measure {x : f(x) > t} exactly.
const FUNCS = [
  {
    id: "sin",
    label: "sin x on [0, π]",
    f: (x) => Math.sin(x),
    a: 0,
    b: Math.PI,
    exact: 2,
    exactLabel: "2",
    breaks: [0, Math.PI / 2, Math.PI],
  },
  {
    id: "sq",
    label: "x² on [0, 1]",
    f: (x) => x * x,
    a: 0,
    b: 1,
    exact: 1 / 3,
    exactLabel: "1/3",
    breaks: [0, 1],
  },
  {
    id: "step13",
    label: "1 if x < ½, 3 if x ≥ ½ on [0, 1]",
    f: (x) => (x < 0.5 ? 1 : 3),
    a: 0,
    b: 1,
    exact: 2,
    exactLabel: "2",
    breaks: [0, 1],
  },
  {
    id: "abs",
    label: "|x − ½| on [0, 1]",
    f: (x) => Math.abs(x - 0.5),
    a: 0,
    b: 1,
    exact: 0.25,
    exactLabel: "1/4",
    breaks: [0, 0.5, 1],
  },
  {
    id: "invsqrt",
    label: "1/√x on (0, 1]",
    f: (x) => 1 / Math.sqrt(x),
    a: 0,
    b: 1,
    exact: 2,
    exactLabel: "2 (improper)",
    breaks: [0, 1],
    unbounded: true,
  },
  {
    id: "ind",
    label: "1 if x < ½, 0 if x ≥ ½ on [0, 1]",
    f: (x) => (x < 0.5 ? 1 : 0),
    a: 0,
    b: 1,
    exact: 0.5,
    exactLabel: "1/2",
    breaks: [0, 1],
  },
  {
    id: "sinc",
    label: "sin x / x on [0, π]",
    f: (x) => (x === 0 ? 1 : Math.sin(x) / x),
    a: 0,
    b: Math.PI,
    exact: 1.851937051982466,
    exactLabel: "Si(π) ≈ 1.8519370520",
    breaks: [0, Math.PI],
  },
  {
    id: "sqrt",
    label: "√x on [0, 1]",
    f: (x) => Math.sqrt(x),
    a: 0,
    b: 1,
    exact: 2 / 3,
    exactLabel: "2/3",
    breaks: [0, 1],
  },
];

// A wrapper that counts how many times f is evaluated: the fair measure of cost.
function counted(f) {
  const g = (x) => {
    g.calls++;
    return f(x);
  };
  g.calls = 0;
  return g;
}

/* ===================================================================
   Part 1 — Riemann: partition the domain
   =================================================================== */

function riemannLeft(f, a, b, n) {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += f(a + i * h);
  return s * h;
}

function riemannRight(f, a, b, n) {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 1; i <= n; i++) s += f(a + i * h);
  return s * h;
}

function riemannMid(f, a, b, n) {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += f(a + (i + 0.5) * h);
  return s * h;
}

function trapezoid(f, a, b, n) {
  const h = (b - a) / n;
  let s = (f(a) + f(b)) / 2;
  for (let i = 1; i < n; i++) s += f(a + i * h);
  return s * h;
}

function simpson(f, a, b, n) {
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/* ===================================================================
   Part 1 — Lebesgue: partition the range
   =================================================================== */

// Value of f at a piece endpoint, approached from inside the piece
// (so a jump exactly at the endpoint does not fool the monotonicity test).
const inside = (F, x, toward) => F(x + (toward - x) * 1e-12);

// On a monotone piece [p, q], the set {x : f(x) > t} is a single interval.
// Return it as [lo, hi] (or null), finding the crossing point by bisection.
function superLevelOnPiece(F, p, q, t) {
  const fp = inside(F, p, q),
    fq = inside(F, q, p);
  if (fp > t && fq > t) return [p, q];
  if (!(fp > t) && !(fq > t)) return null;
  const increasing = fq > fp;
  let lo = p,
    hi = q; // invariant: the crossing lies in [lo, hi]
  for (let k = 0; k < 60 && hi - lo > 1e-15 * (q - p); k++) {
    const m = (lo + hi) / 2;
    if (F(m) > t === increasing) hi = m;
    else lo = m;
  }
  const c = (lo + hi) / 2;
  return increasing ? [c, q] : [p, c];
}

// The pre-image {x : f(x) > t} as a list of intervals.
function superLevelSet(F, breaks, t) {
  const out = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const I = superLevelOnPiece(F, breaks[i], breaks[i + 1], t);
    if (I) out.push(I);
  }
  return out;
}

const measure = (intervals) => intervals.reduce((s, [lo, hi]) => s + (hi - lo), 0);

// Range of f: on monotone pieces the extremes sit at the breaks.
function range(F, breaks) {
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i + 1 < breaks.length; i++) {
    for (const v of [inside(F, breaks[i], breaks[i + 1]), inside(F, breaks[i + 1], breaks[i])]) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return { lo, hi };
}

// Lebesgue integral with M levels, through the layer-cake formula
//   ∫ f = y0·(b − a) + ∫_{y0}^{y1} μ({f > t}) dt,
// where the integral in t uses the midpoint of each band [t_{k−1}, t_k].
// Also returns the lower and upper Lebesgue sums, which bracket the truth.
// If f is unbounded (1/√x), it is truncated at T = M^(2/3): ∫ min(f, T) → ∫ f.
function lebesgue(fn, M) {
  const F = counted(fn.f);
  const r = range(F, fn.breaks);
  const y0 = r.lo,
    y1 = fn.unbounded ? Math.max(2 * y0, M ** (2 / 3)) : r.hi;
  const len = fn.b - fn.a,
    dt = (y1 - y0) / M;
  let mid = 0,
    lower = 0,
    upper = 0,
    prev = len; // μ({f > y0}) is the whole domain (up to a null set)
  for (let k = 1; k <= M; k++) {
    mid += measure(superLevelSet(F, fn.breaks, y0 + (k - 0.5) * dt));
    const here = measure(superLevelSet(F, fn.breaks, y0 + k * dt));
    lower += here;
    upper += prev;
    prev = here;
  }
  return {
    value: y0 * len + dt * mid,
    lower: y0 * len + dt * lower,
    upper: y0 * len + dt * upper,
    calls: F.calls,
    truncated: fn.unbounded ? y1 : null,
  };
}

// The "histogram" version: sample f on N points, sort the values into M bands
// and multiply each band level by the measure of its pre-image, estimated as
// (number of samples in the band) · (b − a)/N. Easy and general — but the
// pre-image is measured on a grid in x, so it is a Riemann sum in disguise.
function lebesgueSampled(fn, N, M) {
  const F = counted(fn.f);
  const h = (fn.b - fn.a) / N;
  const vals = new Float64Array(N);
  for (let i = 0; i < N; i++) vals[i] = F(fn.a + (i + 0.5) * h);
  let lo = Infinity,
    hi = -Infinity;
  for (const v of vals) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const dt = (hi - lo) / M || 1;
  const count = new Float64Array(M);
  for (const v of vals) count[Math.min(M - 1, Math.floor((v - lo) / dt))]++;
  let s = 0;
  for (let k = 0; k < M; k++) s += (lo + (k + 0.5) * dt) * count[k] * h;
  return { value: s, calls: F.calls };
}

// Least-squares slope of log(err) against log(x): the observed order.
function logSlope(xs, ys) {
  const pts = xs.map((x, i) => [Math.log10(x), Math.log10(ys[i])]).filter(([, y]) => Number.isFinite(y));
  if (pts.length < 2) return NaN;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length,
    my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let num = 0,
    den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return num / den;
}

/* ===================================================================
   Part 1 — pathological functions
   =================================================================== */

const gcd = (a, b) => {
  while (b) [a, b] = [b, a % b];
  return a;
};

// Every double is a fraction m / 2^k: return that fraction exactly (BigInt).
function doubleAsFraction(x) {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const bits = buf.getBigUint64(0);
  const exp = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & ((1n << 52n) - 1n);
  if (exp !== 0) mant |= 1n << 52n;
  let e = (exp === 0 ? 1 : exp) - 1075; // x = mant · 2^e
  while (mant > 0n && mant % 2n === 0n && e < 0) {
    mant /= 2n;
    e++;
  }
  return e >= 0 ? { num: mant << BigInt(e), den: 1n } : { num: mant, den: 1n << BigInt(-e) };
}

// Cover the rationals p/q in [0, 1] with q ≤ Q by intervals of length ε/2^k
// (the k-th rational gets the k-th interval): total length < ε.
function coverRationals(Q, eps) {
  const pts = [];
  for (let q = 1; q <= Q; q++) for (let p = 0; p <= q; p++) if (gcd(p, q) === 1) pts.push(p / q);
  const ivs = pts.map((x, k) => [x - eps / 2 ** (k + 2), x + eps / 2 ** (k + 2)]);
  ivs.sort((u, v) => u[0] - v[0]);
  let union = 0,
    total = 0,
    [curLo, curHi] = ivs[0];
  for (const [lo, hi] of ivs) {
    total += hi - lo;
    if (lo > curHi) {
      union += curHi - curLo; // close the previous block of overlapping intervals
      [curLo, curHi] = [lo, hi];
    } else curHi = Math.max(curHi, hi);
  }
  union += curHi - curLo;
  return { count: pts.length, total, union };
}

// Thomae on the uniform partition of [0, 1] into N cells.
//  - grid tags i/N: f(i/N) = gcd(i, N)/N exactly (integers, no floats);
//  - upper Darboux sum: the sup on [i/N, (i+1)/N] is 1/q for the smallest q
//    with a fraction p/q in the cell (exists p: iq ≤ pN ≤ (i+1)q);
//  - lower Darboux sum: 0 (every cell contains irrationals).
function thomaeGridSum(N) {
  let s = 0;
  for (let i = 0; i < N; i++) s += gcd(i, N) / N;
  return s / N;
}

function thomaeUpper(N) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    let q = 1;
    while (Math.ceil((i * q) / N) > Math.floor(((i + 1) * q) / N)) q++;
    s += 1 / q;
  }
  return s / N;
}

// Count of points where Thomae > t (all p/q with 1/q > t): a finite set.
function thomaeLevelCount(t) {
  let c = 0;
  for (let q = 1; 1 / q > t; q++) for (let p = 0; p <= q; p++) if (gcd(p, q) === 1) c++;
  return c;
}

// Smith–Volterra–Cantor set: from [0, 1], at step k remove from the middle of
// each of the 2^(k−1) remaining intervals an open interval of length 1/4^k.
// Removed in total: Σ 2^(k−1)/4^k = 1/2, so μ(C) = 1/2, yet C has no interior.
const SVC_DEPTH = 48;

// Does [u, v] meet C? Recurse into the two halves left after each removal.
function svcMeets(u, v, a = 0, b = 1, k = 1) {
  if (v < a || u > b) return false;
  if (u <= a || v >= b || k > SVC_DEPTH) return true; // contains an endpoint of a piece (a point of C)
  const m = (a + b) / 2,
    r = 0.5 / 4 ** k;
  return svcMeets(u, v, a, m - r, k + 1) || svcMeets(u, v, m + r, b, k + 1);
}

// A point of [u, v] outside C (inside a removed gap), or null.
function svcGapPoint(u, v, a = 0, b = 1, k = 1) {
  if (v <= a || u >= b || k > SVC_DEPTH) return null;
  const m = (a + b) / 2,
    r = 0.5 / 4 ** k;
  const lo = Math.max(u, m - r),
    hi = Math.min(v, m + r);
  if (lo < hi) return (lo + hi) / 2;
  return svcGapPoint(u, v, a, m - r, k + 1) ?? svcGapPoint(u, v, m + r, b, k + 1);
}

function svcContains(x) {
  let a = 0,
    b = 1;
  for (let k = 1; k <= SVC_DEPTH; k++) {
    const m = (a + b) / 2,
      r = 0.5 / 4 ** k;
    if (x > m - r && x < m + r) return false;
    if (x <= m - r) b = m - r;
    else a = m + r;
  }
  return true;
}

function svcSums(n) {
  let upper = 0,
    gapTags = 0,
    randTags = 0,
    missing = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n,
      v = (i + 1) / n;
    if (svcMeets(u, v)) upper++;
    const g = svcGapPoint(u, v);
    if (g === null) missing++;
    else if (svcContains(g)) gapTags++;
    if (svcContains(u + Math.random() / n)) randTags++;
  }
  return { upper: upper / n, gap: gapTags / n, random: randTags / n, missing };
}

/* ===================================================================
   Part 2 — the standard normal CDF Φ
   =================================================================== */

const SQRT2PI = Math.sqrt(2 * Math.PI);
const phi = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;

// 1. Simpson's rule on Φ(x) = ½ + ∫_0^x φ(t) dt.
const PhiSimpson = (x, n = 64) => 0.5 + simpson(phi, 0, x, n);

// 2. Taylor series of erf (alternating), Φ(x) = ½(1 + erf(x/√2)).
function erfTaylor(z) {
  let term = z,
    sum = z;
  for (let n = 1; n < 400; n++) {
    term *= (-z * z) / n; // (−1)^n z^(2n+1) / n!
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}
const PhiTaylorErf = (x) => 0.5 * (1 + erfTaylor(x / Math.SQRT2));

// 3. Series with positive terms (A&S 7.1.6, Marsaglia 2004):
//    Φ(x) = ½ + φ(x)·(x + x³/3 + x⁵/(3·5) + x⁷/(3·5·7) + …)
function PhiSeries(x) {
  let term = x,
    sum = x;
  for (let k = 3; k < 2000; k += 2) {
    term *= (x * x) / k;
    sum += term;
    if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
  }
  return 0.5 + phi(x) * sum;
}

// 4. Asymptotic expansion of the tail (Mills ratio), for x < 0:
//    Φ(x) = Q(|x|) ≈ φ(a)/a · (1 − 1/a² + 3/a⁴ − 15/a⁶ + …), a = |x|,
//    summed while the terms keep getting smaller (the series diverges).
function tailAsymptotic(a) {
  let term = 1,
    sum = 1;
  for (let k = 1; k < 200; k++) {
    const next = (-term * (2 * k - 1)) / (a * a);
    if (Math.abs(next) >= Math.abs(term)) break;
    term = next;
    sum += term;
  }
  return (phi(a) / a) * sum;
}
const PhiAsymptotic = (x) => (x < 0 ? tailAsymptotic(-x) : 1 - tailAsymptotic(x));

// 5. Laplace's continued fraction for the tail:
//    Q(a) = φ(a) / (a + 1/(a + 2/(a + 3/(a + …)))), evaluated bottom-up.
function tailContinuedFraction(a, terms) {
  let d = a;
  for (let k = terms; k >= 1; k--) d = a + k / d;
  return phi(a) / d;
}

// 6. Abramowitz & Stegun 26.2.17 (Zelen & Severo): |error| < 7.5·10⁻⁸.
function PhiAS26217(x) {
  const a = Math.abs(x),
    t = 1 / (1 + 0.2316419 * a);
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const q = phi(a) * poly;
  return x < 0 ? q : 1 - q;
}

// 7. Abramowitz & Stegun 7.1.26 for erf: |error| < 1.5·10⁻⁷.
function erfAS7126(z) {
  const s = Math.sign(z),
    a = Math.abs(z),
    t = 1 / (1 + 0.3275911 * a);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return s * (1 - poly * Math.exp(-a * a));
}
const PhiAS7126 = (x) => 0.5 * (1 + erfAS7126(x / Math.SQRT2));

// 8. My method. Compute the small tail Q(a) = Φ(−a), a = |x|, directly
//    (never as 1 − something close to 1), then use Φ(x) = 1 − Q for x > 0.
//    - a < 1.4: positive series, no cancellation problem yet;
//    - a ≥ 1.4: continued fraction, with fewer terms the larger a is.
function tailHybrid(a) {
  if (a < 1.4) return 0.5 - phi(a) * seriesSum(a);
  return tailContinuedFraction(a, cfTerms(a));
}
function seriesSum(a) {
  let term = a,
    sum = a;
  for (let k = 3; k < 200; k += 2) {
    term *= (a * a) / k;
    sum += term;
    if (term < 1e-17 * sum) break;
  }
  return sum;
}
const cfTerms = (a) => Math.ceil(15 + 500 / (a * a));
const PhiHybrid = (x) => (x <= 0 ? tailHybrid(-x) : 1 - tailHybrid(x));

/* ===================================================================
   Reference values: Φ(x) computed with 120-digit decimal arithmetic
   (Python `decimal`, positive series above), x = −12, −11.75, …, 8.
   Spot-checked against Wolfram Alpha and against Python's math.erfc.
   =================================================================== */
const REF = [
  [-12.0, "1.77648211207767899770e-33"],
  [-11.75, "3.53094239588599325862e-32"],
  [-11.5, "6.59577144611367507905e-31"],
  [-11.25, "1.15796031856864176537e-29"],
  [-11.0, "1.91065957449867571115e-28"],
  [-10.75, "2.96308087809435858530e-27"],
  [-10.5, "4.31900631780923034655e-26"],
  [-10.25, "5.91717690736561785032e-25"],
  [-10.0, "7.61985302416052606597e-24"],
  [-9.75, "9.22341352493941814852e-23"],
  [-9.5, "1.04945150753626074928e-21"],
  [-9.25, "1.12246335913279826595e-20"],
  [-9.0, "1.12858840595384064774e-19"],
  [-8.75, "1.06676373754748580029e-18"],
  [-8.5, "9.47953482220331835415e-18"],
  [-8.25, "7.91972631464247734096e-17"],
  [-8.0, "6.22096057427178412352e-16"],
  [-7.75, "4.59462743577859546016e-15"],
  [-7.5, "3.19089167291089622777e-14"],
  [-7.25, "2.08385815867206943119e-13"],
  [-7.0, "1.27981254388583500438e-12"],
  [-6.75, "7.39225777801782241952e-12"],
  [-6.5, "4.01600058385911780835e-11"],
  [-6.25, "2.05226342521893888162e-10"],
  [-6.0, "9.86587645037698140701e-10"],
  [-5.75, "4.46217245390161187307e-9"],
  [-5.5, "1.89895624658877193839e-8"],
  [-5.25, "7.60496051648871425115e-8"],
  [-5.0, "2.86651571879193911674e-7"],
  [-4.75, "1.01708324256870317126e-6"],
  [-4.5, "3.39767312473006040169e-6"],
  [-4.25, "1.06885257749344204692e-5"],
  [-4.0, "3.16712418331199212538e-5"],
  [-3.75, "8.84172852008038678178e-5"],
  [-3.5, "2.32629079035525036350e-4"],
  [-3.25, "5.77025042390767042917e-4"],
  [-3.0, "1.34989803163009452665e-3"],
  [-2.75, "2.97976323505455675429e-3"],
  [-2.5, "6.20966532577613516698e-3"],
  [-2.25, "1.22244726550447031526e-2"],
  [-2.0, "2.27501319481792072003e-2"],
  [-1.75, "4.00591568638170904188e-2"],
  [-1.5, "6.68072012688580660045e-2"],
  [-1.25, "1.05649773666855257689e-1"],
  [-1.0, "1.58655253931457051415e-1"],
  [-0.75, "2.26627352376868199327e-1"],
  [-0.5, "3.08537538725986896362e-1"],
  [-0.25, "4.01293674317076275759e-1"],
  [0.0, "5.00000000000000000000e-1"],
  [0.25, "5.98706325682923724241e-1"],
  [0.5, "6.91462461274013103638e-1"],
  [0.75, "7.73372647623131800673e-1"],
  [1.0, "8.41344746068542948585e-1"],
  [1.25, "8.94350226333144742311e-1"],
  [1.5, "9.33192798731141933996e-1"],
  [1.75, "9.59940843136182909581e-1"],
  [2.0, "9.77249868051820792800e-1"],
  [2.25, "9.87775527344955296847e-1"],
  [2.5, "9.93790334674223864833e-1"],
  [2.75, "9.97020236764945443246e-1"],
  [3.0, "9.98650101968369905473e-1"],
  [3.25, "9.99422974957609232957e-1"],
  [3.5, "9.99767370920964474964e-1"],
  [3.75, "9.99911582714799196132e-1"],
  [4.0, "9.99968328758166880079e-1"],
  [4.25, "9.99989311474225065580e-1"],
  [4.5, "9.99996602326875269940e-1"],
  [4.75, "9.99998982916757431297e-1"],
  [5.0, "9.99999713348428120806e-1"],
  [5.25, "9.99999923950394835113e-1"],
  [5.5, "9.99999981010437534112e-1"],
  [5.75, "9.99999995537827546098e-1"],
  [6.0, "9.99999999013412354962e-1"],
  [6.25, "9.99999999794773657478e-1"],
  [6.5, "9.99999999959839994161e-1"],
  [6.75, "9.99999999992607742222e-1"],
  [7.0, "9.99999999998720187456e-1"],
  [7.25, "9.99999999999791614184e-1"],
  [7.5, "9.99999999999968091083e-1"],
  [7.75, "9.99999999999995405373e-1"],
  [8.0, "9.99999999999999377904e-1"],
];

/* ===================================================================
   Page code
   =================================================================== */

const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const head = (cells) => `<tr>${cells.map((c) => `<th>${c}</th>`).join("")}</tr>`;
const fmt = (v, digits = 4) =>
  v === Infinity ? "∞" : !Number.isFinite(v) ? "–" : Number(v.toPrecision(digits)).toString();
const sci = (v, digits = 1) =>
  v === 0 ? "0" : !Number.isFinite(v) ? (v === Infinity ? "∞" : "–") : v.toExponential(digits).replace("e", "·10^").replace(/\^\+?(-?\d+)/, "<sup>$1</sup>");
const repaint = () => new Promise((resolve) => setTimeout(resolve, 0));
const PHI_REF = REF.map(([x, s]) => [x, Number(s)]);

const RIEMANN = [
  { name: "left", run: riemannLeft },
  { name: "midpoint", run: riemannMid },
  { name: "trapezoid", run: trapezoid },
  { name: "Simpson", run: simpson },
];

const PHI_METHODS = [
  { name: "Simpson (n = 64)", f: (x) => PhiSimpson(x), color: "#94a3b8" },
  { name: "Taylor of erf", f: PhiTaylorErf, color: "#f59e0b" },
  { name: "positive series", f: PhiSeries, color: "#0891b2" },
  { name: "asymptotic", f: PhiAsymptotic, color: "#a855f7" },
  { name: "A&S 26.2.17", f: PhiAS26217, color: "#e11d48" },
  { name: "A&S 7.1.26", f: PhiAS7126, color: "#fb7185" },
  { name: "hybrid (mine)", f: PhiHybrid, color: "#4f46e5" },
];

const relErr = (est, ref) => Math.abs(est - ref) / Math.abs(ref);
const errClass = (e) => (e < 1e-14 ? "text-emerald-600" : e < 1e-6 ? "text-amber-600" : "text-rose-600");
const wolfram = (x) =>
  "https://www.wolframalpha.com/input?i=" + encodeURIComponent(`CDF[NormalDistribution[0,1], ${x}]`);

function fillSelect(el, selected) {
  el.innerHTML = FUNCS.map((fn) => `<option value="${fn.id}" ${fn.id === selected ? "selected" : ""}>${fn.label}</option>`).join("");
}
const fnById = (id) => FUNCS.find((fn) => fn.id === id);

/* ---------- 1. pictures ---------- */

function drawPictures() {
  const fn = fnById($("picF").value),
    n = Number($("picN").value);
  $("picNLabel").textContent = n;
  const F = fn.f;
  const ys = [];
  for (let i = 0; i <= 400; i++) ys.push(F(fn.a + ((fn.b - fn.a) * Math.max(i, 1e-3)) / 400));
  const yTop = fn.unbounded ? 6 : Math.max(...ys) * 1.1;
  const yBot = Math.min(0, ...ys);
  const X = (x) => 30 + (360 * (x - fn.a)) / (fn.b - fn.a),
    Y = (y) => 235 - (215 * (Math.min(y, yTop) - yBot)) / (yTop - yBot);
  const axes =
    `<line x1="30" x2="390" y1="${Y(0)}" y2="${Y(0)}" stroke="#cbd5e1"/>` +
    `<line x1="30" x2="30" y1="15" y2="235" stroke="#cbd5e1"/>` +
    `<text x="30" y="252" font-size="10" fill="#94a3b8" text-anchor="middle">${fmt(fn.a, 3)}</text>` +
    `<text x="390" y="252" font-size="10" fill="#94a3b8" text-anchor="middle">${fn.b === Math.PI ? "π" : fmt(fn.b, 3)}</text>` +
    `<text x="24" y="${Y(yTop) + 8}" font-size="10" fill="#94a3b8" text-anchor="end">${fmt(yTop, 2)}</text>`;
  // curve, broken at jumps
  let curve = "",
    prev = null;
  for (let i = 0; i <= 400; i++) {
    const x = fn.a + ((fn.b - fn.a) * Math.max(i, 0.02)) / 400,
      y = F(x);
    const jump = prev !== null && Math.abs(y - prev) > (yTop - yBot) * 0.3;
    curve += `${jump ? " M" : i ? " L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
    prev = y;
  }
  const curveSvg = `<path d="${curve}" fill="none" stroke="#0f172a" stroke-width="1.8"/>`;

  // Riemann: midpoint rectangles
  const h = (fn.b - fn.a) / n;
  let rects = "";
  for (let i = 0; i < n; i++) {
    const x0 = fn.a + i * h,
      y = F(x0 + h / 2);
    rects += `<rect x="${X(x0)}" y="${Math.min(Y(y), Y(0))}" width="${X(x0 + h) - X(x0)}" height="${Math.abs(Y(0) - Y(y))}" fill="#a5b4fc" stroke="#6366f1" stroke-width="0.6" opacity="0.8"/>`;
  }
  $("picRiemann").innerHTML = rects + axes + curveSvg;
  $("picRiemannNote").innerHTML = `Riemann, midpoint tags: n = ${n} vertical strips → <b>${fmt(riemannMid(F, fn.a, fn.b, n), 8)}</b> (exact ${fn.exactLabel}).`;

  // Lebesgue: horizontal slabs over {f > t_k}
  const r = range(F, fn.breaks);
  const y0 = r.lo,
    y1 = fn.unbounded ? yTop : r.hi;
  const dt = (y1 - y0) / n;
  let slabs = "";
  if (y0 > 0) slabs += `<rect x="${X(fn.a)}" y="${Y(y0)}" width="${X(fn.b) - X(fn.a)}" height="${Y(0) - Y(y0)}" fill="#6ee7b7" opacity="0.6"/>`;
  for (let k = 1; k <= n; k++) {
    const t = y0 + (k - 0.5) * dt;
    for (const [lo, hi] of superLevelSet(F, fn.breaks, t))
      slabs += `<rect x="${X(lo)}" y="${Y(y0 + k * dt)}" width="${Math.max(0.5, X(hi) - X(lo))}" height="${Y(y0 + (k - 1) * dt) - Y(y0 + k * dt)}" fill="#6ee7b7" stroke="#059669" stroke-width="0.6" opacity="0.8"/>`;
  }
  $("picLebesgue").innerHTML = slabs + axes + curveSvg;
  const L = lebesgue(fn, n);
  $("picLebesgueNote").innerHTML =
    `Lebesgue: M = ${n} horizontal slabs, each as wide as μ({f > t<sub>k</sub>}) → <b>${fmt(L.value, 8)}</b>` +
    (fn.unbounded ? ` (picture clipped at height ${yTop}; computation truncated at T = ${fmt(L.truncated, 3)})` : "") +
    ".";
}

/* ---------- 2. results table ---------- */

function cell(est, exact) {
  if (!Number.isFinite(est)) return `<span class="text-rose-600">∞</span><br><span class="text-xs text-slate-400">f(0) = ∞</span>`;
  const e = Math.abs(est - exact);
  return `${fmt(est, 9)}<br><span class="text-xs ${e < 1e-6 ? "text-emerald-600" : "text-slate-400"}">${sci(e)}</span>`;
}

function runResults() {
  const n = 1000;
  let rows = head(["f", "exact", ...RIEMANN.map((m) => m.name), "Lebesgue (exact pre-images)", "bracket (lower / upper sum)", "Lebesgue (sampled)"]);
  for (const fn of FUNCS) {
    const L = lebesgue(fn, n),
      S = lebesgueSampled(fn, n, n);
    rows += row([
      `<span class="font-sans inline-block min-w-[8rem]">${fn.label}</span>`,
      fn.exactLabel,
      ...RIEMANN.map((m) => cell(m.run(fn.f, fn.a, fn.b, n), fn.exact)),
      cell(L.value, fn.exact),
      `<span class="text-xs">≥ ${fmt(L.lower, 6)}<br>≤ ${fmt(L.upper, 6)}</span>` +
        (fn.unbounded ? `<br><span class="text-xs text-slate-400">of min(f, ${fmt(L.truncated, 3)})</span>` : ""),
      cell(S.value, fn.exact),
    ]);
  }
  $("resTable").innerHTML = rows;
  $("resNote").innerHTML =
    `Every method converges to the same value on every function it can evaluate, as expected for Riemann-integrable functions. ` +
    `The left rule, trapezoid and Simpson cannot start on 1/√x, because they evaluate f(0) = ∞: a Riemann sum needs the improper-integral limit there. ` +
    `The lower and upper Lebesgue sums enclose the exact value, with a gap of exactly Δy·(b − a). For 1/√x they enclose the integral of the truncated function min(f, T) instead. ` +
    `The sampled Lebesgue estimate is no better than the midpoint rule on the same grid: it is the midpoint rule with every value rounded to the centre of its band.`;
}

/* ---------- 3. convergence ---------- */

const NS = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

async function runConvergence() {
  const fn = fnById($("convF").value);
  $("convRun").disabled = true;
  $("convRun").textContent = "Running…";
  await repaint();
  const series = [
    { name: "left", color: "#cbd5e1", run: (n) => ({ v: riemannLeft(fn.f, fn.a, fn.b, n) }) },
    { name: "midpoint", color: "#818cf8", run: (n) => ({ v: riemannMid(fn.f, fn.a, fn.b, n) }) },
    { name: "trapezoid", color: "#0891b2", run: (n) => ({ v: trapezoid(fn.f, fn.a, fn.b, n) }) },
    { name: "Simpson", color: "#4f46e5", run: (n) => ({ v: simpson(fn.f, fn.a, fn.b, n) }) },
    { name: "Lebesgue (exact)", color: "#059669", run: (n) => ({ v: lebesgue(fn, n).value }) },
    { name: "Lebesgue (sampled, N = M)", color: "#f59e0b", run: (n) => ({ v: lebesgueSampled(fn, n, n).value }) },
  ];
  for (const s of series) {
    const t0 = performance.now();
    s.err = NS.map((n) => Math.abs(s.run(n).v - fn.exact));
    s.ms = performance.now() - t0;
    const big = NS.map((n, i) => [n, s.err[i]]).filter(([n, e]) => n >= 64 && e > 1e-14 && Number.isFinite(e));
    s.slope = big.length >= 3 ? logSlope(big.map((p) => p[0]), big.map((p) => p[1])) : NaN;
  }
  // cost at n = 1024
  const calls = {
    left: 1024,
    midpoint: 1024,
    trapezoid: 1025,
    Simpson: 1025,
    "Lebesgue (exact)": lebesgue(fn, 1024).calls,
    "Lebesgue (sampled, N = M)": 1024,
  };

  // chart
  const finite = series.flatMap((s) => s.err).filter((e) => e > 0 && Number.isFinite(e));
  const ly0 = Math.max(-16.5, Math.floor(Math.log10(Math.min(...finite)))),
    ly1 = Math.ceil(Math.log10(Math.max(...finite)));
  const lx0 = Math.log10(NS[0]),
    lx1 = Math.log10(NS[NS.length - 1]);
  const X = (n) => 70 + (520 * (Math.log10(n) - lx0)) / (lx1 - lx0),
    Y = (e) => 270 - (230 * (Math.max(ly0, Math.log10(e)) - ly0)) / (ly1 - ly0 || 1);
  let svg = "";
  for (let e = ly0; e <= ly1; e += Math.max(1, Math.ceil((ly1 - ly0) / 8)))
    svg +=
      `<line x1="70" x2="590" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" stroke="#f1f5f9"/>` +
      `<text x="62" y="${Y(10 ** e) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">10<tspan baseline-shift="super" font-size="8">${e}</tspan></text>`;
  for (const n of [4, 16, 64, 256, 1024, 4096])
    svg += `<text x="${X(n)}" y="290" font-size="11" text-anchor="middle" fill="#94a3b8">${n}</text>`;
  svg += `<text x="330" y="310" font-size="11" text-anchor="middle" fill="#64748b">n cells (Riemann) or M levels (Lebesgue)</text>`;
  series.forEach((s, k) => {
    const pts = NS.map((n, i) => [n, s.err[i]]).filter(([, e]) => Number.isFinite(e));
    const visible = pts.filter(([, e]) => e > 0);
    if (visible.length)
      svg += `<polyline points="${visible.map(([n, e]) => `${X(n).toFixed(1)},${Y(e).toFixed(1)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    for (const [n, e] of pts)
      svg += `<circle cx="${X(n)}" cy="${e > 0 ? Y(e) : Y(10 ** ly0)}" r="3" fill="${e > 0 ? s.color : "white"}" stroke="${s.color}"><title>${s.name}, n = ${n}: ${e.toExponential(2)}</title></circle>`;
    const lx = 80 + (k % 3) * 175,
      lyy = 14 + Math.floor(k / 3) * 15;
    svg += `<rect x="${lx}" y="${lyy - 9}" width="10" height="10" rx="2" fill="${s.color}"/><text x="${lx + 14}" y="${lyy}" font-size="11" fill="#334155">${s.name}</text>`;
  });
  $("convChart").innerHTML = svg;

  let rows = head(["method", "error n = 64", "error n = 1024", "error n = 4096", "observed order (slope)", "f-evaluations at n = 1024", "time, all 11 runs"]);
  for (const s of series) {
    const at = (n) => s.err[NS.indexOf(n)];
    rows += row([
      `<span class="font-sans">${s.name}</span>`,
      sci(at(64)),
      sci(at(1024)),
      sci(at(4096)),
      Number.isFinite(s.slope)
        ? `<b>${s.slope.toFixed(2)}</b>`
        : s.err.every((e) => e === Infinity)
          ? `<span class="text-rose-600">diverges: f(0) = ∞</span>`
          : `<span class="text-slate-400">exact (rounding only)</span>`,
      calls[s.name].toLocaleString("en-US"),
      s.ms < 1 ? "< 1 ms" : `${s.ms.toFixed(1)} ms`,
    ]);
  }
  $("convTable").innerHTML = rows;
  const notes = {
    sin: "Simpson shows its order 4, midpoint and trapezoid order 2. The left rule also reaches order 2 here, but only by accident: sin 0 = sin π = 0, so on this function it coincides with the trapezoid rule (on √x or sin x / x it drops to order 1). Lebesgue reaches only order 1.5, because μ({sin x > t}) = π − 2 arcsin t behaves like √(1 − t) near the maximum: flat parts of f become singular parts of the distribution function.",
    sq: "Simpson is exact (rounding only). Lebesgue has order 1.5 because μ = 1 − √t is singular at the flat minimum t = 0.",
    step13: "Lebesgue is exact for every M, since a step function is already a simple function. Left and midpoint sums are exact because ½ is always a cell boundary, so no cell straddles the jump. Trapezoid and Simpson evaluate f on the jump node x = ½ itself and give that single value (3) the weight of a whole node, so their error drops to O(h).",
    abs: "Piecewise linear with the kink on a node: midpoint, trapezoid and Lebesgue are exact up to rounding (hollow points = error 0).",
    invsqrt: "Only midpoint can run: left, trapezoid and Simpson need f(0) = ∞. Midpoint has order ½ (the first cell alone carries 2√h of area). Lebesgue with truncation T = M^(2/3) has order ⅔, set by the missing tail ∫_T^∞ t⁻² dt = 1/T.",
    ind: "An indicator is a simple function: Lebesgue is exact for every M. Left and midpoint sums are exact because ½ is a cell boundary; trapezoid and Simpson evaluate the jump node and become O(h).",
    sinc: "Smooth on [0, π], with f(0) = 1 defined by its limit: Simpson order 4. f is decreasing with a flat start (f′(0) = 0), so Lebesgue order is 1.5.",
    sqrt: "The vertical slope at x = 0 slows down midpoint and Simpson to order 1.5. But for Lebesgue, the measure μ({√x > t}) = 1 − t² is a smooth polynomial, so it keeps order 2 and gets smaller errors for the same number of levels M, although it needs many more function calls.",
  };
  $("convNote").innerHTML =
    notes[fn.id] +
    ` <br><br><b>Cost:</b> each exact Lebesgue level measures two pre-images (one at the midpoint of the band and one at the edge for the bounds), ` +
    `each using bisection with about 50 evaluations per monotone piece. That is ${Math.round(calls["Lebesgue (exact)"] / 1024)}× more function calls than a Riemann rule at the same resolution. ` +
    `Comparing them at equal computational cost (number of function evaluations) rather than grid size, Riemann sums win on every function here, including √x.`;
  $("convRun").disabled = false;
  $("convRun").textContent = "Run";
}

/* ---------- 4. pathological ---------- */

function runPathological() {
  // Dirichlet: the cover of the rationals
  let rows = head(["Q (max denominator)", "rationals p/q in [0, 1]", "Σ lengths of the cover", "measure of the union", "ε"]);
  for (const Q of [10, 100, 300]) {
    const c = coverRationals(Q, 0.01);
    rows += row([Q, c.count.toLocaleString("en-US"), sci(c.total, 3), sci(c.union, 3), "10<sup>−2</sup>"]);
  }
  $("coverTable").innerHTML = rows;

  rows = head(["value in JavaScript", "exact fraction stored in the double", "back to number"]);
  for (const [label, x] of [
    ["Math.SQRT2 (√2)", Math.SQRT2],
    ["Math.PI (π)", Math.PI],
    ["Math.E (e)", Math.E],
    ["0.1", 0.1],
    ["Math.random()", Math.random()],
  ]) {
    const { num, den } = doubleAsFraction(x);
    const k = den.toString(2).length - 1;
    rows += row([label, `${num} / 2<sup>${k}</sup>`, x]);
  }
  $("fracTable").innerHTML = rows;

  // Thomae
  rows = head(["N", "lower sum L", "Riemann sum, tags i/N", "Riemann sum, N prime nearby", "upper sum U"]);
  const primeNear = (N) => {
    const isP = (p) => {
      for (let d = 2; d * d <= p; d++) if (p % d === 0) return false;
      return p > 1;
    };
    while (!isP(N)) N++;
    return N;
  };
  for (const N of [10, 100, 1000, 10000]) {
    const P = primeNear(N);
    rows += row([N, 0, fmt(thomaeGridSum(N), 5), `${fmt(thomaeGridSum(P), 5)} <span class="text-slate-400">(N = ${P})</span>`, fmt(thomaeUpper(N), 5)]);
  }
  $("thomaeTable").innerHTML = rows;

  const S = [];
  for (let N = 1; N <= 600; N++) S.push(thomaeGridSum(N));
  const X = (N) => 60 + (560 * (N - 1)) / 599,
    top = 0.3,
    Y = (v) => 250 - (230 * Math.min(v, top)) / top;
  let svg = "";
  for (const v of [0, 0.1, 0.2, 0.3])
    svg += `<line x1="60" x2="620" y1="${Y(v)}" y2="${Y(v)}" stroke="#f1f5f9"/><text x="54" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">${v}</text>`;
  for (const N of [1, 100, 200, 300, 400, 500, 600])
    svg += `<text x="${X(N)}" y="270" font-size="11" text-anchor="middle" fill="#94a3b8">${N}</text>`;
  S.forEach((v, i) => (svg += `<circle cx="${X(i + 1).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="1.6" fill="#6366f1"><title>N = ${i + 1}: ${fmt(v, 4)}</title></circle>`));
  let env = "";
  for (let N = 4; N <= 600; N++) env += `${X(N).toFixed(1)},${Y(2 / N).toFixed(1)} `;
  svg += `<polyline points="${env}" fill="none" stroke="#e11d48" stroke-dasharray="4 3"/><text x="470" y="${Y(0.06)}" font-size="11" fill="#e11d48">dashed: 2/N (N prime)</text>`;
  $("thomaeChart").innerHTML = svg;

  rows = head(["level t", "points with f > t", "μ({f > t})", "contribution to the Lebesgue sum"]);
  for (const t of [0.5, 0.1, 0.01, 0.003]) rows += row([t, thomaeLevelCount(t).toLocaleString("en-US"), 0, 0]);
  $("thomaeLevelTable").innerHTML = rows;

  // fat Cantor
  rows = head(["n cells", "lower sum (tags in a gap)", "Riemann sum, random tags", "upper sum U (cells meeting C)", "U − L", "Lebesgue ∫ 1<sub>C</sub>"]);
  for (const n of [10, 100, 1000, 10000, 100000]) {
    const r = svcSums(n);
    rows += row([n.toLocaleString("en-US"), fmt(r.gap, 5), fmt(r.random, 5), fmt(r.upper, 5), fmt(r.upper - r.gap, 5), "0.5"]);
  }
  $("svcTable").innerHTML = rows;
  $("svcNote").innerHTML =
    `In each subinterval the algorithm identifies an explicit point inside a removed gap (lower sum equals 0) and tests whether the interval intersects C (upper sum). ` +
    `As n increases, U approaches ½ while L remains 0; Riemann sums maintain a persistent spread of ½ regardless of grid resolution. ` +
    `Random evaluation points estimate the indicator's integral by Monte Carlo sampling, yielding the set's measure directly: P(X ∈ C) = μ(C). ` +
    `The Lebesgue integral evaluates analytically from the complement of the open intervals: μ(C) = 1 − Σ<sub>k</sub> 2<sup>k−1</sup>/4<sup>k</sup> = ½.`;
}

/* ---------- 7. the tail trap ---------- */

function runTrap() {
  let rows = head(["x", "1 − Φ(x), by subtraction", "Φ(−x), computed directly", "true value", "relative error of the subtraction"]);
  for (const x of [2, 4, 6, 7, 8, 8.5, 9, 10]) {
    const sub = 1 - PhiHybrid(x),
      dir = PhiHybrid(-x);
    const ref = PHI_REF.find((p) => p[0] === -x);
    const truth = ref ? ref[1] : dir;
    const e = relErr(sub, truth);
    rows += row([x, sci(sub, 6), sci(dir, 6), sci(truth, 6), `<span class="${errClass(e)}">${sci(e)}</span>`]);
  }
  $("trapTable").innerHTML = rows;
}

/* ---------- 8. accuracy ---------- */

function runAccuracy() {
  const pts = [-12, -8, -5, -3, -1, 0, 0.5, 1, 2, 3, 5];
  let rows = head(["x", "reference Φ(x)", ...PHI_METHODS.map((m) => m.name)]);
  for (const x of pts) {
    const ref = PHI_REF.find((p) => p[0] === x)[1];
    rows += row([
      `<a class="lnk" href="${wolfram(x)}" target="_blank" rel="noopener">${x}</a>`,
      ref.toPrecision(16),
      ...PHI_METHODS.map((m) => {
        const e = relErr(m.f(x), ref);
        return `<span class="${errClass(e)}">${sci(e)}</span>`;
      }),
    ]);
  }
  $("accTable").innerHTML = rows;

  // chart: relative error vs x
  const lo = -17,
    hi = 1;
  const X = (x) => 60 + (540 * (x + 12)) / 20,
    Y = (e) => 290 - (245 * (Math.min(hi, Math.max(lo, Math.log10(e || 1e-17))) - lo)) / (hi - lo);
  let svg = "";
  for (let e = lo; e <= hi; e += 3)
    svg += `<line x1="60" x2="600" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}" stroke="#f1f5f9"/><text x="54" y="${Y(10 ** e) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">10<tspan baseline-shift="super" font-size="8">${e}</tspan></text>`;
  for (let x = -12; x <= 8; x += 2)
    svg += `<text x="${X(x)}" y="310" font-size="11" text-anchor="middle" fill="#94a3b8">${x}</text>`;
  svg += `<text x="330" y="330" font-size="11" text-anchor="middle" fill="#64748b">x (reference points every 0.25)</text>`;
  const max = {};
  PHI_METHODS.forEach((m, k) => {
    const errs = PHI_REF.map(([x, ref]) => [x, relErr(m.f(x), ref)]);
    max[m.name] = Math.max(...errs.map((p) => (Number.isFinite(p[1]) ? p[1] : Infinity)));
    svg += `<polyline points="${errs.map(([x, e]) => `${X(x).toFixed(1)},${Y(Number.isFinite(e) ? e : 10).toFixed(1)}`).join(" ")}" fill="none" stroke="${m.color}" stroke-width="${m.name.includes("mine") ? 2.5 : 1.5}" opacity="0.9"/>`;
    const lx = 70 + (k % 4) * 135,
      ly = 12 + Math.floor(k / 4) * 14;
    svg += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" fill="${m.color}"/><text x="${lx + 14}" y="${ly}" font-size="11" fill="#334155">${m.name}</text>`;
  });
  svg += `<line x1="60" x2="600" y1="${Y(1.1e-16)}" y2="${Y(1.1e-16)}" stroke="#0f172a" stroke-dasharray="2 3"/><text x="598" y="${Y(1.1e-16) - 4}" font-size="10" text-anchor="end" fill="#0f172a">machine ε/2</text>`;
  $("accChart").innerHTML = svg;
  $("accNote").innerHTML =
    `Errors are clipped to [10<sup>−17</sup>, 10]. Worst relative error across the 81 reference points: ` +
    PHI_METHODS.map((m) => `${m.name} <b>${sci(max[m.name])}</b>`).join(", ") +
    `. Power series evaluate accurately near the origin but lose precision in the left tail due to subtraction of near-equal values. ` +
    `The asymptotic expansion behaves inversely, converging only in deep tails. Rational minimax forms (A&S) maintain absolute errors near 10<sup>−7</sup>–10<sup>−8</sup>, but their relative tail accuracy degrades significantly. ` +
    `The hybrid method preserves double-precision relative accuracy across the tested domain.`;
}

async function runBench() {
  $("benchRun").disabled = true;
  $("benchRun").textContent = "Running…";
  await repaint();
  const xs = new Float64Array(200000);
  for (let i = 0; i < xs.length; i++) xs[i] = -8 + 16 * Math.random();
  let rows = head(["method", "time per call", "worst relative error on [−12, 8]", "worst absolute error on [−12, 8]"]);
  const res = [];
  for (const m of PHI_METHODS) {
    let sink = 0;
    for (let i = 0; i < 2000; i++) sink += m.f(xs[i]); // warm-up for the JIT
    const t0 = performance.now();
    for (const x of xs) sink += m.f(x);
    const ns = ((performance.now() - t0) * 1e6) / xs.length;
    const rel = Math.max(...PHI_REF.map(([x, r]) => relErr(m.f(x), r)));
    const abs = Math.max(...PHI_REF.map(([x, r]) => Math.abs(m.f(x) - r)));
    res.push({ m, ns, sink });
    rows += row([
      `<span class="font-sans">${m.name}</span>`,
      `<b>${ns.toFixed(0)} ns</b>`,
      `<span class="${errClass(rel)}">${sci(rel)}</span>`,
      `<span class="${errClass(abs)}">${sci(abs)}</span>`,
    ]);
    await repaint();
  }
  $("benchTable").innerHTML = rows;
  const fast = res.reduce((a, b) => (a.ns < b.ns ? a : b));
  const mine = res.find((r) => r.m.name.includes("mine"));
  $("benchNote").innerHTML =
    `Timings depend on your browser and machine. The fastest method here is ${fast.m.name} (${fast.ns.toFixed(0)} ns); ` +
    `my hybrid method takes ${mine.ns.toFixed(0)} ns while maintaining full double-precision accuracy. Simpson is slower because it has to evaluate exp 65 times per call. ` +
    `The hybrid method spends most of its time in the continued fraction just above a = 1.4 (${cfTerms(1.4)} terms). ` +
    `Production libraries (like Cody's SPECFUN) replace dynamic loops with fixed rational polynomials for each interval to get the same accuracy at the speed of A&S.`;
  $("benchRun").disabled = false;
  $("benchRun").textContent = "Run benchmark";
}

function runCalc() {
  const x = Number($("calcX").value);
  if (!Number.isFinite(x)) return;
  $("calcWolfram").href = wolfram(x);
  const best = PhiHybrid(x);
  let rows = head(["method", "Φ(x)", "1 − Φ(x) (via Φ(−x))", "relative difference from the hybrid"]);
  for (const m of PHI_METHODS) {
    const v = m.f(x),
      q = m.f(-x);
    const e = relErr(v, best);
    rows += row([`<span class="font-sans">${m.name}</span>`, v.toPrecision(16), q.toPrecision(16), m.name.includes("mine") ? "–" : `<span class="${errClass(e)}">${sci(e)}</span>`]);
  }
  $("calcTable").innerHTML = rows;
}

/* ---------- start ---------- */

function initPage() {
  fillSelect($("picF"), "sin");
  fillSelect($("convF"), "sin");
  $("picF").onchange = drawPictures;
  $("picN").oninput = drawPictures;
  $("convRun").onclick = runConvergence;
  $("convF").onchange = runConvergence;
  $("benchRun").onclick = runBench;
  $("calcRun").onclick = runCalc;
  drawPictures();
  runResults();
  runConvergence();
  runPathological();
  runTrap();
  runAccuracy();
  runCalc();
  runBench();
}

if (typeof document !== "undefined") initPage();
else module.exports = { FUNCS, lebesgue, lebesgueSampled, riemannMid, simpson, PhiHybrid, REF, PHI_METHODS, svcSums, thomaeUpper };
