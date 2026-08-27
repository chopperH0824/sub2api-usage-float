<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Activity,
  Boxes,
  BrainCircuit,
  CircleDollarSign,
  Clock3,
  Cloud,
  Gauge,
  Gem,
  Layers3,
  Orbit,
  PictureInPicture2,
  Radar,
  Sparkles,
  UsersRound,
  Zap,
  ChevronDown
} from '@lucide/vue'
import type { AccountUsageInfo, CapacityMetric, Sub2ApiAccount } from '@shared/types'
import {
  accountSeverity,
  accountSubtitle,
  getCapacityMetrics,
  getUsageWindows,
  platformLabel,
  runtimeBlocked
} from '@shared/usage'
import { accountLastSeen, formatCapacityValue, formatUpdatedTime } from '../formatters'
import UsageBar from './UsageBar.vue'

const props = defineProps<{
  account: Sub2ApiAccount
  usage?: AccountUsageInfo | null
  usageError?: string
  now: number
  warningThreshold: number
  dangerThreshold: number
  compact?: boolean
  floated?: boolean
}>()

const emit = defineEmits<{
  toggleFloat: []
}>()

const expanded = ref(false)
const windows = computed(() => getUsageWindows(props.account, props.usage))
const capacities = computed(() => getCapacityMetrics(props.account))
const severity = computed(() => accountSeverity(
  props.account,
  windows.value,
  props.warningThreshold,
  props.dangerThreshold,
  props.now
))
const maxVisibleWindows = computed(() => props.compact ? 2 : 3)
const visibleWindows = computed(() => expanded.value
  ? windows.value
  : windows.value.slice(0, maxVisibleWindows.value))
const hiddenWindowCount = computed(() => Math.max(0, windows.value.length - maxVisibleWindows.value))

const platformIcons: Record<string, unknown> = {
  anthropic: Sparkles,
  openai: Orbit,
  gemini: Gem,
  antigravity: BrainCircuit,
  grok: Radar,
  kimi: Activity,
  zhipu: Layers3,
  deepseek: Cloud,
  ollama: Boxes
}

const platformIcon = computed(() => platformIcons[props.account.platform] || Gauge)
const subtitle = computed(() => accountSubtitle(props.account, props.usage))
const latestUpdatedAt = computed(() => {
  const values = windows.value
    .map((item) => item.updatedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
  if (values.length === 0) return undefined
  return new Date(Math.max(...values)).toISOString()
})

const statusLabel = computed(() => {
  if (props.account.status === 'error') return '异常'
  if (props.account.status === 'inactive') return '停用'
  if (runtimeBlocked(props.account, props.now)) return '冷却中'
  if (!props.account.schedulable) return '已暂停'
  if (severity.value === 'danger') return '额度紧张'
  if (severity.value === 'warning') return '需关注'
  return '正常'
})

const cardMessage = computed(() => {
  if (props.usageError) return props.usageError
  if (props.usage?.error) return props.usage.error
  if (props.account.error_message) return props.account.error_message
  if (props.account.temp_unschedulable_reason) return props.account.temp_unschedulable_reason
  return ''
})

function capacityIcon(metric: CapacityMetric): unknown {
  if (metric.id === 'concurrency') return Zap
  if (metric.id === 'rpm') return Clock3
  if (metric.id === 'sessions') return UsersRound
  if (metric.unit === '$') return CircleDollarSign
  return Gauge
}

function capacityTone(metric: CapacityMetric): string {
  const ratio = metric.limit > 0 ? metric.current / metric.limit : 0
  if (ratio >= 1) return 'danger'
  if (ratio >= 0.8) return 'warning'
  return 'neutral'
}
</script>

<template>
  <article class="account-card" :class="[`account-card--${severity}`, { 'account-card--expanded': expanded }]">
    <header class="account-card__header">
      <div class="provider-mark" :class="`provider-mark--${account.platform}`" :title="platformLabel(account.platform)">
        <component :is="platformIcon" :size="17" :stroke-width="1.9" />
      </div>
      <div class="account-card__identity">
        <div class="account-card__name-row">
          <h2 class="account-card__name" :title="account.name">{{ account.name }}</h2>
          <span class="status-label" :class="`status-label--${severity}`">
            <i aria-hidden="true" />{{ statusLabel }}
          </span>
        </div>
        <p class="account-card__subtitle" :title="subtitle">{{ subtitle }}</p>
      </div>
      <button
        type="button"
        class="account-card__float-button"
        :class="{ 'is-active': floated }"
        :aria-label="floated ? '关闭独立浮窗' : '打开独立浮窗'"
        :title="floated ? '关闭独立浮窗' : '打开独立浮窗'"
        @click="emit('toggleFloat')"
      >
        <PictureInPicture2 :size="15" />
      </button>
    </header>

    <div v-if="capacities.length" class="capacity-strip" aria-label="容量信息">
      <span
        v-for="metric in capacities"
        :key="metric.id"
        class="capacity-chip"
        :class="`capacity-chip--${capacityTone(metric)}`"
        :title="`${metric.label} ${formatCapacityValue(metric)}`"
      >
        <component :is="capacityIcon(metric)" :size="12" :stroke-width="2" />
        <span>{{ metric.label }}</span>
        <strong>{{ formatCapacityValue(metric) }}</strong>
      </span>
    </div>

    <div v-if="visibleWindows.length" class="usage-stack">
      <UsageBar
        v-for="window in visibleWindows"
        :key="window.id"
        :window="window"
        :now="now"
        :warning-threshold="warningThreshold"
        :danger-threshold="dangerThreshold"
      />
    </div>
    <div v-else class="account-card__empty-window">
      <span>暂无窗口数据</span>
      <span>{{ accountLastSeen(account.last_used_at, now) }}</span>
    </div>

    <footer class="account-card__footer">
      <span class="sample-state">
        <i :class="{ 'sample-state__dot--passive': usage?.source === 'passive' }" aria-hidden="true" />
        {{ formatUpdatedTime(latestUpdatedAt, now) }}
      </span>
      <button
        v-if="hiddenWindowCount > 0"
        type="button"
        class="expand-button"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : `更多 ${hiddenWindowCount}` }}
        <ChevronDown :size="13" :class="{ 'is-rotated': expanded }" />
      </button>
    </footer>

    <p v-if="cardMessage" class="account-card__message" :title="cardMessage">{{ cardMessage }}</p>
  </article>
</template>
