<template>
  <section class="error-page" aria-labelledby="error-title">
    <article class="error-card card">
      <div class="error-visual" aria-hidden="true">
        <span class="error-orbit"></span>
        <span class="error-code">{{ status }}</span>
      </div>
      <div class="error-content">
        <p class="eyebrow">{{ t('error.label') }}</p>
        <h1 id="error-title">{{ title }}</h1>
        <p class="error-description">{{ message }}</p>
        <p class="error-help">{{ t('error.help') }}</p>
        <div class="error-actions">
          <RouterLink class="button primary" to="/">{{ t('error.home') }}</RouterLink>
          <button class="button secondary" type="button" @click="goBack">{{ t('error.back') }}</button>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../i18n/index.js'

const props = defineProps({ status: { type: Number, required: true } })
const { t } = useI18n()
const router = useRouter()
const title = computed(() => t(`error.${props.status}Title`))
const message = computed(() => t(`error.${props.status}Message`))

function goBack() {
  const previousLocation = router.options.history.state.back
  if (typeof previousLocation === 'string' && previousLocation.startsWith('/')) {
    router.back()
    return
  }
  router.push('/')
}
</script>
