<script setup lang="ts">
import type { AIChatPayload } from '@/services/ai/types'
import { Info } from '@lucide/vue'
import { serviceOptions } from '@md/shared/configs'
import AIAccountSecurity from '@/components/ai/config/AIAccountSecurity.vue'
import {
  getSafeAIErrorMessage,
  resolveAIChatRequest,
  useAIFetch,
} from '@/composables/useAIFetch'
import useAIConfigStore from '@/stores/aiConfig'

/* -------------------------- 基础数据 -------------------------- */

const emit = defineEmits([`saved`])

const AIConfigStore = useAIConfigStore()
const { type, endpoint, model, apiKey, temperature, maxToken } = storeToRefs(AIConfigStore)

/** UI 状态 */
const { loading, fetchJSON } = useAIFetch()
const testResult = ref(``)

/** 当前服务信息 */
const currentService = computed(
  () => serviceOptions.find(s => s.value === type.value) || serviceOptions[0],
)
const effectiveMode = computed(() => AIConfigStore.resolveRequestMode(type.value))

/* -------------------------- 监听 -------------------------- */

// 监听服务类型变化，清空测试结果
watch(type, () => {
  testResult.value = ``
})

// 监听模型变化，清空测试结果
watch(model, () => {
  testResult.value = ``
})

/* -------------------------- 操作 -------------------------- */

function saveConfig(emitEvent = true) {
  if (emitEvent) {
    testResult.value = `✅ 配置已保存`
    emit(`saved`)
  }
}

function clearConfig() {
  AIConfigStore.reset()
  testResult.value = `🗑️ 当前 AI 配置已清除`
}

async function testConnection() {
  testResult.value = ``
  loading.value = true

  try {
    const payload: AIChatPayload = {
      model: model.value,
      messages: [{ role: `user`, content: `ping` }],
      temperature: 0,
      max_tokens: 1,
      stream: false,
    }
    const request = resolveAIChatRequest({
      apiKey: apiKey.value,
      endpoint: endpoint.value,
      payload,
      requestMode: effectiveMode.value,
      serviceType: type.value,
    })

    const res = await fetchJSON<any>(
      request.url,
      request.headers,
      request.payload as unknown as Record<string, unknown>,
      undefined,
      request.mode,
    )

    if (res.ok) {
      testResult.value = `✅ 测试成功，${request.mode === 'proxy' ? '安全代理' : '本机直连'}可用`
      saveConfig(false)
    }
    else {
      testResult.value = `❌ ${res.errorText}`
    }
  }
  catch (err) {
    testResult.value = `❌ ${getSafeAIErrorMessage(err)}`
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="custom-scroll space-y-4 max-h-[calc(100dvh-10rem)] overflow-y-auto pr-1 text-xs sm:max-h-none sm:text-sm">
    <div class="font-medium">
      AI 配置
    </div>

    <!-- 服务类型 -->
    <div>
      <Label class="mb-1 block text-sm font-medium">服务类型</Label>
      <Select v-model="type">
        <SelectTrigger class="w-full">
          <SelectValue>
            {{ currentService.label }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="service in serviceOptions"
            :key="service.value"
            :value="service.value"
          >
            {{ service.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <AIAccountSecurity :provider="type" />

    <!-- API 端点只用于用户明确选择的本机直连 -->
    <div v-if="effectiveMode === 'direct'">
      <Label class="mb-1 block text-sm font-medium">API 端点</Label>
      <Input
        v-model="endpoint"
        placeholder="输入 API 端点 URL"
        class="focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
      />
    </div>

    <!-- 模型名称 -->
    <div>
      <Label class="mb-1 block text-sm font-medium">模型名称</Label>
      <Select v-if="currentService.models.length > 0" v-model="model">
        <SelectTrigger class="w-full">
          <SelectValue>
            {{ model || '请选择模型' }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="_model in currentService.models"
            :key="_model"
            :value="_model"
          >
            {{ _model }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Input
        v-else
        v-model="model"
        placeholder="输入模型名称"
        class="focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
      />
    </div>

    <!-- 温度 temperature -->
    <div>
      <Label class="mb-1 flex items-center gap-1 text-sm font-medium">
        温度
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Info class="text-gray-500" :size="16" />
            </TooltipTrigger>
            <TooltipContent side="top" class="z-[250]">
              <div>控制输出的随机性：较小值使输出更确定，较大值使其更随机。</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Label>
      <Input
        v-model.number="temperature"
        type="number"
        step="0.1"
        min="0"
        max="2"
        placeholder="0 ~ 2，默认 1"
        class="focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
      />
    </div>

    <!-- 最大 Token 数 -->
    <div>
      <Label class="mb-1 block text-sm font-medium">最大 Token 数</Label>
      <Input
        v-model.number="maxToken"
        type="number"
        min="1"
        max="32768"
        placeholder="比如 1024"
        class="focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
      />
    </div>

    <!-- 操作按钮区域 -->
    <div class="mt-2 flex flex-col gap-2 sm:flex-row">
      <Button size="sm" @click="saveConfig">
        保存
      </Button>
      <Button size="sm" variant="ghost" @click="clearConfig">
        重置参数
      </Button>
      <Button
        size="sm"
        variant="outline"
        :disabled="loading"
        @click="testConnection"
      >
        {{ loading ? '测试中...' : '测试连接' }}
      </Button>
    </div>

    <!-- 测试结果显示 -->
    <div v-if="testResult" class="mt-1 text-xs text-gray-500">
      {{ testResult }}
    </div>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.custom-scroll::-webkit-scrollbar {
  width: 6px;
}
@media (pointer: coarse) {
  /* 触屏设备更细 */
  .custom-scroll::-webkit-scrollbar {
    width: 3px;
  }
}

.custom-scroll::-webkit-scrollbar-thumb {
  @apply rounded-full bg-gray-400/40 hover:bg-gray-400/60;
  @apply dark:bg-gray-500/40 dark:hover:bg-gray-500/70;
}
.custom-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgb(156 163 175 / 0.4) transparent;
}
.dark .custom-scroll {
  scrollbar-color: rgb(107 114 128 / 0.4) transparent;
}
</style>
