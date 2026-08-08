import type { PostHistory } from '@/types/post'

export type DocumentScope = `guest` | `user:${string}`

/**
 * 云端只认识这些字段。文件路径、AI Key、图床凭据等设备数据不得进入该模型。
 */
export interface CloudDocument {
  id: string
  title: string
  content: string
  version: number
  updatedAt: string
  deleted: boolean
}

/**
 * 仅保存在当前设备上的展示与历史信息。
 * 它让现有 Post 体验保持兼容，但不会被 DocumentClient 发往服务端。
 */
export interface LocalDocumentMetadata {
  parentId: string | null
  history: PostHistory[]
  createdAt: string
}

export interface LocalDocument extends CloudDocument {
  local: LocalDocumentMetadata
  conflictOf?: string
  /**
   * 显式“复制访客草稿”动作的本机幂等标记。
   * 该字段不会经过 DocumentClient 发往服务端，也不会改变 guest 原稿。
   */
  copiedFromGuest?: {
    id: string
    updatedAt: string
  }
}

export interface DocumentOutboxEntry {
  documentId: string
  enqueuedAt: string
  attempts: number
}

export interface DocumentWorkspaceSnapshot {
  schemaVersion: 1
  scope: DocumentScope
  documents: LocalDocument[]
  currentDocumentId: string
  outbox: DocumentOutboxEntry[]
  savedAt: string
}

export type DocumentStorageKind = `indexeddb` | `localstorage`

export interface LoadedDocumentWorkspace {
  snapshot: DocumentWorkspaceSnapshot | null
  storageKind: DocumentStorageKind
}

export interface DocumentConflict {
  current: CloudDocument
}
