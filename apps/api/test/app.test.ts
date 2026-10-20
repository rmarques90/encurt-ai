import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';

process.env.DATA_ENCRYPTION_KEY ??= 'a'.repeat(64);
const apps: FastifyInstance[] = [];
async function setup(): Promise<FastifyInstance> {
  const db = new Database(':memory:');
  const app = createApp({ database: db, baseUrl: 'http://localhost:3000' });
  await app.ready(); apps.push(app); return app;
}
async function register(app: FastifyInstance, email: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'safe-password-123' } });
  expect(response.statusCode).toBe(201);
  return response.headers['set-cookie']!.split(';')[0]!;
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe('encurt.ai API', () => {
  it('registers a user and enforces URL scheme validation', async () => {
    const app = await setup(); const cookie = await register(app, 'owner@example.com');
    const invalid = await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie }, payload: { url: 'file:///etc/passwd' } });
    expect(invalid.statusCode).toBe(400);
    const shortCode = await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie }, payload: { url: 'https://example.com/path', customCode: 'short' } });
    expect(shortCode.statusCode).toBe(400);
    const valid = await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie }, payload: { url: 'https://example.com/path' } });
    expect(valid.statusCode).toBe(201); expect(valid.json().clickCount).toBe(0);
  });
  it('stores and searches free-text link descriptions with a 200 character limit', async () => {
    const app = await setup(); const cookie = await register(app, 'description@example.com');
    const description = 'Lançamento da campanha de primavera';
    const created = await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie }, payload: { url: 'https://example.com/spring', customCode: 'spring01', description } });
    expect(created.statusCode).toBe(201);
    expect(created.json().description).toBe(description);
    const links = await app.inject({ url: '/api/me/urls?search=primavera', headers: { cookie } });
    expect(links.json().items[0].description).toBe(description);
    const tooLong = await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie }, payload: { url: 'https://example.com', description: 'x'.repeat(201) } });
    expect(tooLong.statusCode).toBe(400);
  });
  it('lets only the link owner update its description', async () => {
    const app = await setup(); const ownerCookie = await register(app, 'edit-owner@example.com'); const otherCookie = await register(app, 'edit-other@example.com');
    await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie: ownerCookie }, payload: { url: 'https://example.com', customCode: 'edit123', description: 'Original' } });
    const updated = await app.inject({ method: 'PATCH', url: '/api/urls/edit123', headers: { cookie: ownerCookie }, payload: { description: 'Updated description' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().description).toBe('Updated description');
    const forbidden = await app.inject({ method: 'PATCH', url: '/api/urls/edit123', headers: { cookie: otherCookie }, payload: { description: 'Unauthorized' } });
    expect(forbidden.statusCode).toBe(403);
  });
  it('records clicks atomically on active redirects and denies paused links', async () => {
    const app = await setup(); const cookie = await register(app, 'clicker@example.com');
    await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie }, payload: { url: 'https://example.com', customCode: 'demo01' } });
    const redirect = await app.inject({ url: '/demo01' }); expect(redirect.statusCode).toBe(302); expect(redirect.headers.location).toBe('https://example.com');
    const pause = await app.inject({ method: 'PATCH', url: '/api/urls/demo01', headers: { cookie }, payload: { isActive: false } }); expect(pause.statusCode).toBe(200);
    const hidden = await app.inject({ url: '/demo01' }); expect(hidden.statusCode).toBe(404);
    const stats = await app.inject({ url: '/api/urls/demo01/stats', headers: { cookie } }); expect(stats.json().totalClicks).toBe(1);
  });
  it('sends browser requests for missing short links to the styled web 404 page', async () => {
    const db = new Database(':memory:');
    const app = createApp({ database: db, baseUrl: 'https://go.example.com', webBaseUrl: 'https://app.example.com' });
    await app.ready(); apps.push(app);

    const browser = await app.inject({ url: '/missing1', headers: { accept: 'text/html' } });
    expect(browser.statusCode).toBe(302);
    expect(browser.headers.location).toBe('https://app.example.com/404');

    const apiClient = await app.inject({ url: '/missing1', headers: { accept: 'application/json' } });
    expect(apiClient.statusCode).toBe(404);
    expect(apiClient.json().error.code).toBe('NOT_FOUND');
  });
  it('rejects cross-origin mutations and unauthenticated admin access', async () => {
    const app = await setup();
    const csrf = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://attacker.example' } }); expect(csrf.statusCode).toBe(403);
    const admin = await app.inject({ url: '/api/admin/overview' }); expect(admin.statusCode).toBe(401);
  });
  it('accepts the HTTPS origin forwarded by an explicitly trusted proxy', async () => {
    const db = new Database(':memory:');
    const app = createApp({ database: db, baseUrl: 'https://go.example.com', trustedProxyAddresses: ['127.0.0.1'] });
    await app.ready(); apps.push(app);
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register', remoteAddress: '127.0.0.1',
      headers: { host: 'app.example.com', origin: 'https://app.example.com', 'x-forwarded-proto': 'https' },
      payload: { email: 'proxy@example.com', password: 'safe-password-123' },
    });
    expect(response.statusCode).toBe(201);

    const spoofedForwardedHeaders = await app.inject({
      method: 'POST', url: '/api/auth/register', remoteAddress: '192.0.2.10',
      headers: { host: 'app.example.com', origin: 'https://app.example.com', 'x-forwarded-proto': 'https' },
      payload: { email: 'spoofed-proxy@example.com', password: 'safe-password-123' },
    });
    expect(spoofedForwardedHeaders.statusCode).toBe(403);
  });
  it('prevents one user from reading another user\'s link', async () => {
    const app = await setup(); const first = await register(app, 'first@example.com'); const second = await register(app, 'second@example.com');
    await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie: first }, payload: { url: 'https://example.com', customCode: 'private1' } });
    const response = await app.inject({ url: '/api/urls/private1', headers: { cookie: second } }); expect(response.statusCode).toBe(403);
    const patch = await app.inject({ method: 'PATCH', url: '/api/urls/private1', headers: { cookie: second }, payload: { isActive: false } }); expect(patch.statusCode).toBe(403);
  });
  it('authenticates with a cookie and revokes the session on logout', async () => {
    const app = await setup(); const cookie = await register(app, 'session@example.com');
    const me = await app.inject({ url: '/api/me', headers: { cookie } }); expect(me.statusCode).toBe(200);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'session@example.com', password: 'safe-password-123' } });
    expect(login.statusCode).toBe(200); const loginCookie = login.headers['set-cookie']!.split(';')[0]!;
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: loginCookie } });
    const expired = await app.inject({ url: '/api/me', headers: { cookie: loginCookie } }); expect(expired.statusCode).toBe(401);
  });
  it('returns the profile name and rotates the session when changing password', async () => {
    const app = await setup();
    const registration = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'profile@example.com', name: 'Ana Silva', password: 'safe-password-123' } });
    expect(registration.statusCode).toBe(201);
    expect(registration.json()).toMatchObject({ email: 'profile@example.com', name: 'Ana Silva' });
    const storedUser = app.db.prepare('SELECT name, password_hash AS passwordHash FROM users WHERE email = ?').get('profile@example.com') as { name: string; passwordHash: string };
    expect(storedUser.name).toMatch(/^enc-v1:/);
    expect(storedUser.name).not.toContain('Ana Silva');
    expect(storedUser.passwordHash).toMatch(/^\$argon2id\$/);
    expect(storedUser.passwordHash).not.toContain('safe-password-123');
    const oldCookie = registration.headers['set-cookie']!.split(';')[0]!;

    const changed = await app.inject({ method: 'PATCH', url: '/api/me/password', headers: { cookie: oldCookie }, payload: { currentPassword: 'safe-password-123', newPassword: 'updated-password-456' } });
    expect(changed.statusCode).toBe(200);
    const newCookie = changed.headers['set-cookie']!.split(';')[0]!;
    expect((await app.inject({ url: '/api/me', headers: { cookie: oldCookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/me', headers: { cookie: newCookie } })).json()).toMatchObject({ name: 'Ana Silva' });
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'profile@example.com', password: 'safe-password-123' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'profile@example.com', password: 'updated-password-456' } })).statusCode).toBe(200);
  });
  it('updates the authenticated user name and stores it encrypted', async () => {
    const app = await setup();
    const cookie = await register(app, 'rename@example.com');
    const updated = await app.inject({ method: 'PATCH', url: '/api/me/name', headers: { cookie }, payload: { name: '  Ana Souza  ' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ email: 'rename@example.com', name: 'Ana Souza' });
    const stored = app.db.prepare('SELECT name FROM users WHERE email = ?').get('rename@example.com') as { name: string };
    expect(stored.name).toMatch(/^enc-v1:/);
    expect(stored.name).not.toContain('Ana Souza');
    expect((await app.inject({ method: 'PATCH', url: '/api/me/name', headers: { cookie }, payload: { name: ' ' } })).statusCode).toBe(400);
  });
  it('returns a JSON not-found error for malformed link codes', async () => {
    const app = await setup(); const cookie = await register(app, 'malformed@example.com');
    const response = await app.inject({ url: '/api/urls/bad%20code', headers: { cookie } });
    expect(response.statusCode).toBe(404); expect(response.json().error.code).toBe('NOT_FOUND');
  });
  it('atomically disables accounts, revokes sessions, pauses links, audits and does not resume links', async () => {
    const app = await setup();
    const adminCookie = await register(app, 'admin@example.com');
    const ownerCookie = await register(app, 'owner-admin-test@example.com');
    const ownerId = (app.db.prepare('SELECT id FROM users WHERE email=?').get('owner-admin-test@example.com') as { id: number }).id;
    const adminId = (app.db.prepare('SELECT id FROM users WHERE email=?').get('admin@example.com') as { id: number }).id;
    app.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(adminId);
    await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie: ownerCookie }, payload: { url: 'https://example.com', customCode: 'account1234' } });

    const disabled = await app.inject({ method: 'PATCH', url: `/api/admin/users/${ownerId}`, headers: { cookie: adminCookie }, payload: { isDisabled: true } });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({ id: ownerId, email: 'owner-admin-test@example.com', role: 'user' });
    expect(disabled.json().disabledAt).toEqual(expect.any(String));
    expect(app.db.prepare('SELECT revoked_at AS revokedAt FROM sessions WHERE user_id=?').get(ownerId)).toMatchObject({ revokedAt: expect.any(String) });
    expect(app.db.prepare('SELECT is_active AS isActive FROM urls WHERE user_id=?').get(ownerId)).toEqual({ isActive: 0 });
    expect((await app.inject({ url: '/api/me', headers: { cookie: ownerCookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/account1234' })).statusCode).toBe(404);

    const reactivated = await app.inject({ method: 'PATCH', url: `/api/admin/users/${ownerId}`, headers: { cookie: adminCookie }, payload: { isDisabled: false } });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json().disabledAt).toBeNull();
    expect(app.db.prepare('SELECT is_active AS isActive FROM urls WHERE user_id=?').get(ownerId)).toEqual({ isActive: 0 });
    expect(app.db.prepare('SELECT action FROM audit_logs WHERE target_user_id=? ORDER BY id').all(ownerId)).toEqual([{ action: 'ACCOUNT_DISABLED' }, { action: 'ACCOUNT_REACTIVATED' }]);
  });
  it('denies account status changes to non-admin users', async () => {
    const app = await setup();
    const cookie = await register(app, 'regular-admin-route@example.com');
    const response = await app.inject({ method: 'PATCH', url: '/api/admin/users/1', headers: { cookie }, payload: { isDisabled: true } });
    expect(response.statusCode).toBe(403);
  });
  it('returns short URLs and the paginated envelope in admin link listings', async () => {
    const app = await setup();
    const adminCookie = await register(app, 'links-admin@example.com');
    const adminId = (app.db.prepare('SELECT id FROM users WHERE email=?').get('links-admin@example.com') as { id: number }).id;
    app.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(adminId);
    const ownerCookie = await register(app, 'links-owner@example.com');
    await app.inject({ method: 'POST', url: '/api/urls', headers: { cookie: ownerCookie }, payload: { url: 'https://example.com/target', customCode: 'admin01' } });

    const response = await app.inject({ url: '/api/admin/urls?page=1&pageSize=10', headers: { cookie: adminCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ page: 1, pageSize: 10, total: 1, items: [{ code: 'admin01', shortUrl: 'http://localhost:3000/admin01' }] });
  });
});
