<script setup lang="ts">
import {
  BadgeCheck,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  Cloud,
  Cpu,
  Gauge,
  Network,
  PanelsTopLeft,
  Radar,
  Route,
  ShieldCheck,
  StickyNote,
  TimerReset,
  UsersRound
} from '@lucide/vue'
import type { AccountDetailGroup } from '@shared/types'
import AccountDetailVisual from './AccountDetailVisual.vue'

withDefaults(defineProps<{
  groups: AccountDetailGroup[]
  compact?: boolean
}>(), {
  compact: false
})

const groupIcons: Record<string, unknown> = {
  'period-summary': ChartNoAxesCombined,
  'period-history': CalendarDays,
  'period-models': Cpu,
  'period-endpoints': Route,
  'account-subscription': BadgeCheck,
  'account-scheduling': Gauge,
  'account-groups': UsersRound,
  'account-notes': StickyNote,
  'account-cooldowns': TimerReset,
  'account-routing': Network,
  'usage-health': ShieldCheck,
  'ai-credits': CircleDollarSign,
  'grok-details': Radar,
  'ollama-details': Cloud
}

function groupIcon(id: string): unknown {
  return groupIcons[id] || PanelsTopLeft
}
</script>

<template>
  <div v-if="groups.length" class="account-details" :class="{ 'account-details--compact': compact }">
    <details
      v-for="(group, index) in groups"
      :key="group.id"
      class="account-details__group"
      :open="index === 0"
    >
      <summary>
        <span class="account-details__group-icon" aria-hidden="true">
          <component :is="groupIcon(group.id)" :size="compact ? 12 : 14" :stroke-width="1.9" />
        </span>
        <span class="account-details__group-copy">
          <strong>{{ group.label }}</strong>
          <small>{{ group.items.length }} 项有效数据</small>
        </span>
        <ChevronDown :size="compact ? 12 : 14" class="account-details__chevron" />
      </summary>
      <div class="account-details__items">
        <AccountDetailVisual
          v-for="entry in group.items"
          :key="entry.id"
          :entry="entry"
          :compact="compact"
        />
      </div>
    </details>
  </div>
</template>
