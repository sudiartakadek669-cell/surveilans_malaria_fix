<?php
/**
 * _markup.php — kerangka halaman dashboard (dipakai index.php).
 * Penjaga di bawah membuat berkas ini mengembalikan 404 bila diakses langsung,
 * sehingga struktur internal tidak bisa diunduh dari browser.
 */
if (!defined('APP_BOOT')) {
    http_response_code(404);
    exit;
}
?>
<!-- ================= HEADER ================= -->
<header class="app-header">
  <div class="header-inner">
    <div class="brand">
      <div class="brand-logo">🦟</div>
      <div>
        <h1>Dashboard Surveilans Malaria</h1>
        <p>Puskesmas Nusa Penida I &middot; Kabupaten Klungkung &middot; Provinsi Bali</p>
      </div>
    </div>
    <div class="header-stats" id="headerStats">
      <div class="hstat"><b id="statMigran">0</b><span>Migran</span></div>
      <div class="hstat"><b id="statSediaan">0</b><span>Sediaan</span></div>
      <div class="hstat"><b id="statPositif">0</b><span>Positif</span></div>
      <div class="hstat"><b id="statObat">0</b><span>Pengobatan</span></div>
      <div class="hstat"><b id="statJentik">0</b><span>Jentik</span></div>
    </div>
    <div class="sync-pill" id="syncPill" title="Status penyimpanan data">
      <span class="sync-dot" id="syncDot"></span>
      <span id="syncText">Menghubungkan…</span>
    </div>
    <div class="user-chip">
      <span class="user-avatar" id="userAvatar" aria-hidden="true">P</span>
      <span class="user-info">
        <b id="userNama">Petugas</b>
        <i id="userRole">petugas</i>
      </span>
      <button type="button" class="user-btn" id="btnKelolaAkun" onclick="bukaKelolaAkun()" hidden>Kelola Petugas</button>
      <a class="user-btn user-btn-out" id="btnLogout" href="login.php">Keluar</a>
    </div>
  </div>
</header>

<!-- ================= NAV ================= -->
<nav class="nav-tabs no-print">
  <div class="nav-inner">
    <button class="nav-tab active" data-tab="migran" onclick="showTab('migran')"><span class="num">1</span> Survei Migran</button>
    <button class="nav-tab" data-tab="sediaan" onclick="showTab('sediaan')"><span class="num">2</span> Sediaan Darah</button>
    <button class="nav-tab" data-tab="obat" onclick="showTab('obat')"><span class="num">3</span> Pengobatan</button>
    <button class="nav-tab" data-tab="jentik" onclick="showTab('jentik')"><span class="num">4</span> Survei Jentik</button>
    <button class="nav-tab" data-tab="rekap" onclick="showTab('rekap')"><span class="num">5</span> Rekap Laporan</button>
    <button class="nav-refresh" type="button" onclick="refreshData(false)" title="Ambil data terbaru dari server">
      <span aria-hidden="true">↻</span> Muat Ulang
    </button>
  </div>
</nav>

<main>

  <!-- ================================================================
       MENU 1 — SURVEI MIGRAN
  ================================================================= -->
  <section id="menu-migran" class="menu-section active">
    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Form Survei Migran</h2>
          <p class="sub">Pendataan migran masuk &amp; pemeriksaan RDT di wilayah kerja Puskesmas Nusa Penida I</p>
        </div>
        <div class="head-actions">
          <span class="badge badge-teal" id="badgeMigran">0 data</span>
        </div>
      </div>

      <form id="formMigran" onsubmit="simpanMigran(event)" autocomplete="off">
        <div class="edit-banner" id="editBannerMigran">
          <span>✏️ EDIT MODE — Anda sedang mengubah data migran yang sudah tersimpan.</span>
        </div>
        <input type="hidden" id="editIdMigran">

        <div class="grid2">
          <div class="field">
            <label for="m_tanggal">Tanggal Survei</label>
            <input type="date" id="m_tanggal">
          </div>
          <div class="field">
            <label for="m_lokasi">Lokasi Survei <span class="hint">(otomatis)</span></label>
            <input type="text" id="m_lokasi" placeholder="terisi otomatis dari Banjar - Desa" readonly>
            <span class="hint">Terbentuk dari <strong>Banjar-Desa</strong> yang Anda isi di bawah, contoh: <code>bodong-ped</code>.</span>
          </div>

          <div class="field full">
            <label for="m_titik">Titik Lokasi (Latitude, Longitude)</label>
            <div class="coord-row">
              <input type="text" id="m_titik" placeholder="-8.678900, 115.551200">
              <button type="button" class="btn btn-outline" onclick="ambilGPS('m_titik','migran')">📍 Ambil GPS</button>
            </div>
            <span class="map-note">Klik pada peta untuk mengisi koordinat otomatis dan menaruh marker.</span>
            <div id="mapMigran" class="map-box"></div>
          </div>

          <div class="field">
            <label for="m_nama">Nama Migran</label>
            <input type="text" id="m_nama" placeholder="Nama lengkap migran">
          </div>
          <div class="field">
            <label for="m_ktp">No. KTP</label>
            <input type="text" id="m_ktp" inputmode="numeric" placeholder="16 angka sesuai KTP"
                   oninput="rapikanKTP(this)">
            <span class="hint">Boleh dikosongkan. NIK 16 angka.</span>
          </div>
          <div class="field">
            <label for="m_umur">Umur (tahun)</label>
            <input type="number" id="m_umur" min="0" max="120" placeholder="35">
          </div>

          <div class="field">
            <label for="m_jk">Jenis Kelamin</label>
            <select id="m_jk">
              <option value="L">L — Laki-laki</option>
              <option value="P">P — Perempuan</option>
            </select>
          </div>
          <div class="field">
            <label for="m_asal">Asal Migran</label>
            <input type="text" id="m_asal" list="daftarAsal" placeholder="Ketik atau pilih wilayah asal">
            <datalist id="daftarAsal"></datalist>
            <span class="hint">Kabupaten/Kota &amp; Provinsi seluruh Indonesia.</span>
          </div>

          <div class="field">
            <label for="m_banjar">Banjar</label>
            <input type="text" id="m_banjar" placeholder="Bodong" oninput="syncLokasiMigran()">
            <span class="hint">Ketik manual. Menjadi bagian pertama kolom Lokasi.</span>
          </div>
          <div class="field">
            <label for="m_desa">Desa</label>
            <select id="m_desa" onchange="syncLokasiMigran()">
              <option value="">-- Pilih Desa --</option>
              <option value="Batununggul">Batununggul</option>
              <option value="Ped">Ped</option>
              <option value="Suana">Suana</option>
              <option value="Kutampi Kaler">Kutampi Kaler</option>
              <option value="Kutampi">Kutampi</option>
              <option value="Pejukutan">Pejukutan</option>
              <option value="Tanglad">Tanglad</option>
              <option value="Sekartaji">Sekartaji</option>
            </select>
            <span class="hint">Menjadi bagian kedua kolom Lokasi.</span>
          </div>

          <div class="field">
            <label for="m_alamat">Alamat Lengkap</label>
            <input type="text" id="m_alamat" placeholder="Banjar-Desa Bodong-Ped">
          </div>

          <div class="field">
            <label>Pemeriksaan RDT</label>
            <div class="opt-group">
              <label class="opt"><input type="radio" name="m_rdt" value="Negatif" onchange="toggleRdtJenis()"> Negatif</label>
              <label class="opt"><input type="radio" name="m_rdt" value="Positif" onchange="toggleRdtJenis()"> Positif</label>
              <label class="opt"><input type="radio" name="m_rdt" value="Tidak Periksa" checked onchange="toggleRdtJenis()"> Tidak Periksa</label>
            </div>
          </div>
          <div class="field" id="rdtJenisWrap" style="display:none">
            <label for="m_rdtJenis">Jenis Plasmodium <span class="hint">(jika Positif)</span></label>
            <select id="m_rdtJenis">
              <option value="Pf">Pf — Plasmodium falciparum</option>
              <option value="Pv">Pv — Plasmodium vivax</option>
              <option value="Mix">Mix — Campuran (Pf + Pv)</option>
            </select>
          </div>

          <div class="field full">
            <label>Gejala Klinis</label>
            <div class="opt-group">
              <label class="opt"><input type="checkbox" name="m_gejala" value="Panas/Demam"> Panas/Demam</label>
              <label class="opt"><input type="checkbox" name="m_gejala" value="Menggigil"> Menggigil</label>
              <label class="opt"><input type="checkbox" name="m_gejala" value="Berkeringat"> Berkeringat</label>
              <label class="opt"><input type="checkbox" name="m_gejala" value="Sakit Kepala"> Sakit Kepala</label>
              <label class="opt"><input type="checkbox" name="m_gejala" value="Mual Muntah"> Mual Muntah</label>
              <label class="opt"><input type="checkbox" name="m_gejala" value="Tidak Ada Gejala"> Tidak Ada Gejala</label>
            </div>
            <input type="text" id="m_gejalaLain" placeholder="Gejala lain (ketik manual, contoh: nyeri otot, pucat)">
          </div>

          <div class="field full">
            <label for="m_riwayat">Riwayat Perilaku</label>
            <textarea id="m_riwayat" placeholder="Contoh: sering keluar rumah pada malam hari, tidak memakai kelambu, riwayat tinggal di daerah endemis malaria, sering tidur di halaman..."></textarea>
          </div>
        </div>

        <div class="btn-row">
          <button type="submit" class="btn btn-success">💾 Simpan Data Migran</button>
          <button type="button" class="btn btn-ghost" onclick="resetFormMigran()">↺ Bersihkan Form</button>
          <button type="button" class="btn btn-warning" id="btnBatalMigran" style="display:none" onclick="batalEditMigran()">✖ Batal Edit</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Data Survei Migran</h2>
          <p class="sub">Daftar migran yang sudah didata</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-pdf btn-sm" onclick="pdfMenu('migran')">📄 PDF</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No</th><th>Tgl</th><th>Lokasi</th><th>Nama</th><th>No. KTP</th><th>Umur</th><th>L/P</th>
              <th>Asal</th><th>RDT</th><th>Gejala</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody id="tbodyMigran"></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ================================================================
       MENU 2 — PEMERIKSAAN SEDIAAN DARAH
  ================================================================= -->
  <section id="menu-sediaan" class="menu-section">
    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Form Pemeriksaan Sediaan Darah</h2>
          <p class="sub">Pemeriksaan mikroskopis sediaan darah migran</p>
        </div>
        <div class="head-actions"><span class="badge badge-teal" id="badgeSediaan">0 data</span></div>
      </div>

      <form id="formSediaan" onsubmit="simpanSediaan(event)" autocomplete="off">
        <div class="edit-banner" id="editBannerSediaan">
          <span>✏️ EDIT MODE — Anda sedang mengubah data pemeriksaan sediaan darah.</span>
        </div>
        <input type="hidden" id="editIdSediaan">

        <div class="grid2">
          <div class="field full">
            <label for="s_migran">Pilih Migran dari Menu 1</label>
            <select id="s_migran" onchange="onMigranChange()">
              <option value="">-- Pilih migran --</option>
            </select>
            <span class="hint">Semua kolom boleh dikosongkan. Nama, umur, dan jenis kelamin terisi otomatis bila migran dipilih.</span>
          </div>
          <div class="field">
            <label for="s_tanggal">Tanggal Ambil Darah</label>
            <input type="date" id="s_tanggal">
          </div>
          <div class="field">
            <label for="s_kode">Kode Slide</label>
            <input type="text" id="s_kode" placeholder="NP/I/2026/001">
          </div>
          <div class="field">
            <label for="s_nama">Nama Migran</label>
            <input type="text" id="s_nama" readonly placeholder="otomatis">
          </div>
          <div class="field">
            <label for="s_umur">Umur</label>
            <input type="text" id="s_umur" readonly placeholder="otomatis">
          </div>
          <div class="field">
            <label for="s_jk">Jenis Kelamin</label>
            <input type="text" id="s_jk" readonly placeholder="otomatis">
          </div>
          <div class="field">
            <label for="s_hasil">Hasil Mikroskopis</label>
            <select id="s_hasil">
              <option value="">-- Pilih hasil --</option>
              <option value="Negatif">Negatif</option>
              <option value="Positif Pf">Positif Pf</option>
              <option value="Positif Pv">Positif Pv</option>
              <option value="Positif Mix">Positif Mix</option>
            </select>
          </div>
          <div class="field">
            <label for="s_lab">Pemeriksa Lab</label>
            <input type="text" id="s_lab" placeholder="Nama petugas laboratorium">
          </div>
        </div>

        <div class="btn-row">
          <button type="submit" class="btn btn-success">💾 Simpan Data Sediaan</button>
          <button type="button" class="btn btn-ghost" onclick="resetFormSediaan()">↺ Bersihkan Form</button>
          <button type="button" class="btn btn-warning" id="btnBatalSediaan" style="display:none" onclick="batalEditSediaan()">✖ Batal Edit</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Data Pemeriksaan Sediaan Darah</h2>
          <p class="sub">Riwayat pemeriksaan mikroskopis</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-pdf btn-sm" onclick="pdfMenu('sediaan')">📄 PDF</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>No</th><th>Tgl</th><th>Kode Slide</th><th>Nama</th><th>Umur</th><th>L/P</th><th>Hasil</th><th>Lab</th><th>Aksi</th></tr>
          </thead>
          <tbody id="tbodySediaan"></tbody>
        </table>
      </div>
      <p class="table-note">Baris dengan kode slide &ldquo;—&rdquo; adalah data otomatis dari Menu 1 yang belum diperiksa — klik <strong>Edit</strong> untuk melengkapinya.</p>
    </div>
  </section>

  <!-- ================================================================
       MENU 3 — PENGOBATAN
  ================================================================= -->
  <section id="menu-obat" class="menu-section">
    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Form Pengobatan Malaria</h2>
          <p class="sub">Pengobatan hanya untuk pasien dengan hasil mikroskopis positif</p>
        </div>
        <div class="head-actions"><span class="badge badge-teal" id="badgeObat">0 data</span></div>
      </div>

      <form id="formObat" onsubmit="simpanObat(event)" autocomplete="off">
        <div class="edit-banner" id="editBannerObat">
          <span>✏️ EDIT MODE — Anda sedang mengubah data pengobatan.</span>
        </div>
        <input type="hidden" id="editIdObat">

        <div class="grid2">
          <div class="field full">
            <label for="o_pasien">Pilih Pasien Positif</label>
            <select id="o_pasien" onchange="onPasienChange()">
              <option value="">-- Pilih pasien positif --</option>
            </select>
            <span class="hint">Boleh dikosongkan. Pilihan berisi pasien dari Menu 2 (Sediaan Darah) dengan hasil mengandung kata &ldquo;Positif&rdquo;.</span>
          </div>
          <div class="field">
            <label for="o_tanggal">Tanggal Pengobatan</label>
            <input type="date" id="o_tanggal">
          </div>
          <div class="field">
            <label for="o_obat">Jenis Obat</label>
            <select id="o_obat">
              <option value="">-- Pilih jenis obat --</option>
              <option value="DHP + Primaquine (Pf)">DHP + Primaquine — Pf</option>
              <option value="DHP + PQ 14 hari (Pv)">DHP + PQ 14 hari — Pv</option>
              <option value="Artesunate Injeksi + DHP">Artesunate Injeksi + DHP</option>
              <option value="Chloroquine + PQ">Chloroquine + PQ</option>
            </select>
          </div>
          <div class="field">
            <label for="o_nama">Nama Pasien</label>
            <input type="text" id="o_nama" readonly placeholder="otomatis">
          </div>
          <div class="field">
            <label for="o_umur">Umur</label>
            <input type="text" id="o_umur" readonly placeholder="otomatis">
          </div>
          <div class="field">
            <label for="o_jk">Jenis Kelamin</label>
            <input type="text" id="o_jk" readonly placeholder="otomatis">
          </div>
          <div class="field">
            <label for="o_hasil">Hasil Mikroskopis</label>
            <input type="text" id="o_hasil" readonly placeholder="otomatis">
          </div>
          <div class="field">
            <label for="o_dosis">Dosis / Lama Pengobatan</label>
            <input type="text" id="o_dosis" placeholder="3 hari + PQ 14 hari">
          </div>
          <div class="field full">
            <label for="o_keterangan">Keterangan Follow Up</label>
            <textarea id="o_keterangan" placeholder="Contoh: kontrol hari ke-3, hari ke-7, hari ke-28; kepatuhan minum obat; keluhan sisa..."></textarea>
          </div>
        </div>

        <div class="btn-row">
          <button type="submit" class="btn btn-success">💾 Simpan Data Pengobatan</button>
          <button type="button" class="btn btn-ghost" onclick="resetFormObat()">↺ Bersihkan Form</button>
          <button type="button" class="btn btn-warning" id="btnBatalObat" style="display:none" onclick="batalEditObat()">✖ Batal Edit</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Data Pengobatan</h2>
          <p class="sub">Riwayat pengobatan pasien malaria positif</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-pdf btn-sm" onclick="pdfMenu('obat')">📄 PDF</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>No</th><th>Tgl</th><th>Nama</th><th>Umur</th><th>L/P</th><th>Hasil</th><th>Obat</th><th>Dosis</th><th>Aksi</th></tr>
          </thead>
          <tbody id="tbodyObat"></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ================================================================
       MENU 4 — SURVEI JENTIK
  ================================================================= -->
  <section id="menu-jentik" class="menu-section">
    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Form Survei Jentik</h2>
          <p class="sub">Survei perindukan larva nyamuk Anopheles di lokasi breeding place</p>
        </div>
        <div class="head-actions"><span class="badge badge-teal" id="badgeJentik">0 data</span></div>
      </div>

      <form id="formJentik" onsubmit="simpanJentik(event)" autocomplete="off">
        <div class="edit-banner" id="editBannerJentik">
          <span>✏️ EDIT MODE — Anda sedang mengubah data survei jentik.</span>
        </div>
        <input type="hidden" id="editIdJentik">

        <div class="grid2">
          <div class="field">
            <label for="j_tanggal">Tanggal Survei Jentik</label>
            <input type="date" id="j_tanggal">
          </div>
          <div class="field">
            <label for="j_lokasi">Lokasi Perindukan</label>
            <select id="j_lokasi">
              <option value="">-- Pilih lokasi perindukan --</option>
              <option value="Lagoon Prapat-Ped">Lagoon Prapat-Ped</option>
              <option value="Lagoon Bodong-Ped">Lagoon Bodong-Ped</option>
              <option value="Lagoon Pura Ped-Ped">Lagoon Pura Ped-Ped</option>
              <option value="Lagoon SD Point-Ped">Lagoon SD Point-Ped</option>
              <option value="Lagoon Telaga-Kutampi Kaler">Lagoon Telaga-Kutampi Kaler</option>
              <option value="Lagoon Karangsari-Suana">Lagoon Karangsari-Suana</option>
            </select>
          </div>

          <div class="field full">
            <label for="j_titik">Titik Lokasi (Latitude, Longitude)</label>
            <div class="coord-row">
              <input type="text" id="j_titik" placeholder="-8.678900, 115.551200">
              <button type="button" class="btn btn-outline" onclick="ambilGPS('j_titik','jentik')">📍 Ambil GPS</button>
            </div>
            <span class="map-note">Klik pada peta untuk mengisi koordinat otomatis dan menaruh marker.</span>
            <div id="mapJentik" class="map-box"></div>
          </div>

          <div class="field">
            <label for="j_kepadatan">Kepadatan Jentik</label>
            <select id="j_kepadatan">
              <option value="">-- Pilih kepadatan --</option>
              <option value="Tidak Ada (0)">Tidak Ada (0)</option>
              <option value="Rendah (1-10)">Rendah (1-10)</option>
              <option value="Sedang (11-50)">Sedang (11-50)</option>
              <option value="Tinggi (>50)">Tinggi (&gt;50)</option>
            </select>
          </div>

          <div class="field">
            <label for="j_salinitas">Salinity (ppt)</label>
            <input type="text" id="j_salinitas" placeholder="0 ppt">
          </div>
          <div class="field">
            <label for="j_suhu">Suhu (°C)</label>
            <input type="number" id="j_suhu" step="0.1" placeholder="28">
          </div>
          <div class="field">
            <label for="j_ph">pH Air</label>
            <input type="text" id="j_ph" placeholder="7,2">
          </div>
          <div class="field">
            <label for="j_kejernihan">Kejernihan Air</label>
            <select id="j_kejernihan">
              <option value="">-- Pilih kejernihan --</option>
              <option value="Jernih">Jernih</option>
              <option value="Keruh">Keruh</option>
              <option value="Berlumut">Berlumut</option>
            </select>
          </div>
          <div class="field">
            <label for="j_sumber">Sumber Air</label>
            <select id="j_sumber">
              <option value="">-- Pilih sumber air --</option>
              <option value="Air Hujan">Air Hujan</option>
              <option value="Air Sumur">Air Sumur</option>
              <option value="Air PDAM">Air PDAM</option>
              <option value="Air Laut">Air Laut</option>
              <option value="Payau">Payau</option>
              <option value="Air Sungai">Air Sungai</option>
            </select>
          </div>

          <div class="field full">
            <label>Predator Alami</label>
            <div class="opt-group">
              <label class="opt"><input type="checkbox" name="j_predator" value="Ikan Kepala Timah"> Ikan Kepala Timah</label>
              <label class="opt"><input type="checkbox" name="j_predator" value="Brudu"> Brudu</label>
              <label class="opt"><input type="checkbox" name="j_predator" value="Capung"> Capung</label>
              <label class="opt"><input type="checkbox" name="j_predator" value="Ikan Cupang"> Ikan Cupang</label>
              <label class="opt"><input type="checkbox" name="j_predator" value="Ikan Gabus"> Ikan Gabus</label>
              <label class="opt"><input type="checkbox" name="j_predator" value="Tidak Ada Predator"> Tidak Ada Predator</label>
            </div>
            <input type="text" id="j_predatorLain" placeholder="Predator lain (ketik manual)">
          </div>

          <div class="field full">
            <label>Kondisi Lingkungan</label>
            <div class="opt-group">
              <label class="opt"><input type="checkbox" name="j_kondisi" value="Banyak Sampah"> Banyak Sampah</label>
              <label class="opt"><input type="checkbox" name="j_kondisi" value="Lumut Lebat"> Lumut Lebat</label>
              <label class="opt"><input type="checkbox" name="j_kondisi" value="Tertutup"> Tertutup</label>
              <label class="opt"><input type="checkbox" name="j_kondisi" value="Vegetasi"> Vegetasi</label>
              <label class="opt"><input type="checkbox" name="j_kondisi" value="Terlindung"> Terlindung</label>
              <label class="opt"><input type="checkbox" name="j_kondisi" value="Terbuka Matahari"> Terbuka Matahari</label>
            </div>
          </div>

          <div class="field full">
            <label>Jenis Intervensi</label>
            <div class="opt-group">
              <label class="opt"><input type="checkbox" name="j_intervensi" value="Pembersihan Sampah"> Pembersihan Sampah</label>
              <label class="opt"><input type="checkbox" name="j_intervensi" value="Pembersihan Lumut"> Pembersihan Lumut</label>
              <label class="opt"><input type="checkbox" name="j_intervensi" value="Larvasidasi"> Larvasidasi</label>
              <label class="opt"><input type="checkbox" name="j_intervensi" value="Menabur Ikan Predator"> Menabur Ikan Predator</label>
              <label class="opt"><input type="checkbox" name="j_intervensi" value="PSN 3M"> PSN 3M</label>
              <label class="opt"><input type="checkbox" name="j_intervensi" value="Penyuluhan"> Penyuluhan</label>
            </div>
            <input type="text" id="j_intervensiLain" placeholder="Intervensi lain (ketik manual)">
          </div>
        </div>

        <div class="btn-row">
          <button type="submit" class="btn btn-success">💾 Simpan Data Jentik</button>
          <button type="button" class="btn btn-ghost" onclick="resetFormJentik()">↺ Bersihkan Form</button>
          <button type="button" class="btn btn-warning" id="btnBatalJentik" style="display:none" onclick="batalEditJentik()">✖ Batal Edit</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Data Survei Jentik</h2>
          <p class="sub">Daftar lokasi perindukan yang disurvei</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-pdf btn-sm" onclick="pdfMenu('jentik')">📄 PDF</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>No</th><th>Tgl</th><th>Lokasi Perindukan</th><th>Parameter Air</th><th>Kepadatan</th><th>Predator</th><th>Intervensi</th><th>Aksi</th></tr>
          </thead>
          <tbody id="tbodyJentik"></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ================================================================
       MENU 5 — REKAP LAPORAN + TTD
  ================================================================= -->
  <section id="menu-rekap" class="menu-section">
    <div class="card no-print">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Filter Rekap Laporan</h2>
          <p class="sub">Pilih periode &amp; jenis laporan, lalu klik Tampilkan</p>
        </div>
      </div>
      <div class="grid3">
        <div class="field">
          <label for="r_awal">Periode Awal</label>
          <input type="date" id="r_awal">
        </div>
        <div class="field">
          <label for="r_akhir">Periode Akhir</label>
          <input type="date" id="r_akhir">
        </div>
        <div class="field">
          <label for="r_jenis">Jenis Laporan</label>
          <select id="r_jenis">
            <option value="semua">Semua (4 Menu)</option>
            <option value="migran">Survei Migran</option>
            <option value="sediaan">Sediaan Darah</option>
            <option value="obat">Pengobatan</option>
            <option value="jentik">Survei Jentik</option>
          </select>
        </div>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" onclick="tampilkanRekap()">🔎 Tampilkan</button>
        <button type="button" class="btn btn-pdf" onclick="pdfRekap()">📄 PDF Rekap</button>
        <button type="button" class="btn btn-ghost" onclick="cetakRekap()">🖨️ Print</button>
      </div>
    </div>

    <div class="card no-print">
      <div class="card-head">
        <div>
          <h2><span class="dot"></span> Data Entry Tanda Tangan Laporan</h2>
          <p class="sub">Blok kiri = Mengetahui (Kepala Puskesmas) &middot; Blok kanan = Pelaksana (Petugas Surveilans)</p>
        </div>
      </div>

      <div class="grid3" style="margin-bottom:16px">
        <div class="field"><label for="ttdNamaKepala">Nama Kepala Puskesmas (Kiri)</label><input type="text" id="ttdNamaKepala" value="dr I Wayan Widia M.Kes"></div>
        <div class="field"><label for="ttdJabatanKepala">Jabatan Kepala</label><input type="text" id="ttdJabatanKepala" value="Kepala Puskesmas Nusa Penida I"></div>
        <div class="field"><label for="ttdNipKepala">NIP Kepala</label><input type="text" id="ttdNipKepala" placeholder="19700101 200001 1 001"></div>
      </div>
      <div class="grid3" style="margin-bottom:16px">
        <div class="field"><label for="ttdNamaPetugas">Nama Petugas Surveilans (Kanan)</label><input type="text" id="ttdNamaPetugas" value="I Made Surveilans A.Md.Kep"></div>
        <div class="field"><label for="ttdJabatanPetugas">Jabatan Petugas</label><input type="text" id="ttdJabatanPetugas" value="Petugas Surveilans Malaria"></div>
        <div class="field"><label for="ttdNipPetugas">NIP Petugas</label><input type="text" id="ttdNipPetugas" placeholder="19850202 201001 2 002"></div>
      </div>
      <div class="grid3">
        <div class="field"><label for="ttdTempat">Tempat Laporan</label><input type="text" id="ttdTempat" value="Sampalan"></div>
        <div class="field"><label for="ttdTanggal">Tanggal Laporan (manual)</label><input type="date" id="ttdTanggal"></div>
      </div>
    </div>

    <div id="rekapHasil"></div>
  </section>

</main>

<!-- ================= MODAL PREVIEW PDF ================= -->
<div class="modal" id="pdfModal">
  <div class="modal-box">
    <div class="modal-head">
      <h3>📄 Preview PDF</h3>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="unduhPDFLagi()">⬇️ Unduh PDF</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="tutupPdf()">Tutup</button>
      </div>
    </div>
    <div class="modal-body">
      <iframe id="pdfPreview" title="Preview PDF"></iframe>
    </div>
  </div>
</div>

<!-- ================= MODAL KELOLA PETUGAS (admin) ================= -->
<div class="modal" id="akunModal">
  <div class="modal-box modal-box-form">
    <div class="modal-head">
      <h3>👥 Kelola Akun Petugas</h3>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick="tutupKelolaAkun()">Tutup</button>
      </div>
    </div>
    <div class="modal-body modal-body-form">
      <form id="formAkun" onsubmit="simpanAkun(event)" autocomplete="off" class="akun-form">
        <input type="hidden" id="akunEditId">
        <div class="edit-banner" id="editBannerAkun">
          <span>✏️ EDIT AKUN — kosongkan kata sandi bila tidak ingin menggantinya.</span>
        </div>
        <div class="grid2">
          <div class="field">
            <label for="akunNama">Nama Lengkap Petugas</label>
            <input type="text" id="akunNama" required maxlength="80" placeholder="Nama petugas">
          </div>
          <div class="field">
            <label for="akunUsername">Nama Pengguna</label>
            <input type="text" id="akunUsername" required maxlength="32" placeholder="huruf kecil/angka" autocapitalize="none" spellcheck="false">
          </div>
          <div class="field">
            <label for="akunRole">Peran</label>
            <select id="akunRole">
              <option value="petugas">Petugas — bisa input data</option>
              <option value="admin">Admin — bisa input + kelola akun</option>
            </select>
          </div>
          <div class="field">
            <label for="akunPassword">Kata Sandi <span class="hint" id="akunPwHint">(minimal 8 karakter)</span></label>
            <input type="password" id="akunPassword" minlength="8" placeholder="Kata sandi baru" autocomplete="new-password">
          </div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-success">💾 Simpan Akun</button>
          <button type="button" class="btn btn-warning" id="btnBatalAkun" style="display:none" onclick="batalEditAkun()">✖ Batal Edit</button>
        </div>
      </form>

      <h4 class="akun-sub">Daftar Akun</h4>
      <div class="table-wrap">
        <table class="akun-table">
          <thead>
            <tr><th>Nama</th><th>Nama Pengguna</th><th>Peran</th><th>Login Terakhir</th><th>Aksi</th></tr>
          </thead>
          <tbody id="tbodyAkun">
            <tr><td colspan="5" class="empty">Memuat…</td></tr>
          </tbody>
        </table>
      </div>
      <p class="table-note">Hanya admin yang bisa menambah atau mengubah akun. Kata sandi tidak dapat dilihat,
        hanya bisa diganti.</p>
    </div>
  </div>
</div>

<div id="toast"></div>
