<script setup lang="ts">
import { Database, ChevronDown } from '@lucide/vue'
import type { AccountDetailGroup } from '@shared/types'

withDefaults(defineProps<{
  groups: AccountDetailGroup[]
  compact?: boolean
}>(), {
  compact: false
})
</script>

<template>
  <div v-if="groups.length" class="account-details" :class="{ 'account-details--compact': compact }">
    <details
      v-for="(group, index) in groups"
      :key="group.id"
      class="account-details__group"
      :open="!compact || index === 0"
    >
      <summary>
        <span><Database :size="compact ? 10 : 12" />{{ group.label }}</span>
        <small>{{ group.items.length }}</small>
        <ChevronDown :size="compact ? 10 : 12" />
      </summary>
      <div class="account-details__items">
        <div
          v-for="entry in group.items"
          :key="entry.id"
          class="account-details__item"
          :class="entry.tone ? `is-${entry.tone}` : ''"
          :title="`${entry.label}: ${entry.value}`"
        >
          <span>{{ entry.label }}</span>
          <strong>{{ entry.value }}</strong>
        </div>
      </div>
    </details>
  </div>
</template>
