import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorView from './ErrorView.vue'

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  historyState: { back: null },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push, options: { history: { state: mocks.historyState } } }),
}))

describe('ErrorView', () => {
  beforeEach(() => {
    mocks.back.mockReset()
    mocks.push.mockReset()
    mocks.historyState.back = null
  })

  it.each([
    [403, 'Acesso não permitido'],
    [404, 'Página não encontrada'],
    [500, 'Algo deu errado'],
  ])('renders status %s using the shared error page structure', (status, title) => {
    const wrapper = mount(ErrorView, { props: { status }, global: { stubs: { RouterLink: true } } })

    expect(wrapper.find('.error-card').exists()).toBe(true)
    expect(wrapper.find('.error-code').text()).toBe(String(status))
    expect(wrapper.get('#error-title').text()).toBe(title)
    expect(wrapper.findAll('.error-actions .button')).toHaveLength(2)
  })

  it('returns to the previous in-app page when available', async () => {
    mocks.historyState.back = '/dashboard'
    const wrapper = mount(ErrorView, { props: { status: 403 }, global: { stubs: { RouterLink: true } } })

    await wrapper.get('.error-actions button').trigger('click')

    expect(mocks.back).toHaveBeenCalledOnce()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('falls back to home when there is no previous in-app page', async () => {
    const wrapper = mount(ErrorView, { props: { status: 404 }, global: { stubs: { RouterLink: true } } })

    await wrapper.get('.error-actions button').trigger('click')

    expect(mocks.push).toHaveBeenCalledWith('/')
    expect(mocks.back).not.toHaveBeenCalled()
  })
})
