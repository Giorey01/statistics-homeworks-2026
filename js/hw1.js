// Page logic for Homework 1: calculator, slow-motion animation and statistical experiments.
// The curve arithmetic and the statistics are in ecc.js, the chart helper in ui.js.

const P17 = 17, G17 = { x: 1, y: 5 };
const fmt = P => P ? `(${P.x}, ${P.y})` : 'O';

// ---------- 2. calculator ----------

function compute() {
  const k = Math.max(1, Math.floor(Number($('k').value) || 1));
  const Q = scalarMult(k, G17, P17);
  $('pubkey').textContent = `Q = ${k}G = ${fmt(Q)}`;
  $('pubnote').textContent = Q
    ? `Check: ${Q.y}² mod 17 = ${mod(Q.y * Q.y, 17)} and ${Q.x}³ + 7 mod 17 = ${mod(Q.x ** 3 + 7, 17)}, so Q is on the curve.` +
      (k > 8 ? ` Since G has order 9, ${k}G = ${k % 9}G.` : '')
    : `${k} is a multiple of 9, the order of G, so the result is the point at infinity O: not a valid private key on this curve.`;

  // repeated addition, with the slope of every step
  const shown = Math.min(k, 30);
  let rows = '<tr><th>i</th><th>operation</th><th>slope λ</th><th>iG</th></tr>' +
             `<tr><td>1</td><td>start</td><td>–</td><td>${fmt(G17)}</td></tr>`;
  let P = G17;
  for (let i = 2; i <= shown; i++) {
    const s = addStep(P, G17, P17);
    const op = { double: 'G + G (doubling)', add: `${fmt(P)} + G`, inverse: `${fmt(P)} + G, opposite points`, identity: 'O + G' }[s.kind];
    const slope = s.lambda === undefined ? '–' : `${s.num}/${s.den} = ${s.num}·${inv(s.den, P17)} = ${s.lambda}`;
    rows += `<tr class="${i === k ? 'bg-indigo-50 font-semibold' : ''}"><td>${i}</td><td>${op}</td><td>${slope}</td><td>${fmt(s.point)}</td></tr>`;
    P = s.point;
  }
  $('steps').innerHTML = rows;
  $('stepsNote').textContent = k > shown
    ? `Only the first ${shown} steps are listed; for k = ${k} see the fast method below.`
    : 'Slopes are written as numerator/denominator = numerator · inverse = λ (mod 17).';

  $('trace').innerHTML = `<tr><th>bit position</th><th>bit of k = ${k.toString(2)}₂</th><th>A = 2ⁱG</th><th>R (running result)</th></tr>` +
    doubleAndAddTrace(k, G17, P17).map(r =>
      `<tr><td>${r.i}</td><td>${r.bit}${r.bit ? ' → R = R + A' : ' → skip'}</td><td>${fmt(r.A)}</td><td>${fmt(r.R)}</td></tr>`).join('');

  resetViz();
}

// ---------- 2b. double-and-add with a real 256-bit key on secp256k1 ----------

const BIG_STEPS = 10;
const hex = v => v.toString(16).padStart(64, '0');
const short = v => { const h = hex(v); return `${h.slice(0, 6)}…${h.slice(-4)}`; };
const fmtBig = P => P ? `(${short(P.x)}, ${short(P.y)})` : 'O';

// "1.23 × 10^77" for a BigInt too large for a Number
function sci(v) {
  const s = v.toString();
  return `${s[0]}.${s.slice(1, 3)} × 10<sup>${s.length - 1}</sup>`;
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const k = BigInt('0x' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')) % SECP.n;
  return k === 0n ? 1n : k;
}

function computeBig() {
  const k = randomKey();
  const bits = k.toString(2), ones = [...bits].filter(b => b === '1').length;
  const lead = 256 - bits.length;   // leading zeros of the 256-bit key
  $('bigK').textContent = `0x${hex(k)} (256-bit key` +
    (lead ? `; the first ${lead === 1 ? 'bit is' : `${lead} bits are`} 0, so double-and-add only needs ${bits.length} of them` : '') +
    `; ${ones} bits equal to 1)`;

  $('traceBig').innerHTML = '<tr><th>bit position</th><th>bit of k</th><th>A = 2ⁱG</th><th>R (running result)</th></tr>' +
    doubleAndAddTraceBig(k, BIG_STEPS).map(r =>
      `<tr><td>${r.i}</td><td>${r.bit}${r.bit ? ' → R = R + A' : ' → skip'}</td><td>${fmtBig(r.A)}</td><td>${fmtBig(r.R)}</td></tr>`).join('') +
    `<tr><td colspan="4" class="text-slate-500">… stopped after ${BIG_STEPS} of ${bits.length} bits</td></tr>`;

  const doublings = bits.length - 1, total = doublings + ones;
  $('bigNote').innerHTML = `<b>How much work in total.</b> Double-and-add reads ${bits.length} bits of this key, so the full computation needs
    about <b>${doublings} doublings + ${ones} additions ≈ ${total} operations</b>. Repeated addition would need
    k − 1 ≈ <b>${sci(k - 1n)}</b> additions. Even at a billion additions per second that is about
    ${sci((k - 1n) / 31557600000000000n)} years, while double-and-add finishes in a few milliseconds.`;
}

$('newKey').onclick = computeBig;

// ---------- 3. slow-motion visualisation (SVG) ----------

const CELL = 28, PAD = 36;
const sx = x => PAD + x * CELL, sy = y => PAD + (16 - y) * CELL;
let step = 0, timer = null;

function drawViz() {
  const k = Math.min(Math.max(1, Math.floor(Number($('k').value) || 1)), 18);
  const seq = [null];                                   // seq[i] = iG
  for (let i = 1; i <= k; i++) seq.push(add(seq[i - 1], G17, P17));

  let svg = '';
  for (let i = 0; i <= 16; i++) {
    svg += `<line x1="${sx(i)}" y1="${sy(0)}" x2="${sx(i)}" y2="${sy(16)}" stroke="#f1f5f9"/>` +
           `<line x1="${sx(0)}" y1="${sy(i)}" x2="${sx(16)}" y2="${sy(i)}" stroke="#f1f5f9"/>` +
           `<text x="${sx(i)}" y="${sy(0) + 20}" font-size="10" text-anchor="middle" fill="#94a3b8">${i}</text>` +
           `<text x="${sx(0) - 14}" y="${sy(i) + 3}" font-size="10" text-anchor="middle" fill="#94a3b8">${i}</text>`;
  }
  for (const P of curvePoints(P17)) svg += `<circle cx="${sx(P.x)}" cy="${sy(P.y)}" r="5" fill="#cbd5e1"/>`;
  for (let i = 2; i <= step; i++)                        // the path walked so far
    if (seq[i] && seq[i - 1])
      svg += `<line x1="${sx(seq[i - 1].x)}" y1="${sy(seq[i - 1].y)}" x2="${sx(seq[i].x)}" y2="${sy(seq[i].y)}"
               stroke="${i === step ? '#f59e0b' : '#a5b4fc'}" stroke-width="${i === step ? 2.5 : 1.5}" stroke-dasharray="${i === step ? '' : '4 3'}"/>`;
  for (let i = 1; i <= step; i++)
    if (seq[i]) {
      const cur = i === step;
      svg += `<circle cx="${sx(seq[i].x)}" cy="${sy(seq[i].y)}" r="${cur ? 9 : 6}" fill="${cur ? '#f59e0b' : '#6366f1'}"/>`;
      if (i < 9)                                         // after 9 steps the walk repeats: label the first lap only
        svg += `<text x="${sx(seq[i].x) + 11}" y="${sy(seq[i].y) - 9}" font-size="12" font-weight="600" fill="#334155">${i === 1 ? 'G' : i + 'G'}</text>`;
    }
  $('plot').innerHTML = svg;

  let info;
  if (step === 0) info = `Press Play to compute ${k}G one addition at a time.`;
  else if (step === 1) info = `<b>Step 1</b><br>Start from G = ${fmt(G17)}`;
  else {
    const s = addStep(seq[step - 1], G17, P17);
    info = `<b>Step ${step}</b>: ${step}G = ${step - 1}G + G = ${fmt(seq[step - 1])} + ${fmt(G17)}<br>` +
      (s.lambda === undefined
        ? (s.kind === 'inverse' ? 'Same x, opposite y: the two points cancel.<br><b>Result: O</b> (point at infinity)' : `O is the neutral element.<br><b>Result: ${fmt(s.point)}</b>`)
        : `λ = ${s.num}/${s.den} = ${s.num}·${inv(s.den, P17)} mod 17 = ${s.lambda}<br>` +
          `x = λ² − x₁ − x₂ = ${s.point.x}<br>y = λ(x₁ − x) − y₁ = ${s.point.y}<br><b>Result: ${fmt(s.point)}</b>`);
    if (step === k) info += `<br><span class="text-indigo-600 font-semibold">Toy public key Q = ${fmt(seq[k])}</span>`;
  }
  $('vizInfo').innerHTML = info;
  return k;
}

function stopViz() { clearInterval(timer); timer = null; $('play').textContent = '▶ Play'; }
function resetViz() { stopViz(); step = 0; drawViz(); }
function nextStep() { const k = drawViz(); if (step < k) { step++; drawViz(); } if (step >= k) stopViz(); }

$('play').onclick = () => {
  if (timer) return stopViz();
  if (step >= drawViz()) step = 0;
  $('play').textContent = '❚❚ Pause';
  nextStep();
  timer = setInterval(nextStep, 1500);                   // slow on purpose
};
$('next').onclick = () => { stopViz(); nextStep(); };
$('reset').onclick = resetViz;
$('run').onclick = compute;
$('k').onchange = compute;

// ---------- 4. statistical exploration ----------

const BASES = {
  8191: [{ x: 1, y: 256 }, { x: 2302, y: 3970 }, { x: 3004, y: 7114 }],
  17: curvePoints(17),
};

function fillBases() {
  const p = Number($('curve').value);
  $('base').innerHTML = BASES[p].map((P, i) =>
    `<option value="${i}">${fmt(P)} — order ${multiples(P, p).length}</option>`).join('');
}

function runStats() {
  const p = Number($('curve').value), G = BASES[p][Number($('base').value)];
  const r = analyse(p, G), small = p === 17, N = r.n - 1;

  $('tiles').innerHTML = [
    [r.n, 'order n of G'], [N, 'private keys tested'], [r.distinctPoints, 'distinct public keys'],
    [`${r.distinctX} / ${r.distinctY}`, 'distinct x / distinct y values'],
    [r.meanX.toFixed(1), `mean of x (uniform: ${((p - 1) / 2).toFixed(1)})`],
    [r.meanY.toFixed(1), `mean of y (uniform: ${((p - 1) / 2).toFixed(1)})`],
    [r.bits, 'bits per coordinate'], [pct(r.avalanche), 'avalanche (bits changed)'],
  ].map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join('');

  $('smallWarn').classList.toggle('hidden', !small);
  $('smallWarn').innerHTML = `<b>Toy curve.</b> With only ${N} outputs the numbers below describe the data but no
    statistical test is meaningful. They are useful to <i>see</i> the structure: use the large curve to <i>measure</i>.`;

  // 4.1 histograms: one bar per value on the toy curve, 10 bins on the large one
  const m = small ? 17 : 10;
  const labels = Array.from({ length: m }, (_, i) => small ? i : i + 1);
  bars($('histX'), histogram(r.xs, p, m).counts, labels);
  bars($('histY'), histogram(r.ys, p, m).counts, labels);

  // 4.2 frequencies
  $('freq').innerHTML = `<tr><th></th><th>k → kG</th><th>random function (simulated, same size)</th><th>theory for a random function</th></tr>
    <tr><td>Outputs never produced</td><td><b>0%</b></td><td>${pct(r.randomMissing)}</td><td>1/e ≈ 36.8%</td></tr>
    <tr><td>Outputs produced twice or more</td><td><b>0%</b></td><td>${pct(r.randomRepeated)}</td><td>1 − 2/e ≈ 26.4%</td></tr>
    <tr><td>Times each point appears</td><td><b>exactly 1</b> (${r.distinctPoints} distinct points from ${N} keys)</td><td>0, 1, 2, 3, …</td><td>≈ Poisson(1)</td></tr>`;

  // 4.3 bits
  const bl = Array.from({ length: r.bits }, (_, i) => i);
  bars($('bitX'), r.bitX, bl, 1, 0.5);
  bars($('bitY'), r.bitY, bl, 1, 0.5);
  $('bitText').innerHTML = small
    ? `On the toy curve the bits are clearly unbalanced, and the highest bit is almost always 0. This is an artefact
       of the <b>representation</b>, not of the curve: 5 bits can write 0…31 but the coordinates stop at 16, so the top
       bit is 1 only for the value 16.`
    : `Every bit is 1 about half of the time (dashed line = 0.5). Monobit test on all the bits of x:
       <b>z = ${r.monobitZ.toFixed(2)}</b>; since |z| &lt; 1.96 there is no evidence of bias. The bits of y are balanced
       <i>exactly</i>, which looks too good to be random, and it is: the points come in pairs (x, y) and (x, p − y), and
       with p = 2¹³ − 1 the number p − y is the bitwise complement of y. A perfect statistic produced by structure, not
       by randomness.`;

  // 4.4 chi-square
  const verdict = v => v > 16.92 ? '<span class="text-rose-600">rejected</span>' : '<span class="text-emerald-600">not rejected</span>';
  $('chi').innerHTML = `<tr><th>Coordinate</th><th>χ² (sample of 1000 keys)</th><th>Threshold (5%, 9 d.o.f.)</th><th>Uniformity</th></tr>` +
    (small
      ? `<tr><td colspan="4" class="text-slate-500">Not applicable on the toy curve: there are only ${N} different outputs, so any sample fails the test.</td></tr>`
      : `<tr><td>x</td><td><b>${r.chiX.toFixed(2)}</b></td><td>16.92</td><td>${verdict(r.chiX)}</td></tr>
         <tr><td>y</td><td><b>${r.chiY.toFixed(2)}</b></td><td>16.92</td><td>${verdict(r.chiY)}</td></tr>`);

  // 4.5 correlation
  $('corr').innerHTML = `<tr><th>Pair</th><th>Pearson r</th></tr>
    <tr><td>k and x(kG)</td><td><b>${r.rKX.toFixed(4)}</b></td></tr>
    <tr><td>k and y(kG)</td><td><b>${r.rKY.toFixed(4)}</b></td></tr>
    <tr><td>x(kG) and x((k+1)G) (serial)</td><td><b>${r.serialX.toFixed(4)}</b></td></tr>
    <tr><td>Keys with x(kG) = x((n−k)G)</td><td><b>${r.mirror} of ${N}</b> (mirror symmetry)</td></tr>`;
  const c = $('scatter'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#6366f1';
  const dot = small ? 4 : 1.5;
  r.ks.forEach((k, i) => ctx.fillRect(k / r.n * c.width - dot / 2, c.height - r.xs[i] / p * c.height - dot / 2, dot, dot));
  ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(c.width / 2, 0); ctx.lineTo(c.width / 2, c.height); ctx.stroke();

  // 4.6 avalanche
  $('aval').innerHTML = `<tr><th>Comparison</th><th>Mean fraction of output bits changed</th></tr>
    <tr><td>k and k with one bit flipped</td><td><b>${pct(r.avalanche)}</b></td></tr>
    <tr><td>k and k + 1</td><td><b>${pct(r.avalancheNext)}</b></td></tr>
    <tr><td>Ideal hash function</td><td>50%</td></tr>`;
  bars($('avalBars'), r.avalanchePerBit, Array.from({ length: r.kbits }, (_, i) => i), 1, 0.5);
}

// 4.7 orders of the points of the toy curve
(function ordersTable() {
  const byOrder = {};
  for (const P of BASES[17]) (byOrder[multiples(P, 17).length] ||= []).push(fmt(P));
  $('orders').innerHTML = '<tr><th>Order of the base point</th><th>Points with that order</th><th>Distinct public keys</th></tr>' +
    Object.entries(byOrder).map(([o, pts]) => `<tr><td>${o}</td><td>${pts.join(' ')}</td><td>${o - 1}</td></tr>`).join('');
})();

$('curve').onchange = () => { fillBases(); runStats(); };
$('base').onchange = runStats;
$('runStats').onclick = runStats;

compute();
computeBig();
fillBases();
runStats();
