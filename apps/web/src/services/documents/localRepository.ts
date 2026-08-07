import type {
  DocumentScope,
  DocumentStorageKind,
  DocumentWorkspaceSnapshot,
  LoadedDocumentWorkspace,
} from './types'
import { addPrefix } from '@/utils'

const DATABASE_NAME = `mdlook-document-workspaces`
const DATABASE_VERSION = 1
const WORKSPACE_STORE = `workspaces`
const FALLBACK_KEY_PREFIX = addPrefix(`document_workspace`)

interface StoredWorkspace extends DocumentWorkspaceSnapshot {
  storageKey: DocumentScope
}

function fallbackKey(scope: DocumentScope): string {
  return `${FALLBACK_KEY_PREFIX}:${encodeURIComponent(scope)}`
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === `undefined`) {
      reject(new Error(`IndexedDB unavailable`))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(WORKSPACE_STORE))
        database.createObjectStore(WORKSPACE_STORE, { keyPath: `storageKey` })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB open failed`))
    request.onblocked = () => reject(new Error(`IndexedDB upgrade blocked`))
  })
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB request failed`))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB transaction failed`))
    transaction.onabort = () => reject(transaction.error ?? new Error(`IndexedDB transaction aborted`))
  })
}

function parseFallback(value: string | null): DocumentWorkspaceSnapshot | null {
  if (!value)
    return null
  try {
    return JSON.parse(value) as DocumentWorkspaceSnapshot
  }
  catch {
    return null
  }
}

function savedAtTimestamp(snapshot: DocumentWorkspaceSnapshot | null): number {
  if (!snapshot)
    return Number.NEGATIVE_INFINITY
  const timestamp = new Date(snapshot.savedAt).getTime()
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function newestSnapshot(
  indexedDbSnapshot: DocumentWorkspaceSnapshot | null,
  fallbackSnapshot: DocumentWorkspaceSnapshot | null,
): DocumentWorkspaceSnapshot | null {
  return savedAtTimestamp(fallbackSnapshot) > savedAtTimestamp(indexedDbSnapshot)
    ? fallbackSnapshot
    : indexedDbSnapshot ?? fallbackSnapshot
}

/**
 * 每个 guest / user:<id> 只对应一条原子 Workspace 记录。
 *
 * Interface 只有 load/save：IndexedDB 事务、降级 localStorage 和隔离键都隐藏
 * 在实现内部，调用方不会接触具体存储细节。
 */
export class DocumentWorkspaceRepository {
  private databasePromise: Promise<IDBDatabase> | null = null
  private preferredStorage: DocumentStorageKind = `indexeddb`

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase()
    return this.databasePromise
  }

  private readFallback(scope: DocumentScope): DocumentWorkspaceSnapshot | null {
    try {
      return parseFallback(localStorage.getItem(fallbackKey(scope)))
    }
    catch {
      return null
    }
  }

  private writeFallback(snapshot: DocumentWorkspaceSnapshot): void {
    localStorage.setItem(fallbackKey(snapshot.scope), JSON.stringify(snapshot))
  }

  private async writeIndexedDb(snapshot: DocumentWorkspaceSnapshot): Promise<void> {
    const database = await this.database()
    const transaction = database.transaction(WORKSPACE_STORE, `readwrite`)
    transaction.objectStore(WORKSPACE_STORE).put({
      ...snapshot,
      storageKey: snapshot.scope,
    } satisfies StoredWorkspace)
    await transactionDone(transaction)
  }

  async load(scope: DocumentScope): Promise<LoadedDocumentWorkspace> {
    try {
      const database = await this.database()
      const transaction = database.transaction(WORKSPACE_STORE, `readonly`)
      const stored = await readRequest(
        transaction.objectStore(WORKSPACE_STORE).get(scope) as IDBRequest<StoredWorkspace | undefined>,
      )
      const fallback = this.readFallback(scope)
      const snapshot = newestSnapshot(stored ?? null, fallback)

      // IndexedDB 曾写失败时，新快照会落在 localStorage。浏览器恢复后必须
      // 选 savedAt 较新的副本并自愈回主存储，不能因为旧 IDB 记录存在而回滚草稿。
      if (snapshot === fallback && fallback && savedAtTimestamp(fallback) > savedAtTimestamp(stored ?? null)) {
        await this.writeIndexedDb(fallback)
      }
      else if (snapshot && snapshot === stored) {
        // 同步备用副本是 best-effort；localStorage 配额/权限失败不影响主存储读取。
        try {
          this.writeFallback(snapshot)
        }
        catch {
          // IndexedDB 中的主副本仍然有效。
        }
      }

      this.preferredStorage = `indexeddb`
      return {
        snapshot,
        storageKind: `indexeddb`,
      }
    }
    catch {
      this.preferredStorage = `localstorage`
      return {
        snapshot: this.readFallback(scope),
        storageKind: `localstorage`,
      }
    }
  }

  async save(snapshot: DocumentWorkspaceSnapshot): Promise<DocumentStorageKind> {
    if (this.preferredStorage === `indexeddb`) {
      try {
        await this.writeIndexedDb(snapshot)
        return `indexeddb`
      }
      catch {
        this.preferredStorage = `localstorage`
      }
    }

    this.writeFallback(snapshot)
    return `localstorage`
  }
}
