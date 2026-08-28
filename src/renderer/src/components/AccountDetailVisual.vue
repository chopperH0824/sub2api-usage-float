<script setup lang="ts">
import { computed } from 'vue'
import {
  Activity,
  BadgeCheck,
  Binary,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Cpu,
  Gauge,
  ListChecks,
  Network,
  Route,
  ShieldCheck,
  StickyNote,
  TriangleAlert,
  UsersRound
} from '@lucide/vue'
import type { AccountDetailItem } from '@shared/types'

const props = withDefaults(defineProps<{
  entry: AccountDetailItem
  compact?: boolean
}>(), {
  compact: false
})

const icon = computed(() => {
  const id = props.entry.id
  if (props.entry.tone === 'danger' && /health|error|cooldown|status/.test(id)) return TriangleAlert
  if (/cost|balance|credit|bill|prepaid|demand|money/.test(id)) return CircleDollarSign
  if (/token/.test(id)) return Binary
  if (/endpoint/.test(id)) return Route
  if (/request/.test(id)) return ListChecks
  if (/model/.test(id)) return Cpu
  if (/history|highest/.test(id)) return CalendarDays
  if (/time|date|expiry|expires|reset|cooldown|period-days/.test(id)) return Clock3
  if (/health|verify|banned|reauth|status/.test(id)) return ShieldCheck
  if (/proxy|routing|fallback|parent/.test(id)) return Network
  if (/subscription|plan|tier/.test(id)) return BadgeCheck
  if (/group/.test(id)) return UsersRound
  if (/note|reason|error/.test(id)) return StickyNote
  if (/score|priority|load|rate|rpm|concurrency|session/.test(id)) return Gauge
  return Activity
})

const progress = computed(() => Math.max(0, Math.min(100, props.entry.progress || 0)))
const title = computed(() => [props.entry.label, props.entry.value, props.entry.meta].filter(Boolean).join(' · '))
</script>

<template>
  <div
    class="account-detail-visual"
    :class="[
      `account-detail-visual--${entry.kind || 'metric'}`,
      entry.tone ? `is-${entry.tone}` : '',
      { 'is-compact': compact }
    ]"
    :title="title"
  >
    <span class="account-detail-visual__icon" aria-hidden="true">
      <component :is="icon" :size="compact ? 12 : 14" :stroke-width="1.9" />
    </span>

    <div class="account-detail-visual__body">
      <div class="account-detail-visual__heading">
        <span>{{ entry.label }}</span>
        <strong v-if="entry.kind === 'status'" class="account-detail-visual__status">
          <i aria-hidden="true" />{{ entry.value }}
        </strong>
        <strong v-else-if="entry.kind !== 'note' && entry.kind !== 'tags'">{{ entry.value }}</strong>
      </div>

      <p v-if="entry.kind === 'note'" class="account-detail-visual__note">{{ entry.value }}</p>

      <div v-if="entry.kind === 'tags'" class="account-detail-visual__tags">
        <span v-for="tag in entry.tags || [entry.value]" :key="tag">{{ tag }}</span>
      </div>

      <p v-if="entry.meta" class="account-detail-visual__meta">{{ entry.meta }}</p>

      <div
        v-if="(entry.kind === 'progress' || entry.kind === 'ranking') && entry.progress !== undefined"
        class="account-detail-visual__track"
        role="meter"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(progress)"
      >
        <i :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </div>
</template>
