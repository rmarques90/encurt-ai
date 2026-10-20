import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AuthView from './AuthView.vue'

describe('AuthView password policy', () => {
  it('requires a 12 character password and new-password autocomplete during registration', () => {
    const wrapper = mount(AuthView, { props: { mode: 'register' }, global: { stubs: { RouterLink: true } } })
    const password = wrapper.get('#password')
    expect(wrapper.get('#name').attributes('autocomplete')).toBe('name')
    expect(password.attributes('minlength')).toBe('12')
    expect(password.attributes('autocomplete')).toBe('new-password')
  })

  it('keeps login autocomplete and does not impose registration minlength', () => {
    const wrapper = mount(AuthView, { props: { mode: 'login' }, global: { stubs: { RouterLink: true } } })
    expect(wrapper.find('#name').exists()).toBe(false)
    const password = wrapper.get('#password')
    expect(password.attributes('autocomplete')).toBe('current-password')
    expect(password.attributes('minlength')).toBeUndefined()
  })
})
