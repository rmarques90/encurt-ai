<template><div class="pagination"><span>{{ t('pagination.results', { count: formatNumber(total) }) }}</span><button class="button secondary" :disabled="disabled || page <= 1" @click="$emit('change', page - 1)">{{ t('pagination.previous') }}</button><span>{{ t('pagination.page', { page, pages }) }}</span><button class="button secondary" :disabled="disabled || page >= pages" @click="$emit('change', page + 1)">{{ t('pagination.next') }}</button></div></template>
<script setup>
import { computed } from 'vue'
import { useI18n } from '../i18n/index.js'
const props = defineProps({ total: { type: Number, default: 0 }, page: { type: Number, default: 1 }, pageSize: { type: Number, default: 10 }, disabled: { type: Boolean, default: false } })
defineEmits(['change'])
const { t, formatNumber } = useI18n()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>
