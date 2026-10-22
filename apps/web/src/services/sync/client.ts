import type { ActivateProResponse, PullResponse, PushRequest, PushResponse } from './types'
import { ApiError, MdApiClient } from '@/services/account/client'
import { ACCOUNT_API_URL, CAPABILITY_API_URL } from '@/services/account/config'
import { isSyncFeatureEnabled } from '@/services/product/features'

export const SYNC_API_URL = CAPABILITY_API_URL

/** 爱发电创作者主页，用于 Pro 升级跳转 */
export const AFDIAN_PAGE_URL = (import.meta.env.VITE_AFDIAN_PAGE_URL ?? ``).replace(/\/$/, ``)

export function isSyncConfigured(): boolean {
  return Boolean(SYNC_API_URL)
}

/** 是否在 UI 中展示云同步入口 */
export function isSyncUiEnabled(): boolean {
  return isSyncFeatureEnabled() && isSyncConfigured()
}

/** @deprecated 使用 ApiError */
export { ApiError as SyncApiError }

export class SyncClient extends MdApiClient {
  constructor(getToken: () => string | null) {
    super(
      () => CAPABILITY_API_URL === ACCOUNT_API_URL ? getToken() : null,
      {
        baseUrl: SYNC_API_URL,
        authorization: `bearer`,
      },
    )
  }

  pull(since: number): Promise<PullResponse> {
    return this.request<PullResponse>(`GET`, `/sync/pull?since=${since}`)
  }

  push(payload: PushRequest): Promise<PushResponse> {
    return this.request<PushResponse>(`POST`, `/sync/push`, payload)
  }

  activatePro(orderNo: string): Promise<ActivateProResponse> {
    return this.request<ActivateProResponse>(`POST`, `/sync/activate`, { orderNo })
  }
}
