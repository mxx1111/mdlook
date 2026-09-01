<script setup lang="ts">
import type { PreflightIssue } from '@/services/wechat/preflight'
import { ClipboardCheck, Copy, FileText, Loader2, Menu, Palette, Type, UserRound, WandSparkles } from '@lucide/vue'
import { isAccountUiEnabled } from '@/services/account/config'
import { isShareUiEnabled } from '@/services/share/client'
import { isSyncUiEnabled } from '@/services/sync/client'
import { getWechatImageCredentials } from '@/services/wechat/config'
import { normalizeWechatImages } from '@/services/wechat/images'
import { runWechatPreflight } from '@/services/wechat/preflight'
import { useEditorStore } from '@/stores/editor'
import { useExportStore } from '@/stores/export'
import { useRenderStore } from '@/stores/render'
import { useThemeStore } from '@/stores/theme'
import { useUIStore } from '@/stores/ui'
import { addPrefix, generatePureHTML, processClipboardContent, warmupClipboardPipeline } from '@/utils'
import { copyHtmlNative, isTauri } from '@/utils/clipboard'
import { store } from '@/utils/storage'
import EditorModeToggle from '../EditorModeToggle.vue'
import AccountDialog from './AccountDialog.vue'
import AutoFormatDialog from './AutoFormatDialog.vue'
import ChangelogDialog from './ChangelogDialog.vue'
import EditDropdown from './EditDropdown.vue'
import FeedbackDialog from './FeedbackDialog.vue'
import FileDropdown from './FileDropdown.vue'
import FormatDropdown from './FormatDropdown.vue'
import HelpDropdown from './HelpDropdown.vue'
import InsertDropdown from './InsertDropdown.vue'
import MarkdownHelpDialog from './MarkdownHelpDialog.vue'
import ShareDialog from './ShareDialog.vue'
import StyleDropdown from './StyleDropdown.vue'
import SyncDialog from './SyncDialog.vue'
import WechatImageConfigDialog from './WechatImageConfigDialog.vue'

const emit = defineEmits([`startCopy`, `endCopy`])

const editorStore = useEditorStore()
const themeStore = useThemeStore()
const renderStore = useRenderStore()
const uiStore = useUIStore()
const exportStore = useExportStore()

const { output } = storeToRefs(renderStore)
const { primaryColor } = storeToRefs(themeStore)
const { isOpenRightSlider, isShowSyncDialog, isShowAccountDialog } = storeToRefs(uiStore)
const showAccountUi = isAccountUiEnabled()
const showSyncUi = isSyncUiEnabled()
const showShareUi = isShareUiEnabled()

// Editor refresh function
function editorRefresh() {
  themeStore.updateCodeTheme()

  const raw = editorStore.getContent()
  renderStore.render(raw)
}

// 对话框状态
const aboutDialogVisible = ref(false)
const fundDialogVisible = ref(false)
const editorStateDialogVisible = ref(false)
const markdownHelpDialogVisible = ref(false)
const feedbackDialogVisible = ref(false)
const changelogDialogVisible = ref(false)
const autoFormatDialogVisible = ref(false)
const wechatImageConfigDialogVisible = ref(false)

function handleOpenAbout() {
  aboutDialogVisible.value = true
}

function handleOpenFund() {
  fundDialogVisible.value = true
}

function handleOpenEditorState() {
  editorStateDialogVisible.value = true
}

function handleOpenMarkdownHelp() {
  markdownHelpDialogVisible.value = true
}

function handleOpenFeedback() {
  feedbackDialogVisible.value = true
}

function handleOpenChangelog() {
  changelogDialogVisible.value = true
}

const copyMode = store.reactive(addPrefix(`copyMode`), `txt`)
const isCopying = ref(false)
const isWechatImageCopying = ref(false)
const shareDialogVisible = ref(false)
const preflightDialogVisible = ref(false)
const preflightIssues = ref<PreflightIssue[]>([])

const { copy: copyContent } = useClipboard({
  legacy: true,
})

/** 等待页面重新获得焦点（浏览器只在页面聚焦时才肯写剪贴板） */
function waitForDocumentFocus(timeout = 30_000): Promise<boolean> {
  if (document.hasFocus())
    return Promise.resolve(true)

  return new Promise((resolve) => {
    let timer = 0
    const onFocus = () => {
      window.removeEventListener(`focus`, onFocus)
      window.clearTimeout(timer)
      resolve(true)
    }
    timer = window.setTimeout(() => {
      window.removeEventListener(`focus`, onFocus)
      resolve(false)
    }, timeout)
    window.addEventListener(`focus`, onFocus)
  })
}

const normalizeErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

interface ClipboardImageReport {
  total: number
  alreadyWechat: number
  nonPublic: number
  unsupported: number
  oversizedDataUrl: number
  external: number
}

function htmlToPlainText(html: string) {
  const temp = document.createElement(`div`)
  temp.innerHTML = html
  return temp.textContent || ``
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  if (host === `localhost` || host.endsWith(`.localhost`) || host === `::1`)
    return true
  if (/^127\./.test(host) || /^10\./.test(host) || host === `0.0.0.0`)
    return true
  if (/^192\.168\./.test(host) || /^169\.254\./.test(host))
    return true
  if (!/^172\.\d{1,2}\./.test(host))
    return false
  const second = Number(host.split(`.`)[1])
  return second >= 16 && second <= 31
}

function isWechatImageHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host.includes(`mmbiz.qpic.cn`) || host.includes(`mmbiz.qlogo.cn`) || host.includes(`qpic.cn`)
}

function isLikelyWechatInlineImage(url: URL) {
  const pathname = url.pathname.toLowerCase()
  return /\.(?:jpe?g|png)(?:$|[?#])/.test(pathname)
}

function inspectClipboardImages(html: string): ClipboardImageReport {
  const temp = document.createElement(`div`)
  temp.innerHTML = html
  const report: ClipboardImageReport = {
    total: 0,
    alreadyWechat: 0,
    nonPublic: 0,
    unsupported: 0,
    oversizedDataUrl: 0,
    external: 0,
  }

  temp.querySelectorAll<HTMLImageElement>(`img[src]`).forEach((img) => {
    const src = img.getAttribute(`src`)?.trim()
    if (!src)
      return

    report.total += 1

    if (src.startsWith(`data:`)) {
      if (src.length > 1.4 * 1024 * 1024)
        report.oversizedDataUrl += 1
      else
        report.nonPublic += 1
      return
    }

    if (src.startsWith(`blob:`) || src.startsWith(`file:`)) {
      report.nonPublic += 1
      return
    }

    try {
      const url = new URL(src)
      if (url.protocol !== `http:` && url.protocol !== `https:`) {
        report.nonPublic += 1
        return
      }

      if (isPrivateHost(url.hostname)) {
        report.nonPublic += 1
        return
      }

      if (isWechatImageHost(url.hostname)) {
        report.alreadyWechat += 1
        return
      }

      if (!isLikelyWechatInlineImage(url))
        report.unsupported += 1

      report.external += 1
    }
    catch {
      report.nonPublic += 1
    }
  })

  return report
}

function notifyImageReadiness(report: ClipboardImageReport, options: { normalizeWechatImages?: boolean }) {
  if (!report.total)
    return

  const issues: string[] = []
  if (report.nonPublic)
    issues.push(`${report.nonPublic} 张不是公网图片`)
  if (report.unsupported)
    issues.push(`${report.unsupported} 张可能不是 JPG/PNG`)
  if (report.oversizedDataUrl)
    issues.push(`${report.oversizedDataUrl} 张内嵌图片可能超过 1MB`)

  if (issues.length) {
    toast.warning(`图片检查：${issues.join(`，`)}，公众号可能无法正常接收。`)
    return
  }

  if (!options.normalizeWechatImages && report.external > 0) {
    toast.info(`图片检查：发现 ${report.external} 张外链图片；需要更稳时可用“微信图片”复制。`)
  }
}

/** 用已经算好的内容直接写一次富文本剪贴板 */
async function writeRichClipboard(html: string, plainText: string) {
  if (typeof ClipboardItem === `undefined` || !navigator.clipboard?.write)
    throw new TypeError(`ClipboardItem is not supported in this browser.`)

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: `text/html` }),
      'text/plain': new Blob([plainText], { type: `text/plain` }),
    }),
  ])
}

function fallbackCopyUsingExecCommand(htmlContent: string) {
  const selection = window.getSelection()

  if (!selection) {
    return false
  }

  const tempContainer = document.createElement(`div`)
  tempContainer.innerHTML = htmlContent
  tempContainer.style.position = `fixed`
  tempContainer.style.left = `-9999px`
  tempContainer.style.top = `0`
  tempContainer.style.opacity = `0`
  tempContainer.style.pointerEvents = `none`
  tempContainer.style.setProperty(`background-color`, `#ffffff`, `important`)
  tempContainer.style.setProperty(`color`, `#000000`, `important`)

  document.body.appendChild(tempContainer)
  let successful = false

  try {
    const range = document.createRange()
    range.selectNodeContents(tempContainer)
    selection.removeAllRanges()
    selection.addRange(range)

    successful = document.execCommand(`copy`)
  }
  catch {
    successful = false
  }
  finally {
    selection.removeAllRanges()
    tempContainer.remove()
  }

  return successful
}

interface ClipboardPayload {
  html: string
  plainText: string
  convertedImageCount: number
}

/** 生成剪贴板内容：等预览重绘 → 内联主题样式 → 可选转换微信图片 */
async function buildClipboardPayload(options: { normalizeWechatImages?: boolean }): Promise<ClipboardPayload> {
  // 只等一次渲染刷新即可；这里每多等 1ms，剪贴板 Promise 就多悬挂 1ms
  await nextTick()

  let processed = await processClipboardContent(primaryColor.value)

  let convertedImageCount = 0
  if (options.normalizeWechatImages) {
    const result = await normalizeWechatImages(processed.html)
    processed = {
      html: result.html,
      plainText: htmlToPlainText(result.html),
    }
    convertedImageCount = result.images.length
  }

  return { ...processed, convertedImageCount }
}

// 复制到微信公众号
async function copy(options: { normalizeWechatImages?: boolean } = {}) {
  isCopying.value = true
  if (options.normalizeWechatImages)
    isWechatImageCopying.value = true

  // 如果是 Markdown 源码，直接复制并返回
  if (copyMode.value === `md`) {
    try {
      const mdContent = editorStore.getContent()
      await copyContent(mdContent)
      toast.success(`已复制 Markdown 源码到剪贴板。`)
    }
    catch (error) {
      toast.error(`复制失败：${normalizeErrorMessage(error)}`)
    }
    finally {
      isCopying.value = false
      isWechatImageCopying.value = false
    }
    return
  }

  // 以下处理非 Markdown 的复制流程
  emit(`startCopy`)

  const payload = buildClipboardPayload(options)
  payload.catch(() => {})

  // 关键：必须在用户点击的同一轮事件循环里发起 navigator.clipboard.write，
  // 并把「还没算完的内容」以 Promise 的形式交给 ClipboardItem。
  // 如果先 await 排版结果再写剪贴板，用户只要在排版完成前切走窗口
  // （比如点完复制就切到公众号后台），浏览器会静默丢掉 text/html，
  // 只留下 text/plain —— write() 依然 resolve，界面提示复制成功，
  // 但粘贴到公众号里就是一堆没有样式的纯文本。
  // 桌面端（WKWebView）根本不支持写富文本剪贴板，必须走 Tauri 原生命令，
  // 否则会一路掉到 execCommand 兜底，最后只把纯文本送进公众号。
  const useNativeClipboard = copyMode.value === `txt` && isTauri()

  let richWrite: Promise<void> | null = null
  if (!useNativeClipboard && copyMode.value === `txt` && typeof ClipboardItem !== `undefined` && navigator.clipboard?.write) {
    try {
      const clipboardItem = new ClipboardItem({
        'text/html': payload.then(content => new Blob([content.html], { type: `text/html` })),
        'text/plain': payload.then(content => new Blob([content.plainText], { type: `text/plain` })),
      })
      richWrite = navigator.clipboard.write([clipboardItem])
      richWrite.catch(() => {})
    }
    catch {
      // 浏览器不支持 Promise 形式的 ClipboardItem，走后面的兜底逻辑
      richWrite = null
    }
  }

  try {
    let content: ClipboardPayload
    try {
      content = await payload
    }
    catch (error) {
      toast.error(`处理 HTML 失败，请联系开发者。${normalizeErrorMessage(error)}`)
      editorRefresh()
      return
    }

    if (!content.html) {
      toast.error(`未找到复制输出区域，请刷新页面后重试。`)
      editorRefresh()
      return
    }

    notifyImageReadiness(inspectClipboardImages(content.html), options)

    const temp = content.html

    if (copyMode.value === `txt`) {
      let copied = false
      let lastError: unknown = new TypeError(`ClipboardItem is not supported in this browser.`)

      if (useNativeClipboard) {
        try {
          await copyHtmlNative(temp, content.plainText)
          copied = true
        }
        catch (error) {
          console.error(`[copy] 原生剪贴板写入失败`, error)
          lastError = error
        }
      }

      if (!copied && richWrite) {
        try {
          await richWrite
          copied = true
        }
        catch (error) {
          lastError = error
        }
      }

      // 写入被拒通常是因为页面已经失去焦点（用户点完复制就切去了公众号后台）。
      // 等页面重新拿到焦点再写一次，比直接报错更有机会救回来。
      if (!copied && await waitForDocumentFocus()) {
        try {
          await writeRichClipboard(temp, content.plainText)
          copied = true
        }
        catch (error) {
          lastError = error
        }
      }

      if (!copied) {
        document.getElementById(`output`)?.focus()
        window.getSelection()?.removeAllRanges()

        if (!fallbackCopyUsingExecCommand(temp)) {
          window.getSelection()?.removeAllRanges()
          editorRefresh()
          toast.error(`复制失败，请联系开发者。${normalizeErrorMessage(lastError)}`)
          return
        }
      }
    }

    if (copyMode.value === `html`) {
      await copyContent(temp)
    }
    else if (copyMode.value === `html-without-style`) {
      await copyContent(await generatePureHTML(editorStore.getContent()))
    }
    else if (copyMode.value === `html-and-style`) {
      await copyContent(exportStore.editorContent2HTML())
    }

    // 输出提示
    toast.success(
      copyMode.value === `html`
        ? `已复制 HTML 源码，请进行下一步操作。`
        : options.normalizeWechatImages
          ? `已转换 ${content.convertedImageCount} 张微信图片并复制，可直接到公众号后台粘贴。`
          : `已复制渲染后的内容到剪贴板，可直接到公众号后台粘贴。`,
    )
    window.dispatchEvent(
      new CustomEvent(`copyToMp`, {
        detail: {
          content: output.value,
        },
      }),
    )
    editorRefresh()
  }
  catch (error) {
    toast.error(`复制失败：${normalizeErrorMessage(error)}`)
    editorRefresh()
  }
  finally {
    emit(`endCopy`)
    isCopying.value = false
    isWechatImageCopying.value = false
  }
}

function handleCopy(mode: string) {
  if (mode === `wechat-images`) {
    if (!getWechatImageCredentials()) {
      wechatImageConfigDialogVisible.value = true
      toast.info(`请先配置公众号 AppID 和 AppSecret。`)
      return
    }
    copyMode.value = `txt`
    copy({ normalizeWechatImages: true })
    return
  }

  copyMode.value = mode
  copy()
}

function copyToWeChat() {
  copyMode.value = 'txt'
  copy()
}

function checkBeforePublish() {
  const raw = editorStore.getContent()
  preflightIssues.value = runWechatPreflight(raw, output.value)
  preflightDialogVisible.value = true
  if (preflightIssues.value.length === 0)
    toast.success(`发布前检查通过`)
}

function handleFormatted() {
  editorRefresh()
}

onMounted(() => {
  window.addEventListener(`mdlook:copy-to-wechat`, copyToWeChat)
  window.addEventListener(`mdlook:open-changelog`, handleOpenChangelog)
  // 预热复制链路，避免首次复制时 juice / hljs 样式表现拉导致耗时过长
  warmupClipboardPipeline()
})

onUnmounted(() => {
  window.removeEventListener(`mdlook:copy-to-wechat`, copyToWeChat)
  window.removeEventListener(`mdlook:open-changelog`, handleOpenChangelog)
})
</script>

<template>
  <header
    class="header-container relative flex min-h-15 flex-nowrap items-center justify-between gap-2 px-2 py-2 md:h-15 md:px-5 md:py-0"
  >
    <!-- 桌面端左侧菜单 -->
    <div class="space-x-1 hidden md:flex">
      <Menubar class="menubar border-0">
        <FileDropdown @open-editor-state="handleOpenEditorState" @open-share="shareDialogVisible = true" />
        <EditDropdown @copy="handleCopy" @open-wechat-image-config="wechatImageConfigDialogVisible = true" />
        <FormatDropdown />
        <InsertDropdown />
        <StyleDropdown />
        <HelpDropdown
          @open-about="handleOpenAbout"
          @open-changelog="handleOpenChangelog"
          @open-feedback="handleOpenFeedback"
          @open-fund="handleOpenFund"
          @open-markdown-help="handleOpenMarkdownHelp"
        />
      </Menubar>
    </div>

    <!-- 移动端汉堡菜单按钮 -->
    <div class="shrink-0 md:hidden">
      <Menubar class="menubar size-11 shrink-0 border-0 p-0">
        <MenubarMenu>
          <MenubarTrigger as-child>
            <Button variant="outline" size="icon" class="size-11 shrink-0" aria-label="主菜单">
              <Menu class="size-4" />
            </Button>
          </MenubarTrigger>
          <MenubarContent align="start">
            <FileDropdown :as-sub="true" @open-editor-state="handleOpenEditorState" @open-share="shareDialogVisible = true" />
            <EditDropdown :as-sub="true" @copy="handleCopy" @open-wechat-image-config="wechatImageConfigDialogVisible = true" />
            <FormatDropdown :as-sub="true" />
            <InsertDropdown :as-sub="true" />
            <StyleDropdown :as-sub="true" />
            <HelpDropdown
              :as-sub="true"
              @open-about="handleOpenAbout"
              @open-changelog="handleOpenChangelog"
              @open-feedback="handleOpenFeedback"
              @open-fund="handleOpenFund"
              @open-markdown-help="handleOpenMarkdownHelp"
            />
            <MenubarSeparator />
            <MenubarItem @select="uiStore.setEditorType('source')">
              <FileText class="mr-2 size-4" />
              源码编辑
            </MenubarItem>
            <MenubarItem @select="uiStore.setEditorType('wysiwyg')">
              <Type class="mr-2 size-4" />
              所见即所得
            </MenubarItem>
            <MenubarItem v-if="showAccountUi" @select="uiStore.toggleShowAccountDialog(true)">
              <UserRound class="mr-2 size-4" />
              登录与账户
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>

    <!-- 右侧操作区 -->
    <div class="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-1 overflow-x-auto md:gap-2 md:overflow-visible">
      <!-- 编辑器模式 / 视图模式（从底部状态栏上提，便于发现） -->
      <EditorModeToggle />

      <Button
        variant="outline"
        class="size-11 shrink-0 p-0 lg:h-9 lg:w-auto lg:px-4"
        title="智能排版"
        @click="autoFormatDialogVisible = true"
      >
        <WandSparkles class="size-4 lg:mr-2" />
        <span class="hidden lg:inline">排版</span>
      </Button>

      <Button
        variant="outline"
        class="size-11 shrink-0 p-0 lg:h-9 lg:w-auto lg:px-4"
        title="发布前检查"
        @click="checkBeforePublish"
      >
        <ClipboardCheck class="size-4 lg:mr-2" />
        <span class="hidden lg:inline">检查</span>
      </Button>

      <!-- 复制按钮 -->
      <Button
        variant="outline"
        class="size-11 shrink-0 p-0 lg:h-9 lg:w-auto lg:px-4"
        title="复制到微信公众号"
        :disabled="isCopying"
        @click="copyToWeChat"
      >
        <Loader2 v-if="isCopying" class="size-4 animate-spin lg:mr-2" />
        <Copy v-else class="size-4 lg:mr-2" />
        <span class="hidden lg:inline">复制</span>
      </Button>

      <!-- 样式面板 -->
      <Button
        variant="outline"
        class="size-11 shrink-0 p-0 lg:h-9 lg:w-auto lg:px-4"
        title="样式设置"
        :class="{ 'bg-accent text-accent-foreground': isOpenRightSlider }"
        @click="isOpenRightSlider = !isOpenRightSlider"
      >
        <Palette class="size-4 lg:mr-2" />
        <span class="hidden lg:inline">样式</span>
      </Button>
    </div>
  </header>

  <!-- 对话框组件，嵌套菜单无法正常挂载，需要提取层级 -->
  <AboutDialog
    :visible="aboutDialogVisible"
    @close="aboutDialogVisible = false"
    @open-feedback="handleOpenFeedback"
  />
  <FundDialog :visible="fundDialogVisible" @close="fundDialogVisible = false" />
  <EditorStateDialog :visible="editorStateDialogVisible" @close="editorStateDialogVisible = false" />
  <MarkdownHelpDialog :visible="markdownHelpDialogVisible" @close="markdownHelpDialogVisible = false" />
  <FeedbackDialog :visible="feedbackDialogVisible" @close="feedbackDialogVisible = false" />
  <ChangelogDialog :visible="changelogDialogVisible" @close="changelogDialogVisible = false" />
  <AccountDialog v-if="showAccountUi" :visible="isShowAccountDialog" @close="isShowAccountDialog = false" />
  <SyncDialog v-if="showSyncUi" :visible="isShowSyncDialog" @close="isShowSyncDialog = false" />
  <ShareDialog v-if="showShareUi" v-model:open="shareDialogVisible" />
  <AutoFormatDialog v-model:open="autoFormatDialogVisible" @formatted="handleFormatted" />
  <WechatImageConfigDialog v-model:open="wechatImageConfigDialogVisible" />
  <Dialog v-model:open="preflightDialogVisible">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>发布前检查</DialogTitle>
        <DialogDescription>
          {{ preflightIssues.length ? `发现 ${preflightIssues.length} 项需要确认` : '未发现明显问题' }}
        </DialogDescription>
      </DialogHeader>
      <div v-if="preflightIssues.length" class="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        <div
          v-for="(issue, index) in preflightIssues"
          :key="`${issue.title}-${index}`"
          class="rounded-md border p-3 text-sm"
          :class="{
            'border-destructive/40 bg-destructive/5': issue.level === 'error',
            'border-amber-500/40 bg-amber-500/5': issue.level === 'warning',
            'border-border bg-muted/20': issue.level === 'info',
          }"
        >
          <div class="font-medium">
            {{ issue.title }}
          </div>
          <div class="mt-1 text-muted-foreground">
            {{ issue.detail }}
          </div>
        </div>
      </div>
      <div v-else class="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
        当前内容的图片、链接、表格和标题层级看起来都可以继续发布。
      </div>
    </DialogContent>
  </Dialog>
</template>

<style lang="less" scoped>
.header-container {
  background: hsl(var(--background) / 0.95);
  border-bottom: 1px solid hsl(var(--border));
  backdrop-filter: blur(12px);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 50;

  @media (max-width: 768px) {
    padding-left: 1rem;
    padding-right: 1rem;
  }
}

.menubar {
  user-select: none;

  :deep([data-radix-menubar-trigger]) {
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;

    &:hover {
      background: hsl(var(--accent) / 0.8);
      color: hsl(var(--accent-foreground));
      transform: translateY(-1px);
    }

    &[data-state='open'] {
      background: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    }

    &:active {
      transform: translateY(0);
    }
  }

  :deep([data-radix-menubar-content]) {
    animation: slideDownAndFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :deep([data-radix-menubar-item]) {
    border-radius: 4px;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      background: hsl(var(--accent) / 0.8);
    }
  }

  :deep([data-radix-menubar-sub-trigger]) {
    border-radius: 4px;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      background: hsl(var(--accent) / 0.8);
    }
  }
}

kbd {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-width: 1.5rem;
  height: 1.375rem;
  border: 1px solid hsl(var(--border));
  background: linear-gradient(to bottom, hsl(var(--muted)), hsl(var(--muted) / 0.9));
  padding: 0 0.375rem;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  box-shadow: 0 1px 0 hsl(var(--border)), inset 0 0.5px 0 hsl(var(--background));
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

@keyframes slideDownAndFade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .menubar {
    width: 44px;
    height: 44px;
    flex-direction: row;
    align-items: center;

    > * {
      width: 44px;
      height: 44px;
      justify-content: center;
      padding: 0;
    }
  }
}
</style>
