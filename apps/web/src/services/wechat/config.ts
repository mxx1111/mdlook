import { addPrefix } from '@/utils'
import { store } from '@/utils/storage'

export interface WechatImageCredentials {
  appId: string
  appSecret: string
}

export const wechatImageAppId = store.reactive(addPrefix(`wechat_mp_app_id`), ``)
export const wechatImageAppSecret = store.reactive(addPrefix(`wechat_mp_app_secret`), ``)

export function getWechatImageCredentials(): WechatImageCredentials | null {
  const appId = wechatImageAppId.value.trim()
  const appSecret = wechatImageAppSecret.value.trim()
  if (!appId || !appSecret)
    return null
  return { appId, appSecret }
}

export function clearWechatImageCredentials() {
  wechatImageAppId.value = ``
  wechatImageAppSecret.value = ``
}
