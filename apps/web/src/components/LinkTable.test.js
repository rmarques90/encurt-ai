import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LinkTable from './LinkTable.vue'
const sample = { code: 'Ab12cd', shortUrl: 'https://encurt.ai/Ab12cd', targetUrl: 'https://example.com/path?secret=value', description: 'Campanha de lançamento', expiresAt: null, isActive: true, clickCount: 23 }
describe('LinkTable', () => {
  it('shows counts and status while hiding target query strings', () => {
    const wrapper = mount(LinkTable, { props: { links: [sample] } })
    expect(wrapper.text()).toContain('23'); expect(wrapper.text()).toContain('Ativo'); expect(wrapper.text()).toContain('example.com/path'); expect(wrapper.text()).toContain('Campanha de lançamento'); expect(wrapper.text()).not.toContain('secret'); expect(wrapper.text()).toContain('Cliques'); expect(wrapper.text()).not.toContain('CLIQUES')
  })
  it('shows copy feedback for the copied link', () => {
    const wrapper = mount(LinkTable, { props: { links: [sample], copiedLink: sample.shortUrl } })
    expect(document.body.querySelector('[role="status"]').textContent).toBe('Copiado!')
  })
  it('emits status and statistics actions', async () => {
    const wrapper = mount(LinkTable, { props: { links: [{ ...sample, isActive: false }] } })
    await wrapper.get('[aria-label="Ativar link"]').trigger('click'); await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('toggle')?.[0]).toEqual([{ ...sample, isActive: false }]); expect(wrapper.emitted('copy')).toBeTruthy()
  })
  it('emits chart action and prevents expired links from being toggled', async () => {
    const wrapper = mount(LinkTable, { props: { links: [{ ...sample, expiresAt: '2000-01-01T00:00:00Z' }] } })
    expect(wrapper.text()).toContain('Expirado'); expect(wrapper.find('[aria-label="Ativar link"]').exists()).toBe(false)
    await wrapper.findAll('button')[1].trigger('click'); expect(wrapper.emitted('stats')?.[0][0].code).toBe('Ab12cd')
  })
  it('keeps inactive status when the link is also expired', () => {
    const wrapper = mount(LinkTable, { props: { links: [{ ...sample, isActive: false, expiresAt: '2000-01-01T00:00:00Z' }] } })
    expect(wrapper.text()).toContain('Inativo')
    expect(wrapper.text()).not.toContain('Expirado')
    expect(wrapper.get('.badge').classes()).toContain('inactive')
  })
})
