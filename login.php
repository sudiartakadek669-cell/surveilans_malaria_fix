<?php
/**
 * login.php — gerbang masuk Dashboard Surveilans Malaria.
 *
 * Jika belum ada akun sama sekali, halaman ini menampilkan form pembuatan
 * akun petugas pertama (otomatis menjadi admin). Setelah itu hanya login biasa.
 */

declare(strict_types=1);

require __DIR__ . '/lib/auth.php';

header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');

Auth::start();

/* sudah login? langsung masuk aplikasi */
if (Auth::user() !== null) {
    header('Location: index.php');
    exit;
}

$firstRun = Auth::staff_count() === 0;
$error = '';
$notice = '';

if (($_GET['keluar'] ?? '') === '1') {
    $notice = 'Anda sudah keluar. Silakan masuk kembali.';
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $token = (string) ($_POST['csrf'] ?? '');
    if (!Auth::csrfOk($token)) {
        $error = 'Sesi formulir kedaluwarsa. Silakan muat ulang halaman.';
    } else {
        $username = (string) ($_POST['username'] ?? '');
        $password = (string) ($_POST['password'] ?? '');

        if ($firstRun) {
            $nama  = (string) ($_POST['nama'] ?? '');
            $pass2 = (string) ($_POST['password2'] ?? '');
            if ($password !== $pass2) {
                $error = 'Konfirmasi kata sandi tidak sama.';
            } else {
                $created = Auth::staff_create($username, $nama, $password, 'admin');
                if (!$created['ok']) {
                    $error = (string) ($created['error'] ?? 'Gagal membuat akun.');
                } else {
                    $res = Auth::attempt($username, $password);
                    if ($res['ok']) {
                        header('Location: index.php');
                        exit;
                    }
                    $error = 'Akun dibuat, tetapi gagal masuk otomatis. Silakan login.';
                    $firstRun = false;
                }
            }
        } else {
            $res = Auth::attempt($username, $password);
            if ($res['ok']) {
                header('Location: index.php');
                exit;
            }
            $error = (string) ($res['error'] ?? 'Gagal masuk.');
        }
    }
}

$csrf = Auth::csrf();
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0e7490">
<meta name="robots" content="noindex, nofollow">
<title><?= $firstRun ? 'Buat Akun Petugas' : 'Masuk' ?> — Dashboard Surveilans Malaria</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦟</text></svg>">
<link rel="stylesheet" href="style.css?v=auth1">
</head>
<body class="auth-body">

<main class="auth-wrap">
  <section class="auth-card">
    <div class="auth-brand">
      <div class="auth-logo" aria-hidden="true">🦟</div>
      <div>
        <h1>Dashboard Surveilans Malaria</h1>
        <p>Puskesmas Nusa Penida I</p>
      </div>
    </div>

    <?php if ($firstRun): ?>
      <div class="auth-head">
        <h2>Buat Akun Petugas Pertama</h2>
        <p>Belum ada akun di aplikasi ini. Akun yang Anda buat sekarang menjadi <strong>admin</strong> dan
           bisa menambahkan akun petugas lainnya.</p>
      </div>

      <?php if ($error !== ''): ?>
        <div class="auth-alert err" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
      <?php endif; ?>

      <form method="post" class="auth-form" autocomplete="off">
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">

        <label for="nama">Nama Lengkap Petugas</label>
        <input type="text" id="nama" name="nama" placeholder="Contoh: I Made Surveilans A.Md.Kep" required maxlength="80" autofocus>

        <label for="username">Nama Pengguna (untuk login)</label>
        <input type="text" id="username" name="username" placeholder="contoh: surveilans" required
               maxlength="32" autocapitalize="none" autocorrect="off" spellcheck="false">

        <label for="password">Kata Sandi</label>
        <input type="password" id="password" name="password" placeholder="Minimal 8 karakter" required minlength="8">

        <label for="password2">Ulangi Kata Sandi</label>
        <input type="password" id="password2" name="password2" placeholder="Ulangi kata sandi" required minlength="8">

        <button type="submit" class="auth-btn">Buat Akun &amp; Masuk</button>
      </form>

      <p class="auth-note">Simpan kata sandi ini di tempat aman. Kata sandi tidak bisa dilihat lagi,
        hanya bisa diganti oleh admin.</p>

    <?php else: ?>
      <div class="auth-head">
        <h2>Masuk untuk Petugas</h2>
        <p>Halaman ini hanya untuk petugas surveilans. Data pasien bersifat rahasia — jangan bagikan
           akun Anda kepada orang lain.</p>
      </div>

      <?php if ($error !== ''): ?>
        <div class="auth-alert err" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
      <?php endif; ?>
      <?php if ($notice !== ''): ?>
        <div class="auth-alert ok" role="status"><?= htmlspecialchars($notice, ENT_QUOTES, 'UTF-8') ?></div>
      <?php endif; ?>

      <form method="post" class="auth-form" autocomplete="off">
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>">

        <label for="username">Nama Pengguna</label>
        <input type="text" id="username" name="username" placeholder="nama pengguna" required
               autocapitalize="none" autocorrect="off" spellcheck="false" autofocus>

        <label for="password">Kata Sandi</label>
        <input type="password" id="password" name="password" placeholder="kata sandi" required>

        <button type="submit" class="auth-btn">Masuk</button>
      </form>

      <p class="auth-note">Lupa kata sandi? Hubungi admin aplikasi untuk menggantinya.</p>
    <?php endif; ?>
  </section>

  <p class="auth-foot">Akses terbatas &middot; Puskesmas Nusa Penida I &middot; Kabupaten Klungkung</p>
</main>

</body>
</html>
