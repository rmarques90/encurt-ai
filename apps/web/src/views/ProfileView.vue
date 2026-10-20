<template>
  <section class="page profile-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ t('profile.eyebrow') }}</p>
        <h1>{{ t('profile.title') }}</h1>
        <p class="muted">{{ t('profile.lead') }}</p>
      </div>
    </header>
    <section class="profile-card card" aria-labelledby="profile-name">
      <div class="profile-avatar-large" aria-hidden="true">{{ initial }}</div>
      <div>
        <h2 id="profile-name">{{ user?.name || t('profile.userFallback') }}</h2>
        <p class="muted">{{ user?.email }}</p>
      </div>
    </section>
    <section class="profile-security card">
      <h2>{{ t('profile.editName') }}</h2>
      <p class="muted">{{ t('profile.nameLead') }}</p>
      <form id="profile-name-form" class="profile-form" @submit.prevent="updateName">
        <label for="profile-name-input">{{ t('auth.name') }}</label>
        <input id="profile-name-input" v-model="name" autocomplete="name" maxlength="80" required>
        <p v-if="nameError" class="error" role="alert">{{ nameError }}</p>
        <p v-if="nameSuccess" class="success" role="status">{{ nameSuccess }}</p>
        <button class="button primary" type="submit" :disabled="nameBusy">{{ nameBusy ? t('profile.saving') : t('profile.saveName') }}</button>
      </form>
    </section>
    <section class="profile-security card">
      <h2>{{ t('profile.changePassword') }}</h2>
      <p class="muted">{{ t('profile.passwordLead') }}</p>
      <form id="password-change-form" class="profile-form" @submit.prevent="changePassword">
        <label for="current-password">{{ t('profile.currentPassword') }}</label>
        <input id="current-password" v-model="currentPassword" type="password" autocomplete="current-password" required>
        <label for="new-password">{{ t('profile.newPassword') }}</label>
        <input id="new-password" v-model="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
        <label for="confirm-password">{{ t('profile.confirmPassword') }}</label>
        <input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="success" class="success" role="status">{{ success }}</p>
        <button class="button primary" type="submit" :disabled="busy">{{ busy ? t('profile.saving') : t('profile.savePassword') }}</button>
      </form>
    </section>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { api } from '../api/client.js'
import { useSession } from '../composables/useSession.js'
import { useI18n } from '../i18n/index.js'

const { user } = useSession()
const { t } = useI18n()
const currentPassword = ref(''), newPassword = ref(''), confirmPassword = ref('')
const error = ref(''), success = ref(''), busy = ref(false)
const name = ref(user.value?.name || ''), nameError = ref(''), nameSuccess = ref(''), nameBusy = ref(false)
const initial = computed(() => (user.value?.name?.trim() || user.value?.email || '?').charAt(0).toUpperCase())

async function updateName() {
  nameError.value = ''
  nameSuccess.value = ''
  nameBusy.value = true
  try {
    user.value = await api.updateName(name.value.trim())
    name.value = user.value.name
    nameSuccess.value = t('profile.nameSaved')
  } catch (cause) {
    nameError.value = cause instanceof Error ? cause.message : t('profile.nameSaveFailed')
  } finally {
    nameBusy.value = false
  }
}

async function changePassword() {
  error.value = ''
  success.value = ''
  if (newPassword.value !== confirmPassword.value) {
    error.value = t('profile.passwordMismatch')
    return
  }
  busy.value = true
  try {
    user.value = await api.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    success.value = t('profile.passwordChanged')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('profile.changeFailed')
  } finally {
    busy.value = false
  }
}
</script>
