import { beforeEach, describe, expect, it } from 'vitest'
import { locale, setLocale, t } from './index.js'

describe('locale selection', () => {
  beforeEach(() => {
    localStorage.clear()
    setLocale('pt-BR')
  })

  it('changes the translated text and persists the selected language', () => {
    setLocale('en')

    expect(locale.value).toBe('en')
    expect(t('nav.login')).toBe('Sign in')
    expect(localStorage.getItem('encurt-ai-locale')).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('ignores unsupported languages', () => {
    setLocale('fr')

    expect(locale.value).toBe('pt-BR')
    expect(t('nav.login')).toBe('Entrar')
  })
})
