import { describe, expect, it, vi } from 'vitest'
import { AdminService, type Clock } from '../../src/modules/admin/service.js'
import type { AccountStatus, AdminRepository } from '../../src/modules/admin/repository.js'

describe('AdminService', () => {
  it('uses the injected clock when changing account status', () => {
    const occurredAt = '2026-10-20T12:00:00.000Z'
    const clock: Clock = { now: () => new Date(occurredAt) }
    const status: AccountStatus = {
      id: 9,
      email: 'member@example.com',
      role: 'user',
      createdAt: '2026-10-01T12:00:00.000Z',
      disabledAt: occurredAt,
    }
    const repository: AdminRepository = {
      getOverview: vi.fn(() => ({ usersCount: 1, linksCount: 2, clicksCount: 3 })), listUsers: vi.fn(() => ({ items: [], total: 0, page: 1, pageSize: 10 })),
      updateAccountStatus: vi.fn(() => status),
    }
    const service = new AdminService(repository, clock)

    const result = service.setAccountDisabled(status.id, 2, true)

    expect(repository.updateAccountStatus).toHaveBeenCalledWith(status.id, 2, true, occurredAt)
    expect(result).toEqual(status)
  })
  it('routes role changes through the repository with the injected time', () => {
    const repository: AdminRepository = {
      getOverview: vi.fn(() => ({ usersCount: 0, linksCount: 0, clicksCount: 0 })), listUsers: vi.fn(() => ({ items: [], total: 0, page: 1, pageSize: 10 })),
      updateAccountStatus: vi.fn(), updateUserRole: vi.fn(() => undefined), updateLink: vi.fn(() => true), removeLink: vi.fn(() => true),
    }
    const service = new AdminService(repository, { now: () => new Date('2026-10-20T12:00:00.000Z') })
    service.setUserRole(4, 2, 'admin')
    expect(repository.updateUserRole).toHaveBeenCalledWith(4, 2, 'admin', '2026-10-20T12:00:00.000Z')
  })
  it('routes link state and removal operations through the repository', () => {
    const repository: AdminRepository = {
      getOverview: vi.fn(() => ({ usersCount: 0, linksCount: 0, clicksCount: 0 })), listUsers: vi.fn(() => ({ items: [], total: 0, page: 1, pageSize: 10 })),
      updateAccountStatus: vi.fn(), updateUserRole: vi.fn(), updateLink: vi.fn(() => true), removeLink: vi.fn(() => true),
    }
    const service = new AdminService(repository, { now: () => new Date('2026-10-20T12:00:00.000Z') })
    expect(service.setLinkActive('Abc123', 2, false)).toBe(true)
    expect(service.removeLink('Abc123', 2)).toBe(true)
    expect(repository.updateLink).toHaveBeenCalledWith('Abc123', 2, false, '2026-10-20T12:00:00.000Z')
    expect(repository.removeLink).toHaveBeenCalledWith('Abc123', 2, '2026-10-20T12:00:00.000Z')
  })
  it('delegates overview and paginated user reads to the admin repository', () => {
    const page = { items: [], total: 0, page: 2, pageSize: 10 }
    const repository: AdminRepository = {
      getOverview: vi.fn(() => ({ usersCount: 1, linksCount: 2, clicksCount: 3 })), listUsers: vi.fn(() => page),
      updateAccountStatus: vi.fn(), updateUserRole: vi.fn(), updateLink: vi.fn(), removeLink: vi.fn(),
    }
    const service = new AdminService(repository)
    expect(service.getOverview()).toEqual({ usersCount: 1, linksCount: 2, clicksCount: 3 })
    expect(service.listUsers({ search: 'member', status: 'active', role: 'user', page: 2, pageSize: 10 })).toBe(page)
    expect(repository.listUsers).toHaveBeenCalledWith({ search: 'member', status: 'active', role: 'user', page: 2, pageSize: 10 })
  })
})
