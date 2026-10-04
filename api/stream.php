<?php
/**
 * استریم Server-Sent Events.
 * کلاینت با EventSource وصل می‌شود:
 *   api/stream.php?token=TOKEN&last_event_id=N
 * رویدادهای جدید (جدول events) را می‌گیرد و هنگام قطع اتصال، مرورگر با
 * هدر Last-Event-ID دوباره وصل می‌شود تا رویدادی از دست نرود.
 *
 * برای سازگاری با هاست اشتراکی، هر اتصال پس از مدتی کوتاه به‌صورت خودکار
 * بسته می‌شود و EventSource خودش دوباره وصل می‌شود.
 */

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth_check.php';

$auth = require_auth();

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-transform');
header('X-Accel-Buffering: no');
if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', '1');
}
@set_time_limit(0);
ignore_user_abort(false);

$last_id = 0;
$has_cursor = false;
if (isset($_SERVER['HTTP_LAST_EVENT_ID']) && is_numeric($_SERVER['HTTP_LAST_EVENT_ID'])) {
    // اتصال مجدد مرورگر؛ رویدادهای پس از این شناسه باید ارسال شوند.
    $last_id = (int)$_SERVER['HTTP_LAST_EVENT_ID'];
    $has_cursor = true;
} elseif (isset($_GET['last_event_id']) && is_numeric($_GET['last_event_id'])) {
    $last_id = (int)$_GET['last_event_id'];
    $has_cursor = true;
}

$pdo = db();
if (!$has_cursor) {
    // اتصال تازه: تاریخچه قبلاً از طریق API گرفته شده؛ فقط رویدادهای جدید از این لحظه.
    $stmt = $pdo->prepare('SELECT MAX(id) FROM events WHERE house_id = ?');
    $stmt->execute([$auth['house_id']]);
    $last_id = (int)$stmt->fetchColumn();
}

/** بافرهای خروجی را خالی می‌کند تا داده بلافاصله به کلاینت برسد. */
function stream_flush(): void
{
    while (ob_get_level() > 0) {
        if (!@ob_end_flush()) {
            break;
        }
    }
    @flush();
}

// اگر از آخرین اتصال تا الآن رویدادی ثبت شده، همین ابتدا ارسال می‌شود.
$deadline = time() + 50;   // طول عمر هر اتصال (ثانیه)
$last_heartbeat = time();

echo "retry: 3000\n\n";
stream_flush();

while (time() < $deadline && !connection_aborted()) {
    try {
        $stmt = $pdo->prepare(
            'SELECT id, payload FROM events
             WHERE house_id = ? AND id > ?
             ORDER BY id ASC LIMIT 50'
        );
        $stmt->execute([$auth['house_id'], $last_id]);
        $rows = $stmt->fetchAll();
    } catch (PDOException $e) {
        // ممکن است اتصال دیتابیس قطع شده باشد؛ یک‌بار تلاش برای اتصال دوباره.
        try {
            $pdo = db(true);
        } catch (PDOException $e2) {
            break;
        }
        continue;
    }

    foreach ($rows as $row) {
        echo 'id: ' . $row['id'] . "\n";
        echo 'data: ' . $row['payload'] . "\n\n";
        $last_id = (int)$row['id'];
    }

    // ضربان قلب هر ۱۵ ثانیه تا اتصال توسط درگاه‌های میانی بسته نشود.
    if (time() - $last_heartbeat >= 15) {
        echo ": heartbeat\n\n";
        $last_heartbeat = time();
    }

    stream_flush();
    sleep(2);
}
