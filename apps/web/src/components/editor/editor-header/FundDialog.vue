<script setup lang="ts">
import { ExternalLink, MessageSquareText, Star } from '@lucide/vue'
import logo from '@/assets/images/favicon.png'
import { MDLOOK_PRODUCT } from '@/services/product/info'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([`close`])

function onUpdate(val: boolean) {
  if (!val) {
    emit(`close`)
  }
}

function openRepository() {
  window.open(MDLOOK_PRODUCT.repositoryUrl, `_blank`, `noopener,noreferrer`)
}
</script>

<template>
  <Dialog :open="props.visible" @update:open="onUpdate">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>支持 mdlook</DialogTitle>
        <DialogDescription>
          你的真实反馈和使用建议，就是现阶段对 mdlook 最有价值的支持。
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col items-center py-4 text-center">
        <img :src="logo" alt="mdlook 图标" class="size-20 rounded-2xl shadow-md">
        <p class="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
          如果 mdlook 帮到了你，欢迎在公开仓库点亮 Star、提交问题，或告诉我们最希望改进的写作体验。
        </p>
      </div>

      <DialogFooter class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" @click="emit('close')">
          <MessageSquareText class="mr-2 size-4" />
          关闭
        </Button>
        <Button @click="openRepository">
          <Star class="mr-2 size-4" />
          访问 mdlook 公开仓库
          <ExternalLink class="ml-2 size-3.5" />
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
