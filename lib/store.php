<?php
/**
 * lib/store.php — lapisan penyimpanan data Dashboard Surveilans Malaria.
 *
 * Memilih backend otomatis:
 *   1. SQLite (PDO + pdo_sqlite)  → dipakai bila tersedia  [utama]
 *   2. File JSON dengan flock()   → fallback bila ekstensi SQLite tidak ada
 *
 * Kedua backend memakai API yang sama (begin/commit/all/find/put/delete/settings),
 * sehingga api.php tidak perlu tahu backend mana yang aktif.
 *
 * Catatan SQLite (jangan diubah tanpa alasan kuat):
 *   WAL + busy_timeout + BEGIN IMMEDIATE → aman untuk banyak request bersamaan.
 *   Statement bootstrap dibungkus SATU transaksi (menghindari fsync per statement).
 */

declare(strict_types=1);

final class Store
{
    public const RESOURCES = ['migran', 'sediaan', 'obat', 'jentik'];

    /** Baris pertama berkas cadangan JSON: menjadikannya berkas PHP yang tidak bisa diunduh. */
    private const JSON_GUARD = "<?php http_response_code(404); exit; ?>\n";

    private string $driver;
    private ?PDO $pdo = null;
    private string $jsonFile;
    /** @var resource|null */
    private $fh = null;
    private array $state = ['records' => [], 'settings' => []];
    private bool $autoTx = false;

    private function __construct()
    {
        $root = dirname(__DIR__);

        if (class_exists('PDO') && in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            $this->driver = 'sqlite';
            try {
                $pdo = new PDO('sqlite:' . $root . '/data.sqlite');
                $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                $pdo->exec('PRAGMA busy_timeout = 5000');
                $pdo->exec('PRAGMA journal_mode = WAL');
                $pdo->exec('PRAGMA synchronous = NORMAL');
                $this->pdo = $pdo;
                $this->ensureSchema();
                return;
            } catch (Throwable $e) {
                /* gagal buka SQLite (mis. folder read-only) → pakai JSON */
                $this->pdo = null;
            }
        }

        $this->driver = 'json';
        /*
         * Berkas cadangan JSON disimpan dengan nama berakhiran .php + baris penjaga,
         * supaya bila diakses langsung lewat browser hanya menjalankan PHP (404) dan
         * isinya TIDAK pernah terkirim sebagai berkas statis.
         */
        $dir = $root . '/var';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        $this->jsonFile = $dir . '/store.php';
        if (!file_exists($this->jsonFile)) {
            $this->writeJson(['records' => [], 'settings' => []]);
        }
    }

    public static function open(): self
    {
        return new self();
    }

    public function driver(): string
    {
        return $this->driver;
    }

    /* ---------------- transaksi ---------------- */

    public function begin(): void
    {
        if ($this->driver === 'sqlite') {
            $this->pdo->exec('BEGIN IMMEDIATE');
            return;
        }
        $this->fh = fopen($this->jsonFile, 'c+');
        if ($this->fh === false) {
            throw new RuntimeException('Tidak bisa membuka penyimpanan data.');
        }
        flock($this->fh, LOCK_EX);
        $this->state = $this->readJsonHandle();
    }

    public function commit(): void
    {
        if ($this->driver === 'sqlite') {
            $this->pdo->exec('COMMIT');
            return;
        }
        $this->writeJsonHandle($this->state);
        $this->releaseJson();
    }

    public function rollback(): void
    {
        if ($this->driver === 'sqlite') {
            $this->pdo->exec('ROLLBACK');
            return;
        }
        $this->releaseJson();
    }

    private function releaseJson(): void
    {
        if ($this->fh) {
            flock($this->fh, LOCK_UN);
            fclose($this->fh);
            $this->fh = null;
        }
    }

    /* ---------------- skema SQLite ---------------- */

    private function ensureSchema(): void
    {
        $pdo = $this->pdo;
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS records (
                    id         TEXT PRIMARY KEY,
                    res        TEXT NOT NULL,
                    tanggal    TEXT NOT NULL DEFAULT '',
                    data       TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )"
            );
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_records_res_tanggal ON records (res, tanggal)');
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
            );
            $stmt = $pdo->prepare('INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)');
            foreach (self::defaultSettings() as $k => $v) {
                $stmt->execute([$k, $v]);
            }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
    }

    public static function defaultSettings(): array
    {
        return [
            'ttd_nama_kepala'     => 'dr I Wayan Widia M.Kes',
            'ttd_jabatan_kepala'  => 'Kepala Puskesmas Nusa Penida I',
            'ttd_nip_kepala'      => '',
            'ttd_nama_petugas'    => 'I Made Surveilans A.Md.Kep',
            'ttd_jabatan_petugas' => 'Petugas Surveilans Malaria',
            'ttd_nip_petugas'     => '',
            'ttd_tempat'          => 'Sampalan',
            'ttd_tanggal'         => '',
        ];
    }

    /* ---------------- baca / tulis record ---------------- */

    public function all(string $res): array
    {
        if ($this->driver === 'sqlite') {
            $stmt = $this->pdo->prepare('SELECT id, data FROM records WHERE res = ? ORDER BY tanggal ASC, created_at ASC');
            $stmt->execute([$res]);
            $out = [];
            foreach ($stmt->fetchAll() as $row) {
                $data = json_decode((string) $row['data'], true);
                $data = is_array($data) ? $data : [];
                $data['id'] = $row['id'];
                $out[] = $data;
            }
            return $out;
        }

        $state = $this->states();
        $out = [];
        foreach ($state['records'] as $row) {
            if (($row['res'] ?? '') !== $res) {
                continue;
            }
            $data = is_array($row['data'] ?? null) ? $row['data'] : [];
            $data['id'] = $row['id'];
            $out[] = $data;
        }
        usort($out, static fn($a, $b) => [(string) ($a['tanggal'] ?? ''), (string) ($a['__created'] ?? '')]
            <=> [(string) ($b['tanggal'] ?? ''), (string) ($b['__created'] ?? '')]);
        return $out;
    }

    public function find(string $id): ?array
    {
        if ($this->driver === 'sqlite') {
            $stmt = $this->pdo->prepare('SELECT id, data FROM records WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                return null;
            }
            $data = json_decode((string) $row['data'], true);
            $data = is_array($data) ? $data : [];
            $data['id'] = $row['id'];
            return $data;
        }

        $state = $this->states();
        foreach ($state['records'] as $row) {
            if (($row['id'] ?? '') === $id) {
                $data = is_array($row['data'] ?? null) ? $row['data'] : [];
                $data['id'] = $id;
                return $data;
            }
        }
        return null;
    }

    public function put(string $res, array $data, ?string $id = null): string
    {
        $now = gmdate('c');

        if ($id === null || $id === '') {
            $id = 'r' . bin2hex(random_bytes(8));
            $createdAt = $now;
        } else {
            $existing = $this->find($id);
            $createdAt = $existing['__created'] ?? $now;
        }

        $data['id'] = $id;
        $tanggal = isset($data['tanggal']) ? (string) $data['tanggal'] : '';
        $data['__created'] = $createdAt;

        if ($this->driver === 'sqlite') {
            $stmt = $this->pdo->prepare(
                'INSERT INTO records (id, res, tanggal, data, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET res = excluded.res, tanggal = excluded.tanggal,
                                               data = excluded.data, updated_at = excluded.updated_at'
            );
            $payload = $data;
            unset($payload['__created']);
            $stmt->execute([$id, $res, $tanggal, json_encode($payload, JSON_UNESCAPED_UNICODE), $createdAt, $now]);
            return $id;
        }

        $this->ensureJsonTx();
        $replaced = false;
        foreach ($this->state['records'] as $i => $row) {
            if (($row['id'] ?? '') === $id) {
                $this->state['records'][$i] = [
                    'id' => $id, 'res' => $res, 'tanggal' => $tanggal,
                    'data' => $data, 'created_at' => $createdAt, 'updated_at' => $now,
                ];
                $replaced = true;
                break;
            }
        }
        if (!$replaced) {
            $this->state['records'][] = [
                'id' => $id, 'res' => $res, 'tanggal' => $tanggal,
                'data' => $data, 'created_at' => $createdAt, 'updated_at' => $now,
            ];
        }
        $this->flushAutoTx();
        return $id;
    }

    public function delete(string $id): void
    {
        if ($this->driver === 'sqlite') {
            $stmt = $this->pdo->prepare('DELETE FROM records WHERE id = ?');
            $stmt->execute([$id]);
            return;
        }

        $this->ensureJsonTx();
        $state = $this->state;
        $state['records'] = array_values(array_filter(
            $state['records'],
            static fn($row) => ($row['id'] ?? '') !== $id
        ));
        $this->state = $state;
        $this->flushAutoTx();
    }

    /* ---------------- pengaturan (TTD) ---------------- */

    public function settings(): array
    {
        $out = self::defaultSettings();
        if ($this->driver === 'sqlite') {
            $stmt = $this->pdo->query('SELECT k, v FROM settings');
            foreach ($stmt->fetchAll() as $row) {
                $out[$row['k']] = (string) $row['v'];
            }
            return $out;
        }
        $state = $this->states();
        foreach ($state['settings'] as $k => $v) {
            $out[$k] = (string) $v;
        }
        return $out;
    }

    public function settingSet(string $k, string $v): void
    {
        if ($this->driver === 'sqlite') {
            $stmt = $this->pdo->prepare(
                'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
            );
            $stmt->execute([$k, $v]);
            return;
        }

        /* backend JSON: pastikan transaksi aktif, kalau tidak perubahan hanya di memori */
        $this->ensureJsonTx();
        $this->state['settings'][$k] = $v;
        $this->flushAutoTx();
    }

    /** Pastikan transaksi JSON aktif (dipakai bila pemanggil tidak membungkus begin/commit sendiri). */
    private function ensureJsonTx(): void
    {
        if ($this->fh !== null) {
            return;
        }
        $this->begin();
        $this->autoTx = true;
    }

    private function flushAutoTx(): void
    {
        if ($this->autoTx && $this->fh !== null) {
            $this->autoTx = false;
            $this->commit();
        }
    }

    /* ---------------- util JSON ---------------- */

    /** State yang sedang aktif: in-memory bila transaksi JSON berjalan, otherwise baca dari disk. */
    private function states(): array
    {
        if ($this->driver === 'sqlite') {
            return ['records' => [], 'settings' => []];
        }
        if ($this->fh !== null) {
            return $this->state;
        }
        return $this->readJsonFile();
    }

    /** Buang baris penjaga PHP di awal berkas JSON. */
    private static function stripGuard(string $raw): string
    {
        if (strncmp($raw, '<?php', 5) === 0) {
            $pos = strpos($raw, "\n");
            return $pos === false ? '' : substr($raw, $pos + 1);
        }
        return $raw;
    }

    private function readJsonFile(): array
    {
        $raw = @file_get_contents($this->jsonFile);
        $raw = $raw ? self::stripGuard($raw) : '';
        $data = $raw !== '' ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            return ['records' => [], 'settings' => []];
        }
        $data['records'] = is_array($data['records'] ?? null) ? $data['records'] : [];
        $data['settings'] = is_array($data['settings'] ?? null) ? $data['settings'] : [];
        return $data;
    }

    private function readJsonHandle(): array
    {
        rewind($this->fh);
        $raw = (string) stream_get_contents($this->fh);
        $raw = self::stripGuard($raw);
        $data = $raw !== '' ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            $data = ['records' => [], 'settings' => []];
        }
        $data['records'] = is_array($data['records'] ?? null) ? $data['records'] : [];
        $data['settings'] = is_array($data['settings'] ?? null) ? $data['settings'] : [];
        foreach (self::defaultSettings() as $k => $v) {
            if (!array_key_exists($k, $data['settings'])) {
                $data['settings'][$k] = $v;
            }
        }
        return $data;
    }

    private function writeJsonHandle(array $state): void
    {
        $json = self::JSON_GUARD . json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        rewind($this->fh);
        ftruncate($this->fh, 0);
        fwrite($this->fh, $json);
        fflush($this->fh);
    }

    private function writeJson(array $state): void
    {
        $fh = fopen($this->jsonFile, 'c+');
        if ($fh === false) {
            throw new RuntimeException('Tidak bisa membuat penyimpanan data.');
        }
        flock($fh, LOCK_EX);
        $json = self::JSON_GUARD . json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, $json);
        fflush($fh);
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}
