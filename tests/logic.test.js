/* Uji unit ringan untuk logika murni pada index.html (tanpa DOM). */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const assert = require('assert');

// Ambil isi script aplikasi (blok kedua)
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.strictEqual(blocks.length, 2, 'Harus ada 2 blok script inline');
const appSource = blocks[1][1];

// Ekstrak fungsi murni dengan cara mengevaluasi potongan tertentu.
// Strategi: cari blok "2. UTILITAS" s/d "5. RINGKASAN" dan evaluasi dengan stub.
function slice(startMarker, endMarker) {
  const s = appSource.indexOf(startMarker);
  const e = appSource.indexOf(endMarker);
  assert.ok(s > -1 && e > s, 'Marker tidak ditemukan: ' + startMarker);
  return appSource.slice(s, e);
}

const utilsSrc = slice('/* ==================== 2. UTILITAS', '/* ==================== 3. PENYIMPANAN');
const totalsSrc = slice('/* ==================== 5. RINGKASAN', '/* ==================== 6. VALIDASI');

const sandbox = {};
const fn = new Function(
  'MONTH_NAMES','MONTH_SHORT','DAY_NAMES',
  utilsSrc + '\n' + totalsSrc + '\n' +
  'return { rupiah, rupiahShort, toISODate, parseISO, formatDateLong, formatDateShort, monthKey, monthLabel, escapeHtml, humanBytes, clamp, dataUrlBytes, computeTotals, computeMonthTotals, shiftMonth };'
);

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const DAY_NAMES   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

const api = fn(MONTH_NAMES, MONTH_SHORT, DAY_NAMES);
let pass = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { console.log('  FAIL  ' + name); process.exitCode = 1; }
}

console.log('\n== 1. Format Rupiah ==');
ok('rupiah(1500000) -> "Rp 1.500.000"', api.rupiah(1500000) === 'Rp 1.500.000');
ok('rupiah(0) -> "Rp 0"', api.rupiah(0) === 'Rp 0');
ok('rupiah(-25000) -> "Rp -25.000"', api.rupiah(-25000) === 'Rp -25.000');
ok('rupiahShort(1250000) mengandung "jt"', /jt/.test(api.rupiahShort(1250000)));
ok('rupiahShort(2500) mengandung "rb"', /rb/.test(api.rupiahShort(2500)));
ok('rupiahShort(-2000000) diawali "-"', api.rupiahShort(-2000000).startsWith('-'));

console.log('\n== 2. Tanggal ==');
ok('toISODate(2026-10-05) format benar', api.toISODate(new Date(2026, 9, 5)) === '2026-10-05');
ok('parseISO("2026-10-05") -> tgl 5, bulan 9', (() => { const d = api.parseISO('2026-10-05'); return d.getDate() === 5 && d.getMonth() === 9 && d.getFullYear() === 2026; })());
ok('parseISO("") -> Invalid Date', isNaN(api.parseISO('').getTime()));
ok('monthKey("2026-10-05") === "2026-10"', api.monthKey('2026-10-05') === '2026-10');
ok('monthLabel("2026-10") === "Oktober 2026"', api.monthLabel('2026-10') === 'Oktober 2026');
ok('formatDateShort("2026-10-05") === "5 Okt 2026"', api.formatDateShort('2026-10-05') === '5 Okt 2026');
ok('formatDateLong("2026-10-05") diawali "Senin"', api.formatDateLong('2026-10-05').startsWith('Senin'));
ok('formatDateLong("") === "—"', api.formatDateLong('') === '—');

console.log('\n== 3. shiftMonth ==');
ok('shiftMonth("2026-10", -1) === "2026-09"', api.shiftMonth('2026-10', -1) === '2026-09');
ok('shiftMonth("2026-01", -1) === "2025-12"', api.shiftMonth('2026-01', -1) === '2025-12');
ok('shiftMonth("2026-12", 1) === "2027-01"', api.shiftMonth('2026-12', 1) === '2027-01');

console.log('\n== 4. escapeHtml & bytes ==');
ok('escapeHtml menetralkan tag', api.escapeHtml('<img onerror=x>') === '&lt;img onerror=x&gt;');
ok('escapeHtml menangani kutip', api.escapeHtml('a"b\'c') === 'a&quot;b&#39;c');
ok('humanBytes(2048) === "2 KB"', api.humanBytes(2048) === '2 KB');
ok('humanBytes(5*1024*1024) mengandung "MB"', /MB/.test(api.humanBytes(5 * 1024 * 1024)));
ok('dataUrlBytes("data:image/png;base64,AAAA") === 3', api.dataUrlBytes('data:image/png;base64,AAAA') === 3);
ok('dataUrlBytes(null) === 0', api.dataUrlBytes(null) === 0);

console.log('\n== 5. computeTotals ==');
const sample = [
  { jenis: 'pemasukan',   nominal: 5000000, tanggal: '2026-10-01', foto: 'data:image/png;base64,AAA' },
  { jenis: 'pengeluaran', nominal: 1500000, tanggal: '2026-10-03', foto: null },
  { jenis: 'pengeluaran', nominal: 250000,  tanggal: '2026-09-28', foto: 'data:image/png;base64,BBBB' },
  { jenis: 'pemasukan',   nominal: 1000000, tanggal: '2026-10-04', foto: null },
];
const t = api.computeTotals(sample);
ok('income === 6.000.000', t.income === 6000000);
ok('expense === 1.750.000', t.expense === 1750000);
ok('balance === 4.250.000', t.balance === 4250000);
ok('cIncome === 2', t.cIncome === 2);
ok('cExpense === 2', t.cExpense === 2);
ok('withPhoto === 2', t.withPhoto === 2);
ok('total === 4', t.total === 4);

console.log('\n== 6. computeMonthTotals ==');
const oct = api.computeMonthTotals(sample, '2026-10');
ok('Okt: income 6.000.000', oct.income === 6000000);
ok('Okt: expense 1.500.000', oct.expense === 1500000);
ok('Okt: balance 4.500.000', oct.balance === 4500000);
ok('Okt: label "Oktober 2026"', oct.label === 'Oktober 2026');
const sep = api.computeMonthTotals(sample, '2026-09');
ok('Sep: expense 250.000', sep.expense === 250000);
ok('Sep: balance -250.000', sep.balance === -250000);
const empty = api.computeMonthTotals(sample, '2020-01');
ok('Bulan kosong: total 0', empty.total === 0 && empty.balance === 0);

console.log('\n== 7. Auth: hash password (SHA-256 + salt) ==');
// Ekstrak helper hash memakai penanda khusus agar tetap sinkron dengan index.html.
const hashSrc = slice('// auth:hash:begin', '// auth:hash:end');
const authApi = new Function(hashSrc + '\nreturn AuthHash;')();

// Vektor uji resmi SHA-256 (FIPS 180-4).
ok('sha256("") sesuai vektor uji',
  authApi.sha256('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
ok('sha256("abc") sesuai vektor uji',
  authApi.sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
ok('sha256(64 char) sesuai vektor uji',
  authApi.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq') ===
  '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
ok('sha256 selalu hex 64 karakter', /^[0-9a-f]{64}$/.test(authApi.sha256('rahasia banget')));
ok('sha256 berbeda untuk input berbeda', authApi.sha256('a') !== authApi.sha256('b'));

ok('utf8Bytes ASCII = kode karakter', JSON.stringify(authApi.utf8Bytes('A')) === '[65]');
ok('utf8Bytes multi-byte (Jepang) = 3 byte', authApi.utf8Bytes('日').length === 3);
ok('utf8Bytes emoji (surrogate pair) = 4 byte', authApi.utf8Bytes('😀').length === 4);

const salt1 = authApi.makeSalt();
const salt2 = authApi.makeSalt();
ok('makeSalt 32 hex (16 byte)', /^[0-9a-f]{32}$/.test(salt1));
ok('makeSalt unik antar pemanggilan', salt1 !== salt2);
ok('makeSalt menghormati panjang byte', authApi.makeSalt(8).length === 16);

const iterations = 128; // iterasi kecil agar unit test tetap cepat
const h1 = authApi.hashPassword('P@ssw0rd', salt1, iterations);
ok('format hash = sha256$iterasi$salt$hash', /^sha256\$\d+\$[0-9a-f]+\$[0-9a-f]{64}$/.test(h1));
ok('hash deterministik untuk salt & password sama',
  authApi.hashPassword('P@ssw0rd', salt1, iterations) === h1);
ok('hash berbeda bila salt berbeda',
  authApi.hashPassword('P@ssw0rd', salt2, iterations) !== h1);
ok('hash berbeda bila password berbeda',
  authApi.hashPassword('lain', salt1, iterations) !== h1);
ok('verifyPassword menerima password benar', authApi.verifyPassword('P@ssw0rd', h1) === true);
ok('verifyPassword menolak password salah', authApi.verifyPassword('salah', h1) === false);
ok('verifyPassword menolak hash null', authApi.verifyPassword('x', null) === false);
ok('verifyPassword menolak format rusak', authApi.verifyPassword('x', 'sha256$rusak') === false);
ok('verifyPassword menolak salt terlalu pendek', authApi.verifyPassword('x', 'sha256$10$ab$' + 'a'.repeat(64)) === false);

console.log('\n' + pass + ' PASSED, exitCode=' + (process.exitCode || 0));
