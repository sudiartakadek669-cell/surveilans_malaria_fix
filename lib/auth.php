<?php
/**
 * lib/auth.php — sesi login + akun petugas.
 *
 * Model: aplikasi tertutup. Semua halaman & API hanya bisa dipakai setelah login.
 * Akun disimpan sebagai JSON di tabel `settings` (key `staff_users`), sehingga
 * tidak perlu skema baru dan tetap jalan di kedua backend Store (SQLite / JSON).
 *
 * Setiap akun: id, username, nama, role ('admin'|'petugas'), hash, created_at, last_login.
 * Hanya akun role `admin` yang boleh mengelola akun petugas lain.
 */

declare(strict_types=1);

require_once __DIR__ . '/store.php';

final class Auth
{
    public const SESSION_NAME  = 'SURVMAL_SESS';
    public const IDLE_SECONDS  = 28800;   // 8 jam tidak aktif → harus login lagi
    private const USERS_KEY    = 'staff_users';
    private const MAX_TRY      = 5;
    private const LOCK_SECONDS = 60;

    private static ?Store $store = null;

    public static function store(): Store
    {
        if (self::$store === null) {
            self::$store = Store::open();
        }
        return self::$store;
    }

    /* ----------------------------- sesi ----------------------------- */

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        // simpan sesi di folder aplikasi (bukan /tmp bersama) agar tidak terhapus gc app lain
        $dir = dirname(__DIR__) . '/var/sessions';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            session_save_path($dir);
        }

        ini_set('session.gc_maxlifetime', (string) self::IDLE_SECONDS);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');

        $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
            || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');

        session_name(self::SESSION_NAME);
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        @session_start();
    }

    public static function user(): ?array
    {
        self::start();
        $uid = $_SESSION['uid'] ?? null;
        if (!is_string($uid) || $uid === '') {
            return null;
        }

        $seen = (int) ($_SESSION['seen'] ?? 0);
        if ($seen > 0 && (time() - $seen) > self::IDLE_SECONDS) {
            self::logout();
            return null;
        }

        $u = self::staff_find($uid);
        if ($u === null) {
            self::logout();
            return null;
        }

        $_SESSION['seen'] = time();
        return $u;
    }

    public static function isAdmin(?array $user = null): bool
    {
        $user = $user ?? self::user();
        return $user !== null && ($user['role'] ?? '') === 'admin';
    }

    /** Guard halaman HTML: belum login → ke login.php. */
    public static function requirePage(): array
    {
        $u = self::user();
        if ($u === null) {
            header('Cache-Control: no-store');
            header('Location: login.php');
            exit;
        }
        return $u;
    }

    /** Guard API: belum login → 401 JSON. */
    public static function requireApi(): array
    {
        $u = self::user();
        if ($u === null) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'ok'    => false,
                'auth'  => false,
                'error' => 'Sesi berakhir. Silakan masuk kembali.',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        return $u;
    }

    /* --------------------------- login/logout --------------------------- */

    /**
     * @return array{ok:bool,error?:string,user?:array}
     */
    public static function attempt(string $username, string $password): array
    {
        self::start();

        $now  = time();
        $try  = $_SESSION['login_try'] ?? ['n' => 0, 'until' => 0];
        $until = (int) ($try['until'] ?? 0);
        if ($until > $now) {
            return ['ok' => false, 'error' => 'Terlalu banyak percobaan. Coba lagi dalam ' . ($until - $now) . ' detik.'];
        }

        $username = strtolower(trim($username));
        if ($username === '' || $password === '') {
            return ['ok' => false, 'error' => 'Nama pengguna dan kata sandi wajib diisi.'];
        }

        $found = null;
        foreach (self::staff_all_raw() as $u) {
            if (strtolower((string) ($u['username'] ?? '')) === $username) {
                $found = $u;
                break;
            }
        }

        $ok = $found !== null && password_verify($password, (string) ($found['hash'] ?? ''));
        if (!$ok) {
            usleep(350000); // perlambat brute force
            $n = (int) ($try['n'] ?? 0) + 1;
            $_SESSION['login_try'] = $n >= self::MAX_TRY
                ? ['n' => 0, 'until' => $now + self::LOCK_SECONDS]
                : ['n' => $n, 'until' => 0];
            return ['ok' => false, 'error' => 'Nama pengguna atau kata sandi salah.'];
        }

        self::touch_login((string) $found['id']);
        session_regenerate_id(true);
        $_SESSION['uid']     = (string) $found['id'];
        $_SESSION['seen']    = $now;
        $_SESSION['csrf']    = bin2hex(random_bytes(24));
        unset($_SESSION['login_try']);

        return ['ok' => true, 'user' => self::staff_find((string) $found['id']) ?? []];
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires'  => time() - 42000,
                'path'     => $p['path'] ?: '/',
                'domain'   => $p['domain'] ?? '',
                'secure'   => (bool) ($p['secure'] ?? false),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        @session_destroy();
    }

    /* ------------------------------ CSRF ------------------------------ */

    public static function csrf(): string
    {
        self::start();
        if (empty($_SESSION['csrf']) || !is_string($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(24));
        }
        return $_SESSION['csrf'];
    }

    public static function csrfOk(?string $token): bool
    {
        self::start();
        $mine = $_SESSION['csrf'] ?? '';
        return is_string($mine) && $mine !== '' && is_string($token) && hash_equals($mine, $token);
    }

    /* ------------------------------ akun ------------------------------ */

    /** @return array<int,array<string,mixed>> termasuk hash (internal saja) */
    private static function staff_all_raw(): array
    {
        $settings = self::store()->settings();
        $raw = $settings[self::USERS_KEY] ?? '';
        $list = json_decode((string) $raw, true);
        return is_array($list) ? array_values(array_filter($list, 'is_array')) : [];
    }

    private static function staff_write(array $list): void
    {
        self::store()->settingSet(self::USERS_KEY, json_encode(array_values($list), JSON_UNESCAPED_UNICODE));
    }

    /** Daftar akun tanpa hash — aman dikirim ke klien. */
    public static function staff_all(): array
    {
        $out = [];
        foreach (self::staff_all_raw() as $u) {
            $out[] = [
                'id'         => (string) ($u['id'] ?? ''),
                'username'   => (string) ($u['username'] ?? ''),
                'nama'       => (string) ($u['nama'] ?? ''),
                'role'       => (string) ($u['role'] ?? 'petugas'),
                'created_at' => (string) ($u['created_at'] ?? ''),
                'last_login' => (string) ($u['last_login'] ?? ''),
            ];
        }
        usort($out, static fn($a, $b) => strcmp($a['nama'], $b['nama']));
        return $out;
    }

    public static function staff_find(string $id): ?array
    {
        foreach (self::staff_all_raw() as $u) {
            if ((string) ($u['id'] ?? '') === $id) {
                return [
                    'id'       => (string) $u['id'],
                    'username' => (string) ($u['username'] ?? ''),
                    'nama'     => (string) ($u['nama'] ?? ''),
                    'role'     => (string) ($u['role'] ?? 'petugas'),
                ];
            }
        }
        return null;
    }

    public static function staff_count(): int
    {
        return count(self::staff_all_raw());
    }

    public static function staff_exists_username(string $username, string $exceptId = ''): bool
    {
        $username = strtolower(trim($username));
        foreach (self::staff_all_raw() as $u) {
            if ((string) ($u['id'] ?? '') === $exceptId) {
                continue;
            }
            if (strtolower((string) ($u['username'] ?? '')) === $username) {
                return true;
            }
        }
        return false;
    }

    /** @return array{ok:bool,error?:string,id?:string} */
    public static function staff_create(string $username, string $nama, string $password, string $role = 'petugas'): array
    {
        $username = strtolower(trim($username));
        $nama     = trim($nama);

        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
            return ['ok' => false, 'error' => 'Nama pengguna 3–32 karakter, hanya huruf kecil/angka/titik/strip.'];
        }
        if ($nama === '') {
            return ['ok' => false, 'error' => 'Nama petugas wajib diisi.'];
        }
        if (strlen($password) < 8) {
            return ['ok' => false, 'error' => 'Kata sandi minimal 8 karakter.'];
        }
        if (self::staff_exists_username($username)) {
            return ['ok' => false, 'error' => 'Nama pengguna sudah dipakai.'];
        }
        if (!in_array($role, ['admin', 'petugas'], true)) {
            $role = 'petugas';
        }

        $list = self::staff_all_raw();
        $id = 'u' . bin2hex(random_bytes(6));
        $list[] = [
            'id'         => $id,
            'username'   => $username,
            'nama'       => $nama,
            'role'       => $role,
            'hash'       => password_hash($password, PASSWORD_DEFAULT),
            'created_at' => gmdate('c'),
            'last_login' => '',
        ];
        self::staff_write($list);

        return ['ok' => true, 'id' => $id];
    }

    /** @return array{ok:bool,error?:string} */
    public static function staff_update(string $id, array $fields): array
    {
        $list = self::staff_all_raw();
        $idx = null;
        foreach ($list as $i => $u) {
            if ((string) ($u['id'] ?? '') === $id) {
                $idx = $i;
                break;
            }
        }
        if ($idx === null) {
            return ['ok' => false, 'error' => 'Akun tidak ditemukan.'];
        }

        if (array_key_exists('username', $fields)) {
            $username = strtolower(trim((string) $fields['username']));
            if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
                return ['ok' => false, 'error' => 'Nama pengguna 3–32 karakter, hanya huruf kecil/angka/titik/strip.'];
            }
            if (self::staff_exists_username($username, $id)) {
                return ['ok' => false, 'error' => 'Nama pengguna sudah dipakai akun lain.'];
            }
            $list[$idx]['username'] = $username;
        }

        if (array_key_exists('nama', $fields)) {
            $nama = trim((string) $fields['nama']);
            if ($nama === '') {
                return ['ok' => false, 'error' => 'Nama petugas wajib diisi.'];
            }
            $list[$idx]['nama'] = $nama;
        }

        if (array_key_exists('role', $fields)) {
            $role = (string) $fields['role'];
            $list[$idx]['role'] = in_array($role, ['admin', 'petugas'], true) ? $role : 'petugas';
        }

        if (!empty($fields['password'])) {
            $pw = (string) $fields['password'];
            if (strlen($pw) < 8) {
                return ['ok' => false, 'error' => 'Kata sandi minimal 8 karakter.'];
            }
            $list[$idx]['hash'] = password_hash($pw, PASSWORD_DEFAULT);
        }

        self::staff_write($list);
        return ['ok' => true];
    }

    /** @return array{ok:bool,error?:string} */
    public static function staff_delete(string $id, string $currentId): array
    {
        if ($id === $currentId) {
            return ['ok' => false, 'error' => 'Tidak bisa menghapus akun yang sedang dipakai.'];
        }

        $list = self::staff_all_raw();
        $admins = 0;
        $target = null;
        foreach ($list as $u) {
            if ((string) ($u['role'] ?? '') === 'admin') {
                $admins++;
            }
            if ((string) ($u['id'] ?? '') === $id) {
                $target = $u;
            }
        }
        if ($target === null) {
            return ['ok' => false, 'error' => 'Akun tidak ditemukan.'];
        }
        if (($target['role'] ?? '') === 'admin' && $admins <= 1) {
            return ['ok' => false, 'error' => 'Minimal harus ada satu akun admin.'];
        }

        $list = array_values(array_filter(
            $list,
            static fn($u) => (string) ($u['id'] ?? '') !== $id
        ));
        self::staff_write($list);
        return ['ok' => true];
    }

    private static function touch_login(string $id): void
    {
        $list = self::staff_all_raw();
        foreach ($list as $i => $u) {
            if ((string) ($u['id'] ?? '') === $id) {
                $list[$i]['last_login'] = gmdate('c');
                self::staff_write($list);
                return;
            }
        }
    }
}
