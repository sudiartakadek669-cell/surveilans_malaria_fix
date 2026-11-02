/* =========================================================================
   Dashboard Surveilans Malaria — Puskesmas Nusa Penida I
   app.js — versi ONLINE. Semua data disimpan di server (SQLite) lewat api.php,
   sehingga setiap perangkat yang membuka link ini melihat data yang sama.
   ========================================================================= */

/* ================================================================
   1. UTILITAS UMUM
================================================================ */
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const $ = (id) => document.getElementById(id);
const gv = (id) => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function todayISO(){
  const d = new Date();
  const p = (n) => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}
function fmtTgl(iso){
  if(!iso) return '—';
  const parts = String(iso).split('-');
  if(parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}
function fmtTanggalIndo(iso){
  if(!iso) return '-';
  const parts = String(iso).split('-');
  if(parts.length !== 3) return iso;
  const bulan = BULAN[parseInt(parts[1],10)-1] || '';
  return parseInt(parts[2],10) + ' ' + bulan + ' ' + parts[0];
}
function sortTanggal(arr){
  return arr.slice().sort((a,b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
}
function toast(msg, opts){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if(opts && opts.error) t.style.background = '#b91c1c'; else t.style.background = '#0f172a';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ================================================================
   2. LAPISAN DATA (API server)
================================================================ */
const API = 'api.php';
const DB = { migran: [], sediaan: [], obat: [], jentik: [] };
let SETTINGS = {};
let bootDone = false;
let ttdLoaded = false;

/* info akun & token keamanan (diisi dari #appMeta lalu dari bootstrap) */
const STATE = { csrf: '', user: null, admin: false, logout: 'login.php' };

function bacaMeta(){
  const meta = $('appMeta');
  if(!meta) return;
  STATE.csrf   = meta.dataset.csrf || '';
  STATE.logout = meta.dataset.logout || 'login.php';
  STATE.user   = {
    id: meta.dataset.userId || '',
    nama: meta.dataset.userNama || 'Petugas',
    username: meta.dataset.userUsername || '',
    role: meta.dataset.userRole || 'petugas'
  };
  STATE.admin  = STATE.user.role === 'admin';
}

function keLogin(){
  window.location.href = 'login.php';
}

function renderUserChip(){
  const u = STATE.user || { nama:'Petugas', role:'petugas' };
  if($('userNama')) $('userNama').textContent = u.nama || 'Petugas';
  if($('userAvatar')) $('userAvatar').textContent = (u.nama || 'P').trim().charAt(0).toUpperCase();
  if($('userRole')) $('userRole').textContent = STATE.admin ? 'Admin' : 'Petugas';
  if($('btnKelolaAkun')) $('btnKelolaAkun').hidden = !STATE.admin;
  if($('btnLogout')) $('btnLogout').href = STATE.logout;
}

function setSync(state, text){
  const pill = $('syncPill'), dot = $('syncDot'), txt = $('syncText');
  if(!pill) return;
  pill.classList.remove('ok','err');
  if(state === 'ok') pill.classList.add('ok');
  if(state === 'err') pill.classList.add('err');
  if(txt) txt.textContent = text;
}

async function apiGet(){
  const res = await fetch(API + '?action=bootstrap&_=' + Date.now(), {
    cache: 'no-store',
    headers: { 'Accept': 'application/json' }
  });
  if(res.status === 401){ keLogin(); throw new Error('Sesi berakhir'); }
  if(!res.ok) throw new Error('Server membalas ' + res.status);
  const data = await res.json();
  if(!data || data.ok !== true) throw new Error((data && data.error) || 'Respons server tidak valid');
  return data;
}

async function apiSend(action, query, payload){
  const url = API + '?action=' + encodeURIComponent(action) + (query ? '&' + query : '');
  const res = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-Token': STATE.csrf
    },
    body: JSON.stringify(payload || {})
  });
  let data = null;
  try { data = await res.json(); } catch(e){ data = null; }
  if(res.status === 401){ keLogin(); throw new Error('Sesi berakhir. Silakan masuk kembali.'); }
  if(!res.ok || !data || data.ok !== true){
    throw new Error((data && data.error) || ('Gagal menyimpan (HTTP ' + res.status + ')'));
  }
  return data;
}

function applyBootstrap(payload, opts){
  opts = opts || {};
  DB.migran  = Array.isArray(payload.migran) ? payload.migran : [];
  DB.sediaan = Array.isArray(payload.sediaan) ? payload.sediaan : [];
  DB.obat    = Array.isArray(payload.obat) ? payload.obat : [];
  DB.jentik  = Array.isArray(payload.jentik) ? payload.jentik : [];
  if(payload.ttd) SETTINGS = payload.ttd;

  if(payload.csrf) STATE.csrf = payload.csrf;
  if(payload.user){
    STATE.user = payload.user;
    STATE.admin = payload.admin === true || payload.user.role === 'admin';
    renderUserChip();
  }

  if(opts.ttd !== false && !ttdLoaded){
    loadTTDFromSettings();
    ttdLoaded = true;
  }

  renderAll();
  setSync('ok', 'Tersambung · data di server');
  lastSyncAt = new Date();
}

let lastSyncAt = null;

async function refreshData(silent){
  const btn = document.querySelector('.nav-refresh');
  if(btn) btn.disabled = true;
  if(!silent) setSync('', 'Memuat data…');
  try {
    const data = await apiGet();
    applyBootstrap(data, { ttd: false });
    if(!silent) toast('Data terbaru berhasil dimuat.');
  } catch(err){
    setSync('err', 'Gagal terhubung');
    toast('Gagal memuat data: ' + err.message, { error: true });
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function apiSave(res, record){
  const q = 'res=' + encodeURIComponent(res);
  const data = await apiSend('save', q, record);
  applyBootstrap(data, { ttd: false });
  return data;
}

async function apiDelete(res, id){
  const q = 'res=' + encodeURIComponent(res) + '&id=' + encodeURIComponent(id);
  const data = await apiSend('delete', q, {});
  applyBootstrap(data, { ttd: false });
  return data;
}

/* ================================================================
   3. DATALIST WILAYAH INDONESIA
================================================================ */
const WILAYAH = {
  'Aceh': ['Banda Aceh','Aceh Besar','Lhokseumawe','Langsa','Sabang','Meulaboh','Aceh Tengah'],
  'Sumatera Utara': ['Medan','Deli Serdang','Binjai','Pematang Siantar','Tebing Tinggi','Sibolga','Karo','Nias','Labuhanbatu'],
  'Sumatera Barat': ['Padang','Bukittinggi','Payakumbuh','Solok','Agam','Tanah Datar','Pesisir Selatan'],
  'Riau': ['Pekanbaru','Dumai','Kampar','Siak','Indragiri Hilir','Rokan Hulu'],
  'Kepulauan Riau': ['Tanjung Pinang','Batam','Bintan','Karimun','Natuna'],
  'Jambi': ['Jambi','Muaro Jambi','Batanghari','Kerinci','Sungai Penuh'],
  'Sumatera Selatan': ['Palembang','Prabumulih','Muara Enim','Lahat','Ogan Ilir','Musi Banyuasin'],
  'Bangka Belitung': ['Pangkal Pinang','Bangka','Bangka Barat','Belitung'],
  'Bengkulu': ['Bengkulu','Rejang Lebong','Seluma','Muko Muko'],
  'Lampung': ['Bandar Lampung','Metro','Lampung Selatan','Lampung Tengah','Tanggamus'],
  'Banten': ['Serang','Cilegon','Tangerang','Tangerang Selatan','Pandeglang','Lebak'],
  'DKI Jakarta': ['Jakarta Pusat','Jakarta Selatan','Jakarta Barat','Jakarta Timur','Jakarta Utara'],
  'Jawa Barat': ['Bandung','Kota Bandung','Bogor','Kota Bogor','Depok','Bekasi','Kota Bekasi','Cimahi','Sukabumi','Tasikmalaya','Karawang','Cirebon'],
  'Jawa Tengah': ['Semarang','Kota Semarang','Surakarta','Magelang','Purwokerto','Klaten','Jepara','Kudus','Tegal','Pekalongan'],
  'DI Yogyakarta': ['Yogyakarta','Sleman','Bantul','Gunungkidul','Kulon Progo'],
  'Jawa Timur': ['Surabaya','Malang','Kota Malang','Kediri','Kota Kediri','Jember','Banyuwangi','Sidoarjo','Gresik','Madiun','Probolinggo','Pasuruan','Bojonegoro','Tulungagung'],
  'Bali': ['Denpasar','Badung','Gianyar','Tabanan','Klungkung','Bangli','Karangasem','Buleleng','Jembrana'],
  'Nusa Tenggara Barat': ['Lombok Timur','Lombok Barat','Lombok Tengah','Lombok Utara','Mataram','Sumbawa','Sumbawa Barat','Dompu','Bima','Kota Bima'],
  'Nusa Tenggara Timur': ['Sumba Barat Daya','Sumba Timur','Sumba Barat','Sumba Tengah','Flores Timur','Manggarai','Manggarai Barat','Manggarai Timur','Ende','Ngada','Nagekeo','Sikka','Lembata','Alor','Belu','Malaka','Timor Tengah Selatan','Timor Tengah Utara','Kupang','Kota Kupang','Rote Ndao','Sabu Raijua'],
  'Kalimantan Barat': ['Pontianak','Kota Pontianak','Singkawang','Sintang','Ketapang','Sambas'],
  'Kalimantan Tengah': ['Palangka Raya','Kotawaringin Timur','Kapuas','Barito Utara'],
  'Kalimantan Selatan': ['Banjarmasin','Banjarbaru','Banjar','Tanah Laut','Tabalong'],
  'Kalimantan Timur': ['Samarinda','Balikpapan','Bontang','Kutai Kartanegara','Berau','Penajam Paser Utara'],
  'Kalimantan Utara': ['Tarakan','Bulungan','Nunukan','Malinau'],
  'Sulawesi Utara': ['Manado','Bitung','Tomohon','Minahasa','Kotamobagu'],
  'Gorontalo': ['Gorontalo','Kota Gorontalo','Boalemo','Pohuwato'],
  'Sulawesi Tengah': ['Palu','Poso','Banggai','Morowali','Tolitoli'],
  'Sulawesi Barat': ['Mamuju','Majene','Polewali Mandar','Mamasa'],
  'Sulawesi Selatan': ['Makassar','Gowa','Maros','Pangkep','Parepare','Palopo','Bulukumba','Sinjai','Bone'],
  'Sulawesi Tenggara': ['Kendari','Baubau','Kolaka','Konawe','Wakatobi','Buton'],
  'Maluku': ['Ambon','Maluku Tengah','Maluku Tenggara','Buru'],
  'Maluku Utara': ['Ternate','Tidore Kepulauan','Sofifi','Halmahera Utara','Kepulauan Sula'],
  'Papua': ['Jayapura','Kota Jayapura','Timika','Merauke','Nabire','Biak Numfor','Keerom','Sarmi'],
  'Papua Barat': ['Manokwari','Sorong','Kota Sorong','Fakfak','Teluk Bintuni','Kaimana'],
  'Papua Barat Daya': ['Raja Ampat','Tambrauw','Maybrat','Sorong Selatan'],
  'Papua Tengah': ['Mimika','Paniai','Deiyai','Dogiyai','Nabire'],
  'Papua Selatan': ['Merauke','Asmat','Mappi','Boven Digoel'],
  'Papua Pegunungan': ['Jayawijaya','Lanny Jaya','Tolikara','Yahukimo','Nduga']
};

function initWilayah(){
  const dl = $('daftarAsal');
  if(!dl) return;
  let html = '';
  Object.keys(WILAYAH).forEach(prov => {
    html += '<option value="Provinsi ' + esc(prov) + '"></option>';
    WILAYAH[prov].forEach(kab => {
      html += '<option value="' + esc(kab + ' – ' + prov) + '"></option>';
    });
  });
  dl.innerHTML = html;
}

/* ================================================================
   4. NAVIGASI TAB
================================================================ */
function showTab(tab){
  document.querySelectorAll('.menu-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === 'menu-' + tab);
  });
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
  setTimeout(() => {
    if(tab === 'migran' && maps.migran) maps.migran.invalidateSize();
    if(tab === 'jentik' && maps.jentik) maps.jentik.invalidateSize();
  }, 120);
}

/* ================================================================
   5. BADGE / TEKS BANTU
================================================================ */
function badgeJK(jk){
  if(jk === 'L') return '<span class="badge badge-l">L</span>';
  if(jk === 'P') return '<span class="badge badge-p">P</span>';
  return '<span class="badge badge-netral">—</span>';
}
function rdtText(r){
  if(!r.rdt) return '—';
  if(r.rdt === 'Positif') return 'Positif' + (r.rdtJenis ? ' (' + r.rdtJenis + ')' : '');
  return r.rdt;
}
function rdtBadge(r){
  if(!r.rdt) return '<span class="badge badge-netral">—</span>';
  const cls = r.rdt === 'Positif' ? 'badge-pos' : (r.rdt === 'Negatif' ? 'badge-neg' : 'badge-netral');
  return '<span class="badge ' + cls + '">' + esc(rdtText(r)) + '</span>';
}
function hasilBadge(hasil){
  const h = String(hasil || '');
  if(!h) return '<span class="badge badge-warn">Belum diperiksa</span>';
  let cls = 'badge-netral';
  if(h.indexOf('Positif') === 0) cls = 'badge-pos';
  else if(h === 'Negatif') cls = 'badge-neg';
  return '<span class="badge ' + cls + '">' + esc(h) + '</span>';
}
function kepadatanBadge(v){
  const s = String(v || '');
  if(!s) return '<span class="badge badge-netral">—</span>';
  let cls = 'badge-netral';
  if(s.indexOf('Tinggi') === 0) cls = 'badge-pos';
  else if(s.indexOf('Sedang') === 0) cls = 'badge-warn';
  else if(s.indexOf('Rendah') === 0) cls = 'badge-info';
  else if(s.indexOf('Tidak Ada') === 0) cls = 'badge-neg';
  return '<span class="badge ' + cls + '">' + esc(s) + '</span>';
}
function gejalaText(r){
  const list = (r.gejala || []).slice();
  if(r.gejalaLain) list.push(r.gejalaLain);
  return list.filter(Boolean).join(', ') || '—';
}
function predatorText(r){
  const list = (r.predator || []).slice();
  if(r.predatorLain) list.push(r.predatorLain);
  return list.filter(Boolean).join(', ') || '—';
}
function kondisiText(r){ return (r.kondisi || []).filter(Boolean).join(', ') || '—'; }
function intervensiText(r){
  const list = (r.intervensi || []).slice();
  if(r.intervensiLain) list.push(r.intervensiLain);
  return list.filter(Boolean).join(', ') || '—';
}
function parameterText(r){
  const p = [];
  if(r.suhu) p.push(r.suhu + ' °C');
  if(r.ph) p.push('pH ' + r.ph);
  if(r.salinitas) p.push(r.salinitas);
  if(r.kejernihan) p.push(r.kejernihan);
  if(r.sumber) p.push(r.sumber);
  return p.join(' · ') || '—';
}

/* ================================================================
   6. DEFINISI KOLOM (dipakai tabel & PDF)
================================================================ */
const COLS = {
  migran: [
    { label:'No', w:8, html:(r,i)=>i+1, pdf:(r,i)=>i+1 },
    { label:'Tgl', w:18, html:r=>fmtTgl(r.tanggal), pdf:r=>fmtTgl(r.tanggal) },
    { label:'Lokasi', w:44, html:r=>esc(r.lokasi) || '—', pdf:r=>r.lokasi || '—' },
    { label:'Nama', w:30, html:r=>'<strong>' + esc(r.nama) + '</strong>', pdf:r=>r.nama || '—' },
    { label:'No. KTP', w:28, html:r=>ktpText(r.ktp) ? '<span class="nowrap">' + esc(ktpText(r.ktp)) + '</span>' : '<span class="muted">—</span>', pdf:r=>ktpText(r.ktp) || '—' },
    { label:'Umur', w:11, html:r=>esc(r.umur) || '—', pdf:r=>r.umur || '—' },
    { label:'L/P', w:10, html:r=>badgeJK(r.jk), pdf:r=>r.jk || '—' },
    { label:'Asal Migran', w:34, html:r=>esc(r.asal) || '—', pdf:r=>r.asal || '—' },
    { label:'RDT', w:22, html:r=>rdtBadge(r), pdf:r=>rdtText(r) },
    { label:'Gejala', w:46, html:r=>'<span class="gejala-cell">' + esc(gejalaText(r)) + '</span>', pdf:r=>gejalaText(r) }
  ],
  sediaan: [
    { label:'No', w:9, html:(r,i)=>i+1, pdf:(r,i)=>i+1 },
    { label:'Tgl', w:20, html:r=>fmtTgl(r.tanggal), pdf:r=>fmtTgl(r.tanggal) },
    { label:'Kode Slide', w:32, html:r=>r.kode ? '<strong>' + esc(r.kode) + '</strong>' : '<span class="muted">—</span>', pdf:r=>r.kode || '—' },
    { label:'Nama', w:44, html:r=>esc(r.nama) || '—', pdf:r=>r.nama || '—' },
    { label:'Umur', w:12, html:r=>esc(r.umur) || '—', pdf:r=>r.umur || '—' },
    { label:'L/P', w:11, html:r=>badgeJK(r.jk), pdf:r=>r.jk || '—' },
    { label:'Hasil', w:30, html:r=>hasilBadge(r.hasil), pdf:r=>r.hasil || 'Belum diperiksa' },
    { label:'Lab', w:36, html:r=>esc(r.lab) || '—', pdf:r=>r.lab || '—' }
  ],
  obat: [
    { label:'No', w:9, html:(r,i)=>i+1, pdf:(r,i)=>i+1 },
    { label:'Tgl', w:22, html:r=>fmtTgl(r.tanggal), pdf:r=>fmtTgl(r.tanggal) },
    { label:'Nama', w:44, html:r=>'<strong>' + esc(r.nama) + '</strong>', pdf:r=>r.nama || '—' },
    { label:'Umur', w:13, html:r=>esc(r.umur) || '—', pdf:r=>r.umur || '—' },
    { label:'L/P', w:11, html:r=>badgeJK(r.jk), pdf:r=>r.jk || '—' },
    { label:'Hasil', w:28, html:r=>hasilBadge(r.hasil), pdf:r=>r.hasil || '—' },
    { label:'Obat', w:52, html:r=>esc(r.obat) || '—', pdf:r=>r.obat || '—' },
    { label:'Dosis', w:44, html:r=>esc(r.dosis) || '—', pdf:r=>r.dosis || '—' }
  ],
  jentik: [
    { label:'No', w:8, html:(r,i)=>i+1, pdf:(r,i)=>i+1 },
    { label:'Tgl', w:17, html:r=>fmtTgl(r.tanggal), pdf:r=>fmtTgl(r.tanggal) },
    { label:'Lokasi Perindukan', w:34, html:r=>esc(r.lokasi) || '—', pdf:r=>r.lokasi || '—' },
    { label:'Parameter Air', w:36, html:r=>esc(parameterText(r)), pdf:r=>parameterText(r) },
    { label:'Kepadatan', w:26, html:r=>kepadatanBadge(r.kepadatan), pdf:r=>r.kepadatan || '—' },
    { label:'Predator', w:40, html:r=>esc(predatorText(r)), pdf:r=>predatorText(r) },
    { label:'Intervensi', w:40, html:r=>esc(intervensiText(r)), pdf:r=>intervensiText(r) }
  ]
};

const TITLES = {
  migran:'Data Survei Migran',
  sediaan:'Pemeriksaan Sediaan Darah',
  obat:'Pengobatan Malaria',
  jentik:'Survei Jentik Nyamuk'
};

function aksiButtons(tipe, id){
  return '<button type="button" class="btn btn-warning btn-sm" onclick="editData(\'' + tipe + '\',\'' + id + '\')">Edit</button>' +
         '<button type="button" class="btn btn-danger btn-sm" onclick="hapusData(\'' + tipe + '\',\'' + id + '\')">Hapus</button>';
}

/* ================================================================
   7. RENDER TABEL
================================================================ */
function renderTable(tipe, tbodyId, badgeId, colspan){
  const tbody = $(tbodyId);
  if(!tbody) return;
  const rows = sortTanggal(DB[tipe]);
  if(badgeId && $(badgeId)) $(badgeId).textContent = rows.length + ' data';
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="empty">Belum ada data. Silakan isi form di atas.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => {
    const cls = r.placeholder ? ' class="row-placeholder"' : '';
    return '<tr' + cls + '>' + COLS[tipe].map(c => '<td>' + c.html(r, i) + '</td>').join('') +
           '<td class="aksi">' + aksiButtons(tipe, r.id) + '</td></tr>';
  }).join('');
}

function renderMigran(){ renderTable('migran', 'tbodyMigran', 'badgeMigran', COLS.migran.length + 1); }
function renderSediaan(){ renderTable('sediaan', 'tbodySediaan', 'badgeSediaan', COLS.sediaan.length + 1); }
function renderObat(){ renderTable('obat', 'tbodyObat', 'badgeObat', COLS.obat.length + 1); }
function renderJentik(){ renderTable('jentik', 'tbodyJentik', 'badgeJentik', COLS.jentik.length + 1); }

function renderMigranOptions(){
  const sel = $('s_migran');
  if(!sel) return;
  const cur = sel.value;
  const opts = ['<option value="">-- Pilih migran --</option>'];
  sortTanggal(DB.migran).forEach(m => {
    opts.push('<option value="' + esc(m.id) + '">' + esc(m.nama) + ' — ' + esc(m.umur || '?') + ' th — ' + esc(m.jk || '-') +
              (m.asal ? ' — ' + esc(m.asal) : '') + '</option>');
  });
  sel.innerHTML = opts.join('');
  if(DB.migran.some(m => m.id === cur)) sel.value = cur;
}

function renderPasienOptions(){
  const sel = $('o_pasien');
  if(!sel) return;
  const cur = sel.value;
  const positif = sortTanggal(DB.sediaan).filter(s => String(s.hasil || '').toLowerCase().indexOf('positif') > -1);
  const opts = ['<option value="">-- Pilih pasien positif --</option>'];
  positif.forEach(s => {
    opts.push('<option value="' + esc(s.id) + '">' + esc(s.nama) + ' — ' + esc(s.umur || '?') + ' th — ' + esc(s.jk || '-') +
              ' — ' + esc(s.hasil) + (s.kode ? ' — ' + esc(s.kode) : '') + '</option>');
  });
  sel.innerHTML = opts.join('');
  if(DB.sediaan.some(s => s.id === cur)) sel.value = cur;
}

function updateStats(){
  const positif = DB.sediaan.filter(s => String(s.hasil || '').toLowerCase().indexOf('positif') > -1).length;
  if($('statMigran')) $('statMigran').textContent = DB.migran.length;
  if($('statSediaan')) $('statSediaan').textContent = DB.sediaan.length;
  if($('statPositif')) $('statPositif').textContent = positif;
  if($('statObat')) $('statObat').textContent = DB.obat.length;
  if($('statJentik')) $('statJentik').textContent = DB.jentik.length;
}

function renderAll(){
  renderMigran();
  renderSediaan();
  renderObat();
  renderJentik();
  renderMigranOptions();
  renderPasienOptions();
  updateStats();
}

/* ================================================================
   8. MENU 1 — SIMPAN / EDIT / HAPUS MIGRAN
================================================================ */
function toggleRdtJenis(){
  const rdt = document.querySelector('input[name="m_rdt"]:checked');
  $('rdtJenisWrap').style.display = (rdt && rdt.value === 'Positif') ? 'flex' : 'none';
}

/* Nomor KTP/NIK: hanya angka, maksimal 16 digit.
   Dipakai saat mengetik (oninput di form) dan untuk rapi-rapi data lama. */
function rapikanKTP(el){
  const bersih = String(el.value || '').replace(/\D+/g, '').slice(0, 16);
  if(el.value !== bersih) el.value = bersih;
}

function ktpText(v){
  const s = String(v === null || v === undefined ? '' : v).replace(/\D+/g, '');
  return s ? s : '';
}

/* Lokasi migran = gabungan "banjar-desa" (contoh: bodong-ped).
   Banjar diketik manual, Desa dipilih dari daftar. Keduanya tidak lagi tampil
   sebagai kolom sendiri di tabel/PDF — hasilnya masuk ke kolom Lokasi. */
function lokasiMigran(banjar, desa){
  const b = String(banjar === null || banjar === undefined ? '' : banjar).trim();
  const d = String(desa === null || desa === undefined ? '' : desa).trim();
  if(b && d) return b + '-' + d;
  return b || d || '';
}

function syncLokasiMigran(){
  const el = $('m_lokasi');
  if(!el) return;
  el.value = lokasiMigran(gv('m_banjar'), gv('m_desa'));
}

function collectMigran(){
  const rdtEl = document.querySelector('input[name="m_rdt"]:checked');
  const rdt = rdtEl ? rdtEl.value : '';
  return {
    id: gv('editIdMigran'),
    tanggal: gv('m_tanggal'),
    lokasi: lokasiMigran(gv('m_banjar'), gv('m_desa')) || gv('m_lokasi'),
    titik: gv('m_titik'),
    nama: gv('m_nama'),
    ktp: gv('m_ktp'),
    umur: gv('m_umur'),
    jk: gv('m_jk'),
    asal: gv('m_asal'),
    banjar: gv('m_banjar'),
    desa: gv('m_desa'),
    alamat: gv('m_alamat'),
    rdt: rdt,
    rdtJenis: rdt === 'Positif' ? gv('m_rdtJenis') : '',
    gejala: Array.from(document.querySelectorAll('input[name="m_gejala"]:checked')).map(el => el.value),
    gejalaLain: gv('m_gejalaLain'),
    riwayat: gv('m_riwayat')
  };
}

async function simpanMigran(e){
  if(e) e.preventDefault();
  const data = collectMigran();
  /* Semua field opsional. Hanya No. KTP yang diberi konfirmasi bila jumlah
     angkanya bukan 16 (agar salah ketik tidak masuk diam-diam) — tetap bisa disimpan. */
  if(data.ktp && data.ktp.length !== 16){
    const lanjut = confirm('No. KTP yang Anda isi ' + data.ktp.length + ' angka, bukan 16 angka.\n\n' +
      'Klik OK untuk tetap menyimpan, atau Batal untuk memperbaiki dulu.');
    if(!lanjut){
      const el = $('m_ktp');
      if(el){ el.focus(); el.select(); }
      return;
    }
  }

  const editing = !!data.id;
  const form = $('formMigran');
  form.classList.add('saving');
  try {
    await apiSave('migran', data);
    toast(editing ? 'Data migran berhasil diperbarui.'
                  : 'Data migran disimpan & diteruskan ke Menu 2 (Sediaan Darah).');
    resetFormMigran();
  } catch(err){
    setSync('err', 'Gagal menyimpan');
    alert('Gagal menyimpan data migran:\n' + err.message);
  } finally {
    form.classList.remove('saving');
  }
}

function editMigran(id){
  const r = DB.migran.find(x => x.id === id);
  if(!r) return;
  showTab('migran');

  $('editIdMigran').value = r.id;
  $('editBannerMigran').classList.add('show');
  $('btnBatalMigran').style.display = 'inline-flex';

  $('m_tanggal').value = r.tanggal || '';
  $('m_titik').value = r.titik || '';
  $('m_nama').value = r.nama || '';
  $('m_ktp').value = ktpText(r.ktp);
  $('m_umur').value = r.umur || '';
  $('m_jk').value = r.jk || 'L';
  $('m_asal').value = r.asal || '';
  $('m_banjar').value = r.banjar || '';
  $('m_desa').value = r.desa || '';
  /* lokasi = banjar-desa; kalau data lama belum punya banjar/desa, pakai lokasi lamanya */
  $('m_lokasi').value = lokasiMigran(r.banjar, r.desa) || r.lokasi || '';
  $('m_alamat').value = r.alamat || '';
  document.querySelectorAll('input[name="m_rdt"]').forEach(el => { el.checked = (el.value === (r.rdt || 'Tidak Periksa')); });
  toggleRdtJenis();
  $('m_rdtJenis').value = r.rdtJenis || 'Pf';
  const g = r.gejala || [];
  document.querySelectorAll('input[name="m_gejala"]').forEach(el => { el.checked = g.indexOf(el.value) > -1; });
  $('m_gejalaLain').value = r.gejalaLain || '';
  $('m_riwayat').value = r.riwayat || '';

  setTitikToMap('migran', r.titik);
  setTimeout(() => { $('formMigran').scrollIntoView({ behavior:'smooth', block:'start' }); }, 220);
}

function resetFormMigran(){
  $('formMigran').reset();
  $('editIdMigran').value = '';
  $('editBannerMigran').classList.remove('show');
  $('btnBatalMigran').style.display = 'none';
  $('m_tanggal').value = todayISO();
  $('m_jk').value = 'L';
  $('m_rdtJenis').value = 'Pf';
  $('m_lokasi').value = '';
  toggleRdtJenis();
  clearMarker('migran');
}

function batalEditMigran(){ resetFormMigran(); toast('Mode edit dibatalkan.'); }

/* ================================================================
   9. MENU 2 — SEDIAAN DARAH
================================================================ */
function onMigranChange(){
  const mig = DB.migran.find(m => m.id === gv('s_migran'));
  $('s_nama').value = mig ? (mig.nama || '') : '';
  $('s_umur').value = mig ? (mig.umur || '') : '';
  $('s_jk').value = mig ? (mig.jk || '') : '';
}

async function simpanSediaan(e){
  if(e) e.preventDefault();
  const migranId = gv('s_migran');
  const mig = DB.migran.find(m => m.id === migranId);

  const data = {
    id: gv('editIdSediaan'),
    migranId: migranId,
    tanggal: gv('s_tanggal'),
    kode: gv('s_kode'),
    nama: gv('s_nama') || (mig && mig.nama) || '',
    umur: gv('s_umur') || (mig && mig.umur) || '',
    jk: gv('s_jk') || (mig && mig.jk) || '',
    hasil: gv('s_hasil'),
    lab: gv('s_lab')
  };

  const editing = !!data.id;
  const form = $('formSediaan');
  form.classList.add('saving');
  try {
    await apiSave('sediaan', data);
    toast(editing ? 'Data sediaan darah berhasil diperbarui.' : 'Data sediaan darah disimpan.');
    resetFormSediaan();
  } catch(err){
    setSync('err', 'Gagal menyimpan');
    alert('Gagal menyimpan data sediaan:\n' + err.message);
  } finally {
    form.classList.remove('saving');
  }
}

function editSediaan(id){
  const r = DB.sediaan.find(x => x.id === id);
  if(!r) return;
  showTab('sediaan');

  $('editIdSediaan').value = r.id;
  $('editBannerSediaan').classList.add('show');
  $('btnBatalSediaan').style.display = 'inline-flex';

  renderMigranOptions();
  $('s_migran').value = r.migranId || '';
  $('s_tanggal').value = r.tanggal || '';
  $('s_kode').value = r.kode || '';
  $('s_nama').value = r.nama || '';
  $('s_umur').value = r.umur || '';
  $('s_jk').value = r.jk || '';
  $('s_hasil').value = r.hasil || '';
  $('s_lab').value = r.lab || '';

  setTimeout(() => { $('formSediaan').scrollIntoView({ behavior:'smooth', block:'start' }); }, 220);
}

function resetFormSediaan(){
  $('formSediaan').reset();
  $('editIdSediaan').value = '';
  $('editBannerSediaan').classList.remove('show');
  $('btnBatalSediaan').style.display = 'none';
  $('s_tanggal').value = todayISO();
  $('s_nama').value = '';
  $('s_umur').value = '';
  $('s_jk').value = '';
}
function batalEditSediaan(){ resetFormSediaan(); toast('Mode edit dibatalkan.'); }

/* ================================================================
   10. MENU 3 — PENGOBATAN
================================================================ */
function onPasienChange(){
  const s = DB.sediaan.find(x => x.id === gv('o_pasien'));
  $('o_nama').value = s ? (s.nama || '') : '';
  $('o_umur').value = s ? (s.umur || '') : '';
  $('o_jk').value = s ? (s.jk || '') : '';
  $('o_hasil').value = s ? (s.hasil || '') : '';
}

async function simpanObat(e){
  if(e) e.preventDefault();
  const sediaanId = gv('o_pasien');
  const s = DB.sediaan.find(x => x.id === sediaanId);

  const data = {
    id: gv('editIdObat'),
    sediaanId: sediaanId,
    migranId: (s && s.migranId) || '',
    tanggal: gv('o_tanggal'),
    nama: gv('o_nama') || (s && s.nama) || '',
    umur: gv('o_umur') || (s && s.umur) || '',
    jk: gv('o_jk') || (s && s.jk) || '',
    hasil: gv('o_hasil') || (s && s.hasil) || '',
    obat: gv('o_obat'),
    dosis: gv('o_dosis'),
    keterangan: gv('o_keterangan')
  };

  const editing = !!data.id;
  const form = $('formObat');
  form.classList.add('saving');
  try {
    await apiSave('obat', data);
    toast(editing ? 'Data pengobatan berhasil diperbarui.' : 'Data pengobatan disimpan.');
    resetFormObat();
  } catch(err){
    setSync('err', 'Gagal menyimpan');
    alert('Gagal menyimpan data pengobatan:\n' + err.message);
  } finally {
    form.classList.remove('saving');
  }
}

function editObat(id){
  const r = DB.obat.find(x => x.id === id);
  if(!r) return;
  showTab('obat');

  $('editIdObat').value = r.id;
  $('editBannerObat').classList.add('show');
  $('btnBatalObat').style.display = 'inline-flex';

  renderPasienOptions();
  $('o_pasien').value = r.sediaanId || '';
  $('o_tanggal').value = r.tanggal || '';
  $('o_nama').value = r.nama || '';
  $('o_umur').value = r.umur || '';
  $('o_jk').value = r.jk || '';
  $('o_hasil').value = r.hasil || '';
  $('o_obat').value = r.obat || '';
  $('o_dosis').value = r.dosis || '';
  $('o_keterangan').value = r.keterangan || '';

  setTimeout(() => { $('formObat').scrollIntoView({ behavior:'smooth', block:'start' }); }, 220);
}

function resetFormObat(){
  $('formObat').reset();
  $('editIdObat').value = '';
  $('editBannerObat').classList.remove('show');
  $('btnBatalObat').style.display = 'none';
  $('o_tanggal').value = todayISO();
  $('o_nama').value = '';
  $('o_umur').value = '';
  $('o_jk').value = '';
  $('o_hasil').value = '';
}
function batalEditObat(){ resetFormObat(); toast('Mode edit dibatalkan.'); }

/* ================================================================
   11. MENU 4 — SURVEI JENTIK
================================================================ */
function collectJentik(){
  return {
    id: gv('editIdJentik'),
    tanggal: gv('j_tanggal'),
    lokasi: gv('j_lokasi'),
    titik: gv('j_titik'),
    salinitas: gv('j_salinitas'),
    suhu: gv('j_suhu'),
    ph: gv('j_ph'),
    kejernihan: gv('j_kejernihan'),
    sumber: gv('j_sumber'),
    kepadatan: gv('j_kepadatan'),
    predator: Array.from(document.querySelectorAll('input[name="j_predator"]:checked')).map(el => el.value),
    predatorLain: gv('j_predatorLain'),
    kondisi: Array.from(document.querySelectorAll('input[name="j_kondisi"]:checked')).map(el => el.value),
    intervensi: Array.from(document.querySelectorAll('input[name="j_intervensi"]:checked')).map(el => el.value),
    intervensiLain: gv('j_intervensiLain')
  };
}

async function simpanJentik(e){
  if(e) e.preventDefault();
  const data = collectJentik();

  const editing = !!data.id;
  const form = $('formJentik');
  form.classList.add('saving');
  try {
    await apiSave('jentik', data);
    toast(editing ? 'Data survei jentik berhasil diperbarui.' : 'Data survei jentik disimpan.');
    resetFormJentik();
  } catch(err){
    setSync('err', 'Gagal menyimpan');
    alert('Gagal menyimpan data survei jentik:\n' + err.message);
  } finally {
    form.classList.remove('saving');
  }
}

function editJentik(id){
  const r = DB.jentik.find(x => x.id === id);
  if(!r) return;
  showTab('jentik');

  $('editIdJentik').value = r.id;
  $('editBannerJentik').classList.add('show');
  $('btnBatalJentik').style.display = 'inline-flex';

  $('j_tanggal').value = r.tanggal || '';
  $('j_lokasi').value = r.lokasi || '';
  $('j_titik').value = r.titik || '';
  $('j_salinitas').value = r.salinitas || '';
  $('j_suhu').value = r.suhu || '';
  $('j_ph').value = r.ph || '';
  $('j_kejernihan').value = r.kejernihan || '';
  $('j_sumber').value = r.sumber || '';
  $('j_kepadatan').value = r.kepadatan || '';
  const pred = r.predator || [];
  document.querySelectorAll('input[name="j_predator"]').forEach(el => { el.checked = pred.indexOf(el.value) > -1; });
  $('j_predatorLain').value = r.predatorLain || '';
  const kon = r.kondisi || [];
  document.querySelectorAll('input[name="j_kondisi"]').forEach(el => { el.checked = kon.indexOf(el.value) > -1; });
  const inv = r.intervensi || [];
  document.querySelectorAll('input[name="j_intervensi"]').forEach(el => { el.checked = inv.indexOf(el.value) > -1; });
  $('j_intervensiLain').value = r.intervensiLain || '';

  setTitikToMap('jentik', r.titik);
  setTimeout(() => { $('formJentik').scrollIntoView({ behavior:'smooth', block:'start' }); }, 220);
}

function resetFormJentik(){
  $('formJentik').reset();
  $('editIdJentik').value = '';
  $('editBannerJentik').classList.remove('show');
  $('btnBatalJentik').style.display = 'none';
  $('j_tanggal').value = todayISO();
  clearMarker('jentik');
}
function batalEditJentik(){ resetFormJentik(); toast('Mode edit dibatalkan.'); }

/* ================================================================
   12. EDIT / HAPUS GENERIK
================================================================ */
function editData(tipe, id){
  if(tipe === 'migran') editMigran(id);
  else if(tipe === 'sediaan') editSediaan(id);
  else if(tipe === 'obat') editObat(id);
  else if(tipe === 'jentik') editJentik(id);
}

async function hapusData(tipe, id){
  const labels = { migran:'survei migran', sediaan:'sediaan darah', obat:'pengobatan', jentik:'survei jentik' };
  if(!confirm('Hapus data ' + (labels[tipe] || tipe) + ' ini? Tindakan tidak dapat dibatalkan.\n\nData akan terhapus untuk semua perangkat.')) return;

  try {
    await apiDelete(tipe, id);
    if(gv('editIdMigran') === id) resetFormMigran();
    if(gv('editIdSediaan') === id) resetFormSediaan();
    if(gv('editIdObat') === id) resetFormObat();
    if(gv('editIdJentik') === id) resetFormJentik();
    toast('Data berhasil dihapus.');
  } catch(err){
    setSync('err', 'Gagal menghapus');
    alert('Gagal menghapus data:\n' + err.message);
  }
}

/* ================================================================
   13. PETA LEAFLET + GPS
================================================================ */
const maps = { migran:null, jentik:null };
const markers = { migran:null, jentik:null };
const MAP_EL = { migran:'mapMigran', jentik:'mapJentik' };
const TITIK_INPUT = { migran:'m_titik', jentik:'j_titik' };
const NUSA_PENIDA = [-8.727, 115.544];

function initMap(kind){
  const el = $(MAP_EL[kind]);
  if(!el || maps[kind]) return;
  if(typeof L === 'undefined'){
    el.innerHTML = '<div class="map-fallback">Peta gagal dimuat. Koordinat tetap dapat diisi manual atau lewat tombol Ambil GPS.</div>';
    return;
  }
  try {
    const m = L.map(el, { scrollWheelZoom:false }).setView(NUSA_PENIDA, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(m);
    m.on('click', function(ev){
      const lat = ev.latlng.lat.toFixed(6);
      const lng = ev.latlng.lng.toFixed(6);
      $(TITIK_INPUT[kind]).value = lat + ', ' + lng;
      placeMarker(kind, parseFloat(lat), parseFloat(lng), false);
    });
    maps[kind] = m;
  } catch(err){
    el.innerHTML = '<div class="map-fallback">Peta gagal dimuat: ' + esc(err.message) + '</div>';
  }
}

function placeMarker(kind, lat, lng, pan){
  const m = maps[kind];
  if(!m || typeof L === 'undefined') return;
  if(markers[kind]){
    markers[kind].setLatLng([lat, lng]);
  } else {
    markers[kind] = L.marker([lat, lng]).addTo(m);
  }
  if(pan) m.setView([lat, lng], Math.max(m.getZoom(), 15));
}

function clearMarker(kind){
  if(markers[kind]){
    markers[kind].remove();
    markers[kind] = null;
  }
}

function parseTitik(str){
  if(!str) return null;
  const m = String(str).match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
  if(!m) return null;
  const lat = parseFloat(String(m[1]).replace(',', '.'));
  const lng = parseFloat(String(m[2]).replace(',', '.'));
  if(isNaN(lat) || isNaN(lng)) return null;
  return { lat: lat, lng: lng };
}

function setTitikToMap(kind, titik){
  const p = parseTitik(titik);
  if(!p) return;
  initMap(kind);
  placeMarker(kind, p.lat, p.lng, true);
  if(maps[kind]) setTimeout(() => maps[kind].invalidateSize(), 150);
}

function ambilGPS(inputId, kind){
  const inp = $(inputId);
  if(!navigator.geolocation){
    alert('Browser ini tidak mendukung fitur GPS (geolocation).');
    return;
  }
  const lama = inp.value;
  inp.value = 'Mengambil lokasi...';
  navigator.geolocation.getCurrentPosition(function(pos){
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    inp.value = lat + ', ' + lng;
    initMap(kind);
    placeMarker(kind, parseFloat(lat), parseFloat(lng), true);
    toast('Koordinat GPS berhasil diambil.');
  }, function(err){
    inp.value = lama;
    alert('Gagal mengambil GPS: ' + (err.message || 'izin lokasi ditolak') +
          '\nSilakan isi koordinat manual atau klik langsung pada peta.');
  }, { enableHighAccuracy:true, timeout:12000, maximumAge:0 });
}

/* ================================================================
   14. TTD (DATA ENTRY TANDA TANGAN) — tersimpan di server
================================================================ */
const TTD_FIELDS = {
  ttdNamaKepala:      'ttd_nama_kepala',
  ttdJabatanKepala:   'ttd_jabatan_kepala',
  ttdNipKepala:       'ttd_nip_kepala',
  ttdNamaPetugas:     'ttd_nama_petugas',
  ttdJabatanPetugas:  'ttd_jabatan_petugas',
  ttdNipPetugas:      'ttd_nip_petugas',
  ttdTempat:          'ttd_tempat',
  ttdTanggal:         'ttd_tanggal'
};

const TTD_DEFAULT = {
  ttd_nama_kepala: 'dr I Wayan Widia M.Kes',
  ttd_jabatan_kepala: 'Kepala Puskesmas Nusa Penida I',
  ttd_nip_kepala: '',
  ttd_nama_petugas: 'I Made Surveilans A.Md.Kep',
  ttd_jabatan_petugas: 'Petugas Surveilans Malaria',
  ttd_nip_petugas: '',
  ttd_tempat: 'Sampalan',
  ttd_tanggal: ''
};

function loadTTDFromSettings(){
  Object.keys(TTD_FIELDS).forEach(function(id){
    const el = $(id);
    if(!el) return;
    const key = TTD_FIELDS[id];
    const val = (SETTINGS[key] !== undefined && SETTINGS[key] !== '') ? SETTINGS[key] : (TTD_DEFAULT[key] || '');
    el.value = val;
  });
  if(!gv('ttdTanggal')) $('ttdTanggal').value = todayISO();
}

let ttdTimer = null;
function scheduleSaveTTD(){
  clearTimeout(ttdTimer);
  ttdTimer = setTimeout(saveTTDToServer, 700);
}

async function saveTTDToServer(){
  const payload = {};
  Object.keys(TTD_FIELDS).forEach(function(id){
    const el = $(id);
    if(el) payload[TTD_FIELDS[id]] = el.value;
  });
  try {
    const data = await apiSend('ttd', '', payload);
    if(data.ttd) SETTINGS = data.ttd;
    setSync('ok', 'Tersambung · TTD tersimpan');
  } catch(err){
    setSync('err', 'Gagal menyimpan TTD');
  }
}

function getTTD(){
  return {
    namaKepala: gv('ttdNamaKepala') || TTD_DEFAULT.ttd_nama_kepala,
    jabatanKepala: gv('ttdJabatanKepala') || TTD_DEFAULT.ttd_jabatan_kepala,
    nipKepala: gv('ttdNipKepala'),
    namaPetugas: gv('ttdNamaPetugas') || TTD_DEFAULT.ttd_nama_petugas,
    jabatanPetugas: gv('ttdJabatanPetugas') || TTD_DEFAULT.ttd_jabatan_petugas,
    nipPetugas: gv('ttdNipPetugas'),
    tempat: gv('ttdTempat') || TTD_DEFAULT.ttd_tempat,
    tanggal: gv('ttdTanggal') || todayISO()
  };
}

function ttdHTML(){
  const t = getTTD();
  const nipK = t.nipKepala || '..............................';
  const nipP = t.nipPetugas || '..............................';
  return '' +
    '<div class="ttd-footer print-footer">' +
      '<div class="ttd-col">' +
        '<div class="ttd-head">Mengetahui</div>' +
        '<div class="ttd-head">' + esc(t.jabatanKepala) + '</div>' +
        '<div class="ttd-space"></div>' +
        '<div class="ttd-name">' + esc(t.namaKepala) + '</div>' +
        '<div class="ttd-nip">NIP. ' + esc(nipK) + '</div>' +
      '</div>' +
      '<div class="ttd-col">' +
        '<div class="ttd-head">' + esc(t.tempat) + ', ' + esc(fmtTanggalIndo(t.tanggal)) + '</div>' +
        '<div class="ttd-head">' + esc(t.jabatanPetugas) + '</div>' +
        '<div class="ttd-space"></div>' +
        '<div class="ttd-name">' + esc(t.namaPetugas) + '</div>' +
        '<div class="ttd-nip">NIP. ' + esc(nipP) + '</div>' +
      '</div>' +
    '</div>';
}

/* ================================================================
   15. REKAP LAPORAN (FILTER PERIODE)
================================================================ */
function inPeriode(tgl, start, end){
  if(!start && !end) return true;
  if(!tgl) return false;
  if(start && tgl < start) return false;
  if(end && tgl > end) return false;
  return true;
}

function labelPeriode(start, end){
  if(start && end) return fmtTanggalIndo(start) + ' s.d. ' + fmtTanggalIndo(end);
  if(start) return 'Sejak ' + fmtTanggalIndo(start);
  if(end) return 'Sampai ' + fmtTanggalIndo(end);
  return 'Semua Periode';
}

function getRekapData(){
  const start = gv('r_awal');
  const end = gv('r_akhir');
  const jenis = gv('r_jenis') || 'semua';
  const filter = function(arr){
    return arr.filter(function(r){ return inPeriode(r.tanggal, start, end); });
  };
  return {
    start: start,
    end: end,
    jenis: jenis,
    migran: filter(DB.migran),
    sediaan: filter(DB.sediaan),
    obat: filter(DB.obat),
    jentik: filter(DB.jentik),
    periodeLabel: labelPeriode(start, end)
  };
}

function tableHTML(cols, rows){
  if(!rows.length){
    return '<div class="table-wrap"><table><thead><tr>' + cols.map(c => '<th>' + c.label + '</th>').join('') +
      '</tr></thead><tbody><tr><td class="empty" colspan="' + cols.length + '">Tidak ada data pada periode ini.</td></tr></tbody></table></div>';
  }
  return '<div class="table-wrap"><table><thead><tr>' + cols.map(c => '<th>' + c.label + '</th>').join('') +
    '</tr></thead><tbody>' +
    rows.map((r, i) => '<tr>' + cols.map(c => '<td>' + c.html(r, i) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
}

/* ---------- 15a. STATISTIK PENDUKUNG GRAFIK ---------- */
const REKAP_JENIS = {
  migran:  { short:'Migran',  color:'#0e7490' },
  sediaan: { short:'Sediaan', color:'#7c3aed' },
  obat:    { short:'Obat',    color:'#d97706' },
  jentik:  { short:'Jentik',  color:'#0f9d58' }
};
const UMUR_GROUPS = [
  { label:'0–4 th',  min:0,  max:4 },
  { label:'5–14 th', min:5,  max:14 },
  { label:'15–24 th',min:15, max:24 },
  { label:'25–44 th',min:25, max:44 },
  { label:'45–64 th',min:45, max:64 },
  { label:'≥ 65 th', min:65, max:200 }
];
const UMUR_COLORS = ['#0891b2','#0e7490','#7c3aed','#2563eb','#d97706','#db2777'];

function fmt1(v){ return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
function fmtNum(v){
  if(!isFinite(v)) return '0';
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace('.', ',');
}

function nextBulan(key){
  let y = parseInt(String(key).slice(0,4), 10);
  let m = parseInt(String(key).slice(5,7), 10) + 1;
  if(m > 12){ m = 1; y += 1; }
  return y + '-' + String(m).padStart(2,'0');
}
function bulanPendek(key){
  const p = String(key).split('-');
  const b = BULAN[(parseInt(p[1],10) || 1) - 1] || '';
  return b.slice(0,3) + ' ' + String(p[0]).slice(2);
}
function mingguKe(iso){
  const d = parseInt(String(iso).slice(8,10), 10) || 1;
  return Math.min(5, Math.ceil(d / 7));
}
function bucketCocok(b, tgl){
  const t = String(tgl || '');
  if(t.length < 10) return false;
  if(t.slice(0,7) !== b.month) return false;
  if(b.week) return mingguKe(t) === b.week;
  return true;
}

/* rentang periode laporan: pakai filter bila diisi, kalau tidak pakai tanggal data */
function rekapBuckets(d, list){
  const tanggal = [];
  list.forEach(function(k){ (d[k] || []).forEach(function(r){ if(r.tanggal) tanggal.push(String(r.tanggal)); }); });
  tanggal.sort();
  const min = d.start || tanggal[0] || '';
  const max = d.end || tanggal[tanggal.length - 1] || '';
  if(!min || !max || min > max) return { mode:'bulan', buckets:[] };

  const bulanan = [];
  let cur = min.slice(0,7);
  const akhir = max.slice(0,7);
  let guard = 0;
  while(cur <= akhir && guard++ < 240){ bulanan.push(cur); cur = nextBulan(cur); }

  if(bulanan.length > 1){
    return { mode:'bulan', buckets: bulanan.map(function(m){ return { month:m, label: bulanPendek(m) }; }) };
  }
  const m = bulanan[0] || min.slice(0,7);
  const buckets = [];
  for(let w = mingguKe(min); w <= mingguKe(max); w++){
    buckets.push({ month:m, week:w, label:'Mgg ' + w });
  }
  return { mode:'minggu', buckets: buckets };
}

function umurAngka(v){
  const n = parseInt(String(v === null || v === undefined ? '' : v).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function getRekapStats(d, list){
  const perJenis = {};
  list.forEach(function(k){ perJenis[k] = (d[k] || []).length; });
  const total = list.reduce(function(a,k){ return a + perJenis[k]; }, 0);

  /* hasil pemeriksaan sediaan darah */
  const sediaan = d.sediaan || [];
  const hasil = { negatif:0, pf:0, pv:0, mix:0, lain:0, belum:0 };
  sediaan.forEach(function(s){
    const h = String(s.hasil || '').toLowerCase();
    if(!h) hasil.belum++;
    else if(h.indexOf('negatif') > -1) hasil.negatif++;
    else if(h.indexOf('mix') > -1) hasil.mix++;
    else if(h.indexOf('pf') > -1) hasil.pf++;
    else if(h.indexOf('pv') > -1) hasil.pv++;
    else if(h.indexOf('positif') > -1) hasil.lain++;
    else hasil.belum++;
  });
  const positif = hasil.pf + hasil.pv + hasil.mix + hasil.lain;
  const diperiksa = sediaan.length - hasil.belum;
  const positivitas = diperiksa ? (positif / diperiksa) * 100 : 0;

  /* karakteristik migran */
  const migran = d.migran || [];
  const umurCounts = UMUR_GROUPS.map(function(g){
    return migran.filter(function(m){
      const u = umurAngka(m.umur);
      return u !== null && u >= g.min && u <= g.max;
    }).length;
  });
  const umurKosong = migran.filter(function(m){ return umurAngka(m.umur) === null; }).length;
  const jk = { L:0, P:0 };
  migran.forEach(function(m){
    const v = String(m.jk || '').toUpperCase();
    if(v === 'L') jk.L++; else if(v === 'P') jk.P++;
  });
  const asalMap = {};
  migran.forEach(function(m){
    const a = String(m.asal || '').trim();
    if(a) asalMap[a] = (asalMap[a] || 0) + 1;
  });
  let asalTop = null;
  Object.keys(asalMap).forEach(function(k){
    if(!asalTop || asalMap[k] > asalTop.n) asalTop = { nama:k, n:asalMap[k] };
  });

  /* kepadatan jentik */
  const padat = [
    { label:'Tidak ada (0)',   key:'tidak',  color:'#16a34a', value:0 },
    { label:'Rendah (1–10)',   key:'rendah', color:'#0891b2', value:0 },
    { label:'Sedang (11–50)',  key:'sedang', color:'#d97706', value:0 },
    { label:'Tinggi (>50)',    key:'tinggi', color:'#dc2626', value:0 }
  ];
  (d.jentik || []).forEach(function(j){
    const v = String(j.kepadatan || '').toLowerCase();
    const hit = padat.filter(function(p){ return v.indexOf(p.key) > -1; })[0];
    if(hit) hit.value++;
  });

  return {
    perJenis: perJenis,
    total: total,
    hasil: hasil,
    positif: positif,
    diperiksa: diperiksa,
    positivitas: positivitas,
    umurCounts: umurCounts,
    umurKosong: umurKosong,
    jk: jk,
    asalTop: asalTop,
    padat: padat
  };
}

/* ---------- 15b. RENDER GRAFIK (SVG & batang horizontal, tanpa library) ---------- */
function axisNice(maxVal){
  const v = Math.max(maxVal, 1);
  let step = Math.max(1, Math.ceil(v / 4));
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  const cands = [1, 2, 2.5, 3, 4, 5, 10].map(function(x){ return x * mag; });
  for(let i = 0; i < cands.length; i++){
    if(cands[i] >= step){ step = cands[i]; break; }
  }
  return { step: step, max: step * 4 };
}

function svgGroupedBar(o){
  const labels = o.labels || [];
  const series = o.series || [];
  const W = o.width || 800, H = o.height || 210;
  const padT = 16, padR = 10, padL = 42;
  const padB = labels.length > 7 ? 68 : 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let maxVal = 0;
  series.forEach(function(s){ (s.values || []).forEach(function(v){ if(v > maxVal) maxVal = v; }); });
  const axis = axisNice(maxVal);
  const out = [];
  out.push('<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(o.title || 'Grafik') + '">');

  for(let i = 0; i <= 4; i++){
    const y = padT + plotH - (plotH * i / 4);
    out.push('<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="#e6edf3" stroke-width="1"/>');
    out.push('<text x="' + (padL - 7) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#64748b">' + fmtNum(axis.step * i) + '</text>');
  }

  const gW = labels.length ? plotW / labels.length : plotW;
  const nS = Math.max(series.length, 1);
  const gap = nS > 1 ? 3 : 0;
  const barW = Math.max(5, Math.min(nS > 1 ? 26 : 46, (gW * 0.66 - gap * (nS - 1)) / nS));
  const inner = barW * nS + gap * (nS - 1);
  const showVal = labels.length * nS <= 18;

  labels.forEach(function(lb, li){
    const gx = padL + gW * li + (gW - inner) / 2;
    series.forEach(function(s, si){
      const v = (s.values || [])[li] || 0;
      const h = axis.max ? (v / axis.max) * plotH : 0;
      const x = gx + si * (barW + gap);
      const y = padT + plotH - h;
      const fill = s.colors ? (s.colors[li] || s.color) : s.color;
      if(v > 0){
        out.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) +
          '" height="' + Math.max(h, 1.5).toFixed(1) + '" rx="2.5" fill="' + fill + '"><title>' +
          esc((s.name ? s.name + ' — ' : '') + lb + ': ' + v) + '</title></rect>');
        if(showVal){
          out.push('<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) +
            '" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">' + v + '</text>');
        }
      }
    });
    const cx = padL + gW * li + gW / 2;
    if(labels.length > 7){
      const ly = padT + plotH + 12;
      out.push('<text x="' + cx.toFixed(1) + '" y="' + ly + '" font-size="10" fill="#334155" text-anchor="end" transform="rotate(-38 ' + cx.toFixed(1) + ' ' + ly + ')">' + esc(lb) + '</text>');
    } else {
      out.push('<text x="' + cx.toFixed(1) + '" y="' + (padT + plotH + 17) + '" font-size="10.5" fill="#334155" text-anchor="middle">' + esc(lb) + '</text>');
    }
  });

  out.push('<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="#cbd5e1" stroke-width="1.2"/>');
  out.push('</svg>');
  return out.join('');
}

function barListHTML(items){
  const total = items.reduce(function(a,b){ return a + b.value; }, 0);
  const max = Math.max.apply(null, items.map(function(i){ return i.value; }).concat([1]));
  return '<div class="blist">' + items.map(function(it){
    const pct = total ? (it.value / total) * 100 : 0;
    const w = (it.value / max) * 100;
    return '<div class="blist-row">' +
      '<span class="blist-label">' + esc(it.label) + '</span>' +
      '<span class="blist-track"><span class="blist-fill" style="width:' + w.toFixed(1) + '%;background:' + it.color + '"></span></span>' +
      '<span class="blist-val"><b>' + it.value + '</b> <i>' + fmt1(pct) + '%</i></span>' +
    '</div>';
  }).join('') + '</div>';
}

function legendHTML(series){
  return '<div class="chart-legend">' + series.map(function(s){
    return '<span><i style="background:' + (s.color || '#0e7490') + '"></i>' + esc(s.name) + '</span>';
  }).join('') + '</div>';
}

function chartCard(spec){
  let body;
  if(spec.type === 'bars') body = barListHTML(spec.items);
  else body = legendHTML(spec.series) + svgGroupedBar(spec);
  return '<figure class="chart-card">' +
    '<figcaption class="chart-head"><h5>' + esc(spec.title) + '</h5>' +
      (spec.sub ? '<p>' + esc(spec.sub) + '</p>' : '') +
    '</figcaption>' + body + '</figure>';
}

/* data grafik dipakai bersama oleh tampilan HTML dan PDF agar konsisten */
function rekapChartData(d, list, st){
  const charts = [];

  const bk = rekapBuckets(d, list);
  if(bk.buckets.length){
    const series = list.map(function(k){
      return {
        name: REKAP_JENIS[k].short,
        color: REKAP_JENIS[k].color,
        values: bk.buckets.map(function(b){
          return (d[k] || []).filter(function(r){ return bucketCocok(b, r.tanggal); }).length;
        })
      };
    });
    const ada = series.some(function(s){ return s.values.some(function(v){ return v > 0; }); });
    if(ada){
      charts.push({
        type:'grouped',
        wide:true,
        title:'Tren Kegiatan Surveilans per ' + (bk.mode === 'bulan' ? 'Bulan' : 'Minggu'),
        sub: bk.mode === 'bulan'
          ? 'Jumlah kegiatan tiap bulan pada periode laporan'
          : 'Periode laporan hanya mencakup satu bulan, sehingga rincian ditampilkan per minggu',
        labels: bk.buckets.map(function(b){ return b.label; }),
        series: series
      });
    }
  }

  const sediaanAda = (st.diperiksa + st.hasil.belum) > 0;
  if(list.indexOf('sediaan') > -1 && sediaanAda){
    const items = [
      { label:'Negatif',     value: st.hasil.negatif, color:'#16a34a' },
      { label:'Positif Pf',  value: st.hasil.pf,      color:'#dc2626' },
      { label:'Positif Pv',  value: st.hasil.pv,      color:'#ea580c' },
      { label:'Positif Mix', value: st.hasil.mix,     color:'#b91c1c' }
    ];
    if(st.hasil.lain) items.push({ label:'Positif lainnya', value: st.hasil.lain, color:'#e11d48' });
    if(st.hasil.belum) items.push({ label:'Belum diperiksa', value: st.hasil.belum, color:'#94a3b8' });
    charts.push({
      type:'bars',
      title:'Hasil Pemeriksaan Sediaan Darah',
      sub:'Angka positivitas ' + fmt1(st.positivitas) + '% dari ' + st.diperiksa + ' sediaan yang diperiksa',
      items: items
    });
  }

  if(list.indexOf('migran') > -1 && (d.migran || []).length){
    charts.push({
      type:'grouped',
      title:'Distribusi Kelompok Umur Migran',
      sub:'Laki-laki ' + st.jk.L + ' orang · Perempuan ' + st.jk.P + ' orang' +
          (st.umurKosong ? ' · umur belum diisi ' + st.umurKosong + ' data' : ''),
      labels: UMUR_GROUPS.map(function(g){ return g.label; }),
      series: [{ name:'Migran', color:'#0e7490', colors: UMUR_COLORS, values: st.umurCounts }],
      width: 520,
      height: 235
    });
  }

  if(list.indexOf('jentik') > -1 && (d.jentik || []).length){
    const totalPadat = st.padat.reduce(function(a,b){ return a + b.value; }, 0);
    charts.push({
      type:'bars',
      title:'Kepadatan Jentik pada Lokasi Survei',
      sub:'Dari ' + totalPadat + ' lokasi perindukan yang diperiksa',
      items: st.padat.map(function(p){ return { label:p.label, value:p.value, color:p.color }; })
    });
  }

  return charts;
}

function rekapGrafikHTML(d, list, st){
  const charts = rekapChartData(d, list, st);
  if(!charts.length) return '';
  /* kalau jumlah kartu setengah-lebar ganjil, kartu terakhir dibuat selebar baris
     supaya grid tidak menyisakan lubang kosong di kanan */
  const sempit = charts.filter(function(c){ return !c.wide; });
  if(sempit.length % 2 === 1) sempit[sempit.length - 1].wide = true;
  return '<section class="rekap-block">' +
    '<h4 class="rekap-h"><span class="rnum">A</span> Grafik dan Analisis</h4>' +
    '<div class="chart-grid">' +
      charts.map(function(c){
        return '<div class="chart-cell' + (c.wide ? ' wide' : '') + '">' + chartCard(c) + '</div>';
      }).join('') +
    '</div>' +
    rekapNarasiHTML(d, list, st) +
  '</section>';
}

/* ---------- 15c. NARASI OTOMATIS (dipakai HTML & PDF) ---------- */
function rekapNarasi(d, list, st){
  const out = [];
  const periode = d.periodeLabel.charAt(0).toLowerCase() + d.periodeLabel.slice(1);

  if(!st.total){
    out.push('Tidak ada data kegiatan surveilans malaria yang tercatat pada periode ' + periode + '.');
    return out;
  }

  let kalimat = 'Pada periode ' + periode + ' tercatat ' + st.total + ' kegiatan surveilans malaria';
  if(list.length > 1){
    const rinci = list.filter(function(k){ return st.perJenis[k] > 0; })
      .map(function(k){ return st.perJenis[k] + ' ' + TITLES[k].toLowerCase(); });
    if(rinci.length) kalimat += ' (' + rinci.join(', ') + ')';
  }
  out.push(kalimat + '.');

  if(list.indexOf('sediaan') > -1 && (st.diperiksa + st.hasil.belum) > 0){
    let s = 'Pemeriksaan sediaan darah: ' + st.diperiksa + ' sediaan diperiksa dengan ' +
      st.positif + ' hasil positif (angka positivitas ' + fmt1(st.positivitas) + '%)';
    if(st.hasil.pf) s += ', terdiri atas Pf ' + st.hasil.pf + ' sediaan';
    if(st.hasil.pv) s += (st.hasil.pf ? ', ' : ', terdiri atas ') + 'Pv ' + st.hasil.pv + ' sediaan';
    if(st.hasil.mix) s += ', Mix ' + st.hasil.mix + ' sediaan';
    s += '.';
    if(st.hasil.belum) s += ' Sebanyak ' + st.hasil.belum + ' sediaan belum memiliki hasil pemeriksaan.';
    out.push(s);
  }

  if(list.indexOf('migran') > -1 && (d.migran || []).length){
    let s = 'Survei migran menjangkau ' + (d.migran || []).length + ' orang (laki-laki ' + st.jk.L +
      ' orang, perempuan ' + st.jk.P + ' orang)';
    if(st.asalTop) s += ', dengan asal migran terbanyak dari ' + st.asalTop.nama + ' (' + st.asalTop.n + ' orang)';
    out.push(s + '.');
  }

  if(list.indexOf('jentik') > -1 && (d.jentik || []).length){
    const tinggi = st.padat[3].value;
    let s = 'Survei jentik dilakukan pada ' + (d.jentik || []).length + ' lokasi perindukan';
    if(tinggi) s += ' dan ' + tinggi + ' lokasi di antaranya menunjukkan kepadatan jentik tinggi (>50)';
    else s += ' tanpa temuan kepadatan jentik tinggi';
    out.push(s + '.');
  }

  if(list.indexOf('obat') > -1 && (d.obat || []).length){
    out.push('Pengobatan malaria tercatat untuk ' + (d.obat || []).length + ' pasien sesuai standar tatalaksana.');
  }

  const bk = rekapBuckets(d, list);
  if(bk.buckets.length > 1){
    let puncak = null;
    bk.buckets.forEach(function(b){
      let n = 0;
      list.forEach(function(k){ n += (d[k] || []).filter(function(r){ return bucketCocok(b, r.tanggal); }).length; });
      if(!puncak || n > puncak.n) puncak = { label:b.label, n:n };
    });
    if(puncak && puncak.n > 0){
      out.push('Kegiatan tertinggi terjadi pada ' + (bk.mode === 'bulan' ? 'bulan ' : '') + puncak.label + ' sebanyak ' + puncak.n + ' kegiatan.');
    }
  }

  const rekomendasi = [];
  const adaSediaan = list.indexOf('sediaan') > -1;
  if(adaSediaan && st.hasil.belum) rekomendasi.push('melengkapi ' + st.hasil.belum + ' sediaan yang belum diperiksa');
  if(adaSediaan && st.positif) rekomendasi.push('melakukan penyelidikan epidemiologi dan pemantauan kontak di sekitar kasus positif');
  if(list.indexOf('jentik') > -1 && (d.jentik || []).length && st.padat[3].value){
    rekomendasi.push('gerakan PSN dan fogging fokus pada lokasi dengan kepadatan jentik tinggi');
  }
  if(rekomendasi.length){
    out.push('Rekomendasi: ' + rekomendasi.join('; ') + '.');
  }
  return out;
}

function rekapNarasiHTML(d, list, st){
  const items = rekapNarasi(d, list, st);
  if(!items.length) return '';
  return '<div class="rekap-narasi">' +
    '<h5>Ringkasan &amp; Analisis</h5>' +
    '<ul>' + items.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
  '</div>';
}

/* ---------- 15d. KERANGKA LAPORAN ---------- */
function rekapKopHTML(d){
  const nama = (STATE.user && STATE.user.nama) || 'Petugas';
  const jenisLabel = d.jenis === 'semua' ? 'Semua Jenis Laporan (4 Menu)' : TITLES[d.jenis];
  return '' +
    '<div class="rekap-kop">' +
      '<div class="kop-l1">PEMERINTAH KABUPATEN KLUNGKUNG</div>' +
      '<div class="kop-l2">DINAS KESEHATAN</div>' +
      '<div class="kop-l3">UPTD PUSKESMAS NUSA PENIDA I</div>' +
      '<div class="kop-l4">Nusa Penida &middot; Kabupaten Klungkung &middot; Provinsi Bali</div>' +
    '</div>' +
    '<div class="rekap-title">' +
      '<h3>LAPORAN REKAPITULASI SURVEILANS MALARIA</h3>' +
      '<p class="periode">Periode: <strong>' + esc(d.periodeLabel) + '</strong></p>' +
      '<p class="rekap-meta">Jenis laporan: ' + esc(jenisLabel) +
        ' &nbsp;&middot;&nbsp; Dicetak: ' + fmtTanggalIndo(todayISO()) +
        ' &nbsp;&middot;&nbsp; Oleh: ' + esc(nama) + '</p>' +
    '</div>';
}

function rekapKPIHTML(d, list, st){
  const card = function(label, val, sub, cls){
    return '<div class="sum-item' + (cls ? ' ' + cls : '') + '"><b>' + val + '</b><span>' + label + '</span>' +
      (sub ? '<i>' + sub + '</i>' : '') + '</div>';
  };
  let html = '<div class="summary">' +
    card('Total Kegiatan', st.total, list.length + ' jenis laporan');

  if(list.indexOf('migran') > -1) html += card('Survei Migran', st.perJenis.migran, 'orang didata');
  if(list.indexOf('sediaan') > -1) html += card('Sediaan Darah', st.perJenis.sediaan, st.diperiksa + ' sudah diperiksa');
  if(list.indexOf('sediaan') > -1) html += card('Hasil Positif', st.positif, 'positivitas ' + fmt1(st.positivitas) + '%', 'positif');
  if(list.indexOf('obat') > -1) html += card('Pengobatan', st.perJenis.obat, 'pasien ditangani');
  if(list.indexOf('jentik') > -1) html += card('Survei Jentik', st.perJenis.jentik, 'lokasi perindukan');

  return html + '</div>';
}

function tampilkanRekap(){
  const d = getRekapData();
  if(d.start && d.end && d.start > d.end){
    alert('Periode awal tidak boleh melebihi periode akhir.');
    return;
  }
  const list = d.jenis === 'semua' ? ['migran','sediaan','obat','jentik'] : [d.jenis];
  const st = getRekapStats(d, list);

  let html = rekapKopHTML(d) + rekapKPIHTML(d, list, st);

  if(!st.total){
    html += '<div class="rekap-kosong">Belum ada data pada periode yang dipilih. ' +
      'Ubah rentang tanggal atau isi data pada menu 1&ndash;4.</div>';
  }

  html += rekapGrafikHTML(d, list, st);

  html += '<section class="rekap-block">' +
    '<h4 class="rekap-h"><span class="rnum">B</span> Rincian Data per Kegiatan</h4>';

  list.forEach(function(k, idx){
    html += '<div class="rekap-section">' +
      '<h4>' + (idx + 1) + '. ' + TITLES[k] + ' <span class="badge badge-teal">' + d[k].length + ' data</span></h4>' +
      tableHTML(COLS[k], sortTanggal(d[k])) +
    '</div>';
  });

  html += '</section>';

  html += ttdHTML();

  const box = $('rekapHasil');
  box.innerHTML = html;
  box.classList.add('show');
  setTimeout(function(){ box.scrollIntoView({ behavior:'smooth', block:'start' }); }, 120);
}

function cetakRekap(){
  if(!$('rekapHasil').classList.contains('show')){
    alert('Silakan klik tombol "Tampilkan" terlebih dahulu agar rekap laporan terisi sebelum dicetak.');
    return;
  }
  window.print();
}

/* ================================================================
   16. PDF (jsPDF + AutoTable)
================================================================ */
let lastPDFDoc = null;
let lastPDFName = '';

function periodeDari(data){
  const tgl = data.map(r => r.tanggal).filter(Boolean).sort();
  if(!tgl.length) return 'Semua Periode';
  if(tgl[0] === tgl[tgl.length - 1]) return fmtTanggalIndo(tgl[0]);
  return fmtTanggalIndo(tgl[0]) + ' s.d. ' + fmtTanggalIndo(tgl[tgl.length - 1]);
}

/* ---- penggambar grafik vektor untuk PDF (tanpa library tambahan) ---- */
/* font standar jsPDF (Helvetica) hanya mendukung Latin-1, jadi karakter seperti
   ≥, –, —, ‘ ’ perlu diganti agar tidak tampil sebagai simbol aneh di PDF */
function pdfSafe(v){
  return String(v === null || v === undefined ? '' : v)
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...');
}

function hexRGB(hex){
  const h = String(hex || '#0e7490').replace('#', '');
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  const n = parseInt(full, 16);
  if(isNaN(n)) return [14, 116, 144];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function pdfChartBox(doc, ch, box){
  const pad = 3.5;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.roundedRect(box.x, box.y, box.w, box.h, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(14, 116, 144);
  doc.text(pdfSafe(ch.title), box.x + pad, box.y + 5);

  let top = box.y + 8.5;
  if(ch.sub){
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafe(ch.sub), box.x + pad, box.y + 9);
    top = box.y + 11.5;
  }

  const inner = { x: box.x + pad, y: top, w: box.w - pad * 2, h: (box.y + box.h - top) - 3 };
  if(ch.type === 'bars') pdfBarList(doc, ch, inner);
  else pdfGroupedBar(doc, ch, inner);
}

function pdfGroupedBar(doc, ch, box){
  const labels = ch.labels || [];
  const series = ch.series || [];
  const axisPadL = 9;
  const xLabelH = 6;
  const legendH = series.length > 1 ? 5 : 0;
  const px = box.x + axisPadL;
  const py = box.y;
  const pw = Math.max(12, box.w - axisPadL);
  const ph = Math.max(10, box.h - xLabelH - legendH);

  let maxVal = 1;
  series.forEach(function(s){ (s.values || []).forEach(function(v){ if(v > maxVal) maxVal = v; }); });
  const axis = axisNice(maxVal);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.15);
  for(let i = 0; i <= 4; i++){
    const yv = py + ph - (ph * i / 4);
    doc.line(px, yv, px + pw, yv);
    doc.setTextColor(100, 116, 139);
    doc.text(fmtNum(axis.step * i), px - 1.5, yv + 1, { align:'right' });
  }

  const gW = labels.length ? pw / labels.length : pw;
  const nS = Math.max(series.length, 1);
  const gap = nS > 1 ? 0.8 : 0;
  const barW = Math.max(1.2, Math.min(8, (gW * 0.66 - gap * (nS - 1)) / nS));
  const innerW = barW * nS + gap * (nS - 1);

  /* ukuran label sumbu-x menyesuaikan lebar yang tersedia */
  let fs = 5.4;
  doc.setFontSize(fs);
  let longest = 0;
  labels.forEach(function(l){ longest = Math.max(longest, doc.getTextWidth(pdfSafe(l))); });
  const maxLabelW = Math.max(6, gW - 0.8);
  if(longest > maxLabelW) fs = Math.max(3.4, fs * (maxLabelW / longest));

  labels.forEach(function(lb, li){
    series.forEach(function(s, si){
      const v = (s.values || [])[li] || 0;
      if(v <= 0) return;
      const hh = axis.max ? (v / axis.max) * ph : 0;
      const x = px + gW * li + (gW - innerW) / 2 + si * (barW + gap);
      const col = hexRGB(s.colors ? (s.colors[li] || s.color) : s.color);
      doc.setFillColor(col[0], col[1], col[2]);
      doc.rect(x, py + ph - hh, barW, Math.max(hh, 0.4), 'F');
    });
    doc.setFontSize(fs);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafe(lb), px + gW * li + gW / 2, py + ph + 3.4, { align:'center' });
  });

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.line(px, py + ph, px + pw, py + ph);

  if(legendH){
    let lx = px;
    const ly = py + ph + xLabelH + 2.6;
    doc.setFontSize(5.4);
    series.forEach(function(s){
      const col = hexRGB(s.color);
      doc.setFillColor(col[0], col[1], col[2]);
      doc.rect(lx, ly - 1.8, 2, 2, 'F');
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafe(s.name), lx + 2.8, ly);
      lx += 2.8 + doc.getTextWidth(pdfSafe(s.name)) + 4.5;
    });
  }
}

function pdfBarList(doc, ch, box){
  const items = ch.items || [];
  if(!items.length) return;
  const total = items.reduce(function(a,b){ return a + b.value; }, 0);
  const max = Math.max.apply(null, items.map(function(i){ return i.value; }).concat([1]));
  const rh = Math.min(7, box.h / items.length);
  const labelW = Math.min(box.w * 0.36, 36);
  const valW = 20;
  const trackX = box.x + labelW + 2;
  const trackW = Math.max(10, box.w - labelW - valW - 4);

  items.forEach(function(it, i){
    const y = box.y + i * rh;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafe(it.label), box.x, y + rh * 0.72);

    doc.setFillColor(241, 245, 249);
    doc.rect(trackX, y + rh * 0.3, trackW, rh * 0.4, 'F');

    const col = hexRGB(it.color);
    doc.setFillColor(col[0], col[1], col[2]);
    const w = it.value > 0 ? Math.max(0.8, trackW * (it.value / max)) : 0;
    if(w > 0) doc.rect(trackX, y + rh * 0.3, w, rh * 0.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(30, 41, 59);
    const pct = total ? (it.value / total) * 100 : 0;
    doc.text(it.value + ' (' + fmt1(pct) + '%)', box.x + box.w, y + rh * 0.72, { align:'right' });
  });
}

function pdfChartGrid(doc, charts, ctx){
  const M = ctx.M, pageW = ctx.pageW, pageH = ctx.pageH;
  const gap = 6;
  const colW = (pageW - M * 2 - gap) / 2;
  const boxH = 58;
  let y = ctx.y;
  let i = 0;

  while(i < charts.length){
    const ch = charts[i];
    if(y + boxH > pageH - 26){ doc.addPage(); y = 22; }

    if(ch.wide){
      pdfChartBox(doc, ch, { x:M, y:y, w:pageW - M * 2, h:boxH });
      y += boxH + gap;
      i++;
    } else {
      const next = charts[i + 1];
      pdfChartBox(doc, ch, { x:M, y:y, w:colW, h:boxH });
      if(next && !next.wide){
        pdfChartBox(doc, next, { x:M + colW + gap, y:y, w:colW, h:boxH });
        i += 2;
      } else {
        i++;
      }
      y += boxH + gap;
    }
  }
  return y + 1;
}

function pdfNarasi(doc, items, ctx){
  const M = ctx.M, pageW = ctx.pageW, pageH = ctx.pageH;
  let y = ctx.y + 1;
  if(y > pageH - 40){ doc.addPage(); y = 22; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(14, 116, 144);
  doc.text('RINGKASAN & ANALISIS', M, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(51, 65, 85);
  items.forEach(function(s){
    const lines = doc.splitTextToSize('• ' + pdfSafe(s), pageW - M * 2 - 2);
    if(y + lines.length * 3.6 > pageH - 24){ doc.addPage(); y = 22; }
    doc.text(lines, M, y);
    y += lines.length * 3.6 + 1.2;
  });
  return y + 3;
}

function buildPDF(opts){
  if(!window.jspdf || !window.jspdf.jsPDF){
    alert('Library PDF belum siap. Muat ulang halaman lalu coba lagi.');
    return;
  }
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4', compress:true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;

  /* Kop surat resmi hanya dipakai pada PDF Rekap Laporan (menu 5).
     PDF per menu lain cukup judul kegiatan + periode. */
  const pakaiKop = opts.kop !== false;
  let y = 54;

  if(pakaiKop){
    /* ---- kop laporan gaya surat resmi ---- */
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('PEMERINTAH KABUPATEN KLUNGKUNG', pageW / 2, 11, { align:'center' });
    doc.setFontSize(10);
    doc.text('DINAS KESEHATAN', pageW / 2, 15.8, { align:'center' });
    doc.setFontSize(13);
    doc.text('UPTD PUSKESMAS NUSA PENIDA I', pageW / 2, 21.6, { align:'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Nusa Penida - Kabupaten Klungkung - Provinsi Bali', pageW / 2, 26, { align:'center' });
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.7);
    doc.line(M, 28.4, pageW - M, 28.4);
    doc.setLineWidth(0.25);
    doc.line(M, 29.5, pageW - M, 29.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(opts.judul || 'LAPORAN REKAPITULASI SURVEILANS MALARIA'), pageW / 2, 37, { align:'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafe('Periode: ' + opts.periode), pageW / 2, 43, { align:'center' });
    doc.setFontSize(7.6);
    doc.setTextColor(100, 116, 139);
    doc.text('Dicetak: ' + fmtTanggalIndo(todayISO()) +
      ((STATE.user && STATE.user.nama) ? '  |  Oleh: ' + STATE.user.nama : ''), pageW / 2, 47.5, { align:'center' });
  } else {
    /* ---- tanpa kop: hanya judul kegiatan + periode ---- */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafe(opts.judul || 'LAPORAN'), pageW / 2, 15, { align:'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafe('Periode: ' + opts.periode), pageW / 2, 21, { align:'center' });
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(M, 25, pageW - M, 25);
    y = 31;
  }

  if(opts.charts && opts.charts.length){
    y = pdfChartGrid(doc, opts.charts, { M:M, y:y, pageW:pageW, pageH:pageH });
  }
  if(opts.narasi && opts.narasi.length){
    y = pdfNarasi(doc, opts.narasi, { M:M, y:y, pageW:pageW, pageH:pageH });
  }
  opts.sections.forEach(function(sec){
    if(y > pageH - 45){ doc.addPage(); y = 26; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(14, 116, 144);
    doc.text(sec.title, M, y);

    let body = sec.body;
    if(!body.length){
      body = [sec.head[0].map(function(_, i){ return i === 0 ? 'Tidak ada data pada periode ini' : ''; })];
    }

    /* lebar kolom diskalakan agar tabel memenuhi lebar halaman */
    const colStyles = {};
    if(sec.widths && sec.widths.every(function(w){ return !!w; })){
      const availW = pageW - (M * 2);
      const sumW = sec.widths.reduce(function(a, b){ return a + b; }, 0);
      const scaled = sec.widths.map(function(w){ return Math.round((w / sumW) * availW * 100) / 100; });
      const fix = Math.round((availW - scaled.reduce(function(a, b){ return a + b; }, 0)) * 100) / 100;
      scaled[scaled.length - 1] = Math.round((scaled[scaled.length - 1] + fix) * 100) / 100;
      scaled.forEach(function(w, i){ colStyles[i] = { cellWidth: w }; });
    }

    doc.autoTable({
      head: sec.head,
      body: body,
      startY: y + 2.5,
      margin: { left:M, right:M, top:22, bottom:20 },
      theme: 'grid',
      styles: {
        font: 'helvetica', fontSize: 7.2, cellPadding: 1.5, overflow: 'linebreak',
        textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.1, valign: 'middle'
      },
      headStyles: { fillColor: [14, 116, 144], textColor: 255, fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
      alternateRowStyles: { fillColor: [245, 251, 253] },
      columnStyles: colStyles
    });

    y = doc.lastAutoTable.finalY + 9;
  });

  /* blok tanda tangan: kiri atasan, kanan pelaksana */
  const t = getTTD();
  let ty = y + 2;
  if(ty > pageH - 62){ doc.addPage(); ty = 30; }

  const leftX = 58;
  const rightX = pageW - 58;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Mengetahui', leftX, ty, { align:'center' });
  doc.text(t.jabatanKepala, leftX, ty + 5, { align:'center' });
  doc.text(t.tempat + ', ' + fmtTanggalIndo(t.tanggal), rightX, ty, { align:'center' });
  doc.text(t.jabatanPetugas, rightX, ty + 5, { align:'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const nameY = ty + 30;
  doc.text(t.namaKepala, leftX, nameY, { align:'center' });
  doc.text(t.namaPetugas, rightX, nameY, { align:'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('NIP. ' + (t.nipKepala || '-'), leftX, nameY + 5, { align:'center' });
  doc.text('NIP. ' + (t.nipPetugas || '-'), rightX, nameY + 5, { align:'center' });

  const total = doc.internal.getNumberOfPages();
  for(let i = 1; i <= total; i++){
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 130, 145);
    doc.text('Halaman ' + i + ' dari ' + total, pageW / 2, pageH - 7, { align:'center' });
    if(i > 1){
      doc.setFontSize(7);
      doc.text(pdfSafe(pakaiKop
        ? 'Rekap Surveilans Malaria — UPTD Puskesmas Nusa Penida I'
        : ((opts.judul || 'Laporan') + ' — Periode: ' + opts.periode)), pageW / 2, 11, { align:'center' });
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(M, 13, pageW - M, 13);
    }
  }

  lastPDFDoc = doc;
  lastPDFName = opts.filename;
  try {
    $('pdfPreview').src = doc.output('datauristring');
    $('pdfModal').classList.add('show');
  } catch(e){}
  doc.save(opts.filename);
  toast('PDF dibuat: ' + opts.filename);
}

function unduhPDFLagi(){
  if(lastPDFDoc) lastPDFDoc.save(lastPDFName);
}
function tutupPdf(){
  $('pdfModal').classList.remove('show');
  $('pdfPreview').src = 'about:blank';
}

function pdfMenu(kind){
  const data = sortTanggal(DB[kind]);
  if(!data.length){
    toast('Belum ada data pada menu ini untuk dibuat PDF.');
    return;
  }
  const cols = COLS[kind];
  buildPDF({
    /* PDF per menu: tanpa kop surat — hanya judul kegiatan + periode (kop hanya di Rekap Laporan) */
    judul: TITLES[kind],
    kop: false,
    periode: periodeDari(data),
    sections: [{
      title: 'Daftar Data (' + data.length + ' data)',
      head: [cols.map(function(c){ return c.label; })],
      body: data.map(function(r, i){ return cols.map(function(c){ return c.pdf(r, i); }); }),
      widths: cols.map(function(c){ return c.w || null; })
    }],
    filename: 'Rekap_Malaria_' + kind + '_' + todayISO() + '.pdf'
  });
}

function pdfRekap(){
  const d = getRekapData();
  if(d.start && d.end && d.start > d.end){
    alert('Periode awal tidak boleh melebihi periode akhir.');
    return;
  }
  const list = d.jenis === 'semua' ? ['migran','sediaan','obat','jentik'] : [d.jenis];
  const st = getRekapStats(d, list);
  if(!st.total){
    toast('Tidak ada data pada periode tersebut.');
    return;
  }

  tampilkanRekap();

  const sections = list.map(function(k){
    const cols = COLS[k];
    const rows = sortTanggal(d[k]);
    return {
      title: TITLES[k] + ' (' + rows.length + ' data)',
      head: [cols.map(function(c){ return c.label; })],
      body: rows.map(function(r, i){ return cols.map(function(c){ return c.pdf(r, i); }); }),
      widths: cols.map(function(c){ return c.w || null; })
    };
  });

  buildPDF({
    judul: 'LAPORAN REKAPITULASI SURVEILANS MALARIA',
    periode: d.periodeLabel,
    charts: rekapChartData(d, list, st),
    narasi: rekapNarasi(d, list, st),
    sections: sections,
    filename: 'Rekap_Malaria_' + d.jenis + '_' + todayISO() + '.pdf'
  });
}

/* ================================================================
   16b. KELOLA AKUN PETUGAS (admin)
================================================================ */
let daftarAkun = [];

function bukaKelolaAkun(){
  if(!STATE.admin){
    toast('Hanya admin yang bisa mengelola akun.', { error: true });
    return;
  }
  $('akunModal').classList.add('show');
  batalEditAkun();
  muatAkun();
}

function tutupKelolaAkun(){
  $('akunModal').classList.remove('show');
}

async function muatAkun(){
  const tbody = $('tbodyAkun');
  if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty">Memuat…</td></tr>';
  try {
    const res = await fetch(API + '?action=staff_list&_=' + Date.now(), {
      cache: 'no-store', headers: { 'Accept': 'application/json' }
    });
    if(res.status === 401){ keLogin(); return; }
    const data = await res.json();
    if(!data || data.ok !== true) throw new Error((data && data.error) || 'Gagal memuat akun');
    daftarAkun = Array.isArray(data.staff) ? data.staff : [];
    renderAkun(data.me || '');
  } catch(err){
    if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty">Gagal memuat akun: ' + esc(err.message) + '</td></tr>';
  }
}

function renderAkun(meId){
  const tbody = $('tbodyAkun');
  if(!tbody) return;
  if(!daftarAkun.length){
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Belum ada akun.</td></tr>';
    return;
  }
  tbody.innerHTML = daftarAkun.map(function(u){
    const isMe = u.id === meId;
    const roleCls = u.role === 'admin' ? 'role-tag admin' : 'role-tag';
    const last = u.last_login ? fmtTanggalIndo(String(u.last_login).slice(0, 10)) : '—';
    return '<tr>' +
      '<td><strong>' + esc(u.nama) + '</strong>' + (isMe ? '<span class="me-tag">(Anda)</span>' : '') + '</td>' +
      '<td>' + esc(u.username) + '</td>' +
      '<td><span class="' + roleCls + '">' + (u.role === 'admin' ? 'Admin' : 'Petugas') + '</span></td>' +
      '<td class="nowrap">' + esc(last) + '</td>' +
      '<td class="aksi">' +
        '<button type="button" class="btn btn-warning btn-sm" onclick="editAkun(\'' + esc(u.id) + '\')">Edit</button>' +
        (isMe ? '' : '<button type="button" class="btn btn-danger btn-sm" onclick="hapusAkun(\'' + esc(u.id) + '\')">Hapus</button>') +
      '</td>' +
    '</tr>';
  }).join('');
}

function editAkun(id){
  const u = daftarAkun.find(function(x){ return x.id === id; });
  if(!u) return;
  $('akunEditId').value = u.id;
  $('akunNama').value = u.nama || '';
  $('akunUsername').value = u.username || '';
  $('akunRole').value = u.role || 'petugas';
  $('akunPassword').value = '';
  $('akunPassword').required = false;
  $('akunPwHint').textContent = '(kosongkan bila tidak diganti)';
  $('editBannerAkun').classList.add('show');
  $('btnBatalAkun').style.display = 'inline-flex';
  $('akunNama').focus();
}

function batalEditAkun(){
  $('formAkun').reset();
  $('akunEditId').value = '';
  $('akunRole').value = 'petugas';
  $('akunPassword').required = true;
  $('akunPwHint').textContent = '(minimal 8 karakter)';
  $('editBannerAkun').classList.remove('show');
  $('btnBatalAkun').style.display = 'none';
}

async function simpanAkun(e){
  if(e) e.preventDefault();
  const id = gv('akunEditId');
  const payload = {
    id: id,
    nama: gv('akunNama'),
    username: gv('akunUsername'),
    role: gv('akunRole'),
    password: gv('akunPassword')
  };
  if(!payload.nama){ alert('Nama petugas wajib diisi.'); return; }
  if(!payload.username){ alert('Nama pengguna wajib diisi.'); return; }
  if(!id && (payload.password || '').length < 8){
    alert('Kata sandi untuk akun baru minimal 8 karakter.');
    return;
  }

  const form = $('formAkun');
  form.classList.add('saving');
  try {
    const data = await apiSend('staff_save', '', payload);
    daftarAkun = Array.isArray(data.staff) ? data.staff : daftarAkun;
    renderAkun(data.me || '');
    batalEditAkun();
    toast(id ? 'Akun diperbarui.' : 'Akun petugas baru dibuat.');
  } catch(err){
    alert('Gagal menyimpan akun:\n' + err.message);
  } finally {
    form.classList.remove('saving');
  }
}

async function hapusAkun(id){
  const u = daftarAkun.find(function(x){ return x.id === id; });
  const nama = u ? u.nama : 'akun ini';
  if(!confirm('Hapus akun "' + nama + '"?\n\nAkun ini tidak akan bisa masuk lagi.')) return;
  try {
    const data = await apiSend('staff_delete', 'id=' + encodeURIComponent(id), {});
    daftarAkun = Array.isArray(data.staff) ? data.staff : daftarAkun;
    renderAkun(data.me || '');
    toast('Akun dihapus.');
  } catch(err){
    alert('Gagal menghapus akun:\n' + err.message);
  }
}

/* ================================================================
   17. INISIALISASI
================================================================ */
function initDates(){
  ['m_tanggal','s_tanggal','o_tanggal','j_tanggal'].forEach(function(id){
    if($(id)) $(id).value = todayISO();
  });
  if($('r_awal') && !$('r_awal').value){
    const d = new Date();
    d.setDate(1);
    const p = function(n){ return String(n).padStart(2,'0'); };
    $('r_awal').value = d.getFullYear() + '-' + p(d.getMonth()+1) + '-01';
    $('r_akhir').value = todayISO();
  }
}

function sedangEdit(){
  return !!(gv('editIdMigran') || gv('editIdSediaan') || gv('editIdObat') || gv('editIdJentik'));
}

async function boot(){
  bacaMeta();
  renderUserChip();
  initWilayah();
  initDates();
  initMap('migran');
  initMap('jentik');

  try {
    const data = await apiGet();
    applyBootstrap(data, { ttd: true });
    bootDone = true;
    const ov = $('bootOverlay');
    if(ov) ov.classList.add('hide');
  } catch(err){
    setSync('err', 'Gagal terhubung');
    const msg = $('bootMsg');
    if(msg) msg.textContent = 'Gagal memuat: ' + err.message + ' — mencoba lagi…';
    setTimeout(boot, 4000);
    return;
  }

  Object.keys(TTD_FIELDS).forEach(function(id){
    const el = $(id);
    if(el){
      el.addEventListener('change', scheduleSaveTTD);
      el.addEventListener('input', scheduleSaveTTD);
    }
  });

  $('pdfModal').addEventListener('click', function(ev){
    if(ev.target === $('pdfModal')) tutupPdf();
  });
  $('akunModal').addEventListener('click', function(ev){
    if(ev.target === $('akunModal')) tutupKelolaAkun();
  });
  document.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape'){ tutupPdf(); tutupKelolaAkun(); }
  });

  /* data dipakai bersama: segarkan otomatis tiap 60 detik bila tidak sedang mengedit */
  setInterval(function(){
    if(document.visibilityState !== 'visible') return;
    if(sedangEdit()) return;
    refreshData(true);
  }, 60000);

  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && !sedangEdit()) refreshData(true);
  });
}

document.addEventListener('DOMContentLoaded', boot);
window.ttdHTML=()=>{const t=getTTD();return`<div class="ttd-gabung" style="display:flex;justify-content:space-between;padding:16px;border-top:3px solid #0e7490;page-break-inside:avoid;break-inside:avoid"><div style="text-align:center;flex:1">Mengetahui,<br>${t.jabatanKepala}<br><br><br><b>${t.namaKepala}</b><br>NIP. ${t.nipKepala}</div><div style="text-align:center;flex:1">${t.tempat}, ${t.tanggal}<br>${t.jabatanPetugas}<br><br><br><b>${t.namaPetugas}</b><br>NIPPPK. ${t.nipPetugas}</div></div>`};
