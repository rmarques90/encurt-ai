import type { AccountStatus, AdminOverview, AdminRepository, AdminUserFilter, AdminUserPage } from './repository.js';

export interface Clock { now(): Date }
const systemClock: Clock = { now: () => new Date() };

export class AdminService {
  constructor(private readonly repository: AdminRepository, private readonly clock: Clock = systemClock) {}

  getOverview(): AdminOverview { return this.repository.getOverview(); }
  listUsers(filter: AdminUserFilter): AdminUserPage { return this.repository.listUsers(filter); }

  setAccountDisabled(targetId: number, actorId: number, isDisabled: boolean): AccountStatus | undefined {
    return this.repository.updateAccountStatus(targetId, actorId, isDisabled, this.clock.now().toISOString());
  }
  setUserRole(targetId: number, actorId: number, role: 'user' | 'admin'): AccountStatus | undefined { return this.repository.updateUserRole(targetId, actorId, role, this.clock.now().toISOString()); }
  setLinkActive(code: string, actorId: number, isActive: boolean): boolean { return this.repository.updateLink(code, actorId, isActive, this.clock.now().toISOString()); }
  removeLink(code: string, actorId: number): boolean { return this.repository.removeLink(code, actorId, this.clock.now().toISOString()); }
}
