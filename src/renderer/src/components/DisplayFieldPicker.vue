<script setup lang="ts">
import { computed } from 'vue'
import { CheckCheck, RotateCcw, Square } from '@lucide/vue'
import {
  ALL_DISPLAY_FIELDS,
  DEFAULT_DISPLAY_FIELDS,
  DISPLAY_FIELD_GROUPS,
  normalizeDisplayFields
} from '@shared/display-fields'
import type { DisplayFieldId } from '@shared/types'

const props = withDefaults(defineProps<{
  modelValue: DisplayFieldId[]
  defaultFields?: DisplayFieldId[]
  compact?: boolean
}>(), {
  defaultFields: () => [...DEFAULT_DISPLAY_FIELDS],
  compact: false
})

const emit = defineEmits<{
  'update:modelValue': [value: DisplayFieldId[]]
}>()

const selected = computed(() => new Set(props.modelValue))
const selectedCount = computed(() => selected.value.size)

function commit(values: Iterable<DisplayFieldId>): void {
  emit('update:modelValue', normalizeDisplayFields([...values], []))
}

function toggleField(field: DisplayFieldId): void {
  const next = new Set(selected.value)
  if (next.has(field)) next.delete(field)
  else next.add(field)
  commit(next)
}

function toggleGroup(fields: readonly DisplayFieldId[]): void {
  const next = new Set(selected.value)
  const complete = fields.every((field) => next.has(field))
  for (const field of fields) {
    if (complete) next.delete(field)
    else next.add(field)
  }
  commit(next)
}

function selectDefault(): void {
  commit(props.defaultFields)
}

function selectAll(): void {
  commit(ALL_DISPLAY_FIELDS)
}

function clearAll(): void {
  commit([])
}
</script>

<template>
  <div class="field-picker" :class="{ 'field-picker--compact': compact }">
    <header class="field-picker__toolbar">
      <span><strong>{{ selectedCount }}</strong>/{{ ALL_DISPLAY_FIELDS.length }}</span>
      <div>
        <button type="button" title="恢复默认显示项" aria-label="恢复默认显示项" @click="selectDefault">
          <RotateCcw :size="compact ? 11 : 13" />
          <span v-if="!compact">默认</span>
        </button>
        <button type="button" title="选择全部显示项" aria-label="选择全部显示项" @click="selectAll">
          <CheckCheck :size="compact ? 11 : 13" />
          <span v-if="!compact">全选</span>
        </button>
        <button type="button" title="清空显示项" aria-label="清空显示项" @click="clearAll">
          <Square :size="compact ? 10 : 12" />
          <span v-if="!compact">清空</span>
        </button>
      </div>
    </header>

    <section v-for="group in DISPLAY_FIELD_GROUPS" :key="group.id" class="field-picker__group">
      <button
        type="button"
        class="field-picker__group-toggle"
        :aria-label="`切换${group.label}`"
        @click="toggleGroup(group.options.map((option) => option.id))"
      >
        <span>{{ group.label }}</span>
        <small>{{ group.options.filter((option) => selected.has(option.id)).length }}/{{ group.options.length }}</small>
      </button>
      <div class="field-picker__options">
        <label
          v-for="option in group.options"
          :key="option.id"
          class="field-picker__option"
          :title="option.description"
        >
          <input
            type="checkbox"
            :checked="selected.has(option.id)"
            @change="toggleField(option.id)"
          />
          <i aria-hidden="true" />
          <span>{{ option.label }}</span>
        </label>
      </div>
    </section>
  </div>
</template>
