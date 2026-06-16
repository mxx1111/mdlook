<script setup lang="ts">
import { FilePlus, FolderOpen, PanelLeftClose, RefreshCw, Save } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useDesktopStore } from '@/stores/desktop'
import DesktopTreeNode from './DesktopTreeNode.vue'

const desktop = useDesktopStore()
const { fileTree, folderName, isSidebarOpen, isLoading, currentFilePath } = storeToRefs(desktop)
</script>

<template>
  <aside
    v-if="isSidebarOpen"
    class="flex h-full w-[248px] shrink-0 flex-col border-r border-border bg-background"
  >
    <!-- 顶部操作区 -->
    <div class="flex items-center gap-1 border-b border-border px-2 py-2">
      <button
        class="flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-[13px] font-medium text-foreground/90 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        title="打开本地文件夹"
        @click="desktop.openFolderDialog()"
      >
        <FolderOpen class="size-4 text-[#d97757]" />
        <span class="truncate">{{ folderName || '打开文件夹' }}</span>
      </button>
      <button
        class="rounded p-1.5 text-foreground/70 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        title="打开单个 .md 文件"
        @click="desktop.openFileDialog()"
      >
        <FilePlus class="size-4" />
      </button>
      <button
        v-if="folderName"
        class="rounded p-1.5 text-foreground/70 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        title="刷新文件夹"
        @click="desktop.refreshFolder()"
      >
        <RefreshCw class="size-4" :class="isLoading ? 'animate-spin' : ''" />
      </button>
      <button
        class="rounded p-1.5 text-foreground/70 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        title="收起侧边栏"
        @click="isSidebarOpen = false"
      >
        <PanelLeftClose class="size-4" />
      </button>
    </div>

    <!-- 文件树 -->
    <div class="min-h-0 flex-1 overflow-y-auto py-1">
      <DesktopTreeNode
        v-for="node in fileTree"
        :key="node.path"
        :node="node"
        :depth="0"
      />
      <p
        v-if="fileTree.length === 0"
        class="px-4 py-8 text-center text-xs text-muted-foreground"
      >
        点击上方「打开文件夹」<br>浏览本地 Markdown 文件
      </p>
    </div>

    <!-- 底部：保存回源文件 -->
    <div
      v-if="currentFilePath"
      class="border-t border-border px-2 py-2"
    >
      <button
        class="flex w-full items-center justify-center gap-1.5 rounded bg-[#d97757] px-2 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#c15f3c]"
        title="把当前内容保存回原文件"
        @click="desktop.saveBack()"
      >
        <Save class="size-4" />
        保存到源文件
      </button>
    </div>
  </aside>

  <!-- 收起后的展开把手 -->
  <button
    v-else
    class="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-r bg-background/90 p-1.5 text-foreground/70 shadow-sm ring-1 ring-border transition-colors hover:bg-black/5 dark:hover:bg-white/10"
    title="展开文件栏"
    @click="isSidebarOpen = true"
  >
    <FolderOpen class="size-4" />
  </button>
</template>
