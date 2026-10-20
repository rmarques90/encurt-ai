<template>
  <div class="table-wrap"><table><thead><tr><th>{{ t('linkTable.link') }}</th><th>{{ t('linkTable.destination') }}</th><th>{{ t('linkTable.description') }}</th><th>{{ t('linkTable.clicks') }}</th><th>{{ t('linkTable.status') }}</th><th>{{ t('linkTable.actions') }}</th></tr></thead>
    <tbody><tr v-for="link in links" :key="link.code"><td><a :href="link.shortUrl" target="_blank" rel="noopener noreferrer">{{ link.shortUrl }}</a><small>{{ link.code }}</small></td><td class="target">{{ safeTarget(link.targetUrl) }}</td><td class="link-description-cell">{{ link.description || t('linkTable.noDescription') }}</td><td class="clicks">{{ formatNumber(link.clickCount) }}</td><td><span class="badge" :class="status(link)">{{ statusLabel(link) }}</span></td><td><div class="link-actions"><button class="action-button" @click="copy(link.shortUrl, $event)">{{ t('linkTable.copy') }}</button><button class="action-button" @click="$emit('stats', link)">{{ t('linkTable.stats') }}</button><button class="action-button" :aria-label="t('linkTable.editDescription')" @click="$emit('edit', link)">{{ t('linkTable.editDescription') }}</button><button v-if="!isExpired(link)" class="action-button" :aria-label="t(link.isActive ? 'linkTable.disableAria' : 'linkTable.activateAria')" @click="$emit('toggle', link)">{{ t(link.isActive ? 'linkTable.pause' : 'linkTable.activate') }}</button></div></td></tr></tbody>
  </table></div>
  <Teleport to="body"><span v-if="copiedLink" class="copy-tooltip" role="status" :style="tooltipStyle">{{ t('linkTable.copied') }}</span></Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '../i18n/index.js'

defineProps({ links: { type: Array, required: true }, copiedLink: { type: String, default: '' } })
const emit = defineEmits(['toggle', 'copy', 'stats', 'edit'])
const { t, formatNumber } = useI18n()
const tooltipPosition = ref({ top: 0, left: 0 })
const tooltipStyle = computed(() => ({ top: `${tooltipPosition.value.top}px`, left: `${tooltipPosition.value.left}px` }))
function copy(shortUrl, event) {
  const bounds = event.currentTarget.getBoundingClientRect()
  tooltipPosition.value = { top: Math.max(8, bounds.top - 38), left: Math.min(window.innerWidth - 90, Math.max(90, bounds.left + bounds.width / 2)) }
  emit('copy', shortUrl)
}
function isExpired(link) { return Boolean(link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) }
function status(link) { return !link.isActive ? 'inactive' : isExpired(link) ? 'expired' : 'active' }
function statusLabel(link) { return t(!link.isActive ? 'status.inactive' : isExpired(link) ? 'status.expired' : 'status.active') }
function safeTarget(value) { try { const url = new URL(value); return `${url.hostname}${url.pathname}` } catch { return t('linkTable.destinationUnavailable') } }
</script>
