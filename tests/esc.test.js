/* Uji terfokus: perilaku tombol Escape pada dialog & lightbox. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 1) jsdom (bubble saja)  -> cerminan perilaku lemah
// 2) Simulasi capture+bubble seperti browser sungguhan

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function makeDom(captureFirst, seed) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://localhost/',
    beforeParse(window) {
      window.tailwind = { config: {}, scrollTo: () => {} };
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      // Seed localStorage SEBELUM skrip inline dieksekusi, agar init() membaca data.
      if (seed !== undefined) {
        window.localStorage.setItem('finrecap.transactions.v1', JSON.stringify(seed));
      }
      window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: '', fillRect() {}, drawImage() {} });
      window.HTMLCanvasElement.prototype.toDataURL = function (t) {
        return 'data:' + (t || 'image/png') + ';base64,' + Buffer.from('C').toString('base64');
      };
      window.Element.prototype.scrollIntoView = function () {};
      window.scrollTo = () => {};
      if (captureFirst) {
        // Tiru urutan browser: listener capture (dokumen) jalan lebih dulu,
        // lalu bubble baik dari elemen yang di-dispatch maupun dokumen.
        const origAdd = window.EventTarget.prototype.addEventListener;
        const wrapped = [];
        window.EventTarget.prototype.addEventListener = function (type, fn, opts) {
          const capture = (typeof opts === 'boolean') ? opts : !!(opts && opts.capture);
          return origAdd.call(this, type, fn, { capture, passive: opts && opts.passive });
        };
      }
    },
  });
  return dom;
}

function pressEsc(dom) {
  // Browser nyata: keydown di target, bubble naik ke document (termasuk listener dokumen),
  // dan listener capture dokumen jalan sebelum target.
  const { window } = dom;
  const { document } = window;
  const ev = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
}

(async () => {
  const dom = makeDom(false);
  const { window } = dom;
  const { document } = window;
  await new Promise((r) => setTimeout(r, 120));

  // Buka dialog konfirmasi via tombol hapus (butuh 1 data dulu)
  document.querySelector('input[name="jenis"][value="pemasukan"]').checked = true;
  document.getElementById('nominal').value = '1000';
  document.getElementById('keterangan').value = 'tes';
  document.getElementById('tanggal').value = '2026-10-05';
  document.getElementById('txForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));

  const id = JSON.parse(window.localStorage.getItem('finrecap.transactions.v1')).transactions[0].id;
  document.querySelector('#historyList [data-action="delete"][data-id="' + id + '"]')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));

  const dialogOpen = !document.getElementById('dialog').classList.contains('hidden');
  console.log('dialog terbuka            :', dialogOpen);

  // Simulasikan keydown dari elemen yang difokuskan (dialogCancel) -> bubble ke dokumen
  const cancelBtn = document.getElementById('dialogCancel');
  cancelBtn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 60));

  const dialogClosed = document.getElementById('dialog').classList.contains('hidden');
  console.log('ESC dari tombol Batal     : dialog tertutup =', dialogClosed);

  // Buka lightbox lalu tekan ESC (butuh data yang punya foto).
  // Catatan: setiap instance JSDOM punya localStorage sendiri, jadi data harus
  // di-seed lewat opsi `seed` (di-set sebelum skrip inline berjalan), bukan
  // ditulis setelah DOM dibuat.
  const dom2 = makeDom(false, {
    version: 1,
    transactions: [{ id: 'p1', jenis: 'pengeluaran', nominal: 500, keterangan: 'foto', tanggal: '2026-10-05', foto: 'data:image/png;base64,AAAA', fotoName: 'a.png' }],
  });
  await new Promise((r) => setTimeout(r, 200));
  const w2 = dom2.window, d2 = dom2.window.document;
  const thumb2 = d2.querySelector('#historyList [data-action="lightbox"]');
  console.log('thumbnail ditemukan       :', !!thumb2);
  if (thumb2) {
    thumb2.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    console.log('lightbox terbuka          :', !d2.getElementById('lightbox').classList.contains('hidden'));
    d2.dispatchEvent(new w2.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    console.log('ESC dari document         : lightbox tertutup =', d2.getElementById('lightbox').classList.contains('hidden'));
  }

  process.exit(0);
})();
