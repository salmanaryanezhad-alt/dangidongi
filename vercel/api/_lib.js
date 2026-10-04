/* توابع مشترک سمت سرور برای توابع سرورلس ورسل */

import { randomBytes } from 'node:crypto';
import { kvGet } from './_kv.js';

export function json(res, status, data) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
}

export function err(res, status, message) {
    json(res, status, { ok: false, error: message });
}

export function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => {
            data += c;
            if (data.length > 1000000) req.destroy();
        });
        req.on('end', () => {
            try { resolve(data ? JSON.parse(data) : {}); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

export function genCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
    return code;
}

export function genToken() {
    return randomBytes(24).toString('hex');
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
        if (s.weight > 0) { s.share += remainder; break; }
    }
    return shares;
}

/** نشست عضو از روی توکن؛ اگر نامعتبر بود null. */
export async function getSession(token) {
    if (!token || typeof token !== 'string') return null;
    const raw = await kvGet('t:' + token);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

export function tokenOf(req) {
    const h = req.headers['x-token'];
    if (h) return String(h);
    try {
        const u = new URL(req.url, 'http://x');
        return u.searchParams.get('token') || '';
    } catch (e) { return ''; }
}

export function kvErrorMessage(e) {
    if (e && e.code === 'KV_CONFIG_MISSING') {
        return 'دیتابیس KV به پروژه وصل نیست. در داشبورد ورسل: Storage → Create → KV و بعد Redeploy.';
    }
    return 'خطای سرور: ' + (e && e.message ? e.message : 'نامشخص');
}
