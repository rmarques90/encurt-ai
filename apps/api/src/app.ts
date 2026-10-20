import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { readTrustedProxyAddresses, readWebBaseUrl } from './config/env.js';
import { CLICK_INTERVAL, COOKIE_NAME, CREATE_LINK_RATE_LIMIT, CUSTOM_CODE_PATTERN, DEFAULT_ADMIN_PAGE_SIZE, DEFAULT_PORT, GLOBAL_RATE_LIMIT, LOGIN_RATE_LIMIT, MAX_ADMIN_PAGE_SIZE, MAX_CUSTOM_CODE_LENGTH, MAX_EMAIL_LENGTH, MAX_LINK_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, MAX_PASSWORD_LENGTH, MAX_URL_LENGTH, MIN_ADMIN_PAGE_SIZE, MIN_CUSTOM_CODE_LENGTH, MIN_NAME_LENGTH, MIN_PASSWORD_LENGTH, RATE_LIMIT_WINDOW, REGISTER_RATE_LIMIT } from './constants.js';
import { createDatabase, getSqliteFile } from './db/index.js';
import { AdminService } from './modules/admin/service.js';
import { DrizzleAdminRepository } from './modules/admin/repository.js';
import { ADMIN_USER_ID_PATTERN } from './modules/admin/constants.js';
import { DrizzlePlatformRepository } from './modules/platform/repository.js';
import { DomainError, hashToken, PlatformService, type AuthSession } from './modules/platform/service.js';
import type { Account, UrlView } from './modules/platform/repository.js';

interface AppOptions { database?: Database.Database; baseUrl?: string; webBaseUrl?: string; secureCookies?: boolean; trustedProxyAddresses?: string[] }
const credentialsSchema = z.object({ email: z.string().email().max(MAX_EMAIL_LENGTH), password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH) }).strict();
const registrationSchema = credentialsSchema.extend({ name: z.string().trim().min(MIN_NAME_LENGTH).max(MAX_NAME_LENGTH).optional() }).strict();
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH), newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH) }).strict();
const profileNameSchema = z.object({ name: z.string().trim().min(MIN_NAME_LENGTH).max(MAX_NAME_LENGTH) }).strict();
const urlSchema = z.object({ url: z.string().url().max(MAX_URL_LENGTH), customCode: z.string().min(MIN_CUSTOM_CODE_LENGTH).max(MAX_CUSTOM_CODE_LENGTH).regex(CUSTOM_CODE_PATTERN).optional(), expiresAt: z.string().datetime({ offset: true }).optional(), description: z.string().max(MAX_LINK_DESCRIPTION_LENGTH).optional() }).strict();
const activeSchema = z.object({ isActive: z.boolean() }).strict();
const urlDescriptionSchema = z.object({ description: z.string().max(MAX_LINK_DESCRIPTION_LENGTH) }).strict();
const disabledSchema = z.object({ isDisabled: z.boolean() }).strict();
const roleSchema = z.object({ role: z.enum(['user', 'admin']) }).strict();
const adminUserMutationSchema = z.union([disabledSchema, roleSchema]);
const statsSchema = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), interval: z.literal(CLICK_INTERVAL).optional() }).strict();
const codeSchema = z.string().regex(CUSTOM_CODE_PATTERN);
const pageQuerySchema = z.object({ search: z.string().max(100).default(''), status: z.enum(['all', 'active', 'inactive', 'expired']).default('all'), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(MIN_ADMIN_PAGE_SIZE).max(MAX_ADMIN_PAGE_SIZE).default(DEFAULT_ADMIN_PAGE_SIZE) }).strict();
const adminUsersQuerySchema = z.object({ search: z.string().max(100).default(''), status: z.enum(['all', 'active', 'disabled']).default('all'), role: z.enum(['all', 'user', 'admin']).default('all'), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(MIN_ADMIN_PAGE_SIZE).max(MAX_ADMIN_PAGE_SIZE).default(DEFAULT_ADMIN_PAGE_SIZE) }).strict();

export function createApp(options: AppOptions = {}): FastifyInstance {
  const trustedProxyAddresses = options.trustedProxyAddresses ?? readTrustedProxyAddresses();
  const webBaseUrl = options.webBaseUrl ?? readWebBaseUrl();
  const databasePath = getSqliteFile();
  if (!options.database && databasePath !== ':memory:') mkdirSync(dirname(isAbsolute(databasePath) ? databasePath : resolve(databasePath)), { recursive: true });
  const connection = options.database ?? new Database(databasePath);
  connection.pragma('foreign_keys = ON');
  connection.pragma('journal_mode = WAL');
  const drizzleDatabase = createDatabase(connection);
  const platformRepository = new DrizzlePlatformRepository(drizzleDatabase);
  const platformService = new PlatformService(platformRepository);
  const adminRepository = new DrizzleAdminRepository(drizzleDatabase);
  const adminService = new AdminService(adminRepository);
  const app = Fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'req.url'] }, genReqId: () => randomUUID(), trustProxy: trustedProxyAddresses.length ? trustedProxyAddresses : false });
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === 'production';
  app.register(cookie);
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(rateLimit, { max: GLOBAL_RATE_LIMIT, timeWindow: RATE_LIMIT_WINDOW });
  app.decorateRequest('account', null);
  app.addHook('preHandler', async (request, reply) => {
    if (rejectCrossOriginMutation(request, reply)) return;
    const token = request.cookies[COOKIE_NAME];
    if (token) request.account = platformService.authenticate(hashToken(token)) ?? null;
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return sendError(request, reply, 400, 'VALIDATION_ERROR', 'Dados inválidos');
    if (error instanceof DomainError) return sendError(request, reply, error.status, error.code, error.message);
    if (isUniqueConstraint(error)) return sendError(request, reply, 409, 'CONFLICT', 'Não foi possível concluir a operação');
    request.log.error({ err: error, requestId: request.id }, 'Unhandled request error');
    return sendError(request, reply, 500, 'INTERNAL_ERROR', 'Ocorreu um erro interno');
  });
  app.decorate('db', connection);

  app.get('/health', async (_request, reply) => { platformRepository.checkHealth(); return reply.send({ status: 'ok' }); });
  app.post('/api/auth/register', { config: { rateLimit: { max: REGISTER_RATE_LIMIT, timeWindow: RATE_LIMIT_WINDOW } } }, async (request, reply) => {
    const input = registrationSchema.parse(request.body);
    let result: AuthSession;
    try { result = await platformService.register(input.email, input.password, input.name); }
    catch (error) {
      if (isUniqueConstraint(error)) return sendError(request, reply, 409, 'EMAIL_EXISTS', 'Não foi possível criar a conta');
      throw error;
    }
    setSessionCookie(reply, result.token, result.expiresAt, secureCookies);
    request.log.info({ requestId: request.id, userId: result.account.id }, 'Account registered');
    return reply.code(201).send(publicAccount(result.account));
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: LOGIN_RATE_LIMIT, timeWindow: RATE_LIMIT_WINDOW } } }, async (request, reply) => {
    const input = credentialsSchema.parse(request.body);
    const result = await platformService.login(input.email, input.password);
    setSessionCookie(reply, result.token, result.expiresAt, secureCookies);
    request.log.info({ requestId: request.id, userId: result.account.id }, 'User authenticated');
    return reply.send(publicAccount(result.account));
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    platformService.logout(token ? hashToken(token) : undefined);
    reply.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies });
    return reply.code(204).send();
  });
  app.get('/api/me', { preHandler: requireUser }, async (request) => publicAccount(request.account!));
  app.patch('/api/me/name', { preHandler: requireUser }, async (request, reply) => {
    const input = profileNameSchema.parse(request.body);
    const account = platformService.updateName(request.account!.id, input.name);
    request.log.info({ requestId: request.id, userId: account.id }, 'Account name updated');
    return reply.send(publicAccount(account));
  });
  app.patch('/api/me/password', { preHandler: requireUser }, async (request, reply) => {
    const input = passwordChangeSchema.parse(request.body);
    const result = await platformService.changePassword(request.account!.id, input.currentPassword, input.newPassword);
    setSessionCookie(reply, result.token, result.expiresAt, secureCookies);
    request.log.info({ requestId: request.id, userId: result.account.id }, 'Account password changed');
    return reply.send(publicAccount(result.account));
  });
  app.get('/api/me/urls', { preHandler: requireUser }, async (request) => {
    const baseUrl = getBaseUrl(options.baseUrl);
    const query = pageQuerySchema.parse(request.query);
    const page = platformService.searchUrls(request.account!.id, query);
    return { ...page, items: page.items.map((row) => ({ ...row, shortUrl: `${baseUrl}/${row.code}` })) };
  });
  app.get('/api/me/stats', { preHandler: requireUser }, async (request) => {
    const query = statsSchema.parse(request.query);
    return platformService.getUserStats(request.account!.id, query.from, query.to);
  });
  app.post('/api/urls', { preHandler: requireUser, config: { rateLimit: { max: CREATE_LINK_RATE_LIMIT, timeWindow: RATE_LIMIT_WINDOW } } }, async (request, reply) => {
    const input = urlSchema.parse(request.body);
    let created: UrlView;
    try { created = platformService.createUrl(input, request.account!.id); }
    catch (error) {
      if (isUniqueConstraint(error)) return sendError(request, reply, 409, 'CODE_EXISTS', 'Esse código já está em uso');
      throw error;
    }
    request.log.info({ requestId: request.id, userId: request.account!.id, code: created.code }, 'Short URL created');
    return reply.code(201).send({ code: created.code, shortUrl: `${getBaseUrl(options.baseUrl)}/${created.code}`, targetUrl: created.targetUrl, description: created.description, expiresAt: created.expiresAt, isActive: created.isActive, clickCount: created.clickCount });
  });
  app.get('/api/urls/:code', { preHandler: requireUser }, async (request, reply) => {
    const code = parseCode(request, reply);
    if (!code) return;
    return reply.send(platformService.getUrl(code, request.account!));
  });
  app.patch('/api/urls/:code', { preHandler: requireUser }, async (request, reply) => {
    const code = parseCode(request, reply);
    if (!code) return;
    const input = z.union([activeSchema, urlDescriptionSchema]).parse(request.body);
    if ('isActive' in input) return reply.send(platformService.setUrlActive(code, input.isActive, request.account!));
    return reply.send(platformService.setUrlDescription(code, input.description, request.account!));
  });
  app.get('/api/urls/:code/stats', { preHandler: requireUser }, async (request, reply) => {
    const code = parseCode(request, reply);
    if (!code) return;
    const query = statsSchema.parse(request.query);
    return reply.send(platformService.getStats(code, request.account!, query.from, query.to));
  });
  app.get('/api/admin/overview', { preHandler: requireAdmin }, async (_request, reply) => reply.send(adminService.getOverview()));
  app.get('/api/admin/users', { preHandler: requireAdmin }, async (request, reply) => {
    const query = adminUsersQuerySchema.parse(request.query);
    return reply.send(adminService.listUsers(query));
  });
  app.patch('/api/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const params = z.object({ id: z.string().regex(ADMIN_USER_ID_PATTERN) }).strict().parse(request.params);
    const input = adminUserMutationSchema.parse(request.body);
    const target = 'isDisabled' in input
      ? adminService.setAccountDisabled(Number(params.id), request.account!.id, input.isDisabled)
      : adminService.setUserRole(Number(params.id), request.account!.id, input.role);
    if (!target) return sendError(request, reply, 404, 'NOT_FOUND', 'Usuário não encontrado');
    request.log.info({ requestId: request.id, actorId: request.account!.id, targetId: target.id, action: 'isDisabled' in input ? (input.isDisabled ? 'ACCOUNT_DISABLED' : 'ACCOUNT_REACTIVATED') : (input.role === 'admin' ? 'USER_PROMOTED' : 'USER_DEMOTED') }, 'Admin updated account');
    return reply.send(target);
  });
  app.get('/api/admin/urls', { preHandler: requireAdmin }, async (request) => {
    const page = platformService.searchUrls(undefined, pageQuerySchema.parse(request.query));
    const baseUrl = getBaseUrl(options.baseUrl);
    return { ...page, items: page.items.map((row) => ({ ...row, shortUrl: `${baseUrl}/${row.code}` })) };
  });
  app.patch('/api/admin/urls/:code', { preHandler: requireAdmin }, async (request, reply) => {
    const code = parseCode(request, reply);
    if (!code) return;
    const input = activeSchema.parse(request.body);
    if (!adminService.setLinkActive(code, request.account!.id, input.isActive)) return sendError(request, reply, 404, 'NOT_FOUND', 'Link não encontrado');
    request.log.info({ requestId: request.id, actorId: request.account!.id, code, action: input.isActive ? 'LINK_ACTIVATED' : 'LINK_DEACTIVATED' }, 'Admin updated link state');
    return reply.code(204).send();
  });
  app.delete('/api/admin/urls/:code', { preHandler: requireAdmin }, async (request, reply) => {
    const code = parseCode(request, reply);
    if (!code) return;
    if (!adminService.removeLink(code, request.account!.id)) return sendError(request, reply, 404, 'NOT_FOUND', 'Link não encontrado');
    request.log.info({ requestId: request.id, actorId: request.account!.id, code, action: 'LINK_REMOVED' }, 'Admin removed link');
    return reply.code(204).send();
  });
  app.get('/:code', async (request, reply) => {
    const code = parseCode(request, reply);
    if (!code) return;
    const target = platformService.recordClick(code);
    if (!target) {
      if (webBaseUrl && request.headers.accept?.includes('text/html')) return reply.redirect(`${webBaseUrl}/404`, 302);
      return sendError(request, reply, 404, 'NOT_FOUND', 'Link não encontrado');
    }
    return reply.redirect(target, 302);
  });
  app.addHook('onClose', async () => { if (!options.database) connection.close(); });
  return app;
}

function rejectCrossOriginMutation(request: FastifyRequest, reply: FastifyReply): boolean {
  const unsafe = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
  const origin = request.headers.origin;
  if (!unsafe || !origin) return false;
  try {
    const expected = new URL(`${request.protocol}://${request.headers.host}`).origin;
    if (new URL(origin).origin === expected) return false;
  } catch { /* malformed origin is rejected below */ }
  sendError(request, reply, 403, 'CSRF_REJECTED', 'Origem não permitida');
  return true;
}

function sendError(request: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  return reply.code(status).send({ error: { code, message, requestId: request.id } });
}

async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
  if (!request.account) return sendError(request, reply, 401, 'UNAUTHENTICATED', 'Autenticação necessária');
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
  if (!request.account) return sendError(request, reply, 401, 'UNAUTHENTICATED', 'Autenticação necessária');
  if (request.account.role !== 'admin') return sendError(request, reply, 403, 'FORBIDDEN', 'Acesso não permitido');
}

function parseCode(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const result = codeSchema.safeParse((request.params as { code?: unknown }).code);
  if (result.success) return result.data;
  sendError(request, reply, 404, 'NOT_FOUND', 'Link não encontrado');
  return undefined;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: string, secure: boolean): void {
  reply.setCookie(COOKIE_NAME, token, { path: '/', httpOnly: true, secure, sameSite: 'lax', expires: new Date(expiresAt) });
}

function publicAccount(account: Account): Pick<Account, 'id' | 'email' | 'name' | 'role'> { return { id: account.id, email: account.email, name: account.name, role: account.role }; }

function getBaseUrl(configured?: string): string {
  return configured ?? process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? DEFAULT_PORT}`;
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && (error.message.includes('UNIQUE constraint failed') || error.message.includes('SQLITE_CONSTRAINT_UNIQUE'));
}

declare module 'fastify' {
  interface FastifyRequest { account: Account | null }
  interface FastifyInstance { db: Database.Database }
}
