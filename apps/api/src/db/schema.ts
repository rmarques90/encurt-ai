import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<'user' | 'admin'>().notNull().default('user'),
  createdAt: text('created_at').notNull(),
  disabledAt: text('disabled_at'),
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  revokedAt: text('revoked_at'),
});

export const urls = sqliteTable('urls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  targetUrl: text('target_url').notNull(),
  description: text('description').notNull().default(''),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  clickCount: integer('click_count').notNull().default(0),
  userId: integer('user_id').notNull().references(() => users.id),
}, (table) => ({ codeLength: check('urls_code_length_check', sql`length(${table.code}) BETWEEN 6 AND 12`) }));

export const clickEvents = sqliteTable('click_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  urlId: integer('url_id').notNull().references(() => urls.id, { onDelete: 'cascade' }),
  occurredAt: text('occurred_at').notNull(),
}, (table) => ({ urlTimeIndex: index('click_events_url_time_idx').on(table.urlId, table.occurredAt) }));

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorUserId: integer('actor_user_id').notNull().references(() => users.id),
  action: text('action').$type<'ACCOUNT_DISABLED' | 'ACCOUNT_REACTIVATED' | 'USER_PROMOTED' | 'USER_DEMOTED' | 'LINK_ACTIVATED' | 'LINK_DEACTIVATED' | 'LINK_REMOVED'>().notNull(),
  targetUserId: integer('target_user_id').references(() => users.id),
  occurredAt: text('occurred_at').notNull(),
  metadata: text('metadata').notNull(),
});
