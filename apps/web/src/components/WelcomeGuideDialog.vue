<script setup lang="ts">
import { Copy, FolderOpen, ImageUp, Palette, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { addPrefix } from '@/utils'

const GUIDE_SEEN_KEY = addPrefix(`welcome_guide_seen`)

const open = ref(false)

function closeGuide() {
  open.value = false
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, `1`)
  }
  catch { /* ignore */ }
}

function openStylePanel() {
  window.dispatchEvent(new CustomEvent(`mdlook:open-style-panel`))
  closeGuide()
}

onMounted(() => {
  try {
    open.value = localStorage.getItem(GUIDE_SEEN_KEY) !== `1`
  }
  catch {
    open.value = true
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="value => !value && closeGuide()">
    <DialogContent class="sm:max-w-xl gap-0 p-0 overflow-hidden">
      <DialogHeader class="px-6 pt-6 pb-4 border-b">
        <DialogTitle>开始用 mdlook</DialogTitle>
        <DialogDescription>
          写 Markdown，选一套顺眼的主题，然后复制到公众号后台。
        </DialogDescription>
      </DialogHeader>

      <div class="px-6 py-5 grid gap-3">
        <div class="guide-row">
          <Palette class="guide-icon" />
          <div>
            <p class="guide-title">
              先定风格
            </p>
            <p class="guide-text">
              默认 Claude 阅读风，也可以在样式里导入 Linear、Apple、Figma 等 DESIGN.md 主题。
            </p>
          </div>
        </div>
        <div class="guide-row">
          <ImageUp class="guide-icon" />
          <div>
            <p class="guide-title">
              图片先粘贴进来
            </p>
            <p class="guide-text">
              直接复制图片后粘贴到编辑器，图床上传成功后再去公众号后台粘贴。
            </p>
          </div>
        </div>
        <div class="guide-row">
          <Copy class="guide-icon" />
          <div>
            <p class="guide-title">
              最后一键复制
            </p>
            <p class="guide-text">
              普通复制适合大多数文章；配置公众号后端后，可用“微信图片”先转换图片地址。
            </p>
          </div>
        </div>
        <div class="guide-row">
          <FolderOpen class="guide-icon" />
          <div>
            <p class="guide-title">
              Mac App 还能管本地文件
            </p>
            <p class="guide-text">
              桌面端可以打开 Markdown 文件夹、预览、编辑并保存回源文件。
            </p>
          </div>
        </div>
      </div>

      <DialogFooter class="px-6 py-4 border-t bg-muted/30 gap-2">
        <Button variant="outline" class="gap-2" @click="closeGuide">
          <X class="h-4 w-4" />
          稍后再说
        </Button>
        <Button class="gap-2" @click="openStylePanel">
          <Palette class="h-4 w-4" />
          去选主题
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.guide-row {
  display: grid;
  grid-template-columns: 2.25rem 1fr;
  gap: 0.75rem;
  align-items: start;
}

.guide-icon {
  width: 1rem;
  height: 1rem;
  margin: 0.25rem auto 0;
  color: hsl(var(--primary));
}

.guide-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.guide-text {
  margin: 0.2rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: hsl(var(--muted-foreground));
}
</style>
