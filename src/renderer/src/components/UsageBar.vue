<script setup lang="ts">
import { computed } from 'vue'
import type { UsageWindow } from '@shared/types'
import { formatResetTime } from '../formatters'

const props = defineProps<{
  window: UsageWindow
  now: number
  warningThreshold: number
  dangerThreshold: number
}>()

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
      <span v-if="window.detail" class="usage-window__detail" :title="window.detail">{{ window.detail }}</span>
      <span class="usage-window__reset">{{ formatResetTime(window.resetAt, now) }}</span>
      <strong class="usage-window__percent">{{ roundedPercent }}%</strong>
    </div>
    <div class="usage-window__track" aria-hidden="true">
      <span class="usage-window__fill" :style="{ width }" />
    </div>
  </div>
</template>

