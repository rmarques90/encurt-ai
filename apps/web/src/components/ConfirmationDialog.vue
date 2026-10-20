<template>
  <Teleport to="body">
    <div class="confirm-backdrop" @click.self="$emit('cancel')">
      <section ref="dialog" class="card confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="messageId" @keydown="handleKeydown">
        <span class="confirm-icon" :class="{ danger: options.danger }" aria-hidden="true">{{ options.danger ? '!' : '?' }}</span>
        <h2 :id="titleId">{{ options.title }}</h2>
        <p :id="messageId">{{ options.message }}</p>
        <div class="confirm-actions">
          <button ref="cancelButton" class="button secondary" @click="$emit('cancel')">{{ options.cancelLabel }}</button>
          <button class="button" :class="options.danger ? 'danger-button' : 'primary'" @click="$emit('confirm')">{{ options.confirmLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  options: { type: Object, required: true },
  titleId: { type: String, default: 'confirmation-title' },
  messageId: { type: String, default: 'confirmation-message' },
})
const dialog = ref(null)
const cancelButton = ref(null)
let previouslyFocused = null

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    return emit('cancel')
  }
  if (event.key !== 'Tab') return

  const buttons = dialog.value?.querySelectorAll('button:not(:disabled)')
  if (!buttons?.length) return
  const first = buttons[0]
  const last = buttons[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const emit = defineEmits(['confirm', 'cancel'])
onMounted(() => {
  previouslyFocused = document.activeElement
  cancelButton.value?.focus()
})
onBeforeUnmount(() => previouslyFocused?.focus?.())
</script>
