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

export interface DesktopRecentFile {
  name: string
  path: string
  openedAt: number
}

export interface DesktopRecentFolder {
  name: string
  path: string
  openedAt: number
}

/** 是否运行在 Tauri 桌面环境 */
function detectTauri(): boolean {
  return typeof window !== `undefined`
    && (`__TAURI_INTERNALS__` in window || `__TAURI__` in window)
}

const RECENT_FILES_KEY = `mdlook__desktop_recent_files`
const RECENT_FILES_LIMIT = 8
const RECENT_FOLDERS_KEY = `mdlook__desktop_recent_folders`
const RECENT_FOLDERS_LIMIT = 6
const LAST_FOLDER_KEY = `mdlook__desktop_last_folder`
const LAST_FILE_KEY = `mdlook__desktop_last_file`
const AUTO_SAVE_KEY = `mdlook__desktop_auto_save`
const AUTO_SAVE_DELAY_MS = 1200
const EXTERNAL_CHANGE_CHECK_MS = 5000
const MODIFIED_TIME_TOLERANCE_MS = 1000
const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function dirNameFromPath(path: string): string {
  const index = Math.max(path.lastIndexOf(`/`), path.lastIndexOf(`\\`))
  return index > 0 ? path.slice(0, index) : ``
}

function ensureMarkdownExtension(path: string): string {
  return /\.(?:md|markdown|mdown|markdn)$/i.test(path) ? path : `${path}.md`
}

function suggestedFileName(): string {
  const title = usePostStore().currentPost?.title?.trim()
  const base = title || `untitled`
  return `${base.replace(/[\\/:*?"<>|]/g, `-`)}.md`
}

function sanitizeAssetName(name: string): string {
  return name
    .replace(/\.[^.]+$/, ``)
    .replace(/[\\/:*?"<>|\s]+/g, `-`)
    .replace(/^-+|-+$/g, ``)
    || `image`
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
  const recentFiles = ref<DesktopRecentFile[]>(readRecentFiles())
  const recentFolders = ref<DesktopRecentFolder[]>(readRecentFolders())
  const autoSaveEnabled = ref(readAutoSaveEnabled())
  const lastSavedContent = ref(``)
  const isSaving = ref(false)
  const lastSavedAt = ref<number>(0)
  const lastSaveError = ref(``)
  const externalChangeDetected = ref(false)
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let externalChangeTimer: ReturnType<typeof setInterval> | null = null
  let autoSaveWatcherStarted = false
  let activePostWatcherStarted = false
  let lastKnownModifiedAt = 0
  let openRequestSequence = 0
  let boundPostId = ``

  const currentFileName = computed(() => {
    const p = currentFilePath.value
    if (!p)
      return ``
    return fileNameFromPath(p)
  })

  // 两种编辑器都在输入时立即写回 Post；脏状态只依赖这份响应式共享内容。
  // 不直接返回 Vditor.getValue()，否则 computed 会缓存切换前的旧文档。
  const currentContent = computed(() => usePostStore().currentPost?.content ?? ``)
  // 未绑定本地路径的文章由 Post/localStorage 持久化，是可恢复的临时草稿。
  const isUnboundDraft = computed(() => isTauri.value && !currentFilePath.value && !!usePostStore().currentPost)
  const hasUnsavedChanges = computed(() => isUnboundDraft.value || (!!currentFilePath.value && currentContent.value !== lastSavedContent.value))

  function readRecentFiles(): DesktopRecentFile[] {
    try {
      const raw = localStorage.getItem(RECENT_FILES_KEY)
      if (!raw)
        return []
      const parsed = JSON.parse(raw) as DesktopRecentFile[]
      return Array.isArray(parsed)
        ? parsed
            .filter(item => item?.path && item?.name)
            .slice(0, RECENT_FILES_LIMIT)
        : []
    }
    catch {
      return []
    }
  }

  function writeRecentFiles(files: DesktopRecentFile[]) {
    try {
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files.slice(0, RECENT_FILES_LIMIT)))
    }
    catch { /* ignore quota errors */ }
  }

  function rememberFile(path: string) {
    const next = [
      { name: fileNameFromPath(path), path, openedAt: Date.now() },
      ...recentFiles.value.filter(item => item.path !== path),
    ].slice(0, RECENT_FILES_LIMIT)
    recentFiles.value = next
    writeRecentFiles(next)
  }

  function removeRecentFile(path: string) {
    const next = recentFiles.value.filter(item => item.path !== path)
    recentFiles.value = next
    writeRecentFiles(next)
  }

  function readRecentFolders(): DesktopRecentFolder[] {
    try {
      const raw = localStorage.getItem(RECENT_FOLDERS_KEY)
      if (!raw)
        return []
      const parsed = JSON.parse(raw) as DesktopRecentFolder[]
      return Array.isArray(parsed)
        ? parsed
            .filter(item => item?.path && item?.name)
            .slice(0, RECENT_FOLDERS_LIMIT)
        : []
    }
    catch {
      return []
    }
  }

  function writeRecentFolders(folders: DesktopRecentFolder[]) {
    try {
      localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(folders.slice(0, RECENT_FOLDERS_LIMIT)))
    }
    catch { /* ignore quota errors */ }
  }

  function rememberFolder(path: string) {
    const next = [
      { name: fileNameFromPath(path), path, openedAt: Date.now() },
      ...recentFolders.value.filter(item => item.path !== path),
    ].slice(0, RECENT_FOLDERS_LIMIT)
    recentFolders.value = next
    writeRecentFolders(next)
    try {
      localStorage.setItem(LAST_FOLDER_KEY, path)
    }
    catch { /* ignore quota errors */ }
  }

  function removeRecentFolder(path: string) {
    const next = recentFolders.value.filter(item => item.path !== path)
    recentFolders.value = next
    writeRecentFolders(next)
  }

  function readAutoSaveEnabled(): boolean {
    try {
      const raw = localStorage.getItem(AUTO_SAVE_KEY)
      return raw === null ? true : raw === `1`
    }
    catch {
      return true
    }
  }

  function setAutoSaveEnabled(value: boolean) {
    autoSaveEnabled.value = value
    try {
      localStorage.setItem(AUTO_SAVE_KEY, value ? `1` : `0`)
    }
    catch { /* ignore quota errors */ }
    if (value && hasUnsavedChanges.value)
      scheduleAutoSave()
  }

  function scheduleAutoSave() {
    if (!autoSaveEnabled.value || !currentFilePath.value)
      return
    if (autoSaveTimer)
      clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      saveCurrentFile({ silent: true })
    }, AUTO_SAVE_DELAY_MS)
  }

  function startAutoSaveWatcher() {
    if (autoSaveWatcherStarted)
      return
    autoSaveWatcherStarted = true
    watch(currentContent, () => {
      if (isLoading.value)
        return
      if (hasUnsavedChanges.value)
        scheduleAutoSave()
    })
  }

  function startActivePostWatcher() {
    if (activePostWatcherStarted)
      return
    activePostWatcherStarted = true
    watch(() => usePostStore().currentPostId, (postId) => {
      if (!currentFilePath.value) {
        const title = usePostStore().currentPost?.title || `无标题`
        void setWindowTitle(`${title}（未保存）`)
        return
      }
      // 内容管理中的普通 Post 不应继承上一个本地文件路径，否则后续保存会写错文件。
      if (!boundPostId || postId === boundPostId)
        return
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        autoSaveTimer = null
      }
      boundPostId = ``
      currentFilePath.value = ``
      lastSavedContent.value = ``
      lastSavedAt.value = 0
      lastSaveError.value = ``
      externalChangeDetected.value = false
      lastKnownModifiedAt = 0
      try {
        localStorage.removeItem(LAST_FILE_KEY)
      }
      catch { /* ignore storage failures */ }
      const title = usePostStore().currentPost?.title || `无标题`
      void setWindowTitle(`${title}（未保存）`)
    })
  }

  async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import(`@tauri-apps/api/core`)
    return invoke<T>(cmd, args)
  }

  async function readModifiedAt(path: string): Promise<number> {
    const value = await invoke<number | string>(`file_modified_millis`, { path })
    return Number(value)
  }

  async function updateKnownModifiedAt(path: string = currentFilePath.value) {
    if (!path)
      return
    try {
      lastKnownModifiedAt = await readModifiedAt(path)
      externalChangeDetected.value = false
    }
    catch {
      /* ignore stat failures */
    }
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

  function syncActiveEditorContent(): string {
    const editorStore = useEditorStore()
    const postStore = usePostStore()
    const content = editorStore.hasContentAdapter
      ? editorStore.getContent()
      : (postStore.currentPost?.content ?? ``)
    const post = postStore.currentPost
    if (post && post.content !== content) {
      post.content = content
      post.updateDatetime = new Date()
    }
    return content
  }

  async function flushPendingAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    const content = syncActiveEditorContent()
    if (autoSaveEnabled.value && currentFilePath.value && content !== lastSavedContent.value)
      await saveCurrentFile({ silent: true })
  }

  function nextUntitledTitle(): string {
    const postStore = usePostStore()
    const used = new Set(postStore.posts.map(post => post.title.trim()))
    if (!used.has(`无标题`))
      return `无标题`
    let index = 2
    while (used.has(`无标题 ${index}`))
      index += 1
    return `无标题 ${index}`
  }

  /**
   * 新建可恢复的临时草稿，不访问文件系统。
   * 草稿跟随 Post 写入 localStorage；首次保存时再由 saveBack() 打开 Save As。
   */
  async function newDraft() {
    if (!isTauri.value)
      return

    ++openRequestSequence
    await flushPendingAutoSave()

    const title = nextUntitledTitle()
    boundPostId = ``
    usePostStore().addPost(title, null, ``)
    currentFilePath.value = ``
    lastSavedContent.value = ``
    lastSavedAt.value = 0
    lastSaveError.value = ``
    externalChangeDetected.value = false
    lastKnownModifiedAt = 0
    isLoading.value = false

    try {
      localStorage.removeItem(LAST_FILE_KEY)
    }
    catch { /* ignore storage failures */ }

    await setWindowTitle(`${title}（未保存）`)
  }

  /** 打开并加载指定路径的 .md 文件 */
  async function openPath(path: string, options: { silent?: boolean, reuseCurrentPost?: boolean } = {}) {
    if (!isTauri.value || !path)
      return
    const requestId = ++openRequestSequence
    try {
      await flushPendingAutoSave()
      if (requestId !== openRequestSequence)
        return
      isLoading.value = true
      const content = await invoke<string>(`read_text_file`, { path })
      if (requestId !== openRequestSequence)
        return
      const postStore = usePostStore()
      const shouldPreserveCurrentPost = !options.reuseCurrentPost
        && !!postStore.currentPost
        && (!currentFilePath.value || hasUnsavedChanges.value)
        && currentFilePath.value !== path
      if (shouldPreserveCurrentPost) {
        const title = fileNameFromPath(path).replace(/\.(?:md|markdown|mdown|markdn)$/i, ``)
        postStore.addPost(title || `内容`, null, content)
        useEditorStore().importContent(content)
      }
      else {
        loadIntoEditor(content)
        const title = fileNameFromPath(path).replace(/\.(?:md|markdown|mdown|markdn)$/i, ``)
        if (postStore.currentPostId)
          postStore.renamePost(postStore.currentPostId, title || `内容`)
      }
      currentFilePath.value = path
      boundPostId = postStore.currentPostId
      lastSavedContent.value = content
      lastSavedAt.value = Date.now()
      lastSaveError.value = ``
      await updateKnownModifiedAt(path)
      rememberFile(path)
      try {
        localStorage.setItem(LAST_FILE_KEY, path)
      }
      catch { /* ignore quota errors */ }
      await setWindowTitle(currentFileName.value)
      // 让打开的文件出现在左侧列表：若其所在文件夹尚未加载，则加载之
      const parent = dirNameFromPath(path)
      const underCurrent = folderRoot.value && path.startsWith(`${folderRoot.value}/`)
      if (parent && !underCurrent)
        await loadFolder(parent, options)
    }
    catch (e) {
      if (!options.silent)
        toast.error(`打开文件失败：${e}`)
    }
    finally {
      if (requestId === openRequestSequence)
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
  async function loadFolder(path: string, options: { silent?: boolean } = {}) {
    if (!isTauri.value || !path)
      return
    try {
      isLoading.value = true
      const tree = await invoke<DesktopFileNode[]>(`read_md_tree`, { path })
      fileTree.value = tree
      folderRoot.value = path
      folderName.value = fileNameFromPath(path)
      isSidebarOpen.value = true
      rememberFolder(path)
      if (tree.length === 0 && !options.silent)
        toast.info(`该文件夹下没有找到 Markdown 文件`)
    }
    catch (e) {
      if (!options.silent)
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

  async function saveCurrentFile(options: { silent?: boolean } = {}) {
    if (!isTauri.value)
      return
    if (!currentFilePath.value) {
      if (!options.silent)
        toast.info(`当前不是本地文件，无法保存回源文件`)
      return
    }
    try {
      isSaving.value = true
      lastSaveError.value = ``
      const content = syncActiveEditorContent()
      await invoke<void>(`write_text_file`, { path: currentFilePath.value, content })
      lastSavedContent.value = content
      lastSavedAt.value = Date.now()
      await updateKnownModifiedAt()
      if (!options.silent)
        toast.success(`已保存到 ${currentFileName.value}`)
    }
    catch (e) {
      lastSaveError.value = String(e)
      if (!options.silent)
        toast.error(`保存失败：${e}`)
    }
    finally {
      isSaving.value = false
    }
  }

  /** 把编辑器当前内容保存回源文件 */
  async function saveBack() {
    if (!currentFilePath.value) {
      await saveAs()
      return
    }
    await saveCurrentFile()
  }

  /** 通过系统保存对话框把当前内容保存为新的 Markdown 文件 */
  async function saveAs() {
    if (!isTauri.value)
      return
    try {
      const { save } = await import(`@tauri-apps/plugin-dialog`)
      const selected = await save({
        defaultPath: currentFileName.value || suggestedFileName(),
        filters: [{ name: `Markdown`, extensions: [`md`, `markdown`] }],
      })
      if (typeof selected !== `string`)
        return

      const path = ensureMarkdownExtension(selected)
      const content = syncActiveEditorContent()
      isSaving.value = true
      lastSaveError.value = ``
      await invoke<void>(`write_text_file`, { path, content })
      currentFilePath.value = path
      boundPostId = usePostStore().currentPostId
      lastSavedContent.value = content
      lastSavedAt.value = Date.now()
      await updateKnownModifiedAt(path)
      rememberFile(path)
      try {
        localStorage.setItem(LAST_FILE_KEY, path)
      }
      catch { /* ignore quota errors */ }
      await setWindowTitle(currentFileName.value)

      const parent = dirNameFromPath(path)
      const underCurrent = folderRoot.value && path.startsWith(`${folderRoot.value}/`)
      if (parent && !underCurrent)
        await loadFolder(parent)
      else if (folderRoot.value)
        await refreshFolder()

      toast.success(`已保存为 ${currentFileName.value}`)
    }
    catch (e) {
      lastSaveError.value = String(e)
      toast.error(`另存为失败：${e}`)
    }
    finally {
      isSaving.value = false
    }
  }

  async function saveImageToAssets(file: File): Promise<string | null> {
    if (!isTauri.value || !currentFilePath.value)
      return null

    const folder = dirNameFromPath(currentFilePath.value)
    if (!folder)
      return null

    const ext = file.name.includes(`.`)
      ? file.name.split(`.`).pop()!.toLowerCase()
      : IMAGE_EXT_BY_TYPE[file.type] || `png`
    const baseName = sanitizeAssetName(file.name)
    const filename = `${baseName}-${Date.now().toString(36)}.${ext}`
    const relativePath = `./assets/${filename}`
    const targetPath = `${folder}/assets/${filename}`
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))

    await invoke<void>(`write_binary_file`, { path: targetPath, bytes })
    if (folderRoot.value)
      await refreshFolder()
    return relativePath
  }

  function canSaveAssetsLocally(): boolean {
    return isTauri.value && !!currentFilePath.value
  }

  async function restoreLastSession() {
    try {
      const lastFolder = localStorage.getItem(LAST_FOLDER_KEY)
      const lastFile = localStorage.getItem(LAST_FILE_KEY)
      if (lastFolder)
        await loadFolder(lastFolder, { silent: true })
      if (lastFile)
        await openPath(lastFile, { silent: true, reuseCurrentPost: true })
      else if (usePostStore().currentPost)
        await setWindowTitle(`${usePostStore().currentPost!.title}（未保存）`)
    }
    catch {
      /* best effort restore */
    }
  }

  async function checkExternalChange() {
    if (!currentFilePath.value || isSaving.value)
      return
    try {
      const modifiedAt = await readModifiedAt(currentFilePath.value)
      if (lastKnownModifiedAt > 0 && modifiedAt > lastKnownModifiedAt + MODIFIED_TIME_TOLERANCE_MS) {
        externalChangeDetected.value = true
      }
    }
    catch {
      /* file may have been moved or deleted; keep this non-blocking for now */
    }
  }

  function startExternalChangeWatcher() {
    if (externalChangeTimer)
      return
    externalChangeTimer = setInterval(() => {
      checkExternalChange()
    }, EXTERNAL_CHANGE_CHECK_MS)
  }

  async function reloadCurrentFileFromDisk() {
    if (!currentFilePath.value)
      return
    await openPath(currentFilePath.value)
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
      startAutoSaveWatcher()
      startActivePostWatcher()
      startExternalChangeWatcher()
      if (pending)
        await openPath(pending)
      else
        await restoreLastSession()

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
    recentFiles,
    recentFolders,
    autoSaveEnabled,
    hasUnsavedChanges,
    isSaving,
    lastSavedAt,
    lastSaveError,
    externalChangeDetected,
    isUnboundDraft,
    newDraft,
    openPath,
    openFileDialog,
    openFolderDialog,
    loadFolder,
    refreshFolder,
    saveBack,
    saveAs,
    saveImageToAssets,
    canSaveAssetsLocally,
    reloadCurrentFileFromDisk,
    setAutoSaveEnabled,
    removeRecentFile,
    removeRecentFolder,
    init,
  }
})
