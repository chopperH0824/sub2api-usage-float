<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  Boxes,
  BrainCircuit,
  Cloud,
  Gauge,
  Gem,
  Layers3,
  Orbit,
  Pin,
  Radar,
  RefreshCw,
  Settings2,
  Sparkles,
  X
} from '@lucide/vue'
import { DEFAULT_ACCOUNT_FLOAT } from '@shared/account-floats'
import { CAPACITY_DISPLAY_FIELDS, type DisplayPreset } from '@shared/display-fields'
import type {
  AccountDetailItem,
  AccountFloatPreference,
  AccountFloatSize,
  BootstrapPayload,
  CapacityMetric,
  DashboardSnapshot,
  DisplayFieldId
} from '@shared/types'
import {
  accountSeverity,
  accountSubtitle,
  getCapacityMetrics,
  getUsageWindows,
  runtimeBlocked
} from '@shared/usage'
import { getAccountDetailGroups, getTodayDisplayItems } from '@shared/account-details'
import { dashboardApi } from '../api'
import { formatCapacityValue, formatUpdatedTime } from '../formatters'
import AccountDetails from './AccountDetails.vue'
import DisplayFieldPicker from './DisplayFieldPicker.vue'
import UsageBar from './UsageBar.vue'

const props = defineProps<{ accountId: number }>()

const bootstrap = ref<BootstrapPayload | null>(null)
const snapshot = ref<DashboardSnapshot | null>(null)
const now = ref(Date.now())
const loading = ref(true)
const refreshing = ref(false)
const settingsOpen = ref(false)
const error = ref('')

let tickTimer: ReturnType<typeof setInterval> | null = null
let opacityTimer: ReturnType<typeof setTimeout> | null = null
let fieldsRefreshTimer: ReturnType<typeof setTimeout> | null = null
let removeDashboardListener: (() => void) | null = null
let removeSettingsListener: (() => void) | null = null

const preference = computed<AccountFloatPreference>(() => {
  return bootstrap.value?.settings.accountFloats[String(props.accountId)] || {
    ...DEFAULT_ACCOUNT_FLOAT,
    displayFields: [...DEFAULT_ACCOUNT_FLOAT.displayFields],
    open: true
  }
})
const selected = computed(() => new Set(preference.value.displayFields))
const account = computed(() => snapshot.value?.accounts.find((item) => item.id === props.accountId))
const usage = computed(() => snapshot.value?.usage[String(props.accountId)])
const todayStats = computed(() => snapshot.value?.todayStats?.[String(props.accountId)])
const accountStats = computed(() => snapshot.value?.accountStats?.[String(props.accountId)])
const windows = computed(() => account.value ? getUsageWindows(account.value, usage.value) : [])
const visibleWindowCount = computed(() => ({ small: 2, medium: 4, large: Number.POSITIVE_INFINITY })[preference.value.size])
const visibleWindows = computed(() => selected.value.has('usage-windows')
  ? windows.value.slice(0, visibleWindowCount.value)
  : [])
const capacities = computed<CapacityMetric[]>(() => account.value
  ? getCapacityMetrics(account.value).filter((metric) => {
      const field = CAPACITY_DISPLAY_FIELDS[metric.id]
      return field ? selected.value.has(field) : false
    })
  : [])
const todayItems = computed(() => getTodayDisplayItems(todayStats.value, preference.value.displayFields))
const detailGroups = computed(() => account.value
  ? getAccountDetailGroups(account.value, usage.value, accountStats.value, preference.value.displayFields)
  : [])
const facts = computed<AccountDetailItem[]>(() => [
  ...capacities.value.map((metric) => ({
    id: `capacity-${metric.id}`,
    label: metric.label,
    value: formatCapacityValue(metric),
    tone: capacityTone(metric) as AccountDetailItem['tone']
  })),
  ...todayItems.value
])
const hasDisplayData = computed(() => visibleWindows.value.length > 0 || facts.value.length > 0 || detailGroups.value.length > 0)
const severity = computed(() => account.value
  ? accountSeverity(
      account.value,
      windows.value,
      bootstrap.value?.settings.warningThreshold || 75,
      bootstrap.value?.settings.dangerThreshold || 90,
      now.value
    )
  : 'offline')
const subtitle = computed(() => account.value ? accountSubtitle(account.value, usage.value) : `账号 #${props.accountId}`)
const accountMessage = computed(() => {
  if (!account.value) return error.value
  return snapshot.value?.usageErrors[String(props.accountId)] ||
    usage.value?.error ||
    account.value.error_message ||
    account.value.temp_unschedulable_reason ||
    (snapshot.value?.dataErrors?.[String(props.accountId)]?.includes('当前服务器版本不支持')
      ? ''
      : snapshot.value?.dataErrors?.[String(props.accountId)]) ||
    ''
})
const opacityLabel = computed(() => `${Math.round(preference.value.opacity * 100)}%`)

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
const platformIcon = computed(() => platformIcons[account.value?.platform || ''] || Gauge)

const latestUpdatedAt = computed(() => {
  const values = windows.value
    .map((item) => item.updatedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
  if (!values.length) return usage.value?.updated_at || snapshot.value?.fetchedAt
  return new Date(Math.max(...values)).toISOString()
})

const statusLabel = computed(() => {
  if (!account.value) return loading.value ? '同步中' : '不可用'
  if (account.value.status === 'error') return '异常'
  if (account.value.status === 'inactive') return '停用'
  if (runtimeBlocked(account.value, now.value)) return '冷却中'
  if (!account.value.schedulable) return '已暂停'
  if (severity.value === 'danger') return '额度紧张'
  if (severity.value === 'warning') return '需关注'
  return '正常'
})

function cleanError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '')
}

function applyTheme(): void {
  document.documentElement.dataset.theme = bootstrap.value?.settings.theme || 'system'
}

function setLocalPreference(next: AccountFloatPreference): void {
  if (!bootstrap.value) return
  bootstrap.value = {
    ...bootstrap.value,
    settings: {
      ...bootstrap.value.settings,
      accountFloats: {
        ...bootstrap.value.settings.accountFloats,
        [String(props.accountId)]: next
      }
    }
  }
}

async function updatePreference(patch: Partial<AccountFloatPreference>): Promise<void> {
  try {
    setLocalPreference(await dashboardApi.updateAccountFloat(props.accountId, patch))
  } catch (value) {
    error.value = cleanError(value)
  }
}

async function selectSize(size: AccountFloatSize): Promise<void> {
  await updatePreference({ size })
}

async function handleSelectPreset(preset: DisplayPreset): Promise<void> {
  await updatePreference({
    displayFields: [...preset.fields],
    size: preset.floatSize
  })
  await refresh()
}

function selectDisplayFields(displayFields: DisplayFieldId[]): void {
  const next = [...displayFields]
  setLocalPreference({ ...preference.value, displayFields: next })
  if (fieldsRefreshTimer) clearTimeout(fieldsRefreshTimer)
  fieldsRefreshTimer = setTimeout(() => {
    fieldsRefreshTimer = null
    void updatePreference({ displayFields: next }).then(() => refresh())
  }, 180)
}

function queueOpacity(value: number): void {
  setLocalPreference({ ...preference.value, opacity: value })
  if (opacityTimer) clearTimeout(opacityTimer)
  opacityTimer = setTimeout(() => {
    opacityTimer = null
    void updatePreference({ opacity: value })
  }, 100)
}

function handleOpacityInput(event: Event): void {
  queueOpacity(Number((event.target as HTMLInputElement).value))
}

async function refresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  error.value = ''
  try {
    snapshot.value = await dashboardApi.refresh(false)
  } catch (value) {
    error.value = cleanError(value)
  } finally {
    refreshing.value = false
  }
}

function closeWindow(): void {
  void dashboardApi.closeAccountFloat(props.accountId)
}

function capacityTone(metric: CapacityMetric): string {
  const ratio = metric.limit > 0 ? metric.current / metric.limit : 0
  if (ratio >= 1) return 'danger'
  if (ratio >= 0.8) return 'warning'
  return 'neutral'
}

onMounted(async () => {
  document.documentElement.classList.add('is-account-float')
  tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
  removeDashboardListener = dashboardApi.onDashboardUpdated((next) => {
    snapshot.value = next
    loading.value = false
    error.value = ''
  })
  removeSettingsListener = dashboardApi.onSettingsChanged((settings) => {
    if (!bootstrap.value) return
    bootstrap.value = { ...bootstrap.value, settings }
    applyTheme()
  })

  try {
    bootstrap.value = await dashboardApi.bootstrap()
    applyTheme()
    snapshot.value = await dashboardApi.getLatestDashboard()
  } catch (value) {
    error.value = cleanError(value)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('is-account-float')
  if (tickTimer) clearInterval(tickTimer)
  if (opacityTimer) clearTimeout(opacityTimer)
  if (fieldsRefreshTimer) clearTimeout(fieldsRefreshTimer)
  removeDashboardListener?.()
  removeSettingsListener?.()
})
</script>

<template>
  <section
    class="account-float-shell"
    :class="[`account-float-shell--${severity}`, `account-float-shell--${preference.size}`, { 'is-settings-open': settingsOpen }]"
  >
    <header class="account-float__titlebar">
      <div class="account-float__provider" :class="`provider-mark--${account?.platform || 'unknown'}`">
        <component :is="platformIcon" :size="15" :stroke-width="2" />
      </div>
      <div class="account-float__identity">
        <div>
          <strong :title="account?.name">{{ account?.name || `账号 #${accountId}` }}</strong>
          <span class="account-float__status" :class="`account-float__status--${severity}`">{{ statusLabel }}</span>
        </div>
        <small :title="subtitle">{{ subtitle }}</small>
      </div>
      <div class="account-float__actions no-drag">
        <button
          type="button"
          :class="{ 'is-active': preference.alwaysOnTop }"
          :aria-label="preference.alwaysOnTop ? '取消置顶' : '置顶浮窗'"
          @click="updatePreference({ alwaysOnTop: !preference.alwaysOnTop })"
        >
          <Pin :size="13" :fill="preference.alwaysOnTop ? 'currentColor' : 'none'" />
        </button>
        <button type="button" aria-label="刷新账号" :disabled="refreshing" @click="refresh">
          <RefreshCw :size="13" :class="{ 'is-spinning': refreshing }" />
        </button>
        <button type="button" :class="{ 'is-active': settingsOpen }" aria-label="浮窗设置" @click="settingsOpen = !settingsOpen">
          <Settings2 :size="13" />
        </button>
        <button type="button" aria-label="关闭浮窗" @click="closeWindow"><X :size="14" /></button>
      </div>
    </header>

    <div v-if="settingsOpen" class="account-float__settings no-drag">
      <div class="account-float__settings-controls">
        <label class="account-float__range">
          <span>透明度</span>
          <input
            :value="preference.opacity"
            type="range"
            min="0.45"
            max="1"
            step="0.01"
            @input="handleOpacityInput"
          />
          <strong>{{ opacityLabel }}</strong>
        </label>
        <div class="account-float__setting-row">
          <span>尺寸</span>
          <div class="segmented-control account-float__sizes" aria-label="浮窗尺寸">
            <button type="button" :class="{ 'is-active': preference.size === 'small' }" @click="selectSize('small')">小</button>
            <button type="button" :class="{ 'is-active': preference.size === 'medium' }" @click="selectSize('medium')">中</button>
            <button type="button" :class="{ 'is-active': preference.size === 'large' }" @click="selectSize('large')">大</button>
          </div>
        </div>
      </div>
      <DisplayFieldPicker
        :model-value="preference.displayFields"
        :default-fields="[...DEFAULT_ACCOUNT_FLOAT.displayFields]"
        compact
        @update:model-value="selectDisplayFields"
        @select-preset="handleSelectPreset"
      />
    </div>

    <template v-else>
      <div v-if="loading" class="account-float__loading"><span class="spinner" /></div>
      <div v-else-if="account" class="account-float__content">
        <p v-if="accountMessage" class="account-float__message" :title="accountMessage">{{ accountMessage }}</p>

        <div v-if="visibleWindows.length" class="account-float__usage">
          <UsageBar
            v-for="window in visibleWindows"
            :key="window.id"
            :window="window"
            :now="now"
            :display-fields="preference.displayFields"
            :warning-threshold="bootstrap?.settings.warningThreshold || 75"
            :danger-threshold="bootstrap?.settings.dangerThreshold || 90"
          />
        </div>

        <div v-if="facts.length" class="account-float__facts">
          <span
            v-for="entry in facts"
            :key="entry.id"
            :class="entry.tone ? `is-${entry.tone}` : ''"
            :title="`${entry.label} ${entry.value}`"
          >
            {{ entry.label }} <strong>{{ entry.value }}</strong>
          </span>
        </div>

        <AccountDetails
          v-if="detailGroups.length"
          :groups="detailGroups"
          :compact="preference.size === 'small'"
        />

        <div v-if="!hasDisplayData" class="account-float__empty">
          {{ accountMessage || '未选择可用数据项' }}
        </div>

        <footer v-if="selected.has('usage-sample')" class="account-float__footer">
          <span>{{ usage?.source === 'passive' ? '被动采样' : usage?.source === 'active' ? '主动采样' : '本地快照' }}</span>
          <span class="account-float__updated">{{ formatUpdatedTime(latestUpdatedAt, now) }}</span>
        </footer>
      </div>
      <div v-else class="account-float__unavailable">
        <strong>账号暂不可用</strong>
        <span>{{ error || '等待下一次同步' }}</span>
      </div>
    </template>

    <div class="account-float__resize-corner" aria-hidden="true" />
  </section>
</template>
