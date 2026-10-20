<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">{{ t('dashboard.eyebrow') }}</p><h1>{{ t('dashboard.title') }}</h1><p class="muted">{{ t('dashboard.lead') }}</p></div>
      <div class="metric"><span>{{ t('dashboard.totalClicks') }}</span><strong>{{ formatNumber(stats.totalClicks) }}</strong><small>{{ t('dashboard.selectedPeriod') }}</small></div>
    </div>
    <section class="card analytics">
      <div class="section-head"><div><h2>{{ t('dashboard.clicksOverTime') }}</h2><p class="muted">{{ t('dashboard.recentActivity') }}</p></div>
        <label>{{ t('dashboard.period') }} <select v-model="period" @change="loadStats"><option value="7">{{ t('dashboard.days', { count: 7 }) }}</option><option value="30">{{ t('dashboard.days', { count: 30 }) }}</option><option value="90">{{ t('dashboard.days', { count: 90 }) }}</option></select></label>
      </div>
      <ClickChart :points="stats.points || []" :label="t('dashboard.clicksByDay')" />
    </section>
    <section class="card create-card">
      <div><h2>{{ t('dashboard.createTitle') }}</h2><p class="muted">{{ t('dashboard.createLead') }}</p></div>
      <form class="create-form" @submit.prevent="create">
        <label class="sr-only" for="url">{{ t('dashboard.urlLabel') }}</label>
        <input id="url" v-model="url" type="url" :placeholder="t('dashboard.urlPlaceholder')" required>
        <input v-model="customCode" :aria-label="t('dashboard.customCodeLabel')" :placeholder="t('dashboard.customCode')">
        <label class="description-field"><span>{{ t('dashboard.description') }}</span><textarea v-model="description" :maxlength="MAX_LINK_DESCRIPTION_LENGTH" :placeholder="t('dashboard.descriptionPlaceholder')" rows="2"></textarea><small>{{ t('dashboard.descriptionLength', { count: description.length, max: MAX_LINK_DESCRIPTION_LENGTH }) }}</small></label>
        <button class="button primary" :disabled="busy">{{ busy ? t('dashboard.creating') : t('dashboard.shorten') }}</button>
      </form>
      <p v-if="notice" class="success" role="status">{{ notice }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>
    <section class="links-section">
      <div class="section-head"><div><h2>{{ t('dashboard.title') }}</h2><p class="muted">{{ t('dashboard.searchLead') }}</p></div><span class="count">{{ t('dashboard.linkCount', { count: formatNumber(links.total) }) }}</span></div>
      <div class="filters">
        <label>{{ t('dashboard.search') }} <input v-model="searchInput" type="search" :placeholder="t('dashboard.searchPlaceholder')" @input="debouncedSearch"></label>
        <label>{{ t('dashboard.status') }} <select v-model="status" @change="changeFilter"><option value="all">{{ t('status.all') }}</option><option value="active">{{ t('status.active') }}</option><option value="inactive">{{ t('status.inactive') }}</option><option value="expired">{{ t('status.expired') }}</option></select></label>
      </div>
      <div v-if="loading" class="card state" role="status">{{ t('dashboard.loading') }}</div>
      <div v-else-if="!links.items.length" class="card state"><h3>{{ t('dashboard.emptyTitle') }}</h3><p class="muted">{{ t('dashboard.emptyLead') }}</p></div>
      <div v-else class="card table-card"><LinkTable :links="links.items" :copied-link="copiedLink" @toggle="toggle" @copy="copyLink" @stats="showStats" @edit="editDescription" /></div>
      <div class="pagination"><span>{{ t('pagination.results', { count: formatNumber(links.total) }) }}</span><button class="button secondary" :disabled="page <= 1 || loading" @click="setPage(page - 1)">{{ t('pagination.previous') }}</button><span>{{ t('pagination.page', { page, pages }) }}</span><button class="button secondary" :disabled="page >= pages || loading" @click="setPage(page + 1)">{{ t('pagination.next') }}</button></div>
    </section>
    <div v-if="selectedLink" class="modal-backdrop" @click.self="selectedLink = null"><section class="card stats-dialog" role="dialog" aria-modal="true" :aria-label="t('dashboard.statsLabel', { code: selectedLink.code })"><button class="text-button close" @click="selectedLink = null">{{ t('dashboard.close') }}</button><h2>{{ t('dashboard.linkClicks', { code: selectedLink.code }) }}</h2><p class="muted">{{ t('dashboard.historicalClicks', { count: formatNumber(linkStats.totalClicks) }) }}</p><ClickChart :points="linkStats.points || []" :label="t('dashboard.clicksByDay')" /></section></div>
    <div v-if="editingLink" class="modal-backdrop" @click.self="closeDescriptionDialog"><section class="card edit-description-dialog" role="dialog" aria-modal="true" aria-labelledby="description-dialog-title"><button class="text-button close" :disabled="descriptionSaving" @click="closeDescriptionDialog">{{ t('dashboard.close') }}</button><h2 id="description-dialog-title">{{ t('dashboard.editDescriptionTitle') }}</h2><p class="muted">{{ editingLink.shortUrl }}</p><form @submit.prevent="saveDescription"><label class="description-field"><span>{{ t('dashboard.description') }}</span><textarea v-model="descriptionDraft" :maxlength="MAX_LINK_DESCRIPTION_LENGTH" rows="3" autofocus></textarea><small>{{ t('dashboard.descriptionLength', { count: descriptionDraft.length, max: MAX_LINK_DESCRIPTION_LENGTH }) }}</small></label><div class="confirm-actions"><button type="button" class="button secondary" :disabled="descriptionSaving" @click="closeDescriptionDialog">{{ t('common.cancel') }}</button><button class="button primary" :disabled="descriptionSaving">{{ descriptionSaving ? t('dashboard.savingDescription') : t('dashboard.saveDescription') }}</button></div></form></section></div>
    <ConfirmationDialog v-if="confirmation" :options="confirmation" @confirm="resolveConfirmation(true)" @cancel="resolveConfirmation(false)" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { useI18n } from '../i18n/index.js'
import LinkTable from '../components/LinkTable.vue'
import ClickChart from '../components/ClickChart.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import { useConfirmation } from '../composables/useConfirmation.js'
import { MAX_LINK_DESCRIPTION_LENGTH } from '../constants.js'
import { useNotifications } from '../composables/useNotifications.js'

const PAGE_SIZE = 10
const COPY_TOOLTIP_DURATION_MS = 1800
const { t, formatNumber } = useI18n()
const { confirmation, confirmAction, resolveConfirmation } = useConfirmation()
const { notify } = useNotifications()
const links = ref({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
const stats = ref({ totalClicks: 0, points: [] })
const linkStats = ref({ totalClicks: 0, points: [] })
const selectedLink = ref(null)
const editingLink = ref(null), descriptionDraft = ref(''), descriptionSaving = ref(false)
const page = ref(1), status = ref('all'), searchInput = ref(''), search = ref(''), period = ref('30')
const url = ref(''), customCode = ref(''), description = ref(''), error = ref(''), notice = ref(''), loading = ref(true), busy = ref(false)
const copiedLink = ref('')
const pages = computed(() => Math.max(1, Math.ceil(links.value.total / PAGE_SIZE)))
let searchTimer
let copiedTimer

function dateRange() {
  const to = new Date(), from = new Date()
  from.setUTCDate(to.getUTCDate() - Number(period.value) + 1)
  from.setUTCHours(0, 0, 0, 0); to.setUTCHours(23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString(), interval: 'day' }
}
async function load() {
  loading.value = true; error.value = ''
  try { links.value = await api.links({ search: search.value, status: status.value, page: page.value, pageSize: PAGE_SIZE }) }
  catch (cause) { error.value = cause.message || t('dashboard.loadFailed') }
  finally { loading.value = false }
}
async function loadStats() {
  try { stats.value = await api.stats(dateRange()) }
  catch (cause) { error.value = cause.message || t('dashboard.statsFailed') }
}
function debouncedSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { search.value = searchInput.value.trim(); page.value = 1; load() }, 250) }
function changeFilter() { page.value = 1; load() }
function setPage(value) { page.value = value; load() }
async function create() {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await api.createLink({ url: url.value, description: description.value, ...(customCode.value ? { customCode: customCode.value } : {}) })
    url.value = ''; customCode.value = ''; description.value = ''; notice.value = t('dashboard.created'); page.value = 1; await load()
  } catch (cause) { error.value = cause.message || t('dashboard.createFailed') }
  finally { busy.value = false }
}
async function toggle(link) {
  const next = !link.isActive
  const accepted = await confirmAction({
    title: t('common.confirmation'),
    message: t(next ? 'dashboard.confirmResume' : 'dashboard.confirmPause'),
    cancelLabel: t('common.cancel'),
    confirmLabel: t(next ? 'linkTable.activate' : 'linkTable.pause'),
  })
  if (!accepted) return
  try {
    await api.setActive(link.code, next)
    notify(t(next ? 'dashboard.linkResumed' : 'dashboard.linkPaused'))
    await load()
  } catch (cause) { notify(cause.message || t('dashboard.changeLinkFailed'), 'error') }
}
async function copyLink(value) {
  try {
    await navigator.clipboard.writeText(value)
    copiedLink.value = value
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copiedLink.value = '' }, COPY_TOOLTIP_DURATION_MS)
  }
  catch { error.value = t('dashboard.copyFailed') }
}
function editDescription(link) {
  editingLink.value = link
  descriptionDraft.value = link.description || ''
}
function closeDescriptionDialog() {
  if (descriptionSaving.value) return
  editingLink.value = null
}
async function saveDescription() {
  if (!editingLink.value) return
  descriptionSaving.value = true
  try {
    await api.setDescription(editingLink.value.code, descriptionDraft.value)
    links.value.items = links.value.items.map((link) => link.code === editingLink.value.code ? { ...link, description: descriptionDraft.value } : link)
    editingLink.value = null
    notify(t('dashboard.descriptionSaved'))
  } catch (cause) { notify(cause.message || t('dashboard.descriptionSaveFailed'), 'error') }
  finally { descriptionSaving.value = false }
}
async function showStats(link) {
  selectedLink.value = link
  try { linkStats.value = await api.linkStats(link.code, dateRange()) }
  catch (cause) {
    linkStats.value = { totalClicks: 0, points: [] }
    notify(cause.message || t('dashboard.statsFailed'), 'error')
  }
}
onMounted(() => { load(); loadStats() })
onBeforeUnmount(() => clearTimeout(copiedTimer))
</script>
