<?php
/**
 * تراز اعضا + تسویه پیشنهادی.
 * تراز هر عضو = مجموع پرداختی‌ها − مجموع سهمش (جمع تراز کل همیشه صفر است).
 */

require_once __DIR__ . '/../includes/auth_check.php';
require_once __DIR__ . '/../includes/calc.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('روش نامعتبر است.', 405);
}

$auth = require_auth();
$pdo = db();

$stmt = $pdo->prepare('SELECT id, name FROM members WHERE house_id = ? ORDER BY id');
$stmt->execute([$auth['house_id']]);
$members = [];
foreach ($stmt->fetchAll() as $row) {
    $members[(int)$row['id']] = $row['name'];
}

$paid = array_fill_keys(array_keys($members), 0);
$stmt = $pdo->prepare(
    'SELECT payer_member_id, SUM(amount) AS total
     FROM expenses WHERE house_id = ? GROUP BY payer_member_id'
);
$stmt->execute([$auth['house_id']]);
foreach ($stmt->fetchAll() as $row) {
    $paid[(int)$row['payer_member_id']] = (int)$row['total'];
}

$share_total = array_fill_keys(array_keys($members), 0);
$stmt = $pdo->prepare(
    'SELECT s.member_id, SUM(s.share) AS total
     FROM expense_shares s
     JOIN expenses e ON e.id = s.expense_id
     WHERE e.house_id = ?
     GROUP BY s.member_id'
);
$stmt->execute([$auth['house_id']]);
foreach ($stmt->fetchAll() as $row) {
    $share_total[(int)$row['member_id']] = (int)$row['total'];
}

$balances = [];
$list = [];
foreach ($members as $id => $name) {
    $balance = $paid[$id] - $share_total[$id];
    $balances[$id] = $balance;
    $list[] = [
        'member_id' => $id,
        'name'      => $name,
        'paid'      => $paid[$id],
        'share'     => $share_total[$id],
        'balance'   => $balance,
    ];
}

$settlement = [];
foreach (suggest_settlement($balances) as $t) {
    $settlement[] = [
        'from'      => $t['from'],
        'from_name' => $members[$t['from']],
        'to'        => $t['to'],
        'to_name'   => $members[$t['to']],
        'amount'    => $t['amount'],
    ];
}

json_out(['ok' => true, 'balances' => $list, 'settlement' => $settlement]);
