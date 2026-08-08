import type { AICredentialRecord, AIRequestMode } from '@/services/ai/types'
import { serviceOptions } from '@md/shared/configs'
import {
  DEFAULT_CHAT_SERVICE_TYPE,
  DEFAULT_SERVICE_MAX_TOKEN,
  DEFAULT_SERVICE_TEMPERATURE,
} from '@md/shared/constants'
import { useAuthStore } from '@/stores/auth'
import { addPrefix } from '@/utils'
import { store } from '@/utils/storage'

const LEGACY_KEY_PREFIX = `openai_key_`

interface AIConfigSession {
  generation: number
  token: string
  userId: string
}

class StaleAIConfigSessionError extends Error {
  constructor() {
    super(`账户已切换，本次 AI 配置操作已丢弃。`)
    this.name = `StaleAIConfigSessionError`
  }
}

/**
 * AI 配置 Store。
 *
 * API Key 只存在两处：
 * - 安全代理模式：服务端加密保存，前端只拿掩码和版本。
 * - 本机直连模式：仅保存在当前页面内存，刷新即清空。
 *
 * 旧版 localStorage Key 只做显式迁移提示，不会自动读取到请求配置，
 * 更不会在登录后静默上传。
 */
export const useAIConfigStore = defineStore(`AIConfig`, () => {
  const authStore = useAuthStore()

  const type = store.reactive<string>(`openai_type`, DEFAULT_CHAT_SERVICE_TYPE)
  const temperature = store.reactive<number>(`openai_temperature`, DEFAULT_SERVICE_TEMPERATURE)
  const maxToken = store.reactive<number>(`openai_max_token`, DEFAULT_SERVICE_MAX_TOKEN)
  const requestMode = store.reactive<AIRequestMode>(addPrefix(`ai_request_mode`), `proxy`)

  const endpoint = ref(``)
  const model = ref(``)
  const sessionApiKeys = reactive<Record<string, string>>({})
  const cloudCredentials = ref<AICredentialRecord[]>([])
  const legacyCredentialProviders = ref<string[]>([])
  const credentialsLoading = ref(false)
  const credentialError = ref(``)
  let sessionGeneration = 0

  const apiKey = computed({
    get: () => sessionApiKeys[type.value] ?? ``,
    set: (value: string) => {
      sessionApiKeys[type.value] = value
    },
  })

  const isLoggedIn = computed(() => authStore.isLoggedIn)
  const effectiveRequestMode = computed(() => resolveRequestMode(type.value))

  // 旧版本的 default 指向上游公共代理；升级后迁移到 mdlook 默认供应商。
  if (type.value === `default`)
    type.value = DEFAULT_CHAT_SERVICE_TYPE

  function cloudCredentialFor(provider: string): AICredentialRecord | null {
    return cloudCredentials.value.find(item => item.provider === provider) ?? null
  }

  function hasCloudCredential(provider: string): boolean {
    return cloudCredentialFor(provider) !== null
  }

  function resolveRequestMode(provider: string): AIRequestMode {
    if (provider === `custom` || !authStore.isLoggedIn)
      return `direct`
    return requestMode.value === `direct` ? `direct` : `proxy`
  }

  function getSessionApiKey(provider: string): string {
    return sessionApiKeys[provider] ?? ``
  }

  function setSessionApiKey(provider: string, value: string): void {
    sessionApiKeys[provider] = value
  }

  function clearSessionApiKeys(): void {
    Object.keys(sessionApiKeys).forEach(key => delete sessionApiKeys[key])
  }

  function currentSession(): AIConfigSession | null {
    const token = authStore.token
    const userId = authStore.user?.id
    return token && userId
      ? { generation: sessionGeneration, token, userId }
      : null
  }

  function isCurrentSession(session: AIConfigSession): boolean {
    return session.generation === sessionGeneration
      && session.token === authStore.token
      && session.userId === authStore.user?.id
      && authStore.isLoggedIn
  }

  function assertCurrentSession(session: AIConfigSession): void {
    if (!isCurrentSession(session))
      throw new StaleAIConfigSessionError()
  }

  async function scanLegacyCredentials(): Promise<void> {
    const providers: string[] = []
    await Promise.all(serviceOptions.map(async ({ value }) => {
      if (value === `custom`)
        return
      const oldValue = await store.get(`${LEGACY_KEY_PREFIX}${value}`)
      if (oldValue?.trim())
        providers.push(value)
    }))
    legacyCredentialProviders.value = providers.sort()
  }

  async function loadCloudCredentials(): Promise<void> {
    const session = currentSession()
    if (!session) {
      cloudCredentials.value = []
      return
    }

    credentialsLoading.value = true
    credentialError.value = ``
    try {
      const credentials = await authStore.api.getAICredentials()
      assertCurrentSession(session)
      cloudCredentials.value = credentials
    }
    catch (error) {
      if (error instanceof StaleAIConfigSessionError)
        return
      credentialError.value = `暂时无法读取云端 AI 凭据，请稍后重试。`
    }
    finally {
      if (isCurrentSession(session))
        credentialsLoading.value = false
    }
  }

  async function saveCloudCredential(provider: string, value: string): Promise<AICredentialRecord> {
    const trimmed = value.trim()
    const session = currentSession()
    if (!session)
      throw new Error(`请先登录后再保存云端凭据。`)
    if (trimmed.length < 8)
      throw new Error(`API Key 至少需要 8 个字符。`)

    const current = cloudCredentialFor(provider)
    const saved = await authStore.api.updateAICredential(provider, {
      apiKey: trimmed,
      version: current?.version ?? 0,
    })
    assertCurrentSession(session)
    cloudCredentials.value = [
      ...cloudCredentials.value.filter(item => item.provider !== provider),
      saved,
    ]
    setSessionApiKey(provider, ``)
    return saved
  }

  async function deleteCloudCredential(provider: string): Promise<void> {
    const current = cloudCredentialFor(provider)
    if (!current)
      return
    const session = currentSession()
    if (!session)
      throw new Error(`请先登录后再删除云端凭据。`)
    await authStore.api.deleteAICredential(provider, current.version)
    assertCurrentSession(session)
    cloudCredentials.value = cloudCredentials.value.filter(item => item.provider !== provider)
  }

  async function migrateLegacyCredential(provider: string): Promise<AICredentialRecord> {
    const storageKey = `${LEGACY_KEY_PREFIX}${provider}`
    const value = await store.get(storageKey)
    if (!value?.trim())
      throw new Error(`没有找到可迁移的旧版 Key。`)

    const saved = await saveCloudCredential(provider, value)
    // 只有服务端保存成功后才删除旧值；任何失败都保留本地副本。
    await store.remove(storageKey)
    if (await store.get(storageKey)) {
      throw new Error(`Key 已保存到云端，但本机旧值未能删除，请检查浏览器存储权限。`)
    }
    legacyCredentialProviders.value = legacyCredentialProviders.value.filter(item => item !== provider)
    return saved
  }

  watch(
    type,
    async (newType) => {
      const service = serviceOptions.find(item => item.value === newType) ?? serviceOptions[0]
      endpoint.value = service.endpoint
      const savedModel = await store.get(`openai_model_${newType}`) || ``
      if (type.value !== newType)
        return
      model.value = service.models.includes(savedModel) ? savedModel : service.models[0]
      await store.set(`openai_model_${newType}`, model.value)
    },
    { immediate: true },
  )

  watch(model, async (value) => {
    if (value)
      await store.set(`openai_model_${type.value}`, value)
  })

  watch(
    () => [authStore.token, authStore.user?.id] as const,
    async ([token, userId]) => {
      sessionGeneration += 1
      clearSessionApiKeys()
      cloudCredentials.value = []
      credentialsLoading.value = false
      credentialError.value = ``
      if (token && userId)
        await loadCloudCredentials()
      await scanLegacyCredentials()
    },
    { immediate: true },
  )

  async function reset(): Promise<void> {
    type.value = DEFAULT_CHAT_SERVICE_TYPE
    temperature.value = DEFAULT_SERVICE_TEMPERATURE
    maxToken.value = DEFAULT_SERVICE_MAX_TOKEN
    requestMode.value = `proxy`
    clearSessionApiKeys()
    await Promise.all(serviceOptions.map(({ value }) => store.remove(`openai_model_${value}`)))
  }

  return {
    type,
    endpoint,
    model,
    temperature,
    maxToken,
    apiKey,
    requestMode,
    effectiveRequestMode,
    isLoggedIn,
    cloudCredentials,
    legacyCredentialProviders,
    credentialsLoading,
    credentialError,
    cloudCredentialFor,
    hasCloudCredential,
    resolveRequestMode,
    getSessionApiKey,
    setSessionApiKey,
    scanLegacyCredentials,
    loadCloudCredentials,
    saveCloudCredential,
    deleteCloudCredential,
    migrateLegacyCredential,
    reset,
  }
})

export default useAIConfigStore
