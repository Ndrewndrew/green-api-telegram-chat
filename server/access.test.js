import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createReviewApp } from './access.js';

let distDir;
beforeAll(async () => {
  distDir = await mkdtemp(path.join(tmpdir(), 'review-gate-'));
  await mkdir(path.join(distDir, 'assets'));
  await writeFile(path.join(distDir, 'index.html'), '<div>private-app</div>');
  await writeFile(path.join(distDir, 'assets', 'app-test.js'), 'private-source');
});
afterAll(async () => rm(distDir, { recursive: true, force: true }));
const options = { password: 'test-password', secret: 'test-signing-secret-at-least-32-characters' };
const app = (overrides = {}) => createReviewApp({ ...options, distDir, ...overrides });
const login = (server) => request(server).post('/_access/login').type('form').send({ password: options.password });

describe('server access gate', () => {
  it('withholds application HTML and assets before login', async () => {
    expect((await request(app()).get('/')).text).toContain('Пароль доступа');
    const asset = await request(app()).get('/assets/app-test.js');
    expect(asset.status).toBe(401);
    expect(asset.text).not.toContain('private-source');
  });
  it('rejects an incorrect password without setting a cookie', async () => {
    const response = await request(app()).post('/_access/login').type('form').send({ password: 'wrong' });
    expect(response.status).toBe(401);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
  it('opens HTML and assets with a signed secure session', async () => {
    const server = app();
    const response = await login(server);
    expect(response.status).toBe(303);
    const cookie = response.headers['set-cookie'][0];
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) expect(cookie).toContain(flag);
    expect((await request(server).get('/').set('Cookie', cookie)).text).toContain('private-app');
    const asset = await request(server).get('/assets/app-test.js').set('Cookie', cookie);
    expect(asset.text).toBe('private-source');
    expect(asset.headers['cache-control']).toContain('no-store');
  });
  it('rejects forged and expired sessions', async () => {
    const start = 1800000000000;
    const cookie = (await login(app({ now: () => start }))).headers['set-cookie'][0];
    expect((await request(app({ now: () => start + 9 * 3600000 })).get('/').set('Cookie', cookie)).text).toContain('Пароль доступа');
    expect((await request(app()).get('/').set('Cookie', '__Host-review_session=9999999999.forged')).text).toContain('Пароль доступа');
  });
  it('fails closed when server secrets are missing', async () => {
    expect((await request(app({ password: '', secret: '' })).get('/')).status).toBe(503);
  });
  it('rejects a login submitted from another origin', async () => {
    const response = await request(app()).post('/_access/login').set('Origin', 'https://other.example').type('form').send({ password: options.password });
    expect(response.status).toBe(403);
  });
  it('does not serve source files after login', async () => {
    const server = app();
    const cookie = (await login(server)).headers['set-cookie'][0];
    for (const route of ['/server.js', '/.env', '/assets/..%2fserver.js']) expect((await request(server).get(route).set('Cookie', cookie)).status).toBe(404);
  });
});
