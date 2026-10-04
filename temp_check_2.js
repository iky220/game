
/* ==========================================================================
   REKAP KEUANGAN â€” Vanilla JavaScript
   --------------------------------------------------------------------------
   Struktur:
     1.  Konstanta & referensi elemen
     2.  Utilitas (format, tanggal, id)
     3.  Penyimpanan (localStorage) + state
     4.  Proses gambar (FileReader -> Base64 + kompresi via canvas)
     5.  Perhitungan ringkasan (dashboard)
     6.  Validasi form
     7.  Render riwayat transaksi
     8.  Aksi CRUD + filter
     9.  Lightbox, dialog, toast, menu
     10. Inisialisasi & event binding
   ========================================================================== */
(function () {
  'use strict';

  /* ==================== 1. KONSTANTA & ELEMEN ==================== */
  const STORAGE_KEY = 'finrecap.transactions.v1';
  const PREF_KEY    = 'finrecap.prefs.v1';

  // Batas ukuran gambar bukti setelah dikompres (sisi terpanjang, px)
  const IMG_MAX_DIM = 1280;
  const IMG_QUALITY = 0.72;
  // Peringatan bila total data mendekati kapasitas umum localStorage (Â±5 MB)
  const STORAGE_WARN_BYTES = 4 * 1024 * 1024;

  const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni',
                       'Juli','Agustus','September','Oktober','November','Desember'];
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const DAY_NAMES   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const el = {
    // Dashboard
    totalSaldo:       $('#totalSaldo'),
    saldoNote:        $('#saldoNote'),
    totalPendapatan:  $('#totalPendapatan'),
    totalPengeluaran: $('#totalPengeluaran'),
    countPendapatan:  $('#countPendapatan'),
    countPengeluaran: $('#countPengeluaran'),
    monthIncome:      $('#monthIncome'),
    monthIncomeNote:  $('#monthIncomeNote'),
    monthExpense:     $('#monthExpense'),
    monthExpenseNote: $('#monthExpenseNote'),
    monthNet:         $('#monthNet'),
    monthNetNote:     $('#monthNetNote'),

    // Form
    form:        $('#txForm'),
    txId:        $('#txId'),
    nominal:     $('#nominal'),
    keterangan:  $('#keterangan'),
    tanggal:     $('#tanggal'),
    foto:        $('#foto'),
    fotoPreviewWrap: $('#fotoPreviewWrap'),
    fotoPreview: $('#fotoPreview'),
    fotoName:    $('#fotoName'),
    fotoSize:    $('#fotoSize'),
    fotoStatus:  $('#fotoStatus'),
    btnRemoveFoto: $('#btnRemoveFoto'),
    btnSubmit:   $('#btnSubmit'),
    btnSubmitLabel: $('#btnSubmitLabel'),
    btnClear:    $('#btnClear'),
    btnResetForm: $('#btnResetForm'),
    formTitle:   $('#formTitle'),
    formMode:    $('#formMode'),
    dropZone:    $('#dropZone'),

    // Riwayat
    historyList:   $('#historyList'),
    historyCount:  $('#historyCount'),
    historyFooter: $('#historyFooter'),
    filteredSummary: $('#filteredSummary'),
    searchInput:   $('#searchInput'),
    monthFilter:   $('#monthFilter'),
    sortSelect:    $('#sortSelect'),
    btnToggleView: $('#btnToggleView'),

    // Menu & global
    btnMenu:      $('#btnMenu'),
    menuPanel:    $('#menuPanel'),
    modal:        $('#dialog'),
    dialogTitle:  $('#dialogTitle'),
    dialogMessage:$('#dialogMessage'),
    dialogIcon:   $('#dialogIcon'),
    dialogConfirm:$('#dialogConfirm'),
    dialogCancel: $('#dialogCancel'),
    lightbox:     $('#lightbox'),
    lbImage:      $('#lightboxImage'),
    lbCaption:    $('#lightboxCaption'),
    lbMeta:       $('#lightboxMeta'),
    lbPrev:       $('#lightboxPrev'),
    lbNext:       $('#lightboxNext'),
    toastStack:   $('#toastStack'),
    importFile:   $('#importFile'),
    fabAdd:       $('#fabAdd'),
    storageBadge: $('#storageBadge'),
  };

  /* ==================== 2. UTILITAS ==================== */
  const rupiah = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));

  /** Ringkas nominal besar: 1250000 -> "Rp 1,25 jt" */
  function rupiahShort(n) {
    const num = Number(n) || 0;
    const v = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (v >= 1e12) return sign + 'Rp ' + (v / 1e12).toFixed(2).replace('.', ',') + ' T';
    if (v >= 1e9)  return sign + 'Rp ' + (v / 1e9).toFixed(2).replace('.', ',') + ' M';
    if (v >= 1e6)  return sign + 'Rp ' + (v / 1e6).toFixed(2).replace('.', ',') + ' jt';
    if (v >= 1e3)  return sign + 'Rp ' + (v / 1e3).toFixed(1).replace('.', ',') + ' rb';
    return rupiah(num);
  }

  /** Date -> 'YYYY-MM-DD' memakai waktu lokal (tanpa pergeseran timezone). */
  function toISODate(d) {
    const date = (d instanceof Date) ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /** 'YYYY-MM-DD' -> Date lokal (hindari UTC shift dari new Date(string)). */
  function parseISO(iso) {
    const p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return new Date(NaN);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function formatDateLong(iso) {
    const d = parseISO(iso);
    if (isNaN(d)) return 'â€”';
    return DAY_NAMES[d.getDay()] + ', ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatDateShort(iso) {
    const d = parseISO(iso);
    if (isNaN(d)) return 'â€”';
    return d.getDate() + ' ' + MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function monthKey(iso) { return String(iso || '').slice(0, 7); }

  function monthLabel(key) {
    const parts = String(key).split('-').map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return String(key);
    return MONTH_NAMES[parts[1] - 1] + ' ' + parts[0];
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid() {
    return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function humanBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / (1024 * 1024)).toFixed(2).replace('.', ',') + ' MB';
  }

  function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

  /** Perkiraan besar byte data Base64 data URL. */
  function dataUrlBytes(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    const i = dataUrl.indexOf(',');
    const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
    return Math.ceil(b64.length * 0.75);
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  /* ==================== 3. PENYIMPANAN (localStorage) ==================== */

  /** State utama aplikasi. `transactions` selalu array of objek transaksi. */
  const state = {
    transactions: [],
    form: { id: null, jenis: 'pemasukan', nominal: '', keterangan: '', tanggal: '', foto: null, fotoName: '' },
    filters: { jenis: 'all', month: 'all', q: '', sort: 'date-desc' },
    view: 'list',            // 'list' (kartu) | 'table'
    lightboxIndex: -1,
    lightboxIds: [],
    prevFocus: null,
    confirmResolver: null,
  };

  const prefs = {
    load: function () {
      try {
        const raw = localStorage.getItem(PREF_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    },
    save: function (patch) {
      try {
        const next = Object.assign(this.load(), patch);
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch (e) { /* abaikan: preferensi bukan data kritis */ }
    },
  };

  /** Normalisasi satu record agar tahan terhadap data lama/rusak. */
  function normalizeTx(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const jenis = (raw.jenis === 'pengeluaran') ? 'pengeluaran' : 'pemasukan';
    const nominal = Math.max(0, Math.round(Number(raw.nominal) || 0));
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.tanggal)) ? String(raw.tanggal) : toISODate(new Date());
    const isImage = typeof raw.foto === 'string' && raw.foto.indexOf('data:image') === 0;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      jenis: jenis,
      nominal: nominal,
      keterangan: String(raw.keterangan == null ? '' : raw.keterangan).slice(0, 120),
      tanggal: tanggal,
      foto: isImage ? raw.foto : null,
      fotoName: raw.fotoName ? String(raw.fotoName).slice(0, 80) : '',
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(),
    };
  }

  /**
   * Baca transaksi dari localStorage.
   * Mendukung 2 format: array langsung, atau objek { version, transactions }.
   */
  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed
                : (parsed && Array.isArray(parsed.transactions)) ? parsed.transactions : [];
      return arr.map(normalizeTx).filter(Boolean);
    } catch (e) {
      console.error('Gagal memuat data:', e);
      return [];
    }
  }

  /**
   * Simpan transaksi ke localStorage.
   * Jika kuota penuh (foto terlalu banyak/besar), lakukan penyelamatan bertahap:
   *   1) simpan tanpa foto terbesar -> 2) simpan tanpa seluruh foto.
   * @returns {{ok:boolean, dropped:number, quota:boolean}}
   */
  function saveTransactions() {
    const attempt = (list) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: Date.now(), transactions: list }));
        return true;
      } catch (e) {
        return false;
      }
    };

    if (attempt(state.transactions)) {
      const used = (localStorage.getItem(STORAGE_KEY) || '').length;
      if (used > STORAGE_WARN_BYTES) {
        toast('Penyimpanan hampir penuh (' + humanBytes(used) + '). Pertimbangkan hapus foto lama.', 'warn', 6000);
      }
      return { ok: true, dropped: 0, quota: false };
    }

    // --- Penyelamatan kuota: buang foto terbesar dulu ---
    const withPhoto = state.transactions
      .filter(function (t) { return !!t.foto; })
      .sort(function (a, b) { return dataUrlBytes(b.foto) - dataUrlBytes(a.foto); });

    if (withPhoto.length) {
      const victimId = withPhoto[0].id;
      const rescued = state.transactions.map(function (t) {
        return t.id === victimId ? Object.assign({}, t, { foto: null }) : t;
      });
      if (attempt(rescued)) {
        state.transactions = rescued;
        return { ok: true, dropped: 1, quota: true };
      }
      // Masih gagal -> buang semua foto
      const noPhotos = state.transactions.map(function (t) { return Object.assign({}, t, { foto: null }); });
      if (attempt(noPhotos)) {
        const n = withPhoto.length;
        state.transactions = noPhotos;
        return { ok: true, dropped: n, quota: true };
      }
    }

    return { ok: false, dropped: 0, quota: true };
  }

  /* ==================== 4. PROSES GAMBAR (FileReader -> Base64) ==================== */

  /**
   * Langkah 1 â€” baca file sebagai Data URL (Base64) memakai FileReader.
   * Ini adalah inti permintaan: foto diubah menjadi Base64 agar bisa
   * disimpan di localStorage.
   */
  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('Gagal membaca file')); };
      reader.readAsDataURL(file);
    });
  }

  /** Muat Data URL ke elemen Image untuk membaca dimensi asli. */
  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Format gambar tidak didukung')); };
      img.src = dataUrl;
    });
  }

  /**
   * Langkah 2 â€” kompresi + resize via canvas, lalu ekspor ulang ke Base64 (JPEG/WEBP).
   * Tujuan: jaga ukuran localStorage tetap wajar (Â±5 MB) agar tidak cepat penuh.
   */
  async function compressDataURL(dataUrl, maxDim, quality) {
    const img = await loadImage(dataUrl);
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error('Dimensi gambar tidak valid');

    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl; // fallback: pakai data URL asli
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Coba WEBP (lebih kecil), fallback ke JPEG bila browser tidak mendukung.
    let out = canvas.toDataURL('image/webp', quality);
    if (!out || out.indexOf('data:image/webp') !== 0 || out.length > dataUrl.length * 1.05) {
      const jpeg = canvas.toDataURL('image/jpeg', quality);
      if (jpeg && jpeg.indexOf('data:image/jpeg') === 0) out = jpeg;
    }
    // Jika hasil kompresi justru lebih besar, pertahankan yang asli.
    return (out && out.length < dataUrl.length) ? out : dataUrl;
  }

  /** Alur lengkap: file -> validasi -> Base64 -> kompresi -> state form. */
  async function handlePhotoFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setFieldError('foto', 'File harus berupa gambar (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setFieldError('foto', 'Ukuran file maksimal 20 MB.');
      return;
    }
    setFieldError('foto', '');

    setFotoStatus('Memprosesâ€¦', 'text-amber-600');

    try {
      const dataUrl = await readFileAsDataURL(file);          // <- FileReader
      let finalUrl = dataUrl;
      try {
        finalUrl = await compressDataURL(dataUrl, IMG_MAX_DIM, IMG_QUALITY);
      } catch (err) {
        console.warn('Kompresi dilewati:', err);
      }

      state.form.foto = finalUrl;
      state.form.fotoName = file.name || 'foto.jpg';
      renderPhotoPreview(file.name || 'foto.jpg', file.size, finalUrl.length);
    } catch (err) {
      console.error('Gagal memproses foto:', err);
      setFieldError('foto', 'Gagal memproses foto. Coba pilih gambar lain.');
      clearPhoto();
    }
  }

  function setFotoStatus(text, colorClass) {
    if (!el.fotoStatus) return;
    el.fotoStatus.className = 'mt-1 inline-flex items-center gap-1 text-[11px] font-bold ' + (colorClass || 'text-emerald-600');
    el.fotoStatus.textContent = text;
  }

  /** Tampilkan preview + info ukuran hasil konversi Base64. */
  function renderPhotoPreview(name, originalBytes, base64Len) {
    if (!el.fotoPreviewWrap || !el.fotoPreview) return;
    el.fotoPreview.src = state.form.foto;
    el.fotoPreview.classList.add('cursor-zoom-in');
    el.fotoName.textContent = name;
    const approxBytes = dataUrlBytes(state.form.foto);
    el.fotoSize.textContent = 'Asli ' + humanBytes(originalBytes) + ' â†’ tersimpan ' + humanBytes(approxBytes) +
      ' (' + Math.round(base64Len / 1024) + ' KB Base64)';
    setFotoStatus('Terkonversi Base64', 'text-emerald-600');
    el.fotoPreviewWrap.classList.remove('hidden');
    el.dropZone.classList.add('hidden');
  }

  function clearPhoto() {
    state.form.foto = null;
    state.form.fotoName = '';
    if (el.foto) el.foto.value = '';
    if (el.fotoPreviewWrap) el.fotoPreviewWrap.classList.add('hidden');
    if (el.fotoPreview) el.fotoPreview.removeAttribute('src');
    if (el.dropZone) el.dropZone.classList.remove('hidden');
  }

  /* ==================== 5. RINGKASAN / DASHBOARD ==================== */

  /** Hitung agregat dari seluruh transaksi. */
  function computeTotals(list) {
    let income = 0, expense = 0, cIncome = 0, cExpense = 0, withPhoto = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.jenis === 'pemasukan') { income += t.nominal; cIncome++; }
      else { expense += t.nominal; cExpense++; }
      if (t.foto) withPhoto++;
    }
    return {
      income: income,
      expense: expense,
      balance: income - expense,
      cIncome: cIncome,
      cExpense: cExpense,
      total: list.length,
      withPhoto: withPhoto,
    };
  }

  /** Hitung agregat untuk satu bulan tertentu ('YYYY-MM'). */
  function computeMonthTotals(list, key) {
    const inMonth = list.filter(function (t) { return monthKey(t.tanggal) === key; });
    const totals = computeTotals(inMonth);
    totals.key = key;
    totals.label = monthLabel(key);
    return totals;
  }

  /** Render seluruh angka dashboard. */
  function renderDashboard() {
    const totals = computeTotals(state.transactions);

    // Total saldo
    el.totalSaldo.textContent = rupiah(totals.balance);
    el.totalSaldo.classList.toggle('text-rose-300', totals.balance < 0);
    el.saldoNote.textContent = totals.total === 0
      ? 'Belum ada transaksi tercatat.'
      : totals.total + ' transaksi â€¢ ' + totals.withPhoto + ' dengan bukti foto';

    // Total pendapatan & pengeluaran
    el.totalPendapatan.textContent = rupiah(totals.income);
    el.totalPengeluaran.textContent = rupiah(totals.expense);
    el.countPendapatan.textContent = totals.cIncome + ' transaksi';
    el.countPengeluaran.textContent = totals.cExpense + ' transaksi';

    // Bulan berjalan
    const currentKey = toISODate(new Date()).slice(0, 7);
    const m = computeMonthTotals(state.transactions, currentKey);
    const prevKey = shiftMonth(currentKey, -1);
    const prev = computeMonthTotals(state.transactions, prevKey);

    el.monthIncome.textContent = rupiah(m.income);
    el.monthExpense.textContent = rupiah(m.expense);
    el.monthNet.textContent = rupiah(m.balance);
    el.monthNet.classList.toggle('text-rose-600', m.balance < 0);
    el.monthNet.classList.toggle('text-emerald-600', m.balance > 0);

    el.monthIncomeNote.textContent = m.label + ' â€¢ ' + m.cIncome + ' pemasukan' +
      (prev.income ? ' â€¢ bulan lalu ' + rupiahShort(prev.income) : '');
    el.monthExpenseNote.textContent = m.label + ' â€¢ ' + m.cExpense + ' pengeluaran' +
      (prev.expense ? ' â€¢ bulan lalu ' + rupiahShort(prev.expense) : '');

    let trend = 'Belum ada aktivitas bulan ini.';
    if (m.total > 0) {
      const diff = m.balance - prev.balance;
      if (prev.total === 0) {
        trend = m.balance >= 0 ? 'Surplus ' + rupiahShort(m.balance) + ' pada ' + m.label + '.'
                               : 'Defisit ' + rupiahShort(Math.abs(m.balance)) + ' pada ' + m.label + '.';
      } else if (diff === 0) {
        trend = 'Sama dengan bulan sebelumnya.';
      } else {
        trend = (diff > 0 ? 'Naik ' : 'Turun ') + rupiahShort(Math.abs(diff)) + ' dibanding bulan lalu.';
      }
    }
    el.monthNetNote.textContent = trend;

    // Badge penyimpanan
    if (el.storageBadge) {
      const used = (localStorage.getItem(STORAGE_KEY) || '').length;
      const nearFull = used > STORAGE_WARN_BYTES;
      el.storageBadge.innerHTML = '<span class="h-1.5 w-1.5 rounded-full ' + (nearFull ? 'bg-amber-500' : 'bg-emerald-500') + '"></span>' +
        (nearFull ? 'Penyimpanan ' + humanBytes(used) : 'Tersimpan lokal');
    }
  }

  /** Geser 'YYYY-MM' sejumlah n bulan. */
  function shiftMonth(key, n) {
    const parts = String(key).split('-').map(Number);
    const d = new Date(parts[0], (parts[1] - 1) + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* ==================== 6. VALIDASI FORM ==================== */

  function errorNode(field) {
    return el.form ? el.form.querySelector('[data-error-for="' + field + '"]') : null;
  }

  function setFieldError(field, message) {
    const node = errorNode(field);
    if (!node) return;
    if (message) {
      node.textContent = message;
      node.classList.remove('hidden');
    } else {
      node.textContent = '';
      node.classList.add('hidden');
    }
  }

  function clearAllErrors() {
    ['jenis', 'nominal', 'keterangan', 'tanggal', 'foto'].forEach(function (f) { setFieldError(f, ''); });
    if (el.nominal) el.nominal.classList.remove('border-rose-400', 'bg-rose-50/40');
    if (el.keterangan) el.keterangan.classList.remove('border-rose-400', 'bg-rose-50/40');
    if (el.tanggal) el.tanggal.classList.remove('border-rose-400', 'bg-rose-50/40');
  }

  function getSelectedJenis() {
    const checked = el.form ? el.form.querySelector('input[name="jenis"]:checked') : null;
    return checked ? checked.value : '';
  }

  /** Validasi form; mengembalikan objek data bila valid, atau null bila gagal. */
  function validateForm() {
    clearAllErrors();
    let firstInvalid = null;

    // --- Jenis ---
    const jenis = getSelectedJenis();
    if (jenis !== 'pemasukan' && jenis !== 'pengeluaran') {
      setFieldError('jenis', 'Pilih jenis transaksi.');
      firstInvalid = firstInvalid || el.form.querySelector('input[name="jenis"]');
    }

    // --- Nominal ---
    const rawNominal = String(el.nominal.value || '').trim();
    let nominal = NaN;
    if (!rawNominal) {
      setFieldError('nominal', 'Nominal wajib diisi.');
      el.nominal.classList.add('border-rose-400', 'bg-rose-50/40');
      firstInvalid = firstInvalid || el.nominal;
    } else if (!/^\d+(\.\d+)?$/.test(rawNominal)) {
      setFieldError('nominal', 'Nominal hanya boleh berisi angka.');
      el.nominal.classList.add('border-rose-400', 'bg-rose-50/40');
      firstInvalid = firstInvalid || el.nominal;
    } else {
      nominal = Number(rawNominal);
      if (!isFinite(nominal) || nominal <= 0) {
        setFieldError('nominal', 'Nominal harus lebih besar dari 0.');
        el.nominal.classList.add('border-rose-400', 'bg-rose-50/40');
        firstInvalid = firstInvalid || el.nominal;
      } else if (nominal > 1e15) {
        setFieldError('nominal', 'Nominal terlalu besar.');
        el.nominal.classList.add('border-rose-400', 'bg-rose-50/40');
        firstInvalid = firstInvalid || el.nominal;
      } else {
        nominal = Math.round(nominal);
      }
    }

    // --- Keterangan ---
    const keterangan = String(el.keterangan.value || '').trim();
    if (!keterangan) {
      setFieldError('keterangan', 'Keterangan wajib diisi.');
      el.keterangan.classList.add('border-rose-400', 'bg-rose-50/40');
      firstInvalid = firstInvalid || el.keterangan;
    } else if (keterangan.length > 120) {
      setFieldError('keterangan', 'Keterangan maksimal 120 karakter.');
      el.keterangan.classList.add('border-rose-400', 'bg-rose-50/40');
      firstInvalid = firstInvalid || el.keterangan;
    }

    // --- Tanggal ---
    const tanggal = String(el.tanggal.value || '').trim();
    const d = parseISO(tanggal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || isNaN(d)) {
      setFieldError('tanggal', 'Tanggal wajib diisi.');
      el.tanggal.classList.add('border-rose-400', 'bg-rose-50/40');
      firstInvalid = firstInvalid || el.tanggal;
    } else if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      setFieldError('tanggal', 'Tanggal tidak boleh di masa depan.');
      el.tanggal.classList.add('border-rose-400', 'bg-rose-50/40');
      firstInvalid = firstInvalid || el.tanggal;
    }

    if (firstInvalid) {
      try { firstInvalid.focus(); } catch (e) { /* noop */ }
      toast('Periksa kembali data pada form.', 'error');
      return null;
    }

    return {
      jenis: jenis,
      nominal: nominal,
      keterangan: keterangan,
      tanggal: tanggal,
      foto: state.form.foto || null,
      fotoName: state.form.foto ? (state.form.fotoName || 'foto.jpg') : '',
    };
  }

  /* ==================== 7. RENDER RIWAYAT TRANSAKSI ==================== */

  /** Terapkan filter + pencarian + pengurutan; hasil = array baru. */
  function getVisibleTransactions() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();

    let list = state.transactions.filter(function (t) {
      if (f.jenis !== 'all' && t.jenis !== f.jenis) return false;
      if (f.month !== 'all' && monthKey(t.tanggal) !== f.month) return false;
      if (q) {
        const haystack = (t.keterangan + ' ' + t.jenis + ' ' + t.nominal + ' ' + t.tanggal).toLowerCase();
        if (haystack.indexOf(q) === -1) return false;
      }
      return true;
    });

    const dir = f.sort.indexOf('-asc') > -1 ? 1 : -1;
    const byAmount = f.sort.indexOf('amount') === 0;

    list.sort(function (a, b) {
      let cmp;
      if (byAmount) {
        cmp = a.nominal - b.nominal;
        if (cmp === 0) cmp = parseISO(a.tanggal) - parseISO(b.tanggal);
      } else {
        cmp = parseISO(a.tanggal) - parseISO(b.tanggal);
        if (cmp === 0) cmp = a.createdAt - b.createdAt;
      }
      return cmp * dir;
    });

    return list;
  }

  /** Label ringkas jenis transaksi. */
  function jenisMeta(jenis) {
    if (jenis === 'pengeluaran') {
      return {
        label: 'Pengeluaran',
        short: 'Keluar',
        sign: '-',
        text: 'text-rose-600',
        chip: 'bg-rose-50 text-rose-600 ring-rose-100',
        icon: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
      };
    }
    return {
      label: 'Pemasukan',
      short: 'Masuk',
      sign: '+',
      text: 'text-emerald-600',
      chip: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
      icon: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    };
  }

  function emptyStateHTML() {
    const hasAny = state.transactions.length > 0;
    return '' +
      '<div class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center animate-fade-in">' +
        '<div class="grid h-16 w-16 place-items-center rounded-3xl bg-slate-100 text-3xl">' + (hasAny ? 'ðŸ”' : 'ðŸ§¾') + '</div>' +
        '<div>' +
          '<p class="text-sm font-extrabold text-slate-700">' + (hasAny ? 'Tidak ada transaksi yang cocok' : 'Belum ada transaksi') + '</p>' +
          '<p class="mt-1 max-w-xs text-xs text-slate-400">' +
            (hasAny
              ? 'Coba ubah kata kunci, filter jenis, atau pilih bulan lain.'
              : 'Mulai catat pemasukan atau pengeluaran pertama Anda melalui form di samping.') +
          '</p>' +
        '</div>' +
        (hasAny
          ? '<button type="button" data-action="resetFilter" class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Reset filter</button>'
          : '') +
      '</div>';
  }

  function photoThumbHTML(t) {
    if (!t.foto) {
      return '<span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-300 ring-1 ring-slate-200" title="Tanpa bukti foto">' +
        '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><path d="m3 17 5-5 5 5"/></svg>' +
      '</span>';
    }
    return '<button type="button" data-action="lightbox" data-id="' + t.id + '" ' +
      'class="group relative h-11 w-11 shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200 transition hover:ring-2 hover:ring-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" ' +
      'title="Lihat bukti foto" aria-label="Lihat bukti foto transaksi ' + escapeHtml(t.keterangan) + '">' +
      '<img src="' + t.foto + '" alt="Bukti ' + escapeHtml(t.keterangan) + '" loading="lazy" class="h-full w-full object-cover transition group-hover:scale-105" />' +
      '<span class="absolute inset-0 hidden place-items-center bg-slate-900/45 text-white group-hover:grid">' +
        '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/><path d="M11 8v6M8 11h6"/></svg>' +
      '</span>' +
    '</button>';
  }

  function actionsHTML(t) {
    return '<button type="button" data-action="edit" data-id="' + t.id + '" aria-label="Edit transaksi" title="Edit" ' +
      'class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">' +
      '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>' +
    '<button type="button" data-action="delete" data-id="' + t.id + '" aria-label="Hapus transaksi" title="Hapus" ' +
      'class="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">' +
      '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg></button>';
  }

  /** Tampilan kartu (default, cocok untuk mobile). */
  function renderCardList(list) {
    const rows = list.map(function (t, i) {
      const meta = jenisMeta(t.jenis);
      const edited = t.updatedAt > t.createdAt + 1500;
      return '' +
        '<li class="row-in" style="animation-delay:' + Math.min(i * 18, 220) + 'ms">' +
          '<div class="group flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition hover:border-slate-200 hover:shadow-sm sm:p-4">' +
            photoThumbHTML(t) +
            '<div class="min-w-0 flex-1">' +
              '<div class="flex flex-wrap items-center gap-x-2 gap-y-1">' +
                '<p class="min-w-0 flex-1 truncate text-sm font-bold text-slate-800" title="' + escapeHtml(t.keterangan) + '">' + escapeHtml(t.keterangan) + '</p>' +
                '<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ' + meta.chip + '">' + meta.short + '</span>' +
              '</div>' +
              '<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">' +
                '<span>' + formatDateShort(t.tanggal) + '</span>' +
                (t.foto ? '<span aria-hidden="true">â€¢</span><span class="font-semibold text-brand-600">Ada bukti foto</span>' : '') +
                (edited ? '<span aria-hidden="true">â€¢</span><span>Diedit</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="flex shrink-0 flex-col items-end gap-1.5">' +
              '<p class="tnum whitespace-nowrap text-sm font-extrabold ' + meta.text + '">' + meta.sign + rupiah(t.nominal) + '</p>' +
              '<div class="flex items-center gap-0.5 opacity-70 transition group-hover:opacity-100">' + actionsHTML(t) + '</div>' +
            '</div>' +
          '</div>' +
        '</li>';
    }).join('');

    return '<ul class="space-y-2">' + rows + '</ul>';
  }

  /** Tampilan tabel (cocok untuk desktop / data banyak). */
  function renderTable(list) {
    const rows = list.map(function (t) {
      const meta = jenisMeta(t.jenis);
      return '' +
        '<tr class="border-b border-slate-100 transition hover:bg-slate-50/70">' +
          '<td class="whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-500">' + formatDateShort(t.tanggal) + '</td>' +
          '<td class="px-3 py-3">' +
            '<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ' + meta.chip + '">' +
              '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">' + meta.icon + '</svg>' + meta.short +
            '</span>' +
          '</td>' +
          '<td class="max-w-[16rem] px-3 py-3">' +
            '<p class="truncate text-sm font-semibold text-slate-700" title="' + escapeHtml(t.keterangan) + '">' + escapeHtml(t.keterangan) + '</p>' +
          '</td>' +
          '<td class="px-3 py-3"><div class="flex justify-center">' + photoThumbHTML(t) + '</div></td>' +
          '<td class="tnum whitespace-nowrap px-3 py-3 text-right text-sm font-extrabold ' + meta.text + '">' + meta.sign + rupiah(t.nominal) + '</td>' +
          '<td class="px-3 py-3"><div class="flex justify-end gap-0.5">' + actionsHTML(t) + '</div></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="overflow-x-auto rounded-2xl border border-slate-100">' +
        '<table class="w-full min-w-[640px] border-collapse bg-white text-left">' +
          '<thead>' +
            '<tr class="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">' +
              '<th class="px-3 py-2.5">Tanggal</th>' +
              '<th class="px-3 py-2.5">Jenis</th>' +
              '<th class="px-3 py-2.5">Keterangan</th>' +
              '<th class="px-3 py-2.5 text-center">Bukti</th>' +
              '<th class="px-3 py-2.5 text-right">Nominal</th>' +
              '<th class="px-3 py-2.5 text-right">Aksi</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  /** Render riwayat + hitungan + ringkasan filter. */
  function renderHistory() {
    const list = getVisibleTransactions();

    // Simpan urutan id untuk navigasi lightbox (hanya yang punya foto)
    state.lightboxIds = list.filter(function (t) { return !!t.foto; }).map(function (t) { return t.id; });

    if (!list.length) {
      el.historyList.innerHTML = emptyStateHTML();
    } else {
      el.historyList.innerHTML = (state.view === 'table') ? renderTable(list) : renderCardList(list);
    }

    // Hitungan & ringkasan
    const shown = list.length;
    const totalAll = state.transactions.length;
    el.historyCount.textContent = (shown === totalAll)
      ? totalAll + ' transaksi'
      : shown + ' dari ' + totalAll + ' transaksi';

    if (shown > 0) {
      const sums = computeTotals(list);
      el.historyFooter.classList.remove('hidden');
      el.historyFooter.classList.add('flex');
      el.filteredSummary.textContent = 'Tampil â€” masuk ' + rupiah(sums.income) +
        ' â€¢ keluar ' + rupiah(sums.expense) + ' â€¢ selisih ' + rupiah(sums.balance);
    } else {
      el.historyFooter.classList.add('hidden');
      el.historyFooter.classList.remove('flex');
      el.filteredSummary.textContent = 'â€”';
    }
  }

  /** Isi dropdown filter bulan dari transaksi yang ada (terbaru dulu). */
  function renderMonthOptions() {
    const keys = {};
    state.transactions.forEach(function (t) { keys[monthKey(t.tanggal)] = true; });

    const currentKey = toISODate(new Date()).slice(0, 7);
    keys[currentKey] = true;

    const sorted = Object.keys(keys).filter(Boolean).sort().reverse();
    const prev = state.filters.month;

    el.monthFilter.innerHTML = '<option value="all">Semua bulan</option>' +
      sorted.map(function (k) {
        return '<option value="' + k + '">' + escapeHtml(monthLabel(k)) + '</option>';
      }).join('');

    el.monthFilter.value = (prev !== 'all' && sorted.indexOf(prev) > -1) ? prev : 'all';
    state.filters.month = el.monthFilter.value;
  }

  /** Render ulang seluruh tampilan (dipakai setelah setiap perubahan data). */
  function renderAll() {
    renderDashboard();
    renderMonthOptions();
    renderHistory();
    el.sortSelect.value = state.filters.sort;
    $$('.chip-filter').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-filter') === state.filters.jenis);
    });
  }

  /* ==================== 8. AKSI CRUD ==================== */

  function persistOrWarn(result, actionLabel) {
    if (!result.ok) {
      toast('Gagal menyimpan: penyimpanan browser penuh. Hapus beberapa foto lalu coba lagi.', 'error', 7000);
      return false;
    }
    if (result.quota) {
      toast(actionLabel + ', tapi ' + result.dropped + ' foto dilepas karena penyimpanan penuh.', 'warn', 7000);
    }
    return true;
  }

  /** Simpan transaksi baru atau perbarui transaksi yang sedang diedit. */
  function handleSubmit(e) {
    if (e) e.preventDefault();

    const data = validateForm();
    if (!data) return;

    const editingId = state.form.id;
    const now = Date.now();

    if (editingId) {
      const idx = state.transactions.findIndex(function (t) { return t.id === editingId; });
      if (idx === -1) {
        toast('Transaksi yang diedit tidak ditemukan.', 'error');
        resetForm();
        return;
      }
      const prev = state.transactions[idx];
      state.transactions[idx] = Object.assign({}, prev, {
        jenis: data.jenis,
        nominal: data.nominal,
        keterangan: data.keterangan,
        tanggal: data.tanggal,
        foto: data.foto,
        fotoName: data.fotoName,
        updatedAt: now,
      });

      const res = saveTransactions();
      if (!persistOrWarn(res, 'Perubahan disimpan')) { state.transactions[idx] = prev; return; }
      toast('Transaksi berhasil diperbarui.', 'success');
    } else {
      const tx = {
        id: uid(),
        jenis: data.jenis,
        nominal: data.nominal,
        keterangan: data.keterangan,
        tanggal: data.tanggal,
        foto: data.foto,
        fotoName: data.fotoName,
        createdAt: now,
        updatedAt: now,
      };
      state.transactions.push(tx);

      const res = saveTransactions();
      if (!persistOrWarn(res, 'Transaksi disimpan')) { state.transactions.pop(); return; }
      toast(jenisMeta(tx.jenis).label + ' ' + rupiah(tx.nominal) + ' tersimpan.', 'success');
    }

    state.form.id = null;
    resetForm();
    renderAll();

    // Gulir ke riwayat di layar kecil agar hasil langsung terlihat.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      el.historyList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Bersihkan form & keluar dari mode edit. */
  function resetForm() {
    state.form.id = null;
    state.form.foto = null;
    state.form.fotoName = '';
    el.form.reset();
    el.txId.value = '';

    el.tanggal.value = toISODate(new Date());

    const firstRadio = el.form.querySelector('input[name="jenis"][value="pemasukan"]');
    if (firstRadio) firstRadio.checked = true;

    clearPhoto();
    clearAllErrors();

    el.formTitle.textContent = 'Tambah Transaksi';
    el.formMode.textContent = 'Isi form di bawah untuk mencatat keuangan.';
    el.btnSubmitLabel.textContent = 'Simpan Transaksi';
    el.btnResetForm.classList.add('hidden');
  }

  /** Masuk mode edit: isi form dengan data transaksi terpilih. */
  function startEdit(id) {
    const t = state.transactions.find(function (x) { return x.id === id; });
    if (!t) { toast('Transaksi tidak ditemukan.', 'error'); return; }

    state.form.id = t.id;
    state.form.foto = t.foto || null;
    state.form.fotoName = t.fotoName || '';

    el.txId.value = t.id;
    el.nominal.value = String(t.nominal);
    el.keterangan.value = t.keterangan;
    el.tanggal.value = t.tanggal;

    const radio = el.form.querySelector('input[name="jenis"][value="' + t.jenis + '"]');
    if (radio) radio.checked = true;

    if (t.foto) {
      renderPhotoPreview(t.fotoName || 'bukti.jpg', dataUrlBytes(t.foto), t.foto.length);
    } else {
      clearPhoto();
    }

    clearAllErrors();
    el.formTitle.textContent = 'Edit Transaksi';
    el.formMode.textContent = 'Perbarui data lalu simpan kembali.';
    el.btnSubmitLabel.textContent = 'Simpan Perubahan';
    el.btnResetForm.classList.remove('hidden');

    if (window.matchMedia('(max-width: 1023px)').matches) {
      el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      try { el.nominal.focus(); el.nominal.select(); } catch (err) { /* noop */ }
    }
  }

  /** Hapus satu transaksi (dengan konfirmasi). */
  async function handleDelete(id) {
    const t = state.transactions.find(function (x) { return x.id === id; });
    if (!t) { toast('Transaksi tidak ditemukan.', 'error'); return; }

    const ok = await confirmDialog({
      title: 'Hapus transaksi?',
      message: '"' + t.keterangan + '" sebesar ' + rupiah(t.nominal) + ' (' + formatDateLong(t.tanggal) + ') akan dihapus permanen.',
      confirmLabel: 'Ya, hapus',
      icon: 'ðŸ—‘ï¸',
    });
    if (!ok) return;

    const before = state.transactions.slice();
    state.transactions = state.transactions.filter(function (x) { return x.id !== id; });

    const res = saveTransactions();
    if (!res.ok) { state.transactions = before; persistOrWarn(res, 'Gagal menghapus'); return; }

    // Jika transaksi yang sedang diedit justru dihapus, keluar dari mode edit.
    if (state.form.id === id) resetForm();

    toast('Transaksi dihapus.', 'success');
    renderAll();
  }

  /** Hapus seluruh data (dengan konfirmasi berlapis). */
  async function handleClearAll() {
    closeMenu();
    if (!state.transactions.length) { toast('Belum ada data untuk dihapus.', 'info'); return; }

    const ok = await confirmDialog({
      title: 'Hapus semua data?',
      message: 'Seluruh ' + state.transactions.length + ' transaksi beserta foto buktinya akan dihapus permanen dari browser ini. Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Hapus semua',
      icon: 'âš ï¸',
    });
    if (!ok) return;

    if (state.transactions.some(function (t) { return !!t.foto; })) {
      const sure = await confirmDialog({
        title: 'Yakin sekali?',
        message: 'Ada data dengan bukti foto yang juga akan hilang. Sebaiknya export dulu sebagai cadangan.',
        confirmLabel: 'Ya, saya yakin',
        icon: 'ðŸ”¥',
      });
      if (!sure) return;
    }

    state.transactions = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }

    resetForm();
    renderAll();
    toast('Semua data berhasil dihapus.', 'success');
  }

  /* ==================== 9. UI: TOAST, DIALOG, LIGHTBOX, MENU ==================== */

  const TOAST_STYLES = {
    success: { ring: 'ring-emerald-200', bg: 'bg-white', icon: 'âœ…', bar: 'bg-emerald-500' },
    error:   { ring: 'ring-rose-200',    bg: 'bg-white', icon: 'â›”', bar: 'bg-rose-500' },
    warn:    { ring: 'ring-amber-200',   bg: 'bg-white', icon: 'âš ï¸', bar: 'bg-amber-500' },
    info:    { ring: 'ring-brand-200',   bg: 'bg-white', icon: 'â„¹ï¸', bar: 'bg-brand-500' },
  };

  /** Notifikasi kecil di sudut layar. */
  function toast(message, type, duration) {
    if (!el.toastStack) return;
    const style = TOAST_STYLES[type] || TOAST_STYLES.info;
    const node = document.createElement('div');
    node.className = 'pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-soft ring-1 ' +
      style.ring + ' ' + style.bg + ' animate-toast-in';
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    node.innerHTML =
      '<div class="flex items-start gap-3 p-3.5">' +
        '<span class="text-base leading-none">' + style.icon + '</span>' +
        '<p class="flex-1 text-sm font-semibold text-slate-700">' + escapeHtml(message) + '</p>' +
        '<button type="button" class="shrink-0 rounded-lg px-1.5 text-slate-400 transition hover:text-slate-600" aria-label="Tutup notifikasi">&times;</button>' +
      '</div>' +
      '<div class="h-0.5 w-full bg-slate-100"><div class="h-full ' + style.bar + '" style="width:100%;transition:width ' + (duration || 3400) + 'ms linear"></div></div>';

    el.toastStack.appendChild(node);

    const bar = node.querySelector('div > div');
    const closeBtn = node.querySelector('button');
    let timer = null;

    const remove = function () {
      if (timer) clearTimeout(timer);
      node.style.transition = 'opacity .2s ease, transform .2s ease';
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 200);
    };

    closeBtn.addEventListener('click', remove);

    requestAnimationFrame(function () {
      if (bar) bar.style.width = '0%';
    });
    timer = setTimeout(remove, duration || 3400);
  }

  /** Tampilkan dialog konfirmasi; mengembalikan Promise<boolean>. */
  function confirmDialog(opts) {
    const o = opts || {};
    return new Promise(function (resolve) {
      // Tutup dialog sebelumnya bila masih terbuka.
      if (state.confirmResolver) { state.confirmResolver(false); state.confirmResolver = null; }

      state.confirmResolver = resolve;
      state.prevFocus = document.activeElement;

      el.dialogTitle.textContent = o.title || 'Konfirmasi';
      el.dialogMessage.textContent = o.message || 'Apakah Anda yakin?';
      if (el.dialogIcon) el.dialogIcon.textContent = o.icon || 'âš ï¸';
      el.dialogConfirm.textContent = o.confirmLabel || 'Ya, lanjutkan';

      el.modal.classList.remove('hidden');
      el.modal.classList.add('flex');
      document.body.style.overflow = 'hidden';
      setTimeout(function () { try { el.dialogCancel.focus(); } catch (e) { /* noop */ } }, 30);
    });
  }

  function closeDialog(result) {
    if (!el.modal || el.modal.classList.contains('hidden')) return;
    el.modal.classList.add('hidden');
    el.modal.classList.remove('flex');
    document.body.style.overflow = '';

    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    if (resolver) resolver(!!result);

    if (state.prevFocus && typeof state.prevFocus.focus === 'function') {
      try { state.prevFocus.focus(); } catch (e) { /* noop */ }
    }
    state.prevFocus = null;
  }

  /* ---------------------------- LIGHTBOX ---------------------------- */

  /** Buka lightbox untuk transaksi tertentu (bisa maju/mundur antar foto). */
  function openLightbox(id) {
    const t = state.transactions.find(function (x) { return x.id === id; });
    if (!t || !t.foto) { toast('Transaksi ini tidak memiliki bukti foto.', 'info'); return; }

    state.prevFocus = document.activeElement;
    const idx = state.lightboxIds.indexOf(id);
    state.lightboxIndex = idx > -1 ? idx : 0;
    renderLightbox();

    el.lightbox.classList.remove('hidden');
    el.lightbox.classList.add('flex');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { try { el.lbImage.focus(); } catch (e) { /* noop */ } }, 30);
  }

  function renderLightbox() {
    const ids = state.lightboxIds;
    if (!ids.length) { closeLightbox(); return; }
    if (state.lightboxIndex < 0) state.lightboxIndex = 0;
    if (state.lightboxIndex >= ids.length) state.lightboxIndex = ids.length - 1;

    const t = state.transactions.find(function (x) { return x.id === ids[state.lightboxIndex]; });
    if (!t) { closeLightbox(); return; }

    const meta = jenisMeta(t.jenis);
    el.lbImage.src = t.foto;
    el.lbImage.alt = 'Bukti transaksi: ' + t.keterangan;
    el.lbCaption.textContent = t.keterangan + ' â€” ' + meta.sign + rupiah(t.nominal);
    el.lbMeta.textContent = formatDateLong(t.tanggal) +
      (t.fotoName ? ' â€¢ ' + t.fotoName : '') +
      ' â€¢ ' + humanBytes(dataUrlBytes(t.foto));

    const multi = ids.length > 1;
    el.lbPrev.disabled = !multi;
    el.lbNext.disabled = !multi;
    el.lbPrev.style.opacity = multi ? '1' : '.35';
    el.lbNext.style.opacity = multi ? '1' : '.35';
  }

  function navigateLightbox(step) {
    const ids = state.lightboxIds;
    if (ids.length < 2) return;
    state.lightboxIndex = (state.lightboxIndex + step + ids.length) % ids.length;
    renderLightbox();
  }

  function closeLightbox() {
    if (!el.lightbox || el.lightbox.classList.contains('hidden')) return;
    el.lightbox.classList.add('hidden');
    el.lightbox.classList.remove('flex');
    document.body.style.overflow = '';
    el.lbImage.removeAttribute('src');
    state.lightboxIndex = -1;

    if (state.prevFocus && typeof state.prevFocus.focus === 'function') {
      try { state.prevFocus.focus(); } catch (e) { /* noop */ }
    }
    state.prevFocus = null;
  }

  /** Lightbox untuk preview form (tanpa navigasi). */
  function openFormPhoto() {
    if (!state.form.foto) return;
    state.prevFocus = document.activeElement;
    state.lightboxIds = [];
    el.lbImage.src = state.form.foto;
    el.lbImage.alt = 'Preview bukti transaksi';
    el.lbCaption.textContent = 'Preview bukti foto';
    el.lbMeta.textContent = state.form.fotoName ? state.form.fotoName + ' â€¢ ' + humanBytes(dataUrlBytes(state.form.foto)) : '';
    el.lbPrev.style.opacity = '.35';
    el.lbNext.style.opacity = '.35';
    el.lbPrev.disabled = true;
    el.lbNext.disabled = true;

    el.lightbox.classList.remove('hidden');
    el.lightbox.classList.add('flex');
    document.body.style.overflow = 'hidden';
    state.lightboxIndex = -1;
  }

  /* ------------------------------ MENU ------------------------------ */

  function openMenu() {
    el.menuPanel.classList.remove('hidden');
    el.btnMenu.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    el.menuPanel.classList.add('hidden');
    el.btnMenu.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    if (el.menuPanel.classList.contains('hidden')) openMenu(); else closeMenu();
  }

  /* -------------------------- EXPORT / IMPORT -------------------------- */

  /** Unduh seluruh data sebagai file JSON (termasuk foto Base64). */
  function exportData() {
    closeMenu();
    if (!state.transactions.length) { toast('Belum ada data untuk diexport.', 'info'); return; }

    const payload = {
      app: 'rekap-keuangan',
      version: 1,
      exportedAt: new Date().toISOString(),
      totals: computeTotals(state.transactions),
      transactions: state.transactions,
    };

    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rekap-keuangan-' + toISODate(new Date()) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('Data diexport sebagai JSON.', 'success');
    } catch (err) {
      console.error(err);
      toast('Gagal mengekspor data.', 'error');
    }
  }

  /** Import data dari file JSON (mode gabung atau ganti). */
  async function importDataFile(file) {
    if (!file) return;

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      toast('File JSON tidak valid.', 'error');
      return;
    }

    const arr = Array.isArray(parsed) ? parsed
              : (parsed && Array.isArray(parsed.transactions)) ? parsed.transactions : null;

    if (!arr || !arr.length) { toast('Tidak ada transaksi pada file tersebut.', 'error'); return; }

    const incoming = arr.map(normalizeTx).filter(function (t) { return !!t; });
    if (!incoming.length) { toast('Tidak ada transaksi valid pada file tersebut.', 'error'); return; }

    const replace = await confirmDialog({
      title: 'Import ' + incoming.length + ' transaksi',
      message: 'Klik "Ganti semua" untuk menimpa data saat ini, atau "Gabungkan" untuk menambahkan ke data yang ada.',
      confirmLabel: 'Ganti semua',
      icon: 'ðŸ“¥',
    });

    const existingIds = {};
    state.transactions.forEach(function (t) { existingIds[t.id] = true; });

    let added = 0, skipped = 0;
    if (replace) {
      state.transactions = incoming;
      added = incoming.length;
    } else {
      incoming.forEach(function (t) {
        if (existingIds[t.id]) { skipped++; return; }
        state.transactions.push(t);
        added++;
      });
    }

    const res = saveTransactions();
    if (!res.ok) { toast('Gagal menyimpan hasil import: penyimpanan penuh.', 'error', 7000); }
    else if (res.quota) { toast('Import berhasil, tapi ' + res.dropped + ' foto dilepas karena penyimpanan penuh.', 'warn', 7000); }
    else { toast(added + ' transaksi diimport' + (skipped ? ' (' + skipped + ' duplikat dilewati)' : '') + '.', 'success', 4500); }

    renderAll();
  }

  /* ==================== 10. EVENT BINDING & INISIALISASI ==================== */

  /** Ambil id transaksi dari tombol aksi yang diklik. */
  function idFromEvent(e) {
    const btn = e.target.closest ? e.target.closest('[data-id]') : null;
    return btn ? btn.getAttribute('data-id') : null;
  }

  function bindForm() {
    // Submit
    el.form.addEventListener('submit', handleSubmit);

    // Chips tanggal cepat
    $$('.chip-date').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const offset = Number(btn.getAttribute('data-offset')) || 0;
        const d = new Date();
        d.setDate(d.getDate() + offset);
        el.tanggal.value = toISODate(d);
        setFieldError('tanggal', '');
        el.tanggal.classList.remove('border-rose-400', 'bg-rose-50/40');
      });
    });

    // Input file foto -> konversi FileReader -> Base64
    el.foto.addEventListener('change', function () {
      const file = el.foto.files && el.foto.files[0];
      if (file) handlePhotoFile(file);
    });

    // Bonus: drag & drop foto ke zona upload (desktop)
    if (el.dropZone) {
      ['dragenter', 'dragover'].forEach(function (evt) {
        el.dropZone.addEventListener(evt, function (e) {
          e.preventDefault(); e.stopPropagation();
          el.dropZone.classList.add('border-brand-400', 'bg-brand-50/60');
        });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        el.dropZone.addEventListener(evt, function (e) {
          e.preventDefault(); e.stopPropagation();
          el.dropZone.classList.remove('border-brand-400', 'bg-brand-50/60');
        });
      });
      el.dropZone.addEventListener('drop', function (e) {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) handlePhotoFile(dt.files[0]);
      });
    }

    // Hapus foto terpilih
    el.btnRemoveFoto.addEventListener('click', function () {
      clearPhoto();
      setFieldError('foto', '');
    });

    // Klik preview foto form -> lightbox
    el.fotoPreview.addEventListener('click', openFormPhoto);

    // Bersihkan form
    el.btnClear.addEventListener('click', function () {
      resetForm();
      toast('Form dibersihkan.', 'info', 2000);
    });

    // Batal edit
    el.btnResetForm.addEventListener('click', function () {
      resetForm();
      toast('Mode edit dibatalkan.', 'info', 2000);
    });

    // Hapus pesan error saat user memperbaiki input
    el.nominal.addEventListener('input', function () {
      setFieldError('nominal', '');
      el.nominal.classList.remove('border-rose-400', 'bg-rose-50/40');
    });
    el.keterangan.addEventListener('input', function () {
      setFieldError('keterangan', '');
      el.keterangan.classList.remove('border-rose-400', 'bg-rose-50/40');
    });
    el.tanggal.addEventListener('change', function () {
      setFieldError('tanggal', '');
      el.tanggal.classList.remove('border-rose-400', 'bg-rose-50/40');
    });

    // Enter di field teks/nominal -> submit
    [el.nominal, el.keterangan].forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
      });
    });
  }

  function bindHistory() {
    // Delegasi klik untuk tombol aksi di dalam daftar/tabel
    el.historyList.addEventListener('click', function (e) {
      const target = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!target) return;

      const action = target.getAttribute('data-action');
      const id = idFromEvent(e);

      if (action === 'lightbox' && id) openLightbox(id);
      else if (action === 'edit' && id) startEdit(id);
      else if (action === 'delete' && id) handleDelete(id);
      else if (action === 'resetFilter') resetFilters();
    });

    // Pencarian (debounce agar tidak render setiap ketikan)
    el.searchInput.addEventListener('input', debounce(function () {
      state.filters.q = el.searchInput.value || '';
      renderHistory();
    }, 180));

    // Filter jenis
    $$('.chip-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filters.jenis = btn.getAttribute('data-filter') || 'all';
        $$('.chip-filter').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderHistory();
      });
    });

    // Filter bulan
    el.monthFilter.addEventListener('change', function () {
      state.filters.month = el.monthFilter.value;
      renderHistory();
    });

    // Urutan
    el.sortSelect.addEventListener('change', function () {
      state.filters.sort = el.sortSelect.value;
      prefs.save({ sort: state.filters.sort });
      renderHistory();
    });

    // Toggle tampilan kartu <-> tabel
    el.btnToggleView.addEventListener('click', function () {
      state.view = (state.view === 'table') ? 'list' : 'table';
      prefs.save({ view: state.view });
      renderHistory();
      toast(state.view === 'table' ? 'Tampilan tabel.' : 'Tampilan kartu.', 'info', 1600);
    });
  }

  /** Kembalikan semua filter ke kondisi awal. */
  function resetFilters() {
    state.filters.jenis = 'all';
    state.filters.month = 'all';
    state.filters.q = '';
    el.searchInput.value = '';
    el.monthFilter.value = 'all';
    $$('.chip-filter').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-filter') === 'all');
    });
    renderHistory();
  }

  function bindGlobal() {
    // Menu dropdown
    el.btnMenu.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });
    document.addEventListener('click', function (e) {
      if (!el.menuPanel.classList.contains('hidden') && !el.menuPanel.contains(e.target) && e.target !== el.btnMenu) {
        closeMenu();
      }
    });

    // Aksi menu
    el.menuPanel.addEventListener('click', function (e) {
      const btn = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'export') exportData();
      else if (action === 'import') { closeMenu(); el.importFile.click(); }
      else if (action === 'print') { closeMenu(); window.print(); }
      else if (action === 'clearAll') handleClearAll();
    });

    // File import
    el.importFile.addEventListener('change', function () {
      const file = el.importFile.files && el.importFile.files[0];
      if (file) importDataFile(file);
      el.importFile.value = '';
    });

    // FAB (mobile) -> fokus ke form
    el.fabAdd.addEventListener('click', function () {
      el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { try { el.nominal.focus(); } catch (e) { /* noop */ } }, 350);
    });

    // Dialog konfirmasi
    el.dialogConfirm.addEventListener('click', function () { closeDialog(true); });
    el.dialogCancel.addEventListener('click', function () { closeDialog(false); });
    el.modal.addEventListener('click', function (e) { if (e.target === el.modal) closeDialog(false); });

    // Lightbox
    el.lightboxClose.addEventListener('click', closeLightbox);
    el.lbPrev.addEventListener('click', function () { navigateLightbox(-1); });
    el.lbNext.addEventListener('click', function () { navigateLightbox(1); });
    el.lightbox.addEventListener('click', function (e) {
      if (e.target === el.lightbox) closeLightbox();
    });

    // Keyboard global
    document.addEventListener('keydown', function (e) {
      // ESC: tutup lapisan teratas
      if (e.key === 'Escape') {
        if (!el.lightbox.classList.contains('hidden')) { closeLightbox(); return; }
        if (!el.modal.classList.contains('hidden')) { closeDialog(false); return; }
        if (!el.menuPanel.classList.contains('hidden')) { closeMenu(); return; }
      }

      // Panah kiri/kanan saat lightbox terbuka
      if (!el.lightbox.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigateLightbox(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateLightbox(1); }
        return;
      }

      // Ctrl/Cmd + Enter -> simpan transaksi
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit(e);
      }
    });

    // Sinkronisasi antar tab: muat ulang data bila tab lain mengubah localStorage
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) {
        state.transactions = loadTransactions();
        renderAll();
        toast('Data diperbarui dari tab lain.', 'info', 2600);
      }
    });
  }

  /** Inisialisasi aplikasi. */
  function init() {
    // Muat preferensi tampilan
    const saved = prefs.load();
    if (saved.view === 'table' || saved.view === 'list') state.view = saved.view;
    if (saved.sort) {
      const opt = el.sortSelect.querySelector('option[value="' + saved.sort + '"]');
      if (opt) state.filters.sort = saved.sort;
    }

    // Muat transaksi dari localStorage
    state.transactions = loadTransactions();

    // Nilai awal form
    el.tanggal.value = toISODate(new Date());

    bindForm();
    bindHistory();
    bindGlobal();

    // Render pertama
    renderAll();

    if (state.transactions.length) {
      const totals = computeTotals(state.transactions);
      toast('Selamat datang kembali! Saldo Anda ' + rupiah(totals.balance) + '.', 'info', 4200);
    }
  }

  // Jalankan setelah DOM siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

