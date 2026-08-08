<script setup lang="ts">
import { FileInput, FilePlus, FileText, FolderOpen, PanelLeftClose, RefreshCw, Save, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { Switch } from '@/components/ui/switch'
import { useDesktopStore } from '@/stores/desktop'
import DesktopTreeNode from './DesktopTreeNode.vue'

const desktop = useDesktopStore()
const {
  fileTree,
  folderRoot,
  folderName,
  isSidebarOpen,
  isLoading,
  currentFilePath,
  recentFiles,
  recentFolders,
  autoSaveEnabled,
  hasUnsavedChanges,
  isSaving,
  lastSavedAt,
  lastSaveError,
  externalChangeDetected,
  isUnboundDraft,
} = storeToRefs(desktop)

const visibleRecentFiles = computed(() => recentFiles.value.filter((file) => {
  const root = folderRoot.value
  return !root || !file.path.startsWith(`${root}/`)
}))

const saveStateText = computed(() => {
  if (lastSaveError.value)
    return `保存失败`
  if (isSaving.value)
    return `保存中`
  if (isUnboundDraft.value)
    return `临时草稿`
  if (hasUnsavedChanges.value)
    return `有未保存修改`
  if (lastSavedAt.value)
    return `已保存`
  return `未绑定文件`
})
</script>

<template>
  <aside
    v-if="isSidebarOpen"
    class="flex h-full w-[272px] shrink-0 flex-col border-r border-border bg-background"
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
        title="新建临时草稿"
        @click="desktop.newDraft()"
      >
        <FilePlus class="size-4" />
      </button>
      <button
        class="rounded p-1.5 text-foreground/70 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        title="打开单个 .md 文件"
        @click="desktop.openFileDialog()"
      >
        <FileInput class="size-4" />
      </button>
      <button
        class="rounded p-1.5 text-foreground/70 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        :title="currentFilePath ? '保存' : '选择位置并保存'"
        @click="desktop.saveBack()"
      >
        <Save class="size-4" />
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
      <div
        v-if="recentFolders.length"
        class="border-b border-border pb-2"
      >
        <div class="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          最近工作区
        </div>
        <div class="space-y-0.5 px-1">
          <div
            v-for="folder in recentFolders"
            :key="folder.path"
            class="group flex items-center gap-1"
          >
            <button
              class="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded px-2 py-1 text-left text-[13px] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              :class="folderName === folder.name ? 'bg-[#d97757]/15 text-[#c15f3c] font-medium' : 'text-foreground/80'"
              :title="folder.path"
              @click="desktop.loadFolder(folder.path)"
            >
              <FolderOpen class="size-3.5 shrink-0 text-[#d97757]" />
              <span class="truncate">{{ folder.name }}</span>
            </button>
            <button
              class="rounded p-1 text-foreground/40 opacity-0 transition-colors hover:bg-black/5 hover:text-foreground/70 group-hover:opacity-100 dark:hover:bg-white/10"
              title="从最近工作区中移除"
              @click.stop="desktop.removeRecentFolder(folder.path)"
            >
              <X class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="visibleRecentFiles.length"
        class="border-b border-border pb-2"
      >
        <div class="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          最近文件
        </div>
        <div class="space-y-0.5 px-1">
          <div
            v-for="file in visibleRecentFiles"
            :key="file.path"
            class="group flex items-center gap-1"
          >
            <button
              class="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded px-2 py-1.5 text-left text-[14px] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              :class="currentFilePath === file.path ? 'bg-[#d97757]/15 text-[#c15f3c] font-medium' : 'text-foreground/80'"
              :title="file.path"
              @click="desktop.openPath(file.path)"
            >
              <FileText class="size-3.5 shrink-0 opacity-60" />
              <span class="truncate">{{ file.name }}</span>
            </button>
            <button
              class="rounded p-1 text-foreground/40 opacity-0 transition-colors hover:bg-black/5 hover:text-foreground/70 group-hover:opacity-100 dark:hover:bg-white/10"
              title="从最近文件中移除"
              @click.stop="desktop.removeRecentFile(file.path)"
            >
              <X class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

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
      v-if="currentFilePath || isUnboundDraft"
      class="space-y-2 border-t border-border px-2 py-2"
    >
      <div
        v-if="externalChangeDetected"
        class="rounded border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <p class="font-medium">
          文件已在外部修改
        </p>
        <button
          class="mt-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-amber-700"
          @click="desktop.reloadCurrentFileFromDisk()"
        >
          重新加载
        </button>
      </div>

      <div class="flex items-center justify-between gap-2 px-1">
        <div class="min-w-0">
          <p class="truncate text-[12px] font-medium text-foreground/80">
            {{ saveStateText }}
          </p>
          <p class="truncate text-[11px] text-muted-foreground">
            {{ currentFilePath || '已存入本机缓存，选择位置后写入文件' }}
          </p>
        </div>
        <Switch
          v-if="currentFilePath"
          :model-value="autoSaveEnabled"
          title="自动保存"
          @update:model-value="desktop.setAutoSaveEnabled(Boolean($event))"
        />
      </div>
      <button
        class="flex w-full items-center justify-center gap-1.5 rounded bg-[#d97757] px-2 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#c15f3c]"
        title="把当前内容保存回原文件"
        @click="desktop.saveBack()"
      >
        <Save class="size-4" />
        {{ !currentFilePath ? '选择位置并保存' : (autoSaveEnabled ? '立即保存' : '保存到源文件') }}
      </button>
      <button
        class="flex w-full items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        title="保存为新的 Markdown 文件"
        @click="desktop.saveAs()"
      >
        另存为
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
