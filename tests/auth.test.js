/* Uji integrasi autentikasi (jsdom): gerbang login, daftar, login, logout,
   ganti password, sesi tersimpan, dan ketahanan input tidak valid. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ERRORS = [];

/** Bangun instance jsdom baru (opsional: pre-seed localStorage). */
function boot(seed) {
  return new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://localhost/',
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () {
        return { fillStyle: '', fillRect() {}, drawImage() {} };
      };
      window.HTMLCanvasElement.prototype.toDataURL = function () {
        return 'data:image/png;base64,AAAA';
      };
      window.URL.createObjectURL = () => 'blob:stub';
      window.URL.revokeObjectURL = () => {};
      window.addEventListener('error', (e) => { ERRORS.push(String((e && e.error) || (e && e.message))); });
      window.addEventListener('unhandledrejection', (e) => { ERRORS.push('unhandledrejection: ' + String(e && e.reason)); });
      window.matchMedia = (q) => ({ matches: !/max-width/.test(q), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.tailwind = { config: {}, scrollTo: () => {} };
      window.scrollTo = () => {};
      window.Element.prototype.scrollIntoView = function () {};
      if (seed) Object.keys(seed).forEach((k) => window.localStorage.setItem(k, seed[k]));
    },
  });
}

(async function run() {
  const dom = boot();
  const { window } = dom;
  const { document } = window;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const ls = window.localStorage;
  const usersRaw = () => ls.getItem('finrecap.users.v1');
  const sessionRaw = () => ls.getItem('finrecap.session.v1');
  const users = () => { const r = usersRaw(); return r ? JSON.parse(r) : {}; };
  const session = () => { const r = sessionRaw(); return r ? JSON.parse(r) : null; };

  const $ = (sel) => document.querySelector(sel);
  const click = (sel) => {
    const node = typeof sel === 'string' ? $(sel) : sel;
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return node;
  };
  const submitForm = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const hidden = (sel) => $(sel).classList.contains('hidden');
  const setVal = (sel, v) => { $(sel).value = v; };
  const pressEsc = (node) => node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const fillAuth = (username, password, confirm) => {
    setVal('#authUsername', username);
    setVal('#authPassword', password);
    if (confirm !== undefined) setVal('#authConfirm', confirm);
  };

  await wait(100);

  section('1. Keadaan awal (belum ada akun)');
  ok('gerbang login tampil saat pertama kali', !hidden('#authGate'));
  ok('body terkunci (auth-locked)', document.body.classList.contains('auth-locked'));
  ok('tab Masuk aktif secara default', $('#authTabLogin').classList.contains('is-active'));
  ok('field konfirmasi tersembunyi di mode login', hidden('#authConfirmWrap'));
  ok('tombol submit berlabel "Masuk"', $('#authSubmit').textContent.trim() === 'Masuk');
  ok('chip pengguna tersembunyi', hidden('#userChip'));
  ok('item menu auth-only tersembunyi', document.querySelectorAll('#menuPanel [data-auth-only]:not(.hidden)').length === 0);
  ok('belum ada sesi tersimpan', sessionRaw() === null);

  section('2. Validasi pendaftaran');
  click('#authTabRegister');
  ok('tab Daftar aktif', $('#authTabRegister').classList.contains('is-active'));
  ok('field konfirmasi muncul', !hidden('#authConfirmWrap'));
  ok('label submit berubah jadi "Buat akun"', $('#authSubmit').textContent.trim() === 'Buat akun');

  submitForm($('#authForm'));
  ok('error username kosong tampil', !hidden('#authUserError'));
  ok('error password kosong tampil', !hidden('#authPassError'));
  ok('tidak ada akun tersimpan', usersRaw() === null);

  fillAuth('ab', 'rahasia123', 'rahasia123');
  submitForm($('#authForm'));
  ok('username terlalu pendek ditolak', !hidden('#authUserError'));

  fillAuth('iky', '123', '123');
  submitForm($('#authForm'));
  ok('password terlalu pendek ditolak', !hidden('#authPassError'));

  fillAuth('iky', 'rahasia123', 'rahasiaXYZ');
  submitForm($('#authForm'));
  ok('konfirmasi tidak cocok ditolak', !hidden('#authConfirmError'));
  ok('akun belum dibuat saat validasi gagal', Object.keys(users()).length === 0);

  section('3. Pendaftaran berhasil');
  fillAuth('iky', 'rahasia123', 'rahasia123');
  submitForm($('#authForm'));
  await wait(30);
  ok('gerbang tertutup setelah daftar', hidden('#authGate'));
  ok('body tidak terkunci lagi', !document.body.classList.contains('auth-locked'));
  ok('akun tersimpan', !!users().iky);
  ok('password tidak disimpan sebagai plaintext', users().iky.hash.indexOf('rahasia123') === -1);
  ok('format hash sha256$... sesuai', /^sha256\$\d+\$[0-9a-f]+\$[0-9a-f]{64}$/.test(users().iky.hash));
  ok('sesi tersimpan untuk iky', session() && session().username === 'iky');
  ok('chip pengguna tampil', !hidden('#userChip'));
  ok('nama pengguna di chip = iky', $('#userName').textContent === 'iky');
  ok('item menu auth-only tampil', document.querySelectorAll('#menuPanel [data-auth-only]:not(.hidden)').length === 2);

  section('4. Logout & login salah');
  click('#btnMenu');
  click('#menuPanel [data-action="logout"]');
  await wait(30);
  ok('logout menghapus sesi', sessionRaw() === null);
  ok('gerbang muncul kembali setelah logout', !hidden('#authGate'));
  ok('chip pengguna tersembunyi setelah logout', hidden('#userChip'));
  ok('item menu auth-only tersembunyi setelah logout', document.querySelectorAll('#menuPanel [data-auth-only]:not(.hidden)').length === 0);
  ok('akun tetap ada setelah logout', !!users().iky);

  click('#authTabLogin');
  fillAuth('iky', 'passwordSalah');
  submitForm($('#authForm'));
  await wait(20);
  ok('login gagal menampilkan pesan error', !hidden('#authUserError'));
  ok('pesan error generik (tidak bocorkan detail)', /Username atau password salah/.test($('#authUserError').textContent));
  ok('gerbang tetap terbuka', !hidden('#authGate'));
  ok('sesi tetap kosong', sessionRaw() === null);

  fillAuth('tidak-ada', 'rahasia123');
  submitForm($('#authForm'));
  await wait(20);
  ok('username tidak dikenal juga ditolak', sessionRaw() === null);

  section('5. Login berhasil (username tidak case-sensitive)');
  fillAuth('  IKY  ', 'rahasia123');
  submitForm($('#authForm'));
  await wait(30);
  ok('login berhasil dengan spasi + huruf besar', session() && session().username === 'iky');
  ok('gerbang tertutup', hidden('#authGate'));
  ok('nama pengguna kembali tampil', $('#userName').textContent === 'iky');

  section('6. Toggle lihat password');
  click('#btnMenu');
  click('#menuPanel [data-action="logout"]');
  await wait(30);
  ok('tipe input password default = password', $('#authPassword').type === 'password');
  click('#authTogglePw');
  ok('klik Lihat -> tipe jadi text', $('#authPassword').type === 'text');
  ok('label tombol berubah jadi "Sembunyi"', $('#authTogglePw').textContent.trim() === 'Sembunyi');
  click('#authTogglePw');
  ok('klik ulang -> kembali ke password', $('#authPassword').type === 'password');

  section('7. Lanjut tanpa akun');
  click('#authSkip');
  await wait(30);
  ok('gerbang tertutup dengan tombol lewati', hidden('#authGate'));
  ok('body tidak terkunci', !document.body.classList.contains('auth-locked'));
  ok('tombol lewati tidak membuat sesi', sessionRaw() === null);
  ok('chip pengguna tetap tersembunyi', hidden('#userChip'));

  section('8. Ganti password');
  fillAuth('iky', 'rahasia123');
  submitForm($('#authForm'));
  await wait(30);
  ok('berhasil login kembali', session() && session().username === 'iky');
  const oldHash = users().iky.hash;

  click('#btnMenu');
  click('#menuPanel [data-action="changePassword"]');
  await wait(30);
  ok('dialog ganti password terbuka', !hidden('#pwDialog'));

  setVal('#pwCurrent', 'salahSekali');
  setVal('#pwNew', 'passwordBaru1');
  setVal('#pwConfirm', 'passwordBaru1');
  submitForm($('#pwForm'));
  await wait(20);
  ok('password lama salah ditolak', !hidden('#pwCurrentError'));
  ok('hash tidak berubah setelah gagal', users().iky.hash === oldHash);

  setVal('#pwCurrent', 'rahasia123');
  setVal('#pwNew', 'passwordBaru1');
  setVal('#pwConfirm', 'beda');
  submitForm($('#pwForm'));
  await wait(20);
  ok('konfirmasi baru tidak cocok ditolak', !hidden('#pwConfirmError'));

  setVal('#pwCurrent', 'rahasia123');
  setVal('#pwNew', '123');
  setVal('#pwConfirm', '123');
  submitForm($('#pwForm'));
  await wait(20);
  ok('password baru terlalu pendek ditolak', !hidden('#pwNewError'));

  setVal('#pwCurrent', 'rahasia123');
  setVal('#pwNew', 'passwordBaru1');
  setVal('#pwConfirm', 'passwordBaru1');
  submitForm($('#pwForm'));
  await wait(30);
  ok('dialog tertutup setelah ganti password', hidden('#pwDialog'));
  ok('hash berubah setelah ganti password', users().iky.hash !== oldHash);
  ok('salt tetap 32 hex karakter', typeof users().iky.salt === 'string' && users().iky.salt.length === 32);
  ok('password baru bukan plaintext', users().iky.hash.indexOf('passwordBaru1') === -1);

  section('9. Login dengan password baru');
  click('#btnMenu');
  click('#menuPanel [data-action="logout"]');
  await wait(30);
  fillAuth('iky', 'rahasia123');
  submitForm($('#authForm'));
  await wait(30);
  ok('password lama tidak berlaku lagi', sessionRaw() === null);
  fillAuth('iky', 'passwordBaru1');
  submitForm($('#authForm'));
  await wait(30);
  ok('password baru berhasil dipakai', session() && session().username === 'iky');

  section('10. ESC menutup dialog ganti password');
  click('#btnMenu');
  click('#menuPanel [data-action="changePassword"]');
  await wait(30);
  ok('dialog terbuka', !hidden('#pwDialog'));
  pressEsc($('#pwDialog'));
  await wait(20);
  ok('ESC menutup dialog ganti password', hidden('#pwDialog'));
  ok('cookie/sesi tetap utuh setelah ESC', session() && session().username === 'iky');

  section('11. Sesi bertahan setelah reload halaman');
  ok('sesi tersimpan di localStorage', session() && session().username === 'iky');
  const dom2 = boot({ 'finrecap.users.v1': usersRaw(), 'finrecap.session.v1': sessionRaw() });
  await wait(80);
  const d2 = dom2.window.document;
  ok('reload: gerbang langsung tertutup karena sesi ada', d2.getElementById('authGate').classList.contains('hidden'));
  ok('reload: body tidak terkunci', !d2.body.classList.contains('auth-locked'));
  ok('reload: chip pengguna menampilkan iky', d2.getElementById('userName').textContent === 'iky');
  ok('reload: item menu auth-only tampil', d2.querySelectorAll('#menuPanel [data-auth-only]:not(.hidden)').length === 2);

  section('12. Ketahanan data korup dan sesi yatim');
  const dom3 = boot({ 'finrecap.users.v1': '{ bukan json ]', 'finrecap.session.v1': JSON.stringify({ username: 'hantu' }) });
  await wait(80);
  const d3 = dom3.window.document;
  ok('users korup tidak membuat app crash', !!d3.getElementById('authGate'));
  ok('sesi tanpa akun valid dianggap belum masuk (gerbang tampil)', !d3.getElementById('authGate').classList.contains('hidden'));
  ok('tidak ada exception tak tertangani', ERRORS.length === 0);

  console.log('\n================================');
  console.log(pass + ' PASSED, ' + fail + ' FAILED');
  console.log('================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nUNCAUGHT ERROR:', e);
  process.exit(1);
});
