<script setup lang="ts">
import { Cloud, KeyRound, Loader2, LockKeyhole, RotateCcw, ShieldCheck, Trash2 } from '@lucide/vue'
import { serviceOptions } from '@md/shared/configs'
import { PasswordInput } from '@/components/ui/password-input'
import useAIConfigStore from '@/stores/aiConfig'
import { useAuthStore } from '@/stores/auth'
import { useConfirmStore } from '@/stores/confirm'
import PrivateSkillManager from './PrivateSkillManager.vue'

const props = withDefaults(defineProps<{
  provider?: string
  showSkills?: boolean
}>(), {
  provider: undefined,
  showSkills: true,
})

const authStore = useAuthStore()
const aiConfigStore = useAIConfigStore()
const confirmStore = useConfirmStore()
const {
  requestMode,
  cloudCredentials,
  legacyCredentialProviders,
  credentialsLoading,
  credentialError,
} = storeToRefs(aiConfigStore)

const cloudKeyInput = ref(``)
const pendingAction = ref<`delete` | `migrate` | `save` | null>(null)
const actionError = ref(``)

const activeProvider = computed(() => props.provider || aiConfigStore.type)
const service = computed(
  () => serviceOptions.find(option => option.value === activeProvider.value) ?? serviceOptions[0],
)
const effectiveMode = computed(() => aiConfigStore.resolveRequestMode(activeProvider.value))
const canUseProxy = computed(() => activeProvider.value !== `custom`)
const cloudCredential = computed(
  () => cloudCredentials.value.find(item => item.provider === activeProvider.value) ?? null,
)
const hasLegacyKey = computed(() => legacyCredentialProviders.value.includes(activeProvider.value))
const directApiKey = computed({
  get: () => aiConfigStore.getSessionApiKey(activeProvider.value),
  set: value => aiConfigStore.setSessionApiKey(activeProvider.value, value),
})

watch(activeProvider, () => {
  cloudKeyInput.value = ``
  actionError.value = ``
})

watch(
  () => [authStore.token, authStore.user?.id] as const,
  () => {
    cloudKeyInput.value = ``
    actionError.value = ``
  },
)

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : `操作失败，请稍后重试。`
}

async function saveCloudKey(): Promise<void> {
  actionError.value = ``
  pendingAction.value = `save`
  const replacing = Boolean(cloudCredential.value)
  try {
    await aiConfigStore.saveCloudCredential(activeProvider.value, cloudKeyInput.value)
    cloudKeyInput.value = ``
    toast.success(replacing ? `云端凭据已替换` : `云端凭据已保存`)
  }
  catch (error) {
    actionError.value = safeMessage(error)
  }
  finally {
    pendingAction.value = null
  }
}

async function deleteCloudKeyConfirmed(): Promise<void> {
  if (!cloudCredential.value)
    return

  actionError.value = ``
  pendingAction.value = `delete`
  try {
    await aiConfigStore.deleteCloudCredential(activeProvider.value)
    toast.success(`云端凭据已删除`)
  }
  catch (error) {
    actionError.value = safeMessage(error)
  }
  finally {
    pendingAction.value = null
  }
}

function deleteCloudKey(): void {
  confirmStore.confirm({
    title: `删除云端 API Key`,
    description: `确定删除 ${service.value.label} 的云端 API Key 吗？删除后使用代理的 AI 功能会停止工作。`,
    confirmText: `删除`,
    destructive: true,
    onConfirm: deleteCloudKeyConfirmed,
  })
}

async function migrateLegacyKeyConfirmed(): Promise<void> {
  actionError.value = ``
  pendingAction.value = `migrate`
  try {
    await aiConfigStore.migrateLegacyCredential(activeProvider.value)
    toast.success(`旧版 Key 已迁移，且已从本机删除`)
  }
  catch (error) {
    actionError.value = safeMessage(error)
  }
  finally {
    pendingAction.value = null
  }
}

function migrateLegacyKey(): void {
  confirmStore.confirm({
    title: `迁移旧版 Key`,
    description: `将旧版保存在本机的 ${service.value.label} Key 上传到你的 mdlook 账户吗？服务端会加密保存，但这不是端到端加密；调用 AI 时服务端需要解密并转发给供应商。只有上传成功后，旧 Key 才会从本机删除。`,
    confirmText: `确认迁移`,
    onConfirm: migrateLegacyKeyConfirmed,
  })
}
</script>

<template>
  <div class="space-y-3">
    <section class="space-y-3 rounded-lg border p-3">
      <div class="flex items-start gap-2">
        <ShieldCheck class="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p class="text-sm font-medium">
            AI 连接与密钥
          </p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">
            当前供应商：{{ service.label }}。mdlook 不会在页面中回显云端明文 Key。
          </p>
        </div>
      </div>

      <div v-if="!canUseProxy" class="rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        自定义兼容服务保持本机直连，端点和 Key 只用于当前会话；DeepSeek、OpenAI 等预设供应商可使用 mdlook 账户安全代理。
      </div>

      <div v-if="authStore.isLoggedIn && canUseProxy">
        <Label class="mb-1 block text-xs font-medium">连接方式</Label>
        <Select v-model="requestMode">
          <SelectTrigger class="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="proxy">
              安全代理（推荐）
            </SelectItem>
            <SelectItem value="direct">
              本机直连（仅当前会话）
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="canUseProxy && effectiveMode === 'proxy'"
        class="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3"
      >
        <div class="flex items-start gap-2">
          <Cloud class="mt-0.5 size-4 shrink-0 text-primary" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              登录账户安全代理
            </p>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">
              Key 在服务端加密保存，前端只显示掩码；文章和所选 Skill 片段会经 mdlook 服务端发送给 {{ service.label }}。这不是端到端加密。
            </p>
          </div>
        </div>

        <div v-if="credentialsLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 class="size-3.5 animate-spin" />
          正在读取凭据状态…
        </div>
        <div v-else-if="cloudCredential" class="flex items-center gap-2 rounded-md bg-background/80 p-2">
          <LockKeyhole class="size-4 shrink-0 text-emerald-600" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-mono text-xs">
              {{ cloudCredential.maskedKey }}
            </p>
            <p class="text-[11px] text-muted-foreground">
              云端版本 v{{ cloudCredential.version }}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-9 text-muted-foreground hover:text-destructive"
            title="删除云端 Key"
            :disabled="pendingAction !== null"
            @click="deleteCloudKey"
          >
            <Loader2 v-if="pendingAction === 'delete'" class="size-4 animate-spin" />
            <Trash2 v-else class="size-4" />
          </Button>
        </div>
        <div v-else class="rounded-md border border-dashed bg-background/70 p-2 text-xs text-muted-foreground">
          还没有保存 {{ service.label }} Key，代理请求暂不可用。
        </div>

        <div class="space-y-2">
          <Label class="block text-xs font-medium">
            {{ cloudCredential ? '输入新 Key 进行替换' : '保存 Key 到加密云端' }}
          </Label>
          <PasswordInput
            v-model="cloudKeyInput"
            autocomplete="new-password"
            placeholder="输入完整 API Key"
            class="h-10 text-base sm:text-sm"
          />
          <Button
            size="sm"
            class="w-full sm:w-auto"
            :disabled="pendingAction !== null || !cloudKeyInput.trim()"
            @click="saveCloudKey"
          >
            <Loader2 v-if="pendingAction === 'save'" class="mr-2 size-4 animate-spin" />
            <KeyRound v-else class="mr-2 size-4" />
            {{ cloudCredential ? '替换云端 Key' : '保存到加密云端' }}
          </Button>
        </div>
      </div>

      <div v-if="effectiveMode === 'direct'" class="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <p class="text-sm font-medium">
          本机直连
        </p>
        <p class="text-xs leading-5 text-muted-foreground">
          Key 只保存在当前页面内存，刷新或关闭后清空，不写入 localStorage，也不经过 mdlook 服务端；文章会由浏览器直接发送给 {{ service.label }}。私有 Skill 不可用。
        </p>
        <PasswordInput
          v-model="directApiKey"
          autocomplete="off"
          placeholder="仅本次使用的 API Key"
          class="h-10 text-base sm:text-sm"
        />
        <Button
          v-if="directApiKey"
          variant="ghost"
          size="sm"
          @click="directApiKey = ''"
        >
          清除本次 Key
        </Button>
      </div>

      <div
        v-if="hasLegacyKey && canUseProxy"
        class="rounded-md border border-amber-500/35 bg-amber-500/10 p-3"
      >
        <p class="text-sm font-medium">
          发现旧版本机 Key
        </p>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          mdlook 不会自动读取或上传它。只有你点击并再次确认后才会迁移；上传失败时旧 Key 会继续保留在本机。
        </p>
        <Button
          v-if="authStore.isLoggedIn"
          variant="outline"
          size="sm"
          class="mt-2"
          :disabled="pendingAction !== null"
          @click="migrateLegacyKey"
        >
          <Loader2 v-if="pendingAction === 'migrate'" class="mr-2 size-4 animate-spin" />
          <RotateCcw v-else class="mr-2 size-4" />
          迁移到加密云端
        </Button>
        <p v-else class="mt-2 text-xs text-muted-foreground">
          登录后可主动迁移；当前不会做任何上传。
        </p>
      </div>

      <div v-if="credentialError || actionError" class="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
        {{ actionError || credentialError }}
      </div>
    </section>

    <PrivateSkillManager v-if="showSkills" />
  </div>
</template>
