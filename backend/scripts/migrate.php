<?php
declare(strict_types=1);

use AM2050\Core\Database;
use AM2050\Core\Env;

require dirname(__DIR__) . '/vendor/autoload.php';

$root = dirname(__DIR__);
Env::loadForMigration($root);
$pdo = (new Database())->pdo();
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
$applied = array_column($pdo->query('SELECT version FROM schema_migrations')->fetchAll(), 'version');
$files = glob($root . '/migrations/*.sql') ?: [];
sort($files, SORT_STRING);
function isAlreadyAppliedError(Throwable $e): bool
{
    if ($e instanceof PDOException && isset($e->errorInfo[1])) {
        $code = (int) $e->errorInfo[1];
        if (in_array($code, [1025, 1050, 1060, 1061, 1068, 1091, 1826], true)) {
            return true;
        }
    }
    $msg = strtolower($e->getMessage());
    return str_contains($msg, 'duplicate column') ||
           str_contains($msg, 'already exists') ||
           str_contains($msg, 'duplicate key') ||
           str_contains($msg, "can't drop") ||
           str_contains($msg, 'check that column/key exists');
}

function splitSqlStatements(string $sql): array
{
    $sql = preg_replace('/^\xEF\xBB\xBF/', '', $sql);
    $lines = explode("\n", $sql);
    $cleanLines = [];
    foreach ($lines as $line) {
        $t = trim($line);
        if (str_starts_with($t, '--') || str_starts_with($t, '#')) {
            continue;
        }
        $cleanLines[] = $line;
    }
    $clean = implode("\n", $cleanLines);
    $parts = preg_split('/;\s*(?:\r?\n|$)/', $clean);
    $statements = [];
    foreach ($parts as $p) {
        $trimmed = trim($p);
        if ($trimmed !== '') {
            $statements[] = $trimmed;
        }
    }
    return $statements;
}

foreach ($files as $file) {
    $version = basename($file);
    if (in_array($version, $applied, true)) {
        continue;
    }
    $sql = trim((string) file_get_contents($file));
    $sql = preg_replace('/^\xEF\xBB\xBF/', '', $sql);
    if ($sql === '') {
        continue;
    }
    $statements = splitSqlStatements($sql);
    try {
        foreach ($statements as $stmt) {
            try {
                $pdo->exec($stmt);
            } catch (Throwable $stmtError) {
                if (isAlreadyAppliedError($stmtError)) {
                    fwrite(STDOUT, "Notice: statement in {$version} already applied, continuing...\n");
                    continue;
                }
                throw $stmtError;
            }
        }
        $statement = $pdo->prepare('INSERT INTO schema_migrations (version) VALUES (:version) ON DUPLICATE KEY UPDATE applied_at=CURRENT_TIMESTAMP');
        $statement->execute(['version' => $version]);
        fwrite(STDOUT, "Applied {$version}\n");
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        fwrite(STDERR, "Migration failed at {$version}: {$error->getMessage()}\n");
        exit(1);
    }
}
fwrite(STDOUT, "Migrations are current.\n");
