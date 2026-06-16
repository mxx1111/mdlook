import type { CreateShareRequest, CreateShareResponse, ListSharesResponse } from './types'
import { ApiError, MdApiClient } from '@/services/account/client'
import { isAccountConfigured, MD_API_URL } from '@/services/account/config'
import { isShareFeatureEnabled } from '@/services/product/features'

export function isShareConfigured(): boolean {
  return isAccountConfigured()
}

/** 是否在 UI 中展示分享入口 */
export function isShareUiEnabled(): boolean {
  return isShareFeatureEnabled() && isShareConfigured()
}

export function getSharePageUrl(id: string): string {
  return `${MD_API_URL}/s/${id}`
}

export class ShareClient extends MdApiClient {
  list(): Promise<ListSharesResponse> {
    return this.request<ListSharesResponse>(`GET`, `/share`)
  }

  create(payload: CreateShareRequest): Promise<CreateShareResponse> {
    return this.request<CreateShareResponse>(`POST`, `/share`, payload)
  }

  revoke(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`DELETE`, `/share/${id}`)
  }
}

export { ApiError as ShareApiError }
