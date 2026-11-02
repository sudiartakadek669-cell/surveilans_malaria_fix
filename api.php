<?php
/**
 * api.php — endpoint JSON Dashboard Surveilans Malaria.
 *
 *  GET  api.php?action=bootstrap                 → semua data + pengaturan TTD + info akun
 *  GET  api.php?action=health                    → status backend penyimpanan (tanpa data)
 *  GET  api.php?action=staff_list                → daftar akun petugas (admin)
 *  POST api.php?action=save&res=<res>            → simpan/ubah record (body JSON, sertakan id bila mengubah)
 *  POST api.php?action=delete&res=<res>&id=<id>  → hapus record
 *  POST api.php?action=ttd                       → simpan pengaturan TTD (body JSON)
 *  POST api.php?action=staff_save                → tambah/ubah akun petugas (admin)
 *  POST api.php?action=staff_delete&id=<id>      → hapus akun petugas (admin)
 *
 * KEAMANAN: semua endpoint (kecuali health) wajib sesi login yang sah;
 * semua POST wajib header X-CSRF-Token yang cocok dengan token di sesi.
 *
 * Aturan relasi dijalankan di server agar konsisten dari perangkat mana pun:
 *  - migran baru        → otomatis dibuatkan baris placeholder di `sediaan` (nama/umur/jk)
 *  - migran diubah      → placeholder sediaan terkait ikut disinkronkan
 *  - migran dihapus     → placeholder sediaan miliknya ikut dihapus
 *  - sediaan baru       → menimpa placeholder migran terkait (tidak menduplikasi)
 */

declare(strict_types=1);

require __DIR__ . '/lib/store.php';
require __DIR__ . '/lib/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

$action = (string) ($_GET['action'] ?? '');

function body_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function clean_str($v, int $max = 2000): string
{
    if (is_array($v) || is_object($v)) {
        return '';
    }
    $s = trim((string) $v);
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max);
    }
    return substr($s, 0, $max);
}

function clean_list($v, int $maxItems = 40): array
{
    if (!is_array($v)) {
        return [];
    }
    $out = [];
    foreach ($v as $item) {
        if (is_scalar($item)) {
            $s = clean_str($item, 160);
            if ($s !== '') {
                $out[] = $s;
            }
        }
        if (count($out) >= $maxItems) {
            break;
        }
    }
    return $out;
}

function tanggal_only(string $v): string
{
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : '';
}

/** Normalisasi field yang boleh masuk, per resource. */
function sanitize_record(string $res, array $in): array
{
    $g = static fn(string $k, int $max = 2000): string => clean_str($in[$k] ?? '', $max);

    switch ($res) {
        case 'migran':
            $rdt = $g('rdt', 30);
            if (!in_array($rdt, ['Negatif', 'Positif', 'Tidak Periksa'], true)) {
                $rdt = 'Tidak Periksa';
            }
            $jenis = $g('rdtJenis', 10);
            if (!in_array($jenis, ['Pf', 'Pv', 'Mix'], true)) {
                $jenis = 'Pf';
            }
            $jk = $g('jk', 2);
            $ktp = preg_replace('/\D+/', '', $g('ktp', 40));
            if (strlen($ktp) > 16) {
                $ktp = substr($ktp, 0, 16);
            }
            /* Lokasi migran selalu berbentuk "banjar-desa" (contoh: bodong-ped).
               Banjar/Desa tetap disimpan, tetapi tidak lagi tampil sebagai kolom sendiri. */
            $banjar = $g('banjar', 120);
            $desa   = $g('desa', 120);
            $lokasi = $g('lokasi', 200);
            $gabung = trim($banjar . '-' . $desa, " -");
            if ($gabung !== '') {
                $lokasi = $gabung;
            }
            return [
                'tanggal'    => tanggal_only($g('tanggal', 10)),
                'lokasi'     => $lokasi,
                'titik'      => $g('titik', 60),
                'nama'       => $g('nama', 140),
                'ktp'        => $ktp,
                'umur'       => $g('umur', 6),
                'jk'         => in_array($jk, ['L', 'P'], true) ? $jk : 'L',
                'asal'       => $g('asal', 160),
                'banjar'     => $banjar,
                'desa'       => $desa,
                'alamat'     => $g('alamat', 300),
                'rdt'        => $rdt,
                'rdtJenis'   => $rdt === 'Positif' ? $jenis : '',
                'gejala'     => clean_list($in['gejala'] ?? []),
                'gejalaLain' => $g('gejalaLain', 300),
                'riwayat'    => $g('riwayat', 2000),
            ];

        case 'sediaan':
            $hasil = $g('hasil', 40);
            if (!in_array($hasil, ['', 'Negatif', 'Positif Pf', 'Positif Pv', 'Positif Mix'], true)) {
                $hasil = '';
            }
            $jk = $g('jk', 2);
            return [
                'migranId'    => $g('migranId', 60),
                'tanggal'     => tanggal_only($g('tanggal', 10)),
                'kode'        => $g('kode', 60),
                'nama'        => $g('nama', 140),
                'umur'        => $g('umur', 6),
                'jk'          => in_array($jk, ['L', 'P'], true) ? $jk : 'L',
                'hasil'       => $hasil,
                'lab'         => $g('lab', 140),
                'placeholder' => false,
            ];

        case 'obat':
            $jk = $g('jk', 2);
            return [
                'sediaanId'  => $g('sediaanId', 60),
                'migranId'   => $g('migranId', 60),
                'tanggal'    => tanggal_only($g('tanggal', 10)),
                'nama'       => $g('nama', 140),
                'umur'       => $g('umur', 6),
                'jk'         => in_array($jk, ['L', 'P'], true) ? $jk : 'L',
                'hasil'      => $g('hasil', 40),
                'obat'       => $g('obat', 120),
                'dosis'      => $g('dosis', 200),
                'keterangan' => $g('keterangan', 2000),
            ];

        case 'jentik':
            return [
                'tanggal'        => tanggal_only($g('tanggal', 10)),
                'lokasi'         => $g('lokasi', 300),
                'titik'          => $g('titik', 60),
                'salinitas'      => $g('salinitas', 60),
                'suhu'           => $g('suhu', 20),
                'ph'             => $g('ph', 20),
                'kejernihan'     => $g('kejernihan', 60),
                'sumber'         => $g('sumber', 60),
                'kepadatan'      => $g('kepadatan', 60),
                'predator'       => clean_list($in['predator'] ?? []),
                'predatorLain'   => $g('predatorLain', 300),
                'kondisi'        => clean_list($in['kondisi'] ?? []),
                'intervensi'     => clean_list($in['intervensi'] ?? []),
                'intervensiLain' => $g('intervensiLain', 300),
            ];
    }

    fail('Resource tidak dikenal: ' . $res, 404);
    return [];
}

function bootstrap(Store $store, array $user): array
{
    return [
        'ok'      => true,
        'driver'  => $store->driver(),
        'migran'  => $store->all('migran'),
        'sediaan' => $store->all('sediaan'),
        'obat'    => $store->all('obat'),
        'jentik'  => $store->all('jentik'),
        'ttd'     => $store->settings(),
        'user'    => $user,
        'csrf'    => Auth::csrf(),
        'admin'   => Auth::isAdmin($user),
    ];
}

/** Hanya akun admin yang boleh mengelola akun petugas. */
function require_admin(array $user): void
{
    if (!Auth::isAdmin($user)) {
        fail('Hanya admin yang boleh mengelola akun petugas.', 403);
    }
}

/** POST dari aplikasi wajib menyertakan token CSRF di header. */
function require_csrf(): void
{
    $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!Auth::csrfOk($token)) {
        fail('Token keamanan tidak valid. Muat ulang halaman lalu coba lagi.', 419);
    }
}

try {
    $store = Store::open();

    /* health sengaja tanpa data & tanpa login (untuk diagnosa) */
    if ($action === 'health') {
        echo json_encode([
            'ok'     => true,
            'driver' => $store->driver(),
            'php'    => PHP_VERSION,
            'auth'   => Auth::user() !== null,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* mulai di sini: wajib login */
    $user = Auth::requireApi();

    if ($action === 'bootstrap') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
            fail('Gunakan GET untuk bootstrap.', 405);
        }
        echo json_encode(bootstrap($store, $user), JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'staff_list') {
        require_admin($user);
        echo json_encode(['ok' => true, 'staff' => Auth::staff_all(), 'me' => $user['id']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        fail('Metode tidak diizinkan.', 405);
    }

    require_csrf();

    if ($action === 'staff_save') {
        require_admin($user);
        $in = body_json();
        $id = clean_str($in['id'] ?? '', 60);
        $fields = [
            'username' => clean_str($in['username'] ?? '', 32),
            'nama'     => clean_str($in['nama'] ?? '', 80),
            'role'     => clean_str($in['role'] ?? 'petugas', 10),
        ];
        if (array_key_exists('password', $in) && (string) $in['password'] !== '') {
            $fields['password'] = (string) $in['password'];
        }

        $res = $id === ''
            ? Auth::staff_create($fields['username'], $fields['nama'], (string) ($fields['password'] ?? ''), $fields['role'])
            : Auth::staff_update($id, $fields);

        if (!$res['ok']) {
            fail((string) ($res['error'] ?? 'Gagal menyimpan akun.'), 400);
        }
        echo json_encode(['ok' => true, 'staff' => Auth::staff_all(), 'me' => $user['id']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'staff_delete') {
        require_admin($user);
        $id = clean_str($_GET['id'] ?? '', 60);
        if ($id === '') {
            fail('id akun wajib diisi.');
        }
        $res = Auth::staff_delete($id, (string) $user['id']);
        if (!$res['ok']) {
            fail((string) ($res['error'] ?? 'Gagal menghapus akun.'), 400);
        }
        echo json_encode(['ok' => true, 'staff' => Auth::staff_all(), 'me' => $user['id']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'save') {
        $res = (string) ($_GET['res'] ?? '');
        if (!in_array($res, Store::RESOURCES, true)) {
            fail('Resource tidak dikenal.', 404);
        }

        $in  = body_json();
        $rec = sanitize_record($res, $in);
        $id  = clean_str($in['id'] ?? '', 60);
        /* jejak siapa yang mencatat (diisi server, tidak bisa dipalsukan dari browser) */
        $rec['dicatat_oleh'] = (string) ($user['nama'] ?? '');

        /* Semua field opsional — tidak ada lagi penolakan karena field kosong.
           Penyimpanan tetap memakai whitelist sanitize_record() sehingga tipe & panjang aman. */

        $store->begin();
        try {
            if ($res === 'migran') {
                $isNew = ($id === '' || $store->find($id) === null);
                $savedId = $store->put('migran', $rec, $id !== '' ? $id : null);

                if ($isNew) {
                    $store->put('sediaan', [
                        'migranId'    => $savedId,
                        'tanggal'     => '',
                        'kode'        => '',
                        'nama'        => $rec['nama'],
                        'umur'        => $rec['umur'],
                        'jk'          => $rec['jk'],
                        'hasil'       => '',
                        'lab'         => '',
                        'placeholder' => true,
                    ]);
                } else {
                    /* sinkronkan identitas (nama/umur/jk) di Menu 2 & Menu 3 milik migran ini,
                       supaya koreksi nama tidak membuat data saling bertentangan */
                    $sediaanIds = [];
                    foreach ($store->all('sediaan') as $s) {
                        if ((string) ($s['migranId'] ?? '') !== $savedId) {
                            continue;
                        }
                        $sediaanIds[] = (string) $s['id'];
                        $s['nama'] = $rec['nama'];
                        $s['umur'] = $rec['umur'];
                        $s['jk']   = $rec['jk'];
                        $store->put('sediaan', $s, (string) $s['id']);
                    }
                    foreach ($store->all('obat') as $o) {
                        $linked = ((string) ($o['migranId'] ?? '') === $savedId)
                            || in_array((string) ($o['sediaanId'] ?? ''), $sediaanIds, true);
                        if (!$linked) {
                            continue;
                        }
                        $o['nama'] = $rec['nama'];
                        $o['umur'] = $rec['umur'];
                        $o['jk']   = $rec['jk'];
                        $store->put('obat', $o, (string) $o['id']);
                    }
                }
            } elseif ($res === 'sediaan' && $id === '') {
                /* timpa placeholder milik migran yang sama — hanya bila migranId benar-benar
                   terisi, supaya sediaan tanpa migran (semua field opsional) tidak menimpa
                   placeholder milik migran lain. */
                $target = null;
                if ((string) $rec['migranId'] !== '') {
                    foreach ($store->all('sediaan') as $s) {
                        if ((string) ($s['migranId'] ?? '') === (string) $rec['migranId'] && !empty($s['placeholder'])) {
                            $target = $s;
                            break;
                        }
                    }
                }
                if ($target !== null) {
                    $store->put('sediaan', $rec, (string) $target['id']);
                } else {
                    $store->put('sediaan', $rec);
                }
            } else {
                $store->put($res, $rec, $id !== '' ? $id : null);
            }

            $store->commit();
        } catch (Throwable $e) {
            $store->rollback();
            throw $e;
        }

        echo json_encode(bootstrap($store, $user), JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'delete') {
        $res = (string) ($_GET['res'] ?? '');
        $id  = clean_str($_GET['id'] ?? '', 60);
        if (!in_array($res, Store::RESOURCES, true)) {
            fail('Resource tidak dikenal.', 404);
        }
        if ($id === '') {
            fail('id wajib diisi.');
        }

        $store->begin();
        try {
            $store->delete($id);
            if ($res === 'migran') {
                foreach ($store->all('sediaan') as $s) {
                    if (($s['migranId'] ?? '') === $id && !empty($s['placeholder'])) {
                        $store->delete((string) $s['id']);
                    }
                }
            }
            $store->commit();
        } catch (Throwable $e) {
            $store->rollback();
            throw $e;
        }

        echo json_encode(bootstrap($store, $user), JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'ttd') {
        $in = body_json();
        $allowed = [
            'ttd_nama_kepala', 'ttd_jabatan_kepala', 'ttd_nip_kepala',
            'ttd_nama_petugas', 'ttd_jabatan_petugas', 'ttd_nip_petugas',
            'ttd_tempat', 'ttd_tanggal',
        ];

        $store->begin();
        try {
            foreach ($allowed as $k) {
                if (array_key_exists($k, $in)) {
                    $v = clean_str($in[$k], 200);
                    if ($k === 'ttd_tanggal') {
                        $v = tanggal_only($v);
                    }
                    $store->settingSet($k, $v);
                }
            }
            $store->commit();
        } catch (Throwable $e) {
            $store->rollback();
            throw $e;
        }

        echo json_encode(['ok' => true, 'ttd' => $store->settings()], JSON_UNESCAPED_UNICODE);
        exit;
    }

    fail('Action tidak dikenal.', 404);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Kesalahan server: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
