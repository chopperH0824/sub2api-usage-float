<script setup lang="ts">
import { computed } from 'vue'
import type { DisplayFieldId, UsageWindow } from '@shared/types'
import { formatCompactNumber } from '@shared/usage'
import { formatResetTime } from '../formatters'

const props = withDefaults(defineProps<{
  window: UsageWindow
  now: number
  warningThreshold: number
  dangerThreshold: number
  displayFields?: DisplayFieldId[]
}>(), {
  displayFields: () => ['window-requests', 'window-tokens']
})

const detail = computed(() => {
  const selected = new Set(props.displayFields)
  const parts: string[] = []
  if (selected.has('window-requests')) {
    if (props.window.usedRequests !== undefined && props.window.limitRequests !== undefined) {
      parts.push(`${formatCompactNumber(props.window.usedRequests)}/${formatCompactNumber(props.window.limitRequests)} 次`)
    } else if (props.window.stats?.requests !== undefined) {
      parts.push(`${formatCompactNumber(props.window.stats.requests)} 次`)
    }
  }
  if (selected.has('window-tokens') && props.window.stats?.tokens !== undefined) {
    parts.push(`${formatCompactNumber(props.window.stats.tokens)} Token`)
  }
  if (selected.has('window-costs') && props.window.stats) {
    if (props.window.stats.standard_cost !== undefined) parts.push(`标准 $${props.window.stats.standard_cost.toFixed(2)}`)
    if (props.window.stats.cost !== undefined) parts.push(`账号 $${props.window.stats.cost.toFixed(2)}`)
    if (props.window.stats.user_cost !== undefined) parts.push(`用户 $${props.window.stats.user_cost.toFixed(2)}`)
  }
  return parts.join(' · ')
})

const roundedPercent = computed(() => Math.round(props.window.usedPercent))
const width = computed(() => `${Math.min(100, Math.max(0, props.window.usedPercent))}%`)
const tone = computed(() => {
  if (props.window.usedPercent >= props.dangerThreshold) return 'danger'
  if (props.window.usedPercent >= props.warningThreshold) return 'warning'
  return 'healthy'
})
</script>

<template>
  <div class="usage-window" :class="`usage-window--${tone}`">
    <div class="usage-window__meta">
      <span class="usage-window__label" :title="window.label">{{ window.label }}</span>
      <span class="usage-window__detail" :title="detail">{{ detail }}</span>
      <span class="usage-window__reset">{{ formatResetTime(window.resetAt, now) }}</span>
      <strong class="usage-window__percent">{{ roundedPercent }}%</strong>
    </div>
    <div class="usage-window__track" aria-hidden="true">
      <span class="usage-window__fill" :style="{ width }" />
    </div>
  </div>
</template>

