import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { readDatabaseConfig } from '../config/env.js';
import { encryptUserName, getDataEncryptionKey, isUserNameEncrypted } from '../security/field-encryption.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export function createDatabase(connection: Database.Database): AppDatabase {
  getDataEncryptionKey();
  runSqliteMigrations(connection);
  return drizzle(connection, { schema });
}

export function runSqliteMigrations(connection: Database.Database): void {
  connection.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const initialMigration = connection.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(1);
  if (!initialMigration) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')), created_at TEXT NOT NULL, disabled_at TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, revoked_at TEXT);
    CREATE TABLE IF NOT EXISTS urls (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE CHECK(length(code) BETWEEN 6 AND 12), target_url TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, is_active INTEGER NOT NULL DEFAULT 1, click_count INTEGER NOT NULL DEFAULT 0, user_id INTEGER NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS click_events (id INTEGER PRIMARY KEY, url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE, occurred_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS click_events_url_time_idx ON click_events(url_id, occurred_at);
    CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, actor_user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL CHECK(action IN ('ACCOUNT_DISABLED','ACCOUNT_REACTIVATED','USER_PROMOTED','USER_DEMOTED','LINK_ACTIVATED','LINK_DEACTIVATED','LINK_REMOVED')), target_user_id INTEGER REFERENCES users(id), occurred_at TEXT NOT NULL, metadata TEXT NOT NULL);
  `);
    connection.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString());
  }
  const auditDefinition = connection.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'").get() as { sql: string } | undefined;
  const auditMigration = connection.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(2);
  if (!auditMigration && auditDefinition && !auditDefinition.sql.includes('USER_PROMOTED')) {
    connection.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
      CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, actor_user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL CHECK(action IN ('ACCOUNT_DISABLED','ACCOUNT_REACTIVATED','USER_PROMOTED','USER_DEMOTED','LINK_ACTIVATED','LINK_DEACTIVATED','LINK_REMOVED')), target_user_id INTEGER REFERENCES users(id), occurred_at TEXT NOT NULL, metadata TEXT NOT NULL);
      INSERT INTO audit_logs (id, actor_user_id, action, target_user_id, occurred_at, metadata) SELECT id, actor_user_id, action, target_user_id, occurred_at, metadata FROM audit_logs_legacy;
      DROP TABLE audit_logs_legacy;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  if (!auditMigration) connection.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(2, new Date().toISOString());
  const profileMigration = connection.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(3);
  if (!profileMigration) {
    connection.exec(`ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''`);
    connection.exec(`UPDATE users SET name = substr(email, 1, instr(email, '@') - 1) WHERE name = ''`);
    connection.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(3, new Date().toISOString());
  }
  const encryptedNamesMigration = connection.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(4);
  if (!encryptedNamesMigration) {
    const key = getDataEncryptionKey();
    const rows = connection.prepare('SELECT id, name FROM users').all() as { id: number; name: string }[];
    const updateName = connection.prepare('UPDATE users SET name = ? WHERE id = ?');
    connection.transaction(() => {
      for (const row of rows) {
        if (!isUserNameEncrypted(row.name)) updateName.run(encryptUserName(row.name, key), row.id);
      }
      connection.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(4, new Date().toISOString());
    }).immediate();
  }
  const linkDescriptionMigration = connection.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(5);
  if (!linkDescriptionMigration) {
    connection.exec("ALTER TABLE urls ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    connection.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(5, new Date().toISOString());
  }
}

export function getSqliteFile(): string {
  const config = readDatabaseConfig();
  if (config.client !== 'sqlite') throw new Error('Adaptador PostgreSQL indisponível neste build da API');
  return config.sqliteFile;
}
