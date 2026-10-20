import { and, count, desc, eq, isNull, or, sql, sum } from 'drizzle-orm';
import type { AppDatabase } from '../../db/index.js';
import { auditLogs, sessions, urls, users } from '../../db/schema.js';

export type AccountStatus = { id: number; email: string; role: 'user' | 'admin'; createdAt: string; disabledAt: string | null };
export type AccountAuditAction = 'ACCOUNT_DISABLED' | 'ACCOUNT_REACTIVATED' | 'USER_PROMOTED' | 'USER_DEMOTED';
export type AdminMutationAction = AccountAuditAction | 'LINK_ACTIVATED' | 'LINK_DEACTIVATED' | 'LINK_REMOVED';
export type AdminUser = { id: number; email: string; role: 'user' | 'admin'; createdAt: string; disabledAt: string | null };
export type AdminOverview = { usersCount: number; linksCount: number; clicksCount: number };
export type AdminUserFilter = { search: string; status: 'all' | 'active' | 'disabled'; role: 'all' | 'user' | 'admin'; page: number; pageSize: number };
export type AdminUserPage = { items: AdminUser[]; total: number; page: number; pageSize: number };

export interface AdminRepository {
  getOverview(): AdminOverview;
  listUsers(filter: AdminUserFilter): AdminUserPage;
  updateAccountStatus(targetId: number, actorId: number, isDisabled: boolean, occurredAt: string): AccountStatus | undefined;
  updateUserRole(targetId: number, actorId: number, role: 'user' | 'admin', occurredAt: string): AccountStatus | undefined;
  updateLink(code: string, actorId: number, isActive: boolean, occurredAt: string): boolean;
  removeLink(code: string, actorId: number, occurredAt: string): boolean;
}

export class DrizzleAdminRepository implements AdminRepository {
  constructor(private readonly database: AppDatabase) {}

  getOverview(): AdminOverview {
    const usersCount = this.database.select({ value: count() }).from(users).get()?.value ?? 0;
    const linksCount = this.database.select({ value: count() }).from(urls).get()?.value ?? 0;
    const clicksCount = this.database.select({ value: sum(urls.clickCount) }).from(urls).get()?.value ?? 0;
    return { usersCount, linksCount, clicksCount: Number(clicksCount) };
  }
  listUsers(filter: AdminUserFilter): AdminUserPage {
    const conditions = [];
    if (filter.search) {
      const pattern = `%${toLikePattern(filter.search)}%`;
      conditions.push(or(sql`${users.email} LIKE ${pattern} ESCAPE '!'`, sql`cast(${users.id} as text) LIKE ${pattern} ESCAPE '!'`)!);
    }
    if (filter.status === 'active') conditions.push(isNull(users.disabledAt));
    if (filter.status === 'disabled') conditions.push(sql`${users.disabledAt} IS NOT NULL`);
    if (filter.role !== 'all') conditions.push(eq(users.role, filter.role));
    const where = conditions.length ? and(...conditions) : undefined;
    const query = this.database.select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt, disabledAt: users.disabledAt }).from(users);
    const items = (where ? query.where(where) : query).orderBy(desc(users.id)).limit(filter.pageSize).offset((filter.page - 1) * filter.pageSize).all();
    const counter = this.database.select({ value: count() }).from(users);
    const total = (where ? counter.where(where) : counter).get()?.value ?? 0;
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }

  updateAccountStatus(targetId: number, actorId: number, isDisabled: boolean, occurredAt: string): AccountStatus | undefined {
    return this.database.transaction((tx) => {
      const target = tx.select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt, disabledAt: users.disabledAt })
        .from(users).where(eq(users.id, targetId)).get();
      if (!target) return undefined;
      const action: AccountAuditAction = isDisabled ? 'ACCOUNT_DISABLED' : 'ACCOUNT_REACTIVATED';
      tx.update(users).set({ disabledAt: isDisabled ? occurredAt : null }).where(eq(users.id, targetId)).run();
      if (isDisabled) {
        tx.update(sessions).set({ revokedAt: occurredAt }).where(and(eq(sessions.userId, targetId), isNull(sessions.revokedAt))).run();
        tx.update(urls).set({ isActive: false }).where(eq(urls.userId, targetId)).run();
      }
      tx.insert(auditLogs).values({ actorUserId: actorId, action, targetUserId: targetId, occurredAt, metadata: '{}' }).run();
      return { ...target, disabledAt: isDisabled ? occurredAt : null };
    });
  }
  updateUserRole(targetId: number, actorId: number, role: 'user' | 'admin', occurredAt: string): AccountStatus | undefined {
    return this.database.transaction((tx) => {
      const target = tx.select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt, disabledAt: users.disabledAt }).from(users).where(eq(users.id, targetId)).get();
      if (!target) return undefined;
      const action: AdminMutationAction = role === 'admin' ? 'USER_PROMOTED' : 'USER_DEMOTED';
      tx.update(users).set({ role }).where(eq(users.id, targetId)).run();
      tx.insert(auditLogs).values({ actorUserId: actorId, action, targetUserId: targetId, occurredAt, metadata: JSON.stringify({ role }) }).run();
      return { ...target, role };
    });
  }
  updateLink(code: string, actorId: number, isActive: boolean, occurredAt: string): boolean {
    return this.database.transaction((tx) => {
      const target = tx.select({ id: urls.id }).from(urls).where(eq(urls.code, code)).get();
      if (!target) return false;
      const action: AdminMutationAction = isActive ? 'LINK_ACTIVATED' : 'LINK_DEACTIVATED';
      tx.update(urls).set({ isActive }).where(eq(urls.id, target.id)).run();
      tx.insert(auditLogs).values({ actorUserId: actorId, action, targetUserId: null, occurredAt, metadata: JSON.stringify({ id: target.id, code }) }).run();
      return true;
    });
  }
  removeLink(code: string, actorId: number, occurredAt: string): boolean {
    return this.database.transaction((tx) => {
      const target = tx.select({ id: urls.id }).from(urls).where(eq(urls.code, code)).get();
      if (!target) return false;
      tx.insert(auditLogs).values({ actorUserId: actorId, action: 'LINK_REMOVED', targetUserId: null, occurredAt, metadata: JSON.stringify({ id: target.id, code }) }).run();
      tx.delete(urls).where(eq(urls.id, target.id)).run();
      return true;
    });
  }
}

function toLikePattern(value: string): string { return value.replace(/[!%_]/g, '!$&'); }
