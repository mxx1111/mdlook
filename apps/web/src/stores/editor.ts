import type { EditorView } from '@codemirror/view'
import { formatDoc } from '@/utils'

export interface EditorContentAdapter {
  getContent: () => string
  replaceContent: (content: string) => void
  focus?: () => void
}

/**
 * 编辑器 Store
 * 负责管理当前激活编辑器的内容接口和 CodeMirror 专属操作。
 * CodeMirror 与 Vditor 都通过 EditorContentAdapter 接入，调用方无需判断编辑器类型。
 */
export const useEditorStore = defineStore(`editor`, () => {
  // 内容编辑器实例
  const editor = ref<EditorView | null>(null)
  const contentAdapter = shallowRef<EditorContentAdapter | null>(null)
  const hasContentAdapter = computed(() => contentAdapter.value !== null)

  const registerContentAdapter = (adapter: EditorContentAdapter) => {
    contentAdapter.value = adapter
    return () => {
      if (contentAdapter.value === adapter)
        contentAdapter.value = null
    }
  }

  const replaceAllContent = (content: string, focus: boolean) => {
    if (contentAdapter.value) {
      contentAdapter.value.replaceContent(content)
      if (focus)
        contentAdapter.value.focus?.()
      return
    }

    if (!editor.value)
      return

    editor.value.dispatch({
      changes: { from: 0, to: editor.value.state.doc.length, insert: content },
    })
    if (focus)
      editor.value.focus()
  }

  // 获取当前内容
  const getContent = () => {
    return contentAdapter.value?.getContent()
      ?? editor.value?.state.doc.toString()
      ?? ``
  }

  // 格式化文档
  const formatContent = async () => {
    if (!contentAdapter.value && !editor.value)
      return

    const doc = await formatDoc(getContent())
    replaceAllContent(doc, false)
    return doc
  }

  // 导入默认文档
  const importContent = (content: string) => {
    replaceAllContent(content, false)
  }

  const setContent = (content: string) => {
    replaceAllContent(content, true)
  }

  // 清空内容
  const clearContent = () => {
    if (!contentAdapter.value && !editor.value)
      return

    replaceAllContent(``, false)
    toast.success(`内容已清空`)
  }

  // 获取选中的文本
  const getSelection = () => {
    if (!editor.value)
      return ``

    const selection = editor.value.state.selection.main
    return editor.value.state.doc.sliceString(selection.from, selection.to)
  }

  // 替换选中的文本
  const replaceSelection = (text: string) => {
    if (!editor.value)
      return

    editor.value.dispatch(editor.value.state.replaceSelection(text))
  }

  const replaceText = (oldText: string, newText: string) => {
    if (!editor.value || !oldText)
      return false

    const content = editor.value.state.doc.toString()
    const cursor = editor.value.state.selection.main.head

    let bestFrom = -1
    let bestDist = Infinity
    let pos = 0
    while (true) {
      const idx = content.indexOf(oldText, pos)
      if (idx === -1)
        break
      const dist = Math.abs(idx - cursor)
      if (dist < bestDist) {
        bestDist = dist
        bestFrom = idx
      }
      pos = idx + 1
    }

    if (bestFrom === -1)
      return false

    editor.value.dispatch({
      changes: { from: bestFrom, to: bestFrom + oldText.length, insert: newText },
    })
    editor.value.focus()
    return true
  }

  // 在光标位置插入文本
  const insertAtCursor = (text: string) => {
    if (!editor.value)
      return

    const selection = editor.value.state.selection.main
    editor.value.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length },
    })
    editor.value.focus()
  }

  return {
    editor,
    hasContentAdapter,
    registerContentAdapter,
    formatContent,
    importContent,
    setContent,
    clearContent,
    getContent,
    getSelection,
    replaceSelection,
    replaceText,
    insertAtCursor,
  }
})
