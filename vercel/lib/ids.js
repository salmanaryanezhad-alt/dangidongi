/* تولید کد دعوت و توکن — فقط سمت سرور */

import { randomBytes } from 'node:crypto';

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
