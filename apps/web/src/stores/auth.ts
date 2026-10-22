import type {
  AccountUser,
  ChangePasswordPayload,
  LoginCredentials,
  RegisterCredentials,
} from '@/services/account/types'
import { ApiError, MdApiClient } from '@/services/account/client'
import { isAccountConfigured } from '@/services/account/config'
import { ACCOUNT_TOKEN_KEY } from '@/services/account/session'
import { SyncClient } from '@/services/sync/client'
import { store } from '@/utils/storage'

interface BackendAccountUser {
  id?: string | number
  userId?: string | number
  login?: string
  username?: string
  name?: string | null
  displayName?: string | null
  avatar?: string | null
  avatarUrl?: string | null
  plan?: AccountUser[`plan`]
  planExpiresAt?: number | null
}

interface BackendAccountSession {
  token?: string
  accessToken?: string
  tokenValue?: string
  tokenName?: string
  user?: BackendAccountUser
}

export interface RegisterOutcome {
  autoLoggedIn: boolean
  loginError?: string
}

function normalizeUser(input: BackendAccountUser): AccountUser {
  return {
    id: String(input.id ?? input.userId ?? ``),
    login: input.login ?? input.username ?? ``,
    name: input.name ?? input.displayName ?? null,
    avatar: input.avatar ?? input.avatarUrl ?? null,
    plan: input.plan ?? `free`,
    planExpiresAt: input.planExpiresAt ?? null,
  }
}

/**
 * 全局账户 Store
 * 负责 blog-system 的 mdlook Sa-Token 登录态与用户信息。
 * 原 md-api 的 JWT 属于另一身份域，分离部署时不会复用这里的 token。
 */
export const useAuthStore = defineStore(`auth`, () => {
  const token = store.reactive(ACCOUNT_TOKEN_KEY, ``)
  const user = ref<AccountUser | null>(null)
  let bootstrapped = false

  const isConfigured = computed(() => isAccountConfigured())
  const isLoggedIn = computed(() => Boolean(token.value))

  const api = new MdApiClient(() => token.value || null)
  const syncClient = new SyncClient(() => token.value || null)

  function clearSession(): void {
    token.value = ``
    user.value = null
    store.remove(ACCOUNT_TOKEN_KEY).catch(() => {})
  }

  function applySession(session: BackendAccountSession): void {
    const nextToken = session.token ?? session.accessToken ?? session.tokenValue
    if (!nextToken || !session.user)
      throw new Error(`登录响应缺少 token 或用户信息`)
    token.value = nextToken
    user.value = normalizeUser(session.user)
  }

  /** 启动时恢复用户名密码账户会话并拉取用户信息。 */
  async function bootstrap(): Promise<void> {
    if (!isConfigured.value || bootstrapped)
      return
    bootstrapped = true

    if (token.value)
      await fetchMe()
  }

  async function fetchMe(): Promise<void> {
    if (!token.value)
      return
    try {
      const me = await api.me()
      user.value = normalizeUser(me)
    }
    catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        clearSession()
    }
  }

  async function login(payload: LoginCredentials): Promise<void> {
    const session = await api.login(payload) as BackendAccountSession
    applySession(session)
  }

  async function register(payload: RegisterCredentials): Promise<RegisterOutcome> {
    await api.register(payload)
    try {
      await login({
        username: payload.username,
        password: payload.password,
      })
      return { autoLoggedIn: true }
    }
    catch (error) {
      // 注册已经落库，自动登录失败不能再被描述为“注册失败”，否则用户
      // 重试注册只会得到“用户名已存在”。
      return {
        autoLoggedIn: false,
        loginError: error instanceof Error ? error.message : `请直接登录`,
      }
    }
  }

  async function changePassword(payload: ChangePasswordPayload): Promise<void> {
    await api.changePassword(payload)
    clearSession()
  }

  async function logout(): Promise<void> {
    try {
      if (token.value)
        await api.logout()
    }
    finally {
      clearSession()
    }
  }

  return {
    token,
    user,
    isConfigured,
    isLoggedIn,
    api,
    syncClient,
    /** @deprecated 使用 syncClient */
    client: syncClient,
    bootstrap,
    fetchMe,
    login,
    register,
    changePassword,
    logout,
    clearSession,
  }
})
