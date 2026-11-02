<?php
declare(strict_types=1);

define('APP_BOOT', true);

require __DIR__ . '/lib/auth.php';

header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');

/* Halaman ini tertutup: wajib login. Belum login → login.php */
$user = Auth::requirePage();

$build  = 'v2.0';
$csrf   = Auth::csrf();
$isRoot = Auth::isAdmin($user);
$logout = 'logout.php?t=' . rawurlencode($csrf);
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0e7490">
<meta name="robots" content="noindex, nofollow">
<title>Dashboard Surveilans Malaria — Puskesmas Nusa Penida I</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦟</text></svg>">
<link rel="stylesheet" href="assets/leaflet.css">
<link rel="stylesheet" href="style.css?v=<?= $build ?>">
<script src="assets/leaflet.js" defer></script>
<script src="assets/jspdf.umd.min.js" defer></script>
<script src="assets/jspdf.plugin.autotable.min.js" defer></script>
<script src="app.js?v=<?= $build ?>" defer></script>
</head>
<body>

<div id="bootOverlay">
  <div class="boot-card">
    <div class="boot-spin"></div>
    <strong>Memuat data surveilans…</strong>
    <span id="bootMsg">Menghubungkan ke server</span>
  </div>
</div>

<div id="appMeta"
     data-csrf="<?= htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8') ?>"
     data-user-id="<?= htmlspecialchars((string) $user['id'], ENT_QUOTES, 'UTF-8') ?>"
     data-user-nama="<?= htmlspecialchars((string) $user['nama'], ENT_QUOTES, 'UTF-8') ?>"
     data-user-username="<?= htmlspecialchars((string) $user['username'], ENT_QUOTES, 'UTF-8') ?>"
     data-user-role="<?= htmlspecialchars((string) $user['role'], ENT_QUOTES, 'UTF-8') ?>"
     data-logout="<?= htmlspecialchars($logout, ENT_QUOTES, 'UTF-8') ?>"
     hidden></div>

<?php require __DIR__ . '/_markup.php'; ?>

</body>
</html>
