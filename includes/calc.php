<?php
/**
 * منطق محاسبات: تقسیم سهم هزینه‌ها، تراز اعضا و تسویه پیشنهادی.
 * همه‌ی مبلغ‌ها عدد صحیح (تومان) هستند.
 */

/**
 * تقسیم مبلغ بین اعضا بر اساس ضریب سهم.
 * سهم هر عضو = floor(مبلغ × ضریب ÷ مجموع ضریب‌ها)
 * باقی‌مانده به اولین عضو با ضریب مثبت اضافه می‌شود تا جمع دقیقاً برابر مبلغ شود.
 *
 * @param int   $amount  مبلغ کل (عدد صحیح مثبت، تومان)
 * @param array $weights [member_id => weight] — ترتیب آرایه حفظ می‌شود
 * @return array [member_id => share]
 */
function split_amount(int $amount, array $weights): array
{
    $total_weight = 0;
    foreach ($weights as $w) {
        $total_weight += (int)$w;
    }
    if ($total_weight <= 0) {
        throw new InvalidArgumentException('مجموع ضریب‌های سهم باید بیشتر از صفر باشد.');
    }

    $shares = [];
    foreach ($weights as $member_id => $w) {
        $shares[$member_id] = intdiv($amount * (int)$w, $total_weight);
    }

    $remainder = $amount - array_sum($shares);
    if ($remainder > 0) {
        foreach ($weights as $member_id => $w) {
            if ((int)$w > 0) {
                $shares[$member_id] += $remainder;
                break;
            }
        }
    }
    return $shares;
}

/**
 * تراز اعضا: مجموع پرداختی‌ها − مجموع سهم‌ها.
 *
 * @return array [member_id => balance] — اعضای بدون تراکنش هم با صفر برمی‌گردند
 */
function compute_balances(PDO $pdo, int $house_id): array
{
    $balances = [];
    $stmt = $pdo->prepare('SELECT id FROM members WHERE house_id = ?');
    $stmt->execute([$house_id]);
    foreach ($stmt->fetchAll() as $row) {
        $balances[(int)$row['id']] = 0;
    }

    $stmt = $pdo->prepare(
        'SELECT payer_member_id, SUM(amount) AS total
         FROM expenses WHERE house_id = ? GROUP BY payer_member_id'
    );
    $stmt->execute([$house_id]);
    foreach ($stmt->fetchAll() as $row) {
        $balances[(int)$row['payer_member_id']] += (int)$row['total'];
    }

    $stmt = $pdo->prepare(
        'SELECT s.member_id, SUM(s.share) AS total
         FROM expense_shares s
         JOIN expenses e ON e.id = s.expense_id
         WHERE e.house_id = ?
         GROUP BY s.member_id'
    );
    $stmt->execute([$house_id]);
    foreach ($stmt->fetchAll() as $row) {
        $balances[(int)$row['member_id']] -= (int)$row['total'];
    }

    return $balances;
}

/**
 * تسویه پیشنهادی: تا وقتی همه‌ی ترازها صفر نشدند،
 * بزرگ‌ترین بدهکار به بزرگ‌ترین طلبکار به اندازه‌ی min(|بدهی|، طلب) می‌دهد.
 *
 * @param array $balances [member_id => balance]
 * @return array لیست انتقال‌ها: [ ['from' => id, 'to' => id, 'amount' => n], ... ]
 */
function suggest_settlement(array $balances): array
{
    $creditors = [];
    $debtors = [];
    foreach ($balances as $member_id => $balance) {
        if ($balance > 0) {
            $creditors[$member_id] = $balance;
        } elseif ($balance < 0) {
            $debtors[$member_id] = -$balance;
        }
    }
    arsort($creditors);
    arsort($debtors);

    $transfers = [];
    while ($creditors !== [] && $debtors !== []) {
        $creditor_id = key($creditors); // بزرگ‌ترین طلبکار
        $debtor_id = key($debtors);     // بزرگ‌ترین بدهکار
        $amount = min($creditors[$creditor_id], $debtors[$debtor_id]);

        $transfers[] = ['from' => $debtor_id, 'to' => $creditor_id, 'amount' => $amount];

        $creditors[$creditor_id] -= $amount;
        $debtors[$debtor_id] -= $amount;
        if ($creditors[$creditor_id] === 0) {
            unset($creditors[$creditor_id]);
        }
        if ($debtors[$debtor_id] === 0) {
            unset($debtors[$debtor_id]);
        }
        arsort($creditors);
        arsort($debtors);
    }
    return $transfers;
}
