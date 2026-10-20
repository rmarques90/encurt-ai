<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink class="brand" to="/">encurt<span>.ai</span></RouterLink>
      <nav>
        <RouterLink v-if="!user" to="/login">{{ t('nav.login') }}</RouterLink>
        <div v-if="user" ref="userMenuRoot" class="user-menu">
          <button ref="userMenuButton" class="profile-avatar" type="button" :aria-label="t('nav.profile', { name: user.name })" :aria-expanded="userMenuOpen" aria-haspopup="true" aria-controls="user-menu-dropdown" @click.stop="toggleUserMenu">{{ avatarInitial }}</button>
          <Transition name="user-menu">
            <section v-if="userMenuOpen" id="user-menu-dropdown" class="user-menu-dropdown" :aria-label="t('nav.profile', { name: user.name })">
              <div class="user-menu-identity"><strong>{{ user.name }}</strong><span>{{ user.email }}</span></div>
              <div class="user-menu-actions">
                <RouterLink to="/dashboard" @click="closeUserMenu">{{ t('nav.dashboard') }}</RouterLink>
                <RouterLink to="/profile" @click="closeUserMenu">{{ t('nav.profileLink') }}</RouterLink>
                <RouterLink v-if="user.role === 'admin'" to="/admin" @click="closeUserMenu">{{ t('nav.admin') }}</RouterLink>
                <button type="button" @click="logout">{{ t('nav.logout') }}</button>
              </div>
            </section>
          </Transition>
        </div>
      </nav>
    </header>
    <main><RouterView /></main>
    <footer class="app-footer"><span>{{ t('footer.tagline') }}</span><label class="language-picker"><span class="sr-only">{{ t('language.label') }}</span><svg v-if="locale === 'pt-BR'" class="language-flag" viewBox="0 0 24 16" aria-hidden="true" focusable="false"><rect width="24" height="16" rx="2" fill="#16843b"/><path d="M12 2 22 8 12 14 2 8Z" fill="#ffd447"/><circle cx="12" cy="8" r="3.5" fill="#2450a4"/><path d="M8.9 7.4c2.1-.3 4.2.2 6.1 1.5" fill="none" stroke="#fff" stroke-width=".7"/></svg><svg v-else class="language-flag" viewBox="0 0 24 16" aria-hidden="true" focusable="false"><rect width="24" height="16" rx="2" fill="#fff"/><path d="M0 0h24v2H0zm0 4h24v2H0zm0 4h24v2H0zm0 4h24v2H0z" fill="#c83b46"/><path d="M0 0h11v8H0z" fill="#254477"/><g fill="#fff"><circle cx="2" cy="2" r=".55"/><circle cx="5" cy="2" r=".55"/><circle cx="8" cy="2" r=".55"/><circle cx="3.5" cy="4" r=".55"/><circle cx="6.5" cy="4" r=".55"/><circle cx="2" cy="6" r=".55"/><circle cx="5" cy="6" r=".55"/><circle cx="8" cy="6" r=".55"/></g></svg><select :value="locale" :aria-label="t('language.label')" @change="setLocale($event.target.value)"><option value="pt-BR">Português (Brasil)</option><option value="en">English</option></select></label></footer>
    <NotificationToast />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSession } from './composables/useSession.js'
import { router } from './router/index.js'
import { useI18n } from './i18n/index.js'
import NotificationToast from './components/NotificationToast.vue'
import { useNotifications } from './composables/useNotifications.js'

const { user, signOut } = useSession()
const { locale, setLocale, t } = useI18n()
const { notify } = useNotifications()
const userMenuOpen = ref(false)
const userMenuRoot = ref(null)
const userMenuButton = ref(null)
const avatarInitial = computed(() => (user.value?.name?.trim() || user.value?.email || '?').charAt(0).toUpperCase())

function toggleUserMenu() { userMenuOpen.value = !userMenuOpen.value }
function closeUserMenu() { userMenuOpen.value = false }
function handleOutsidePointer(event) {
  if (userMenuRoot.value && event.target && !userMenuRoot.value.contains(event.target)) closeUserMenu()
}
function handleMenuKeydown(event) {
  if (event.key === 'Escape' && userMenuOpen.value) {
    closeUserMenu()
    userMenuButton.value?.focus()
  }
}

async function logout() {
  closeUserMenu()
  try { await signOut(); await router.push('/') } catch { notify(t('auth.logoutFailed'), 'error') }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer)
  document.addEventListener('keydown', handleMenuKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer)
  document.removeEventListener('keydown', handleMenuKeydown)
})
</script>
