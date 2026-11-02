<?php
/**
 * logout.php — keluar dari sesi lalu kembali ke halaman masuk.
 * Hanya menerima token CSRF yang sah (mencegah logout paksa dari situs lain).
 */

declare(strict_types=1);

require __DIR__ . '/lib/auth.php';

header('Cache-Control: no-store, max-age=0');

Auth::start();

$token = (string) ($_GET['t'] ?? '');
if (Auth::user() !== null && !Auth::csrfOk($token)) {
    http_response_code(400);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Tautan tidak valid</title></head><body style="font-family:system-ui,sans-serif;padding:40px">'
       . '<p>Tautan keluar tidak valid. Silakan kembali ke <a href="index.php">dashboard</a>.</p></body></html>';
    exit;
}

Auth::logout();
header('Location: login.php?keluar=1');
exit;
