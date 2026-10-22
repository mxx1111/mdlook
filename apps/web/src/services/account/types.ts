import type { HeadingStyles } from '@md/shared/configs'

/** 用户套餐（后续可扩展更多高级能力） */
export type UserPlan = `free` | `pro`

/** 账户用户信息（与 md-api /me 一致） */
export interface AccountUser {
  id: string
  login: string
  name: string | null
  avatar: string | null
  plan: UserPlan
  planExpiresAt: number | null
}

/** 账号密码登录参数 */
export interface LoginCredentials {
  username: string
  password: string
}

/** 首次注册参数 */
export interface RegisterCredentials {
  username: string
  password: string
  confirmPassword: string
}

/** 修改密码参数 */
export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

/** 登录成功会话；兼容 blog-system tokenValue 与旧 md-api token 字段 */
export interface AccountSession {
  token?: string
  accessToken?: string
  tokenName?: string
  tokenValue?: string
  user: AccountUser
}

export interface UserPreferenceSnapshot {
  schemaVersion: 1
  theme: {
    name: string
    fontFamily: string
    fontSize: string
    primaryColor: string
    codeBlockTheme: string
    headingStyles: HeadingStyles
    showLineNumber: boolean
    macCodeBlock: boolean
  }
  formatting: {
    useIndent: boolean
    useJustify: boolean
    citeLinks: boolean
    countWords: boolean
    legend: string
  }
}

export interface AccountSettingsRecord {
  settings: UserPreferenceSnapshot | null
  version: number
  updatedAt?: number | null
}
