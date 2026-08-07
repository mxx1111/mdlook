<script setup lang="ts">
import type { DesktopFileNode } from '@/stores/desktop'
import { ChevronRight, FileText, Folder } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useDesktopStore } from '@/stores/desktop'

const props = defineProps<{ node: DesktopFileNode, depth: number }>()

const desktop = useDesktopStore()
const { currentFilePath } = storeToRefs(desktop)
const expanded = ref(props.depth < 1)

const isActive = computed(() => !props.node.isDir && currentFilePath.value === props.node.path)
const indent = computed(() => `${props.depth * 12 + 8}px`)

function onClick() {
  if (props.node.isDir)
    expanded.value = !expanded.value
  else
    desktop.openPath(props.node.path)
}
</script>

<template>
  <div>
    <button
      class="flex w-full items-center gap-1 truncate rounded py-1.5 pr-2 text-left text-[14px] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      :class="isActive ? 'bg-[#d97757]/15 text-[#c15f3c] font-medium' : 'text-foreground/80'"
      :style="{ paddingLeft: indent }"
      :title="node.name"
      :aria-current="isActive ? 'page' : undefined"
      @click="onClick"
    >
      <ChevronRight
        v-if="node.isDir"
        class="size-3.5 shrink-0 transition-transform"
        :class="expanded ? 'rotate-90' : ''"
      />
      <Folder
        v-if="node.isDir"
        class="size-3.5 shrink-0 text-[#d97757]"
      />
      <FileText
        v-else
        class="ml-3.5 size-3.5 shrink-0 opacity-60"
      />
      <span class="truncate">{{ node.name }}</span>
    </button>

    <div v-if="node.isDir && expanded">
      <DesktopTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
