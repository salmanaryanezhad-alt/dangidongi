/* سرور محلی برای تست/پیش‌نمایش — رفتار ورسل را شبیه‌سازی می‌کند:
   /api/auth → api/auth.js و بقیه‌ی مسیرها فایل استاتیک.
   اجرا: KV_MEMORY=1 node dev-server.js */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png'
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);

    // مسیرهای API مثل ورسل: /api/auth → api/auth.js
    if (p.startsWith('/api/')) {
        const name = p.replace(/^\/api\//, '').replace(/\/+$/, '');
        const file = path.join(root, 'api', name + '.js');
        if (!existsSync(file)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, error: 'not found' }));
            return;
        }
        try {
            const mod = await import(file + '?' + Date.now());
            await mod.default(req, res);
        } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
        }
        return;
    }

    if (p === '/') p = '/index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !existsSync(file)) {
        res.statusCode = 404;
        res.end('not found');
        return;
    }
    const ext = path.extname(file);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(await readFile(file));
});

server.listen(port, '0.0.0.0', () => {
    console.log('dev server on http://0.0.0.0:' + port);
});
