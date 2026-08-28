<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff, KeyRound, LockKeyhole, Server, ShieldCheck } from '@lucide/vue'
import type { AuthMethod, ConnectResult, PublicSettings } from '@shared/types'
import { dashboardApi } from '../api'
import appIcon from '../assets/app-icon.png'

const props = defineProps<{
  settings: PublicSettings
  initialError?: string
}>()

const emit = defineEmits<{
  connected: [result: ConnectResult]
}>()

const authMethod = ref<AuthMethod>(props.settings.authMethod)
const serverUrl = ref(props.settings.serverUrl)
const email = ref(props.settings.email)
const password = ref('')
const apiKey = ref('')
const twoFactorCode = ref('')
const twoFactorEmail = ref('')
const needsTwoFactor = ref(false)
const revealSecret = ref(false)
const loading = ref(false)
const error = ref(props.initialError || '')

const credentialValue = computed(() => authMethod.value === 'api-key' ? apiKey.value : password.value)

function errorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '')
}

function chooseMethod(method: AuthMethod): void {
  authMethod.value = method
  revealSecret.value = false
  error.value = ''
}

async function submit(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = authMethod.value === 'api-key'
      ? await dashboardApi.connect({
          authMethod: 'api-key',
          serverUrl: serverUrl.value,
          apiKey: apiKey.value
        })
      : await dashboardApi.connect({
          authMethod: 'password',
          serverUrl: serverUrl.value,
          email: email.value,
          password: password.value
        })
    if (result.status === 'requires-2fa') {
      needsTwoFactor.value = true
      twoFactorEmail.value = result.emailMasked
      password.value = ''
      return
    }
    emit('connected', result)
  } catch (value) {
    error.value = errorMessage(value)
  } finally {
    loading.value = false
  }
}

async function submitTwoFactor(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await dashboardApi.completeTwoFactor({ code: twoFactorCode.value })
    emit('connected', result)
  } catch (value) {
    error.value = errorMessage(value)
  } finally {
    loading.value = false
  }
}

async function retrySavedConnection(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const connection = await dashboardApi.retrySavedConnection()
    if (!connection.connected) throw new Error(connection.error || '已保存凭据不可用')
    emit('connected', { status: 'connected', connection })
  } catch (value) {
    error.value = errorMessage(value)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="connection-view">
    <div class="connection-view__brand">
      <img :src="appIcon" alt="" class="connection-view__icon" />
      <div>
        <h1>Sub2API 用量</h1>
        <p>桌面浮窗</p>
      </div>
    </div>

    <form v-if="!needsTwoFactor" class="connection-form" @submit.prevent="submit">
      <div class="segmented-control segmented-control--wide" aria-label="认证方式">
        <button
          type="button"
          :class="{ 'is-active': authMethod === 'api-key' }"
          @click="chooseMethod('api-key')"
        >
          <KeyRound :size="15" />API Key
        </button>
        <button
          type="button"
          :class="{ 'is-active': authMethod === 'password' }"
          @click="chooseMethod('password')"
        >
          <ShieldCheck :size="15" />账号登录
        </button>
      </div>

      <label class="field-label" for="server-url">服务器地址</label>
      <div class="input-shell">
        <Server :size="16" />
        <input
          id="server-url"
          v-model="serverUrl"
          type="url"
          inputmode="url"
          autocomplete="url"
          placeholder="https://sub2api.example.com"
          required
        />
      </div>

      <template v-if="authMethod === 'api-key'">
        <label class="field-label" for="api-key">Admin API Key</label>
        <div class="input-shell">
          <KeyRound :size="16" />
          <input
            id="api-key"
            v-model="apiKey"
            :type="revealSecret ? 'text' : 'password'"
            autocomplete="off"
            placeholder="admin-••••••••"
            required
          />
          <button
            type="button"
            class="input-action"
            :aria-label="revealSecret ? '隐藏 API Key' : '显示 API Key'"
            @click="revealSecret = !revealSecret"
          >
            <EyeOff v-if="revealSecret" :size="15" />
            <Eye v-else :size="15" />
          </button>
        </div>
      </template>

      <template v-else>
        <label class="field-label" for="admin-email">管理员邮箱</label>
        <div class="input-shell">
          <ShieldCheck :size="16" />
          <input
            id="admin-email"
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="admin@example.com"
            required
          />
        </div>

        <label class="field-label" for="admin-password">密码</label>
        <div class="input-shell">
          <LockKeyhole :size="16" />
          <input
            id="admin-password"
            v-model="password"
            :type="revealSecret ? 'text' : 'password'"
            autocomplete="current-password"
            required
          />
          <button
            type="button"
            class="input-action"
            :aria-label="revealSecret ? '隐藏密码' : '显示密码'"
            @click="revealSecret = !revealSecret"
          >
            <EyeOff v-if="revealSecret" :size="15" />
            <Eye v-else :size="15" />
          </button>
        </div>
      </template>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <button type="submit" class="primary-button" :disabled="loading || !credentialValue">
        <span v-if="loading" class="spinner" aria-hidden="true" />
        <Server v-else :size="16" />
        {{ loading ? '连接中' : '连接服务器' }}
      </button>

      <button
        v-if="settings.hasSavedCredential"
        type="button"
        class="text-button saved-credential-button"
        :disabled="loading"
        @click="retrySavedConnection"
      >
        使用已保存凭据重试
      </button>

      <p class="secure-storage-state">
        <LockKeyhole :size="13" />
        {{ settings.secureStorageAvailable ? '凭据由系统钥匙串保护' : '凭据仅保留至本次退出' }}
      </p>
    </form>

    <form v-else class="connection-form connection-form--2fa" @submit.prevent="submitTwoFactor">
      <div class="verification-mark"><ShieldCheck :size="24" /></div>
      <div class="verification-title">
        <h2>二次验证</h2>
        <p>{{ twoFactorEmail }}</p>
      </div>
      <label class="field-label" for="totp-code">6 位验证码</label>
      <input
        id="totp-code"
        v-model="twoFactorCode"
        class="totp-input"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        pattern="[0-9]{6}"
        autofocus
        required
      />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="submit" class="primary-button" :disabled="loading || twoFactorCode.length !== 6">
        <span v-if="loading" class="spinner" aria-hidden="true" />
        <ShieldCheck v-else :size="16" />
        验证并连接
      </button>
      <button type="button" class="text-button" @click="needsTwoFactor = false; twoFactorCode = ''; error = ''">
        返回登录
      </button>
    </form>
  </main>
</template>

<style scoped>
.connection-view {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 58px 36px 30px;
  background: var(--bg);
  -webkit-app-region: drag;
}

.connection-view__brand {
  display: flex;
  width: min(380px, 100%);
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
}

.connection-view__icon {
  display: block;
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  object-fit: contain;
  filter: drop-shadow(0 10px 18px rgba(15, 23, 42, 0.12));
}

.connection-view__brand h1 {
  margin: 0;
  color: var(--text);
  font-size: 20px;
  font-weight: 750;
  letter-spacing: 0;
}

.connection-view__brand p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 550;
}

.connection-form {
  display: flex;
  width: min(380px, 100%);
  flex-direction: column;
  padding: 20px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
  -webkit-app-region: no-drag;
}

.connection-form :deep(.segmented-control) {
  margin-bottom: 16px;
}

.field-label {
  margin: 12px 0 6px;
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 650;
}

.input-shell {
  display: flex;
  min-width: 0;
  height: 42px;
  align-items: center;
  gap: 9px;
  padding: 0 11px;
  border-radius: 8px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  color: var(--muted);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.input-shell:focus-within {
  background: var(--surface);
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--blue-soft);
}

.input-shell input {
  min-width: 0;
  flex: 1 1 auto;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  user-select: text;
}

.input-action {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  padding: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.input-action:hover {
  background: var(--surface-strong);
  color: var(--text);
}

.primary-button {
  display: inline-flex;
  width: 100%;
  height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 18px;
  border-radius: 8px;
  background: var(--blue);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.primary-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.saved-credential-button,
.connection-form > .text-button {
  align-self: center;
  margin-top: 10px;
}

.secure-storage-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 14px 0 0;
  color: var(--faint);
  font-size: 10px;
}

.form-error {
  margin: 12px 0 0;
  padding: 8px 9px;
  border-radius: 7px;
  background: var(--red-soft);
  border: 1px solid var(--red-border);
  color: var(--red-text);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: connectionSpin 0.8s linear infinite;
}

.connection-form--2fa {
  align-items: center;
  text-align: center;
}

.verification-mark {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 8px;
  background: var(--emerald-soft);
  color: var(--emerald-text);
  border: 1px solid var(--emerald-border);
}

.verification-title h2 {
  margin: 12px 0 0;
  color: var(--text);
  font-size: 16px;
}

.verification-title p {
  margin: 3px 0 12px;
  color: var(--muted);
  font-size: 11px;
}

.totp-input {
  width: 100%;
  height: 48px;
  border-radius: 8px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  text-align: center;
  user-select: text;
}

@keyframes connectionSpin {
  to { transform: rotate(360deg); }
}

@media (max-width: 420px) {
  .connection-view {
    padding: 52px 20px 24px;
  }

  .connection-view__icon {
    width: 64px;
    height: 64px;
    flex-basis: 64px;
  }

  .connection-form {
    padding: 16px;
  }
}

@media (max-height: 620px) {
  .connection-view {
    justify-content: flex-start;
    padding-top: 34px;
  }

  .connection-view__brand {
    margin-bottom: 14px;
  }

  .connection-view__icon {
    width: 56px;
    height: 56px;
    flex-basis: 56px;
  }

  .connection-form {
    padding: 14px 16px;
  }

  .field-label {
    margin-top: 8px;
  }
}
</style>
