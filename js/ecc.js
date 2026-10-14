// Toy elliptic-curve arithmetic on y^2 = x^3 + 7 (mod p), the same equation as secp256k1.
// A point is {x, y}; null is the point at infinity O (the neutral element of the group).

const mod = (a, p) => ((a % p) + p) % p;

// Modular inverse with the extended Euclidean algorithm: a * inv(a) = 1 (mod p).
// Works with Numbers and with BigInts (for secp256k1).
function inv(a, p) {
  const big = typeof p === 'bigint', one = big ? 1n : 1, zero = big ? 0n : 0;
  let [r0, r1, s0, s1] = [mod(a, p), p, one, zero];
  while (r1 !== zero) {
    const q = big ? r0 / r1 : Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return mod(s0, p);
}

const isOnCurve = (P, p) => P === null || mod(P.y * P.y - (P.x ** 3 + 7), p) === 0;

// P + Q with every intermediate value, so the page can show the computation.
function addStep(P, Q, p) {
  if (P === null) return { point: Q, kind: 'identity' };
  if (Q === null) return { point: P, kind: 'identity' };
  if (P.x === Q.x && mod(P.y + Q.y, p) === 0) return { point: null, kind: 'inverse' }; // P + (-P) = O
  const doubling = P.x === Q.x && P.y === Q.y;
  const num = doubling ? mod(3 * P.x * P.x, p) : mod(Q.y - P.y, p); // slope numerator
  const den = doubling ? mod(2 * P.y, p) : mod(Q.x - P.x, p);       // slope denominator
  const lambda = mod(num * inv(den, p), p);
  const x = mod(lambda * lambda - P.x - Q.x, p);
  const y = mod(lambda * (P.x - x) - P.y, p);
  return { point: { x, y }, kind: doubling ? 'double' : 'add', num, den, lambda };
}

const add = (P, Q, p) => addStep(P, Q, p).point;

// k*G with double-and-add: reads the bits of k from the least significant one.
function scalarMult(k, G, p) {
  let R = null, A = G;
  for (; k > 0; k = Math.floor(k / 2)) {
    if (k % 2 === 1) R = add(R, A, p);
    A = add(A, A, p);
  }
  return R;
}

// Same algorithm, but returns one row per bit for display.
function doubleAndAddTrace(k, G, p) {
  const rows = [];
  let R = null, A = G;
  for (let i = 0; k > 0; k = Math.floor(k / 2), i++) {
    const bit = k % 2;
    if (bit === 1) R = add(R, A, p);
    rows.push({ i, bit, A, R });
    A = add(A, A, p);
  }
  return rows;
}

// ---------- the real secp256k1 (BigInt): same formulas, 256-bit numbers ----------

const SECP = {
  p: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn,
  n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n, // order of G
  G: { x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
       y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n },
};

function addBig(P, Q, p = SECP.p) {
  if (P === null) return Q;
  if (Q === null) return P;
  if (P.x === Q.x && mod(P.y + Q.y, p) === 0n) return null;
  const doubling = P.x === Q.x && P.y === Q.y;
  const num = doubling ? 3n * P.x * P.x : Q.y - P.y;
  const den = doubling ? 2n * P.y : Q.x - P.x;
  const lambda = mod(num * inv(den, p), p);
  const x = mod(lambda * lambda - P.x - Q.x, p);
  return { x, y: mod(lambda * (P.x - x) - P.y, p) };
}

// First `steps` rows of double-and-add for a 256-bit key; the loop stops there on purpose.
function doubleAndAddTraceBig(k, steps, G = SECP.G) {
  const rows = [];
  let R = null, A = G;
  for (let i = 0; i < steps && k > 0n; k >>= 1n, i++) {
    const bit = Number(k & 1n);
    if (bit === 1) R = addBig(R, A);
    rows.push({ i, bit, A, R });
    A = addBig(A, A);
  }
  return rows;
}

// All affine points of the curve (brute force: only for small p).
function curvePoints(p) {
  const pts = [];
  for (let x = 0; x < p; x++)
    for (let y = 0; y < p; y++)
      if (isOnCurve({ x, y }, p)) pts.push({ x, y });
  return pts;
}

// [O, G, 2G, ..., (n-1)G]: the index is k, the length is the order n of G.
function multiples(G, p) {
  const pts = [null];
  for (let P = G; P !== null; P = add(P, G, p)) pts.push(P);
  return pts;
}

// ---------- statistics helpers (written by hand: mean, chi-square, Pearson) ----------

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

// Histogram of integers in [0, p) with m bins; `size[i]` = how many integers fall in bin i.
function histogram(values, p, m) {
  const counts = Array(m).fill(0), size = Array(m).fill(0);
  for (let v = 0; v < p; v++) size[Math.floor(v * m / p)]++;
  for (const v of values) counts[Math.floor(v * m / p)]++;
  return { counts, size };
}

// Chi-square goodness of fit against the uniform distribution on [0, p).
function chiSquare(values, p, m) {
  const { counts, size } = histogram(values, p, m);
  return counts.reduce((s, o, i) => {
    const e = size[i] * values.length / p;
    return s + (o - e) ** 2 / e;
  }, 0);
}

const popcount = v => { let c = 0; for (; v; v >>>= 1) c += v & 1; return c; };

// Fraction of ones at each bit position (index 0 = least significant bit).
function bitFrequencies(values, bits) {
  return Array.from({ length: bits }, (_, i) => mean(values.map(v => (v >> i) & 1)));
}

// Runs every experiment of the homework for the map k -> kG, k = 1 .. n-1.
function analyse(p, G, rnd = Math.random) {
  const pts = multiples(G, p), n = pts.length;
  const ks = [], xs = [], ys = [];
  for (let k = 1; k < n; k++) { ks.push(k); xs.push(pts[k].x); ys.push(pts[k].y); }
  const bits = Math.ceil(Math.log2(p));     // bits per coordinate
  const kbits = Math.ceil(Math.log2(n));    // bits of the private key

  // 4. chi-square on a random sample of keys (a test needs a sample, not the whole population)
  const sample = Array.from({ length: 1000 }, () => pts[1 + Math.floor(rnd() * (n - 1))]);

  // 3. monobit test on all the bits of x
  const ones = xs.reduce((s, v) => s + popcount(v), 0), totalBits = xs.length * bits;

  // 6. avalanche: flip one bit of k, count how many of the 2*bits output bits change
  const perBit = Array(kbits).fill(0), perBitN = Array(kbits).fill(0);
  for (let k = 1; k < n; k++)
    for (let i = 0; i < kbits; i++) {
      const k2 = k ^ (1 << i);
      if (k2 < 1 || k2 >= n) continue;
      perBit[i] += (popcount(pts[k].x ^ pts[k2].x) + popcount(pts[k].y ^ pts[k2].y)) / (2 * bits);
      perBitN[i]++;
    }
  let next = 0;
  for (let k = 1; k < n - 1; k++)
    next += (popcount(pts[k].x ^ pts[k + 1].x) + popcount(pts[k].y ^ pts[k + 1].y)) / (2 * bits);

  // 2. control group: a random function with n-1 inputs and n-1 possible outputs
  const hits = Array(n - 1).fill(0);
  for (let i = 0; i < n - 1; i++) hits[Math.floor(rnd() * (n - 1))]++;

  let mirror = 0;                           // how often x(kG) = x((n-k)G)
  for (let k = 1; k < n; k++) if (pts[k].x === pts[n - k].x) mirror++;

  return {
    p, G, n, pts, ks, xs, ys, bits, kbits,
    distinctPoints: new Set(pts.slice(1).map(P => P.x * p + P.y)).size,
    distinctX: new Set(xs).size, distinctY: new Set(ys).size,
    meanX: mean(xs), meanY: mean(ys),
    bitX: bitFrequencies(xs, bits), bitY: bitFrequencies(ys, bits),
    monobitZ: (2 * ones - totalBits) / Math.sqrt(totalBits),
    chiX: chiSquare(sample.map(P => P.x), p, 10), chiY: chiSquare(sample.map(P => P.y), p, 10),
    chiAllX: chiSquare(xs, p, 10), chiAllY: chiSquare(ys, p, 10),
    rKX: pearson(ks, xs), rKY: pearson(ks, ys),
    serialX: pearson(xs.slice(0, -1), xs.slice(1)),
    mirror,
    avalanche: perBit.reduce((s, v) => s + v, 0) / perBitN.reduce((s, v) => s + v, 0),
    avalanchePerBit: perBit.map((v, i) => v / perBitN[i]),
    avalancheNext: next / (n - 2),
    randomMissing: hits.filter(h => h === 0).length / (n - 1),
    randomRepeated: hits.filter(h => h >= 2).length / (n - 1),
  };
}

if (typeof module !== 'undefined')
  module.exports = { mod, inv, isOnCurve, addStep, add, scalarMult, doubleAndAddTrace, SECP, addBig, doubleAndAddTraceBig, curvePoints, multiples, analyse };
