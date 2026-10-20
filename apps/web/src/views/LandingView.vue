<template>
  <section class="hero">
    <p class="eyebrow">{{ t('landing.eyebrow') }}</p>
    <h1>{{ t('landing.titleFirst') }}<br><span>{{ t('landing.titleSecond') }}</span></h1>
    <p class="lead">{{ t('landing.lead') }}</p>
    <div class="actions">
      <RouterLink class="button primary" to="/register">{{ t('landing.signup') }}</RouterLink>
      <RouterLink class="button secondary" to="/login">{{ t('landing.login') }}</RouterLink>
    </div>
    <div class="preview"><span class="pulse"></span> {{ t('landing.preview') }} <span class="arrow">↗</span></div>
  </section>
</template>

<script setup>
import { useI18n } from '../i18n/index.js'
const { t } = useI18n()
</script>
