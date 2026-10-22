import { addPrefix } from '@/utils'

/** 用户名密码账户的本地会话键；沿用旧键名以兼容已登录设备。 */
export const ACCOUNT_TOKEN_KEY = addPrefix(`account_token`)
