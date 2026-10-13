// Page logic for Homework 2: the live wallet pipeline and three statistical experiments.
// The cryptographic primitives (PBKDF2, HMAC-SHA512, secp256k1, Keccak-256) come from ethers.js v6.

const TEST_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const hex = h => h.replace(/^0x/, '');

// ---------- 1. the pipeline ----------

function stage(name, value, arrow) {
  return `<div class="stage"><p class="name">${name}</p><p class="val">${value}</p></div>` +
         (arrow ? `<p class="arrow">↓ ${arrow}</p>` : '');
}

function derive() {
  const err = $('err');
  err.classList.add('hidden');
  try {
    const phrase = $('phrase').value.trim().toLowerCase().split(/\s+/).join(' ');
    const mnemonic = ethers.Mnemonic.fromPhrase(phrase, $('pass').value);    // checks words and checksum
    const seed = mnemonic.computeSeed();                                     // BIP-39: PBKDF2-HMAC-SHA512
    const master = ethers.HDNodeWallet.fromSeed(seed);                       // BIP-32: HMAC-SHA512("Bitcoin seed", seed)
    const node = master.derivePath($('path').value.trim());                  // BIP-32 along the BIP-44 path
    const pub = hex(ethers.SigningKey.computePublicKey(node.privateKey, false)).slice(2); // secp256k1, without the 04 prefix
    const digest = hex(ethers.keccak256('0x' + pub));                        // Keccak-256 of the 64 bytes x || y
    const raw = digest.slice(-40);                                           // last 20 bytes
    const checksummed = ethers.getAddress('0x' + raw);                       // EIP-55

    const bits = hex(mnemonic.entropy).length * 4;
    const upper = [...checksummed.slice(2)].map(c => /[A-F]/.test(c) ? `<b class="text-indigo-600">${c}</b>` : c).join('');
    $('stages').innerHTML =
      stage(`Entropy · ${bits} bits`, hex(mnemonic.entropy), 'BIP-39: add checksum, split in 11-bit groups, look up the words') +
      stage(`Mnemonic · ${phrase.split(' ').length} words`, phrase, 'BIP-39: PBKDF2-HMAC-SHA512, 2048 iterations, salt = "mnemonic" + passphrase') +
      stage('Seed · 512 bits', hex(seed), 'BIP-32: HMAC-SHA512 with key "Bitcoin seed"') +
      stage('Master private key · 256 bits  |  chain code · 256 bits', `${hex(master.privateKey)}<br>${hex(master.chainCode)}`,
            `BIP-32 / BIP-44: one HMAC-SHA512 per level of ${$('path').value.trim()}`) +
      stage('Private key · 256 bits', hex(node.privateKey), 'secp256k1: Q = k·G') +
      stage('Public key (x ‖ y) · 512 bits', `${pub.slice(0, 64)}<br>${pub.slice(64)}`, 'Keccak-256') +
      stage('Keccak-256 digest · 256 bits', `<span class="text-slate-400">${digest.slice(0, 24)}</span><b>${raw}</b>`, 'keep the last 20 bytes') +
      stage('Ethereum address · 160 bits', '0x' + raw, 'EIP-55: upper-case the letters selected by Keccak-256(address)') +
      stage('Checksummed address (EIP-55)', '0x' + upper);
  } catch (e) {
    err.textContent = 'Cannot derive: ' + (e.shortMessage || e.message) + '.';
    err.classList.remove('hidden');
  }
}

$('derive').onclick = derive;
$('testvec').onclick = () => { $('phrase').value = TEST_PHRASE; $('pass').value = ''; derive(); };
$('random').onclick = () => { $('phrase').value = ethers.Mnemonic.fromEntropy(ethers.randomBytes(16)).phrase; derive(); };

// ---------- 5. experiments ----------

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const variance = a => { const m = mean(a); return mean(a.map(v => (v - m) ** 2)); };
const popcount = n => { let c = 0; for (; n; n >>= 1n) c += Number(n & 1n); return c; };

// Shows "Running…" on the button, then runs `fn` so the page can repaint first.
function runLater(btn, fn) {
  const label = btn.textContent;
  btn.textContent = 'Running…'; btn.disabled = true;
  setTimeout(() => { fn(); btn.textContent = label; btn.disabled = false; }, 30);
}

// A. avalanche of Keccak-256: flip one input bit, count the output bits that change
function experimentA() {
  const T = 2000, dist = [];
  for (let t = 0; t < T; t++) {
    const input = ethers.randomBytes(64);
    const h1 = BigInt(ethers.keccak256(input));
    const bit = Math.floor(Math.random() * 512);
    input[bit >> 3] ^= 1 << (bit & 7);
    dist.push(popcount(h1 ^ BigInt(ethers.keccak256(input))));
  }
  const m = mean(dist), sd = Math.sqrt(variance(dist));
  $('tblA').innerHTML = `<tr><th></th><th>Measured</th><th>Theory: Binomial(256, ½)</th></tr>
    <tr><td>Mean bits changed</td><td><b>${m.toFixed(2)}</b> (${pct(m / 256)})</td><td>128 (50%)</td></tr>
    <tr><td>Standard deviation</td><td><b>${sd.toFixed(2)}</b></td><td>8</td></tr>
    <tr><td>Minimum – maximum</td><td>${Math.min(...dist)} – ${Math.max(...dist)}</td><td>almost always within 128 ± 24</td></tr>`;
  const counts = Array(14).fill(0);                                           // bins of width 4 from 100 to 156
  for (const d of dist) counts[Math.min(13, Math.max(0, Math.floor((d - 100) / 4)))]++;
  bars($('histA'), counts, counts.map((_, i) => 100 + 4 * i));
}

// B. uniformity of addresses and of the EIP-55 capitalisation
function experimentB() {
  const N = 1000, digits = Array(16).fill(0), letters = [];
  let upper = 0;
  for (let i = 0; i < N; i++) {
    const addr = ethers.computeAddress(new ethers.SigningKey(ethers.randomBytes(32))).slice(2);
    let l = 0;
    for (const c of addr) {
      digits[parseInt(c, 16)]++;
      if (/[a-f]/i.test(c)) { l++; if (c !== c.toLowerCase()) upper++; }
    }
    letters.push(l);
  }
  const expected = N * 40 / 16;
  const chi = digits.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
  const L = letters.reduce((s, v) => s + v, 0), f = upper / L, half = 1.96 * Math.sqrt(f * (1 - f) / L);
  $('tblB').innerHTML = `<tr><th></th><th>Measured</th><th>Theory</th></tr>
    <tr><td>χ² of the 16 hex digits</td><td><b>${chi.toFixed(2)}</b> → ${chi > 25 ? 'uniformity rejected' : 'uniformity not rejected'}</td><td>&lt; 25.0 in 95% of the runs</td></tr>
    <tr><td>Letters per address, mean</td><td><b>${mean(letters).toFixed(2)}</b></td><td>40 · 3/8 = 15</td></tr>
    <tr><td>Letters per address, variance</td><td><b>${variance(letters).toFixed(2)}</b></td><td>40 · 3/8 · 5/8 = 9.38</td></tr>
    <tr><td>Upper-case letters (95% interval)</td><td><b>${f.toFixed(3)} ± ${half.toFixed(3)}</b></td><td>0.5</td></tr>`;
  bars($('histB'), digits, '0123456789abcdef'.split(''), expected * 1.2, expected);
}

// C. acceptance rate of the BIP-39 and EIP-55 checksums
function experimentC() {
  let words = $('phrase').value.trim().toLowerCase().split(/\s+/);
  if (!ethers.Mnemonic.isValidMnemonic(words.join(' '))) words = TEST_PHRASE.split(' ');
  let valid = 0;
  for (let i = 0; i < 2048; i++)
    if (ethers.Mnemonic.isValidMnemonic([...words.slice(0, -1), ethers.wordlists.en.getWord(i)].join(' '))) valid++;
  const bip = 2 ** -(words.length / 3);                                       // checksum bits = words / 3

  const N = 100000;
  let pass = 0;
  for (let i = 0; i < N; i++) {
    const lower = ethers.hexlify(ethers.randomBytes(20));
    let spelled = '0x';
    for (const c of lower.slice(2)) spelled += Math.random() < 0.5 ? c.toUpperCase() : c;
    if (spelled === ethers.getAddress(lower)) pass++;                          // strict comparison with the right spelling
  }
  $('tblC').innerHTML = `<tr><th>Checksum</th><th>Trials</th><th>Accepted</th><th>Measured rate</th><th>Theory</th></tr>
    <tr><td>BIP-39, every possible last word (${words.length}-word phrase)</td><td>2048</td><td><b>${valid}</b></td><td><b>${pct(valid / 2048, 2)}</b></td><td>${pct(bip, 2)} (1 in ${1 / bip})</td></tr>
    <tr><td>EIP-55, random capitalisation</td><td>${N.toLocaleString('en')}</td><td><b>${pass}</b></td><td><b>${pct(pass / N, 4)}</b></td><td>${pct((13 / 16) ** 40, 4)} (≈ ${Math.round(N * (13 / 16) ** 40)} expected, ± 5)</td></tr>`;
}

$('runA').onclick = e => runLater(e.target, experimentA);
$('runB').onclick = e => runLater(e.target, experimentB);
$('runC').onclick = e => runLater(e.target, experimentC);

derive();
experimentA();
experimentB();
