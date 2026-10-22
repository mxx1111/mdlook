import type { Context } from 'hono'
import type { Env } from './types'

type WechatImageContext = Context<{ Bindings: Env }>

interface WechatTokenCache {
  appId: string
  token: string
  expiresAt: number
}

interface ImageReplacement {
  sourceUrl: string
  wechatUrl: string
}

interface WechatCredentials {
  appId: string
  appSecret: string
}

const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_IMAGES_PER_REQUEST = 20
const tokenCache = new Map<string, WechatTokenCache>()

function isEnabled(env: Env): boolean {
  return env.WECHAT_MP_IMAGE_ENABLED === `true` || env.WECHAT_MP_IMAGE_ENABLED === `1`
}

function isConfigured(env: Env): boolean {
  return Boolean(env.WECHAT_MP_APP_ID?.trim() && env.WECHAT_MP_APP_SECRET?.trim())
}

function requestCredentials(body: { wechatAppId?: unknown, wechatAppSecret?: unknown }): WechatCredentials | null {
  const appId = typeof body.wechatAppId === `string` ? body.wechatAppId.trim() : ``
  const appSecret = typeof body.wechatAppSecret === `string` ? body.wechatAppSecret.trim() : ``
  if (!appId || !appSecret)
    return null
  return { appId, appSecret }
}

function envCredentials(env: Env): WechatCredentials | null {
  const appId = env.WECHAT_MP_APP_ID?.trim() || ``
  const appSecret = env.WECHAT_MP_APP_SECRET?.trim() || ``
  if (!appId || !appSecret)
    return null
  return { appId, appSecret }
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === `localhost` || host.endsWith(`.localhost`) || host === `::1`)
    return true
  if (/^(?:127|10)\./.test(host) || host === `0.0.0.0`)
    return true
  if (/^192\.168\./.test(host) || /^169\.254\./.test(host))
    return true

  const match = host.match(/^172\.(\d{1,2})\./)
  if (match) {
    const second = Number(match[1])
    return second >= 16 && second <= 31
  }

  return false
}

function shouldSkipImageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.toLowerCase()
    return (url.protocol !== `http:` && url.protocol !== `https:`)
      || isPrivateHostname(host)
      || host.includes(`mmbiz.qpic.cn`)
      || host.includes(`mmbiz.qlogo.cn`)
      || host.includes(`qpic.cn`)
  }
  catch {
    return true
  }
}

function extractImageUrls(html: string): string[] {
  const urls = new Set<string>()
  const imagePattern = /<img[^>]*\ssrc=(["'])(.*?)\1/gi

  while (true) {
    const match = imagePattern.exec(html)
    if (!match)
      break

    const src = match[2]?.trim()
    if (src && !shouldSkipImageUrl(src))
      urls.add(src)
  }

  return Array.from(urls).slice(0, MAX_IMAGES_PER_REQUEST)
}

function replaceImageUrls(html: string, replacements: ImageReplacement[]): string {
  const replacementMap = new Map(replacements.map(item => [item.sourceUrl, item.wechatUrl]))
  return html.replace(/(<img[^>]*\ssrc=)(["'])(.*?)\2/gi, (full, prefix: string, quote: string, src: string) => {
    const nextSrc = replacementMap.get(src.trim())
    if (!nextSrc)
      return full
    return `${prefix}${quote}${nextSrc}${quote}`
  })
}

async function getWechatAccessToken(credentials: WechatCredentials): Promise<string> {
  const appId = credentials.appId
  const secret = credentials.appSecret
  const cached = tokenCache.get(appId)
  const now = Date.now()

  if (cached && cached.expiresAt > now)
    return cached.token

  const url = new URL(`https://api.weixin.qq.com/cgi-bin/token`)
  url.searchParams.set(`grant_type`, `client_credential`)
  url.searchParams.set(`appid`, appId)
  url.searchParams.set(`secret`, secret)

  const response = await fetch(url)
  const data = await response.json() as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }

  if (!response.ok || !data.access_token) {
    const message = data.errmsg || `access_token_failed`
    throw new Error(`获取微信公众号 access_token 失败：${message}`)
  }

  tokenCache.set(appId, {
    appId,
    token: data.access_token,
    expiresAt: now + Math.max((data.expires_in ?? 7200) - 300, 60) * 1000,
  })

  return data.access_token
}

function filenameFromUrl(rawUrl: string, contentType: string): string {
  try {
    const pathname = new URL(rawUrl).pathname
    const name = pathname.split(`/`).filter(Boolean).pop()
    if (name && /\.[a-z0-9]+$/i.test(name))
      return name
  }
  catch { /* ignore */ }

  if (contentType.includes(`png`))
    return `image.png`
  if (contentType.includes(`jpeg`) || contentType.includes(`jpg`))
    return `image.jpg`
  return `image`
}

async function fetchImageAsBlob(rawUrl: string): Promise<{ blob: Blob, filename: string }> {
  const response = await fetch(rawUrl, {
    headers: {
      'user-agent': `mdlook-wechat-image-normalizer/1.0`,
    },
  })

  if (!response.ok)
    throw new Error(`图片下载失败：${response.status}`)

  const contentType = response.headers.get(`content-type`)?.split(`;`)[0]?.trim().toLowerCase() || ``
  if (contentType !== `image/jpeg` && contentType !== `image/png`)
    throw new Error(`微信图文图片仅支持 JPG/PNG，当前为 ${contentType || `unknown`}`)

  const contentLength = Number(response.headers.get(`content-length`) || `0`)
  if (contentLength > MAX_IMAGE_BYTES)
    throw new Error(`图片超过 1MB，请先压缩后再转微信图片`)

  const bytes = await response.arrayBuffer()
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_IMAGE_BYTES)
    throw new Error(`图片超过 1MB，请先压缩后再转微信图片`)

  return {
    blob: new Blob([bytes], { type: contentType }),
    filename: filenameFromUrl(rawUrl, contentType),
  }
}

async function uploadInlineImageToWechat(credentials: WechatCredentials, imageUrl: string): Promise<string> {
  const accessToken = await getWechatAccessToken(credentials)
  const { blob, filename } = await fetchImageAsBlob(imageUrl)
  const formData = new FormData()
  formData.append(`media`, blob, filename)

  const url = new URL(`https://api.weixin.qq.com/cgi-bin/media/uploadimg`)
  url.searchParams.set(`access_token`, accessToken)

  const response = await fetch(url, {
    method: `POST`,
    body: formData,
  })
  const data = await response.json() as {
    url?: string
    errcode?: number
    errmsg?: string
  }

  if (!response.ok || !data.url) {
    const message = data.errmsg || `uploadimg_failed`
    throw new Error(`上传微信图文图片失败：${message}`)
  }

  return data.url
}

export async function normalizeWechatImagesHandler(c: WechatImageContext): Promise<Response> {
  let body: { html?: unknown, wechatAppId?: unknown, wechatAppSecret?: unknown }
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ error: `invalid_json` }, 400)
  }

  if (typeof body.html !== `string` || !body.html.trim())
    return c.json({ error: `html_required` }, 400)

  const credentials = requestCredentials(body) ?? envCredentials(c.env)

  if (!credentials) {
    if (!isEnabled(c.env))
      return c.json({ error: `wechat_image_disabled`, message: `请先在本地配置公众号 AppID 与 AppSecret` }, 404)

    if (!isConfigured(c.env))
      return c.json({ error: `wechat_image_not_configured`, message: `请先配置公众号 AppID 与 AppSecret` }, 503)
  }

  const imageUrls = extractImageUrls(body.html)
  if (!imageUrls.length) {
    return c.json({
      html: body.html,
      images: [],
    })
  }

  try {
    const replacements: ImageReplacement[] = []
    for (const sourceUrl of imageUrls) {
      const wechatUrl = await uploadInlineImageToWechat(credentials!, sourceUrl)
      replacements.push({ sourceUrl, wechatUrl })
    }

    return c.json({
      html: replaceImageUrls(body.html, replacements),
      images: replacements,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: `wechat_image_upload_failed`, message }, 502)
  }
}
