import { MD_API_URL } from '@/services/account/config'

export interface WechatImageReplacement {
  sourceUrl: string
  wechatUrl: string
}

export interface NormalizeWechatImagesResponse {
  html: string
  images: WechatImageReplacement[]
}

export async function normalizeWechatImages(html: string): Promise<NormalizeWechatImagesResponse> {
  if (!MD_API_URL)
    throw new Error(`微信图片转换服务未配置`)

  const response = await fetch(`${MD_API_URL}/wechat/normalize-images`, {
    method: `POST`,
    headers: {
      'content-type': `application/json`,
    },
    body: JSON.stringify({ html }),
  })

  const data = await response.json().catch(() => null) as {
    html?: string
    images?: WechatImageReplacement[]
    error?: string
    message?: string
  } | null

  if (!response.ok) {
    const message = data?.message || data?.error || `微信图片转换失败`
    throw new Error(message)
  }

  if (typeof data?.html !== `string` || !Array.isArray(data.images))
    throw new Error(`微信图片转换响应格式不正确`)

  return {
    html: data.html,
    images: data.images,
  }
}
