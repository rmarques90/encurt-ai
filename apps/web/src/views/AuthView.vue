<template>
  <section class="auth card">
    <p class="eyebrow">ENCURT.AI</p>
    <h1>{{ t(mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle') }}</h1>
    <p class="muted">{{ t(mode === 'login' ? 'auth.loginLead' : 'auth.registerLead') }}</p>
    <form @submit.prevent="submit">
      <label v-if="mode === 'register'" for="name">{{ t('auth.name') }}</label>
      <input v-if="mode === 'register'" id="name" v-model="name" autocomplete="name" maxlength="80" required>
      <label for="email">{{ t('auth.email') }}</label>
      <input id="email" v-model="email" autocomplete="email" type="email" required>
      <label for="password">{{ t('auth.password') }}</label>
      <input id="password" v-model="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" type="password" :minlength="mode === 'register' ? 12 : undefined" required>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="button primary full" :disabled="busy">{{ busy ? t('auth.wait') : t(mode === 'login' ? 'auth.loginButton' : 'auth.registerButton') }}</button>
    </form>
    <p class="muted center">
      {{ t(mode === 'login' ? 'auth.noAccount' : 'auth.hasAccount') }}
      <RouterLink :to="mode === 'login' ? '/register' : '/login'">{{ t(mode === 'login' ? 'auth.signupLink' : 'auth.loginLink') }}</RouterLink>
    </p>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../api/client.js'
import { useSession } from '../composables/useSession.js'
import { router } from '../router/index.js'
import { useI18n } from '../i18n/index.js'

const props = defineProps({ mode: { type: String, required: true } })
const name = ref(''), email = ref(''), password = ref(''), error = ref(''), busy = ref(false)
const session = useSession()
const { t } = useI18n()

async function submit() {
  busy.value = true
  error.value = ''
  try {
    session.user.value = props.mode === 'register'
      ? await api.register(email.value, password.value, name.value)
      : await api.login(email.value, password.value)
    await router.push('/dashboard')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('auth.loginFailed')
  } finally {
    busy.value = false
  }
}
</script>
