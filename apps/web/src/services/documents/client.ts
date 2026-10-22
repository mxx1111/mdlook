import type { CloudDocument, DocumentConflict } from './types'
import type { ApiError } from '@/services/account/client'
import { MdApiClient } from '@/services/account/client'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === `object` && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeDocument(value: unknown): CloudDocument | null {
  const record = asRecord(value)
  if (
    !record
    || typeof record.id !== `string`
    || typeof record.title !== `string`
    || typeof record.content !== `string`
    || typeof record.version !== `number`
  ) {
    return null
  }

  const updatedAt = typeof record.updatedAt === `string`
    ? record.updatedAt
    : typeof record.updatedAt === `number`
      ? new Date(record.updatedAt).toISOString()
      : new Date().toISOString()

  return {
    id: record.id,
    title: record.title,
    content: record.content,
    version: record.version,
    updatedAt,
    deleted: record.deleted === true,
  }
}

function normalizeDocumentList(value: unknown): CloudDocument[] {
  const record = asRecord(value)
  let candidate: unknown[] = []
  if (Array.isArray(value))
    candidate = value
  else if (Array.isArray(record?.documents))
    candidate = record.documents
  else if (Array.isArray(record?.items))
    candidate = record.items

  return candidate
    .map(normalizeDocument)
    .filter((document): document is CloudDocument => Boolean(document))
}

export function conflictFromApiError(error: ApiError): DocumentConflict | null {
  if (error.status !== 409)
    return null

  const body = error.body
  const extra = asRecord(body?.extra)
  const current = normalizeDocument(body?.data)
    ?? normalizeDocument(extra?.current)
    ?? normalizeDocument(body?.current)
  return current ? { current } : null
}

/**
 * blog-system 的文档传输 Adapter。
 *
 * 只发送 CloudDocument 白名单，LocalDocumentMetadata 永远不会越过这个 seam。
 */
export class DocumentClient extends MdApiClient {
  list(updatedSince?: string): Promise<CloudDocument[]> {
    const query = updatedSince
      ? `?updatedSince=${encodeURIComponent(updatedSince)}`
      : ``
    return this.request<unknown>(`GET`, `/mdlook/documents${query}`)
      .then(normalizeDocumentList)
  }

  get(id: string): Promise<CloudDocument> {
    return this.request<unknown>(`GET`, `/mdlook/documents/${encodeURIComponent(id)}`)
      .then((value) => {
        const document = normalizeDocument(value)
        if (!document)
          throw new Error(`文档响应格式无效`)
        return document
      })
  }

  put(document: CloudDocument): Promise<CloudDocument> {
    return this.request<unknown>(
      `PUT`,
      `/mdlook/documents/${encodeURIComponent(document.id)}`,
      {
        title: document.title,
        content: document.content,
        version: document.version,
        updatedAt: document.updatedAt,
        deleted: document.deleted,
      },
    ).then((value) => {
      const saved = normalizeDocument(value)
      if (!saved)
        throw new Error(`文档保存响应格式无效`)
      return saved
    })
  }
}
