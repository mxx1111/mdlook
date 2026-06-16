<script setup lang="ts">
import type Vditor from 'vditor'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePostStore } from '@/stores/post'
import { useRenderStore } from '@/stores/render'
import { useUIStore } from '@/stores/ui'

/**
 * Typora 式所见即所得编辑器（基于 Vditor 的 IR 即时渲染模式）。
 * 与源码模式共享同一份 Markdown：编辑时实时写回 currentPost.content，
 * 并调用 renderStore.render() 刷新预览 / 复制管线（#output 仍在 DOM 中）。
 */

const postStore = usePostStore()
const renderStore = useRenderStore()
const uiStore = useUIStore()
const { isDark } = storeToRefs(uiStore)

const el = ref<HTMLDivElement | null>(null)
let vditor: Vditor | null = null
let ready = false
let syncing = false
let timer: ReturnType<typeof setTimeout> | null = null

function currentContent(): string {
  return postStore.currentPost?.content ?? ``
}

function onInput(value: string) {
  if (syncing)
    return
  if (timer)
    clearTimeout(timer)
  timer = setTimeout(() => {
    const post = postStore.currentPost
    if (post && post.content !== value) {
      post.content = value
      post.updateDatetime = new Date()
    }
    renderStore.render(value)
  }, 300)
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
    },
  })
})

// 切换文章时，把新内容载入 Vditor
watch(() => postStore.currentPostId, () => {
  if (!vditor || !ready)
    return
  const next = currentContent()
  if (vditor.getValue() !== next) {
    syncing = true
    vditor.setValue(next)
    syncing = false
    renderStore.render(next)
  }
})

onBeforeUnmount(() => {
  if (timer)
    clearTimeout(timer)
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
