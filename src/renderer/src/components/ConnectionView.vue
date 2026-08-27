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
