import argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { CLICK_INTERVAL, CODE_ALPHABET, CODE_LENGTH, EARLIEST_CLICK_STATS_DATE, MAX_CODE_ATTEMPTS, MAX_LINK_DESCRIPTION_LENGTH, SESSION_TTL_MS } from '../../constants.js';
import type { Account, PlatformRepository, UrlView, UrlStatusFilter, Page, UrlPageItem } from './repository.js';

export class DomainError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export type AuthSession = { account: Account; token: string; expiresAt: string };

export class PlatformService {
  constructor(private readonly repository: PlatformRepository, private readonly now: () => Date = () => new Date()) {}

  async register(emailInput: string, password: string, nameInput?: string): Promise<AuthSession> {
    const email = emailInput.trim().toLowerCase();
    const name = nameInput?.trim() || email.slice(0, email.indexOf('@'));
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const account = this.repository.createUser(email, name, passwordHash, this.now().toISOString());
    return { account, ...this.issueSession(account.id) };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<AuthSession> {
    const stored = this.repository.findUserById(userId);
    if (!stored || !await argon2.verify(stored.passwordHash, currentPassword)) {
      throw new DomainError(400, 'CURRENT_PASSWORD_INVALID', 'A senha atual está incorreta');
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    this.repository.updatePassword(userId, passwordHash);
    this.repository.revokeUserSessions(userId, this.now().toISOString());
    return { account: stored, ...this.issueSession(userId) };
  }

  updateName(userId: number, nameInput: string): Account {
    const name = nameInput.trim();
    const account = this.repository.updateName(userId, name);
    if (!account) throw new DomainError(404, 'NOT_FOUND', 'Usuário não encontrado');
    return account;
  }

  async login(emailInput: string, password: string): Promise<AuthSession> {
    const stored = this.repository.findUserByEmail(emailInput.trim().toLowerCase());
    if (!stored || stored.disabledAt || !await argon2.verify(stored.passwordHash, password)) {
      throw new DomainError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos');
    }
    return { account: stored, ...this.issueSession(stored.id) };
  }

  authenticate(tokenHash: string): Account | undefined {
    return this.repository.findAuthenticatedAccount(tokenHash, this.now().toISOString());
  }

  logout(tokenHash: string | undefined): void {
    if (tokenHash) this.repository.revokeSession(tokenHash, this.now().toISOString());
  }

  listUrls(userId: number): UrlView[] { return this.repository.listUserUrls(userId); }
  searchUrls(userId: number | undefined, filter: { search: string; status: UrlStatusFilter; page: number; pageSize: number }): Page<UrlPageItem> { return this.repository.listUrls(userId, filter, this.now().toISOString()); }
  getUserStats(userId: number, fromInput?: string, toInput?: string): { totalClicks: number; interval: typeof CLICK_INTERVAL; points: { date: string; clicks: number }[] } {
    const from = fromInput ?? EARLIEST_CLICK_STATS_DATE;
    const to = toInput ?? this.now().toISOString();
    if (from > to) throw new DomainError(400, 'INVALID_RANGE', 'Período inválido');
    return { ...this.repository.getUserClickStats(userId, from, to), interval: CLICK_INTERVAL };
  }

  createUrl(input: { url: string; customCode?: string | undefined; expiresAt?: string | undefined; description?: string | undefined }, userId: number): UrlView {
    if (!isHttpUrl(input.url)) throw new DomainError(400, 'INVALID_URL', 'A URL deve usar HTTP ou HTTPS');
    if (input.description && input.description.length > MAX_LINK_DESCRIPTION_LENGTH) throw new DomainError(400, 'VALIDATION_ERROR', `A descrição deve ter no máximo ${MAX_LINK_DESCRIPTION_LENGTH} caracteres`);
    const createdAt = this.now().toISOString();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
    if (expiresAt && expiresAt <= createdAt) throw new DomainError(400, 'INVALID_EXPIRATION', 'A expiração deve estar no futuro');
    let code = input.customCode;
    for (let attempt = 0; !code && attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const candidate = randomCode();
      if (!this.repository.codeExists(candidate)) code = candidate;
    }
    if (!code) throw new DomainError(503, 'CODE_UNAVAILABLE', 'Não foi possível gerar um código');
    const description = input.description ?? '';
    this.repository.createUrl({ code, targetUrl: input.url, description, createdAt, expiresAt, userId });
    return { code, targetUrl: input.url, description, createdAt, expiresAt, isActive: true, clickCount: 0 };
  }

  getUrl(code: string, account: Account): UrlView {
    const row = this.requireUrl(code);
    this.assertOwner(row.userId, account);
    return toView(row);
  }

  setUrlActive(code: string, isActive: boolean, account: Account): UrlView {
    const row = this.requireUrl(code);
    this.assertOwner(row.userId, account);
    this.repository.setUrlActive(row.id, isActive);
    return { ...toView(row), isActive };
  }

  setUrlDescription(code: string, description: string, account: Account): UrlView {
    if (description.length > MAX_LINK_DESCRIPTION_LENGTH) throw new DomainError(400, 'VALIDATION_ERROR', `A descrição deve ter no máximo ${MAX_LINK_DESCRIPTION_LENGTH} caracteres`);
    const row = this.requireUrl(code);
    this.assertOwner(row.userId, account);
    this.repository.setUrlDescription(row.id, description);
    return { ...toView(row), description };
  }

  getStats(code: string, account: Account, fromInput?: string, toInput?: string): { code: string; totalClicks: number; interval: typeof CLICK_INTERVAL; points: { date: string; clicks: number }[] } {
    const row = this.requireUrl(code);
    this.assertOwner(row.userId, account);
    const from = fromInput ?? EARLIEST_CLICK_STATS_DATE;
    const to = toInput ?? this.now().toISOString();
    if (from > to) throw new DomainError(400, 'INVALID_RANGE', 'Período inválido');
    return { code, totalClicks: row.clickCount, interval: CLICK_INTERVAL, points: this.repository.getClickStats(row.id, from, to) };
  }

  recordClick(code: string): string | undefined { return this.repository.recordClick(code, this.now().toISOString()); }

  private issueSession(userId: number): { token: string; expiresAt: string } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS).toISOString();
    this.repository.createSession(hashToken(token), userId, expiresAt);
    return { token, expiresAt };
  }

  private requireUrl(code: string) {
    const row = this.repository.findUrlByCode(code);
    if (!row) throw new DomainError(404, 'NOT_FOUND', 'Link não encontrado');
    return row;
  }

  private assertOwner(ownerId: number, account: Account): void {
    if (ownerId !== account.id && account.role !== 'admin') throw new DomainError(403, 'FORBIDDEN', 'Acesso não permitido');
  }
}

export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

function randomCode(): string {
  let value = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) value += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return value;
}

function isHttpUrl(value: string): boolean {
  try { const parsed = new URL(value); return parsed.protocol === 'http:' || parsed.protocol === 'https:'; }
  catch { return false; }
}

function toView(row: { code: string; targetUrl: string; description: string; createdAt: string; expiresAt: string | null; isActive: boolean; clickCount: number }): UrlView {
  return { code: row.code, targetUrl: row.targetUrl, description: row.description, createdAt: row.createdAt, expiresAt: row.expiresAt, isActive: row.isActive, clickCount: row.clickCount };
}

