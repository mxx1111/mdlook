import { isAccountFeatureEnabled } from '@/services/product/features'

function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? ``).replace(/\/$/, ``)
}

/**
 * 用户名密码账户与个人配置后端。
 *
 * 账户、AI 代理和私有 Skill 必须显式使用 VITE_ACCOUNT_API_URL，
 * 避免把登录凭据发送到旧能力服务。
 */
export const ACCOUNT_API_URL = normalizeBaseUrl(
  import.meta.env.VITE_ACCOUNT_API_URL,
)

/**
 * 原 md-api 能力后端：图床、微信图片转换、主题、分享与文档同步。
 *
 * 优先使用新的明确名称，同时兼容既有 VITE_SYNC_API_URL 和
 * 仅配置 VITE_MD_API_URL 的旧部署。
 */
export const CAPABILITY_API_URL = normalizeBaseUrl(
  import.meta.env.VITE_CAPABILITY_API_URL
    ?? import.meta.env.VITE_SYNC_API_URL
    ?? import.meta.env.VITE_MD_API_URL
    ?? ``,
)

/** @deprecated 能力调用请使用 CAPABILITY_API_URL。 */
export const MD_API_URL = CAPABILITY_API_URL

export function isAccountConfigured(): boolean {
  return Boolean(ACCOUNT_API_URL)
}

/** 是否在 UI 展示账户入口（登录/账户信息） */
export function isAccountUiEnabled(): boolean {
  return isAccountFeatureEnabled() && isAccountConfigured()
}
