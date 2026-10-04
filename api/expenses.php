<?php
/**
 * لیست و ثبت هزینه‌ها.
 * GET  → لیست هزینه‌های خونه همراه با سهم هر عضو
 * POST → ثبت هزینه: { "title", "amount", "payer_member_id", "weights": {"id": ضریب} }
 */

require_once __DIR__ . '/../includes/auth_check.php';
require_once __DIR__ . '/../includes/calc.php';

$auth = require_auth();
$pdo = db();

/* ------------------------------ لیست هزینه‌ها ------------------------------ */

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT e.id, e.title, e.amount, e.payer_member_id, e.created_at,
                m.name AS payer_name
         FROM expenses e
         JOIN members m ON m.id = e.payer_member_id
         WHERE e.house_id = ?
         ORDER BY e.id DESC'
    );
    $stmt->execute([$auth['house_id']]);
    $expenses = $stmt->fetchAll();

    $shares_by_expense = [];
    if ($expenses !== []) {
        $stmt = $pdo->prepare(
            'SELECT s.expense_id, s.member_id, m.name AS member_name, s.weight, s.share
             FROM expense_shares s
             JOIN members m ON m.id = s.member_id
             JOIN expenses e ON e.id = s.expense_id
             WHERE e.house_id = ?
             ORDER BY m.id'
        );
        $stmt->execute([$auth['house_id']]);
        foreach ($stmt->fetchAll() as $row) {
            $shares_by_expense[(int)$row['expense_id']][] = [
                'member_id'   => (int)$row['member_id'],
                'member_name' => $row['member_name'],
                'weight'      => (int)$row['weight'],
                'share'       => (int)$row['share'],
            ];
        }
    }

    $list = [];
    foreach ($expenses as $e) {
        $id = (int)$e['id'];
        $list[] = [
            'id'              => $id,
            'title'           => $e['title'],
            'amount'          => (int)$e['amount'],
            'payer_member_id' => (int)$e['payer_member_id'],
            'payer_name'      => $e['payer_name'],
            'created_at'      => $e['created_at'],
            'shares'          => isset($shares_by_expense[$id]) ? $shares_by_expense[$id] : [],
        ];
    }
    json_out(['ok' => true, 'expenses' => $list]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('روش نامعتبر است.', 405);
}

/* ------------------------------ ثبت هزینه ------------------------------ */

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    json_error('ورودی معتبر نیست.');
}

$title = trim((string)($input['title'] ?? ''));
if ($title === '' || mb_strlen($title) > 100) {
    json_error('نام کالا را وارد کنید (حداکثر ۱۰۰ حرف).');
}

$amount_raw = $input['amount'] ?? null;
if (!is_numeric($amount_raw) || (string)(int)$amount_raw !== (string)$amount_raw || (int)$amount_raw <= 0) {
    json_error('مبلغ باید عدد صحیح مثبت (تومان) باشد.');
}
$amount = (int)$amount_raw;

$payer_id = (int)($input['payer_member_id'] ?? 0);
$stmt = $pdo->prepare('SELECT id FROM members WHERE id = ? AND house_id = ?');
$stmt->execute([$payer_id, $auth['house_id']]);
if ($stmt->fetch() === false) {
    json_error('پرداخت‌کننده معتبر نیست.');
}

$weights_input = $input['weights'] ?? null;
if (!is_array($weights_input) || $weights_input === []) {
    json_error('ضریب سهم اعضا مشخص نشده است.');
}

// اعضای خونه به ترتیب id — باقی‌مانده‌ی تقسیم به «نفر اول» این ترتیب می‌رسد.
$member_ids = [];
$stmt = $pdo->prepare('SELECT id FROM members WHERE house_id = ? ORDER BY id');
$stmt->execute([$auth['house_id']]);
foreach ($stmt->fetchAll() as $row) {
    $member_ids[(int)$row['id']] = true;
}

$weights = [];
foreach ($member_ids as $id => $unused) {
    if (array_key_exists((string)$id, $weights_input)) {
        $w = $weights_input[(string)$id];
        if (!is_numeric($w) || (int)$w < 0 || (int)$w != $w) {
            json_error('ضریب سهم باید عدد صحیح و صفر یا بیشتر باشد.');
        }
        $weights[$id] = (int)$w;
    }
}
foreach ($weights_input as $key => $w) {
    if (!isset($member_ids[(int)$key])) {
        json_error('یکی از اعضا معتبر نیست.');
    }
}
if (array_sum($weights) <= 0) {
    json_error('مجموع ضریب‌های سهم باید بیشتر از صفر باشد.');
}

try {
    $shares = split_amount($amount, $weights);

    $pdo->beginTransaction();

    $pdo->prepare(
        'INSERT INTO expenses (house_id, payer_member_id, title, amount) VALUES (?, ?, ?, ?)'
    )->execute([$auth['house_id'], $payer_id, $title, $amount]);
    $expense_id = (int)$pdo->lastInsertId();

    $stmt = $pdo->prepare(
        'INSERT INTO expense_shares (expense_id, member_id, weight, share) VALUES (?, ?, ?, ?)'
    );
    foreach ($weights as $member_id => $weight) {
        $stmt->execute([$expense_id, $member_id, $weight, $shares[$member_id]]);
    }

    publish_event($pdo, $auth['house_id'], 'expense_added', [
        'expense_id' => $expense_id,
        'title'      => $title,
        'amount'     => $amount,
    ]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $e;
}

json_out(['ok' => true, 'expense_id' => $expense_id]);
