import type { AIChatPayload, AIProxyChatPayload, AIRequestMode } from '@/services/ai/types'
import { ACCOUNT_API_URL } from '@/services/account/config'
import { useAuthStore } from '@/stores/auth'

export class SafeAIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = `SafeAIError`
  }
}

export function getSafeAIErrorMessage(error: unknown): string {
  if (error instanceof SafeAIError)
    return error.message
  if (error instanceof DOMException && error.name === `AbortError`)
    return `请求已取消。`
  return `AI 请求未完成，请检查网络、模型与凭据后重试。`
}

function httpErrorMessage(status: number, mode: AIRequestMode): string {
  if (status === 400)
    return `AI 请求参数或私有 Skill 配置无效，请检查后重试。`
  if (status === 401 || status === 403)
    return mode === `proxy` ? `登录已失效，请重新登录。` : `AI 凭据无效或没有访问权限。`
  if (status === 404)
    return `当前 AI 模型或服务不可用。`
  if (status === 409)
    return `配置已在其他设备更新，请刷新后重试。`
  if (status === 429)
    return `AI 请求过于频繁，请稍后再试。`
  if (status === 504)
    return `AI 响应超时，请缩短正文后重试。`
  if (status >= 500)
    return `AI 服务暂时不可用，请稍后再试。`
  return `AI 请求失败（HTTP ${status}）。`
}

/**
 * Build headers for a direct provider request.
 * Cloud proxy requests never call this function and never expose the saved key.
 */
export function buildAIHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': `application/json` }
  if (apiKey)
    headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export function resolveEndpointUrl(endpoint: string, kind: `chat` | `image`): string {
  const url = new URL(endpoint)
  url.pathname = url.pathname.replace(/\/+$/, ``)
  if (kind === `chat`) {
    if (!url.pathname.endsWith(`/chat/completions`))
      url.pathname += `/chat/completions`
  }
  else if (!url.pathname.includes(`/images/`) && !url.pathname.endsWith(`/images/generations`)) {
    url.pathname += `/images/generations`
  }
  return url.toString()
}

export interface ResolveAIChatRequestOptions {
  apiKey: string
  endpoint: string
  payload: AIChatPayload
  requestMode: AIRequestMode
  serviceType: string
  skillSlugs?: string[]
  task?: string
}

export interface ResolvedAIChatRequest {
  headers: Record<string, string>
  mode: AIRequestMode
  payload: AIChatPayload | AIProxyChatPayload
  url: string
}

/**
 * Resolve a chat request through mdlook's authenticated proxy whenever selected.
 * In proxy mode the browser sends the raw account token, provider identifier and
 * message payload, but never receives or forwards the stored provider Key.
 */
export function resolveAIChatRequest(options: ResolveAIChatRequestOptions): ResolvedAIChatRequest {
  const authStore = useAuthStore()
  const messages = options.payload.messages.map(message => ({
    role: message.role,
    content: message.content,
  }))
  const payload: AIChatPayload = {
    ...options.payload,
    messages,
    max_tokens: options.payload.max_tokens
      ? Math.min(options.payload.max_tokens, 16384)
      : options.payload.max_tokens,
  }

  if (options.requestMode === `proxy`) {
    if (!authStore.isLoggedIn || !authStore.token)
      throw new SafeAIError(`请先登录后使用安全代理。`)
    if (!ACCOUNT_API_URL)
      throw new SafeAIError(`账户服务尚未配置，暂时无法使用安全代理。`)
    const proxyPayload: AIProxyChatPayload = {
      ...payload,
      provider: options.serviceType,
    }
    if (options.skillSlugs?.length)
      proxyPayload.skill_slugs = [...new Set(options.skillSlugs)].slice(0, 2)
    if (options.task?.trim())
      proxyPayload.task = options.task.trim().slice(0, 2000)

    return {
      mode: `proxy`,
      url: `${ACCOUNT_API_URL}/mdlook/ai/chat/completions`,
      headers: {
        'Content-Type': `application/json`,
        'Authorization': authStore.token,
      },
      payload: proxyPayload,
    }
  }

  if (!options.apiKey.trim())
    throw new SafeAIError(`本机直连需要填写当前会话使用的 API Key。`)

  return {
    mode: `direct`,
    url: resolveEndpointUrl(options.endpoint, `chat`),
    headers: buildAIHeaders(options.apiKey),
    payload,
  }
}

export interface SSECallbacks {
  onDelta: (content: string) => void
  onReasoningDelta?: (reasoning: string) => void
  onDone?: () => void
}

export function useAIFetch() {
  const authStore = useAuthStore()
  const loading = ref(false)
  const abortController = ref<AbortController | null>(null)

  function accountSessionKey(): string {
    return `${authStore.token || ``}\u0000${authStore.user?.id ?? ``}`
  }

  function assertRequestSession(requestSessionKey: string): void {
    if (accountSessionKey() !== requestSessionKey)
      throw new SafeAIError(`账户已切换，本次 AI 请求已丢弃。`)
  }

  function abort() {
    abortController.value?.abort()
    abortController.value = null
    loading.value = false
  }

  async function fetchSSE(
    url: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
    callbacks: SSECallbacks,
    mode: AIRequestMode = `direct`,
    externalSignal?: AbortSignal,
  ) {
    const requestSessionKey = accountSessionKey()
    abortController.value = new AbortController()
    loading.value = true

    // 调用方（如自动排版对话框）持有自己的 AbortController，把它桥接到内部
    // controller 上，这样 abort() 和调用方取消都能中断同一个请求。
    const controller = abortController.value
    const forwardAbort = () => controller.abort()
    if (externalSignal) {
      if (externalSignal.aborted)
        controller.abort()
      else
        externalSignal.addEventListener(`abort`, forwardAbort, { once: true })
    }

    try {
      const response = await window.fetch(url, {
        method: `POST`,
        headers,
        body: JSON.stringify(payload),
        signal: abortController.value.signal,
      })

      if (!response.ok || !response.body)
        throw new SafeAIError(httpErrorMessage(response.status, mode))

      const reader = response.body.getReader()
      const decoder = new TextDecoder(`utf-8`)
      let buffer = ``
      let doneNotified = false

      const notifyDone = () => {
        if (!doneNotified) {
          doneNotified = true
          callbacks.onDone?.()
        }
      }

      const processLine = (line: string): boolean => {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith(`data:`))
          return false
        const data = trimmed.slice(5).trimStart()
        assertRequestSession(requestSessionKey)
        if (data === `[DONE]`) {
          notifyDone()
          return true
        }
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta || {}
          if (delta.content)
            callbacks.onDelta(delta.content)
          if (delta.reasoning_content)
            callbacks.onReasoningDelta?.(delta.reasoning_content)
        }
        catch (error) {
          if (error instanceof SafeAIError)
            throw error
          // Ignore incomplete/non-JSON provider heartbeats without exposing them.
        }
        return false
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          assertRequestSession(requestSessionKey)
          buffer += decoder.decode()
          if (buffer && processLine(buffer))
            await reader.cancel()
          notifyDone()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ``

        for (const line of lines) {
          if (processLine(line)) {
            await reader.cancel()
            return
          }
        }
      }
    }
    catch (error) {
      if (error instanceof DOMException && error.name === `AbortError`)
        return
      if (error instanceof SafeAIError)
        throw error
      throw new SafeAIError(`无法连接 AI 服务，请检查网络后重试。`)
    }
    finally {
      externalSignal?.removeEventListener(`abort`, forwardAbort)
      loading.value = false
      abortController.value = null
    }
  }

  async function fetchJSON<T = any>(
    url: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
    mode: AIRequestMode = `direct`,
  ): Promise<{ ok: boolean, status: number, statusText: string, data: T | null, errorText: string }> {
    const requestSessionKey = accountSessionKey()
    try {
      const response = await window.fetch(url, {
        method: `POST`,
        headers,
        body: JSON.stringify(payload),
        signal,
      })

      if (response.ok) {
        const data = await response.json()
        assertRequestSession(requestSessionKey)
        return { ok: true, status: response.status, statusText: response.statusText, data, errorText: `` }
      }

      assertRequestSession(requestSessionKey)
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        data: null,
        errorText: httpErrorMessage(response.status, mode),
      }
    }
    catch (error) {
      if (error instanceof DOMException && error.name === `AbortError`)
        throw error
      if (error instanceof SafeAIError)
        throw error
      throw new SafeAIError(`无法连接 AI 服务，请检查网络后重试。`)
    }
  }

  return { loading, abortController, abort, fetchSSE, fetchJSON }
}
