import type { Context } from 'hono'
import type { Env } from './types'
import { createDesignMdTheme } from '@md/shared/design-md'

const MAX_THEME_BYTES = 256 * 1024
const FETCH_TIMEOUT_MS = 8000

const CURATED_THEMES = [
  {
    id: `design:claude`,
    name: `Claude inspired`,
    description: `Warm cream canvas, coral accent, editorial typography.`,
    url: `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/claude/DESIGN.md`,
  },
  {
    id: `design:linear`,
    name: `Linear inspired`,
    description: `Precise, minimal product surfaces with restrained accent color.`,
    url: `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/linear.app/DESIGN.md`,
  },
  {
    id: `design:vercel`,
    name: `Vercel inspired`,
    description: `Black and white precision with developer-product restraint.`,
    url: `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/vercel/DESIGN.md`,
  },
  {
    id: `design:stripe`,
    name: `Stripe inspired`,
    description: `Elegant fintech color, gradients, and polished documentation rhythm.`,
    url: `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/stripe/DESIGN.md`,
  },
  {
    id: `design:apple`,
    name: `Apple inspired`,
    description: `Premium whitespace, quiet typography, and product-focused surfaces.`,
    url: `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/apple/DESIGN.md`,
  },
  {
    id: `design:figma`,
    name: `Figma inspired`,
    description: `Playful creative tooling with crisp multi-color accent language.`,
    url: `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/figma/DESIGN.md`,
  },
  {
    id: `design:notion`,
    name: `Notion inspired`,
    description: `Warm minimal workspace feel with soft surfaces and editorial hierarchy.`,
    url: `https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md`,
  },
] as const

function jsonError(c: Context, status: 400 | 404 | 502, message: string) {
  return c.json({ error: message }, status)
}

function assertThemeUrl(value: unknown): string {
  if (typeof value !== `string`)
    throw new Error(`请输入 DESIGN.md 地址`)

  const url = new URL(value)
  if (![`http:`, `https:`].includes(url.protocol))
    throw new Error(`只支持 http/https 地址`)

  return url.toString()
}

async function readLimitedText(response: Response): Promise<string> {
  const contentLength = response.headers.get(`content-length`)
  if (contentLength && Number(contentLength) > MAX_THEME_BYTES)
    throw new Error(`主题文件超过 256KB`)

  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_THEME_BYTES)
    throw new Error(`主题文件超过 256KB`)
  if (!text.trim())
    throw new Error(`主题文件为空`)

  return text
}

// 自托管服务器（国内）直连 raw.githubusercontent.com 经常超时（与 upload-github.ts 同样的问题）。
// 优先走 jsDelivr 镜像（国内有可达节点），再退到 gcore 节点，最后才回退直连。
function toFetchableUrls(url: string): string[] {
  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/)
  if (!match)
    return [url]

  const [, user, repo, branch, path] = match
  const ghPath = `gh/${user}/${repo}@${branch}/${path}`
  return [
    `https://cdn.jsdelivr.net/${ghPath}`,
    `https://gcore.jsdelivr.net/${ghPath}`,
    url,
  ]
}

async function fetchMarkdownOnce(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'accept': `text/markdown,text/plain,*/*`,
        'user-agent': `mdlook-theme-importer`,
      },
    })
    if (!response.ok)
      throw new Error(`拉取失败：${response.status}`)

    const contentType = response.headers.get(`content-type`) ?? ``
    if (contentType && !/text|markdown|plain|octet-stream|json/i.test(contentType))
      throw new Error(`远程文件不是 Markdown 文本`)

    return await readLimitedText(response)
  }
  finally {
    clearTimeout(timer)
  }
}

async function fetchMarkdown(url: string): Promise<string> {
  let lastError: unknown
  for (const candidate of toFetchableUrls(url)) {
    try {
      return await fetchMarkdownOnce(candidate)
    }
    catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`主题拉取失败`)
}

function cacheKey(url: string): Request {
  return new Request(`https://mdlook-theme-cache.local/?url=${encodeURIComponent(url)}`)
}

async function fetchMarkdownCached(url: string): Promise<string> {
  const cache = typeof caches !== `undefined` ? caches.default : null
  const key = cacheKey(url)

  const cached = await cache?.match(key)
  if (cached)
    return cached.text()

  const markdown = await fetchMarkdown(url)
  await cache?.put(key, new Response(markdown, {
    headers: {
      'content-type': `text/markdown; charset=utf-8`,
      'cache-control': `public, max-age=86400`,
    },
  }))
  return markdown
}

function toSummary(theme: typeof CURATED_THEMES[number]) {
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    sourceUrl: theme.url,
  }
}

export function listThemesHandler(c: Context<{ Bindings: Env }>) {
  return c.json({
    themes: CURATED_THEMES.map(toSummary),
  })
}

export async function getThemeHandler(c: Context<{ Bindings: Env }>) {
  const id = c.req.param(`id`)
  const theme = CURATED_THEMES.find(item => item.id === id || item.id === `design:${id}`)
  if (!theme)
    return jsonError(c, 404, `主题不存在`)

  try {
    const markdown = await fetchMarkdownCached(theme.url)
    return c.json({
      theme: createDesignMdTheme({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        sourceUrl: theme.url,
        markdown,
      }),
    })
  }
  catch (error) {
    return jsonError(c, 502, error instanceof Error ? error.message : `主题拉取失败`)
  }
}

export async function importThemeHandler(c: Context<{ Bindings: Env }>) {
  let url: string
  try {
    const body = await c.req.json<{ url?: string }>()
    url = assertThemeUrl(body.url)
  }
  catch (error) {
    return jsonError(c, 400, error instanceof Error ? error.message : `请求格式错误`)
  }

  try {
    const markdown = await fetchMarkdownCached(url)
    const pathname = new URL(url).pathname
    const name = pathname.split(`/`).filter(Boolean).at(-2) ?? pathname.split(`/`).filter(Boolean).at(-1) ?? `Custom`
    return c.json({
      theme: createDesignMdTheme({
        name: `${name} inspired`,
        description: `Imported from ${url}`,
        sourceUrl: url,
        markdown,
      }),
    })
  }
  catch (error) {
    return jsonError(c, 502, error instanceof Error ? error.message : `主题导入失败`)
  }
}
