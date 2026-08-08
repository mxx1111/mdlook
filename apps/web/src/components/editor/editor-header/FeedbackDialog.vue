<script setup lang="ts">
import { ClipboardCopy, ExternalLink, MessageSquareText, ShieldCheck } from '@lucide/vue'
import { MDLOOK_PRODUCT } from '@/services/product/info'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const feedbackType = ref(`问题反馈`)
const description = ref(``)
const contact = ref(``)
const includePublicContact = ref(false)
const includeEnvironment = ref(true)

const feedbackTypes = [`问题反馈`, `功能建议`, `体验优化`, `其他`]

const feedbackReport = computed(() => {
  const lines = [
    `# mdlook ${feedbackType.value}`,
    ``,
    `## 反馈内容`,
    description.value.trim() || `请在这里补充反馈内容`,
  ]

  if (includePublicContact.value && contact.value.trim()) {
    lines.push(``, `## 联系方式`, contact.value.trim())
  }

  if (includeEnvironment.value) {
    lines.push(
      ``,
      `## 使用环境`,
      `- mdlook ${MDLOOK_PRODUCT.runtimeLabel} 版本：${MDLOOK_PRODUCT.version}`,
      `- 系统平台：${navigator.platform || `未知`}`,
      `- 浏览器环境：${navigator.userAgent}`,
    )
  }

  return lines.join(`\n`)
})

function onUpdate(open: boolean) {
  if (!open) {
    includePublicContact.value = false
    emit(`close`)
  }
}

async function copyFeedback() {
  if (!description.value.trim()) {
    toast.warning(`请先填写反馈内容`)
    return false
  }

  await navigator.clipboard.writeText(feedbackReport.value)
  toast.success(`反馈内容已复制`)
  return true
}

async function copyAndOpenFeedbackPage() {
  if (!await copyFeedback())
    return

  const url = new URL(`${MDLOOK_PRODUCT.feedbackUrl}/new`)
  url.searchParams.set(`title`, `[${feedbackType.value}] `)
  url.searchParams.set(`body`, feedbackReport.value)
  window.open(url.toString(), `_blank`, `noopener,noreferrer`)
}
</script>

<template>
  <Dialog :open="props.visible" @update:open="onUpdate">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <MessageSquareText class="size-5 text-primary" />
          反馈与建议
        </DialogTitle>
        <DialogDescription>
          反馈会复制到 mdlook 的公开 GitHub Issue 页面；提交后内容对所有人可见。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5 py-1">
        <div class="grid gap-2">
          <Label for="feedback-type">反馈类型</Label>
          <Select v-model="feedbackType">
            <SelectTrigger id="feedback-type" class="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in feedbackTypes" :key="item" :value="item">
                {{ item }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid gap-2">
          <Label for="feedback-description">具体内容</Label>
          <Textarea
            id="feedback-description"
            v-model="description"
            class="min-h-36 resize-y text-base"
            placeholder="请描述遇到的问题、操作步骤、期望效果，越具体越容易处理。"
          />
        </div>

        <div class="grid gap-2">
          <Label for="feedback-contact">
            联系方式
            <span class="font-normal text-muted-foreground">（选填）</span>
          </Label>
          <Input
            id="feedback-contact"
            v-model="contact"
            class="h-11 text-base"
            placeholder="邮箱、微信或其他联系方式（不会默认公开）"
          />
          <label class="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <Checkbox v-model="includePublicContact" class="mt-0.5" />
            <span class="min-w-0">
              <span class="block text-sm font-medium">
                允许在公开 Issue 中附带联系方式
              </span>
              <span class="mt-1 block text-xs leading-5 text-muted-foreground">
                默认关闭。开启后，任何访问公开仓库的人都可能看到上面的联系方式。
              </span>
            </span>
          </label>
        </div>

        <label class="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-3">
          <Checkbox v-model="includeEnvironment" class="mt-0.5" />
          <span class="min-w-0">
            <span class="flex items-center gap-1.5 text-sm font-medium">
              <ShieldCheck class="size-4 text-primary" />
              附带基础环境信息
            </span>
            <span class="mt-1 block text-xs leading-5 text-muted-foreground">
              仅包含 mdlook 版本、系统平台和浏览器信息，不读取文章内容、账号密码或 API Key。
            </span>
          </span>
        </label>

        <div class="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
          当前不会在后台静默上传。点击后会先复制反馈内容，再打开公开 GitHub Issue 页面；请在提交前再次检查并删除不希望公开的信息。若页面暂时无法访问，也可以保留复制内容，稍后再反馈。
        </div>
      </div>

      <DialogFooter class="grid grid-cols-[0.8fr_1.4fr] gap-2 sm:grid-cols-2">
        <Button variant="outline" class="h-11" @click="copyFeedback">
          <ClipboardCopy class="mr-2 size-4" />
          仅复制
        </Button>
        <Button class="h-11" @click="copyAndOpenFeedbackPage">
          <ExternalLink class="mr-2 size-4" />
          复制并打开公开反馈页
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
