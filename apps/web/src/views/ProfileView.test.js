import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileView from './ProfileView.vue'

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  updateName: vi.fn(),
}))
vi.mock('../api/client.js', () => ({ api: { changePassword: mocks.changePassword, updateName: mocks.updateName } }))
vi.mock('../composables/useSession.js', async () => {
  const { ref } = await import('vue')
  const user = ref({ id: 1, name: 'Ana Silva', email: 'ana@example.com', role: 'user' })
  return { useSession: () => ({ user }) }
})

describe('ProfileView', () => {
  beforeEach(() => { mocks.changePassword.mockReset(); mocks.updateName.mockReset() })

  it('shows the account name and avatar initial', () => {
    const wrapper = mount(ProfileView)
    expect(wrapper.text()).toContain('Ana Silva')
    expect(wrapper.find('.profile-avatar-large').text()).toBe('A')
    expect(wrapper.find('#current-password').exists()).toBe(true)
  })

  it('does not submit when the new password confirmation differs', async () => {
    const wrapper = mount(ProfileView)
    await wrapper.get('#current-password').setValue('current-password')
    await wrapper.get('#new-password').setValue('new-password-123')
    await wrapper.get('#confirm-password').setValue('different-password')
    await wrapper.get('#password-change-form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('não conferem')
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('updates the account name and shows a success message', async () => {
    const wrapper = mount(ProfileView)
    mocks.updateName.mockResolvedValue({ id: 1, name: 'Ana Souza', email: 'ana@example.com', role: 'user' })
    await wrapper.get('#profile-name-input').setValue('Ana Souza')
    await wrapper.get('#profile-name-form').trigger('submit')
    await flushPromises()
    expect(mocks.updateName).toHaveBeenCalledWith('Ana Souza')
    expect(wrapper.text()).toContain('Ana Souza')
    expect(wrapper.find('[role="status"]').text()).toContain('atualizado com sucesso')
  })
})
