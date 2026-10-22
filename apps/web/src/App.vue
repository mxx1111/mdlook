<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import ConfirmDialog from '@/components/confirm-dialog/ConfirmDialog.vue'
import DesktopSidebar from '@/components/desktop/DesktopSidebar.vue'
import CodemirrorEditor from '@/components/editor/CodemirrorEditor.vue'
import { Toaster } from '@/components/ui/sonner'
import WelcomeGuideDialog from '@/components/WelcomeGuideDialog.vue'
import { isAccountUiEnabled } from '@/services/account/config'
import { isSyncUiEnabled } from '@/services/sync/client'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { useAuthStore } from '@/stores/auth'
import { useDesktopStore } from '@/stores/desktop'
import { useDocumentWorkspaceStore } from '@/stores/documentWorkspace'
import { useEditorStore } from '@/stores/editor'
import { useExportStore } from '@/stores/export'
import { useSyncStore } from '@/stores/sync'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
const { isDark } = storeToRefs(uiStore)

const desktopStore = useDesktopStore()
const editorStore = useEditorStore()
const exportStore = useExportStore()

const authStore = useAuthStore()
const accountSettingsStore = useAccountSettingsStore()
const documentWorkspaceStore = useDocumentWorkspaceStore()
const syncStore = useSyncStore()

const isUtools = ref(false)
let unlistenDesktopMenu: (() => void) | null = null

/** 初始化账户与云同步 */
async function bootstrapApp() {
  if (isAccountUiEnabled()) {
    await authStore.bootstrap()
  }

  // guest 与每个账号都先打开各自的本机草稿库；远端拉取由 Store 在后台继续。
  await documentWorkspaceStore.bootstrap()

  if (isAccountUiEnabled() && authStore.isLoggedIn)
    await accountSettingsStore.bootstrap()

  if (!isSyncUiEnabled() || !authStore.isLoggedIn)
    return

  syncStore.startAutoSyncWatcher()
  await syncStore.sync()
}

function isPrimaryShortcut(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey
}

function cycleViewMode() {
  const modes: Array<'edit' | 'split' | 'preview'> = uiStore.isMobile ? [`edit`, `preview`] : [`edit`, `split`, `preview`]
  const index = modes.indexOf(uiStore.viewMode)
  uiStore.setViewMode(modes[(index + 1) % modes.length])
}

function runDesktopCommand(command: string) {
  if (!desktopStore.isTauri)
    return

  switch (command) {
    case `new-draft`:
      void desktopStore.newDraft()
      break
    case `open-file`:
      void desktopStore.openFileDialog()
      break
    case `open-folder`:
      void desktopStore.openFolderDialog()
      break
    case `save`:
      void desktopStore.saveBack()
      break
    case `save-as`:
      void desktopStore.saveAs()
      break
    case `copy-to-wechat`:
      window.dispatchEvent(new CustomEvent(`mdlook:copy-to-wechat`))
      break
    case `cycle-view`:
      cycleViewMode()
      break
    case `toggle-style-panel`:
      uiStore.isOpenRightSlider = !uiStore.isOpenRightSlider
      break
    case `open-history`:
      uiStore.isOpenPostSlider = true
      window.dispatchEvent(new CustomEvent(`mdlook:open-current-history`))
      break
    case `export-md`:
      exportStore.exportEditorContent2MD(editorStore.getContent())
      break
    case `export-html`:
      void exportStore.exportEditorContent2HTML()
      break
    case `export-pure-html`:
      exportStore.exportEditorContent2PureHTML(editorStore.getContent())
      break
    case `export-pdf`:
      void exportStore.exportEditorContent2PDF()
      break
    case `export-png`:
      void exportStore.downloadAsCardImage()
      break
  }
}

function handleDesktopShortcut(event: KeyboardEvent) {
  if (!desktopStore.isTauri || event.defaultPrevented || !isPrimaryShortcut(event) || event.altKey)
    return

  const key = event.key.toLowerCase()

  if (key === `n` && !event.shiftKey) {
    event.preventDefault()
    runDesktopCommand(`new-draft`)
    return
  }

  if (key === `o` && event.shiftKey) {
    event.preventDefault()
    runDesktopCommand(`open-folder`)
    return
  }

  if (key === `o`) {
    event.preventDefault()
    runDesktopCommand(`open-file`)
    return
  }

  if (key === `s` && event.shiftKey) {
    event.preventDefault()
    runDesktopCommand(`save-as`)
    return
  }

  if (key === `s`) {
    event.preventDefault()
    runDesktopCommand(`save`)
    return
  }

  if (key === `c` && event.shiftKey) {
    event.preventDefault()
    runDesktopCommand(`copy-to-wechat`)
    return
  }

  if (key === `p` && event.shiftKey) {
    event.preventDefault()
    runDesktopCommand(`cycle-view`)
  }
}

async function initDesktopMenuEvents() {
  try {
    const { listen } = await import(`@tauri-apps/api/event`)
    unlistenDesktopMenu = await listen<string>(`mdlook://menu-command`, (event) => {
      if (event.payload)
        runDesktopCommand(event.payload)
    })
  }
  catch (error) {
    console.error(`desktop menu init failed`, error)
  }
}

onMounted(() => {
  // 检测是否为 Utools 环境
  isUtools.value = !!(window as any).__MD_UTOOLS__
  if (isUtools.value) {
    document.documentElement.classList.add(`is-utools`)
  }

  // 桌面端（Tauri）：处理双击 .md 打开、监听运行时打开事件
  if (desktopStore.isTauri) {
    document.documentElement.classList.add(`is-tauri`)
    void initDesktopMenuEvents()
    window.addEventListener(`keydown`, handleDesktopShortcut, { capture: true })
  }

  // 账号 Scope 必须先落定，再恢复本地文件；否则异步切换会把刚打开的文件覆盖。
  void bootstrapApp().finally(() => {
    if (desktopStore.isTauri)
      void desktopStore.init()
  })

  // 若 URL 带有 open 参数（Markdown 链接），打开导入对话框并自动导入
  const params = new URLSearchParams(window.location.search)
  const openUrl = params.get(`open`)
  if (openUrl && URL.canParse(openUrl) && /^https?:\/\//i.test(openUrl)) {
    uiStore.importMdOpenUrl = openUrl
    uiStore.isShowImportMdDialog = true
    params.delete(`open`)
    const newSearch = params.toString()
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : ``) + window.location.hash
    window.history.replaceState({}, ``, newUrl)
  }

  window.addEventListener(`mdlook:open-style-panel`, () => {
    uiStore.isOpenRightSlider = true
  })
})

onUnmounted(() => {
  window.removeEventListener(`keydown`, handleDesktopShortcut, true)
  unlistenDesktopMenu?.()
})
</script>

<template>
  <AppSplash />

  <div class="app-shell relative flex w-full">
    <DesktopSidebar v-if="desktopStore.isTauri" />
    <div class="relative min-w-0 flex-1">
      <CodemirrorEditor />
    </div>
  </div>

  <ConfirmDialog />
  <WelcomeGuideDialog />

  <Toaster
    rich-colors
    position="top-center"
    :duration="1200"
    :visible-toasts="1"
    :theme="isDark ? 'dark' : 'light'"
  />
</template>

<style lang="less">
html,
body,
#app {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.app-shell {
  box-sizing: border-box;
  height: 100vh;
  height: 100dvh;
}

// 抵消下拉菜单开启时带来的样式
body {
  pointer-events: initial !important;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
  background-color: transparent;
}

::-webkit-scrollbar-track {
  border-radius: 6px;
  background-color: transparent;
}

::-webkit-scrollbar-thumb {
  border-radius: 6px;
  background-color: #dadada;
}

.dark ::-webkit-scrollbar-thumb {
  background-color: #424242;
}

// Utools 模式下隐藏所有滚动条
.is-utools {
  ::-webkit-scrollbar {
    display: none;
  }

  // Firefox
  * {
    scrollbar-width: none;
  }

  // IE and Edge
  * {
    -ms-overflow-style: none;
  }
}

/* CSS-hints */
.CodeMirror-hints {
  position: absolute;
  z-index: 10;
  overflow-y: auto;
  margin: 0;
  padding: 2px;
  border-radius: 4px;
  max-height: 20em;
  min-width: 200px;
  font-size: 12px;
  font-family: monospace;

  color: #333333;
  background-color: #ffffff;
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.12), 0 2px 4px 0 rgba(0, 0, 0, 0.08);
}

.CodeMirror-hint {
  margin-top: 10px;
  padding: 4px 6px;
  border-radius: 2px;
  white-space: pre;
  color: #000000;
  cursor: pointer;

  &:first-of-type {
    margin-top: 0;
  }
  &:hover {
    background: #f0f0f0;
  }
}
.search-match {
  background-color: #ffeb3b; /* 所有匹配项颜色 */
}
.current-match {
  background-color: #ff5722; /* 当前匹配项更鲜艳的颜色 */
}

@media (max-width: 768px) {
  .app-shell {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }

  [role='menuitem'],
  [role='menuitemcheckbox'],
  [role='menuitemradio'] {
    min-height: 44px;
  }
}
</style>
