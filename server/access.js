import express from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COOKIE = '__Host-review_session';
const TTL = 8 * 60 * 60;
const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url));
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

function loginPage(error = false) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Доступ к тестовому заданию</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f3f6fb;color:#18263b;font-family:system-ui,sans-serif;padding:24px}main{width:100%;max-width:430px;padding:36px;background:white;border:1px solid #e1e7ef;border-radius:24px;box-shadow:0 20px 60px #253b6210}.tag{color:#2873df;font-size:13px;font-weight:650}h1{font-size:27px;line-height:1.2;margin:14px 0}p{font-size:15px;line-height:1.55;color:#58677b}label{display:block;margin:28px 0 9px;font-size:14px;font-weight:600}input,button{width:100%;min-height:48px;border-radius:12px;font:inherit}input{border:1px solid #b8c5d6;padding:12px}input:focus-visible,button:focus-visible{outline:3px solid #91bbfa;outline-offset:3px}button{border:0;background:#2873df;color:white;font-weight:600;margin-top:16px;cursor:pointer}.error{color:#ad2525;font-size:14px}.foot{margin:24px 0 0;font-size:12px}@media(max-width:420px){main{padding:26px}}
  </style></head><body><main><span class="tag">GREEN-API · TELEGRAM</span><h1>Тестовое задание</h1><p>Введите пароль из письма, чтобы открыть приложение.</p><form method="post" action="/_access/login"><label for="password">Пароль доступа</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200" ${error ? 'aria-invalid="true" aria-describedby="error"' : ''}>${error ? '<p class="error" id="error" role="alert">Пароль не подошёл. Попробуйте ещё раз.</p>' : ''}<button type="submit">Открыть приложение</button></form><p class="foot">React + TypeScript · Отправка и получение сообщений через GREEN-API</p></main></body></html>`;
}

export function createReviewApp({ password = process.env.REVIEW_ACCESS_PASSWORD, secret = process.env.REVIEW_SESSION_SECRET, distDir = defaultDist, now = () => Date.now() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const configured = typeof password === 'string' && password.length >= 8 && typeof secret === 'string' && secret.length >= 32;
  const signature = (value) => createHmac('sha256', secret).update(`${value}:${password}`).digest('base64url');
  const authorized = (req) => {
    const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!cookie || cookie.length > 200) return false;
    const [expiry, mac, extra] = cookie.split('.');
    const time = Number(expiry);
    return !extra && /^\d+$/.test(expiry) && time > Math.floor(now() / 1000) && time <= Math.floor(now() / 1000) + TTL && typeof mac === 'string' && equal(mac, signature(expiry));
  };
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
    if (!configured) return res.status(503).type('text').send('Доступ временно недоступен. Проверьте настройки сервера.');
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '1kb' }));
  app.post('/_access/login', (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return res.sendStatus(403); }
      catch { return res.sendStatus(403); }
    }
    if (typeof req.body?.password !== 'string' || !equal(req.body.password, password)) return res.status(401).type('html').send(loginPage(true));
    const expiry = String(Math.floor(now() / 1000) + TTL);
    res.setHeader('Set-Cookie', `${COOKIE}=${expiry}.${signature(expiry)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`);
    return res.redirect(303, '/');
  });
  app.post('/_access/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return res.redirect(303, '/');
  });
  app.use((req, res, next) => {
    if (!authorized(req)) return res.status(req.path === '/' ? 200 : 401).type('html').send(loginPage());
    next();
  });
  app.get('/', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  // Serve only Vite's generated assets, after checking the session. No public CDN directory.
  app.get('/assets/:file', (req, res) => {
    if (!/^[a-zA-Z0-9_.-]+\.(?:js|css|svg|woff2?|png|jpg|webp|ico)$/.test(req.params.file)) return res.sendStatus(404);
    return res.sendFile(path.join(distDir, 'assets', req.params.file));
  });
  app.use((_req, res) => res.sendStatus(404));
  app.use((_error, _req, res, _next) => res.status(400).type('text').send('Не удалось обработать запрос.'));
  return app;
}
