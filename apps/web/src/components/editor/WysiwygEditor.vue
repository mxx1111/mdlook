<script setup lang="ts">
import type Vditor from 'vditor'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { usePostStore } from '@/stores/post'
import { useRenderStore } from '@/stores/render'
import { useUIStore } from '@/stores/ui'

/**
 * Typora 式所见即所得编辑器（基于 Vditor 的 IR 即时渲染模式）。
 * 与源码模式共享同一份 Markdown：编辑时实时写回 currentPost.content，
 * 并调用 renderStore.render() 刷新预览 / 复制管线（#output 仍在 DOM 中）。
 */

const postStore = usePostStore()
const editorStore = useEditorStore()
const renderStore = useRenderStore()
const uiStore = useUIStore()
const { isDark } = storeToRefs(uiStore)

const el = ref<HTMLDivElement | null>(null)
let vditor: Vditor | null = null
let ready = false
let syncing = false
let timer: ReturnType<typeof setTimeout> | null = null
let unregisterContentAdapter: (() => void) | null = null

function currentContent(): string {
  return postStore.currentPost?.content ?? ``
}

function onInput(value: string) {
  if (syncing)
    return

  const post = postStore.currentPost
  if (post && post.content !== value) {
    post.content = value
    post.updateDatetime = new Date()
  }

  if (timer)
    clearTimeout(timer)
  timer = setTimeout(() => {
    renderStore.render(value)
  }, 300)
}

function replaceContent(next: string) {
  if (!vditor || !ready)
    return

  if (timer) {
    clearTimeout(timer)
    timer = null
  }

  if (vditor.getValue() !== next) {
    syncing = true
    vditor.setValue(next)
    syncing = false
  }

  const post = postStore.currentPost
  if (post && post.content !== next) {
    post.content = next
    post.updateDatetime = new Date()
  }
  renderStore.render(next)
}

/**
 * Vditor 默认把工具栏提示放在按钮上方。编辑区紧贴工具栏且外层需要裁切滚动内容，
 * 向上的提示会落到编辑区之外，只剩下边缘和箭头。复用 Vditor 自带的 south 方位，
 * 让提示完整显示在按钮下方。
 */
function placeToolbarTooltipsBelow() {
  const directionPairs = [
    [`vditor-tooltipped__ne`, `vditor-tooltipped__se`],
    [`vditor-tooltipped__n`, `vditor-tooltipped__s`],
    [`vditor-tooltipped__nw`, `vditor-tooltipped__sw`],
  ] as const

  el.value
    ?.querySelectorAll(`.vditor-toolbar .vditor-tooltipped`)
    .forEach((tooltip) => {
      for (const [from, to] of directionPairs) {
        if (tooltip.classList.replace(from, to))
          break
      }
    })
}

onMounted(async () => {
  if (!el.value)
    return
  const { default: VditorCtor } = await import(`vditor`)
  await import(`vditor/dist/index.css`)

  vditor = new VditorCtor(el.value, {
    mode: `ir`,
    value: currentContent(),
    height: `100%`,
    minHeight: 300,
    cache: { enable: false },
    theme: isDark.value ? `dark` : `classic`,
    preview: {
      hljs: { enable: true },
      theme: { current: isDark.value ? `dark` : `light` },
    },
    toolbarConfig: { pin: true },
    toolbar: [
      `headings`,
      `bold`,
      `italic`,
      `strike`,
      `|`,
      `list`,
      `ordered-list`,
      `check`,
      `outdent`,
      `indent`,
      `|`,
      `quote`,
      `line`,
      `code`,
      `inline-code`,
      `|`,
      `table`,
      `link`,
      `|`,
      `undo`,
      `redo`,
    ],
    input(value: string) {
      onInput(value)
    },
    after() {
      ready = true
      placeToolbarTooltipsBelow()
      unregisterContentAdapter = editorStore.registerContentAdapter({
        getContent: () => vditor?.getValue() ?? currentContent(),
        replaceContent,
        focus: () => vditor?.focus(),
      })
      // 刷新后直接进入所见即所得/预览时，watch 不会再次触发；
      // 在编辑器真正就绪时显式生成预览与复制所依赖的 #output。
      renderStore.render(currentContent())
    },
  })
})

// 切换文章或桌面本地文件时，把共享内容载入 Vditor。
watch(
  () => [postStore.currentPostId, postStore.currentPost?.content] as const,
  ([, content]) => replaceContent(content ?? ``),
)

onBeforeUnmount(() => {
  if (timer)
    clearTimeout(timer)
  unregisterContentAdapter?.()
  unregisterContentAdapter = null
  // 卸载前确保最新内容已写回（切回源码模式时不丢字）
  if (vditor && ready) {
    const value = vditor.getValue()
    const post = postStore.currentPost
    if (post && post.content !== value)
      post.content = value
    renderStore.render(value)
  }
  vditor?.destroy()
  vditor = null
})
</script>

<template>
  <div class="wysiwyg-host h-full w-full overflow-hidden">
    <div ref="el" class="h-full w-full" />
  </div>
</template>

<style scoped>
.wysiwyg-host :deep(.vditor) {
  height: 100%;
  border: none;
  border-radius: 0;
}
</style>

<style>
html.is-tauri .wysiwyg-host .vditor-ir .vditor-reset {
  width: min(100%, 920px);
  margin: 0 auto;
  /*
   * Vditor writes horizontal padding inline when IR resizes. Once this node is
   * capped at 920px that parent-based padding can consume the whole content
   * box on wide windows, so the desktop reading measure must win explicitly.
   */
  padding: 36px 56px 104px !important;
  font-size: 17px;
  line-height: 1.9;
}

html.is-tauri .wysiwyg-host .vditor-toolbar {
  padding: 8px 20px;
}

@media (max-width: 960px) {
  html.is-tauri .wysiwyg-host .vditor-ir .vditor-reset {
    padding-right: 32px !important;
    padding-left: 32px !important;
  }
}

@media (max-width: 768px) {
  .wysiwyg-host .vditor-toolbar {
    display: flex;
    min-height: 45px;
    flex-wrap: nowrap;
    align-items: center;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 4px;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .wysiwyg-host .vditor-toolbar::-webkit-scrollbar {
    display: none;
  }

  .wysiwyg-host .vditor-toolbar__item {
    float: none;
    flex: 0 0 44px;
    padding: 0 !important;
  }

  .wysiwyg-host .vditor-toolbar__item .vditor-tooltipped,
  .wysiwyg-host .vditor-toolbar__item input {
    width: 44px;
    height: 44px;
  }

  .wysiwyg-host .vditor-toolbar__item .vditor-tooltipped {
    display: grid;
    place-items: center;
    padding: 0;
  }

  .wysiwyg-host .vditor-toolbar__item svg {
    width: 18px;
    height: 18px;
  }

  .wysiwyg-host .vditor-toolbar__divider {
    float: none;
    height: 28px;
    flex: 0 0 1px;
    margin: 8px 4px;
  }

  .wysiwyg-host .vditor-toolbar__br {
    display: none;
  }

  .wysiwyg-host .vditor-ir .vditor-reset,
  html.is-tauri .wysiwyg-host .vditor-ir .vditor-reset {
    width: 100%;
    padding: 24px 20px 96px !important;
    font-size: 17px;
    line-height: 1.75;
  }
}
</style>
