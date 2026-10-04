/* ثبت هزینه — POST با توکن */

import { json, err, getSession, tokenOf, kvErrorMessage } from '../../lib/http';
import { kvGet, kvSet } from '../../lib/kv';
import { splitAmount } from '../../lib/calc';

export default async function handler(req, res) {
    if (req.method !== 'POST') return err(res, 405, 'روش نامعتبر است.');

    try {
        const session = await getSession(tokenOf(req));
        if (!session) return err(res, 401, 'توکن معتبر نیست.');

        const input = req.body || {};
        const raw = await kvGet('h:' + session.code);
        if (!raw) return err(res, 404, 'خونه پیدا نشد.');
        const state = JSON.parse(raw);

        const title = String(input.title || '').trim();
        if (!title || title.length > 100) return err(res, 400, 'نام کالا را وارد کنید (حداکثر ۱۰۰ حرف).');

        const amount = input.amount;
        if (!Number.isInteger(amount) || amount <= 0) {
            return err(res, 400, 'مبلغ باید عدد صحیح مثبت (تومان) باشد.');
        }

        const payerId = Number(input.payer_member_id);
        if (!state.members.some((m) => m.id === payerId)) {
            return err(res, 400, 'پرداخت‌کننده معتبر نیست.');
        }

        const weightsIn = input.weights;
        if (!weightsIn || typeof weightsIn !== 'object') {
            return err(res, 400, 'ضریب سهم اعضا مشخص نشده است.');
        }

        const weights = {};
        for (const m of state.members) {
            const w = weightsIn[String(m.id)];
            if (w !== undefined) {
                if (!Number.isInteger(w) || w < 0) {
                    return err(res, 400, 'ضریب سهم باید عدد صحیح و صفر یا بیشتر باشد.');
                }
                weights[m.id] = w;
            }
        }
        for (const k of Object.keys(weightsIn)) {
            if (!state.members.some((m) => m.id === Number(k))) {
                return err(res, 400, 'یکی از اعضا معتبر نیست.');
            }
        }

        const ordered = state.members.map((m) => ({ id: m.id, weight: weights[m.id] || 0 }));
        const shares = splitAmount(amount, ordered);
        if (!shares) return err(res, 400, 'مجموع ضریب‌های سهم باید بیشتر از صفر باشد.');

        const weightMap = {};
        const shareMap = {};
        for (const s of shares) {
            weightMap[s.id] = s.weight;
            shareMap[s.id] = s.share;
        }

        state.seq.expense += 1;
        state.expenses.push({
            id: state.seq.expense,
            title: title,
            amount: amount,
            payer_id: payerId,
            created_at: new Date().toISOString(),
            weights: weightMap,
            shares: shareMap,
        });
        state.rev += 1;
        await kvSet('h:' + session.code, JSON.stringify(state));

        return json(res, 200, { ok: true, expense_id: state.seq.expense, rev: state.rev });
    } catch (e) {
        return err(res, 500, kvErrorMessage(e));
    }
}
