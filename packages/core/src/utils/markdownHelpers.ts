import type { RendererAPI } from '@md/shared/types'
import type { ReadTimeResults } from '@md/shared/utils/readingTime'
import DOMPurify from 'isomorphic-dompurify'

const INFOGRAPHIC_PLACEHOLDER_REGEX = /<!--infographic-start-->[\s\S]*?<!--infographic-end-->/g
const MERMAID_PLACEHOLDER_REGEX = /<!--mermaid-start-->[\s\S]*?<!--mermaid-end-->/g
const PROTECTED_SPAN_REGEX = /<span data-md-protected="(\d+)"><\/span>/g

/**
 * SVG SMIL 动画（公众号里唯一能用的动效手段）。DOMPurify 默认会移除 animate / set，
 * 因为它们能把 href 之类的属性改成 javascript: URL。这里放行标签，
 * 但 attributeName 只允许下面这些纯视觉属性，其余一律剥掉，动画随之失效。
 */
const SMIL_TAGS = new Set([`animate`, `animatetransform`, `set`])
const SMIL_SAFE_ATTRIBUTES = new Set([
  `opacity`,
  `fill-opacity`,
  `stroke-opacity`,
  `transform`,
  `fill`,
  `stroke`,
  `stroke-width`,
  `stroke-dasharray`,
  `stroke-dashoffset`,
  `visibility`,
  `x`,
  `y`,
  `cx`,
  `cy`,
  `r`,
  `rx`,
  `ry`,
  `width`,
  `height`,
  `x1`,
  `y1`,
  `x2`,
  `y2`,
  `d`,
  `points`,
  `offset`,
  `stop-color`,
  `stop-opacity`,
])

DOMPurify.addHook(`uponSanitizeAttribute`, (node, data) => {
  if (data.attrName !== `attributename` || !SMIL_TAGS.has(node.nodeName.toLowerCase()))
    return
  if (!SMIL_SAFE_ATTRIBUTES.has(data.attrValue.trim().toLowerCase()))
    data.keepAttr = false
})

/**
 * DOMPurify v3.1.7+ 会强制移除 foreignObject 内容
 * https://github.com/kkomelin/isomorphic-dompurify/pull/290
 * https://github.com/cure53/DOMPurify/issues/1152
 * 使用占位符方案：在 sanitize 前保护特定内容，sanitize 后还原
 * 注意：HTML 注释会被 DOMPurify 移除，所以使用 span 元素作为占位符
 */
function sanitizeHtml(html: string): string {
  const protectedContents: string[] = []

  // 保护 infographic-diagram（使用注释标记定界，避免嵌套 div 问题）
  html = html.replace(
    INFOGRAPHIC_PLACEHOLDER_REGEX,
    (match) => {
      protectedContents.push(match)
      return `<span data-md-protected="${protectedContents.length - 1}"></span>`
    },
  )

  // 保护 mermaid-diagram（使用注释标记定界，避免嵌套 div 问题）
  html = html.replace(
    MERMAID_PLACEHOLDER_REGEX,
    (match) => {
      protectedContents.push(match)
      return `<span data-md-protected="${protectedContents.length - 1}"></span>`
    },
  )

  // XSS 处理
  html = DOMPurify.sanitize(html, {
    ADD_TAGS: [`mp-common-profile`, `animate`, `set`],
    ADD_ATTR: [`calcmode`, `from`, `to`],
  })

  // 还原被保护的内容
  html = html.replace(
    PROTECTED_SPAN_REGEX,
    (_, i) => protectedContents[Number(i)],
  )

  return html
}

/**
 * 渲染 Markdown 内容
 * @param raw - 原始 markdown 字符串
 * @param renderer - 渲染器 API
 * @returns 渲染结果，包含 HTML 和阅读时间
 */
export function renderMarkdown(raw: string, renderer: RendererAPI) {
  // 解析 front-matter 和正文
  const { markdownContent, readingTime }
    = renderer.parseFrontMatterAndContent(raw)

  // marked -> html
  let html = renderer.renderMarkdownToHtml(markdownContent)
  html = sanitizeHtml(html)
  return { html, readingTime }
}

/**
 * 后处理 HTML 内容
 * @param baseHtml - 基础 HTML 字符串
 * @param reading - 阅读时间结果
 * @param renderer - 渲染器 API
 * @returns 处理后的 HTML 字符串
 */
export function postProcessHtml(baseHtml: string, reading: ReadTimeResults, renderer: RendererAPI): string {
  // 阅读时间及字数统计
  let html = baseHtml
  html = renderer.buildReadingTime(reading) + html
  // 引用脚注
  html += renderer.buildFootnotes()
  // 附加的一些 style
  html += renderer.buildAddition()
  html += `
    <style>
      .hljs.code__pre > .mac-sign {
        display: ${renderer.getOpts().isMacCodeBlock ? `flex` : `none`};
      }
    </style>
  `
  html += `
    <style>
      h2 strong {
        color: inherit !important;
      }
    </style>
  `
  // 包裹 HTML
  return renderer.createContainer(html)
}

/**
 * 修改 HTML 内容
 * @param content - 原始内容
 * @param renderer - 渲染器 API
 * @returns 修改后的 HTML 字符串
 */
export function modifyHtmlContent(content: string, renderer: RendererAPI): string {
  const {
    markdownContent,
    readingTime: readingTimeResult,
  } = renderer.parseFrontMatterAndContent(content)

  let html = renderer.renderMarkdownToHtml(markdownContent)
  html = sanitizeHtml(html)
  return postProcessHtml(html, readingTimeResult, renderer)
}
