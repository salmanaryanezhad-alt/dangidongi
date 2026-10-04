<?php
/**
 * چک توکن عضو.
 * توکن از هدردرخواست (X-Token) یا پارامتر کوئری (?token=) — برای SSE — خوانده می‌شود.
 * در صورت موفقیت، مشخصات عضو و خونه برمی‌گردد؛ وگرنه با 401 خارج می‌شود.
 */

require_once __DIR__ . '/db.php';

function require_auth(): array
{
    $token = '';
    if (isset($_SERVER['HTTP_X_TOKEN']) && is_string($_SERVER['HTTP_X_TOKEN'])) {
        $token = trim($_SERVER['HTTP_X_TOKEN']);
    }
    if ($token === '' && isset($_GET['token']) && is_string($_GET['token'])) {
        $token = trim($_GET['token']);
    }
    if ($token === '') {
        json_error('توکن عضویت ارسال نشده است.', 401);
    }

    $stmt = db()->prepare(
        'SELECT m.id AS member_id, m.name AS member_name, m.house_id,
                h.name AS house_name, h.invite_code
         FROM members m
         JOIN houses h ON h.id = m.house_id
         WHERE m.token = ?
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('توکن معتبر نیست.', 401);
    }

    return [
        'member_id'   => (int)$row['member_id'],
        'member_name' => $row['member_name'],
        'house_id'    => (int)$row['house_id'],
        'house_name'  => $row['house_name'],
        'invite_code' => $row['invite_code'],
    ];
}
