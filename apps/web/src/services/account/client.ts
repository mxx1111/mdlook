import type {
  AccountSession,
  AccountSettingsRecord,
  AccountUser,
  ChangePasswordPayload,
  LoginCredentials,
  RegisterCredentials,
  UserPreferenceSnapshot,
} from './types'
import type {
  AICredentialRecord,
  AICredentialUpdate,
  PrivateSkillRecord,
  PrivateSkillUpsert,
} from '@/services/ai/types'
import { ACCOUNT_API_URL } from './config'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message)
    this.name = `ApiError`
  }
}

interface ResponseEnvelope<T> {
  code: number
  message?: string
  msg?: string
  data: T
}

function isResponseEnvelope<T>(value: unknown): value is ResponseEnvelope<T> {
  return Boolean(
    value
    && typeof value === `object`
    && typeof (value as Record<string, unknown>).code === `number`
    && `data` in value,
  )
}

function errorMessage(body: Record<string, unknown> | undefined, fallback: string): string {
  if (typeof body?.message === `string` && body.message)
    return body.message
  if (typeof body?.msg === `string` && body.msg)
    return body.msg
  if (typeof body?.error === `string` && body.error)
    return body.error
  return fallback
}

export interface ApiClientOptions {
  baseUrl?: string
  authorization?: `raw` | `bearer`
}

/** HTTP JSON 客户端；不同后端通过构造参数选择基址与鉴权格式。 */
export class MdApiClient {
  private readonly baseUrl: string
  private readonly authorization: `raw` | `bearer`

  constructor(
    private getToken: () => string | null,
    options: ApiClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? ACCOUNT_API_URL
    this.authorization = options.authorization ?? `raw`
  }

  protected async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {}
    if (body !== undefined)
      headers[`Content-Type`] = `application/json`
    // blog-system 账户使用原始 Sa-Token；旧 md-api 能力使用 Bearer JWT。
    // 具体格式由调用方在对应的后端 seam 上选择。
    if (token)
      headers.Authorization = this.authorization === `bearer` ? `Bearer ${token}` : token

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    let responseBody: unknown
    if (res.status !== 204) {
      try {
        responseBody = await res.json()
      }
      catch {
        responseBody = undefined
      }
    }

    const responseRecord = responseBody && typeof responseBody === `object`
      ? responseBody as Record<string, unknown>
      : undefined

    if (!res.ok)
      throw new ApiError(res.status, errorMessage(responseRecord, res.statusText || `请求失败`), responseRecord)

    // blog-system 使用 ResponseResult，原 Cloudflare md-api 返回裸 JSON；
    // 在这一层兼容两者，页面与 Store 不需要了解传输格式。
    if (isResponseEnvelope<T>(responseBody)) {
      if (responseBody.code !== 200 && responseBody.code !== 0) {
        throw new ApiError(
          responseBody.code,
          responseBody.message || responseBody.msg || `请求失败`,
          responseRecord,
        )
      }
      return responseBody.data
    }

    return responseBody as T
  }

  me(): Promise<AccountUser> {
    return this.request<AccountUser>(`GET`, `/mdlook/auth/me`)
  }

  register(payload: RegisterCredentials): Promise<AccountUser> {
    return this.request<AccountUser>(`POST`, `/mdlook/auth/register`, payload)
  }

  login(payload: LoginCredentials): Promise<AccountSession> {
    return this.request<AccountSession>(`POST`, `/mdlook/auth/login`, payload)
  }

  logout(): Promise<void> {
    return this.request<void>(`POST`, `/mdlook/auth/logout`)
  }

  changePassword(payload: ChangePasswordPayload): Promise<void> {
    return this.request<void>(`PUT`, `/mdlook/auth/password`, payload)
  }

  getAICredentials(): Promise<AICredentialRecord[]> {
    return this.request<AICredentialRecord[]>(`GET`, `/mdlook/ai/credentials`)
  }

  updateAICredential(
    provider: string,
    payload: AICredentialUpdate,
  ): Promise<AICredentialRecord> {
    return this.request<AICredentialRecord>(
      `PUT`,
      `/mdlook/ai/credentials/${encodeURIComponent(provider)}`,
      payload,
    )
  }

  deleteAICredential(provider: string, version: number): Promise<void> {
    return this.request<void>(
      `DELETE`,
      `/mdlook/ai/credentials/${encodeURIComponent(provider)}?version=${encodeURIComponent(version)}`,
    )
  }

  getPrivateSkills(): Promise<PrivateSkillRecord[]> {
    return this.request<PrivateSkillRecord[]>(`GET`, `/mdlook/private-skills`)
  }

  updatePrivateSkill(slug: string, payload: PrivateSkillUpsert): Promise<PrivateSkillRecord> {
    return this.request<PrivateSkillRecord>(
      `PUT`,
      `/mdlook/private-skills/${encodeURIComponent(slug)}`,
      payload,
    )
  }

  setPrivateSkillEnabled(
    slug: string,
    version: number,
    enabled: boolean,
  ): Promise<PrivateSkillRecord> {
    return this.request<PrivateSkillRecord>(
      `PUT`,
      `/mdlook/private-skills/${encodeURIComponent(slug)}/enabled`,
      { version, enabled },
    )
  }

  deletePrivateSkill(slug: string, version: number): Promise<void> {
    return this.request<void>(
      `DELETE`,
      `/mdlook/private-skills/${encodeURIComponent(slug)}?version=${encodeURIComponent(version)}`,
    )
  }

  getSettings(): Promise<AccountSettingsRecord> {
    return this.request<AccountSettingsRecord>(`GET`, `/mdlook/settings`)
  }

  updateSettings(
    settings: UserPreferenceSnapshot,
    baseVersion: number,
  ): Promise<AccountSettingsRecord> {
    return this.request<AccountSettingsRecord>(`PUT`, `/mdlook/settings`, {
      settings,
      // 同时兼容规划契约（baseVersion）与 blog-system 当前 DTO（version）。
      baseVersion,
      version: baseVersion,
    })
  }
}
