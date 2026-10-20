import { describe, expect, it } from 'vitest';
import { readDatabaseConfig, readTrustedProxyAddresses, readWebBaseUrl } from '../../src/config/env.js';

describe('readDatabaseConfig', () => {
  it('defaults to the existing SQLite file', () => {
    expect(readDatabaseConfig({})).toEqual({ client: 'sqlite', sqliteFile: './data/encurt-ai.sqlite' });
  });

  it('requires a valid PostgreSQL connection URL without including its value in errors', () => {
    expect(() => readDatabaseConfig({ DB_CLIENT: 'postgres' })).toThrow('DATABASE_URL é obrigatória');
    expect(() => readDatabaseConfig({ DB_CLIENT: 'postgres', DATABASE_URL: 'sqlite://private' })).toThrow('DATABASE_URL inválida');
    expect(readDatabaseConfig({ DB_CLIENT: 'postgres', DATABASE_URL: 'postgresql://user:secret@localhost:5432/app' }))
      .toEqual({ client: 'postgres', databaseUrl: 'postgresql://user:secret@localhost:5432/app' });
  });

  it('rejects unknown database clients', () => {
    expect(() => readDatabaseConfig({ DB_CLIENT: 'mysql' })).toThrow('DB_CLIENT deve ser sqlite ou postgres');
  });
});

describe('readTrustedProxyAddresses', () => {
  it('does not trust proxies unless explicit addresses are configured', () => {
    expect(readTrustedProxyAddresses({})).toEqual([]);
    expect(readTrustedProxyAddresses({ TRUSTED_PROXY_IPS: '  ' })).toEqual([]);
  });

  it('accepts explicit IPv4, IPv6, and CIDR entries', () => {
    expect(readTrustedProxyAddresses({ TRUSTED_PROXY_IPS: '127.0.0.1, 10.20.0.0/16, ::1, 2001:db8::/48' }))
      .toEqual(['127.0.0.1', '10.20.0.0/16', '::1', '2001:db8::/48']);
  });

  it('rejects wildcards, hostnames, malformed addresses, and unrestricted CIDRs', () => {
    for (const value of ['*', 'proxy.internal', '127.0.0.1/33', '::1/129', '0.0.0.0/0', '127.0.0.1,,::1']) {
      expect(() => readTrustedProxyAddresses({ TRUSTED_PROXY_IPS: value })).toThrow('TRUSTED_PROXY_IPS');
    }
  });
});

describe('readWebBaseUrl', () => {
  it('uses the local web dev server outside production', () => {
    expect(readWebBaseUrl({})).toBe('http://localhost:5173');
    expect(readWebBaseUrl({ NODE_ENV: 'production' })).toBeUndefined();
  });

  it('accepts only an HTTP or HTTPS origin', () => {
    expect(readWebBaseUrl({ WEB_BASE_URL: 'https://app.example.com/' })).toBe('https://app.example.com');
    expect(() => readWebBaseUrl({ WEB_BASE_URL: 'javascript:alert(1)' })).toThrow('WEB_BASE_URL');
    expect(() => readWebBaseUrl({ WEB_BASE_URL: 'https://user:pass@app.example.com' })).toThrow('WEB_BASE_URL');
    expect(() => readWebBaseUrl({ WEB_BASE_URL: 'https://app.example.com/path' })).toThrow('WEB_BASE_URL');
  });
});
