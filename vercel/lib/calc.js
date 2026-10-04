/* منطق مشترک اپ — هم سمت کلاینت (پیش‌نمایش زنده) هم سمت سرور (اعتبارسنجی) */

export function toEnglishDigits(s) {
    return String(s)
        .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
        .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}

export function parseAmount(raw) {
    const s = toEnglishDigits(raw).replace(/[^0-9]/g, '');
    if (s === '' || s.length > 15) return null;
    const n = parseInt(s, 10);
    return isFinite(n) && n > 0 ? n : null;
}

export function fmtNum(n) {
    return Number(n).toLocaleString('fa-IR');
}

export function fmtToman(n) {
    return fmtNum(n) + ' تومان';
}

export function fmtSigned(n) {
    return (n > 0 ? '+' : '') + fmtNum(n);
}

export function fmtWhen(iso) {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const date = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
        const time = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(d);
        return date + '، ساعت ' + time;
    } catch (e) {
        return '';
    }
}

/** تقسیم مبلغ: کف برای همه، باقی‌مانده به اولین عضو با ضریب مثبت. */
export function splitAmount(amount, orderedWeights) {
    let total = 0;
    for (const w of orderedWeights) total += w.weight;
    if (total <= 0) return null;
    let remainder = amount;
    const shares = orderedWeights.map((w) => {
        const s = Math.floor((amount * w.weight) / total);
        remainder -= s;
        return { id: w.id, weight: w.weight, share: s };
    });
    for (const s of shares) {
        if (s.weight > 0) {
            s.share += remainder;
            break;
        }
    }
    return shares;
}

/** تراز اعضا: پرداختی − سهم. */
export function computeBalances(members, expenses) {
    const paid = {};
    const share = {};
    members.forEach((m) => {
        paid[m.id] = 0;
        share[m.id] = 0;
    });
    expenses.forEach((e) => {
        paid[e.payer_id] = (paid[e.payer_id] || 0) + e.amount;
        Object.keys(e.shares || {}).forEach((k) => {
            share[Number(k)] = (share[Number(k)] || 0) + e.shares[k];
        });
    });
    return members.map((m) => ({
        id: m.id,
        name: m.name,
        paid: paid[m.id] || 0,
        share: share[m.id] || 0,
        balance: (paid[m.id] || 0) - (share[m.id] || 0),
    }));
}

/** بزرگ‌ترین بدهکار به بزرگ‌ترین طلبکار، به اندازه‌ی کمینه‌ی این دو. */
export function suggestSettlement(balances) {
    const creditors = [];
    const debtors = [];
    balances.forEach((b) => {
        if (b.balance > 0) creditors.push({ id: b.id, val: b.balance });
        else if (b.balance < 0) debtors.push({ id: b.id, val: -b.balance });
    });
    const transfers = [];
    while (creditors.length && debtors.length) {
        creditors.sort((a, b) => b.val - a.val);
        debtors.sort((a, b) => b.val - a.val);
        const c = creditors[0];
        const d = debtors[0];
        const amt = Math.min(c.val, d.val);
        transfers.push({ from: d.id, to: c.id, amount: amt });
        c.val -= amt;
        d.val -= amt;
        if (c.val === 0) creditors.shift();
        if (d.val === 0) debtors.shift();
    }
    return transfers;
}
