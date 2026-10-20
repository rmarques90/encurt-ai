import { and, count, desc, eq, gt, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/index.js';
import { clickEvents, sessions, urls, users } from '../../db/schema.js';
import { decryptUserName, encryptUserName } from '../../security/field-encryption.js';

export type Account = { id: number; email: string; name: string; role: 'user' | 'admin'; disabledAt: string | null };
export type StoredAccount = Account & { passwordHash: string };
export type StoredUrl = { id: number; code: string; targetUrl: string; description: string; createdAt: string; expiresAt: string | null; isActive: boolean; clickCount: number; userId: number };
export type UrlView = Omit<StoredUrl, 'id' | 'userId'>;
export type ClickPoint = { date: string; clicks: number };
export type UrlStatusFilter = 'all' | 'active' | 'inactive' | 'expired';
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type UrlPageItem = UrlView & { ownerEmail?: string };

export interface PlatformRepository {
  createUser(email: string, name: string, passwordHash: string, createdAt: string): Account;
  findUserByEmail(email: string): StoredAccount | undefined;
  findUserById(id: number): StoredAccount | undefined;
  updatePassword(userId: number, passwordHash: string): void;
  updateName(userId: number, name: string): Account | undefined;
  revokeUserSessions(userId: number, revokedAt: string): void;
  createSession(tokenHash: string, userId: number, expiresAt: string): void;
  findAuthenticatedAccount(tokenHash: string, now: string): Account | undefined;
  revokeSession(tokenHash: string, revokedAt: string): void;
  listUserUrls(userId: number): UrlView[];
  listUrls(userId: number | undefined, filter: { search: string; status: UrlStatusFilter; page: number; pageSize: number }, now: string): Page<UrlPageItem>;
  getUserClickStats(userId: number, from: string, to: string): { totalClicks: number; points: ClickPoint[] };
  codeExists(code: string): boolean;
  createUrl(input: Omit<StoredUrl, 'id' | 'clickCount' | 'isActive'> & { userId: number }): void;
  findUrlByCode(code: string): StoredUrl | undefined;
  setUrlActive(id: number, isActive: boolean): void;
  setUrlDescription(id: number, description: string): void;
  getClickStats(urlId: number, from: string, to: string): ClickPoint[];
  recordClick(code: string, now: string): string | undefined;
  checkHealth(): void;
}

export class DrizzlePlatformRepository implements PlatformRepository {
  constructor(private readonly database: AppDatabase) {}
  createUser(email: string, name: string, passwordHash: string, createdAt: string): Account {
    const row = this.database.insert(users).values({ email, name: encryptUserName(name), passwordHash, createdAt }).returning({ id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt }).get();
    return decryptAccountName(row);
  }
  findUserByEmail(email: string): StoredAccount | undefined {
    const row = this.database.select({ id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email)).get();
    return row ? decryptAccountName(row) : undefined;
  }
  findUserById(id: number): StoredAccount | undefined {
    const row = this.database.select({ id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt, passwordHash: users.passwordHash }).from(users).where(eq(users.id, id)).get();
    return row ? decryptAccountName(row) : undefined;
  }
  updatePassword(userId: number, passwordHash: string): void {
    this.database.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
  }
  updateName(userId: number, name: string): Account | undefined {
    const row = this.database.update(users).set({ name: encryptUserName(name) }).where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt }).get();
    return row ? decryptAccountName(row) : undefined;
  }
  revokeUserSessions(userId: number, revokedAt: string): void {
    this.database.update(sessions).set({ revokedAt }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))).run();
  }
  createSession(tokenHash: string, userId: number, expiresAt: string): void {
    this.database.insert(sessions).values({ tokenHash, userId, expiresAt }).run();
  }
  findAuthenticatedAccount(tokenHash: string, now: string): Account | undefined {
    const row = this.database.select({ id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt }).from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), isNull(users.disabledAt))).get();
    return row ? decryptAccountName(row) : undefined;
  }
  revokeSession(tokenHash: string, revokedAt: string): void {
    this.database.update(sessions).set({ revokedAt }).where(eq(sessions.tokenHash, tokenHash)).run();
  }
  listUserUrls(userId: number): UrlView[] {
    return this.database.select({ code: urls.code, targetUrl: urls.targetUrl, description: urls.description, createdAt: urls.createdAt, expiresAt: urls.expiresAt, isActive: urls.isActive, clickCount: urls.clickCount })
      .from(urls).where(eq(urls.userId, userId)).orderBy(desc(urls.createdAt)).all();
  }
  listUrls(userId: number | undefined, filter: { search: string; status: UrlStatusFilter; page: number; pageSize: number }, now: string): Page<UrlPageItem> {
    const conditions = [];
    if (userId !== undefined) conditions.push(eq(urls.userId, userId));
    if (filter.search) {
      const pattern = `%${toLikePattern(filter.search)}%`;
      conditions.push(or(sql`${urls.code} LIKE ${pattern} ESCAPE '!'`, sql`${urls.targetUrl} LIKE ${pattern} ESCAPE '!'`, sql`${urls.description} LIKE ${pattern} ESCAPE '!'`)!);
    }
    if (filter.status === 'inactive') conditions.push(eq(urls.isActive, false));
    if (filter.status === 'expired') conditions.push(and(eq(urls.isActive, true), lte(urls.expiresAt, now))!);
    if (filter.status === 'active') conditions.push(and(eq(urls.isActive, true), or(isNull(urls.expiresAt), gt(urls.expiresAt, now)))!);
    const where = conditions.length ? and(...conditions) : undefined;
    const base = this.database.select({ code: urls.code, targetUrl: urls.targetUrl, description: urls.description, createdAt: urls.createdAt, expiresAt: urls.expiresAt, isActive: urls.isActive, clickCount: urls.clickCount }).from(urls);
    const items = (where ? base.where(where) : base).orderBy(desc(urls.createdAt)).limit(filter.pageSize).offset((filter.page - 1) * filter.pageSize).all();
    const counter = this.database.select({ value: count() }).from(urls);
    const total = (where ? counter.where(where) : counter).get()?.value ?? 0;
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
  getUserClickStats(userId: number, from: string, to: string): { totalClicks: number; points: ClickPoint[] } {
    const day = sql<string>`substr(${clickEvents.occurredAt}, 1, 10)`;
    const condition = and(eq(urls.userId, userId), gte(clickEvents.occurredAt, from), lte(clickEvents.occurredAt, to));
    const points = this.database.select({ date: day, clicks: count() }).from(clickEvents).innerJoin(urls, eq(clickEvents.urlId, urls.id)).where(condition).groupBy(day).orderBy(day).all();
    return { totalClicks: points.reduce((total, point) => total + point.clicks, 0), points };
  }
  codeExists(code: string): boolean { return Boolean(this.database.select({ id: urls.id }).from(urls).where(eq(urls.code, code)).get()); }
  createUrl(input: Omit<StoredUrl, 'id' | 'clickCount' | 'isActive'> & { userId: number }): void {
    this.database.insert(urls).values({ ...input, isActive: true, clickCount: 0 }).run();
  }
  findUrlByCode(code: string): StoredUrl | undefined { return this.database.select().from(urls).where(eq(urls.code, code)).get(); }
  setUrlActive(id: number, isActive: boolean): void { this.database.update(urls).set({ isActive }).where(eq(urls.id, id)).run(); }
  setUrlDescription(id: number, description: string): void { this.database.update(urls).set({ description }).where(eq(urls.id, id)).run(); }
  getClickStats(urlId: number, from: string, to: string): ClickPoint[] {
    const date = sql<string>`substr(${clickEvents.occurredAt}, 1, 10)`;
    return this.database.select({ date, clicks: count() }).from(clickEvents).where(and(eq(clickEvents.urlId, urlId), gte(clickEvents.occurredAt, from), lteTime(clickEvents.occurredAt, to))).groupBy(date).orderBy(date).all();
  }
  recordClick(code: string, now: string): string | undefined {
    return this.database.transaction((tx) => {
      const eligible = tx.select({ id: urls.id, targetUrl: urls.targetUrl }).from(urls).innerJoin(users, eq(urls.userId, users.id))
        .where(and(eq(urls.code, code), eq(urls.isActive, true), or(isNull(urls.expiresAt), gt(urls.expiresAt, now)), isNull(users.disabledAt))).get();
      if (!eligible) return undefined;
      tx.insert(clickEvents).values({ urlId: eligible.id, occurredAt: now }).run();
      tx.update(urls).set({ clickCount: sql`${urls.clickCount} + 1` }).where(eq(urls.id, eligible.id)).run();
      return eligible.targetUrl;
    });
  }
  checkHealth(): void { this.database.select({ value: sql<number>`1` }).from(users).limit(1).get(); }
}

function decryptAccountName<T extends { name: string }>(account: T): T {
  return { ...account, name: decryptUserName(account.name) };
}

function toLikePattern(value: string): string { return value.replace(/[!%_]/g, '!$&'); }

function lteTime(column: typeof clickEvents.occurredAt, to: string) { return sql`${column} <= ${to}`; }
