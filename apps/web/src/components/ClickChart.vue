<template>
  <div class="chart" role="img" :aria-label="`${label}: ${points.map((point) => `${point.date}: ${formatNumber(point.clicks)}`).join(', ') || t('chart.noData')}`">
    <div class="chart-bars" aria-hidden="true"><div v-for="(point, index) in normalized" :key="`${point.date}-${index}`" class="chart-column"><span class="chart-bar" :style="{ height: `${point.height}%` }"></span><small v-if="index === 0 || index === normalized.length - 1 || index % labelStep === 0">{{ point.shortDate }}</small></div></div>
    <p v-if="!normalized.length" class="muted">{{ t('dashboard.noData') }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../i18n/index.js'

const props = defineProps({ points: { type: Array, default: () => [] }, label: { type: String, default: 'Clicks' } })
const { t, formatNumber, formatShortDate } = useI18n()
const normalized = computed(() => {
  const max = Math.max(1, ...props.points.map((item) => Number(item.clicks) || 0))
  return props.points.map((item) => ({ ...item, height: Math.max(4, (Number(item.clicks) / max) * 100), shortDate: formatShortDate(item.date) }))
})
const labelStep = computed(() => Math.max(1, Math.ceil(normalized.value.length / 7)))
</script>
