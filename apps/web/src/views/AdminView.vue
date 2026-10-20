<template>
  <section class="page">
    <p class="eyebrow">{{ t('admin.eyebrow') }}</p><h1>{{ t('admin.title') }}</h1><p class="muted">{{ t('admin.lead') }}</p>
    <div v-if="error" class="card state"><p class="error" role="alert">{{ error }}</p><button class="button secondary" @click="loadAll">{{ t('admin.retry') }}</button></div>
    <div class="stats-grid"><article class="card stat"><span>{{ t('admin.users') }}</span><strong>{{ formatNumber(overview.usersCount) }}</strong></article><article class="card stat"><span>{{ t('admin.links') }}</span><strong>{{ formatNumber(overview.linksCount) }}</strong></article><article class="card stat"><span>{{ t('admin.clicks') }}</span><strong>{{ formatNumber(overview.clicksCount) }}</strong></article></div>
    <section class="card admin-users">
      <h2>{{ t('admin.accounts') }}</h2>
      <div class="filters">
        <label>{{ t('admin.search') }} <input v-model="userSearchInput" type="search" :placeholder="t('admin.email')" @input="debounceUsers"></label>
        <label>{{ t('admin.status') }} <select v-model="userStatus" @change="resetUsers"><option value="all">{{ t('status.all') }}</option><option value="active">{{ t('admin.active') }}</option><option value="disabled">{{ t('admin.inactive') }}</option></select></label>
        <label>{{ t('admin.role') }} <select v-model="userRole" @change="resetUsers"><option value="all">{{ t('status.all') }}</option><option value="user">{{ t('admin.roleUser') }}</option><option value="admin">{{ t('admin.roleAdmin') }}</option></select></label>
      </div>
      <p v-if="usersLoading" class="muted" role="status">{{ t('admin.usersLoading') }}</p><p v-else-if="!users.items.length" class="muted">{{ t('admin.noUsers') }}</p>
      <div v-else class="table-wrap"><table><thead><tr><th>{{ t('admin.email') }}</th><th>{{ t('admin.role') }}</th><th>{{ t('admin.createdAt') }}</th><th>{{ t('admin.status') }}</th><th>{{ t('admin.actions') }}</th></tr></thead><tbody>
        <tr v-for="user in users.items" :key="user.id"><td>{{ user.email }}</td><td>{{ user.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser') }}</td><td>{{ formatDate(user.createdAt) }}</td><td><span :class="user.disabledAt ? 'status-disabled' : 'status-active'">{{ user.disabledAt ? t('admin.inactive') : t('admin.active') }}</span></td><td class="actions-cell">
          <button class="action-button" :disabled="Boolean(actionLoading[user.id])" :aria-label="t(user.disabledAt ? 'admin.reactivate' : 'admin.disable') + ' ' + user.email" @click="changeStatus(user)">{{ user.disabledAt ? t('admin.reactivate') : t('admin.disable') }}</button>
          <button class="action-button" :disabled="Boolean(actionLoading[user.id])" :aria-label="t('admin.changeRoleAria', { email: user.email })" @click="changeRole(user)">{{ user.role === 'admin' ? t('admin.makeUser') : t('admin.makeAdmin') }}</button>
          <p v-if="actionMessage[user.id]" class="action-message" role="status">{{ actionMessage[user.id] }}</p><p v-if="actionError[user.id]" class="error action-message" role="alert">{{ actionError[user.id] }}</p>
        </td></tr>
      </tbody></table></div>
      <Pagination :total="users.total" :page="userPage" :page-size="PAGE_SIZE" :disabled="usersLoading" @change="(value) => { userPage = value; loadUsers() }" />
    </section>
    <section class="card admin-users">
      <h2>{{ t('admin.links') }}</h2>
      <div class="filters"><label>{{ t('admin.search') }} <input v-model="linkSearchInput" type="search" :placeholder="t('admin.searchLinks')" @input="debounceLinks"></label><label>{{ t('admin.status') }} <select v-model="linkStatus" @change="resetLinks"><option value="all">{{ t('status.all') }}</option><option value="active">{{ t('status.active') }}</option><option value="inactive">{{ t('status.inactive') }}</option><option value="expired">{{ t('status.expired') }}</option></select></label></div>
      <p v-if="linksLoading" class="muted" role="status">{{ t('admin.linksLoading') }}</p><p v-else-if="!links.items.length" class="muted">{{ t('admin.noLinks') }}</p>
      <div v-else class="table-wrap"><table><thead><tr><th>{{ t('linkTable.link') }}</th><th>{{ t('linkTable.destination') }}</th><th>{{ t('linkTable.description') }}</th><th>{{ t('linkTable.clicks') }}</th><th>{{ t('linkTable.status') }}</th><th>{{ t('linkTable.actions') }}</th></tr></thead><tbody>
        <tr v-for="link in links.items" :key="link.code"><td><a :href="link.shortUrl" target="_blank" rel="noopener noreferrer">{{ link.shortUrl }}</a><small>{{ link.code }}</small></td><td class="target">{{ safeTarget(link.targetUrl) }}</td><td class="link-description-cell">{{ link.description || t('linkTable.noDescription') }}</td><td>{{ formatNumber(link.clickCount) }}</td><td>{{ statusLabel(link) }}</td><td class="actions-cell">
          <button v-if="!isExpired(link)" class="action-button" :aria-label="t(link.isActive ? 'admin.pauseLinkAria' : 'admin.activateLinkAria')" @click="changeLinkStatus(link)">{{ t(link.isActive ? 'admin.pause' : 'admin.activate') }}</button>
          <button class="action-button danger-action" :aria-label="t('admin.deleteAria')" @click="deleteLink(link)">{{ t('admin.delete') }}</button>
        </td></tr>
      </tbody></table></div>
      <Pagination :total="links.total" :page="linkPage" :page-size="PAGE_SIZE" :disabled="linksLoading" @change="(value) => { linkPage = value; loadLinks() }" />
    </section>
    <ConfirmationDialog v-if="confirmation" :options="confirmation" @confirm="resolveConfirmation(true)" @cancel="resolveConfirmation(false)" />
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import Pagination from '../components/Pagination.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import { useConfirmation } from '../composables/useConfirmation.js'
import { useNotifications } from '../composables/useNotifications.js'
import { useI18n } from '../i18n/index.js'

const PAGE_SIZE = 10
const { t, formatNumber, formatDate } = useI18n()
const { confirmation, confirmAction, resolveConfirmation } = useConfirmation()
const { notify } = useNotifications()
const overview = ref({}), users = ref({ items: [], total: 0 }), links = ref({ items: [], total: 0 })
const error = ref(''), usersLoading = ref(false), linksLoading = ref(false)
const userSearchInput = ref(''), userSearch = ref(''), userStatus = ref('all'), userRole = ref('all'), userPage = ref(1)
const linkSearchInput = ref(''), linkSearch = ref(''), linkStatus = ref('all'), linkPage = ref(1)
const actionLoading = ref({}), actionMessage = ref({}), actionError = ref({})
let userTimer, linkTimer

async function loadAll() { error.value = ''; try { overview.value = await api.overview() } catch { error.value = t('admin.metricsFailed') }; await Promise.all([loadUsers(), loadLinks()]) }
async function loadUsers() { usersLoading.value = true; try { users.value = await api.users({ search: userSearch.value, status: userStatus.value, role: userRole.value, page: userPage.value, pageSize: PAGE_SIZE }) } catch { error.value = t('admin.usersFailed') } finally { usersLoading.value = false } }
async function loadLinks() { linksLoading.value = true; try { links.value = await api.adminLinks({ search: linkSearch.value, status: linkStatus.value, page: linkPage.value, pageSize: PAGE_SIZE }) } catch { error.value = t('admin.linksFailed') } finally { linksLoading.value = false } }
function debounceUsers() { clearTimeout(userTimer); userTimer = setTimeout(() => { userSearch.value = userSearchInput.value.trim(); userPage.value = 1; loadUsers() }, 250) }
function debounceLinks() { clearTimeout(linkTimer); linkTimer = setTimeout(() => { linkSearch.value = linkSearchInput.value.trim(); linkPage.value = 1; loadLinks() }, 250) }
function resetUsers() { userPage.value = 1; loadUsers() }
function resetLinks() { linkPage.value = 1; loadLinks() }
async function mutateUser(user, payload, confirmText, successText, confirmLabel, danger = false) {
  const accepted = await confirmAction({ title: t('common.attention'), message: confirmText, cancelLabel: t('common.cancel'), confirmLabel, danger })
  if (!accepted) return
  actionLoading.value[user.id] = true; delete actionMessage.value[user.id]; delete actionError.value[user.id]
  try {
    const updated = payload.isDisabled === undefined ? await api.setUserRole(user.id, payload.role) : await api.setUserDisabled(user.id, payload.isDisabled)
    users.value.items = users.value.items.map((item) => item.id === updated.id ? updated : item); actionMessage.value[user.id] = successText
  } catch { actionError.value[user.id] = t('admin.accountChangeFailed') }
  finally { actionLoading.value[user.id] = false }
}
function changeStatus(user) {
  const disable = !user.disabledAt
  mutateUser(user, { isDisabled: disable }, t(disable ? 'admin.confirmDisable' : 'admin.confirmReactivate', { email: user.email }), t(disable ? 'admin.accountDisabled' : 'admin.accountReactivated'), t(disable ? 'admin.disable' : 'admin.reactivate'), disable)
}
function changeRole(user) {
  const role = user.role === 'admin' ? 'user' : 'admin'
  mutateUser(user, { role }, t(role === 'admin' ? 'admin.confirmMakeAdmin' : 'admin.confirmMakeUser', { email: user.email }), t('admin.roleUpdated'), t(role === 'admin' ? 'admin.makeAdmin' : 'admin.makeUser'))
}
async function changeLinkStatus(link) {
  const isActive = !link.isActive, action = t(isActive ? 'admin.activate' : 'admin.pause').toLowerCase()
  const accepted = await confirmAction({ title: t('common.attention'), message: t('admin.confirmLinkStatus', { action, code: link.code }), cancelLabel: t('common.cancel'), confirmLabel: t(isActive ? 'admin.activate' : 'admin.pause') })
  if (!accepted) return
  try { await api.setAdminLinkActive(link.code, isActive); await loadLinks(); notify(t(isActive ? 'admin.linkActivated' : 'admin.linkPaused')) }
  catch { notify(t('admin.linkChangeFailed'), 'error') }
}
async function deleteLink(link) {
  const accepted = await confirmAction({ title: t('common.attention'), message: t('admin.confirmDelete', { code: link.code }), cancelLabel: t('common.cancel'), confirmLabel: t('common.delete'), danger: true })
  if (!accepted) return
  try { await api.deleteAdminLink(link.code); await loadLinks(); notify(t('admin.linkDeleted')) }
  catch { notify(t('admin.deleteFailed'), 'error') }
}
function isExpired(link) { return Boolean(link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) }
function statusLabel(link) { return t(!link.isActive ? 'admin.statusInactive' : isExpired(link) ? 'admin.statusExpired' : 'admin.statusActive') }
function safeTarget(value) { try { const url = new URL(value); return `${url.hostname}${url.pathname}` } catch { return t('admin.linkUnavailable') } }
onMounted(loadAll)
</script>
