<template>
  <Transition name="toast">
    <aside v-if="notification" :key="notification.id" class="toast-notice" :class="`toast-${notification.type}`" :role="notification.type === 'error' ? 'alert' : 'status'" aria-live="polite">
      <span class="toast-indicator" aria-hidden="true">{{ notification.type === 'error' ? '!' : '✓' }}</span>
      <span>{{ notification.message }}</span>
      <button class="toast-dismiss" :aria-label="t('common.dismiss')" @click="dismissNotification()">×</button>
    </aside>
  </Transition>
</template>

<script setup>
import { useI18n } from '../i18n/index.js'
import { useNotifications } from '../composables/useNotifications.js'

const { t } = useI18n()
const { notification, dismissNotification } = useNotifications()
</script>
