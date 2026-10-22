<script setup lang="ts">
import type { AIFormatStyle } from '@/services/formatting/auto-format'
import { Check, Loader2, Sparkles, UserRoundPen, WandSparkles } from '@lucide/vue'
import AIAccountSecurity from '@/components/ai/config/AIAccountSecurity.vue'
import PrivateSkillManager from '@/components/ai/config/PrivateSkillManager.vue'
import { getSafeAIErrorMessage } from '@/composables/useAIFetch'
import {
  AI_FORMAT_STYLE_LABELS,
  DEFAULT_AI_FORMAT_PROMPT,
  formatMarkdownBasic,
  formatMarkdownWithAI,
  polishMarkdownWithPrivateStyle,
} from '@/services/formatting/auto-format'
import useAIConfigStore from '@/stores/aiConfig'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import {
  usePrivateSkillsStore,
  WRITING_STYLE_SKILL_SLUG,
} from '@/stores/privateSkills'
import { addPrefix } from '@/utils'
import { store } from '@/utils/storage'
import VersionDiffViewer from '../post-slider/VersionDiffViewer.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'formatted': []
}>()

type FormatMode = `ai` | `basic` | `writing-style`

const editorStore = useEditorStore()
const authStore = useAuthStore()
const aiConfigStore = useAIConfigStore()
const privateSkillsStore = usePrivateSkillsStore()
const { isWritingStyleSkillReady, writingStyleSkill } = storeToRefs(privateSkillsStore)

const mode = ref<FormatMode>(`basic`)
const style = ref<AIFormatStyle>(`wechat-clean`)
const customPrompt = store.reactive(addPrefix(`ai_format_prompt`), DEFAULT_AI_FORMAT_PROMPT)
const animatedCards = store.reactive(addPrefix(`ai_format_animated_cards`), true)
const deepSeekEndpoint = store.reactive(addPrefix(`ai_format_deepseek_endpoint`), `https://api.deepseek.com/v1`)
const deepSeekModel = store.reactive(addPrefix(`ai_format_deepseek_model`), `deepseek-v4-flash`)
const deepSeekTemperature = store.reactive(addPrefix(`ai_format_deepseek_temperature`), 0.3)
// 整篇排版要把原文完整重写一遍，4096 对中文长文不够用（约 3000 字就会截断）。
const DEFAULT_DEEPSEEK_MAX_TOKEN = 8192
const LEGACY_DEEPSEEK_MAX_TOKEN = 4096
const deepSeekMaxToken = store.reactive(addPrefix(`ai_format_deepseek_max_token`), DEFAULT_DEEPSEEK_MAX_TOKEN)
const showAdvancedConfig = ref(false)
const isFormatting = ref(false)
const previewOriginal = ref(``)
const previewCandidate = ref(``)
let formatAbortController: AbortController | null = null

const styleOptions = computed(() => Object.entries(AI_FORMAT_STYLE_LABELS) as [AIFormatStyle, string][])
const deepSeekRequestMode = computed(() => aiConfigStore.resolveRequestMode(`deepseek`))
const deepSeekApiKey = computed({
  get: () => aiConfigStore.getSessionApiKey(`deepseek`),
  set: value => aiConfigStore.setSessionApiKey(`deepseek`, value),
})
const hasWritingStylePreview = computed(() => Boolean(previewOriginal.value && previewCandidate.value))

const DEEPSEEK_MODEL_OPTIONS = [
  { value: `deepseek-v4-flash`, label: `V4 Flash（快且便宜，排版推荐）` },
  { value: `deepseek-v4-pro`, label: `V4 Pro（能力更强，更贵）` },
] as const

const CUSTOM_MODEL = `__custom__`
const retiredDeepSeekModels = new Set([`deepseek-chat`, `deepseek-reasoner`])

// DeepSeek 已停止旧模型名；升级时把历史排版配置迁移到仍可调用的 V4 Flash。
if (retiredDeepSeekModels.has(deepSeekModel.value))
  deepSeekModel.value = `deepseek-v4-flash`

// 只迁移仍停留在旧默认值的配置，用户手动调过的数值保持不动。
if (deepSeekMaxToken.value === LEGACY_DEEPSEEK_MAX_TOKEN)
  deepSeekMaxToken.value = DEFAULT_DEEPSEEK_MAX_TOKEN

const modelSelectValue = computed({
  get: () => DEEPSEEK_MODEL_OPTIONS.some(o => o.value === deepSeekModel.value) ? deepSeekModel.value : CUSTOM_MODEL,
  set: (value: string) => {
    if (value !== CUSTOM_MODEL)
      deepSeekModel.value = value
  },
})

const isCustomModel = computed(() => modelSelectValue.value === CUSTOM_MODEL)

const dialogOpen = computed({
  get: () => props.open,
  set: value => emit(`update:open`, value),
})

function clearWritingStylePreview() {
  previewOriginal.value = ``
  previewCandidate.value = ``
}

function cancelFormatRequest() {
  formatAbortController?.abort()
  formatAbortController = null
}

function resetPrompt() {
  customPrompt.value = DEFAULT_AI_FORMAT_PROMPT
  toast.success(`已恢复默认提示词`)
}

function resetDeepSeekConfig() {
  deepSeekEndpoint.value = `https://api.deepseek.com/v1`
  deepSeekModel.value = `deepseek-v4-flash`
  deepSeekTemperature.value = 0.3
  deepSeekMaxToken.value = DEFAULT_DEEPSEEK_MAX_TOKEN
  toast.success(`已恢复 DeepSeek 默认参数`)
}

async function applyFormat() {
  const content = editorStore.getContent()
  if (!content.trim()) {
    toast.warning(`当前没有可排版的内容。`)
    return
  }

  cancelFormatRequest()
  const requestController = new AbortController()
  formatAbortController = requestController
  isFormatting.value = true
  try {
    if (mode.value === `writing-style`) {
      if (!authStore.isLoggedIn)
        throw new Error(`请先登录后使用私有文风 Skill。`)
      if (!isWritingStyleSkillReady.value)
        throw new Error(`请先导入并启用 ${WRITING_STYLE_SKILL_SLUG}。`)

      previewOriginal.value = content
      previewCandidate.value = await polishMarkdownWithPrivateStyle(
        content,
        {
          apiKey: deepSeekApiKey.value,
          endpoint: deepSeekEndpoint.value,
          maxToken: deepSeekMaxToken.value,
          model: deepSeekModel.value,
          requestMode: deepSeekRequestMode.value,
          serviceType: `deepseek`,
          signal: requestController.signal,
          temperature: deepSeekTemperature.value,
        },
        WRITING_STYLE_SKILL_SLUG,
      )
      toast.success(`文风润色预览已生成，请确认差异后再替换`)
      return
    }

    const next = mode.value === `basic`
      ? formatMarkdownBasic(content)
      : await formatMarkdownWithAI(content, {
          animatedCards: animatedCards.value,
          apiKey: deepSeekApiKey.value,
          endpoint: deepSeekEndpoint.value,
          maxToken: deepSeekMaxToken.value,
          model: deepSeekModel.value,
          prompt: customPrompt.value,
          requestMode: deepSeekRequestMode.value,
          serviceType: `deepseek`,
          signal: requestController.signal,
          style: style.value,
          temperature: deepSeekTemperature.value,
        })

    editorStore.setContent(next)
    emit(`formatted`)
    toast.success(mode.value === `basic` ? `已完成基础排版` : `已完成 AI 智能排版`)
    dialogOpen.value = false
  }
  catch (error) {
    if (error instanceof DOMException && error.name === `AbortError`)
      return
    const message = error instanceof Error && error.message.startsWith(`请先`)
      ? error.message
      : getSafeAIErrorMessage(error)
    toast.error(message)
  }
  finally {
    if (formatAbortController === requestController) {
      formatAbortController = null
      isFormatting.value = false
    }
  }
}

function confirmWritingStyleReplacement() {
  if (!hasWritingStylePreview.value)
    return
  if (editorStore.getContent() !== previewOriginal.value) {
    toast.warning(`文章在生成预览后已发生变化，请重新生成，避免覆盖新内容。`)
    clearWritingStylePreview()
    return
  }

  editorStore.setContent(previewCandidate.value)
  emit(`formatted`)
  clearWritingStylePreview()
  toast.success(`已按确认的文风预览替换全文`)
  dialogOpen.value = false
}

watch(mode, () => {
  cancelFormatRequest()
  isFormatting.value = false
  clearWritingStylePreview()
  if (mode.value === `writing-style` && authStore.isLoggedIn)
    void privateSkillsStore.load()
})

watch(dialogOpen, (open) => {
  if (!open) {
    cancelFormatRequest()
    isFormatting.value = false
    clearWritingStylePreview()
  }
})

onUnmounted(cancelFormatRequest)
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col sm:max-h-[90vh] sm:max-w-4xl">
      <DialogHeader class="shrink-0">
        <DialogTitle>自动排版</DialogTitle>
        <DialogDescription>
          基础排版在本机完成；AI 操作会明确标注连接方式，私有文风必须先预览再确认替换。
        </DialogDescription>
      </DialogHeader>

      <div class="-mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
        <div class="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            class="rounded-md border p-4 text-left transition hover:bg-accent"
            :class="{ 'border-primary bg-primary/5': mode === 'basic' }"
            @click="mode = 'basic'"
          >
            <div class="flex items-center gap-2 font-medium">
              <WandSparkles class="h-4 w-4" />
              基础排版
              <Check v-if="mode === 'basic'" class="ml-auto h-4 w-4 text-primary" />
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
              本地处理空行、标题、列表、图片和中英文间距，不调用 AI。
            </p>
          </button>

          <button
            type="button"
            class="rounded-md border p-4 text-left transition hover:bg-accent"
            :class="{ 'border-primary bg-primary/5': mode === 'ai' }"
            @click="mode = 'ai'"
          >
            <div class="flex items-center gap-2 font-medium">
              <Sparkles class="h-4 w-4" />
              AI 智能排版
              <Check v-if="mode === 'ai'" class="ml-auto h-4 w-4 text-primary" />
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
              使用当前 AI 配置理解文章结构，适合公众号长文和口语稿。
            </p>
          </button>

          <button
            type="button"
            class="rounded-md border p-4 text-left transition hover:bg-accent"
            :class="{ 'border-primary bg-primary/5': mode === 'writing-style' }"
            @click="mode = 'writing-style'"
          >
            <div class="flex items-center gap-2 font-medium">
              <UserRoundPen class="h-4 w-4" />
              按我的文风润色
              <Check v-if="mode === 'writing-style'" class="ml-auto h-4 w-4 text-primary" />
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
              使用已启用的私有文风 Skill，先看全文差异，确认后才会替换。
            </p>
          </button>
        </div>

        <div v-if="hasWritingStylePreview" class="h-[48dvh] min-h-72 overflow-hidden rounded-lg border">
          <VersionDiffViewer :old-text="previewOriginal" :new-text="previewCandidate" />
        </div>

        <div v-else-if="mode === 'ai' || mode === 'writing-style'" class="space-y-3">
          <div v-if="mode === 'writing-style'" class="rounded-lg border bg-muted/25 p-3">
            <div class="flex items-start gap-2">
              <UserRoundPen class="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p class="text-sm font-medium">
                  {{ isWritingStyleSkillReady ? `文风 Skill 已就绪` : `需要导入并启用文风 Skill` }}
                </p>
                <p class="mt-1 text-xs leading-5 text-muted-foreground">
                  固定使用 <code>{{ WRITING_STYLE_SKILL_SLUG }}</code>
                  <template v-if="writingStyleSkill">
                    （云端 v{{ writingStyleSkill.version }}）
                  </template>
                  。文章与按任务选取的 Skill 片段会经安全代理发送给 DeepSeek。
                </p>
              </div>
            </div>
          </div>

          <div v-if="mode === 'ai'">
            <Label class="mb-1 block text-sm font-medium">排版风格</Label>
            <Select v-model="style">
              <SelectTrigger>
                <SelectValue>
                  {{ AI_FORMAT_STYLE_LABELS[style] }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="[_style, label] in styleOptions"
                  :key="_style"
                  :value="_style"
                >
                  {{ label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label v-if="mode === 'ai'" class="flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3">
            <div class="text-sm">
              <div class="font-medium">加入动画图解</div>
              <div class="text-xs text-muted-foreground">
                在时间线、关键数字、对比等段落插入会动的图解卡片，复制到公众号后仍然有效。
              </div>
            </div>
            <Switch v-model="animatedCards" />
          </label>

          <AIAccountSecurity provider="deepseek" :show-skills="false" />

          <PrivateSkillManager v-if="mode === 'writing-style'" />

          <div class="rounded-md border bg-muted/30 p-3">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm">
                <div class="font-medium">
                  DeepSeek 参数
                </div>
                <div class="text-muted-foreground">
                  默认即可，也可以按自己的服务配置调整。
                </div>
              </div>
              <Button variant="outline" size="sm" type="button" @click="showAdvancedConfig = !showAdvancedConfig">
                {{ showAdvancedConfig ? '收起' : '高级' }}
              </Button>
            </div>

            <div v-if="showAdvancedConfig" class="mt-3 grid gap-3">
              <div>
                <Label class="mb-1 block text-sm font-medium">API 端点</Label>
                <Input v-model="deepSeekEndpoint" placeholder="https://api.deepseek.com/v1" />
              </div>
              <div>
                <Label class="mb-1 block text-sm font-medium">模型</Label>
                <Select v-model="modelSelectValue">
                  <SelectTrigger>
                    <SelectValue>
                      {{ DEEPSEEK_MODEL_OPTIONS.find(o => o.value === modelSelectValue)?.label ?? '自定义模型' }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="option in DEEPSEEK_MODEL_OPTIONS"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </SelectItem>
                    <SelectItem :value="CUSTOM_MODEL">
                      自定义模型…
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  v-if="isCustomModel"
                  v-model="deepSeekModel"
                  class="mt-2"
                  placeholder="填写兼容 OpenAI Chat Completions 的模型名称"
                />
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label class="mb-1 block text-sm font-medium">温度</Label>
                  <Input
                    v-model.number="deepSeekTemperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                  />
                </div>
                <div>
                  <Label class="mb-1 block text-sm font-medium">最大 Token</Label>
                  <Input
                    v-model.number="deepSeekMaxToken"
                    type="number"
                    min="1024"
                    step="1024"
                  />
                </div>
              </div>
              <div>
                <Button variant="ghost" size="sm" type="button" @click="resetDeepSeekConfig">
                  恢复默认参数
                </Button>
              </div>
            </div>
          </div>

          <div v-if="mode === 'ai'">
            <div class="mb-1 flex items-center justify-between gap-2">
              <Label class="block text-sm font-medium">自定义提示词</Label>
              <Button variant="ghost" size="sm" type="button" @click="resetPrompt">
                恢复默认
              </Button>
            </div>
            <Textarea
              v-model="customPrompt"
              class="min-h-24 resize-y text-sm leading-relaxed"
              placeholder="写下你的排版偏好，例如重点加粗密度、标题风格、段落长度等。"
            />
            <p class="mt-1 text-xs text-muted-foreground">
              提示词会保存在本地，下次 AI 排版继续使用。
            </p>
          </div>
        </div>
      </div>

      <DialogFooter v-if="hasWritingStylePreview" class="shrink-0 flex-col-reverse gap-2 sm:flex-row">
        <Button variant="ghost" :disabled="isFormatting" @click="clearWritingStylePreview">
          放弃预览
        </Button>
        <Button variant="outline" :disabled="isFormatting" @click="applyFormat">
          <Loader2 v-if="isFormatting" class="mr-2 h-4 w-4 animate-spin" />
          重新生成
        </Button>
        <Button :disabled="isFormatting" @click="confirmWritingStyleReplacement">
          <Check class="mr-2 h-4 w-4" />
          确认替换全文
        </Button>
      </DialogFooter>

      <DialogFooter v-else class="shrink-0 flex-col-reverse gap-2 sm:flex-row">
        <Button variant="ghost" :disabled="isFormatting" @click="dialogOpen = false">
          取消
        </Button>
        <Button :disabled="isFormatting" @click="applyFormat">
          <Loader2 v-if="isFormatting" class="mr-2 h-4 w-4 animate-spin" />
          <UserRoundPen v-else-if="mode === 'writing-style'" class="mr-2 h-4 w-4" />
          <WandSparkles v-else class="mr-2 h-4 w-4" />
          {{
            mode === 'basic'
              ? '开始基础排版'
              : mode === 'writing-style'
                ? '生成文风差异预览'
                : '开始 AI 排版'
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
