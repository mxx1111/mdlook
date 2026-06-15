/**
 * 桌面端（Tauri）Store
 * 仅在 Tauri 桌面 App 中生效：原生打开本地 .md 文件 / 文件夹，
 * 浏览文件树，读取内容到编辑器，并可把编辑结果存回源文件。
 *
 * Web 环境下所有方法均为空操作（isTauri = false）。
 */

export interface DesktopFileNode {
  name: string
  path: string
  isDir: boolean
  children: DesktopFileNode[]
}

/** 是否运行在 Tauri 桌面环境 */
function detectTauri(): boolean {
  return typeof window !== `undefined`
    && (`__TAURI_INTERNALS__` in window || `__TAURI__` in window)
}

export const useDesktopStore = defineStore(`desktop`, () => {
  const isTauri = ref(detectTauri())

  // 当前打开的文件夹根路径与文件树
  const folderRoot = ref<string>(``)
  const folderName = ref<string>(``)
  const fileTree = ref<DesktopFileNode[]>([])

  // 当前在编辑器里的本地文件路径（空表示非本地文件）
  const currentFilePath = ref<string>(``)
  // 侧边栏是否展开
  const isSidebarOpen = ref(true)
  const isLoading = ref(false)

  const currentFileName = computed(() => {
    const p = currentFilePath.value
    if (!p)
      return ``
    return p.split(`/`).pop() ?? p
  })

  async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import(`@tauri-apps/api/core`)
    return invoke<T>(cmd, args)
  }

  /** 把文本内容加载进编辑器 */
  function loadIntoEditor(content: string) {
    const editorStore = useEditorStore()
    const postStore = usePostStore()
    // 先写入当前 post，保证编辑器尚未挂载时也能保留
    if (postStore.currentPostId) {
      postStore.updatePostContent(postStore.currentPostId, content)
    }
    // 编辑器已挂载则即时替换文档
    editorStore.importContent(content)
  }

  /** 打开并加载指定路径的 .md 文件 */
  async function openPath(path: string) {
    if (!isTauri.value || !path)
      return
    try {
      isLoading.value = true
      const content = await invoke<string>(`read_text_file`, { path })
      loadIntoEditor(content)
      currentFilePath.value = path
      await setWindowTitle(currentFileName.value)
      // 让打开的文件出现在左侧列表：若其所在文件夹尚未加载，则加载之
      const parent = path.slice(0, path.lastIndexOf(`/`))
      const underCurrent = folderRoot.value && path.startsWith(`${folderRoot.value}/`)
      if (parent && !underCurrent)
        await loadFolder(parent)
    }
    catch (e) {
      toast.error(`打开文件失败：${e}`)
    }
    finally {
      isLoading.value = false
    }
  }

  /** 弹出系统对话框选择一个 .md 文件 */
  async function openFileDialog() {
    if (!isTauri.value)
      return
    try {
      const { open } = await import(`@tauri-apps/plugin-dialog`)
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: `Markdown`, extensions: [`md`, `markdown`, `mdown`, `markdn`] }],
      })
      if (typeof selected === `string`)
        await openPath(selected)
    }
    catch (e) {
      toast.error(`选择文件失败：${e}`)
    }
  }

  /** 弹出系统对话框选择一个文件夹并加载文件树 */
  async function openFolderDialog() {
    if (!isTauri.value)
      return
    try {
      const { open } = await import(`@tauri-apps/plugin-dialog`)
      const selected = await open({ multiple: false, directory: true })
      if (typeof selected === `string`)
        await loadFolder(selected)
    }
    catch (e) {
      toast.error(`选择文件夹失败：${e}`)
    }
  }

  /** 加载文件夹的 markdown 文件树 */
  async function loadFolder(path: string) {
    if (!isTauri.value || !path)
      return
    try {
      isLoading.value = true
      const tree = await invoke<DesktopFileNode[]>(`read_md_tree`, { path })
      fileTree.value = tree
      folderRoot.value = path
      folderName.value = path.split(`/`).pop() ?? path
      isSidebarOpen.value = true
      if (tree.length === 0)
        toast.info(`该文件夹下没有找到 Markdown 文件`)
    }
    catch (e) {
      toast.error(`读取文件夹失败：${e}`)
    }
    finally {
      isLoading.value = false
    }
  }

  /** 重新扫描当前文件夹 */
  async function refreshFolder() {
    if (folderRoot.value)
      await loadFolder(folderRoot.value)
  }

  /** 把编辑器当前内容保存回源文件 */
  async function saveBack() {
    if (!isTauri.value)
      return
    if (!currentFilePath.value) {
      toast.info(`当前不是本地文件，无法保存回源文件`)
      return
    }
    try {
      // 以 currentPost.content 为准（所见即所得模式下 CodeMirror 未挂载）
      const content = usePostStore().currentPost?.content ?? useEditorStore().getContent()
      await invoke<void>(`write_text_file`, { path: currentFilePath.value, content })
      toast.success(`已保存到 ${currentFileName.value}`)
    }
    catch (e) {
      toast.error(`保存失败：${e}`)
    }
  }

  /** 设置窗口标题 */
  async function setWindowTitle(name: string) {
    if (!isTauri.value)
      return
    try {
      const { getCurrentWindow } = await import(`@tauri-apps/api/window`)
      await getCurrentWindow().setTitle(name ? `mdlook — ${name}` : `mdlook`)
    }
    catch {
      /* 忽略标题设置失败 */
    }
  }

  /** 初始化：处理"用 mdlook 打开" / 双击 .md 的待处理文件，并监听运行时打开事件 */
  async function init() {
    if (!isTauri.value)
      return
    try {
      const pending = await invoke<string | null>(`take_pending_file`)
      if (pending)
        await openPath(pending)

      const { listen } = await import(`@tauri-apps/api/event`)
      await listen<string>(`mdlook://open-file`, (event) => {
        if (event.payload)
          openPath(event.payload)
      })
    }
    catch (e) {
      console.error(`desktop init failed`, e)
    }
  }

  return {
    isTauri,
    folderRoot,
    folderName,
    fileTree,
    currentFilePath,
    currentFileName,
    isSidebarOpen,
    isLoading,
    openPath,
    openFileDialog,
    openFolderDialog,
    loadFolder,
    refreshFolder,
    saveBack,
    init,
  }
})
