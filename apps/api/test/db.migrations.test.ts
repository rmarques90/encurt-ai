import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/index.js';

process.env.DATA_ENCRYPTION_KEY ??= 'a'.repeat(64);
const connections: Database.Database[] = [];
afterEach(() => connections.splice(0).forEach((database) => database.close()));

describe('SQLite versioned migrations', () => {
  it('preserves audit rows while upgrading the legacy audit_logs constraint', () => {
    const database = new Database(':memory:');
    connections.push(database);
    database.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        disabled_at TEXT
      );
      INSERT INTO users (id, email, password_hash, created_at) VALUES (1, 'admin@example.com', 'hash', '2026-01-01T00:00:00.000Z');
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY,
        actor_user_id INTEGER NOT NULL REFERENCES users(id),
        action TEXT NOT NULL CHECK(action IN ('ACCOUNT_DISABLED','ACCOUNT_REACTIVATED')),
        target_user_id INTEGER NOT NULL REFERENCES users(id),
        occurred_at TEXT NOT NULL,
        metadata TEXT NOT NULL
      );
      INSERT INTO audit_logs (id, actor_user_id, action, target_user_id, occurred_at, metadata)
        VALUES (7, 1, 'ACCOUNT_DISABLED', 1, '2026-01-02T00:00:00.000Z', '{}');
    `);

    createDatabase(database);

    expect(database.prepare('SELECT id, action, target_user_id AS targetUserId FROM audit_logs').all())
      .toEqual([{ id: 7, action: 'ACCOUNT_DISABLED', targetUserId: 1 }]);
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
    expect(database.prepare('SELECT name FROM users WHERE id = 1').get()).toMatchObject({ name: expect.stringMatching(/^enc-v1:/) });
    expect(database.prepare("SELECT sql FROM sqlite_master WHERE name = 'audit_logs'").get())
      .toMatchObject({ sql: expect.stringContaining('LINK_REMOVED') });
  });

  it('does not reapply migrations to an already migrated database', () => {
    const database = new Database(':memory:');
    connections.push(database);
    createDatabase(database);
    createDatabase(database);

    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }]);
    expect(database.prepare("SELECT sql FROM sqlite_master WHERE name = 'urls'").get())
      .toMatchObject({ sql: expect.stringContaining('description') });
  });
});
