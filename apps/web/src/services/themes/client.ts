import type { DesignMdTheme } from '@md/shared/design-md'
import { MD_API_URL } from '@/services/account/config'

export interface ThemeSummary {
  id: string
  name: string
  description: string
  sourceUrl?: string
}

function assertThemeResponse(value: unknown): DesignMdTheme {
  const theme = (value as { theme?: DesignMdTheme }).theme
  if (!theme?.id || !theme.articleCss || !theme.appCss)
    throw new Error(`主题响应格式不正确`)
  return theme
}

export function isThemeServiceConfigured(): boolean {
  return Boolean(MD_API_URL)
}

export async function listDesignThemes(): Promise<ThemeSummary[]> {
  if (!MD_API_URL)
    return []

  const response = await fetch(`${MD_API_URL}/themes`)
  if (!response.ok)
    throw new Error(`主题列表加载失败`)

  const data = await response.json() as { themes?: ThemeSummary[] }
  return data.themes ?? []
}

export async function loadDesignTheme(id: string): Promise<DesignMdTheme> {
  if (!MD_API_URL)
    throw new Error(`主题服务未配置`)

  const response = await fetch(`${MD_API_URL}/themes/${encodeURIComponent(id)}`)
  if (!response.ok)
    throw new Error((await response.json().catch(() => null))?.error ?? `主题加载失败`)

  return assertThemeResponse(await response.json())
}

export async function importDesignTheme(url: string): Promise<DesignMdTheme> {
  if (!MD_API_URL)
    throw new Error(`主题服务未配置`)

  const response = await fetch(`${MD_API_URL}/themes/import`, {
    method: `POST`,
    headers: {
      'content-type': `application/json`,
    },
    body: JSON.stringify({ url }),
  })
  if (!response.ok)
    throw new Error((await response.json().catch(() => null))?.error ?? `主题导入失败`)

  return assertThemeResponse(await response.json())
}
