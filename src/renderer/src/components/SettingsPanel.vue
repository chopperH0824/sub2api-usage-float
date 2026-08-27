<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  ExternalLink,
  LogOut,
  MonitorCog,
  Pin,
  RefreshCw,
  SunMoon,
  X
} from '@lucide/vue'
import type { AppSettings, ConnectionState, PublicSettings, ThemeMode } from '@shared/types'

const props = defineProps<{
  open: boolean
  settings: PublicSettings
  connection: ConnectionState
}>()

const emit = defineEmits<{
  close: []
  save: [patch: Partial<AppSettings>]
  disconnect: []
  openServer: []
}>()

const draft = reactive<AppSettings>({ ...props.settings, windowBounds: { ...props.settings.windowBounds } })

watch(
  () => [props.open, props.settings] as const,
  () => Object.assign(draft, props.settings, { windowBounds: { ...props.settings.windowBounds } }),
  { deep: true }
)

const opacityLabel = computed(() => `${Math.round(draft.opacity * 100)}%`)

function selectTheme(theme: ThemeMode): void {
  draft.theme = theme
}

function save(): void {
  emit('save', {
    refreshIntervalSeconds: draft.refreshIntervalSeconds,
    alwaysOnTop: draft.alwaysOnTop,
    launchAtLogin: draft.launchAtLogin,
    compactMode: draft.compactMode,
    opacity: draft.opacity,
    warningThreshold: draft.warningThreshold,
    dangerThreshold: draft.dangerThreshold,
    theme: draft.theme
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="panel">
      <div v-if="open" class="settings-overlay" @mousedown.self="emit('close')">
        <section class="settings-panel" role="dialog" aria-modal="true" aria-label="看板设置">
          <header class="settings-panel__header">
            <div>
              <h2>看板设置</h2>
              <p>{{ connection.serverVersion || 'Sub2API' }}</p>
            </div>
            <button type="button" class="icon-button" aria-label="关闭设置" @click="emit('close')">
              <X :size="17" />
            </button>
          </header>

          <div class="settings-panel__body">
            <div class="settings-section">
              <div class="settings-section__title"><RefreshCw :size="15" /><span>数据刷新</span></div>
              <div class="segmented-control settings-intervals" aria-label="刷新间隔">
                <button
                  v-for="option in [15, 30, 60, 120, 300]"
                  :key="option"
                  type="button"
                  :class="{ 'is-active': draft.refreshIntervalSeconds === option }"
                  @click="draft.refreshIntervalSeconds = option"
                >
                  {{ option < 60 ? `${option}s` : `${option / 60}m` }}
                </button>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section__title"><MonitorCog :size="15" /><span>窗口</span></div>
              <label class="settings-toggle-row">
                <span><Pin :size="14" />始终置顶</span>
                <input v-model="draft.alwaysOnTop" type="checkbox" />
                <i class="toggle-switch" aria-hidden="true" />
              </label>
              <label class="settings-toggle-row">
                <span><MonitorCog :size="14" />紧凑模式</span>
                <input v-model="draft.compactMode" type="checkbox" />
                <i class="toggle-switch" aria-hidden="true" />
              </label>
              <label class="settings-toggle-row">
                <span><RefreshCw :size="14" />登录时启动</span>
                <input v-model="draft.launchAtLogin" type="checkbox" />
                <i class="toggle-switch" aria-hidden="true" />
              </label>
              <label class="range-row">
                <span>透明度</span>
                <input v-model.number="draft.opacity" type="range" min="0.72" max="1" step="0.01" />
                <strong>{{ opacityLabel }}</strong>
              </label>
            </div>

            <div class="settings-section">
              <div class="settings-section__title"><SunMoon :size="15" /><span>外观</span></div>
              <div class="segmented-control segmented-control--wide" aria-label="外观模式">
                <button type="button" :class="{ 'is-active': draft.theme === 'system' }" @click="selectTheme('system')">系统</button>
                <button type="button" :class="{ 'is-active': draft.theme === 'light' }" @click="selectTheme('light')">浅色</button>
                <button type="button" :class="{ 'is-active': draft.theme === 'dark' }" @click="selectTheme('dark')">深色</button>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section__title"><MonitorCog :size="15" /><span>告警阈值</span></div>
              <label class="range-row">
                <span>关注</span>
                <input v-model.number="draft.warningThreshold" type="range" min="50" :max="draft.dangerThreshold - 1" step="1" />
                <strong>{{ draft.warningThreshold }}%</strong>
              </label>
              <label class="range-row">
                <span>紧张</span>
                <input v-model.number="draft.dangerThreshold" type="range" :min="draft.warningThreshold + 1" max="100" step="1" />
                <strong>{{ draft.dangerThreshold }}%</strong>
              </label>
            </div>

            <div class="settings-section settings-connection">
              <div class="settings-section__title"><MonitorCog :size="15" /><span>连接</span></div>
              <button type="button" class="server-link" @click="emit('openServer')">
                <span>
                  <strong>{{ connection.displayName || '管理员' }}</strong>
                  <small>{{ connection.serverUrl }}</small>
                </span>
                <ExternalLink :size="15" />
              </button>
              <button type="button" class="danger-text-button" @click="emit('disconnect')">
                <LogOut :size="14" />断开连接
              </button>
            </div>
          </div>

          <footer class="settings-panel__footer">
            <button type="button" class="secondary-button" @click="emit('close')">取消</button>
            <button type="button" class="primary-button primary-button--compact" @click="save">完成</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
