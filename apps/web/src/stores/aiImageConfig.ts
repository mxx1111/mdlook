import { imageServiceOptions } from '@md/shared/configs'
import {
  DEFAULT_IMAGE_SERVICE_TYPE,
} from '@md/shared/constants'
import { useAuthStore } from '@/stores/auth'
import { store } from '@/utils/storage'

const LEGACY_IMAGE_KEY_PREFIX = `openai_image_key_`

/**
 * AI 图片生成配置 Store
 * 负责管理 AI 图片生成服务的配置，包括服务类型、尺寸、质量等参数
 */
export const useAIImageConfigStore = defineStore(`AIImageConfig`, () => {
  const authStore = useAuthStore()
  // ==================== 全局配置 ====================

  // 服务类型
  const type = store.reactive<string>(`openai_image_type`, DEFAULT_IMAGE_SERVICE_TYPE)

  // 旧版 default 使用已下线的公共代理；图片生成继续保留供应商直连。
  if (type.value === `default`)
    type.value = DEFAULT_IMAGE_SERVICE_TYPE

  // 图片尺寸
  const size = store.reactive<string>(`openai_image_size`, `1024x1024`)

  // 图片质量
  const quality = store.reactive<string>(`openai_image_quality`, `standard`)

  // 图片风格
  const style = store.reactive<string>(`openai_image_style`, `natural`)

  // ==================== 服务相关字段 ====================

  // 服务端点（支持自定义服务）
  const endpoint = ref<string>(``)

  // 异步加载初始端点（捕获 type 防止竞态覆盖）
  Promise.resolve().then(async () => {
    const capturedType = type.value
    if (capturedType === `custom`) {
      const value = await store.get(`openai_image_endpoint_${capturedType}`)
      if (type.value === capturedType) {
        endpoint.value = value || ``
      }
    }
    else {
      const svc = imageServiceOptions.find(s => s.value === capturedType) ?? imageServiceOptions[0]
      if (type.value === capturedType) {
        endpoint.value = svc.endpoint
      }
    }
  })

  // 模型名称（由 watch(type) 自动初始化）
  const model = ref<string>(``)

  // ==================== API Key 管理 ====================

  // 图片接口当前只支持供应商直连；Key 仅保存在当前页面内存。
  const sessionApiKeys = reactive<Record<string, string>>({})
  const legacyImageKeyProviders = ref<string[]>([])
  const apiKey = computed({
    get: () => sessionApiKeys[type.value] ?? ``,
    set: (value: string) => {
      sessionApiKeys[type.value] = value
    },
  })

  function clearSessionApiKeys(): void {
    Object.keys(sessionApiKeys).forEach(key => delete sessionApiKeys[key])
  }

  async function scanLegacyImageKeys(): Promise<void> {
    const providers: string[] = []
    const storageKeys = await store.keys()
    await Promise.all(storageKeys.map(async (storageKey) => {
      if (!storageKey.startsWith(LEGACY_IMAGE_KEY_PREFIX))
        return
      const provider = storageKey.slice(LEGACY_IMAGE_KEY_PREFIX.length)
      if (!provider || provider === `default`)
        return
      const legacyValue = await store.get(storageKey)
      if (legacyValue?.trim())
        providers.push(provider)
    }))
    legacyImageKeyProviders.value = [...new Set(providers)].sort()
  }

  async function deleteLegacyImageKey(provider: string): Promise<void> {
    const storageKey = `${LEGACY_IMAGE_KEY_PREFIX}${provider}`
    await store.remove(storageKey)
    if (await store.get(storageKey))
      throw new Error(`旧版图片 API Key 未能删除，请检查浏览器存储权限。`)
    legacyImageKeyProviders.value = legacyImageKeyProviders.value.filter(item => item !== provider)
  }

  // ==================== 响应式逻辑 ====================

  // 监听服务类型变化，自动同步端点、模型和 API Key
  watch(
    type,
    async (newType) => {
      const svc = imageServiceOptions.find(s => s.value === newType) ?? imageServiceOptions[0]

      // 同步端点
      if (newType === `custom`) {
        const endpointValue = await store.get(`openai_image_endpoint_${newType}`)
        endpoint.value = endpointValue || ``
      }
      else {
        endpoint.value = svc.endpoint
      }

      if (newType === `custom`) {
        // 自定义服务：从存储读取模型
        const savedModel = await store.get(`openai_image_model_${newType}`) || ``
        model.value = savedModel
      }
      else {
        // 预设服务：读取已保存的模型，如果不存在或不在列表中，则使用默认模型
        const saved = await store.get(`openai_image_model_${newType}`) || ``
        model.value = svc.models.includes(saved) ? saved : svc.models[0]

        // 如果需要回退到默认模型，则保存
        if (!svc.models.includes(saved) && svc.models[0]) {
          await store.set(`openai_image_model_${newType}`, svc.models[0])
        }
      }
    },
    { immediate: true }, // 首次加载时也执行
  )

  // 监听模型变化，持久化存储
  watch(model, async (val) => {
    await store.set(`openai_image_model_${type.value}`, val)
  })

  // 监听端点变化，持久化存储（仅自定义服务类型）
  watch(endpoint, async (val) => {
    if (type.value === `custom`) {
      await store.set(`openai_image_endpoint_${type.value}`, val)
    }
  })

  watch(
    () => [authStore.token, authStore.user?.id] as const,
    () => {
      clearSessionApiKeys()
    },
  )

  void scanLegacyImageKeys()

  // ==================== Actions ====================

  /**
   * 重置所有配置到默认值
   */
  const reset = async () => {
    type.value = DEFAULT_IMAGE_SERVICE_TYPE
    size.value = `1024x1024`
    quality.value = `standard`
    style.value = `natural`
    clearSessionApiKeys()

    // 清理所有服务相关的持久化数据
    await Promise.all(
      imageServiceOptions.map(async ({ value }) => {
        await store.remove(`openai_image_key_${value}`)
        await store.remove(`openai_image_model_${value}`)
        await store.remove(`openai_image_endpoint_${value}`)
      }),
    )
    await scanLegacyImageKeys()
  }

  return {
    // State
    type,
    endpoint,
    model,
    size,
    quality,
    style,
    apiKey,
    legacyImageKeyProviders,

    // Actions
    scanLegacyImageKeys,
    deleteLegacyImageKey,
    reset,
  }
})

// 默认导出（向后兼容）
export default useAIImageConfigStore
