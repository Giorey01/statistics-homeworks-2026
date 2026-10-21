// Page logic for Homework 3: encryption with the curve and with Caesar, and how both are broken.
// The curve arithmetic is in ecc.js, the small helpers in ui.js.

const row = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
const head = cells => `<tr>${cells.map(c => `<th>${c}</th>`).join('')}</tr>`;

// ---------- 1a. textbook ElGamal on the toy curve y^2 = x^3 + 7 (mod 17) ----------

const P17 = 17, G17 = { x: 1, y: 5 };
const MULT = multiples(G17, P17);                   // [O, G, 2G, ..., 8G]: G has order 9
const fmt = P => P ? `(${P.x}, ${P.y})` : 'O';
// searches P in MULT and gives out nG ==> solves ECDLP
const nameOf = P => P ? `${MULT.findIndex(M => M && M.x === P.x && M.y === P.y)}G` : 'O';
const pt = P => P ? `${fmt(P)} = ${nameOf(P)}` : 'O';
const neg = P => P && { x: P.x, y: mod(-P.y, P17) };

// Alice encrypts the point M = mG for Bob (public key Q = kG) with the one-time r; Bob decrypts.
function elgamalToy(k, m, r) {
  const Q = scalarMult(k, G17, P17)
  const M = MULT[m];
  const C1 = scalarMult(r, G17, P17)
  const S = scalarMult(r, Q, P17)
  const C2 = add(M, S, P17);
  const Sb = scalarMult(k, C1, P17);
  return { Q, M, C1, S, C2, Sb, back: add(C2, neg(Sb), P17) };
}

function runToy() {
  const read = id => Math.min(8, Math.max(1, Math.floor(Number($(id).value)) || 1));
  const k = read('toyK'), m = read('toyM'), r = read('toyR');
  const e = elgamalToy(k, m, r);

  $('toySteps').innerHTML = head(['who', 'step', 'value']) + [
    ['Bob', 'private key k', k],
    ['Bob', 'public key Q = kG', pt(e.Q)],
    ['Alice', 'message M = mG', pt(e.M)],
    ['Alice', 'one-time secret r', r],
    ['Alice', 'C1 = rG <span class="tag">sent</span>', pt(e.C1)],
    ['Alice', 'S = rQ <span class="tag-secret">never sent</span>', pt(e.S)],
    ['Alice', 'C2 = M + S <span class="tag">sent</span>', pt(e.C2)],
    ['Bob', 'S = kC1', pt(e.Sb) + (nameOf(e.Sb) === nameOf(e.S) ? ' ✓ same as Alice' : '')],
    ['Bob', '−S', pt(neg(e.Sb))],
    ['Bob', 'M = C2 + (−S)', pt(e.back) + (nameOf(e.back) === nameOf(e.M) ? ' ✓' : '')],
  ].map(row).join('');

  // the same k and M with every possible r
  const all = [1, 2, 3, 4, 5, 6, 7, 8].map(r => ({ r, ...elgamalToy(k, m, r) }));
  $('toyAllR').innerHTML = head(['r', 'C1 = rG', 'S = rQ', 'C2 = M + S']) + all.map(e =>
    `<tr class="${e.S === null ? 'bg-rose-50' : e.r === r ? 'bg-indigo-50' : ''}">` +
    `<td>${e.r}</td><td>${pt(e.C1)}</td><td>${pt(e.S)}</td><td>${pt(e.C2)}${e.S === null ? ' = M, in clear!' : ''}</td></tr>`).join('');

  const clear = all.filter(e => e.S === null).map(e => e.r);
  const masks = new Set(all.map(e => nameOf(e.S))).size;
  $('toyNote').innerHTML = (clear.length
    ? `<b>With r = ${clear.join(', ')} the mask S is O</b>, so C2 = M and the message travels in clear. It happens because
       r·k (here ${clear.map(r => r * k).join(', ')}) is a multiple of 9, the order of G, and 9 = 3·3 is not prime. On secp256k1 the
       order n is prime, so r·k can never be a multiple of n. `
    : `With k = ${k} no r gives the mask O: k has no factor in common with 9, the order of G. `) +
    `The 8 values of r give only <b>${masks} different masks</b>: the toy curve has 9 points, so it can explain the
     algorithm but not protect anything.`;
}

$('toyMult').innerHTML = head(['k', ...MULT.map((_, i) => i + 1)]) +
  row(['kG', ...[...MULT.slice(1), null].map(fmt)]);
['toyK', 'toyM', 'toyR'].forEach(id => $(id).oninput = runToy);
runToy();

// ---------- 1b. the same idea on the real secp256k1, with a private key of at most 20 bits ----------

const KEY_MAX = 2 ** 20;

// Random key in [1, 2^20]. 2^32 is a multiple of 2^20, so the remainder has no bias.
const randomSmallKey = () => BigInt(crypto.getRandomValues(new Uint32Array(1))[0] % KEY_MAX + 1);

const toBytes = s => [...new TextEncoder().encode(s)];
const toText = b => new TextDecoder().decode(new Uint8Array(b));
const toHex = b => b.map(v => v.toString(16).padStart(2, '0')).join(' ');
const xBytes = P => hex(P.x).match(/../g).map(h => parseInt(h, 16));      // the 32 bytes of P.x

// Alice: S = rQ, and its x-coordinate masks the message byte by byte (XOR). Only R = rG and c are sent.
function eccEncrypt(message, Q, r = randomSmallKey()) {
  const m = toBytes(message), S = mulBig(r, Q), s = xBytes(S);
  return { m, r, R: mulBig(r), S, s, c: m.map((b, i) => b ^ s[i]) };
}

// Bob: kR is the same point S, so the same XOR removes the mask.
function eccDecrypt(R, c, k) {
  const s = xBytes(mulBig(k, R));
  return toText(c.map((b, i) => b ^ s[i]));
}

let bob, last;

function newBobKey() {
  const k = randomSmallKey();
  bob = { k, Q: mulBig(k) };
  last = null;
  runEcc();
}

function runEcc() {
  const text = $('eccText').value, n = toBytes(text).length;
  if (n > 32) {
    $('eccSteps').innerHTML = row([`<span class="text-rose-600">The message is ${n} bytes long: at most 32 fit in the mask S.x.</span>`]);
    return;
  }
  const e = eccEncrypt(text, bob.Q), Sb = mulBig(bob.k, e.R);
  const same = Sb.x === e.S.x && Sb.y === e.S.y;

  $('eccSteps').innerHTML = head(['who', 'step', 'value']) + [
    ['Bob', 'private key k (1 ≤ k ≤ 2<sup>20</sup>) <span class="tag-secret">secret</span>', bob.k],
    ['Bob', 'public key Q = kG <span class="tag-public">public</span>', fmtBig(bob.Q)],
    ['Alice', 'one-time r <span class="tag-secret">discarded</span>', e.r],
    ['Alice', 'R = rG <span class="tag">sent</span>', fmtBig(e.R)],
    ['Alice', 'S = rQ <span class="tag-secret">never sent</span>', fmtBig(e.S)],
    ['Alice', `mask = first ${n} bytes of S.x`, toHex(e.s.slice(0, n))],
    ['Alice', 'message bytes m', toHex(e.m)],
    ['Alice', 'ciphertext c = m ⊕ mask <span class="tag">sent</span>', toHex(e.c)],
    ['Bob', 'S = kR', fmtBig(Sb) + (same ? ' ✓ same as Alice' : '')],
    ['Bob', 'c ⊕ mask', eccDecrypt(e.R, e.c, bob.k)],
  ].map(row).join('');

  $('eccNote').innerHTML = last && last.text === text
    ? `<b>Same message, same key, different ciphertext.</b> Before, with r = ${last.r}, it was
       <span class="mono">${toHex(last.c)}</span>. Each encryption uses a new r, so it is <b>probabilistic</b>: an
       eavesdropper cannot tell that the same message was sent twice, and cannot encrypt guesses with Q and compare.
       Caesar, instead, always gives the same ciphertext.`
    : 'Press <b>Encrypt again</b>: a new r gives a completely different ciphertext for the same message.';
  last = { text, r: e.r, R: e.R, c: e.c };
}

$('eccEnc').onclick = runEcc;
$('eccText').oninput = runEcc;
$('eccKey').onclick = newBobKey;
newBobKey();

// ---------- 2. Caesar cipher ----------

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function caesarEncrypt(text, k) {
  return text.toUpperCase().replace(/[A-Z]/g, ch => ALPHA[mod(ALPHA.indexOf(ch) + k, ALPHA.length)]);
}

const caesarDecrypt = (text, k) => caesarEncrypt(text, mod(-k, ALPHA.length));

// One button: Encrypt turns the message into the result, Decrypt turns the result back.
let encrypted = false;

function toggleCaesar() {
  const k = Number($('caesarKey').value);
  $('caesarOut').textContent = encrypted
    ? caesarDecrypt($('caesarOut').textContent, k)
    : caesarEncrypt($('caesarText').value, k);
  encrypted = !encrypted;
  $('caesarEncDec').textContent = encrypted ? 'Decrypt' : 'Encrypt';
  $('caesarText').disabled = encrypted ? true : false;
  $('caesarKey').disabled = encrypted ? true : false;
  $('caesarEncDec').className = encrypted ? 'btn-2' : 'btn';
}

$('caesarEncDec').onclick = toggleCaesar;
toggleCaesar();

// ---------- 3. what the two ciphertexts reveal ----------

const CHI_15 = 25.00;                               // chi-square threshold, 5%, 15 degrees of freedom

function letterCounts(text) {
  const counts = Array(26).fill(0);
  for (const ch of text.toUpperCase()) {
    const i = ALPHA.indexOf(ch);
    if (i !== -1) counts[i]++;
  }
  return counts;
}

const total = a => a.reduce((s, v) => s + v, 0);
const freqs = counts => counts.map(v => v / total(counts));

// Index of coincidence: the probability that two letters picked at random from the text are equal.
const coincidence = counts => total(counts.map(v => v * (v - 1))) / (total(counts) * (total(counts) - 1));

// The mask S.x has 32 bytes, so a longer text is encrypted in blocks of 32 bytes, each with a new r.
function eccEncryptLong(text, Q) {
  const m = toBytes(text), c = [];
  for (let i = 0; i < m.length; i += 32) {
    const s = xBytes(mulBig(randomSmallKey(), Q));
    m.slice(i, i + 32).forEach((b, j) => c.push(b ^ s[j]));
  }
  return { m, c };
}

function runCompare() {
  const text = $('statText').value, k = mod(Math.floor(Number($('caesarKey').value)) || 0, 26);
  const plainTextLetterCount = letterCounts(text), caesar = caesarEncrypt(text, k);
  if (total(plainTextLetterCount) < 2) {
    $('caesarStatNote').textContent = 'The text needs at least two letters.';
    return;
  }

  // Caesar: the same histogram, shifted by k positions (cyclically: past Z it starts again from A)
  const fp = freqs(plainTextLetterCount), fc = freqs(letterCounts(caesar)), max = Math.max(...fp, ...fc) * 1.1;
  bars($('histPlain'), fp, [...ALPHA], max, 1 / 26);
  bars($('histCaesar'), fc, [...ALPHA], max, 1 / 26);
  $('histCaesarTitle').textContent = `Caesar ciphertext (k = ${k})`;

  const top = fp.indexOf(Math.max(...fp)), ic = coincidence(plainTextLetterCount);
  $('caesarStatNote').innerHTML =
    `The most frequent letter of the message is <b>${ALPHA[top]}</b> (${pct(fp[top])}); in the ciphertext the same
     peak is on <b>${ALPHA[mod(top + k, 26)]}</b> = ${ALPHA[top]} + ${k}. Caesar does not change the shape of the
     histogram, it only shifts it by k positions, cyclically.<br> The <b><a class="text-indigo-600 underline" href="https://pages.mtu.edu/~shene/NSF-4/Tutorial/VIG/Vig-IOC.html">index of coincidence</a></b> (the probability that two random letters are
     equal) is ${ic.toFixed(4)} for the message and ${coincidence(letterCounts(caesar)).toFixed(4)} for the
     ciphertext: identical, and close to English (≈ 0.066) rather than to random letters (1/26 ≈ 0.038).`;

  // ECC: the ciphertext bytes are spread over all 256 values
  const { m, c } = eccEncryptLong(text, bob.Q);
  const classes = Array.from({ length: 16 }, (_, i) => i * 16);
  const hm = freqs(histogram(m, 256, 16).counts), hc = freqs(histogram(c, 256, 16).counts);
  const maxB = Math.max(...hm, ...hc) * 1.1;
  bars($('histBytesPlain'), hm, classes, maxB, 1 / 16);
  bars($('histBytesEcc'), hc, classes, maxB, 1 / 16);

  const verdict = v => v > CHI_15 ? '<span class="text-rose-600">rejected</span>' : '<span class="text-emerald-600">not rejected</span>';
  const chi = [['message', m], ['Caesar ciphertext', toBytes(caesar)], ['ECC ciphertext', c]]
    .map(([name, bytes]) => [name, chiSquare(bytes, 256, 16)]);
  $('statChi').innerHTML = head(['bytes of', 'χ² (16 classes)', 'threshold (5%, 15 d.o.f.)', 'uniformity']) +
    chi.map(([name, v]) => row([name, `<b>${v.toFixed(1)}</b>`, CHI_15.toFixed(2), verdict(v)])).join('');

  $('eccStatNote').innerHTML =
    `${m.length} bytes, encrypted in ${Math.ceil(m.length / 32)} blocks. The bytes of an English text all fall in a
     few classes (letters are 65–90 and 97–122, the space is 32), and Caesar keeps them there. After the XOR with S.x
     they are spread over all 256 values and the χ² test finds no difference from uniform bytes: an eavesdropper
     learns nothing from the frequencies. It works because every byte is XORed with a different mask byte that looks
     random, and anything XORed with an independent uniform byte is uniform (the idea of the one-time pad).`;
}

$('statRun').onclick = runCompare;
$('caesarKey').addEventListener('input', runCompare);
runCompare();

// ---------- 4. statistical attack on Caesar ----------

// The corpus is split in two: the first half estimates the frequencies, the second half gives the texts to attack.
const lettersOnly = s => s.toUpperCase().replace(/[^A-Z]/g, '');
const TRAIN = lettersOnly(CORPUS.slice(0, CORPUS.length / 2));
const TEST = lettersOnly(CORPUS.slice(CORPUS.length / 2));
const E = 4;                                         // position of the letter E in the alphabet

// Frequency of each letter. +1 on every count (Laplace smoothing), so that no frequency is 0 and χ² never divides by 0.
function letterFrequencies(letters) {
  const counts = letterCounts(letters), f = [];
  for (let i = 0; i < 26; i++) f.push((counts[i] + 1) / (letters.length + 26));
  return f;
}

// Log-probability of each of the 26·26 = 676 pairs of letters; the pair (a, b) is stored at index a·26 + b.
function bigramLogProbs(letters) {
  const counts = Array(676).fill(1);                 // +1 again (smoothing)
  for (let i = 0; i + 1 < letters.length; i++)
    counts[(letters.charCodeAt(i) - 65) * 26 + letters.charCodeAt(i + 1) - 65]++;
  const sum = letters.length - 1 + 676, logp = [];
  for (let i = 0; i < 676; i++) logp.push(Math.log(counts[i] / sum));
  return logp;
}

const FREQ = letterFrequencies(TRAIN), BIGRAMS = bigramLogProbs(TRAIN);

// χ² between the letter counts of a text and English: smaller = more English-like.
function chiEnglish(text) {
  const counts = letterCounts(text), n = total(counts);
  let chi = 0;
  for (let i = 0; i < 26; i++) {
    const expected = n * FREQ[i];
    chi += (counts[i] - expected) ** 2 / expected;
  }
  return chi;
}

// Sum of the log-probabilities of the consecutive pairs (log of a product of probabilities): larger = more English-like.
function bigramScore(text) {
  const s = lettersOnly(text);
  let score = 0;
  for (let i = 0; i + 1 < s.length; i++) score += BIGRAMS[(s.charCodeAt(i) - 65) * 26 + s.charCodeAt(i + 1) - 65];
  return score;
}

// Three ways to pick the key: try the 26 keys and keep the best score, or assume the most frequent letter is E.
function keyByChi(cipher) {
  let bestK = 0, best = Infinity;
  for (let k = 0; k < 26; k++) {
    const chi = chiEnglish(caesarDecrypt(cipher, k));
    if (chi < best) { best = chi; bestK = k; }
  }
  return bestK;
}

function keyByBigrams(cipher) {
  let bestK = 0, best = -Infinity;
  for (let k = 0; k < 26; k++) {
    const score = bigramScore(caesarDecrypt(cipher, k));
    if (score > best) { best = score; bestK = k; }
  }
  return bestK;
}

function keyByTopLetter(cipher) {
  const counts = letterCounts(cipher);
  return mod(counts.indexOf(Math.max(...counts)) - E, 26);
}

$('corpusInfo').innerHTML = `For this example I took <b>Jane Austen, <i>Pride and Prejudice</i></b> (Project Gutenberg #1342): it has
  ${(TRAIN.length + TEST.length).toLocaleString('en')} letters. I use the first half (${TRAIN.length.toLocaleString('en')} letters)
  to estimate the frequencies, while the second half is used to provide the texts to attack, so the method is never tested on the text
  it learned from (training set and test set). The frequencies are an <i>estimate</i>: another book would give slightly
  different numbers.`;
bars($('histCorpus'), FREQ, [...ALPHA], undefined, 1 / 26);

function runBreak() {
  const cipher = $('breakText').value;
  if (lettersOnly(cipher).length === 0) return;
  const tries = [];
  for (let k = 0; k < 26; k++) {
    const text = caesarDecrypt(cipher, k);
    tries.push({ k, text, chi: chiEnglish(text), bigram: bigramScore(text) });
  }
  tries.sort((a, b) => a.chi - b.chi);               // smallest χ² first

  const kChi = tries[0].k, kBigram = keyByBigrams(cipher);
  let rows = head(['rank', 'k', 'decrypted', 'χ²', 'bigram score']);
  for (let i = 0; i < 6; i++) {
    const t = tries[i];
    rows += `<tr class="${i === 0 ? 'bg-indigo-50 font-semibold' : ''}"><td>${i + 1}</td><td>${t.k}</td><td>${t.text}</td>` +
            `<td>${t.chi.toFixed(1)}</td><td>${t.bigram.toFixed(1)}</td></tr>`;
  }
  $('breakTable').innerHTML = rows;
  $('breakNote').innerHTML = kChi === kBigram
    ? `χ² and bigrams agree: <b>k = ${kChi}</b>, message <b>${caesarDecrypt(cipher, kChi)}</b>.`
    : `χ² picks k = ${kChi}, bigrams pick <b>k = ${kBigram}</b>: <b>${caesarDecrypt(cipher, kBigram)}</b>. ` +
      (lettersOnly(cipher).length < 15
        ? `With so few letters the counts are dominated by chance: in HELLO WORLD the L appears 3 times in 10 letters,
           while English expects 0.4, and that letter alone adds (3 − 0.4)² / 0.4 ≈ 17 to the χ² of the right answer.
           Bigrams also look at the order (LL, LO, WO, OR are common pairs) and get it right.`
        : '');
}

$('breakRun').onclick = runBreak;
$('breakPart2').onclick = () => { $('breakText').value = caesarEncrypt($('caesarText').value, Number($('caesarKey').value)); runBreak(); };
$('breakHello').onclick = () => { $('breakText').value = 'KHOOR ZRUOG'; runBreak(); };
$('breakNeverGonnaGive').onclick = () => { $('breakText').value = caesarEncrypt('NEVER GONNA GIVE YOU UP! NEVER GONNA LET YOU DOWN!', 7); runBreak(); };
runBreak();

// Success rate of the three methods as a function of the length of the text.
const LENGTHS = [1, 2, 3, 5, 10, 15, 20, 30, 50, 100, 300, 1000];
const METHODS = [
  { name: 'χ²', color: '#6366f1', find: keyByChi },
  { name: 'bigrams', color: '#10b981', find: keyByBigrams },
  { name: 'most frequent = E', color: '#f59e0b', find: keyByTopLetter },
];

function successRates(L, trials) {
  const ok = [0, 0, 0];
  for (let t = 0; t < trials; t++) {
    const start = Math.floor(Math.random() * (TEST.length - L));
    const plain = TEST.slice(start, start + L);
    const cipher = caesarEncrypt(plain, Math.floor(Math.random() * 26));
    for (let m = 0; m < METHODS.length; m++)
      if (caesarDecrypt(cipher, METHODS[m].find(cipher)) === plain) ok[m]++;
  }
  return [ok[0] / trials, ok[1] / trials, ok[2] / trials];
}

// Line chart: length on a logarithmic x axis (1, 10, 100, 1000 equally spaced), success rate on the y axis.
function drawChart(results) {
  const X = L => 50 + 570 * Math.log10(L) / 3, Y = v => 260 - 240 * v;
  let svg = '';
  for (const v of [0, 0.25, 0.5, 0.75, 1])
    svg += `<line x1="50" x2="620" y1="${Y(v)}" y2="${Y(v)}" stroke="#f1f5f9"/>` +
           `<text x="42" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#94a3b8">${v * 100}%</text>`;
  for (const L of LENGTHS)
    svg += `<text x="${X(L)}" y="282" font-size="11" text-anchor="middle" fill="#94a3b8">${L}</text>`;
  svg += `<line x1="50" x2="620" y1="${Y(1 / 26)}" y2="${Y(1 / 26)}" stroke="#94a3b8" stroke-dasharray="4 3"/>` +
         `<text x="616" y="${Y(1 / 26) - 5}" font-size="11" text-anchor="end" fill="#94a3b8">guessing: 1/26</text>`;
  for (let m = 0; m < METHODS.length; m++) {
    let points = '';
    for (let i = 0; i < results.length; i++) points += `${X(LENGTHS[i])},${Y(results[i][m])} `;
    svg += `<polyline points="${points}" fill="none" stroke="${METHODS[m].color}" stroke-width="2.5"/>` +
           `<rect x="${70 + 150 * m}" y="14" width="12" height="12" rx="2" fill="${METHODS[m].color}"/>` +
           `<text x="${88 + 150 * m}" y="24" font-size="12" fill="#334155">${METHODS[m].name}</text>`;
  }
  $('expChart').innerHTML = svg;
}

// One length at a time, with a pause in between so the page can repaint.
async function runExperiment() {
  const trials = Number($('expTrials').value), results = [];
  const ci = p => `± ${(196 * Math.sqrt(p * (1 - p) / trials)).toFixed(1)}`;
  $('expRun').disabled = true;
  for (let i = 0; i < LENGTHS.length; i++) {
    $('expRun').textContent = `Running… L = ${LENGTHS[i]}`;
    await new Promise(resolve => setTimeout(resolve, 0));
    results.push(successRates(LENGTHS[i], trials));
    drawChart(results);
    let rows = head(['letters', ...METHODS.map(m => m.name)]);
    for (let j = 0; j < results.length; j++)
      rows += row([LENGTHS[j], ...results[j].map(p => `<b>${pct(p)}</b> <span class="text-slate-400">${ci(p)}</span>`)]);
    $('expTable').innerHTML = rows;
  }
  $('expRun').textContent = 'Run experiment';
  $('expRun').disabled = false;
}

$('expRun').onclick = runExperiment;
drawChart([]);

// ---------- 5. brute force on the small ECC key ----------

let attack = null, speed = null;                     // the running attack (so Stop can halt it), keys per second

// 6.55 × 10^4 written with a real exponent
const sci = (v, digits) => { const [m, e] = v.toExponential(digits).split('e+'); return `${m} × 10<sup>${e}</sup>`; };

// Seconds as a readable duration.
function duration(sec) {
  const YEAR = 365.25 * 86400;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 2 : 0)} s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} hours`;
  if (sec < YEAR) return `${(sec / 86400).toFixed(1)} days`;
  const years = sec / YEAR;
  if (years < 10) return `${years.toFixed(1)} years`;
  return years < 1e6 ? `${Math.round(years).toLocaleString('en')} years` : `${sci(years, 1)} years`;
}

function showScale() {
  let rows = head(['key bits', 'keys', 'time to try them all']);
  for (const bits of [16, 20, 32, 40, 64, 128, 256]) {
    const keys = 2 ** bits;
    rows += `<tr class="${bits === 20 ? 'bg-indigo-50' : ''}"><td>${bits}${bits === 20 ? ' (this toy)' : bits === 256 ? ' (secp256k1)' : ''}</td>` +
            `<td>2<sup>${bits}</sup> ≈ ${sci(keys, 2)}</td>` +
            `<td>${speed ? duration(keys / speed) : 'run the attack first'}</td></tr>`;
  }
  $('bfScale').innerHTML = rows + (speed
    ? `<tr><td colspan="3" class="text-slate-500">Measured speed: ${Math.round(speed).toLocaleString('en')} keys per second. Age of the universe ≈ 1.4 × 10<sup>10</sup> years.</td></tr>`
    : '');
}

async function bruteForce() {
  if (attack) return;
  const run = { stop: false };
  attack = run;
  const Q = bob.Q;
  const msg = last || eccEncrypt('WAKE UP!', Q);     // the ciphertext intercepted in Part 1b
  const seen = head(['', 'value']) +
    row(['public key Q', fmtBig(Q)]) + row(['intercepted R', fmtBig(msg.R)]) + row(['intercepted c', toHex(msg.c)]);
  $('bfOut').innerHTML = seen;

  const t0 = performance.now();
  let P = null, found = null, i = 1;
  for (; i <= KEY_MAX; i++) {
    P = addBig(P, SECP.G);                           // now P = i·G
    if (P.x === Q.x && P.y === Q.y) { found = i; break; }
    if (i % 4096 === 0) {                            // every 4096 keys: update the bar and let the page breathe
      $('bfBar').style.width = pct(i / KEY_MAX);
      $('bfOut').innerHTML = seen + row(['keys tried', `${i.toLocaleString('en')} of ${KEY_MAX.toLocaleString('en')}`]);
      await new Promise(resolve => setTimeout(resolve, 0));
      if (run.stop) break;
    }
  }
  const sec = (performance.now() - t0) / 1000;
  speed = Math.min(i, KEY_MAX) / sec;
  attack = null;
  $('bfBar').style.width = pct(found ? found / KEY_MAX : i / KEY_MAX);

  $('bfOut').innerHTML = seen + (found
    ? row(['private key k', `<b>${found}</b> ${BigInt(found) === bob.k ? '✓ Bob\'s key' : ''}`]) +
      row(['keys tried', `${found.toLocaleString('en')} in ${sec.toFixed(1)} s (${Math.round(speed).toLocaleString('en')} keys/s)`]) +
      row(['S = kR', fmtBig(mulBig(BigInt(found), msg.R))]) +
      row(['decrypted message', `<b>${eccDecrypt(msg.R, msg.c, BigInt(found))}</b>`])
    : row(['stopped', `after ${i.toLocaleString('en')} keys in ${sec.toFixed(1)} s`]));
  showScale();
}

$('bfRun').onclick = bruteForce;
$('bfStop').onclick = () => { if (attack) attack.stop = true; };
showScale();
