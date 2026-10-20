import { ref } from 'vue'
import { api } from '../api/client.js'
const user = ref(null)
const checked = ref(false)
export function useSession() {
  async function load() { try { user.value = await api.me() } catch { user.value = null } finally { checked.value = true } }
  async function signOut() { await api.logout(); user.value = null }
  return { user, checked, load, signOut }
}
