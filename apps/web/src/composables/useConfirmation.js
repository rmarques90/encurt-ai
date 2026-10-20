import { ref } from 'vue'

export function useConfirmation() {
  const confirmation = ref(null)
  let resolvePending = null

  function confirmAction(options) {
    if (resolvePending) resolvePending(false)

    confirmation.value = options
    return new Promise((resolve) => {
      resolvePending = resolve
    })
  }

  function resolveConfirmation(accepted) {
    const resolve = resolvePending
    resolvePending = null
    confirmation.value = null
    resolve?.(accepted)
  }

  return { confirmation, confirmAction, resolveConfirmation }
}
