/* ساخت خونه / ورود با کد دعوت — POST */

import { json, err, readBody, genCode, genToken, kvErrorMessage } from './_lib.js';
import { kvGet, kvSet } from './_kv.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return err(res, 405, 'روش نامعتبر است.');

    let input;
    try { input = await readBody(req); }
    catch (e) { return err(res, 400, 'ورودی معتبر نیست.'); }

    const action = String(input.action || '');
    const memberName = String(input.member_name || '').trim();
    if (!memberName || memberName.length > 50) {
        return err(res, 400, 'اسم خودتان را وارد کنید (حداکثر ۵۰ حرف).');
    }

    try {
        if (action === 'create') {
            const houseName = String(input.house_name || '').trim();
            if (!houseName || houseName.length > 50) {
                return err(res, 400, 'اسم خونه را وارد کنید (حداکثر ۵۰ حرف).');
            }
            const code = genCode();
            const token = genToken();
            const state = {
                rev: 1,
                house: { name: houseName, code: code },
                members: [{ id: 1, name: memberName }],
                expenses: [],
                seq: { member: 1, expense: 0 }
            };
            await kvSet('h:' + code, JSON.stringify(state));
            await kvSet('t:' + token, JSON.stringify({ code: code, m: 1 }));
            return json(res, 200, {
                ok: true,
                token: token,
                code: code,
                house_name: houseName,
                member_id: 1,
                member_name: memberName
            });
        }

        if (action === 'join') {
            const code = String(input.invite_code || '').trim().toUpperCase();
            if (!/^[A-Z0-9]{4,10}$/.test(code)) return err(res, 400, 'کد دعوت معتبر نیست.');
            const raw = await kvGet('h:' + code);
            if (!raw) return err(res, 404, 'خونه‌ای با این کد دعوت پیدا نشد.');
            const state = JSON.parse(raw);
            state.seq.member += 1;
            const id = state.seq.member;
            state.members.push({ id: id, name: memberName });
            state.rev += 1;
            await kvSet('h:' + code, JSON.stringify(state));
            const token = genToken();
            await kvSet('t:' + token, JSON.stringify({ code: code, m: id }));
            return json(res, 200, {
                ok: true,
                token: token,
                code: code,
                house_name: state.house.name,
                member_id: id,
                member_name: memberName
            });
        }

        return err(res, 400, 'عملیات نامعتبر است.');
    } catch (e) {
        return err(res, 500, kvErrorMessage(e));
    }
}
