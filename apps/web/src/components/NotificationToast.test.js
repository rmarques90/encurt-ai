import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import NotificationToast from './NotificationToast.vue'
import { dismissNotification, notify } from '../composables/useNotifications.js'

describe('NotificationToast', () => {
  beforeEach(() => dismissNotification())

  it('announces success and error messages and can be dismissed', async () => {
    const wrapper = mount(NotificationToast)
    notify('Descrição salva.')
    await nextTick()
    expect(wrapper.get('[role="status"]').text()).toContain('Descrição salva.')

    notify('Falha ao salvar.', 'error')
    await nextTick()
    expect(wrapper.get('[role="alert"]').text()).toContain('Falha ao salvar.')
    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(wrapper.find('.toast-notice').exists()).toBe(false)
  })
})
