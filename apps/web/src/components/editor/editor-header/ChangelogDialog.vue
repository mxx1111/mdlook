<script setup lang="ts">
import { CalendarDays, CheckCircle2, History, Sparkles } from '@lucide/vue'
import { MDLOOK_PRODUCT, MDLOOK_RELEASES } from '@/services/product/info'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

function onUpdate(open: boolean) {
  if (!open)
    emit(`close`)
}
</script>

<template>
  <Dialog :open="props.visible" @update:open="onUpdate">
    <DialogContent class="max-h-[90dvh] overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader class="border-b px-6 pb-5 pt-6">
        <DialogTitle class="flex items-center gap-2">
          <History class="size-5 text-primary" />
          mdlook 版本历史
        </DialogTitle>
        <DialogDescription>
          当前{{ MDLOOK_PRODUCT.runtimeLabel }}版本为 v{{ MDLOOK_PRODUCT.version }}。这里记录 mdlook 自己的功能更新和问题修复，无需跳转到外部网站。
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[65dvh] space-y-5 overflow-y-auto px-6 py-5">
        <section
          v-for="release in MDLOOK_RELEASES"
          :key="release.version"
          class="relative rounded-xl border p-4 sm:p-5"
          :class="{ 'border-primary/35 bg-primary/5': release.version === MDLOOK_PRODUCT.version }"
        >
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold">
                  v{{ release.version }}
                </h3>
                <span
                  v-if="release.version === MDLOOK_PRODUCT.version"
                  class="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
                >
                  <Sparkles class="size-3" />
                  当前版本
                </span>
              </div>
              <p class="mt-1 font-medium">
                {{ release.title }}
              </p>
            </div>
            <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays class="size-3.5" />
              {{ release.date }}
            </span>
          </div>

          <ul class="space-y-2.5">
            <li
              v-for="item in release.highlights"
              :key="item"
              class="flex items-start gap-2 text-sm leading-6 text-muted-foreground"
            >
              <CheckCircle2 class="mt-1 size-4 shrink-0 text-primary" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>
      </div>

      <DialogFooter class="border-t px-6 py-4">
        <Button variant="outline" class="h-11" @click="emit(`close`)">
          关闭
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
