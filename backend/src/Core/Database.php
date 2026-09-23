<?php
declare(strict_types=1);

namespace AM2050\Core;

use PDO;
use Throwable;

final class Database
{
    private PDO $pdo;

    public function __construct()
    {
        $databaseUrl = trim((string) Env::get('DATABASE_URL', ''));
        if ($databaseUrl !== '') {
            $parsed = parse_url($databaseUrl);
            $host = $parsed['host'] ?? Env::get('DB_HOST');
            $port = isset($parsed['port']) ? (string)$parsed['port'] : Env::get('DB_PORT', '3306');
            $user = isset($parsed['user']) ? urldecode($parsed['user']) : Env::get('DB_USER');
            $pass = isset($parsed['pass']) ? urldecode($parsed['pass']) : Env::get('DB_PASS');
            $dbName = isset($parsed['path']) ? ltrim($parsed['path'], '/') : Env::get('DB_NAME');
        } else {
            $host = Env::get('DB_HOST');
            $port = Env::get('DB_PORT', '3306');
            $user = Env::get('DB_USER');
            $pass = Env::get('DB_PASS');
            $dbName = Env::get('DB_NAME');
        }

        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $dbName);
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_MULTI_STATEMENTS => true,
            PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'",
        ];
        if (is_file('/etc/ssl/certs/ca-certificates.crt')) {
            $options[PDO::MYSQL_ATTR_SSL_CA] = '/etc/ssl/certs/ca-certificates.crt';
        }
        $this->pdo = new PDO($dsn, $user, $pass, $options);
        $this->pdo->exec("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    }

    public function pdo(): PDO { return $this->pdo; }

    public function transaction(callable $callback): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $callback($this->pdo);
            $this->pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }
}
