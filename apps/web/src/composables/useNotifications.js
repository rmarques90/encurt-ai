import { ref } from 'vue'

const NOTIFICATION_DURATION_MS = 3500
export const notification = ref(null)
let dismissalTimer
let nextNotificationId = 0

export function notify(message, type = 'success') {
  clearTimeout(dismissalTimer)
  notification.value = { id: ++nextNotificationId, message, type }
  dismissalTimer = setTimeout(() => dismissNotification(notification.value?.id), NOTIFICATION_DURATION_MS)
}

export function dismissNotification(id = notification.value?.id) {
  if (id !== undefined && notification.value?.id !== id) return
  clearTimeout(dismissalTimer)
  notification.value = null
}

export function useNotifications() {
  return { notification, notify, dismissNotification }
}
