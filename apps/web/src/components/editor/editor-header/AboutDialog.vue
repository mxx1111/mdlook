<script setup lang="ts">
import { Code2, ExternalLink, MessageSquareText, Sparkles } from '@lucide/vue'
import logo from '@/assets/images/favicon.png'
import { MDLOOK_PRODUCT } from '@/services/product/info'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([`close`, `openFeedback`])

function onUpdate(val: boolean) {
  if (!val) {
    emit(`close`)
  }
}

function onRedirect(url: string) {
  window.open(url, `_blank`, `noopener,noreferrer`)
}

function openFeedbackDialog() {
  emit(`close`)
  emit(`openFeedback`)
}
</script>

<template>
  <Dialog :open="props.visible" @update:open="onUpdate">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>关于 mdlook</DialogTitle>
        <DialogDescription>
          一款认真打磨写作、预览与公众号排版体验的 Markdown 编辑器。
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col items-center px-2 pb-1 pt-3 text-center">
        <img
          class="size-24 rounded-3xl shadow-[0_18px_45px_rgba(60,40,30,0.16)]"
          :src="logo"
          alt="mdlook 图标"
        >
        <h3 class="mt-5 text-2xl font-semibold tracking-tight">
          {{ MDLOOK_PRODUCT.name }}
        </h3>
        <p class="mt-1 text-sm font-medium text-primary">
          {{ MDLOOK_PRODUCT.slogan }}
        </p>
        <p class="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {{ MDLOOK_PRODUCT.description }}
        </p>

        <div class="mt-4 inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles class="size-3.5 text-primary" />
          {{ MDLOOK_PRODUCT.runtimeLabel }} 版本 v{{ MDLOOK_PRODUCT.version }}
        </div>

        <div class="mt-5 grid w-full grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <span class="rounded-lg border bg-background px-2 py-2">网页排版</span>
          <span class="rounded-lg border bg-background px-2 py-2">Mac 本地写作</span>
          <span class="rounded-lg border bg-background px-2 py-2">手机端处理</span>
          <span class="rounded-lg border bg-background px-2 py-2">DeepSeek 排版</span>
        </div>
      </div>

      <div class="rounded-lg border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
        mdlook 是独立维护的产品，并在 doocs/md 等开源成果基础上持续演进。原作者版权与 WTFPL 许可证信息会完整保留，可在我们自己的仓库中查看。
        <button
          type="button"
          class="ml-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          @click="onRedirect(MDLOOK_PRODUCT.licenseUrl)"
        >
          开源许可与致谢
          <ExternalLink class="size-3" />
        </button>
      </div>

      <DialogFooter class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" class="h-11" @click="onRedirect(MDLOOK_PRODUCT.repositoryUrl)">
          <Code2 class="mr-2 size-4" />
          mdlook 公开仓库
        </Button>
        <Button class="h-11" @click="openFeedbackDialog">
          <MessageSquareText class="mr-2 size-4" />
          反馈与建议
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
