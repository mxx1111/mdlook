import type {
  CloudDocument,
  DocumentOutboxEntry,
  DocumentScope,
  DocumentStorageKind,
  DocumentWorkspaceSnapshot,
  LocalDocument,
  LocalDocumentMetadata,
} from '@/services/documents/types'
import type { Post } from '@/types/post'
import { v4 as uuidv4 } from 'uuid'
import { ApiError } from '@/services/account/client'
import { conflictFromApiError, DocumentClient } from '@/services/documents/client'
import { DocumentWorkspaceRepository } from '@/services/documents/localRepository'
import { useAuthStore } from '@/stores/auth'
import { usePostStore } from '@/stores/post'

export type DocumentWorkspaceStatus
  = `loading`
    | `saving`
    | `local`
    | `pending`
    | `syncing`
    | `synced`
    | `offline`
    | `conflict`
    | `error`

const LOCAL_SAVE_DEBOUNCE_MS = 1200
const MAX_LOCAL_HISTORY = 10

interface WorkspaceSession {
  generation: number
  scope: DocumentScope
  userId: string
}

interface PostSyncBaseline {
  currentDocumentId: string
  posts: Map<string, {
    title: string
    content: string
  }>
}

interface WorkspaceSyncOperation {
  generation: number
  scope: DocumentScope
  promise: Promise<void>
}

class StaleWorkspaceSessionError extends Error {
  constructor() {
    super(`文档工作区已切换`)
    this.name = `StaleWorkspaceSessionError`
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function validDate(value: unknown, fallback = nowIso()): string {
  if (typeof value !== `string` && typeof value !== `number` && !(value instanceof Date))
    return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function accountScope(userId: string): DocumentScope {
  return `user:${userId}`
}

function isAccountScope(scope: DocumentScope): boolean {
  return scope.startsWith(`user:`)
}

function defaultLocalMetadata(updatedAt = nowIso()): LocalDocumentMetadata {
  return {
    parentId: null,
    history: [],
    createdAt: updatedAt,
  }
}

function cloneHistory(history: Post[`history`]): Post[`history`] {
  return Array.isArray(history)
    ? history
        .filter(item => typeof item?.datetime === `string` && typeof item?.content === `string`)
        .slice(0, MAX_LOCAL_HISTORY)
        .map(item => ({ ...item }))
    : []
}

function postToLocalDocument(post: Post, existing?: LocalDocument): LocalDocument {
  const updatedAt = validDate(post.updateDatetime)
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    version: existing?.version ?? 0,
    updatedAt,
    deleted: false,
    local: {
      parentId: post.parentId ?? null,
      history: cloneHistory(post.history),
      createdAt: validDate(post.createDatetime, existing?.local.createdAt ?? updatedAt),
    },
    ...(existing?.conflictOf ? { conflictOf: existing.conflictOf } : {}),
    ...(existing?.copiedFromGuest ? { copiedFromGuest: { ...existing.copiedFromGuest } } : {}),
  }
}

function localDocumentToPost(document: LocalDocument): Post {
  return {
    id: document.id,
    title: document.title,
    content: document.content,
    history: cloneHistory(document.local.history),
    createDatetime: new Date(document.local.createdAt),
    updateDatetime: new Date(document.updatedAt),
    parentId: document.local.parentId,
  }
}

function normalizeLocalDocument(value: unknown): LocalDocument | null {
  if (!value || typeof value !== `object`)
    return null
  const record = value as Partial<LocalDocument>
  if (
    typeof record.id !== `string`
    || typeof record.title !== `string`
    || typeof record.content !== `string`
    || typeof record.version !== `number`
  ) {
    return null
  }

  const updatedAt = validDate(record.updatedAt)
  const local = record.local && typeof record.local === `object`
    ? record.local
    : defaultLocalMetadata(updatedAt)
  const copiedFromGuest = record.copiedFromGuest
  const hasValidGuestSource = copiedFromGuest
    && typeof copiedFromGuest === `object`
    && typeof copiedFromGuest.id === `string`
    && typeof copiedFromGuest.updatedAt === `string`

  return {
    id: record.id,
    title: record.title,
    content: record.content,
    version: Math.max(0, Math.trunc(record.version)),
    updatedAt,
    deleted: record.deleted === true,
    local: {
      parentId: typeof local.parentId === `string` ? local.parentId : null,
      history: cloneHistory(local.history ?? []),
      createdAt: validDate(local.createdAt, updatedAt),
    },
    ...(typeof record.conflictOf === `string` ? { conflictOf: record.conflictOf } : {}),
    ...(hasValidGuestSource
      ? {
          copiedFromGuest: {
            id: copiedFromGuest.id,
            updatedAt: validDate(copiedFromGuest.updatedAt),
          },
        }
      : {}),
  }
}

function normalizeSnapshot(
  value: DocumentWorkspaceSnapshot | null,
  scope: DocumentScope,
): DocumentWorkspaceSnapshot | null {
  if (!value || value.schemaVersion !== 1 || value.scope !== scope)
    return null

  const documents = Array.isArray(value.documents)
    ? value.documents
        .map(normalizeLocalDocument)
        .filter((document): document is LocalDocument => Boolean(document))
    : []
  const ids = new Set(documents.map(document => document.id))
  const outbox = Array.isArray(value.outbox)
    ? value.outbox
        .filter(entry => ids.has(entry.documentId))
        .map(entry => ({
          documentId: entry.documentId,
          enqueuedAt: validDate(entry.enqueuedAt),
          attempts: Number.isFinite(entry.attempts) ? Math.max(0, Math.trunc(entry.attempts)) : 0,
        }))
    : []

  return {
    schemaVersion: 1,
    scope,
    documents,
    currentDocumentId: typeof value.currentDocumentId === `string` ? value.currentDocumentId : ``,
    outbox,
    savedAt: validDate(value.savedAt),
  }
}

function mergeRemoteMetadata(local: LocalDocument | undefined, remote: CloudDocument): LocalDocument {
  return {
    ...remote,
    local: local?.local ?? defaultLocalMetadata(remote.updatedAt),
    ...(local?.conflictOf ? { conflictOf: local.conflictOf } : {}),
    ...(local?.copiedFromGuest ? { copiedFromGuest: { ...local.copiedFromGuest } } : {}),
  }
}

function remotePayloadMatches(local: LocalDocument, remote: CloudDocument): boolean {
  // 服务端墓碑会清空标题和正文；两边都已删除时仍是同一业务意图。
  // 这让“删除已落库但响应丢失”的重试保持幂等，不会误造冲突副本。
  if (local.deleted && remote.deleted)
    return true
  return local.title === remote.title
    && local.content === remote.content
    && local.deleted === remote.deleted
}

function conflictTitle(title: string): string {
  const stamp = new Date().toLocaleString(`zh-CN`, {
    month: `2-digit`,
    day: `2-digit`,
    hour: `2-digit`,
    minute: `2-digit`,
    hour12: false,
  })
  const suffix = `（冲突副本 ${stamp}）`
  return `${title || `无标题`}`.slice(0, Math.max(1, 240 - suffix.length)) + suffix
}

function guestCopyTitle(title: string, existingTitles: Set<string>): string {
  const base = title || `无标题`
  if (!existingTitles.has(base))
    return base

  for (let index = 1; ; index += 1) {
    const suffix = index === 1
      ? `（访客副本）`
      : `（访客副本 ${index}）`
    const candidate = base.slice(0, Math.max(1, 240 - suffix.length)) + suffix
    if (!existingTitles.has(candidate))
      return candidate
  }
}

/**
 * local-first 文档工作区。
 *
 * 外部 Interface 只有 bootstrap / flushLocal / syncNow 与可观察状态；Scope
 * 切换、IndexedDB 降级、离线 Outbox、CAS 冲突副本都被收进本 Module。
 */
export const useDocumentWorkspaceStore = defineStore(`documentWorkspace`, () => {
  const authStore = useAuthStore()
  const postStore = usePostStore()
  const repository = new DocumentWorkspaceRepository()
  const client = new DocumentClient(() => authStore.token || null)

  const status = ref<DocumentWorkspaceStatus>(`loading`)
  const scope = ref<DocumentScope>(`guest`)
  const storageKind = ref<DocumentStorageKind>(`indexeddb`)
  const lastSavedAt = ref<number | null>(null)
  const lastSyncAt = ref<number | null>(null)
  const lastError = ref(``)

  const documents = ref<LocalDocument[]>([])
  const outbox = ref<DocumentOutboxEntry[]>([])
  const currentDocumentId = ref(``)

  let bootstrapped = false
  let ready = false
  let applyingPosts = false
  let watchersStarted = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let savePromise: Promise<void> | null = null
  let saveAgain = false
  let syncOperation: WorkspaceSyncOperation | null = null
  let generation = 0
  let deferredLocalSaveGeneration: number | null = null

  const pendingCount = computed(() => outbox.value.length)
  const conflictCount = computed(() => documents.value.filter(document => document.conflictOf).length)
  const isSyncing = computed(() => status.value === `syncing`)
  const canSync = computed(() => {
    const userId = authStore.user?.id
    return Boolean(
      userId
      && authStore.isLoggedIn
      && scope.value === accountScope(userId),
    )
  })

  const statusLabel = computed(() => {
    switch (status.value) {
      case `loading`:
        return `正在打开草稿`
      case `saving`:
        return `正在保存到本机`
      case `local`:
        return `${storageKind.value === `indexeddb` ? `草稿已保存到本机` : `草稿已保存到本地备用存储`}${conflictCount.value ? `；有 ${conflictCount.value} 个冲突副本` : ``}`
      case `pending`:
        return `${pendingCount.value} 项等待同步`
      case `syncing`:
        return `正在同步云文档`
      case `synced`:
        return `本机与云端已同步${conflictCount.value ? `；已保留 ${conflictCount.value} 个冲突副本` : ``}`
      case `offline`:
        return pendingCount.value > 0
          ? `${pendingCount.value} 项将在联网后同步`
          : `当前离线，草稿已保存到本机`
      case `conflict`:
        return `检测到冲突，已保留双方副本`
      case `error`:
        return lastError.value || `文档同步失败`
    }
  })

  function clearSaveTimer(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  function makeSnapshot(targetScope = scope.value): DocumentWorkspaceSnapshot {
    return {
      schemaVersion: 1,
      scope: targetScope,
      documents: documents.value.map(document => ({
        ...document,
        local: {
          ...document.local,
          history: cloneHistory(document.local.history),
        },
      })),
      currentDocumentId: currentDocumentId.value,
      outbox: outbox.value.map(entry => ({ ...entry })),
      savedAt: nowIso(),
    }
  }

  function enqueue(documentId: string): void {
    if (!isAccountScope(scope.value))
      return
    if (outbox.value.some(entry => entry.documentId === documentId))
      return
    outbox.value.push({
      documentId,
      enqueuedAt: nowIso(),
      attempts: 0,
    })
  }

  function removeFromOutbox(documentId: string): void {
    outbox.value = outbox.value.filter(entry => entry.documentId !== documentId)
  }

  function ensureVisibleDocument(queueForRemote = true): LocalDocument {
    const visible = documents.value.find(document => !document.deleted)
    if (visible)
      return visible

    const updatedAt = nowIso()
    const document: LocalDocument = {
      id: uuidv4(),
      title: `无标题`,
      content: ``,
      version: 0,
      updatedAt,
      deleted: false,
      local: defaultLocalMetadata(updatedAt),
    }
    documents.value.push(document)
    currentDocumentId.value = document.id
    if (queueForRemote)
      enqueue(document.id)
    return document
  }

  function applyDocumentsToPosts(): void {
    applyingPosts = true
    try {
      const visibleDocuments = documents.value.filter(document => !document.deleted)
      const visibleIds = new Set(visibleDocuments.map(document => document.id))
      if (!visibleIds.has(currentDocumentId.value))
        currentDocumentId.value = visibleDocuments[0]?.id ?? ``

      postStore.replacePosts(
        visibleDocuments.map(localDocumentToPost),
        currentDocumentId.value,
        postStore.recentPostIds,
      )
    }
    finally {
      nextTick(() => {
        applyingPosts = false
      })
    }
  }

  /** 把现有 Post 投影写回当前 Scope。 */
  function capturePosts(): boolean {
    if (!ready || applyingPosts)
      return false

    const existingById = new Map(documents.value.map(document => [document.id, document]))
    const nextDocuments: LocalDocument[] = []
    let localChanged = currentDocumentId.value !== postStore.currentPostId

    for (const post of postStore.posts) {
      const existing = existingById.get(post.id)
      const next = postToLocalDocument(post, existing)
      const remoteChanged = !existing
        || existing.deleted
        || existing.title !== next.title
        || existing.content !== next.content

      if (remoteChanged) {
        localChanged = true
        next.updatedAt = nowIso()
        enqueue(next.id)
      }
      else if (
        existing.local.parentId !== next.local.parentId
        || existing.local.createdAt !== next.local.createdAt
        || JSON.stringify(existing.local.history) !== JSON.stringify(next.local.history)
      ) {
        localChanged = true
      }

      nextDocuments.push(next)
      existingById.delete(post.id)
    }

    for (const removed of existingById.values()) {
      if (removed.deleted) {
        nextDocuments.push(removed)
      }
      else if (isAccountScope(scope.value)) {
        localChanged = true
        removed.deleted = true
        removed.updatedAt = nowIso()
        nextDocuments.push(removed)
        enqueue(removed.id)
      }
      else {
        localChanged = true
      }
    }

    documents.value = nextDocuments
    currentDocumentId.value = postStore.currentPostId
    return localChanged
  }

  function capturePostBaseline(): PostSyncBaseline {
    return {
      currentDocumentId: postStore.currentPostId,
      posts: new Map(postStore.posts.map(post => [
        post.id,
        {
          title: post.title,
          content: post.content,
        },
      ])),
    }
  }

  /**
   * 网络请求期间编辑器仍可继续输入。只把相对请求起点真正变化的 Post 覆盖回
   * Document；未变化的 Post 让远端结果生效，避免“同步完成”反而丢掉刚输入的字。
   */
  function captureConcurrentPostChanges(baseline: PostSyncBaseline): boolean {
    const currentPosts = new Map(postStore.posts.map(post => [post.id, post]))
    let changed = false

    for (const post of postStore.posts) {
      const before = baseline.posts.get(post.id)
      const document = documents.value.find(item => item.id === post.id)
      const editedDuringSync = !before
        || before.title !== post.title
        || before.content !== post.content

      if (!document) {
        if (editedDuringSync) {
          const created = postToLocalDocument(post)
          created.updatedAt = nowIso()
          documents.value.push(created)
          enqueue(created.id)
          changed = true
        }
        continue
      }

      const next = postToLocalDocument(post, document)
      if (editedDuringSync) {
        document.title = next.title
        document.content = next.content
        document.deleted = false
        document.updatedAt = nowIso()
        enqueue(document.id)
        changed = true
      }

      if (
        document.local.parentId !== next.local.parentId
        || document.local.createdAt !== next.local.createdAt
        || JSON.stringify(document.local.history) !== JSON.stringify(next.local.history)
      ) {
        document.local = next.local
        changed = true
      }
    }

    for (const [id] of baseline.posts) {
      if (currentPosts.has(id))
        continue
      const document = documents.value.find(item => item.id === id)
      if (document && !document.deleted) {
        document.deleted = true
        document.updatedAt = nowIso()
        enqueue(document.id)
        changed = true
      }
    }

    if (postStore.currentPostId !== baseline.currentDocumentId) {
      currentDocumentId.value = postStore.currentPostId
      changed = true
    }

    return changed
  }

  async function persistSnapshot(targetScope = scope.value): Promise<void> {
    const snapshot = makeSnapshot(targetScope)
    if (targetScope === `guest`) {
      const guestPosts = snapshot.documents
        .filter(document => !document.deleted)
        .map(localDocumentToPost)
      const guestIds = new Set(guestPosts.map(post => post.id))
      postStore.persistLegacySnapshot(
        guestPosts,
        guestIds.has(snapshot.currentDocumentId) ? snapshot.currentDocumentId : guestPosts[0]?.id ?? ``,
        postStore.recentPostIds.filter(id => guestIds.has(id)),
      )
    }
    storageKind.value = await repository.save(snapshot)
    lastSavedAt.value = Date.now()
  }

  function setRestingStatus(conflictCreated = false): void {
    if (conflictCreated && pendingCount.value === 0) {
      status.value = `conflict`
      return
    }
    if (pendingCount.value > 0) {
      status.value = typeof navigator !== `undefined` && !navigator.onLine
        ? `offline`
        : `pending`
      return
    }
    status.value = isAccountScope(scope.value) ? `synced` : `local`
  }

  async function flushLocal(options: { scheduleRemote?: boolean, force?: boolean } = {}): Promise<void> {
    clearSaveTimer()
    if (!ready || applyingPosts)
      return
    // performSync 会在请求结束前做一次基线对比；同步期间另一次普通 capture
    // 可能把尚未应用到 Post 的远端内容误判为本地编辑。
    if (status.value === `syncing`) {
      deferredLocalSaveGeneration = generation
      return
    }
    if (savePromise) {
      saveAgain = true
      return savePromise
    }

    const targetScope = scope.value
    let shouldSave = capturePosts() || options.force === true
    if (!documents.value.some(document => !document.deleted)) {
      ensureVisibleDocument()
      applyDocumentsToPosts()
      shouldSave = true
    }
    if (!shouldSave) {
      if (options.scheduleRemote && pendingCount.value > 0)
        void syncNow()
      return
    }

    const currentSave = (async () => {
      status.value = `saving`
      lastError.value = ``
      try {
        await persistSnapshot(targetScope)
        if (targetScope !== scope.value)
          return
        setRestingStatus()
        if (options.scheduleRemote !== false && pendingCount.value > 0)
          void syncNow()
      }
      catch (error) {
        if (targetScope !== scope.value)
          return
        lastError.value = error instanceof Error ? error.message : String(error)
        status.value = `error`
      }
      finally {
        savePromise = null
        if (saveAgain && targetScope === scope.value) {
          saveAgain = false
          scheduleLocalSave()
        }
      }
    })()
    savePromise = currentSave
    return currentSave
  }

  function scheduleLocalSave(): void {
    if (!ready || applyingPosts)
      return
    clearSaveTimer()
    saveTimer = setTimeout(() => {
      saveTimer = null
      void flushLocal({ scheduleRemote: true })
    }, LOCAL_SAVE_DEBOUNCE_MS)
  }

  function currentSession(): WorkspaceSession | null {
    const userId = authStore.user?.id
    if (!userId || !canSync.value)
      return null
    return {
      generation,
      scope: scope.value,
      userId,
    }
  }

  function assertSession(session: WorkspaceSession): void {
    if (
      session.generation !== generation
      || session.scope !== scope.value
      || authStore.user?.id !== session.userId
      || !authStore.isLoggedIn
    ) {
      throw new StaleWorkspaceSessionError()
    }
  }

  function createConflictCopy(local: LocalDocument, remote: CloudDocument): LocalDocument {
    const updatedAt = nowIso()
    return {
      ...local,
      id: uuidv4(),
      title: conflictTitle(local.title),
      version: 0,
      updatedAt,
      deleted: false,
      conflictOf: remote.id,
      local: {
        ...local.local,
        createdAt: updatedAt,
        history: cloneHistory(local.local.history),
      },
    }
  }

  /**
   * 把本机 guest Scope 的可见草稿复制进当前账号 Scope。
   *
   * - 只有用户主动点击时执行；
   * - 每篇都生成全新 UUID，不覆盖账号文档；
   * - 不修改、不删除 guest；
   * - 同一 guest 版本在本机重复执行时跳过，guest 更新后则再复制一份。
   */
  async function copyGuestDraftsToCurrentAccount(): Promise<{
    copied: number
    skipped: number
    total: number
  }> {
    if (!ready || !canSync.value)
      throw new Error(`请先登录并等待账号草稿加载完成`)

    const session = currentSession()
    if (!session)
      throw new Error(`账号草稿工作区尚未就绪，请重试`)

    if (
      syncOperation
      && syncOperation.generation === session.generation
      && syncOperation.scope === session.scope
    ) {
      await syncOperation.promise
    }
    assertSession(session)

    await flushLocal({ scheduleRemote: false, force: true })
    assertSession(session)

    const loadedGuest = await repository.load(`guest`)
    assertSession(session)
    const guestSnapshot = normalizeSnapshot(loadedGuest.snapshot, `guest`)
    const guestDocuments = (guestSnapshot?.documents ?? [])
      .filter(document => !document.deleted)

    const result = {
      copied: 0,
      skipped: 0,
      total: guestDocuments.length,
    }
    if (guestDocuments.length === 0)
      return result

    const existingIds = new Set(documents.value.map(document => document.id))
    const existingTitles = new Set(
      documents.value
        .filter(document => !document.deleted)
        .map(document => document.title),
    )
    const targetIdByGuestId = new Map<string, string>()
    for (const document of documents.value) {
      if (!document.deleted && document.copiedFromGuest)
        targetIdByGuestId.set(document.copiedFromGuest.id, document.id)
    }

    const copies: Array<{
      guestDocument: LocalDocument
      id: string
      title: string
    }> = []

    for (const guestDocument of guestDocuments) {
      const alreadyCopied = documents.value.find(document =>
        !document.deleted
        && document.copiedFromGuest?.id === guestDocument.id
        && document.copiedFromGuest.updatedAt === guestDocument.updatedAt,
      )
      if (alreadyCopied) {
        targetIdByGuestId.set(guestDocument.id, alreadyCopied.id)
        result.skipped += 1
        continue
      }

      let id = uuidv4()
      while (existingIds.has(id))
        id = uuidv4()
      existingIds.add(id)

      const title = guestCopyTitle(guestDocument.title, existingTitles)
      existingTitles.add(title)
      targetIdByGuestId.set(guestDocument.id, id)
      copies.push({ guestDocument, id, title })
    }

    for (const { guestDocument, id, title } of copies) {
      const updatedAt = nowIso()
      const copiedDocument: LocalDocument = {
        id,
        title,
        content: guestDocument.content,
        version: 0,
        updatedAt,
        deleted: false,
        local: {
          parentId: guestDocument.local.parentId
            ? targetIdByGuestId.get(guestDocument.local.parentId) ?? null
            : null,
          history: cloneHistory(guestDocument.local.history),
          createdAt: updatedAt,
        },
        copiedFromGuest: {
          id: guestDocument.id,
          updatedAt: guestDocument.updatedAt,
        },
      }
      documents.value.push(copiedDocument)
      enqueue(copiedDocument.id)
      result.copied += 1
    }

    if (result.copied === 0)
      return result

    applyDocumentsToPosts()
    await persistSnapshot()
    assertSession(session)
    setRestingStatus()
    void syncNow()
    return result
  }

  function preserveConflict(local: LocalDocument, remote: CloudDocument): void {
    const originalIndex = documents.value.findIndex(document => document.id === local.id)
    const conflictCopy = createConflictCopy(local, remote)
    const acceptedRemote = mergeRemoteMetadata(local, remote)

    if (originalIndex === -1)
      documents.value.push(acceptedRemote)
    else
      documents.value.splice(originalIndex, 1, acceptedRemote)
    documents.value.push(conflictCopy)
    removeFromOutbox(local.id)
    enqueue(conflictCopy.id)
    currentDocumentId.value = conflictCopy.id
  }

  function mergeRemoteDocuments(remoteDocuments: CloudDocument[]): boolean {
    let conflictCreated = false
    const remoteHasVisibleDocument = remoteDocuments.some(document => !document.deleted)
    if (remoteHasVisibleDocument) {
      const pendingIds = new Set(outbox.value.map(entry => entry.documentId))
      documents.value = documents.value.filter((document) => {
        const isUntouchedPlaceholder = document.version === 0
          && !document.deleted
          && document.title === `无标题`
          && document.content === ``
          && !document.conflictOf
          && !pendingIds.has(document.id)
        return !isUntouchedPlaceholder
      })
    }
    const pendingIds = new Set(outbox.value.map(entry => entry.documentId))

    for (const remote of remoteDocuments) {
      const local = documents.value.find(document => document.id === remote.id)
      if (!local) {
        documents.value.push(mergeRemoteMetadata(undefined, remote))
        continue
      }

      if (pendingIds.has(local.id)) {
        if (remote.version > local.version) {
          if (remotePayloadMatches(local, remote)) {
            const index = documents.value.indexOf(local)
            documents.value.splice(index, 1, mergeRemoteMetadata(local, remote))
            removeFromOutbox(local.id)
          }
          else {
            preserveConflict(local, remote)
            conflictCreated = true
          }
        }
        continue
      }

      if (remote.version >= local.version) {
        const index = documents.value.indexOf(local)
        documents.value.splice(index, 1, mergeRemoteMetadata(local, remote))
      }
    }

    return conflictCreated
  }

  async function pushOutbox(session: WorkspaceSession): Promise<boolean> {
    let conflictCreated = false

    while (outbox.value.length > 0) {
      assertSession(session)
      const entry = outbox.value[0]
      const local = documents.value.find(document => document.id === entry.documentId)
      if (!local) {
        outbox.value.shift()
        continue
      }

      try {
        const saved = await client.put(local)
        assertSession(session)
        const index = documents.value.indexOf(local)
        documents.value.splice(index, 1, mergeRemoteMetadata(local, saved))
        removeFromOutbox(local.id)
        await persistSnapshot()
      }
      catch (error) {
        assertSession(session)
        if (error instanceof ApiError) {
          const conflict = conflictFromApiError(error)
          if (conflict) {
            if (remotePayloadMatches(local, conflict.current)) {
              const index = documents.value.indexOf(local)
              documents.value.splice(index, 1, mergeRemoteMetadata(local, conflict.current))
              removeFromOutbox(local.id)
            }
            else {
              preserveConflict(local, conflict.current)
              conflictCreated = true
            }
            await persistSnapshot()
            continue
          }
        }

        entry.attempts += 1
        await persistSnapshot()
        throw error
      }
    }

    return conflictCreated
  }

  async function performSync(session: WorkspaceSession): Promise<void> {
    if (typeof navigator !== `undefined` && !navigator.onLine) {
      status.value = `offline`
      return
    }

    await flushLocal({ scheduleRemote: false })
    assertSession(session)
    const postBaseline = capturePostBaseline()
    status.value = `syncing`
    lastError.value = ``
    let conflictCreated = false

    try {
      const remoteDocuments = await client.list()
      assertSession(session)
      conflictCreated = mergeRemoteDocuments(remoteDocuments)
      ensureVisibleDocument()
      for (const document of documents.value) {
        if (document.version === 0 && !document.deleted)
          enqueue(document.id)
      }
      await persistSnapshot()
      assertSession(session)

      conflictCreated = (await pushOutbox(session)) || conflictCreated
      assertSession(session)
      const concurrentChanges = captureConcurrentPostChanges(postBaseline)
      if (concurrentChanges)
        await persistSnapshot()
      assertSession(session)
      // persistSnapshot 的 await 期间仍可能继续输入；在覆盖 Post 投影前做一次
      // 无 await 的最终捕获，封住最后一个会丢字的竞态窗口。
      if (captureConcurrentPostChanges(postBaseline))
        deferredLocalSaveGeneration = session.generation
      applyDocumentsToPosts()
      lastSyncAt.value = Date.now()
      setRestingStatus(conflictCreated)
    }
    catch (error) {
      if (error instanceof StaleWorkspaceSessionError)
        return
      if (!navigator.onLine || error instanceof TypeError) {
        status.value = `offline`
        lastError.value = `网络不可用，修改已保存在本机`
        return
      }
      lastError.value = error instanceof Error ? error.message : String(error)
      status.value = `error`
    }
    finally {
      // 同步请求期间的普通 autosave 会被延后，避免把尚未投影到 Post 的
      // 远端结果误判为本地编辑。无论同步成功还是网络失败，都必须在当前
      // 会话结束时补一次本机保存，否则一次失败请求就可能吞掉计时器。
      if (
        deferredLocalSaveGeneration === session.generation
        && session.generation === generation
        && session.scope === scope.value
      ) {
        deferredLocalSaveGeneration = null
        // applyDocumentsToPosts 会把 applyingPosts 保持到下一 Tick；等待投影完成，
        // 否则 flushLocal 会提前返回，延后的 autosave 仍然可能被吞掉。
        await nextTick()
        await flushLocal({ scheduleRemote: false, force: true })
      }
    }
  }

  async function syncNow(): Promise<void> {
    const session = currentSession()
    if (!session)
      return
    if (
      syncOperation
      && syncOperation.generation === session.generation
      && syncOperation.scope === session.scope
    ) {
      return syncOperation.promise
    }

    const operation: WorkspaceSyncOperation = {
      generation: session.generation,
      scope: session.scope,
      promise: Promise.resolve(),
    }
    const currentSync = performSync(session).finally(() => {
      if (syncOperation === operation)
        syncOperation = null
      if (
        session.generation === generation
        && session.scope === scope.value
        && status.value === `pending`
        && pendingCount.value > 0
        && canSync.value
        && navigator.onLine
      ) {
        window.setTimeout(() => {
          void syncNow()
        }, 0)
      }
    })
    operation.promise = currentSync
    syncOperation = operation
    return currentSync
  }

  async function persistOldScope(oldScope: DocumentScope): Promise<void> {
    if (!ready)
      return
    clearSaveTimer()
    capturePosts()
    await persistSnapshot(oldScope)
  }

  async function switchScope(nextScope: DocumentScope): Promise<void> {
    if (ready && nextScope === scope.value)
      return

    generation += 1
    const switchGeneration = generation
    const oldScope = scope.value
    if (!ready && oldScope === `guest` && isAccountScope(nextScope)) {
      // 已登录用户首次升级时也要先把旧版未分区数据归档为 guest，
      // 后续仍需用户主动点击“复制访客草稿”，不会自动并入账号。
      try {
        const loadedGuest = await repository.load(`guest`)
        if (!normalizeSnapshot(loadedGuest.snapshot, `guest`)) {
          const guestDocuments = postStore.posts.map(post => postToLocalDocument(post))
          await repository.save({
            schemaVersion: 1,
            scope: `guest`,
            documents: guestDocuments,
            currentDocumentId: postStore.currentPostId,
            outbox: [],
            savedAt: nowIso(),
          })
        }
      }
      catch {
        // guest 归档失败不能阻止账号隔离；用户仍可继续使用账号工作区。
      }
    }
    if (generation !== switchGeneration)
      return
    try {
      await persistOldScope(oldScope)
    }
    catch {
      // Scope 切换不能因旧 Scope 持久化失败而泄露上一账号内容。
    }
    if (generation !== switchGeneration)
      return

    ready = false
    applyingPosts = true
    status.value = `loading`
    lastError.value = ``
    scope.value = nextScope

    try {
      const loaded = await repository.load(nextScope)
      if (generation !== switchGeneration)
        return
      storageKind.value = loaded.storageKind
      const normalized = normalizeSnapshot(loaded.snapshot, nextScope)

      if (normalized) {
        documents.value = normalized.documents
        outbox.value = normalized.outbox
        currentDocumentId.value = normalized.currentDocumentId
      }
      else if (nextScope === `guest`) {
        // 只把旧版未分区 Post 迁入 guest；绝不自动复制进某个账号。
        documents.value = postStore.posts.map(post => postToLocalDocument(post))
        outbox.value = []
        currentDocumentId.value = postStore.currentPostId
      }
      else {
        documents.value = []
        outbox.value = []
        currentDocumentId.value = ``
      }

      ensureVisibleDocument(!isAccountScope(nextScope))
      ready = true
      applyDocumentsToPosts()
      await persistSnapshot()
      setRestingStatus()

      if (isAccountScope(nextScope))
        void syncNow()
    }
    catch (error) {
      if (generation !== switchGeneration)
        return
      // 即便所有浏览器存储都不可用，也保留内存草稿而不是展示上一账号。
      documents.value = []
      outbox.value = []
      currentDocumentId.value = ``
      ensureVisibleDocument()
      ready = true
      applyDocumentsToPosts()
      lastError.value = error instanceof Error ? error.message : String(error)
      status.value = `error`
    }
    finally {
      if (generation === switchGeneration) {
        nextTick(() => {
          applyingPosts = false
        })
      }
    }
  }

  function desiredScope(): DocumentScope {
    const userId = authStore.user?.id
    return authStore.isLoggedIn && userId
      ? accountScope(userId)
      : `guest`
  }

  function handleOnline(): void {
    if (pendingCount.value > 0)
      void syncNow()
  }

  function handleOffline(): void {
    if (pendingCount.value > 0)
      status.value = `offline`
  }

  function startWatchers(): void {
    if (watchersStarted)
      return
    watchersStarted = true

    watch(
      () => postStore.posts,
      scheduleLocalSave,
      { deep: true, flush: `post` },
    )
    watch(() => postStore.currentPostId, scheduleLocalSave)
    watch(
      () => [authStore.token, authStore.user?.id] as const,
      () => {
        void switchScope(desiredScope())
      },
    )

    window.addEventListener(`online`, handleOnline)
    window.addEventListener(`offline`, handleOffline)
    document.addEventListener(`visibilitychange`, () => {
      if (document.hidden)
        void flushLocal({ scheduleRemote: false })
    })
  }

  async function bootstrap(): Promise<void> {
    if (bootstrapped)
      return
    bootstrapped = true
    startWatchers()
    await switchScope(desiredScope())
  }

  return {
    status,
    statusLabel,
    scope,
    storageKind,
    pendingCount,
    conflictCount,
    lastSavedAt,
    lastSyncAt,
    lastError,
    isSyncing,
    canSync,
    bootstrap,
    flushLocal,
    syncNow,
    copyGuestDraftsToCurrentAccount,
  }
})
