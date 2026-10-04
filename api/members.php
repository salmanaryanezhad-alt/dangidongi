<?php
/**
 * لیست اعضای خونه.
 * GET با توکن عضو.
 */

require_once __DIR__ . '/../includes/auth_check.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('روش نامعتبر است.', 405);
}

$auth = require_auth();

$stmt = db()->prepare(
    'SELECT id, name, created_at FROM members WHERE house_id = ? ORDER BY id'
);
$stmt->execute([$auth['house_id']]);

$members = [];
foreach ($stmt->fetchAll() as $row) {
    $members[] = [
        'id'         => (int)$row['id'],
        'name'       => $row['name'],
        'created_at' => $row['created_at'],
    ];
}

json_out(['ok' => true, 'members' => $members]);
