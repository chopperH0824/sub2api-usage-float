<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  ChevronsDownUp,
  ChevronsUpDown,
  ChartColumn,
  CircleCheck,
  CircleDollarSign,
  ExternalLink,
  LayoutDashboard,
  Network,
  Pin,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Unplug,
  X,
  Zap
} from '@lucide/vue'
import type {
  AccountFloatPreference,
  AccountSeverity,
  BootstrapPayload,
  ConnectResult,
  ConnectionState,
  DashboardSnapshot,
  PublicSettings,
  Sub2ApiAccount
} from '@shared/types'
import { accountSeverity, accountSubtitle, getUsageWindows, platformLabel } from '@shared/usage'
import { DEFAULT_DISPLAY_FIELDS, DISPLAY_PRESETS, type DisplayPreset } from '@shared/display-fields'
import { dashboardApi } from './api'
import AccountCard from './components/AccountCard.vue'
import AccountFloatView from './components/AccountFloatView.vue'
import ConnectionView from './components/ConnectionView.vue'
import SettingsPanel from './components/SettingsPanel.vue'

type StatusFilter = 'all' | 'attention' | 'offline'
type SortMode = 'attention' | 'usage' | 'name'

const query = new URLSearchParams(window.location.search)
const previewBootScreen = import.meta.env.DEV && query.get('screen') === 'boot'
const parsedFloatAccountId = Number(query.get('accountId'))
const floatAccountId = query.get('view') === 'account-float' && Number.isInteger(parsedFloatAccountId)
  ? parsedFloatAccountId
  : 0

interface AccountViewModel {
  account: Sub2ApiAccount
  severity: AccountSeverity
  maxUsage: number
}

const bootstrap = ref<BootstrapPayload | null>(null)
const snapshot = ref<DashboardSnapshot | null>(null)
const bootstrapping = ref(true)
const refreshing = ref(false)
const refreshError = ref('')
const settingsOpen = ref(false)
const now = ref(Date.now())
const nextRefreshAt = ref(0)
const searchQuery = ref('')
const platformFilter = ref('all')
const statusFilter = ref<StatusFilter>('all')
const sortMode = ref<SortMode>('attention')

let tickTimer: ReturnType<typeof setInterval> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let removeRefreshListener: (() => void) | null = null
let removeDashboardListener: (() => void) | null = null
let removeSettingsListener: (() => void) | null = null

const fallbackSettings: PublicSettings = {
  serverUrl: '',
  authMethod: 'api-key',
  email: '',
  refreshIntervalSeconds: 60,
  alwaysOnTop: true,
  launchAtLogin: false,
  compactMode: false,
  opacity: 1,
  warningThreshold: 75,
  dangerThreshold: 90,
  theme: 'system',
  windowBounds: { width: 468, height: 760 },
  displayFields: [...DEFAULT_DISPLAY_FIELDS],
  accountFloats: {},
  hasSavedCredential: false,
  secureStorageAvailable: false
}

const settings = computed(() => bootstrap.value?.settings || fallbackSettings)
const connection = computed<ConnectionState>(() => bootstrap.value?.connection || {
  connected: false,
  serverUrl: '',
  authMethod: 'api-key'
})
const accounts = computed(() => snapshot.value?.accounts || [])

const platformOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const account of accounts.value) counts.set(account.platform, (counts.get(account.platform) || 0) + 1)
  return [...counts.entries()]
    .sort((left, right) => platformLabel(left[0]).localeCompare(platformLabel(right[0]), 'zh-CN'))
    .map(([value, count]) => ({ value, label: platformLabel(value), count }))
})

const accountModels = computed<AccountViewModel[]>(() => accounts.value.map((account) => {
  const usage = snapshot.value?.usage[String(account.id)]
  const windows = getUsageWindows(account, usage)
  return {
    account,
    severity: accountSeverity(
      account,
      windows,
      settings.value.warningThreshold,
      settings.value.dangerThreshold,
      now.value
    ),
    maxUsage: windows.reduce((max, window) => Math.max(max, window.usedPercent), 0)
  }
}))

const severityRank: Record<AccountSeverity, number> = {
  offline: 0,
  danger: 1,
  warning: 2,
  healthy: 3
}

const visibleAccounts = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('zh-CN')
  return accountModels.value
    .filter(({ account, severity }) => {
      if (platformFilter.value !== 'all' && account.platform !== platformFilter.value) return false
      if (statusFilter.value === 'offline' && severity !== 'offline') return false
      if (statusFilter.value === 'attention' && !['danger', 'warning'].includes(severity)) return false
      if (!query) return true
      const haystack = [
        account.name,
        account.platform,
        platformLabel(account.platform),
        accountSubtitle(account, snapshot.value?.usage[String(account.id)])
      ].join(' ').toLocaleLowerCase('zh-CN')
      return haystack.includes(query)
    })
    .sort((left, right) => {
      if (sortMode.value === 'name') return left.account.name.localeCompare(right.account.name, 'zh-CN')
      if (sortMode.value === 'usage') return right.maxUsage - left.maxUsage || left.account.name.localeCompare(right.account.name, 'zh-CN')
      return severityRank[left.severity] - severityRank[right.severity] ||
        right.maxUsage - left.maxUsage ||
        left.account.name.localeCompare(right.account.name, 'zh-CN')
    })
})

const summary = computed(() => accountModels.value.reduce((result, item) => {
  result.total += 1
  if (item.severity === 'healthy') result.healthy += 1
  else if (item.severity === 'offline') result.offline += 1
  else result.attention += 1
  return result
}, { total: 0, healthy: 0, attention: 0, offline: 0 }))

const serverHost = computed(() => {
  try {
    return new URL(connection.value.serverUrl).host
  } catch {
    return connection.value.serverUrl || 'Sub2API'
  }
})

const nextRefreshText = computed(() => {
  if (refreshing.value) return '同步中'
  if (!nextRefreshAt.value) return '等待同步'
  const seconds = Math.max(0, Math.ceil((nextRefreshAt.value - now.value) / 1000))
  return `${seconds}s 后刷新`
})

function cleanError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '')
}

function applyTheme(): void {
  document.documentElement.dataset.theme = settings.value.theme
  document.documentElement.dataset.platform = bootstrap.value?.platform || 'macos'
}

function scheduleRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer)
  refreshTimer = null
  if (!connection.value.connected) return
  const interval = Math.max(15, settings.value.refreshIntervalSeconds) * 1000
  nextRefreshAt.value = Date.now() + interval
  refreshTimer = setInterval(() => {
    void refreshData(true)
  }, interval)
}

async function refreshData(silent = false): Promise<void> {
  if (refreshing.value || !connection.value.connected) return
  refreshing.value = true
  if (!silent) refreshError.value = ''
  try {
    snapshot.value = await dashboardApi.refresh(false)
    refreshError.value = ''
    nextRefreshAt.value = Date.now() + settings.value.refreshIntervalSeconds * 1000
  } catch (value) {
    refreshError.value = cleanError(value)
  } finally {
    refreshing.value = false
  }
}

async function loadBootstrap(): Promise<void> {
  bootstrapping.value = true
  try {
    bootstrap.value = await dashboardApi.bootstrap()
    applyTheme()
    if (connection.value.connected) await refreshData(false)
    scheduleRefresh()
  } catch (value) {
    refreshError.value = cleanError(value)
  } finally {
    bootstrapping.value = false
  }
}

async function handleConnected(_result: ConnectResult): Promise<void> {
  bootstrap.value = await dashboardApi.bootstrap()
  snapshot.value = null
  refreshError.value = ''
  await refreshData(false)
  scheduleRefresh()
}

async function toggleAlwaysOnTop(): Promise<void> {
  if (!bootstrap.value) return
  const value = !settings.value.alwaysOnTop
  await dashboardApi.setAlwaysOnTop(value)
  bootstrap.value.settings = { ...settings.value, alwaysOnTop: value }
}

async function toggleCompactMode(): Promise<void> {
  if (!bootstrap.value) return
  const value = !settings.value.compactMode
  await dashboardApi.setCompactMode(value)
  bootstrap.value.settings = { ...settings.value, compactMode: value }
}

async function saveSettings(patch: Partial<PublicSettings>): Promise<void> {
  if (!bootstrap.value) return
  bootstrap.value.settings = await dashboardApi.updateSettings(patch)
  settingsOpen.value = false
  applyTheme()
  await refreshData(false)
  scheduleRefresh()
}

async function disconnect(): Promise<void> {
  bootstrap.value = await dashboardApi.disconnect()
  snapshot.value = null
  settingsOpen.value = false
  scheduleRefresh()
}

function applyAccountFloatPreference(accountId: number, preference: AccountFloatPreference): void {
  if (!bootstrap.value) return
  bootstrap.value.settings = {
    ...bootstrap.value.settings,
    accountFloats: {
      ...bootstrap.value.settings.accountFloats,
      [String(accountId)]: preference
    }
  }
}

function isAccountFloatOpen(accountId: number): boolean {
  return Boolean(settings.value.accountFloats[String(accountId)]?.open)
}

async function toggleAccountFloat(accountId: number): Promise<void> {
  try {
    const preference = isAccountFloatOpen(accountId)
      ? await dashboardApi.closeAccountFloat(accountId)
      : await dashboardApi.openAccountFloat(accountId)
    applyAccountFloatPreference(accountId, preference)
  } catch (value) {
    refreshError.value = cleanError(value)
  }
}

const presetIcons: Record<string, unknown> = {
  Zap,
  LayoutDashboard,
  CircleDollarSign,
  Network,
  ChartColumn
}

function getPresetIcon(name: string): unknown {
  return presetIcons[name] || LayoutDashboard
}

function isPresetActive(preset: DisplayPreset): boolean {
  if (preset.fields.length !== settings.value.displayFields.length) return false
  const set = new Set(settings.value.displayFields)
  return preset.fields.every((field) => set.has(field))
}

async function applyDisplayPreset(preset: DisplayPreset): Promise<void> {
  const currentSettings = settings.value
  const nextSettings = {
    ...currentSettings,
    displayFields: [...preset.fields]
  }
  if (bootstrap.value) {
    bootstrap.value.settings = nextSettings
  }
  await dashboardApi.updateSettings({ displayFields: [...preset.fields] })
  await dashboardApi.resizeWindow(preset.dashboardSize)
  await refreshData(false)
}

function clearFilters(): void {
  searchQuery.value = ''
  platformFilter.value = 'all'
  statusFilter.value = 'all'
}

watch(() => settings.value.theme, applyTheme)

onMounted(() => {
  if (floatAccountId || previewBootScreen) return
  tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
  removeRefreshListener = dashboardApi.onRefreshRequested(() => { void refreshData(false) })
  removeDashboardListener = dashboardApi.onDashboardUpdated((next) => {
    snapshot.value = next
    refreshError.value = ''
  })
  removeSettingsListener = dashboardApi.onSettingsChanged((next) => {
    if (!bootstrap.value) return
    bootstrap.value.settings = next
    applyTheme()
  })
  void loadBootstrap()
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  removeRefreshListener?.()
  removeDashboardListener?.()
  removeSettingsListener?.()
})
</script>

<template>
  <AccountFloatView v-if="floatAccountId" :account-id="floatAccountId" />
  <div v-else class="app-shell" :class="{ 'is-compact': settings.compactMode }">
    <div v-if="bootstrapping" class="boot-screen">
      <div class="boot-screen__visual" aria-hidden="true">
        <div class="boot-screen__trace-mask">
          <img src="./assets/boot-trace.png" alt="" class="boot-screen__trace" />
        </div>
      </div>
      <span class="boot-screen__title">Sub2API 用量浮窗</span>
      <span class="boot-screen__hint"><i aria-hidden="true" />正在同步账号状态</span>
    </div>

    <template v-else-if="!connection.connected">
      <div class="disconnected-drag-region" />
      <ConnectionView
        :settings="settings"
        :initial-error="connection.error || refreshError"
        @connected="handleConnected"
      />
    </template>

    <template v-else>
      <header class="titlebar">
        <button type="button" class="titlebar__brand no-drag" title="打开 Sub2API 后台" @click="dashboardApi.openServer">
          <img src="./assets/app-icon.png" alt="" class="titlebar__brand-icon" />
          <span class="titlebar__identity">
            <strong>用量浮窗</strong>
            <small><i />{{ serverHost }}</small>
          </span>
          <ExternalLink :size="11" class="titlebar__external" />
        </button>

        <div class="titlebar__actions no-drag">
          <button
            type="button"
            class="icon-button"
            :class="{ 'is-active': settings.alwaysOnTop }"
            :aria-label="settings.alwaysOnTop ? '取消置顶' : '窗口置顶'"
            @click="toggleAlwaysOnTop"
          >
            <Pin :size="16" :fill="settings.alwaysOnTop ? 'currentColor' : 'none'" />
          </button>
          <button
            type="button"
            class="icon-button"
            :aria-label="settings.compactMode ? '展开窗口' : '紧凑模式'"
            @click="toggleCompactMode"
          >
            <ChevronsUpDown v-if="settings.compactMode" :size="16" />
            <ChevronsDownUp v-else :size="16" />
          </button>
          <button type="button" class="icon-button" aria-label="刷新数据" :disabled="refreshing" @click="refreshData(false)">
            <RefreshCw :size="16" :class="{ 'is-spinning': refreshing }" />
          </button>
          <button type="button" class="icon-button" aria-label="看板设置" @click="settingsOpen = true">
            <Settings :size="16" />
          </button>
        </div>
      </header>

      <section class="summary-band" aria-label="账号概览">
        <div class="summary-item">
          <span>账号</span><strong>{{ summary.total }}</strong>
        </div>
        <div class="summary-item summary-item--healthy">
          <span><CircleCheck :size="12" />正常</span><strong>{{ summary.healthy }}</strong>
        </div>
        <div class="summary-item summary-item--warning">
          <span><AlertTriangle :size="12" />关注</span><strong>{{ summary.attention }}</strong>
        </div>
        <div class="summary-item summary-item--offline">
          <span><Unplug :size="12" />阻断</span><strong>{{ summary.offline }}</strong>
        </div>
      </section>

      <section class="filter-band">
        <div class="preset-strip" aria-label="快捷预设">
          <button
            v-for="preset in DISPLAY_PRESETS"
            :key="preset.id"
            type="button"
            class="preset-chip"
            :class="{ 'is-active': isPresetActive(preset) }"
            :title="`${preset.label}模式：${preset.description}`"
            @click="applyDisplayPreset(preset)"
          >
            <component :is="getPresetIcon(preset.iconName)" :size="12" />
            <span>{{ preset.label }}</span>
          </button>
        </div>

        <div class="search-box">
          <Search :size="15" />
          <input v-model="searchQuery" type="search" placeholder="搜索账号" aria-label="搜索账号" />
          <button v-if="searchQuery" type="button" aria-label="清空搜索" @click="searchQuery = ''"><X :size="13" /></button>
        </div>
        <div class="filter-row">
          <div class="segmented-control status-filter" aria-label="状态筛选">
            <button type="button" :class="{ 'is-active': statusFilter === 'all' }" @click="statusFilter = 'all'">全部</button>
            <button type="button" :class="{ 'is-active': statusFilter === 'attention' }" @click="statusFilter = 'attention'">告警</button>
            <button type="button" :class="{ 'is-active': statusFilter === 'offline' }" @click="statusFilter = 'offline'">阻断</button>
          </div>
          <label class="select-shell">
            <span class="sr-only">平台筛选</span>
            <select v-model="platformFilter">
              <option value="all">全部平台</option>
              <option v-for="option in platformOptions" :key="option.value" :value="option.value">
                {{ option.label }} · {{ option.count }}
              </option>
            </select>
          </label>
          <label class="select-shell select-shell--sort">
            <SlidersHorizontal :size="13" />
            <span class="sr-only">排序方式</span>
            <select v-model="sortMode">
              <option value="attention">优先级</option>
              <option value="usage">用量</option>
              <option value="name">名称</option>
            </select>
          </label>
        </div>
      </section>

      <div v-if="refreshError" class="error-banner" role="alert">
        <AlertTriangle :size="14" />
        <span>{{ refreshError }}</span>
        <button type="button" aria-label="关闭错误提示" @click="refreshError = ''"><X :size="13" /></button>
      </div>

      <main class="account-list">
        <template v-if="!snapshot && refreshing">
          <div v-for="index in 3" :key="index" class="account-skeleton">
            <div class="skeleton-line skeleton-line--title" />
            <div class="skeleton-line" />
            <div class="skeleton-track" />
            <div class="skeleton-line" />
            <div class="skeleton-track" />
          </div>
        </template>

        <template v-else-if="visibleAccounts.length">
          <AccountCard
            v-for="item in visibleAccounts"
            :key="item.account.id"
            :account="item.account"
            :usage="snapshot?.usage[String(item.account.id)]"
            :usage-error="snapshot?.usageErrors[String(item.account.id)]"
            :data-error="snapshot?.dataErrors?.[String(item.account.id)]"
            :today-stats="snapshot?.todayStats?.[String(item.account.id)]"
            :account-stats="snapshot?.accountStats?.[String(item.account.id)]"
            :display-fields="settings.displayFields"
            :now="now"
            :warning-threshold="settings.warningThreshold"
            :danger-threshold="settings.dangerThreshold"
            :compact="settings.compactMode"
            :floated="isAccountFloatOpen(item.account.id)"
            @toggle-float="toggleAccountFloat(item.account.id)"
          />
        </template>

        <div v-else class="empty-state">
          <Search :size="24" />
          <strong>没有匹配的账号</strong>
          <button type="button" class="text-button" @click="clearFilters">清除筛选</button>
        </div>
      </main>

      <footer class="statusbar">
        <span><i :class="{ 'is-refreshing': refreshing }" />{{ nextRefreshText }}</span>
        <span>{{ snapshot?.serverVersion || connection.serverVersion || 'Sub2API' }}</span>
      </footer>

      <SettingsPanel
        :open="settingsOpen"
        :settings="settings"
        :connection="connection"
        @close="settingsOpen = false"
        @save="saveSettings"
        @disconnect="disconnect"
        @open-server="dashboardApi.openServer"
      />
    </template>
  </div>
</template>
