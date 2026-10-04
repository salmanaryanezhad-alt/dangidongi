<?php
/**
 * اتصال دیتابیس (PDO) و توابع مشترک خروجی.
 * مقادیر اتصال را پیش از آپلود مطابق هاست خود تنظیم کنید.
 */

const DB_HOST = '127.0.0.1';
const DB_PORT = '3306';
const DB_NAME = 'dangidongi';
const DB_USER = 'root';
const DB_PASS = '';
const DB_CHARSET = 'utf8mb4';

/** اتصال PDO را برمی‌گرداند (بار اول می‌سازد). */
function db(bool $reconnect = false): PDO
{
    static $pdo = null;
    if ($pdo === null || $reconnect) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT
             . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

/** خروجی JSON با کد وضعیت دلخواه؛ اسکریپت را تمام می‌کند. */
function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** خروجی خطای JSON؛ اسکریپت را تمام می‌کند. */
function json_error(string $message, int $status = 400): void
{
    json_out(['ok' => false, 'error' => $message], $status);
}

/**
 * ثبت رویداد در جدول events؛ استریم SSE آن را به اعضای همان خونه می‌فرستد.
 */
function publish_event(PDO $pdo, int $house_id, string $type, array $payload = []): void
{
    $payload['type'] = $type;
    $stmt = $pdo->prepare('INSERT INTO events (house_id, type, payload) VALUES (?, ?, ?)');
    $stmt->execute([
        $house_id,
        $type,
        json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
}
