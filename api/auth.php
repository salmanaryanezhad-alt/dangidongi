<?php
/**
 * ورود / ساخت خونه.
 * POST با JSON:
 *   ساخت خونه: { "action": "create", "house_name": "...", "member_name": "..." }
 *   ورود:      { "action": "join",   "invite_code": "...", "member_name": "..." }
 */

require_once __DIR__ . '/../includes/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('روش نامعتبر است.', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    json_error('ورودی معتبر نیست.');
}

$action = isset($input['action']) ? (string)$input['action'] : '';
$member_name = trim((string)($input['member_name'] ?? ''));
if ($member_name === '' || mb_strlen($member_name) > 50) {
    json_error('اسم خودتان را وارد کنید (حداکثر ۵۰ حرف).');
}

$pdo = db();

/** ساخت کد دعوت ۶ حرفی بدون تکرار. */
function generate_invite_code(PDO $pdo): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $code = '';
        for ($i = 0; $i < 6; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $stmt = $pdo->prepare('SELECT id FROM houses WHERE invite_code = ?');
        $stmt->execute([$code]);
    } while ($stmt->fetch() !== false);
    return $code;
}

/** ساخت عضو جدید؛ [member_id, token] برمی‌گرداند. */
function create_member(PDO $pdo, int $house_id, string $name): array
{
    $token = bin2hex(random_bytes(24));
    $pdo->prepare('INSERT INTO members (house_id, name, token) VALUES (?, ?, ?)')
        ->execute([$house_id, $name, $token]);
    return [(int)$pdo->lastInsertId(), $token];
}

/** خروجی مشترک موفقیت‌آمیز شامل اطلاعات نشست. */
function respond_with_session(PDO $pdo, int $house_id, int $member_id, string $member_name, string $token): void
{
    $stmt = $pdo->prepare('SELECT name, invite_code FROM houses WHERE id = ?');
    $stmt->execute([$house_id]);
    $house = $stmt->fetch();
    json_out([
        'ok'          => true,
        'token'       => $token,
        'member_id'   => $member_id,
        'member_name' => $member_name,
        'house_id'    => $house_id,
        'house_name'  => $house['name'],
        'invite_code' => $house['invite_code'],
    ]);
}

if ($action === 'create') {
    $house_name = trim((string)($input['house_name'] ?? ''));
    if ($house_name === '' || mb_strlen($house_name) > 50) {
        json_error('اسم خونه را وارد کنید (حداکثر ۵۰ حرف).');
    }
    $code = generate_invite_code($pdo);
    $pdo->prepare('INSERT INTO houses (name, invite_code) VALUES (?, ?)')
        ->execute([$house_name, $code]);
    $house_id = (int)$pdo->lastInsertId();
    [$member_id, $token] = create_member($pdo, $house_id, $member_name);
    respond_with_session($pdo, $house_id, $member_id, $member_name, $token);
}

if ($action === 'join') {
    $code = strtoupper(trim((string)($input['invite_code'] ?? '')));
    if (!preg_match('/^[A-Z0-9]{4,10}$/', $code)) {
        json_error('کد دعوت معتبر نیست.');
    }
    $stmt = $pdo->prepare('SELECT id FROM houses WHERE invite_code = ?');
    $stmt->execute([$code]);
    $house = $stmt->fetch();
    if (!$house) {
        json_error('خونه‌ای با این کد دعوت پیدا نشد.');
    }
    $house_id = (int)$house['id'];
    [$member_id, $token] = create_member($pdo, $house_id, $member_name);
    publish_event($pdo, $house_id, 'member_added', ['member_id' => $member_id, 'name' => $member_name]);
    respond_with_session($pdo, $house_id, $member_id, $member_name, $token);
}

json_error('عملیات نامعتبر است.');
