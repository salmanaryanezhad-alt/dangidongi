/* کمکی‌های مشترک برای Route API ها */

import { kvGet } from './kv';

export function json(res, status, data) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json(data);
}

export function err(res, status, message) {
    json(res, status, { ok: false, error: message });
}

export function tokenOf(req) {
    const h = req.headers['x-token'];
    if (h) return String(h);
    return String(req.query.token || '');
}

/** نشست عضو از روی توکن؛ اگر نامعتبر بود null. */
export async function getSession(token) {
    if (!token || typeof token !== 'string') return null;
    const raw = await kvGet('t:' + token);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

export function kvErrorMessage(e) {
    if (e && e.code === 'KV_CONFIG_MISSING') {
        return 'دیتابیس KV به پروژه وصل نیست. در داشبورد ورسل: Storage → Create → KV و بعد Redeploy.';
    }
    return 'خطای سرور: ' + (e && e.message ? e.message : 'نامشخص');
}
