/* وضعیت کامل خونه برای رندر و همگام‌سازی — GET با توکن */

import { json, err, getSession, tokenOf, kvErrorMessage } from '../../lib/http';
import { kvGet } from '../../lib/kv';

export default async function handler(req, res) {
    if (req.method !== 'GET') return err(res, 405, 'روش نامعتبر است.');

    try {
        const session = await getSession(tokenOf(req));
        if (!session) return err(res, 401, 'توکن معتبر نیست.');

        const raw = await kvGet('h:' + session.code);
        if (!raw) return err(res, 404, 'خونه پیدا نشد.');
        const state = JSON.parse(raw);

        return json(res, 200, {
            ok: true,
            rev: state.rev,
            house: state.house,
            members: state.members,
            expenses: state.expenses,
        });
    } catch (e) {
        return err(res, 500, kvErrorMessage(e));
    }
}
