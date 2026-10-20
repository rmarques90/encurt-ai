import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { loadEnvFile } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DEV_WEB_BASE_URL } from '../constants.js';

const projectEnvFile = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env');
if (existsSync(projectEnvFile)) loadEnvFile(projectEnvFile);

export type DatabaseClient = 'sqlite' | 'postgres';

export type DatabaseConfig =
  | { client: 'sqlite'; sqliteFile: string }
  | { client: 'postgres'; databaseUrl: string };

const IPV4_PREFIX_BITS = 32;
const IPV6_PREFIX_BITS = 128;

export function readTrustedProxyAddresses(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.TRUSTED_PROXY_IPS?.trim();
  if (!configured) return [];

  return configured.split(',').map((entry) => {
    const address = entry.trim();
    const parts = address.split('/');
    if (parts.length > 2) throw new Error('TRUSTED_PROXY_IPS deve conter IPs ou CIDRs válidos');
    const version = isIP(parts[0]!);
    const maximumPrefix = version === 4 ? IPV4_PREFIX_BITS : version === 6 ? IPV6_PREFIX_BITS : 0;
    if (!maximumPrefix) throw new Error('TRUSTED_PROXY_IPS deve conter IPs ou CIDRs válidos');

    if (parts.length === 2) {
      const prefix = parts[1]!;
      if (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > maximumPrefix) {
        throw new Error('TRUSTED_PROXY_IPS deve conter IPs ou CIDRs válidos');
      }
    }
    return address;
  });
}

export function readWebBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const configured = env.WEB_BASE_URL?.trim();
  if (!configured) return env.NODE_ENV === 'production' ? undefined : DEFAULT_DEV_WEB_BASE_URL;

  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error('WEB_BASE_URL deve ser uma origem HTTP ou HTTPS válida');
  }
}

export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const client = env.DB_CLIENT ?? 'sqlite';
  if (client !== 'sqlite' && client !== 'postgres') {
    throw new Error('DB_CLIENT deve ser sqlite ou postgres');
  }
  if (client === 'sqlite') {
    return { client, sqliteFile: env.SQLITE_FILE ?? './data/encurt-ai.sqlite' };
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória quando DB_CLIENT=postgres');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL inválida para DB_CLIENT=postgres');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('DATABASE_URL inválida para DB_CLIENT=postgres');
  }
  return { client, databaseUrl };
}
