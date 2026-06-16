<script setup lang="ts">
import { Columns2, Eye, FileText, PenLine, Type } from '@lucide/vue'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
const { isMobile, viewMode, editorType } = storeToRefs(uiStore)

const allViewModes = [
  { key: `edit` as const, icon: PenLine, label: `编辑` },
  { key: `split` as const, icon: Columns2, label: `双屏` },
  { key: `preview` as const, icon: Eye, label: `预览` },
]
const viewModes = computed(() =>
  isMobile.value ? allViewModes.filter(m => m.key !== `split`) : allViewModes,
)
</script>

<template>
  <TooltipProvider>
    <div class="flex items-center gap-2">
      <!-- 编辑器模式：源码 / 所见即所得（桌面端） -->
      <div v-if="!isMobile" class="flex items-center gap-0.5 rounded-md border border-border/60 p-0.5">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              aria-label="源码模式"
              class="flex cursor-pointer items-center rounded-sm px-1.5 py-1 transition-all duration-200"
              :class="editorType === 'source'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
              @click="uiStore.setEditorType('source')"
            >
              <FileText class="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" :side-offset="6" class="text-xs text-muted-foreground">
            <p>源码模式</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              aria-label="所见即所得"
              class="flex cursor-pointer items-center rounded-sm px-1.5 py-1 transition-all duration-200"
              :class="editorType === 'wysiwyg'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
              @click="uiStore.setEditorType('wysiwyg')"
            >
              <Type class="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" :side-offset="6" class="text-xs text-muted-foreground">
            <p>所见即所得（Typora 式）</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <!-- 视图模式：编辑 / 双屏 / 预览 -->
      <div class="flex items-center gap-0.5 rounded-md border border-border/60 p-0.5">
        <Tooltip v-for="mode in viewModes" :key="mode.key">
          <TooltipTrigger as-child>
            <button
              :aria-label="mode.label"
              class="flex cursor-pointer items-center rounded-sm px-1.5 py-1 transition-all duration-200"
              :class="viewMode === mode.key
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
              @click="uiStore.setViewMode(mode.key)"
            >
              <component :is="mode.icon" class="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" :side-offset="6" class="text-xs text-muted-foreground">
            <p>{{ mode.label }}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  </TooltipProvider>
</template>
