import { describe, expect, it, vi } from 'vitest'
import { DomainError, PlatformService } from '../../src/modules/platform/service.js'
import type { Account, PlatformRepository, StoredAccount, StoredUrl, UrlView } from '../../src/modules/platform/repository.js'

const NOW = new Date('2026-10-20T12:00:00.000Z')
const owner: Account = { id: 7, email: 'owner@example.com', role: 'user', disabledAt: null }
const storedUrl: StoredUrl = {
  id: 12,
  code: 'abc123',
  targetUrl: 'https://example.com',
  description: '',
  createdAt: '2026-10-19T12:00:00.000Z',
  expiresAt: null,
  isActive: true,
  clickCount: 4,
  userId: owner.id,
}

function createRepository(overrides: Partial<PlatformRepository> = {}): PlatformRepository {
  const defaults: PlatformRepository = {
    createUser: vi.fn(() => owner),
    findUserByEmail: vi.fn((): StoredAccount | undefined => undefined),
    createSession: vi.fn(),
    findAuthenticatedAccount: vi.fn(() => owner),
    revokeSession: vi.fn(),
    listUserUrls: vi.fn((): UrlView[] => []),
    listUrls: vi.fn(() => ({ items: [], total: 0, page: 1, pageSize: 10 })),
    getUserClickStats: vi.fn(() => ({ totalClicks: 3, points: [{ date: '2026-10-20', clicks: 3 }] })),
    codeExists: vi.fn(() => false),
    createUrl: vi.fn(),
    findUrlByCode: vi.fn(() => storedUrl),
    setUrlActive: vi.fn(),
    setUrlDescription: vi.fn(),
    getClickStats: vi.fn(() => []),
    getAdminOverview: vi.fn(() => ({ usersCount: 1, linksCount: 1, clicksCount: 4 })),
    listAdminUsers: vi.fn(() => []),
    searchAdminUsers: vi.fn(() => ({ items: [], total: 0, page: 1, pageSize: 10 })),
    recordClick: vi.fn(() => undefined),
    checkHealth: vi.fn(),
  }
  return { ...defaults, ...overrides }
}

function captureError(action: () => void): unknown {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error('Expected the action to throw')
}

describe('PlatformService', () => {
  it('accepts only HTTP and HTTPS destinations', () => {
    const service = new PlatformService(createRepository(), () => NOW)

    const error = captureError(() => service.createUrl({ url: 'ftp://example.com/file' }, owner.id))
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ status: 400, code: 'INVALID_URL' })
  })

  it('rejects an expiration that is not in the future', () => {
    const service = new PlatformService(createRepository(), () => NOW)

    const error = captureError(() => service.createUrl({ url: 'https://example.com', expiresAt: NOW.toISOString() }, owner.id))
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ status: 400, code: 'INVALID_EXPIRATION' })
  })

  it('stores a valid custom code and returns the created link view', () => {
    const repository = createRepository()
    const service = new PlatformService(repository, () => NOW)

    const result = service.createUrl({ url: 'https://example.com/path', customCode: 'custom1' }, owner.id)

    expect(repository.createUrl).toHaveBeenCalledWith({
      code: 'custom1',
      targetUrl: 'https://example.com/path',
      description: '',
      createdAt: NOW.toISOString(),
      expiresAt: null,
      userId: owner.id,
    })
    expect(result).toMatchObject({ code: 'custom1', targetUrl: 'https://example.com/path', description: '', isActive: true, clickCount: 0 })
  })

  it('stores a free-text description up to 200 characters', () => {
    const repository = createRepository()
    const service = new PlatformService(repository, () => NOW)
    const description = 'a'.repeat(200)

    const result = service.createUrl({ url: 'https://example.com', description }, owner.id)

    expect(repository.createUrl).toHaveBeenCalledWith(expect.objectContaining({ description }))
    expect(result.description).toBe(description)
  })

  it('rejects descriptions longer than the supported limit', () => {
    const service = new PlatformService(createRepository(), () => NOW)

    const error = captureError(() => service.createUrl({ url: 'https://example.com', description: 'a'.repeat(201) }, owner.id))

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
  })

  it('updates a description only for the link owner', () => {
    const repository = createRepository()
    const service = new PlatformService(repository, () => NOW)

    const result = service.setUrlDescription(storedUrl.code, 'New description', owner)

    expect(repository.setUrlDescription).toHaveBeenCalledWith(storedUrl.id, 'New description')
    expect(result.description).toBe('New description')
  })

  it('does not allow a user to read another owner’s link', () => {
    const repository = createRepository({ findUrlByCode: vi.fn(() => ({ ...storedUrl, userId: 99 })) })
    const service = new PlatformService(repository, () => NOW)

    const error = captureError(() => service.getUrl(storedUrl.code, owner))
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('rejects a statistics range where the start follows the end', () => {
    const service = new PlatformService(createRepository(), () => NOW)

    const error = captureError(() => service.getStats(storedUrl.code, owner, '2026-10-20T13:00:00.000Z', '2026-10-20T12:00:00.000Z'))
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ status: 400, code: 'INVALID_RANGE' })
  })
  it('queries aggregate user statistics using the authenticated owner id', () => {
    const repository = createRepository()
    const service = new PlatformService(repository, () => NOW)
    expect(service.getUserStats(owner.id)).toEqual({ totalClicks: 3, interval: 'day', points: [{ date: '2026-10-20', clicks: 3 }] })
    expect(repository.getUserClickStats).toHaveBeenCalledWith(owner.id, '1970-01-01T00:00:00.000Z', NOW.toISOString())
  })
})
