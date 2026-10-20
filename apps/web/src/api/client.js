import { t } from '../i18n/index.js'

const API_BASE = '/api'
const API_ERROR_KEYS = {
  CSRF_REJECTED: 'api.csrf', VALIDATION_ERROR: 'api.validation', EMAIL_EXISTS: 'api.emailExists',
  INVALID_CREDENTIALS: 'api.credentials', UNAUTHENTICATED: 'api.unauthenticated', FORBIDDEN: 'api.forbidden',
  CURRENT_PASSWORD_INVALID: 'api.currentPassword', CONFLICT: 'api.conflict', INVALID_RANGE: 'api.invalidRange',
  INVALID_URL: 'api.invalidUrl', INVALID_EXPIRATION: 'api.invalidExpiration', CODE_UNAVAILABLE: 'api.codeUnavailable',
  NOT_FOUND: 'api.notFound', INTERNAL_ERROR: 'api.internal', CODE_EXISTS: 'api.codeExists',
}

export class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request(path, init = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch {
    throw new HttpError(0, t('api.connection'))
  }
  if (!response.ok) {
    let message = t('api.generic')
    let code = 'REQUEST_FAILED'
    try {
      const body = await response.json()
      if (typeof body?.error?.code === 'string') code = body.error.code
      if (API_ERROR_KEYS[code]) message = t(API_ERROR_KEYS[code])
      else if (typeof body?.error?.message === 'string') message = body.error.message
    } catch { /* response may be empty */ }
    throw new HttpError(response.status, message, code)
  }
  if (response.status === 204) return undefined
  return response.json()
}

function queryString(params) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  return query.size ? `?${query}` : ''
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })

export const api = {
  me: () => request('/me'),
  updateName: (name) => request('/me/name', json('PATCH', { name })),
  login: (email, password) => request('/auth/login', json('POST', { email, password })),
  register: (email, password, name) => request('/auth/register', json('POST', { email, password, name })),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) => request('/me/password', json('PATCH', { currentPassword, newPassword })),
  links: (params = {}) => request(`/me/urls${queryString({ status: 'all', page: 1, pageSize: 10, ...params })}`),
  stats: (params = {}) => request(`/me/stats${queryString({ interval: 'day', ...params })}`),
  linkStats: (code, params = {}) => request(`/urls/${encodeURIComponent(code)}/stats${queryString({ interval: 'day', ...params })}`),
  createLink: (payload) => request('/urls', json('POST', payload)),
  setActive: (code, isActive) => request(`/urls/${encodeURIComponent(code)}`, json('PATCH', { isActive })),
  setDescription: (code, description) => request(`/urls/${encodeURIComponent(code)}`, json('PATCH', { description })),
  overview: () => request('/admin/overview'),
  adminLinks: (params = {}) => request(`/admin/urls${queryString({ status: 'all', page: 1, pageSize: 10, ...params })}`),
  setAdminLinkActive: (code, isActive) => request(`/admin/urls/${encodeURIComponent(code)}`, json('PATCH', { isActive })),
  deleteAdminLink: (code) => request(`/admin/urls/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  users: (params = {}) => request(`/admin/users${queryString({ status: 'all', role: 'all', page: 1, pageSize: 10, ...params })}`),
  setUserDisabled: (id, isDisabled) => request(`/admin/users/${encodeURIComponent(id)}`, json('PATCH', { isDisabled })),
  setUserRole: (id, role) => request(`/admin/users/${encodeURIComponent(id)}`, json('PATCH', { role })),
}
