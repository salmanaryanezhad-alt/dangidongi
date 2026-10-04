/* لایه‌ی ذخیره‌سازی: Vercel KV (Upstash Redis) از طریق REST.
   با KV_MEMORY=1 از حافظه‌ی موقت استفاده می‌کند (فقط برای تست محلی). */

const MEM = new Map();

function cfg() {
    return {
        url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
    };
}

async function command(args) {
    const { url, token } = cfg();
    if (!url || !token) {
        const e = new Error('KV_CONFIG_MISSING');
        e.code = 'KV_CONFIG_MISSING';
        throw e;
    }
    const r = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: args })
    });
    if (!r.ok) throw new Error('KV_HTTP_' + r.status);
    return r.json();
}

export async function kvGet(key) {
    if (process.env.KV_MEMORY === '1') {
        return MEM.has(key) ? MEM.get(key) : null;
    }
    const j = await command(['get', key]);
    return (j.result === undefined || j.result === null) ? null : j.result;
}

export async function kvSet(key, value) {
    if (process.env.KV_MEMORY === '1') {
        MEM.set(key, value);
        return;
    }
    await command(['set', key, value]);
}
